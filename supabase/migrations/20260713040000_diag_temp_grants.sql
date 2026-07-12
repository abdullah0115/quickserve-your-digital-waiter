CREATE OR REPLACE FUNCTION public.__diag_grants2()
RETURNS TABLE(grantee TEXT, routine_name TEXT, privilege_type TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT grantee, routine_name, privilege_type
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('get_scan_usage', 'add_order_item', 'create_order_with_items', 'check_rate_limit')
  ORDER BY routine_name, grantee;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_grants2() TO anon;
