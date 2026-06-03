\[Vechelon Rail 3] Pillar II: The Specs (v1.0.2)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.0.2 | Last Sync Date: 2026-05-12 | Status: COMMITTED

\---

## Change Log

|Version|Date|Time|MACD Action|Decision|Trio Lead|
|-|-|-|-|-|-|
|v0.1.0|2026-05-12|—|ADD|Initialized Rail 3 Pillar II shell. Platform strategy and infrastructure architecture committed.|TPM|
|v1.0.0|2026-05-12|—|ADD|Completed all TBD sections: role behaviour matrix, UX principles, full Rail 3a feature spec, C2 container diagram, background GPS detail. QR display opened to all roles. Battery Saver detection added. §5.3 UX label copy deferred to Stride milestone. Guest join flow deferred to Rail 3a production Sprint 0. Promoted DRAFT → COMMITTED.|TPM|
|v1.0.1|2026-05-12|—|DELETE|Removed Open-Meteo from C2 container diagram. Weather is not a Rail 3 concern.|TPM|
|v1.0.2|2026-05-12|—|CHANGE|§2 beacon\_alerts schema and §3.2 self-cancel rule: beacon\_cancelled\_by now written with rider's own UUID on self-cancel. Null reserved for system error only. Rationale: null is indistinguishable from a failed write — rider UUID is a valid FK, requires no schema change, and produces an unambiguous audit trail on a safety event.|TPM|

\---

## §1. Platform Strategy

### PoC

* Stack: React Native Expo (managed workflow)
* Distribution: Expo Development Build — sideloaded APK, no Play Store
* Scope: Android only
* North Star: Real device, real ride, background GPS validation, role functionality
* Participants: Registered members only. No guest join flow in PoC.
* Supabase: Same project as Rails 1 \& 2. Reads existing ride/RSVP/role data. Writes to new Rail 3 tables only.
* Code carry-forward to production: Significant — components, navigation, real-time sync hooks, map integration, schema.

### Production — Rail 3a (Android)

* Stack: React Native Expo (managed workflow)
* Distribution: Google Play Store
* Background GPS: expo-location with background task support
* Maps: react-native-maps

### Production — Rail 3b (iOS)

* Sequencing: Post Rail 3a validation and Play Store submission
* Distribution: Apple App Store
* Background GPS: expo-location (iOS background mode)
* \[TBD — Rail 3b Brain Session]

### Why Not PWA

PWA rejected. Background GPS fails on Android when screen is locked — Geolocation API not available to Service Workers. iOS excluded entirely — WebKit mandated, same constraint, no workaround.

### Why Not Capacitor (Path B)

Capacitor rejected. WebView ceiling on live fleet map performance under concurrent GPS and WebSocket load. Code reuse advantage eliminated where it matters most — background GPS and map performance both require native plugins regardless of Capacitor wrapper.

### Guest Join Flow

Zero-Friction participation constraint (→ Rail 1 Pillar I §2) remains active for production. In the React Native context, sideloaded APKs are not viable for parking lot joins. Production resolution: guests install via Google Play Store, create an account with email verification, and join the active ride. Email is required for ride history carry-forward and account promotion. Riders without email receive a one-ride session with no conversion path. The full parking lot guest join experience is a Sprint 0 task for the Rail 3a production Brain session — not in scope for PoC.

\---

## §2. Technical Architecture

### Stack

|Layer|Technology|
|-|-|
|Mobile framework|React Native Expo (managed workflow)|
|Maps|react-native-maps|
|Background GPS|expo-location with background tasks (expo-task-manager)|
|Real-time sync|Supabase Broadcast (ephemeral WebSocket)|
|Database|Supabase (same project as Rails 1 \& 2)|
|Auth|Supabase Auth (inherited)|
|Distribution — PoC|Expo Development Build, sideloaded APK|
|Distribution — Production|Google Play Store → Apple App Store|

### Performance NFRs (PoC Validation Targets)

Derived from D-54. These are validation targets, not production guarantees. PoC field testing with Racer Sportif validates or revises them before Rail 3a production launch.

