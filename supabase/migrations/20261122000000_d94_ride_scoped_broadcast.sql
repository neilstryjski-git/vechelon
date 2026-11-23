-- D94 — ride scoping on broadcast subscribe and send (Sprint 2 brief item 4, rule T1;
-- Pillar II §2 Real-time Pattern).
--
-- Before (W170, narrowed by W304): any AFFILIATED MEMBER OF THE CLUB could subscribe to, and
-- send on, the channel of any of the club's rides, whether or not they were on that ride.
-- Live positions of every rider went to members sitting at home, and anyone in the club
-- could send a position or a beacon event onto a ride they were not on.
--
-- After: on a rail3:ride:<id> topic
--   RECEIVE (subscribe)  a participant ON THE RIDE, or an AFFILIATED admin of the ride's club
--                        (Race Control; an admin is not a ride participant and needs their
--                        own branch, brief §6). is_tenant_admin tests the role only, and a
--                        suspended or archived admin keeps the role, so the admin branch has
--                        its own helper that also requires status = 'affiliated'. Without it
--                        this change would have re-admitted accounts W304 shut out.
--   SEND                 a participant ON THE RIDE. Admins watch; they do not send.
-- "On the ride" is Pillar II's definition: a participant row for this ride whose first-open
-- mark is set (rail3_joined_at) and whose departure mark is not (departed_at), for a member
-- still affiliated with the club (the W304 gate is kept, not replaced).
--
-- Still one channel per ride. Which events each role receives on it (riders not receiving
-- other riders' positions, the beacon rules) is W193, which splits the channel by role.
--
-- What the app does around these marks (read before changing the rule):
--   * Opening a ride in the app writes the participant row, or stamps rail3_joined_at on an
--     existing one, or clears departed_at on a rejoin (RideMapScreen, rideJoin.ts).
--   * Leaving sends the 'depart' broadcast FIRST and stamps departed_at after it
--     (backgroundLocation.ts departureBody), so the departure message is still authorised.
--   * A ride ending stamps no departure mark, so the ride-end 'depart' and the last
--     messages of an ended ride are still authorised for its participants.
--
-- Realtime evaluates these policies when a client joins a channel and for every REST
-- broadcast. rail3_on_ride is one lookup on ride_participants by (ride_id, account_id) plus
-- the existing affiliation check. The only indexes on those columns were partial (on email
-- being present or absent) and cannot serve it, so this migration adds a plain one.
--
-- Known limits, recorded in qa_log.md and carried to W193:
--   * Realtime checks at JOIN and caches the answer for that connection. A socket that was
--     admitted and stays open after its rider leaves keeps receiving until it reconnects.
--     The app removes its channel on leave; a modified client would not. No policy can
--     close this; a server-side close on departure belongs with the W193 channel split.
--   * The departure mark is per account and ride, not per device. If one account is live on
--     two devices and one leaves, the other is refused until it re-opens the ride.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): the two policies are on realtime.messages. They call
--     rail3_topic_ride_id (reads no table; SECURITY INVOKER), rail3_on_ride (reads
--     ride_participants and rides, calls rail3_is_affiliated, which reads account_tenants)
--     and rail3_ride_admin (reads rides and account_tenants). Every function that reads a
--     table is SECURITY DEFINER with search_path pinned, so none of those reads is subject to
--     RLS, and no policy on ride_participants,
--     rides or account_tenants reads realtime.messages. No path back.
--   * Pattern 5 (idempotency): CREATE OR REPLACE FUNCTION; ALTER POLICY on the two policies
--     that exist since W170 / W304 (one statement each, so the table is never without them).
--   * Pattern 7 (grants): functions only. EXECUTE revoked from PUBLIC and anon, granted to
--     authenticated (the role the policies run as) and service_role.
--
-- Scope: Rail 3 schema (rail3-integration + staging), off the production push until promotion.

-- The ride a Rail 3 topic names, or NULL for anything else (fail closed, never raises).
CREATE OR REPLACE FUNCTION public.rail3_topic_ride_id(p_topic text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_topic IS NULL OR p_topic NOT LIKE 'rail3:ride:%' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN split_part(p_topic, ':', 3)::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.rail3_topic_ride_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rail3_topic_ride_id(text) TO authenticated, service_role;

-- Is the caller on this ride: opened it in the app, has not left, still affiliated?
CREATE OR REPLACE FUNCTION public.rail3_on_ride(p_ride_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_ride_id IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.ride_participants p
      JOIN public.rides r ON r.id = p.ride_id
     WHERE p.ride_id = p_ride_id
       AND p.account_id = auth.uid()
       AND p.rail3_joined_at IS NOT NULL
       AND p.departed_at IS NULL
       AND public.rail3_is_affiliated(r.tenant_id)
  );
$$;
REVOKE ALL ON FUNCTION public.rail3_on_ride(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rail3_on_ride(uuid) TO authenticated, service_role;

-- Is the caller an admin of the club that owns this ride, in good standing? is_tenant_admin
-- is not used: it tests role alone, and other policies depend on it, so it is not edited.
CREATE OR REPLACE FUNCTION public.rail3_ride_admin(p_ride_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_ride_id IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.rides r
      JOIN public.account_tenants t ON t.tenant_id = r.tenant_id
     WHERE r.id = p_ride_id
       AND t.account_id = auth.uid()
       AND t.role::text = 'admin'
       AND t.status::text = 'affiliated'
  );
$$;
REVOKE ALL ON FUNCTION public.rail3_ride_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rail3_ride_admin(uuid) TO authenticated, service_role;

-- Serves rail3_on_ride (and get_ride_roster's standing test). The existing unique indexes on
-- these columns are partial and do not cover this lookup.
CREATE INDEX IF NOT EXISTS idx_ride_participants_ride_account
  ON public.ride_participants (ride_id, account_id);

-- RECEIVE: on the ride, or an affiliated admin of the ride's club.
ALTER POLICY rail3_broadcast_tenant_receive ON realtime.messages
  USING (
    realtime.topic() LIKE 'rail3:ride:%'
    AND (
      public.rail3_on_ride(public.rail3_topic_ride_id(realtime.topic()))
      OR public.rail3_ride_admin(public.rail3_topic_ride_id(realtime.topic()))
    )
  );

-- SEND: on the ride.
ALTER POLICY rail3_broadcast_tenant_send ON realtime.messages
  WITH CHECK (
    realtime.topic() LIKE 'rail3:ride:%'
    AND public.rail3_on_ride(public.rail3_topic_ride_id(realtime.topic()))
  );
