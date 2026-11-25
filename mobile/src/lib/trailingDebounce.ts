// D103: a debounce that never loses an ask. Pure (clock and timer injected) so it is node-tested
// without React (tests/trailingDebounce.test.mjs).
//
//   ask()      outside the window: run now. Inside it: run ONCE at the end of the window, however
//              many asks arrive (the old roster debounce dropped them, which lost a refresh that
//              was only ever asked for once: a resume, a join announcement, a stale-roster signal).
//   noteRun()  a run that happened by another path (the read on open) starts the window too.
//   cancel()   drop a pending deferred run (ride change, unmount).
//
// A run by any path clears a pending deferred run: after a phone has been suspended past the
// window, the resume's immediate run must not be followed by the overdue timer's second one.
export interface TrailingDebounceDeps {
  windowMs: number;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  run: () => void;
}

export interface TrailingDebounce {
  ask: () => void;
  noteRun: () => void;
  cancel: () => void;
}

export function makeTrailingDebounce(deps: TrailingDebounceDeps): TrailingDebounce {
  let lastRunMs = Number.NEGATIVE_INFINITY;
  let pending: unknown = null;
  const cancel = () => {
    if (pending !== null) deps.clearTimer(pending);
    pending = null;
  };
  const runNow = () => {
    cancel();
    lastRunMs = deps.now();
    deps.run();
  };
  return {
    ask: () => {
      const wait = deps.windowMs - (deps.now() - lastRunMs);
      if (wait <= 0) {
        runNow();
        return;
      }
      if (pending !== null) return; // one deferred run per window
      pending = deps.setTimer(() => {
        pending = null;
        runNow();
      }, wait);
    },
    noteRun: () => {
      cancel();
      lastRunMs = deps.now();
    },
    cancel,
  };
}
