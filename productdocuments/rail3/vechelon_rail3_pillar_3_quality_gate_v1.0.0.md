[Vechelon Rail 3] Pillar III: The Quality Gate (v1.0.0)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.0.0 | Last Sync Date: 2026-05-12 | Status: COMMITTED

---

## Change Log
| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | — | ADD | Initialized Rail 3 Pillar III shell | TPM |
| v1.0.0 | 2026-05-12 | — | ADD | Completed §1 Definition of Done, all §2 BDD scenarios (R3-01 through R3-35), completed §3 PoC Field Validation Plan pass criteria. GAP-01 resolved as measurement exercise. GAP-02 resolved as volunteer-count basis. GAP-03 (F-07, F-08) scoped out of PoC. Promoted DRAFT → COMMITTED. | TPM |

---

## Scenario Numbering Reference

Rail 3 Pillar III is the union of two scenario sets:

| Set | Numbering | Source | Status |
|---|---|---|---|
| Inherited scenarios | 1, 4, 5, 11–29, 34 | Vechelon Pillar III v1.4.0 via Pillar Summary | Carried forward — referenced, not duplicated |
| Rail 3 native scenarios | R3-01 through R3-35 | This document | Authored this session |

The Quality Gate is not cleared until both sets pass. Immutable numbering is preserved across both — items are never removed or re-indexed.

---

## §1. Definition of Done

### 1.1 PoC Definition of Done

The Rail 3 PoC is complete when all of the following are confirmed during field testing with Racer Sportif:

| # | Criterion | Type | Pillar II Trace |
|---|---|---|---|
| DoD-01 | Background GPS tracks continuously with device screen locked on at least one test device | Binary | §2 Background GPS |
| DoD-02 | OEM battery optimisation behaviour measured and recorded across all available test devices | Measurement | §2 Background GPS |
| DoD-03 | Foreground Service Notification present for duration of ride on all Android test devices | Binary | §2 Background GPS |
| DoD-04 | All Role Capability Matrix actions (Pillar II §4.1) confirmed functional for Captain, SAG, and Rider | Binary | §4.1 |
| DoD-05 | Support Beacon trigger-to-alert latency measured on Captain and SAG devices (target <500ms, D-55). Instrumentation: client-side timestamp at trigger on rider's device, timestamp at receipt on Captain/SAG device, delta logged. Sprint 0 task for The Hands to wire instrumentation before PoC field test. | Measurement | §3.2, D-55 |
| DoD-06 | Rider state machine transitions observed in real ride conditions: Active → Stopped → Inactive → Dark, and recovery to Active | Binary | §3.4 |
| DoD-07 | End Ride confirmed: ride transitions to Saved, Hard Purge clock confirmed to start | Binary | §3.3 |
| DoD-08 | Hard Purge confirmed at T+4h: all records in beacon_alerts and rider_states for the ride_id deleted | Binary | §2 Supabase Architecture |
| DoD-09 | QR join confirmed for registered members on all PoC test devices | Binary | §3.3 |
| DoD-10 | Supabase Broadcast confirmed as transport for live GPS fan-out — no DB write per ping verified | Binary | §2 Real-time Pattern |
| DoD-11 | Glanceable UX assessed: SAG-role readability evaluated under simulated monitoring conditions | Qualitative | §5.1 |
| DoD-12 | RLS isolation confirmed: no cross-tenant data access possible | Binary | Pillar I §3, Pillar Summary §1.3 |
| DoD-13 | Battery drain measured across active tracking period on at least one device (target <10%/hr, D-54) | Measurement | §2 Performance NFRs |

### 1.2 Production Rail 3a Definition of Done

Before Rail 3a production begins, the following must be confirmed:

| # | Criterion | Dependency |
|---|---|---|
| PDoD-01 | All PoC Measurement results reviewed and Senior PM acceptance recorded in Ledger | PoC complete |
| PDoD-02 | All BDD scenarios in §2 of this Pillar cleared by The Hands | Rail 3a build |
| PDoD-03 | Guest join flow formally resolved in Rail 3a Brain session — Scenario 1 conflict resolved and scenario updated | Rail 3a Brain session |
| PDoD-04 | F-07 Brain decision committed to Ledger — beacon visibility to other riders resolved | Rail 3a Brain session |
| PDoD-05 | F-08 Brain decision committed to Ledger — Dark state last known position retention resolved | Rail 3a Brain session |
| PDoD-06 | UX label copy (§5.3 Pillar II status labels) confirmed via Stride milestone and MACD applied | Stride milestone |
| PDoD-07 | Play Store submission package prepared | Rail 3a build complete |

