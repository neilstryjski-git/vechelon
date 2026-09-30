# Rail 3 — Tracking-Engine Lifecycle Decision Records

**Purpose:** BDD-authoring inputs for **W277** (Rail 3 architecture survey) under goal **G33**, tracking-engine lifecycle domain first. Verbatim transcriptions of the governing Stride decision records so scenarios trace to recorded decisions rather than recollection.

**Source:** Stride board 116 (project tracking). **Mode:** read-only transcription — no ticket edits, no status changes.
**Compiled:** 2026-07-27.

**Conventions used below**
- Verbatim only. Recorded text is transcribed exactly as it stands, including anything outdated, inconsistent, or since-changed. Nothing paraphrased, reconciled, or modernized.
- `[THIN: <field> not recorded]` flags a field the record does not populate. Absences are findings, not blanks to fill.
- **Status** is transcribed from Stride's machine `status` value plus raw `column_id` (the human-readable column-name endpoint returns 404). Observed mapping on this board: `column_id 296` = backlog/open, `298` = in-progress, `299` = completed.
- **Review note (applies to every record):** no record populates the structured review fields (`review_status`, `reviewed_at`, `reviewed_by_id`, `review_notes`, `review_report`, `reviewer_result`). Where a review actually happened it is narrated in the description prose (see D91). A null review stamp is therefore uninformative on this board — read the prose.

---

## Index

| ID | Type | Title (short) | Status | Role in this domain |
|----|------|---------------|--------|---------------------|
| D72 | defect | ride channel dies on token expiry/background drop | completed | **Separate class** — receive-side channel, not engine lifecycle |
| D86 | defect | Battery Saver at engine start leaves motion detection dead | completed | Mechanism **SUPERSEDED by D91** |
| D88 | defect | correctly-configured rider silently not tracked (OEM suspend) | in_progress | Mechanism **SUPERSEDED by D91** |
| D89 | defect | Battery-Saver-off nudge misses the backgrounded toggle | in_progress | Replaces D86 detector; **SUPERSEDED by D91** |
| D90 | defect | engine can run an entire ride dark if locked during warm-up | in_progress | Mechanism **SUPERSEDED by D91** |
| D91 | defect | app tears down its own GPS engine ~1s after start (thresholds dep) | completed | **The REAL root cause — field-validated + reviewed** |
| G33 | goal | Rail 3 mobile architecture review & state-engine optimization | open | Parent umbrella goal |
| W277 | work | full-app architecture survey | open | The survey that **consumes** the Brain's BDD set |

---

## D72 — id 4794

**Title:** `Rail 3 — ride channel dies on token expiry/background drop and never recovers (receive-blind rest of ride)`
**Type:** defect · **Priority:** high · **Complexity:** small

### Problem statement / failure context
> FIELD DEFECT from the 2026-07-05 108km out-and-back (2 devices). Sven's device (gmail) channel errored ~20 min in and NEVER recovered — receive-blind the rest of the ride (saw the other rider only 18x). Sink proof: broadcast_latency receives drop to 0 from 12:30 UTC on while gps_ping SENDS continue (send=REST+native FGS robust; receive=persistent websocket is the fragile path).
>
> ROOT CAUSE (two compounding bugs): (1) realtime socket JWT set ONCE at first subscribe (useRideChannel), never refreshed; a ride outlives the ~1h token, so any reconnect (screen-lock/dead-zone) re-auths STALE, tenant RLS get_my_tenant_id denies, channel dies CHANNEL_ERROR. (2) CHANNEL_ERROR was terminal — bare console.warn, no retry.

### Decision text (recorded inline in `description`; dedicated `what` field is `null` — [THIN: `what` not recorded])
> FIX (branch d-rail3-channel-reconnect off w204-production-profile, tsc-clean, NOT yet device-validated): AuthContext pushes refreshed tokens onto the realtime socket (setAuth on auth events); useRideChannel refreshes token before each (re)subscribe, auto-reconnects on CHANNEL_ERROR/TIMED_OUT/CLOSED with capped exp backoff + JITTER (anti-thundering-herd when a peloton exits a dead-zone together), reconnects on AppState->active so a glance restores live in ~1s. Validate: airplane-mode toggle + real long ride.
>
> RELATED (separate decision): DB-snapshot-on-focus as a REST receive FALLBACK — needs Pillar II §2 privacy ratification.

### Dates
- **Raised (inserted_at):** 2026-07-05T19:51:28
- **Decided:** [THIN: no distinct decision/ratification timestamp recorded]
- **Completed (completed_at):** 2026-07-18T23:39:38Z · **updated_at:** 2026-07-18T23:39:38

### Linked / superseding records
- Inline "RELATED": DB-snapshot-on-focus REST receive fallback — needs Pillar II §2 privacy ratification (no identifier given).
- [THIN: `dependencies` empty; no `parent_id`]

### Current status in Stride
- **status:** `completed` · **column_id:** 299
- **Review:** [THIN: review-stamp fields all not recorded — closed without a review stamp]

