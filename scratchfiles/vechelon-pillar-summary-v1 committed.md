# Vechelon Pillar Summary — Rail 3 Reference & Handshake Packet (Revised)

> **Filename note:** This file is named `vechelon-pillar-summary-v1.md` and will not be renamed on revision. As a reference document outside the Bedrock, it does not follow the MACD versioning protocol. The title above reflects its current state; the filename is stable for linking and Git traceability.

**Purpose:** Compressed Pillar reference for Rail 3 Brain sessions and handshake packet.
**Source Pillars:** Admin Portal I (v1.2.0), II (v1.3.0), III (v1.4.0), IV (v1.12.0) — all COMMITTED.
**Last Compiled:** 2026-05-12
**Status:** REFERENCE ONLY — not a Bedrock artifact. Does not supersede source Pillars.

> **Compression rule:** Nothing in this document may contradict the source Pillars. Where this document and a source Pillar conflict, the source Pillar governs. Flag any such conflict to the TPM immediately.

---

## ⚠️ Pre-Session Flags for Rail 3 Brain

| # | Flag | Nature |
|---|---|---|
| F-01 | PoC stack contradiction | Memory records PWA PoC (Android Chrome). Rail 3 Brain session artifacts record React Native Expo PoC. These are mutually exclusive. Brain session must confirm which is committed before Rail 3 Pillar III BDD is written. |
| F-02 | Scenario 1 references "PWA technology" | If production stack is React Native, the note "No App Store, Play Store, or install prompt is required" is no longer accurate. Resolution direction: see §9. Rail 3 Brain must formally resolve. |
| F-03 | Scenario 34 references "When the PWA loads" | Tenant branding injection scenario uses PWA framing. PWA remains available but is not the preferred path when the app is installed. Rail 3 Pillar III must address. |
| F-04 | Pillar IV Decision History truncated | Uploaded file contains only D-54 and D-55. Full history recovered from past sessions. Rail 3 Brain should load the full Ledger for completeness. |
| F-05 | Performance NFRs — Rail 3 validation required | D-54 targets confirmed in Admin Portal context. Must be validated on a physical device during a real ride before Rail 3 commits them. |
| F-06 | group_id stub | Nullable stub exists in rides and ride_participants. Rail 3 Brain to confirm read-or-ignore. |
| F-07 | Support Beacon visibility | Committed rule: beacon visible to Captain and SAG only. Open proposal: should it also be visible to other riders? Contradicts current global rule — requires Brain decision before any edit. See §6. |
| F-08 | Dark state and Hard Purge | Committed rule: all location data purged 4 hours post-close, no exceptions. Open question: should dark state last known positions be retained beyond the purge? Privacy model implications — Brain discussion required. See §9, CP-06. |
| F-09 | AI pre-ride summary removed | Feature was purposefully removed from the build. Worth a Brain discussion about whether and how it returns in Rail 3. |
| F-10 | Route overlay on live ride map | Decision was made not to display the route on the live ride map for simplicity. GPX route overlay would be a value add. Brain discussion: complexity and deferral? See §6. |
| F-11 | In-App Communication constraint retired | Originally a North Star hard constraint. Deliberately repositioned as a roadmap item — Vechelon does not carry messages in this phase. See §1.1 and §11. |

---

## Part 1: Immutable Constraints

These constraints apply to all Vechelon surfaces including Rail 3. No Rail 3 decision may contradict them without a formal Brain session and Ledger commit.

### 1.1 North Star Constraints (Pillar I §2)

| Constraint | Rule | Rail 3 Status |
|---|---|---|
| $0 Operating Cost | Platform must run on free-tier infrastructure for a single active club MVP. Paid services require explicit PM approval and Ledger entry. | Active |
| Zero-Friction Participation | Guests must be able to join a live ride without a prior account, app download, or email verification. | Active — resolution required for React Native context. See F-01, F-02, §9. |
| Privacy as Product | All location data and guest session data are purged 4 hours after ride close. Non-negotiable. | Active |
| Tactical Focus | Rail 3 concentrates on the live ride — the true differentiator for Vechelon. Pre-ride planning and club administration are already built and delivered in Rails 1 & 2. This is not an omission; it is intentional sequencing. Post-ride performance archiving remains out of scope. | Active |
| No In-App Communication | Vechelon does not carry messages in this phase. All voice and text coordination uses the rider's native phone dialler and WhatsApp. Vechelon surfaces contact details only. **This is a phase constraint, not a permanent rule — in-app communication is a roadmap item.** See §11. | Phase constraint |

### 1.2 Data Retention Rules (Pillar I §2, Pillar II §12, Pillar III §4 S28–29)

