import { useEffect } from 'react';
import { AppState } from 'react-native';

import { logAppLifecycle, logResumeSignal } from '../lib/lifecycle';
import {
  CLOCK_TICK_MS,
  ResumeCoalescer,
  isChannelStale,
  isClockGap,
  type ResumeSource,
} from '../lib/resumeDetector';

// W269 — ONE resume signal, four consumers (channel, breadcrumb, fleet, and D75 beacon).
//
// useRideChannel.connect, useBreadcrumb.fetchRoute and useFleetPositions' last-known refetch each
// used to bind AppState→'active' themselves. They therefore failed TOGETHER and SILENTLY whenever
// that event didn't arrive (2026-07-09 morning ride: no marker, no breadcrumb, no channel rebuild).
// Now they subscribe to a single signal fed by two emitters — a clock-gap detector that needs no
// platform support, and AppState as the fast path — plus a staleness sweep for a channel that dies
// while the phone stays awake.
//
// The driver is a module-level singleton, ref-counted by subscriber. One interval and one AppState
// listener serve every consumer, so emissions coalesce naturally into a single recovery cycle.

type Listener = (source: ResumeSource) => void;

const listeners = new Set<Listener>();
const coalescer = new ResumeCoalescer();

let ticker: ReturnType<typeof setInterval> | null = null;
let appSub: { remove: () => void } | null = null;
let lastTickMs = Date.now();
let lastActivityMs = Date.now();
let lastStaleEmitMs = 0;
let peerCount = 0;
let rideId: string | null = null;

// Called by useFleetPositions on every inbound broadcast — the liveness evidence the staleness
// sweep reasons about. Cheap by design: a single assignment, no allocation, safe per-ping.
export function noteChannelActivity(): void {
  lastActivityMs = Date.now();
}

// Peers on the roster excluding self. Silence with nobody else riding is expected, not a fault.
export function notePeerCount(count: number): void {
  peerCount = count;
}

function emit(source: ResumeSource): void {
  // Snapshot: a listener may unsubscribe during iteration (unmount inside a recovery).
  for (const listener of [...listeners]) listener(source);
}

function tick(): void {
  const now = Date.now();
  // Order matters: read the gap against the PREVIOUS tick before advancing the clock.
  if (isClockGap(now, lastTickMs)) coalescer.offer('clockgap', now);
  lastTickMs = now;

  if (isChannelStale({ nowMs: now, lastActivityMs, peerCount, lastStaleEmitMs })) {
    lastStaleEmitMs = now;
    coalescer.offer('stale', now);
  }

  const due = coalescer.flushDue(now);
  if (due) emit(due);
}

function start(): void {
  if (ticker) return;
  // Seed both clocks at start, otherwise the first tick after a long mount-idle reads as a gap.
  lastTickMs = Date.now();
  lastActivityMs = Date.now();
  ticker = setInterval(tick, CLOCK_TICK_MS);
  appSub = AppState.addEventListener('change', (next) => {
    // W268: log EVERY transition, before any guard — whether 'active' arrives at all is exactly
    // the open question, and a guarded logger could never answer it.
    logAppLifecycle(rideId, next);
    if (next !== 'active') return;
    coalescer.offer('appstate', Date.now());
  });
}

function stop(): void {
  if (ticker) clearInterval(ticker);
  ticker = null;
  appSub?.remove();
  appSub = null;
  // Module state is process-lifetime, so leaving it set would leak across rides within one app
  // session: a source offered just before unmount would flush on the first tick after the next
  // ride opens, and a stale peerCount would let the sweep fire before the roster effect re-runs.
  coalescer.reset();
  peerCount = 0;
  lastStaleEmitMs = 0;
}

// Subscribe a recovery path to the resume signal. `onResume` receives the source that detected the
// resume, so the consumer can log it (W268) and the sink can tell us which emitter saved us.
export function useResume(currentRideId: string | null, onResume: Listener): void {
  useEffect(() => {
    rideId = currentRideId;
  }, [currentRideId]);

  useEffect(() => {
    listeners.add(onResume);
    start();
    return () => {
      listeners.delete(onResume);
      if (listeners.size === 0) stop();
    };
  }, [onResume]);
}

export type { ResumeSource };
