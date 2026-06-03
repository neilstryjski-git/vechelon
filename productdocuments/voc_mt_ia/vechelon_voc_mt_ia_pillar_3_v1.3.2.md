# Vechelon | VoC / MT / IA | Pillar III: The Quality Gate (v1.3.2)

Project: Vechelon — VoC / MT / IA | Current Version: v1.3.2 | Last Sync Date: 2026-04-28 | Status: DRAFT

---

## Reference

BDD scenarios for existing ride, member, and portal flows are defined in Admin Portal Pillar III v1.4.0 and Rider Portal Pillar III v1.4.0. This document covers only scenarios specific to VoC, Multi-Tenancy, Innovation Accounting, and Rider Share.

---

## 1. Definition of Done

A feature in this Pillar set is not [COMMITTED] until:

1. **Strategic Lead (PM):** Data sovereignty confirmed — no cross-tenant leakage. Platform Admin access is role-inherited and does not affect club member experience. IA events not accessible outside Sr PM service role. Cross-club email validation tested and returns graceful error without revealing source club.
2. **Structural Lead (Engineering):** RLS bypass policies tested for platform_admin. analytics_events RLS confirmed — INSERT authenticated, SELECT service role only. All four IA SQL views tested against live data. Subdomain routing tested for all known tenants and unknown subdomains. VoC Edge Function validated against GitHub Issues API. Schema extensions are Brain-defined — no Pillar V required. Pillar V triggered only when The Hands deviate from the Brain's spec during LLD.
3. **Experience & Validation Lead (Design/QA):** All BDD scenarios pass. Auth flows validated on new subdomains. Staging cutover validated before production. Edge test cases executed by Sr PM and marked complete in Stride.

---

## 2. BDD Scenario Index

| # | Feature Area | Scenario | Priority | QA Type |
|---|---|---|---|---|
| MT-01 | Subdomain Routing | App loads correct tenant from subdomain | P0 | Automated |
| MT-02 | Subdomain Routing | Unknown subdomain shows club not found | P0 | Automated |
| MT-03 | Subdomain Routing | Root domain redirects correctly | P0 | Automated |
| MT-04 | Tenant Isolation | Rider cannot access another tenant's data | P0 | Automated |
| MT-05 | Tenant Isolation | Club Admin authority scoped to own tenant | P0 | Automated |
| MT-06 | Platform Admin | Platform Admin accesses admin surface | P0 | Automated |
| MT-07 | Platform Admin | Platform Admin role inherited from account_tenants | P0 | Automated |
| MT-08 | Platform Admin | Platform Admin cannot access location data | P0 | Automated |
| MT-09 | Platform Admin | Admin surface not advertised or accessible from club portal | P0 | Automated |
| MT-10 | Platform Admin | Rider access tier reflects club role | P0 | Automated |
| MT-11 | Domain Migration | Auth magic link works on new subdomain | P0 | 🧑 Human — Stride |
| MT-12 | Domain Migration | Existing session requires re-login after migration | P1 | 🧑 Human — Stride |
| MT-13 | Bikes & Beers | Test tenant loads with correct branding | P0 | 🧑 Human — Stride |
| MT-14 | Bikes & Beers | Test tenant data isolated from Racer Sportif | P0 | Automated |
| MT-15 | Cross-Club Email | Cross-club email invitation rejected gracefully | P0 | Automated |
| PA-01 | Platform Admin | Platform Admin promotes an existing user | P0 | 🧑 Human — Stride |
| VOC-01 | VoC Submission | Affiliated member submits bug report | P0 | Automated |
| VOC-02 | VoC Submission | Affiliated member submits feature request with theme tag | P0 | Automated |
| VOC-03 | VoC Submission | Rate limiting prevents spam (5/hour per user) | P0 | Automated |
| VOC-04 | VoC Submission | Non-affiliated user cannot submit | P0 | Automated |
| VOC-05 | VoC Submission | Submission labelled with correct club slug | P0 | Automated |
| VOC-06 | VoC Submission | GitHub API failure handled gracefully | P1 | Automated |
| IA-01 | Innovation Accounting | broadcast_copy event fires correctly | P0 | Automated |
| IA-02 | Innovation Accounting | portal_visit fires with correct source and ref | P0 | Automated |
| IA-03 | Innovation Accounting | Portal engagement events fire correctly | P0 | Automated |
| IA-04 | Innovation Accounting | All IA events carry correct tenant_id | P0 | Automated |
| IA-05 | Innovation Accounting | analytics_events not accessible outside service role | P0 | Automated |
| IA-06 | Innovation Accounting | Sr PM SQL views return accurate data | P0 | 🧑 Human — Stride |
| IA-07 | Innovation Accounting | H5 organic reach view attributes session actions to sharer | P0 | 🧑 Human — Stride |
| RS-01 | Rider Share | Share button appears on ride card for non-admin riders | P0 | Automated |
| RS-02 | Rider Share | Share button not visible to admins on ride card | P0 | Automated |
| RS-03 | Rider Share | Broadcast copy button not visible to non-admin riders | P0 | Automated |
| RS-04 | Rider Share | Generated share URL contains source=social and ref=[hash] | P0 | Automated |
| RS-05 | Rider Share | rider_share event fires correctly | P0 | Automated |
| RS-06 | Rider Share | Social visit attributed to correct sharer hash | P0 | Automated |

