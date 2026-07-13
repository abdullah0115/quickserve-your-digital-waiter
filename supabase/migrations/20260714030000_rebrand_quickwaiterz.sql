-- Rebrand: "QuickServe" -> "QuickWaiterz" everywhere, including seeded
-- data. The Pro plan's feature list mentions the brand name by name
-- ("Remove QuickServe branding") and is rendered straight from this
-- table on the pricing page, so the app-code rename alone wouldn't have
-- caught it.
UPDATE public.subscription_plans
SET features = (
  SELECT jsonb_agg(
    CASE WHEN elem = '"Remove QuickServe branding"'::jsonb
         THEN '"Remove QuickWaiterz branding"'::jsonb
         ELSE elem END
  )
  FROM jsonb_array_elements(features) AS elem
)
WHERE features @> '["Remove QuickServe branding"]'::jsonb;
