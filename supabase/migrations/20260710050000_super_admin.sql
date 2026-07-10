-- ============================================================
-- SUPER ADMIN
--
-- app_role already had an 'admin' value, unused until now. Lets one
-- trusted account see every business (not just publicly-active ones)
-- and manually manage subscription status — standing in for a real
-- payment gateway (Stripe/Paddle) until that's actually wired up.
--
-- Nobody can self-grant this: there is no INSERT policy on user_roles
-- that allows role = 'admin' (the only existing one is scoped to
-- role = 'staff'), so the only way an admin row is ever created is a
-- manual, one-time insert run directly against the database (below) —
-- never something reachable from the app or its API.
--
-- Admin actions go through SECURITY DEFINER functions that check
-- has_role(auth.uid(), 'admin') themselves, rather than granting the
-- 'authenticated' Postgres role broader column access — that would
-- reopen the exact self-subscription-upgrade hole just closed, since
-- column privileges are per-database-role, not per-app-role.
-- ============================================================

-- ---- visibility: admin sees every business, any status ----
CREATE POLICY "Admins view all businesses" ON public.businesses
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ---- admin_list_businesses(): owner email isn't on the businesses row
-- itself (auth.users is never exposed to any client role directly), so
-- this joins it server-side and returns a flat, dashboard-ready list.
CREATE OR REPLACE FUNCTION public.admin_list_businesses()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  owner_email TEXT,
  subscription_status public.subscription_status,
  subscription_plan_name TEXT,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT b.id, b.name, b.slug, u.email::TEXT, b.subscription_status,
         p.name, b.trial_ends_at, b.current_period_end, b.is_active, b.created_at
  FROM public.businesses b
  JOIN auth.users u ON u.id = b.owner_id
  LEFT JOIN public.subscription_plans p ON p.id = b.subscription_plan_id
  ORDER BY b.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_businesses() TO authenticated;

-- ---- admin_set_subscription(): manual stand-in for a payment webhook ----
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_business_id UUID,
  p_status public.subscription_status,
  p_trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.businesses
  SET subscription_status = p_status,
      trial_ends_at = COALESCE(p_trial_ends_at, trial_ends_at),
      current_period_end = COALESCE(p_current_period_end, current_period_end)
  WHERE id = p_business_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, public.subscription_status, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ---- admin_set_business_active(): suspend / reactivate ----
CREATE OR REPLACE FUNCTION public.admin_set_business_active(
  p_business_id UUID,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.businesses SET is_active = p_is_active WHERE id = p_business_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_business_active(UUID, BOOLEAN) TO authenticated;

-- ---- one-time bootstrap: the only way an admin row is ever created ----
INSERT INTO public.user_roles (user_id, business_id, role)
SELECT id, NULL, 'admin' FROM auth.users WHERE email = 'abdullah.islam1236@gmail.com'
ON CONFLICT (user_id, business_id, role) DO NOTHING;
