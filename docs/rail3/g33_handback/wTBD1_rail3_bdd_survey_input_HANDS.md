# [Vechelon Rail 3] wTBD1: BDD Scenario Set — W277 Survey Input

Project: Vechelon Rail 3 — Mobile Tactical | Parent: G33 (id 5381) → W277 (id 5380) | Compiled: 2026-07-27 | Status: SURVEY INPUT — NOT A PILLAR III COMMIT

> Task ID: wTBD1 under the wTBDn convention: Brain-side placeholder carrying proposed sequence; the Hands substitute a real W-number only when the work is actually ticketed in Stride.

---

## 1. How to Read This Set

Brain-authored yardstick for W277's comparison pass — the "as it should be" half of the survey. Dual-sourced by Senior PM ruling:

- **Pillar II v1.0.2 / Pillar III v1.0.0 (2026-05-12) are the committed Bedrock** (located at `vechelon\productdocuments\rail3`). The committed scenarios R3-01–R3-36 remain authoritative where they cover ground; this set continues their numbering and does not duplicate them. Known-stale mechanism note: R3-34/35 name expo-location; the build runs Transistorsoft — intent holds, mechanism is drift finding (a).
- **Stride decision records (D72, D86–D91) are field truth** — engine evolution never enshrined via MACD.
- Scenarios grade against these sources per their tags. Gaps between committed text and the build are findings, not defects to fix in-flight.

**Tags:**
- `[Source: …]` — traceability to committed text, a Stride record, or a Senior PM ruling.
- `[UNTRACED — …]` — expectation with no committed/recorded source; a Brain-session decision finalizes it. Grade the behaviour, note the flag.
- `[SURVEY CHECK SC-n]` — a question you answer from the build in Artifact 1.
- `TS-dependent` — load-bearing on Transistorsoft-specific capability (exposure map for the buy decision).

**R3-64 does not exist** — killed during authoring, number retired.

---

## 2. Drift Findings (a)–(g) — confirm, refute, or detail with evidence in Artifact 1

- **(a)** Pillar II §2 names **expo-location**; the build runs **Transistorsoft** — undocumented build-vs-buy decision (driver: Android background location shutdown unsurvivable on the free path).
- **(b)** Pillar II has **no engine-lifecycle state model** — Feature 4's table is the fleet-view machine, not the engine's moving/stationary/dormant machine.
- **(c)** **No committed resume model** in the 2026-05-12 Bedrock.
- **(d)** **D91's root cause and fix absent from all committed text.**
- **(e)** **Roster page implemented** — full ride-participant roster to Captain and Support, role designations applied, rider-role access restricted per the committed envelope. Absent from Pillar II's feature index; no spec, no BDD. Confirm: gating matches §4.1/R3-32 exactly (incl. phone visibility on this page), data source, availability window. **Guests — two distinct statements:** (1) *Current state:* the PoC correctly excludes guest participation; guests exist only portal-side (Rails 1 & 2) for RSVP/planning. Confirm guest RSVP records are invisible to all current Rail 3 surfaces (SC-4). (2) *Forward intent, not a PoC finding:* the integrated app will support guest participants, including their presence on the roster page — note in Artifact 1 anything in the participant model or roster design that would require rework to accommodate guests. Guest join itself remains gated behind the PDoD-03 Brain session.
- **(f)** **Leave Ride implemented** — first-class departure action, working in PoC. Absent from feature index and committed BDD. Includes ride-survival behaviour (R3-71). If the build implements a last-participant auto-end, record it as a sub-finding.
- **(g)** **Breadcrumb implemented, committed nowhere** — leader-upsert captain path trace; no spec, no BDD, no recorded decision.

---

## 3. Re-Engagement Mechanism Inventory — confirm this map against the code

**Layer 0 — don't lose the engine:** D91 lifecycle decoupling (built, field-validated, reviewed). D90 prong 1: one-shot `changePace(true)` at join (coded on branch).

