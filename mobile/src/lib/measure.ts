import * as Device from 'expo-device';

import { supabase } from './supabase';
import { VERSION_INFO } from './version';

// Bundle fingerprint, resolved ONCE per run — so we can determine EXACTLY which JS a device
// is running, remotely, from the sink ('is this device on the fix?'). Sourced from version.ts
// (same source as the on-screen HomeScreen label). git_commit now comes from
// EXPO_PUBLIC_GIT_COMMIT (set at `eas update` export), so OTA bundles carry their REAL commit
// instead of the "{}" the build-only EAS_BUILD_* vars produced. update_id / is_embedded make
// EVERY event self-label OTA-vs-baked, so no ride or kind-inference is needed to tell them apart.
const BUILD_INFO = {
  app_version: VERSION_INFO.appVersion,
  build_id: VERSION_INFO.buildId,
  git_commit: VERSION_INFO.gitCommit,
  build_profile: VERSION_INFO.buildProfile,
  update_id: VERSION_INFO.updateId,
  is_embedded: VERSION_INFO.isEmbedded,
  update_channel: VERSION_INFO.channel,
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
  // NB: 'app_state_change' is a misnomer kept for compatibility — it carries RENDER events
  // (fleet_compose, breadcrumb_leader, ride_map_open, handoff), NOT AppState transitions.
  // tools/rail3_sidecar_correlate.py and every prior-ride sink query depend on the name.
  | 'app_state_change'
  // W268 — the real lifecycle signal: every AppState transition, and every recovery that ran.
  | 'app_lifecycle'
  | 'resume_signal'
  // W271 — recovery OUTCOMES. Whether a recovery was triggered is not whether it worked: the
  // channel's subscribe() result and the catch-up queries' results were both invisible, so
  // "recovery fired but no markers appeared" had no recorded cause.
  | 'channel_status'
  | 'fetch_result'
  // D77 — the identity invariant tripped: a broadcast or DB write was attempted under an id
  // that is NOT the current session's user. Should never appear; if it does, the fleet is
  // being fed fabricated (but validly signed) data and this row is the only way to see it.
  | 'identity_mismatch';

// One id per SIGNED-IN RUN, so multiple testers (and multiple launches) stay separable within
// a ride. In-memory is intentional — a new run is a new session; D77 adds: so is a new USER.
const newSessionId = (): string =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
let sessionId = newSessionId();

// Monotonic per-session counter so a missing event is detectable as a GAP, not silent absence.
let seq = 0;

let cachedUserId: string | null | undefined; // undefined = not yet looked up
let tenantCache: Record<string, string> = {}; // rideId -> tenant_id (uuid)

// NEVER CACHE A NEGATIVE. This is the whole point — not the choice of auth call.
//
// The old line was `cachedUserId = data.user?.id ?? null` over getUser(). Because
// `null !== undefined`, a single failed lookup cached null FOREVER (until the next auth event),
// and logMeasurement short-circuits on `!userId` — so one bad moment took the ENTIRE sink dark:
// gps_ping, channel_status, fetch_result, beacon_latency, and identity_mismatch, the very
// backstop D77 rests on. Resetting the cache per auth event would have RE-ARMED that hourly,
// mid-ride, on exactly the marginal cellular this app exists for.
//
// Two changes, and BOTH are needed:
//   1. getSession() instead of getUser(). getUser() is unconditionally a network GET
//      /auth/v1/user. Be precise about what getSession() is, though — it is NOT simply "local":
//      inside auth-js's 90s expiry margin it refreshes over the network, it takes the
//      processLock configured in supabase.ts, and it can throw. It is merely local in the
//      common case, which makes a failed lookup rare rather than impossible.
//   2. Only cache a POSITIVE result. Rarity is not correctness — a refresh that fails while the
//      access token has genuinely expired still returns {session: null}, and on a RETRYABLE
//      (offline) failure auth-js emits no SIGNED_OUT, because the session is preserved on disk.
//      So a null can still be produced while a perfectly good session sits in AsyncStorage.
//      Declining to cache it costs nothing: sign-out is already handled by resetMeasureIdentity,
//      and the next call simply re-reads.
//
// A throw here is safe: logMeasurement wraps its whole body in try/catch, so it drops ONE
// measurement and leaves cachedUserId `undefined` — unresolved, not poisoned.
async function getUserId(): Promise<string | null> {
  if (cachedUserId !== undefined) return cachedUserId;
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id ?? null;
  if (id) cachedUserId = id;
  return id;
}

// D77 — these caches are MODULE-level, so they outlive the React tree: remounting the app
// cannot clear them. cachedUserId in particular survived a full sign-out, and every
// analytics_events row written afterwards was filed under the PREVIOUS user — silently, because
// the INSERT policy checks event_type/tenant_id but NOT user_id = auth.uid(). That is why the
// sink reports the LATCHED identity rather than the live login, which misled the 2026-07-12
// field analysis. AuthContext calls this on every auth event.
//
// `userChanged` distinguishes a genuine swap from a routine TOKEN_REFRESHED (~hourly, mid-ride):
//   - always: drop cachedUserId. Cheap to re-derive, and it can never go stale.
//   - only on a real user change: start a NEW analytics session (a new person is a new session
//     for analysis, and seq restarts with it) and drop tenantCache, whose contents are only as
//     valid as the RLS view the previous user had.
// Regenerating sessionId on a token refresh would be the analytics twin of remounting the ride
// tree on a token refresh — the exact mistake D77's fix exists to avoid.
export function resetMeasureIdentity(userChanged: boolean): void {
  cachedUserId = undefined;
  if (!userChanged) return;
  tenantCache = {};
  sessionId = newSessionId();
  seq = 0;
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
        session_id: sessionId,
        seq: seq++,
        kind: args.kind,
        value: args.value ?? null,
        client_ts: Date.now(), // device clock; never use created_at for timing
        device: Device.modelName ?? null,
        manufacturer: Device.manufacturer ?? null,
        os: Device.osName ?? null,
        os_version: Device.osVersion ?? null,
        ...BUILD_INFO, // app_version / build_id / git_commit / build_profile / update_id / is_embedded / update_channel
        ...(args.payload ? { payload: args.payload } : {}),
      },
    });
  } catch {
    // fire-and-forget — never throw into the caller's path
  }
}
