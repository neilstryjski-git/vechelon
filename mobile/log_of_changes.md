# Rail 3 Mobile — Log of Changes (LLD decisions)

## 2026-07-30 — W277 Architecture & state-machine survey (assessment only — ZERO code changed)

- SCOPE: survey task under G33. Two artifacts delivered to
  `productdocuments/rail 3 integration back to hands/`: `w277_artifact1_current_state.md`
  (six-domain state model + drift + SC-1–8 + integration surface) and
  `w277_artifact2_recommendations.md` (proposals for the Strategic Re-engagement session).
  Baseline surveyed: `rail3-integration` @ 2e422f8. No source file was modified — the dead
  detector code found below was deliberately LEFT IN PLACE per the brief's Edit Authority.
- CHANGE REQUEST applied first (Senior PM-approved 2026-07-27): G33 description candidate-example
  sentence replaced with the D91 engine-lifecycle consolidation; W277 `why` APPENDED (not rewritten)
  with the D91-supersedes-D86–D90 note.
- HEADLINE: the consolidation W277 was chartered to PROPOSE is already BUILT. D86's Saver-off
  listener was deleted, D89 + D90 prong 2 are one idempotent resume-nudge
  (`useFleetPositions.ts:330-348`), and D90 prong 1 is MERGED at `bgGeo.ts:261-265` — not "coded on
  branch" as the BDD inventory states. SC-6's dead-detector class is therefore NOT the D86–D90
  cluster; the real dead code is `watchBatterySaverOnScreenLock` (`batteryGuards.ts:77-85`, zero
  callers), whose absence ALSO silently drops committed behaviour (Pillar II §2 + committed R3-06).
- ENGINE VERDICT: healthy. D91 correctly implemented (deps `[backgroundReady, rideId, myRiderId]`).
  What is missing is the lifecycle AROUND the engine — BDD Layer 3 is entirely absent (no native
  heartbeat/headless, no autoSync, no server staleness, no FCM wake), so against OEM suspension of a
  HEALTHY engine there is still no mechanism and no surface reports the failure (R3-48 invariant
  does not hold).
- STOP POSTURE (R3-50, documented not selected): the build runs the stopTimeout-stationary posture —
  stop detection ACTIVE, `stopTimeout` never set so the vendor default 5 min governs
  (`node_modules/react-native-background-geolocation/src/declarations/interfaces/Config.d.ts:81`).
  Noted that this 5 min and the fleet-view Inactive default 5 min coincide by ACCIDENT, not design.
- DRIFT (f) REFUTED: there is no Leave Ride action. Departure is an implicit side effect of
  navigating off the map (`RideMapScreen.tsx:288-294`). The behaviour is implemented; the
  first-class action the finding describes is not.
- DRIFT (e) CORRECTED: guests are `ride_participants` rows (`account_id NULL`, `role='guest'`), not a
  separate entity; the map excludes them by a null-check, the ROSTER PAGE renders them by design
  (`RosterScreen.tsx:21-25`). Senior PM ruled 2026-07-30 that the PoC is not guest-exposed and the
  observed rows were captain-seeded test data — recorded as such. Structural note retained because
  Pillar II §1 (no guests in PoC) and §4.1/§4.2 ("Rider / Guest Rider", identical capability)
  contradict each other; that conflict is Brain territory (A1).
- LIFECYCLE GAP (largest non-engine finding): neither the auto-close nor the Hard Purge edge function
  is SCHEDULED — no pg_cron, no cron.schedule, no config.toml entry. The purge also touches NO Rail 3
  table, so `rail3_breadcrumb` retains the full leader route as JSONB indefinitely. R3-36 fails and
  V-008 would fail today.
- Two authorization defects found incidentally and filed separately with Senior PM approval:
  D93 (`participant_update_policy` has no WITH CHECK → a rider can self-promote to captain) and
  D94 (rail3 Broadcast authz is tenant-scoped, not ride-scoped → any tenant member can receive any
  ride's live GPS). Both are on shared Rails 1 & 2 schema that is LIVE ON PRODUCTION. Not fixed here.

## 2026-07-19 — D91 Engine torn down ~1s after ride start (the REAL root cause; supersedes D86–D90)

- THE FINDING (native TSLocationManager log, captain phone, Cinnamon ride): the engine started
  cleanly (requestLocationUpdates OK, Location-services ON, 3 fixes at 17:46:08.840), then the APP
  disabled it at 17:46:09.100 (`enabledchange` → Location-services OFF); it stayed `enabled:false`
  the whole ride. Battery Saver was a RED HERRING — the engine was switched OFF ~18 min BEFORE Saver
  was turned off, and the native engine never even saw the Saver-off (it had unsubscribed from
  powersave in the same teardown). Every `changePace(true)` nudge (D86/D88/D89/D90) was a no-op on
  the disabled engine — zero native trace — which is why the whole cluster failed in the field.
- ROOT CAUSE: the engine start/stop effect (`useFleetPositions`) had `thresholds` in its deps.
  `thresholds` = `ride?.thresholds` (RideMapScreen), an UNMEMOIZED fresh object built in
  `useRideDetails` when the ride DB read resolves (~1s after start). That reference change re-ran the
  effect: cleanup `void stopBgGeo()` + body `void startBgGeo()`, both UNAWAITED native-bridge calls,
  unordered. Battery Saver biased the captain's native scheduling so the `stop()` landed after the
  `start()` → `enabled:false`, no restart. Rider (Saver off) drained FIFO → survived. Confirmed
  end-to-end: native log + code trace (RideMapScreen.tsx:87 → useRideDetails.ts:119 → deps :548).
- FIX: decouple the engine lifecycle from threshold DATA. `thresholds` + the `SenderStateTracker`
  now live in refs; the engine effect deps are `[backgroundReady, rideId, myRiderId]` ONLY, so a
  tenant-thresholds update can never tear down the FGS. A separate effect rebuilds the tracker on
  `[thresholds]` (preserving the old "fresh tracker per thresholds" behavior) WITHOUT restarting it.
- SUPERSEDES the D86–D90 `changePace` cluster: they treated a non-existent "Saver throttles the
  engine" problem. Once D91 is validated, the nudges (and their resume-churn battery cost) should be
  re-evaluated/removed — a disabled engine can't be nudged, a healthy one doesn't need it. Left in
  place for now (idempotent no-ops on a healthy engine).
- STATUS: coded, tsc clean (deepLinkAuth only). NOT yet validated — needs a build + the same
  Saver-on walk; pass criterion = the captain produces CONTINUOUS gps_ping through the ride.

## 2026-07-18 — D83 Ad Hoc creation swallowed a failed captain self-RSVP (Lane B)

- ROOT CAUSE: `AdHocCreator.tsx` inserted the ride row FIRST, then self-RSVP'd the creator as
  `role='captain'` fire-and-forget — `if (partErr) console.warn(...)` and navigated on regardless. A
  failed self-RSVP left the ride ACTIVE with its own captain missing from `ride_participants`, which
  breaks the breadcrumb write RLS (`is_rail3_ride_captain`), the leader election, and §4.1 visibility.
- FIX (client-only): retry the self-RSVP up to 3× with short backoff; treat a duplicate (`23505` /
  "duplicate|unique") as success since the captain row is already present; on persistent failure
  DELETE the just-created ride (roll back the orphan) and throw so the existing catch surfaces the
  error and stays on the creator — never navigate into a captain-less ride. Atomic create+RSVP would
  need a server RPC (Lane A / bigger change); this client fix removes the silent-swallow and the
  orphan-active-ride without new schema.
- tsc clean (deepLinkAuth.ts only). Branch `d86-battery-saver-engine-start` (stacked with D86); rides
  the same batched EAS build + field session.

## 2026-07-18 — D86 Battery Saver at engine start leaves motion detection dead all ride (Lane B)

- ROOT CAUSE (proven in code; field-confirmed 2026-07-16 morning ride 06abdab3): the W177/D63
  Battery-Saver advisory fires AFTER `startBgGeo` — `useFleetPositions()` at RideMapScreen.tsx:81
  registers its engine effect before the join effect at :210-212 that calls
  `promptIfBatterySaverOn('join')`. So the Transistorsoft engine boots UNDER Saver, which throttles
  the native motion-activity API it relies on (W261). And `startBgGeo` is idempotent (`configured`
  flag), so complying with the advisory (Neil turned Saver off ~6s later) re-inits NOTHING. Result:
  captain emitted 2 `gps_ping` in 2h19m, `isMoving` never went true, invisible to the fleet — while
  his own OS-seeded self-view looked fine. Same handset logged 232 pings that evening (Saver off).
- FIX targets root cause #2 (compliance re-inits nothing), which makes #1 (ordering) moot: re-engage
  the engine when Saver is turned OFF mid-ride.
  - `bgGeo.ts`: new `nudgeBgGeo()` — one-shot `BG.changePace(true)` to kick the engine out of its
    dormant state; NOT a latched force (would regress W261's un-force). No-op if `!configured`;
    try/catch, never throws.
  - `batteryGuards.ts`: new `watchBatterySaverCleared(onCleared)` — fires on a true Saver ON→OFF edge
    via expo-battery `addLowPowerModeListener` (catches the in-foreground toggle, THE field case) with
    an AppState `'active'` backstop for a backgrounded toggle. Android-only; returns an unsubscribe.
  - `useFleetPositions.ts`: subscribe in the `startBgGeo` effect; on cleared → `nudgeBgGeo()` + log a
    `'bg_nudge'` measurement so the field session can confirm the fix fired and correlate with pings.
  - `measure.ts`: added `'bg_nudge'` to `MeasureKind`.
- EMPIRICAL ASSUMPTION: that `changePace(true)` fully revives a Saver-throttled engine — additive and
  strictly better than the dead state; validated by the batched D86 field session (which doubles as
  the cheap Saver-ON walk test). Status: CODED, not built/validated.
- tsc clean (only pre-existing deepLinkAuth.ts errors). APIs confirmed: expo-battery
  `addLowPowerModeListener`; `BG.changePace` typechecks. Branch `d86-battery-saver-engine-start` off
  field tip `d85-ride-lifecycle` (7ccaa3a). Rides one batched EAS build + field session with D83.

## 2026-07-06 — W261 un-force tracking + last-position-on-stop (G32)

- CONTEXT: under the "for the trial" forced-streaming scaffold (`disableStopDetection:true` +
  `changePace(true)` + `distanceFilter:0` @ 5s), W261 was INERT — a rider never went stationary,
  so there was no stop transition to persist and no quieting. This un-forces, which is the
  prerequisite that makes W261 meaningful. Ships via OTA (JS/config only, no native, no migration).
- bgGeo.ts (un-force): removed `disableStopDetection:true` and `changePace(true)`; `distanceFilter
  0→40` (DISTANCE-based cadence, speed-adaptive; ~40m is a STARTING point to tune on a real ride via
  OTA — NOT the SDK default 10m ≈ 1s at bike speed). Kept `disableElasticity:true` so 40m is a
  literal, predictable filter (elasticity would COARSEN at speed — the opposite of intent). Added
  `onMotionChange` plumbing (swappable `currentMotionHandler`, bound once alongside onLocation;
  cleared in stopBgGeo) exposing the moving↔stationary transition + the stop `location`.
- useFleetPositions.ts (W261 write): on `onMotionChange(isMoving:false)` send ONE 'stopped' broadcast
  at the stop position (fleet sees the stop immediately, not via Dark-staleness) AND persist
  last_lat/last_long/last_ping to the rider's OWN ride_participants row. Pillar II §2 — last-known at
  a MEANINGFUL EVENT, not a per-ping trail. RLS: `participant_update_policy` already allows
  `account_id = auth.uid()` → PURE CLIENT WRITE, no migration (ticket text overstated a new policy).
  SCOPED to `account_id = my uid` EXPLICITLY — the policy also lets a captain update anyone, so an
  unscoped update from a captain would clobber the whole fleet's last position. Both events land in
  the sink (`motion_change`, `last_position_write`) so a silent failure surfaces as data.
- measure.ts: added `motion_change` + `last_position_write` to MeasureKind.
- DEFERRED (noted, not built): keying SenderStateTracker off isMoving + deleting the MOVE_EPSILON_M
  distance heuristic. Under un-force the tracker's distance path is INERT (a stopped rider stops
  feeding it samples), so removing it now would churn tested code (riderState.test.mjs 8/8) for zero
  functional gain — cleaner as a fast-follow. Consequence for now: a stopped rider shows 'stopped'
  then decays to Dark on staleness, skipping the sender-side 'inactive' middle state (acceptable;
  receiver-side 'inactive' derivation is the deferred refinement).
- VALIDATION: MUST be on a BIKE incl. a slow seated climb (a walk is a bad proxy). THE risk to watch:
  the SDK false-judging a slow climber as stationary → a spurious 'stopped' + drop from the live
  fleet — exactly what the forced scaffold used to mask. stopTimeout (~5min default) governs
  stopped-latency and is the first knob to tune. Pairs with W262 (fetch-on-focus render) as the
  consumer of the persisted last-known.
- VERIFIED: tsc clean on all touched files (only the pre-existing deepLinkAuth ×2 remain);
  riderState.test.mjs 8/8. Pre-existing test failures unrelated (rlsIsolation needs creds;
  rideControlsLogic date-locale) — confirmed identical on the branch point.
- Reviewer (stride:task-reviewer): APPROVED, 0 issues (critical/important/minor). Verified the
  self-scoped participant write (no captain-clobber), D69 lazy-thenable avoided (awaited IIFE),
  one-per-stop privacy posture, valid 'stopped' payload, and once-bound motion-handler cleanup.

## 2026-07-06 — W262 fetch-on-focus render of stopped riders + live-supersedes (G32)

- CONSUMER of W261: a rider who STOPS goes quiet under the un-force (no more live pings), and
  on a focus-reconnect the receiver's `pings` map is cleared — so a stopped rider would simply
  DROP off the map. W262 renders them at their persisted last-known position instead.
- useFleetPositions.ts: new `lastKnown` state (Record<account_id,{lat,lng,ts}>) fetched from
  ride_participants(last_lat/last_long/last_ping) on OPEN and on every AppState→active. §4.1
  gated SERVER-SIDE by participant_tactical_select (the same policy the roster read uses — RLS
  returns only visible rows; same RP-16 affiliated-tenant breadth caveat noted on the roster).
  Fetch is at a meaningful event, never per-ping (Pillar II §2).
- FLEET MERGE rewritten from "iterate pings" to "iterate pings ∪ lastKnown, joined to roster."
  PRECEDENCE (the documented bug-that-bites): per rider, render the MORE RECENT of live-ping vs
  last-known — both are the SAME sender's clock (p.ts / last_ping both stamped Date.now() on
  that device), so directly comparable. `live && (!lk || live.ts >= lk.ts)` → live wins the
  instant it's fresher (no freeze at a rest stop after a rider rolls again); else last-known
  renders as 'stopped', greying to Dark on staleness. Moving riders render EXACTLY as before
  (fresh pings, no/older last-known) — existing behavior preserved. onUnknownRider fires ONLY
  for a live ping from an unrostered rider (mid-ride joiner), not for an RLS-hidden last-known.
