-- ============================================================
-- QuickServe — full schema (clean rewrite)
--
-- Replaces the earlier ad-hoc migrations. Meant to be run against an
-- EMPTY project (supabase db reset locally, or a wiped remote project) —
-- there is no real data to preserve.
--
-- Design decisions baked in here (see AUDIT.md for the issues this fixes):
--   - RLS is enabled and scoped on every table — nothing that holds
--     customer PII or billing data uses `USING (true)`.
--   - `user_roles` is the single source of truth for who can manage a
--     business (owner or staff). The owner row is created automatically
--     by a trigger when a business is created, and `is_business_member()`
--     is now actually referenced by every "manage this business" policy
--     (it existed before but nothing used it, so staff accounts never
--     really worked).
--   - Order totals and per-item prices are recomputed server-side from
--     `menu_items` on every insert — the client-supplied amount is never
--     trusted (closes the price-tampering hole).
--   - `notifications` now actually exists (the app already queried a
--     table that was never migrated).
-- ============================================================

-- ============ ENUMS ============
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'past_due', 'canceled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'ready', 'completed', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
        CREATE TYPE public.order_type AS ENUM ('dine_in', 'takeaway');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'owner', 'staff');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE public.notification_type AS ENUM ('new_order', 'order_ready', 'order_completed');
    END IF;
END $$;

-- ============ SUBSCRIPTION PLANS ============
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_orders_per_month INTEGER,
  max_menu_items INTEGER,
  max_qr_codes INTEGER,
  has_analytics BOOLEAN NOT NULL DEFAULT false,
  has_whatsapp BOOLEAN NOT NULL DEFAULT false,
  has_custom_branding BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- ============ BUSINESSES ============
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT,
  description TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'Pakistan',
  cuisine_type TEXT,
  meta_title TEXT,
  meta_description TEXT,
  theme_color TEXT NOT NULL DEFAULT '#2D1810',
  subscription_plan_id UUID REFERENCES public.subscription_plans(id),
  subscription_status subscription_status NOT NULL DEFAULT 'trial',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days'),
  current_period_end TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_businesses_slug ON public.businesses(slug);
CREATE INDEX idx_businesses_owner ON public.businesses(owner_id);
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES (who can manage which business) ============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so these can be used inside RLS policies (including on
-- user_roles itself) without recursive-policy issues.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(_user_id UUID, _business_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND business_id = _business_id
  )
$$;

-- ============ MENU CATEGORIES ============
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_urdu TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_categories_business ON public.menu_categories(business_id);
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

-- ============ MENU ITEMS ============
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  name_urdu TEXT,
  description TEXT,
  description_urdu TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  preparation_time INTEGER NOT NULL DEFAULT 15 CHECK (preparation_time > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_business ON public.menu_items(business_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- ============ ORDERS ============
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  token_number INTEGER NOT NULL,
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) > 0),
  customer_phone TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status order_status NOT NULL DEFAULT 'pending',
  table_number TEXT,
  order_type order_type NOT NULL DEFAULT 'dine_in',
  notes TEXT,
  notified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_business ON public.orders(business_id);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- ============ QR CODES ============
CREATE TABLE IF NOT EXISTS public.qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL CHECK (length(trim(table_number)) > 0),
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  scan_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- ============ ANALYTICS ============
CREATE TABLE IF NOT EXISTS public.business_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_order_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  top_selling_items JSONB DEFAULT '[]'::jsonb,
  peak_hours JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, date)
);
CREATE INDEX idx_analytics_business_date ON public.business_analytics(business_id, date);
ALTER TABLE public.business_analytics ENABLE ROW LEVEL SECURITY;

