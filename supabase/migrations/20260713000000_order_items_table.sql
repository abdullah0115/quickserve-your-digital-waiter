-- ============================================================
-- CONCURRENT MULTI-PERSON ORDERING AT THE SAME TABLE
--
-- orders.items was a single JSONB column written once at order creation
-- (compute_order_total trigger) — no way to add to an existing order
-- without a read-modify-write of the whole blob, which races when two
-- phones at the same table submit at once. This normalizes items into a
-- child table (order_items) so additions are a single INSERT, and adds a
-- safe add-to-existing-order path guarded by a shared rate limiter.
-- ============================================================

-- ============ RATE LIMITING (shared helper) ============
-- Fixed-lookback counter table. No anon/authenticated grant — only called
-- from other SECURITY DEFINER functions and edge functions (service role),
-- never directly by a client.
CREATE TABLE public.rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_hits_bucket_time ON public.rate_limit_hits(bucket_key, created_at);

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_bucket_key TEXT, p_max_hits INT, p_window_seconds INT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  DELETE FROM public.rate_limit_hits
    WHERE bucket_key = p_bucket_key AND created_at < now() - (p_window_seconds || ' seconds')::interval;
  SELECT COUNT(*) INTO v_count FROM public.rate_limit_hits WHERE bucket_key = p_bucket_key;
  IF v_count >= p_max_hits THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.rate_limit_hits (bucket_key) VALUES (p_bucket_key);
  RETURN TRUE;
END;
$$;

-- ============ ORDER ITEMS (child table) ============
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 50),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 200),
  added_by_name TEXT NOT NULL CHECK (length(trim(added_by_name)) > 0 AND length(added_by_name) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ============ BACKFILL orders.items -> order_items, THEN DROP THE COLUMN ============
-- Safety net: snapshot the raw JSONB before touching anything. Cheap (one
-- small table), gives an exact restore source independent of Supabase's
-- own backups. Drop this manually once order_items has been confirmed
-- correct in production for a week or two — it is NOT auto-dropped here.
CREATE TABLE public._backup_orders_items_20260713 AS
  SELECT id, items, created_at FROM public.orders;

INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity, notes, added_by_name, created_at)
SELECT o.id, (item->>'menu_item_id')::uuid, item->>'name', (item->>'price')::numeric,
       COALESCE((item->>'quantity')::int, 1), item->>'notes', o.customer_name, o.created_at
FROM public.orders o, jsonb_array_elements(o.items) AS item
WHERE jsonb_typeof(o.items) = 'array';

-- Self-verifying: abort the whole migration (rollback, items column stays
-- intact) rather than silently drop data if the backfill produced a
-- different row count than the source JSONB implies.
DO $$
DECLARE v_expected INT; v_actual INT;
BEGIN
  SELECT COALESCE(SUM(jsonb_array_length(items)), 0) INTO v_expected
    FROM public.orders WHERE jsonb_typeof(items) = 'array';
  SELECT COUNT(*) INTO v_actual FROM public.order_items;
  IF v_expected != v_actual THEN
    RAISE EXCEPTION 'order_items backfill mismatch: expected % rows, got %', v_expected, v_actual;
  END IF;
END $$;

DROP TRIGGER trg_compute_order_total ON public.orders;
DROP FUNCTION public.compute_order_total();
ALTER TABLE public.orders DROP COLUMN items;

-- ============ AUTO-MAINTAIN orders.total_amount FROM order_items ============
-- Replaces compute_order_total's total-calculation role. Any insert/update/
-- delete on order_items recomputes the parent's total — this is what makes
-- concurrent additions safe: two inserts from two devices each fire this
-- independently, Postgres row-locks the UPDATE per commit, so there's no
-- lost-update window; the final total is always the true sum.
CREATE OR REPLACE FUNCTION public.recompute_order_total()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order_id UUID := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE public.orders SET total_amount =
    COALESCE((SELECT SUM(price * quantity) FROM public.order_items WHERE order_id = v_order_id), 0)
  WHERE id = v_order_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_order_items_recompute_total
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.recompute_order_total();

