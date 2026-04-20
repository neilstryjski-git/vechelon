# Vechelon | Internal Roadmap (v1.3.0)

Project: Vechelon | Current Version: v1.3.0 | Last Sync Date: 2026-04-20 | Status: COMMITTED

**Source of truth for all roadmap decisions. The public roadmap is a rendered view of this document.
If it is not here, it is not on the public roadmap. Changes via MACD only.**

---

## Status Key

| Status | Meaning |
|---|---|
| 🔴 Not Started | Not yet in build |
| 🟡 In Build | Actively being developed |
| 🟢 Complete | Shipped and validated |
| ⏸ Blocked | Gated on external dependency |
| 📋 Scoped | Specified in Bedrock, not yet in build |

---

## v1.0 — Club Command

**Theme:** The desktop foundation. Club administrators manage rides, series, and members. Riders RSVP from the browser. The ride day experience culminates in QR join.

**Status:** 🟡 In Build — MVE validated with Racer Sportif, April 2026. Core flow functional end to end. UAT in progress — refinements ongoing. The Hands to confirm remaining items before closing to Complete.

### Features

| # | Feature | Surface | Status | Bedrock Reference |
|---|---|---|---|---|
| 1.01 | Calendar view — monthly grid, ride management | Admin Portal | 🟢 Complete | Admin Pillar II §10.6 |
| 1.02 | Ride creation — GPX upload and manual path | Admin Portal | 🟢 Complete ✓ demo | Admin Pillar II §7 |
| 1.03 | Series creator — recurring ride scheduling | Admin Portal | 🟢 Complete | Admin Pillar II §7 |
| 1.04 | Route library — upload and management | Admin Portal | 🟢 Complete | Admin Pillar II §7 |
| 1.05 | Member directory — full contact details | Admin Portal | 🟢 Complete | Admin Pillar II §10.6 |
| 1.06 | Pre-ride WhatsApp summary — AI generated, copy to clipboard | Admin Portal | 🟢 Complete ✓ demo | Admin Pillar II §9 |
| 1.07 | Post-ride WhatsApp summary — AI generated, copy to clipboard | Admin Portal | 🟢 Complete | Admin Pillar II §9 |
| 1.08 | Rider Desktop Portal — profile management | Rider Portal | 🟢 Complete | Rider Pillar II §4.2 |
| 1.09 | Rider Desktop Portal — RSVP for rides | Rider Portal | 🟢 Complete ✓ demo | Rider Pillar II §4.6 |
| 1.10 | Rider Desktop Portal — calendar view (read-only) | Rider Portal | 🟢 Complete ✓ demo | Rider Pillar II §4.4 |
| 1.11 | Rider Desktop Portal — route library browse and download | Rider Portal | 🟢 Complete ✓ demo | Rider Pillar II §4.7 |
| 1.12 | Rider Desktop Portal — member directory (names only) | Rider Portal | 🔴 Not Started | Rider Pillar II §4.8 |
| 1.13 | Rider Desktop Portal — three-tier access model | Rider Portal | 🟢 Complete | Rider Pillar I §4 |
| 1.14 | Rider Desktop Portal — club-contextual account creation | Rider Portal | 🟢 Complete | Rider Pillar III RP-04 |
| 1.15 | QR join flow — guest and member | Both | 🟢 Complete ✓ demo | Admin Pillar II §10.5 |
| 1.16 | Hard purge — 4-hour automated deletion | Backend | 🟡 In Build | Edge function deployed; cron schedule not confirmed active in Supabase — `cron_verification.sql` still commented out |
| 1.17 | Midnight UTC auto-close | Backend | 🟡 In Build | Edge function deployed; cron schedule not confirmed active in Supabase — `cron_verification.sql` still commented out |
| 1.18 | Multi-tenancy foundation — single tenant, Racer Sportif | Backend | 🟢 Complete ✓ demo | Admin Pillar II §11 |

### Foundations

