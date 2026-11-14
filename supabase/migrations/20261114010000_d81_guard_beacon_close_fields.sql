-- D81 review r2: lock down the ride-end close marker, and stop a late re-assert reopening a
-- Beacon flag on a ride that has ended.
--
-- 1. beacon_cancel_reason is server-only. The amended SD-011 (Sr PM APPROVED 2026-11-14) relies
--    on it to tell a ride-end close apart from a person's cancel and from a system error. The
--    column inherited beacon_alerts' table-level INSERT/UPDATE grant to `authenticated`, and the
--    beacon_alerts insert/update policies only check rail3_is_affiliated(tenant_id), so any
--    affiliated member could write 'ride_ended' onto any club Beacon through the Data API. This
--    guard refuses that for API roles. The D81 triggers (SECURITY DEFINER, so current_user is
--    their owner) and migrations/service role pass through. Same shape as tg_guard_platform_admin.
--    The app never writes this column (its cancel path leaves it NULL), so nothing in the app
--    changes.
--    Trigger order: Postgres fires BEFORE triggers of one table in name order. This guard
--    (trg_rail3_beacon_reason_guard) runs BEFORE trg_rail3_close_late_beacon, so it only ever
--    sees what the caller sent, never the late-beacon trigger's own 'ride_ended'.
--
-- 2. ride_participants.beacon_active can't be true on an ended ride. The app re-asserts a
--    pending raise (useBeacons.ts) after reconnecting; if the ride ended in between, that write
--    would set the flag again after D81's ride-end trigger cleared it. It is coerced to false
--    instead of rejected, so a reconnecting phone never sees an error for it.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): no RLS policy created or changed. The flag guard reads rides from a
--     SECURITY DEFINER function (search_path pinned) and edits only its own NEW row; it writes no
--     table, so there is no trigger loop.
--   * Pattern 5 (idempotency): CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS before CREATE.
--   * Pattern 7 (grants): no new table or view. Trigger functions are not callable through the
--     API (EXECUTE revoked).
--
-- Scope: Rail 3 schema (rail3-integration + staging), off the prod push until promotion.

CREATE OR REPLACE FUNCTION public.rail3_guard_beacon_cancel_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NEW.beacon_cancel_reason IS NOT NULL THEN
      RAISE EXCEPTION 'permission_denied: beacon_cancel_reason is set by the server only'
        USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND NEW.beacon_cancel_reason IS DISTINCT FROM OLD.beacon_cancel_reason THEN
      RAISE EXCEPTION 'permission_denied: beacon_cancel_reason is set by the server only'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_guard_beacon_cancel_reason() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rail3_beacon_reason_guard ON public.beacon_alerts;
CREATE TRIGGER trg_rail3_beacon_reason_guard
  BEFORE INSERT OR UPDATE ON public.beacon_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.rail3_guard_beacon_cancel_reason();

CREATE OR REPLACE FUNCTION public.rail3_no_beacon_flag_after_ride_end()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.beacon_active AND EXISTS (
       SELECT 1 FROM public.rides r WHERE r.id = NEW.ride_id AND r.status = 'saved') THEN
    NEW.beacon_active := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_no_beacon_flag_after_ride_end() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rail3_no_beacon_flag_after_ride_end ON public.ride_participants;
CREATE TRIGGER trg_rail3_no_beacon_flag_after_ride_end
  BEFORE INSERT OR UPDATE OF beacon_active ON public.ride_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.rail3_no_beacon_flag_after_ride_end();