- Location data (last_lat, last_long, last_ping) is permanently deleted 4 hours after ride close.
- Guest account records are **retained** after purge.
- ride_summaries records are **retained** after purge (participant_count, weather_data, summaries).
- No location data is recoverable after purge.
- If ride was auto-closed at midnight UTC, ride_summaries.auto_closed = true.
- Purge applies to all surfaces including Rail 3. ⚠️ Open question F-08: dark state last known positions — Brain discussion required before committing any exception.

### 1.3 Security and Privacy Rules (Pillar II §12)

| Rule | Implementation |
|---|---|
| Row Level Security | Supabase RLS — users access only data where tenant_id matches their own |
| Phone number visibility | API-level enforcement — Captain/SAG see all participant numbers; participants see Captain/SAG only |
| Guest data | Session-scoped location data. Account record persists. Location purged at 4-hour mark. |
| Hard Purge | Supabase Edge Function cron — deletes ride_participants location fields 4 hours post-ride close |
| AI API key | Stored encrypted in tenants table. Never exposed to client. |
| Auth | Supabase Auth. Magic Link recommended. LLD decision. |

### 1.4 Operating Cost Constraints (Pillar II §2)

- Google Maps $200/month credit ceiling. $150 billing alert configured in Google Cloud Console — hard operational rule.
- Cost escape valve: OpenStreetMap + Leaflet.js + Nominatim. No schema change required.
- Open-Meteo: free, no key required.
- Supabase: free tier.
- AI: License Bringer model — tenant provides own API key. $0 AI cost to platform.

### 1.5 Single Active Ride (Pillar II §4)

MVP supports one active ride per club at a time. Multiple simultaneous rides are Post-MVP.

---

## Part 2: User Personas (Pillar I §5)

All personas are active in Rail 3.

### Fab — The Club Admin
- Primary organiser. Manages ride creation, series scheduling, club membership. May or may not ride.
- Device context: Desktop for management. Mobile during live rides.
- Veto power: Mission Veto — kills anything adding administrative friction or scope creep.

### Krys — The Ride Captain
- Elevated Member assigned to a specific ride. Responsible for group cohesion and safety.
- Device context: Mobile, phone mounted on handlebars. May use secondary device for calls.
- Special authority: Can create Ad Hoc rides. Can end a ride. Can cancel a rider's Support Beacon.
- **Rail 3 note:** Krys is not expected to actively monitor the app during the ride. QR is displayed on Krys's personal phone — same device carried in back pocket during the ride. SAG is the primary active map monitor.

### Mike — The Support Van (SAG)
- Designated support person, typically in a vehicle. Optional — primarily relevant on long rides.
- Device context: Mobile or tablet. Hands-free context — UI must be readable at a glance.
- Special authority: Always visible to all riders. Can cancel a rider's Support Beacon. **SAG cannot end a ride.**
- MVP constraint: SAG configured before ride starts. Cannot be reassigned mid-ride. Schema supports multiple SAG records per ride.

### Paddy — The Member Rider
- Verified club member with Active & Affiliated account.
- Device context: Mobile during rides. May use a dedicated cycling computer (Garmin, Wahoo) for navigation — Vechelon is the safety layer, not the nav tool.
- Visibility: Can see Captain and SAG only — not other riders' positions.

### Slim Shadey — Guest Rider
- Unverified participant. Joins via QR code at the parking lot. Optional name and phone number.
- Device context: Mobile. Often first-time experience.
- Account path: Guest account persists post-ride. Convertible to full Member at any time. Ride history carries forward if cookie match exists.
- Visibility: Same as Member Rider — Captain and SAG only.
- **Rail 3 note:** Zero-friction guest participation is a non-negotiable constraint. Resolution direction for React Native context: a rider in the parking lot can sign up as an active participant without installing the app. It is understood they will not be live tracked unless they install. If they install, they should be able to log into the same account and be tracked on that same ride. Formal resolution required — see F-01, F-02, §9.

### The Observer (Post-MVP)
- Non-riding participant who monitors the live map without participating.
- Status: Deliberately deferred. Do not build for in Rail 3.

---

## Part 3: Domain Glossary (Pillar I §6) — Full, No Omissions

