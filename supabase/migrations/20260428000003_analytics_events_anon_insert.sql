-- W131 fix-up — extend analytics_events INSERT to anon role
--
-- Caught in PR #11 (W131) review by stride:task-reviewer:
-- The W120 migration's INSERT policy was scoped TO authenticated, but the
-- portal supports unauthenticated guests on /portal/ride/:rideId. Guest
-- portal_visit and portal_rsvp events were therefore silently dropped by
-- RLS, breaking H2 (Broadcast-to-Portal Pull) and H5 (Organic Reach) for
-- the majority of the funnel.
--
-- This migration adds a sibling policy for anon. SELECT remains
-- service-role only — opening INSERT to anon does NOT weaken read
-- protection (CP-IA-02 still holds).

CREATE POLICY "analytics_events_insert_anon"
  ON public.analytics_events
  FOR INSERT
  TO anon
  WITH CHECK (true);

COMMENT ON POLICY "analytics_events_insert_anon" ON public.analytics_events IS
  'Permits unauthenticated (anon) clients to INSERT analytics events. Required for guest portal_visit and portal_rsvp on /portal/ride/:rideId — without this, ~all guest funnel events are silently dropped by RLS, breaking H2 and H5. SELECT remains service-role-only via the absence of any SELECT policy on this table (W120). See VoC/MT/IA Pillar II §6.1 + §6.3.';
