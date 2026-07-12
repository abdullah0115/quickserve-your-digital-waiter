// Supabase Edge Function: create-order
//
// Public order-creation endpoint for guest checkout (called from Menu.tsx).
// The client sends menu_item_id + quantity per line item — nothing else.
// Prices, item names, and the order total are always looked up fresh from
// `menu_items`, table_number is always resolved from a verified QR id, and
// the whole order+items write happens atomically inside a single Postgres
// function (create_order_with_items) — see
// supabase/migrations/20260713000000_order_items_table.sql. This function
// is just the public HTTP front door: request validation, a per-IP rate
// limit (Postgres functions called through the connection pooler can't see
// the real client IP, so this check has to live here), and friendly error
// shaping.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { z } from "https://esm.sh/zod@3.23.8";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mirrors src/lib/validation.ts's checkoutFormSchema — client-side validation
// is only ever a UX nicety, this is the boundary that actually matters.
const orderItemSchema = z.object({
  menu_item_id: z.string().uuid("Invalid menu item id"),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(200).optional(),
});

const createOrderSchema = z.object({
  business_slug: z.string().trim().min(1, "business_slug is required"),
  customer_name: z.string().trim().min(1, "customer_name is required").max(100),
  customer_phone: z.string().trim().max(20).optional(),
  items: z.array(orderItemSchema).min(1, "Order must include at least one item").max(50),
  // A verified QR code id, not a raw table number — anyone could otherwise
  // claim to be at any table just by editing the URL. table_number is
  // always resolved server-side from this id (see qr_codes lookup below).
  qr_code_id: z.string().uuid().optional(),
  order_type: z.enum(["dine_in", "takeaway"]),
  notes: z.string().trim().max(300).optional(),
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

  const parsed = createOrderSchema.safeParse(rawBody);
  if (!parsed.success) {
    return respond({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const body = parsed.data;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ip = getClientIp(req);
    const { data: ipOk, error: rateErr } = await supabase.rpc("check_rate_limit", {
      p_bucket_key: `create_order:ip:${ip}`,
      p_max_hits: 15,
      p_window_seconds: 300,
    });
    if (rateErr) throw rateErr;
    if (!ipOk) {
      return respond({ error: "Too many attempts — please wait a few minutes and try again." }, 429);
    }

    const { data, error } = await supabase.rpc("create_order_with_items", {
      p_business_slug: body.business_slug,
      p_customer_name: body.customer_name,
      p_customer_phone: body.customer_phone ?? null,
      p_items: body.items.map((i) => ({
        menu_item_id: i.menu_item_id,
        quantity: i.quantity,
        notes: i.notes ?? null,
      })),
      p_qr_code_id: body.qr_code_id ?? null,
      p_order_type: body.order_type,
      p_notes: body.notes ?? null,
    });
    if (error) {
      return respond({ error: error.message });
    }

    return respond({ data: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    console.error("create-order error:", err);
    return respond({ error: err instanceof Error ? err.message : "Failed to create order" });
  }
});
