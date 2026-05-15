-- ============ ENUMS (SAFE VERSION) ============
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
END $$;
-- ============ USER ROLES (separate table for security) ============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_id UUID,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

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
CREATE POLICY "Plans are publicly viewable" ON public.subscription_plans FOR SELECT USING (true);

-- ============ BUSINESSES ============
CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
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
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active businesses are publicly viewable" ON public.businesses
  FOR SELECT USING (is_active = true OR auth.uid() = owner_id);
CREATE POLICY "Owners can insert businesses" ON public.businesses
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update their business" ON public.businesses
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete their business" ON public.businesses
  FOR DELETE USING (auth.uid() = owner_id);

-- ============ MENU CATEGORIES ============
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_urdu TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_categories_business ON public.menu_categories(business_id);
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly viewable" ON public.menu_categories FOR SELECT USING (true);
CREATE POLICY "Owners manage their categories" ON public.menu_categories
  FOR ALL USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

-- ============ MENU ITEMS ============
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  name_urdu TEXT,
  description TEXT,
  description_urdu TEXT,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  preparation_time INTEGER NOT NULL DEFAULT 15,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_business ON public.menu_items(business_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Menu items are publicly viewable" ON public.menu_items FOR SELECT USING (true);
CREATE POLICY "Owners manage their items" ON public.menu_items
  FOR ALL USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

-- ============ ORDERS ============
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  token_number INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
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

CREATE POLICY "Orders are publicly viewable" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Owners update their orders" ON public.orders
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));
CREATE POLICY "Owners delete their orders" ON public.orders
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

-- Auto-increment daily token per business
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

-- ============ QR CODES ============
CREATE TABLE IF NOT EXISTS public.qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  scan_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "QR codes publicly viewable" ON public.qr_codes FOR SELECT USING (true);
CREATE POLICY "Owners manage QR codes" ON public.qr_codes
  FOR ALL USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

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
CREATE POLICY "Owners view their analytics" ON public.business_analytics
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid()));

-- ============ updated_at TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

-- Enable realtime for orders
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- ============ SEED PLANS ============
INSERT INTO public.subscription_plans (name, slug, price_monthly, price_yearly, features, max_orders_per_month, max_menu_items, max_qr_codes, has_analytics, has_whatsapp, has_custom_branding, display_order) VALUES
('Free Trial', 'free', 0, 0, '["Up to 50 orders/month","10 menu items","2 QR codes","Basic kitchen display","Email support"]'::jsonb, 50, 10, 2, false, false, false, 0),
('Starter', 'starter', 2999, 29990, '["500 orders/month","Unlimited menu items","10 QR codes","Full kitchen display","Public display screen","WhatsApp notifications","Basic analytics (7 days)","Remove QuickServe branding"]'::jsonb, 500, NULL, 10, true, true, false, 1),
('Pro', 'pro', 5999, 59990, '["Unlimited orders","Unlimited menu items","Unlimited QR codes","Advanced KDS with timer","Multiple display screens","WhatsApp + SMS","Advanced analytics (90 days)","Custom branding","3 staff accounts","Priority support"]'::jsonb, NULL, NULL, NULL, true, true, true, 2),
('Enterprise', 'enterprise', 0, 0, '["Everything in Pro","Multi-location management","API access","Custom integrations","Dedicated account manager","White-label options","SLA guarantee"]'::jsonb, NULL, NULL, NULL, true, true, true, 3);