-- D41: extend analytics_events RLS INSERT allowlist with 'query_timeout'
--
-- D41 hardens RideLanding.tsx mount-time fetches with AbortController + retry
-- + unified error UI, and writes a telemetry event on every query timeout /
-- failure so we can measure false-positive rate in production. The event_type
-- 'query_timeout' is new and must be added to BOTH the anon and authenticated
-- INSERT policies — the headline scenario (iOS Safari on marginal network,
-- broadcast link, no session) is anon, but authenticated riders on the same
-- portal need it too.
--
-- Pattern 5 (idempotency): this migration recreates both INSERT policies that
-- W142 (20260504171403_analytics_events_tighten_insert.sql) created. The
-- DROP POLICY IF EXISTS at top makes the migration safe to replay on any
-- environment regardless of starting state.
--
-- !! CANONICAL SOURCE OF TRUTH !!
-- This file (D41) supersedes W142 as the canonical definition of the
-- analytics_events INSERT policies. Future additions to the event_type
-- allowlist MUST either:
--   (a) supersede this file with a newer migration that redefines BOTH
--       policies in full (mirror the pattern below), OR
--   (b) be added in-place to BOTH policy bodies before the next deploy.
-- Do NOT add a new migration that only patches one of the two policies, or
-- one that creates a third redefinition that omits values present here.
-- Drift between anon and authenticated allowlists is the failure mode this
-- header is preventing — rider_share is already missing from W142 anon (a
-- pre-existing gap, not addressed by D41).

DROP POLICY IF EXISTS analytics_events_insert_anon          ON public.analytics_events;
DROP POLICY IF EXISTS analytics_events_insert_authenticated ON public.analytics_events;

CREATE POLICY analytics_events_insert_anon ON public.analytics_events
  FOR INSERT TO anon
  WITH CHECK (
    event_type IN (
      'portal_visit',
      'portal_rsvp',
      'portal_gpx_download',
      'portal_nav_external',
      'query_timeout'
    )
    AND EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id)
  );

CREATE POLICY analytics_events_insert_authenticated ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    event_type IN (
      'portal_visit',
      'portal_rsvp',
      'portal_gpx_download',
      'portal_nav_external',
      'broadcast_copy',
      'query_timeout'
    )
    AND tenant_id IN (
      SELECT tenant_id FROM public.account_tenants WHERE account_id = auth.uid()
    )
  );
