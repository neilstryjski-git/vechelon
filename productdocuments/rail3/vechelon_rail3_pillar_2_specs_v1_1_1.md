[Vechelon Rail 3] Pillar II: The Specs (v1.1.1)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.1.1 | Last Sync Date: 2026-09-13 | Status: COMMITTED

\---

## Change Log

|Version|Date|Time|MACD Action|Decision|Trio Lead|
|-|-|-|-|-|-|
|v0.1.0|2026-05-12|—|ADD|Initialized Rail 3 Pillar II shell. Platform strategy and infrastructure architecture committed.|TPM|
|v1.0.0|2026-05-12|—|ADD|Completed all TBD sections: role behaviour matrix, UX principles, full Rail 3a feature spec, C2 container diagram, background GPS detail. QR display opened to all roles. Battery Saver detection added. §5.3 UX label copy deferred to Stride milestone. Guest join flow deferred to Rail 3a production Sprint 0. Promoted DRAFT → COMMITTED.|TPM|
|v1.0.1|2026-05-12|—|DELETE|Removed Open-Meteo from C2 container diagram. Weather is not a Rail 3 concern.|TPM|
|v1.0.2|2026-05-12|—|CHANGE|§2 beacon\_alerts schema and §3.2 self-cancel rule: beacon\_cancelled\_by now written with rider's own UUID on self-cancel. Null reserved for system error only. Rationale: null is indistinguishable from a failed write — rider UUID is a valid FK, requires no schema change, and produces an unambiguous audit trail on a safety event.|TPM|
|v1.1.1|2026-09-13|—|CHANGE|Hands-readiness pass. §2 Task lifecycle corrected from the superseded expo task-registration framing to the Transistorsoft engine, resolving a contradiction against committed Pillar III R3-34 and R3-35, whose traces point at these lines (finding F-3). §3 Feature 4 gains a threshold-ownership clause ruled by the Senior PM, discharging Hands item 22.|TPM|
|v1.1.0|2026-09-08|—|CHANGE|G33 Pillar II pass (MACD session). §1: Guest Join Flow production resolution superseded by R-GUEST as amended (D-QR-5); Cross-Surface Session Handoff added (slate 8); Rail 3a and 3b GPS lines to Transistorsoft. §2: Stack and Background GPS to Transistorsoft engine; A4 named exception reconciling the Inherited Tables contradiction; beacon read path (slate 7); two-class retention model with rail3\_breadcrumb (C1, B2, slate 10); telemetry requirement, two tiers (slate 6, Session D); degraded-path text superseded (A3, B1). §3: feature index rows 10 to 12; Feature 1 ride list and join (D2); Feature 3 QR Display narrowed to Captain and SAG with credential routing (D-QR-1 to D-QR-8), End Ride any Captain with inactivity backstop (B2), Leave Ride added (C3); Feature 4 threshold coupling (D5). §4.1: Rider and Guest Rider columns split; ROSTER section (C2, slate 8 rider, slate 17). §4.2: SAG QR display; Rider and Guest split; command model (slate 9). §5.1: device-advisory exception (B3). §5.3: overlay-as-presentation table (A3). §6 C2 to v1.1.0: actors split, guest Rel, scheduler three jobs, midnight auto-close superseded (B2, D2). Immutable Numbering: superseded bullets tagged \[DELETED - 2026-09-08], no re-indexing.|TPM|

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
* Background GPS: Transistorsoft engine, deterministic engagement at join per R3-37
* Maps: react-native-maps

### Production — Rail 3b (iOS)

* Sequencing: Post Rail 3a validation and Play Store submission
* Distribution: Apple App Store
* Background GPS: Transistorsoft engine (iOS background mode, Rail 3b Brain Session to confirm)
* \[TBD — Rail 3b Brain Session]

### Why Not PWA

PWA rejected. Background GPS fails on Android when screen is locked — Geolocation API not available to Service Workers. iOS excluded entirely — WebKit mandated, same constraint, no workaround.

### Why Not Capacitor (Path B)

Capacitor rejected. WebView ceiling on live fleet map performance under concurrent GPS and WebSocket load. Code reuse advantage eliminated where it matters most — background GPS and map performance both require native plugins regardless of Capacitor wrapper.

### Cross-Surface Session Handoff

