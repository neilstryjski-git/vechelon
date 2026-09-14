[Vechelon Rail 3] Pillar III: The Quality Gate (v1.1.1)
Project: Vechelon Rail 3 — Mobile Tactical | Current Version: v1.1.1 | Last Sync Date: 2026-09-13 | Status: COMMITTED

---

## Change Log
| Version | Date | Time | MACD Action | Decision | Trio Lead |
|---|---|---|---|---|---|
| v0.1.0 | 2026-05-12 | — | ADD | Initialized Rail 3 Pillar III shell | TPM |
| v1.0.0 | 2026-05-12 | — | ADD | Completed §1 Definition of Done, all §2 BDD scenarios (R3-01 through R3-35), completed §3 PoC Field Validation Plan pass criteria. GAP-01 resolved as measurement exercise. GAP-02 resolved as volunteer-count basis. GAP-03 (F-07, F-08) scoped out of PoC. Promoted DRAFT → COMMITTED. | TPM |
| v1.1.1 | 2026-09-13 | — | CHANGE | Hands-readiness pass. F-07, Support Beacon visibility to other riders, RESOLVED by Senior PM ruling as Captain and SAG only; PDoD-04 discharged and the two `[PENDING — F-07 Brain Decision]` markers struck, lifting the build-and-test gate on beacon work. R3-04's Dark threshold qualified as tenant-configurable so the asymmetry against the adjacent operator-level clause is self-explaining (finding F-5 closed). R3-33's superseded task-registration clause corrected to the Transistorsoft engine, matching R3-34 (finding F-4 closed). | TPM |
| v1.1.0 | 2026-09-13 | — | CHANGE | G33 Pillar III pass, complete across two authoring sessions. Written: PDoD-03 discharged (§1.2); R3-01 trace repointed to the Transistorsoft engine (packet 7.3); R3-04 three ratified clauses appended and trace rewritten (packet 7.4); R3-33 note superseded on the Brain-session reference; R3-34 and R3-35 restored to the ratified packet 7.1 and 7.2 wording and retitled; R3-36 Given clause corrected to inactivity auto-close per B2, lifecycle machinery, and its guest retention clause amended from account records to roster records per Senior PM ruling; R3-71 corrected from midnight auto-close to inactivity auto-close per B2. Thirty scenarios enshrined from wTBD1 into §2.1, §2.2, §2.5 and §2.6 (R3-37 to R3-49, R3-51 to R3-58, R3-60, R3-62, R3-65 to R3-73), R3-74 authored fresh per Session D section 5, and slate 8's three verbatim Senior PM scenarios enshrined as R3-75, R3-76 and R3-77. R3-61 superseded under Immutable Numbering. Promoted DRAFT → COMMITTED. Note: the v1.0.0 row above understates the committed set, which ran R3-01 through R3-36, not R3-35; that row is left untouched by ruling and the correction is stated here. | TPM |

---

## Scenario Numbering Reference

Rail 3 Pillar III is the union of two scenario sets:

