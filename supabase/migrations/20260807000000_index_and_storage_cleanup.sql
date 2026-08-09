-- ============================================================
-- INDEX COVERAGE + DEAD WEIGHT CLEANUP
--
-- Found during the Aug 2026 audit. Three separate things, all cheap:
--
-- 1. qr_codes had NO index on business_id at all — only its primary key.
--    Both the dashboard's "list this cafe's tables" query and the
--    qr_codes JOIN orders inside get_active_order_for_table() were
--    therefore sequential scans. Harmless at 13 rows, not at 13,000.
--
-- 2. orders had business_id and created_at indexed separately but never
--    together, which is the exact shape every Analytics range query
--    uses (WHERE business_id = ? AND created_at BETWEEN ? AND ?).
--
-- 3. Three duplicate indexes and one stale backup table were costing
--    write throughput and database size for nothing. On the free tier's
--    500 MB ceiling that space is worth reclaiming.
-- ============================================================

-- ---- 1. Missing coverage ----

-- Leading business_id also serves the plain "all QR codes for this cafe"
-- lookup, so this one index covers both access patterns.
CREATE INDEX IF NOT EXISTS idx_qr_codes_business_table
  ON public.qr_codes (business_id, table_number);

CREATE INDEX IF NOT EXISTS idx_orders_business_created
  ON public.orders (business_id, created_at DESC);

-- ---- 2. Now-redundant: fully covered by the composite above ----
-- (business_id is the leading column, so business_id-only filters still
-- use the composite — this is not a loss of coverage.)
DROP INDEX IF EXISTS public.idx_orders_business;

-- ---- 3. Exact duplicates of the UNIQUE-constraint indexes ----
-- Each of these pairs an identical btree with a constraint-backed index
-- Postgres already maintains. Dropping the plain copy, keeping the
-- constraint (which cannot be dropped without dropping the constraint).
DROP INDEX IF EXISTS public.idx_businesses_slug;         -- dup of businesses_slug_key
DROP INDEX IF EXISTS public.idx_subscriptions_business;  -- dup of subscriptions_business_id_key
DROP INDEX IF EXISTS public.idx_analytics_business_date; -- dup of business_analytics_business_id_date_key

-- ---- 4. Stale migration safety net ----
-- Created by 20260713000000_order_items_table.sql, which said to drop it
-- manually once order_items had been correct in production for a week or
-- two. That was three weeks ago and order_items has been serving every
-- order since.
DROP TABLE IF EXISTS public._backup_orders_items_20260713;