---

## D86 — id 5375

**Title:** `Rail 3: Battery Saver at engine start leaves motion detection dead all ride — guard fires after startBgGeo, compliance re-inits nothing`
**Type:** defect · **Priority:** high · **Complexity:** medium

### Problem statement / failure context
> FOUND 2026-07-16 from the sink — morning ride 06abdab3 (build 672f0a8, SM-S911W, captain e61000b4).
>
> OBSERVED. The captain's phone produced 2 gps_ping in the first second and NOTHING for the next 2h19m. Position froze at the start line -> invisible to the rider's phone the whole ride (rendered from lastKnown 8.7km behind, off-screen), and no breadcrumb (leader upsert fired once at 12:17:44, never again). The SAME handset logged 232 gps_ping that EVENING with saver off — so this is NOT a hardware fault.
>
> TELEMETRY (app_lifecycle + motion_change, captain, morning):
>   12:17:42-:44  low_power_mode: TRUE at engine init; motion_change isMoving:false x2
>   12:17:49      low_power_mode: FALSE (Neil complied with the warning, ~6s later)
>   ...           isMoving NEVER goes true again; 2 gps_ping total over 2h19m
> Evening control (same phone, saver OFF at init): isMoving:true at +3s, 232 gps_ping.
>
> ROOT CAUSE — TWO COMPOUNDING, both proven in code:
> 1) GUARD FIRES TOO LATE. useFleetPositions() is called at RideMapScreen.tsx:81, so its startBgGeo effect (useFleetPositions.ts:398) is registered — and runs — BEFORE the effect at RideMapScreen.tsx:210-212 that calls promptIfBatterySaverOn('join'). React runs effects in declaration order, so the Transistorsoft engine boots UNDER Battery Saver and THEN the warning appears. Matches Neil's report: "when that warning is presented the ride and gps monitoring is already started." This ordering was introduced by D63 (which wired the W177 advisory into the ride flow) and never considered engine-start order.
> 2) COMPLIANCE RE-INITS NOTHING. startBgGeo is idempotent — ready() is guarded by a `configured` flag, then start(). Nothing observes battery-saver / low-power state and no effect re-runs when it flips. So turning saver off (12:17:49) does not re-initialise the engine; it stays in the state it booted into for the whole ride.
>
> HYPOTHESIS (mechanism, not yet isolated): Battery Saver at engine start throttles Android motion-activity detection, which per the W261 un-force note (bgGeo.ts) the SDK now RELIES ON to govern moving<->stationary. A motion-triggered engine that never sees isMoving:true correctly stays quiet -> 2 pings. DISTINCT from D76 (battery OPTIMIZATION -> network egress throttled, engine ALIVE and pinging); here the engine never engages, so there is nothing to send.

### Decision text (recorded inline in `description`; dedicated `what` field is `null` — [THIN: `what` not recorded]; fix explicitly "not committed — design at pickup")
> CHEAP TEST (no ride needed): saver ON, start ride, dismiss prompt, move ~300m -> check motion_change/gps_ping; then saver OFF. Prediction: on -> no isMoving:true / ~2 pings; off -> isMoving:true within seconds / continuous. If saver-on tracks fine, hypothesis is dead and it's something else (still a useful outcome).
>
> FIX DIRECTIONS (not committed — design at pickup):
>   - Order the guard BEFORE engine start, and/or gate start() until the saver check resolves. MUST stay non-blocking per R3-05/R3-06 — the advisory never blocks ride join.
>   - Make engine start observe power state and re-initialise (or changePace) when saver flips off mid-session.
>   - Consider a hard re-init path invokable from the prompt's "turn it off" action.
>
> IMPACT: a captain who starts a ride under Battery Saver is invisible to the ENTIRE fleet for the whole ride, while their own screen looks correct (the OS last-known seed feeds self-view) — no in-app signal anything is wrong. Safety-relevant.

### Dates
- **Raised (inserted_at):** 2026-07-18T22:44:41
- **Decided:** [THIN: no distinct decision timestamp; fix directions marked "not committed — design at pickup"]
- **Completed (completed_at):** 2026-07-19T21:24:34Z · **updated_at:** 2026-07-19T21:25:06

### Linked / superseding records (inline "Related:" line)
> Related: D63 (source — wired the advisory), W177 (battery-saver prompt impl), W272 (app_lifecycle power instrumentation that caught this), D76 (sibling, different mechanism), bgGeo.ts W261 note. Evidence + capture experiment: docs/ride-experiment-01.md.
- **Also:** D89 records that it "SUPERSEDES D86's DETECTOR" (captured on the D89 record, not on D86 itself). D91 records the whole D86–D90 changePace approach as superseded ("wrong problem"). [THIN: `dependencies` empty on D86; no `parent_id`]

### Current status in Stride
- **status:** `completed` · **column_id:** 299
- **Review:** [THIN: review-stamp fields all not recorded — closed without a review stamp]

---

## D88 — id 5377