| # | Work | Status | Notes |
|---|---|---|---|
| F1.01 | Supabase project initialisation — auth, realtime, storage, edge functions | 🟢 Complete | |
| F1.02 | React web app scaffolding — Admin Portal | 🟢 Complete | |
| F1.03 | React web app scaffolding — Rider Desktop Portal | 🟢 Complete | |
| F1.04 | Google Maps API integration — map rendering and geocoding | 🟡 In Build | Integration complete; $150 GCP billing alert cannot be verified from codebase — manual GCP console check required |
| F1.05 | Open-Meteo integration — weather at ride close | 🟢 Complete | Fetched in `generate-ride-summary` edge function at ride close |
| F1.06 | License Bringer AI abstraction layer — multi-provider | 🟢 Complete ✓ demo | WhatsApp summary generated in demo |
| F1.07 | CSS custom properties — tenant branding injection | 🟢 Complete ✓ demo | Racer Sportif branding live |
| F1.08 | RLS policies — full suite for MVP tables | 🟢 Complete | Full suite confirmed across tenants, accounts, rides, route_library, ride_participants, waypoints, ride_summaries, ride_support; dev bypasses removed April 2026 |
| F1.09 | Supabase Edge Functions — midnight auto-close cron | 🟡 In Build | Function deployed; cron schedule not confirmed active — `cron_verification.sql` is commented out, manual Supabase SQL editor step required |
| F1.10 | Supabase Edge Functions — 4-hour purge cron | 🟡 In Build | Function deployed; cron schedule not confirmed active — `cron_verification.sql` is commented out, manual Supabase SQL editor step required |
| F1.11 | Hosting — Admin and Rider Portal deployment | 🟢 Complete | Live at vechelon.productdelivered.ca/portal |
| F1.12 | Error monitoring — Sentry free tier | 🔴 Not Started | No Sentry SDK or configuration found anywhere in the codebase |
| F1.13 | Racer Sportif DB seed — brand assets, tenant config | 🟢 Complete ✓ demo | |

---

## v2.0 — Tactical (Android)

**Theme:** The live ride. React Native mobile app, Android-first. The tactical map goes live — fleet tracking, Support Beacon, Captain mobile controls.

**Status:** ⏸ Blocked — external platform consultation gate

### Features

| # | Feature | Surface | Status | Bedrock Reference |
|---|---|---|---|---|
| 2.01 | Live tactical map — fleet tracking, state-aware icons | Mobile | ⏸ Blocked | Admin Pillar II §10 |
| 2.02 | Rider states — Active, Stopped, Inactive, Dark | Mobile | ⏸ Blocked | Admin Pillar II §8 |
| 2.03 | Support Beacon — trigger and cancel | Mobile | ⏸ Blocked | Admin Pillar II §10.3 |
| 2.04 | Bottom sheet — contact triage, monospace phone, Dial button | Mobile | ⏸ Blocked | Admin Pillar II §10.3 |
| 2.05 | Captain mobile — Ad Hoc ride creation | Mobile | ⏸ Blocked | Admin Pillar II §10.1 |
| 2.06 | Captain mobile — end ride | Mobile | ⏸ Blocked | Admin Pillar II §10.1 |
| 2.07 | Captain mobile — SAG assignment | Mobile | ⏸ Blocked | Admin Pillar II §10.1 |
| 2.08 | Rider mobile feed — RSVP/Join, upcoming rides | Mobile | ⏸ Blocked | Admin Pillar II §10.6 |
| 2.09 | Edge directional indicators — Haversine formula | Mobile | ⏸ Blocked | Admin Pillar II §10.4 |
| 2.10 | Blue dot — self-position for all roles | Mobile | ⏸ Blocked | Admin Pillar II §10.2 |

### Foundations

| # | Work | Status | Notes |
|---|---|---|---|
| F2.01 | React Native platform decision — external consultation | ⏸ Blocked | Gate condition for entire v2.0 track. |
| F2.02 | React Native project scaffolding — Android-first | ⏸ Blocked | |
| F2.03 | Background GPS validation — Android, 2–6 hour session | ⏸ Blocked | Safety-critical. Core technical risk. |
| F2.04 | Supabase Realtime — fleet heartbeat, 5-second ping | ⏸ Blocked | Validate against battery drain and latency NFRs. |
| F2.05 | State management — live map position updates | ⏸ Blocked | React Query / Zustand / Supabase Realtime hooks. |
| F2.06 | QR code generation library — React Native | ⏸ Blocked | |
| F2.07 | PWA offline graceful degradation | ⏸ Blocked | Last known positions persist on signal drop. |

---

## v2.1 — Tactical (iOS)

**Theme:** iOS release following Android validation. App Store submission.

**Status:** ⏸ Blocked — Android validation required first

### Features

| # | Feature | Surface | Status | Notes |
|---|---|---|---|---|
| 2.1.01 | Full iOS parity with Android v2.0 | Mobile | ⏸ Blocked | All v2.0 features on iOS. |
| 2.1.02 | App Store submission and review | Mobile | ⏸ Blocked | Apple Developer account required. |