---

## §2. BDD Scenarios

### Global Rules — Apply to All Rail 3 Scenarios

These rules are inherited from the committed global rules (Pillar Summary §9) and apply without exception to all scenarios below:

- **Self-position:** A ride participant always sees their own position as a blue dot in all states including Stopped, Inactive, and Dark.
- **No in-app contact:** Phone numbers displayed with a native Dial button only. No in-app messaging in this phase.
- **Fleet visibility:** Captain and SAG see all ride participants. Ride participants see Captain and SAG only — not other riders.
- **Ride end authority:** Admin or Captain can end a ride. SAG cannot.
- **Support Beacon visibility:** Beacon state visible to Captain and SAG only. The beaconing participant sees their own icon in the alerted pulsing state. `[PENDING — F-07 Brain Decision]` Whether beacon is also visible to other riders is explicitly deferred and must not be built or tested until resolved.
- **RSVP is intent only:** RSVP does not transition a participant to Active. Explicit Join action or QR scan on ride day is required. No ghost participants on the tactical map. (SD-02)

---

### Inherited Scenarios (Pillar III v1.4.0) — Required for Rail 3a

The following scenarios are carried forward verbatim. They are not duplicated here. Rail 3 The Hands must clear all of them:

- **Scenario 4:** Member RSVPs via app pre-ride and joins when ride activates
- **Scenario 5:** Member joins active ride late
- **Scenario 11:** Captain creates Ad Hoc ride
- **Scenario 12:** Ad Hoc ride safeguard (scheduled ride within 2 hours)
- **Scenario 13:** Scheduled ride auto-activates *(see correction note in Pillar Summary §9)*
- **Scenario 14:** Admin manually starts ride early
- **Scenario 15:** Admin or Captain ends ride
- **Scenario 16:** Midnight UTC auto-close
- **Scenario 17:** Active → Stopped transition
- **Scenario 18:** Stopped → Active recovery
- **Scenario 19:** Inactive transition
- **Scenario 20:** Dark state — signal lost
- **Scenario 21:** Dark → Active recovery
- **Scenario 22:** Ride participant triggers Support Beacon `[PENDING — F-07 Brain Decision on other-rider visibility]`
- **Scenario 23:** Captain cancels Support Beacon
- **Scenario 24:** Ride participant cancels own Support Beacon
- **Scenario 25:** Captain contacts Inactive ride participant (Bottom Sheet)
- **Scenario 26:** Ride participant contacts Captain (Bottom Sheet)
- **Scenario 27:** Cross-device number reading
- **Scenario 28:** 4-hour purge after admin close — *consolidated into R3-36 for Rail 3 scope. Inherited scenario remains valid for Rails 1 & 2 context.*
- **Scenario 29:** Midnight auto-close purge — *consolidated into R3-36 for Rail 3 scope. Inherited scenario remains valid for Rails 1 & 2 context.*
- **Scenario 34:** Tenant branding injection on load (PWA path) — Rail 3 native parallel written as R3-18 below

---

### 2.1 Background GPS

**R3-01: GPS continues when screen is locked**
```
Given a rider has joined an active ride on Rail 3
And the app is running in the background
When the rider locks their device screen
Then location pings continue to broadcast on the Supabase Broadcast channel
And the rider's marker remains live and updating on the fleet map for Captain and SAG
```
*Trace: Pillar II §2 Background GPS — task lifecycle, background task registered at ride Join*

---

**R3-02: OEM battery optimisation — measurement exercise (not binary pass/fail)**
```
Given a rider is on a test device [parameterised: stock Android / Samsung One UI / additional OEM if available]
And the app is tracking location in the background with the screen locked
When the device applies battery optimisation during the ride
Then the outcome is recorded per device:
  - GPS task survived to ride end without intervention [record: YES / NO]
  - GPS task killed mid-ride [record: YES / time elapsed before kill]
  - Manual intervention was required to restore tracking [record: YES / NO, describe]
  - Rider went Dark on Captain / SAG map [record: YES / NO]
```
*Trace: Pillar II §2 Background GPS — OEM battery optimisation mitigation. GAP-01 resolution: measurement exercise only, no binary pass threshold.*
> PoC outcome feeds Rail 3a production decision on whether additional OEM-specific mitigations are required.

