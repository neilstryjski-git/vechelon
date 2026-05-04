-- W143 / MT-H-05: tighten anon RLS on rides + ride_participants
--
-- Replaces direct anon PostgREST access with service-role Edge Functions:
--   guest-view-ride  — returns ride + tenant branding (replaces ride_unauth_public_select)
--   guest-rsvp       — creates participant row (replaces anon INSERT on ride_participants)
--
-- Both Edge Functions are deployed before this migration is applied.
-- The SPA (RideLanding.tsx + useAppStore.joinRide) already calls the Edge
-- Functions by the time this migration runs — atomic swap, no downtime.
--
-- ride_unauth_public_select: dropped entirely. Anon rides SELECT now goes
-- through guest-view-ride which uses service role + tenant scoping.
-- Pre-merge audit confirmed no remaining direct anon from('rides') SELECT
-- callers in admin/src — all other ride queries are in authenticated-only
-- components (CalendarGrid, RideDetailSideSheet, RideFormModal, etc.).
--
-- participant_insert_policy: restricted to TO authenticated. Authenticated
-- direct INSERT is safe — ride_tiered_select scopes which rides they see,
-- so the ride_id IN (SELECT id FROM rides) check is still tenant-scoped.
--
-- Idempotency (Pattern 5): defensive DROP POLICY IF EXISTS at top.

DROP POLICY IF EXISTS ride_unauth_public_select          ON public.rides;
DROP POLICY IF EXISTS participant_insert_policy          ON public.ride_participants;

CREATE POLICY participant_insert_policy ON public.ride_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    ride_id IN (SELECT id FROM public.rides)
  );