| Term | Definition |
|---|---|
| Active Ride | The period between a ride going Active and being closed by Admin/Captain or midnight UTC auto-close |
| Support Beacon | A lightweight rider-triggered visual SOS that changes the rider's map icon to a pulsing high-visibility state on Captain and SAG views. Visibility to other riders is an open proposal — see F-07. |
| Hard Purge | The automated deletion of all location data and guest session data exactly 4 hours after a ride is closed |
| Zero-Footprint Safety | The privacy outcome of the Hard Purge — sensitive GPS tracks erased, club history (summary, participant count) preserved |
| Fleet Heartbeat | The real-time collection of active rider pings visible to Captain and SAG |
| Tactical Directory | How Vechelon surfaces contact info — it shows the number and provides a dial button; all communication happens outside the app |
| Guest [ID] | A guest ride participant who has not provided name or phone — visible on the Captain's map as a tracked but unidentified unit. The distinction is membership status, not data richness. |
| Shadow Account | A lightweight browser-cookie-based guest record that persists post-ride and can be converted to a full Member account |
| Halo State | Marketing language only (vechelon.productdelivered.ca). Not used in product UI. Corresponds to the Stopped rider state. |
| Fade State | Marketing language only (vechelon.productdelivered.ca). Not used in product UI. Corresponds to the Inactive rider state. |
| Series | A set of recurring ride instances linked by a series_id UUID, each an independent database record |
| Route Library | The admin-curated collection of official route files associated with a club tenant |
| Home Base | The Admin Desktop surface of Vechelon — full-featured React web app for ride management, calendar, series creator, route library, member directory, and club info. Desktop-first. |
| Rider Feed | The mobile-optimised surface for Member and Guest ride participants — chronological feed, RSVP/Join, route library, personal ride history. |
| The Hands | The coding agent (Claude Code, Gemini CLI, or human developer) who builds from the Bedrock |
| Tenant | A single club instance on the Vechelon platform. MVP = one active tenant (Racer Sportif) |
| Bedrock | The committed documentation set (Pillars I–IV plus optional Pillar V Amendments) that The Hands build from |

---

## Part 4: Architectural Decisions Rail 3 Must Honour

### 4.1 Three-Surface Architecture (Pillar II §1)

Vechelon has three surfaces sharing a single Supabase backend:

| Surface | Stack | Modality |
|---|---|---|
| Admin Desktop (Rail 1) | React Web | Desktop-first |
| Rider Desktop Portal (Rail 2) | React Web | Desktop-first, browser-responsive fallback |
| Captain / Rider / Support Mobile (Rail 3) | React Native | Mobile-first, Android-first |

- Admin Desktop is not recreated on mobile. Data created on desktop renders on mobile in mobile-optimised form.
- Rail 3 reads from the same Supabase project as Rails 1 & 2. New Rail 3 tables added alongside existing schema.

### 4.2 Technology Stack

> **Note:** The stack below reflects the original committed Pillar decisions, retained here for traceability and context. Many of these decisions were superseded when the project pivoted to prioritise ride planning and club administration in Rails 1 & 2 first — a decision that accelerated marketplace value delivery. What is in code and running is the authority. Rail 3 stack decisions are governed by §4.5.

| Layer | Original Decision | Rail 3 Status |
|---|---|---|
| Rail 3 Frontend | React Native (Android-first) | Confirmed — see §4.5 |
| Backend / Database | Supabase (PostgreSQL) — shared with Rails 1 & 2 | Confirmed |
| Map Rendering | Google Maps API | Confirmed |
| AI Features | Multi-provider via License Bringer model | Confirmed |
| Weather | Open-Meteo API — called at ride close | Confirmed |
| Auth | Supabase Auth (Magic Link recommended) | Confirmed |
| Realtime | Supabase Broadcast — real-time location fan-out | Confirmed (D-55) |
| File Storage | Supabase Storage | Confirmed |
| Scheduled Jobs | Supabase Edge Functions (Cron) | Confirmed |
| GPX Parsing | Programmatic — AI not required for coordinate extraction | Confirmed |

### 4.3 Multi-Tenancy Rules

> **Note:** The multi-tenancy rules were refreshed after the original Pillars were committed. **What is in code is the authority.** The following is provided for directional reference only. A schema survey between this document and the current codebase should be conducted and reflected in the Rail 3 Pillar documents.

Directional principles that should still hold:
- Every record is scoped to a tenant_id. RLS enforces this at the database level.
- At app initialisation, tenant_id fetches brand config and applies it.
- Rail 3 must maintain full RLS tenant isolation — live rides operate within tenant boundary.

### 4.4 Confirmed Performance NFRs (D-54)

> ⚠️ See F-05 — these targets must be validated on a physical device during a real ride before Rail 3 commits them as Pillar II NFRs.

| Metric | Committed Target | Rail 3 Note |
|---|---|---|
| Active ping interval | 5 seconds | To validate in PoC |
| Stopped / Inactive ping interval | 30 seconds | To validate in PoC |
| Dark ping interval | 60 seconds | To validate in PoC |
| Max concurrent participants | 100 | PoC field test with Racer Sportif will run well under this ceiling. No concerns anticipated at club scale. Brain discussion recommended before committing as a Rail 3 NFR — is 100 the right ceiling for a club-scale product long term? |
| Battery drain target | < 10% per hour on modern devices | To validate in PoC |
| Support Beacon alert latency | < 500ms (D-55, Supabase Broadcast proven) | Confirmed |