-- ============ NOTIFICATIONS ============
-- The app (useNotifications.ts / NotificationBell.tsx) already queries this
-- table; it just never had a migration. business_id is the primary use today
-- (a business-side "new order" bell); user_id is kept for a future
-- customer-facing notification if that's ever built.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR business_id IS NOT NULL)
);
CREATE INDEX idx_notifications_business ON public.notifications(business_id, created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============ updated_at TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ AUTO-CREATE OWNER ROLE ============
-- Whoever creates a business automatically becomes its 'owner' in user_roles.
-- This removes the need for the client to insert into user_roles at all
-- (previously Onboarding.tsx tried to do this itself, and there was no
-- INSERT policy allowing it, so it silently failed).
CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, business_id, role)
  VALUES (NEW.owner_id, NEW.id, 'owner')
  ON CONFLICT (user_id, business_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_businesses_owner_role
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_business();

-- ============ AUTO-INCREMENT DAILY TOKEN PER BUSINESS ============
CREATE OR REPLACE FUNCTION public.set_order_token()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  next_token INTEGER;
BEGIN
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO next_token
  FROM public.orders
  WHERE business_id = NEW.business_id
    AND created_at::date = CURRENT_DATE;
  NEW.token_number := next_token;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_set_order_token
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_token();

-- ============ SERVER-SIDE ORDER TOTAL (CRITICAL FIX) ============
-- Never trust total_amount or per-item price sent by the client. Every
-- insert re-derives price and name for each item from menu_items by
-- menu_item_id, and rebuilds total_amount as the authoritative sum. An
-- order for an item that doesn't exist, isn't available, or belongs to a
-- different business is rejected outright.
CREATE OR REPLACE FUNCTION public.compute_order_total()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_items JSONB := '[]'::jsonb;
  v_total NUMERIC(10,2) := 0;
  v_item JSONB;
  v_price NUMERIC(10,2);
  v_name TEXT;
  v_qty INTEGER;
BEGIN
  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) != 'array' OR jsonb_array_length(NEW.items) = 0 THEN
    RAISE EXCEPTION 'Order must include at least one item';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
  LOOP
    SELECT price, name INTO v_price, v_name
    FROM public.menu_items
    WHERE id = (v_item->>'menu_item_id')::uuid
      AND business_id = NEW.business_id
      AND is_available = true;

    IF v_price IS NULL THEN
      RAISE EXCEPTION 'Menu item % is unavailable or does not belong to this business', v_item->>'menu_item_id';
    END IF;

    v_qty := GREATEST(COALESCE((v_item->>'quantity')::int, 1), 1);

    v_items := v_items || jsonb_build_object(
      'menu_item_id', v_item->>'menu_item_id',
      'name', v_name,
      'price', v_price,
      'quantity', v_qty,
      'notes', v_item->'notes'
    );
    v_total := v_total + (v_price * v_qty);
  END LOOP;

  NEW.items := v_items;
  NEW.total_amount := v_total;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_compute_order_total
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.compute_order_total();

