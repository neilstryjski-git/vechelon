import type BackgroundGeolocationType from 'react-native-background-geolocation';
import type { Location } from 'react-native-background-geolocation';

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
  if (!listenerBound) {
    BG.onLocation(
      (location: Location) => {
        currentHandler?.({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          isMoving: location.is_moving,
          ts: Date.now(),
        });
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
    await BG.ready({
      desiredAccuracy: BG.DESIRED_ACCURACY_HIGH,
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
      // FIELD-BUILD diagnostic (Neil 2026-06-15): debug ON so the TS engine emits its
      // native audible chirp on each recorded fix — the field-troubleshooting beep Neil
      // uses to HEAR tracking working from a pocketed phone. This is the engine's own
      // chirp (the custom expo-av chirp.ts that substituted for it on the now-removed
      // expo-location path is gone). The dual-engine SELECTOR stays hidden — TS is the
      // sole, hardwired engine — so nothing customer-switchable is in view. debug:true
      // also surfaces TS's diagnostic notification; acceptable for the volunteer field
      // session. Flip back to false for a real club release. logLevel stays verbose.
      debug: true,
      logLevel: BG.LOG_LEVEL_VERBOSE,
    });
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
