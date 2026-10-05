-- A bill is automatically derived from an order. This table stores only an
-- owner's saved bill adjustments, keeping the original order and analytics
-- records immutable for auditability.
CREATE TABLE public.order_bill_edits (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  service_charge NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_bill_edits_business ON public.order_bill_edits(business_id);
ALTER TABLE public.order_bill_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members manage their bill edits" ON public.order_bill_edits
  FOR ALL USING (public.is_business_member(auth.uid(), business_id))
  WITH CHECK (public.is_business_member(auth.uid(), business_id));

CREATE TRIGGER trg_order_bill_edits_updated
  BEFORE UPDATE ON public.order_bill_edits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_bill_edits TO authenticated;
REVOKE ALL ON public.order_bill_edits FROM anon;