-- ============ NOTIFY BUSINESS ON NEW ORDER ============
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (business_id, order_id, type, title, message, data)
  VALUES (
    NEW.business_id,
    NEW.id,
    'new_order',
    'New order #' || NEW.token_number,
    NEW.customer_name || ' placed an order' ||
      CASE WHEN NEW.table_number IS NOT NULL THEN ' for table ' || NEW.table_number ELSE '' END,
    jsonb_build_object('token_number', NEW.token_number, 'total_amount', NEW.total_amount)
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_orders_notify_new
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

-- ============ GUEST ORDER LOOKUP (no direct table access needed) ============
-- Lets a guest customer look up their OWN order without the table being
-- publicly listable:
--   - by the unguessable order id (the capability link they're redirected
--     to right after checkout: /:slug/order/:token?id=<uuid>), or
--   - by the daily token number PLUS the exact phone number they placed
--     the order with (token numbers are small sequential integers and
--     easily guessable on their own, so a bare token lookup requires a
--     matching phone number).
-- SECURITY DEFINER so it can also return completed/cancelled orders
-- (post-pickup), which the public row policy below intentionally excludes.
CREATE OR REPLACE FUNCTION public.get_order_status(
  p_business_slug TEXT,
  p_order_id UUID DEFAULT NULL,
  p_token_number INTEGER DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  token_number INTEGER,
  status public.order_status,
  customer_name TEXT,
  items JSONB,
  total_amount NUMERIC,
  table_number TEXT,
  order_type public.order_type,
  created_at TIMESTAMPTZ,
  business_id UUID
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.token_number, o.status, o.customer_name, o.items, o.total_amount,
         o.table_number, o.order_type, o.created_at, o.business_id
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  WHERE b.slug = p_business_slug
    AND (
      (p_order_id IS NOT NULL AND o.id = p_order_id)
      OR (
        p_token_number IS NOT NULL
        AND p_customer_phone IS NOT NULL
        AND o.token_number = p_token_number
        AND o.customer_phone = p_customer_phone
        AND o.created_at::date = CURRENT_DATE
      )
    )
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_status(TEXT, UUID, INTEGER, TEXT) TO anon, authenticated;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ---- subscription_plans: public reference data, no writes from clients ----
CREATE POLICY "Plans are publicly viewable" ON public.subscription_plans FOR SELECT USING (true);

-- ---- businesses ----
-- Public profile is visible to everyone (it's a restaurant's public page);
-- stripe_customer_id / stripe_subscription_id are separately locked down
-- below via column privileges, not by this row policy, since RLS can't
-- restrict individual columns.
CREATE POLICY "Active businesses are publicly viewable" ON public.businesses
  FOR SELECT USING (is_active = true OR auth.uid() = owner_id);
CREATE POLICY "Owners can insert businesses" ON public.businesses
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update their business" ON public.businesses
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their business" ON public.businesses
  FOR DELETE USING (auth.uid() = owner_id);

-- ---- user_roles ----
CREATE POLICY "Users see their own roles, owners see their business roles" ON public.user_roles
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
  );
-- Owners can add staff to their own business. The owner's own row is
-- created by the trigger above, not by a client insert, and this policy
-- can never be used to self-grant 'owner' or 'admin'.
CREATE POLICY "Owners add staff to their business" ON public.user_roles
  FOR INSERT WITH CHECK (
    role = 'staff'
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
  );
CREATE POLICY "Owners manage staff roles" ON public.user_roles
  FOR UPDATE USING (
    role = 'staff'
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
  ) WITH CHECK (role = 'staff');
CREATE POLICY "Owners remove staff" ON public.user_roles
  FOR DELETE USING (
    role = 'staff'
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
  );

-- ---- menu_categories / menu_items / qr_codes ----
-- Publicly readable (customer-facing menu / table QR codes); any business
-- member (owner OR staff) can manage them.
CREATE POLICY "Categories are publicly viewable" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "Business members manage categories" ON public.menu_categories
  FOR ALL USING (public.is_business_member(auth.uid(), business_id))
  WITH CHECK (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "Menu items are publicly viewable" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Business members manage menu items" ON public.menu_items
  FOR ALL USING (public.is_business_member(auth.uid(), business_id))
  WITH CHECK (public.is_business_member(auth.uid(), business_id));

CREATE POLICY "QR codes publicly viewable" ON public.qr_codes FOR SELECT USING (true);
CREATE POLICY "Business members manage QR codes" ON public.qr_codes
  FOR ALL USING (public.is_business_member(auth.uid(), business_id))
  WITH CHECK (public.is_business_member(auth.uid(), business_id));

-- ---- orders ----
-- Business members (owner + staff) see every order, any status.
CREATE POLICY "Business members view their orders" ON public.orders
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id));
-- The public can only see currently-active orders — this is what powers the
-- public kitchen/pickup display screen and realtime updates on a customer's
-- own order-status page. Completed/cancelled (historical) orders are never
-- publicly readable; guests reach those only via get_order_status() above.
CREATE POLICY "Public can view active orders" ON public.orders
  FOR SELECT USING (status IN ('pending', 'preparing', 'ready'));
