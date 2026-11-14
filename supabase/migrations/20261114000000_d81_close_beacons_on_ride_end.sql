-- D81: a Support Beacon must not outlive its ride.
--
-- Finding (staging, 2026-11-14): 9 beacon_alerts rows were still open (beacon_cancelled_at
-- NULL) on rides that had already ended, the newest from 2026-08-30. Nothing closed a Beacon when
-- its ride ended: the app clears its own state on ride end (W287), but the audit row stayed open,
-- so any later reader (web Race Control, the next seed, reporting) saw an "active" SOS on a ride
-- that was over.
--
-- Fix: when a ride leaves 'active' (a Captain or admin ends it, or the D100 retention job
-- auto-closes it after 24 hours), close every open Beacon on that ride and clear the riders'
-- ride_participants.beacon_active flag (W282 current state).
--
-- Audit semantics (SD-011 amendment APPROVED by the Sr PM 2026-11-14, pending Brain ratification; see
-- productdocuments/rail3/pillar_v_amendment_sd011-beacon-ride-end-close_2026-11-14.md). SD-011 (Ledger, 2026-05-12) reserves beacon_cancelled_by NULL for SYSTEM
-- ERROR, because a bare NULL can't be told apart from a failed write. To keep that guarantee:
--   * a new column, beacon_cancel_reason, records WHY a Beacon was closed. A ride-end close
--     writes 'ride_ended'. A person's cancel from the app leaves it NULL (unchanged app path).
--   * beacon_cancelled_by is the user who ended the ride (auth.uid()) when there is one.
--   * when the system ended the ride (the 24-hour auto-close, no signed-in user),
--     beacon_cancelled_by stays NULL, but beacon_cancel_reason = 'ride_ended' and
--     beacon_cancelled_at are set, so the row is still distinguishable from a failed write.
--     NULL by + NULL reason keeps meaning "system error", exactly as SD-011 intends.
--
-- Backfill: open Beacons on rides that already ended are closed with reason 'ride_ended',
-- beacon_cancelled_by NULL (the ride ended before this rule existed, so there's no actor), and
-- beacon_cancelled_at = the ride's actual_end (or now() if that's missing).
--
-- Scope: Rail 3 schema. beacon_alerts exists only where the Rail 3 schema has been applied
-- (staging); this migration stays on rail3-integration and off the prod push until promotion.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): no RLS policy is created or changed. The trigger function is
--     SECURITY DEFINER with search_path pinned, so it closes Beacons for every rider regardless
--     of the ender's own row access, and it writes to beacon_alerts and ride_participants only.
--     Neither table has a trigger that writes back to rides, so there is no trigger loop. The
--     late-raise guard on beacon_alerts only reads rides and edits its own NEW row.
--     ride_participants_guard_role passes SECURITY DEFINER callers through, and the update
--     touches only beacon_active anyway.
--   * Pattern 5 (idempotency): ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--     DROP TRIGGER IF EXISTS before CREATE TRIGGER; the backfill only touches open rows.
--   * Pattern 7 (grants): no new table or view. The new column inherits the table's existing
--     grants; the trigger function is not callable through the API (EXECUTE revoked).

ALTER TABLE public.beacon_alerts
  ADD COLUMN IF NOT EXISTS beacon_cancel_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'beacon_alerts_cancel_reason_check'
       AND conrelid = 'public.beacon_alerts'::regclass
  ) THEN
    ALTER TABLE public.beacon_alerts
      ADD CONSTRAINT beacon_alerts_cancel_reason_check
      CHECK (beacon_cancel_reason IS NULL OR beacon_cancel_reason IN ('ride_ended'));
  END IF;
END $$;

COMMENT ON COLUMN public.beacon_alerts.beacon_cancel_reason IS
  'D81: why the Beacon was closed. NULL = cancelled by a person from the app (beacon_cancelled_by '
  'holds them, per SD-011). ''ride_ended'' = closed automatically when its ride ended; '
  'beacon_cancelled_by is the user who ended the ride, or NULL when the system auto-closed it. '
  'beacon_cancelled_by NULL with this column NULL still means system error (SD-011).';

CREATE OR REPLACE FUNCTION public.rail3_close_beacons_on_ride_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Actor = the ender's account, resolved through accounts so an auth user without an
  -- accounts row (FK) can never block ending a ride. NULL when the system ended it.
  UPDATE public.beacon_alerts
     SET beacon_cancelled_at  = now(),
         beacon_cancelled_by  = (SELECT a.id FROM public.accounts a WHERE a.id = auth.uid()),
         beacon_cancel_reason = 'ride_ended'
   WHERE ride_id = NEW.id
     AND beacon_cancelled_at IS NULL;

  UPDATE public.ride_participants
     SET beacon_active = false
   WHERE ride_id = NEW.id
     AND beacon_active;

  RETURN NULL; -- AFTER trigger: return value ignored
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_close_beacons_on_ride_end() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rail3_close_beacons_on_ride_end ON public.rides;
CREATE TRIGGER trg_rail3_close_beacons_on_ride_end
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status IS DISTINCT FROM 'active')
  EXECUTE FUNCTION public.rail3_close_beacons_on_ride_end();

-- Late raise: a Beacon inserted after its ride already ended (a delayed write from a device
-- that was out of signal) would otherwise be a new orphan. It is still recorded (the audit row
-- matters, and the alert broadcast has already gone out first), but it arrives closed.
CREATE OR REPLACE FUNCTION public.rail3_close_late_beacon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.beacon_cancelled_at IS NULL AND EXISTS (
       SELECT 1 FROM public.rides r WHERE r.id = NEW.ride_id AND r.status = 'saved') THEN
    NEW.beacon_cancelled_at  := now();
    NEW.beacon_cancel_reason := 'ride_ended';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_close_late_beacon() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rail3_close_late_beacon ON public.beacon_alerts;
CREATE TRIGGER trg_rail3_close_late_beacon
  BEFORE INSERT ON public.beacon_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.rail3_close_late_beacon();

-- Backfill: Beacons already orphaned on ended rides (9 on staging at 2026-11-14).
UPDATE public.beacon_alerts b
   SET beacon_cancelled_at  = COALESCE(r.actual_end, now()),
       beacon_cancel_reason = 'ride_ended'
  FROM public.rides r
 WHERE r.id = b.ride_id
   AND r.status = 'saved'   -- same semantics as the trigger: rides that ended
   AND b.beacon_cancelled_at IS NULL;

UPDATE public.ride_participants rp
   SET beacon_active = false
  FROM public.rides r
 WHERE r.id = rp.ride_id
   AND r.status = 'saved'
   AND rp.beacon_active;
