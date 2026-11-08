-- =====================================================================
-- D98 — Rail 3 telemetry tables: remove the excess API grants W284 never intended.
--
-- 20260915000000_rail3_telemetry.sql only ADDED grants. The tables were created before
-- Supabase stopped implicit grants (2026-10-30), so anon and authenticated also kept the
-- implicit full table privileges (verified on staging 2026-11-08). RLS still blocks access
-- (events: tenant/ride/self-scoped INSERT policy only; config: authenticated SELECT policy
-- only), so nothing was exposed, but the grant layer W284 ruled for was missing.
--
-- Intended (W284): authenticated INSERT-only on events and SELECT-only on config; anon
-- nothing; service_role full. REVOKE first: a GRANT never removes an existing grant.
--
-- Rail 3 schema: staging only until the Rail 3 promotion carries it to prod. Apply this
-- migration to staging ALONE. supabase-patterns Pattern 7 / Pattern 5 (re-runnable).
-- =====================================================================

REVOKE ALL ON public.rail3_telemetry_events FROM PUBLIC, anon, authenticated;
GRANT INSERT                         ON public.rail3_telemetry_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rail3_telemetry_events TO service_role;

REVOKE ALL ON public.rail3_operator_config FROM PUBLIC, anon, authenticated;
GRANT SELECT                         ON public.rail3_operator_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rail3_operator_config TO service_role;