### 4.5 Rail 3 Platform Decision

> ⚠️ See F-01 — PoC stack requires formal confirmation in the Rail 3 Brain session.

| Item | Decision |
|---|---|
| Production stack | React Native Expo — pure from scratch (Path C) |
| PoC stack | To be confirmed — see F-01. Candidates: PWA (Android Chrome only) or React Native Expo (sideloaded APK). |
| iOS | Excluded from PoC. Rail 3b post Android validation. |
| iOS exclusion rationale | Apple mandates WebKit for all iOS browsers. WebKit does not expose Geolocation API to Service Workers. Background GPS is impossible in any iOS browser context. Hard constraint, not a preference. |
| Capacitor rejected | WebView ceiling at the layers that matter — background GPS and live map performance both require native plugins. Code reuse benefit eliminated. |
| Sideloading complexity | Low for a controlled test with Racer Sportif. Generate APK via Expo, share a download link, testers enable "Install from unknown sources" in Android settings, install directly. No Play Store review required. Each tester installs manually — appropriate at club scale, not viable at public scale. |
| PWA availability | The PWA remains available. It is not the preferred path when the native app is installed, but it is not retired. |
| Supabase architecture | Same project as Rails 1 & 2. Supabase Broadcast (not Postgres Changes) for real-time location fan-out. |

---

## Part 5: The Ride Lifecycle (Committed)

### 5.1 Ride State Machine (Pillar II §5.3, §9)

```
Created → [scheduled time or admin/captain override] → Active → [admin/captain end or midnight UTC] → Saved
```

- Scheduled rides auto-activate at `scheduled_start` time.
- Ad Hoc rides go Active immediately on creation.
- Midnight UTC auto-close sets `auto_closed = true` and flags post-ride summary accordingly.
- Admin or Krys (Ride Captain) can end a ride at any time. **SAG cannot end a ride.**

**Open question:** Should the app proactively prompt RSVP'd riders on ride day — e.g. "Are you taking part?" — rather than waiting for a passive Join tap? Brain discussion recommended.

### 5.2 Ride Participant State Machine (Pillar II §5.7, §7)

> **Note:** The RSVP model has been extended since these Pillars were committed. What is in code is the amendment. The state machine below is the original committed version — treat as directional context, not current authority.

```
RSVP'd → [explicit Join or QR scan on ride day] → Active → Stopped → Inactive → Dark → [4hr timer] → Purged
```

| State | Trigger | Signal |
|---|---|---|
| RSVP'd | Account RSVP or QR scan pre-ride | — |
| Active | Explicit Join action or QR scan on ride day | Present, moving |
| Stopped | No movement for threshold (default 2 min) | Present, stationary |
| Inactive | No movement for threshold (default 5 min) | Present, stationary |
| Dark | No ping received for threshold (default 15 min) | Lost |
| Purged | 4 hours post-ride close | — |

**Critical:** RSVP is intent only. RSVP'd participants do NOT automatically transition to Active when a ride starts. Active status requires an explicit Join action or QR scan on ride day. No ghost participants on the tactical map.

State thresholds configurable at club level via tenants table. Defaults: 2 min / 5 min / 15 min.

### 5.3 Account State Machine (Pillar II §5.2, §8)

```
Initiated → [Accept] → Active & Affiliated → [Archive] → Archived → [Delete] → Deleted
```

- Acceptance is open (automatic) or manual (admin approval required) per tenant `enrollment_mode` setting.
- Guest accounts enter at Initiated — same state machine as Member, lighter initial data.
- Guest ride history carries forward on conversion if session cookie match exists.

### 5.4 Ride Creation Flows

**Scheduled Ride:** Admin creates via desktop → GPX uploaded (optional, programmatic extraction) → Start/Finish/Waypoints reviewed → SAG configured (optional) → Recurring options → Save → QR generated per instance.

> **Note:** AI pre-ride summary generation was purposefully removed from the build. Whether and how this feature returns in Rail 3 is a Brain discussion item — see F-09.

**Ad Hoc Ride:** Krys creates on mobile → Safeguard check (scheduled ride within 2 hours?) → Name auto-populated from date → Start coords from device GPS → Ride goes Active immediately → QR displayed on Krys's device.

**Key rules:**
- GPX coordinate extraction is programmatic — AI not required.
- Post-ride summary is async — generated at ride close, Copy to Clipboard appears when ready.
- QR generated per ride instance at save time.
- Finish coords for Ad Hoc captured when ride ends — not at creation.

---

## Part 6: Fleet Visibility and Map Rules (Pillar II §10, Pillar III §2)

### 6.1 Fleet Visibility Rules (Global)

