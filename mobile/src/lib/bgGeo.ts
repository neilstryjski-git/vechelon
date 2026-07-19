import type BackgroundGeolocationType from 'react-native-background-geolocation';
import type { Location } from 'react-native-background-geolocation';

import { haversineDistanceM } from './geo';
import { loadTrackingPingFlag, playTrackingPing } from './trackingPing';

// RC4 engine — Transistorsoft Background Geolocation (sole engine since W203).
//
// LAZY NATIVE BINDING: we `require()` the SDK lazily inside startBgGeo (and register
// onLocation there) rather than binding at module load. A top-level
// `import BackgroundGeolocation from ...` + a module-load `onLocation` registration would
// touch the native module the instant the bundle evaluates; deferring to first-track keeps
// import side-effect-free and is robust if the native module is ever absent (it throws at
// use, not at app start). This was load-bearing during the now-removed expo-only trial
// build (which excluded TS from autolinking); it's retained as defensive deferral.
let BackgroundGeolocation: typeof BackgroundGeolocationType | null = null;
function getBgGeo(): typeof BackgroundGeolocationType {
  if (!BackgroundGeolocation) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BackgroundGeolocation = require('react-native-background-geolocation').default;
  }
  return BackgroundGeolocation as typeof BackgroundGeolocationType;
}
//
// WHY: expo-location structurally batches background location under Android Doze (the
// saffron/30ab walks: a wake-time burst, not a live 5s stream — a documented, unfixed
// expo limitation). This SDK is the Garmin/Life360-class native engine that streams
// continuously through Doze. We do NOT use its built-in HTTP layer; we keep OUR transport
// — the same REST broadcast + measurement sink the FGS path used — so the §4.1 model and
// all instrumentation are unchanged. This module is JUST the location source.
//
// LICENSE: none here on purpose. DEBUG builds run the full SDK unlicensed ("try before you
// buy"); only a RELEASE build needs the $399 Starter key. This is the free trial engine.

export interface BgFix {
  lat: number;
  lng: number;
  isMoving: boolean;
  ts: number; // device clock at receipt (we time on client_ts, never server ingest)
}

// D88 middle-ground diagnostic: the outcome of one heartbeat self-check, surfaced to the
// caller purely for the sink (so we can confirm ON-DEVICE that the heartbeat fires and
// whether it re-engaged). Not part of the location transport.
export interface HeartbeatCheckInfo {
  engineMoving: boolean; // was the engine already moving? (then onLocation owns it; we skip)
  sampled: boolean; // did we actually take a getCurrentPosition sample this beat?
  movedM: number | null; // metres from the last fix (null if no sample / no prior fix)
  reengaged: boolean; // did we force isMoving back on this beat?
}

// D88: how far the phone must have drifted from the last fix, measured on a heartbeat while
// STATIONARY, before we force the engine back to moving. ~= distanceFilter so GPS jitter at a
// standstill (typically 10–30 m) can't false-trigger a re-engage.
const HEARTBEAT_MOVE_THRESHOLD_M = 40;

// onLocation / onMotionChange are registered ONCE (the first time tracking starts), then
// persist for the process — so we route them through swappable refs rather than
// re-subscribing per ride (re-subscribing would stack listeners: the duplicate-handler bug
// we saw on the FGS path).
let currentHandler: ((fix: BgFix) => void) | null = null;
let currentMotionHandler: ((isMoving: boolean, fix: BgFix | null) => void) | null = null;
let currentHeartbeatHandler: ((info: HeartbeatCheckInfo) => void) | null = null;
let configured = false;
let listenerBound = false;

// D88 middle-ground state. Both are updated from the onLocation / onMotionChange handlers so
// the heartbeat self-check can answer "am I already moving?" and "how far from my last fix?"
// without a round-trip to the caller. Module-level (like the handler refs) so they persist
// across rides for the life of the process.
let lastFixPos: { lat: number; lng: number } | null = null;
let engineMoving = false;

