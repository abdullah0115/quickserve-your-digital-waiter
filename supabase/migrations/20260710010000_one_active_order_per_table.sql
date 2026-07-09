-- Only one active (pending/preparing/ready) order per table at a time —
-- prevents two customers/devices from placing overlapping orders for the
-- same table (e.g. two people at the same table submitting at once).
-- Enforced as a partial unique index rather than a check-then-insert
-- trigger so it's atomic even under truly concurrent inserts — the second
-- of two simultaneous submissions gets a unique_violation instead of both
-- silently succeeding. The table frees up automatically once the order
-- moves to completed/cancelled, since the index only covers active
-- statuses. Takeaway orders (table_number IS NULL) are unaffected.
CREATE UNIQUE INDEX idx_orders_one_active_per_table
  ON public.orders (business_id, table_number)
  WHERE table_number IS NOT NULL AND status IN ('pending', 'preparing', 'ready');