-- Anyone can place an order (guest checkout), but only for a business that's
-- actually active. total_amount/items are re-derived server-side regardless
-- of what's submitted (see trg_compute_order_total above).
CREATE POLICY "Anyone can create orders for active businesses" ON public.orders
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.is_active = true)
  );
-- Status changes (the kitchen-display workflow) are for business members —
-- this is what actually makes "staff accounts" functional; previously only
-- the owner_id could update orders at all.
CREATE POLICY "Business members update order status" ON public.orders
  FOR UPDATE USING (public.is_business_member(auth.uid(), business_id));
-- Deleting an order (removing it from records) stays an owner-only action.
CREATE POLICY "Owners delete their orders" ON public.orders
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
  );

-- ---- business_analytics ----
CREATE POLICY "Business members view their analytics" ON public.business_analytics
  FOR SELECT USING (public.is_business_member(auth.uid(), business_id));

-- ---- notifications ----
CREATE POLICY "Recipients view their notifications" ON public.notifications
  FOR SELECT USING (
    auth.uid() = user_id
    OR (business_id IS NOT NULL AND public.is_business_member(auth.uid(), business_id))
  );
CREATE POLICY "Recipients mark their notifications read" ON public.notifications
  FOR UPDATE USING (
    auth.uid() = user_id
    OR (business_id IS NOT NULL AND public.is_business_member(auth.uid(), business_id))
  );
CREATE POLICY "Recipients delete their notifications" ON public.notifications
  FOR DELETE USING (
    auth.uid() = user_id
    OR (business_id IS NOT NULL AND public.is_business_member(auth.uid(), business_id))
  );
-- No public/authenticated INSERT policy — rows only ever come from the
-- SECURITY DEFINER trigger above (or a future service-role process).

-- ============================================================
-- COLUMN-LEVEL LOCKDOWN (RLS is row-level only; these hide specific
-- columns from specific roles regardless of which rows are visible)
-- ============================================================

-- Stripe identifiers are billing-internal — no client code reads them and
-- they must never be readable via the public anon key or by an arbitrary
-- logged-in user browsing another business's public page. Only service_role
-- (used by a future Stripe webhook handler) keeps access.
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.businesses FROM anon, authenticated;

-- Customer phone numbers / order notes are never rendered on any public
-- surface (display screen, order-status page) — hide them from the anon
-- role at the grant level so they can't be scraped directly via the REST
-- API even though some order rows are otherwise publicly readable.
REVOKE SELECT (customer_phone, notes) ON public.orders FROM anon;

-- ============ Realtime ============
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ============ SEED PLANS ============
INSERT INTO public.subscription_plans (name, slug, price_monthly, price_yearly, features, max_orders_per_month, max_menu_items, max_qr_codes, has_analytics, has_whatsapp, has_custom_branding, display_order) VALUES
('Free Trial', 'free', 0, 0, '["Up to 50 orders/month","10 menu items","2 QR codes","Basic kitchen display","Email support"]'::jsonb, 50, 10, 2, false, false, false, 0),
('Starter', 'starter', 2999, 29990, '["500 orders/month","Unlimited menu items","10 QR codes","Full kitchen display","Public display screen","WhatsApp notifications","Basic analytics (7 days)","Remove QuickServe branding"]'::jsonb, 500, NULL, 10, true, true, false, 1),
('Pro', 'pro', 5999, 59990, '["Unlimited orders","Unlimited menu items","Unlimited QR codes","Advanced KDS with timer","Multiple display screens","WhatsApp + SMS","Advanced analytics (90 days)","Custom branding","3 staff accounts","Priority support"]'::jsonb, NULL, NULL, NULL, true, true, true, 2),
('Enterprise', 'enterprise', 0, 0, '["Everything in Pro","Multi-location management","API access","Custom integrations","Dedicated account manager","White-label options","SLA guarantee"]'::jsonb, NULL, NULL, NULL, true, true, true, 3);
