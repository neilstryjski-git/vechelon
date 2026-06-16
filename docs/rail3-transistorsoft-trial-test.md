# Rail 3 — Transistorsoft Background-Geolocation Trial: Field-Test Log

Running record of the RC4 engine-swap trial (expo-location → Transistorsoft
`react-native-background-geolocation`). Purpose: validate **live position broadcast while the
phone is pocketed / screen locked** — the core Rail 3 capability expo-location could not deliver.

- **Stride:** W203 (engine swap), W204 ($399 license decision, gated on this trial). Goal G27.
- **Branch:** `fieldbuild` (worktree). **Build under test:** EAS `6576c9f0` (commit `a5dc72c`).
- **Build type:** standalone **DEBUG** APK (Transistorsoft runs unlicensed in debug — "try before
  you buy"). `debuggableVariants=[]` embeds the JS bundle (no Metro tether); `expo-dev-client`
  removed so it boots straight into the app.
- **Device:** Samsung SM-S911W (Galaxy S23), Android 16.

## Engine configuration (mobile/src/lib/bgGeo.ts)
- `desiredAccuracy: HIGH`, `distanceFilter: 0`, `locationUpdateInterval: 5000` (5 s target),
  `disableElasticity: true`, `disableStopDetection: true`, `foregroundService: true`.
- `changePace(true)` on start (force "moving" so it streams immediately).
- `debug: true` → **audible chirp on each GPS fix** + verbose logs (debug-only; removed for release).
- Transport unchanged: each fix → our REST broadcast on the rail3 topic + the measurement sink
  (`gps_ping`, `src:'tsbg'`). Receivers, §4.1, instrumentation all unchanged.

---

## Test 1 — 2026-06-15 (~10:08 local) — screen-locked, STATIONARY (at desk)

**Method:** signed in, joined a ride, locked the screen, sat at desk (no walking).

### Objective result (from the measurement sink)
- **36 `tsbg` pings over ~4.3 min** (10:08:34 → 10:12:51), **steady ~7 s cadence**, one brief
  33.7 s hiccup mid-stream. States: 30 `active`, 6 `stopped`.
- **Continuous streaming through a LOCKED screen** — no wake-burst, no multi-minute silence.
  This is the behaviour expo-location never achieved (it batched under Doze; see
  rail3-forward-plan / earlier walks: saffron/30ab showed wake-time bursts only).
- Stream **stopped ~1.8 min after the last ping** once the device sat motionless.

### Interpretation
- ✅ **Doze defeated.** Live background streaming while locked is real.
- ⚠️ **Cadence ~7 s, not the configured 5 s** — Transistorsoft applies its own throttling;
  ~7 s is fine and tunable.
- ℹ️ **Stop = by design.** Transistorsoft is a *motion-detection* engine: a motionless device
  enters stationary mode and pauses GPS to save battery. `disableStopDetection`/`changePace`
  kept it alive ~4 min, but a truly motionless phone idles anyway. **Expected to resume on
  movement** (motion wakes it; may take a few seconds to ~30 s to confirm real motion).
- ❓ Battery setting during this test (Optimized vs Unrestricted) — **TBC** (record below).

---

## Test 2 — 2026-06-15 (~10:19–10:51 local) — walk + repeated lock/unlock cycles

### Neil's observations (verbatim)
1. The pings didn't just start again. When I started walking I **unlocked the screen** (Vechelon
   app focused) — there were 'tring' noises, then the 'chirps' started again.
2. I locked the screen and noticed the chirps stopped again, after about 15.
3. I unlocked again and saw a **'blocked channel'** (or similar) message; it cleared, then the
   chirps started again.
4. Same test — locked screen, counted chirps: inconsistent, **somewhere between 10–15 chirps the
   app would stop broadcasting**, each time with the same message.
5. Kept the screen **unlocked** → the channel message **didn't reappear** → the event is tied to
   the **lock screen**.
6. On one test, a **'trying to rejoin'** message — I had to **end the ride and start a new one**.
   → Can we make this reconnection more persistent / successful?
7. Final part of the walk with the **screen unlocked → chirps didn't stop.** Ended the ride at the
   doorstep.
8. On my desk now, **unlocked + stationary → ~30 consistent chirps** → **disproves the
   "chirps stop after non-movement" hypothesis.**

