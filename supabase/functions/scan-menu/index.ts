// Supabase Edge Function: scan-menu
//
// Owner uploads a photo of their existing (paper/board/PDF-screenshot)
// menu; this sends it to a vision-capable Groq model and returns a
// structured list of {name, price, category} for the owner to review
// before anything touches the menu_items table. Nothing is inserted here
// — this endpoint only extracts and returns; MenuManager.tsx does the
// actual insert after the owner confirms/edits.
//
// GROQ_API_KEY lives only as a Supabase Edge Function secret (never sent
// to or readable from the frontend) — see `supabase secrets set`.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get(name: string): string | undefined };
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Llama 4 Scout was retired by Groq on 17 July 2026. Qwen 3.6 is the
// supported replacement for vision/OCR and supports image inputs plus JSON
// object mode, which this menu scanner relies on.
const GROQ_MODEL = "qwen/qwen3.6-27b";

const IP_BURST_LIMIT = 10;
const IP_BURST_WINDOW_SECONDS = 60 * 60;

// Data URL only — the client resizes/compresses the photo client-side
// before base64-encoding it (see resizeImage.ts, capped ~1600px/JPEG q0.85,
// normally a few hundred KB), so this is never the full multi-MB original.
// The 4MB ceiling here is a server-side backstop for a caller that bypasses
// that resize entirely, not a limit the normal UI flow should ever hit.
const scanMenuSchema = z.object({
  business_id: z.string().uuid("Invalid business_id"),
  image: z.string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "image must be a base64 data URL")
    .max(4_000_000, "Image is too large — please try a smaller photo."),
});

const extractedItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // Vision models sometimes return "450" or "Rs. 450" even when asked for
  // a numeric value. Accept both forms here and normalize below so readable
  // items reach the owner's review screen instead of the empty state.
  price: z.union([z.number(), z.string().trim().min(1).max(30)]),
  category: z.string().trim().max(60).nullable().optional(),
});
const groqOutputSchema = z.object({
  items: z.array(extractedItemSchema).max(200),
});

function normalizePrice(value: number | string): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const numericText = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0];
  const numeric = numericText ? Number(numericText) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