| Set | Numbering | Source | Status |
|---|---|---|---|
| Inherited scenarios | 1, 4, 5, 11–29, 34 | Vechelon Pillar III v1.4.0 via Pillar Summary | Carried forward — referenced, not duplicated |
| Rail 3 native scenarios | R3-01 through R3-77 | This document | R3-01 to R3-36 authored at v1.0.0; R3-37 to R3-77 enshrined at v1.1.0. R3-61 and R3-64 retired, numbers never reused |

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
| PDoD-03 | [DELETED - 2026-09-13] Discharged. No Rail 3a production guest join exists to resolve. Ruling R-GUEST, guest access model, commits guests as portal-side participants only, and D-QR-2, guest delivery path to the PWA roster page, with D-QR-4, guest self-registration, place the registration surface in Rails 1 and 2. The inherited Scenario 1 conflict is routed to the deferred register as a cross-Pillar-set item. Discharge record and deferral in Pillar IV. | [DELETED - 2026-09-13] No dependency. Rail 3a Brain session not required. |
| PDoD-04 | [DELETED - 2026-09-13] F-07 Brain decision committed to Ledger — beacon visibility to other riders resolved. **DISCHARGED: F-07 resolved 2026-09-13 as Captain and SAG only.** Recorded in Pillar IV §8.5. | [DELETED - 2026-09-13] Rail 3a Brain session. No Brain session required. |
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
- **Support Beacon visibility:** Beacon state visible to Captain and SAG only. The beaconing participant sees their own icon in the alerted pulsing state. [DELETED - 2026-09-13] `[PENDING — F-07 Brain Decision]` Whether beacon is also visible to other riders is explicitly deferred and must not be built or tested until resolved. **F-07 RESOLVED 2026-09-13 by Senior PM ruling: Captain and SAG only. Other riders never see another rider's beacon.** Opening beacon state to all riders would change the privacy rules governing what a rider may learn about another rider, and the conservative setting is the safer default; if field evidence shows it wrong, widening is the change that will need justifying, not keeping it narrow. The build-and-test gate is lifted.
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
- **Scenario 22:** Ride participant triggers Support Beacon — *F-07 resolved 2026-09-13: other-rider visibility is excluded, Captain and SAG only. Pending marker struck.*
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
*Trace: Pillar II §2 Background GPS, Transistorsoft engine. Deterministic engagement at join per R3-37, join-time engine start. Lifecycle decoupled from the app per R3-38, D91 lifecycle decoupling.*

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
And after the Dark threshold (tenant-configurable, default 15 minutes), the rider's icon transitions to Dark on Captain and SAG maps
And the rider's own screen continues to show their blue dot at their actual current GPS position
And the rider self-health warning fires once no fix has been produced for the committed self-health threshold, whose value is operator-configured and platform-keyed per Pillar IV
And the command surface renders the stale overlay only in coincidence with Beacon Active
And the fleet ladder is otherwise unchanged until the Dark transition
```
*Trace: Pillar II §2 Background GPS, documented failure mode. The OS blue dot masking a dead service per D88 and D90. Notification dismissal is one member of the silent-invisibility class closed by R3-40, R3-41 (survey-only, wTBD1) and R3-48. The self-health threshold value is held in Pillar IV and does not enter this scenario.*

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

**R3-37: Tracking engine deterministically engaged at ride join**
```
Given a rider taps Join on an active ride
And the Transistorsoft engine completes start()
When the rider locks their screen within seconds of joining
Then the engine is already in the moving/tracking state at lock time
And the engine does not remain in stationary warm-up awaiting motion detection
And the rider produces gps_ping fixes as they begin moving
And the ride cannot run dark solely because the screen was locked during warm-up
```
*[Source: Stride D90 — TS-dependent] Field evidence: ride f51f7add (21 min, zero fixes) vs control (89 fixes). Drift finding (b).*

---

**R3-38: Engine lifecycle is independent of threshold-data changes**
```
Given a rider has joined an active ride and the tracking engine is running
When ride threshold data resolves or updates after engine start
Then the engine start/stop lifecycle is not re-triggered
And no stop/start race can leave the engine disabled
And the rider's fixes continue uninterrupted across the threshold update
```
*[Source: Stride D91 — field-validated, reviewer-approved] Engine deps = [backgroundReady, rideId, myRiderId]; thresholds to refs. Validated ride 260d2131. Drift finding (d).*

---

**R3-39: Foreground resume re-asserts the send side, not only receive**
```
Given a rider's device has an active ride session
And the tracking engine has been suspended or disengaged while backgrounded
When the app returns to the foreground (resume signal fires)
Then the app re-asserts the tracking engine on the send side
And a healthy engine treats the re-assert as a no-op
And an unhealthy engine is re-engaged and resumes producing fixes
And channel/receive recovery alone does not satisfy this scenario
```
*[Source: Stride D90 prong 2, D89 — TS-dependent] Mid-ride unlock restored receive but not send. The re-assert is a backstop to the fixed engine, not the primary fix. Background recovery (R3-42) is the primary path; this scenario is the glance-dependent fallback. Drift finding (c).*

---

**R3-42: Suspended tracking engine recovers without rider interaction**
```
Given a rider is in an active ride with the phone backgrounded or locked
And the tracking engine has been suspended or has stopped producing fixes
When the recovery window elapses
Then the engine is re-engaged without the rider foregrounding the app or touching the device
And the rider's fixes resume on the ride channel
And R3-39's foreground resume re-assert remains as the fallback path when background recovery is unavailable
```
*[Source: Stride D88 hardening prong — TS heartbeat/headless/autoSync, native-side; Senior PM — recovery must not require the device to be woken by the rider] Mechanism and recovery window [UNTRACED — Brain-session item].*

---

**R3-43: Saver-at-start delay is bounded and self-recovering**
```
Given a rider joins an active ride with Battery Saver enabled at engine start
When the tracking engine initializes under Battery Saver
Then the rider's first fixes may be delayed by the known Battery-Saver startup delay before continuous tracking engages
And the engine recovers to continuous tracking without rider intervention
And the delay does not recur once tracking has engaged
And the rider is not presented as stale (R3-40, and R3-41 survey-only in wTBD1) during the known startup window
```
*[Source: Stride D91 residual — unticketed] Self-health threshold must sit above or gate on this window. Window value held in Pillar IV, measured by wTBD2.*

---

**R3-45: Engine state is observable in telemetry for every active ride**
```
Given a rider is in an active ride
When the tracking engine starts, dies, or a self-health warning fires during that ride
Then each of those events is captured in the always-on telemetry tier with a timestamp
And the always-on tier is the permanent floor and carries these counters only
And a ride that produces no fixes leaves sufficient always-on telemetry to distinguish engine-never-engaged, engine-torn-down, and OEM-suspension
And the telemetry is inspectable after the ride without on-device access
```
*[Source: Stride D86/D88/D91 — every diagnosis depended on W272 telemetry + the TS native log; on-device log retrieval does not scale past PoC] Two tiers per slate 6; full capture is switched and is not part of this floor.*

---

**R3-47: Battery Saver disabled mid-ride — no rider action required to restore tracking**
```
Given a rider is in an active ride with Battery Saver enabled
When the rider disables Battery Saver — whether foregrounded, backgrounded, or from the lock screen
Then healthy tracking continues or resumes without any rider interaction beyond the toggle itself
And restoration does not depend on a background-unreliable OS edge listener
And no rider-visible state requires the app to be foregrounded to reconcile
```
*[Source: Stride D89 root cause — the ON→OFF edge listener does not fire backgrounded] Behaviour, not mechanism — whether Saver-off handling code survives is SC-6.*

---

**R3-49: Power advisories are never load-bearing for tracking guarantees**
```
Given the committed power advisories exist (Saver prompts R3-05/06, OEM exclusion prompt, first-ride explainer R3-07)
When a rider dismisses, ignores, or cannot act on any advisory
Then ride join is never blocked (committed non-blocking rule)
And every tracking guarantee in this domain (R3-37–48) holds independent of advisory compliance
And advisory compliance may improve outcomes but is never a precondition for the recovery chain or self-health backstop
```
*[Source: Pillar II §2; Stride D86 — "MUST stay non-blocking per R3-05/R3-06"; Stride D88 — precondition checks vs outcomes] Verify no prompt became structurally load-bearing.*

---

**R3-40: Rider self-health warning when own device stops producing fixes**
```
Given a rider is in an active ride and believes they are being tracked
When the rider's own device produces no GPS fix for the self-health threshold
While the app's state says tracking should be active
Then the rider is warned on their own device that they may not be visible to the captain
And the warning fires for any cause detectable while the app process lives, including engine disengagement and service termination
And the warning does not fire for a rider who is genuinely stationary within the engine's normal stop behaviour
```
*[Source: Stride D88 decision (2), D90 prong 3] Precondition checks never catch outcome failure; the OS blue dot masks a dead engine. Field evidence: ride 3efe17fc. The self-health threshold is committed as a rule per slate 4, self-health thresholds; its value is operator-configured, server-side and platform-keyed, and is held in Pillar IV, never here. Cause clause narrowed 2026-09-13 per B1, layer 3 recovery: detection is bounded by what remains observable while the app process lives. PENDING: final wording awaits B1 device-side findings, since the purchased Transistorsoft licence may extend detection past foreground-service death.*

---

**R3-48: OEM suspension on a correctly-configured device — the recovery chain engages**
```
Given a rider's device is correctly configured (location Always, activity permitted, battery unrestricted, Saver off)
And the rider is backgrounded during an active ride
When the OS or OEM suspends or terminates the background location engine anyway
Then the recovery chain engages in order: device-side background self-recovery (R3-42), server-side staleness detection and wake, foreground resume re-assert (R3-39)
And the device-side check fires independently on connectivity resumption or app focus, so recovery never depends on a server message arriving
And if no recovery has occurred within the self-health threshold, the rider is warned (R3-40)
And at no point does an unrepaired failure remain silent on all surfaces
And silence follows repair and never precedes it: a completed self-heal is silent, an unrepaired failure is not
```
*[Source: Stride D88 — the S20 FE A/B: fully compliant device, TerminateEvent, zero fixes, no warning anywhere] Invariant rebased 2026-09-13: silence follows repair and never precedes it, consistent with the silent self-heal ruled under A3, stale and self-health. Recovery chain order updated to B1's split, layer 3 recovery, with the device-side heartbeat and headless task proceeding now and the server-side staleness detector and wake sitting behind B2's scheduler, and to slate 13's convergent teardown, which supplies the independent device-side check. The drafted Captain and SAG stale-surfacing clause is not carried: R3-41, Captain and SAG stale distinction, is survey-only by ruling and is not enshrined in Pillar III.*

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

**R3-51: Ride channel survives token expiry**
```
Given a rider is in an active ride subscribed to the ride-scoped Broadcast channel
And the ride outlives the auth token's lifetime (~1 hour)
When the token refreshes during the ride
Then the refreshed token is pushed onto the realtime socket
And any subsequent (re)subscribe uses a current token, never a stale one
And tenant RLS never denies a reconnect for a rider whose session is valid
And the channel remains live for the full ride duration without rider action
```
*[Source: Stride D72 root cause (1) + fix] Field evidence: receive-blind from ~20 min in, 108km ride. The twelve hour design envelope committed in Charter §3 multiplies exposure across a long ride.*

---

**R3-52: Channel error is never terminal — reconnect with bounded backoff**
```
Given a rider's ride channel drops (CHANNEL_ERROR, TIMED_OUT, or CLOSED — dead zone, screen lock, transient network)
When the drop is detected
Then the app automatically attempts reconnection with capped exponential backoff and jitter
And reconnection attempts continue for the life of the ride session
And no channel error state is terminal while the ride is active
And when a peloton exits a dead zone together, jittered reconnects avoid a synchronized reconnection burst
```
*[Source: Stride D72 root cause (2) + fix — CHANNEL_ERROR was terminal; now auto-reconnect, capped exp backoff + jitter] A group exiting a dead zone is the normal case, not the edge case.*

---

**R3-53: A glance restores live receive**
```
Given a rider's device has been backgrounded or locked during an active ride
And the ride channel may have dropped while backgrounded
When the rider foregrounds the app (resume signal fires)
Then the channel reconnects and live receive is restored on that foreground
And the fleet map resumes receiving on that first glance, rendering each participant at their last known position until a newer fix arrives (R3-62)
And the resume signal is device-agnostic (clock-gap detector + staleness sweep + AppState, coalesced)
```
*[Source: Stride D72 fix; W269 resume composition] Fresh-on-glance: token expiry must self-heal, never terminal receive-blindness — D72 is the named regression case. Amended 2026-09-13 per the slate 14 enshrinement pass: the approximately one second figure is struck and the scenario carries the invariant only. No unmeasured number enters Pillar III.*

---

**R3-54: Receive recovery and send recovery are independent and both required**
```
Given a rider foregrounds their device mid-ride after a backgrounded period
When resume fires and the channel recovers (R3-53)
Then receive recovery does not by itself satisfy send recovery — the engine re-assert (R3-39) must run independently
And a rider whose channel is healthy but whose engine is dead is caught by self-health (R3-40), not masked by a live map
And a rider whose engine is healthy but whose channel is dead continues producing fixes that others receive
And the two failure classes are distinguishable in telemetry (R3-45)
```
*[Source: Stride D90 — resume restored receive, not send; Stride D72 sink proof — send survived while receive was dead] Two half-duplex paths, separate machines.*

---

**R3-55: A beacon raised while receive-blind is surfaced on recovery**
```
Given a rider's channel was dead or dropped for a period during an active ride
And a Support Beacon was raised during that window
When the channel recovers (reconnect or resume)
Then the beacon is surfaced on recovery, not silently missed
And the beacon is anchored at the raising rider's last known position, written at raise time
And the returning device renders the beacon at last known with the stale overlay until a live fix supersedes it
And the recovery respects committed privacy rules (Hard Purge scope, role gating)
```
*[Source: Stride D72 RELATED; slate 7, missed-while-dead reconciliation and the beacon horn] Broadcast is fire-and-forget: a beacon raised during receive-blindness is otherwise lost, and the safety asymmetry decided it. Beacon state holds a durable current-state read path on the participant record, read on focus and channel activation, superseded on clear; no event history, no replay. Narrowed 2026-09-13 per slate 7: general position reconciliation beyond last known is struck from this scenario and stays parked with D72, general position reconciliation, pending Pillar II §2 privacy ratification. Position catch-up on recovery is covered by R3-62.*

---

**R3-62: Fleet render derives from joins — seed immediately, upgrade live**
```
Given a Captain, SAG, or rider loads the fleet map (join, fleet load, or reconnect)
When the map renders the fleet
Then every rendered participant is one who has joined the ride and holds a Rail 3 session — the roster is the record of joins, not a filter against them
And each participant with any known position is seeded immediately from lastKnown — no empty map, no vanishing riders
And every rendered participant remains at their last known position until superseded by a newer fix — positions age through the committed ladder; they never disappear while the participant is on the ride
And a seeded render upgrades in place to live position on the healthy path
And a roster-only participant is never seeded and never rendered here, per R3-74
```
*[Source: Stride W277 — useFleetPositions "pings ∪ lastKnown ∩ roster"; Senior PM — seed-until-live ruled solid] Amended 2026-09-13 per slate 12, seed-to-live ceiling: the scenario states the invariant only and carries no duration. The thirty second target and its test-plan criterion are held in Pillar IV as a design target, so a miss is visible in a Decision Brief without gating the Quality Gate. Cross-reference to R3-74, roster-only participants, added per Session A's specification.*

---

**R3-72: The breadcrumb is honest about its source**
```
Given riders are following the Captain's breadcrumb on an active ride
When the Captain departs (Leave Ride) or the Captain's device stops producing the trace
Then the breadcrumb stops extending
And its stopped state is visually distinguishable from a live, extending trace on every surface that renders it
And no rider is presented a frozen trace as if it were the Captain's current line
And breadcrumb viewers move to the route overlay on Captain departure, with a visible cue framed as Captain-departure news, never silently
And on the Captain's return capture resumes into the same breadcrumb, and the gap renders as a visible break, never interpolated or smoothed
```
*[Source: Stride D86 telemetry — leader-upsert breadcrumb, implemented; drift finding (g)] Amended 2026-09-13: the final clause's referent is ratified. Slate 9, command-coverage bundle, ruled captainless-degraded with the trace auto-switch unparked for this single behaviour, and slate 10, breadcrumb design residue, closed the resume question as settled by C1, breadcrumb: one breadcrumb per ride with a visible hole where the Captain was away. The C1 honesty constraint forbids claiming what did not happen. Ownership is the starting Captain's, sole and non-transferable for the ride's duration.*

---

**R3-74: Roster-only participants are represented on the roster, never on the map**
```
Given a ride is active and a participant holds no Rail 3 session — a guest, a non-installing member, or any iOS rider until Rail 3b
When any role opens the roster for that ride
Then the participant appears on the roster and their row carries the roster-only participation state
And Captain and SAG see that participant's contact details per R3-32's role gating; a rider does not
And the participant never renders on the fleet map
And that absence is a declared structural state, not a failure state, and is never presented as one
And the roster is the authoritative participant record and the fleet map is a declared partial projection of it
```
*Trace: Pillar II §4.1 ROSTER section, per-row participation state, app-tracked or roster-only. Authored fresh 2026-09-13 per Session D section 5, R3-74 reinstated: Session A required this scenario, the authoring was dropped between Sessions A and C, and it was recovered at close of Session D. Subject as Session A specified; the tag's ruled expression is slate 17, partial fleet representation, which superseded the map coverage chip and moved the partial-representation fact onto the roster per participant. Roster-only is a permanent population, distinct from an app participant not currently producing a position, which stays with the fleet ladder and is not duplicated into the roster. Numbered from R3-73 per Immutable Numbering. Cross-referenced by R3-62.*

---

### 2.3 Support Beacon

> Scenarios 22, 23, and 24 are inherited from Pillar III v1.4.0 and apply without modification, subject to F-07 as resolved 2026-09-13, Captain and SAG only. The following Rail 3 scenarios extend them with implementation-level and role-specific behaviour.

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

**R3-56: One session, one rider identity — all state scoped to the binding**
```
Given a rider authenticates on Rail 3
When the rider joins an active ride
Then every artifact the device produces — gps_ping, beacon, breadcrumb, rider state — is attributed to exactly one (rider identity, ride) binding
And no fix is ever published unattributed or attributed to a prior identity
And the binding is established before the tracking engine starts, never after
```
*[Source: Stride W277 key files — identity binding (D77) as substrate; Pillar II §2 RLS] [D77 record not transcribed — flag any divergence found.]*

---

**R3-57: Account swap on a shared device leaves no residual state**
```
Given rider A has previously used Rail 3 on a device (any combination of rides, sign-outs, or stale sessions)
When rider B signs in on the same device and joins an active ride
Then no state from rider A persists into rider B's session — no positions, roster view, channel subscription, lastKnown seed, or pending telemetry attributed across identities
And rider A's identity cannot receive or produce any further ride data on that device
And the tracking engine's lifecycle is re-bound to rider B, not resumed from rider A's session
```
*[Source: Stride W277 use cases — account swaps; Pillar II §2 RLS] myRiderId changing MUST restart the engine — the one identity event where a lifecycle re-trigger is required (SC-5). Departure fires on the auth transition per D1, account-swap phantom, and executes before the session ends per R3-58; the single-slot roster cache clears after departure, never before.*

---

**R3-60: Rail 3 consumes identity — it never creates it (cross-rail boundary)**
```
Given rider identities, club membership, and ride rosters originate in Rails 1 & 2
When a rider authenticates and joins on Rail 3
Then Rail 3 binds to an existing identity via the shared Supabase auth — it creates no identities, memberships, or roster entries
And a participant who joins without prior roster presence is added to the roster at join
And such a participant holds the Rider role only — Captain and Support are designated roles, never acquired by joining
And identity attributes rendered on Rail 3 (name, role, phone visibility) are read from the Rails 1 & 2-owned tables per the committed role gating
And any identity lifecycle event originating portal-side takes effect on Rail 3 without requiring a Rail 3 release
```
*[Source: Pillar II §2 inherited tables read-only; §4.1 role matrix; Senior PM — the roster is the record of joins, not a filter against them] First integration-surface scenario: portals write identity, Rail 3 reads. This is the commitment D-QR-5's guard clause rests on: any email held against a guest record is a conversion payload, not an identity, and authorises nothing.*

---

**R3-66: One role envelope, every surface**
```
Given the committed role visibility rules exist (§4.1 matrix, R3-10, R3-17, R3-32)
When any surface renders participant information — fleet map, bottom sheets, roster page, or any future surface
Then each role sees exactly what the committed envelope grants, identically on every surface
And no surface widens a role's visibility (a rider cannot see other riders on the roster page any more than on the map)
And phone visibility follows R3-32's gating on every surface that renders contact information
And a new surface inherits the envelope by default — widening requires a committed MACD, not a page design
```
*[Source: Pillar II §4.1; Pillar III R3-10/17/32; Senior PM — roster page observed consistent with the envelope] The envelope is role-scoped, not surface-scoped (SC-7). Leaders' name and phone are visible to every roster viewer, including PWA-only riders, per the slate 8 rider ruling, phone visibility, which is non-negotiable by Senior PM ruling; that is a property of the committed envelope, not a widening by the roster surface.*

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
And the Transistorsoft background geolocation engine is started for the ride per R3-34
And the member's icon appears on Captain and SAG maps in Active state
And the member sees the live map with Captain and SAG icons
And the member sees their own position as a blue dot
```
*Trace: Pillar II §1 PoC — "Participants: Registered members only. No guest join flow in PoC." RSVP is intent only (SD-02) — Join is the activation action.*
> Note: Guest join flow is explicitly out of scope for the PoC. [DELETED - 2026-09-13] Rail 3a production guest join requires a Brain session, see PDoD-03. Superseded: there is no Rail 3a production guest join. Ruling R-GUEST, guest access model, commits guests as portal-side participants only, and PDoD-03 is discharged. See Pillar II §1 Platform Strategy and Pillar IV.