**Layer 1 — the engine's own return from stationary:** TS motion-activity detection (primary today; cannot fire while suspended). TS stationary geofence exit ~200m (slow/throttled under suspension).

**Layer 2 — the D86–D90 cluster (superseded per D91, largely dead code):** D86 Saver-off edge listener, D88 movement heartbeat, D89 resume-poll, D90 prong 2 resume re-assert — all end in `changePace(true)`; no-ops during the crisis they were built for. **Confirm which detectors remain wired (SC-6 — dead-detector finding class).**

**Layer 3 — does not exist yet:** TS native heartbeat + headless task; native autoSync; server-detected staleness → FCM wake. All unbuilt.

**Current state:** Layer 0 + Layer 1 + one glance-dependent fallback. Against OEM suspension of a healthy engine (the D88 class): no built mechanism.

---

## 4. SURVEY CHECK Index

| # | Question | Scenario |
|---|---|---|
| SC-1 | Sign-out during an active ride without Leave Ride first — what does the build do? | R3-58 |
| SC-2 | Command coverage after Captain departure: End Ride authority, command visibility. | R3-71 |
| SC-3 | Breadcrumb behaviour when upserts cease: persist / age / vanish; any visual marking. | R3-72 |
| SC-4 | Roster derivation reads Join events only; guest RSVPs invisible to every Rail 3 surface. | R3-63 |
| SC-5 | `myRiderId` in engine deps as identity guard — intentional or incidental? | R3-57/38 |
| SC-6 | Which Layer 2 detectors are still wired. | §3 |
| SC-7 | Roster page: gating vs §4.1/R3-32, data source, availability window. | Finding (e) |
| SC-8 | Last-participant behaviour if implemented (auto-end vs persist-to-auto-close). | R3-71 |

---

## 5. Scenarios

### 5.1 Tracking-Engine Lifecycle (R3-37 – R3-45)

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

**R3-38: Engine lifecycle is independent of threshold-data changes**
```
Given a rider has joined an active ride and the tracking engine is running
When ride threshold data resolves or updates after engine start
Then the engine start/stop lifecycle is not re-triggered
And no stop/start race can leave the engine disabled
And the rider's fixes continue uninterrupted across the threshold update
```
*[Source: Stride D91 — field-validated, reviewer-approved] Engine deps = [backgroundReady, rideId, myRiderId]; thresholds to refs. Validated ride 260d2131. Drift finding (d).*

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

**R3-40: Rider self-health warning when own device stops producing fixes**
```
Given a rider is in an active ride and believes they are being tracked
When the rider's own device produces no GPS fix for the self-health threshold
While the app's state says tracking should be active
Then the rider is warned on their own device that they may not be visible to the captain
And the warning fires regardless of the underlying cause (OEM suspension, engine disengagement, or service termination)
And the warning does not fire for a rider who is genuinely stationary within the engine's normal stop behaviour
```
*[Source: Stride D88 decision (2), D90 prong 3] Precondition checks never catch outcome failure; the OS blue dot masks a dead engine. Field evidence: ride 3efe17fc. Threshold value [UNTRACED — Brain-session item].*

**R3-41: Captain and SAG views distinguish a dead engine from a healthy stationary rider**
```
Given a Captain and a SAG are viewing the fleet on the Live Map
And a rider's device has stopped producing fixes while their ride session remains active
When the rider's stale-self condition is detected
Then the same system-detected stale state is surfaced on both the Captain's and the SAG's view
And the stale presentation is identical for both roles — one detection, one state, two renderings
And a healthy rider who is genuinely stopped is not presented in the stale state on either view
And the stale presentation is distinguishable from the committed Stopped, Inactive, and Dark fleet-view states
```
*[Source: Stride D88 acceptance (2); Senior PM — both command roles, same system action] Fifth-state vs Dark-refinement vs overlay [UNTRACED — Brain-session item].*

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

