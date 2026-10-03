-- =====================================================================
-- W291 — End Ride for ANY Captain on the ride (Ledger v1.1.3 B2, slate 9, §14 item 3;
-- Pillar III R3-71, R3-25, R3-26). Base branch rail3-integration; HELD off the prod
-- `db push --linked` pipeline until promotion (W259), like every Rail 3 migration.
--
-- Today the only UPDATE-capable policy on rides is ride_admin_modify (ALL; is_tenant_admin OR
-- created_by), so a co-Captain who neither created the ride nor is a tenant admin cannot End
-- Ride. This adds ONE narrow, additive UPDATE policy; ride_admin_modify is untouched. Policies
-- are PERMISSIVE and OR together (no RESTRICTIVE policy exists on rides).
--
-- NARROWER THAN THE TICKET TEXT, deliberately: USING requires status = 'active' so a Captain can
-- close an ACTIVE ride only — never flip a 'created' ride straight to saved, never edit a saved
-- ride. WITH CHECK pins the only reachable new state to 'saved'. The client's own
-- `.eq('status','active')` guard holds as well.
--
-- supabase-patterns:
--   * Pattern 1 (recursion): the predicate is public.is_rail3_ride_captain(id) — SECURITY DEFINER,
--     STABLE, search_path pinned (20260718000000_rail3_breadcrumb_capture.sql) — which reads
--     ride_participants with RLS BYPASSED. That matters: ride_participants' own policies read
--     `rides` (participant_tactical_select, participant_update_policy via is_tenant_admin), so an
--     inline subquery here would form a rides → ride_participants → rides chain. The SECURITY
--     DEFINER helper is what cuts it. is_captain_or_support is NOT used: SAG must never end a ride.
--   * Pattern 5 (idempotency): DROP POLICY IF EXISTS before CREATE.
--   * Pattern 7: no new table — existing grants (authenticated already holds UPDATE on rides).
--
-- DEPLOY ORDER: apply to staging before a build carrying W291's RideControls ships, or every
-- non-creator Captain sees the (correct, but visible) "End Ride wasn't accepted" message.
-- =====================================================================

DROP POLICY IF EXISTS rides_rail3_captain_end ON public.rides;
CREATE POLICY rides_rail3_captain_end ON public.rides
  FOR UPDATE TO authenticated
  USING (public.is_rail3_ride_captain(id) AND status = 'active')
  WITH CHECK (status = 'saved');

COMMENT ON POLICY rides_rail3_captain_end ON public.rides IS
  'W291 (Ledger B2 / slate 9): any captain-roled participant of an ACTIVE ride may close it (status → saved). Narrow and additive beside ride_admin_modify; SAG excluded; created rides and saved rides untouchable through this policy. Predicate is the SECURITY DEFINER helper is_rail3_ride_captain — never an inline ride_participants subquery (W126 recursion class).';

-- ---------------------------------------------------------------------
-- Ownership guard (review round 1, security): a policy's WITH CHECK cannot reference OLD, so
-- rides_rail3_captain_end alone pins the status transition but not the rest of the payload — a
-- hostile Captain issuing a crafted PostgREST UPDATE could set created_by = auth.uid() (or
-- tenant_id) while closing and thereby inherit ride_admin_modify (FOR ALL) on the ride. This
-- BEFORE UPDATE trigger rejects any change to tenant_id or created_by unless the caller is a
-- tenant admin of the ride's tenant, the ride's creator, or the service role (auth.uid() IS NULL:
-- migrations, edge functions, the purge). started_by is deliberately NOT guarded here: it is set
-- by trg_set_ride_started_by (NULL → auth.uid() on the → active transition) and trigger order is
-- alphabetical, so guarding it would race that trigger. SECURITY DEFINER + pinned search_path
-- per supabase-patterns Pattern 1; idempotent per Pattern 5.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rail3_guard_ride_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- service role / migrations / edge functions
    END IF;
    IF public.is_tenant_admin(OLD.tenant_id) OR OLD.created_by = auth.uid() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'rides.tenant_id and rides.created_by may only be changed by a tenant admin or the ride creator'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.rail3_guard_ride_ownership() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_rail3_guard_ride_ownership ON public.rides;
CREATE TRIGGER trg_rail3_guard_ride_ownership
  BEFORE UPDATE ON public.rides
  FOR EACH ROW EXECUTE FUNCTION public.rail3_guard_ride_ownership();

COMMENT ON FUNCTION public.rail3_guard_ride_ownership() IS
  'W291: keeps rides_rail3_captain_end narrow — a Captain may close an active ride but may not reassign tenant_id or created_by in the same statement (would inherit ride_admin_modify). Admins, the creator and the service role are unaffected.';
