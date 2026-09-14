// W279 (wTBD2) — Saver-at-start measurement: engine start → first accepted fix.
//
// Pillar IV §6 wTBD2 asks for the DISTRIBUTION of "engine start to first fix" under Android
// Battery Saver (on vs off, cold vs warm start, per device), plus every run that produced no fix
// at all and how long it ran. This module is the pure bookkeeping for ONE engine run: it knows
// nothing about rides, Supabase, or the native SDK, so it loads under `node --test` and the
// arithmetic is unit-tested. bgGeo.ts drives it; useFleetPositions.ts logs what it reports.
//
// Out of scope by ruling (Ledger §8.3 D4): no tuning, fixing, or working around the delay, and
// no threshold selection — this only measures. Coordinates are never part of the report.

export interface EngineStartContext {
  // Device clock (Date.now()) when the engine run began. Provisional at begin(); refined by
  // markStarted() once BackgroundGeolocation.start() resolves, unless a fix already arrived.
  startTs: number;
  // First engine start in this process (ready() had not run yet) vs a re-start in a warm process.
  coldStart: boolean;
  // Android Battery Saver at start(). null = could not be read in time (timeout / non-Android).
  saverOn: boolean | null;
}

export interface EngineFirstFixInfo {
  // 'fix' = the first onLocation fix arrived; 'no_fix' = the run stopped without any fix.
  outcome: 'fix' | 'no_fix';
  // Milliseconds from engine start to the first fix, or to stop for a no_fix run.
  delta_ms: number;
  cold_start: boolean;
  saver_on: boolean | null;
  engine_start_ts: number;
}

export interface FirstFixTracker {
  // A new engine run begins (called before start() so an early fix is never missed).
  begin(ctx: EngineStartContext): void;
  // start() resolved: refine the start timestamp if no fix has arrived yet.
  markStarted(ts: number): void;
  // A fix arrived. Returns the report exactly once per run, null otherwise. `fixTs` is the
  // fix's own timestamp when the source supplies one: a fix produced BEFORE this run began is
  // a carry-over from the previous engine run (a queued onLocation landing after a warm
  // restart) and is ignored rather than recorded as a near-zero first fix.
  onFix(ts: number, fixTs?: number): EngineFirstFixInfo | null;
  // The run is stopping. Returns a no_fix report if no fix was ever seen, null otherwise.
  onStop(ts: number): EngineFirstFixInfo | null;
  // True while a run is open and its first fix has not been reported.
  pending(): boolean;
}

export function createFirstFixTracker(): FirstFixTracker {
  let ctx: EngineStartContext | null = null;
  let reported = false;

  const report = (outcome: EngineFirstFixInfo['outcome'], ts: number): EngineFirstFixInfo => {
    const c = ctx as EngineStartContext;
    reported = true;
    return {
      outcome,
      delta_ms: Math.max(0, ts - c.startTs),
      cold_start: c.coldStart,
      saver_on: c.saverOn,
      engine_start_ts: c.startTs,
    };
  };

  return {
    begin(next) {
      ctx = { ...next };
      reported = false;
    },
    markStarted(ts) {
      if (ctx && !reported) ctx.startTs = ts;
    },
    onFix(ts, fixTs) {
      if (!ctx || reported) return null;
      if (fixTs !== undefined && Number.isFinite(fixTs) && fixTs < ctx.startTs) return null; // carry-over
      return report('fix', ts);
    },
    onStop(ts) {
      if (!ctx || reported) return null;
      const info = report('no_fix', ts);
      ctx = null;
      return info;
    },
    pending() {
      return ctx !== null && !reported;
    },
  };
}

// Bound an async read so the measurement can never wedge the engine start path (mirrors the
// POWER_READ_TIMEOUT_MS race in lifecycle.ts). Takes a thunk so a synchronous throw inside the
// read (a missing native module, a non-thenable) also resolves to `fallback` — the promise this
// returns never rejects. Resolves `fallback` on timeout or rejection.
export function withTimeout<T>(read: () => Promise<T> | T, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  let guarded: Promise<T>;
  try {
    guarded = Promise.resolve(read()).catch(() => fallback);
  } catch {
    guarded = Promise.resolve(fallback);
  }
  return Promise.race([guarded, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