**R3-43: Saver-at-start delay is bounded and self-recovering**
```
Given a rider joins an active ride with Battery Saver enabled at engine start
When the tracking engine initializes under Battery Saver
Then the rider's first fixes may be delayed by the known Battery-Saver startup delay (field-observed ~3–4 minutes) before continuous tracking engages
And the engine recovers to continuous tracking without rider intervention
And the delay does not recur once tracking has engaged
And the rider is not presented as stale (R3-40/41) during the known startup window
```
*[Source: Stride D91 residual — unticketed] Self-health threshold must sit above or gate on this window. Window value field-observed, not committed [UNTRACED].*

**R3-44: Engine lifecycle and fleet-view state machines remain distinct and consistent**
```
Given the tracking engine's lifecycle states (moving / stationary / suspended) exist on the rider's device
And the fleet-view states (Active / Stopped / Inactive / Dark) exist on Captain and SAG maps per committed thresholds
When a rider's engine transitions between lifecycle states during a ride
Then fleet-view state is derived only from ping receipt against the tenant-configured thresholds (Pillar II Feature 4)
And a healthy stationary rider progresses Stopped → Inactive per the committed table, never to stale
And an engine that has stopped reporting produces Dark at the configured Dark threshold regardless of cause
And the stale-self signal (R3-40/41) may surface earlier than Dark but never contradicts the committed fleet-view progression
```
*[Source: Pillar II §3 Feature 4; Stride D88/D91] Two distinct state machines — their conflation is the fragility class this survey catalogs.*

**R3-45: Engine state is observable in telemetry for every active ride**
```
Given a rider is in an active ride
When the tracking engine starts, stops, changes pace, or is suspended during that ride
Then each engine lifecycle event is captured in telemetry with a timestamp
And power state (Battery Saver, low-power mode) is captured at engine init and on change
And a ride that produces no fixes leaves sufficient telemetry to distinguish engine-never-engaged, engine-torn-down, and OEM-suspension
And the telemetry is inspectable after the ride without on-device access
```
*[Source: Stride D86/D88/D91 — every diagnosis depended on W272 telemetry + the TS native log; on-device log retrieval does not scale past PoC] [UNTRACED — Brain-session item].*

### 5.2 Power / OEM Throttle (R3-46 – R3-50)

**R3-46: Battery Saver enabled mid-ride — tracking survives**
```
Given a rider is in an active ride with the tracking engine engaged and producing fixes
When the rider enables Battery Saver mid-ride (foreground or from quick settings while backgrounded)
Then the engine continues producing fixes for the remainder of the ride
And any degradation is bounded and observable in telemetry (R3-45), never a silent stop
And the committed Saver advisory (R3-06) may fire per its own rules, independent of engine behaviour
```
*[Source: Stride D89 field evidence — steady pings under Saver; Stride D91 — Saver was a red herring for the mid-ride death] Degradation bound unquantified [UNTRACED].*

**R3-47: Battery Saver disabled mid-ride — no rider action required to restore tracking**
```
Given a rider is in an active ride with Battery Saver enabled
When the rider disables Battery Saver — whether foregrounded, backgrounded, or from the lock screen
Then healthy tracking continues or resumes without any rider interaction beyond the toggle itself
And restoration does not depend on a background-unreliable OS edge listener
And no rider-visible state requires the app to be foregrounded to reconcile
```
*[Source: Stride D89 root cause — the ON→OFF edge listener does not fire backgrounded] Behaviour, not mechanism — whether Saver-off handling code survives is SC-6.*

**R3-48: OEM suspension on a correctly-configured device — the recovery chain engages**
```
Given a rider's device is correctly configured (location Always, activity permitted, battery unrestricted, Saver off)
And the rider is backgrounded during an active ride
When the OS or OEM suspends or terminates the background location engine anyway
Then the recovery chain engages in order: background self-recovery (R3-42), foreground resume re-assert (R3-39)
And if no recovery has occurred within the self-health threshold, the rider is warned (R3-40)
And the stale state is surfaced to Captain and SAG (R3-41)
And at no point does the failure remain fully silent on all surfaces
```
*[Source: Stride D88 — the S20 FE A/B: fully compliant device, TerminateEvent, zero fixes, no warning anywhere] Invariant: no fully silent failure.*