---

**R3-34: Join-time engine start**
```
Given a registered member taps Join on an active ride
When the join action completes
Then the Transistorsoft background geolocation engine is started for the ride
And the engine is deterministically engaged per R3-37
And the app begins broadcasting GPS positions to the ride-scoped Supabase Broadcast channel
```
*Trace: Pillar II §2 Background GPS, task lifecycle, intent unchanged; mechanism per the ratified build-versus-buy decision, Transistorsoft engine. Engagement and lifecycle-independence semantics per R3-37 and R3-38. Text restored to the ratified wording of MACD packet 7.1, R3-34 join-time engine start. Title amended 2026-09-13 by Senior PM ruling: the superseded "task registered" framing replaced with packet 7.1's own label.*

---

**R3-35: Ride-end teardown**
```
Given a ride participant is in an active ride with background GPS running
When the ride transitions to Saved (Captain ends ride or inactivity auto-close)
Then the Transistorsoft background geolocation engine is stopped and its background task de-registered
And the app stops broadcasting GPS positions
And the Foreground Service Notification is dismissed
And teardown of backgrounded or unreachable devices completes per R3-69
```
*Trace: Pillar II §2 Background GPS, task lifecycle, intent unchanged; mechanism per the ratified build-versus-buy decision, Transistorsoft engine. Reachability per R3-69, whose teardown design was ruled by slate 13, ride-end teardown reachability, so the drafted strike condition is dead. Parenthetical corrected to inactivity auto-close per B2, lifecycle machinery. Text restored to the ratified wording of MACD packet 7.2, R3-35 ride-end teardown. Title amended 2026-09-13 by Senior PM ruling: the superseded "task de-registered" framing replaced with packet 7.2's own label.*

