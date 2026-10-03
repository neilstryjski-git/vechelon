// W284 — always-on telemetry tier, I/O half (Ledger slate 6, §8.5, items 20/22; R3-45/R3-54).
//
// Writes rail3_telemetry_events rows FIRE-AND-FORGET: nothing here may ever block or delay
// engine start, the beacon, or teardown — every path is try/catch'd and a dropped row is
// acceptable (a gap is itself signal). This is NOT the staging-only analytics_events
// 'query_timeout' carrier (measure.ts): that sink is stripped for prod; this tier is the
// permanent floor. Pure logic (payload guard, classifier, gating, device class) lives in
// ./telemetryPure.ts so it is node-tested.

import { Platform } from 'react-native';
import * as Device from 'expo-device';

import { supabase } from './supabase';
import {
  deviceClass,
  isFullCaptureEnabled,
  sanitizePayload,
  type OperatorConfig,
  type TelemetryCounterKind,
  type TelemetryPlatform,
  type TelemetryTier,
} from './telemetryPure';

export type { OperatorConfig, TelemetryCounterKind } from './telemetryPure';

const platform: TelemetryPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
const DEVICE_CLASS = deviceClass(Device.manufacturer, Device.modelName);

// --- identity + tenant resolution (mirrors measure.ts; positive-only caches) ----------------
let userIdCache: string | null = null;
let tenantCache: Record<string, string> = {};
let configCache: OperatorConfig | null = null;
// The in-flight config load, so a full-capture gate decided while the first load is still on
// the wire waits for it instead of reading a stale/empty cache (review round 2). Only the
// full-capture path awaits it — counters and the engine never do.
let configInFlight: Promise<OperatorConfig | null> | null = null;

async function getUserId(): Promise<string | null> {
  if (userIdCache) return userIdCache;
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id ?? null;
  if (uid) userIdCache = uid;
  return uid;
}

// tenant_id MUST be the ride's real uuid (and in the writer's account_tenants) or RLS rejects.
async function getTenantId(rideId: string): Promise<string | null> {
  if (tenantCache[rideId]) return tenantCache[rideId];
  const { data, error } = await supabase.from('rides').select('tenant_id').eq('id', rideId).maybeSingle();
  if (error || !data?.tenant_id) return null;
  tenantCache[rideId] = data.tenant_id;
  return data.tenant_id;
}

// D77 discipline: module caches outlive the React tree; reset on a user-id DELTA only.
export function resetTelemetryIdentity(userChanged: boolean): void {
  if (!userChanged) return;
  userIdCache = null;
  tenantCache = {};
  configCache = null;
}

// --- operator config (item 22) -------------------------------------------------------------
// Loaded once per ride open and cached. Offline / error keeps the previous cache (or null):
// counters still write, full-capture defaults OFF. Never throws.
export async function loadOperatorConfig(): Promise<OperatorConfig | null> {
  const load = (async () => {
    try {
      const { data, error } = await supabase
        .from('rail3_operator_config')
        .select('platform, full_capture_ride_id, startup_ceiling_s, steady_state_threshold_s')
        .eq('platform', platform)
        .maybeSingle();
      if (!error && data) configCache = data as OperatorConfig;
    } catch {
      // keep whatever we had
    }
    return configCache;
  })();
  configInFlight = load;
  try {
    return await load;
  } finally {
    if (configInFlight === load) configInFlight = null;
  }
}

export function getCachedOperatorConfig(): OperatorConfig | null {
  return configCache;
}

// --- writers -------------------------------------------------------------------------------
async function writeEvent(rideId: string, kind: string, tier: TelemetryTier, payload: unknown): Promise<void> {
  try {
    if (!rideId) return;
    const userId = await getUserId();
    if (!userId) return;
    const tenantId = await getTenantId(rideId);
    if (!tenantId) return;
    // Bare insert (return=minimal): authenticated has INSERT but no SELECT on this table.
    await supabase.from('rail3_telemetry_events').insert({
      tenant_id: tenantId,
      ride_id: rideId,
      account_id: userId,
      platform,
      device_class: DEVICE_CLASS,
      kind,
      tier,
      client_ts: new Date().toISOString(),
      payload: sanitizePayload(payload),
    });
  } catch {
    // fire-and-forget — never throw into the engine / beacon / teardown path
  }
}

// Always-on tier: the three counters, the permanent floor. Fire-and-forget.
export function recordCounter(rideId: string, kind: TelemetryCounterKind, payload?: Record<string, unknown>): void {
  void writeEvent(rideId, kind, 'always_on', payload ?? {});
}

// Full-capture tier: no-op unless the operator flag names THIS ride. Fire-and-forget.
export function fullCaptureEvent(rideId: string, event: string, payload?: Record<string, unknown>): void {
  void (async () => {
    try {
      if (configInFlight) await configInFlight; // settle the first load; never throws
    } catch {
      // loadOperatorConfig swallows its own errors; nothing to do
    }
    if (!isFullCaptureEnabled(configCache, rideId)) return;
    await writeEvent(rideId, event, 'full_capture', payload ?? {});
  })();
}
