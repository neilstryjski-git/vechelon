-- =====================================================================
-- W299 — Self-service account deletion (Google Play User Data policy).
--
-- Retention decision APPROVED by the Sr PM 2026-11-07 (recorded on W299):
--   DELETE     auth user, accounts row, memberships (account_tenants CASCADE), avatar object
--              (edge function), the user's own Rail 3 beacon_alerts / rider_states rows (CASCADE).
--   REASSIGN   rides.created_by, route_library.created_by, ride_support.account_id to a
--              per-club SYSTEM OWNER, so the club keeps its history.
--   ANONYMISE  ride_participants: account_id NULL, display_name 'Deleted rider', email /
--              phone / session cookie / last position NULL.
--   NULL       rides.started_by and beacon_alerts.beacon_cancelled_by (actor references).
--   BLOCK      if the user is the LAST active admin of a club (hand off admin first), or a
--              platform admin.
--   SET NULL   FKs (analytics_events, pending_members.created_by, rail3_telemetry_events) are
--              left to cascade as-is.
--
-- Per-club system owner: an auth user + accounts row with the email
-- `former-member+<tenant_id>@system.vechelon.invalid`, name 'Former member', NO membership
-- (no club powers), no password, banned in auth. It is created by the delete-account edge
-- function (auth users can only be created through the Auth admin API), and these routines
-- only look it up — they never create identities.
--
-- Both routines are service-role only: the delete-account edge function verifies the
-- caller's JWT and passes ONLY that verified uid. Nothing here trusts a client-supplied id,
-- because no client role can EXECUTE them.
--
-- Portable across prod (no Rail 3 schema) and staging (Rail 3 schema): Rail 3 tables and
-- columns are touched only when they exist (to_regclass / information_schema checks).
--
-- supabase-patterns: Pattern 1 — SECURITY DEFINER + SET search_path; no RLS policies added.
-- Pattern 5 — CREATE OR REPLACE (idempotent). Pattern 7 — no new table/view.
-- The D96 guards (ride_participants_guard_role, accounts_guard_platform_admin) only act on
-- API roles (current_user IN anon/authenticated); these run as the function owner, so the
-- guards are neither tripped nor weakened.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.system_owner_email(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 'former-member+' || p_tenant_id::text || '@system.vechelon.invalid';
$$;

-- What deletion needs before it can run: clubs that block it (last admin) and clubs whose
-- records must be handed to a system owner. Read-only.
CREATE OR REPLACE FUNCTION public.account_deletion_preflight(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked      jsonb;
  v_owner_tenants jsonb;
  v_platform     boolean;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'p_uid is required';
  END IF;

  SELECT COALESCE(platform_admin, false) INTO v_platform FROM public.accounts WHERE id = p_uid;

  -- Clubs where this user is the ONLY active admin.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tenant_id', t.id, 'name', t.name) ORDER BY t.name), '[]'::jsonb)
  INTO v_blocked
  FROM public.account_tenants me
  JOIN public.tenants t ON t.id = me.tenant_id
  WHERE me.account_id = p_uid
    AND me.role = 'admin'
    AND me.status NOT IN ('suspended', 'archived', 'deleted')
    AND NOT EXISTS (
      SELECT 1 FROM public.account_tenants other
      WHERE other.tenant_id = me.tenant_id
        AND other.account_id <> p_uid
        AND other.role = 'admin'
        AND other.status NOT IN ('suspended', 'archived', 'deleted')
    );

  -- Clubs owning records this user created or supports.
  SELECT COALESCE(jsonb_agg(DISTINCT x.tenant_id), '[]'::jsonb)
  INTO v_owner_tenants
  FROM (
    SELECT tenant_id FROM public.rides WHERE created_by = p_uid
    UNION
    SELECT tenant_id FROM public.route_library WHERE created_by = p_uid
    UNION
    SELECT r.tenant_id FROM public.ride_support s JOIN public.rides r ON r.id = s.ride_id
    WHERE s.account_id = p_uid
  ) x;

  RETURN jsonb_build_object(
    'account_exists', EXISTS (SELECT 1 FROM public.accounts WHERE id = p_uid),
    'platform_admin', COALESCE(v_platform, false),
    'last_admin_of', v_blocked,
    'owner_tenants', v_owner_tenants
  );
END;
$$;

-- The deletion itself, in one transaction. Re-checks the blocks (never trusts the preflight
-- result the caller saw), requires every needed system owner to exist, then reassigns,
-- anonymises and deletes. Leaves auth.users to the edge function (Auth admin API).
CREATE OR REPLACE FUNCTION public.delete_account_data(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pre      jsonb;
  v_email    text;
  v_tenant   uuid;
  v_owner    uuid;
  v_anon     integer := 0;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'p_uid is required';
  END IF;

  -- Serialise concurrent deletions of the same account.
  PERFORM pg_advisory_xact_lock(hashtextextended('w299_delete_account:' || p_uid::text, 0));

  v_pre := public.account_deletion_preflight(p_uid);
  IF (v_pre->>'platform_admin')::boolean THEN
    RAISE EXCEPTION 'platform_admin' USING ERRCODE = 'P0001',
      HINT = 'Platform admins cannot self-delete.';
  END IF;
  IF jsonb_array_length(v_pre->'last_admin_of') > 0 THEN
    RAISE EXCEPTION 'last_admin' USING ERRCODE = 'P0001',
      HINT = 'Hand off admin in each listed club first.';
  END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_uid;
  IF v_email IS NULL THEN
    SELECT lower(email) INTO v_email FROM public.accounts WHERE id = p_uid;
  END IF;

  -- 1. Reassign club-owned records to each club's system owner.
  FOR v_tenant IN SELECT (jsonb_array_elements_text(v_pre->'owner_tenants'))::uuid LOOP
    SELECT id INTO v_owner FROM public.accounts
    WHERE lower(email) = public.system_owner_email(v_tenant);
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'system_owner_missing:%', v_tenant USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.rides SET created_by = v_owner
    WHERE created_by = p_uid AND tenant_id = v_tenant;

    UPDATE public.route_library SET created_by = v_owner
    WHERE created_by = p_uid AND tenant_id = v_tenant;

    -- ride_support: drop rows that would duplicate an existing system-owner row, then move.
    DELETE FROM public.ride_support s
    USING public.rides r
    WHERE s.ride_id = r.id AND r.tenant_id = v_tenant AND s.account_id = p_uid
      AND EXISTS (SELECT 1 FROM public.ride_support o WHERE o.ride_id = s.ride_id AND o.account_id = v_owner);
    UPDATE public.ride_support s SET account_id = v_owner
    FROM public.rides r
    WHERE s.ride_id = r.id AND r.tenant_id = v_tenant AND s.account_id = p_uid;
  END LOOP;

  -- 2. Anonymise ride participation (linked rows, and guest rows under the same email).
  UPDATE public.ride_participants
  SET account_id = NULL,
      display_name = 'Deleted rider',
      email = NULL,
      phone = NULL,
      session_cookie_id = NULL,
      last_lat = NULL,
      last_long = NULL
  WHERE account_id = p_uid
     OR (v_email IS NOT NULL AND email IS NOT NULL AND lower(email) = v_email);
  GET DIAGNOSTICS v_anon = ROW_COUNT;

  -- 3. Actor references (Rail 3 schema only).
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'rides' AND column_name = 'started_by') THEN
    EXECUTE 'UPDATE public.rides SET started_by = NULL WHERE started_by = $1' USING p_uid;
  END IF;
  IF to_regclass('public.beacon_alerts') IS NOT NULL THEN
    EXECUTE 'UPDATE public.beacon_alerts SET beacon_cancelled_by = NULL WHERE beacon_cancelled_by = $1' USING p_uid;
  END IF;
  IF to_regclass('public.rail3_sag_allowlist') IS NOT NULL AND v_email IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.rail3_sag_allowlist WHERE lower(email) = $1' USING v_email;
  END IF;

  -- 4. Phone shells that graduated into this account hold the same person's details.
  DELETE FROM public.pending_members WHERE account_id = p_uid;

  -- 5. The account row. CASCADE: account_tenants, beacon_alerts.rider_id, rider_states.
  --    SET NULL: analytics_events, pending_members.created_by, rail3_telemetry_events.
  DELETE FROM public.accounts WHERE id = p_uid;

  RETURN jsonb_build_object(
    'reassigned_tenants', v_pre->'owner_tenants',
    'participants_anonymised', v_anon
  );
END;
$$;

-- Service-role only. REVOKE FROM PUBLIC alone leaves Supabase's default grants to anon /
-- authenticated in place, so revoke those explicitly too (verified with has_function_privilege).
REVOKE ALL ON FUNCTION public.system_owner_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_deletion_preflight(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_owner_email(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_preflight(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_account_data(uuid) TO service_role;
