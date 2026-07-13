-- ============================================================
-- HARD AUDIT FOLLOW-UP (2026-07-14)
--
-- Full sweep of every function's actual grants, every table's RLS status,
-- every policy, and secrets. Nothing found actively exploited (every
-- powerful function already re-checks the caller's identity internally
-- via has_role()/is_business_member()), but several defense-in-depth gaps
-- closed below — same category as the add_order_item/get_scan_usage
-- PUBLIC-grant issue found earlier this week, just not yet applied to
-- these functions/tables:
--
-- 1. admin_set_subscription / admin_set_business_active /
--    admin_list_businesses had EXECUTE granted to PUBLIC and anon on top
--    of authenticated. Each already starts with
--    `IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION`, so this
--    was never actually callable by a non-admin — but there's no reason
--    for anon (never logged in) to be able to reach these at all.
-- 2. rate_limit_hits and the _backup_orders_items_20260713 snapshot table
--    both have full anon/authenticated table-level CRUD grants (Supabase's
--    default for any new public-schema table) and are currently protected
--    only by RLS-enabled-with-zero-policies (verified empirically: a
--    direct anon SELECT returns `[]`, not an error). That's correct
--    today, but neither table should be reachable via the REST API at
--    all — they're internal plumbing only ever touched by SECURITY
--    DEFINER functions or the service role. Revoking the raw grants
--    removes the reliance on "nobody ever adds a policy here by mistake"
--    as the only thing standing between these and PostgREST.
-- 3. Trigger functions (handle_new_business, notify_new_order,
--    recompute_order_total, resolve_order_table, set_order_token,
--    touch_updated_at, assign_free_plan) had PUBLIC/anon/authenticated
--    EXECUTE grants too — Postgres structurally refuses to run a trigger
--    function outside trigger context ("trigger functions can only be
--    called as triggers"), so this was never callable either way. Revoked
--    anyway for a clean grant list.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(UUID, public.subscription_status, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_business_active(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_businesses() FROM PUBLIC, anon;

REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;
REVOKE ALL ON public._backup_orders_items_20260713 FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_business() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_order() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_order_total() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_order_table() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_order_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_free_plan() FROM PUBLIC, anon, authenticated;

-- ---- cleanup: drop every temporary diagnostic function used for this audit ----
DROP FUNCTION IF EXISTS public.__diag_audit_grants();
DROP FUNCTION IF EXISTS public.__diag_audit_tables();
DROP FUNCTION IF EXISTS public.__diag_audit_columns();
DROP FUNCTION IF EXISTS public.__diag_audit_policies();
DROP FUNCTION IF EXISTS public.__diag_audit_rls_enabled();
DROP FUNCTION IF EXISTS public.__diag_audit_func_kind(TEXT);
