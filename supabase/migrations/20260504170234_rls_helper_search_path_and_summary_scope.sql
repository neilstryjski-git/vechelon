-- W141 / MT-H-03: RLS defensive hardening
--
-- Two defensive changes from the 2026-05-04 multi-tenancy audit:
--
-- 1) SET search_path = public on 6 SECURITY DEFINER helpers (audit C5).
--    Per supabase-patterns Pattern 1, SECURITY DEFINER functions without a
--    pinned search_path can be exploited if a malicious user gains CREATE
--    on any schema in the search path — they could shadow public functions
--    or operators and execute as the function owner. Low exploitability
--    today (no general CREATE grants) but the helper is_platform_admin
--    already pins search_path; aligning the others is defensive parity.
--
-- 2) Tighten ride_summaries.summary_modify_policy to scope by tenant_id
--    explicitly (audit H4). The original policy gated only on
--    `get_my_role() IN ('admin','member')` — bounded today by the rides
--    RLS that scopes the inner SELECT, but doesn't make the tenant intent
--    explicit. Replacing with an account_tenants EXISTS check makes the
--    cross-tenant rejection explicit and removes the implicit dependency
--    on rides RLS scoping.
--
-- Idempotency (Pattern 5): defensive DROP POLICY IF EXISTS at top of the
-- ride_summaries replacement. ALTER FUNCTION on the helpers is naturally
-- idempotent (no error if search_path is already set).

-- ── 1. search_path on helpers ────────────────────────────────────────────
ALTER FUNCTION public.get_my_tenant_id()                SET search_path = public;
ALTER FUNCTION public.get_my_role()                     SET search_path = public;
ALTER FUNCTION public.get_tenant_status(uuid)           SET search_path = public;
ALTER FUNCTION public.can_view_calendar(uuid)           SET search_path = public;
ALTER FUNCTION public.is_tenant_admin(uuid)             SET search_path = public;
ALTER FUNCTION public.is_captain_or_support(uuid)       SET search_path = public;

-- ── 2. ride_summaries.summary_modify_policy tenant-scoped ────────────────
DROP POLICY IF EXISTS summary_modify_policy ON public.ride_summaries;

CREATE POLICY summary_modify_policy ON public.ride_summaries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rides r
      WHERE r.id = ride_summaries.ride_id
        AND r.tenant_id IN (
          SELECT tenant_id
          FROM public.account_tenants
          WHERE account_id = auth.uid()
            AND role IN ('admin', 'member')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rides r
      WHERE r.id = ride_summaries.ride_id
        AND r.tenant_id IN (
          SELECT tenant_id
          FROM public.account_tenants
          WHERE account_id = auth.uid()
            AND role IN ('admin', 'member')
        )
    )
  );
