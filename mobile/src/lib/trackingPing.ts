import AsyncStorage from '@react-native-async-storage/async-storage';

// W231 — Audible tracking-ping toggle (closed-test field-QA diagnostic).
//
// An OPT-IN audible chirp on each recorded fix, so a tester can confirm — phone
// pocketed, screen off — that the app is still tracking, without looking at it.
//
// WHY NOT `debug: true`: the chirp testers hear today comes from Transistorsoft's
// `debug: true` (set as a field diagnostic), which ALSO forces TS's developer
// diagnostic notification + verbose logging and must be turned off for a real
// release (stripped in W208). This util gives the SAME native chirp WITHOUT debug
// mode — it calls TS's own `playSound` directly from the engine's onLocation
// callback (see bgGeo.ts). Because it's TS-native, it rings under the foreground
// service with the screen locked (the exact mechanism the debug chirp uses) — which
// an expo-av sound can't reliably do from the background (and which is why this
// does NOT re-introduce the expo-av dependency W203 deliberately removed).
//
// Default OFF, per-device. Production-safe (no debug-mode dependency) but ship it
// off by default; it's a closed-test diagnostic.

const KEY = 'rail3:tracking-ping-enabled';

// The TS debug-sound id played per recorded fix. 'LOCATION_RECORDED' is the same
// sound `debug: true` emits on each fix — the chirp the field tester already knows —
// triggered explicitly so we get the sound without the diagnostic notification.
// FIRST-BUILD VALIDATION: if a field build is silent with the toggle on, this id is
// the single value to confirm/adjust against the installed TS version's playSound
// (one-line change); everything else here is independent of it.
const PING_SOUND_ID = 'LOCATION_RECORDED';

// In-memory cache: onLocation fires ~every 5s, so the hot path must not touch storage.
// Hydrated once via loadTrackingPingFlag(); updated synchronously on every set.
let enabled = false;

// Hydrate the cached flag from storage. Call once when the engine starts (bgGeo).
export async function loadTrackingPingFlag(): Promise<void> {
  try {
    enabled = (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    enabled = false; // storage failure → stay silent (safe default), never throw
  }
}

export function isTrackingPingEnabled(): boolean {
  return enabled;
}

// Toggle setter for the HomeScreen switch. Updates the in-memory cache immediately so
// the next fix reflects the change, then best-effort persists.
export async function setTrackingPingEnabled(next: boolean): Promise<void> {
  enabled = next;
  try {
    await AsyncStorage.setItem(KEY, next ? 'true' : 'false');
  } catch {
    // best-effort persistence; the in-memory flag still governs this session
  }
}

// Minimal slice of the TS engine this util needs — passed in by the caller (bgGeo
// already holds the singleton) to avoid an import cycle with bgGeo.ts.
// v5: BackgroundGeolocation.playSound(soundId: number | string): void — synchronous,
// not a Promise (was Promise<void> in v4). soundId stays a string ('LOCATION_RECORDED').
type SoundPlayer = { playSound: (soundId: number | string) => void };

// Fire-and-forget: one short chirp per recorded fix when the toggle is on. Never let a
// failed chirp disrupt tracking or tear down the FGS (mirrors the old chirp.ts contract).
export function playTrackingPing(bg: SoundPlayer): void {
  if (!enabled) return;
  try {
    // v5 playSound is synchronous (returns void). A sync throw is caught here; a failed
    // chirp must never surface into onLocation or tear down the FGS.
    bg.playSound(PING_SOUND_ID);
  } catch {
    // diagnostic aid only — swallow
  }
}
