CREATE OR REPLACE FUNCTION public.__diag_privs()
RETURNS TABLE(check_name TEXT, result BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'anon can select orders.customer_name', has_column_privilege('anon', 'public.orders', 'customer_name', 'SELECT')
  UNION ALL
  SELECT 'anon can select orders.customer_phone', has_column_privilege('anon', 'public.orders', 'customer_phone', 'SELECT')
  UNION ALL
  SELECT 'anon can select businesses.stripe_customer_id', has_column_privilege('anon', 'public.businesses', 'stripe_customer_id', 'SELECT')
  UNION ALL
  SELECT 'authenticated can update businesses.subscription_status', has_column_privilege('authenticated', 'public.businesses', 'subscription_status', 'UPDATE')
  UNION ALL
  SELECT 'authenticated can update orders.total_amount', has_column_privilege('authenticated', 'public.orders', 'total_amount', 'UPDATE');
$$;
GRANT EXECUTE ON FUNCTION public.__diag_privs() TO anon;