---

**R3-03: Foreground Service Notification present for duration of ride**
```
Given a rider has joined an active ride on Rail 3
When the rider locks their screen
Then a persistent notification is visible in the Android status bar and notification shade
And the notification communicates that tracking is active
And the notification remains visible for the full duration of the ride
```
*Trace: Pillar II §2 — Android Foreground Service Notification is a platform constraint. Required for any app running a background GPS process.*

---

**R3-04: Foreground Service Notification dismissed — GPS service terminates**
```
Given a rider has an active ride GPS session running in the background
And the Foreground Service Notification is visible in the notification shade
When the rider dismisses the notification
Then Android terminates the background GPS service
And the rider stops broadcasting location pings
And after the Dark threshold (default 15 minutes), the rider's icon transitions to Dark on Captain and SAG maps
And the rider's own screen continues to show their blue dot at their actual current GPS position
```
*Trace: Pillar II §2 — documented failure mode. Rider may not be aware tracking has stopped.*

---

**R3-05: Battery Saver mode detected at ride join**
```
Given a rider opens Rail 3 and taps Join on an active ride
And the rider's device has Battery Saver mode active
When the app detects Battery Saver mode via PowerManager.isPowerSaveMode()
Then the app surfaces a prompt directing the rider to turn off Battery Saver
And the prompt includes a direct link to battery settings where the OS permits
And the ride join proceeds regardless — the prompt is advisory, not blocking
```
*Trace: Pillar II §2 — Battery Saver detection. Battery Saver and OEM battery optimisation are separate system toggles, both require intercept.*

---

**R3-06: Battery Saver mode detected on screen lock**
```
Given a rider has joined an active ride
And Battery Saver mode is enabled after joining
When the app detects Battery Saver mode on screen lock event
Then the app surfaces a prompt directing the rider to turn off Battery Saver
And the prompt includes a direct link to battery settings where the OS permits
```
*Trace: Pillar II §2 — on ride join and on screen lock, Battery Saver check fires.*

---

**R3-07: First-ride in-app explainer shown before screen lock**
```
Given it is a rider's first time joining an active ride on Rail 3
When the rider has joined and the ride is active
Then the app displays a one-time plain language explainer before the rider locks their screen
And the explainer communicates the consequence of dismissing the Foreground Service Notification
And the explainer is dismissible by the rider
And the explainer does not appear again on subsequent ride joins for the same rider
```
*Trace: Pillar II §2 — "On first ride join, an in-app explainer is shown before the rider locks their screen: plain language, one-time, dismissible." Sprint 0 implementation task for The Hands.*

---

### 2.2 Live Fleet Tracking

**R3-08: Captain sees full fleet on live map**
```
Given a ride is Active
And multiple riders have joined and are broadcasting GPS positions
When the Captain opens the live map
Then all active ride participants are visible as icons on the map
And each icon reflects the rider's current tactical state (Active / Stopped / Inactive / Dark)
And the Captain's own position is shown as a blue dot
```
*Trace: Pillar II §4.1 — "Live fleet map — all riders" capability for Captain.*

---

**R3-09: SAG sees full fleet on live map**
```
Given a ride is Active
And multiple riders have joined and are broadcasting GPS positions
When SAG opens the live map
Then all active ride participants are visible as icons on the map
And each icon reflects the rider's current tactical state
And SAG's own position is shown as a blue dot
```
*Trace: Pillar II §4.1 — "Live fleet map — all riders" capability for SAG.*

---

**R3-10: Rider sees Captain and SAG icons only**
```
Given a ride is Active
And the rider has joined and is broadcasting GPS
When the rider views the live map
Then the rider sees the Captain icon and the SAG icon on the map
And the rider does not see any other ride participants' icons
And the rider sees their own position as a blue dot
```
*Trace: Pillar II §4.1 — "Live fleet map — all riders" is Captain and SAG only. Rider sees Captain/SAG icons, not other riders.*

---

**R3-11: Rider clustering — expand on tap**
```
Given multiple ride participants are in close proximity
And they appear as a cluster on the Captain or SAG map
When the Captain or SAG taps the cluster
Then the cluster expands to show individual icons
And each individual icon is tappable to open the Bottom Sheet
```
*Trace: Pillar II §3.1 — clustering for riders in close proximity, expand on tap or zoom.*

---