|Metric|Target|Notes|
|-|-|-|
|Active ping interval|5 seconds|To validate in PoC|
|Stopped / Inactive ping interval|30 seconds|To validate in PoC|
|Dark ping interval|60 seconds|To validate in PoC|
|Max concurrent participants|100|Club-scale ceiling. No concerns at Racer Sportif scale.|
|Battery drain|< 10% per hour on modern devices|To validate in PoC|
|Support Beacon alert latency|< 500ms|D-55 — Supabase Broadcast confirmed|

### Supabase Architecture

#### Inherited Tables (Rails 1 \& 2 — read only from Rail 3 except where noted)

* rides
* ride\_participants (location fields written by Rail 3 during active ride)
* ride\_support
* tenants
* accounts

#### New Rail 3 Tables

|Table|Purpose|Retention|
|-|-|-|
|beacon\_alerts|Support Beacon events with location snapshot, cancellation actor and timestamp|4-hour Hard Purge|
|rider\_states|Active state per rider during live ride|4-hour Hard Purge|

> Location pings are ephemeral — Supabase Broadcast channel only, no DB write per ping.

#### beacon\_alerts Schema

|Field|Type|Notes|
|-|-|-|
|id|UUID|PK|
|ride\_id|UUID|FK → rides|
|rider\_id|UUID|FK → accounts|
|triggered\_at|timestamptz|—|
|lat|float8|Location snapshot at trigger|
|long|float8|Location snapshot at trigger|
|beacon\_cancelled\_by|UUID|FK → accounts. Rider's own UUID if self-cancelled. Null reserved for system error only.|
|beacon\_cancelled\_at|timestamptz|—|

#### Real-time Pattern

* Supabase Broadcast used for live location fan-out (not Postgres Changes)
* Location pings do not write to the database on every update — Broadcast channel only
* Database writes occur at meaningful events only: beacon alert trigger, beacon cancel, ride start, ride end, final rider state
* Rationale: Postgres Changes pattern too expensive at fleet scale for high-frequency fan-out

### Background GPS

**Library:** expo-location with expo-task-manager for background task registration.

**Task lifecycle:**

* Background task registered at ride Join
* Task de-registered at ride End or session expiry

**Android Foreground Service Notification:**

Android requires any app running a background process — including GPS — to display a persistent notification for the duration of that process. This is a platform constraint, not a design choice.

When a rider joins an active ride, a notification appears in the status bar and notification shade for the full duration of the ride. If the rider dismisses it, Android kills the background GPS service and the rider stops broadcasting. After the Dark threshold (15 minutes default), Captain and SAG see the rider go Dark at their last known position. The rider's own screen continues to show their blue dot at actual current position — the rider may not know tracking has stopped.

Design requirements:

* Notification copy must communicate the consequence of dismissal without alarming: direction — *"Tracking active — keep this notification to stay on the map"* (final copy subject to Voice \& Tone review)
* On first ride join, an in-app explainer is shown before the rider locks their screen: plain language, one-time, dismissible. Sprint 0 implementation task for The Hands.

**Battery Saver detection:**

* On ride join and on screen lock, the app checks for Battery Saver mode (`PowerManager.isPowerSaveMode()`)
* If active, the app surfaces a prompt directing the rider to turn it off, with a direct link to device battery settings where the OS permits
* Battery Saver and OEM battery optimisation are separate system toggles — both require their own intercept

**OEM battery optimisation mitigation:**

* At first ride join, the app prompts the rider to exclude Vechelon from battery optimisation. Instruction is OEM-specific where possible:

  * Samsung: Device Care → Battery → Excluded Apps
  * Xiaomi: Battery Saver → No Restrictions
* Wakelock acquired during active ride to reduce CPU sleep risk
* These mitigations reduce risk — they do not eliminate it. OEM behaviour across Samsung/Xiaomi/Huawei is the primary PoC validation risk.

**PoC validation requirement — minimum test devices:**

