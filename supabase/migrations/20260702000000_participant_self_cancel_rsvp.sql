-- Allow a rider to cancel their OWN RSVP by deleting their own ride_participants row.
-- This mirrors the self-RSVP branch of participant_insert_policy (account_id = auth.uid(),
-- see 20260509000000_tighten_participant_insert_admin_gate.sql): a rider who can create
-- their own RSVP row can now also remove it. Previously DELETE was limited to the ride's
-- Captain/Support or a Club Admin, so a rider had no way to withdraw their own RSVP.
--
-- Pattern 1 (self-referencing RLS): the added `account_id = auth.uid()` branch is a
-- same-row column comparison — it does NOT sub-select ride_participants, so there is no
-- recursion path. The existing branches keep using the SECURITY DEFINER helpers
-- (is_captain_or_support, get_my_role).
-- Pattern 5 (idempotency): DROP IF EXISTS before CREATE so a fresh deploy that replays the
-- original policy (20260425000001) followed by this migration does not collide.

DROP POLICY IF EXISTS participant_delete_policy ON ride_participants;

CREATE POLICY participant_delete_policy ON ride_participants
    FOR DELETE USING (
        -- Rider cancels their own RSVP
        account_id = auth.uid()
        OR
        -- Ride's Captain/Support removes anyone on that ride
        is_captain_or_support(ride_id)
        OR
        -- Club Admin removes anyone (tenant-scoped via the rides SELECT policy)
        (get_my_role() = 'admin' AND ride_id IN (SELECT id FROM rides))
    );