**R3-12: Centre button returns map viewport to user's current position**
```
Given a Captain or SAG has panned the map away from their current position
When they tap the Centre button
Then the map viewport returns to the user's current GPS position
```
*Trace: Pillar II §3.1 — Centre button: returns camera to user's current GPS position.*

---

**R3-13: Edge Indicator renders when finish point is off-screen**
```
Given a ride is Active
And the ride has a defined finish point
And the finish point is outside the current visible map viewport
When any participant views the live map
Then a directional arrow renders at the boundary of the visible viewport
And the arrow points toward the finish point
And the bearing is calculated using the Haversine formula
```
*Trace: Pillar II §3.1, §3.4 — Edge Indicator, Haversine formula, no routing engine.*

---

**R3-14: Edge Indicator does not render when no finish point is defined**
```
Given an Ad Hoc ride is Active
And no finish point has been set
When any participant views the live map
Then no Edge Indicator arrow is rendered
```
*Trace: Pillar II §3.4 — "Does not render for rides with no defined finish point." Ad Hoc rides without a set finish.*

---

**R3-15: Bottom Sheet — Captain taps rider icon**
```
Given a ride is Active
And a ride participant is visible on the Captain's map
When the Captain taps the rider's icon
Then the Bottom Sheet slides up from the bottom of the screen
And the Bottom Sheet displays:
  - Rider display name
  - Account state (Member / Guest / Pending)
  - Current tactical state
  - Phone number in large monospace format
  - Copy Number clipboard icon
  - Full-width Dial button
When the Captain taps the Dial button
Then the native phone dialler opens with the rider's number pre-filled
When the Captain swipes down or taps outside the Bottom Sheet
Then the Bottom Sheet dismisses
```
*Trace: Pillar II §3.1 Bottom Sheet, §4.1 — Captain can tap rider icon. §5.1 — large tap targets, monospace, full-width dial.*

---

**R3-16: Bottom Sheet — Rider taps Captain icon**
```
Given a ride is Active
And the Captain icon is visible on the rider's map
When the rider taps the Captain's icon
Then the Bottom Sheet slides up showing:
  - Captain's display name
  - Phone number in large monospace format
  - Copy Number clipboard icon
  - Full-width Dial button
When the rider taps the Dial button
Then the native phone dialler opens with the Captain's number pre-filled
```
*Trace: Pillar II §4.1 — "Tap Captain icon → Bottom Sheet" available to Rider. §4.2 — Rider contact affordance limited to Captain and SAG numbers.*

---

**R3-17: Rider cannot tap other rider icons**
```
Given a ride is Active
And there are multiple riders broadcasting GPS positions
When a Rider views the live map
Then no other rider icons are visible to the Rider
And therefore no Bottom Sheet for other riders is accessible from the Rider's view
```
*Trace: Pillar II §4.1 — "Tap rider icon → Bottom Sheet" is Captain and SAG capability only. Rider sees Captain and SAG icons only.*

---

**R3-18: Tenant branding injection — React Native app**
```
Given a rider opens the Rail 3 React Native app
When the app initialises
Then the app fetches brand config from the tenants table:
  - primary_colour
  - accent_colour
  - logo_url
And the fetched values are injected into the React Native ThemeProvider (React Context)
And all themed components render using the club's primary colour, accent colour, and logo
And the Google Maps canvas is not tenant-branded in MVP
And a rider whose tenant_id is scoped to a different club sees that club's branding
```
*Trace: Pillar II §5.2 — Tenant branding in React Native. Library choice (React Native Paper or custom context) is an LLD Sprint 0 task for The Hands.*

---

### 2.3 Support Beacon

> Scenarios 22, 23, and 24 are inherited from Pillar III v1.4.0 and apply without modification, subject to the F-07 pending marker on Scenario 22. The following Rail 3 scenarios extend them with implementation-level and role-specific behaviour.

---

**R3-19: Beacon DB write confirmed on trigger**
```
Given a ride participant triggers the Support Beacon
When the beacon fires
Then a record is written to beacon_alerts containing:
  - ride_id
  - rider_id
  - triggered_at (timestamptz)
  - lat (location snapshot at trigger time)
  - long (location snapshot at trigger time)
  - beacon_cancelled_by: null
  - beacon_cancelled_at: null
And the Supabase Broadcast channel simultaneously carries the beacon alert to Captain and SAG
```
*Trace: Pillar II §2 beacon_alerts schema, §3.2 — DB write to beacon_alerts on trigger. Broadcast used for alert fan-out.*

