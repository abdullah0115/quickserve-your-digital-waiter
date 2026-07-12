-- ============================================================
-- SCAN-MENU RATE LIMITING
--
-- scan-menu calls a paid third-party API (Groq) per request — unlike the
-- guest order endpoints, this one is only reachable by an authenticated
-- business member, but that's not a spend cap by itself: a leaked/reused
-- staff JWT, or just a careless script, could otherwise call it without
-- limit. Reuses the same rate_limit_hits infra from the order-concurrency
-- work (see 20260713000000_order_items_table.sql):
--   - scan_menu:user:<user_id> — 20 scans per rolling 30 days (the actual
--     product limit the owner asked for)
--   - scan_menu:ip:<ip> — a short-window burst guard, checked in the edge
--     function itself (same reasoning as create-order/add-order-item: a
--     Postgres function called through the pooler can't see the real
--     client IP, so IP limiting can only happen at the edge-function layer)
-- ============================================================

-- Lets the ScanMenuDialog show "X of 20 scans used this month" up front,
-- without spending a scan attempt to find out (a plain COUNT, no INSERT).
-- SECURITY DEFINER so it can read rate_limit_hits (no RLS/anon policy on
-- that table at all, by design), but re-checks membership itself first.
CREATE OR REPLACE FUNCTION public.get_scan_usage(p_business_id UUID)
RETURNS TABLE(scans_used INTEGER, scans_limit INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(auth.uid(), p_business_id) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  RETURN QUERY
  SELECT COUNT(*)::INTEGER, 20
  FROM public.rate_limit_hits
  WHERE bucket_key = 'scan_menu:user:' || auth.uid()::text
    AND created_at >= now() - interval '30 days';
END;
$$;
-- Explicit, even though only authenticated members should ever have a
-- meaningful result — anon has no auth.uid() and would just hit the
-- "Not authorized" branch, but revoke outright for the same reason the
-- order-write RPCs were locked down (Supabase's default privileges grant
-- EXECUTE on new functions to anon/authenticated regardless of PUBLIC).
REVOKE EXECUTE ON FUNCTION public.get_scan_usage(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_scan_usage(UUID) TO authenticated;
