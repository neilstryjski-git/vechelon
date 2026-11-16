-- W308 (Sprint 2 item 2): capture the club-admin branch on participant_update_policy.
--
-- Source: D70 (branch d70-participant-update-rls, migration 20260704120000, never
-- merged). It was applied to staging by hand, so staging carried a third USING
-- branch that no trunk migration created. This migration puts it on the trunk so
-- staging and a database built from migrations agree.
--
-- What the branch does: a club admin may update a participant row on a ride of
-- their own club. Without it a club admin who is not Captain or SAG on the ride
-- matches zero rows, and supabase-js reports a zero-row UPDATE as success (D70).
-- It mirrors participant_insert_policy, which already admits club admins.
--
-- The policy still has no WITH CHECK. Role changes and moves between rides or
-- accounts are limited by the ride_participants_guard_role trigger (D96 step B,
-- 20261106000100). That trigger must stay in place.
--
-- ALTER POLICY, not DROP + CREATE: the change is a single atomic catalog update,
-- so a live database never has a moment with no UPDATE policy. The policy has
-- existed since 20260410000001 on every database, and the statement gives the same
-- result however many times it runs (Pattern 5).
--
-- supabase-patterns:
--   Pattern 1 (recursion): the USING clause never reads ride_participants.
--     is_captain_or_support() and is_tenant_admin() are SECURITY DEFINER with
--     search_path set (20260504170234), so their inner reads bypass RLS. The rides
--     subquery runs under the rides policies, which use SECURITY DEFINER helpers
--     only (can_view_calendar, is_tenant_admin, is_platform_admin,
--     is_rail3_ride_captain) and do not read ride_participants under RLS.
--   Patterns 2, 7: not applicable (no view, no new object).

ALTER POLICY participant_update_policy ON public.ride_participants
  USING (
    account_id = auth.uid()
    OR is_captain_or_support(ride_id)
    OR is_tenant_admin((SELECT tenant_id FROM public.rides WHERE id = ride_participants.ride_id))
  );
