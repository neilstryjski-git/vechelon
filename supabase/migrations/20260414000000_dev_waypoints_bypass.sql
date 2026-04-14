-- DEV BYPASS: Allow anonymous write access to waypoints for prototype
-- The existing waypoints_modify_policy requires auth.uid() which is NULL
-- in unauthenticated dev sessions, causing all INSERT/UPDATE/DELETE to fail.
-- Mirrors the is_tenant_admin anonymous bypass pattern from migration 20260413000003.

DROP POLICY IF EXISTS waypoints_modify_policy ON waypoints;

CREATE POLICY waypoints_modify_policy ON waypoints
    FOR ALL USING (
        auth.uid() IS NULL -- DEV BYPASS: Allow anonymous for prototype
        OR
        ride_id IN (
            SELECT id FROM rides
            WHERE created_by = auth.uid()
               OR get_my_role() = 'admin'
        )
    )
    WITH CHECK (
        auth.uid() IS NULL -- DEV BYPASS
        OR
        ride_id IN (
            SELECT id FROM rides
            WHERE created_by = auth.uid()
               OR get_my_role() = 'admin'
        )
    );