**R3-49: Power advisories are never load-bearing for tracking guarantees**
```
Given the committed power advisories exist (Saver prompts R3-05/06, OEM exclusion prompt, first-ride explainer R3-07)
When a rider dismisses, ignores, or cannot act on any advisory
Then ride join is never blocked (committed non-blocking rule)
And every tracking guarantee in this domain (R3-37–48) holds independent of advisory compliance
And advisory compliance may improve outcomes but is never a precondition for the recovery chain or self-health backstop
```
*[Source: Pillar II §2; Stride D86 — "MUST stay non-blocking per R3-05/R3-06"; Stride D88 — precondition checks vs outcomes] Verify no prompt became structurally load-bearing.*

**R3-50: Battery cost is bounded without compromising ride-time visibility**
```
Given a rider is in an active ride with the engine engaged
When the rider covers zero distance (regroup, coffee stop, mechanical)
Then no location fixes are produced while stationary (distance-filter suppression)
And the rider re-appears as moving on Captain and SAG maps promptly when riding resumes
And re-assert mechanisms (R3-39, R3-42) firing on a healthy engine are no-ops with no cumulative cost
And aggregate drain is measured against the committed target (<10%/hr, D-54 / V-009), assessed across the full ride-duration envelope including long rides (9+ hours), where the hourly target alone does not guarantee ride-end survival
And no battery optimisation behaviour may reintroduce a silent-invisibility path (R3-48 invariant)
```
*[Source: Pillar III V-009 / D-54; Stride D88 `what` vs D90 `what` — CONFLICTING field postures on mid-ride stop detection (force-track vs stopTimeout-stationary); Senior PM — duration envelope includes >9h rides, uncommitted] This scenario encodes the invariants both postures must satisfy and deliberately does not select the mechanism — the posture is a Brain-session decision. Survey: document which posture the build implements.*

### 5.3 Channel / Resume (R3-51 – R3-55)

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
*[Source: Stride D72 root cause (1) + fix] Field evidence: receive-blind from ~20 min in, 108km ride. The 9h+ envelope multiplies exposure (~9 refreshes per long ride).*

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

**R3-53: A glance restores live receive within ~1 second**
```
Given a rider's device has been backgrounded or locked during an active ride
And the ride channel may have dropped while backgrounded
When the rider foregrounds the app (resume signal fires)
Then the channel reconnects and live receive is restored within ~1 second of foreground
And the fleet map resumes receiving on that first glance, rendering each participant at their last known position until a newer fix arrives (R3-62)
And the resume signal is device-agnostic (clock-gap detector + staleness sweep + AppState, coalesced)
```
*[Source: Stride D72 fix; W269 resume composition] Fresh-on-glance: token expiry must self-heal, never terminal receive-blindness — D72 is the named regression case. The ~1s figure is design intent, not a committed NFR [UNTRACED on the number].*

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

**R3-55: Missed-while-dead state reconciles on channel recovery**
```
Given a rider's channel was dead or dropped for a period during an active ride
And fleet state changed during that window (positions, beacons, rider states, departures)
When the channel recovers (reconnect or resume)
Then the rider's view reconciles to current fleet truth, not just new events from the recovery point forward
And a Support Beacon raised while the rider was receive-blind is surfaced on recovery, not silently missed
And the reconciliation mechanism respects committed privacy rules (Hard Purge scope, role gating)
```
*[Source: Stride D72 RELATED — DB-snapshot-on-focus fallback, parked pending Pillar II §2 privacy ratification; unbuilt] Broadcast is fire-and-forget: a beacon during receive-blindness is otherwise lost. Position catch-up on recovery is covered by the seed rule (R3-62); this scenario owns the event-state gap. [UNTRACED — Brain-session item.] Survey: document current recovery behaviour (events-forward only vs any reconciliation).*

### 5.4 Identity (R3-56 – R3-61)

