# Rail 3 Mobile — Log of Changes (LLD decisions)

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