### Objective result (sink) — streaming segments split by >20 s gaps
| Window | Duration | Pings | Then |
|---|---|---|---|
| 10:08:34–10:11:15 | 162 s | 25 | gap 34 s |
| 10:11:49–10:12:51 | 62 s | 11 | **gap 414 s** (locked, idle) |
| 10:19:45–10:20:47 | 62 s | 16 | gap 22 s |
| 10:21:09–10:28:13 | **424 s** | 86 | gap 81 s |
| 10:29:34–10:40:30 | **656 s** | 141 | gap 100 s |
| 10:42:11–10:43:08 | 58 s | 13 | gap 30 s |
| 10:43:38–10:50:53 | **435 s** | 60 | (ongoing, unlocked) |

352 `tsbg` pings / 45 min. **Long segments (7–11 min) = screen UNLOCKED; short ~60 s segments =
LOCKED then stops.**

### CORRECTED interpretation (Test 1's "motion" hypothesis was WRONG)
- ❌ **Not motion.** Obs. 8 + the 7–11 min unlocked-stationary segments prove a motionless device
  streams fine **as long as the screen is unlocked**.
- 🔴 **The gate is SCREEN LOCK (background).** Unlocked = continuous indefinitely. **Locked =
  streams only ~60 s (~10–16 pings) then STOPS.** The background FGS is being throttled/suspended
  after ~1 min — Doze/battery, despite the foreground service.
- 🔴 **Realtime channel doesn't survive background.** On lock the Supabase Realtime channel drops
  → "blocked channel" / "trying to rejoin" on resume, and **once it degraded badly enough Neil had
  to end+restart the ride** (obs. 6). NOTE: `tsbg` SENDS go via REST, so the sink keeps data even
  when the channel is blocked — this is the RECEIVE/subscription + rider-session resilience, a
  **separate** issue from the location sustain.

### Two distinct issues identified
- **ISSUE A — Background location sustain (PRIMARY):** locked → ~1 min → stops. Candidate causes:
  battery optimization NOT "Unrestricted" (Doze throttles the FGS), and/or Transistorsoft config
  (`preventSuspend`, `heartbeatInterval`). **#1 thing to try: set Vechelon → Unrestricted and
  re-test (free, no rebuild).**
- **ISSUE B — Realtime channel resilience on background/resume:** make `useRideChannel` auto-rejoin
  robustly so a lock/unlock never forces a ride restart (obs. 3,4,6). Likely a Stride defect.
  Two app-surfaced messages (paraphrased): **"blocked channel"** (lock-screen related) and
  **"trying to rejoin"** (Neil suspected network, but **confirmed the phone still had working
  internet** — so NOT connectivity). → The Supabase Realtime websocket is suspended on background;
  on resume the channel fails to re-establish *despite internet*. Prime suspect: the **auth token
  expired while backgrounded**, so the rejoin can't re-authorize the private channel. Likely fix:
  on AppState→active, **refresh the session + `realtime.setAuth(freshToken)` + re-subscribe** the
  channel (and a bounded auto-retry) so no ride restart is ever needed.

---

## Open questions & tuning decisions
1. **Battery setting during these tests — Optimized or Unrestricted? (TBC — likely the cause of
   Issue A.)** Garmin (live tracking) runs Unrestricted on this device; ours probably needs it too.
2. **Channel auto-rejoin** (Issue B): reconnect without ride restart; how long to retry.
3. **Cadence** ~5–7 s — acceptable? (TBD)
4. **Release hygiene:** turn off `debug` (chirp + debug notifications) before any release build.

## Status / next
- ✅ **Foreground/unlocked streaming: fully working** (continuous, even stationary).
- 🔴 **Locked/background sustain: NOT yet solved** (~1 min then stops) → Issue A.
- 🔴 **Channel resilience on lock: needs work** → Issue B.
- **Next:** (1) set Unrestricted battery + re-test the locked case (free); (2) if still ~1 min,
  tune Transistorsoft (`preventSuspend`/heartbeat); (3) fix channel auto-rejoin (Issue B).
- License **W204** stays gated until locked-background sustain is proven.

---

## Test 2 — deeper diagnosis (2026-06-15, follow-up)

**Eliminations (data-backed):**
- **Battery RULED OUT.** Neil confirmed Vechelon was on **Unrestricted** *during* the tests, yet
  locked streaming still died ~1–2 min. So it is NOT battery-optimization/Doze-via-battery.
- **Motion RULED OUT.** Sink `state` at segment tails: locked segments stopped whether `active`
  OR `stopped`; unlocked segments sustained whether `active`, `stopped`, OR `inactive` (one ran
  16 min unlocked while idle). The gate is purely **screen-lock / background**, not movement.