---

## 3. BDD Scenarios

### Feature: Subdomain Routing

**Scenario MT-01: App loads correct tenant from subdomain**
```
Given a user navigates to racer-sportif.vechelon.ca
Then the app reads 'racer-sportif' from window.location.hostname
And loads Racer Sportif branding — logo, primary colour, accent colour
And all data queries are scoped to Racer Sportif tenant_id

Given a user navigates to bikes-and-beers.vechelon.ca
Then the app loads with Bikes & Beers branding
And all data queries are scoped to Bikes & Beers tenant_id
```

**Scenario MT-02: Unknown subdomain shows club not found**
```
Given a user navigates to unknown-club.vechelon.ca
Then the app renders a user-friendly "Club not found" page
And the page includes a CTA — "Looking for your club? Contact your club admin or visit vechelon.ca"
And does not fall back to any other tenant
And does not expose any tenant data
```

**Scenario MT-03: Root domain redirects correctly**
```
Given a user navigates to vechelon.ca
Then the app redirects to vechelon.productdelivered.ca
And no club portal content is rendered
```

---

### Feature: Tenant Isolation

**Scenario MT-04: Rider cannot access another tenant's data**
```
Given a rider is authenticated and affiliated with Racer Sportif
When they attempt to query rides, members, or routes
Then RLS returns only records where tenant_id = Racer Sportif tenant_id
And no Bikes & Beers records are returned
And no error reveals the existence of other tenants
```

**Scenario MT-05: Club Admin authority scoped to own tenant**
```
Given a Club Admin is authenticated at racer-sportif.vechelon.ca
When they access member management, ride management, or route library
Then they see only Racer Sportif data
And they have no visibility into or ability to modify another tenant's records
```

---

### Feature: Platform Admin

**Scenario MT-06: Platform Admin accesses admin surface**
```
Given Neil Stryjski is authenticated with platform_admin = true
When he navigates to admin.vechelon.ca
Then the Platform Admin surface loads
And a tenant selector is visible showing all tenants
And Racer Sportif is the default loaded tenant
```

**Scenario MT-07: Platform Admin role inherited from account_tenants**
```
Given Neil Stryjski is on the Platform Admin surface
When he selects Racer Sportif from the tenant selector
Then the system checks account_tenants for neil.stryjski@gmail.com at Racer Sportif
And finds a Club Admin record
Then full Club Admin access is granted — read and write controls are presented

When he selects Bikes & Beers
Then the system checks account_tenants for neil.stryjski@gmail.com at Bikes & Beers
And finds a Club Admin record
Then full Club Admin access is granted

Given a future production club where neil.stryjski@gmail.com has no account_tenants record
When Neil selects that tenant
Then read-only admin view is presented — no write controls
```

**Scenario MT-08: Platform Admin cannot access location data**
```
Given Neil Stryjski is on the Platform Admin surface
When he views ride participant data for any tenant
Then location fields are not returned regardless of inherited role
And the 4-hour purge constraint applies universally
```

