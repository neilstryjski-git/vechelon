-- D50 — participant rows readable to Pillar II §4.1 (Sprint 2 brief item 5; rules T5, T6, T7).
--
-- Before: participant_tactical_select had an "affiliated member of the club" branch. RLS is
-- row-level, so that branch handed EVERY column of EVERY participant row of every ride in
-- the club to any member: phones, emails, last position, last ping. The §4.1 rule ("a rider
-- reads the leaders' phones, never another rider's phone or position") held in the app only.
--
-- After: a participant ROW is readable only by
--   * the account it belongs to,
--   * the ride's Captain and SAG (unchanged),
--   * an affiliated admin of the ride's club (new explicit branch: admins used to read
--     through the member branch, which is the one removed here).
-- Everything an ordinary member legitimately needs comes through functions that return only
-- the columns the caller's role is allowed:
--   get_ride_roster(ride)          W313, unchanged: names, roles, participation, leader phones.
--   get_ride_fleet_seed(ride)      NEW: the map's catch-up read (last known position, departure
--                                  mark, beacon flag), filtered per §4.1.
--   get_ride_attendees(ride)       NEW: the web's names-only attendee list (RP-16).
--   get_ride_attendee_count(ride)  NEW: the web's head count.
--
-- NOT COMPATIBLE WITH THE PLAY BUILD (versionCode 4), which reads the table directly for its
-- roster, fleet seed and beacon seed. Trunk only; staging at the cutover (W317); production
-- out of scope this sprint.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): the policy is on ride_participants. is_captain_or_support and
--     rail3_ride_admin are SECURITY DEFINER with search_path pinned (the first reads
--     ride_participants itself, which is exactly why it must be, and already is, DEFINER; the
--     second reads rides and account_tenants). The old inline subquery on rides is gone, so
--     the policy no longer evaluates rides' RLS at all. The three new functions are DEFINER
--     and are not called from any policy.
--   * Pattern 5 (idempotency): ALTER POLICY in place (the table is never without a read
--     policy); CREATE OR REPLACE for functions. rail3_ride_admin is also created by D94's
--     migration with the same body; whichever runs second is a no-op.
--   * Pattern 7 (grants): functions only; EXECUTE revoked from PUBLIC and anon, granted to
--     authenticated and service_role.

-- Same body as in 20261122000000 (D94). Repeated so this migration stands alone.
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

ALTER POLICY participant_tactical_select ON public.ride_participants
  USING (
    account_id = auth.uid()
    OR public.is_captain_or_support(ride_id)
    OR public.rail3_ride_admin(ride_id)
  );

-- The map's catch-up read. One row per participant with an account.
--   Captain, SAG, club admin : every row, every column.
--   A rider ON the ride      : every row's departure mark, status and beacon flag; a position
--     (opened it in the app,   only for the Captain and SAG, for a rider whose beacon is
--      has not left)           active (§4.1), and for the caller's own row.
--   Anyone else              : nothing.
CREATE OR REPLACE FUNCTION public.get_ride_fleet_seed(p_ride_id uuid)
RETURNS TABLE (
  account_id    uuid,
  role          text,
  status        text,
  beacon_active boolean,
  departed_at   timestamptz,
  last_lat      double precision,
  last_long     double precision,
  last_ping     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      (public.is_captain_or_support(p_ride_id) OR public.rail3_ride_admin(p_ride_id)) AS sees_all,
      EXISTS (
        SELECT 1
          FROM public.ride_participants mp
          JOIN public.rides r ON r.id = mp.ride_id
         WHERE mp.ride_id = p_ride_id
           AND mp.account_id = auth.uid()
           AND mp.rail3_joined_at IS NOT NULL
           AND mp.departed_at IS NULL
           AND public.rail3_is_affiliated(r.tenant_id)
      ) AS on_ride
  )
  SELECT
    p.account_id,
    p.role::text,
    p.status::text,
    COALESCE(p.beacon_active, false),
    p.departed_at,
    CASE WHEN v.pos THEN p.last_lat END,
    CASE WHEN v.pos THEN p.last_long END,
    CASE WHEN v.pos THEN p.last_ping END
  FROM public.ride_participants p
  CROSS JOIN me
  CROSS JOIN LATERAL (
    SELECT (
      me.sees_all
      OR p.account_id = auth.uid()
      OR p.role::text IN ('captain', 'support')
      OR COALESCE(p.beacon_active, false)
    ) AS pos
  ) v
  WHERE p.ride_id = p_ride_id
    AND p.account_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (me.sees_all OR me.on_ride);
$$;
REVOKE ALL ON FUNCTION public.get_ride_fleet_seed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ride_fleet_seed(uuid) TO authenticated, service_role;

-- Can the caller see who is attending this ride (names only)? An affiliated member of the
-- ride's club, as before (RP-16), or anyone with a row on the ride.
CREATE OR REPLACE FUNCTION public.rail3_can_list_attendees(p_ride_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.rides r
             WHERE r.id = p_ride_id AND public.rail3_is_affiliated(r.tenant_id))
    OR EXISTS (SELECT 1 FROM public.ride_participants mp
                WHERE mp.ride_id = p_ride_id AND mp.account_id = auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.rail3_can_list_attendees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rail3_can_list_attendees(uuid) TO authenticated, service_role;

-- The web's attendee list: who is coming, by name and role. No phone, no email, no position.
-- A name that is really an email address is never returned (same rule as get_ride_roster).
CREATE OR REPLACE FUNCTION public.get_ride_attendees(p_ride_id uuid)
RETURNS TABLE (
  id           uuid,
  account_id   uuid,
  display_name text,
  role         text,
  status       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.account_id,
    COALESCE(
      NULLIF(btrim(a.name), ''),
      CASE WHEN position('@' in COALESCE(p.display_name, '')) = 0
           THEN NULLIF(btrim(p.display_name), '') END
    ),
    p.role::text,
    p.status::text
  FROM public.ride_participants p
  LEFT JOIN public.accounts a ON a.id = p.account_id
  WHERE p.ride_id = p_ride_id
    AND public.rail3_can_list_attendees(p_ride_id);
$$;
REVOKE ALL ON FUNCTION public.get_ride_attendees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ride_attendees(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_ride_attendee_count(p_ride_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.rail3_can_list_attendees(p_ride_id)
              THEN (SELECT count(*)::integer FROM public.ride_participants p WHERE p.ride_id = p_ride_id)
              ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.get_ride_attendee_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ride_attendee_count(uuid) TO authenticated, service_role;
