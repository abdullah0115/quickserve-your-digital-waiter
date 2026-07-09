// Supabase Edge Function: create-order
//
// Public order-creation endpoint for guest checkout (called from Menu.tsx).
// The client sends menu_item_id + quantity per line item — nothing else.
// Prices, item names, and the order total are always looked up fresh from
// `menu_items` here; whatever the client claims a price/total to be is
// ignored completely.
//
// This is a second, defense-in-depth layer on top of the `compute_order_total`
// Postgres trigger (see supabase/migrations/20260709222148_initial_schema.sql),
// which re-derives the same values again at the database level regardless of
// which path an order comes through. Kept here mainly for friendlier
// validation errors and as the front door for the online checkout flow —
// the offline sync queue (useOfflineSync.ts) still inserts directly and
// relies on the DB trigger alone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
  notes?: string;
}

interface CreateOrderInput {
  business_slug: string;
  customer_name: string;
  customer_phone?: string;
  items: OrderItemInput[];
  table_number?: string;
  order_type: "dine_in" | "takeaway";
  notes?: string;
}

function respond(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" });
  }

  let body: Partial<CreateOrderInput>;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Invalid JSON body" });
  }

  if (!body.business_slug || typeof body.business_slug !== "string") {
    return respond({ error: "business_slug is required" });
  }
  if (!body.customer_name || typeof body.customer_name !== "string" || !body.customer_name.trim()) {
    return respond({ error: "customer_name is required" });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return respond({ error: "Order must include at least one item" });
  }
  if (body.order_type !== "dine_in" && body.order_type !== "takeaway") {
    return respond({ error: "order_type must be dine_in or takeaway" });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id, is_active")
      .eq("slug", body.business_slug)
      .maybeSingle();
    if (bizErr) throw bizErr;
    if (!business || !business.is_active) {
      return respond({ error: "Business not found or inactive" });
    }

    const itemIds = [...new Set(body.items.map((i) => i.menu_item_id))];
    const { data: menuItems, error: itemsErr } = await supabase
      .from("menu_items")
      .select("id, name, price, is_available, business_id")
      .in("id", itemIds);
    if (itemsErr) throw itemsErr;

    const menuById = new Map((menuItems ?? []).map((m) => [m.id, m]));
    const orderItems: Array<{ menu_item_id: string; name: string; price: number; quantity: number; notes?: string }> = [];
    let total = 0;

    for (const item of body.items) {
      const menuItem = menuById.get(item.menu_item_id);
      if (!menuItem || menuItem.business_id !== business.id || !menuItem.is_available) {
        return respond({ error: `Menu item ${item.menu_item_id} is unavailable` });
      }
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      orderItems.push({
        menu_item_id: menuItem.id,
        name: menuItem.name,
        price: Number(menuItem.price),
        quantity: qty,
        ...(item.notes ? { notes: item.notes } : {}),
      });
      total += Number(menuItem.price) * qty;
    }

    const { data: order, error: insertErr } = await supabase
      .from("orders")
      .insert({
        business_id: business.id,
        token_number: 0, // overridden by the set_order_token DB trigger
        customer_name: body.customer_name.trim(),
        customer_phone: body.customer_phone?.trim() || null,
        items: orderItems,
        total_amount: total,
        table_number: body.table_number || null,
        order_type: body.order_type,
        notes: body.notes || null,
      })
      .select("id, token_number, total_amount")
      .single();
    if (insertErr) throw insertErr;

    return respond({ data: order });
  } catch (err) {
    console.error("create-order error:", err);
    return respond({ error: err instanceof Error ? err.message : "Failed to create order" });
  }
});