---

**R3-36: Hard Purge — full Rail 3 scope at T+4h**
```
Given a ride has transitioned to Saved state (Captain end or inactivity auto-close)
And 4 hours have elapsed since ride close
When the Hard Purge cron job triggers
Then all records in beacon_alerts for that ride_id are permanently deleted
And all records in rider_states for that ride_id are permanently deleted
And the following fields are permanently deleted from ride_participants for that ride_id:
  - last_lat
  - last_long
  - last_ping
And guest roster records are retained
And the ride_summaries record is retained with participant_count
And if the ride was auto-closed, ride_summaries.auto_closed = true is retained
And no location or beacon data is recoverable after purge
```
*Trace: Pillar II §2 Supabase Architecture — beacon_alerts and rider_states carry 4-hour Hard Purge retention. D-03 — Privacy as product. Consolidated with Scenario 28 (ride_participants location fields) and Scenario 29 (midnight auto-close path) to form a single complete Rail 3 purge scenario.*

*Amended 2026-09-13 by Senior PM ruling: the committed clause "And guest account records are retained" is superseded by "And guest roster records are retained". Guests hold no account. Committed Charter §4 at v1.1.0 states the guest model, and D-QR-5, guest email capture, commits that any email held against a guest record is a conversion payload that creates no account, per R3-60, cross-rail identity boundary. The roster record is the retained artifact. This closes the contradiction carried out of the session-two pass under AMIP option (c).*
> `[PENDING — F-08 Brain Decision]`: Whether Dark state last known positions are retained beyond the purge is explicitly unresolved. This scenario assumes full purge (current committed rule) until F-08 is decided.