**Title:** `Rail 3 — correctly-configured rider silently not tracked in background (device/OEM suspends the location engine); needs force-track + self-health warning`
**Type:** defect · **Priority:** high · **Complexity:** large

### Problem statement / failure context (`description`)
> A rider whose phone is configured 100% correctly can still go completely invisible on the fleet the moment the screen locks, with NO warning. FIELD-OBSERVED 2026-07-18/19, staging ride 3efe17fc (Ad Hoc Ride - Igloo), build 672f0a8. CONTROLLED A/B: one person carried BOTH phones on the same ~12-min walk, both backgrounded within 9s of each other. Captain (Galaxy S23, SM-S911W, acct 42ac0c) streamed ~20 gps_pings in the background (00:29-00:38 UTC). Rider (Galaxy S20 FE, SM-G781W, acct 34c9d9) sent ZERO - no gps_ping, no motion_change - the entire walk, until it was foregrounded at 00:39 UTC (which recovered RECEIVE and drew the captain's breadcrumb).

### Root cause (`why` field)
> ROOT CAUSE (confirmed via the on-device Transistorsoft native log, docs/background-geolocation.log.gz): the S20 FE OS SUSPENDED/TERMINATED the background location engine. Walk window shows TerminateEvent onChange at 20:27:14 EDT, then ONLY connectivitychange/HttpService lines through 20:38 - ZERO onLocation, ZERO motionchange, ZERO activitychange, ZERO heartbeat - until LifecycleManager onResume at 20:39:29. The native engine took no fixes and activity-recognition never fired; the whole service was suspended by Doze/OEM. EVERY rider-controllable setting was correct and IDENTICAL to the captain's phone: Location='Allow all the time', Physical activity=Allowed, battery=Unrestricted (ignoring_battery_opt=true), Battery Saver OFF (low_power_mode=false), and neither phone was on 'Never sleeping apps'. The only material differences: older device (S20 FE) and 21% battery (vs S23 44%). This is the core product guarantee ('a rider on the move is visible to the captain') failing on a correctly-configured device, silently. No existing warning catches it: battery-saver warning (off), OEM-exclusion prompt (already unrestricted), background-location nudge (already granted) all check PRECONDITIONS, never the ACTUAL outcome.

### Decision text (`what` field)
> Do not depend on the SDK's auto motion-detection or on OEM background cooperation. Three parts: (1) FORCE tracking for an active ride: call changePace(true)/setConfig({isMoving:true}) on ride join so the FGS runs in active-tracking mode (harder for Doze/OEM to suspend, and independent of motion-detection which never fired here). distanceFilter:40 still suppresses fixes when a rider covers 0m, so the battery cost stays bounded. (2) SELF-HEALTH WARNING (the essential backstop, catches this class regardless of cause): during an active ride, if the rider's own device has produced no fix for N seconds while it believes it should be tracking, warn the rider ('You may not be visible to your captain') - and surface the same 'stale self' state on the captain's view. (3) HARDENING: register a headless task so tracking survives app termination; evaluate preventSuspend/heartbeat; consider native autoSync so a brief wake POSTs the fix in native even if JS is dead. NOTE: forcing isMoving helps but cannot be GUARANTEED against an OEM that kills the FGS outright - which is exactly why (2) is non-negotiable.

### Acceptance criteria (`acceptance_criteria`)
> 1) During an active ride, a backgrounded rider on an aggressive-OEM/older device continues to send position (force-track) OR is explicitly warned they may be invisible. 2) The captain's view distinguishes a healthy-but-stationary rider from one whose engine has stopped reporting. 3) The fix does not depend on the rider having tuned OEM battery/sleep settings. 4) Battery cost stays bounded (no fixes while covering 0m). 5) Validated by re-running the two-phone same-walk A/B with the older device now visible or warned. Evidence for THIS defect: sink ride 3efe17fc (S23 ~20 bg pings vs S20 FE 0) + native log docs/background-geolocation.log.gz (TerminateEvent 20:27:14, 12 min zero onLocation/motionchange/activitychange).

### Dates
- **Raised (inserted_at):** 2026-07-19T01:20:08 · **updated_at:** 2026-07-19T01:20:08
- **Decided:** [THIN: no distinct decision timestamp recorded]
- **Completed:** [THIN: `completed_at` not recorded — record not completed]

### Linked / superseding records
- Inline references: D63, W177, W272, **D76** ("sibling, different mechanism"), W261. Its force-track/self-health direction is the material D89 folds into "ONE resume-driven engine-liveness re-assert" under G33/W277. Superseded by **D91** ("wrong problem").
- [THIN: `dependencies` empty; no `parent_id`]

### Current status in Stride
- **status:** `in_progress` · **column_id:** 298
- **Review:** [THIN: review-stamp fields all not recorded — not expected at this stage (mid-flight)]

---

## D89 — id 5379

**Title:** `Rail 3 — Battery-Saver-off nudge (D86) misses the backgrounded toggle; move detection to resume-poll`
**Type:** defect · **Priority:** high · **Complexity:** medium