PWA and native remain separate session containers by platform design, committed to behave as one identity. PWA to native is the key moment: a deep-link token carries ride context and auth across the crossing, built and tested to the ride-start friction budget. Native to PWA is deprioritised: silent re-auth covers it opportunistically, no dedicated build, no scenario, no test priority. QR is not a handoff mechanism; it hands sessions between people, and this is one rider, two surfaces. Own-marker-live at join composes with the Feature 1 engine-start rule and R3-37. Token lifetime, refresh, and trust rules inherit this ruling and land in the platform-substrate pass (slate 15). Three scenarios enshrined in Pillar III supersede R3-61.

### Guest Join Flow

Zero-Friction participation constraint (→ Rail 1 Pillar I §2) remains active for production.

\[DELETED - 2026-09-08] In the React Native context, sideloaded APKs are not viable for parking lot joins. Production resolution: guests install via Google Play Store, create an account with email verification, and join the active ride. Email is required for ride history carry-forward and account promotion. Riders without email receive a one-ride session with no conversion path. Superseded by R-GUEST (Session A) as amended at MACD. This resolution loaded friction onto participation itself: Play Store install, account creation, email verification, in a parking lot.

Ratified resolution. Guests are portal-side participants only: roster presence with name and phone, no account, no native app. Email is optional at guest entry, per D-QR-5 amending R-GUEST's no-email commitment; where supplied it sends the signup email and is held as a conversion payload, not an identity. A guest self-registers by scanning the ride QR a Captain or SAG displays (§3 Feature 3). A guest sees the PWA roster page for their ride. Captain and SAG see guests on the native app roster, marked as non-app users. Guests never render on the fleet map.

Native app access is a benefit of club membership. Entitlement is tenant-level: the club pays and access is available to its members, not purchased per rider. Registration and affiliation is the conversion path; auto-affiliation is a tenant configuration determining whether an admin must manually accept the membership. The club remains the authorising party. Conversion never gates participation.

This model puts zero friction on participation and moves all friction onto app access, which the guest elects. It honours Rail 1 Pillar I §2 more faithfully than the superseded resolution did.

\[DELETED - 2026-09-08] The full parking lot guest join experience is a Sprint 0 task for the Rail 3a production Brain session, not in scope for PoC. Superseded: there is no Rail 3a production guest join. PDoD-03 discharged; see Pillar IV.

\---

## §2. Technical Architecture

### Stack

|Layer|Technology|
|-|-|
|Mobile framework|React Native Expo (managed workflow)|
|Maps|react-native-maps|
|Background GPS|Transistorsoft engine (licence purchased 2026-08-01)|
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
* ride\_participants (Rail 3 writes during an active ride: location fields under the A4 named exception below; beacon status flag per slate 7; departure state per Feature 3 Leave Ride)
* ride\_support
* tenants
* accounts

#### New Rail 3 Tables

|Table|Purpose|Retention|
|-|-|-|
|beacon\_alerts|Support Beacon events with location snapshot, cancellation actor and timestamp|4-hour Hard Purge (personal-data class)|
|rider\_states|Active state per rider during live ride|4-hour Hard Purge (personal-data class)|
|rail3\_breadcrumb|Club-owned ride trail. Coordinates only, no identity fields. Owned by the Captain who starts the ride, sole and non-transferable, for the ride's duration|Purge-exempt (club-artifact class). Survives Hard Purge as a club record, companion to the AI ride summary|

> Location pings are ephemeral: Supabase Broadcast channel only, no DB write per ping. One named exception, A4 below.

#### A4 named exception: periodic last-known write

Reconciles two committed lines. The Inherited Tables line permits Rail 3 location writes to ride\_participants; the meaningful-events rule forbids per-ping writes. Both stand. The last-known write is a governed exception, not a per-ping write.

* Single-row overwrite, never accumulated. That is what keeps it a position, not a trail
* Last known is a first-class fallback to live: renders on read-channel activation until live arrives
* Cadence bound: a ceiling for privacy, a floor for fallback quality
* ride\_participants location fields therefore hold governed data. Purge-scoped per the retention model below

#### Beacon read path (slate 7)

* Beacon status is a durable current-state flag on the participant record, read on app focus and channel activation, superseded on clear. No event history, no replay
* Raising a beacon forces a last-known position write (A4) in the same operation, so the alert always has a position to anchor it
* A returning device renders the beacon at last-known with the stale overlay until live supersedes. Clear semantics untouched
* Purge-scoped per the retention model below