---

**R3-58: Sign-out fires departure, ordered before session end**
```
Given a rider is in an active ride and signs out of the app
When the sign-out completes
Then departure fires and executes before the session ends
And the ordering is load-bearing: departure requires an authenticated session to write the roster state change and complete the R3-67 teardown
And tearing the session down first leaves the departure without credentials and produces the phantom participant D1 was ruled to close
And the departure is fire-and-forget: it does not wait for acknowledgement, and it never fires after the identity is gone
And the single-slot roster cache clears on the auth transition, which sits after departure in the sequence
```
*[Source: Senior PM, Session D section 3, R3-58 sign-out; D1, account-swap phantom] Rewritten and enshrined 2026-09-13. The wTBD1 text and companion section 5 both recorded sign-out as session-only with no ride action; D1 superseded both, and the contradiction was found during the slate 14 enshrinement pass. The PoC already implements this ordering per Senior PM, so this enshrines built behaviour rather than requesting new work. Title amended 2026-09-13 by Senior PM ruling: the superseded "not a ride event" framing replaced with the Session D ruling headline. [SURVEY CHECK SC-1 — confirm the built ordering at write-back and record it.]*

---

**R3-65: Departure removes cleanly — and is never confusable with failure**
```
Given a participant is rendered on Captain and SAG surfaces during an active ride
When the participant departs (Leave Ride per R3-67)
Then the participant is removed from the fleet map; their roster entry is retained, marked departed
And the departure is distinguishable on every surface from Dark, stale, and greyed states
And no lastKnown seed resurrects a departed participant on reconnect or reload (departure beats seed)
And Captain and SAG can distinguish "left the ride" from "lost from the ride" at a glance
```
*[Source: Stride W277 — departures in the render lifecycle; D87 not transcribed] Departure presentation mechanism undesigned [UNTRACED — Brain-session item]. Departure is a roster state change, never a deletion.*