### Problem statement / failure context (`description`)
> D86's re-engage nudge does not fire when the rider turns Battery Saver OFF while the phone is LOCKED/backgrounded. FIELD-OBSERVED 2026-07-19 (staging ride 82a08280, rogers, SM-G781W, build 53d8639): app_lifecycle shows low_power_mode true (14:06) then false (by 14:08:21) — Saver was toggled OFF — but ZERO bg_nudge fired. So D86's trigger is unreliable exactly in the pocketed case it exists to serve. (Separately: this device's engine tracked fine under Saver — steady gps_pings 27-73s apart throughout — so it does not exhibit the throttle-dormancy bug and cannot demonstrate recovery; the throttle repro needs the field captain's device.)
>
> SEQUENCING (added 2026-07-19): D89 SUPERSEDES D86's DETECTOR — keep D86's nudgeBgGeo() action, but REMOVE its watchBatterySaverCleared edge-listener when this lands (otherwise a foreground Saver-off double-fires; harmless-idempotent but redundant/noisy). Do NOT bolt on another standalone listener: implement the resume-poll as the FIRST BRICK of goal G33 / W277's unified resume-driven engine-liveness re-assert — Saver ON->OFF becomes ONE input to a general 'on resume, re-assert the engine (nudge if unhealthy)' hook that D88 (movement heartbeat) and the OEM-suspend case later fold into. Related: G33 (architecture review), W277 (survey), D86, D88.

### Root cause (`why` field)
> ROOT CAUSE: watchBatterySaverCleared (batteryGuards.ts) detects the Saver ON->OFF EDGE via Battery.addLowPowerModeListener, which does NOT fire while the app is backgrounded on Android — so a toggle made from the lock screen / quick settings is never seen. The AppState-'active' backstop is supposed to catch it on foreground-return, but it can miss due to (a) the wasOn init race (wasOn starts false and is set async; a settle before it resolves swallows the edge) and (b) a teardown race (the ride ended ~4s after foregrounding, so the watcher may be torn down before its async isBatterySaverOn() resolves). Net: the ON->OFF edge is lost. The nudge is idempotent (changePace no-op on a healthy engine), so it SHOULD fire on every Saver-off regardless of engine state — the bug is purely detection.

### Decision text (`what` field)
> Stop relying on the background-unreliable live listener. Detect the ON->OFF transition by POLLING the current Saver state at a RELIABLE moment the app already hits — the resume signal (useResume/W269 fires on every foreground; the app already reads low_power_mode at every app_lifecycle). On resume: read isBatterySaverOn() and compare to the last-seen value (persisted or module-level); if it went ON->OFF, nudge. This is reliable because AppState-'active' always fires and reads the CURRENT state fresh, and it removes the wasOn race and the teardown race. BROADER DIRECTION (input, NOT this ticket's scope — see the architecture-survey note): fold Saver-off + movement-miss (D88) + OEM-suspend into ONE resume-driven engine-liveness re-assert, since a nudge is idempotent and the app can afford to err toward nudging on resume.

### Acceptance criteria (`acceptance_criteria`)
> 1) bg_nudge fires on a Saver ON->OFF transition whether the toggle happened in foreground OR while backgrounded/locked. 2) No false nudges when Saver never changed. 3) Detection uses a reliable resume-poll of the already-sampled Saver state, not the background-unreliable live listener; wasOn/teardown races removed. 4) Validated on a device that actually throttles under Saver (recovery: pings resume). Evidence for THIS defect: ride 82a08280 (rogers, 53d8639) — Saver ON->OFF, zero bg_nudge.

### Dates
- **Raised (inserted_at):** 2026-07-19T14:52:30
- **Decided (sequencing note "added 2026-07-19"):** `updated_at` 2026-07-19T15:16:20
- **Completed:** [THIN: `completed_at` not recorded — record not completed]

### Linked / superseding records
- **Supersedes:** D86's detector — "keep D86's nudgeBgGeo() action, but REMOVE its watchBatterySaverCleared edge-listener when this lands."
- **Parent (`parent_id` 5381):** **G33** — goal — "Rail 3 — mobile architecture review & state-engine optimization" (status: open).
- **Related (inline):** G33 (architecture review), W277 (survey), D86, D88. Superseded by **D91** ("wrong problem").
- [THIN: `dependencies` empty]

### Current status in Stride
- **status:** `in_progress` · **column_id:** 298
- **Review:** [THIN: review-stamp fields all not recorded — not expected at this stage (mid-flight)]

---

## D90 — id 5384

**Title:** `Rail 3 — tracking engine can run an ENTIRE ride dark (stationary, zero fixes) if locked during warm-up; force changePace(true) at join`
**Type:** defect · **Priority:** high · **Complexity:** medium