**R3-56: One session, one rider identity — all state scoped to the binding**
```
Given a rider authenticates on Rail 3
When the rider joins an active ride
Then every artifact the device produces — gps_ping, beacon, breadcrumb, rider state — is attributed to exactly one (rider identity, ride) binding
And no fix is ever published unattributed or attributed to a prior identity
And the binding is established before the tracking engine starts, never after
```
*[Source: Stride W277 key files — identity binding (D77) as substrate; Pillar II §2 RLS] [D77 record not transcribed — flag any divergence found.]*

**R3-57: Account swap on a shared device leaves no residual state**
```
Given rider A has previously used Rail 3 on a device (any combination of rides, sign-outs, or stale sessions)
When rider B signs in on the same device and joins an active ride
Then no state from rider A persists into rider B's session — no positions, roster view, channel subscription, lastKnown seed, or pending telemetry attributed across identities
And rider A's identity cannot receive or produce any further ride data on that device
And the tracking engine's lifecycle is re-bound to rider B, not resumed from rider A's session
```
*[Source: Stride W277 use cases — account swaps; Pillar II §2 RLS] myRiderId changing MUST restart the engine — the one identity event where a lifecycle re-trigger is required (SC-5).*

**R3-59: Recovery never changes who the user is**
```
Given a rider is authenticated and in an active ride
When any recovery or re-assert mechanism fires (resume, reconnect, R3-39, R3-42)
Then it acts for the already-authenticated rider — recovery never changes who the user is
And routine token refresh is invisible: same identity, no re-registration, no engine restart
```
*[Source: Stride D89 — re-engagement is downstream of identity (D77)] Refresh preserves; swap re-binds (R3-57). Survey: document behaviour on token expiry mid-recovery.*

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
*[Source: Pillar II §2 inherited tables read-only; §4.1 role matrix; Senior PM — the roster is the record of joins, not a filter against them] First integration-surface scenario: portals write identity, Rail 3 reads.*

**R3-61: Identity binding is origin-agnostic — native sign-in and cross-surface handoff produce identical sessions**
```
Given a rider holds a valid authenticated session originating either natively on Rail 3 or on the web surface (Rail 2 PWA)
When the rider joins an active ride in the native app
Then the identity binding (R3-56) is established identically regardless of session origin
And a cross-surface arrival does not require re-entering credentials at ride join
And every downstream guarantee (R3-57 through R3-60) holds without an origin-dependent variant
And the handoff mechanism, whatever its design, completes before the tracking engine starts
```
*[Source: Senior PM — PWA-originated sessions may continue into the native app at ride join] Handoff mechanism designed nowhere [UNTRACED — Brain-session item]. Survey: document current cross-surface behaviour (likely native re-auth) as the baseline.*

### 5.5 Fleet Render Lifecycle (R3-62 – R3-66)

**R3-62: Fleet render derives from joins — seed immediately, upgrade live**
```
Given a Captain, SAG, or rider loads the fleet map (join, fleet load, or reconnect)
When the map renders the fleet
Then every rendered participant is one who has joined the ride — the roster is the record of joins, not a filter against them
And each participant with any known position is seeded immediately from lastKnown — no empty map, no vanishing riders
And every rendered participant remains at their last known position until superseded by a newer fix — positions age through the committed ladder; they never disappear while the participant is on the ride
And a seeded render upgrades in place to live position within 30 seconds or less on the healthy path
```
*[Source: Stride W277 — useFleetPositions "pings ∪ lastKnown ∩ roster"; Senior PM — seed-until-live ruled solid; ≤30s ceiling, uncommitted] Test-plan note: validation must distinguish live renders from stale seeds when grading; the 30s–2min ambiguity window is considered-and-accepted by design.*