---

**R3-20: Beacon DB write on Captain or SAG cancellation**
```
Given a ride participant has an active Support Beacon
When the Captain or SAG cancels the beacon via the Bottom Sheet
Then the beacon_alerts record for this beacon is updated:
  - beacon_cancelled_by: UUID of the cancelling account
  - beacon_cancelled_at: current timestamptz
And the rider's icon transitions to Active state on Captain and SAG maps
```
*Trace: Pillar II §2 beacon_alerts schema — beacon_cancelled_by, beacon_cancelled_at. §3.2 — cancellation by Captain or SAG.*

---

**R3-21: Beacon self-cancellation — rider's own UUID written**
```
Given a ride participant has an active Support Beacon
When the ride participant cancels their own beacon
Then the beacon_alerts record is updated:
  - beacon_cancelled_at: current timestamptz
  - beacon_cancelled_by: the rider's own UUID (self-cancel is recorded, not left null)
And the rider's icon transitions to Active state on Captain and SAG maps
```
*Trace: Pillar II §2 beacon_alerts schema (v1.0.2), §3.2 (v1.0.2) — self-cancel writes rider's own UUID. Null is reserved for system error only. Rationale: null is indistinguishable from a failed write; rider UUID is a valid FK, requires no schema change, and produces an unambiguous audit trail on a safety event.*

---

**R3-22: SAG cancels another rider's Support Beacon**
```
Given a ride participant has an active Support Beacon
And the SAG can see the pulsing beacon icon on their map
When SAG taps the pulsing icon and selects Cancel Support in the Bottom Sheet
Then the beacon is deactivated using the same flow as Scenario 23 (Captain cancels)
And the rider's icon transitions to Active
And the cancellation actor (SAG account UUID) is recorded in beacon_alerts
```
*Trace: Pillar II §4.1 — "Cancel any rider's beacon" is a SAG capability. Scenario 23 specifies Captain flow; this extends it to SAG.*

---

**R3-23: Haptic feedback on beacon trigger**
```
Given a ride participant triggers the Support Beacon
When the beacon fires
Then the triggering device produces a strong haptic pulse
```
*Trace: Pillar II §5.1 — "Support Beacon trigger: strong haptic."*

---

**R3-24: Haptic feedback on beacon cancel**
```
Given a Support Beacon is active for a ride participant
When the beacon is cancelled — whether by the rider, Captain, or SAG
Then the rider's device produces a medium haptic pulse
```
*Trace: Pillar II §5.1 — "Support Beacon cancel (self or by Captain/SAG): medium haptic."*

---

### 2.4 Captain Mobile Controls

> Scenarios 11, 12, 15 are inherited. The following scenarios extend ride control behaviour with Rail 3 implementation specifics.

---

**R3-25: End Ride — two-tap confirmation required**
```
Given a ride is Active
And the Captain taps End Ride (primary action)
Then a confirmation sheet appears
And the Captain must tap "Confirm End Ride" to proceed
And if the Captain dismisses the confirmation sheet without confirming, the ride remains Active
```
*Trace: Pillar II §5.1 — "Confirmation gates — two actions only. End Ride (two-tap)."*

---

**R3-26: End Ride — post-confirmation system actions**
```
Given the Captain has confirmed End Ride
When the confirmation is accepted
Then the ride transitions to Saved state
And the Hard Purge clock starts (T+4h from ride close)
And the AI summary is queued for async generation
And no in-app notification is sent to other participants
```
*Trace: Pillar II §3.3 — "On confirm: ride → Saved, Hard Purge clock starts (T+4h), AI summary queued for async generation. No in-app notification to other participants on ride end."*

---

**R3-27: QR display available to all roles**
```
Given a ride is Active
And any participant — Captain, SAG, or Rider — taps Display QR
Then the QR code is displayed full-screen at maximum size
And the QR code is high contrast
And the QR encodes the same ride join URL as generated in Rails 1 and 2 for that ride
```
*Trace: Pillar II §3.3, §4.1 — "Display QR code (full screen)" is available to Captain, SAG, and Rider.*

---

### 2.5 Role-Based Access During Live Ride

**R3-28: Rider cannot access End Ride**
```
Given a ride is Active
And a Rider is viewing the live map
Then no End Ride control is visible or accessible to the Rider
```
*Trace: Pillar II §4.1 — "End Ride" is Captain only.*