// Start high-accuracy tracking for a ride. Idempotent: ready() configures once.
//
// W261 un-force: the "for the trial" forced-streaming scaffold is GONE. We no longer set
// disableStopDetection or call changePace(true) — the SDK's native motion-activity
// detection now governs moving↔stationary, so a stopped phone goes QUIET (no redundant
// pings, the quota/traffic win) and fires an `onMotionChange(isMoving:false)` we hook to
// persist last-known position (W261). Cadence is DISTANCE-based (distanceFilter) instead of
// a forced 5s: speed-adaptive for free (tighter when fast/spread, looser when slow) with no
// state machine of ours. The optional `onMotionChange` handler is how the caller learns of
// the stationary transition. TUNING: distanceFilter (below) is a starting point to dial on a
// real ride via OTA. VALIDATION RISK (must be a BIKE incl. a slow seated climb, not a walk):
// the SDK false-judging a slow climber as stationary and dropping them from the live fleet —
// exactly the failure the forced scaffold used to paper over.
export async function startBgGeo(
  handler: (fix: BgFix) => void,
  onMotionChange?: (isMoving: boolean, fix: BgFix | null) => void,
  onHeartbeatCheck?: (info: HeartbeatCheckInfo) => void,
): Promise<void> {
  currentHandler = handler;
  currentMotionHandler = onMotionChange ?? null;
  currentHeartbeatHandler = onHeartbeatCheck ?? null;
  const BG = getBgGeo();
  // W231: hydrate the audible-ping toggle once so the onLocation hot path reads a
  // cached flag (never storage). Off by default; see trackingPing.ts.
  void loadTrackingPingFlag();
  if (!listenerBound) {
    BG.onLocation(
      (location: Location) => {
        // D88: track the live fix + moving state so the heartbeat self-check can compare
        // against them without a caller round-trip.
        lastFixPos = { lat: location.coords.latitude, lng: location.coords.longitude };
        engineMoving = location.is_moving;
        currentHandler?.({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          isMoving: location.is_moving,
          ts: Date.now(),
        });
        // W231: opt-in audible field-QA chirp on each recorded fix (no-op unless the
        // toggle is on). TS-native playSound → rings under the FGS with the screen
        // locked, without enabling debug:true's diagnostic notification.
        playTrackingPing(BG);
      },
      (error) => {
        console.warn('[Rail3][bgGeo] location error', error);
      },
    );
    // W261: the stationary transition. `event.location` is the fix AT the stop, so it's the
    // position we persist as last-known (falls back to the caller's last coords if absent).
    BG.onMotionChange((event) => {
      const loc = event.location;
      // D88: mirror the moving state + last fix for the heartbeat self-check.
      engineMoving = event.isMoving;
      if (loc) lastFixPos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      currentMotionHandler?.(
        event.isMoving,
        loc
          ? { lat: loc.coords.latitude, lng: loc.coords.longitude, isMoving: event.isMoving, ts: Date.now() }
          : null,
      );
    });
    // D88 MIDDLE GROUND — engine liveness / re-engage self-check.
    //
    // The SDK's native motion detection can silently fail to notice a rider has started
    // moving: field-observed 2026-07-18 on a Galaxy S20 FE (12-min walk, ZERO fixes) while
    // the SAME person's S23 streamed ~20 fixes on the identical walk — every permission and
    // battery setting correct on both. So rather than TRUST the motion sensor to wake us, on
    // every heartbeat while STATIONARY we actively sample a fresh position and, if we've moved
    // past the threshold, force the engine back to moving. onLocation then resumes the live
    // stream. The scenario, exactly:
    //   given isMoving is off → when the heartbeat detects GPS movement → flip isMoving on.
    //
    // Cadence: Android fires onHeartbeat during the stationary state at heartbeatInterval
    // (min 60s) OFF the FGS — no preventSuspend needed (that is an iOS requirement and, on
    // Android, would keep the device fully awake = heavy battery). Battery cost here is one
    // brief getCurrentPosition per beat while stopped — far below continuous GPS.
    //
    // BOUNDARY: this only runs if the heartbeat fires, i.e. the FGS is alive. If the OS killed
    // the FGS outright (the S20 FE's actual failure — TerminateEvent + zero native events),
    // the heartbeat won't fire either; that class is covered by the captain-side silence
    // detection (D88 layer 2), NOT here.
    BG.onHeartbeat(() => {
      // A moving engine already streams via onLocation — nothing to re-engage.
      if (engineMoving) {
        currentHeartbeatHandler?.({ engineMoving: true, sampled: false, movedM: null, reengaged: false });
        return;
      }
      void (async () => {
        let movedM: number | null = null;
        let reengaged = false;
        try {
          // HeartbeatEvent.location is last-known/stale by contract — actively sample a fresh
          // fix. persist:false so this probe doesn't itself fire onLocation (we route it
          // ourselves below only when it actually means "moving").
          const loc = await BG.getCurrentPosition({ samples: 1, timeout: 30, persist: false });
          const cur = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          movedM = lastFixPos ? haversineDistanceM(lastFixPos, cur) : Infinity;
          if (movedM >= HEARTBEAT_MOVE_THRESHOLD_M) {
            // The whole point: flip isMoving on so the SDK resumes the continuous stream.
            await BG.changePace(true);
            engineMoving = true;
            lastFixPos = cur;
            reengaged = true;
            // Route the triggering fix through the normal handler so the rider reappears live
            // IMMEDIATELY, not only on the next onLocation.
            currentHandler?.({ lat: cur.lat, lng: cur.lng, isMoving: true, ts: Date.now() });
          }
        } catch (e) {
          console.warn('[Rail3][bgGeo] heartbeat self-check failed', e);
        }
        currentHeartbeatHandler?.({ engineMoving: false, sampled: true, movedM, reengaged });
      })();
    });
    listenerBound = true;
  }
  if (!configured) {
    // v4 (Expo SDK 52-compatible) FLAT config. On Android `foregroundService: true`
    // runs the persistent-notification service that keeps GPS streaming through Doze.
    // v5's Config type is compound (geolocation/app/logger/authorization sub-groups), but the
    // legacy FLAT config below is still accepted at RUNTIME (v5.0.0 migration guide, with
    // deprecation warnings — the native layer maps the flat keys). We keep the v4-proven flat
    // config and cast through the compound type: re-nesting all ~15 keys by hand is riskier
    // (a misplaced key silently degrades tracking) than trusting the documented flat compat.
    // A full compound-config migration is a deferred cleanup (W208-class).
    const readyConfig = {
      desiredAccuracy: BG.DesiredAccuracy.High, // v5: renamed from BG.DESIRED_ACCURACY_HIGH
      // W261: DISTANCE-based cadence. ~40m is the STARTING point (tune on a real ride via
      // OTA). At road speed this sits near the old ~5s feel and tightens as riders speed up;
      // a stopped rider covers 0m → the SDK quiets and (after stopTimeout) fires the
      // stationary onMotionChange we persist last-known position from. NOT the SDK default
      // 10m (≈1s at bike speed, too chatty). locationUpdateInterval is now a provider RATE
      // CAP (a floor on spacing), not the cadence driver.
      distanceFilter: 40,
      locationUpdateInterval: 5000,
      fastestLocationUpdateInterval: 5000,
      disableElasticity: true, // pure fixed-distance filter — predictable to tune; elasticity would COARSEN at speed
      // D88: drive the onHeartbeat self-check. 60s is Android's floor (impossible to go
      // faster). No preventSuspend — on Android the heartbeat fires during the stationary
      // state off the FGS without it, and preventSuspend would keep the device fully awake
      // (heavy battery) for no gain here. See the onHeartbeat handler above.
      heartbeatInterval: 60,
      stopOnTerminate: false,
      startOnBoot: false,
      foregroundService: true,
      showsBackgroundLocationIndicator: true,
      locationAuthorizationRequest: 'Always',
      backgroundPermissionRationale: {
        title: 'Keep sharing your position while pocketed?',
        message:
          'Vechelon shares your position with your ride Captain and SAG while a ride is active, even when your screen is locked.',
        positiveAction: 'Allow',
        negativeAction: 'Cancel',
      },
      notification: {
        title: 'Vechelon — sharing your position',
        text: 'Live with your ride Captain while the ride is active.',
      },
      // W232: debug OFF. The W231 audible-ping toggle now owns the "hear tracking from a
      // pocketed phone" signal (TS playSound on each fix) — WITHOUT debug:true's developer
      // diagnostic notification, which doesn't belong in front of club riders.
      // logLevel STAYS verbose on purpose: it's the fetchable on-device diagnostic log
      // (coords + per-fix hAcc) that powers the zero-build accuracy harness — the
      // "Send diagnostic log" button (logger.emailLog) feeds tools/rail3_ts_log_accuracy.py.
      // That log is on-device only, auto-expires (logMaxDays default 3), and is pulled
      // MANUALLY (emailLog/getLog — never uploadLog), so the no-coords-on-the-server posture
      // holds. W208 takes logLevel OFF for a production release.
      debug: false,
      logLevel: BG.LogLevel.Verbose, // v5: renamed from BG.LOG_LEVEL_VERBOSE
    };
    await BG.ready(readyConfig as unknown as Parameters<typeof BG.ready>[0]);
    configured = true;
  }
  await BG.start();
  // W261: no changePace(true) — we let the SDK's motion detection decide moving vs stationary
  // rather than forcing the moving state. Tracking begins as soon as the rider actually moves.
}