|Device|Purpose|
|-|-|
|Google Pixel (stock Android)|Baseline|
|Samsung One UI|Highest market share, highest OEM kill risk|
|Xiaomi or Huawei (if available from Racer Sportif group)|Secondary OEM validation|

**Failure mode:** If the GPS task is killed by OEM battery management or Battery Saver, the rider stops publishing pings. After 15 minutes (Dark threshold), Captain and SAG see the rider go Dark. The rider's own screen shows their blue dot at actual current position. This is the expected degraded path — the system handles it gracefully. The PoC measures how frequently it occurs across OEMs.

\---

## §3. Feature Scope

### Rail 3 Feature Index

|#|Feature|Rail|Status|
|-|-|-|-|
|1|Live fleet tracking map|3a|⊘|
|2|Support Beacon — one-tap alert|3a|⊘|
|3|Ride controls — End Ride, Ad Hoc, QR|3a|⊘|
|4|Rider states \& edge indicators|3a|⊘|
|5|Ad hoc ride creation on road|3a|⊘|
|6|Route overlay on live map|3a|⊘|
|7|Full iOS parity with Android|3b|⊘|
|8|App Store submission|3b|⊘|
|9|Background GPS validation — iOS|3b|⊘|

\---

### Feature 1: Live Fleet Tracking Map

**Purpose:** Real-time shared situational awareness for Captain and SAG. Passive position reference for Riders (self + Captain/SAG icons only).

**Real-time pattern:**

* Riders publish GPS position to a ride-scoped Supabase Broadcast channel at ping intervals (D-54 targets)
* Captain and SAG subscribe and render received positions without a DB round-trip
* DB writes at meaningful events only — state transitions, beacon events, ride start/end

**Map canvas:**

* Full-bleed, floating controls as overlays
* Clustering for riders in close proximity — expand on tap or zoom
* Centre button: returns camera to user's current GPS position
* Edge Indicator: when a finish point exists and is off-screen, a directional arrow renders at the viewport boundary pointing toward it. Haversine formula — no routing engine, $0 cost. Does not render for rides with no defined finish point.

**Visibility by role:** → §4.1

**Icon differentiation:** By tactical state only (→ §5.3). Account type does not affect icon rendering. Account context surfaces in the Bottom Sheet only.

**Bottom Sheet:** Triggered by tapping a Captain, SAG, or rider icon (role-gated per §4.1).
Contents: display name, account state, tactical state, phone number (large monospace), Copy Number button, full-width Dial button (opens native dialler via tel: link).

\---

### Feature 2: Support Beacon

**Purpose:** One-tap distress signal. Rider signals position to Captain and SAG. No automated message sent — beacon changes the rider's icon state and Captain/SAG initiate contact.

**Trigger:** Single tap. No confirmation required. Speed is the UX priority in a distress event.

**On trigger:**

* Rider icon transitions to pulsing high-visibility state on Captain and SAG maps
* DB write to beacon\_alerts: rider\_id, ride\_id, lat/long at trigger time, triggered\_at
* Rider self-view: own icon shows pulsing state confirming beacon is active
* Alert latency: < 500ms (D-55, Supabase Broadcast)
* Haptic: strong

**Cancellation — by Captain or SAG:**

* Tap pulsing icon → Bottom Sheet → Cancel Support
* Beacon deactivated, rider state returns to Active
* DB write: beacon\_cancelled\_by (UUID), beacon\_cancelled\_at (timestamptz)
* Haptic on rider's device: medium

**Cancellation — by rider:**

* Rider taps Cancel Support on own screen
* Same state transition. beacon\_cancelled\_by written with the rider's own UUID (self-cancel). Distinguishes self-cancel from a failed write in the audit trail.
* Haptic: medium

**Visibility:** Captain and SAG only. Other riders do not see beacon state. Beaconing rider sees own icon in pulsing state only.

\---

### Feature 3: Ride Controls

**End Ride (Captain only):**

