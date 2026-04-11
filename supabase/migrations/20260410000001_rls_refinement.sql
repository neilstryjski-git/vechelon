-- VEcheLOn RLS Policies & Infrastructure
-- Refined for Task W5: Design & Test RLS Policies
-- Extends Pillar II: The Specs (v1.3.0)

-- 1. UTILITY FUNCTIONS (Security Definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.accounts WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS public.account_role AS $$
  SELECT role FROM public.accounts WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_captain_or_support(target_ride_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ride_participants 
    WHERE ride_id = target_ride_id 
    AND account_id = auth.uid() 
    AND role IN ('captain', 'support')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. TENANTS
DROP POLICY IF EXISTS tenant_isolation_policy ON tenants;
CREATE POLICY tenant_select_policy ON tenants
    FOR SELECT USING (id = get_my_tenant_id());

-- 3. ACCOUNTS
DROP POLICY IF EXISTS account_tenant_isolation ON accounts;
CREATE POLICY account_select_policy ON accounts
    FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY account_update_policy ON accounts
    FOR UPDATE USING (id = auth.uid()); -- Users can update their own profile

-- 4. RIDES
DROP POLICY IF EXISTS ride_tenant_isolation ON rides;
CREATE POLICY ride_select_policy ON rides
    FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY ride_insert_policy ON rides
    FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY ride_modify_policy ON rides
    FOR ALL USING (tenant_id = get_my_tenant_id() AND (created_by = auth.uid() OR get_my_role() = 'admin'));

-- 5. RIDE_SUPPORT
DROP POLICY IF EXISTS support_isolation ON ride_support;
CREATE POLICY support_select_policy ON ride_support
    FOR SELECT USING (ride_id IN (SELECT id FROM rides));

CREATE POLICY support_modify_policy ON ride_support
    FOR ALL USING (ride_id IN (SELECT id FROM rides WHERE created_by = auth.uid() OR get_my_role() = 'admin'));

-- 6. WAYPOINTS
DROP POLICY IF EXISTS waypoints_isolation ON waypoints;
CREATE POLICY waypoints_select_policy ON waypoints
    FOR SELECT USING (ride_id IN (SELECT id FROM rides));

CREATE POLICY waypoints_modify_policy ON waypoints
    FOR ALL USING (ride_id IN (SELECT id FROM rides WHERE created_by = auth.uid() OR get_my_role() = 'admin'));

-- 7. ROUTE_LIBRARY
DROP POLICY IF EXISTS route_library_isolation ON route_library;
CREATE POLICY route_library_select_policy ON route_library
    FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY route_library_modify_policy ON route_library
    FOR ALL USING (tenant_id = get_my_tenant_id() AND (created_by = auth.uid() OR get_my_role() = 'admin'));

-- 8. RIDE_PARTICIPANTS
-- Rule: Captain/SAG see all, Participants see Captain/SAG/Self
DROP POLICY IF EXISTS ride_participants_visibility ON ride_participants;
CREATE POLICY participant_select_policy ON ride_participants
    FOR SELECT USING (
        is_captain_or_support(ride_id) -- I am Captain/SAG
        OR
        role IN ('captain', 'support') -- Target is Captain/SAG
        OR
        account_id = auth.uid() -- Target is Me
    );

CREATE POLICY participant_insert_policy ON ride_participants
    FOR INSERT WITH CHECK (
        ride_id IN (SELECT id FROM rides) -- Valid ride in my tenant
    );

CREATE POLICY participant_update_policy ON ride_participants
    FOR UPDATE USING (
        account_id = auth.uid() -- I can update my own status/position
        OR
        is_captain_or_support(ride_id) -- Captain/SAG can update anyone (e.g. cancel beacon)
    );

-- 9. RIDE_SUMMARIES
DROP POLICY IF EXISTS summaries_isolation ON ride_summaries;
CREATE POLICY summary_select_policy ON ride_summaries
    FOR SELECT USING (ride_id IN (SELECT id FROM rides));

CREATE POLICY summary_modify_policy ON ride_summaries
    FOR ALL USING (ride_id IN (SELECT id FROM rides WHERE get_my_role() IN ('admin', 'member')));
