// W285 — module-level store of the engine signals the R3-40 self-health clocks read (Ledger A3 /
// slate 4; Pillar III R3-40 / R3-43 / R3-48). Pure: no react-native / supabase imports, so it is
// node-testable (tests/selfHealthSignals.test.mjs). Module-level by design — the SAME pattern as
// activeRide.ts and useResume's noteChannelActivity(): the engine effect in useFleetPositions
// feeds it from its startBgGeo callbacks WITHOUT any change to that effect's deps (D91), and the
// sibling hook (useSelfHealth) reads/subscribes without threading anything through RideMapScreen.
//
// Every value here is a TIMESTAMP, a boolean or a count — never a coordinate (Pillar II §2).

export interface SelfHealthSnapshot {
  // Receipt clock of the LAST engine_started event — start_resolved OR heartbeat_reassert (a
  // reassert is a fresh BG.start(): same acquisition window as a cold start, and it is what clears
  // engineDied after a successful self-heal so the badge cannot stick — "silence follows repair").
  engineStartedAtMs: number | null;
  // Receipt clock (fix.ts) of the last fix routed through the fix handler. Kept across engine
  // restarts; whether it counts for THIS run is decided by evaluateSelfHealth (predating rule).
  lastFixAtMs: number | null;
  // max(last fix, last motion_change, last heartbeat_check): engine LIVENESS evidence, the input to
  // the stationary exemption (a stationary engine still heartbeats; a dead one is silent).
  lastEngineSignalAtMs: number | null;
  // null = unknown since engine start; from fix.isMoving / motion isMoving / heartbeat engineMoving.
  engineMoving: boolean | null;
  // engine_died seen since the last engine_started.
  engineDied: boolean;
  // Fixes with ts >= engineStartedAtMs since the last engine_started (telemetry `fixes_seen`).
  fixesSinceStart: number;
}

const EMPTY: SelfHealthSnapshot = Object.freeze({
  engineStartedAtMs: null,
  lastFixAtMs: null,
  lastEngineSignalAtMs: null,
  engineMoving: null,
  engineDied: false,
  fixesSinceStart: 0,
});

let snapshot: SelfHealthSnapshot = EMPTY;
const listeners = new Set<(s: SelfHealthSnapshot) => void>();

function commit(next: SelfHealthSnapshot): void {
  snapshot = Object.freeze(next);
  // Iterate over a copy so a listener unsubscribing mid-emit is safe (useResume.emit pattern).
  for (const l of [...listeners]) l(snapshot);
}

const maxTs = (a: number | null, b: number): number => (a === null ? b : Math.max(a, b));

export function getSelfHealthSnapshot(): SelfHealthSnapshot {
  return snapshot;
}

export function subscribeSelfHealth(listener: (s: SelfHealthSnapshot) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function noteEngineStarted(ts: number): void {
  commit({
    ...snapshot,
    engineStartedAtMs: ts,
    engineDied: false,
    engineMoving: null,
    fixesSinceStart: 0,
    lastEngineSignalAtMs: ts,
  });
}

export function noteEngineDied(): void {
  if (snapshot.engineDied) return;
  commit({ ...snapshot, engineDied: true });
}

// A fix received before the engine_started event (or carried over from a previous run) never counts
// toward THIS run's first fix — it is still remembered as the last fix for the steady clock.
export function noteFix(ts: number, isMoving: boolean): void {
  const counts = snapshot.engineStartedAtMs !== null && ts >= snapshot.engineStartedAtMs;
  commit({
    ...snapshot,
    lastFixAtMs: ts,
    lastEngineSignalAtMs: maxTs(snapshot.lastEngineSignalAtMs, ts),
    engineMoving: isMoving,
    fixesSinceStart: counts ? snapshot.fixesSinceStart + 1 : snapshot.fixesSinceStart,
  });
}

export function noteMotion(ts: number, isMoving: boolean): void {
  commit({ ...snapshot, engineMoving: isMoving, lastEngineSignalAtMs: maxTs(snapshot.lastEngineSignalAtMs, ts) });
}

export function noteHeartbeat(ts: number, engineMoving: boolean): void {
  commit({ ...snapshot, engineMoving, lastEngineSignalAtMs: maxTs(snapshot.lastEngineSignalAtMs, ts) });
}

// One reset point per engine session: the engine effect's cleanup (ride change, backgroundReady
// flip, unmount).
export function resetSelfHealthSignals(): void {
  commit(EMPTY);
}
