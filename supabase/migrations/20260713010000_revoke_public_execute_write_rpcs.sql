-- ============================================================
-- FIX: create_order_with_items / add_order_item / check_rate_limit were
-- reachable directly by anon despite intentionally having no GRANT to
-- anon/authenticated.
--
-- Postgres grants EXECUTE on newly created functions to the PUBLIC
-- pseudo-role by default — "no GRANT" does not mean "no access" the way
-- it does for tables under RLS. Verified live: an anon-keyed direct
-- `POST /rest/v1/rpc/add_order_item` call reached the function body
-- (got back its RAISE EXCEPTION business-logic error, not a permission
-- error), which meant the per-IP rate limit in the add-order-item /
-- create-order edge functions could be bypassed entirely by calling the
-- RPCs directly. Explicitly revoking from PUBLIC closes that.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(TEXT, TEXT, TEXT, JSONB, UUID, public.order_type, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_order_item(UUID, TEXT, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