### Problem statement / failure context (`description`)
> A rider can be completely invisible to the fleet for a whole ride while their own map looks perfect. FIELD-OBSERVED 2026-07-19 (staging ride f51f7add 'Mango', S23/SM-S911W, build 53d8639, ~21 min): the Transistorsoft engine produced ZERO gps_ping / motion_change / activitychange / breadcrumb the entire ride. The on-device TS native log shows: start() fired a SingleLocationRequest at 12:39:31, the phone was LOCKED ~4s later (onDestroy x4 at 12:39:32-34), and the engine NEVER left stationary — no motionchange, no activitychange, no onLocation — even after the mid-ride unlock at 12:56. The OS blue dot (showsUserLocation) kept showing position, MASKING the dead engine. Ride 2 minutes later on the same phone worked fully (89 fixes, 82-pt breadcrumb) because it was kept foreground a few seconds and caught the motion transition.

### Root cause (`why` field)
> ROOT CAUSE is documented by Transistorsoft's Philosophy of Operation: after start() the engine begins STATIONARY with location-services OFF, and only enters the moving/tracking state when (a) its Motion-Activity API detects movement or (b) the device exits a ~200m stationary geofence. If the app is suspended during that stationary warm-up (locked right after join), Activity-Recognition callbacks can't fire (app process suspended) and the geofence-exit is slow/throttled — so the engine never engages and the ride runs dark. TS EXPLICITLY recommends changePace(true) to force the moving state for 'start an activity' apps ('like a Jogging App'). Rail 3 IS that: joining a ride is an explicit activity-start. The app deliberately REMOVED changePace(true) in W261 ('let the SDK's motion detection decide', for battery) — which diverges from TS guidance for this app class and is the direct cause. Most dangerous failure mode: looks fine (OS dot), is actually dark.

### Decision text (`what` field)
> PRONG 1 (this fix, done on branch): call changePace(true) immediately after BG.start() in startBgGeo — force the moving state at ride join. It's a ONE-SHOT kick, NOT the W261 forced-streaming scaffold: no disableStopDetection, so the SDK's stopTimeout still returns to stationary (services off) when the rider is genuinely stopped — deterministic start + battery preserved when parked. PRONG 2 (follow-up, ties to D89/W277): re-assert the engine on RESUME — ride 1's mid-ride unlock did NOT recover it (resume currently restores the channel/receive but not the tracking engine/send), so a foreground return must also changePace/nudge the engine. PRONG 3: a SELF-HEALTH signal (rider + captain) because the OS blue dot masks a dead engine — no existing warning catches this. Ref: Transistorsoft Philosophy of Operation (wiki).

### Acceptance criteria (`acceptance_criteria`)
> 1) The tracking engine is deterministically ENGAGED at ride join (changePace(true) after start), so locking right after start can no longer strand a ride in stationary. 2) Battery preserved when genuinely parked (stopTimeout still returns to stationary; NO disableStopDetection). 3) A resume re-asserts the engine (prong 2). 4) A self-health signal surfaces a dead engine that the OS dot would otherwise mask (prong 3). 5) Validated on-device: the lock-immediately-after-start repro now tracks. Evidence: ride f51f7add (21 min, zero engine fixes) vs ride 2 (89 fixes); TS Philosophy of Operation. Feeds W277.

### Dates
- **Raised (inserted_at):** 2026-07-19T18:50:54 · **updated_at:** 2026-07-19T18:50:54
- **Decided:** [THIN: no distinct decision timestamp recorded]
- **Completed:** [THIN: `completed_at` not recorded — record not completed]

### Linked / superseding records
- Inline: prong 2 "ties to D89/W277"; acceptance "Feeds W277"; W261 named as the direct cause (the removal of `changePace`). Superseded by **D91** ("SUPERSEDES the D86–D90 changePace cluster").
- [THIN: `dependencies` empty; no `parent_id`]

### Current status in Stride
- **status:** `in_progress` · **column_id:** 298
- **Review:** [THIN: review-stamp fields all not recorded]

---

## D91 — id 5385

**Title:** `Rail 3: app tears down its own GPS engine ~1s after ride start (thresholds dep) — the REAL captain-not-tracked root cause`
**Type:** defect · **Priority:** high · **Complexity:** medium

### Problem statement / failure context + decision (recorded inline in `description`; dedicated `what`, `why` fields are `null` — [THIN: `what` and `why` not recorded])
> ROOT CAUSE (native TSLocationManager log + code trace + field-validated): the GPS engine start/stop effect (useFleetPositions) had `thresholds` in its deps. `thresholds` = ride?.thresholds — an unmemoized fresh object built in useRideDetails when the ride row resolves (~1s after start). That reference change re-ran the effect; cleanup's void stopBgGeo() + body's void startBgGeo() are unawaited, unordered native-bridge calls, and Battery Saver biased the captain's native scheduling so stop() landed after start() -> enabled:false, never restarted. changePace(true) (D86/D88/D89/D90) is a no-op on a disabled engine — which is why the whole cluster failed. Battery Saver was a RED HERRING; the app switched its own engine off ~1s after start.
>
> FIX (commits df2a342): decouple the engine lifecycle from threshold DATA — thresholds + SenderStateTracker moved to refs; engine effect deps = [backgroundReady, rideId, myRiderId] only; a separate effect rebuilds the tracker on [thresholds] without restarting the engine.
>
> VALIDATED on-device 2026-07-19/20 (ride 260d2131, update f42d9611fc8e): captain tracked CONTINUOUSLY ~30 min vs the old 3-pings-then-dead. Independent task-reviewer APPROVED (correct + complete, no regression, tsc clean). Supersedes D86-D90 (wrong problem). Residual (separate): a Saver-at-start startup delay (~3-4 min) that self-recovers.

