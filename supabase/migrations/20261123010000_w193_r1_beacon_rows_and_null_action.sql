-- W193 review r1 — two corrections to 20261123000000 (which is already on staging, so it is
-- corrected by a new migration, not edited).
--
-- 1. beacon_alerts_tenant_select admitted is_captain_or_support(ride_id) on its own. That helper
--    tests the participant ROLE only: a Captain or SAG who is suspended from the club, or who
--    never opened the ride in the app, could read the ride's beacon rows while being refused on
--    every channel (rule T9: denied on every path). The branch is dropped. A leader on the ride
--    already passes rail3_on_ride (first-open mark, not departed, affiliated).
-- 2. rail3_channel_can(topic, NULL) skipped its guard (NULL NOT IN (...) is NULL) and answered
--    the send rule. It now returns false. Both policies pass a literal, so nothing changes for
--    them; this closes the function for any later caller.
--
-- supabase-patterns: Pattern 1 (recursion): the policy calls only SECURITY DEFINER helpers
-- with a pinned search_path (rail3_on_ride, rail3_ride_admin); neither reads beacon_alerts.
-- Pattern 5: ALTER POLICY and CREATE OR REPLACE are both safe to replay. No new object, so no
-- new grant (Pattern 7); the function keeps the grants given in 20261123000000.

ALTER POLICY beacon_alerts_tenant_select ON public.beacon_alerts
  USING (public.rail3_on_ride(ride_id) OR public.rail3_ride_admin(ride_id));

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
  IF p_topic IS NULL OR auth.uid() IS NULL OR p_action IS NULL OR p_action NOT IN ('receive', 'send') THEN
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
