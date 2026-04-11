# Vechelon | Pillar III: The Quality Gate (v1.4.0)

Project: Vechelon | Current Version: v1.4.0 | Last Sync Date: 2026-04-08 | Status: COMMITTED

---

## 1. Definition of Done

A feature is not [COMMITTED] until all three conditions are met:

1. **Strategic Lead (PM):** The feature aligns with the North Star constraints — $0 operating cost, zero-friction participation, privacy by design, tactical focus.
2. **Structural Lead (Engineering):** The feature is feasible within the free-tier stack, does not create unsustainable technical debt, and passes RLS and security requirements.
3. **Experience & Validation Lead (Design/QA):** The feature has at least one passing BDD scenario, the interaction is thumb-friendly, and the Definition of Done is measurable.

A feature that cannot be proven with a BDD scenario does not ship.

---

## 2. Global Rules Applied Across All Scenarios

These rules apply universally and are not repeated in individual scenarios:

- **Self-position:** A ride participant always sees their own position on the map as a blue dot — consistent with the Google Maps convention. This applies in all states including Stopped, Inactive, and Dark. The blue dot represents self-position only — other ride participants are rendered per the Map Visual Hierarchy in Pillar II Section 10.2.
- **No in-app contact:** Phone numbers are displayed with a native Dial button only. No in-app messaging at any point.
- **Fleet visibility:** Captain and SAG see all ride participants. Ride participants see Captain and SAG only — not other ride participants.
- **Ride end authority:** Admin or Captain can end a ride. SAG cannot.
- **Support Beacon visibility:** Beacon state visible to Captain and SAG only. The beaconing ride participant sees their own icon in the alerted pulsing state on their own screen — confirming their beacon is active.

---

## 3. BDD Scenario Index

| # | Feature Area | Scenario | Priority |
|---|---|---|---|
| 1 | Identity — Guest QR Join | Guest joins ride via QR — full flow | P0 |
| 2 | Identity — Guest QR Join | Guest skips name and phone | P0 |
| 3 | Identity — Guest QR Join | Member joins same ride via QR | P0 |
| 4 | Identity — Member Join | Member RSVPs via app pre-ride and joins when ride activates | P0 |
| 5 | Identity — Member Join | Member joins active ride late | P0 |
| 6 | Identity — Guest Conversion | Guest converts to full member post-ride | P1 |
| 7 | Identity — Guest Conversion | Returning guest recognised by cookie — best effort | P1 |
| 8 | Identity — Guest Conversion | [RETIRED - 2026-04-07 - Redundant: new device behaviour is expected, not a problem to solve] | — |
| 9 | Ride Lifecycle — Creation | Admin creates scheduled ride with GPX | P0 |
| 10 | Ride Lifecycle — Creation | Admin creates scheduled ride without GPX | P0 |
| 11 | Ride Lifecycle — Creation | Captain creates Ad Hoc ride | P0 |
| 12 | Ride Lifecycle — Creation | Ad Hoc ride safeguard — scheduled ride soon | P1 |
| 13 | Ride Lifecycle — Active | Scheduled ride auto-activates | P0 |
| 14 | Ride Lifecycle — Active | Admin manually starts ride early | P1 |
| 15 | Ride Lifecycle — Close | Admin/Captain ends ride | P0 |
| 16 | Ride Lifecycle — Close | Midnight UTC auto-close | P0 |
| 17 | Ride Participant States | Active → Stopped transition | P0 |
| 18 | Ride Participant States | Stopped → Active recovery | P0 |
| 19 | Ride Participant States | Inactive transition | P0 |
| 20 | Ride Participant States | Dark state — signal lost | P0 |
| 21 | Ride Participant States | Dark → Active recovery | P1 |
| 22 | Support Beacon | Ride participant triggers beacon | P0 |
| 23 | Support Beacon | Captain cancels beacon | P0 |
| 24 | Support Beacon | Ride participant cancels own beacon | P0 |
| 25 | Contact & Communication | Captain contacts inactive ride participant | P0 |
| 26 | Contact & Communication | Ride participant contacts Captain | P0 |
| 27 | Contact & Communication | Cross-device number reading | P1 |
| 28 | Privacy — Hard Purge | 4-hour purge after admin close | P0 |
| 29 | Privacy — Hard Purge | Midnight auto-close purge | P0 |
| 30 | WhatsApp Bridge | Pre-ride summary generated and copied | P0 |
| 31 | WhatsApp Bridge | Post-ride summary generated async | P0 |
| 32 | Route Library | Admin uploads route file | P1 |
| 33 | Route Library | Member browses and downloads route file | P1 |
| 34 | Multi-Tenancy | Tenant branding injection on load | P1 |
| 35 | Enrollment | Admin invites member | P1 |
| 36 | Enrollment | Rider creates account and requests club affiliation | P1 |