* Two-tap confirmation: primary tap → confirmation sheet → "Confirm End Ride"
* On confirm: ride → Saved, Hard Purge clock starts (T+4h), AI summary queued for async generation
* No in-app notification to other participants on ride end

**Create Ad Hoc Ride (Captain only):**

* Available when no ride is Active
* 2-hour proximity safeguard: if a scheduled ride exists within 2 hours, warning fires and Captain must explicitly confirm before creation proceeds (Scenario 12)
* On creation: ride name auto-populated (current date), start location from device GPS, ride Active immediately, QR generated
* Ad Hoc rides follow the same schema and lifecycle as scheduled rides
* Visible in Rail 1 and Rail 2 ride history post-close

**QR Display (Captain, SAG, Rider):**

* Full-screen QR, maximum size, high contrast
* Any active participant can display the QR to help a latecomer join
* QR encodes the ride join URL — same QR as generated in Rails 1 \& 2 for that ride
* Captain is the primary use case at ride start; all roles share the capability

\---

### Feature 4: Rider States \& Edge Indicators

**State machine:**

|State|Trigger|Captain/SAG Icon|Recovery|
|-|-|-|-|
|Active|Moving ping received|Solid filled|—|
|Stopped|No movement for 2 min (default)|Reduced opacity|Moving ping → Active|
|Inactive|No movement for 5 min (default)|Hollow|Moving ping → Active|
|Dark|No ping for 15 min (default)|Greyed at last known position|Valid ping → Active|

* Thresholds configurable at tenant level via tenants table. Defaults: 2 min / 5 min / 15 min.
* State transitions are passive — no automated alerts. Captain and SAG make human judgement calls.
* Dark state: rider's own screen shows actual current blue dot. Captain/SAG see last known position (greyed). These diverge intentionally — the rider may still have GPS but have lost connectivity.
* All riders see their own blue dot in all states including Dark.

**Edge Indicator:**

* Directional arrow at the viewport boundary pointing toward the off-screen finish point
* Haversine formula — bearing from current viewport centre to finish coordinates
* No routing engine. $0 cost.
* Does not render if no finish point is defined (e.g. Ad Hoc rides without a set finish)

\---

### Feature 5: Ad Hoc Ride Creation

→ Fully specified under Feature 3 (Ride Controls). Scenarios 11 and 12 from Pillar III govern this feature without modification.

\---

### Feature 6: Route Overlay on Live Map

GPX route rendered as a polyline overlay on the live map. Provides riders with route context during a ride.

* Deferred from PoC. Rail 3a production scope.
* GPX fetched from Supabase Storage (already present from Rails 1 \& 2)
* Rendered as GeoJSON polyline on react-native-maps
* Design pass required before build: colour, opacity, stroke weight must be legible in sunlight and not occlude rider icons
* \[TBD — Rail 3a production Brain session or targeted MACD]

\---

### Features 7–9: Rail 3b (iOS)

Post Rail 3a Android validation and Play Store submission. Full iOS parity, background GPS via expo-location iOS background mode, App Store submission.

**\[TBD — Rail 3b Brain Session]**

\---

## §4. Role Behaviour During Live Ride

### 4.1 Role Capability Matrix

|Capability|Captain|SAG|Rider / Guest Rider|
|-|-|-|-|
|**MAP \& VISIBILITY**||||
|Live fleet map — all riders|✓|✓|✗|
|Live fleet map — Captain + SAG icons|✓|✓|✓|
|Self blue dot (all states)|✓|✓|✓|
|Tap rider icon → Bottom Sheet|✓|✓|✗|
|Tap Captain icon → Bottom Sheet|—|✓|✓|
|Tap SAG icon → Bottom Sheet|✓|—|✓|
|Cluster expand on tap|✓|✓|✗|
|Centre button (return to self)|✓|✓|✓|
|**SUPPORT BEACON**||||
|Trigger own beacon|✓|✓|✓|
|Cancel own beacon|✓|✓|✓|
|Cancel any rider's beacon|✓|✓|✗|
|See pulsing beacon icon (others)|✓|✓|✗|
|See own icon in pulsing state|✓|✓|✓|
|**RIDE CONTROLS**||||
|End Ride|✓|✗|✗|
|Create Ad Hoc Ride|✓|✗|✗|
|Display QR code (full screen)|✓|✓|✓|
|**CONTACT**||||
|Bottom Sheet — view all riders' numbers|✓|✓|✗|
|Bottom Sheet — view Captain's number|—|✓|✓|
|Bottom Sheet — view SAG's number|✓|—|✓|
|Dial button — any rider|✓|✓|✗|
|Dial button — Captain / SAG|N/A|✓|✓|