---

**R3-29: SAG cannot access End Ride**
```
Given a ride is Active
And SAG is viewing the live map
Then no End Ride control is visible or accessible to SAG
```
*Trace: Pillar II §4.1, §4.2 — "SAG cannot end a ride." Pillar I §4 — Mike / SAG special authority explicitly notes this.*

---

**R3-30: SAG cannot access Create Ad Hoc Ride**
```
Given no ride is currently Active
And SAG opens the app
Then no Create Ad Hoc Ride control is visible or accessible to SAG
```
*Trace: Pillar II §4.1 — "Create Ad Hoc Ride" is Captain only.*

---

**R3-31: Rider cannot cancel another rider's beacon**
```
Given a ride participant has an active Support Beacon
When a Rider (non-Captain, non-SAG) views the live map
Then the pulsing beacon icon is not visible to the Rider
And no Cancel Support action is accessible to the Rider
```
*Trace: Pillar II §4.1 — "Cancel any rider's beacon" is Captain and SAG only. "See pulsing beacon icon (others)" is Captain and SAG only per F-07 committed rule.*

---

**R3-32: Phone number visibility is role-gated**
```
Given a ride is Active
When the Captain or SAG taps a rider icon and opens the Bottom Sheet
Then the rider's phone number is visible (if provided)

When a Rider taps the Captain icon and opens the Bottom Sheet
Then the Captain's phone number is visible (if provided)

When a Rider taps the SAG icon and opens the Bottom Sheet
Then the SAG's phone number is visible (if provided)

And a Rider has no access to other riders' phone numbers
```
*Trace: Pillar II §4.1 — phone number visibility gated by role. Pillar Summary §1.3 — "API-level enforcement — Captain/SAG see all participant numbers; participants see Captain/SAG only."*

---

### 2.6 Ride Lifecycle — Start to Purge

> Scenarios 13, 14, 15, 16, 17–21, 28, 29 are inherited. The following Rail 3 scenarios extend the lifecycle with native app join flow, background task management, and Rail 3 table purge.

---

**R3-33: Registered member joins active ride via in-app Join button (PoC)**
```
Given a ride is Active
And a registered member has the sideloaded APK installed
And the member is authenticated
When the member taps Join on the active ride
Then the member is associated with the ride as an Active participant
And the background GPS task is registered
And the member's icon appears on Captain and SAG maps in Active state
And the member sees the live map with Captain and SAG icons
And the member sees their own position as a blue dot
```
*Trace: Pillar II §1 PoC — "Participants: Registered members only. No guest join flow in PoC." RSVP is intent only (SD-02) — Join is the activation action.*
> Note: Guest join flow is explicitly out of scope for the PoC. Rail 3a production guest join requires a Brain session — see PDoD-03.

---

**R3-34: Background GPS task registered at ride join**
```
Given a registered member taps Join on an active ride
When the join action completes
Then the expo-location background task is registered via expo-task-manager
And the app begins broadcasting GPS positions to the ride-scoped Supabase Broadcast channel
```
*Trace: Pillar II §2 — "Background task registered at ride Join."*

---

**R3-35: Background GPS task de-registered at ride end**
```
Given a ride participant is in an active ride with background GPS running
When the ride transitions to Saved (Captain ends ride or midnight auto-close)
Then the expo-location background task is de-registered
And the app stops broadcasting GPS positions
And the Foreground Service Notification is dismissed
```
*Trace: Pillar II §2 — "Task de-registered at ride End or session expiry."*

---

**R3-36: Hard Purge — full Rail 3 scope at T+4h**
```
Given a ride has transitioned to Saved state (Captain end or midnight UTC auto-close)
And 4 hours have elapsed since ride close
When the Hard Purge cron job triggers
Then all records in beacon_alerts for that ride_id are permanently deleted
And all records in rider_states for that ride_id are permanently deleted
And the following fields are permanently deleted from ride_participants for that ride_id:
  - last_lat
  - last_long
  - last_ping
And guest account records are retained
And the ride_summaries record is retained with participant_count
And if the ride was auto-closed, ride_summaries.auto_closed = true is retained
And no location or beacon data is recoverable after purge
```
*Trace: Pillar II §2 Supabase Architecture — beacon_alerts and rider_states carry 4-hour Hard Purge retention. D-03 — Privacy as product. Consolidated with Scenario 28 (ride_participants location fields) and Scenario 29 (midnight auto-close path) to form a single complete Rail 3 purge scenario.*
> `[PENDING — F-08 Brain Decision]`: Whether Dark state last known positions are retained beyond the purge is explicitly unresolved. This scenario assumes full purge (current committed rule) until F-08 is decided.