---

## 4. BDD Scenarios

### Feature: Identity & Enrollment

---

**Scenario 1: Guest joins ride via QR code**
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

---

**Scenario 2: Guest skips name and phone**
```
Given a guest has scanned the QR code
When the guest skips name and phone entry
Then the guest is still visible on the Captain's map as an anonymous ride participant
And the Captain can see their location but has no contact details
And the Bottom Sheet for this guest shows no phone number and no Dial button
And the guest sees their own position as a blue dot on their screen
```

---

**Scenario 3: Member joins ride via QR code**
```
Given a ride is Active
And a member has an existing Vechelon account
When the member scans the QR code
Then the app recognises their existing session via browser cookie
And the member is associated with the ride without re-entering details
And their tactical state is set to Active
```

---

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

---

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

**Scenario 6: Guest converts to full member post-ride**
```
Given a guest participated in a ride with optional name and phone provided
And the ride is in Saved state
When the guest initiates account creation at any time post-ride
Then the standard account creation flow is presented
And email and phone are required
And on completion the account enters Initiated state
And club affiliation acceptance follows the club enrollment setting
And prior ride history is linked to the new account if session cookie match exists
  Note: Cookie matching is best-effort. Link is not guaranteed if session has expired.
```

---

**Scenario 7: Returning guest recognised by cookie — best effort**
```
Given a guest previously participated in a ride
When the guest scans a QR or joins a new ride on the same device
Then the system attempts to recognise the browser session cookie
And if a match is found, links the guest to their previous account record automatically
And prior ride history is carried forward
  Note: Cookie matching is best-effort. A new device, cleared browser data,
  or expired session will result in a new guest record being created.
  Full account conversion is the reliable path to persist ride history permanently.
```

---

**Scenario 8: [RETIRED - 2026-04-07 - Redundant: new device behaviour is expected, not a problem to solve]**

---

### Feature: Ride Lifecycle

---

**Scenario 9: Admin creates scheduled ride with GPX**
```
Given an admin is creating a new ride
And an official GPX file is available
When the admin pins the GPX file to the ride
Then the system extracts Start and Finish coordinates programmatically from the GPX file
And the admin is presented with a review screen showing extracted coordinates
And the admin can edit Start, Finish, and add waypoints with optional labels
And on save, a unique QR code is generated for this ride instance
```

---

**Scenario 10: Admin creates scheduled ride without GPX**
```
Given an admin is creating a new ride
And no GPX file is used
When the admin defines Start and Finish manually on the map
Then the admin can optionally add waypoints with labels
And on save, a unique QR code is generated for this ride instance
```

---

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

---

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

---

**Scenario 13: Scheduled ride auto-activates**
```
Given a scheduled ride exists with a future start time
When the scheduled start time is reached
Then the ride status transitions from Created to Active automatically
And the QR code becomes active for scanning
And the in-app button changes from RSVP to Join for all RSVP'd members
```

---

**Scenario 14: Admin manually starts ride early**
```
Given a scheduled ride is in Created state
And the scheduled start time has not yet been reached
When the Admin or Captain taps Start Ride
Then the ride transitions to Active immediately
And the QR code becomes active for scanning
And the in-app button changes from RSVP to Join for all RSVP'd members
```

---

**Scenario 15: Admin or Captain ends ride**
```
Given a ride is Active
When the Admin or Captain taps End Ride
Then the ride transitions to Saved state
And the post-ride AI summary is queued for async generation
And the 4-hour location purge clock starts
And a Copy to Clipboard button appears when the summary is ready
```

---

**Scenario 16: Midnight UTC auto-close**
```
Given a ride is still Active at midnight UTC
When the system cron triggers the auto-close
Then the ride transitions to Saved state
And the post-ride summary is generated and flagged as "This ride was auto-closed"
And the 4-hour location purge clock starts
```

---

### Feature: Ride Participant States

---

**Scenario 17: Active → Stopped transition**
```
Given a ride participant is in Active state during a ride
When no movement is detected for the club-configured threshold (default 2 minutes)
Then the ride participant's status transitions to Stopped
And their icon updates visually on the Captain's and SAG's map
And no automated alert is triggered
And the ride participant continues to see their own blue dot position
```

---

**Scenario 18: Stopped → Active recovery**
```
Given a ride participant is in Stopped state
When movement is detected via a new ping
Then the ride participant's status transitions back to Active
And their icon updates visually on the Captain's and SAG's map
```

