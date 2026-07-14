-- D80 — record WHO STARTED the ride, so the breadcrumb leader is a FACT, not an inference.
--
-- THE RULE (always was the rule; the code merely inferred it): the ride captain whose route
-- the breadcrumb draws is THE ONE WHO STARTS THE RIDE.
--
-- What went wrong: nothing recorded that. Both breadcrumb hooks re-derived the leader at
-- render time by scanning the roster for the first row with role = 'captain'
-- (mobile/src/hooks/useBreadcrumb.ts:52). But ride_participants.role is a CLUB-level
-- designation stamped onto EVERY ride's roster — not a per-ride leader. A club captain who
-- has never opened the app therefore sits in the roster of every ride they RSVP to and can
-- win the election. In staging, account 8be41c20 ('Sven') is role='captain' on 25 rides with
-- ZERO pings ever recorded, and on 2026-07-13 mobile crowned him leader of a ride he was not
-- on while the real, moving captain rode it.
--
-- Worse, the scan ran over an UNORDERED object (Object.keys of a roster built from a SELECT
-- with no ORDER BY), so the election was non-deterministic ACROSS SURFACES: on the same ride,
-- the same roster and the same code, web elected the real captain while mobile elected Sven.
--
-- The fix is to stop inferring. `started_by` is written once, at the moment the ride starts,
-- by the account that starts it — and every consumer reads that one fact.
--
-- ADDITIVE AND NULLABLE by design: existing software never reads this column, and a NULL is
-- a legal, well-defined state (consumers fall back to created_by). Nothing that works today
-- changes behaviour. Per the Rail 3 convention this migration is held off the prod
-- `db push --linked` pipeline until promotion.

-- Idempotent (Pattern 5): safe to re-run, and safe on a fresh deploy.
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS started_by uuid REFERENCES public.accounts(id);

COMMENT ON COLUMN public.rides.started_by IS
  'The account that STARTED this ride (pressed start / created it ad-hoc). This is the ride '
  'leader whose route the Rail 3 breadcrumb draws (D80). Distinct from created_by, which is '
  'whoever AUTHORED the ride — for a scheduled ride that is often a club admin who will not '
  'be leading it. NULL for rides that were never started; consumers fall back to created_by.';

-- Backfill: for every ride that has actually STARTED, the starter was the creator. That is
-- true by construction today — the only code path that sets status='active' + actual_start is
-- the ad-hoc creator (mobile/src/lib/rideControlsLogic.ts adHocRideRow), which writes
-- created_by = the starting account and then self-RSVPs that same account as captain. So this
-- backfill is exact for the existing corpus, not a guess.
--
-- Rides that never started keep started_by = NULL, which is the honest answer: nobody started
-- them, so they have no leader.
UPDATE public.rides
   SET started_by = created_by
 WHERE started_by IS NULL
   AND actual_start IS NOT NULL;

-- The breadcrumb leader lookup is keyed by ride, not by starter, so no index is needed for
-- the hot read (it rides along on the existing rides PK lookup in useRideDetails). This index
-- exists only for the reverse question — "which rides did this account start?" — which the
-- operator/roster surfaces will want. Cheap and additive.
CREATE INDEX IF NOT EXISTS idx_rides_started_by ON public.rides (started_by);

-- ---------------------------------------------------------------------------------------------
-- Make the rule impossible to FORGET.
--
-- The client sets started_by on the one ride-start path that exists today (the ad-hoc creator).
-- But there is no scheduled-ride start path YET, and when someone builds one, nothing in the
-- schema forces them to populate started_by. If they forget, the breadcrumb falls back to
-- created_by — the AUTHORING ADMIN, who for a scheduled ride is typically not on the ride at
-- all. No device would match the writer gate (nobody writes the trail) and every broadcast
-- would fail the reader's leader test (nothing draws). That is D80 again, verbatim, sourced
-- from a different column.
--
-- We just spent a night on a rule that lived only in developers' heads. Encode it where it
-- cannot be skipped: whoever flips a ride to 'active' IS its starter, recorded at that instant.
--
-- Only ever FILLS A BLANK (started_by IS NULL) — it never overwrites a starter the client
-- already set correctly, so the ad-hoc path stays authoritative and this is a safety net, not a
-- competing writer. Fires only on the transition INTO 'active', so it is inert for every
-- existing non-Rail-3 flow (RideBuilder create, clone, end-ride, edits).
CREATE OR REPLACE FUNCTION public.set_ride_started_by()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- auth.uid() is NULL for service-role/SQL-console writes; leave started_by NULL rather than
  -- inventing a starter. A NULL leader fails CLOSED on both client gates (no write, no draw),
  -- which is the correct outcome for a ride nobody demonstrably started.
  IF NEW.started_by IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.started_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_ride_started_by ON public.rides;

CREATE TRIGGER trg_set_ride_started_by
  BEFORE INSERT OR UPDATE OF status ON public.rides
  FOR EACH ROW
  WHEN (NEW.status = 'active' AND NEW.started_by IS NULL)
  EXECUTE FUNCTION public.set_ride_started_by();
