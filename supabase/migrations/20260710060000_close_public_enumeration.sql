-- ============================================================
-- CLOSE PUBLIC ENUMERATION OF qr_codes AND orders
--
-- Two RLS policies from the initial schema allowed listing, not just
-- point-lookup, to anyone with the public anon key (no login, no scan
-- required):
--
--   "QR codes publicly viewable" ON qr_codes FOR SELECT USING (true)
--     -> GET /qr_codes?business_id=eq.<id> returned every table's QR
--        id, defeating the whole "QR id is unguessable proof you're
--        physically at that table" model this app is built on.
--
--   "Public can view active orders" ON orders FOR SELECT USING (status IN (...))
--     -> GET /orders?status=in.(pending,preparing,ready) returned every
--        active order across every business on the platform (items,
--        total, table number, token) with no business_id scoping.
--
-- The app itself never abused either of these — Menu.tsx already looked
-- up qr_codes by a single known id, and DisplayScreen.tsx already
-- filtered orders by business_id — but RLS is row-level, not
-- query-shape-level: if a row is visible under a policy, it's visible
-- whether you ask for one row or all of them. A direct REST call
-- bypassing the app's UI entirely could always get the full list.
--
-- Fix: drop both blanket policies and replace the client-side lookups
-- they served with narrow SECURITY DEFINER functions that only ever
-- return what the caller already had to know going in (a specific QR
-- id) or what's meant to be genuinely public in a scoped way (one
-- business's currently-active orders for its own display screen).
-- ============================================================

DROP POLICY IF EXISTS "QR codes publicly viewable" ON public.qr_codes;
DROP POLICY IF EXISTS "Public can view active orders" ON public.orders;

-- ---- resolve_qr_code(): point lookup only, never a list ----
-- Menu.tsx calls this with the id from ?qr=<id> in the URL — the same
-- shape of access it already had, just no longer reachable as a raw
-- table listing from outside the app.
CREATE OR REPLACE FUNCTION public.resolve_qr_code(p_qr_id UUID)
RETURNS TABLE (
  id UUID,
  business_id UUID,
  table_number TEXT,
  is_active BOOLEAN
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.business_id, q.table_number, q.is_active
  FROM public.qr_codes q
  WHERE q.id = p_qr_id
$$;
GRANT EXECUTE ON FUNCTION public.resolve_qr_code(UUID) TO anon, authenticated;

-- ---- get_active_orders_for_display(): scoped to one business ----
-- Same columns DisplayScreen.tsx already selected (no customer PII —
-- that stayed column-revoked regardless), same preparing/ready filter,
-- just resolved server-side by business slug instead of a client-typed
-- business_id filter on an otherwise-open table.
CREATE OR REPLACE FUNCTION public.get_active_orders_for_display(p_business_slug TEXT)
RETURNS TABLE (
  id UUID,
  token_number INTEGER,
  status public.order_status,
  items JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.token_number, o.status, o.items, o.created_at
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE b.slug = p_business_slug
    AND o.status IN ('preparing', 'ready')
  ORDER BY o.created_at ASC
$$;
GRANT EXECUTE ON FUNCTION public.get_active_orders_for_display(TEXT) TO anon, authenticated;