**R3-63: Mid-ride join renders promptly on all Captain and SAG surfaces**
```
Given a ride is active with participants rendered
When a new participant joins mid-ride (in-app join or QR)
And the participant may or may not have RSVP'd — RSVP is planning intent, never a join precondition
Then the participant appears on Captain and SAG maps without any surface requiring reload
And the roster page is updated to include the new participant if not already present
And the participant's first render follows the seed rule (R3-62) — lastKnown if any exists, first live fix otherwise
And the joining rider's own surfaces populate per their role's visibility (Captain/SAG icons, own blue dot)
```
*[Source: Pillar III R3-33/27; SD-02 — RSVP is intent only; Senior PM — RSVP not required to join] Roster membership derives from Join events exclusively; RSVP-derived filtering or seeding is a defect class. SC-4 probe: guest RSVPs must be invisible to every Rail 3 surface.*

**R3-65: Departure removes cleanly — and is never confusable with failure**
```
Given a participant is rendered on Captain and SAG surfaces during an active ride
When the participant departs (Leave Ride per R3-67)
Then the participant is removed from the fleet map; their roster entry is retained, marked departed
And the departure is distinguishable on every surface from Dark, stale, and greyed states
And no lastKnown seed resurrects a departed participant on reconnect or reload (departure beats seed)
And Captain and SAG can distinguish "left the ride" from "lost from the ride" at a glance
```
*[Source: Stride W277 — departures in the render lifecycle; D87 not transcribed] Departure presentation mechanism undesigned [UNTRACED — Brain-session item]. Survey: document what the build renders today on a Leave Ride.*

**R3-66: One role envelope, every surface**
```
Given the committed role visibility rules exist (§4.1 matrix, R3-10, R3-17, R3-32)
When any surface renders participant information — fleet map, bottom sheets, roster page, or any future surface
Then each role sees exactly what the committed envelope grants, identically on every surface
And no surface widens a role's visibility (a rider cannot see other riders on the roster page any more than on the map)
And phone visibility follows R3-32's gating on every surface that renders contact information
And a new surface inherits the envelope by default — widening requires a committed MACD, not a page design
```
*[Source: Pillar II §4.1; Pillar III R3-10/17/32; Senior PM — roster page observed consistent with the envelope] The envelope is role-scoped, not surface-scoped (SC-7).*

### 5.6 Departures & Ride End (R3-67 – R3-72, R3-58)

**R3-67: Leave Ride — teardown is complete and one-way**
```
Given a participant leaves an active ride via the Leave Ride action (built, PoC-evidenced)
When the departure executes
Then the device-side teardown is complete: tracking engine stopped, channel unsubscribed, FGS notification cleared, background task de-registered
And the departed participant is removed from the fleet map on Captain and SAG surfaces, while their roster entry is retained and updated to show departed status — their details remain available to Captain and Support
And no recovery mechanism re-engages tracking for the departed session
And the departure is one-way: only a fresh, explicit Join (R3-68) reverses it
```
*[Source: Senior PM — Leave Ride is the departure trigger, implemented and working in PoC; drift finding (f)] Departure is intended silence — recovery mechanisms must know the difference.*

**R3-58: Sign-out is a session event, not a ride event**
```
Given a rider signs out of the app
When the sign-out completes
Then the session ends and no further ride action is triggered by the sign-out itself
```
*[Source: Senior PM — sign-out causes no further system action] [SURVEY CHECK SC-1 — what does the build do on sign-out during an active ride without Leave Ride first? AuthContext shows sign-out wiring. Document actual behaviour.]*

**R3-68: Rejoin after departure is a clean fresh join**
```
Given a participant departed an active ride and the ride remains active
When the participant joins again (in-app Join or QR)
Then the rejoin is a fresh join in every respect: new binding (R3-56), engine start per R3-37, roster re-inclusion (R3-63)
And the participant's render seeds per R3-62 and upgrades live within the committed ceiling
And no state from the departed session leaks into the new one — and no departed-session artifact suppresses the rejoin
And Captain and SAG surfaces show one participant, once — no duplicate or ghost entry from the prior session
```
*[Source: Stride W277 use cases — regroups; Senior PM — rejoin is supported] Departure state is scoped to the session, not the identity — "departure beats seed" (R3-65) must not become "departure beats rejoin." Server-side ride data (incl. lastKnown) persists per R3-70 and legitimately seeds the rejoin render; "no state leaks" scopes to device/session state, not ride truth.*

