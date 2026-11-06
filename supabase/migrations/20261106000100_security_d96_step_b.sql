-- D96 Step B (2026-11-06) — ride_participants role escalation + member-directory over-exposure.
-- Re-verified on prod 2026-11-06. Idempotent (supabase-patterns Pattern 5).
--
-- RECURSION NOTE (W126 class): nothing here adds a policy that reads its own
-- table. The ride_participants guard is a TRIGGER (not RLS), and every lookup it
-- makes goes through SECURITY DEFINER helpers that bypass RLS.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (c) ride_participants: any authenticated user could INSERT their own row with
--     role='captain' on ANY ride in ANY tenant (participant_insert_policy branch
--     1: account_id = auth.uid()), or UPDATE their own row to captain
--     (participant_update_policy has no WITH CHECK). Captain/support carries
--     command powers (Rail 3 breadcrumb writes, End Ride, roster PII), so this
--     was a privilege escalation.
--
--     Rule for API roles (anon/authenticated): a command role (captain/support)
--     may be assigned only by
--       • an admin of the ride's tenant (RideBuilder "add crew" / role change),
--       • the ride's creator (Rail 3 ad-hoc: create ride, then self-RSVP captain),
--       • existing command crew on that ride.
--     ride_id / account_id on an existing row may only be changed by a tenant
--     admin (no client changes them; ensure_account_exists' orphan-claim runs as
--     SECURITY DEFINER → current_user = owner → unaffected).
--     Service-role edge functions and migrations are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_ride_tenant_admin(p_ride_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT public.is_tenant_admin(r.tenant_id) FROM public.rides r WHERE r.id = p_ride_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_assign_ride_command(p_ride_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_ride_tenant_admin(p_ride_id)
    OR EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = p_ride_id AND r.created_by = auth.uid()
    )
    OR public.is_captain_or_support(p_ride_id);
$$;

-- Explicit revokes: REVOKE FROM PUBLIC alone leaves Supabase's default grants.
REVOKE ALL ON FUNCTION public.is_ride_tenant_admin(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_assign_ride_command(uuid) FROM PUBLIC, anon, authenticated;
-- The trigger below runs as the invoking role, so authenticated needs EXECUTE.
-- Both only answer a yes/no question about the caller themselves.
GRANT EXECUTE ON FUNCTION public.is_ride_tenant_admin(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_assign_ride_command(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_guard_participant_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER on purpose: current_user is the API role here. Service
  -- role, migrations and SECURITY DEFINER callers (owner) pass straight through.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Moving a row needs admin of BOTH the source and destination ride's tenant
    -- (review r1: checking only OLD let a club-A admin re-point a captain row at
    -- club B's ride).
    IF (NEW.ride_id IS DISTINCT FROM OLD.ride_id OR NEW.account_id IS DISTINCT FROM OLD.account_id)
       AND NOT (public.is_ride_tenant_admin(OLD.ride_id) AND public.is_ride_tenant_admin(NEW.ride_id)) THEN
      RAISE EXCEPTION 'permission_denied: ride_id/account_id cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    -- Re-check the command role whenever the role OR the ride changes.
    IF NEW.role IN ('captain', 'support')
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.ride_id IS DISTINCT FROM OLD.ride_id)
       AND NOT public.can_assign_ride_command(NEW.ride_id) THEN
      RAISE EXCEPTION 'permission_denied: only a club admin, the ride creator or ride crew can assign %', NEW.role
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.role IN ('captain', 'support')
       AND NOT public.can_assign_ride_command(NEW.ride_id) THEN
      RAISE EXCEPTION 'permission_denied: only a club admin, the ride creator or ride crew can assign %', NEW.role
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ride_participants_guard_role ON public.ride_participants;
CREATE TRIGGER ride_participants_guard_role
  BEFORE INSERT OR UPDATE ON public.ride_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_participant_role();

-- ─────────────────────────────────────────────────────────────────────────────
-- (c, review r1) rides INSERT/UPDATE was not tenant-gated: ride_admin_modify is
--     FOR ALL USING (is_tenant_admin(tenant_id) OR created_by = auth.uid()) with
--     no WITH CHECK, so its USING doubles as the INSERT check — ANY authenticated
--     user could create a ride on ANOTHER club's calendar (created_by = self) and
--     then self-RSVP as its captain through the creator branch above.
--     RESTRICTIVE policies (AND-ed with every permissive one) pin the tenant:
--       INSERT: tenant admin, or the creator is an affiliated member of tenant_id
--               (Rail 3 ad-hoc rides are created by affiliated non-admins).
--       UPDATE: the resulting tenant_id must be one the caller administers or is
--               affiliated with (stops re-homing a ride into a foreign club; Rail
--               3 captains ending a ride are affiliated, so unaffected).
--     Helpers are SECURITY DEFINER over account_tenants — no rides self-reference.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rides_tenant_scope_insert ON public.rides;
DROP POLICY IF EXISTS rides_tenant_scope_update ON public.rides;

CREATE POLICY rides_tenant_scope_insert ON public.rides
  AS RESTRICTIVE
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    public.is_tenant_admin(tenant_id)
    OR (
      created_by = auth.uid()
      AND public.get_tenant_status(tenant_id) = 'affiliated'::public.account_status
    )
  );

CREATE POLICY rides_tenant_scope_update ON public.rides
  AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (
    public.is_tenant_admin(tenant_id)
    OR public.get_tenant_status(tenant_id) = 'affiliated'::public.account_status
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (c, review r1) participant_tactical_select had an unscoped branch
--     `role IN ('captain','support')` with no TO clause, and anon holds full
--     table grants — so the public anon key could read every captain/support row
--     in every club (email, phone, last position). That branch is removed: crew
--     rows stay visible to the ride's own crew, the row owner, and affiliated
--     members of the ride's tenant (the remaining branches, unchanged).
--     Co-member full-row visibility in the affiliated branch is a known follow-up
--     (role-scoped phone — D50), deliberately NOT changed here: the rider portal
--     reads email/phone through it.
--     No recursion: is_captain_or_support / get_tenant_status are SECURITY
--     DEFINER; the rides subquery's own policy never reads ride_participants.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS participant_tactical_select ON public.ride_participants;
CREATE POLICY participant_tactical_select ON public.ride_participants
  FOR SELECT
  USING (
    public.is_captain_or_support(ride_id)
    OR account_id = auth.uid()
    OR public.get_tenant_status(
         (SELECT rides.tenant_id FROM public.rides WHERE rides.id = ride_participants.ride_id)
       ) = 'affiliated'::public.account_status
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (e, review r1) Rail 3 roster contacts. Dropping account_member_names_select
--     (below) removes the accounts(name, phone) embed the Rail 3 RosterScreen
--     uses (rail3-integration mobile/src/screens/RosterScreen.tsx). Command crew
--     and club admins get that data through this ride-scoped RPC instead.
--     RosterScreen must switch to it BEFORE this migration reaches staging —
--     tracked on W259 (Rail 3 promotion). Prod runs no Rail 3 client today.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ride_roster_contacts(p_ride_id uuid)
RETURNS TABLE (participant_id uuid, account_id uuid, name text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.account_id, a.name, a.phone
  FROM public.ride_participants p
  LEFT JOIN public.accounts a ON a.id = p.account_id
  WHERE p.ride_id = p_ride_id
    AND (public.is_captain_or_support(p_ride_id) OR public.is_ride_tenant_admin(p_ride_id));
$$;

REVOKE ALL ON FUNCTION public.get_ride_roster_contacts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ride_roster_contacts(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (e) account_member_names_select let any affiliated co-member SELECT the whole
--     accounts row of every member of a shared tenant — email, phone, emergency
--     contacts — and open-enrolment clubs affiliate on sign-up, so anyone could
--     reach it. RLS cannot restrict columns, so replace the policy with a
--     SECURITY DEFINER RPC returning only the directory fields (Pillar 1.12:
--     "member directory (names only)").
--     Consumer: admin/src/pages/rider/MemberDirectory.tsx (switched to the RPC).
--     Admin pages read accounts via account_admin_select — unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_member_directory(p_tenant_id uuid)
RETURNS TABLE (id uuid, name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.name, a.avatar_url
  FROM public.account_tenants t
  JOIN public.accounts a ON a.id = t.account_id
  WHERE t.tenant_id = p_tenant_id
    AND t.status IN ('affiliated', 'initiated')
    AND (
      public.get_tenant_status(p_tenant_id) = 'affiliated'::public.account_status
      OR public.is_tenant_admin(p_tenant_id)
    )
  ORDER BY t.joined_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_member_directory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_directory(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS account_member_names_select ON public.accounts;

COMMIT;
