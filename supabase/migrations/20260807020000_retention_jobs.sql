-- ============================================================
-- RETENTION FOR THE TWO UNBOUNDED TABLES
--
-- Found during the Aug 2026 audit. Two tables grow forever:
--
--   rate_limit_hits — every order and every added item writes a row.
--     check_rate_limit() prunes expired rows, but only inside the bucket
--     it was called for, so buckets that go cold (a finished order's
--     bucket, a one-time visitor's IP) are never touched again. This sits
--     on the write path of every single order, so its bloat slows down
--     ordering itself rather than some background feature.
--
--   notifications — one row per order, never deleted. The bell only ever
--     reads the newest 50, so anything months old is pure storage cost.
--
-- Neither is close to hurting yet (18 and 52 rows at time of writing).
-- This exists so that stays true without anyone remembering to check —
-- and on the free tier's 500 MB ceiling, notifications is the single
-- biggest long-term consumer after order_items.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_expired_rows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The longest window any caller uses is 3600s (create_business:owner),
  -- so a day of slack is far more than enough to never delete a row that
  -- is still counting toward a live limit.
  DELETE FROM public.rate_limit_hits
  WHERE created_at < now() - interval '1 day';

  -- 90 days keeps a useful history for anyone scrolling back, well past
  -- the 50 the bell actually renders.
  DELETE FROM public.notifications
  WHERE created_at < now() - interval '90 days';
END;
$$;

-- Called only by cron (which runs as the table owner) or manually by an
-- operator via the SQL editor — never by the app, so no client grant.
REVOKE EXECUTE ON FUNCTION public.purge_expired_rows() FROM PUBLIC, anon, authenticated;

-- Daily at 03:15 UTC (~08:15 PKT) — after the overnight lull, nowhere
-- near a dinner rush. cron.schedule() upserts on job name, so re-running
-- this migration replaces the job rather than stacking duplicates.
SELECT cron.schedule(
  'purge-expired-rows',
  '15 3 * * *',
  $cron$SELECT public.purge_expired_rows();$cron$
);
