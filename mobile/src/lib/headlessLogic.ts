// W286 — pure decision logic for the device-side recovery chain (Ledger B1 device-side;
// R3-42 / R3-48 / R3-67). No react-native, supabase or AsyncStorage imports: exercised by
// tests/headlessTask.test.mjs under `node --experimental-strip-types --test`. The I/O halves are
// ./headlessTask.ts (Android headless JS) and the heartbeat branch in ./bgGeo.ts.

export interface PersistedRide {
  rideId: string;
  riderId: string;
}

// Durable active-ride holder key (AsyncStorage). The in-memory holder in activeRide.ts serves
// the D87 sign-out departure; THIS durable copy is the "engine session" the headless task and
// the heartbeat re-assert read without React. Cleared on departure (R3-67): no durable ride →
// no recovery mechanism may re-engage tracking.
export const ACTIVE_RIDE_KEY = 'rail3:active-ride';

export function serializePersistedRide(v: PersistedRide): string {
  return JSON.stringify({ rideId: v.rideId, riderId: v.riderId });
}

// Never throws; garbage, partial or foreign shapes read as "no ride" (fail CLOSED: no re-engage).
export function parsePersistedRide(raw: string | null | undefined): PersistedRide | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (typeof v !== 'object' || v === null) return null;
    const { rideId, riderId } = v as Record<string, unknown>;
    if (typeof rideId !== 'string' || !rideId || typeof riderId !== 'string' || !riderId) return null;
    return { rideId, riderId };
  } catch {
    return null;
  }
}

export type HeadlessAction = 'noop' | 'teardown' | 'reassert' | 'reassert_and_write_last_known' | 'write_last_known';
// rides.status enum is created | active | saved ('purged' is a PARTICIPANT status, never a ride's).
export type RideStatusLike = 'created' | 'active' | 'saved' | string | null;

const HEADLESS_EVENTS = new Set(['heartbeat', 'terminate', 'providerchange']);

// With enableHeadless:true the SDK delivers EVERY event (location, motionchange, http, ...) to
// the headless task. Only these three are recovery events; anything else must exit before any
// read or write, or a moving terminated device pays the whole prelude on every fix.
export function isRecoveryEvent(name: string | null | undefined): boolean {
  return HEADLESS_EVENTS.has(String(name ?? ''));
}

// What the headless task does for one SDK event:
//   • no durable ride → noop (this IS R3-67's "background task de-registered": AppRegistry
//     registration is permanent, so the task must be inert when there is nothing to recover)
//   • ride affirmatively Saved (W287, slate 13 / A2) → teardown: stop the engine, clear the
//     durable holder, never re-assert, never write last-known. Only an affirmative 'saved'
//     read — null / unknown is never Saved.
//   • terminate → the A4 last-known write (the process is going away; the fleet needs a fresh
//     fallback), plus a re-assert when the engine is disabled
//   • heartbeat / providerchange → re-assert only when the engine is disabled
export function decideHeadlessAction(args: {
  event: string;
  persistedRide: PersistedRide | null;
  engineEnabled: boolean;
  rideStatus?: RideStatusLike;
}): HeadlessAction {
  if (!args.persistedRide) return 'noop';
  if (!HEADLESS_EVENTS.has(args.event)) return 'noop';
  if (args.rideStatus === 'saved') return 'teardown';
  if (args.event === 'terminate') return args.engineEnabled ? 'write_last_known' : 'reassert_and_write_last_known';
  return args.engineEnabled ? 'noop' : 'reassert';
}

export type ForegroundHeartbeatDecision =
  | 'proceed'
  | 'reassert'
  | 'skipped_no_ride'
  | 'skipped_stopping'
  | 'skipped_no_session';

// The in-process heartbeat: a disabled engine during a persisted ride is re-asserted; our own
// teardown in flight wins over everything; a healthy engine proceeds to the D88 self-check.
// `engineSession` is bgGeo's own "we started this engine and have not stopped it" flag — it is
// cleared at the TOP of stopBgGeo and never reset by its finally, so a beat whose getState()
// was in flight when we stopped can never re-assert the engine we just stopped (the durable
// holder is deliberately left in place by the engine effect's cleanup, so it cannot serve as
// that guard).
export function decideForegroundHeartbeat(args: {
  engineEnabled: boolean;
  persistedRide: PersistedRide | null;
  stopping: boolean;
  engineSession: boolean;
}): ForegroundHeartbeatDecision {
  if (args.engineEnabled) return 'proceed';
  if (args.stopping) return 'skipped_stopping';
  if (!args.engineSession) return 'skipped_no_session';
  if (!args.persistedRide) return 'skipped_no_ride';
  return 'reassert';
}

export type WakeOutcome =
  | 'ok'
  | 'ok_no_pace' // engine started but changePace(true) rejected: running, not forced moving
  | 'failed'
  | 'skipped_no_ride'
  | 'skipped_stopping'
  | 'skipped_no_session'
  | 'torn_down_saved' // W287: affirmative Saved → engine stopped, durable holder cleared
  | 'teardown_failed' // W287: Saved read but BG.stop() rejected; holder kept so the next beat retries
  | 'noop';

// Full-capture 'wake_attempt' payload. Device operational state only — never a coordinate key.
export function buildWakeAttemptPayload(args: {
  outcome: WakeOutcome;
  reason: string;
  event: string;
  engineEnabledBefore: boolean | null;
  context: 'foreground' | 'headless';
  err?: string;
}): Record<string, unknown> {
  return {
    outcome: args.outcome,
    reason: args.reason,
    event: args.event,
    engine_enabled_before: args.engineEnabledBefore,
    context: args.context,
    ...(args.err ? { err: args.err.slice(0, 200) } : {}),
  };
}
