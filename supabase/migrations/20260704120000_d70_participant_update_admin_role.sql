-- D70: tenant admins cannot change a participant's role via the admin UI.
--
-- Root cause: participant_update_policy's USING clause allowed only the
-- participant themselves (account_id = auth.uid()) or a captain/support on the
-- ride (is_captain_or_support). A tenant admin is neither, so RideBuilder's role
-- change UPDATE matched ZERO rows. supabase-js returns NO error on a 0-row
-- UPDATE, so the mutation's onSuccess fired and the UI falsely reported success
-- while nothing changed. Compounding chicken-and-egg: a fresh ride has no
-- captain, so is_captain_or_support is false for everyone and nobody could be
-- promoted at all.
--
-- The sibling participant_insert_policy already permits admins via is_tenant_admin
-- (that's why ADDING crew with a role works but CHANGING a role did not) — this
-- mirrors that onto UPDATE.
--
-- supabase-patterns:
--   Pattern 1 (recursion): is_tenant_admin() is SECURITY DEFINER (bypasses RLS);
--     the rides subquery does not reference ride_participants, so no recursion.
--   Pattern 5 (idempotency): DROP POLICY IF EXISTS before CREATE so fresh deploys
--     and db reset replay cleanly.

DROP POLICY IF EXISTS participant_update_policy ON public.ride_participants;

CREATE POLICY participant_update_policy ON public.ride_participants
  FOR UPDATE
  USING (
    account_id = auth.uid()
    OR is_captain_or_support(ride_id)
    OR is_tenant_admin((SELECT tenant_id FROM public.rides WHERE id = ride_participants.ride_id))
  );
