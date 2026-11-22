-- W313 — drop the staging-only identity hydration trigger (Sprint 2 brief item 2; Ledger §16.8).
--
-- ┌───────────────────────────────────────────────────────────────────────────────────────┐
-- │ HOLD: DO NOT APPLY TO STAGING BEFORE THE CUTOVER (W317).                                │
-- │ The versionCode 4 app on Play reads names and phones off the participant rows this     │
-- │ trigger fills. Dropping it empties the roster for every vc4 user. It goes to staging   │
-- │ only together with a build whose roster calls get_ride_roster, with the Senior PM's OK.│
-- │ Until then staging migrations are applied one file at a time, never by a bulk push.    │
-- └───────────────────────────────────────────────────────────────────────────────────────┘
--
-- The hold is enforced, not only written down: while the trigger exists, this file REFUSES
-- to run unless the session has said the cutover is on:
--     SET rail3.w317_cutover = 'yes';
-- A bulk `supabase db push` cannot set that, so on staging it stops here with an error and
-- applies nothing after this file (same refuse-to-run shape as 20261115000000_w308). On a
-- database without the trigger (local, CI, a fresh project) the check passes and the file is
-- a no-op.
--
-- rail3_hydrate_participant_identity() and its trigger rail3_hydrate_participant_identity_trg
-- on ride_participants were created by hand on staging (W308 recorded them as an exception).
-- They copy a member's name and phone from accounts onto the participant row so the old
-- roster embed had something to show. No migration creates them, so on a database built from
-- the migrations (local, CI, a fresh project) this file is a no-op.
--
-- Rows already hydrated keep their copied name and phone; this file does not clear them. The
-- per-ride phone copy is cleared by the retention job after ride end as before.
--
-- supabase-patterns: Pattern 5 (idempotency): IF EXISTS throughout. No policy, table or view.

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = 'public.ride_participants'::regclass
          AND NOT t.tgisinternal
          AND t.tgname IN ('rail3_hydrate_participant_identity_trg', 'rail3_hydrate_participant_identity')
     )
     AND COALESCE(current_setting('rail3.w317_cutover', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'W313 HOLD: the identity hydration trigger is still in use by the versionCode 4 app. This migration runs only at the W317 cutover (SET rail3.w317_cutover = ''yes'' in the same session).';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS rail3_hydrate_participant_identity_trg ON public.ride_participants;
DROP TRIGGER IF EXISTS rail3_hydrate_participant_identity ON public.ride_participants;
DROP FUNCTION IF EXISTS public.rail3_hydrate_participant_identity();
