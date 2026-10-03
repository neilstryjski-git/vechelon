// W284 — pure half of the always-on telemetry tier (Ledger slate 6, §8.5, F-7; R3-45/R3-54).
// Erasable TypeScript, no react-native / supabase imports: exercised by tests/telemetry.test.mjs
// under `node --experimental-strip-types --test`. The I/O half is ./telemetry.ts.

export type TelemetryCounterKind = 'engine_started' | 'engine_died' | 'warning_fired';
export type TelemetryTier = 'always_on' | 'full_capture';
export type TelemetryPlatform = 'android' | 'ios';

export interface OperatorConfig {
  platform: TelemetryPlatform;
  full_capture_ride_id: string | null;
  startup_ceiling_s: number | null;
  steady_state_threshold_s: number | null;
}

// Scope boundary (Pillar II §2, slate 6): device operational state, NEVER rider position. The
// schema rejects these keys at the top level; this guard strips them at every depth so a
// payload can never carry a coordinate under any shape.
export const COORDINATE_KEYS: ReadonlyArray<string> = [
  'lat', 'lng', 'long', 'latitude', 'longitude', 'coords', 'path',
];
const COORD_SET = new Set(COORDINATE_KEYS);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function hasCoordinateKeys(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(hasCoordinateKeys);
  if (!isPlainObject(v)) return false;
  for (const k of Object.keys(v)) {
    if (COORD_SET.has(k.toLowerCase())) return true;
    if (hasCoordinateKeys(v[k])) return true;
  }
  return false;
}

// Returns a payload that is always a plain object with no coordinate key at any depth.
// Non-objects become {}. Never throws.
export function sanitizePayload(v: unknown): Record<string, unknown> {
  try {
    if (!isPlainObject(v)) return {};
    return strip(v) as Record<string, unknown>;
  } catch {
    return {};
  }
}
function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(strip);
  if (!isPlainObject(v)) return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) {
    if (COORD_SET.has(k.toLowerCase())) continue;
    out[k] = strip(v[k]);
  }
  return out;
}

// Full capture is PER RIDE: on only when the operator flag names exactly this ride.
export function isFullCaptureEnabled(cfg: OperatorConfig | null | undefined, rideId: string | null): boolean {
  if (!cfg || !rideId) return false;
  return cfg.full_capture_ride_id === rideId;
}

// R3-45 / F-7 — what the three always-on counters CAN distinguish for one engine run:
//   never_engaged         — no engine_started at all (start() never resolved / never called)
//   torn_down             — engine_died present (plugin disabled or location services off,
//                           detectable while the process lived)
//   suspended_or_healthy  — engine_started without engine_died: an OEM-killed process (no JS
//                           runs, so nothing is emitted), a healthy run, and a started-but-
//                           no-fix run are INDISTINGUISHABLE from the floor alone. That is
//                           the F-7 finding, recorded rather than papered over with a fourth
//                           counter.
export type EngineRunClass = 'never_engaged' | 'torn_down' | 'suspended_or_healthy';

export function classifyEngineRun(kinds: ReadonlyArray<string>): { cls: EngineRunClass; warnings: number } {
  const started = kinds.includes('engine_started');
  const died = kinds.includes('engine_died');
  const warnings = kinds.filter((k) => k === 'warning_fired').length;
  if (died) return { cls: 'torn_down', warnings };
  if (started) return { cls: 'suspended_or_healthy', warnings };
  return { cls: 'never_engaged', warnings };
}

// device_class convention: "<manufacturer>/<model>" lowercased, whitespace → '-', never a
// device identifier. Survives the T+4h identity strip as the per-device-class key (§8.5).
export function deviceClass(manufacturer: string | null | undefined, modelName: string | null | undefined): string {
  const norm = (s: string | null | undefined) =>
    (s ?? '').trim().toLowerCase().replace(/\s+/g, '-') || 'unknown';
  return `${norm(manufacturer)}/${norm(modelName)}`;
}
