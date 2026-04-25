-- Allow Club Admins (and the ride's Captain/Support) to remove participants from a ride.
-- Without this policy, DELETE on ride_participants is denied by default RLS.
-- Tenant scoping is inherited via `ride_id IN (SELECT id FROM rides)`, which is gated
-- by the existing rides SELECT policy.

CREATE POLICY participant_delete_policy ON ride_participants
    FOR DELETE USING (
        is_captain_or_support(ride_id)
        OR
        (get_my_role() = 'admin' AND ride_id IN (SELECT id FROM rides))
    );
