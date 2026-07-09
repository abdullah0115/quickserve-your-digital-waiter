-- table_number was previously trusted verbatim from whatever the client
-- sent (Menu.tsx read it straight from a ?table= URL query param), so
-- anyone could place an order "for" any table just by editing the link —
-- no proof they'd actually scanned that table's QR code. Combined with the
-- one-active-order-per-table lock (see 20260710010000), a remote attacker
-- could've walked through every table number and locked the whole dine-in
-- flow. Fix: table_number can now only ever be set by resolving a real,
-- active qr_codes row for this business — never taken directly from the
-- client — enforced here at the DB layer as the authoritative check (the
-- create-order function also resolves it, mainly for a friendlier error).
ALTER TABLE public.orders ADD COLUMN qr_code_id UUID REFERENCES public.qr_codes(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.resolve_order_table()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_table TEXT;
BEGIN
  IF NEW.qr_code_id IS NOT NULL THEN
    SELECT table_number INTO v_table
    FROM public.qr_codes
    WHERE id = NEW.qr_code_id AND business_id = NEW.business_id AND is_active = true;

    IF v_table IS NULL THEN
      RAISE EXCEPTION 'Invalid or inactive QR code for this business';
    END IF;

    NEW.table_number := v_table;
  ELSE
    -- No verified QR presented (e.g. takeaway, or a walk-up order with no
    -- table) — never trust a client-supplied table_number string.
    NEW.table_number := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_resolve_order_table
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.resolve_order_table();

-- get_order_status needs to also hand back qr_code_id so "Order Again" can
-- rebuild a verified ?qr=<id> link instead of falling back to a trusted
-- table_number string. RETURNS TABLE column list is changing, so the old
-- signature has to be dropped first (CREATE OR REPLACE can't do this).
DROP FUNCTION IF EXISTS public.get_order_status(TEXT, UUID, INTEGER, TEXT);

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
  qr_code_id UUID,
  order_type public.order_type,
  created_at TIMESTAMPTZ,
  business_id UUID
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.token_number, o.status, o.customer_name, o.items, o.total_amount,
         o.table_number, o.qr_code_id, o.order_type, o.created_at, o.business_id
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