#### Retention model: two classes

* Personal data, T+4h Hard Purge: beacon\_alerts, rider\_states, ride\_participants location fields, and any per-rider position data
* Club artifacts, purge-exempt: rail3\_breadcrumb and the AI ride summary. AI summary generation sequences before any scrub that touches its inputs
* Breadcrumb honesty constraint: the roster is retained and the ride names its Captain, so the surviving breadcrumb is pseudonymous, not anonymous, and re-linkable by anyone with club access. This is an artifact-class change, a person's trail becoming the ride's route with no identity fields in the table. It is not non-attributable. The Captain accepts attribution by starting the ride
* Breadcrumb continuity: one breadcrumb per ride. If the owning Captain departs and returns, capture resumes; the gap is acceptable and intended
* Breadcrumb presentation: the gap renders as a visible break, never interpolated or smoothed
* Read-side backfill: fetch on open and resume when not rendered locally, live tip extension from position broadcasts. Write-side autoSync excluded

#### Telemetry requirement

Operational self-reporting is a Rail 3 requirement, two tiers.

* Always-on tier: cheap counters only. Engine started, engine died, warning fired. Permanent floor, never switched off. This is what makes the arc's field-evidence deferrals reachable: an incident with no record cannot fire a trigger
* Full-capture tier: switched, a test-and-calibration mode for intense ride testing, never a permanent stream. Covers engine lifecycle events, fix gaps, warning firings, wake attempts and outcomes, teardown completions
* Scope boundary for both tiers: device operational state, never rider position history. The position-trail prohibition applies, the same line A4 and the autoSync exclusion drew
* Config home is operator-level, server-side, adjustable without an app release, keyed per platform, matching the self-health threshold configuration (slate 4). No rider-facing surface in either tier; invisible to every persona
* Scope and retention of each tier: Hands item 20, Trio guidance approved at MACD

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

**Library:** Transistorsoft engine. Licence purchased 2026-08-01. Deterministic engagement at join per R3-37, join-time engine start. Lifecycle decoupled from the app per R3-38, D91 lifecycle decoupling.

**Task lifecycle:**

* Transistorsoft background geolocation engine started for the ride at Join, deterministically engaged per R3-37
* Engine stopped and its background task de-registered at ride End or session expiry

**Android Foreground Service Notification:**

Android requires any app running a background process — including GPS — to display a persistent notification for the duration of that process. This is a platform constraint, not a design choice.

When a rider joins an active ride, a notification appears in the status bar and notification shade for the full duration of the ride. If the rider dismisses it, Android kills the background GPS service and the rider stops broadcasting. After the Dark threshold (15 minutes default), Captain and SAG see the rider go Dark at their last known position. The rider's own screen continues to show their blue dot at actual current position, with the self-health overlay (R3-40) marking not-reaching and an unlock-and-focus prompt issued while the condition persists. Self-heal is silent.

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

**Failure mode:** If the GPS task is killed by OEM battery management or Battery Saver, the rider stops publishing pings. After 15 minutes (Dark threshold), Captain and SAG see the rider go Dark. The rider's own screen shows their blue dot at actual current position with the self-health overlay marking not-reaching. Recovery is Layer 3 (B1), split: device-side, a native heartbeat and headless task re-assert the engine; server-side, a staleness detector behind the scheduler reads last\_ping under the A4 exception and issues an FCM wake. Write-side autoSync is excluded. The PoC measures how frequently engine death occurs across OEMs.

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
|10|Roster — complete participant record, safety floor|3a|Built in PoC, enshrined (C2)|
|11|Breadcrumb — club-owned ride trail, purge-exempt|3a|Built in PoC, enshrined (C1)|
|12|Departure — leave ride as a first-class action|3a|Built in PoC, enshrined (C3)|

\---

### Feature 1: Live Fleet Tracking Map

**Purpose:** Real-time shared situational awareness for Captain and SAG. Passive position reference for Riders (self + Captain/SAG icons only).

**Ride list and join:**

