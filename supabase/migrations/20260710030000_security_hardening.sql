-- Three findings from a full security recheck, all fixed with column-level
-- privilege lockdowns (RLS is row-level only — these close gaps a row
-- policy alone can't, same technique already used for the stripe id /
-- customer_phone REVOKEs).

-- ============================================================
-- Finding 1: customer_name on active orders was readable platform-wide.
-- "Public can view active orders" has to stay row-broad (no business
-- scoping is enforceable for anonymous realtime/display-screen clients —
-- Realtime authorizes purely off this same RLS), so anyone with the anon
-- key could list every business's active orders. items/total_amount/
-- table_number are inherent to the public display-screen feature and
-- fine to remain visible, but a customer's actual name tied to a specific
-- order is real PII and had no reason to be readable outside its own
-- business's staff. DisplayScreen.tsx is updated to stop relying on it.
-- ============================================================
REVOKE SELECT (customer_name) ON public.orders FROM anon;

-- ============================================================
-- Finding 2: a business owner could self-grant a paid subscription.
-- "Owners can update their business" only checks row ownership, not which
-- columns change — so despite the Dashboard UI only ever touching name/
-- tagline/phone/etc, a direct API call as the owner's own session could
-- set subscription_status = 'active', forge stripe ids, or edit
-- trial/period dates. These fields must only ever move via a service-role
-- process (a future Stripe webhook / admin action).
-- ============================================================
REVOKE UPDATE (
  subscription_status,
  subscription_plan_id,
  stripe_customer_id,
  stripe_subscription_id,
  trial_ends_at,
  current_period_end
) ON public.businesses FROM authenticated;

-- ============================================================
-- Finding 3: a business member could rewrite order contents after the
-- fact. "Business members update order status" was meant only for the
-- kitchen-display status workflow, but — same row-vs-column gap — it let
-- any owner/staff UPDATE total_amount, items, customer_name, or even
-- business_id on their own orders, bypassing the price-integrity trigger
-- entirely (compute_order_total only runs BEFORE INSERT). Locking UPDATE
-- down to status/completed_at makes a placed order's contents immutable
-- from here on, matching what the app's own UI ever does anyway.
-- ============================================================
REVOKE UPDATE (
  id,
  business_id,
  token_number,
  customer_name,
  customer_phone,
  items,
  total_amount,
  table_number,
  qr_code_id,
  order_type,
  notes,
  created_at
) ON public.orders FROM authenticated;