### Dates
- **Raised (inserted_at):** 2026-07-20T01:07:20
- **Decided / validated:** description records "VALIDATED on-device 2026-07-19/20"; `updated_at` 2026-07-21T22:50:07
- **Completed (completed_at):** 2026-07-21T22:50:07Z

### Linked / superseding records
- **Supersedes D86, D88, D89, D90** ("Supersedes D86-D90 (wrong problem)").
- **Residual, separate:** a Saver-at-start startup delay (~3–4 min) that self-recovers (no identifier).
- [THIN: `dependencies` empty; no `parent_id`]

### Current status in Stride
- **status:** `completed` · **column_id:** 299
- **Review:** structured `review_status`/`reviewed_at`/`reviewed_by_id` **not recorded (null)** — BUT the `description` states: "Independent task-reviewer APPROVED (correct + complete, no regression, tsc clean)." [THIN: the review verdict is narrated in free-text, not captured in the structured review fields.]

---

## G33 — id 5381 (type: goal)

**Title:** `Rail 3 — mobile architecture review & state-engine optimization`
**Priority:** medium · **Complexity:** small · **parent_id:** none

### Description (verbatim)
> G33 — Rail 3 Holistic Architecture Assessment
> Umbrella goal: Step back from thin-slice, one-defect-at-a-time development and holistically assess whether the Rail 3 mobile app — a large, detailed state engine (identity, tracking-engine lifecycle, power/OEM throttle, channel/resume, fleet add/grey/remove, departures) — is optimized end-to-end for the real use cases. G33 houses the architecture survey (W277) and, once enshrined by the Brain, any refactor/consolidation work it produces.
> First task (W277): Architecture & State Machine Survey. Using the TS documentation and the Brain-authored comprehensive BDD scenarios as the evidence base, produce two artifacts:
>
> Current State Overview — the state engine as it actually is today, including where implementation has drifted from or extended the committed Specs.
> Recommendations for Brain Session — proposed consolidations and refactors, each stating the problem it solves, the states/detectors it touches, and its Bedrock impact (affected Pillar II sections and BDD scenarios). Candidate example: unifying the three re-engagement detectors (D86 Saver-off, D88 movement heartbeat, D89 resume-poll, plus OEM-suspend) into a single resume-driven engine-liveness re-assert.
>
> Inputs: TS documentation; Vechelon Rail 3 state machine survey scope; comprehensive BDD scenarios describing the expectations. The BDD set is authored by the Brain from committed intent (Charter use cases, Specs, Ledger decisions) — not derived from the implementation — and is a survey input artifact, not a Pillar III commit. Load-bearing scenarios may be enshrined into Pillar III via MACD after the Brain session.
> Boundary: W277 ends at the recommendations document. It is an assessment, not a build mandate — recommendations are proposals for a Strategic Re-engagement session, not tickets. No refactor or consolidation work is ticketed under G33 until the Brain reviews, decides, and returns updated Pillars via MACD. G33 remains open — holding only W277 — until that return. Items the Brain declines or defers are logged in the Ledger and do not enter G33.

### Dates
- **Raised (inserted_at):** 2026-07-19T14:58:43 · **updated_at:** 2026-07-19T19:49:42
- **Completed:** [THIN: `completed_at` not recorded — goal open]

