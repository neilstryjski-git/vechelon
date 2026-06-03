# Vechelon | VoC / MT / IA | Pillar II: The Specs (v1.3.2)

Project: Vechelon — VoC / MT / IA | Current Version: v1.3.2 | Last Sync Date: 2026-04-28 | Status: DRAFT

---

## Reference

This document extends the following committed Bedrock Pillars:
- **Admin Portal Pillar II v1.3.0** — schema, RLS, Supabase Edge Functions
- **Rider Portal Pillar II v1.5.0** — Section 4.10 VoC feedback modal spec

It does not modify those documents. Extensions are additive only, with one exception: the Rider Share feature requires a UI amendment to Rider Portal Pillar II. This is noted explicitly in Section 7 (Sprint 0 Tasks) and flagged as a future amendment.

---

## 1. Multi-Tenancy — Domain Migration

### 1.1 Current State

| Property | Value |
|---|---|
| URL | vechelon.productdelivered.ca/portal/ |
| React Router basename | /portal |
| Tenant loading | SELECT * FROM tenants LIMIT 1 — hardcoded single-tenant |
| Domain owned | vechelon.ca |

### 1.2 Target State

| Property | Value |
|---|---|
| URL pattern | clubname.vechelon.ca |
| React Router basename | / |
| Tenant loading | Subdomain read → tenant lookup by slug |
| Hosting | Vercel (existing) — vechelon.ca DNS moved to Vercel nameservers |

### 1.3 Vercel Configuration

| Step | Action | Sr PM Action Required |
|---|---|---|
| 1 | Move vechelon.ca DNS to Vercel nameservers (ns1.vercel-dns.com, ns2.vercel-dns.com) at Porkbun | 🧑 Sr PM — Porkbun nameserver update |
| 2 | Add vechelon.ca apex domain to Vercel project | The Hands |
| 3 | Add *.vechelon.ca wildcard domain to Vercel project | The Hands |
| 4 | Add admin.vechelon.ca as explicit subdomain | The Hands |
| 5 | Configure vechelon.ca root redirect to vechelon.productdelivered.ca | The Hands |

**Cost:** Free. Wildcard SSL included on all Vercel plans with Vercel nameservers. No upgrade required.

**DNS propagation:** 24–48 hours. The Hands must produce an explicit Sr PM action list (Stride tasks) before cutover. Step 1 is the critical Sr PM action — nameserver change at Porkbun.

### 1.4 Supabase Auth Updates

| Setting | Current | Target |
|---|---|---|
| Redirect URLs whitelist | vechelon.productdelivered.ca | *.vechelon.ca, admin.vechelon.ca |
| Magic link base URL | vechelon.productdelivered.ca/portal | Tenant-aware — generated per subdomain |
| Site URL | vechelon.productdelivered.ca/portal | racer-sportif.vechelon.ca (primary tenant) |

---

## 2. Multi-Tenancy — Subdomain Routing

### 2.1 Routing Logic

```
racer-sportif.vechelon.ca  → slug = 'racer-sportif'  → load Racer Sportif tenant
bikes-and-beers.vechelon.ca → slug = 'bikes-and-beers' → load Bikes & Beers tenant
admin.vechelon.ca           → Platform Admin surface — no tenant context on load
vechelon.ca                 → redirect to vechelon.productdelivered.ca
```

### 2.2 Tenant Lookup Query (replaces LIMIT 1)

```sql
SELECT * FROM tenants WHERE slug = [extracted-subdomain]
```

If no match: render a user-friendly "Club not found" page with CTA — "Looking for your club? Contact your club admin or visit vechelon.ca." No tenant data is exposed.

### 2.3 Cross-Club Email Validation

Each club requires a dedicated email. An email already registered on the platform under a different tenant may not be associated with a new tenant.

**Trigger:** Admin attempts to invite an email that exists in `accounts` but has no `account_tenants` record for the current tenant.

