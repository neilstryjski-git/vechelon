-- W304: Rail 3 live data is for AFFILIATED club members only.
--
-- Finding (verified on staging 2026-11-09, simulated in a rolled-back transaction):
-- the Rail 3 policies compared tenant_id to public.get_my_tenant_id(), which returns
-- the caller's tenant regardless of membership status. A PENDING ('initiated') member
-- of Racer Sportif could read all 114 of that club's beacon_alerts, and would also
-- pass the rider_states and rail3:ride:* broadcast receive/send policies, so they
-- could see the club's live positions before an organiser approved them.
--
-- Fix: a status-aware helper, public.rail3_is_affiliated(tenant), used by every Rail 3
-- policy that get_my_tenant_id() used to gate. It also checks membership of the
-- SPECIFIC tenant (EXISTS), not "the first membership row" (get_my_tenant_id's LIMIT 1).
-- get_my_tenant_id() itself is left unchanged because non-Rail-3 policies depend on it.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): the helper is SECURITY DEFINER, STABLE, search_path pinned,
--     and reads only account_tenants. None of the policies below read their own table.
--   * Pattern 5 (idempotency): CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS.
--   * Pattern 7 (grants): no new table or view; existing table grants are unchanged.

CREATE OR REPLACE FUNCTION public.rail3_is_affiliated(t_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.account_tenants
    WHERE account_id = auth.uid()
      AND tenant_id = t_id
      AND status = 'affiliated'
  );
$$;
REVOKE ALL ON FUNCTION public.rail3_is_affiliated(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rail3_is_affiliated(uuid) TO authenticated;

-- beacon_alerts
DROP POLICY IF EXISTS beacon_alerts_tenant_select ON public.beacon_alerts;
DROP POLICY IF EXISTS beacon_alerts_tenant_insert ON public.beacon_alerts;
DROP POLICY IF EXISTS beacon_alerts_tenant_update ON public.beacon_alerts;
CREATE POLICY beacon_alerts_tenant_select ON public.beacon_alerts
  FOR SELECT TO authenticated USING (public.rail3_is_affiliated(tenant_id));
CREATE POLICY beacon_alerts_tenant_insert ON public.beacon_alerts
  FOR INSERT TO authenticated WITH CHECK (public.rail3_is_affiliated(tenant_id));
CREATE POLICY beacon_alerts_tenant_update ON public.beacon_alerts
  FOR UPDATE TO authenticated USING (public.rail3_is_affiliated(tenant_id))
                              WITH CHECK (public.rail3_is_affiliated(tenant_id));

-- rider_states
DROP POLICY IF EXISTS rider_states_tenant_select ON public.rider_states;
DROP POLICY IF EXISTS rider_states_tenant_insert ON public.rider_states;
DROP POLICY IF EXISTS rider_states_tenant_update ON public.rider_states;
CREATE POLICY rider_states_tenant_select ON public.rider_states
  FOR SELECT TO authenticated USING (public.rail3_is_affiliated(tenant_id));
CREATE POLICY rider_states_tenant_insert ON public.rider_states
  FOR INSERT TO authenticated WITH CHECK (public.rail3_is_affiliated(tenant_id));
CREATE POLICY rider_states_tenant_update ON public.rider_states
  FOR UPDATE TO authenticated USING (public.rail3_is_affiliated(tenant_id))
                              WITH CHECK (public.rail3_is_affiliated(tenant_id));

-- Realtime broadcast on rail3:ride:* topics (receive = live positions fan-out).
DROP POLICY IF EXISTS rail3_broadcast_tenant_receive ON realtime.messages;
CREATE POLICY rail3_broadcast_tenant_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'rail3:ride:%'
    AND public.rail3_is_affiliated(public.rail3_topic_tenant_id(realtime.topic()))
  );

DROP POLICY IF EXISTS rail3_broadcast_tenant_send ON realtime.messages;
CREATE POLICY rail3_broadcast_tenant_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.topic() LIKE 'rail3:ride:%'
    AND public.rail3_is_affiliated(public.rail3_topic_tenant_id(realtime.topic()))
  );

-- Telemetry insert: same gate, so a pending member can't write into a club's ride sink.
DROP POLICY IF EXISTS rail3_telemetry_events_tenant_insert ON public.rail3_telemetry_events;
CREATE POLICY rail3_telemetry_events_tenant_insert ON public.rail3_telemetry_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rail3_is_affiliated(tenant_id)
    AND tenant_id = public.rail3_ride_tenant_id(ride_id)
    AND account_id = auth.uid()
  );

-- Captain breadcrumb (D82): reading it required only ride participation. The web
-- participant_insert_policy lets any signed-in user add THEMSELVES to a ride (a pending
-- member can see rides where tenants.show_calendar_to_pending is on), so participation
-- alone would let a pending member read the Captain's route. Require affiliation as well.
-- The leader-only write policies are unchanged (a leader started the ride, so is a member).
DROP POLICY IF EXISTS rail3_breadcrumb_select ON public.rail3_breadcrumb;
CREATE POLICY rail3_breadcrumb_select ON public.rail3_breadcrumb
  FOR SELECT TO authenticated
  USING (
    public.is_rail3_ride_participant(ride_id)
    AND public.rail3_is_affiliated(public.rail3_ride_tenant_id(ride_id))
  );
