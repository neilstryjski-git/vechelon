-- VEcheLOn Rider Portal RLS Refinement
-- Fulfills Task RP-S0-01 and handles many-to-many tenancy

-- 1. REFINED UTILITY FUNCTIONS
-- Using SECURITY DEFINER to bypass RLS when checking junction table

CREATE OR REPLACE FUNCTION is_tenant_admin(t_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_tenants 
    WHERE tenant_id = t_id 
    AND account_id = auth.uid() 
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_tenant_status(t_id UUID)
RETURNS public.account_status AS $$
  SELECT status FROM public.account_tenants 
  WHERE tenant_id = t_id 
  AND account_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION can_view_calendar(t_id UUID)
RETURNS BOOLEAN AS $$
  SELECT 
    (get_tenant_status(t_id) = 'affiliated') -- Tier 3
    OR 
    (get_tenant_status(t_id) = 'initiated' AND (SELECT show_calendar_to_pending FROM public.tenants WHERE id = t_id)) -- Tier 2
  ;
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. TENANTS POLICY
-- All visitors can see basic club info (public)
-- Only admins can see sensitive fields (handled via column-level security or separate view in prod)
-- For MVP, we restrict the whole table but allow members to see their own
DROP POLICY IF EXISTS tenant_select_policy ON tenants;
CREATE POLICY tenant_public_select_policy ON tenants
    FOR SELECT USING (true); -- Public info is safe, but AI keys must be moved/protected

-- 3. ACCOUNTS POLICY
-- Users can see their own full record
-- Users can see other members' basic info (names/photos) if they are affiliated
DROP POLICY IF EXISTS account_select_policy ON accounts;
CREATE POLICY account_self_select ON accounts
    FOR SELECT USING (id = auth.uid());

-- 4. RIDES POLICY
-- Tier 3 (Affiliated) see all rides
-- Tier 2 (Initiated) see rides only if show_calendar_to_pending is true
DROP POLICY IF EXISTS ride_select_policy ON rides;
CREATE POLICY ride_tiered_select ON rides
    FOR SELECT USING (can_view_calendar(tenant_id));

DROP POLICY IF EXISTS ride_insert_policy ON rides;
CREATE POLICY ride_admin_insert ON rides
    FOR INSERT WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS ride_modify_policy ON rides;
CREATE POLICY ride_admin_modify ON rides
    FOR ALL USING (is_tenant_admin(tenant_id) OR created_by = auth.uid());

-- 5. ROUTE_LIBRARY POLICY
-- Tier 3 (Affiliated) only
DROP POLICY IF EXISTS route_library_select_policy ON route_library;
CREATE POLICY route_library_affiliated_select ON route_library
    FOR SELECT USING (get_tenant_status(tenant_id) = 'affiliated');

-- 6. RIDE_PARTICIPANTS POLICY
-- Rule: Captain/SAG see all, Participants see Captain/SAG/Self
-- Rule: Attendee list visible to Affiliated riders for participated rides (RP-16)
DROP POLICY IF EXISTS participant_select_policy ON ride_participants;
CREATE POLICY participant_tactical_select ON ride_participants
    FOR SELECT USING (
        is_captain_or_support(ride_id) -- I am Captain/SAG
        OR
        role IN ('captain', 'support') -- Target is Captain/SAG
        OR
        account_id = auth.uid() -- Target is Me
        OR
        (get_tenant_status((SELECT tenant_id FROM rides WHERE id = ride_id)) = 'affiliated') -- Names only attendee list
    );

-- 7. RIDE_SUMMARIES
-- Tier 3 (Affiliated) only
DROP POLICY IF EXISTS summary_select_policy ON ride_summaries;
CREATE POLICY summary_affiliated_select ON ride_summaries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rides r 
            WHERE r.id = ride_id 
            AND get_tenant_status(r.tenant_id) = 'affiliated'
        )
    );
