-- W134 (IA-S0-06) — Innovation Accounting SQL views (ia_h1 through ia_h5)
--
-- Closes the IA Phase 1 loop end-to-end. All five views are defined verbatim
-- from VoC/MT/IA Pillar II §6.5. Sr PM queries via Supabase SQL editor with
-- service role.
--
-- All views use WITH (security_invoker = true) so RLS on analytics_events is
-- enforced for the calling role. Service_role bypasses RLS and gets full data;
-- any authenticated/anon caller is blocked at the underlying analytics_events
-- table policy (CP-IA-02 — no SELECT policy for non-service-role).
--
-- Standard usage pattern (excludes the test tenant):
--   SELECT * FROM ia_h1_time_to_broadcast WHERE tenant_name != 'Bikes & Beers';
--
-- W126 lesson: ALWAYS specify security_invoker on views over RLS-protected
-- tables. Without it, Postgres ≥15 may evaluate the view as security-definer
-- (using the view owner's privileges), bypassing RLS and leaking data.

-- ─────────────────────────────────────────────────────────────────────────────
-- View 1 — ia_h1_time_to_broadcast
-- H1: Admin Adoption — time from ride creation to broadcast copy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ia_h1_time_to_broadcast
WITH (security_invoker = true) AS
SELECT
  ae.tenant_id,
  t.name                                           AS tenant_name,
  r.id                                             AS ride_id,
  r.name                                           AS ride_title,
  r.created_at                                     AS ride_created_at,
  ae.created_at                                    AS broadcast_at,
  ROUND(
    (EXTRACT(EPOCH FROM (ae.created_at - r.created_at)) / 60.0)::NUMERIC, 1
  )                                                AS minutes_to_broadcast,
  ae.user_id                                       AS admin_user_id
FROM public.analytics_events ae
JOIN public.rides r   ON (ae.metadata ->> 'ride_id')::UUID = r.id
JOIN public.tenants t ON ae.tenant_id = t.id
WHERE ae.event_type = 'broadcast_copy'
ORDER BY ae.created_at DESC;

COMMENT ON VIEW public.ia_h1_time_to_broadcast IS
  'IA H1 — Admin Adoption. Per ride: how long after ride creation did the admin click Copy Broadcast. See Pillar II §6.5. Recommended use: SELECT * FROM ia_h1_time_to_broadcast WHERE tenant_name != ''Bikes & Beers'';';

-- ─────────────────────────────────────────────────────────────────────────────
-- View 2 — ia_h2_broadcast_pull
-- H2: Broadcast-to-Portal Pull — did the broadcast drive ride-specific visits.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ia_h2_broadcast_pull
WITH (security_invoker = true) AS
SELECT
  r.tenant_id,
  t.name                                                          AS tenant_name,
  r.id                                                            AS ride_id,
  r.name                                                          AS ride_title,
  r.created_at                                                    AS ride_created_at,
  COUNT(CASE WHEN ae.event_type = 'broadcast_copy'             THEN 1 END) AS broadcasts_sent,
  COUNT(CASE WHEN ae.event_type = 'portal_visit'
               AND ae.metadata ->> 'source' = 'broadcast'     THEN 1 END) AS broadcast_visits,
  COUNT(CASE WHEN ae.event_type = 'portal_visit'
               AND ae.metadata ->> 'source' = 'social'        THEN 1 END) AS social_visits,
  COUNT(CASE WHEN ae.event_type = 'portal_rsvp'               THEN 1 END) AS total_rsvps,
  COUNT(CASE WHEN ae.event_type = 'portal_rsvp'
               AND ae.metadata ->> 'rider_type' = 'member'    THEN 1 END) AS member_rsvps,
  COUNT(CASE WHEN ae.event_type = 'portal_rsvp'
               AND ae.metadata ->> 'rider_type' = 'guest'     THEN 1 END) AS guest_rsvps
FROM public.rides r
JOIN public.tenants t ON r.tenant_id = t.id
LEFT JOIN public.analytics_events ae ON (ae.metadata ->> 'ride_id')::UUID = r.id
GROUP BY r.tenant_id, t.name, r.id, r.name, r.created_at
ORDER BY r.created_at DESC;

COMMENT ON VIEW public.ia_h2_broadcast_pull IS
  'IA H2 — Broadcast-to-Portal Pull. Per ride: broadcasts sent vs portal visits split by source vs RSVPs split by rider_type. See Pillar II §6.5.';

-- ─────────────────────────────────────────────────────────────────────────────
-- View 3 — ia_h3_portal_engagement
-- H3: Portal Engagement — what riders do after arriving.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ia_h3_portal_engagement
WITH (security_invoker = true) AS
SELECT
  ae.tenant_id,
  t.name                                 AS tenant_name,
  (ae.metadata ->> 'ride_id')::UUID      AS ride_id,
  r.name                                 AS ride_title,
  ae.event_type,
  ae.metadata ->> 'source'              AS visit_source,
  ae.metadata ->> 'download_source'     AS download_source,
  ae.metadata ->> 'nav_type'            AS nav_type,
  ae.metadata ->> 'rider_type'          AS rider_type,
  ae.metadata ->> 'ref'                 AS sharer_ref,
  COUNT(*)                               AS event_count,
  COUNT(DISTINCT ae.user_id)             AS unique_users
FROM public.analytics_events ae
JOIN public.tenants t ON ae.tenant_id = t.id
LEFT JOIN public.rides r ON (ae.metadata ->> 'ride_id')::UUID = r.id
WHERE ae.event_type IN (
  'portal_visit', 'portal_gpx_download', 'portal_nav_external',
  'portal_rsvp', 'rider_share'
)
GROUP BY
  ae.tenant_id, t.name,
  (ae.metadata ->> 'ride_id')::UUID, r.name,
  ae.event_type,
  ae.metadata ->> 'source',
  ae.metadata ->> 'download_source',
  ae.metadata ->> 'nav_type',
  ae.metadata ->> 'rider_type',
  ae.metadata ->> 'ref'
ORDER BY ae.tenant_id, ride_id, ae.event_type;

COMMENT ON VIEW public.ia_h3_portal_engagement IS
  'IA H3 — Portal Engagement. Per ride × event_type × visit_source: how many engagements and unique users. See Pillar II §6.5.';

-- ─────────────────────────────────────────────────────────────────────────────
-- View 4 — ia_h4_diversion_signal
-- H4: Information Diversion — attendance vs broadcast click-through ratio.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ia_h4_diversion_signal
WITH (security_invoker = true) AS
SELECT
  r.tenant_id,
  t.name                                                                AS tenant_name,
  r.id                                                                  AS ride_id,
  r.name                                                                AS ride_title,
  r.created_at                                                          AS ride_created_at,
  (rc.metadata ->> 'participant_count')::INT                            AS attendees,
  (rc.metadata ->> 'guest_count')::INT                                  AS guests,
  COUNT(CASE WHEN ae.event_type = 'broadcast_copy'              THEN 1 END) AS broadcasts_sent,
  COUNT(CASE WHEN ae.event_type = 'portal_visit'
               AND ae.metadata ->> 'source' = 'broadcast'       THEN 1 END) AS broadcast_portal_visits,
  COUNT(CASE WHEN ae.event_type = 'portal_visit'
               AND ae.metadata ->> 'source' = 'social'          THEN 1 END) AS social_portal_visits,
  CASE
    WHEN COUNT(CASE WHEN ae.event_type = 'portal_visit'
                      AND ae.metadata ->> 'source' = 'broadcast' THEN 1 END) = 0
    THEN NULL
    ELSE ROUND(
      ((rc.metadata ->> 'participant_count')::NUMERIC /
       NULLIF(COUNT(CASE WHEN ae.event_type = 'portal_visit'
                           AND ae.metadata ->> 'source' = 'broadcast' THEN 1 END), 0))::NUMERIC,
      2
    )
  END                                                                   AS attendance_to_click_ratio
FROM public.rides r
JOIN public.tenants t ON r.tenant_id = t.id
LEFT JOIN public.analytics_events rc
  ON (rc.metadata ->> 'ride_id')::UUID = r.id
  AND rc.event_type = 'ride_closed'
LEFT JOIN public.analytics_events ae
  ON (ae.metadata ->> 'ride_id')::UUID = r.id
GROUP BY
  r.tenant_id, t.name, r.id, r.name, r.created_at,
  rc.metadata ->> 'participant_count',
  rc.metadata ->> 'guest_count'
ORDER BY r.created_at DESC;

COMMENT ON VIEW public.ia_h4_diversion_signal IS
  'IA H4 — Information Diversion. Per ride: attendance vs broadcast portal visits ratio. Reading the signal: ratio > 2.0 warrants investigation, but treat as PROVISIONAL until calibrated against real Racer Sportif data per Pillar II §6.5 footnote.';

-- ─────────────────────────────────────────────────────────────────────────────
-- View 5 — ia_h5_organic_reach
-- H5: Organic Reach — do riders arriving via shared links engage or just view.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ia_h5_organic_reach
WITH (security_invoker = true) AS
SELECT
  ae.tenant_id,
  t.name                                     AS tenant_name,
  ae.metadata ->> 'ref'                      AS sharer_ref,
  (ae.metadata ->> 'ride_id')::UUID          AS ride_id,
  r.name                                     AS ride_title,
  COUNT(DISTINCT ae.user_id)                 AS unique_social_visitors,
  COUNT(CASE WHEN ae.event_type = 'portal_rsvp'          THEN 1 END) AS rsvps,
  COUNT(CASE WHEN ae.event_type = 'portal_gpx_download'  THEN 1 END) AS gpx_downloads,
  COUNT(CASE WHEN ae.event_type = 'portal_nav_external'  THEN 1 END) AS nav_taps,
  COUNT(CASE WHEN ae.event_type IN (
    'portal_rsvp', 'portal_gpx_download', 'portal_nav_external'
  ) THEN 1 END)                              AS total_engaged_actions
FROM public.analytics_events ae
JOIN public.tenants t ON ae.tenant_id = t.id
LEFT JOIN public.rides r ON (ae.metadata ->> 'ride_id')::UUID = r.id
WHERE
  ae.metadata ->> 'source' = 'social'
  OR (
    ae.metadata ->> 'ref' IS NOT NULL
    AND ae.event_type IN (
      'portal_rsvp', 'portal_gpx_download', 'portal_nav_external'
    )
  )
GROUP BY
  ae.tenant_id, t.name,
  ae.metadata ->> 'ref',
  (ae.metadata ->> 'ride_id')::UUID,
  r.name
ORDER BY total_engaged_actions DESC;

COMMENT ON VIEW public.ia_h5_organic_reach IS
  'IA H5 — Organic Reach. Per sharer_ref × ride: did the share generate engaged visits or just views. Rows with unique_social_visitors > 0 but total_engaged_actions = 0 indicate views-only shares. See Pillar II §6.5 + VMT-D-38.';
