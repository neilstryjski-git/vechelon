# Rail 3 Mobile — Log of Changes (LLD decisions)

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