**R3-69: Ride end tears down every participant, everywhere**
```
Given a ride is active with participants tracking
When the ride ends (Captain End Ride two-tap, or midnight auto-close)
Then every participant device performs the full teardown of R3-67 without individual action
And the teardown reaches backgrounded and locked devices, not only foregrounded ones
And a device unreachable at ride end (dead zone, powered off) completes its teardown on next app contact — no engine tracks a ride that no longer exists
And the committed post-end actions proceed (R3-26), with the purge clock running per R3-36
```
*[Source: Pillar III R3-26/35/36] R3-35 is silent on how the end signal reaches a locked device [UNTRACED on mechanism — Brain-session item]. Survey: document how (and whether) the build reaches backgrounded devices at ride end.*

**R3-70: Departure changes rendering, never retention**
```
Given participants have departed mid-ride or a ride has ended
When their data's lifecycle proceeds
Then departure removes the participant from live rendering but does not delete or early-purge their ride data
And lastKnown, ride participation, and any beacon records persist until the committed Hard Purge executes (T+4h after ride close, R3-36)
And a departed participant's data is purged on the same schedule as everyone else's — no separate clock
And nothing about departure creates a retention obligation beyond the committed purge scope
```
*[Source: Pillar III R3-36] Rendering lifecycle and retention lifecycle are orthogonal by design — purge-on-departure and render-after-departure are both defect classes.*

**R3-71: The ride survives any individual departure — including the Captain's**
```
Given a ride is active with multiple participants
When any participant leaves via Leave Ride — including the Captain
Then the ride remains active for all remaining participants
And remaining participants' tracking, rendering, and channel state are unaffected by the departure
And no Leave Ride action ever ends a ride — End Ride (R3-25/26) and midnight auto-close (R3-36) are the only ride-ending events
And a ride left empty by departures persists until End Ride or auto-close — an empty active ride is valid, bounded state
And command-role coverage after a Captain departure is presented per the build's actual behavior [SURVEY CHECK SC-2]
```
*[Source: Senior PM — ride survival on any departure incl. Captain is built and working in PoC; last-participant exemption considered and dropped (auto-close is the committed backstop)] SC-8: if the build implements a last-participant auto-end, record as a sub-finding.*

**R3-72: The breadcrumb is honest about its source**
```
Given riders are following the Captain's breadcrumb on an active ride
When the Captain departs (Leave Ride) or the Captain's device stops producing the trace
Then the breadcrumb stops extending
And its stopped state is visually distinguishable from a live, extending trace on every surface that renders it
And no rider is presented a frozen trace as if it were the Captain's current line
And breadcrumb continuation or re-sourcing after a Captain departure follows the ratified command-coverage design [UNTRACED — Brain-session item]
```
*[Source: Stride D86 telemetry — leader-upsert breadcrumb, implemented; drift finding (g)] [SURVEY CHECK SC-3 — behaviour when upserts stop: persist / age / vanish; any visual marking] Disappearance satisfies the invariant.*

### 5.7 Ride Presentation & Join Surface (R3-73)

**R3-73: Joinable rides are presented at sign-in (Vechelon ↔ native contract)**
```
Given rides exist in Vechelon that are upcoming or already started
When a rider signs into the native app
Then the rider is presented with those rides as joinable
And tapping Join adds the rider to that ride's roster if not already present (R3-60)
And ride state (scheduled vs started) and the rider's RSVP status may carry distinct visual treatment, but neither affects joinability (R3-63)
```
*[Source: Senior PM, this session] Integration surface: the ride-list read contract (Rails 1 & 2-owned schedule data → native presentation). [UNTRACED — how far ahead "upcoming" reaches (the presentation window) and the visual treatments are Brain-session design decisions.] Survey: document the current ride-list query and window.*

---

*End of survey input — 36 scenarios (R3-37–R3-73; R3-64 retired). Enshrinement into Pillar III occurs only via MACD after the Strategic Re-engagement session.*