---

**R3-67: Leave Ride — teardown is complete and one-way**
```
Given a participant leaves an active ride via the Leave Ride action (built, PoC-evidenced)
When the departure executes
Then the device-side teardown is complete: tracking engine stopped, channel unsubscribed, FGS notification cleared, background task de-registered
And the departed participant is removed from the fleet map on Captain and SAG surfaces, while their roster entry is retained and updated to show departed status — their details remain available to Captain and Support
And no recovery mechanism re-engages tracking for the departed session
And the departure is one-way: only a fresh, explicit Join (R3-68) reverses it
```
*[Source: Senior PM — Leave Ride is the departure trigger, implemented and working in PoC; drift finding (f)] Departure is intended silence — recovery mechanisms must know the difference. Leaving the map means leaving the ride, per C3, departure.*

---

**R3-68: Rejoin after departure is a clean fresh join**
```
Given a participant departed an active ride and the ride remains active
When the participant joins again (in-app Join)
Then the rejoin is a fresh join in every respect: new binding (R3-56), engine start per R3-37, roster re-inclusion
And the participant's render seeds per R3-62 and upgrades live on the healthy path
And no state from the departed session leaks into the new one — and no departed-session artifact suppresses the rejoin
And Captain and SAG surfaces show one participant, once — no duplicate or ghost entry from the prior session
```
*[Source: Stride W277 use cases — regroups; Senior PM — rejoin is supported] Departure state is scoped to the session, not the identity — "departure beats seed" (R3-65) must not become "departure beats rejoin." Server-side ride data (incl. lastKnown) persists per R3-70 and legitimately seeds the rejoin render; "no state leaks" scopes to device/session state, not ride truth. Amended 2026-09-13: QR is struck from the join parenthetical per slate 8, cross-surface session handoff, and confirmed by D-QR-1, QR is not a member ride-join path. Members join in-app.*

