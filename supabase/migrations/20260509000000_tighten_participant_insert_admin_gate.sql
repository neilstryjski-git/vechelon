-- W155: Tighten participant_insert_policy to distinguish self-RSVP from admin-add.
--
-- Before: any authenticated user could INSERT any account_id (too permissive).
-- After:
--   Branch 1 — self-RSVP: account_id = auth.uid() → any authenticated user OK
--   Branch 2 — admin-add: account_id != auth.uid() → inserter must be admin
--              of the ride's tenant (via is_tenant_admin SECURITY DEFINER helper)
--
-- Service-role inserts (guest RSVP edge function, W143) bypass RLS entirely —
-- no change required for that path.
--
-- Pattern 5 (idempotency): DROP IF EXISTS before CREATE so fresh replays are safe.
-- Pattern 1 safety: no self-referencing ride_participants in the policy clause.
-- The rides subquery is the same pattern already used in participant_delete_policy.

DROP POLICY IF EXISTS participant_insert_policy ON public.ride_participants;

CREATE POLICY participant_insert_policy ON public.ride_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Self-RSVP: member adds themselves
    account_id = auth.uid()
    OR
    -- Admin-add: inserter is an admin of the ride's tenant
    (
      account_id IS DISTINCT FROM auth.uid()
      AND is_tenant_admin(
        (SELECT tenant_id FROM public.rides WHERE id = ride_id)
      )
    )
  );

COMMENT ON POLICY participant_insert_policy ON public.ride_participants IS
  'W155: Two-branch insert gate. Branch 1: self-RSVP (account_id = auth.uid()) allowed for any authenticated user. Branch 2: admin-add (account_id != auth.uid()) allowed only when the inserting user holds admin role in account_tenants for the ride tenant. Service-role bypasses RLS (guest RSVP edge function unaffected). See is_tenant_admin() SECURITY DEFINER helper.';