* List shows rides in the next 24 hours: a rolling window, not calendar-today, so an early morning ride is visible the evening before. Active visually distinct from not-yet-started. No multi-day browse; discovery is Rail 2's job
* Rides auto-start around an hour before schedule so the ride is live when riders arrive: open app, tap join. Auto-start is the third scheduler job. A no-show ride produces no pings and the inactivity backstop closes it
* RSVP is a planning action signalling intent. Join is the single runtime action confirming actively riding, taken at the venue. RSVP'd riders must still join. No RSVP-to-roster conversion exists; the roster is populated by joins only, so every roster row is a confirmed rider
* Join is legitimate from both PWA and app
* Engine start ties to ride start and device engagement, never to join alone

**Real-time pattern:**

* Riders publish GPS position to a ride-scoped Supabase Broadcast channel at ping intervals (D-54 targets)
* Captain and SAG subscribe and render received positions without a DB round-trip
* DB writes at meaningful events only — state transitions, beacon events, ride start/end, and the A4 periodic last-known write (§2)

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

**End Ride (any Captain on the ride):**

* Two-tap confirmation: primary tap → confirmation sheet → "Confirm End Ride"
* On confirm: ride → Saved, Hard Purge clock starts (T+4h), AI summary queued for async generation
* No in-app notification to other participants on ride end
* Backstop is inactivity only: no pings from any participant for N hours, tenant-configurable. No wall-clock sweep; a global product carries no safe wall clock
* Known gap, recorded: a device still pinging after its rider went home holds the ride open. Duration-cap parameter available to the Ledger if field data warrants

**Leave Ride (all roles):**

* Leaving the map means leaving the ride. Navigation off the map is the deliberate invocation; no confirmation gate, per §5.1's two-gate rule. Rejoin bounds the mistake
* Teardown: engine stop, depart broadcast, last_* null-out, roster marked departed, rejoin available
* No rider's departure, including the Captain's, ends the ride for others. Leave and End are distinct: Leave individual and universal, End the explicit Captain close

**Create Ad Hoc Ride (Captain only):**

* Available when no ride is Active
* 2-hour proximity safeguard: if a scheduled ride exists within 2 hours, warning fires and Captain must explicitly confirm before creation proceeds (Scenario 12)
* On creation: ride name auto-populated (current date), start location from device GPS, ride Active immediately, QR generated
* Ad Hoc rides follow the same schema and lifecycle as scheduled rides
* Visible in Rail 1 and Rail 2 ride history post-close

**QR Display (Captain and SAG):**

* Full-screen QR, maximum size, high contrast
* Captain and SAG display the QR. Displaying it is the act of authorising a person onto the ride
* QR encodes the ride join URL, the same QR as generated in Rails 1 \& 2 for that ride
* The code routes by the scanner's credentials. A scanner without an account reaches guest self-registration: name and phone mandatory, email optional
* QR is not a member join path. Members join in-app
* \[DELETED - 2026-09-08] Any active participant can display the QR to help a latecomer join. Superseded by D-QR-3 as amended, Captain and SAG are the guest authorisation gate. Rider removed. The latecomer member-join purpose it served was itself removed by D-QR-1
* \[DELETED - 2026-09-08] Captain is the primary use case at ride start; all roles share the capability. Superseded by D-QR-3 as amended

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
* Threshold coupling, documented not coded: the Inactive threshold (5 min, UI rendering) and the engine's stationary stopTimeout (5 min, Transistorsoft) coincide by accident. They answer different questions and may legitimately diverge. If retuned independently, the engine may sleep before or after the UI renders Inactive; neither is wrong, but nobody should discover the interaction by surprise. Touches R3-44 and R3-50. Documented against the interim power posture (slate 2)
* Threshold ownership, ruled 2026-09-13 (Hands item 22 discharged): the fleet-state thresholds above are tenant-level because they are a presentation preference. A club chooses how its own map reads, a racing peloton and a touring group legitimately differ, and a wrong value degrades glanceability visibly and is retunable. The self-health clocks (slate 4; §5.3 and R3-40) are operator-level, server-side and keyed per platform, never tenant-exposed, because they are a safety guarantee and an evidence instrument: a wrong value silences the one signal telling a rider they have gone invisible, and a per-tenant value would make the always-on telemetry warning-fired counter mean something different in every club, corrupting the field-evidence base that slate 2 and slate 12 both defer onto. Consolidation is per platform, not global; the iOS key is reserved empty per slate 4. The two clocks do not interact: fleet state derives from ping receipt, self-health from fix production. Different inputs, no coupling, unlike the accidental coincidence documented above
* State transitions are passive — no automated alerts. Captain and SAG make human judgement calls.
* Dark state: rider's own screen shows actual current blue dot, with the self-health overlay (§5.3, R3-40) marking not-reaching. Captain/SAG see last known position (greyed). These diverge intentionally — the rider may still have GPS but have lost connectivity.
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