**Scenario MT-09: Admin surface not advertised or accessible from club portal**
```
Given any authenticated user at any club subdomain
Then no link, reference, or navigation element pointing to admin.vechelon.ca is rendered
And the club portal UI is identical regardless of platform_admin status

Given any user with platform_admin = false navigates directly to admin.vechelon.ca
Then they are redirected to a not-authorised page
And no Platform Admin UI is rendered
```

**Scenario MT-10: Rider access tier reflects club role**
```
Given any authenticated member navigates to their club subdomain
Then their access tier defaults to Active Member (Tier 3) if affiliated,
  or the appropriate lower tier if not yet affiliated

Given Neil Stryjski navigates to racer-sportif.vechelon.ca
Then he sees the standard Rider Desktop Portal — no Platform Admin UI
And the platform_admin flag has no effect within the club portal
```

---

### Feature: Domain Migration

**Scenario MT-11: Auth magic link works on new subdomain** 🧑 Human — Stride
```
Given a member requests a magic link at racer-sportif.vechelon.ca
When the email arrives
Then the link URL is racer-sportif.vechelon.ca (not vechelon.productdelivered.ca/portal)
When the member clicks the link
Then they are authenticated and land on the Rider Desktop Portal
```

**Scenario MT-12: Existing session requires re-login after migration** 🧑 Human — Stride
```
Given a member had an active session at vechelon.productdelivered.ca/portal
After the domain migration
When the member navigates to racer-sportif.vechelon.ca
Then they are prompted to log in again
  Note: Session cookies are domain-scoped. One-time re-login is expected behaviour — not a defect.
And their account data and ride history are unaffected
```

---

### Feature: Bikes & Beers Test Tenant

**Scenario MT-13: Test tenant loads with correct branding** 🧑 Human — Stride
```
Given The Hands have seeded Bikes & Beers with Sr PM-provided branding assets
When a user navigates to bikes-and-beers.vechelon.ca
Then the app loads with Bikes & Beers branding — logo, colours
And all data queries are scoped to Bikes & Beers tenant_id
And no Racer Sportif data is visible
```

**Scenario MT-14: Test tenant data isolated from Racer Sportif**
```
Given a test ride has been created in the Bikes & Beers tenant
When queried from a Racer Sportif authenticated session
Then the test ride is not returned
And vice versa
```

---

### Feature: Cross-Club Email Validation

**Scenario MT-15: Cross-club email invitation rejected gracefully**
```
Given a Club Admin at Racer Sportif attempts to invite an email
  that already exists in accounts under a different tenant
When the invitation is submitted
Then the server-side validation detects the email exists in accounts
  but has no account_tenants record for the current tenant_id
And returns: "This email is already registered on the Vechelon platform.
  Please use a dedicated email for this club."
And does not reveal which club the email is associated with
And does not create a partial invitation record
And the same validation applies to Bikes & Beers and all future tenants
```

---

### Feature: Platform Admin — Promotion

**Scenario PA-01: Platform Admin promotes an existing user** 🧑 Human — Stride
```
Given Neil Stryjski needs to grant platform_admin access to an existing account
When The Hands execute:
  UPDATE accounts SET platform_admin = true WHERE id = [account_id]
Then the target account gains access to admin.vechelon.ca on next login
And the change is auditable in the accounts table
  Note: Phase 1 promotion is a direct DB action by The Hands — no UI.

Given the promotion has been applied
When the promoted account navigates to admin.vechelon.ca and authenticates
Then the Platform Admin surface loads as specified in MT-06
```

---

### Feature: Voice of Customer

**Scenario VOC-01: Affiliated member submits bug report**
```
Given an Active and Affiliated member is logged in at any club subdomain or Admin Dashboard
When they tap the feedback icon
Then a modal opens with Type selector, Theme selector (optional), Title, Detail
When the member selects "Bug Report", enters a title, taps Submit
Then a GitHub Issue is created with:
  type:bug, theme:[selected] (if any), club:[tenant-slug], source:voc
And the member sees "Thanks — your feedback has been submitted"
```

**Scenario VOC-02: Affiliated member submits feature request with theme tag**
```
Given an affiliated member submits with type "Feature Request" and theme "Ride Management"
Then a GitHub Issue is created with:
  type:feature-request, theme:ride-management, club:[tenant-slug], source:voc

Given the member does not select a theme
Then the GitHub Issue is created without a theme label
```

