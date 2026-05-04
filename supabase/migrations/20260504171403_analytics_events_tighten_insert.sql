-- W142 / MT-H-04: analytics_events INSERT tightening (audit C1, W120 follow-up)
--
-- Pre-migration state: both anon and authenticated INSERT policies had
-- WITH CHECK (true) — anyone could write events with arbitrary event_type
-- and arbitrary tenant_id, polluting the H1–H5 IA hypotheses with garbage
-- or spoofed signal.
--
-- Tightened policies:
-- - event_type constrained to the 5 client-side events the SPA actually
--   fires (per admin/src/lib/analyticsEvents.ts):
--   portal_visit, portal_rsvp, portal_gpx_download, portal_nav_external,
--   broadcast_copy.
-- - Anon excludes broadcast_copy (only admins fire it via RideFormModal /
--   RideDetailSideSheet).
-- - tenant_id must reference a real tenants.id row for both roles.
--
-- Authenticated path constrains tenant_id to the caller's account_tenants rows
-- (any status — initiated members also generate legitimate IA events, per pitfall 3).
-- Cross-tenant authenticated writes are rejected: legitimate cross-tenant attribution
-- (H4 diversion analysis) flows through the anon path (guest QR scans arrive unauthed).
--
-- Server-side ride_closed Postgres trigger (W132) runs as service role,
-- bypasses RLS, and is unaffected by this migration.
--
-- Idempotency (Pattern 5): defensive DROP POLICY IF EXISTS at top.

DROP POLICY IF EXISTS analytics_events_insert_anon          ON public.analytics_events;
DROP POLICY IF EXISTS analytics_events_insert_authenticated ON public.analytics_events;

CREATE POLICY analytics_events_insert_anon ON public.analytics_events
  FOR INSERT TO anon
  WITH CHECK (
    event_type IN (
      'portal_visit',
      'portal_rsvp',
      'portal_gpx_download',
      'portal_nav_external'
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
      'broadcast_copy'
    )
    AND tenant_id IN (
      SELECT tenant_id FROM public.account_tenants WHERE account_id = auth.uid()
    )
  );