// D86: re-engage tracking after a condition that can leave the SDK's native motion-activity
// detection dormant — notably ready()/start() running while Android Battery Saver was ON
// (Saver throttles the motion-activity API the engine relies on, W261). One forced 'moving'
// transition kicks the engine out of the dormant/stationary state; native detection resumes
// governing afterwards — we deliberately do NOT latch moving (that would regress W261's
// un-force). No-op if tracking was never configured, so it is safe to call anytime.
//
// EMPIRICAL: that changePace(true) fully revives a Saver-throttled engine is confirmed by the
// batched D86 field session; the call is additive and strictly better than the current dead state.
export async function nudgeBgGeo(): Promise<void> {
  if (!configured) return; // engine never initialised (or expo-only build) — nothing to nudge
  const BG = getBgGeo();
  try {
    await BG.changePace(true);
  } catch (e) {
    console.warn('[Rail3][bgGeo] nudge (changePace) failed', e);
  }
}

export async function stopBgGeo(): Promise<void> {
  currentHandler = null;
  currentMotionHandler = null;
  currentHeartbeatHandler = null;
  if (!BackgroundGeolocation) return; // never started (e.g. expo-only build) — nothing to stop
  try {
    await BackgroundGeolocation.stop();
  } catch (e) {
    console.warn('[Rail3][bgGeo] stop failed', e);
  }
}
