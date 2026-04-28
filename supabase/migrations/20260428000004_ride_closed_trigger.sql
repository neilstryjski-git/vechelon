-- W132 (IA-S0-04) — ride_closed analytics event via Postgres trigger
--
-- Per W118 LOE outcome (Sr PM-approved 2026-04-28). Both ride-close paths
-- converge on UPDATE rides SET status='saved':
--   - Auto-close edge function: supabase/functions/auto-close-rides/index.ts
--   - Manual close from admin UI: admin/src/components/RideDetailSideSheet.tsx
--
-- Instrumenting both TypeScript sites would risk double-fire and require any
-- future close path to remember the instrumentation. A Postgres AFTER UPDATE
-- trigger catches both paths transparently with a single hook point.
--
-- The trigger runs as SECURITY DEFINER so the INSERT into analytics_events
-- bypasses RLS (CP-IA-01: events must fire reliably). user_id is NULL — ride
-- close is not user-attributed (auto-close has no actor; manual close does
-- but that's not the H4 signal we're capturing here).
--
-- guest_count is derived from `account_id IS NULL` because ride_participants
-- has no rider_type column; guests are participants without an account_id.
-- participant_count is the total row count for the ride.

CREATE OR REPLACE FUNCTION public.fire_ride_closed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant_count INT;
  v_guest_count       INT;
BEGIN
  -- Only fire on the actual close transition (created/active → saved).
  -- Repeated UPDATEs that don't change status away from 'saved' do nothing.
  IF (OLD.status IS DISTINCT FROM 'saved' AND NEW.status = 'saved') THEN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE account_id IS NULL)
    INTO v_participant_count, v_guest_count
    FROM public.ride_participants
    WHERE ride_id = NEW.id;

    INSERT INTO public.analytics_events (event_type, user_id, tenant_id, metadata)
    VALUES (
      'ride_closed',
      NULL,
      NEW.tenant_id,
      jsonb_build_object(
        'ride_id',           NEW.id,
        'participant_count', v_participant_count,
        'guest_count',       v_guest_count,
        'auto_closed',       COALESCE(NEW.auto_closed, false)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fire_ride_closed_event() IS
  'Fires the ride_closed analytics event when a rides row transitions to status=''saved''. Single hook point for both auto-close (cron edge function) and manual close (admin UI) paths per W118 LOE / VMT-D-41 (functionally equivalent — see W118 ledger entry). Aggregates participant_count + guest_count from ride_participants at fire time. SECURITY DEFINER bypasses analytics_events RLS (only service_role would otherwise INSERT under the cron context). user_id is NULL — close is not user-attributed.';

CREATE TRIGGER trg_ride_closed
AFTER UPDATE OF status ON public.rides
FOR EACH ROW
EXECUTE FUNCTION public.fire_ride_closed_event();

COMMENT ON TRIGGER trg_ride_closed ON public.rides IS
  'Fires ride_closed analytics_events row on status transition to saved. See VoC/MT/IA Pillar II §6.3 event catalog and §6.5 ia_h4_diversion_signal view which depends on this event.';