- Keys align across all three sources (pings, roster, lastKnown ALL keyed by account_id;
  confirmed roster/useFleetPositions), so precedence matching is exact — the W261 write keyed
  by account_id was deliberately consistent with this.
- SCOPE NOTE: precedence merge kept INLINE (not extracted to a unit-tested pure fn) — the fleet
  loop was never unit-tested (hooks need RN test infra this repo lacks; tests are pure-logic
  node --test), and breaking the type import-cycle to extract it is disproportionate for a
  bike-validated PoC surface. Verified by review + on-device instead.
- VERIFIED: tsc clean on useFleetPositions (only pre-existing deepLinkAuth ×2); riderState 8/8 +
  mapLogic 11/11. Ships via OTA with the G32 chain (JS only, no migration). Validate on the same
  bike ride as W261/D73: stop a rider, background+refocus the SAG phone, confirm the stopped
  rider renders at their last spot and SNAPS to live the moment they roll again.

## 2026-06-27 — W234 breadcrumb → 4h-purged anchor-route TABLE (replaces the W233 window)

- DECISION (Sr PM): the table is the cleaner DESTINATION, not a fallback — complete route on
  every device, full course on a late open (hours-in), no tail/jump/divergence, and it's
  SIMPLER than the W233 seq-merge. Relaxes the no-server-coords posture under C1 (4h purge);
  the captain's route is ANONYMIZED (table keyed by ride_id, NO person-id). Live privacy
  policy updated to disclose it.
