-- ============================================================
-- CAP BUSINESSES PER OWNER
--
-- Found during the Aug 2026 audit. The businesses INSERT policy only
-- checked `auth.uid() = owner_id` — nothing capped how many a single
-- account could create, and every insert fires create_trial_subscription()
-- granting a fresh 14-day trial. One signup could therefore mint unlimited
-- trials, each with its own tables, menu and scan quota.
--
-- Two layers, same reasoning as the rest of the app's rate limiting:
--   * a hard ceiling on total businesses per owner (stops slow farming)
--   * a per-owner creation rate limit (stops a scripted burst)
--
-- 5 is deliberately generous — a real owner running several branches
-- stays under it, while trial farming becomes pointless. Raise it for a
-- legitimate chain via a direct UPDATE rather than by loosening this.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_business_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.businesses
  WHERE owner_id = NEW.owner_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'You have reached the maximum of 5 businesses per account. Contact support if you need more.';
  END IF;

  -- Burst guard. Keyed by owner rather than IP: the owner is the entity
  -- the trial is actually granted to, and unlike the guest-ordering paths
  -- this one always has an authenticated user to key on.
  IF NOT public.check_rate_limit('create_business:owner:' || NEW.owner_id::text, 3, 3600) THEN
    RAISE EXCEPTION 'Too many businesses created in a short time. Please wait an hour and try again.';
  END IF;

  RETURN NEW;
END;
$$;

-- No anon/authenticated EXECUTE grant — this is only ever reached as a
-- trigger, never called directly (same posture as the other trigger
-- functions, see 20260714010000_audit_hardening_and_cleanup.sql).
REVOKE EXECUTE ON FUNCTION public.check_business_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_check_business_limit ON public.businesses;
CREATE TRIGGER trg_check_business_limit
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.check_business_limit();
