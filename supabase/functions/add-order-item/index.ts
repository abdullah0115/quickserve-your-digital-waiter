// Supabase Edge Function: add-order-item
//
// Lets a guest customer add a single line item to an already-existing,
// still-open order (dine_in table already has an active order and another
// phone at the same table wants to add to it, rather than being blocked by
// the one-active-order-per-table rule). Mirrors create-order's shape
// exactly (CORS, zod validation, service-role client, friendly error
// shaping) — see supabase/functions/create-order/index.ts.
//
// One call = one INSERT (via the add_order_item Postgres function) — never
// a read-modify-write of the whole order, so concurrent additions from
// different phones can't lose each other's items. See
// supabase/migrations/20260713000000_order_items_table.sql.
//
// This is also the only door to the add_order_item RPC (no anon grant on
// the function itself) — that's what makes the per-IP rate limit below
// actually enforceable; a raw supabase.rpc() call from the browser can't
// reach it directly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { z } from "https://esm.sh/zod@3.23.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const addItemSchema = z.object({
  order_id: z.string().uuid("Invalid order id"),
  business_slug: z.string().trim().min(1, "business_slug is required"),
  menu_item_id: z.string().uuid("Invalid menu item id"),
  quantity: z.number().int().min(1).max(50),
  added_by_name: z.string().trim().min(1, "added_by_name is required").max(100),
  notes: z.string().trim().max(200).optional(),
});

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return respond({ error: "Invalid JSON body" });
  }

  const parsed = addItemSchema.safeParse(rawBody);
  if (!parsed.success) {
    return respond({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const body = parsed.data;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Same NAT reasoning as create-order: a whole cafe shares one public
    // IP, and this endpoint fires once per line item, so it burns through
    // a per-IP budget several times faster than order creation does. The
    // meaningful limit is the per-order one inside add_order_item
    // (20 per 5 min per order).
    const ip = getClientIp(req);
    const { data: ipOk, error: rateErr } = await supabase.rpc("check_rate_limit", {
      p_bucket_key: `add_item:ip:${ip}`,
      p_max_hits: 300,
      p_window_seconds: 300,
    });
    if (rateErr) throw rateErr;
    if (!ipOk) {
      return respond({ error: "Too many attempts — please wait a moment and try again." }, 429);
    }

    const { data, error } = await supabase.rpc("add_order_item", {
      p_order_id: body.order_id,
      p_business_slug: body.business_slug,
      p_menu_item_id: body.menu_item_id,
      p_quantity: body.quantity,
      p_added_by_name: body.added_by_name,
      p_notes: body.notes ?? null,
    });
    if (error) {
      return respond({ error: error.message });
    }

    return respond({ data: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error("add-order-item error:", err);
    return respond({ error: err instanceof Error ? err.message : "Failed to add item" });
  }
});