### 4.2 Role Behaviour Notes

**Captain (Krys):** Reactive by design during the ride. Phone in back pocket, not mounted. Primary use: check map when something feels off, display QR at ride start, end the ride, create an Ad Hoc ride when no scheduled ride exists.

**SAG (Mike):** The active monitor. Vehicle-based — able to watch the screen continuously. First responder to beacon alerts and state changes. SAG cannot end a ride.

**Rider / Guest Rider (Paddy / Slim):** Passive during the ride. Tracked, not managing. Primary available action is the Support Beacon. Sees Captain and SAG icons only — not other riders. Contact affordance limited to Captain and SAG numbers. Guest Riders and Member Riders have identical Rail 3 capability — role governs access, not account type.

**SAG assignment:** Configured before ride start. Cannot be reassigned mid-ride in MVP. Schema supports multiple SAG records per ride (deferred).

\---

## §5. UX / Branding Logic

### 5.1 Core UX Principles

**Full-bleed map as primary canvas.** The map occupies 100% of the screen. All controls float above it as overlays. No persistent navigation chrome during an active ride.

**Glanceable.** Primary status is readable without tapping. Rider state changes communicate through icon state only — no text alerts, no modals, no banners during a live ride. The map is the readout.

**One-thumb.** All primary actions reachable from the bottom of the screen with the right thumb. Map pan and zoom are expected two-thumb interactions and are the exception. The Support Beacon is the highest-priority single-tap action and must be within natural thumb reach at all times.

**Sunlight readable.** High contrast icons and type throughout. Minimum contrast ratio 4.5:1. Bold, large typography in the Bottom Sheet. Dark state icons must be clearly distinguishable from Active icons under direct sunlight — a clear state change, not a subtle tonal shift.

**Haptic feedback — two events only.**

* Support Beacon trigger: strong haptic
* Support Beacon cancel (self or by Captain/SAG): medium haptic

No other Rail 3 interaction carries haptic feedback in the MVP.

**Large tap targets.** Minimum 48×48dp across all interactive elements. Ride control buttons: 64dp minimum. Map icons must be tappable while stationary — not sized for pinch-zoom precision.

**Screen-lock safe.** GPS tracking continues when the device screen locks. The Android Foreground Service Notification is a required platform constraint — see §2 Background GPS.

**Confirmation gates — two actions only.** End Ride (two-tap). Ad Hoc Ride creation when a scheduled ride exists within two hours (Scenario 12 warning). No other Rail 3 actions require confirmation.

**Bottom Sheet behaviour.** Slides up on icon tap. Dismissed by swipe down or tap outside. Does not auto-dismiss. Does not persist across map interactions.

### 5.2 Tenant Branding in React Native

At app initialisation, the app fetches brand config from the `tenants` table (primary\_colour, accent\_colour, logo\_url) and injects it into a React Native ThemeProvider (React Context). All themed components consume the ThemeProvider — action button colours, accent elements, wordmark. The map canvas (Google Maps) is excluded from tenant branding in MVP.

Library choice (React Native Paper ThemeProvider, custom context, or other) is an LLD decision — Sprint 0 task for The Hands.

### 5.3 Status Labels

Architectural state names are committed and used in schema, glossary, and internal logic.

|State (Architectural)|UX Label|Map Icon State|
|-|-|-|
|Active|Active|Solid filled icon|
|Stopped|Stopped|Reduced opacity icon|
|Inactive|Inactive|Hollow icon|
|Dark|Dark|Greyed icon at last known position|
|Beacon active|Beacon Active|Pulsing high-visibility overlay|