- Captain and SAG see all ride participants in fleet.
- Member / Guest ride participants see Captain and SAG only — not other participants.
- Phone numbers: Captain and SAG see all participants' numbers. Participants see Captain and SAG numbers only.
- No in-app contact: phone numbers displayed with native Dial button only. No in-app messaging in this phase.
- Ride end authority: Admin or Krys (Captain) can end a ride. SAG cannot.
- Support Beacon visibility: currently visible to Captain and SAG only. The beaconing participant sees their own icon in the alerted pulsing state. ⚠️ **F-07:** Open proposal — should the beacon also be visible to other riders? Brain discussion required before any change to this rule.

### 6.2 Map Visual Hierarchy (Pillar II §10.2)

Icons differentiated by **tactical state only** — account type is not reflected on the map. Account context surfaces in the Bottom Sheet only.

| Actor | Icon Style | Visible To |
|---|---|---|
| Ride Participant (Active) | Solid filled icon | Captain + SAG only |
| Ride Participant (Stopped) | Reduced opacity icon | Captain + SAG only |
| Ride Participant (Inactive) | Hollow icon | Captain + SAG only |
| Ride Participant (Dark) | Greyed icon, last known position | Captain + SAG only |
| Ride Participant (Beacon active) | Pulsing high-visibility overlay | Captain + SAG only (open proposal F-07) |
| Captain | High-visibility icon | All ride participants |
| SAG | Primary Beacon — always visible | All ride participants |
| Self (any role) | Blue dot | Self only |

**Self-position rule (global):** A ride participant always sees their own position as a blue dot in all states including Stopped, Inactive, and Dark.

**Clustering:** Groups of riders in close proximity are bundled together visually and expand on tap or zoom. Standard map clustering treatment to prevent crowding.

**Centre button:** A centre button is present on the live map to return the view to the user's current position.

**Route overlay (F-10):** The decision was made not to display the GPX route on the live ride map. A GPX route overlay would be a value add — Brain discussion required on complexity and deferral before committing either way.

### 6.3 Edge Directional Indicators (Pillar II §10.4)

When a finish point differs from the start, an arrow overlay points toward the off-screen finish. Haversine formula — no routing engine required. $0 cost.

### 6.4 Bottom Sheet (Pillar II §10.3)

Triggered by tapping any Captain or SAG icon, any ride participant icon (Captain/SAG view), or expanding a cluster.

| Element | Detail |
|---|---|
| Name | Display name |
| Account State | Member / Guest / Pending |
| Tactical State | Current state |
| Phone Number | Large monospace format |
| Copy Number | Clipboard icon for cross-device dialling |
| Primary Action | Full-width "Dial" button — opens native dialler via tel: link |

---

## Part 7: Schema Reference

> **Note:** The full schema in Pillar II has been superseded by changes made during Rails 1 & 2 development. **What is in code is the authority.** The table below lists what was originally documented — a delta survey between this list and the current codebase should be conducted and reflected in the Rail 3 Pillar documents.

| Table | Purpose | Rail 3 Relevance |
|---|---|---|
| tenants | Club-level config, branding, thresholds | High — RLS anchor, branding injection |
| accounts | One record per person | High — auth, role, guest conversion |
| rides | One record per ride instance | High — state machine, QR, lifecycle |
| ride_participants | Session object per rider per ride — location purged post-close | High — core Rail 3 data object |
| ride_support | SAG assignment per ride | High — SAG role and visibility |
| ride_summaries | AI summary and retained stats — not purged | Medium — post-ride summary display |
| waypoints | Admin-plotted waypoints per ride | Medium — map display |
| route_library | Admin-curated route files | Low — browsable from Rider Feed, not Rail 3 live ride |

---

## Part 8: Key Committed Decisions from the Ledger

| # | Decision | Outcome |
|---|---|---|
| D-02 | $0 operating cost mandate | Free-tier stack only. Paid services require PM approval. |
| D-03 | Privacy as product — 4-hour Hard Purge | No permanent GPS archive. Purge is non-negotiable. |
| D-05 | WhatsApp is the communication carrier | No in-app messaging in this phase. |
| D-06 | Supabase as primary backend | Auth, Realtime, Storage, Edge Functions. Single vendor. |
| D-07 | Multi-tenancy by design from Day 1 | Prevents hard-coded debt on second club onboard. |
| SD-01 | Google Maps retained | PM retained for UX familiarity. OSM documented as cost escape valve. |
| SD-02 | RSVP auto-transition rejected | RSVP is intent-only. Explicit Join or QR scan required on ride day. No ghost participants. |
| SD-04 | iOS GPS reliability — PWA cannot guarantee heartbeat | React Native confirmed as production Tactical Map platform. |
| D-54 | Live Ride Performance NFRs | Active 5s / Stopped+Inactive 30s / Dark 60s. Max 100 participants. <10% battery/hr. To be validated in PoC. |
| D-55 | Support Beacon real-time loop | <500ms alert latency. Supabase Broadcast confirmed. State resolves to Active on cancel. |