Post Rail 3a Android validation and Play Store submission. Full iOS parity, background GPS via Transistorsoft engine iOS background mode (Rail 3b Brain Session to confirm), App Store submission.

**\[TBD — Rail 3b Brain Session]**

\---

## §4. Role Behaviour During Live Ride

### 4.1 Role Capability Matrix

|Capability|Captain|SAG|Rider|Guest Rider|
|-|-|-|-|-|
|**MAP \& VISIBILITY**|||||
|Live fleet map — all riders|✓|✓|✗|✗|
|Live fleet map — Captain + SAG icons|✓|✓|✓|✗|
|Self blue dot (all states)|✓|✓|✓|✗|
|Tap rider icon → Bottom Sheet|✓|✓|✗|✗|
|Tap Captain icon → Bottom Sheet|—|✓|✓|✗|
|Tap SAG icon → Bottom Sheet|✓|—|✓|✗|
|Cluster expand on tap|✓|✓|✗|✗|
|Centre button (return to self)|✓|✓|✓|✗|
|**SUPPORT BEACON**|||||
|Trigger own beacon|✓|✓|✓|✗|
|Cancel own beacon|✓|✓|✓|✗|
|Cancel any rider's beacon|✓|✓|✗|✗|
|See pulsing beacon icon (others)|✓|✓|✗|✗|
|See own icon in pulsing state|✓|✓|✓|✗|
|**RIDE CONTROLS**|||||
|End Ride|✓|✗|✗|✗|
|Create Ad Hoc Ride|✓|✗|✗|✗|
|Display QR code (full screen)|✓|✓|✗|✗|
|**ROSTER**|||||
|Roster — open (entry point for all roles)|✓|✓|✓|✓ PWA|
|Roster — complete participant record including guests. Diverges from the map, which never renders guests|✓|✓|✓|✓ PWA|
|Roster — per-row participation state: app-tracked or roster-only|✓|✓|✓|✓ PWA|
|Roster — view leaders' (Captain, SAG) name and phone|✓|✓|✓|✓ PWA|
|Roster — view every participant's phone|✓|✓|✗|✗|
|Roster — rider-to-rider contact|Parked, O-07 contact scope||||
|**CONTACT**|||||
|Bottom Sheet — view all riders' numbers|✓|✓|✗|✗|
|Bottom Sheet — view Captain's number|—|✓|✓|✗|
|Bottom Sheet — view SAG's number|✓|—|✓|✗|
|Dial button — any rider|✓|✓|✗|✗|
|Dial button — Captain / SAG|N/A|✓|✓|✗|

Guest Rider is not a Rail 3 app user. Every ✗ in that column reflects absence of the app, not a denied permission. Guest participation is roster-side only, per Pillar I §4 and R-GUEST; ✓ PWA marks the roster page reached through the Rail 2 PWA.

Roster-only is a permanent state: guests, non-installing members, and every iOS rider until Rail 3b. It is distinct from an app participant not currently producing a position, which stays with the fleet ladder (Feature 4) and is not duplicated into the roster.

The roster is the safety floor. Every failure mode degrades to "call them," and the roster is where that path lives; it is also what makes inactivity-only auto-close safe. The phone column is protected from removal on that dependency.

### 4.2 Role Behaviour Notes

**Captain (Krys):** Reactive by design during the ride. Phone in back pocket, not mounted. Primary use: check map when something feels off, display QR at ride start, end the ride, create an Ad Hoc ride when no scheduled ride exists.

**SAG (Mike):** The active monitor. Vehicle-based — able to watch the screen continuously. First responder to beacon alerts and state changes. SAG cannot end a ride. SAG may display the ride QR to authorise a guest onto the ride, sharing that gate with the Captain.

**Rider (Paddy):** Passive during the ride. Tracked, not managing. Primary available action is the Support Beacon. Sees Captain and SAG icons only, not other riders. Contact affordance limited to Captain and SAG numbers. Joins in-app.