### Structure / linked records
- **Children:** W277 (id 5380, parent_id 5381); D89 (id 5379) also carries parent_id 5381. [Note: the description states G33 holds "only W277" until the Brain returns, yet D89's `parent_id` also points at G33 — transcribed as-is, an apparent inconsistency, not reconciled.]
- Inline references: W277, D86, D88, D89, Pillar II, Pillar III, the Ledger, MACD.
- [THIN: `dependencies` empty; `acceptance_criteria` / `what` / `why` not recorded]

### Current status in Stride
- **status:** `open` · **column_id:** 296 · **Review:** [THIN: review-stamp fields all not recorded]

---

## W277 — id 5380 (type: work)

**Title:** `Rail 3 — full-app architecture survey: is the state engine optimized end-to-end for our use cases?`
**Priority:** medium · **Complexity:** large · **parent_id:** 5381 (G33)

### Description (verbatim)
> The Rail 3 mobile app has become a complex, detailed STATE ENGINE — identity binding, the Transistorsoft tracking-engine lifecycle (moving/stationary/dormant), Battery-Saver + OEM throttle/suspend, channel subscribe/drop + resume, the fleet render lifecycle (add / grey / remove), and departures — but it has been built as THIN SLICES, one defect at a time. Step back and run a holistic architecture survey to determine whether the app is actually optimized end-to-end for the real use cases, versus locally patched per slice. This is an ASSESSMENT + recommendation deliverable, not a blind refactor — several consolidations it surfaces will be strategic (Rail 3 integration Bedrock territory) and route back through the Brain.
>
> NOTE (added 2026-07-19): First task under goal G33. Flagship consolidation to assess = a unified resume-driven engine-liveness re-assert subsuming D86 (Saver-off), D88 (movement heartbeat), D89 (resume-poll), and the OEM-suspend case into ONE idempotent 'on resume, nudge if the engine isn't healthy' hook — D89 is intended to lay its first brick, not add a 4th detector. Cross-cutting concerns to weigh: aggregate over-nudging battery cost (multiple triggers keeping GPS warm despite distanceFilter), and identity/ride-scoping (D77 — re-engagement is downstream of identity).

### Root cause / rationale (`why` field)
> Thin-slice development has produced overlapping, per-cause mechanisms that likely want to be unified — the clearest example: THREE separate engine re-engagement detectors (D86 Battery-Saver-off nudge, D88 movement heartbeat self-check, and the still-open OEM-suspend case) that all end in changePace(true) and all really want to be ONE resume-driven engine-liveness re-assert. Each was built fragile in isolation (see D89: D86's edge-listener misses the backgrounded toggle). Without a whole-system view we keep adding special-case detectors and phantoms instead of a coherent state model. A survey now, before more slices pile on, is cheaper than untangling later.

### Acceptance criteria (`acceptance_criteria`)
> Deliverable = an architecture assessment document that: (1) maps the full Rail 3 state engine (states/signals/triggers) in one place; (2) catalogs redundancy/gaps/fragility with the unified resume-driven engine-liveness re-assert (D86+D88+OEM) as the flagship example; (3) assesses fit against the real use cases; (4) gives a prioritized recommendation clearly separating tactical refactors from strategic/Bedrock decisions that route through the Brain. NOT an implementation — this ticket produces the survey; refactors are follow-on work.

### Key files (as recorded)
- `mobile/src/lib/bgGeo.ts` — "Tracking-engine lifecycle: moving/stationary, heartbeat self-check (D88), nudge (D86). Core of the engine state machine."
- `mobile/src/hooks/useFleetPositions.ts` — "Fleet render lifecycle (pings ∪ lastKnown ∩ roster; add/grey/remove), send loop, departures (D87), Saver watcher wiring."
- `mobile/src/hooks/useResume.ts` — "W269 resume signal — the reliable foreground event that a unified liveness re-assert would hang off."
- `mobile/src/lib/batteryGuards.ts` — "Battery-Saver + OEM advisories and the D86 clear-watcher — one of the re-engagement detectors to consolidate."
- `mobile/src/auth/AuthContext.tsx` — "Identity binding (D77) + sign-out departure. Identity is the substrate every other state stands on."
- `mobile/src/hooks/useRideChannel.ts` — "Channel subscribe/drop/recover — the receive-side state machine, interacts with resume + staleness."

### Verification steps (survey deliverable outline, as recorded)
1. "Enumerate the app's states, signals, and triggers across identity, engine (moving/stationary/dormant), power (Saver/OEM), lifecycle (foreground/background/resume), channel (subscribe/drop/recover), and fleet render (add/grey/remove/depart)." → *A single map of the whole state engine.*
2. "Identify redundancy, gaps, and fragility — e.g. the three re-engagement detectors (D86/D88/OEM), the additive-fleet + departure + greying interplay, edge-detectors that should be resume-polls." → *A list of consolidation opportunities and fragile seams.*
3. "Assess whether the architecture is optimized for the actual use cases (cycling fleet, pocketed phones, aggressive OEMs, account swaps, regroups) vs incidental to how slices landed." → *A use-case-vs-architecture fit assessment.*
4. "Produce a prioritized recommendation: what to unify/refactor now, what to hold for Brain/strategic ratification, what to leave." → *An architecture assessment doc with a prioritized, strategically-flagged roadmap.*

### Dates
- **Raised (inserted_at):** 2026-07-19T14:53:35 · **updated_at:** 2026-07-19T15:12:49
- **Completed:** [THIN: `completed_at` not recorded — task open]

### Linked records
- **Parent:** G33 (5381). Inline references: D86, D88, D89, D87, D77, W269, Pillar II, Pillar III, the Brain / MACD.
- [THIN: `dependencies` empty; `what` field not recorded]

### Current status in Stride
- **status:** `open` · **column_id:** 296 · **Review:** [THIN: review-stamp fields all not recorded]

---

## Git-history corroboration (analysis, NOT part of the verbatim Stride transcription)

Checked across all branches on 2026-07-27. Separated from the transcriptions above because it is derived from git, not from the Stride records.

### Fix commits (identifier → commit)
| Defect | Fix commit | Subject | Self-declared state at commit |
|--------|-----------|---------|-------------------------------|
| D72 | `1b4b995` (branch `d-rail3-channel-reconnect`, merged into `rail3-integration`) | `fix(rail3): auto-recover ride channel from CHANNEL_ERROR / token expiry` | — (no `[D72]` subject; referenced as "the 2026-07-05 dead-socket case (D72)" in `7fe827d` [D85 pt1]) |
| D86 | `d5fdf82` | `fix(rail3): re-engage the tracking engine when Battery Saver is turned off mid-ride [D86]` | "CODED, not yet built/validated" |
| D88 | `9b85a5d` | `feat(rail3): heartbeat engine self-check — re-engage tracking on detected movement [D88]` | "CODED, not yet built/validated" |
| D89 | `10c1408` | `fix(rail3): unified resume-driven engine re-assert [D89 + D90 prong 2]` | "tsc clean" (no validation claimed) |
| D90 | `10c1408` (prong 2); prong 1 lineage in `d5fdf82`-era work | (folded into the D89 unified re-assert commit) | — |
| D91 | `df2a342` | `fix(rail3): stop tearing down the GPS engine ~1s after ride start [D91]` | "CODED … NOT yet field-validated" at commit; Stride record later records on-device validation + reviewer approval |

### Findings
1. **Review question — git agrees with the null Stride stamp.** Every fix commit is authored by Neil Stryjski with the sole trailer `Co-Authored-By: Claude Opus 4.8`. No `Reviewed-by:` / approver trailer on any of them. The one review that is documented (D91's "Independent task-reviewer APPROVED") lives only in the Stride description prose, not in a structured field or a git trailer.
2. **None are on `master`.** `merge-base` confirms `d5fdf82`, `9b85a5d`, `10c1408`, `df2a342` are all NOT ancestors of `origin/master`; they live only on `rail3-integration` (D72's fix on `d-rail3-channel-reconnect`, merged into `rail3-integration`). Consistent with the Rail-3-held-off-master strategy — no scenario here traces to shipped-to-prod code.
3. **Supersession the Stride records under-state.** Commit `df2a342` [D91] and `mobile/log_of_changes.md` (2026-07-19) state, verbatim: "SUPERSEDES the D86–D90 `changePace` cluster: they treated a non-existent 'Saver throttles the engine' problem. … Every `changePace(true)` nudge (D86/D88/D89/D90) was a no-op on the disabled engine — zero native trace — which is why the whole cluster failed in the field." And: "Once D91 is validated, the nudges (and their resume-churn battery cost) should be re-evaluated/removed."

---

## Provenance map for the BDD author

```
G33 (goal, open) — Rail 3 Holistic Architecture Assessment
 └─ W277 (work, open) — the survey that CONSUMES the Brain's BDD set
       consolidation-in-scope: unify the re-engagement detectors →
         ├─ D86 (Saver-off nudge)        completed  · mechanism SUPERSEDED by D91
         ├─ D88 (movement heartbeat)     in_progress · mechanism SUPERSEDED by D91
         ├─ D89 (resume-poll)            in_progress · replaces D86 detector; SUPERSEDED by D91 · parent → G33
         ├─ D90 (changePace at join)     in_progress · SUPERSEDED by D91
         └─ (OEM-suspend case)           folded into the unified re-assert
   ── D91 (thresholds-dep teardown)      completed · field-validated · REVIEWED (prose) · the REAL root cause
   ── D72 (channel receive dies)         completed · SEPARATE class (receive-side, not engine lifecycle)
```

### Carry into authoring
1. **W277 and G33 both frame the domain around the "three re-engagement detectors → unify them" thesis (D86/D88/D89 + OEM).** That framing predates D91. D91 (2026-07-20/21, field-validated, reviewed) concluded the whole `changePace` cluster chased the wrong cause — the engine was being torn down by an unmemoized `thresholds` dep, so the nudges were no-ops. The survey's flagship example may itself be partly obsolete; scenarios should encode D91's root cause as current truth and treat detector-unification as the documented journey, not the destination. Surface this to the Brain explicitly.
2. **The BDD set's own provenance rule (from G33):** it is "authored by the Brain from committed intent (Charter use cases, Specs, Ledger decisions) — not derived from the implementation" and is "a survey input artifact, not a Pillar III commit" until MACD enshrinement. Scenarios should trace to Charter/Spec/Ledger intent; these D-records are evidence of failure modes, not the source of expected behavior.
3. **D72 is a separate failure class** (realtime receive channel dying on token expiry / background drop) — orthogonal to the send-side engine-lifecycle cluster; belongs in its own scenario group.
4. **One residual, unticketed:** D91 notes a "Saver-at-start startup delay (~3–4 min) that self-recovers" — a known-remaining behavior with no identifier yet. Flag as a candidate scenario/ticket rather than assuming it's covered.