---

## §3. PoC Field Validation Plan — Racer Sportif

### Test Device Configuration

| Device Category | Purpose | Source |
|---|---|---|
| Stock Android (Google Pixel preferred) | Baseline GPS behaviour | Pillar II §2 |
| Samsung One UI | Highest OEM kill risk — primary OEM test | Pillar II §2 |
| Additional OEM (Xiaomi / Huawei — if available from volunteers) | Secondary OEM measurement | Pillar II §2 |

Device availability is volunteer-based. The PoC proceeds with whatever devices are available from the Racer Sportif group on test day. Results are recorded per device — no minimum device count gates PoC completion.

---

### Validation Items

| # | Validation | Scenario(s) | Method | Pass Criteria |
|---|---|---|---|---|
| V-001 | Background GPS — screen locked | R3-01 | Real ride, phone pocketed for minimum 20 minutes | Location updates continue without interruption on at least one test device |
| V-002 | OEM battery optimisation behaviour | R3-02 | Real ride across all available test devices — screen locked, Battery Optimisation not manually excluded | Record outcome per device: GPS survived / killed / time to kill / manual intervention required. No binary pass threshold — measurement exercise feeding Rail 3a decision. |
| V-003 | Fleet map under concurrent load | R3-08, R3-09 | All volunteer participants connected simultaneously on the day | Map renders all participant icons in real time. Latency and stability observed and recorded. No minimum participant count — count determined by volunteer turnout. |
| V-004 | Supabase Broadcast channel performance at volunteer scale | R3-34, R3-08 | All volunteer participants broadcasting simultaneously | Location fan-out operates without observable lag across all connected Captain/SAG devices. Observation recorded — no fixed threshold, measurement feeds Rail 3a NFR validation. |
| V-005 | Support Beacon — trigger to Captain and SAG alert | R3-19, R3-23, R3-24 | Live trigger by a rider during the ride | Beacon alert visible on Captain and SAG devices. Alert latency measured against D-55 target (<500ms). Haptic fires on trigger. |
| V-006 | Role behaviour — all roles present simultaneously | R3-08–R3-17, R3-28–R3-32 | Captain, SAG, and minimum two Riders all active | Captain sees full fleet. SAG sees full fleet. Riders see Captain and SAG only. End Ride inaccessible to SAG and Riders. Phone visibility gated correctly per role. |
| V-007 | Glanceable UX — SAG vehicle-mounted context | R3-09 | SAG simulates vehicle-mounted monitoring during ride | SAG can identify rider state changes without tapping. Icons legible at arm's length. Bottom Sheet readable without zooming. Support Beacon trigger reachable one-handed. Qualitative assessment — pass criteria: no critical legibility failures identified by the SAG tester. |
| V-008 | Hard Purge execution — full Rail 3 scope | R3-36 | Database inspection at T+4h after ride close | beacon_alerts and rider_states records for the test ride_id are deleted. ride_participants location fields (last_lat, last_long, last_ping) are deleted. Supabase table inspector or Edge Function log confirms purge. |
| V-009 | Battery drain measurement | DoD-13 | Record battery % at ride join and ride end on all available test devices | Drain measured and recorded. Target <10%/hr (D-54). Result informs Rail 3a production guidance. |
| V-010 | Foreground Service Notification — presence and persistence | R3-03, R3-04 | Join ride, lock screen, verify notification in shade for full ride duration | Notification present throughout. Dismissal test: dismiss notification, confirm GPS task terminates, confirm rider goes Dark on Captain/SAG map after Dark threshold. |
| V-011 | QR join — registered member on test device | R3-27, R3-33 | Captain displays QR, second test device scans | Scanning device joins ride. Rider icon appears on Captain map. Rider sees Captain and SAG icons and their own blue dot. |
| V-012 | RLS isolation — cross-tenant access | DoD-12 | Attempt to query data for a second tenant from a Rail 3 session | Query returns no data. RLS blocks access. No cross-tenant records returned. |

---

*End of [Vechelon Rail 3] Pillar III: The Quality Gate (v1.0.0)*