---

**R3-69: Ride end tears down every participant, everywhere**
```
Given a ride is active with participants tracking
When the ride ends (Captain End Ride two-tap, or inactivity auto-close)
Then every participant device performs the full teardown of R3-67 without individual action
And the teardown reaches backgrounded and locked devices, not only foregrounded ones
And the server-initiated wake is the fast path, with bounded retry
And the device carries an independent check firing on connectivity resumption or app focus, reading persisted ride status and tearing down on an affirmative Saved
And teardown is convergent: it never depends on a message arriving
And no rider-facing surface is produced beyond the foreground service notification clearing, which never announces itself as a recovery
And the committed post-end actions proceed (R3-26), with the purge clock running per R3-36
```
*[Source: Pillar III R3-26/35/36; slate 13, ride-end teardown reachability] Amended 2026-09-13: midnight auto-close corrected to inactivity auto-close per B2, lifecycle machinery, which ruled the backstop inactivity-only with no wall-clock sweep; and the device-side convergent check added per slate 13, which applies A2, ride-end reachability, device-side rather than adding a mechanism. The check hangs on B1's heartbeat. Accepted limit recorded: a device with neither connectivity nor app focus continues until one of those changes, bounded only by the inactivity backstop and the rider's return to signal. Not closable by design.*

---

**R3-70: Departure changes rendering, never retention**
```
Given participants have departed mid-ride or a ride has ended
When their data's lifecycle proceeds
Then departure removes the participant from live rendering but does not delete or early-purge their ride data
And lastKnown, ride participation, and any beacon records persist until the committed Hard Purge executes (T+4h after ride close, R3-36)
And a departed participant's data is purged on the same schedule as everyone else's — no separate clock
And nothing about departure creates a retention obligation beyond the committed purge scope
And the rail3_breadcrumb record is exempt from the Hard Purge as a club-owned artifact, so its survival past T+4h is correct behaviour and never a retention defect
```
*[Source: Pillar III R3-36] Rendering lifecycle and retention lifecycle are orthogonal by design — purge-on-departure and render-after-departure are both defect classes. Amended 2026-09-13: the two-class retention carve-out is stated explicitly per C1, breadcrumb, so the breadcrumb's survival does not read as a defect against this scenario. The two classes are T+4h personal data and purge-exempt club artifacts, per Pillar II §2 retention model.*

---