const FRIENDLY_UNAVAILABLE = "Scan is not available right now, please try again later.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return respond({ error: "Missing Authorization header" }, 401);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return respond({ error: "Invalid JSON body" }, 400);
  }

  const parsed = scanMenuSchema.safeParse(rawBody);
  if (!parsed.success) {
    return respond({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  }
  const { business_id, image } = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Identify the caller from their own JWT (not the client-claimed
  // business_id) and confirm they actually have a role on this business —
  // same defense-in-depth pattern as the rest of the app: never trust a
  // client-supplied id without checking it server-side.
  const { data: userData, error: userErr } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  );
  if (userErr || !userData?.user) {
    return respond({ error: "Not authenticated" }, 401);
  }

  const { data: isMember } = await supabase.rpc("is_business_member", {
    _user_id: userData.user.id,
    _business_id: business_id,
  });
  if (!isMember) {
    return respond({ error: "Not authorized for this business" }, 403);
  }

  // Burst guard first (cheap, catches scripted hammering fastest) — this
  // one consumes on every attempt regardless of outcome, since it's about
  // request volume, not Groq spend.
  const ip = getClientIp(req);
  const { data: ipOk, error: ipRateErr } = await supabase.rpc("check_rate_limit", {
    p_bucket_key: `scan_menu:ip:${ip}`,
    p_max_hits: IP_BURST_LIMIT,
    p_window_seconds: IP_BURST_WINDOW_SECONDS,
  });
  if (ipRateErr) throw ipRateErr;
  if (!ipOk) {
    return respond({ error: "Too many scan attempts — please wait a bit and try again." }, 429);
  }

  // The real product limit is plan-driven — trial gets a lifetime cap
  // (e.g. 3 scans total, not per month), paid plans have none
  // (scan_menu_limit is NULL). Bucketed per-business, not per-user, so
  // it caps the business's trial usage regardless of which staff
  // account scans. Read (not incremented) here, so a Groq outage
  // doesn't cost part of the quota for a scan that never actually
  // happened — the quota is only recorded once Groq has responded.
  // Reserve quota before spending a Groq request. The reservation happens in
  // one locked database transaction, so a trial can never exceed three scans.
  const { data: quotaRows, error: quotaErr } = await supabase.rpc("reserve_scan_menu_quota", {
    p_business_id: business_id,
  });
  if (quotaErr) throw quotaErr;
  const quota = (quotaRows as Array<{
    allowed: boolean; scans_used: number; scans_limit: number; quota_hit_id: number | null; is_trial: boolean;
  }> | null)?.[0];
  if (!quota) throw new Error("Couldn't check the menu scan allowance");
  if (!quota.allowed) {
    return respond({
      error: quota.is_trial
        ? `You've used all ${quota.scans_limit} menu scans included in your trial. Add items manually or upgrade to keep scanning.`
        : `You've used all ${quota.scans_limit} menu scans included in your plan this month. Try again next month or add items manually.`,
      scans_used: quota.scans_used,
      scans_limit: quota.scans_limit,
    }, 429);
  }
  const quotaHitId = quota.quota_hit_id;

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) {
    console.error("scan-menu: GROQ_API_KEY is not configured");
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }

  const prompt = `You are a menu-scanning assistant. Look at this photo of a restaurant/cafe menu and extract every item you can clearly read.

For each item, provide:
- name: the item's name, cleaned up (string)
- price: the numeric price only, no currency symbols or commas (number)
- category: the section/category it's listed under if visible (e.g. "Starters", "Beverages"), or null if there isn't a clear one

Rules:
- Only include an item if you can confidently read BOTH its name and its price. Skip anything illegible or ambiguous rather than guessing.
- If the image doesn't look like a menu at all, or nothing is legible, return an empty items array.
- Respond with ONLY a JSON object in exactly this shape, no other text: {"items": [{"name": string, "price": number, "category": string|null}]}`;

  let groqRes: Response;
  try {
    groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    console.error("scan-menu: Groq request failed:", err);
    if (quotaHitId !== null) await supabase.rpc("release_scan_menu_quota", { p_quota_hit_id: quotaHitId });
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }

  if (groqRes.status === 429) {
    if (quotaHitId !== null) await supabase.rpc("release_scan_menu_quota", { p_quota_hit_id: quotaHitId });
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }
  if (!groqRes.ok) {
    console.error("scan-menu: Groq returned", groqRes.status, await groqRes.text().catch(() => ""));
    if (quotaHitId !== null) await supabase.rpc("release_scan_menu_quota", { p_quota_hit_id: quotaHitId });
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }

  // Groq actually responded (cost was incurred) — record this against the
  // business's quota now, whatever happens with parsing below. Only
  // worth recording at all when there's an actual cap to count against.
  await supabase.from("rate_limit_hits").insert({ bucket_key: scanBucket });
  const newScansUsed = scansUsed + 1;

  let groqJson: unknown;
  try {
    groqJson = await groqRes.json();
  } catch (err) {
    console.error("scan-menu: Groq response wasn't JSON:", err);
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }

  const content = (groqJson as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content;
  if (!content) {
    console.error("scan-menu: no content in Groq response:", JSON.stringify(groqJson).slice(0, 500));
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }

  const usage = { scans_used: newScansUsed, scans_limit: scanLimit };

  let extracted: unknown;
  try {
    extracted = JSON.parse(content);
  } catch {
    // Model didn't follow the JSON-only instruction — surface as "nothing
    // found" rather than an error, so the owner falls through to manual
    // entry instead of seeing a scary failure for what's really just an
    // unreadable photo.
    return respond({ data: { items: [], ...usage } });
  }

  const outputParsed = groqOutputSchema.safeParse(extracted);
  if (!outputParsed.success) {
    return respond({ data: { items: [], ...usage } });
  }

  const items = outputParsed.data.items.flatMap((item) => {
    const price = normalizePrice(item.price);
    return price === null ? [] : [{ ...item, price }];
  });
  return respond({ data: { items, ...usage } });
});
