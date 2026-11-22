-- W313 — the roster a participant's device reads (Sprint 2 brief item 8; rules T5, T6, T7;
-- Pillar II §4.1 ROSTER and CONTACT).
--
-- Before: the mobile roster read ride_participants and embedded accounts(name, phone). Since
-- D96 that embed returns nothing for other people, so on staging names and phones appear
-- only because a hand-made trigger (rail3_hydrate_participant_identity) copies them onto the
-- participant rows. The trigger is in no migration and goes at cutover (next migration).
--
-- After: one function, get_ride_roster(ride), for every role. A SECURITY DEFINER function is
-- the D96 pattern (get_ride_roster_contacts, get_member_directory): row policies cannot
-- restrict columns, and a function returns exactly the columns §4.1 allows.
--
-- What a caller gets (§4.1 ROSTER):
--   * Standing: the caller has a participant row on this ride. Anyone else gets no rows.
--   * Every roster row, guests included: name, role, participation state.
--   * Phone:
--       - Captain and SAG of the ride (co-Captains included) get every phone;
--       - everyone else gets the Captain's and SAG's phones, and their own;
--       - no rider's phone goes to another rider.
--   * Never returned to anyone: last position, last ping, email.
--     The app's join writes display_name = name, or the member's EMAIL when the account has
--     no name yet (mobile/src/lib/rideJoin.ts). So a display_name containing '@' is never
--     used as a name here: the row comes back with a null name and the app shows its own
--     "Unnamed rider" text.
--
-- Name and phone source: the account record first (a member's current name and number),
-- the participant row second (a guest has no account; a member's row may carry a per-ride
-- copy). Once the ride has ended, the phone comes from the per-ride copy only, which the
-- retention job clears 4 hours after ride end: an ended-ride roster shows no phone, by
-- design (ticket pitfall; Pillar II §2 retention).
--
-- participation is text, not an enum, and is computed here so the app does not have to
-- derive it: 'roster_only' (guest, or a member who has not opened the ride in the app),
-- 'app_tracked', 'departed'. The fourth value Pillar II names (tracks only while the app is
-- open, Captain and SAG only) can be added as another text value, gated on the same
-- caller-is-leader test, with no change to the return shape. Not built here.
-- The two timestamps are returned as well: the app's cache and its offline path use them.
--
-- get_ride_roster_contacts is left as it is. Nothing in admin/src or mobile/src calls it
-- today; it remains the path that gives a club admin who is not on the ride the contacts.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): no policy is created or changed, and no policy calls this
--     function. It is SECURITY DEFINER with search_path pinned, so its reads of
--     ride_participants, accounts and rides are not subject to RLS and cannot re-enter a
--     policy. is_captain_or_support (SECURITY DEFINER, pinned) is evaluated once per call.
--   * Pattern 5 (idempotency): CREATE OR REPLACE FUNCTION.
--   * Pattern 7 (grants): a function, not a table or view. EXECUTE revoked from PUBLIC and
--     anon, granted to authenticated and service_role.
--
-- Scope: Rail 3 schema (rail3-integration + staging), off the production push until promotion.
-- Additive: the versionCode 4 app does not call it and is unaffected by it.

CREATE OR REPLACE FUNCTION public.get_ride_roster(p_ride_id uuid)
RETURNS TABLE (
  participant_id  uuid,
  account_id      uuid,
  name            text,
  role            text,
  participation   text,
  phone           text,
  rail3_joined_at timestamptz,
  departed_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      EXISTS (
        SELECT 1 FROM public.ride_participants mp
         WHERE mp.ride_id = p_ride_id AND mp.account_id = auth.uid()
      ) AS on_roster,
      public.is_captain_or_support(p_ride_id) AS is_leader,
      COALESCE((SELECT r.status::text IN ('created', 'active')
                  FROM public.rides r WHERE r.id = p_ride_id), false) AS ride_open
  )
  SELECT
    p.id,
    p.account_id,
    COALESCE(
      NULLIF(btrim(a.name), ''),
      CASE WHEN position('@' in COALESCE(p.display_name, '')) = 0
           THEN NULLIF(btrim(p.display_name), '') END
    ),
    p.role::text,
    CASE
      WHEN p.account_id IS NULL        THEN 'roster_only'
      WHEN p.departed_at IS NOT NULL   THEN 'departed'
      WHEN p.rail3_joined_at IS NULL   THEN 'roster_only'
      ELSE 'app_tracked'
    END,
    CASE
      WHEN me.is_leader
        OR p.role::text IN ('captain', 'support')
        OR p.account_id = auth.uid()
      THEN CASE
             WHEN me.ride_open
             THEN COALESCE(NULLIF(btrim(a.phone), ''), NULLIF(btrim(p.phone), ''))
             ELSE NULLIF(btrim(p.phone), '')
           END
      ELSE NULL
    END,
    p.rail3_joined_at,
    p.departed_at
  FROM public.ride_participants p
  CROSS JOIN me
  LEFT JOIN public.accounts a ON a.id = p.account_id
  WHERE p.ride_id = p_ride_id
    AND auth.uid() IS NOT NULL
    AND me.on_roster;
$$;

REVOKE ALL ON FUNCTION public.get_ride_roster(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ride_roster(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ride_roster(uuid) IS
  'W313 / Pillar II §4.1 ROSTER: for a participant of the ride, every roster row by name, role '
  'and participation state. Phones: every phone to the ride''s Captain and SAG; leaders'' phones '
  'and the caller''s own to everyone else. Never position, ping or email.';