---

**Scenario 19: Inactive transition**
```
Given a ride participant has been in Stopped state
When no movement is detected for the club-configured threshold (default 5 minutes)
Then the ride participant's status transitions to Inactive
And their icon updates visually on the Captain's and SAG's map
And the Captain and SAG make a human judgement call — no automated alert
And the ride participant continues to see their own blue dot position
```

---

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

---

**Scenario 21: Dark → Active recovery**
```
Given a ride participant is in Dark state
When a ping is received from the ride participant
Then the ride participant's status transitions back to Active
And their icon updates visually on the Captain's and SAG's map
```

---

### Feature: Support Beacon

---

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

---

**Scenario 23: Captain cancels Support Beacon**
```
Given a ride participant has an active Support Beacon
When the Captain taps Cancel Support on the ride participant's Bottom Sheet
Then the beacon is deactivated
And the ride participant's status transitions to Active
And their icon updates to the Active state on Captain's and SAG's maps
And the ride participant's own icon returns to the Active state
```

---

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

---

### Feature: Contact & Communication

---

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

---

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

---

**Scenario 27: Cross-device number reading**
```
Given a Captain's primary device is mounted on their handlebars
When the Captain taps a ride participant's icon
Then the phone number is displayed in large monospace format
And the Captain can read the number aloud or copy it
  for manual entry on a secondary device
```

---

### Feature: Privacy — Hard Purge

---

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

---

**Scenario 29: Midnight auto-close purge**
```
Given a ride was auto-closed at midnight UTC
And 4 hours have elapsed since auto-close
When the purge cron job triggers
Then all location data is permanently deleted per Scenario 28
And the ride_summaries record is flagged auto_closed = true
```

---

### Feature: WhatsApp Bridge

---

**Scenario 30: Pre-ride summary generated and copied**
```
Given a ride has been created
When the Admin selects the ride and requests a pre-ride summary
Then the AI generates a summary including:
  ride name, date, time, start location, waypoints, and SAG info
And a Copy to Clipboard button is displayed
When the Admin taps Copy to Clipboard
Then the summary is copied to the device clipboard
And the Admin pastes the message into WhatsApp
And the Admin edits the message in WhatsApp before sending to the club
```

---

**Scenario 31: Post-ride summary generated async**
```
Given a ride has transitioned to Saved state
When the AI post-ride summary has been generated
Then a Copy to Clipboard button becomes visible to Admin and Captain
And the summary includes:
  ride duration, participant count, weather data, and AI analysis
When the Admin or Captain taps Copy to Clipboard
Then the summary is copied to the device clipboard
And the Admin pastes the message into WhatsApp
And the Admin edits the message in WhatsApp before sending to the club
```

---

### Feature: Route Library

---

**Scenario 32: Admin uploads route file**
```
Given an admin is logged into Home Base
When the admin uploads a route file with a name
Then the file is stored in Supabase Storage
And a record is created in route_library linked to the tenant
And the route appears in the Route Library
  browsable by all Active and Affiliated members
```

---

**Scenario 33: Member browses and downloads route file**
```
Given a member is viewing the Route Library
When the member selects a route
Then the route details are displayed
  including name, distance, and elevation if available
And a Download button is presented
When the member taps Download
Then the route file is downloaded to the member's device
```

---

### Feature: Multi-Tenancy

---

**Scenario 34: Tenant branding injection on load**
```
Given a rider navigates to a club URL (e.g. vechelon.app/racer-sportif)
When the PWA loads
Then the app fetches the tenant brand config from the tenants table
And the CSS custom properties are injected into the root element
And the app renders with the club's primary colour, accent colour, and logo
And a rider navigating to a different club URL sees that club's branding instead
```

---

### Feature: Enrollment

---

**Scenario 35: Admin invites member**
```
Given an admin is logged into Home Base
When the admin creates an account for a rider
Then an invitation is sent to the rider's email
And the account enters Initiated state
When the rider accepts the invitation
Then the account transitions to Active and Affiliated
And the rider can access club rides and the Route Library
  Note: For MVP, admin checks pending affiliations manually.
  In-app notification for pending affiliations is post-MVP.
```

---

**Scenario 36: Rider creates account and requests club affiliation**
```
Given a rider creates a Vechelon account independently
And the club enrollment_mode is set to 'manual'
When the rider requests to join the club
Then the account enters Initiated state pending admin approval
And ride visibility for this Initiated account follows the tenant enrollment setting:
  - Open enrollment clubs: pending member can see upcoming rides
  - Manual enrollment clubs: pending member cannot see rides until affiliated
When the admin approves
Then the account transitions to Active and Affiliated
And the rider gains full access to club rides and the Route Library
```

