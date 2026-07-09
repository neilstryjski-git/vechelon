// W269 — device-agnostic resume detection (pure logic; no React, no React Native, no supabase,
// so `node --test` loads this file directly with types stripped).
//
// The problem: every recovery path in the ride map hung off AppState→'active'. On the 2026-07-09
// morning ride that event never arrived on unlock, so the channel was never rebuilt, the breadcrumb
// never refetched, and stopped riders never rendered — silently. Locking an Android screen does not
// reliably background a foregrounded app, so the trigger is not something we can depend on.
//
// The fix does not ask the OS anything. It observes a fact instead: a timer that did not run.
// While the JS thread is suspended, setInterval stops firing; on resume the next tick sees that the
// wall clock advanced far more than the interval it slept for. A timer that didn't run is a timer
// that didn't run on every device, every OEM, every OS version. AppState→'active' is kept as a
// SECOND emitter into the same signal — when it fires it's faster, and when it doesn't we lose
// nothing.

export type ResumeSource = 'appstate' | 'clockgap' | 'stale';

// How often the driver ticks while the thread is alive. Cheap: the tick does arithmetic only.
export const CLOCK_TICK_MS = 1000;
// A tick that arrives this late means the thread was suspended, not merely busy. Comfortably above
// normal timer jitter and GC pauses, comfortably below the shortest pocket worth recovering from.
export const CLOCK_GAP_THRESHOLD_MS = 4000;
// Trailing-coalesce window: 'appstate' and 'clockgap' both fire on a single unlock, and RN can emit
// duplicate 'active' events. One unlock must cost one rebuild, not three. (Inherited from W266.)
export const RESUME_DEBOUNCE_MS = 1200;
// Channel silence past this, with peers on the roster, means the socket MAY have died while we
// stayed awake and foregrounded — the 2026-07-05 failure, which no clock gap can detect.
export const CHANNEL_SILENCE_MS = 90000;
// Silence is AMBIGUOUS: a fleet parked at a coffee stop goes quiet under the 40m distance filter
// and is indistinguishable, from data alone, from a socket that died. We accept the false positive
// (Neil's D73 ruling: a dead channel is a safety failure, a ~1s re-subscribe blink is not) but not
// its cost every minute — so a genuinely quiet channel is re-swept every 5 minutes, not every 60s.
// A truly dead socket is still caught within CHANNEL_SILENCE_MS of dying.
export const STALE_COOLDOWN_MS = 300000;

// A tick that should have arrived CLOCK_TICK_MS ago but arrived `thresholdMs` late or later means
// the JS thread was suspended in between. `lastTickMs` is the previous tick's wall clock.
export function isClockGap(
  nowMs: number,
  lastTickMs: number,
  thresholdMs: number = CLOCK_GAP_THRESHOLD_MS,
): boolean {
  return nowMs - lastTickMs >= thresholdMs;
}

export interface StaleInput {
  nowMs: number;
  // Wall clock of the last inbound broadcast on the ride channel.
  lastActivityMs: number;
  // Other riders on the roster (excluding self). With nobody else riding, silence is expected and
  // a rebuild would be pure cost.
  peerCount: number;
  // Wall clock of the last 'stale' emission, for the cooldown.
  lastStaleEmitMs: number;
  silenceMs?: number;
  cooldownMs?: number;
}

export function isChannelStale({
  nowMs,
  lastActivityMs,
  peerCount,
  lastStaleEmitMs,
  silenceMs = CHANNEL_SILENCE_MS,
  cooldownMs = STALE_COOLDOWN_MS,
}: StaleInput): boolean {
  if (peerCount <= 0) return false;
  if (nowMs - lastActivityMs < silenceMs) return false;
  return nowMs - lastStaleEmitMs >= cooldownMs;
}

// Trailing debounce over resume sources. The FIRST source to open a window is the one reported:
// it is the emitter that actually detected the resume, and that attribution is the whole point of
// the instrumentation. Each subsequent offer extends the window (trailing), so a burst of
// active/inactive flaps settles into one emission.
export class ResumeCoalescer {
  private pending: ResumeSource | null = null;
  private deadlineMs = 0;
  private readonly windowMs: number;

  // NB: an explicit field, not a TS parameter property — node's --experimental-strip-types runs
  // strip-only and rejects parameter properties, and these tests load this file directly.
  constructor(windowMs: number = RESUME_DEBOUNCE_MS) {
    this.windowMs = windowMs;
  }

  offer(source: ResumeSource, nowMs: number): void {
    if (this.pending === null) this.pending = source;
    this.deadlineMs = nowMs + this.windowMs;
  }

  // Returns the coalesced source once the window has elapsed, then clears. Null while a window is
  // still open or when nothing is pending.
  flushDue(nowMs: number): ResumeSource | null {
    if (this.pending === null || nowMs < this.deadlineMs) return null;
    const source = this.pending;
    this.pending = null;
    this.deadlineMs = 0;
    return source;
  }

  get isPending(): boolean {
    return this.pending !== null;
  }

  // Drop any half-open window. Called on driver teardown so a source offered just before unmount
  // cannot flush into the next ride and fire a recovery nobody asked for.
  reset(): void {
    this.pending = null;
    this.deadlineMs = 0;
  }
}
