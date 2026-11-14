-- Rail 3 — Broadcast tenant-authorization: membership fix (W196)
-- =====================================================================
-- Supersedes the equality check in the W170 broadcast policies
-- (20260610010000_rail3_broadcast_authorization.sql). Those policies authorized a
-- rider on a rail3:ride:* channel when
--     rail3_topic_tenant_id(topic) = get_my_tenant_id()
-- but get_my_tenant_id() resolves a SINGLE tenant via LIMIT 1 (an arbitrary first
-- membership) and falls back to "first tenant" when null. So a rider who belongs to
-- MORE THAN ONE tenant can be denied their own ride's channel, or matched to the
-- wrong tenant. The correct gate is "is the rider a member of THE RIDE'S tenant?",
-- independent of how many tenants they belong to or their order.
--
-- Fix at the POLICY, not the helper: get_my_tenant_id() is load-bearing app-wide;
-- changing it would ripple across every tenant-scoped policy. (The prod-unsafe
-- IF tid IS NULL THEN first-tenant fallback inside get_my_tenant_id() is flagged
-- separately for the promotion checklist and is intentionally untouched here.)
--
-- Pattern 1 (no recursion / no silent RLS filtering): the membership lookup runs in
-- a SECURITY DEFINER helper that reads public.account_tenants directly. It never
-- references realtime.messages (so there is no recursion on the policy's own table)
-- AND it bypasses account_tenants' own RLS (so the EXISTS cannot be silently filtered
-- by, e.g., account_tenants_select_policy). This mirrors the existing
-- get_my_tenant_id() / rail3_topic_tenant_id() SECURITY DEFINER posture.
-- Pattern 5 (idempotency): CREATE OR REPLACE + DROP POLICY IF EXISTS, so a fresh
-- `supabase db reset` / future deploy replays this cleanly after the W170 migration.
--
-- HELD: this migration must NOT enter the prod `db push --linked` pipeline until the
-- Rail 3 promotion gate. Additive-only; existing software unaffected (Rail 3 topics
-- only; the web app's public ride:<id> channels bypass realtime.messages RLS).
-- =====================================================================

-- Membership helper: TRUE when the signed-in user belongs to p_tenant_id. A NULL
-- tenant (e.g. a malformed/foreign topic, for which rail3_topic_tenant_id() returns
-- NULL) yields FALSE — fail-closed, since tenant_id = NULL matches no row.
CREATE OR REPLACE FUNCTION public.rail3_is_member_of_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_tenants
    WHERE account_id = auth.uid()
      AND tenant_id = p_tenant_id
  );
$$;
REVOKE ALL ON FUNCTION public.rail3_is_member_of_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rail3_is_member_of_tenant(uuid) TO authenticated;

-- Recreate both Rail 3 broadcast policies using the membership gate (was: equality to
-- get_my_tenant_id()). Still scoped by the rail3:ride: LIKE prefix, so only Rail 3
-- topics are ever evaluated — any other private topic is untouched by these policies.
DROP POLICY IF EXISTS rail3_broadcast_tenant_receive ON realtime.messages;
CREATE POLICY rail3_broadcast_tenant_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'rail3:ride:%'
    AND public.rail3_is_member_of_tenant(public.rail3_topic_tenant_id(realtime.topic()))
  );

DROP POLICY IF EXISTS rail3_broadcast_tenant_send ON realtime.messages;
CREATE POLICY rail3_broadcast_tenant_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.topic() LIKE 'rail3:ride:%'
    AND public.rail3_is_member_of_tenant(public.rail3_topic_tenant_id(realtime.topic()))
  );
