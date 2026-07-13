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
