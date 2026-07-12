-- get_scan_usage still had EXECUTE granted to the PUBLIC pseudo-role
-- itself (every role, including anon, is implicitly a PUBLIC member) —
-- the prior migration only revoked from anon specifically, which doesn't
-- remove access granted at the PUBLIC level. Revoke PUBLIC too, then
-- re-grant to authenticated only.
REVOKE EXECUTE ON FUNCTION public.get_scan_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scan_usage(UUID) TO authenticated;

-- cleanup: drop the temporary diagnostic function used to find this
DROP FUNCTION IF EXISTS public.__diag_grants2();
