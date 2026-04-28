-- W120 (IA-S0-01) — Innovation Accounting analytics_events table
--
-- Single-table foundation for IA event instrumentation per VoC/MT/IA Pillar II §6.2.
-- All events (broadcast_copy, portal_visit, portal_gpx_download, portal_nav_external,
-- portal_rsvp, ride_closed, rider_share) write to this table.
--
-- RLS rules per §6.1 + §4.3:
--   INSERT: any authenticated user (events must fire reliably from client + server)
--   SELECT: service_role ONLY — Sr PM queries via Supabase SQL editor with service role
--   No platform_admin bypass — explicitly excluded per VMT-D-23 / Pillar II §4.3
--
-- user_id is nullable: guest portal_visits and ride_closed events have no user attribution.
-- tenant_id is NOT NULL with FK: enforces multi-tenant integrity per CP-IA-03.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT        NOT NULL,
  user_id     UUID        REFERENCES public.accounts(id) ON DELETE SET NULL,
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id),
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_type
  ON public.analytics_events (tenant_id, event_type);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON public.analytics_events (created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user. Client-side IA fires (portal_visit, portal_rsvp,
-- portal_gpx_download, portal_nav_external, rider_share) need this to succeed
-- under a normal JWT. Server-side fires (broadcast_copy, ride_closed via trigger)
-- run under service role and bypass RLS regardless.
CREATE POLICY "analytics_events_insert_authenticated"
  ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- SELECT: service_role only. Confirms CP-IA-02 — analytics_events SELECT blocked
-- for all non-service-role callers (BDD scenario IA-05). Note: NO policy is created
-- for the authenticated role, which means SELECT returns 0 rows for any JWT-authed
-- caller — including platform_admin. This is the explicit exclusion from VMT-D-23.

COMMENT ON TABLE public.analytics_events IS
  'Innovation Accounting event log. INSERT permitted for authenticated users (clients fire events via JWT); SELECT restricted to service_role only — even platform_admin cannot read this table per VMT-D-23. Sr PM queries via Supabase SQL editor with service role. See VoC/MT/IA Pillar II §6.';

COMMENT ON COLUMN public.analytics_events.event_type IS
  'Event identifier. Catalog (Pillar II §6.3): broadcast_copy, portal_visit, portal_gpx_download, portal_nav_external, portal_rsvp, ride_closed, rider_share. Schema is extensible: new event types use the same table with a new event_type value and relevant metadata fields per VMT-D-27 — no schema change needed.';

COMMENT ON COLUMN public.analytics_events.user_id IS
  'Optional account reference. Nullable: guest portal_visits have no user_id. ON DELETE SET NULL preserves the historical event when an account is removed.';

COMMENT ON COLUMN public.analytics_events.metadata IS
  'JSONB blob for event-specific context. Per Pillar II §6.3: ride_id, source, ref (rider_hash), rider_type, download_source, nav_type, minutes_since_ride_created, participant_count, guest_count, sharer_hash, auto_closed.';
