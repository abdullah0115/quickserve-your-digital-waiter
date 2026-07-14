-- ============================================================
-- Subscription model v2, step 2: server-side feature gating.
--
-- Everything here enforces limits at the same layer that already does
-- the real security work in this app (SECURITY DEFINER RPCs / triggers)
-- — never trusting a client-side check alone, same principle as the
-- rate limiting and order-total work earlier. The client-side hook
-- (useSubscriptionLimits, next step) is for showing upgrade prompts
-- ahead of time, not for enforcement.
-- ============================================================

-- ---- internal helper: one place to read a business's effective plan
-- limits + whether its trial has lapsed. Not exposed to anon/authenticated
-- directly — callers that need this from the client (the pricing/dashboard
-- UI) read `subscriptions` + `plan_configs` directly, both of which
-- already have their own RLS/SELECT policies scoped correctly for that. ----
CREATE OR REPLACE FUNCTION public.get_plan_limits(p_business_id UUID)
RETURNS TABLE(
  plan_type TEXT,
  status TEXT,
  is_locked BOOLEAN, -- trial lapsed, or subscription expired/canceled/past_due
  max_tables INTEGER,
  max_orders_per_day INTEGER,
  scan_menu_limit INTEGER,
  analytics_level TEXT
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.plan_type,
    s.status,
    (s.status IN ('expired', 'canceled', 'past_due')
      OR (s.plan_type = 'trial' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at < now())),
    pc.max_tables,
    pc.max_orders_per_day,
    pc.scan_menu_limit,
    pc.analytics_level
  FROM public.subscriptions s
  JOIN public.plan_configs pc ON pc.plan_type = s.plan_type
  WHERE s.business_id = p_business_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_plan_limits(UUID) FROM PUBLIC, anon, authenticated;

-- ---- table (QR code) cap ----
CREATE OR REPLACE FUNCTION public.check_table_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_tables INTEGER;
  v_current_count INTEGER;
BEGIN
  SELECT max_tables INTO v_max_tables FROM public.get_plan_limits(NEW.business_id);

  IF v_max_tables IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count FROM public.qr_codes WHERE business_id = NEW.business_id;
    IF v_current_count >= v_max_tables THEN
      RAISE EXCEPTION 'Your plan allows up to % tables. Upgrade to add more.', v_max_tables;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_qr_codes_check_table_limit
  BEFORE INSERT ON public.qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.check_table_limit();
REVOKE EXECUTE ON FUNCTION public.check_table_limit() FROM PUBLIC, anon, authenticated;

-- ---- create_order_with_items: trial-lock + daily order cap ----
-- Both checks sit right after the business/QR lookup and before the
-- table-cooldown check, so an expired trial or a full-for-today cafe
-- gets the same "can't place this order" treatment a bad QR code would,
-- with a message meant for the customer to read, not a crash.
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
  v_is_locked BOOLEAN;
  v_max_orders_per_day INTEGER;
  v_today_count INTEGER;
BEGIN
  SELECT b.id INTO v_business_id FROM public.businesses b WHERE b.slug = p_business_slug AND b.is_active = true;
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business not found or inactive';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must include at least one item';
  END IF;

  SELECT is_locked, max_orders_per_day INTO v_is_locked, v_max_orders_per_day
  FROM public.get_plan_limits(v_business_id);

  IF v_is_locked THEN
    RAISE EXCEPTION 'This cafe isn''t accepting online orders right now. Please order at the counter, or check back later.';
  END IF;

  IF v_max_orders_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO v_today_count FROM public.orders
    WHERE business_id = v_business_id
      AND created_at >= date_trunc('day', now())
      AND status != 'cancelled';
    IF v_today_count >= v_max_orders_per_day THEN
      RAISE EXCEPTION 'Cafe is currently at capacity for today — please try again tomorrow, or ask staff for help.';
    END IF;
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

-- ---- scan-menu limit: now plan-driven, and a lifetime cap for trial
-- (not a rolling 30-day window — "3 scans during your trial", not
-- "3 scans a month") rather than the old hardcoded 20/month for
-- everyone. Bucket key also moves from per-user to per-business, since
-- the limit is meant to cap a business's trial usage regardless of how
-- many staff accounts scan from. ----
CREATE OR REPLACE FUNCTION public.get_scan_usage(p_business_id UUID)
RETURNS TABLE(scans_used INTEGER, scans_limit INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(auth.uid(), p_business_id) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  SELECT scan_menu_limit INTO v_limit FROM public.get_plan_limits(p_business_id);

  RETURN QUERY
  SELECT COUNT(*)::INTEGER, v_limit
  FROM public.rate_limit_hits
  WHERE bucket_key = 'scan_menu:business:' || p_business_id::text;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_scan_usage(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_scan_usage(UUID) TO authenticated;

-- ---- watermark flag: the one plan detail a guest customer needs ----
-- The customer-facing menu (anon) needs to know whether to show a
-- "Powered by QuickWaiterz" badge, but `subscriptions` is RLS-locked to
-- business members (status/trial dates aren't anyone else's business).
-- This exposes only the single boolean a guest actually needs, the same
-- minimal-exposure point-lookup pattern as resolve_qr_code.
CREATE OR REPLACE FUNCTION public.get_business_watermark(p_business_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(pc.has_watermark, false)
  FROM public.subscriptions s
  JOIN public.plan_configs pc ON pc.plan_type = s.plan_type
  WHERE s.business_id = p_business_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_business_watermark(UUID) TO anon, authenticated;
