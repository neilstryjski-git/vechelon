-- Rail 3 — Broadcast channel tenant-authorization (W170)
-- =====================================================================
-- Resolves Sprint-0 gap G-1. Live GPS fan-out uses Supabase Broadcast (ephemeral,
-- no DB write per Pillar II §2), so table RLS does NOT govern who can subscribe to a
-- ride channel. This authorizes PRIVATE Broadcast channels at the realtime layer so a
-- rider cannot join another tenant's live ride channel (upholds Pillar I §3).
--
-- Topic convention: `rail3:ride:<ride_uuid>`, subscribed with config.private = true.
-- Authorization: the rider's tenant (account_tenants) must equal the ride's tenant.
--
-- ISOLATION (additive, web unaffected): realtime.messages already has RLS enabled
-- (deny-all, 0 policies). The web app's live HUD uses PUBLIC `ride:<id>` channels
-- (admin/src/hooks/useRideRealtime.ts, lib/simulation.ts) which BYPASS realtime.messages
-- RLS entirely — so these policies cannot affect it. Rail 3 uses a DISTINCT `rail3:ride:`
-- prefix to remove any topic-collision ambiguity. No existing policy is altered.
--
-- Pattern 1 (no recursion): the policies reference SECURITY DEFINER helpers that read
-- public.rides and public.account_tenants — never realtime.messages. No recursion path.
-- Pattern 5 (idempotency): CREATE OR REPLACE + DROP POLICY IF EXISTS.
-- =====================================================================

-- Helper: tenant that owns a Rail 3 ride topic, bypassing rides RLS (gate is by tenant
-- OWNERSHIP of the ride, not the user's tiered visibility). Safe-parses the topic so a
-- malformed/foreign topic returns NULL (fail-closed) rather than raising.
CREATE OR REPLACE FUNCTION public.rail3_topic_tenant_id(p_topic text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  IF p_topic IS NULL OR p_topic NOT LIKE 'rail3:ride:%' THEN
    RETURN NULL;
  END IF;
  BEGIN
    rid := split_part(p_topic, ':', 3)::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN (SELECT tenant_id FROM public.rides WHERE id = rid);
END;
$$;
REVOKE ALL ON FUNCTION public.rail3_topic_tenant_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rail3_topic_tenant_id(text) TO authenticated;

-- Realtime Authorization policies on realtime.messages for Rail 3 private channels.
-- SELECT = receive fan-out; INSERT = send (broadcast). Both restricted to same-tenant
-- riders on a rail3:ride:* topic. Scoped by the LIKE prefix so they only ever evaluate
-- Rail 3 topics — any other private topic is untouched by these policies.
DROP POLICY IF EXISTS rail3_broadcast_tenant_receive ON realtime.messages;
CREATE POLICY rail3_broadcast_tenant_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    realtime.topic() LIKE 'rail3:ride:%'
    AND public.rail3_topic_tenant_id(realtime.topic()) = public.get_my_tenant_id()
  );

DROP POLICY IF EXISTS rail3_broadcast_tenant_send ON realtime.messages;
CREATE POLICY rail3_broadcast_tenant_send ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.topic() LIKE 'rail3:ride:%'
    AND public.rail3_topic_tenant_id(realtime.topic()) = public.get_my_tenant_id()
  );