**Scenario VOC-03: Rate limiting prevents spam**
```
Given an affiliated member has successfully submitted 5 times in the current rolling hour
When they attempt a 6th submission
Then the Edge Function returns 429
And the app surfaces "Please wait before submitting again"
And no GitHub Issue is created
And submission count is not incremented
```

**Scenario VOC-04: Non-affiliated user cannot submit**
```
Given a Tier 1 or Tier 2 user is viewing the portal
Then the feedback icon is not rendered

Given a non-affiliated user calls voc-submit directly
Then the Edge Function returns 403 and no issue is created
```

**Scenario VOC-05: Submission labelled with correct club slug**
```
Given an affiliated member at racer-sportif.vechelon.ca submits
Then the issue is labelled club:racer-sportif
  Note: Club label is derived server-side from account_tenants — cannot be spoofed.

Given an affiliated member at bikes-and-beers.vechelon.ca submits
Then the issue is labelled club:bikes-and-beers
```

**Scenario VOC-06: GitHub API failure handled gracefully**
```
Given the GitHub Issues API is unavailable
When an affiliated member submits
Then the Edge Function returns 500
And the app surfaces "Something went wrong, please try again"
And the submission count is not incremented
```

---

### Feature: Innovation Accounting

**Scenario IA-01: broadcast_copy event fires correctly**
```
Given a Club Admin clicks the Copy Broadcast button on a ride
Then a broadcast_copy event is inserted into analytics_events with:
  event_type: 'broadcast_copy'
  user_id: [admin's account id]
  tenant_id: [admin's tenant id]
  metadata.ride_id: [ride id]
  metadata.minutes_since_ride_created: [calculated at fire time]
And the event is not visible to any user in any UI
```

**Scenario IA-02: portal_visit fires with correct source and ref**
```
Given a rider clicks a broadcast URL containing ?source=broadcast&ride_id=[id]
When the portal loads
Then a portal_visit event fires with:
  metadata.source: 'broadcast'
  metadata.ride_id: [ride id]
  metadata.rider_type: 'member' or 'guest'

Given a rider arrives via a Rider Share URL containing ?source=social&ref=[hash]
Then a portal_visit event fires with:
  metadata.source: 'social'
  metadata.ref: [rider_hash]
  metadata.ride_id: [ride id if present]

Given a rider navigates directly (no source parameter)
Then portal_visit fires with metadata.source: 'direct'
```

**Scenario IA-03: Portal engagement events fire correctly**
```
Given a rider clicks the GPX download button
Then portal_gpx_download fires with metadata.ride_id and metadata.download_source

Given a rider taps a navigation link
Then portal_nav_external fires with metadata.ride_id and metadata.nav_type

Given a rider completes an RSVP
Then portal_rsvp fires with metadata.ride_id and metadata.rider_type
```

**Scenario IA-04: All IA events carry correct tenant_id**
```
Given any IA event fires from racer-sportif.vechelon.ca
Then tenant_id matches Racer Sportif in the tenants table

Given any IA event fires from bikes-and-beers.vechelon.ca
Then tenant_id matches Bikes & Beers

No IA event may be inserted without a valid tenant_id — foreign key enforces this.
```

**Scenario IA-05: analytics_events not accessible outside service role**
```
Given any authenticated club member, club admin, or platform admin
  attempts to query analytics_events via JWT
Then RLS returns zero rows — no error, no data

Given the Sr PM queries via Supabase SQL editor with service role
Then all events are returned without restriction
```

**Scenario IA-06: Sr PM SQL views return accurate data** 🧑 Human — Stride
```
Given The Hands have seeded test events for a known ride in Bikes & Beers:
  - 1 broadcast_copy event, 5 minutes after ride creation
  - 3 portal_visit events with source='broadcast'
  - 1 portal_visit with source='social' and ref=[hash]
  - 2 portal_rsvp events with rider_type='member'
  - 1 ride_closed event with participant_count=8

When Sr PM queries ia_h1_time_to_broadcast WHERE tenant_name = 'Bikes & Beers'
Then minutes_to_broadcast = 5.0

When Sr PM queries ia_h2_broadcast_pull WHERE tenant_name = 'Bikes & Beers'
Then broadcasts_sent=1, broadcast_visits=3, social_visits=1, total_rsvps=2

When Sr PM queries ia_h4_diversion_signal WHERE tenant_name = 'Bikes & Beers'
Then attendees=8, broadcast_portal_visits=3, attendance_to_click_ratio=2.67
```