\---

## §6. C2 Container Diagram

```mermaid
%% v1.0.0
C4Container
    title Vechelon — All Rails — Container Diagram

    Person(admin, "Club Admin (Fab)", "Manages rides, members, routes")
    Person(captain, "Captain (Krys)", "Leads ride, manages fleet")
    Person(sag, "SAG / Support (Mike)", "Monitors fleet, manages beacons")
    Person(rider, "Rider / Guest Rider", "Joins ride, tracked, triggers beacon")

    Container\\\_Boundary(b\\\_rail1, "Rail 1 — Admin Desktop") {
        Container(adminApp, "Admin Web App", "React, Vercel", "Ride management, series scheduling, route library, member directory, club config")
    }

    Container\\\_Boundary(b\\\_rail2, "Rail 2 — Rider Desktop Portal") {
        Container(riderApp, "Rider Web App", "React, Vercel", "Ride feed, RSVP, route library, personal ride history")
    }

    Container\\\_Boundary(b\\\_rail3, "Rail 3 — Mobile Tactical App") {
        Container(mobileApp, "Mobile Tactical App", "React Native Expo — Android APK / Play Store", "Live fleet map, Support Beacon, ride controls, rider state tracking, background GPS")
    }

    Container\\\_Boundary(b\\\_supa, "Supabase Platform — Shared Project") {
        ContainerDb(db, "PostgreSQL Database", "Supabase", "Rides, participants, tenants, accounts, route library, Rail 3 tables (beacon\\\_alerts, rider\\\_states)")
        Container(auth, "Auth Service", "Supabase Auth", "Magic Link authentication, session management, RLS enforcement")
        Container(broadcast, "Realtime Broadcast", "Supabase Realtime", "Ephemeral WebSocket — live GPS position fan-out, beacon alerts. No DB write per ping.")
        Container(edgeFn, "Edge Functions / Cron", "Supabase Edge Functions", "Hard Purge (T+4h post-close), midnight UTC auto-close, AI summary generation")
        Container(storage, "File Storage", "Supabase Storage", "GPX route files, ride assets")
    }

    System\\\_Ext(googleMaps, "Google Maps API", "Map tile rendering")
    System\\\_Ext(dialler, "Native Phone Dialler", "tel: link — device native")

    Rel(admin, adminApp, "Manages rides, members, routes", "HTTPS")
    Rel(rider, riderApp, "Browses rides, RSVPs", "HTTPS")
    Rel(captain, mobileApp, "Monitors fleet, manages ride", "")
    Rel(sag, mobileApp, "Monitors fleet, manages beacons", "")
    Rel(rider, mobileApp, "Joins ride, tracked, triggers beacon", "")

    Rel(adminApp, auth, "Authenticates", "HTTPS")
    Rel(riderApp, auth, "Authenticates", "HTTPS")
    Rel(mobileApp, auth, "Authenticates", "HTTPS")

    Rel(adminApp, db, "Read/Write — rides, routes, members, tenants", "Supabase Client")
    Rel(riderApp, db, "Read/Write — RSVPs, ride history, Rider Feed", "Supabase Client")
    Rel(mobileApp, db, "Read — rides, participants, tenants. Write — beacon\\\_alerts, rider\\\_states, ride events only", "Supabase Client")
    Rel(mobileApp, broadcast, "Publish/Subscribe — live GPS positions (ephemeral, no DB write)", "WebSocket")
    Rel(mobileApp, storage, "Fetch GPX — route overlay (Rail 3a production)", "HTTPS")
    Rel(edgeFn, db, "Hard Purge, auto-close, summary writes", "Internal")
    Rel(adminApp, storage, "Upload GPX route files", "HTTPS")
    Rel(mobileApp, googleMaps, "Render live map tiles", "HTTPS")
    Rel(mobileApp, dialler, "Open native dialler via tel: link", "OS Intent")
```

