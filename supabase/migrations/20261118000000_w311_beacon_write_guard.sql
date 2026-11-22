-- W311 — beacon_alerts write path: who may insert, who may cancel, and which columns a
-- cancel may touch. Sprint 2 brief item 6, rules T10 to T12 (Pillar II §2 schema; Ledger §1
-- SD-011).
--
-- Before this migration (W304): insert and update on beacon_alerts only asked "is the caller
-- an affiliated member of the row's tenant_id". The W309 baseline showed what that allows:
--   * a rider inserting a beacon in another rider's name (T10);
--   * a member of ANOTHER club inserting a row under their own club that points at this
--     club's ride (T16.2): the policy never checked that the ride belongs to tenant_id;
--   * anyone in the club cancelling anyone's beacon, including a club admin who is not on
--     the ride (T11);
--   * rewriting the snapshot position, triggered_at or rider_id, re-opening or overwriting a
--     closed beacon, and recording someone else (or nobody) as the canceller (T11).
-- The SD-011 audit fields are only as trustworthy as this write path.
--
-- After:
--   INSERT  the row's rider_id is the caller, the caller is affiliated with tenant_id, and
--           the ride belongs to tenant_id. A new row arrives open (no cancel fields).
--   UPDATE  only the beacon's own rider or the ride's Captain or SAG. Only
--           beacon_cancelled_at and beacon_cancelled_by may change, only from empty to set,
--           both together, and beacon_cancelled_by must be the caller.
--   beacon_cancel_reason stays server-only (D81 guard, unchanged).
--
-- Not changed here: who may READ beacon rows. That belongs with W193 and the widened
-- visibility rule (ticket pitfall).
--
-- The app's own writes already have this shape, so the versionCode 4 build is unaffected:
--   raise        insert { id, tenant_id, ride_id, rider_id = me, lat, long, triggered_at }
--   cancel       update { beacon_cancelled_by = me, beacon_cancelled_at } where
--                beacon_cancelled_at is null   (own beacon, or Captain / SAG for a rider's)
--
-- Server writers pass straight through the column guard, which applies to the API roles
-- only (same shape as rail3_guard_beacon_cancel_reason and tg_guard_participant_role):
--   * rail3_close_beacons_on_ride_end and rail3_close_late_beacon (D81) are SECURITY DEFINER,
--     so current_user is their owner;
--   * delete_account_data (W299) is SECURITY DEFINER;
--   * the retention purge and edge functions run as the service role.
-- RLS does not apply to those either (owner / service role bypass it).
--
-- Trigger order: Postgres fires a table's BEFORE triggers in name order. This guard is
-- trg_rail3_beacon_audit_guard, which sorts before trg_rail3_beacon_reason_guard and
-- trg_rail3_close_late_beacon, so on INSERT it sees only what the caller sent, never the
-- late-beacon trigger's own close.
--
-- supabase-patterns walkthrough:
--   * Pattern 1 (recursion): the two policies are on beacon_alerts and call only SECURITY
--     DEFINER helpers: rail3_is_affiliated (reads account_tenants), is_captain_or_support
--     (reads ride_participants) and the new rail3_ride_in_tenant (reads rides). None reads
--     beacon_alerts, and no policy on account_tenants, ride_participants or rides reads
--     beacon_alerts, so there is no path back. The trigger function reads no table at all.
--   * Pattern 5 (idempotency): CREATE OR REPLACE FUNCTION, ALTER POLICY (the policies exist
--     since W169 / W304; ALTER swaps the expression in one statement, with no moment where
--     the table has no policy), DROP TRIGGER IF EXISTS before CREATE.
--   * Pattern 7 (grants): no new table or view. The helper's EXECUTE is revoked from PUBLIC
--     and anon and granted to authenticated and service_role.
--
-- Scope: Rail 3 schema (rail3-integration + staging), off the production push until promotion.

-- Does this ride belong to this club? Answers yes/no only, for the caller's own insert check.
CREATE OR REPLACE FUNCTION public.rail3_ride_in_tenant(p_ride_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_ride_id IS NOT NULL AND p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.rides r WHERE r.id = p_ride_id AND r.tenant_id = p_tenant_id
  );
$$;
REVOKE ALL ON FUNCTION public.rail3_ride_in_tenant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rail3_ride_in_tenant(uuid, uuid) TO authenticated, service_role;

-- INSERT: my own beacon, in my club, on one of my club's rides.
ALTER POLICY beacon_alerts_tenant_insert ON public.beacon_alerts
  WITH CHECK (
    rider_id = auth.uid()
    AND public.rail3_is_affiliated(tenant_id)
    AND public.rail3_ride_in_tenant(ride_id, tenant_id)
  );

-- UPDATE: the beacon's own rider, or the ride's Captain or SAG. The same test applies to the
-- row as it was (USING) and as it would become (WITH CHECK), so a row cannot be moved to a
-- ride or rider the caller has no standing on. Column rules are in the trigger below.
ALTER POLICY beacon_alerts_tenant_update ON public.beacon_alerts
  USING (
    public.rail3_is_affiliated(tenant_id)
    AND (rider_id = auth.uid() OR public.is_captain_or_support(ride_id))
  )
  WITH CHECK (
    public.rail3_is_affiliated(tenant_id)
    AND (rider_id = auth.uid() OR public.is_captain_or_support(ride_id))
  );

-- Column rules. A row policy cannot restrict columns, so this is a trigger.
CREATE OR REPLACE FUNCTION public.rail3_guard_beacon_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER on purpose: current_user is the API role here. The service role,
  -- migrations and SECURITY DEFINER callers (ride-end close, account deletion) pass through.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A beacon is raised open. Only a cancel (an UPDATE, checked below) or the server closes it.
    IF NEW.beacon_cancelled_at IS NOT NULL OR NEW.beacon_cancelled_by IS NOT NULL THEN
      RAISE EXCEPTION 'permission_denied: a beacon cannot be inserted already cancelled'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE. Nothing but the two cancel fields may differ.
  IF (to_jsonb(NEW) - 'beacon_cancelled_at' - 'beacon_cancelled_by')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'beacon_cancelled_at' - 'beacon_cancelled_by') THEN
    RAISE EXCEPTION 'permission_denied: only beacon_cancelled_at and beacon_cancelled_by can be changed'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.beacon_cancelled_at IS DISTINCT FROM OLD.beacon_cancelled_at
     OR NEW.beacon_cancelled_by IS DISTINCT FROM OLD.beacon_cancelled_by THEN
    -- Empty to set only: a beacon that is already closed, by a person or by ride end, is final.
    IF OLD.beacon_cancelled_at IS NOT NULL OR OLD.beacon_cancelled_by IS NOT NULL THEN
      RAISE EXCEPTION 'permission_denied: this beacon is already closed'
        USING ERRCODE = '42501';
    END IF;
    -- Both fields together, and the actor is the caller (SD-011: never blank, never someone else).
    IF NEW.beacon_cancelled_at IS NULL
       OR NEW.beacon_cancelled_by IS NULL
       OR NEW.beacon_cancelled_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'permission_denied: a cancel sets beacon_cancelled_at and records the caller as beacon_cancelled_by'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rail3_guard_beacon_audit_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rail3_beacon_audit_guard ON public.beacon_alerts;
CREATE TRIGGER trg_rail3_beacon_audit_guard
  BEFORE INSERT OR UPDATE ON public.beacon_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.rail3_guard_beacon_audit_fields();

COMMENT ON FUNCTION public.rail3_guard_beacon_audit_fields() IS
  'W311: API roles may insert a beacon only open, and may update only beacon_cancelled_at and '
  'beacon_cancelled_by, from empty to set, with the caller as the actor (T11, SD-011). Server '
  'roles pass through.';