---

**Scenario IA-07: H5 organic reach view attributes session actions to sharer** 🧑 Human — Stride
```
Given The Hands have seeded the following events for a known ride in Bikes & Beers:
  - 1 portal_visit with source='social', ref=[hash_A], user_id=[rider_B]
  - 1 portal_rsvp with ref=[hash_A], rider_type='member', user_id=[rider_B]
  - 1 portal_gpx_download with ref=[hash_A], user_id=[rider_B]

When Sr PM queries ia_h5_organic_reach WHERE tenant_name = 'Bikes & Beers'
Then the row for sharer_ref=[hash_A] shows:
  unique_social_visitors = 1
  rsvps = 1
  gpx_downloads = 1
  nav_taps = 0
  total_engaged_actions = 2

And the row demonstrates that rider B's actions are attributed to rider A's sharer hash
And rider B's user_id is the visitor — not rider A's

Given a second social visit with ref=[hash_A] but no subsequent actions
Then unique_social_visitors increments
And total_engaged_actions remains unchanged
  Note: This is the "view only" signal — share generated a visit but no engagement.
```

---

### Feature: Rider Share

**Scenario RS-01: Share button appears on ride card for non-admin riders**
```
Given an Active and Affiliated non-admin rider is viewing a ride card
Then a Share button is visible on the ride card
```

**Scenario RS-02: Share button not visible to admins on ride card**
```
Given a Club Admin is viewing a ride card in their admin surface
Then the Share button is not rendered
And the broadcast copy button is present as before
```

**Scenario RS-03: Broadcast copy button not visible to non-admin riders**
```
Given a non-admin affiliated rider is viewing a ride card
Then the broadcast copy button is not rendered
And the Share button is present in its place
```

**Scenario RS-04: Generated share URL contains source=social and ref=[hash]**
```
Given an affiliated rider taps the Share button on a ride card
Then the generated URL is:
  [tenant-slug].vechelon.ca/ride/[ride-id]?source=social&ref=[rider_hash]
And the rider_hash is a deterministic one-way hash of the rider's user_id
And the raw user_id is not present in the URL
```

**Scenario RS-05: rider_share event fires correctly**
```
Given an affiliated rider taps the Share button
Then a rider_share event is inserted into analytics_events with:
  event_type: 'rider_share'
  user_id: [rider's account id]
  tenant_id: [rider's tenant id]
  metadata.ride_id: [ride id]
  metadata.sharer_hash: [rider_hash]
```

**Scenario RS-06: Social visit attributed to correct sharer hash**
```
Given rider A shared a ride URL via the Share button with ref=[hash_A]
When rider B clicks that URL and the portal loads
Then a portal_visit event fires with metadata.source='social' and metadata.ref=[hash_A]
And the ref value matches the sharer_hash in rider A's rider_share event
And rider B's user_id is recorded as the visitor — not rider A's
```

---

## 4. Critical Test Paths

| # | Critical Path | Why |
|---|---|---|
| CP-MT-01 | RLS prevents cross-tenant data access | Data sovereignty — core trust proposition |
| CP-MT-02 | Unknown subdomain never exposes tenant data | Security |
| CP-MT-03 | Platform Admin cannot access location data | Privacy |
| CP-MT-04 | Admin surface not advertised; non-PA users cannot reach it | Access control |
| CP-MT-05 | Magic link auth works on new subdomains | Auth post-migration |
| CP-MT-06 | Cross-club email rejection does not reveal source club | Data sovereignty in error messages |
| CP-MT-07 | Platform Admin role inheritance — write only where account_tenants record exists | Access control integrity |
| CP-VoC-01 | VoC requires Active and Affiliated status | Integrity |
| CP-VoC-02 | Club slug on VoC derived server-side | Security — cannot be spoofed |
| CP-IA-01 | analytics_events INSERT permitted for authenticated users | Events must fire reliably |
| CP-IA-02 | analytics_events SELECT blocked for all non-service-role callers | Privacy |
| CP-IA-03 | tenant_id is always set on every IA event | Multi-tenant integrity |
| CP-IA-04 | broadcast_copy metadata includes minutes_since_ride_created | H1 depends on this field |
| CP-RS-01 | Rider hash is one-way — raw user_id not exposed in URL | Privacy |
| CP-RS-02 | Broadcast copy button absent from rider-facing ride card | UI integrity |

