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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { z } from "https://esm.sh/zod@3.23.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Data URL only — the client resizes/compresses the photo client-side
// before base64-encoding it, so this is never the full multi-MB original.
const scanMenuSchema = z.object({
  business_id: z.string().uuid("Invalid business_id"),
  image: z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "image must be a base64 data URL"),
});

const extractedItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().finite().nonnegative(),
  category: z.string().trim().max(60).nullable().optional(),
});
const groqOutputSchema = z.object({
  items: z.array(extractedItemSchema).max(200),
});

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const FRIENDLY_UNAVAILABLE = "Scan abhi available nahi, thodi der baad try karein.";

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
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }

  if (groqRes.status === 429) {
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }
  if (!groqRes.ok) {
    console.error("scan-menu: Groq returned", groqRes.status, await groqRes.text().catch(() => ""));
    return respond({ error: FRIENDLY_UNAVAILABLE }, 503);
  }

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

  let extracted: unknown;
  try {
    extracted = JSON.parse(content);
  } catch {
    // Model didn't follow the JSON-only instruction — surface as "nothing
    // found" rather than an error, so the owner falls through to manual
    // entry instead of seeing a scary failure for what's really just an
    // unreadable photo.
    return respond({ data: { items: [] } });
  }

  const outputParsed = groqOutputSchema.safeParse(extracted);
  if (!outputParsed.success) {
    return respond({ data: { items: [] } });
  }

  return respond({ data: { items: outputParsed.data.items } });
});
