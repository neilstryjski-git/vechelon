import type BackgroundGeolocationType from 'react-native-background-geolocation';
import type { Location } from 'react-native-background-geolocation';

// RC4 engine-swap TRIAL — Transistorsoft Background Geolocation.
//
// LAZY NATIVE BINDING (expo-only build, 2026-06-15): the Transistorsoft native modules are
// EXCLUDED from autolinking in the expo-only trial build, so the native module is absent.
// This file is still imported (useFleetPositions imports start/stopBgGeo), so it must NOT
// touch the native module at load time — a top-level `import BackgroundGeolocation from ...`
// + the module-load `onLocation` registration would throw the instant the bundle evaluates.
// We therefore `require()` the SDK lazily inside startBgGeo (only the 'tsbg' engine reaches
// it), and register onLocation there. In an expo-only build startBgGeo is never called, so
// the native module is never touched and the app starts clean.
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
      // Cx-facing: debug OFF so real club riders hear NO debug chirp and see no debug
      // notifications (W203, Neil 2026-06-15). The required FGS "sharing your position"
      // notification still shows; only Transistorsoft's debug sounds/notifications are
      // suppressed. logLevel stays verbose — logs are diagnostic, not customer-facing.
      debug: false,
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
