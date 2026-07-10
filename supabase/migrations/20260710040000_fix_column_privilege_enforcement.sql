-- ============================================================
-- CRITICAL CORRECTION
--
-- Every `REVOKE SELECT/UPDATE (column) ... FROM role` used earlier in this
-- project (stripe ids, customer_phone/notes, and today's customer_name /
-- billing-field / order-immutability fixes) was a silent no-op. Postgres
-- ORs table-level and column-level grants together — anon/authenticated
-- already hold a blanket table-level grant on every table (Supabase's
-- default for RLS-protected tables), so revoking one column back out of
-- that only has an effect if there's no table-level grant covering it.
-- Verified live: has_column_privilege('anon','orders','customer_name',
-- 'SELECT') still returned true after the earlier REVOKE, and pg_class
-- .relacl showed anon holding full arwdDxtm (all-privileges) on both
-- orders and businesses regardless.
--
-- The only way to actually narrow column access here is to revoke the
-- table-level privilege entirely and re-grant an explicit column list.
-- ============================================================

-- ---- orders: SELECT ----
REVOKE SELECT ON public.orders FROM anon;
GRANT SELECT (
  id, business_id, token_number, items, total_amount, status,
  table_number, order_type, notified_at, completed_at, created_at,
  updated_at, qr_code_id
) ON public.orders TO anon;
-- customer_name / customer_phone / notes are excluded entirely. A guest
-- reaches their OWN order (including these fields) only through
-- get_order_status(), which is SECURITY DEFINER and unaffected by table
-- grants — this doesn't take anything away from the checkout flow.
-- authenticated (business members) keeps full-column SELECT: RLS already
-- scopes them to their own business's rows, and staff genuinely need
-- customer_name/phone to hand an order to the right person.

-- ---- orders: UPDATE ----
REVOKE UPDATE ON public.orders FROM anon, authenticated;
GRANT UPDATE (status, completed_at) ON public.orders TO authenticated;
-- Nobody — not even a business's own staff — can rewrite an order's
-- items, total, customer info, or table once it's placed. Matches
-- exactly what the Dashboard's kitchen-display workflow actually sends.

-- ---- businesses: SELECT ----
REVOKE SELECT ON public.businesses FROM anon, authenticated;
GRANT SELECT (
  id, owner_id, name, slug, tagline, description, logo_url,
  cover_image_url, phone, email, address, city, country, cuisine_type,
  meta_title, meta_description, theme_color, subscription_plan_id,
  subscription_status, is_active, created_at, updated_at
) ON public.businesses TO anon, authenticated;
-- stripe_customer_id / stripe_subscription_id / trial_ends_at /
-- current_period_end stay out entirely — billing-internal, no UI reads
-- them; service_role (a future Stripe webhook) is untouched by this.

-- ---- businesses: UPDATE ----
REVOKE UPDATE ON public.businesses FROM anon, authenticated;
GRANT UPDATE (
  name, tagline, description, logo_url, cover_image_url, phone, email,
  address, city, country, cuisine_type, meta_title, meta_description,
  theme_color
) ON public.businesses TO authenticated;
-- owner_id, is_active, and every subscription/billing column are
-- excluded — none are ever touched by the Settings UI, and none should
-- be client-writable at all (this is what closes the
-- self-upgrade-my-own-subscription hole).

-- ---- businesses: INSERT ----
REVOKE INSERT ON public.businesses FROM anon, authenticated;
GRANT INSERT (
  owner_id, name, slug, tagline, description, logo_url, cover_image_url,
  phone, email, address, city, country, cuisine_type, meta_title,
  meta_description, theme_color
) ON public.businesses TO authenticated;
-- subscription_plan_id / subscription_status / stripe_* / trial_ends_at /
-- current_period_end are never client-settable even at creation — they
-- fall through to their column DEFAULTs (a new business always starts on
-- 'trial', no plan/stripe linkage). The trigger below assigns the actual
-- free plan server-side instead of trusting a client-supplied plan id.
CREATE OR REPLACE FUNCTION public.assign_free_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.subscription_plan_id IS NULL THEN
    SELECT id INTO NEW.subscription_plan_id FROM public.subscription_plans WHERE slug = 'free' LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_businesses_assign_free_plan
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.assign_free_plan();

-- ---- cleanup: drop the temporary diagnostic functions used to find this ----
DROP FUNCTION IF EXISTS public.__diag_privs();
DROP FUNCTION IF EXISTS public.__diag_grants();
DROP FUNCTION IF EXISTS public.__diag_roles();