---

## Part 9: BDD Scenarios — Carried Forward Verbatim

**Instruction to Rail 3 Brain:** The following scenarios are carried forward from Pillar III (v1.4.0) verbatim and intact. Rail 3 BDD scenarios extend these — they do not replace them. Where Rail 3 behaviour conflicts with a scenario, that conflict must be resolved before any commit. Conflict flags are marked ⚠️. Enhancement proposals are marked 💡.

### Global Rules (Pillar III §2) — Apply to All Scenarios

- **Self-position:** A ride participant always sees their own position on the map as a blue dot in all states including Stopped, Inactive, and Dark.
- **No in-app contact:** Phone numbers displayed with a native Dial button only. No in-app messaging in this phase.
- **Fleet visibility:** Captain and SAG see all ride participants. Ride participants see Captain and SAG only.
- **Ride end authority:** Admin or Captain can end a ride. SAG cannot.
- **Support Beacon visibility:** Beacon state visible to Captain and SAG only. The beaconing participant sees their own icon in the alerted pulsing state. ⚠️ F-07 open proposal — Brain discussion required.

---

### Scenarios Governing RSVP State Transitions

**Scenario 4: Member RSVPs via app pre-ride and joins when ride activates**
```
Given a ride is in Created state
And a member is viewing the ride in their feed
When the member taps the RSVP button
Then the member's status for that ride is set to RSVP'd
And the RSVP is recorded in ride_participants
And the member does NOT appear on the tactical map until they explicitly Join on ride day

When the ride transitions to Active
Then the member's feed button changes from RSVP to Join
And the member can tap Join to transition their status to Active
And the member appears on the Captain's and SAG's tactical map
```

**Scenario 5: Member joins active ride late**
```
Given a ride has been Active for 45 minutes
And a member has not yet joined
When the member opens the app and taps Join
Then the member is immediately associated with the ride
And their tactical state is set to Active
And the live map shows current positions of Captain and SAG
And the member can tap either icon to reveal contact details
And the member sees their own position as a blue dot
```

---

### Scenarios Governing Ride Lifecycle (Start, Close)

**Scenario 11: Captain creates Ad Hoc ride**
```
Given a Captain is at a ride location with no pre-scheduled ride
And no scheduled ride exists within 2 hours
When the Captain taps Create Ad Hoc Ride
Then the ride name is auto-populated with the current date
And the start location is set from the Captain's device GPS
And the ride goes Active immediately
And a QR code is generated and displayed prominently on the Captain's screen
And the ride is joinable via QR scan or in-app Join button
```

**Scenario 12: Ad Hoc ride safeguard**
```
Given a Captain is initiating an Ad Hoc ride
And a scheduled ride exists within 2 hours
When the Captain taps Create Ad Hoc Ride
Then the system displays a warning:
  "There is a scheduled ride happening soon. Are you sure you want to create an Ad Hoc ride?"
And the Captain must explicitly confirm to proceed
And the Ad Hoc ride is not created until confirmation is given
```

**Scenario 13: Scheduled ride auto-activates**
```
Given a scheduled ride exists with a future start time
When the scheduled start time is reached
Then the ride status transitions from Created to Active automatically
And the QR code becomes active for scanning
And the in-app button changes from RSVP to Join for all RSVP'd members
```
💡 Rail 3 corrections and enhancements — Brain session to extend:
- **QR is always active.** The line "the QR code becomes active for scanning" is incorrect — the QR code is active from the moment it is generated. What changes on ride activation is the *action the QR invokes*: pre-ride scan sets the rider to RSVP'd; ride-day scan transitions them to Active.
- **Frictionless join.** Scanning the QR on ride day should not require an additional confirmation tap. The scan itself is the join action — the rider sees an indicator confirming they have joined. No click required.
- **Open access.** Anyone with access to view the ride should be able to join a live ride — not limited to RSVP'd members.

**Scenario 14: Admin manually starts ride early**
```
Given a scheduled ride is in Created state
And the scheduled start time has not yet been reached
When the Admin or Captain taps Start Ride
Then the ride transitions to Active immediately
And the QR code becomes active for scanning
And the in-app button changes from RSVP to Join for all RSVP'd members
```

**Scenario 15: Admin or Captain ends ride**
```
Given a ride is Active
When the Admin or Captain taps End Ride
Then the ride transitions to Saved state
And the post-ride AI summary is queued for async generation
And the 4-hour location purge clock starts
And a Copy to Clipboard button appears when the summary is ready
```
💡 Enhancement: a "Save Ride Summary" button is available for rides that have a generated summary, intended for posting to WhatsApp. Open question: should this button also be visible to riders viewing past rides? Rail 3 Brain to confirm.