**Validation logic (server-side — Edge Function or RLS):**
1. Check if the email exists in `accounts`
2. If yes, check if an `account_tenants` record exists for the current `tenant_id`
3. If no record exists → reject the invitation
4. Return: "This email is already registered on the Vechelon platform. Please use a dedicated email for this club."
5. Do not reveal which club the email belongs to — data sovereignty applies to error messages.

**Note:** This applies to all tenants including test tenants. Bikes & Beers requires dedicated email accounts.

---

## 3. Multi-Tenancy — Tenant Provisioning (Phase 1)

### 3.1 New Tenant Checklist

| Step | Action | Sr PM Action Required |
|---|---|---|
| 1 | Insert new row into `tenants` table — name, slug, branding fields, enrollment_mode | — |
| 2 | Seed branding — primary_color, accent_color, logo_url | 🧑 Sr PM — provide branding assets before this step |
| 3 | Create first admin account — insert into `accounts`, link via `account_tenants` | — |
| 4 | Add subdomain to Vercel project | — |
| 5 | Verify SSL certificate issued by Vercel | — |
| 6 | Test tenant isolation — confirm RLS prevents cross-tenant data access | — |
| 7 | Confirm auth redirect URLs cover new subdomain | — |

### 3.2 Bikes & Beers Seed Values

| Field | Value |
|---|---|
| name | Bikes & Beers |
| slug | bikes-and-beers |
| primary_color | TBD — Sr PM to provide |
| accent_color | TBD — Sr PM to provide |
| logo_url | TBD — Sr PM supplies all graphics and branding assets. The Hands must request asset handoff before seeding. |
| enrollment_mode | open |
| show_calendar_to_pending | false |

### 3.3 Real Club Provisioning (Phase 1)

The Hands-provisioned path is valid for real production clubs. A club can be onboarded via the checklist in Section 3.1 before Phase 2 UI tools exist. Timing at Sr PM discretion.

**Constraint:** `neil.stryjski@gmail.com` must not be seeded as an account at any future production club tenant. Future clubs are provisioned with their own dedicated admin accounts only. This email holds Club Admin at Racer Sportif and Bikes & Beers exclusively.

---

## 4. Multi-Tenancy — Platform Admin

### 4.1 Schema Addition

| Field | Type | Notes |
|---|---|---|
| platform_admin | Boolean | Default: false. Grants access to admin.vechelon.ca. Does not determine access level within a tenant. |

Brain-defined HLD schema extension. No Pillar V Amendment required.

### 4.2 Platform Admin Access Model

Platform Admin access level within each tenant is determined by the Platform Admin's existing `account_tenants` record — not the `platform_admin` flag.

**Access resolution logic (on tenant selection):**
```
1. Platform Admin selects a tenant in the selector
2. System checks account_tenants WHERE account_id = [platform_admin_account_id]
   AND tenant_id = [selected_tenant_id]
3. If record exists → inherit that role with full permissions
   (Club Admin → full read/write on that tenant's admin surface)
4. If no record exists → read-only admin view
```

**Current state:**
- Racer Sportif: `neil.stryjski@gmail.com` holds Club Admin → full write access
- Bikes & Beers: `neil.stryjski@gmail.com` holds Club Admin → full write access
- Future production clubs: no account seeded → read-only by default

**What Platform Admin can always see (regardless of role):**
- All tenants in the selector
- Basic stats per tenant — ride count, member count by affiliation tier

**What Platform Admin cannot do regardless of role:**
- Access ride participant location data (4-hour purge applies universally)
- Access `analytics_events` (Sr PM service role only)

**Club Creation (Phase 1 — Subject to Sprint 0 LOE Gate):**
A lightweight "Create Club" form at admin.vechelon.ca covering slug, club name, and enrollment mode. The Hands assess LOE in Sprint 0. Ships Phase 1 if LOE is low; defers to Phase 2 if not.