**Guest Rider (Slim):** Not a Rail 3 app user. Roster presence only, created by self-registration through the ride QR a Captain or SAG displays. Never renders on the fleet map, produces no position, has no Support Beacon. Contact reach is two-way by phone through the roster row. Conversion to membership is available and never gates participation; see Pillar I §4.

**SAG assignment:** Configured before ride start. Cannot be reassigned mid-ride in MVP. Schema supports multiple SAG records per ride (deferred).

**Command model, captainless-degraded:** No role transfer on Captain departure, no promotion, no designation ceremony. The ride survives per Feature 3 Leave Ride; roster, map, Support Beacon, and the Support surface all continue under existing role envelopes. Degraded means nobody holds Captain powers, not that surfaces vanish. End Ride: any Captain on the ride; if none remains, the ride closes by the inactivity backstop, which was designed to make exactly this safe. Breadcrumb capture stops on owner departure and resumes on return. Breadcrumb viewers move to the route overlay on Captain departure, cue framed as Captain-departure news, never silent. A returning Captain restores everything. Nobody's powers change mid-ride.

\---

## §5. UX / Branding Logic

### 5.1 Core UX Principles

**Full-bleed map as primary canvas.** The map occupies 100% of the screen. All controls float above it as overlays. No persistent navigation chrome during an active ride.

**Glanceable.** Primary status is readable without tapping. Rider state changes communicate through icon state only — no text alerts, no modals, no banners during a live ride. The map is the readout.

Exception: device advisories sit outside this prohibition. The self-health unlock-and-focus prompt (R3-40) and the Battery Saver advisory (R3-49) fire at unlock, only while their condition persists and the rider can act. They are prompts, never preconditions. At collision, self-health takes precedence and the Saver advisory suppresses while it fires; the Saver advisory stands alone when Saver is on but tracking is healthy. Self-heal is silent; no post-heal message.

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

The ladder carries ping-derived tactical state and nothing else. Overlays are presentations, not rungs; no overlay adds a state, a swatch, or a ladder position.

|Overlay (Presentation)|Surface|Rendering|
|-|-|-|
|Self-health, R3-40|Rider's own blue dot|Binary badge: reaching or not reaching. Additive on the self marker, anchored to live GPS, carries state only, never a second position. The rider surface renders exactly one position, ever|
|Stale under beacon|Captain and SAG surfaces|Renders only in coincidence with Beacon Active, freshness under a beacon. Never as general fleet state|

Badge geometry is Hands decision D-G33-A3-01. Exact dp and colour token: design pass.

\---

## §6. C2 Container Diagram

```mermaid
%% v1.1.0
C4Container
    title Vechelon — All Rails — Container Diagram

    Person(admin, "Club Admin (Fab)", "Manages rides, members, routes")
    Person(captain, "Captain (Krys)", "Leads ride, manages fleet")
    Person(sag, "SAG / Support (Mike)", "Monitors fleet, manages beacons")
    Person(rider, "Rider (Paddy)", "Joins ride in-app, tracked, triggers beacon")
    Person(guest, "Guest Rider (Slim Shadey)", "Roster-only. Self-registers via ride QR. No native app")

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
        Container(edgeFn, "Edge Functions / Cron", "Supabase Edge Functions", "Three scheduled jobs: auto-start (around an hour before schedule), inactivity auto-close (no pings from any participant for N hours, tenant-configurable, no wall-clock sweep), Hard Purge (T+4h post-close). AI summary generation")
        Container(storage, "File Storage", "Supabase Storage", "GPX route files, ride assets")
    }

    System\\\_Ext(googleMaps, "Google Maps API", "Map tile rendering")
    System\\\_Ext(dialler, "Native Phone Dialler", "tel: link — device native")

    Rel(admin, adminApp, "Manages rides, members, routes", "HTTPS")
    Rel(rider, riderApp, "Browses rides, RSVPs", "HTTPS")
    Rel(guest, riderApp, "Self-registers via ride QR, views ride roster page", "HTTPS")
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
    Rel(edgeFn, db, "Auto-start, inactivity auto-close, Hard Purge, summary writes", "Internal")
    Rel(adminApp, storage, "Upload GPX route files", "HTTPS")
    Rel(mobileApp, googleMaps, "Render live map tiles", "HTTPS")
    Rel(mobileApp, dialler, "Open native dialler via tel: link", "OS Intent")
```

