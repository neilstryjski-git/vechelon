-- W193 — role-scoped broadcast channels (Sprint 2 brief item 3; rules T2, T3, T4, T8, T9;
-- Pillar II §2 Real-time Pattern, §3 Feature 2, §4.1; Ledger 16.3).
--
-- Before: one channel per ride (rail3:ride:<id>). Everyone on the ride received every
-- event, and the app hid from riders what §4.1 does not grant them. Hiding is not
-- enforcement, and delivery grew with the square of the ride size.
--
-- After: four channels per ride. Who may RECEIVE and who may SEND on each:
--
--   topic               carries                         receive                send
--   rail3:crew:<ride>   riders' positions               Captain, SAG           anyone on the ride
--   rail3:lead:<ride>   Captain and SAG positions       anyone on the ride     Captain, SAG
--   rail3:all:<ride>    beacon raise / cancel, depart,  anyone on the ride,    anyone on the ride
--                       ride ended                      the club's admins
--   rail3:sos:<ride>    a beaconing rider's live        anyone on the ride,    a rider on the ride whose
--                       position                        the club's admins      own beacon is active, on a
--                                                                              ride that has not ended
--
-- "On the ride" is D94's rail3_on_ride: opened the ride in the app, has not left, still
-- affiliated. "Captain, SAG" additionally passes is_captain_or_support. "The club's admins"
-- is rail3_ride_admin (admin role AND affiliated).
--
-- Why four and not two. Realtime checks RECEIVE once, when a socket joins, and keeps that
-- answer for the connection; it checks every REST broadcast when it is sent. So what a role
-- may receive has to be decided by WHICH topics it can join, and anything that must stop at a
-- moment in time (a beaconing rider's position, on cancel and on ride end: T4) has to be a
-- SEND rule on a topic of its own. rail3:sos is that topic: the moment the beacon flag clears
-- or the ride ends, the server refuses the sender, whatever the sender's app does.
-- The app sends positions by REST (backgroundLocation.restBroadcast), so every position ping
-- is checked.
--
-- Delivery: a rider's ping now reaches the Captain and SAG only (crew), not every rider.
-- Riders receive leaders' pings (lead) and beaconing riders' pings (sos). Rider-side delivery
-- no longer grows with the number of riders.
--
-- Known limits (qa_log.md):
--   * A socket's SEND permission is also cached at join. A modified client that joined sos
--     while its beacon was active could keep sending its OWN position there over the socket
--     after a cancel, until it reconnects. It can leak only itself. The app sends by REST.
--   * rail3:all accepts any event name from anyone on the ride, so a modified client can put
--     its own position on it. Same bound: only its own.
--
-- THE LEGACY CHANNEL rail3:ride:<id> and its two policies (D94) are untouched here: the Play
-- build (versionCode 4) uses only that channel. Their removal is written and held outside the
-- migrations folder (supabase/cutover/w193_drop_legacy_ride_channel.sql) for the cutover (W317). The new policies never match the legacy topic and the legacy
-- policies never match the new ones.
--
-- BEACON ROWS (T9): beacon_alerts was readable by every affiliated member of the club. It is
-- now readable by people on the ride, its Captain and SAG, and the club's admins. A member
-- off the ride, a rider who has left and a participant who never opened the ride in the app
-- read none.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): the two new policies on realtime.messages call rail3_channel_can,
--     which is SECURITY DEFINER with search_path pinned and reads ride_participants and rides
--     and calls rail3_on_ride, is_captain_or_support and rail3_ride_admin (all DEFINER, all
--     reading only ride_participants, rides, account_tenants). No policy on those tables reads
--     realtime.messages. The beacon_alerts SELECT policy calls the same three helpers; none of
--     them reads beacon_alerts.
--   * Pattern 5 (idempotency): CREATE OR REPLACE; DROP POLICY IF EXISTS before CREATE POLICY;
--     ALTER POLICY for the existing beacon policy.
--   * Pattern 7 (grants): functions only; EXECUTE revoked from PUBLIC and anon, granted to
--     authenticated and service_role.

-- May the caller p_action ('receive' | 'send') on this topic? False for anything that is not
-- exactly rail3:<crew|lead|all|sos>:<ride uuid> (fail closed, never raises).
CREATE OR REPLACE FUNCTION public.rail3_channel_can(p_topic text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind text;
  rid  uuid;
BEGIN
  IF p_topic IS NULL OR auth.uid() IS NULL OR p_action NOT IN ('receive', 'send') THEN
    RETURN false;
  END IF;
  kind := split_part(p_topic, ':', 2);
  IF split_part(p_topic, ':', 1) <> 'rail3' OR kind NOT IN ('crew', 'lead', 'all', 'sos') THEN
    RETURN false;
  END IF;
  BEGIN
    rid := split_part(p_topic, ':', 3)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF p_topic <> 'rail3:' || kind || ':' || rid::text THEN
    RETURN false; -- no extra segments, canonical uuid text only
  END IF;

  IF p_action = 'receive' THEN
    RETURN CASE kind
      WHEN 'crew' THEN public.rail3_on_ride(rid) AND public.is_captain_or_support(rid)
      WHEN 'lead' THEN public.rail3_on_ride(rid)
      ELSE public.rail3_on_ride(rid) OR public.rail3_ride_admin(rid)   -- all, sos
    END;
  END IF;

  RETURN CASE kind
    WHEN 'crew' THEN public.rail3_on_ride(rid)
    WHEN 'lead' THEN public.rail3_on_ride(rid) AND public.is_captain_or_support(rid)
    WHEN 'all'  THEN public.rail3_on_ride(rid)
    ELSE public.rail3_on_ride(rid) AND EXISTS (                         -- sos
      SELECT 1
        FROM public.ride_participants p
        JOIN public.rides r ON r.id = p.ride_id
       WHERE p.ride_id = rid
         AND p.account_id = auth.uid()
         AND p.beacon_active
         AND r.status::text = 'active'
    )
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.rail3_channel_can(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rail3_channel_can(text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS rail3_channel_receive ON realtime.messages;
CREATE POLICY rail3_channel_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'rail3:%'
    AND realtime.topic() NOT LIKE 'rail3:ride:%'
    AND public.rail3_channel_can(realtime.topic(), 'receive')
  );

DROP POLICY IF EXISTS rail3_channel_send ON realtime.messages;
CREATE POLICY rail3_channel_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.topic() LIKE 'rail3:%'
    AND realtime.topic() NOT LIKE 'rail3:ride:%'
    AND public.rail3_channel_can(realtime.topic(), 'send')
  );

-- Beacon rows: on the ride, its Captain and SAG, the club's admins.
ALTER POLICY beacon_alerts_tenant_select ON public.beacon_alerts
  USING (
    public.rail3_on_ride(ride_id)
    OR public.is_captain_or_support(ride_id)
    OR public.rail3_ride_admin(ride_id)
  );