### 4.3 RLS Extension for Platform Admin

```sql
-- Platform admin bypass policy (additive — does not modify existing policies)
CREATE POLICY "platform_admin_read_all"
ON [table]
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM accounts
    WHERE id = auth.uid()
    AND platform_admin = true
  )
);
```

Applied to: tenants, rides, accounts, account_tenants, route_library, ride_participants (non-location fields only).

**Explicitly excluded from Platform Admin RLS bypass:** `analytics_events`. Sr PM accesses via service role only.

---

## 5. Voice of Customer (VoC)

### 5.1 GitHub Issues Integration

**Repository:** github.com/neilstryjski-git/vechelon/issues
**Authentication:** GitHub PAT with `issues:write` scope — stored in Supabase Vault, never exposed to client.

**Issue Labels Required:**

| Label | Description |
|---|---|
| type:bug | Bug report |
| type:feature-request | Feature request |
| theme:navigation | Theme tag |
| theme:performance | Theme tag |
| theme:ride-management | Theme tag |
| theme:membership-admin | Theme tag |
| theme:other | Theme tag |
| club:racer-sportif | Submitted by Racer Sportif member |
| club:bikes-and-beers | Submitted by Bikes & Beers member |
| source:voc | All app-submitted feedback |

### 5.2 Supabase Edge Function — voc-submit

**Request payload:**
```json
{
  "type": "bug" | "feature-request",
  "theme": "navigation" | "performance" | "ride-management" | "membership-admin" | "other" | null,
  "title": "string (required, max 200 chars)",
  "detail": "string (optional, max 2000 chars)"
}
```

**Logic:**
1. Validate JWT — reject if unauthenticated (401)
2. Validate caller is Active & Affiliated — reject if not (403)
3. Enforce rate limit — max 5 per account per hour; reject if exceeded (429 — "Please wait before submitting again")
4. Read tenant slug from `account_tenants`
5. Construct and POST GitHub Issue with labels
6. Return success or error to client (500 — "Something went wrong, please try again")

### 5.3 Rate Limiting Schema

| Field | Type | Notes |
|---|---|---|
| last_voc_submission | Timestamp | Nullable. Updated on successful submission. Rate limit clock starts on success only. |

Brain-defined HLD schema extension. No Pillar V Amendment required.

---

## 6. Innovation Accounting (IA)

### 6.1 Design Principles

- One table. No third-party tool. No UI in Phase 1.
- Every event carries tenant_id — multi-tenant from day one.
- Sr PM queries via Supabase SQL editor using service role.
- Only events that directly serve the four hypotheses are logged.
- `analytics_events` is not accessible by club members, club admins, or the Platform Admin surface.
- **Extensible by design:** Adding a new hypothesis requires no schema change. New event types use the same table with a new `event_type` value and relevant `metadata` fields. This is an LLD task — no Brain re-engagement required.
- **Test tenant exclusion:** IA events from Bikes & Beers carry `tenant_id = [bikes-and-beers-uuid]`. All four SQL views support filtering by tenant_name. To exclude test data: `WHERE tenant_name != 'Bikes & Beers'`. This is the standard usage pattern for production analysis.

### 6.2 Schema — analytics_events

```sql
CREATE TABLE analytics_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT        NOT NULL,
  user_id     UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_tenant_type ON analytics_events (tenant_id, event_type);
CREATE INDEX idx_analytics_events_created ON analytics_events (created_at DESC);
```

**RLS:**
- INSERT: authenticated users
- SELECT: service role only
- No platform_admin bypass

### 6.3 Event Catalog

