-- ============================================================
-- TABLE COOLDOWN AFTER ORDER COMPLETION
--
-- Today, a table frees up for a brand-new order the instant its order is
-- marked 'completed' — there is no gap. That means a customer who kept
-- their menu link (?qr=<qr_code_id> is permanent, tied to the physical
-- table, not to a single visit) could place another order "for table 5"
-- from home, minutes or hours after actually leaving, and the system has
-- no way to tell that apart from a genuinely new party sitting down.
--
-- Fully closing this (e.g. requiring staff to manually clear a table
-- before it accepts new orders) would add a step to every table turnover,
-- which isn't worth the friction here. Instead: a completed order keeps
-- its table "just served" for 30 minutes after completion — long enough
-- that a real new party usually wouldn't be seated at an uncleared table
-- that fast anyway — then it auto-resets with no staff action needed.
-- Only 'completed' holds this cooldown; 'cancelled' orders never held
-- anything real and free the table immediately, same as before. Tables
-- that are still pending/preparing/ready are unaffected — the existing
-- idx_orders_one_active_per_table index is still what blocks those, and
-- a genuinely new party can still order right away on a table that isn't
-- in cooldown, exactly as before.
--
-- This is a soft business-logic guard, not a hard security boundary
-- (a plain SELECT check, not the atomic unique-index kind) — the goal is
-- deterring the casual "let me reorder from home" case, not building
-- airtight fraud prevention.
-- ============================================================

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
  v_table_number TEXT;
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

  -- Resolved here only for the cooldown check below — the actual
  -- authoritative resolution (and rejection of an invalid/inactive QR)
  -- still happens in trg_resolve_order_table during the INSERT itself,
  -- same as before. An invalid QR just means this lookup finds nothing,
  -- the cooldown check is skipped, and the trigger raises its own error.
  IF p_qr_code_id IS NOT NULL THEN
    SELECT q.table_number INTO v_table_number
    FROM public.qr_codes q
    WHERE q.id = p_qr_code_id AND q.business_id = v_business_id AND q.is_active = true;
  END IF;

  IF v_table_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE business_id = v_business_id AND table_number = v_table_number
      AND status = 'completed' AND completed_at > now() - interval '30 minutes'
  ) THEN
    RAISE EXCEPTION 'This table was served recently — please wait a few minutes before ordering again, or ask staff for help.';
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
