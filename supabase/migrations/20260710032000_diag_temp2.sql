CREATE OR REPLACE FUNCTION public.__diag_grants()
RETURNS TABLE(grantee TEXT, table_name TEXT, column_name TEXT, privilege_type TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cp.grantee, cp.table_name, cp.column_name, cp.privilege_type
  FROM information_schema.column_privileges cp
  WHERE cp.table_schema = 'public'
    AND cp.table_name IN ('orders','businesses')
    AND cp.column_name IN ('customer_name','customer_phone','stripe_customer_id','subscription_status','total_amount')
  UNION ALL
  SELECT tp.grantee, tp.table_name, '(table-level)', tp.privilege_type
  FROM information_schema.table_privileges tp
  WHERE tp.table_schema = 'public'
    AND tp.table_name IN ('orders','businesses')
    AND tp.privilege_type IN ('SELECT','UPDATE');
$$;
GRANT EXECUTE ON FUNCTION public.__diag_grants() TO anon;