-- ============ create_order_with_items(): atomic order + items creation ============
-- Replaces the create-order edge function's separate .insert() calls (which
-- had no shared transaction — a failure between the order insert and the
-- items insert could leave an orphaned empty order) with one atomic call.
-- Deliberately does NOT re-implement table resolution or the
-- one-order-per-table check — those already exist as the
-- trg_resolve_order_table BEFORE INSERT trigger and the
-- idx_orders_one_active_per_table partial unique index, so the plain
-- INSERT INTO orders goes through them unchanged; a unique_violation is
-- caught and turned into the same friendly message the edge function shows
-- today.
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_business_slug TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_items JSONB,
  p_qr_code_id UUID,
  p_order_type public.order_type,
  p_notes TEXT
) RETURNS TABLE(id UUID, token_number INTEGER, total_amount NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business_id UUID;
  v_order_id UUID;
  v_item JSONB;
  v_menu_item RECORD;
  v_qty INTEGER;
  v_bucket TEXT;
BEGIN
  SELECT b.id INTO v_business_id FROM public.businesses b WHERE b.slug = p_business_slug AND b.is_active = true;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business not found or inactive';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must include at least one item';
  END IF;

  v_bucket := 'create_order:' || COALESCE('qr:' || p_qr_code_id::text, 'biz:' || v_business_id::text || ':takeaway');
  IF NOT public.check_rate_limit(v_bucket, 8, 300) THEN
    RAISE EXCEPTION 'Too many order attempts for this table — please wait a few minutes and try again.';
  END IF;

  BEGIN
    INSERT INTO public.orders (business_id, token_number, customer_name, customer_phone, qr_code_id, order_type, notes)
    VALUES (v_business_id, 0, trim(p_customer_name), NULLIF(trim(p_customer_phone), ''), p_qr_code_id, p_order_type, p_notes)
    RETURNING orders.id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This table already has an active order. Add items to the existing order instead of starting a new one.';
  END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT mi.id, mi.name, mi.price INTO v_menu_item
    FROM public.menu_items mi
    WHERE mi.id = (v_item->>'menu_item_id')::uuid AND mi.business_id = v_business_id AND mi.is_available = true;
    IF v_menu_item IS NULL THEN
      RAISE EXCEPTION 'Menu item % is unavailable', v_item->>'menu_item_id';
    END IF;
    v_qty := LEAST(GREATEST(COALESCE((v_item->>'quantity')::int, 1), 1), 50);
    INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity, notes, added_by_name)
    VALUES (v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.price, v_qty,
            NULLIF(trim(v_item->>'notes'), ''), trim(p_customer_name));
  END LOOP;

  RETURN QUERY SELECT o.id, o.token_number, o.total_amount FROM public.orders o WHERE o.id = v_order_id;
END;
$$;
-- No anon/authenticated grant — only the create-order edge function
-- (service role) calls this, so its per-IP rate limit can't be bypassed by
-- calling the RPC directly.

