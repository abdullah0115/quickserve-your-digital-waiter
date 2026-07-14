-- ============================================================
-- Subscription model v2: Trial / Self-Serve PKR / Managed Setup PKR
-- (Karachi/local only) / International USD. Paddle-ready price IDs.
--
-- Replaces the old Free/Starter/Pro/Enterprise `subscription_plans`
-- shape and the billing columns embedded on `businesses`
-- (subscription_plan_id, subscription_status, stripe_customer_id,
-- stripe_subscription_id, trial_ends_at, current_period_end). No
-- payment gateway (Stripe or Paddle) was ever actually wired up to
-- those columns, so there is no live billing data to preserve — this
-- is a clean cutover, not a data migration of real subscriptions.
--
-- Known follow-up (not done in this migration, flagged for the next
-- step): admin_list_businesses / admin_set_subscription are updated
-- below to match the new tables so they keep working, but
-- AdminPanel.tsx's TypeScript types/UI still expect the old field
-- names and will need a matching update. Pricing.tsx / Onboarding.tsx
-- (country selector) are also not touched here — that's the UI step.
-- ============================================================

-- ---- plan_configs: static plan definitions + enforced limits ----
-- A DB table (not hardcoded in the frontend) specifically so prices
-- and limits can be tuned without a code deploy, and so the
-- feature-gating hook (next step) has one source of truth to read.
CREATE TABLE public.plan_configs (
  plan_type TEXT PRIMARY KEY, -- 'trial' | 'self_serve_pkr' | 'managed_pkr' | 'international_usd'
  name TEXT NOT NULL,
  currency TEXT, -- 'PKR' | 'USD' | NULL for trial (never billed)
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  setup_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  paddle_price_id TEXT, -- filled in once the Paddle account/products are approved
  paddle_setup_fee_price_id TEXT, -- managed plan's one-time fee is a separate Paddle price
  max_tables INTEGER, -- NULL = unlimited
  max_orders_per_day INTEGER, -- NULL = unlimited
  scan_menu_limit INTEGER, -- NULL = unlimited; trial = 3 (lifetime, not monthly)
  analytics_level TEXT NOT NULL DEFAULT 'none' CHECK (analytics_level IN ('today_only', 'full')),
  has_watermark BOOLEAN NOT NULL DEFAULT false,
  support_level TEXT NOT NULL DEFAULT 'email' CHECK (support_level IN ('email', 'whatsapp_email', 'priority_whatsapp_email')),
  requires_city_match BOOLEAN NOT NULL DEFAULT false, -- true only for managed_pkr
  features JSONB NOT NULL DEFAULT '[]'::jsonb, -- display copy for the pricing page
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON public.plan_configs
  FOR SELECT USING (is_active = true);
-- No anon/authenticated write policy at all — plan/price changes go
-- through a migration or a future super-admin RPC, never directly.

INSERT INTO public.plan_configs
  (plan_type, name, currency, monthly_price, setup_fee, max_tables, max_orders_per_day, scan_menu_limit, analytics_level, has_watermark, support_level, requires_city_match, features, display_order)
VALUES
  ('trial', 'Free Trial', NULL, 0, 0, 5, 25, 3, 'today_only', true, 'email', false,
    '["14-day trial","Up to 5 tables","25 orders/day","Menu Manager (manual add + 3 AI menu scans)","Kitchen Display Screen","Order tracking","Today''s order count","Email support"]'::jsonb, 0),
  ('self_serve_pkr', 'Self-Serve', 'PKR', 4999, 0, NULL, NULL, NULL, 'full', false, 'whatsapp_email', false,
    '["Unlimited tables & orders","Unlimited AI menu scans","Full Kitchen Display Screen","Full analytics — peak hours, top items, reports","No QuickWaiterz branding","Self-print QR codes","WhatsApp + email support"]'::jsonb, 1),
  ('managed_pkr', 'Managed Setup', 'PKR', 6499, 9000, NULL, NULL, NULL, 'full', false, 'priority_whatsapp_email', true,
    '["Everything in Self-Serve","Priority support","On-site QR print, lamination & table installation","On-site staff training","One-time setup fee"]'::jsonb, 2),
  ('international_usd', 'International', 'USD', 35, 0, NULL, NULL, NULL, 'full', false, 'whatsapp_email', false,
    '["Unlimited tables & orders","Unlimited AI menu scans","Full Kitchen Display Screen","Full analytics — peak hours, top items, reports","No QuickWaiterz branding","Self-print QR codes","WhatsApp + email support"]'::jsonb, 3);

-- ---- managed_setup_cities: which cities unlock the Managed Setup option ----
-- An editable table rather than a hardcoded 'Karachi' string, so
-- coverage can expand without a code change.
CREATE TABLE public.managed_setup_cities (
  city TEXT PRIMARY KEY -- normalized: lower(trim(city))
);
ALTER TABLE public.managed_setup_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view managed setup cities" ON public.managed_setup_cities
  FOR SELECT USING (true);
INSERT INTO public.managed_setup_cities (city) VALUES ('karachi');

CREATE OR REPLACE FUNCTION public.is_managed_setup_eligible(p_city TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.managed_setup_cities WHERE city = lower(trim(p_city)));
$$;
GRANT EXECUTE ON FUNCTION public.is_managed_setup_eligible(TEXT) TO anon, authenticated;

-- ---- subscriptions: actual per-business subscription state ----
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL REFERENCES public.plan_configs(plan_type),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  paddle_subscription_id TEXT,
  paddle_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_business ON public.subscriptions(business_id);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business members view their subscription" ON public.subscriptions
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id));
-- No client INSERT/UPDATE/DELETE policy — status/plan changes only
-- happen via SECURITY DEFINER functions (admin_set_subscription today,
-- a Paddle webhook handler once that's built), same pattern as
-- businesses.subscription_status before this migration.

CREATE TRIGGER trg_subscriptions_updated
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---- give every existing business a trial subscription row ----
-- (No live paid subscriptions exist yet — see header note — so
-- everything that isn't already past its original trial window
-- starts a fresh trial rather than guessing a plan to assign.)
INSERT INTO public.subscriptions (business_id, plan_type, status, trial_ends_at)
SELECT id, 'trial', 'trialing', COALESCE(trial_ends_at, now() + interval '14 days')
FROM public.businesses;

-- ---- new businesses get a trial subscription row automatically ----
-- Replaces assign_free_plan, which assigned the now-deleted 'free'
-- subscription_plans row via businesses.subscription_plan_id.
DROP TRIGGER IF EXISTS trg_businesses_assign_free_plan ON public.businesses;
DROP FUNCTION IF EXISTS public.assign_free_plan();

CREATE OR REPLACE FUNCTION public.create_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.subscriptions (business_id, plan_type, status, trial_ends_at)
  VALUES (NEW.id, 'trial', 'trialing', now() + interval '14 days');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_businesses_create_trial_subscription
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.create_trial_subscription();
-- Trigger functions are structurally uncallable outside trigger
-- context regardless of grants, but revoked anyway for a clean list.
REVOKE EXECUTE ON FUNCTION public.create_trial_subscription() FROM PUBLIC, anon, authenticated;

-- ---- update admin RPCs to the new schema (drop first: return/param
-- types are changing from the enum to plain TEXT, and the enum itself
-- is being dropped below) ----
DROP FUNCTION IF EXISTS public.admin_list_businesses();
DROP FUNCTION IF EXISTS public.admin_set_subscription(UUID, public.subscription_status, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.admin_list_businesses()
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  owner_email TEXT,
  plan_type TEXT,
  subscription_status TEXT,
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
  SELECT b.id, b.name, b.slug, u.email::TEXT, s.plan_type, s.status,
         s.trial_ends_at, s.current_period_end, b.is_active, b.created_at
  FROM public.businesses b
  JOIN auth.users u ON u.id = b.owner_id
  LEFT JOIN public.subscriptions s ON s.business_id = b.id
  ORDER BY b.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_businesses() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_businesses() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  p_business_id UUID,
  p_plan_type TEXT,
  p_status TEXT,
  p_trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_current_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.subscriptions
  SET plan_type = p_plan_type,
      status = p_status,
      trial_ends_at = COALESCE(p_trial_ends_at, trial_ends_at),
      current_period_end = COALESCE(p_current_period_end, current_period_end)
  WHERE business_id = p_business_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;

-- ---- drop the now-obsolete billing columns/table/enum ----
ALTER TABLE public.businesses
  DROP COLUMN subscription_plan_id,
  DROP COLUMN subscription_status,
  DROP COLUMN stripe_customer_id,
  DROP COLUMN stripe_subscription_id,
  DROP COLUMN trial_ends_at,
  DROP COLUMN current_period_end;

DROP TABLE public.subscription_plans;
DROP TYPE IF EXISTS public.subscription_status;
