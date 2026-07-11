import * as Battery from 'expo-battery';

import { logMeasurement } from './measure';

// W268 — first-class AppState instrumentation.
//
// Nothing in the app recorded real AppState transitions: the 'app_state_change' sink kind is a
// misnomer that carries RENDER events (fleet_compose, breadcrumb_leader, ride_map_open, handoff).
// So when the 2026-07-09 morning ride (8619ba10, SM-G781W) came out of a 33-min pocket with no
// captain marker and no breadcrumb, we could only INFER that AppState→'active' never fired, by
// noticing that fleet_compose never cleared (the side effect of connect()). That is a side effect,
// not evidence. These two kinds make the trigger directly observable:
//
//   app_lifecycle  — every AppState transition, whether or not anything reacted to it
//   resume_signal  — each recovery that actually ran, and which consumer ran it
//
// A pocket→unlock with app_lifecycle rows but no 'active' row confirms the hypothesis; an 'active'
// row with no resume_signal moves the fault into the consumers instead.

// Which recovery emitter fired: 'appstate' (the fast path, when the OS bothers to tell us),
// 'clockgap' (a JS timer that did not run ⇒ the thread was suspended), or 'stale' (channel silent
// past threshold while awake). Declared in resumeDetector.ts, which stays free of React Native and
// supabase imports so `node --test` can load it.
export type { ResumeSource } from './resumeDetector';
import type { ResumeSource } from './resumeDetector';

// Which recovery path reacted. Four consumers hang off the same trigger and fail together and
// silently, so the sink has to distinguish them.
export type ResumeConsumer = 'channel' | 'breadcrumb' | 'fleet' | 'beacon';

// Module-scoped: one app run, one AppState machine. Seeded lazily by the first transition, so
// `from` is null exactly once per run rather than pretending to know the pre-mount state.
let lastState: string | null = null;
let lastTransitionMs = Date.now();

type PowerState = {
  battery_level?: number;
  low_power_mode?: boolean;
  ignoring_battery_opt?: boolean;
};

// Upper bound on the whole power-state read. The lifecycle row must NEVER be lost to a wedged native
// call (W271, below: a missing row must not be mistaken for "the code didn't run" — the trap this
// investigation fell into twice). On timeout the row still writes, just without the power fields.
const POWER_READ_TIMEOUT_MS = 1500;

// W272 — attach power / battery-optimization state to every lifecycle transition. D76 showed the OS
// suppressing the app's OUTBOUND NETWORK while the JS thread AND the location foreground-service both
// kept running; the sink could not see WHY because we logged no power state. These are LOCAL native
// queries (no network), run in PARALLEL and bounded by POWER_READ_TIMEOUT_MS so this enrichment can
// never delay-away or drop the lifecycle row it rides on. Each source is isolated (allSettled + the
// RNBG lazy-require deferred into its own async so a sync throw degrades to an omitted field, not a
// rejection), and the whole function is wrapped so it NEVER rejects into logAppLifecycle's caller.
// `ignoring_battery_opt` is the key field: false = "Optimized" (Android may throttle background
// execution — the precondition for D76); true = "Unrestricted" (exempt).
async function readPowerState(): Promise<PowerState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const gather = Promise.allSettled([
      Battery.getBatteryLevelAsync(),
      Battery.isLowPowerModeEnabledAsync(),
      (async () => {
        // Lazy require — mirrors bgGeo.ts/diagnostics.ts: never touch the native module at bundle-eval.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const BG = require('react-native-background-geolocation').default;
        return (await BG.deviceSettings.isIgnoringBatteryOptimizations()) as boolean;
      })(),
    ]).then(([level, low, ignoring]) => {
      const out: PowerState = {};
      if (level.status === 'fulfilled') out.battery_level = level.value as number;
      if (low.status === 'fulfilled') out.low_power_mode = low.value as boolean;
      if (ignoring.status === 'fulfilled') out.ignoring_battery_opt = ignoring.value as boolean;
      return out;
    });
    const timeout = new Promise<PowerState>((resolve) => {
      timer = setTimeout(() => resolve({}), POWER_READ_TIMEOUT_MS);
    });
    return await Promise.race([gather, timeout]);
  } catch {
    return {}; // any residual setup/sync failure — degrade to omitted fields, never reject
  } finally {
    if (timer) clearTimeout(timer); // don't leave the timeout dangling when the reads win the race
  }
}

export function logAppLifecycle(rideId: string | null, next: string): void {
  const now = Date.now();
  const from = lastState;
  const msSinceLast = now - lastTransitionMs;
  lastState = next;
  lastTransitionMs = now;
  if (!rideId) return; // logMeasurement refuses ride-less events; still advance the machine above
  // Repeated same-state emissions are NOT filtered — React Native fires duplicates, and a
  // duplicate 'active' is itself signal about how the platform reports an unlock.
  //
  // W272: capture from/msSinceLast SYNCHRONOUSLY above (the state machine must not depend on the
  // async reads), then enrich with power state and log once the fast local reads resolve.
  void (async () => {
    const power = await readPowerState();
    void logMeasurement({
      rideId,
      kind: 'app_lifecycle',
      value: msSinceLast,
      payload: { from, to: next, ms_since_last: msSinceLast, ...power },
    });
  })();
}

// W271 — logMeasurement is fire-and-forget with NO retry, so a pocketed phone on marginal cellular
// drops writes silently. A missing row has therefore never been proof that the code did not run —
// a trap this investigation fell into twice. A monotonic seq makes a dropped write visible as a GAP
// rather than as silence. Per-consumer, because the four recover independently.
const resumeSeq: Record<ResumeConsumer, number> = { channel: 0, breadcrumb: 0, fleet: 0, beacon: 0 };

export function logResumeSignal(
  rideId: string | null,
  source: ResumeSource,
  consumer: ResumeConsumer,
): void {
  // Advance the sequence even when we cannot log: a ride-less recovery still happened, and the
  // next logged seq should reveal it as a gap rather than pretend it never occurred.
  const seq = ++resumeSeq[consumer];
  if (!rideId) return;
  void logMeasurement({ rideId, kind: 'resume_signal', payload: { source, consumer, seq } });
}

// Every subscribe() status transition, with its error. The subscribe result was previously kept
// only in component state — so a resume that ran connect() and got CHANNEL_ERROR back looked
// exactly like a resume that succeeded. `attempt` is the reconnect-backoff attempt count.
// NEVER pass a token, a session, or a raw broadcast payload — status and error.message only.
export function logChannelStatus(
  rideId: string | null,
  status: string,
  attempt: number,
  errorMessage?: string,
): void {
  if (!rideId) return;
  void logMeasurement({
    rideId,
    kind: 'channel_status',
    payload: { status, attempt, ...(errorMessage ? { error: errorMessage } : {}) },
  });
}

// Result of a catch-up query. Without this, "returned zero rows" and "was never issued" are
// indistinguishable in the sink — which is precisely the ambiguity that left the 2026-07-09
// morning breadcrumb unexplained.
export function logFetchResult(
  rideId: string | null,
  target: 'breadcrumb' | 'lastKnown',
  detail: Record<string, unknown>,
): void {
  if (!rideId) return;
  void logMeasurement({ rideId, kind: 'fetch_result', payload: { target, ...detail } });
}