- **Channel-denial is NOT what stops the location.** Two proofs: (1) the chirp is a NATIVE event a
  channel/token denial can't silence; (2) `seq` advances only a tiny fraction of expected across
  locked gaps → the location callback was suspended, not "firing but denied." Confirmed for BOTH
  the old (expo) and new (Transistorsoft) engines — they hit the SAME wall.

**ISSUE A unified hypothesis:** chirps (native) AND the channel (websocket) both freeze on lock and
both revive on unlock → the **whole app process is being suspended in the background ~1–2 min after
lock**, despite the FGS + Unrestricted battery. The location chirps stop at ~1–2 min, BEFORE the
5-min token expiry — so this is process suspension, independent of the token. **Open key question:
does the "sharing your position" FGS notification appear and STAY while locked?** Stayed → debug
build or Samsung deep-suspension; vanished → FGS not holding (config-fixable). **Debug-build
catch-22 risk:** may not be fully provable on a free debug build; a release build (needs $399
license) can behave differently in the background.

**ISSUE B root cause FOUND + mitigated:** the message is **"channel denied"** (a realtime
private-channel AUTHORIZATION failure), appearing when the app loses focus, clearing on focus.
Cause: staging **`jwt_exp` was still 300 s (5 min)** — a leftover test artifact — so JWTs expired
fast and a backgrounded socket couldn't re-authorize. **Reverted `jwt_exp` → 3600** (prod-realistic).
This should make "channel denied" rare in a normal ride (1-hour token vs 5-min). Robust fix still
wanted: on AppState→active, refresh session + `realtime.setAuth(fresh)` + re-subscribe so a
lock/unlock never forces a ride restart (obs. 6).

**UPDATE:** "channel denied" still appeared **after** the `jwt_exp`→3600 revert, quickly on
backgrounding (not after ~1 h). → It is NOT token *expiry*; it's the realtime client failing to
**re-authorize the private channel on resume** AND/OR a **co-symptom of the same whole-process
background suspension** that stops the chirps (both the websocket and native GPS freeze together
on background). Fix still = re-auth + re-subscribe on resume; but the deeper blocker is the
background process suspension (Issue A).

**ISSUE A — notification permission was a GAP, not the cause.** Enabling Android notifications made
the "sharing your position" FGS notification finally appear (it had never shown), but locked
streaming **still stopped at ~1–2 min** with the notification visible. So: battery, motion, token,
AND notification-permission are all eliminated. The FGS is now visibly running and the process is
STILL suspended. Remaining suspects: **Samsung deep-sleep list** (separate from battery
Unrestricted — TEST: add to "Never sleeping apps"), or **debug-build** background limitation
(would need a release build = $399 license to disprove). Next cheap step before spending:
Samsung "Never sleeping apps" + capture Transistorsoft on-device logs (records WHY it stops).

---

## 🎯 ROOT CAUSE FOUND (2026-06-15) — it was OUR code, not Samsung/debug/battery

Decisive on-device observation: when the chirps stopped, the **FGS notification VANISHED** (service
killed, not frozen). And `useFleetPositions.ts` line 318 had the background-location effect **gated
on the realtime channel `status === 'SUBSCRIBED'`, with `status` in its deps.**

