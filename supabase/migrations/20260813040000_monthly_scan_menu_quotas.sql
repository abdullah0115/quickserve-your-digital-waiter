-- AI menu scans are a per-business calendar-month allowance. Keeping the
-- quota in plan_configs makes the edge function and the owner-facing UI use
-- the same source of truth.
UPDATE public.plan_configs
SET scan_menu_limit = CASE plan_type
  WHEN 'trial' THEN 3
  WHEN 'self_serve_pkr' THEN 10
  WHEN 'managed_pkr' THEN 10
  WHEN 'international_usd' THEN 10
  ELSE scan_menu_limit
END
WHERE plan_type IN ('trial', 'self_serve_pkr', 'managed_pkr', 'international_usd');

ALTER TABLE public.plan_configs
  ALTER COLUMN scan_menu_limit SET NOT NULL;

-- This is only a read for the dialog. The edge function remains the sole
-- component that can call Groq and record usage, so a browser cannot bypass
-- the plan limit by writing directly to rate_limit_hits.
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
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'No active scan-menu plan found for this business';
  END IF;

  RETURN QUERY
  SELECT COUNT(*)::INTEGER, v_limit
  FROM public.rate_limit_hits
  WHERE bucket_key = 'scan_menu:business:' || p_business_id::text
    AND created_at >= date_trunc('month', now());
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_scan_usage(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_scan_usage(UUID) TO authenticated;