**Scenario 16: Midnight UTC auto-close**
```
Given a ride is still Active at midnight UTC
When the system cron triggers the auto-close
Then the ride transitions to Saved state
And the post-ride summary is generated and flagged as "This ride was auto-closed"
And the 4-hour location purge clock starts
```

---

### Scenarios Governing Role Behaviour (Captain, Support, Rider)

**Scenario 17: Active → Stopped transition**
```
Given a ride participant is in Active state during a ride
When no movement is detected for the club-configured threshold (default 2 minutes)
Then the ride participant's status transitions to Stopped
And their icon updates visually on the Captain's and SAG's map
And no automated alert is triggered
And the ride participant continues to see their own blue dot position
```

**Scenario 18: Stopped → Active recovery**
```
Given a ride participant is in Stopped state
When movement is detected via a new ping
Then the ride participant's status transitions back to Active
And their icon updates visually on the Captain's and SAG's map
```

**Scenario 19: Inactive transition**
```
Given a ride participant has been in Stopped state
When no movement is detected for the club-configured threshold (default 5 minutes)
Then the ride participant's status transitions to Inactive
And their icon updates visually on the Captain's and SAG's map
And the Captain and SAG make a human judgement call — no automated alert
And the ride participant continues to see their own blue dot position
```

**Scenario 20: Dark state — signal lost**
```
Given a ride participant has been in Inactive state
When no ping is received for the club-configured threshold (default 15 minutes)
Then the ride participant's status transitions to Dark
And their icon updates to a greyed state at their last known position
  on Captain's and SAG's maps
And the Captain and SAG can tap the icon to view last known location and contact details
And the ride participant's own screen shows their blue dot at their actual current position
  Note: The ride participant may still have GPS but have lost connectivity.
  Their own view reflects actual position; Captain/SAG see last known position.
```

**Scenario 21: Dark → Active recovery**
```
Given a ride participant is in Dark state
When a ping is received from the ride participant
Then the ride participant's status transitions back to Active
And their icon updates visually on the Captain's and SAG's map
```

**Scenario 22: Ride participant triggers Support Beacon**
```
Given a ride participant is in any Active Ride state
When the ride participant taps the Need Support button
Then the ride participant's icon transitions to a pulsing high-visibility state
  on the Captain's and SAG's map only
And the ride participant sees their own icon in the alerted pulsing state
  confirming their beacon is active
And no automated message or alert is sent
And the Captain or SAG initiates contact via the Bottom Sheet
```
⚠️ F-07: Open proposal — should the beacon also become visible to other riders? Contradicts the current global rule. Brain decision required before this scenario can be extended.

**Scenario 23: Captain cancels Support Beacon**
```
Given a ride participant has an active Support Beacon
When the Captain taps Cancel Support on the ride participant's Bottom Sheet
Then the beacon is deactivated
And the ride participant's status transitions to Active
And their icon updates to the Active state on Captain's and SAG's maps
And the ride participant's own icon returns to the Active state
```
💡 Enhancement: log who cancels the Support Beacon (cancellation actor recorded in ride_participants or a dedicated audit record). Reasonable safety and accountability measure. Rail 3 Brain to confirm schema impact.

**Scenario 24: Ride participant cancels own Support Beacon**
```
Given a ride participant has an active Support Beacon
And the ride participant can see their own icon in the alerted pulsing state
When the ride participant taps Cancel Support on their own screen
Then the beacon is deactivated
And the ride participant's status transitions to Active
And their icon updates to the Active state on Captain's and SAG's maps
And the ride participant's own icon returns to the Active state
```

**Scenario 25: Captain contacts Inactive ride participant**
```
Given a ride participant is in Inactive state on the Captain's map
When the Captain taps the ride participant's icon
Then the Bottom Sheet opens showing:
  - Ride participant display name
  - Account state (Member / Guest / Pending)
  - Current tactical state (Inactive)
  - Phone number in large readable monospace format (if available)
  - Copy Number clipboard icon
  - Full-width Dial button
When the Captain taps Dial
Then the native phone dialler opens with the ride participant's number pre-filled
```

**Scenario 26: Ride participant contacts Captain**
```
Given a ride is Active
When a ride participant taps the Captain's icon on the map
Then the Bottom Sheet opens showing:
  - Captain's display name
  - Phone number in large readable monospace format
  - Copy Number clipboard icon
  - Full-width Dial button
When the ride participant taps Dial
Then the native phone dialler opens with the Captain's number pre-filled
```

