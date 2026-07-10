CREATE OR REPLACE FUNCTION public.__diag_roles()
RETURNS TABLE(info TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  out_text TEXT;
BEGIN
  -- role memberships of anon
  FOR r IN
    SELECT rolname AS member, (SELECT rolname FROM pg_roles WHERE oid = m.roleid) AS grp
    FROM pg_auth_members m
    JOIN pg_roles rr ON rr.oid = m.member
    WHERE rr.rolname = 'anon'
  LOOP
    RETURN QUERY SELECT 'anon is member of: ' || r.grp;
  END LOOP;

  -- table owner
  RETURN QUERY SELECT 'orders owner: ' || (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE relname='orders' AND relnamespace = 'public'::regnamespace);

  -- raw acl
  RETURN QUERY SELECT 'orders relacl: ' || COALESCE((SELECT array_to_string(relacl, ' | ') FROM pg_class WHERE relname='orders' AND relnamespace='public'::regnamespace), 'NULL (no acl = default owner-only, meaning something ELSE grants access)');

  RETURN QUERY SELECT 'businesses relacl: ' || COALESCE((SELECT array_to_string(relacl, ' | ') FROM pg_class WHERE relname='businesses' AND relnamespace='public'::regnamespace), 'NULL');

  -- current role running this function
  RETURN QUERY SELECT 'current_user: ' || current_user;
  RETURN QUERY SELECT 'session_user: ' || session_user;
END;
$$;
GRANT EXECUTE ON FUNCTION public.__diag_roles() TO anon;