| Event Type | Fires When | Hypotheses | Key Metadata Fields |
|---|---|---|---|
| `broadcast_copy` | Admin clicks Copy Broadcast button | H1, H4 | `ride_id`, `minutes_since_ride_created` |
| `portal_visit` | Portal loads — any source | H2, H3, H4 | `ride_id` (if present), `source` (see Section 4 taxonomy), `rider_type` (member\|guest\|unknown), `ref` (rider_hash, if source=social) |
| `portal_gpx_download` | Rider downloads GPX | H3 | `ride_id`, `download_source` (broadcast\|route_library) |
| `portal_nav_external` | Rider taps nav link | H3 | `ride_id`, `nav_type` (google_maps\|garmin) |
| `portal_rsvp` | Rider completes RSVP | H2, H3 | `ride_id`, `rider_type` (member\|guest) |
| `ride_closed` | Ride closes | H4 | `ride_id`, `participant_count`, `guest_count` |
| `rider_share` | Rider taps Share button on ride card | H3 (organic reach) | `ride_id`, `sharer_hash` (rider's deterministic hash) |

**Implementation notes:**
- Broadcast source is inferred by reading `?source=broadcast` from `window.location.search` on portal load
- Rider Share URLs carry `?source=social&ref=[rider_hash]` — both fields captured in `portal_visit` metadata
- `user_id` is nullable for guest events
- `ride_closed` hook: The Hands assess the existing ride close flow for a clean hook point before implementing (IA-S0-04a)
- **Session-scope attribution for H5:** When a `portal_visit` fires with `source=social` and a `ref` hash, subsequent actions (`portal_rsvp`, `portal_gpx_download`, `portal_nav_external`) in the same browser session are attributed to that ref. The session context is maintained client-side for the duration of the visit. The Hands determine the exact session management approach (LLD).

### 6.4 Rider Share — URL Generation

When a rider taps the Share button on a ride card:

```
Generated URL: racer-sportif.vechelon.ca/ride/[ride-id]?source=social&ref=[rider_hash]
```

**Rider hash generation (LLD — The Hands determine the exact implementation):**
- Deterministic one-way hash of `user_id`
- Not reversible from the URL alone
- Traceable back to the rider by The Hands via a lookup function using service role if needed
- Must not expose the raw `user_id`

### 6.5 IA SQL Views — Delivered by The Hands

All four views are built and tested by The Hands. Sr PM queries via Supabase SQL editor with service role.

**Standard usage pattern — exclude test tenant:**
```sql
SELECT * FROM ia_h1_time_to_broadcast WHERE tenant_name != 'Bikes & Beers';
```

---

**View 1 — ia_h1_time_to_broadcast**
*H1: Admin Adoption — time from ride creation to broadcast copy.*

```sql
CREATE VIEW ia_h1_time_to_broadcast AS
SELECT
  ae.tenant_id,
  t.name                                           AS tenant_name,
  r.id                                             AS ride_id,
  r.title                                          AS ride_title,
  r.created_at                                     AS ride_created_at,
  ae.created_at                                    AS broadcast_at,
  ROUND(
    EXTRACT(EPOCH FROM (ae.created_at - r.created_at)) / 60.0, 1
  )                                                AS minutes_to_broadcast,
  ae.user_id                                       AS admin_user_id
FROM analytics_events ae
JOIN rides r  ON (ae.metadata ->> 'ride_id')::UUID = r.id
JOIN tenants t ON ae.tenant_id = t.id
WHERE ae.event_type = 'broadcast_copy'
ORDER BY ae.created_at DESC;
```

---

**View 2 — ia_h2_broadcast_pull**
*H2: Broadcast-to-Portal Pull — did the broadcast drive riders to the ride-specific portal page.*

```sql
CREATE VIEW ia_h2_broadcast_pull AS
SELECT
  r.tenant_id,
  t.name                                                          AS tenant_name,
  r.id                                                            AS ride_id,
  r.title                                                         AS ride_title,
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
FROM rides r
JOIN tenants t ON r.tenant_id = t.id
LEFT JOIN analytics_events ae ON (ae.metadata ->> 'ride_id')::UUID = r.id
GROUP BY r.tenant_id, t.name, r.id, r.title, r.created_at
ORDER BY r.created_at DESC;
```

---

**View 3 — ia_h3_portal_engagement**
*H3: Portal Engagement — what riders do after arriving.*

```sql
CREATE VIEW ia_h3_portal_engagement AS
SELECT
  ae.tenant_id,
  t.name                                 AS tenant_name,
  (ae.metadata ->> 'ride_id')::UUID      AS ride_id,
  r.title                                AS ride_title,
  ae.event_type,
  ae.metadata ->> 'source'              AS visit_source,
  ae.metadata ->> 'download_source'     AS download_source,
  ae.metadata ->> 'nav_type'            AS nav_type,
  ae.metadata ->> 'rider_type'          AS rider_type,
  ae.metadata ->> 'ref'                 AS sharer_ref,
  COUNT(*)                               AS event_count,
  COUNT(DISTINCT ae.user_id)             AS unique_users
FROM analytics_events ae
JOIN tenants t ON ae.tenant_id = t.id
LEFT JOIN rides r ON (ae.metadata ->> 'ride_id')::UUID = r.id
WHERE ae.event_type IN (
  'portal_visit', 'portal_gpx_download', 'portal_nav_external',
  'portal_rsvp', 'rider_share'
)
GROUP BY
  ae.tenant_id, t.name,
  (ae.metadata ->> 'ride_id')::UUID, r.title,
  ae.event_type,
  ae.metadata ->> 'source',
  ae.metadata ->> 'download_source',
  ae.metadata ->> 'nav_type',
  ae.metadata ->> 'rider_type',
  ae.metadata ->> 'ref'
ORDER BY ae.tenant_id, ride_id, ae.event_type;
```

---

**View 4 — ia_h4_diversion_signal**
*H4: Information Diversion — attendance vs. broadcast click-through ratio.*

```sql
CREATE VIEW ia_h4_diversion_signal AS
SELECT
  r.tenant_id,
  t.name                                                                AS tenant_name,
  r.id                                                                  AS ride_id,
  r.title                                                               AS ride_title,
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
      (rc.metadata ->> 'participant_count')::NUMERIC /
      NULLIF(COUNT(CASE WHEN ae.event_type = 'portal_visit'
                          AND ae.metadata ->> 'source' = 'broadcast' THEN 1 END), 0),
      2
    )
  END                                                                   AS attendance_to_click_ratio
FROM rides r
JOIN tenants t ON r.tenant_id = t.id
LEFT JOIN analytics_events rc
  ON (rc.metadata ->> 'ride_id')::UUID = r.id
  AND rc.event_type = 'ride_closed'
LEFT JOIN analytics_events ae
  ON (ae.metadata ->> 'ride_id')::UUID = r.id
GROUP BY
  r.tenant_id, t.name, r.id, r.title, r.created_at,
  rc.metadata ->> 'participant_count',
  rc.metadata ->> 'guest_count'
ORDER BY r.created_at DESC;
```

*Reading the signal: ratio > 2.0 warrants investigation. **Provisional threshold — calibrate against real Racer Sportif data after the first several rides before treating as a decision trigger.** Use alongside H2 context.*

---

**View 5 — ia_h5_organic_reach**
*H5: Organic Reach — do riders arriving via a shared link engage, or just view.*

```sql
CREATE VIEW ia_h5_organic_reach AS
SELECT
  ae.tenant_id,
  t.name                                     AS tenant_name,
  ae.metadata ->> 'ref'                      AS sharer_ref,
  (ae.metadata ->> 'ride_id')::UUID          AS ride_id,
  r.title                                    AS ride_title,
  COUNT(DISTINCT ae.user_id)                 AS unique_social_visitors,
  COUNT(CASE WHEN ae.event_type = 'portal_rsvp'          THEN 1 END) AS rsvps,
  COUNT(CASE WHEN ae.event_type = 'portal_gpx_download'  THEN 1 END) AS gpx_downloads,
  COUNT(CASE WHEN ae.event_type = 'portal_nav_external'  THEN 1 END) AS nav_taps,
  COUNT(CASE WHEN ae.event_type IN (
    'portal_rsvp', 'portal_gpx_download', 'portal_nav_external'
  ) THEN 1 END)                              AS total_engaged_actions
FROM analytics_events ae
JOIN tenants t ON ae.tenant_id = t.id
LEFT JOIN rides r ON (ae.metadata ->> 'ride_id')::UUID = r.id
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
  r.title
ORDER BY total_engaged_actions DESC;
```

*Usage: `SELECT * FROM ia_h5_organic_reach WHERE tenant_name != 'Bikes & Beers';`*

*Reading the signal: sharer_ref values with high total_engaged_actions identify your advocate members — riders generating engaged visits, not just link forwards. Rows with unique_social_visitors > 0 but total_engaged_actions = 0 indicate the share created views but no engagement.*

---

## 7. Sprint 0 Tasks

Sr PM actions are marked 🧑. All other tasks are The Hands.

| # | Task | Sr PM Action |
|---|---|---|
| MT-S0-01 | Vercel nameserver migration — move vechelon.ca DNS to Vercel nameservers at Porkbun. Add apex and wildcard domains. Produce Sr PM Stride task list before cutover. | 🧑 Porkbun nameserver update |
| MT-S0-02 | Supabase Auth redirect URL update — update redirect URLs and magic link base URL to cover *.vechelon.ca and admin.vechelon.ca. | — |
| MT-S0-03 | Subdomain routing implementation — replace LIMIT 1 with slug-based lookup. Implement "Club not found" page with CTA. | — |
| MT-S0-04 | React Router basename change — update from /portal to /. Validate all existing routes. | — |
| MT-S0-05 | Bikes & Beers tenant seed — request branding assets from Sr PM. Seed tenant, branding, first admin. Verify SSL. Test RLS isolation. | 🧑 Provide branding assets |
| MT-S0-06 | Platform Admin schema extension — add platform_admin boolean to accounts table. Add last_voc_submission timestamp. Brain-defined HLD — no Pillar V required. | — |
| MT-S0-07 | Platform Admin RLS policies — implement read-all bypass for platform_admin = true. Exclude analytics_events. Confirm location fields excluded. | — |
| MT-S0-08 | Platform Admin surface build — build admin.vechelon.ca with tenant selector, role-inherited access per tenant, read-only fallback if no account_tenants record. | — |
| MT-S0-08a | Platform Admin — Club Creation LOE assessment — assess LOE for lightweight "Create Club" form. Flag to Sr PM in session before locking into scope. | 🧑 LOE decision in session |
| MT-S0-09 | GitHub Issues labels setup — create all required labels (type, theme, club, source) before Edge Function deployment. | — |
| MT-S0-10 | VoC Edge Function — voc-submit — implement voc-submit. Store GitHub PAT in Vault. Test affiliation check, rate limiting, theme label, error handling. | — |
| MT-S0-11 | Cross-club email validation — implement server-side check. Reject invitations for emails with existing accounts at other tenants. Return graceful error — do not reveal which club. | — |
| MT-S0-12 | Staging subdomain validation — deploy to staging before production cutover. Validate auth, routing, branding, VoC. | — |
| MT-S0-13 | Production cutover coordination — coordinate DNS cutover with Sr PM. UAT on new domain before publicising. | 🧑 UAT sign-off before publicising |
| IA-S0-01 | analytics_events table and indexes — create table with schema in Section 6.2. Apply RLS — INSERT authenticated, SELECT service role only. Create indexes. | — |
| IA-S0-02 | Broadcast source parameter — LOE assessment required. Assess how the broadcast WhatsApp URL is generated. Determine whether appending ?source=broadcast is trivial or requires structural change. Flag LOE to Sr PM in session before proceeding to IA-S0-03. Also assess ?source=ridecard and ?source=captain for QR-generated URLs. | 🧑 LOE decision in session |
| IA-S0-03 | Client-side event instrumentation — instrument portal_visit (read source + ref from URL on load), portal_gpx_download, portal_nav_external, portal_rsvp. Fire to analytics_events with correct metadata per event catalog. | — |
| IA-S0-04 | Server-side event instrumentation — instrument broadcast_copy (Admin Portal button handler) and ride_closed. Fire to analytics_events with correct metadata. | — |
| IA-S0-04a | ride_closed event hook — LOE assessment required. Assess current ride close flow for a clean hook point. If no clean hook exists, identify workaround and flag to Sr PM in session before proceeding. H4 depends on this event. | 🧑 LOE decision in session if workaround needed |
| IA-S0-05 | Rider Share feature — implement Share button on ride card for non-admin riders. Remove broadcast copy button from rider-facing UI. Generate ride-specific URL with ?source=social&ref=[rider_hash]. Instrument rider_share event. Propose ride card share content to Sr PM before implementing. | 🧑 Approve ride card share content |
| IA-S0-06 | SQL views build and delivery — build all five IA views (ia_h1 through ia_h5) per Section 6.5. Test against seeded Bikes & Beers data. Confirm Sr PM can query via Supabase SQL editor with service role. Validate tenant exclusion pattern. | — |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-21 | 11:00 | ADD | Pillar II initialised. | TPM |
| v1.1.0 | 2026-04-24 | 00:00 | CHANGE | DNS Stride tasks. Real clubs. Club not found CTA. Branding assets. Pillar V language removed. Rate limit 5/hour. Club Creation LOE gate. Theme labels. Sprint 0 updated. | TPM |
| v1.2.0 | 2026-04-24 | 00:00 | ADD | Innovation Accounting — analytics_events schema, event catalog, four SQL views, Sprint 0 IA tasks. analytics_events excluded from Platform Admin RLS. | TPM |
| v1.2.1 | 2026-04-24 | 00:00 | CHANGE | IA-S0-02 LOE risk flag. IA-S0-04a added. H4 threshold marked provisional. | TPM |
| v1.2.2 | 2026-04-24 | 00:00 | CHANGE | Report-back framing removed — Sr PM is present in session, The Hands flag in session. | TPM |
| v1.3.1 | 2026-04-24 | 00:00 | ADD | H5 — Organic Reach. Session-scope attribution note added to event catalog. ia_h5_organic_reach view added (Section 6.5). IA-S0-06 updated — now covers five views. | TPM |
| v1.3.0 | 2026-04-24 | 00:00 | ADD / CHANGE | Bikes & Beers rename throughout. Platform Admin access model updated — role inherited from account_tenants, not granted by platform_admin flag. Section 2.3 added — cross-club email validation spec and graceful error. Section 3.1 — Sr PM action column added to provisioning checklist. Section 3.2 — neil.stryjski@gmail.com scoping constraint added. Section 3.3 — constraint on future club provisioning. Section 6.1 — IA extensibility principle and test tenant exclusion pattern added. Event catalog — rider_share event added, portal_visit updated for ref/social. Section 6.4 — Rider Share URL generation. SQL views — social_visits column added to H2 and H4. H3 view updated for rider_share and ref. Sprint 0 — Sr PM action column added. MT-S0-11 cross-club email task added. MT-S0-13 renamed from MT-S0-12. IA-S0-05 Rider Share task added. IA-S0-06 renamed from IA-S0-05. | TPM |
| v1.3.2 | 2026-04-28 | 00:00 | CHANGE | §6.4 Rider Share URL — corrected `/rides/[ride-id]` to `/ride/[ride-id]` to align with the actual codebase route (`admin/src/App.tsx:181` → `Route path="ride/:rideId"`). Recorded in Pillar IV as VMT-D-43. | The Hands (Claude Code) |