---

## 5. Validation & Testing Plan

### 5.1 Testing Layers

| Layer | Scope | Owner |
|---|---|---|
| Unit Tests | Individual functions — state transitions, purge logic, GPX parsing, threshold calculations | The Hands |
| Integration Tests | Supabase RLS policies, Edge Function cron jobs, AI provider abstraction layer | The Hands |
| BDD / Acceptance Tests | All P0 scenarios above — automated where possible | The Hands + Senior PM sign-off |
| Performance Tests | Live map with target participant load, ping latency, battery drain | Sprint 0 — The Hands |
| Manual QA | Parking lot QR flow on real devices (iOS Safari, Android Chrome), Bottom Sheet usability, cross-device dialling | Senior PM + The Hands |

### 5.2 Critical Test Paths (Must Pass Before Shipping)

| # | Critical Path | Why |
|---|---|---|
| CP-01 | Guest QR join → appears on Captain's map | Core zero-friction promise |
| CP-02 | Support Beacon trigger → visible to Captain and SAG | Safety-critical |
| CP-03 | Hard Purge executes completely | Privacy mandate — legal risk if broken |
| CP-04 | Midnight auto-close triggers | Data hygiene — orphaned rides create ghost data |
| CP-05 | RLS prevents cross-tenant data access | Multi-tenancy security — critical |
| CP-06 | Dark state persists last known location | Safety — Captain must know where a lost rider was |
| CP-07 | Dial button opens native dialler correctly | Safety — if this fails, Captain cannot reach a distressed rider |
| CP-08 | Blue dot self-position visible to ride participant in all states | UX trust — rider must always know where they are |

### 5.3 Device Coverage

| Device | Browser | Priority |
|---|---|---|
| Desktop / laptop | Chrome / Safari | P0 — Admin ride management, calendar, series creator |
| Android (mid-range) | Chrome | P0 — primary guest and rider device |
| iPhone (iOS 16.4+) | Safari | P0 — primary guest and rider device |
| iPad / tablet | Safari or Chrome | P1 — SAG vehicle device |

### 5.4 Edge Cases for Manual QA

| Scenario | Expected Behaviour |
|---|---|
| Rider loses signal mid-ride | Last known position persists on Captain/SAG map. Ride participant's own blue dot reflects actual position if GPS still active. Dark state triggers after threshold. App does not crash. |
| Admin forgets to end ride | Midnight UTC auto-close fires. Summary flagged as auto-closed. Purge clock starts. |
| Guest provides no name or phone | Visible on map as anonymous. Bottom Sheet shows no contact info. No Dial button. |
| Two rides created for same time slot | MVP: system prevents or warns. One active ride per club enforced. |
| GPX file is malformed | Graceful fallback to manual coordinate entry. No hard crash. |
| AI provider key is invalid or expired | Ride creation proceeds without AI summary. Error surfaced to admin. Manual summary path available. |
| Purge cron fails | Alert mechanism required. Data must not persist beyond 4-hour window undetected. |
| RSVP'd member does not show up | Member remains in RSVP'd state. Never appears on tactical map. No ghost participant. |
| Ride participant clears browser data mid-ride | New guest session created on rejoin. Previous session data orphaned and purged at 4-hour mark. |

---

## Change Log

| Version | Date | Time (UTC) | Action | Decision | Lead |
|---|---|---|---|---|---|
| v1.0.0 | 2026-04-07 | 00:00 | ADD | Pillar III initialised from G7 BDD discovery session and confirmed interview decisions | TPM |
| v1.1.0 | 2026-04-07 | 00:00 | CHANGE | PWA note S1, RSVP→Join transition S4, best-effort notes S6-7, S8 retired, enrollment visibility S36, beacon self-visibility S22-24, blue dot global rule, CP-08 added | TPM |
| v1.2.0 | 2026-04-07 | 00:00 | CHANGE | Immutable numbering restored — S8 retained as [RETIRED] in index and body per MACD protocol. Original numbering 1-36 preserved. | TPM |
| v1.3.0 | 2026-04-07 | 00:00 | CHANGE | S23 and S24 corrected — beacon cancellation resolves to Active state, not previous state | TPM |
| v1.4.0 | 2026-04-08 | 10:45 | CHANGE | Device coverage updated — Admin Desktop elevated to P0. Android P0 for rider flows. Three-surface architecture reflected. | TPM |
