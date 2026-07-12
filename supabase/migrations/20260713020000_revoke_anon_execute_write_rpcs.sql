-- ============================================================
-- FIX (attempt 2): REVOKE ... FROM PUBLIC (previous migration) did not
-- actually block anon — verified live, a direct anon-keyed
-- POST /rest/v1/rpc/add_order_item still reached the function body after
-- that migration. This project's default privileges (set up by Supabase
-- at project bootstrap) explicitly grant EXECUTE on newly created public
-- schema functions to anon/authenticated directly, not via PUBLIC — so
-- PUBLIC was never the grantor and revoking it was a no-op for these
-- roles. Revoke from anon/authenticated explicitly instead.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(TEXT, TEXT, TEXT, JSONB, UUID, public.order_type, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_order_item(UUID, TEXT, UUID, INTEGER, TEXT, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM anon, authenticated;