### Foundations

| # | Work | Status | Notes |
|---|---|---|---|
| F2.1.01 | Apple Developer account setup | ⏸ Blocked | |
| F2.1.02 | Background GPS validation — iOS, 2–6 hour session | ⏸ Blocked | iOS Safari background behaviour is the primary risk. |
| F2.1.03 | App Store review preparation | ⏸ Blocked | |

---

## v3.0 — Multi-Club

**Theme:** Data sovereignty and multi-tenancy. Racer Sportif moves to production trial. Second club onboarding is possible. Riders can belong to multiple clubs.

**Status:** 📋 Scoped

### Features

| # | Feature | Surface | Status | Bedrock Reference |
|---|---|---|---|---|
| 3.01 | Second club onboarding flow | Admin Portal | 🔴 Not Started | Admin Pillar II §11 |
| 3.02 | Club switcher — rider navigates between clubs | Rider Portal | 🔴 Not Started | Rider Pillar IV RP-D-16 |
| 3.03 | Multi-membership — rider affiliated with multiple clubs | Both | 🔴 Not Started | Rider Pillar II §2 |
| 3.04 | Self-serve branding portal — logo, colours, slug | Admin Portal | 🔴 Not Started | Admin Pillar II §11.3 |
| 3.05 | Independent data isolation per club | Backend | 🔴 Not Started | Rider Pillar IV RP-D-25 |

### Foundations

| # | Work | Status | Notes |
|---|---|---|---|
| F3.01 | account_tenants junction table — Pillar V Amendment required | Backend | 🔴 Not Started | Replaces single tenant_id on accounts. Zero MVP impact. Pillar V Amendment from The Hands before implementation. |
| F3.02 | RLS policy extension — multi-tenant isolation per account_tenants | Backend | 🔴 Not Started | Independent data sovereignty per club. |
| F3.03 | Club switcher UI — nav selector | Rider Portal | 🔴 Not Started | Post-MVP UI on infrastructure already in place. |
| F3.04 | Tenant admin dashboard — club configuration | Admin Portal | 🔴 Not Started | Logo upload, colour picker, URL slug. |

---

## v4.0 — Ride Depth

**Theme:** More complex ride structures. Sub-group Captains, multiple simultaneous rides, series-wide editing, mid-ride SAG management.

**Status:** 📋 Scoped

### Features

| # | Feature | Surface | Status | Bedrock Reference |
|---|---|---|---|---|
| 4.01 | Sub-group Captains — multiple Captains per ride | Mobile | 🔴 Not Started | Admin Pillar IV D-25 |
| 4.02 | Multiple simultaneous rides — more than one active ride per club | Both | 🔴 Not Started | Admin Pillar IV Roadmap |
| 4.03 | Series-wide edit — apply changes to all future instances | Admin Portal | 🔴 Not Started | Admin Pillar IV D-27 |
| 4.04 | Mid-ride SAG reassignment | Mobile | 🔴 Not Started | Admin Pillar IV D-21 |
| 4.05 | Timezone-aware auto-close — tenant local timezone | Backend | 🔴 Not Started | Admin Pillar IV D-16 |
| 4.06 | In-app email notifications — pending affiliations, ride reminders | Both | 🔴 Not Started | Admin Pillar IV Roadmap |
| 4.07 | Geofencing — join restriction by proximity | Mobile | 🔴 Not Started | Admin Pillar I §7 |

### Foundations

| # | Work | Status | Notes |
|---|---|---|---|
| F4.01 | group_id activation — rides and ride_participants | Backend | 🔴 Not Started | Already stubbed as nullable in MVP schema. Activation only. |
| F4.02 | Tenant timezone field — tenants table | Backend | 🔴 Not Started | Required for timezone-aware auto-close. |
| F4.03 | Notification infrastructure — Supabase Auth email triggers | Backend | 🔴 Not Started | Supabase handles natively. |
| F4.04 | Google Maps Geometry API — geofencing | Backend | 🔴 Not Started | Additional Maps API scope. Monitor cost impact. |

---

## v5.0 — Club Growth

**Theme:** Broadening the club experience. Observer role, member-uploaded routes, VoC function, ride history, guest conversion optimisation.

**Status:** 📋 Scoped

### Features