- SENDER (useFleetPositions): the captain accumulates its decimated route (`appendTrailPoint`,
  capped 1500) and UPSERTS it to `rail3_breadcrumb` on a ~60s throttle (BREADCRUMB_UPSERT_
  INTERVAL_MS). Route accumulated on EVERY device (so the captain's origin is caught from fix
  #1, pre-roster), upsert gated to captain via rosterRef. Broadcast reverted to a SINGLE point
  (no trail/trailBaseSeq) — the table carries history, not the broadcast. updated_at set every
  upsert so the 4h purge tracks LAST activity.
- RECEIVER (useBreadcrumb): FETCH the captain's full route from the table on mount + on
  AppState 'active' (resume) — one read restores the whole route after any absence; adopt only
  if `path.length >= current` (no truncation of a fresher live tail). Live single-point appends
  extend the tip between fetches. DELETED the W233 seq-merge/lastSeqRef/window + BREADCRUMB_
  WINDOW_POINTS.
- DB (live on staging xybgtbybdhxuwqjfcfkc): rail3_breadcrumb + RLS (read=participant,
  write=captain via SECURITY DEFINER helpers, no recursion) + role-matched GRANTs + pg_cron 4h
  purge. Migration reviewer-approved 0 issues; mobile reviewer-approved 0 crit/imp (3 minor
  comment/early-fix, applied). tsc clean (deepLinkAuth.ts only). Net -36 lines vs W233.
  Tomorrow's ride still runs the already-flashed transient W233; the table version is the next
  build.

## 2026-06-27 — W233 enhanced breadcrumb: lock-independent route via windowed broadcast-the-trail

- PROBLEM: the breadcrumb was reconstructed receiver-side from ephemeral broadcasts, so a rider
  locked for a stretch permanently lost that segment (straight line on unlock).
- APPROACH (Sr PM, transient/no-table; #1 late-joiner-from-join OK, #2 only-recent-portion OK): the
  captain (breadcrumb leader) keeps a BOUNDED recent window of its own decimated trail
  (`BREADCRUMB_WINDOW_POINTS=250` ≈ ~8KB, NOT the ~50KB full history — the perf knob) + a monotonic
  `trailSeq`, and attaches `{trail, trailBaseSeq}` to each broadcast. Receiver merges by seq: appends
  only points newer than `lastSeqRef`; a lock WITHIN the window bridges the gap, a lock LONGER than the
  window takes a single jump (accepted). Late joiner adopts the recent window.
- New `lib/breadcrumbTrail.ts` (shared decimation/cap + window const, extracted from useBreadcrumb).
  `useFleetPositions.ts`: captain-gated window broadcast (role via `rosterRef`, NOT an effect dep — no
  FGS churn); window snapshotted (`.slice()`) into the async-serialized payload to avoid mid-flight
  mutation desync. `useBreadcrumb.ts`: seq-merge + legacy single-point fallback for older captains.
- PERF: ~6× lighter than full-trail; only the captain's broadcast grows (~8KB), riders unchanged.
  Window size is the UAT tuning knob. Reviewer-approved (0 crit/imp; 1 minor .slice() applied).
  tsc clean (deepLinkAuth.ts only). Live-location R1 unaffected (fleet handler ignores `trail`).

## 2026-06-14 — D57 + D60 end-ride fixes (fieldbuild batch, cont.)

**D60 — misleading "check your permissions" on an already-saved ride:**
- `screens/RideControls.tsx` `confirmEndRide`: split the conflated guard. A real
  write/RLS failure (`updErr`) shows the error; 0 rows with NO error means the ride
  was ALREADY saved (idempotent `.eq('status','active')` guard) → success, leave the
  map, no scary message. `generate-ride-summary` is now invoked ONLY when a row was
  actually closed (`closedNow`), not on an already-saved no-op.

**D57 — ending a ride didn't propagate to other devices:**
- `hooks/useRideChannel.ts`: new `RIDE_ENDED_EVENT` broadcast event.
- `screens/RideControls.tsx`: captain emits `RIDE_ENDED_EVENT` on the shared channel
  after ending (awaited, ack:true, best-effort) — needs the channel, passed as a new
  prop from RideMapScreen.
- `screens/RideMapScreen.tsx`: non-captains react two ways — (a) live, the captain's
  broadcast → Alert + `goBack()`; (b) fresh open of an already-saved ride
  (`ride.status !== 'active'`) → same leave-the-map path (broadcast is ephemeral, so
  a late joiner relies on status). Both gated on `myRole !== 'captain'` AND ride
  loaded (so we don't bind during the pre-load 'member' phase or double-fire); the
  captain navigates itself in `confirmEndRide`. `leftEndedRef` guards double-firing.

**Validation:** `tsc --noEmit` clean except the pre-existing `deepLinkAuth.ts`
ParsedURL errors. Field-test blockers cleared — the end-ride lifecycle
(DoD-07 / R3-35 / V-008) is now exercisable on-device.


Low-level design decisions for the Rail 3 mobile app, recorded per the Product Trio
Hands/Tech-Lead convention. One entry per material decision.

## W178 — Tenant theming: custom React Context (not react-native-paper) — S0-008

**Decision:** Implement `ThemeProvider` as a custom React Context + `useTheme()` hook
(`mobile/src/theme/ThemeProvider.tsx`), rather than adopting `react-native-paper`'s
`PaperProvider`/`MD3Theme`.

**Why:**
- The app carries only three brand fields (`primary_color`, `accent_color`,
  `logo_url`) plus the club name. A full UI-kit theming system is dead weight for
  that surface area in a PoC.
- The screens already style with plain `StyleSheet`; Paper would mean either
  migrating components to Paper primitives or running two theming systems in
  parallel. Neither is justified.
- A Context + hook mirrors the web app's lightweight tenant-config fetch
  (`admin/src/pages/rider/AuthPage.tsx`) with **no new dependency**.

**Trade-off:** If Rail 3 later needs Material components (elevation, ripples,
themed inputs at scale), revisit Paper then. The `useTheme()` surface is small, so
swapping the provider implementation later is low-cost.

**Notes:**
- Brand columns are American spelling in the `tenants` table (`primary_color`,
  `accent_color`) — the W178 ticket text said `*_colour`; the table is the source
  of truth.
- Tenant resolved at runtime from `EXPO_PUBLIC_TENANT_SLUG` (env), never a
  hard-coded UUID. Anon can read `tenants` (`tenant_public_select_policy`), so
  branding loads pre-auth on the sign-in screen.

---

## 2026-06-14 — W194 hardening + D63 wiring + W195 identity hydration (fieldbuild batch)

Pre-build batch for the consolidated field APK. Three coordinated mobile-lane changes.

**W194 — background-GPS hardening (architecture validate-as-is; two fold-ins):**
- `lib/supabase.ts`: added `lock: processLock` to the auth client. The foreground
  app + headless FGS TaskManager task share one AsyncStorage session; a single-use
  refresh-token rotation racing across them is the prime suspect for a sender going
  Dark ~1h in. The lock re-loads the session from storage before each rotation.
  CAVEAT logged in-code: processLock is per-JS-context; the FGS task is a separate
  context, so this serializes WITHIN each context and leans on the AppState handoff
  to keep contexts from refreshing at once. Residual cross-context race = the #1
  thing the >60-min token-survival field test must watch.
- `hooks/useFleetPositions.ts`: AppState background handoff now gates start on
  `=== 'background'` (was the `else` branch of `!== 'active'`), and ignores the
  transient iOS `inactive` state, so control-centre / call / app-switcher flaps
  can't churn the foreground service.

**D63 — route background permission behind the W176/W177 flow (de-stages the inline shortcut):**
- Removed the inline `requestBackgroundPermissionsAsync` + AppState wiring from the
  publish effect (the staging-only shortcut flagged in the promotion checklist §5
  Part A #3). The publish effect now owns ONLY the foreground socket path.
- New `backgroundReady`-gated effect in `useFleetPositions` owns the AppState
  foreground↔background handoff.
- `screens/RideMapScreen.tsx`: mounts `<FirstRideExplainer>` (W176, self-gating);
  its `onDismiss` requests foreground→background location, fires W177
  `promptOemExclusionOnFirstJoin` + `watchBatterySaverOnScreenLock`, acquires the
  ride wakelock, and flips `backgroundReady` only on a background grant. Graceful
  denial (§5): background denied → foreground-only still tracks, handoff never wires.

**W195 — ride_participants identity hydration (Race Control shows real names):**
- New `lib/rideJoin.ts` `selfRsvpWithIdentity()`: reads `accounts.name`/`email`/`phone`
  (account_self_select RLS, id = auth.uid()) and inserts them as
  `ride_participants.display_name`/`email`/`phone`. `display_name = name ?? email` so
  the email fallback propagates to both the captain roster and web Race Control
  (read side keeps `?? 'Rider'` only for a fully-empty row). Best-effort. phone
  populated for captain contact-triage; who can READ it stays governed by the
  RP-16/D50 RLS fix (security lane).
- Wired into both self-RSVP sites: RideMapScreen (member self-enrol) + AdHocCreator
  (captain). NOT driven off the staging-only W191 auto-join, so it survives promotion.
- Schema note: `accounts` has NO `display_name` column — `name` is the source of
  truth (verified vs prod schema); the W195 ticket text said `display_name`.

**Validation:** `tsc --noEmit` clean except the pre-existing `deepLinkAuth.ts`
ParsedURL errors (identical on master/W188, non-gating — Metro/EAS don't run tsc).
Footprint: 4 edited + 1 new file, all under `mobile/`. No cross-lane touches.
Known minor UX nit for the field test: on a first-ever ride the OS foreground-perm
dialog can stack over the W176 modal (both permission paths fire) — grants still
resolve correctly; cosmetic ordering only.

---

## 2026-06-14 — D58 QR hidden for PoC (fieldbuild)

`buildRideJoinUrl` points at the PROD web host (`<slug>.vechelon.ca/ride/<id>`), which
404s on the staging field test. Decision 5 (Sr PM): test day uses in-app tap-to-join
(D54 + W191), so the QR is redundant. Hid the QR chip in `screens/RideMapScreen.tsx`
(commented; `qrOpen`/`FullScreenQR` left wired for easy restore) so no tester hits the
dead link. Real fix (QR → `rail3://ride/<id>` deep link + navigator route) deferred to
promotion — tracked as a W197 promotion-gate blocker. tsc clean.

---

## 2026-06-14 — W177 Battery-Saver prompt moved to JOIN (Sr PM feedback)

Sr PM: prompt at the moment the rider commits to a tracked ride (the "Start Workout"
convention), not reactively at screen-lock. `RideMapScreen.handleExplainerDismiss` now
calls `promptIfBatterySaverOn('join')`; removed the `watchBatterySaverOnScreenLock`
subscription (+ its unsub ref) — it fired on every backgrounding (spammy) and warned
late. OEM battery-exclusion + Battery-Saver advisories now both fire at join. tsc clean.

---

## 2026-06-14 — "Sleeping" (dormant) rider state (Sr PM request)

Distinguish an intentional background ("asleep", calm) from unexpected silence ("Dark",
concerning). Graceful-background only — an OEM kill can't signal, so it still derives Dark.

- `state/riderState.ts` + `lib/roleVisibility.ts`: add `dormant` to the tactical-state
  union. `deriveRenderState` treats `dormant` as STICKY — never escalates to Dark on
  staleness (the rider declared it); a later Active ping (reopen) clears it.
- `hooks/useFleetPositions.ts`: AppState handoff effect no longer gated on
  `backgroundReady`. On `=== 'background'`: if backgroundReady → start the FGS task
  (unchanged); else (foreground-only / bg denied) → fire ONE best-effort `dormant` ping
  with the last fix. `myCoordsRef` added for the last-known position.
- `components/RiderMarker.tsx`: `dormant` → calm violet (#8B5CF6), distinct from active
  green, Dark grey, SOS red, and the OS-blue self dot.

Sender tracker never emits `dormant` (movement-derived states only); it's injected on the
background transition. tsc clean; riderState + mapLogic tests pass.
**WEB FOLLOW-UP (separate Vercel deploy, no EAS cost):** admin Race Control's FleetMap
colours markers by a `stale` boolean only, and admin `TacticalState`/`deriveRenderState`
lack `dormant` — so web won't show Sleeping distinctly until ported.

---

## 2026-06-14 — Field-test fix: RiderBottomSheet contact message (D60-style)

gmail (captain) clicking rogers (member) showed "No contact available for your role" —
wrong: canSeePhone(captain, member) is true; the real cause was rogers had no phone on
file. Split the message (matches web Race Control): role allows but no data -> "No
contact on file"; role-denied -> "Contact hidden for this role". (Root data gap also
fixed: rogers' accounts/active-ride contact backfilled.) NOT rebuilt — batched for the
next consolidated field-test build. tsc clean.

---

## 2026-06-14 — Field-test UX: captain ride-list refetch on focus

End Ride persists fine (ride -> saved, actual_end set, other riders kicked via D57), but
the captain's HomeScreen only fetched active rides on mount / pull-to-refresh, so a
just-ended ride lingered as "active" until manual refresh. HomeScreen now uses
useFocusEffect -> loadRides() on every focus, so returning from an ended ride drops it
immediately. Decision: NO email on the mobile contact sheet (dial-only; emergencies are
calls, not emails) — RiderBottomSheet stays phone-only. Batched for the next build; tsc clean.

---

## 2026-06-14 — RS "78" app logo + square logo box

logo_url repointed (runtime, staging tenants row) to the RS "78" mark hosted in staging
Supabase storage (public bucket 'branding'/rs78.png, 475x475). SignInScreen styles.logo
220x56 -> 112x112 square so the square mark renders properly (resizeMode contain). PoC is
pinned to RS's square mark; adaptive sizing for wordmark tenants is a Rail 3a concern.
Batched for the next build; logo_url swap is live at runtime now (renders small on the
current wordmark-box build until this lands). tsc clean.

---

## 2026-06-14 — CORRECTION: RS78 is the APP LAUNCHER ICON, not the in-app logo

Earlier I mistakenly swapped the in-app sign-in logo to the 78 + squared its box. Sr PM
clarified: keep the WORDMARK in-app (liked); use the 78 to replace the generic Android
LAUNCHER icon. Reverted: tenants.logo_url -> wordmark (racer-sportif-logo.png, runtime,
live now); SignInScreen styles.logo -> 220x56. Set the app icon (build-time): app.json
icon + android.adaptiveIcon.foregroundImage = ./assets/rs78.png, backgroundColor #1A1A1A
(matches the dark disc; reads clean under any OEM icon mask). Asset: mobile/assets/rs78.png
(475x475 — works; 1024x1024 would be crisper, optional). Icon is baked into the APK ->
appears after the next build. (Unused RS78 left in staging storage 'branding' bucket; harmless.)
tsc clean.

---

## 2026-06-14 — RC1: Fit-all-riders (W201) + gps_ping instrumentation (W202)

**Fit-all (W201)** — Three Amigos passed + Sr PM ratified (Bedrock-neutral, not a Pillar
amendment). RideMapScreen: `fitAll` animates `mapRef.fitToCoordinates(coords,{edgePadding})`
(rides the D53 ref fix). Coords built from the role-gated `visible` set (NEVER raw `fleet` —
QA: a Rider's frame must only include Captain+SAG or the camera BOUNDS leak peer positions)
+ self (myCoords). 0 coords → button disabled; 1 coord → animateToRegion at START_ZOOM_DELTA
(avoids over-zoom). New 64dp button stacked above the Centre button (glyph ⛶). Role result:
Rider → leader+support+self; Captain/SAG → all riders+self.

**gps_ping (W202)** — PoC/staging-only sender-side send log (rides logMeasurement, already
staging-only). `useFleetPositions.publishSample` logs gps_ping{src:'fg'} per foreground send;
`backgroundLocation.ts` logs gps_ping{src:'bg'} per background send. Both the send and the
sink-write need a valid token, so a gap in gmail-authored gps_ping across the 5-min refreshes
pinpoints a token-refresh failure — makes the next walk's W194 token-survival check conclusive
(immune to flaky receivers; positions are broadcast-only with no DB row otherwise).

tsc clean (pre-existing deepLinkAuth only).

---

## 2026-06-14 — RC1: D56 follow-me (keep the dot in view)

RideMapScreen: replaced the D53 one-time auto-centre with a follow effect. `following`
(default on) re-centres on each new fix — street zoom (~25m) on the FIRST fix, preserving
the operator's current zoom after (read via regionRef so the effect doesn't re-run on every
camera move). A manual pan (MapView onPanDrag) disengages following; the Centre button
re-engages it (setFollowing(true)); fit-all (W201) disengages it so it can't yank back to
the dot after framing the fleet. tsc clean.

## RC2 — background-transmission fix + handoff instrumentation (2026-06-14)

Field walk on RC1 (build b244c3c5) proved, via the W202 gps_ping sink, that background
transmission never ran: 0 `bg` pings AND 0 `dormant` pings; the foreground stream froze
for up to ~5 min whenever the screen was locked (seq advancing only ~3 across a 298s gap =
JS engine suspended, not network loss). Controlled A/B: gmail (lock-screened) failed; rogers
(screen-on couch control) streamed fine — it was never backgrounded. Config was NOT the cause
(app.config.ts correctly layers expo-location with isAndroidBackgroundLocationEnabled +
isAndroidForegroundServiceEnabled). Failure is in the runtime handoff. Working hypothesis B:
Android 11+ never grants "Allow all the time" inline → backgroundReady stayed false → dormant
branch → which sent over the WEBSOCKET and lost the race against JS-freeze on lock.

- backgroundLocation.ts: extracted shared `restBroadcast()`; bg task now logs gps_ping with
  `{src:'bg', sent}` (sent:false = task ran but no token/POST failed — distinct from absence =
  task never ran). New `sendDormantPing()` sends the "pocketed" ping over REST (escapes before
  freeze). `startRail3BackgroundLocation` wrapped in try/catch + logs `app_state_change
  {event:'bg_start', ok/error}` so an Android 14+ FGS-type rejection is visible, not silent.
- useFleetPositions.ts: handoff logs `app_state_change {event:'handoff', branch, backgroundReady,
  hadCoords}` on every background transition; dormant branch now calls sendDormantPing (REST),
  not channel.send (websocket).
- RideMapScreen.tsx: handleExplainerDismiss logs `ux_explainer_shown {fg,bg}`; when bg!='granted'
  it now Alerts + offers Open Settings (Linking.openSettings) — the only place Android 11+ grants
  "Allow all the time". New AppState 'active' effect re-checks getBackgroundPermissionsAsync and
  flips backgroundReady when the rider returns from Settings having granted it.

Pure JS/TS (no native/config change) but needs a new APK (no EAS Update/OTA configured).
tsc clean except pre-existing deepLinkAuth.ts ParsedURL errors.

## RC2.1 — backgroundReady from OS ground truth on mount (2026-06-14)

Neil confirmed "Allow all the time" was set BEFORE the failed walk → during the walk the OS
grant existed, so backgroundReady SHOULD have been true and the FGS SHOULD have started — it
didn't (no notification). Shifts weight toward the FGS silently failing to start (H2), but a
live H1 variant remains: backgroundReady could be false despite the grant if
handleExplainerDismiss raced myRiderId (early-returns) or onDismiss didn't fire. RC2 v1
(build 383ad37f) only re-checked on AppState 'active' TRANSITIONS — listeners don't fire on
mount — so the first lock was still driven by the fragile explainer path.

- RideMapScreen: the bg-permission effect now runs an initial check() on mount AND on each
  'active', deriving backgroundReady from getBackgroundPermissionsAsync (OS truth), decoupled
  from the explainer. Makes the FGS branch deterministic whenever the grant exists → next walk
  is a CLEAN test of whether startLocationUpdatesAsync actually starts the FGS on Android 16
  (the bg_start instrumentation answers it).

tsc clean except pre-existing deepLinkAuth.ts ParsedURL errors.

## RC3 — FGS started in foreground, runs whole ride (Option A) (2026-06-14)

RC2.1 (build f8978857) instrumentation gave the definitive root cause: bg_start ok:false,
"ExpoLocation.startLocationUpdatesAsync rejected → Couldn't start the foreground service.
Foreground service cannot be started when the application is in [background]." Android 12+
forbids STARTING an FGS from the background, and the old code only tried to start it AT the
screen-lock (background) moment — so it could never succeed. backgroundReady was true, branch
was fgs, perms granted — all correct; the timing was illegal.

Sr PM ratified Option A (background tracking is the only option that meets the requirement):
- useFleetPositions: NEW effect starts the FGS while FOREGROUND (backgroundReady && SUBSCRIBED),
  runs the whole ride, stops on leave/channel-drop (idempotent, re-mount safe). Removed the
  start-on-background / stop-on-active toggling. The remaining AppState effect is now the
  dormant-only fallback for foreground-only riders (REST Sleeping ping). publishSample (socket
  path) guarded to AppState==='active' only.
- backgroundLocation: FGS task now returns early when AppState.currentState==='active' — it
  broadcasts ONLY while backgrounded, so it never doubles with the foreground socket path
  (both are alive the whole ride now). Persistent notification shows for the whole ride
  (mandatory on modern Android for background location; industry standard — Strava/RWGPS).

Real-world validation (Neil): Ride with GPS keeps recording the route while the screen is
locked (FGS running) but the live map "flies"/catches up on unlock (UI suspended) — exactly
the FGS behavior, and exactly our accepted design (sender stays live to the fleet; the locked
rider's OWN map view may be stale until reopen).

tsc clean except pre-existing deepLinkAuth.ts ParsedURL errors.

## RC4 — engine swap to Transistorsoft Background Geolocation (FREE debug trial) (2026-06-14)

RC3 proved the FGS could be started legally (bg_start ok:true) but Android Doze still BATCHED
expo-location's updates (saffron + 30ab walks: wake-time bursts, ~1 fix/min, not a live 5s
stream). Research confirmed this is a documented, unfixed expo-location limitation; Garmin /
Life360 / Strava-Beacon class apps use Transistorsoft's native SDK. Neil's RWGPS-vs-Garmin
observation reframed it: recording tolerates batching, live broadcast does not — and Garmin
(live) streams regardless of battery setting because its native engine resists Doze.

- Added react-native-background-geolocation@4.19.4 + react-native-background-fetch@4.2.8
  (the Expo SDK-52-compatible 4.x line; the latest 5.x targets SDK 53+ / config-plugins >=10).
- mobile/src/lib/bgGeo.ts: thin wrapper — onLocation (registered once, swappable handler ref) →
  caller broadcasts; ready() with HIGH accuracy, 5s interval, disableElasticity + disableStopDetection
  (steady cadence, no false stationary gaps), foregroundService, debug:true (audible chirp per fix
  for the trial). changePace(true) on start to force continuous streaming.
- useFleetPositions: when backgroundReady, the Transistorsoft engine replaces BOTH the expo
  foreground watch (early-returns) and the RC3 FGS handoff — onLocation → SenderStateTracker →
  OUR restBroadcast + gps_ping sink (src:'tsbg'). Transport + §4.1 + instrumentation unchanged.
- app.config.ts: bg-geo + bg-fetch config plugins (no license key — debug runs unlicensed).
  Inline withBundleInDebug plugin (gated to EAS_BUILD_PROFILE=trial) injects bundleInDebug=true
  so the DEBUG-variant APK embeds JS and runs standalone (no Metro tether) for a real walk.
- eas.json: new "trial" profile (buildType apk, gradleCommand :app:assembleDebug, dev-client off).

Verified: prebuild injects bundleInDebug=true; bg-geo manifest entries present; tsc clean
(only pre-existing deepLinkAuth.ts). The $399 Starter license is needed ONLY for a release build.

## RC4 — dual-engine A/B toggle + the real fix (2026-06-15)

Root cause of the field failures FOUND: the background-location effect in useFleetPositions was
gated on the realtime channel status==='SUBSCRIBED' (status in guard+deps). On any backgrounding
(lock OR app-switch) the websocket drops -> status leaves SUBSCRIBED ('channel denied') -> effect
cleanup ran stopBgGeo()/stopRail3BackgroundLocation() -> tore down the foreground service ->
notification vanished + all location stopped ~1-2 min after background; foreground re-subscribed ->
restarted it. NOT battery (Unrestricted was on), NOT motion, NOT token, NOT notification-permission
(all eliminated on-device). Confirmed both directions by Neil. Our own code was killing the FGS.

- FIX: removed `status` from the bg-engine effect's guard AND deps. The FGS now runs the whole ride
  on (backgroundReady && rideId && myRiderId), independent of websocket state — broadcasts go over
  REST and never needed the channel. (Same bug existed in the expo path; both now decoupled.)
- DUAL-ENGINE TRIAL toggle (debug only): bgEngine.ts (AsyncStorage pref + useBgEngine hook);
  HomeScreen debug toggle expo<->Transistorsoft; RideMapScreen reads + passes bgEngine to
  useFleetPositions. 'expo' = fg watch (src:'fg') + FGS task (src:'bg'); 'tsbg' = Transistorsoft
  unified (src:'tsbg'). Only the selected engine broadcasts (fg-watch yields only when tsbg+ready).
  Lets us A/B both engines on the same device/walk to answer "is the $399 Transistorsoft engine
  even required, or does free expo-location + the fix now sustain background?" Default 'expo'.

tsc clean (pre-existing deepLinkAuth.ts only). Validation construct — production ships ONE engine.

## 2026-06-27 — W231 audible tracking-ping toggle (closed-test field-QA)

- trackingPing.ts — off-by-default per-device AsyncStorage flag, cached in memory (the onLocation
  hot path never hits storage); `playTrackingPing(BG)` fires TS-native `playSound('LOCATION_RECORDED')`
  per recorded fix, fire-and-forget (.catch + try). Wired in bgGeo.ts onLocation; toggle Switch on
  HomeScreen (themed). LLD: TS `playSound`, NOT re-adding expo-av (W203 removed it) — TS-native audio
  rings under the FGS screen-locked, which expo-av can't reliably do backgrounded. Purpose: the same
  chirp as `debug:true` WITHOUT its diagnostic notification, so it survives the W208 debug strip.
  `PING_SOUND_ID` is the one first-build validation point. NOTE: validate on a build with
  `debug:false` — `debug:true` chirps every fix regardless of the toggle, masking the on/off
  behaviour. tsc clean (deepLinkAuth.ts only).

## 2026-06-27 — W232 field diagnostics: send-log button + debug:false + accuracy harness

- bgGeo.ts: `debug: true` → **`debug: false`** (the W231 toggle now owns the audible signal,
  without TS's developer notification). `logLevel: VERBOSE` KEPT on purpose — it's the fetchable
  on-device diagnostic log (coords + per-fix hAcc). W208 takes logLevel OFF for production.
- diagnostics.ts (new): `sendDiagnosticLog()` → `BackgroundGeolocation.logger.emailLog(<recipient>)`.
  MANUAL, consented pull. **Never `uploadLog`** (that would POST coord-bearing logs to a server,
  breaching the no-coords-on-the-server posture). Lazy require; never throws (returns a result).
- HomeScreen.tsx: themed "Send diagnostic log" button beside the W231 toggle; Alert on ok/fail.
- tools/rail3_ts_log_accuracy.py (new): zero-build GPS-accuracy harness. Parses the TS log
  (lat/lng/hAcc/ts) → hAcc distribution; with `--gpx` aligns vs a synchronous RWGPS track
  (`--tz-offset` reconstructs TS device-local → UTC) → positional/cross-track error. Smoke-tested
  3/3 fixes + GPX alignment; graceful on empty input. hAcc is SELF-REPORTED (real error needs the
  GPX diff); RWGPS is agreement, not survey truth. tsc clean (deepLinkAuth.ts only).

## W244 (Lane A) — Ride-start ≤2s: render-first, OTA-safe (2026-06-28)
- RideMapScreen.tsx: removed the full-screen "Loading ride…" gate (render-first); only a HARD
  error short-circuits the live map now. Ride name/role/QR/captain-controls null-guard on `ride`
  and hydrate async. Added a one-time start-frame effect (camera → ride.start until first fix) and
  a muted start-PIN fallback (`!myCoords && ride.start`) so a cold/no-permission rider still gets a
  position marker per AC. Widened START_ZOOM_DELTA 0.0006→0.0018 (~25m→~70m) — recenter read too
  tight (Neil). Dropped unused `loading` from the useRideDetails destructure.
- useRideDetails.ts: render-first restructure — publish the ride the instant the rides row resolves
  with myRole defaulted to 'member' + clear loading NOW; the participant-role read is OFF the
  critical path and patches myRole UP when it lands. Fail-closed (member → most-restrictive §4.1
  visibility, hides captain chrome). Added `start` (rides.start_coords) to RideDetails + select.
- useFleetPositions.ts: seed myCoords from getLastKnownPositionAsync on open (read-only, starts no
  tracking; `cur ?? …` so a live fix always wins) → instant centering + enabled Centre/Fit.
- measure.ts: added 'breadcrumb_upsert' to MeasureKind (D69 fired it; the kind was missing — tsc
  flagged it, Metro ran fine).
- Reviewer (stride:task-reviewer): approved w/ changes — all safety-critical checks pass (fail-closed
  myRole, stable hook order, D69 breadcrumb + FGS lock-survival untouched, read-only seed). 1
  important (start-pin fallback) + 3 minor all addressed. tsc clean on all touched files.
- JS-only / OTA-safe (lands via EAS Update once W243 OTA is un-parked). Lane B = W245 (GPS pre-warm
  + parallelize reads), gated on on-device lock-survival re-test.

## D88 (middle ground, layer 1) — heartbeat engine self-check / re-engage (2026-07-18)
- ROOT CAUSE (field, staging ride 3efe17fc): the SDK's native motion-detection can silently fail to
  wake tracking. Galaxy S20 FE (SM-G781W) walked ~12 min backgrounded → ZERO fixes, while the SAME
  person's S23 (SM-S911W) streamed ~20 on the identical walk; every permission + battery setting
  correct/identical on both. Native TS log: TerminateEvent + zero onLocation/motionchange/activitychange.
- bgGeo.ts: added the heartbeat self-check — `heartbeatInterval: 60` (Android floor; NO preventSuspend
  — Android fires onHeartbeat during stationary off the FGS without it, and preventSuspend would keep
  the device fully awake = heavy battery). New `BG.onHeartbeat`: while STATIONARY (engineMoving false),
  actively `getCurrentPosition({samples:1,timeout:30,persist:false})`, compare to last fix; if drift
  ≥ HEARTBEAT_MOVE_THRESHOLD_M (40m, ~=distanceFilter so standstill jitter can't false-trigger) →
  `changePace(true)` to flip isMoving on + route the triggering fix through the normal handler so the
  rider reappears live immediately. Track lastFixPos + engineMoving from onLocation/onMotionChange.
  New optional 3rd startBgGeo arg (onHeartbeatCheck) + HeartbeatCheckInfo type; cleared in stopBgGeo.
  Scenario built exactly: given isMoving off → heartbeat detects GPS movement → flip isMoving on.
- useFleetPositions.ts: pass the 3rd callback → logMeasurement app_state_change {event:'heartbeat_check',
  engineMoving, sampled, movedM, reengaged} so we can confirm ON-DEVICE that the heartbeat fires while
  backgrounded (open question on aggressive OEMs) and whether it re-engaged. reengaged:true = fix working.
- BOUNDARY (documented in code): only runs if the heartbeat fires (FGS alive). If the OS kills the FGS
  outright (the S20 FE's actual failure), no in-process check fires → captain-side silence detection
  (D88 layer 2, not built here) is the backstop.
- tsc clean on bgGeo.ts / useFleetPositions.ts / geo.ts (only pre-existing deepLinkAuth.ts errors remain).
- NOT YET BUILT/VALIDATED: needs an EAS build + on-device backgrounded-walk re-test on the S20 FE
  (watch sink for heartbeat_check rows + reengaged:true). Branch: d88-heartbeat-selfcheck (off d86).

## D87 — departed rider clears from the fleet (no more phantom marker) (2026-07-18)
- ROOT CAUSE: the fleet is additive — it renders (pings ∪ lastKnown) ∩ roster and staleness only
  GREYS a rider, never removes them. Sign-out/leave emitted no departure signal and didn't clear
  last-known, so a logged-out rider lingered as a greying phantom (field-confirmed twice on ride
  3efe17fc: rogers logged out, marker stayed; a new login added a 2nd marker beside it).
- Fix — a DELIBERATE departure signal, distinct from passive greying:
  - backgroundLocation.ts: broadcastDeparture(rideId, riderId) — (1) live `depart` broadcast
    (DEPARTED_EVENT) so subscribed receivers drop the marker now; (2) clears MY persisted
    last-known (ride_participants last_lat/long/ping = null, scoped account_id=auth.uid()) so a
    later resume-fetch doesn't re-materialise it. restBroadcast gained an optional `event` arg
    (default POSITION_EVENT); D77 identity check still applies (only depart AS yourself).
  - useFleetPositions.ts: receiver handler on DEPARTED_EVENT removes the rider from BOTH pings and
    lastKnown; export DEPARTED_EVENT; register the active ride (activeRide.ts) when tracking starts.
  - activeRide.ts (new): module-level holder of the last-tracked {rideId, riderId}, so sign-out
    (from Home, after the map unmounts) can still depart it. Not cleared on unmount; overwritten
    on next ride; cleared after a sign-out departure.
  - AuthContext.tsx: signOut() broadcasts the departure BEFORE supabase.auth.signOut() (needs the
    live JWT), best-effort, never blocks sign-out.
  - RideMapScreen.tsx: beforeRemove nav listener departs on leaving the ride map (back/gesture/D57
    auto-leave). A D77 account-swap REMOUNT tears down via React (not a nav pop) so it does NOT
    false-fire — the swap is covered by the sign-out/holder path.
- COLLISION-SAFE: if the same account is still live on a 2nd device, its live pings re-add the
  rider and repopulate last-known — so only a TRULY gone rider is removed. Passive signal-loss is
  untouched (no `depart` fires) → those still grey (W174/W261 safety fallback preserved).
- SAFETY BIAS: a false departure (live rider vanishes) is dangerous; a missed one just leaves the
  pre-existing greying phantom — so triggers are DELIBERATE actions only (sign-out, leave-map),
  never transient unmounts. Instrumented: app_state_change {event:'departed_sent'|'departed_recv'}.
- tsc clean on all touched files (only pre-existing deepLinkAuth.ts errors). JS-only → OTA-safe.
  CODED, not yet on-device-validated.

## D90 — force engine engagement at ride join (changePace(true) after start) (2026-07-19)
- ROOT CAUSE (TS Philosophy of Operation, confirmed by on-device native log): start() leaves the
  engine STATIONARY with location-services OFF; it only enters the moving/tracking state when the
  Motion-Activity API detects movement OR the device exits a ~200m stationary geofence. If the phone
  is locked during that warm-up (field: ride f51f7add, S23, locked ~4s after start → OS suspended the
  app before Activity-Recognition fired → engine never left stationary → ZERO fixes for the whole
  21-min ride, masked by the OS blue dot; ride 2 mins later worked because kept foreground briefly).
  TS explicitly recommends changePace(true) for 'start an activity' apps ('like a Jogging App') —
  joining a ride IS that moment. W261 removed changePace(true) ('let motion detection decide', for
  battery) — which diverges from TS guidance for this app class and is the direct cause.
- bgGeo.ts: after BG.start(), call BG.changePace(true) (wrapped, never throws). ONE-SHOT kick, NOT
  the W261 forced-streaming scaffold — no disableStopDetection, so stopTimeout still returns the
  engine to stationary (services off) when genuinely parked → deterministic engagement at the start
  that matters + battery preserved when stopped. Replaces the old 'W261: no changePace' comment.
- Prongs 2 (resume re-assert — ride 1's mid-ride unlock did NOT revive the engine; resume restores
  the channel/receive but not the tracking engine/send) and 3 (self-health signal, since the OS dot
  masks a dead engine) tracked in D90 as follow-ups (tie to D89/W277). This commit = prong 1 only.
- tsc clean (only pre-existing deepLinkAuth.ts). Ref: Transistorsoft Philosophy of Operation (wiki).

## D89 + D90 (prong 2) — unified resume-driven engine re-assert (2026-07-19)
- Done PROPERLY as ONE mechanism (first brick of W277), not two detectors. useFleetPositions.onResume
  now calls nudgeBgGeo() (changePace(true)) on EVERY resume. Idempotent — no-op on a healthy/moving
  engine and no-op if the engine was never configured — so an unconditional resume-nudge safely
  covers ALL causes without detecting WHY:
    • D90 warm-up strand / OS-suspend — a ride that started dark (engine stuck stationary; ride
      f51f7add: 21 min, zero fixes; mid-ride unlock didn't revive it because resume restored the
      channel but never re-asserted the engine). Now the unlock re-engages it.
    • D89 / D86 Saver-off — Battery Saver toggled off while backgrounded is caught on the next
      unlock. REPLACES D86's watchBatterySaverCleared (foreground-only listener that missed the
      backgrounded toggle; field-confirmed never fired — ride 82a08280, zero bg_nudge).
    • OEM background-suspend — foreground return re-engages a suspended engine.
- REMOVED watchBatterySaverCleared from batteryGuards.ts + its wiring/import in useFleetPositions
  (dead code; superseded). Kept nudgeBgGeo (now the shared re-assert action).
- Instrumented: logMeasurement bg_nudge {reason:'resume', source} on each resume re-assert.
- stopTimeout still returns a genuinely-parked engine to stationary → battery preserved.
- Combines with D90 prong 1 (changePace(true) at start): engage deterministically at join, AND
  re-assert on every resume. Prong 3 (self-health signal) remains a follow-up. tsc clean.

## W279 (= wTBD2) — Saver-at-start engine-start→first-fix instrumentation (2026-09-13)
- wTBDn SUBSTITUTION: wTBD2 (Rail 3 Ledger v1.1.3 §6, §14 item 9) = W279, goal G34. Recorded here
  and on the ticket so the Stride ticket traces back to the Brain proposal.
- NOTE on this log's drift: D91 (2026-07-20/21, the thresholds-dep engine teardown fix, field-validated)
  has no entry here even though bgGeo.ts/useFleetPositions.ts already carry it (deps =
  [backgroundReady, rideId, myRiderId]). Treat the code, not the last entries, as current.
- LLD: pure tracker in src/lib/engineFirstFix.ts (createFirstFixTracker: begin / markStarted / onFix /
  onStop, one report per engine run; withTimeout race helper). bgGeo.ts stays ride-agnostic and surfaces
  the report through a 4th optional startBgGeo callback (same shape as HeartbeatCheckInfo); the caller
  (useFleetPositions) owns the sink call. Rejected alternative: importing measure.ts into bgGeo.ts — that
  would make the location source depend on supabase and the ride id it deliberately does not know.
- Sampling: cold_start = !configured before ready() (first ready() in the process); saver_on read via
  expo-battery isLowPowerModeEnabledAsync bounded at 1500 ms (null on timeout / non-Android), sampled
  ONCE at start(); the run opens BEFORE BG.start() so a fix landing while start() resolves is never
  missed, and markStarted refines the start ts once start() resolves (unless a fix already arrived).
  A heartbeat re-engage sample counts as a fix. stopBgGeo reports a no_fix run with its duration.
- Sink: new MeasureKind 'engine_first_fix' — value = delta_ms; payload { outcome, saver_on, cold_start,
  engine_start_client_ts }. Rides the existing query_timeout carrier: NO migration, no RLS change,
  no coordinates. Measurement only — no tuning, no threshold selection, no Pillar edits (D4).
- Brief skeleton: docs/rail3/decision_briefs/wTBD2_saver_at_start_decision_brief.md (protocol,
  extraction SQL, two-value proposal table, Senior PM confirmation lines). Values PENDING field runs.
- Review (stride:task-reviewer, approved, 4 minor, all taken): Saver read now STARTS before ready() and is
  awaited only just before start(), so it overlaps existing work instead of fronting start(); withTimeout
  takes a thunk and swallows a sync throw (lifecycle.ts guard carried over); onLocation ignores a fix whose
  SDK timestamp predates the run (warm-restart carry-over from an un-awaited stop() would otherwise seed the
  warm population with near-zero deltas); test count corrected.
- Tests: tests/engineFirstFix.test.mjs (7 cases). npm test: 63 tests, 61 pass; the 2 failing files need
  the local Supabase stack (env vars), identical on the base branch. tsc clean (only pre-existing deepLinkAuth).

## W280 — Screen-lock Battery Saver advisory restored (B3), §5.1 collision gate, D3 dead-code removal (2026-09-30)
- Pre-flight vs code (rail3-integration 440f914): `watchBatterySaverOnScreenLock` had ZERO callers, so R3-06
  was silently unmet while R3-05 (join prompt) still fired — confirmed. `lastStatus` in useRideChannel.ts was
  assigned and read once (`setStatus(lastStatus)`), dead only as retained state — removed, D73 unconditional
  rebuild untouched, its comment reworded. NO `autoSync` / `url` / `batchSync` residue existed anywhere in
  mobile/src (ticket asked to confirm; nothing to delete) — B1 exclusion comment added at the `BG.ready()` call so
  nobody wires it later. RideMapScreen's "wakelock effect" is an unmount cleanup only (acquire lives in
  handleExplainerDismiss); the new subscription mirrors its cleanup discipline.
- LLD: pure policy module `src/lib/advisoryPolicy.ts` — `decideSaverAdvisory` / `shouldShowSaverAdvisory` is the
  §5.1 collision rule (self-health precedence; Saver advisory suppresses while it fires; stands alone when
  tracking is healthy; Saver off → never), `lockTransition` is the one-advisory-per-lock-cycle rule (only the
  transition OUT of 'active' is a lock, so Android's inactive → background flap can't double-fire). Erasable TS,
  no react-native imports, `tests/advisoryPolicy.test.mjs` (16 cases) per the beaconLogic pattern. Decisions are a
  closed show/suppress/none set with no join-gate input — the policy cannot block (R3-49).
- LLD: the LOCK event ARMS the check, the next UNLOCK reads Saver once and surfaces. R3-06's "on screen lock
  event" is the active → background/inactive transition; the advisory is surfaced on the next return to
  'active', where Battery Saver is read and the collision gate consults the self-health signal. Rationale: RN's
  Android DialogModule defers an Alert raised while the activity is paused and shows it on resume, so unlock is
  when the rider sees it regardless — evaluating the gate there uses the self-health state of the unlock the
  rider actually experiences, which is how §5.1 states the rule. Reading at unlock (review round 1 took the
  reviewer's suggestion over a lock-time read) means a Saver that switched ON while locked — Android's automatic
  low-battery onset — is surfaced at that same unlock, a rider who toggled it OFF from the lock screen (R3-47) is
  never nagged, and there is no lock-time promise that can resolve after the unlock handler ran.
- LLD (review round 1): the watcher is a dependency-injected, react-native-free state machine,
  `createScreenLockSaverWatcher` in advisoryPolicy.ts; `watchBatterySaverOnScreenLock` only binds AppState /
  expo-battery / Alert into it. That is what makes the ticket's integration test real: node tests drive fake
  AppState events and assert one subscription per call, `remove()` once on dispose, no show after dispose, one
  show per lock cycle across the inactive → background flap, a pending read discarded when a newer lock cycle
  starts, and Saver-on-while-locked surfaced at unlock.
- Self-health input: `isSelfHealthPromptActive` getter option on `watchBatterySaverOnScreenLock`, stubbed
  `() => false` at the RideMapScreen call site until the R3-40 overlay (W285) connects the real signal — the gate
  exists now, that ticket only plugs in a getter. The join-time prompt (R3-05, `promptIfBatterySaverOn('join')`)
  is unchanged and deliberately NOT gated (no self-health prompt exists at join); the Alert is factored into a
  shared `showBatterySaverAdvisory` so both paths show one copy.
- Wiring: RideMapScreen effect keyed on `backgroundReady` (tracking engaged); the effect cleanup IS the
  unsubscribe, so exactly one AppState listener per ride and none stacked across re-renders.
- D89 (Stride 5379, absorbed here; the Stride record was closed by the Senior PM as superseded by this ticket,
  its verification evidence lands with the field run recorded below): no OS Saver ON→OFF edge listener
  reintroduced (D86 removal comment kept in batteryGuards.ts); R3-47 remains served by
  `useFleetPositions.onResume` (bg_nudge, D89+D90 prong 2) and the D88 heartbeat. On-device evidence for
  R3-06 / R3-47 / R3-49 / D89 is collected on the next field build cut off rail3-integration (batched with the
  W279 Saver matrix) — per "fixed = built AND validated" this ticket is NOT done until that run is recorded
  here. FIELD RUN: _pending_.
- Tests: `npm test` 79 tests, 77 pass; the 2 failing files (beaconAudit, rlsIsolation) need the local Supabase
  stack and fail identically on the base branch. `tsc --noEmit`: only the 2 pre-existing deepLinkAuth errors.

## W281 — Sign-out ordering verified and pinned: departure → holder clear → signOut → cache clear (2026-09-30)
- Pre-flight vs code (rail3-integration 15692d3): the built order was departure → clearActiveRide → signOut,
  lazy-required, no scope arg (D33 ok), and a THROWN departure never blocked sign-out — but two ticket
  statements did not match. (A) The departure was fully AWAITED with no bound anywhere in backgroundLocation.ts,
  so a hung REST call blocked sign-out indefinitely: "fire-and-forget" was not true. (D) The onAuthStateChange
  user-id-delta path fired no departure for the old binding and did NOT clear the active-ride holder, so on a
  swap that bypassed signOut() account B inherited A's ride/rider binding (R3-57 gap; B's later sign-out then
  emitted a harmless identity_mismatch). Also: the `departed_sent` sink row was logged unconditionally, even when
  restBroadcast refused or failed — useless as SC-1 evidence.
- LLD: `src/lib/signOutSequence.ts` (pure, DI, node-tested) owns the order. `runSignOutSequence`: departure
  ISSUED under the still-valid JWT → bounded wait (Promise.race, 3 s; the call keeps running, only the WAIT is
  bounded) → clearActiveRide → supabase.auth.signOut(). "Fire-and-forget" is implemented as "never wait for
  acknowledgement", NOT as a bare `void` after signOut — that would race the token revoke and lose (D1). A
  rejected or hung departure never blocks sign-out; a rejected signOut still propagates.
  `runIdentityTransition`: resetMeasureIdentity on every auth event; on a user-id DELTA only, clearActiveRide
  then `clearRosterCache()` — the R3-58 last-clause hook point (`src/lib/rosterCache.ts`, no-op until W289),
  which sits AFTER the departure by construction (the SIGNED_OUT event is emitted by the revoke that follows
  the departure window). Never on TOKEN_REFRESHED (same id ⇒ userChanged=false ⇒ nothing clears).
- "Never fires after the identity is gone": broadcastDeparture now re-checks `uid === riderId` from the LIVE
  session before the last-known null-out (restBroadcast already refuses the broadcast on mismatch via
  isCurrentIdentity). A departure that outlives the bounded window therefore finds no session (no uid, no write)
  or the next account's session (uid ≠ riderId, no write) — it cannot null B's row.
- Evidence: `departed_sent` payload now carries `sent` (restBroadcast's verdict: false = no token / identity
  refused / fetch threw) and `cleared` (row null-out succeeded under own uid), so the sink row says what
  happened. SC-1 field evidence = `departed_sent{sent:true,cleared:true}` before the SIGNED_OUT lifecycle row.
- Residue (recorded, not fixed here): restBroadcast never checks `res.ok`, so a non-2xx (e.g. 401 on an expired
  JWT) still reads as `sent:true` — hot-path change, out of this ticket's scope; a rider who declined
  background permission never sets the holder (engine never starts) so no departure fires at sign-out — the
  no-FGS path's roster state is W288/W292 territory. On a swap that bypasses signOut() A's roster row stays
  un-departed until the server-side staleness detector (deferred to a later sprint).
- Tests: tests/signOutSequence.test.mjs (9 cases: order, no-ride, rejected departure, hung departure bounded by
  the 3 s window, issued-before-signOut, timer cleared, signOut rejection propagates, transition on delta,
  refresh clears nothing). `npm test` 88 tests, 86 pass (same 2 Supabase-stack files as base). tsc: only the 2
  pre-existing deepLinkAuth errors.
- Field validation (R3-58 / R3-57 / R3-56; verification steps 0–2) pending on the next field build, batched
  with W279/W280. Ticket stays open until recorded here. FIELD RUN: _pending_ — record the ride id, the sender's
  `departed_sent{sent,cleared}` row (+ timestamp), the SIGNED_OUT lifecycle row that follows it, and the second
  device's `departed_recv` row (corroborates the broadcast half: `sent:true` only means the POST went out).

## W282 — Beacon current state on ride_participants.beacon_active + raise-time last-known (slate 7, A4) (2026-09-30)
- Pre-flight vs code (rail3-integration 35e54bf): `beacon_active` existed (initial schema, default false) and NOTHING
  read or wrote it; the seed read `beacon_alerts WHERE beacon_cancelled_at IS NULL` (history) and merged
  `{...seed, ...prev}`, which kept a beacon cancelled-while-blind alive until the next seed; `persistLastKnown` was
  module-private in useFleetPositions (60 s throttle + stop only), so a beacon could be raised on a null/stale
  last-known; FleetParticipant had no `source`; RiderMarker had no stale styling. Staging drift noted (not this
  ticket): `schema_migrations` lists only 20260610000000 of the Rail 3 set although the objects from
  0610010000/0714/0718 all exist (applied out of band); `participant_update_policy` on staging carries an extra
  `OR is_tenant_admin(…)` clause the repo lacks.
- MIGRATION: NONE. `participant_update_policy` USING = `account_id = auth.uid() OR is_captain_or_support(ride_id)`
  (20260410000001:91-96, no WITH CHECK) already permits the own-row raise and a Captain/SAG clear on another
  rider's row; no new policy ⇒ no recursion surface. `participant_tactical_select` shapes the seed server-side to
  own + Captain/SAG rows — exactly canSeeBeacon's §4.1 shape.
- LLD: `src/lib/lastKnown.ts` = the ONE write path for MY row (`persistMyParticipantPatch` / `persistLastKnown`,
  `.eq ride_id` AND `.eq account_id = live uid`, optional retries, sink row `last_position_write{ok,trigger,fields}`
  — no coordinates). Trigger `'beacon'` added; useFleetPositions imports it (throttle/stop call sites unchanged).
- LLD: raise = `buildRaisePatch(coords, at)` → `{beacon_active:true, last_lat, last_long, last_ping}` in ONE update
  (flag only when there is no fix yet — D79, last_* untouched), issued BEFORE `channel.send`, never awaited by it,
  one retry, failure = sink row + console.error only (never composed into the alert's error message).
- LLD: cancel = audit UPDATE on beacon_alerts FIRST (keyed by `ride_id` + `rider_id` + `cancelled_at IS NULL`,
  not by id — a flag-adopted beacon has no audit id, and one account on two devices leaves two open rows), THEN
  `{beacon_active:false}` on the rider's row (double-scoped, flag only) concurrently with the fan-out; on
  `updErr` nothing else runs (flag change never precedes a successful audit write, SD-011 intact); the 0-rows
  branch still clears the flag (raise-time flag write is independent of the audit insert). `settledAtRef` records
  the cancel time so a seed that started earlier cannot re-add it.
- LLD: seed = `ride_participants(account_id, beacon_active, last_lat, last_long, last_ping) WHERE beacon_active`
  on mount, every resume (D75) and channel activation (SUBSCRIBED), 3 s debounce, `fetch_result{target:'beacon'}`
  row. `mergeSeededBeacons` (pure) makes the seed AUTHORITATIVE for absence (no history replay; a beacon settled
  while blind is dropped and never re-raised) with two race exceptions: a live record newer than the read start
  minus 10 s grace is kept; a seed row for a rider cancelled locally after the read started is not re-added. Live
  beaconId wins; the seed supplies the R3-55 anchor (raise-time last-known). `ActiveBeacon` moved to
  beaconLogic.ts (`beaconId: string|null`, `anchor`), re-exported from useBeacons.
- §5.3 overlay: `FleetParticipant.source: 'live'|'lastKnown'` set in the fleet compose (precedence unchanged:
  live wins iff live.ts ≥ lk.ts); `isStaleUnderBeacon(source, beaconActive, viewerRole)` true ONLY for
  lastKnown + active beacon + Captain/SAG viewer; RiderMarker `staleUnderBeacon` prop renders a DASHED pulse ring
  (fill stays SOS red — red is distress-only) and joins the tracksViewChanges deps (Android bitmap gotcha). Not a
  TacticalState (A3). Own marker never gets it. Exact dp/colour = design pass.
- D81 (Stride 5154, server-side cancel of open beacons at ride end; semantics undecided) — RELATED, not built.
  W282 fixes the client contract so D81 can land server-side with no client change: (1) the client treats
  beacon_active=false or an absent seed row as SETTLED and never re-raises from beacon_alerts history; (2) D81's
  job must clear in the client's order — beacon_alerts.beacon_cancelled_by = a NAMED actor (the ending Captain's
  uuid or a defined system actor, never null: SD-011 reserves null for system error), beacon_cancelled_at = now(),
  THEN ride_participants.beacon_active=false; (3) devices learn of it on their next seed (focus/resume/channel
  activation) — no broadcast, no replay; (4) cancel-vs-preserve at ride end stays D81's decision. R3-36 note:
  hard-purge-location nulls last_lat/last_long/phone only — extend the purge scope to `beacon_active=false,
  last_ping=null` (note only, not built here).
- Review round 1 (stride:task-reviewer, 4 important + 2 minor, all taken): (1) R3-55 reconnect half — the
  raise-time `anchor` was carried but never RENDERED (the fleet's last-known fetch runs on mount/resume, not on
  channel activation) → `anchorBeaconedFleet` (pure) runs before the §4.1 filter in RideMapScreen: a beaconed
  rider is placed at the anchor whenever it is newer than the fleet's position, and a beaconed rider the fleet
  does not list is surfaced from the roster as last-known; a LIVE fix at least as fresh as the anchor always
  wins, so the overlay clears when live supersedes; riders RLS hid (not in roster) are skipped. (2) A FAILED
  raise-time flag write could let the now-authoritative seed drop a live beacon (own device loses myBeacon, other
  devices lose it on their next seed) → `pendingRaiseRef`: the seed re-asserts the raise patch before every read
  and `mergeSeededBeacons` takes `protectedRiderIds` so my own beacon is never dropped on the row's say-so until
  the write lands; the rider is told ("status flag not saved") without overwriting a sterner alert-path message;
  cancelling my beacon clears the pending raise. (3)+(4) DB-backed tests WRITTEN (they skip without the local
  stack and run on the staging/CI pass): beaconAudit.test.mjs +3 (own-row raise seen by the flag seed and not
  resurrected by cancelled audit history; Captain clears another rider's flag under participant_update_policy;
  rider-keyed cancel settles every open audit row) and rlsIsolation.test.mjs +4 with a second tenant-A
  participant (member cannot update another's beacon_active → 0 rows; tenant-B user cannot touch a tenant-A
  row → 0 rows; own row → 1; Captain on a rider's row → 1 via is_captain_or_support). (5) `isStaleUnderBeacon`
  now REQUIRES the viewer role and fails closed. (6) `ActiveBeacon.triggeredAt` documented as a lower bound for
  flag-adopted records.
- Review round 2 (1 important + 1 minor, both on the fix-2 reconciliation path; FIXED after the two-round cap
  without a third agent round — stated here and on the PR): a remote (Captain/SAG) cancel of my beacon did not
  clear `pendingRaiseRef`, so after a failed raise write the next seed re-asserted the flag and resurrected a
  cancelled beacon → the broadcast cancel branch now clears it, and the seed's re-assert is gated on my beacon
  still being live locally (`beaconsRef`), which also covers a cancel broadcast missed while pocketed; the
  re-assert replayed the raise-time `last_*`, moving my last-known back in time → it now writes the FLAG ONLY
  (the throttle/stop path owns last_*).
- Known residue: a beacon whose rider has NO last-known at all (no fix ever) still cannot be placed on the
  Captain/SAG map (RiderMarker needs a position) — pre-existing, list surface later; a Captain-cancelled own
  beacon learned via seed (broadcast missed while pocketed) gives no R3-24 haptic.
- Tests: tests/beaconState.test.mjs (16 cases: raise patch with/without coords, clear patch + SD-011 throw,
  stale predicate incl. viewer role + fail-closed, merge semantics × 7 incl. protected own beacon,
  anchorBeaconedFleet × 4); beaconAudit +3 and rlsIsolation +4 DB-backed (skip here — Docker not running; run on
  the staging/CI pass). `npm test` 104 tests, 102 pass (same 2 stack files as base). tsc: only the 2 pre-existing
  deepLinkAuth errors.
- Field validation (R3-55 pocketed-Captain recovery; R3-20/21/22 cancel paths; D81 end-ride-with-beacon;
  Management API `SELECT account_id, beacon_active, last_ping FROM ride_participants WHERE ride_id = …`) pending on
  the next field build, batched with W279/W280/W281. FIELD RUN: _pending_.

## W283 — A4 periodic last-known cadence stated, declared once, Decision Brief delivered (2026-09-30)
- Pre-flight vs code (rail3-integration cb996be): `LAST_KNOWN_WRITE_INTERVAL_MS = 60000` was a non-exported
  const in useFleetPositions with one caller (the onLocation throttle); the stop transition resets the clock;
  the W282 beacon raise writes the same row without resetting it; departure nulls last_lat/last_long/last_ping
  (the ticket's "nulls it (D87)" is accurate for those three fields). Every write is an UPDATE on ONE row scoped
  by ride_id + live uid through lib/lastKnown.ts — single-row overwrite confirmed, never accumulated.
- Done: constant moved to `src/lib/lastKnown.ts` (exported, with the bound and rationale in its comment),
  imported by useFleetPositions; brief at `docs/rail3/decision_briefs/a4_last_known_cadence_decision_brief.md`
  proposing 60 s within [30 s, 120 s] — ceiling = the committed 30 s Stopped/Inactive ping interval (the
  persisted row must never be a denser channel than the ephemeral one it backs up), floor = the 2-min Stopped
  threshold (a quiet rider is rendered where they were within one ladder rung, R3-62). No Pillar edited; the
  number lands in §12.2 by the TPM after Senior PM confirmation (brief §6).
- Surfaced, not fixed: hard-purge-location nulls last_lat/last_long/phone but NOT last_ping (nor beacon_active)
  while R3-36 lists all three — recorded in the brief §5 for the R3-36 purge extension (W259 sequencing).
- Tests: no new node test — lastKnown.ts imports the supabase client (react-native-url-polyfill) and cannot load
  under node; verification is `grep -rn LAST_KNOWN_WRITE_INTERVAL_MS mobile/src` (one declaration, one import,
  one use) + tsc. `npm test` 104 tests, 102 pass (same 2 stack files); tsc only the 2 pre-existing deepLinkAuth.
- Remaining: Senior PM confirms the value (verification step 3); Management API single-row check after the next
  field ride (step 1). The code half needs no device.

## W284 — Always-on telemetry tier + operator-level config (slate 6, §8.5, items 20/22, F-7) (2026-09-30)
- Pre-flight vs code (rail3-integration 2963104): no `rail3_telemetry*` / `rail3_operator_config` object existed in
  the repo or on staging; bgGeo bound onLocation/onMotionChange/onHeartbeat ONLY (the ticket's onEnabledChange /
  onProviderChange were not bound); bgGeo is ride-agnostic (no rideId/tenant); our own `stopBgGeo()` disables the
  plugin, so a naive onEnabledChange(false) would have counted every clean ride end as an engine death; the purge
  function selects `status='saved' AND actual_end < now-4h` and re-selects those rides on every run, so its new
  steps must be idempotent. Staging drift noted: `rail3_sag_allowlist` exists on staging in no migration.
- Migration `supabase/migrations/20260915000000_rail3_telemetry.sql` (HELD off the prod push with the rest of the
  Rail 3 set): `rail3_telemetry_events` (tenant_id, ride_id, account_id NULLABLE for the T+4h strip, platform,
  device_class, kind, tier, client_ts, payload jsonb, created_at) with named inline CHECKs — platform ∈
  {android, ios}, tier ∈ {always_on, full_capture}, always_on kind ∈ exactly the three counters (full_capture may
  carry other lifecycle names), payload must be an object, and a schema-level scope boundary
  `NOT (payload ?| ARRAY['lat','lng','long','latitude','longitude','coords','path'])`; RLS: ONE policy, INSERT for
  authenticated `WITH CHECK (tenant_id = get_my_tenant_id() AND account_id = auth.uid())` (identity pinned — the
  D77 lesson from analytics_events); NO select/update/delete for authenticated (reads are service_role only, no
  rider-facing surface); grants INSERT→authenticated, full CRUD→service_role. `rail3_operator_config` keyed by
  platform with `full_capture_ride_id` (FK rides, ON DELETE SET NULL) and the reserved nullable slate 4 clocks
  (`startup_ceiling_s`, `steady_state_threshold_s`, populated by W285); SELECT USING(true) + SELECT grant for
  authenticated, writes service_role only; android + ios rows seeded (ios empty). supabase-patterns: Pattern 1 —
  the only predicate is the SECURITY DEFINER `get_my_tenant_id()` over account_tenants, no policy reads its own
  table or ride_participants (no recursion surface); Pattern 5 — IF NOT EXISTS / DROP POLICY IF EXISTS /
  ON CONFLICT DO NOTHING; Pattern 7 — explicit role-matched grants.
- LLD: pure/IO split so the guard is node-tested — `src/lib/telemetryPure.ts` (COORDINATE_KEYS, recursive
  `hasCoordinateKeys` / `sanitizePayload` (never throws; non-objects → {}), `isFullCaptureEnabled` (per ride,
  never fleet-wide), `classifyEngineRun`, `deviceClass` = "<manufacturer>/<model>" lowercased, whitespace → '-',
  never a device id) and `src/lib/telemetry.ts` (`loadOperatorConfig()` once per ride open, cached, offline keeps
  the previous cache; `recordCounter(rideId, kind, payload?)` always_on; `fullCaptureEvent(rideId, event,
  payload?)` no-op unless the flag names THIS ride; `resetTelemetryIdentity` on a user-id delta, wired beside
  resetMeasureIdentity in AuthContext). Bare `.insert()` (return=minimal) because authenticated has no SELECT.
  NOT the analytics_events 'query_timeout' carrier (staging-only, stripped for prod).
- LLD: bgGeo gains a 5th optional `onEngineEvent` callback (W279 precedent; bgGeo stays ride-agnostic — the
  caller useFleetPositions owns rideId and records the counter). `engine_started` reported after `BG.start()`
  resolves (detail: cold_start, saver_on). `onEnabledChange(false)` / `onProviderChange(!enabled)` bound ONCE in
  the listenerBound block → `engine_died` with `reason` = enabled_false | provider_disabled (F-7 split), guarded by
  `stopping` (set before our own stop(), cleared in finally), `engineRunning` (ignores a stale enabledchange from a
  not-awaited previous stop on warm restart) and `diedReported` (one-shot per run). Never awaited, never gates
  start/beacon/teardown. `warning_fired` is W285's via `recordCounter`; API only here.
- hard-purge-location: after the participant purge, DELETE full_capture rows and `account_id = NULL` on
  always_on rows for the selected rides (both filtered so re-runs are no-ops), and clear
  `rail3_operator_config.full_capture_ride_id` for purged rides; errors logged, not thrown (a 42P01 before the
  migration is pushed must never revert the participant purge). Response carries a `telemetry` block. No pg_cron
  (deferred D2 set). NOT type-checked locally — deno is not installed on this machine; review by reading.
- F-7 outcome (RECORDED, no fourth counter): the three counters distinguish never_engaged ({}), torn_down
  ({started, died}; reason splits plugin-disabled from location-services-off) and {started} without died. The
  last bucket is `suspended_or_healthy`: an OEM-killed process runs no JS (nothing is emitted), so an OEM
  suspension, a healthy run and a started-but-no-fix run are INDISTINGUISHABLE from the floor alone — the fix
  signal lives only in the staging-only sink (engine_first_fix). R3-45's third clause is therefore NOT satisfied
  by the always-on floor by itself → returns to the Brain per F-7. Observation for the Brain (not built): W285's
  `warning_fired` payload could carry `fixes_seen` (a count, never coords) to split never-engaged (0) from
  suspended (>0) without a new counter.
- Tests: tests/telemetry.test.mjs (8: guard top-level/case-insensitive/nested/arrays/non-objects/cyclic, classifier
  incl. the F-7 equivalence, gating, device class); tests/rlsIsolation.test.mjs +9 schema-guarded (same-tenant
  insert ok; cross-tenant insert 42501; foreign account_id 42501; foreign-tenant ride 42501; authenticated read
  42501 by design; coordinate payload 23514; config readable by authenticated; config write 42501; purge
  retention replica incl. no-op second run); supabase/tests/rail3_rls_isolation.test.sql
  gate lists both tables. `npm test` 112 tests, 110 pass (same 2 stack files — Docker down; the W284 DB cases run
  on the staging/CI pass). tsc: only the 2 pre-existing deepLinkAuth errors.
- Review round 1 (stride:task-reviewer, 3 important + 4 minor; recursion check passed): the two important
  acceptance findings are the F-7 return (R3-45 third clause, R3-54 last clause) and the pending field run — no
  code change, recorded. Taken: (a) INSERT policy is now ride-scoped too — new SECURITY DEFINER
  `rail3_ride_tenant_id(uuid)` over rides (STABLE, search_path pinned, EXECUTE to authenticated/service_role) and
  `AND tenant_id = rail3_ride_tenant_id(ride_id)` in WITH CHECK, so a tenant-A member cannot file rows against a
  tenant-B ride uuid (+1 RLS case); (b) the purge retention step now has a skip-guarded integration test that
  replicates the function's three statements as service_role and asserts delete / strip / config clear and a
  no-op second run; (c) `fullCaptureEvent` now has call sites — engine lifecycle, engine_first_fix (ids/deltas)
  and heartbeat_check (movedM is a distance) are mirrored into the full-capture tier when the flag names the ride,
  so the toggle is observable; (d) the purge's config-clear statement surfaces its error into the same
  logged-not-thrown catch; (e) the stray `supabase/.temp/cli-latest` CLI marker dropped from the diff (consider
  gitignoring `supabase/.temp/` in housekeeping).
- Review round 2 (2 important = the F-7 / field-run acceptance items, unchanged by design; 2 minor FIXED after the
  two-round cap without a third agent round — stated here and on the PR): the purge replica's status flip fires
  `trg_ride_closed`, whose analytics_events row (tenant FK) blocked the fixture's tenants delete → after() now
  removes those rows first; `fullCaptureEvent` awaited nothing, so the first mirror on a flagged ride raced the
  config REST round-trip → the full-capture path now awaits the in-flight `loadOperatorConfig` promise before
  gating (counters and the engine still never wait).
- Residue: the config read exposes the full-capture ride uuid to any signed-in rider (no position data; noted);
  `get_my_tenant_id()` is LIMIT 1 without ORDER BY (pre-existing single-tenant assumption, same as
  analytics_events). Field validation (counters on a healthy ride; engine_died on a force-stopped FGS while the
  app lives; full-capture toggle per ride) pending on the next field build, batched with W279–W282 — this also
  needs the migration pushed to staging first. FIELD RUN: _pending_.

## W286 — Device-side recovery chain: heartbeat engine re-assert + Android headless re-assert (B1 device-side) (2026-10-03)
- Pre-flight vs code (rail3-integration 2ecfc6b): onHeartbeat never read `getState().enabled` and its `engineMoving`
  early-return (stale-true after a death) preceded any place a check could go; readyConfig had no `enableHeadless`
  and nothing registered a headless task (index.ts was just registerRootComponent); R3-67 HOLE — nothing cleared
  the active-ride holder on Leave Ride (RideMapScreen beforeRemove only broadcast the departure; clears existed only
  at sign-out and on a user-id delta), so a durable holder would have re-engaged a departed session; fullCaptureEvent
  is a no-op on a cold config cache (a headless JS context starts cold). SDK v5.2.0: `registerHeadlessTask` is typed
  in @transistorsoft/background-geolocation-types; `enableHeadless` defaults false; Android heartbeat floor 60 s.
- LLD: `src/lib/headlessLogic.ts` (pure, node-tested) — durable-holder (de)serialisation that fails CLOSED,
  `decideHeadlessAction` (no ride → noop = R3-67 "de-registered", since AppRegistry registration is permanent; Saved
  or purged ride → noop; terminate → A4 last-known write (+ re-assert if disabled); heartbeat/providerchange →
  re-assert only when disabled), `decideForegroundHeartbeat` (stopping wins), `buildWakeAttemptPayload` (device
  state only, err truncated, never a coordinate key).
- LLD: durable holder in AsyncStorage `rail3:active-ride` written by `setActiveRide` beside the in-memory one;
  `clearActiveRide` clears both (sign-out / identity delta, unchanged call sites); NEW `clearPersistedActiveRide` on
  the Leave path (RideMapScreen beforeRemove, issued before the departure broadcast — covers back chip, D57
  auto-leave, End Ride goBack); `readPersistedActiveRide` for non-React callers. The engine effect's cleanup does
  NOT clear it (a D77 remount / backgroundReady flip is not a departure); the in-memory holder still survives
  unmount for the D87 sign-out departure. D91 deps `[backgroundReady, rideId, myRiderId]` untouched; R3-39 onResume
  nudge untouched (the fallback).
- LLD: bgGeo `reassertEngine` — start() + changePace(true) DIRECTLY (not startBgGeo, which would overwrite handler
  refs and re-open the first-fix run); sets engineRunning/engineMoving, resets diedReported so a later second death
  reports; `stopping` wins; reports `engine_started{reason:'heartbeat_reassert'}` (an always-on counter) and
  `wake_attempt` (full-capture only — `useFleetPositions` never counts it). onHeartbeat now reads `getState()` FIRST
  and re-asserts on enabled:false, else runs the D88 self-check as before. `enableHeadless: true` added to
  readyConfig (requires stopOnTerminate:false, already set; JS-only, OTA-able).
- LLD: `src/lib/headlessTask.ts` is import-light (react-native + types at bundle eval; the SDK required ONCE at
  registration in try/catch — the one eager addition to the launch path, unavoidable for registerHeadlessTask;
  supabase / telemetry / lastKnown / activeRide / headlessLogic `require`d inside the task — the D87 OTA-rollback
  launch-safety rule), registered from index.ts BEFORE registerRootComponent, Android only. Per event:
  `isRecoveryEvent` gate FIRST (heartbeat / terminate / providerchange only — every other SDK event exits before
  any read or write) → durable ride (none → silent return) → session gate (`getSession()`; none or a different uid
  than the holder's rider → return, no write — D77; the headless context is the only live refresher while it runs
  and the writers' further getSession calls are lock-serialised in-context) → `rides.status` via
  REST (unknown → accept) → `getState()` → decide → `loadOperatorConfig()` (cold cache) → re-assert
  (start + changePace + awaited `engine_started{headless_reassert}` counter) and/or A4 last-known via
  `getCurrentPosition({samples:1, persist:false, timeout:30})` + `persistLastKnown(..., 'headless')` → awaited
  `wake_attempt` row (incl. `skipped_saved` / `noop` evidence). Every write AWAITED because the SDK finishes the task
  when our promise resolves → `telemetry.ts` gained awaitable `writeCounter` / `writeFullCaptureEvent` (the
  fire-and-forget wrappers delegate to them). No Alert/notification: a completed self-heal is silent (R3-48).
- Mechanism facts (NOT a ratified recovery window — R3-42's source note is "UNTRACED — Brain-session item" and §12.2
  carries no value): Android heartbeat floor 60 s → effective device-side window ≈ heartbeat interval + start()
  latency; the headless task fires only while the FGS lives (heartbeat / terminate / providerchange under
  stopOnTerminate:false + enableHeadless:true); in-process `enabled:false` heartbeats are rare (heartbeats ride the
  FGS), so the headless path is the primary R3-42 mechanism and the foreground one is the cheap guard; an OEM that
  kills the FGS outright runs no JS → NON-RECOVERABLE device-side (captain-side silence detection now; server-side
  staleness detector + FCM wake explicitly deferred behind B2's scheduler, Ledger B1). autoSync stays excluded.
- Review round 1 (stride:task-reviewer, 1 important + 3 minor, all taken): non-recovery events reached the
  decision only after the whole I/O prelude and then wrote a `noop` wake_attempt row per fix → `isRecoveryEvent`
  gate before any I/O; `reassertEngine` set engineRunning/diedReported only after BOTH start() and changePace()
  → set right after start() resolves (a pace failure is now its own outcome `ok_no_pace`, the engine state is
  never mis-stated); a heartbeat whose getState() was in flight during our own stop() could re-assert the engine
  we just stopped once `stopping` reset in finally → new `engineSession` flag (set after start(), cleared at the top
  of stopBgGeo, never reset) is a required input of `decideForegroundHeartbeat`; launch-safety and session
  narratives corrected (the SDK IS required once at registration; the headless context is the only live refresher
  and in-context getSession calls are lock-serialised).
- Review round 2 (approved; 1 minor taken): the headless re-assert now mirrors the foreground split — start() alone
  decides success, the `engine_started{headless_reassert}` counter is written as soon as it resolves, and
  changePace(true) is its own step reported as `ok` / `ok_no_pace` — so both paths agree on the same condition.
- Residue / notes: `enableHeadless` also delivers `location` events headless — they exit before any read or write
  (noted as a future A4 carrier, not built); a stale durable holder after a crash is mitigated by the `rides.status` check (Saved → noop);
  REST failure → accept the re-assert. supabase.ts:33's comment still mentions a TaskManager path that no longer
  exists (left as is).
- Tests: tests/headlessTask.test.mjs (10: holder round-trip + fail-closed parsing, recovery-event predicate, decision
  matrix incl. Saved/purged and unknown events, foreground decision incl. the engine-session guard, wake payload
  w/o coordinates). `npm test` 122 tests, 120 pass (same 2
  stack files); tsc: only the 2 pre-existing deepLinkAuth errors.
- Field validation (active ride → swipe-away → expect `wake_attempt` / `engine_started{headless_reassert}` rows and a
  `last_position_write{trigger:headless}`; Leave Ride → swipe-away → ZERO rows; service disabled while the process
  lives; FGS killed by OEM = documented non-recoverable) pending on the next field build (needs the W284 migration on
  staging). FIELD RUN: _pending_.

## W287 — Device-side convergent ride-end teardown (slate 13, A2, item 14; R3-69/35/67/70) (2026-10-03)
- Pre-flight vs code (rail3-integration c63869d): only two ride-end paths existed, both foreground + Alert — the D57
  RIDE_ENDED broadcast handler and a ONE-SHOT `ride.status` read on open (useRideDetails never re-reads, so it could
  not converge); NO connectivity signal exists (no NetInfo dependency — none added, a native module means a new
  build) so "connectivity resumption" is approximated by the W269 resume sources clockgap + stale (+ appstate);
  `rides.status` enum is created|active|saved — 'purged' is a PARTICIPANT status, so the headless 'purged' branch
  was dead; useRideChannel has no remove API (teardown = unmount) and its resume rebuild is unconditional; the
  headless task already read rides.status but returned noop on Saved; `nudgeBgGeo` guarded only on `configured`,
  so a resume would have poked a torn-down engine back; R3-70 HOLE: today's ride-ended goBack fired beforeRemove →
  broadcastDeparture → NULLED last_lat/last_long/last_ping, wiping a last-known that must persist to T+4h.
- LLD: `src/lib/rideEndCheck.ts` (pure, node-tested) — `shouldTearDown` = 'saved' ONLY (A2: affirmative read; null /
  unknown never); bounded jittered retry (3 attempts, 1 s base, 4 s cap, [base/2, base), injectable rand/sleep) —
  a failed read yields null and the NEXT signal retries, never strands, never tears down;
  `decideRideEndAction` (saved + foreground → notify with the existing Alert, the A2 foreground-only notification;
  backgrounded or Captain → silent); `shouldReadStatusOnBeat` (every beat when the engine is disabled — the read
  replaces a blind re-assert on a Saved ride; every 3rd beat when enabled, ≈3 min worst-case background convergence
  on the 60 s heartbeat floor, bounded by the inactivity backstop). `src/lib/rideStatus.ts` = the one shared REST
  read (throws on error so retry engages; missing row → null).
- LLD: `src/hooks/useRideEndWatch.ts` — on mount, on every resume signal (`useResume`, consumer 'ride_end'), and on
  the D57 RIDE_ENDED broadcast (now a TRIGGER for the read, never the decision): read with retry → decide → on
  Saved: `endedRef` (idempotent), `clearLocalBeacons()` (NEW on useBeacons; local only — D81, R3-70),
  `clearPersistedActiveRide()` (R3-67), evidence row `ride_end_teardown{trigger, action}`, Alert only when
  foregrounded, `navigation.goBack()` → unmount removes the channel (useRideChannel cleanup) and stops the engine
  (useFleetPositions cleanup → stopBgGeo). Single-flight guard. RideMapScreen's one-shot effect removed.
- R3-70 fix: `broadcastDeparture(rideId, riderId, { clearLastKnown })` — on a ride-END teardown (`endedRef`, incl.
  the Captain's own End Ride via a new `onRideEnded` prop on RideControls) the 'departed' broadcast still goes out
  but last_* are NOT nulled; a mid-ride Leave clears them as before. Fixes the pre-existing D57 behaviour too.
- Heartbeat / headless: bgGeo's beat reads `getState()` then, per `shouldReadStatusOnBeat` and single-flight,
  the durable holder → session gate (uid === holder.riderId) → `readStatusWithRetry(fetchRideStatus)`; on Saved
  (and not `stopping`): evidence `wake_attempt{outcome:'torn_down_saved', reason:'saved'}` BEFORE stopBgGeo drops
  the refs → `clearPersistedActiveRide()` → `stopBgGeo()` (engineSession=false → no re-assert) → return; null →
  the W286 re-assert / D88 path unchanged. `beatIndex` reset per run so the first beat reads. Headless:
  `decideHeadlessAction` returns 'teardown' on 'saved' (any recovery event, enabled or not): `BG.stop()` FIRST,
  holder cleared on success only (a failed stop keeps the holder so the next beat retries rather than going inert
  with the engine streaming) → `wake_attempt{torn_down_saved}` / `teardown_failed`; no re-assert, no last-known
  write, no rider-facing surface. R3-39 nudge gated on new `isEngineSessionActive()` (bg_nudge payload records
  `skipped`).
- Explicitly OUT (slate 13 / B2): the server-initiated wake fast path (FCM) and the staleness detector. Accepted
  limit recorded: a device with neither connectivity nor focus continues until one changes, bounded by the
  inactivity backstop. BG.stop() dismissing the Android FGS notification is NOT documented in the SDK types on disk
  → device validation item (R3-35).
- Tests: tests/rideEndCheck.test.mjs (6: saved-only matrix, jitter bounds + cap, retry then answer with bounded
  sleeps, exhausted → null / null row = answer, foreground action matrix, beat cadence); headlessTask.test.mjs
  Saved case rewritten for 'teardown' (every recovery event × enabled, 'purged' no longer special, no holder / non-
  recovery event → noop). `npm test` 128 tests, 126 pass (same 2 stack files); tsc: only the 2 pre-existing
  deepLinkAuth errors.
- Review round 1 (stride:task-reviewer, approved; 4 minor, all taken): the in-process heartbeat teardown now mirrors
  the headless order — `stopBgGeo()` returns a boolean and the durable holder is cleared only on success (a failed
  stop keeps it so the next beat retries; evidence `teardown_failed`); `fetchRideStatus` carries an 8 s deadline
  (`withTimeout`) so a hung request counts as a failed attempt and the single-flight guards are always released, and
  `statusReadInFlight` resets per run; bgGeo imports supabase / rideStatus / clearPersistedActiveRide statically
  (bgGeo is itself lazily required, so this is launch-safe — the lazy-require rule is the headless task's); the
  watch's mount read waits for the ride row (`ready`), so a Captain opening an already-Saved ride is never shown the
  non-captain Alert because the role was still a pre-load default.
- Field validation (pocketed + airplane → connectivity resumes; backgrounded → focus; Captain Leave does NOT tear
  down; SOS cleared on end; inactivity auto-close converges without RIDE_ENDED; FGS notification clears silently)
  pending on the next field build (W284 migration on staging first). FIELD RUN: _pending_.
