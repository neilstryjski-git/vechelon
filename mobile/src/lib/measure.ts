import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { supabase } from './supabase';

// Build fingerprint, resolved ONCE per run. extra.* is baked at build time by
// app.config.ts from EAS env vars; version is the app version string. Lets us
// determine EXACTLY which build a given device is running, remotely, from the
// sink — critical for triaging field bugs (e.g. 'is this device on the fix?').
const BUILD_INFO = {
  app_version: Constants.expoConfig?.version ?? null,
  build_id: (Constants.expoConfig?.extra?.buildId as string | null) ?? null,
  git_commit: (Constants.expoConfig?.extra?.gitCommit as string | null) ?? null,
  build_profile: (Constants.expoConfig?.extra?.buildProfile as string | null) ?? null,
} as const;

// Rail 3 PoC measurement sink (W189 / Pillar II §2 Performance NFRs — PoC tooling).
//
// Persists spike measurements to public.analytics_events so field-test findings are
// collectable, not trapped on testers' phones. Consumed by W180 (broadcast latency),
// W179 (background GPS survival), W174 (state transitions), W173 (beacon latency), and
// the UX-event kinds below. Each spike wires its OWN call sites; this file is just the
// shared helper + envelope contract.
//
// STAGING-ONLY — never ship in a prod build. It rides on the allowlisted 'query_timeout'
// carrier event_type (the analytics_events INSERT RLS restricts event_type to an
// allowlist, so a custom type is rejected — and reusing the carrier avoids a migration).
// A prod-clean event_type would need the migration we deliberately deferred.
//
// Reads happen POST-RIDE via the Supabase Management API (service_role): analytics_events
// has no SELECT policy, so the app cannot read it back — this helper is write-only.
//
// Multi-ride: ride_id lives in metadata (no column) so rides stay SEPARABLE (filter
// metadata->>'ride_id') and COMBINABLE (group by it). session_id + seq separate testers
// and detect gaps. Timing uses client_ts (device clock) — never analytics_events.created_at
// (server ingest time). Real query_timeout/D41 analysis excludes our rows via
// `metadata->>'m' IS DISTINCT FROM 'rail3'`.

const CARRIER_EVENT_TYPE = 'query_timeout'; // allowlisted carrier; real signal is in metadata
const SCHEMA_VERSION = 1;

export type MeasureKind =
  | 'broadcast_latency'
  | 'gps_ping'
  | 'gps_time_to_kill'
  | 'state_transition'
  | 'beacon_latency'
  // W234 captain breadcrumb: result of each rail3_breadcrumb upsert (D69 made this
  // fire; the kind was missing from the union, so tsc flagged it — Metro ran fine).
  | 'breadcrumb_upsert'
  // W261 last-position-on-stop: the SDK moving↔stationary transition, and the result of the
  // last-known write to ride_participants on stop (so a silent failure surfaces as data).
  | 'motion_change'
  | 'last_position_write'
  // UX-event kinds — instrument these so they're DATA, not tester-checklist items:
  | 'ux_explainer_shown'
  | 'ux_battery_prompt_shown'
  | 'battery_saver_state'
  | 'app_state_change';

// One id per app run, so multiple testers (and multiple launches) stay separable within a
// ride. In-memory is intentional — a new run is a new session.
const SESSION_ID =
  Math.random().toString(36).slice(2) + Date.now().toString(36);

// Monotonic per-run counter so a missing event is detectable as a GAP, not silent absence.
let seq = 0;

let cachedUserId: string | null | undefined; // undefined = not yet looked up
const tenantCache: Record<string, string> = {}; // rideId -> tenant_id (uuid)

async function getUserId(): Promise<string | null> {
  if (cachedUserId !== undefined) return cachedUserId;
  const { data } = await supabase.auth.getUser();
  cachedUserId = data.user?.id ?? null;
  return cachedUserId;
}

// tenant_id MUST be the ride's real uuid (in the user's account_tenants) or RLS rejects the
// insert. Resolve from rides.tenant_id — NOT EXPO_PUBLIC_TENANT_SLUG (a slug is not a uuid).
async function getTenantId(
  rideId: string,
  override?: string,
): Promise<string | null> {
  if (override) return override;
  if (tenantCache[rideId]) return tenantCache[rideId];
  const { data, error } = await supabase
    .from('rides')
    .select('tenant_id')
    .eq('id', rideId)
    .maybeSingle();
  if (error || !data?.tenant_id) return null;
  tenantCache[rideId] = data.tenant_id;
  return data.tenant_id;
}

export interface LogMeasurementArgs {
  // The ride this measurement belongs to — REQUIRED (a missing ride_id orphans the event
  // from every per-ride query, so we refuse to write without it).
  rideId: string;
  kind: MeasureKind;
  // Canonical numeric — usually a delta in ms computed by the caller from Date.now()
  // (device clock). For latency, log at event time so client_ts pairs are meaningful.
  value?: number;
  // Kind-specific extras: e.g. { msg_id, role, self, app_state, from, to, ping_seq }.
  payload?: Record<string, unknown>;
  // Optional tenant_id override; otherwise resolved (and cached) from rides.tenant_id.
  tenantId?: string;
}

// Fire-and-forget: never throws, never blocks the caller (mirrors
// admin/src/lib/analyticsEvents.ts insertEvent). A rejected/failed write is silently
// dropped — acceptable for a measurement, and a gap is itself signal for the spikes.
export async function logMeasurement(args: LogMeasurementArgs): Promise<void> {
  try {
    if (!args.rideId) return; // refuse: no ride_id => orphaned from per-ride queries
    const userId = await getUserId();
    if (!userId) return; // anon insert fails RLS — skip
    const tenantId = await getTenantId(args.rideId, args.tenantId);
    if (!tenantId) return; // wrong/absent tenant_id is silently RLS-rejected anyway

    await supabase.from('analytics_events').insert({
      event_type: CARRIER_EVENT_TYPE,
      user_id: userId,
      tenant_id: tenantId,
      metadata: {
        m: 'rail3', // REQUIRED marker — separates from real query_timeout rows
        schema_v: SCHEMA_VERSION,
        ride_id: args.rideId,
        session_id: SESSION_ID,
        seq: seq++,
        kind: args.kind,
        value: args.value ?? null,
        client_ts: Date.now(), // device clock; never use created_at for timing
        device: Device.modelName ?? null,
        manufacturer: Device.manufacturer ?? null,
        os: Device.osName ?? null,
        os_version: Device.osVersion ?? null,
        ...BUILD_INFO, // app_version / build_id / git_commit / build_profile
        ...(args.payload ? { payload: args.payload } : {}),
      },
    });
  } catch {
    // fire-and-forget — never throw into the caller's path
  }
}
