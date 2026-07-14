-- ============================================================
-- CRITICAL: close a live direct-insert hole on orders
--
-- Found during a pre-launch audit: `orders` still carried an INSERT
-- RLS policy — "Anyone can create orders for active businesses",
-- WITH CHECK only requiring the target business to be active — left
-- over from before order creation moved to the create_order_with_items
-- RPC. Combined with Supabase's default table-level INSERT grant to
-- anon/authenticated (never explicitly revoked), this meant anyone
-- could bypass create_order_with_items entirely with a direct REST
-- call: no rate limiting, no trial-expiry lock, no daily-order cap, no
-- table cooldown, no menu-item/price validation — total_amount could
-- be set to literally anything.
--
-- Confirmed live and exploitable before this migration: a direct
-- POST to /rest/v1/orders with the anon key inserted a real row
-- (total_amount: 888888) into a live business's orders table. Test
-- row was deleted immediately after confirming; this migration is
-- the actual fix.
--
-- order_items has no INSERT policy at all and was already correctly
-- unreachable this way — this is specifically about orders' leftover
-- policy from the pre-RPC design.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can create orders for active businesses" ON public.orders;

-- Table-level grant is the first gate before RLS is even evaluated —
-- removing it here means even a future accidental/overly-broad policy
-- can't reopen this without someone also explicitly re-granting INSERT.
-- UPDATE/DELETE grants are left in place: both have real, correctly
-- scoped policies ("Business members update order status",
-- "Owners delete their orders") that depend on them.
REVOKE INSERT ON public.orders FROM anon, authenticated;

-- ============================================================
-- Same sweep, defense-in-depth: Supabase's default privileges grant
-- every DML verb (including TRUNCATE, which RLS policies do NOT
-- restrict at all in Postgres) to anon/authenticated on every new
-- table, whether or not a real policy exists for it. Not separately
-- exploitable via the public REST API today (PostgREST doesn't expose
-- TRUNCATE, and INSERT/UPDATE/DELETE below all fall through to
-- RLS-enabled-with-no-policy = default-deny where no policy exists),
-- but removing the unused grant removes the single point of failure
-- a future policy mistake could otherwise reopen.
-- ============================================================

REVOKE TRUNCATE ON
  public.businesses, public.menu_categories, public.menu_items, public.qr_codes,
  public.orders, public.order_items, public.notifications, public.user_roles,
  public.plan_configs, public.managed_setup_cities, public.subscriptions,
  public.business_analytics, public.rate_limit_hits
FROM anon, authenticated;

-- No real policy exists (or should exist) for these — every write to
-- them already goes through a SECURITY DEFINER function/trigger.
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.plan_configs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.managed_setup_cities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;
-- business_analytics is unused dead scaffolding (nothing in the app
-- reads or writes it) — no policies exist for it either, so this is
-- pure cleanup, not a behavior change.
REVOKE INSERT, UPDATE, DELETE ON public.business_analytics FROM anon, authenticated;
