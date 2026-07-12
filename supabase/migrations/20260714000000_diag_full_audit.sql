CREATE OR REPLACE FUNCTION public.__diag_audit_grants()
RETURNS TABLE(grantee TEXT, routine_name TEXT, privilege_type TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT grantee, routine_name, privilege_type
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ORDER BY routine_name, grantee;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_audit_grants() TO anon;

CREATE OR REPLACE FUNCTION public.__diag_audit_tables()
RETURNS TABLE(grantee TEXT, table_name TEXT, privilege_type TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT grantee, table_name, privilege_type
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ORDER BY table_name, grantee, privilege_type;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_audit_tables() TO anon;

CREATE OR REPLACE FUNCTION public.__diag_audit_columns()
RETURNS TABLE(grantee TEXT, table_name TEXT, column_name TEXT, privilege_type TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT grantee, table_name, column_name, privilege_type
  FROM information_schema.column_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ORDER BY table_name, column_name, grantee;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_audit_columns() TO anon;

CREATE OR REPLACE FUNCTION public.__diag_audit_policies()
RETURNS TABLE(table_name TEXT, policy_name TEXT, cmd TEXT, roles TEXT, qual TEXT, with_check TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_audit_policies() TO anon;

CREATE OR REPLACE FUNCTION public.__diag_audit_rls_enabled()
RETURNS TABLE(table_name TEXT, rls_enabled BOOLEAN, rls_forced BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY relname;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_audit_rls_enabled() TO anon;

CREATE OR REPLACE FUNCTION public.__diag_audit_func_kind(p_name TEXT)
RETURNS TABLE(name TEXT, kind TEXT, returns TEXT, security_type TEXT, source_snippet TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.proname, p.prokind::text,
         pg_get_function_result(p.oid),
         CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END,
         left(p.prosrc, 400)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_name;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_audit_func_kind(TEXT) TO anon;