---

## 5. Edge Cases for Manual QA

Edge cases marked 🧑 are Stride tasks. Created by The Hands, assigned to Sr PM, moved to "ready to review" when the dependent code is testable.

| Scenario | Expected Behaviour | QA Type |
|---|---|---|
| Member navigates to wrong club subdomain | Sees public landing. Cannot authenticate without affiliation. | Automated |
| Platform Admin submits VoC from club subdomain | Submitted as a normal affiliated member. No elevated effect. | Automated |
| DNS propagation incomplete during cutover | Both URLs must remain functional during propagation window. | 🧑 Human — Stride |
| Member attempts to access admin.vechelon.ca | Redirected. No data exposed. | Automated |
| VoC submission with empty title | Client-side and server-side both validate. | Automated |
| Tenant slug contains uppercase or spaces | The Hands enforce lowercase, hyphen-separated at seed time. | 🧑 Human — Stride |
| Member submits exactly 5 VoC in one hour | All 5 succeed. 6th rejected with 429. | Automated |
| IA event fires but tenant_id cannot be resolved | FK constraint prevents INSERT. Error logged. No silent failure. | Automated |
| Rider arrives via broadcast link but is not authenticated | portal_visit fires with rider_type='unknown'. user_id null. Valid event. | Automated |
| ride_closed fires with participant_count = 0 | Event inserted. H4 view shows 0 attendees — valid data point. | Automated |
| Rider forwards broadcast URL manually (not via Share button) | URL retains ?source=broadcast. Logs as broadcast visit, not social. Expected. | 🧑 Human — Stride |
| Parameter stripped by messaging app | Link reads as 'direct'. Acceptable noise — not a failure. | 🧑 Human — Stride |
| Admin invites email already registered at another tenant | Graceful error. No club name revealed. No partial record created. | Automated |
| neil.stryjski@gmail.com invited to future production club | The Hands must not seed this email at future clubs. Verified at provisioning. | 🧑 Human — Stride |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-21 | 11:00 | ADD | Pillar III initialised — 20 BDD scenarios, 7 critical test paths. | TPM |
| v1.1.0 | 2026-04-24 | 00:00 | CHANGE | Definition of Done updated. MT-09 broadened. MT-10 reframed. PA-01 added. VOC-02 theme tag. VOC-03 5/hour. Edge cases expanded. | TPM |
| v1.2.0 | 2026-04-24 | 00:00 | ADD | IA-01 through IA-06 added. IA critical test paths. IA edge cases. | TPM |
| v1.3.1 | 2026-04-24 | 00:00 | ADD | IA-07 added — H5 organic reach scenario, session-scoped attribution to sharer hash, view-only vs engaged signal. | TPM |
| v1.3.0 | 2026-04-24 | 00:00 | ADD / CHANGE | Bikes & Beers rename throughout. QA Type column added to scenario index — human vs automated. Edge cases table: Sr PM Stride task column added. MT-07 rewritten — role inherited from account_tenants. MT-15 added — cross-club email validation. IA-02 updated — social source and ref parameter. IA-06 updated — social_visits in expected data. RS-01 through RS-06 added — Rider Share BDD scenarios. Critical test paths: CP-MT-06 (cross-club email error), CP-MT-07 (role inheritance), CP-RS-01 and CP-RS-02 (Rider Share). Edge cases updated — forwarded broadcast URL, parameter stripping, cross-club email, neil.stryjski scoping. | TPM |
| v1.3.2 | 2026-04-28 | 00:00 | CHANGE | RS-04 BDD — corrected `/rides/[ride-id]` to `/ride/[ride-id]` to align with the actual codebase route (`admin/src/App.tsx:181` → `Route path="ride/:rideId"`). Recorded in Pillar IV as VMT-D-43. | The Hands (Claude Code) |
