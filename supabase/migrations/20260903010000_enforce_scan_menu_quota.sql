-- Reserve menu-scan quota atomically before calling Groq. This prevents two
-- simultaneous requests from both passing a count-then-insert check.
CREATE OR REPLACE FUNCTION public.reserve_scan_menu_quota(p_business_id UUID)
RETURNS TABLE(
  allowed BOOLEAN,
  scans_used INTEGER,
  scans_limit INTEGER,
  quota_hit_id BIGINT,
  is_trial BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_type TEXT;
  v_limit INTEGER;
  v_used INTEGER;
  v_hit_id BIGINT;
  v_bucket TEXT := 'scan_menu:business:' || p_business_id::text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(v_bucket, 0));

  SELECT s.plan_type,
         COALESCE(pc.scan_menu_limit, CASE WHEN s.plan_type = 'trial' THEN 3 ELSE 10 END)
  INTO v_plan_type, v_limit
  FROM public.subscriptions s
  JOIN public.plan_configs pc ON pc.plan_type = s.plan_type
  WHERE s.business_id = p_business_id;

  IF v_plan_type IS NULL THEN
    RAISE EXCEPTION 'No subscription found for this business';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_used
  FROM public.rate_limit_hits
  WHERE bucket_key = v_bucket
    -- Trial scans are lifetime-capped; paid-plan usage resets monthly.
    AND (v_plan_type = 'trial' OR created_at >= date_trunc('month', now()));

  IF v_used >= v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit, NULL::BIGINT, v_plan_type = 'trial';
    RETURN;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket_key)
  VALUES (v_bucket)
  RETURNING id INTO v_hit_id;

  RETURN QUERY SELECT true, v_used + 1, v_limit, v_hit_id, v_plan_type = 'trial';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_scan_menu_quota(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_scan_menu_quota(UUID) TO service_role;

-- Refund a reservation if Groq cannot be reached or rejects the request. A
-- valid attempt that receives a Groq response stays counted.
CREATE OR REPLACE FUNCTION public.release_scan_menu_quota(p_quota_hit_id BIGINT)
RETURNS VOID
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.rate_limit_hits
  WHERE id = p_quota_hit_id
    AND bucket_key LIKE 'scan_menu:business:%';
$$;
REVOKE EXECUTE ON FUNCTION public.release_scan_menu_quota(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_scan_menu_quota(BIGINT) TO service_role;

-- Owner-facing usage uses the same lifetime/monthly rules as enforcement.
CREATE OR REPLACE FUNCTION public.get_scan_usage(p_business_id UUID)
RETURNS TABLE(scans_used INTEGER, scans_limit INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan_type TEXT;
  v_limit INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(auth.uid(), p_business_id) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  SELECT s.plan_type,
         COALESCE(pc.scan_menu_limit, CASE WHEN s.plan_type = 'trial' THEN 3 ELSE 10 END)
  INTO v_plan_type, v_limit
  FROM public.subscriptions s
  JOIN public.plan_configs pc ON pc.plan_type = s.plan_type
  WHERE s.business_id = p_business_id;

  IF v_plan_type IS NULL THEN
    RAISE EXCEPTION 'No active scan-menu plan found for this business';
  END IF;

  RETURN QUERY
  SELECT COUNT(*)::INTEGER, v_limit
  FROM public.rate_limit_hits
  WHERE bucket_key = 'scan_menu:business:' || p_business_id::text
    AND (v_plan_type = 'trial' OR created_at >= date_trunc('month', now()));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_scan_usage(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_scan_usage(UUID) TO authenticated;