**Scenario 27: Cross-device number reading**
```
Given a Captain's primary device is mounted on their handlebars
When the Captain taps a ride participant's icon
Then the phone number is displayed in large monospace format
And the Captain can read the number aloud or copy it
  for manual entry on a secondary device
```

---

### Scenarios Governing Data Retention and Hard Purge

**Scenario 28: 4-hour purge after admin close**
```
Given a ride has been closed by Admin or Captain
And 4 hours have elapsed since ride close
When the purge cron job triggers
Then all last_lat, last_long, and last_ping fields
  in ride_participants are permanently deleted
And guest account records are retained
And the ride_summaries record is retained with participant_count
And no location data is recoverable after purge
```

**Scenario 29: Midnight auto-close purge**
```
Given a ride was auto-closed at midnight UTC
And 4 hours have elapsed since auto-close
When the purge cron job triggers
Then all location data is permanently deleted per Scenario 28
And the ride_summaries record is flagged auto_closed = true
```

---

### Scenarios Flagged for Rail 3 Conflict Resolution

**Scenario 1: Guest joins ride via QR code** ⚠️ F-01, F-02
```
Given a ride is Active
And a guest does not have a Vechelon account
When the guest scans the Captain's QR code
Then the app opens in a mobile browser without requiring a download
  Note: PWA technology allows the app to run directly in the browser via URL.
  No App Store, Play Store, or install prompt is required. The browser is the runtime.
And the guest is prompted for an optional name and phone number
And the guest can skip both fields
And the guest appears on the Captain's live map immediately
And the guest's tactical state is Active
And the guest's icon is visible to Captain and SAG only
And the guest sees their own position as a blue dot on their screen
```
> ⚠️ Rail 3 conflict: The Zero-Friction Participation constraint requires guests join without an app download. Resolution direction: a rider in the parking lot signs up as an active participant via the PWA (which remains available). If they install the native app and log into the same account, they transition to full live tracking on that same ride. Brain session must formally resolve the join flow and update this scenario accordingly.

**Scenario 34: Tenant branding injection on load** ⚠️ F-03
```
Given a rider navigates to a club URL (e.g. vechelon.app/racer-sportif)
When the PWA loads
Then the app fetches the tenant brand config from the tenants table
And the CSS custom properties are injected into the root element
And the app renders with the club's primary colour, accent colour, and logo
And a rider navigating to a different club URL sees that club's branding instead
```
> ⚠️ Rail 3 note: The PWA remains available and this scenario remains valid for the PWA path. For the native app, the branding injection mechanism differs — Rail 3 Brain must define how tenant branding is applied in the React Native context and write a parallel scenario.

---

## Part 10: Critical Test Paths (Pillar III §5.2) — Rail 3 Must Pass

| # | Critical Path | Why |
|---|---|---|
| CP-01 | Guest QR join → appears on Captain's map | Core zero-friction promise |
| CP-02 | Support Beacon trigger → visible to Captain and SAG | Safety-critical |
| CP-03 | Hard Purge executes completely | Privacy mandate |
| CP-04 | Midnight auto-close triggers | Data hygiene — orphaned rides create ghost data |
| CP-05 | RLS prevents cross-tenant data access | Multi-tenancy security — critical |
| CP-06 | Dark state persists last known location | Safety — Captain must know where a lost rider was. ⚠️ F-08: open question whether dark state last known positions are retained beyond the Hard Purge — Brain discussion required before committing this test path as written. |
| CP-07 | Dial button opens native dialler correctly | Safety — if this fails, Captain cannot reach a distressed rider |
| CP-08 | Blue dot self-position visible in all states | UX trust — rider must always know where they are |

---

## Part 11: Post-MVP Items (Do Not Build in Rail 3 PoC)

| Item | Notes |
|---|---|
| iOS Mobile App | Rail 3b — follows Android validation and App Store submission. |
| In-App Communication | Roadmap item. Not a permanent exclusion — deferred from this phase. |
| Observer Role | Non-riding map monitor. Deliberately deferred. |
| Multiple Simultaneous Rides | More than one active ride per club. |
| In-App Notifications | Email / push notification system. |
| Self-Serve Admin Branding Portal | Non-technical club admin configures logo, colours, slug. |
| Geofencing | Join restrictions based on proximity to route. |
| WhatsApp Deep-Link Sharing | Direct link from WhatsApp into active ride join flow. |
| Strava Integration | Individual activity sync. |
| Mid-Ride SAG Reassignment | Schema supports it; logic deferred. |
| Sub-Group Captain Feature | group_id stub exists in schema; no logic in MVP. |
| Multiple Simultaneous Active Rides | One active ride per club in MVP. |

---

*End of vechelon-pillar-summary-v1.md*
*Source Pillars govern in all conflicts. This document is a reference only.*