**R3-71: The ride survives any individual departure — including the Captain's**
```
Given a ride is active with multiple participants
When any participant leaves via Leave Ride — including the Captain
Then the ride remains active for all remaining participants
And remaining participants' tracking, rendering, and channel state are unaffected by the departure
And no Leave Ride action ever ends a ride — End Ride (R3-25/26) and inactivity auto-close (R3-36) are the only ride-ending events
And a ride left empty by departures persists until End Ride or auto-close — an empty active ride is valid, bounded state
And no role transfers on Captain departure: nobody is promoted, and every remaining role keeps its existing envelope
And End Ride is available to any Captain on the ride; if none remains, the ride closes by the inactivity backstop
```
*[Source: Senior PM — ride survival on any departure incl. Captain is built and working in PoC; last-participant exemption considered and dropped (auto-close is the committed backstop); slate 9, command-coverage bundle] Amended 2026-09-13: midnight auto-close corrected to inactivity auto-close per B2, lifecycle machinery, the same supersession applied to R3-36 and R3-69; and the command-coverage outcome stated per slate 9, which ruled captainless-degraded and declined role transfer outright. Degraded means nobody holds Captain powers, not that surfaces vanish. [SURVEY CHECK SC-2, SC-8 carried.]*

---

**R3-73: Joinable rides are presented at sign-in (Vechelon ↔ native contract)**
```
Given rides exist in Vechelon that are upcoming or already started
When a rider signs into the native app
Then the rider is presented with rides falling in a twenty-four hour rolling window, not calendar-today
And a ride is joinable from the moment it enters the started state, whichever path put it there — the auto-start job at roughly an hour before schedule, or an ad-hoc Captain start at any time — and remains joinable until the ride closes
And before that the ride renders as scheduled, with RSVP available
And started versus scheduled carries the visual weight; RSVP'd versus not is a quiet secondary mark at most
And no visual treatment ever affects joinability (R3-63)
And tapping Join adds the rider to that ride's roster if not already present (R3-60)
```
*[Source: Senior PM; D2, ride-list window; slate 16, presentation window, visual treatments and joinability threshold] Integration surface: the ride-list read contract, Rails 1 and 2-owned schedule data rendered natively. Amended 2026-09-13: the open values are filled. The presentation window is D2's twenty-four hour rolling window and there is no separate presentation window to decide. Joinability binds to the started state rather than computing an offset from schedule time, which keeps a single threshold rather than two that must be held in agreement; the two-timer failure class named by D5 is the rationale. Presentation and joinability remain two distinct knobs, as Session A required.*

---

**R3-61: [DELETED - 2026-09-13]** Superseded by slate 8, cross-surface session handoff, whose three verbatim Senior PM scenarios are enshrined below as R3-75, R3-76 and R3-77. R3-61's commitment that identity binding is origin-agnostic across native sign-in and cross-surface arrival is carried by those three together with R3-56, identity binding. The handoff mechanism R3-61 left [UNTRACED] is now ruled: a deep-link token carries ride context and auth across the PWA to native crossing, built and tested to the ride-start friction budget. Token lifetime, refresh and trust rules route to the platform-substrate pass per slate 15. Number retired, never reused.

---

**R3-75: Cross-surface join — PWA to native is the key moment**
```
GIVEN a rider is logged into the PWA WHEN they join a ride they are added to the roster THEN the native app opens at the map of the parking lot, they can see the other riders that have joined using the app represented as well as their own marker.
```
*[Source: Senior PM, verbatim, slate 8 scenario one, cross-surface session handoff] Enshrined 2026-09-13 as written, numbered at MACD per Immutable Numbering. Supersedes R3-61 together with R3-76 and R3-77. Boundary note carried from the ruling: this scenario governs app-holding riders; the app-absent fallback is R3-77. Own-marker-live at join composes with D2's engine-start rule and R3-37, deterministic engagement at ride join.*

---

**R3-76: Native join — same arrival, no crossing**
```
GIVEN a rider is logged into the native app WHEN they join a ride they are added to the roster THEN the map screen opens at the map of the parking lot, they can see the other riders that have joined using the app represented as well as their own marker.
```
*[Source: Senior PM, verbatim, slate 8 scenario two, cross-surface session handoff] Enshrined 2026-09-13 as written, numbered at MACD per Immutable Numbering. Together with R3-75 this is the origin-independence commitment R3-61 carried: the arrival is identical whichever surface the session started on.*

---

**R3-77: App-absent fallback — the PWA roster page**
```
GIVEN a rider is logged into the PWA WHEN they join a ride they are added to the roster THEN the PWA roster page is displayed because they do not have the app installed, they are able to see the captain(s) and support(s) information.
```
*[Source: Senior PM, verbatim, slate 8 scenario three, cross-surface session handoff] Enshrined 2026-09-13 as written, numbered at MACD per Immutable Numbering. Stands as written per the slate 8 rider ruling, phone visibility: leaders' name and phone are visible to every roster viewer including PWA-only riders. The roster surface is ride-scoped per slate 11, roster viewability window: it opens with the ride and goes with it.*

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

*End of [Vechelon Rail 3] Pillar III: The Quality Gate (v1.1.1)*