-- ============ add_order_item(): the concurrency-safe add primitive ============
-- One INSERT, no read-modify-write of the order. Re-validates everything
-- server-side (order still addable, menu item still valid) since this is a
-- guest-facing write path with no zod layer of its own — only the
-- add-order-item edge function (service role) can call it.
CREATE OR REPLACE FUNCTION public.add_order_item(
  p_order_id UUID,
  p_business_slug TEXT,
  p_menu_item_id UUID,
  p_quantity INTEGER,
  p_added_by_name TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS TABLE(item_id UUID, item_name TEXT, item_price NUMERIC, item_quantity INTEGER, order_total NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order RECORD;
  v_menu_item RECORD;
  v_qty INTEGER;
  v_item_id UUID;
BEGIN
  SELECT o.id, o.status, o.business_id INTO v_order
  FROM public.orders o JOIN public.businesses b ON b.id = o.business_id
  WHERE o.id = p_order_id AND b.slug = p_business_slug;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status NOT IN ('pending', 'preparing') THEN
    RAISE EXCEPTION 'This order can no longer accept new items (status: %). Please place a new order once it completes.', v_order.status;
  END IF;

  IF NOT public.check_rate_limit('add_item:order:' || p_order_id::text, 20, 300) THEN
    RAISE EXCEPTION 'Too many items added too quickly — please wait a moment and try again.';
  END IF;

  SELECT mi.id, mi.name, mi.price INTO v_menu_item
  FROM public.menu_items mi
  WHERE mi.id = p_menu_item_id AND mi.business_id = v_order.business_id AND mi.is_available = true;
  IF v_menu_item IS NULL THEN
    RAISE EXCEPTION 'Menu item is unavailable';
  END IF;

  v_qty := LEAST(GREATEST(COALESCE(p_quantity, 1), 1), 50);
  INSERT INTO public.order_items (order_id, menu_item_id, name, price, quantity, notes, added_by_name)
  VALUES (p_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.price, v_qty,
          NULLIF(trim(p_notes), ''), trim(p_added_by_name))
  RETURNING order_items.id INTO v_item_id;

  RETURN QUERY
  SELECT v_item_id, v_menu_item.name, v_menu_item.price, v_qty, o.total_amount
  FROM public.orders o WHERE o.id = p_order_id;
END;
$$;
-- No anon/authenticated grant — only the add-order-item edge function
-- (service role) calls this, for the same reason as create_order_with_items.

-- ============ get_active_order_for_table(): point lookup for "join" flow ============
-- Lets a second phone discover "this table already has an order" without
-- ever listing other tables — same point-lookup-only pattern as
-- resolve_qr_code, keyed by a specific QR id the caller already had to
-- scan to know.
CREATE OR REPLACE FUNCTION public.get_active_order_for_table(p_qr_code_id UUID)
RETURNS TABLE(id UUID, token_number INTEGER, status public.order_status, business_id UUID)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.token_number, o.status, o.business_id
  FROM public.orders o
  JOIN public.qr_codes q ON q.business_id = o.business_id AND q.table_number = o.table_number
  WHERE q.id = p_qr_code_id AND q.is_active = true AND o.status IN ('pending','preparing','ready')
  ORDER BY o.created_at DESC LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_active_order_for_table(UUID) TO anon, authenticated;

-- ============ UPDATE get_order_status / get_active_orders_for_display ============
-- Aggregate order_items back into the same items JSONB shape the frontend
-- already expects, so OrderStatus.tsx / DisplayScreen.tsx need only a small
-- type tweak (added_by_name), not a rewrite.

-- Return-column-list change requires DROP + recreate (same pattern used in
-- 20260710020000_qr_verified_table_number.sql).
DROP FUNCTION IF EXISTS public.get_order_status(TEXT, UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.get_order_status(
  p_business_slug TEXT,
  p_order_id UUID DEFAULT NULL,
  p_token_number INTEGER DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  token_number INTEGER,
  status public.order_status,
  customer_name TEXT,
  items JSONB,
  total_amount NUMERIC,
  table_number TEXT,
  qr_code_id UUID,
  order_type public.order_type,
  created_at TIMESTAMPTZ,
  business_id UUID
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.token_number, o.status, o.customer_name,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'name', oi.name, 'price', oi.price, 'quantity', oi.quantity,
             'notes', oi.notes, 'added_by_name', oi.added_by_name
           ) ORDER BY oi.created_at)
           FROM public.order_items oi WHERE oi.order_id = o.id
         ), '[]'::jsonb) AS items,
         o.total_amount, o.table_number, o.qr_code_id, o.order_type, o.created_at, o.business_id
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE b.slug = p_business_slug
    AND (
      (p_order_id IS NOT NULL AND o.id = p_order_id)
      OR (
        p_token_number IS NOT NULL
        AND p_customer_phone IS NOT NULL
        AND o.token_number = p_token_number
        AND o.customer_phone = p_customer_phone
        AND o.created_at::date = CURRENT_DATE
      )
    )
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_status(TEXT, UUID, INTEGER, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_active_orders_for_display(p_business_slug TEXT)
RETURNS TABLE (
  id UUID,
  token_number INTEGER,
  status public.order_status,
  items JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.token_number, o.status,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'name', oi.name, 'price', oi.price, 'quantity', oi.quantity,
             'notes', oi.notes, 'added_by_name', oi.added_by_name
           ) ORDER BY oi.created_at)
           FROM public.order_items oi WHERE oi.order_id = o.id
         ), '[]'::jsonb) AS items,
         o.created_at
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE b.slug = p_business_slug
    AND o.status IN ('preparing', 'ready')
  ORDER BY o.created_at ASC
$$;
GRANT EXECUTE ON FUNCTION public.get_active_orders_for_display(TEXT) TO anon, authenticated;

-- ============ RLS on order_items ============
-- Only business members reading their own business's order items — no
-- anon SELECT/INSERT policy at all. Every guest read goes through the
-- SECURITY DEFINER functions above (which bypass RLS by design); every
-- guest write goes through create_order_with_items / add_order_item
-- (also SECURITY DEFINER, no anon grant). Leaving zero direct RLS path is
-- tighter than today's orders table, which still carries a
-- dead-but-present public INSERT policy.
CREATE POLICY "Business members view their order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND public.is_business_member(auth.uid(), o.business_id)
    )
  );