**The chain:** screen-lock → websocket channel drops → `status` leaves `'SUBSCRIBED'` (the "channel
denied" message) → the bgGeo effect re-runs, its guard fails → **cleanup runs `stopBgGeo()`** →
foreground service torn down → notification vanishes, all location stops (~1–2 min after lock,
however long the channel takes to error on background). **Unlock** → channel re-subscribes →
`status` back to `'SUBSCRIBED'` → effect re-runs → `startBgGeo()` → chirps + notification return.
That lock/unlock round-trip matched the field behavior exactly.

**Neil's original hypothesis was right:** the location stop WAS caused by the channel denial — via
this status-coupling. Battery / motion / token / notification-permission were all real-but-separate
red herrings.

**Fix (committed):** decoupled the FGS lifecycle from the channel — removed `status` from the
effect's guard AND deps. The FGS now runs for the whole ride on `backgroundReady && rideId &&
myRiderId`, independent of websocket state (broadcasts go over REST, which never needed the
channel). Stops only on leaving the ride / losing bg permission / unmount. Needs a rebuild (#5) to
validate. Issue B (channel re-auth on resume) is now lower-stakes — it no longer kills tracking,
just affects what the rider RECEIVES until the socket re-subscribes.

---

## 🏁 DECISION (2026-06-15) — expo-location can't do locked/pocketed live tracking → buy Transistorsoft

After the FGS-decoupling fix, we built a **pure expo-only release APK** (build `956cf1fe`, commit
`6770deb`, `preview` profile) to answer one question: with the fix in, does the FREE engine sustain
background tracking on its own, or is the $399 Transistorsoft license actually required? (Build path:
Transistorsoft excluded via `react-native.config.js` `platforms:null` — `expo.autolinking.exclude`
alone does NOT skip classic RN modules; `EXPO_ONLY` flag in `bgEngine.ts` hard-locks the engine;
added an `expo-av` audible chirp on every fg/bg ping since TS's debug chirp was the only beeper.)

### Two walks, two scenarios

**Walk A — "Maverick", ~46 min, battery Optimized (FALSE POSITIVE).** Sink showed 215 continuous
`fg` pings, real movement, max gap 10s, 71ms delivery — looked like a pass. But it was confounded:
the ride map holds a keep-awake wakelock, and the app stayed AppState=`active` the whole time with
only **1** background transition → the screen was effectively **ON** (set down without a power-press).
Not a true screen-off test.

**Walk B — Unrestricted battery, power-button lock (CLEAN, DECISIVE).** 38-min walk:
- Foreground, screen on (17:40–17:47): `fg` pings flowing. ✅
- Off-focus / switched apps (17:47–17:54): **6-min gap, ZERO pings.** ❌
- Screen genuinely locked (17:54–18:18): **24-min gap, ZERO pings.** ❌

57 pings total, all `fg`, **zero `bg`**, despite `bg_start ok=true`. **10** background transitions
(vs Maverick's 1) — confirming the screen was truly off this time. The expo background FGS task
delivered nothing while the screen was off — not even a batched dump.

### Verdict
**The free expo-location path cannot deliver live position with the screen off / app backgrounded.**
It's an OS-level limitation (Android freezes the JS background task under Doze with the screen off);
there is no free code fix. Live pocketed tracking is the core Rail 3 requirement, so **Transistorsoft
($399 Starter + optional $199/yr for ongoing OEM/Android updates) is justified.** Neil: "that seems
unambiguous."

### Path back to a working Transistorsoft build
The dual-engine code already exists (engine A/B toggle). To rebuild the TS path: delete
`react-native.config.js`, restore the two TS plugins in `app.config.ts`, drop the package.json
autolinking exclude, flip `EXPO_ONLY=false` in `bgEngine.ts`. The jitpack flake that killed 3 builds
is now understood: `tsbackgroundfetch`/`tslocationmanager` resolve via wildcard (`+` / `3.+`) which
makes gradle enumerate the Cloudflare-walled jitpack metadata endpoint. Pin the concrete versions
(`tsbackgroundfetch:4.1.1` from mavenCentral, etc.) via `resolutionStrategy.force` so gradle never
queries jitpack.

---

## ✅ POSITIVE-POSITIVE CONFIRMED (2026-06-15) — Transistorsoft passes all scenarios, incl. app-switch

TS validation build (EAS `c6fb6149`, commit `bd16e40`, `trial` debug profile — TS free unlicensed,
dual-engine toggle defaulted to `tsbg`). Two-device walk (gmail `e61000b4` + rogers `6970b912`),
local times:
- 19:55 start walking, screen on, Vechelon focused
- 20:05 locked screen, Vechelon still focused
- **20:15 opened RWGPS recording a ride, LEFT it focused → Vechelon backgrounded**
- 20:34 ended ride

Sink (`tsbg` pings, max inter-ping gap per phase):

| Phase | gmail | rogers |
|---|---|---|
| Screen-on, Vechelon focus | 121, maxgap 24s (GPS warmup) | 120, maxgap 5s |
| Locked, Vechelon focus | 59, maxgap 6s | 120, maxgap 5s |
| **Backgrounded behind RWGPS recording** | **261, maxgap 7s** | **232, maxgap 9s** |

**The decisive row is the last:** Vechelon backgrounded by another actively-recording GPS app —
the realistic "rider runs their bike computer" case, and the exact scenario where expo-location
froze for 24 min. Transistorsoft streamed continuously (~7–9s) on both devices. Earlier desk test
(stationary) also showed continuous `tsbg` through lock with zero gaps.

**DECISION CONFIRMED: buy Transistorsoft.** Free expo-location can't track screen-off/backgrounded
(OS Doze limitation, no free fix); Transistorsoft's native engine does, across screen-on, locked,
and app-switched — validated on real hardware. $399 Starter (+optional $199/yr) justified. The only
remaining step before a release build is purchasing the license key (debug builds run free).
