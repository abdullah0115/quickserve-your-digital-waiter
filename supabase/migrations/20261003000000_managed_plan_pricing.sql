-- Self-Serve remains active in plan_configs so existing subscribers can
-- continue resolving its limits; the public pricing page no longer lists it.
UPDATE public.plan_configs
SET monthly_price = 14999,
    setup_fee = 4999,
    features = '["Unlimited tables & orders","Unlimited AI menu scans","Full Kitchen Display Screen","Full analytics — peak hours, top items, reports","No QuickWaiterz branding","On-site QR printing, lamination & table installation","On-site staff training","Priority WhatsApp + email support"]'::jsonb
WHERE plan_type = 'managed_pkr';
