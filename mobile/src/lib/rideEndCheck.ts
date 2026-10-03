// W287 — pure decisions for the device-side CONVERGENT ride-end teardown (Ledger slate 13, A2,
// §14 item 14; Pillar III R3-69 / R3-35 / R3-67 / R3-70). No react-native or supabase imports:
// exercised by tests/rideEndCheck.test.mjs under `node --experimental-strip-types --test`.
//
// A2 is the whole rule: teardown fires ONLY on an affirmative read of persisted ride status
// 'saved' — never on the RIDE_ENDED broadcast alone, channel loss, Captain departure or app
// shutdown. Those may TRIGGER a read; only the read's answer acts.

// rides.status enum is created | active | saved (20260410000000_initial_schema.sql). 'purged' is a
// PARTICIPANT status and never appears here. null / unknown (stale JWT, RLS-hidden row, read
// failure) is NOT an affirmative read → false.
export function shouldTearDown(status: string | null | undefined): boolean {
  return status === 'saved';
}

// Bounded, jittered retry for the status read (precedent: useRideChannel's reconnect backoff).
// Three attempts ≈ 1 s + 2 s + 4 s worst case; a signal that fails all of them simply yields
// null and the NEXT signal (resume / beat / event) retries — a transient failure never strands
// the check, and never tears down.
export const STATUS_READ_MAX_ATTEMPTS = 3;
export const STATUS_READ_BASE_MS = 1000;
export const STATUS_READ_CAP_MS = 4000;

export function statusRetryDelayMs(attempt: number, rand: () => number = Math.random): number {
  const base = Math.min(STATUS_READ_CAP_MS, STATUS_READ_BASE_MS * 2 ** Math.max(0, attempt));
  return base / 2 + rand() * (base / 2); // in [base/2, base)
}

export async function readStatusWithRetry(
  fetchStatus: () => Promise<string | null>,
  deps: { rand?: () => number; sleep?: (ms: number) => Promise<void>; maxAttempts?: number } = {},
): Promise<string | null> {
  const max = deps.maxAttempts ?? STATUS_READ_MAX_ATTEMPTS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; attempt < max; attempt += 1) {
    try {
      return await fetchStatus(); // a null ROW is an answer (not saved), not a failure
    } catch {
      if (attempt + 1 < max) await sleep(statusRetryDelayMs(attempt, deps.rand));
    }
  }
  return null;
}

export type RideEndAction = 'none' | 'teardown_silent' | 'teardown_notify';

// Foreground watch: what to do with a read. The Alert is the A2 FOREGROUND-ONLY notification —
// never a precondition — so a backgrounded device tears down silently (no Alert, toast or
// sound; the FGS notification clearing is the only visible effect). The Captain ended the ride
// themselves, so "the captain has ended this ride" is wrong for them: silent.
export function decideRideEndAction(args: {
  status: string | null;
  appState: string | null | undefined;
  iAmCaptain?: boolean;
}): RideEndAction {
  if (!shouldTearDown(args.status)) return 'none';
  if (args.iAmCaptain) return 'teardown_silent';
  return args.appState === 'active' ? 'teardown_notify' : 'teardown_silent';
}

// Heartbeat cadence for the persisted-status read. A DISABLED engine is about to be re-asserted,
// so reading first is free and replaces a blind re-assert on a Saved ride; an ENABLED engine
// keeps streaming on a Saved ride, so it reads every Nth beat (60 s floor → ~3 min worst-case
// background convergence, bounded by the inactivity backstop).
export const HEARTBEAT_STATUS_EVERY_N_BEATS = 3;

export function shouldReadStatusOnBeat(args: { beatIndex: number; engineEnabled: boolean }): boolean {
  if (!args.engineEnabled) return true;
  return args.beatIndex % HEARTBEAT_STATUS_EVERY_N_BEATS === 0;
}