| # | Feature | Surface | Status | Bedrock Reference |
|---|---|---|---|---|
| 5.01 | Observer role — non-riding map monitor | Mobile | 🔴 Not Started | Admin Pillar I §5.6 |
| 5.02 | Member GPX upload — distinct from admin route library | Rider Portal | 🔴 Not Started | Admin Pillar IV D-30 |
| 5.03 | Voice of Customer — idea submission and admin moderation | Both | 🔴 Not Started | Addendum 001 — requires Trio session before spec |
| 5.04 | Ride history on profile — participated rides | Rider Portal | 🔴 Not Started | Rider Pillar II §4.9 |
| 5.05 | Guest view configuration — club admin controls public visibility | Rider Portal | 🔴 Not Started | Rider Pillar IV Roadmap |
| 5.06 | Account claiming post-purge — guest merges historical records | Both | 🔴 Not Started | Admin Pillar IV Roadmap |
| 5.07 | WhatsApp deep-link sharing — direct link into ride join flow | Mobile | 🔴 Not Started | Admin Pillar I §7 |

### Foundations

| # | Work | Status | Notes |
|---|---|---|---|
| F5.01 | ride_participants role extension — Observer type | Backend | 🔴 Not Started | |
| F5.02 | Member GPX storage — Supabase Storage bucket extension | Backend | 🔴 Not Started | Distinct from admin route library. |
| F5.03 | VoC schema — submission model and moderation fields | Backend | 🔴 Not Started | Requires Trio session before spec. |
| F5.04 | Historical ride query — ride_participants join for profile history | Backend | 🔴 Not Started | |

---

## v6.0 — Intelligence

**Theme:** Data, integrations, and strategic features. Strava sync, club analytics, advanced scheduling, and Velo Mode.

**Status:** 📋 Scoped

### Features

| # | Feature | Surface | Status | Bedrock Reference |
|---|---|---|---|---|
| 6.01 | Strava integration — individual activity sync | Mobile | 🔴 Not Started | Admin Pillar IV Roadmap |
| 6.02 | Club analytics dashboard — ride health, beacon events | Admin Portal | 🔴 Not Started | Admin Pillar IV Roadmap |
| 6.03 | Advanced scheduling — bi-weekly, monthly, custom recurrence | Admin Portal | 🔴 Not Started | Admin Pillar IV Roadmap |
| 6.04 | Emergency global kill switch — end all active rides simultaneously | Admin Portal | 🔴 Not Started | Admin Pillar IV Roadmap |
| 6.05 | Tactical paging — in-app alert distinct from Support Beacon | Mobile | 🔴 Not Started | Admin Pillar IV Roadmap |
| 6.06 | Velo Mode — distinct ride experience mode | TBD | 🔴 Not Started | Admin Pillar IV Roadmap — TBD |

### Foundations

| # | Work | Status | Notes |
|---|---|---|---|
| F6.01 | Strava API integration — ToS review required | Backend | 🔴 Not Started | Individual activity only. No public leaderboards per Strava ToS. |
| F6.02 | Historical data model — non-PII club health metrics | Backend | 🔴 Not Started | Purge-safe. Aggregated counts only. |
| F6.03 | Advanced recurrence engine — RRULE or equivalent | Backend | 🔴 Not Started | |
| F6.04 | Notification infrastructure extension — paging system | Backend | 🔴 Not Started | Distinct from email notifications. |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-19 | 12:00 | ADD | Internal roadmap initialised — 7 releases, feature-level status tracking, foundations per release. | TPM |
| v1.1.0 | 2026-04-19 | 13:00 | CHANGE | v1.0 status updated — MVE validated with Racer Sportif demo April 2026. Confirmed complete items marked ✓ demo. Items requiring PM confirmation marked 🟡 Confirm?. | TPM |
| v1.2.0 | 2026-04-19 | 14:00 | CHANGE | v1.0 overall status corrected to In Build — Complete requires Hands assessment and UAT closure. Confirm? items relabelled to In Build. UAT note added to v1.0 status line. | TPM |
| v1.3.0 | 2026-04-20 | 00:00 | CHANGE | The Hands codebase assessment of all v1.0 In Build items. 1.03/1.04/1.05/1.07 confirmed Complete. 1.12 downgraded to Not Started — no rider-facing member directory page exists. F1.05/F1.08 confirmed Complete. 1.16/1.17/F1.09/F1.10 remain In Build — cron schedules unconfirmed. F1.04 remains In Build — GCP billing alert unverifiable from code. F1.12 downgraded to Not Started — no Sentry integration in codebase. | The Hands |
