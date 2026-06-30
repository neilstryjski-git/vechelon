import type BackgroundGeolocationType from 'react-native-background-geolocation';
import type { Location } from 'react-native-background-geolocation';

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

// onLocation is registered ONCE (the first time tracking starts), then persists for the
// process — so we route it through a swappable ref rather than re-subscribing per ride
// (re-subscribing would stack listeners: the duplicate-handler bug we saw on the FGS path).
let currentHandler: ((fix: BgFix) => void) | null = null;
let configured = false;
let listenerBound = false;

// Start continuous high-accuracy tracking for a ride. Idempotent: ready() configures once;
// start()+changePace(true) force the "moving" state so we stream a steady cadence even at a
// stoplight (otherwise the SDK's stop-detection would pause updates and read as a gap).
export async function startBgGeo(handler: (fix: BgFix) => void): Promise<void> {
  currentHandler = handler;
  const BG = getBgGeo();
  // W231: hydrate the audible-ping toggle once so the onLocation hot path reads a
  // cached flag (never storage). Off by default; see trackingPing.ts.
  void loadTrackingPingFlag();
  if (!listenerBound) {
    BG.onLocation(
      (location: Location) => {
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
      distanceFilter: 0, // 0 → time-based on Android via the interval below
      locationUpdateInterval: 5000, // ~match the legacy PING_INTERVAL_MS
      fastestLocationUpdateInterval: 5000,
      disableElasticity: true, // steady cadence; don't auto-scale with speed
      disableStopDetection: true, // keep streaming even when judged stationary (no false gaps)
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
  // Force the moving state so we get a continuous stream for the trial (vs. the SDK
  // pausing when it decides we're stationary).
  await BG.changePace(true);
}

export async function stopBgGeo(): Promise<void> {
  currentHandler = null;
  if (!BackgroundGeolocation) return; // never started (e.g. expo-only build) — nothing to stop
  try {
    await BackgroundGeolocation.stop();
  } catch (e) {
    console.warn('[Rail3][bgGeo] stop failed', e);
  }
}
