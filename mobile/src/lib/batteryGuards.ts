import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

// Battery guards (W177 / Pillar II §2 Battery Saver & OEM mitigation, Pillar III
// R3-05/R3-06, SD-010, R-001).
//
// Two SEPARATE Android power toggles can silently stop background location and make a
// rider go "Dark" mid-ride; this module surfaces advisory, non-blocking prompts for
// both and holds a wakelock during an active ride:
//
//   1. Battery Saver / Low Power Mode  -> BATTERY_SAVER_SETTINGS        (R3-05/R3-06)
//   2. Per-app OEM battery optimisation -> IGNORE_BATTERY_OPTIMIZATION_SETTINGS  (first join)
//
// These are DISTINCT system settings — one does not cover the other (pitfall), so they
// have separate detection and separate prompts. Every prompt is advisory: it NEVER
// blocks ride join (pitfall), and the copy does not promise guaranteed tracking —
// these mitigations reduce, but cannot eliminate, OEM background-kill risk (pitfall).
//
// Android-only: on any other platform every entry point is a safe no-op. The ride flow
// (which lives on the held W172 chain) calls these on join / screen-lock / ride end.

const RIDE_WAKELOCK_TAG = 'rail3-active-ride';
const OEM_PROMPT_SEEN_PREFIX = 'rail3:oem-battery-exclusion-seen:';

const isAndroid = Platform.OS === 'android';

// --- Battery Saver (R3-05 / R3-06) ------------------------------------------------

// True when the OS Battery Saver / Low Power Mode is active. False (not throwing) on
// non-Android or any detection failure — a missed prompt is harmless, a crash is not.
export async function isBatterySaverOn(): Promise<boolean> {
  if (!isAndroid) return false;
  try {
    return await Battery.isLowPowerModeEnabledAsync();
  } catch {
    return false;
  }
}

async function openBatterySaverSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.BATTERY_SAVER_SETTINGS,
    );
  } catch {
    // Some OEMs lack the dedicated screen — give up silently rather than throw into
    // the ride flow. (The advisory copy already names the setting for manual access.)
  }
}

// Advisory, non-blocking. If Battery Saver is on, shows a dismissible alert with a
// settings shortcut; the caller's ride-join / screen-lock flow proceeds regardless.
// `context` is for the caller's instrumentation only. Returns whether a prompt fired.
export async function promptIfBatterySaverOn(
  context: 'join' | 'screen-lock',
): Promise<boolean> {
  if (!(await isBatterySaverOn())) return false;
  Alert.alert(
    'Battery Saver is on',
    "Battery Saver can pause location updates and make you disappear from your " +
      "captain's map mid-ride. For reliable tracking, turn it off for this ride.",
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open settings', onPress: () => void openBatterySaverSettings() },
    ],
  );
  return true;
}

// Subscribe to surface the Battery Saver prompt when the app leaves the foreground
// (the closest managed-workflow proxy for "screen lock", R3-06). Returns an
// unsubscribe the caller invokes on ride end / unmount.
export function watchBatterySaverOnScreenLock(): () => void {
  if (!isAndroid) return () => {};
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      void promptIfBatterySaverOn('screen-lock');
    }
  });
  return () => sub.remove();
}

// D89: watchBatterySaverCleared (D86's Saver ON->OFF edge listener) was REMOVED here. Its
// primary signal — expo-battery's low-power listener — fires only while foregrounded, so it
// MISSED the common case (Saver toggled off while the phone is locked/backgrounded), which was
// field-confirmed to never fire (ride 82a08280: Saver ON->OFF, zero bg_nudge). It is superseded
// by the unified resume-nudge in useFleetPositions.onResume, which re-asserts the engine on every
// unlock regardless of cause (Saver, OEM-suspend, or a warm-up strand). See D90 / W277.

// --- Per-app OEM battery optimisation (first join) --------------------------------

export type OemBatteryInstructions = { manufacturer: string; steps: string };

// OEM-specific exclusion steps, selected by device manufacturer. Generic fallback for
// anything not in the known list (edge case). Deep OEM screens aren't standard
// intents, so the steps are instructional; the prompt links to the closest standard
// settings screen.
export function getOemBatteryInstructions(): OemBatteryInstructions {
  const m = (Device.manufacturer ?? '').toLowerCase();
  if (m.includes('samsung')) {
    return {
      manufacturer: 'Samsung',
      steps:
        'Settings → Battery → Background usage limits → Never sleeping apps → add ' +
        'Vechelon. Then set Vechelon to "Unrestricted" under App battery usage.',
    };
  }
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) {
    return {
      manufacturer: 'Xiaomi',
      steps:
        'Settings → Apps → Manage apps → Vechelon → Battery saver → No restrictions, ' +
        'and enable Autostart for Vechelon.',
    };
  }
  return {
    manufacturer: Device.manufacturer ?? 'your device',
    steps:
      'Open Settings → Apps → Vechelon → Battery and set it to Unrestricted / exclude ' +
      'it from battery optimisation.',
  };
}

async function openIgnoreBatteryOptimisationSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    );
  } catch {
    // never throw into the ride flow
  }
}

// One-time-per-rider (keyed by rider id, like the first-ride explainer) advisory
// prompt to exclude Vechelon from OEM battery optimisation, with OEM-specific steps.
// Advisory and non-blocking; returns whether a prompt fired.
export async function promptOemExclusionOnFirstJoin(
  riderId: string,
): Promise<boolean> {
  if (!isAndroid || !riderId) return false;
  const key = OEM_PROMPT_SEEN_PREFIX + riderId;
  try {
    if ((await AsyncStorage.getItem(key)) === 'true') return false;
  } catch {
    // storage read failed — fall through and show it (harmless to show again)
  }

  const markSeen = () => {
    void AsyncStorage.setItem(key, 'true').catch(() => {});
  };
  const { manufacturer, steps } = getOemBatteryInstructions();

  Alert.alert(
    `Keep Vechelon running on ${manufacturer}`,
    `${manufacturer} may close Vechelon in the background to save power, which stops ` +
      `your location sharing. This reduces — but can't fully eliminate — that risk:\n\n${steps}`,
    [
      { text: 'Done', onPress: markSeen },
      {
        text: 'Open settings',
        onPress: () => {
          markSeen();
          void openIgnoreBatteryOptimisationSettings();
        },
      },
    ],
  );
  return true;
}

// --- Active-ride wakelock ---------------------------------------------------------

// Hold a wakelock for the duration of an active ride. In the managed workflow this
// keeps the screen awake (expo-keep-awake); a deeper background/CPU partial wakelock
// is owned by the Foreground Service (separate concern). Tagged so concurrent
// keep-awake holders don't release each other.
export async function acquireRideWakelock(): Promise<void> {
  try {
    await activateKeepAwakeAsync(RIDE_WAKELOCK_TAG);
  } catch {
    // non-fatal — the ride continues without the screen-awake hint
  }
}

export function releaseRideWakelock(): void {
  try {
    deactivateKeepAwake(RIDE_WAKELOCK_TAG);
  } catch {
    // already released / unavailable — ignore
  }
}
