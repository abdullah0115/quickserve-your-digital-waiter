-- ============================================================
-- SERVER-SIDE ANALYTICS AGGREGATION
--
-- The Analytics tab used to fetch every order plus every order_item in
-- the selected range and sum them in JavaScript. For a restaurant doing
-- 300 orders/day that is ~9,000 orders and ~27,000 item rows shipped to
-- the browser on every range change — the single biggest consumer of
-- this project's Supabase egress, and enough to trip the 8s
-- statement_timeout on `authenticated` for the largest (most valuable)
-- customers.
--
-- This does the same arithmetic in Postgres and returns one small JSON
-- object instead.
--
-- Two deliberate choices:
--
--   * Hour-of-day is returned as a raw {hour: count} map rather than
--     pre-bucketed. HOUR_BUCKETS in Dashboard.tsx stays the single source
--     of truth for what counts as "Lunch" — this function shouldn't own a
--     second copy of that definition.
--
--   * Timezone is a parameter, not hardcoded UTC. Grouping by UTC day
--     would put a 2am PKT order on the previous day and shift every peak
--     hour by five hours. The client passes its own IANA zone.
--
-- BEHAVIOUR CHANGE: cancelled orders are now excluded from totals and
-- revenue. The old client-side code counted them (the today-only path
-- already excluded them, so the two disagreed). Reported revenue may
-- therefore read slightly lower than before — that is the bug being
-- fixed, not a regression.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_business_analytics(
  p_business_id UUID,
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ,
  p_timezone TEXT DEFAULT 'Asia/Karachi'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_prev_since TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_business_member(auth.uid(), p_business_id) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  IF p_until <= p_since THEN
    RAISE EXCEPTION 'Invalid range';
  END IF;

  -- Same length of time immediately before the selected range.
  v_prev_since := p_since - (p_until - p_since);

  WITH scoped AS (
    SELECT o.id, o.created_at, o.total_amount
    FROM public.orders o
    WHERE o.business_id = p_business_id
      AND o.created_at >= p_since
      AND o.created_at <= p_until
      AND o.status <> 'cancelled'
  ),
  days AS (
    SELECT generate_series(
      date_trunc('day', p_since AT TIME ZONE p_timezone),
      date_trunc('day', p_until AT TIME ZONE p_timezone),
      interval '1 day'
    )::date AS d
  ),
  daily AS (
    SELECT days.d AS d,
           COUNT(s.id) AS orders,
           COALESCE(SUM(s.total_amount), 0) AS revenue
    FROM days
    LEFT JOIN scoped s
      ON (s.created_at AT TIME ZONE p_timezone)::date = days.d
    GROUP BY days.d
  ),
  line_items AS (
    SELECT oi.name AS name,
           SUM(oi.quantity) AS cnt,
           SUM(oi.price * oi.quantity) AS revenue
    FROM public.order_items oi
    JOIN scoped s ON s.id = oi.order_id
    GROUP BY oi.name
  ),
  cats AS (
    SELECT COALESCE(mc.name, 'Uncategorized') AS name,
           SUM(oi.price * oi.quantity) AS revenue
    FROM public.order_items oi
    JOIN scoped s ON s.id = oi.order_id
    LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN public.menu_categories mc ON mc.id = mi.category_id
    GROUP BY COALESCE(mc.name, 'Uncategorized')
  ),
  hours AS (
    SELECT EXTRACT(hour FROM (s.created_at AT TIME ZONE p_timezone))::int AS h,
           COUNT(*) AS cnt
    FROM scoped s
    GROUP BY 1
  ),
  prev AS (
    SELECT COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue
    FROM public.orders o
    WHERE o.business_id = p_business_id
      AND o.created_at >= v_prev_since
      AND o.created_at < p_since
      AND o.status <> 'cancelled'
  )
  SELECT jsonb_build_object(
    'daily', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('date', d, 'orders', orders, 'revenue', revenue) ORDER BY d
      ), '[]'::jsonb) FROM daily
    ),
    'top_items', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('name', name, 'count', cnt, 'revenue', revenue) ORDER BY revenue DESC
      ), '[]'::jsonb)
      FROM (SELECT name, cnt, revenue FROM line_items ORDER BY revenue DESC LIMIT 5) top5
    ),
    'categories', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('name', name, 'revenue', revenue) ORDER BY revenue DESC
      ), '[]'::jsonb) FROM cats
    ),
    'hours', (
      SELECT COALESCE(jsonb_object_agg(h::text, cnt), '{}'::jsonb) FROM hours
    ),
    'totals', jsonb_build_object(
      'orders',  (SELECT COUNT(*) FROM scoped),
      'revenue', (SELECT COALESCE(SUM(total_amount), 0) FROM scoped)
    ),
    'previous', (SELECT jsonb_build_object('orders', orders, 'revenue', revenue) FROM prev)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Owner/staff only — the membership check above is the real gate, but
-- there is no reason for anon to hold the grant at all.
REVOKE EXECUTE ON FUNCTION public.get_business_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_analytics(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;
