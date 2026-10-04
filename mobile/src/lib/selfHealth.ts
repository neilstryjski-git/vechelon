// W285 — R3-40 self-health clocks (Ledger A3 / slate 4 / item 22; Pillar III R3-40 / R3-43 /
// R3-48). PURE: no react-native / supabase imports; exercised by tests/selfHealth.test.mjs under
// `node --experimental-strip-types --test` (riderState.ts pattern). The I/O half is
// hooks/useSelfHealth.ts; the signals come from lib/selfHealthSignals.ts.
//
// TWO CLOCKS, operator-level and per-platform (rail3_operator_config, SELECT-only to riders —
// slate 4 / item 22), NEVER the tenant fleet thresholds (different inputs, no coupling):
//   • STARTUP counts from engine start, bounded by the measured Saver-at-start ceiling
//     (startup_ceiling_s, from the Ledger-confirmed wTBD2 brief — W279) PLUS the stated margin
//     below. Inside the window the rider is NOT presented as stale (R3-43 "known startup window").
//   • STEADY counts from the last successful fix (steady_state_threshold_s).
// Null config (iOS row by ruling; Android until W279's values are populated) = INERT: no clock, no
// badge, no prompt — never "not reaching". Unmeasured numbers never enter the app: the only
// constant here is OUR margin.
//
// Binary output: reaching | not reaching. 'inert'/'startup'/'steady' are the PHASE of the clocks,
// not TacticalStates — overlays are presentations, not rungs (A3).

// The "stated margin" (ours, documented in log_of_changes): covers the 5 s evaluation tick, the
// start()-resolve → engine_started receipt gap and Activity-Recognition latency after
// changePace(true). Small against a multi-minute ceiling. The ceiling itself is NEVER here.
export const STARTUP_MARGIN_S = 30;

export type SelfHealthPhase = 'inert' | 'startup' | 'steady';
export type SelfHealthReason =
  | 'no_config'
  | 'engine_not_started' // inert
  | 'within_startup_window'
  | 'fresh_fix'
  | 'stationary_quiet' // reaching
  | 'engine_died'
  | 'never_engaged' // review r1: tracking intended, start() never resolved
  | 'no_first_fix'
  | 'fix_gap'
  | 'stationary_silent'; // not reaching

export interface SelfHealthConfig {
  startup_ceiling_s: number | null;
  steady_state_threshold_s: number | null;
}

export interface SelfHealthInput {
  // When the engine effect decided to track (before start() resolves); null = no intent (e.g.
  // permission denied — the effect never runs). Optional for callers that predate review r1.
  engineIntentAtMs?: number | null;
  engineStartedAtMs: number | null;
  lastFixAtMs: number | null;
  lastEngineSignalAtMs: number | null;
  engineMoving: boolean | null;
  engineDied: boolean;
  nowMs: number;
  config: SelfHealthConfig | null | undefined;
  startupMarginS?: number; // default STARTUP_MARGIN_S
}

export interface SelfHealthResult {
  phase: SelfHealthPhase;
  reaching: boolean;
  reason: SelfHealthReason;
  // Seconds since engine start (startup) or since the last fix (steady), floored; null when inert.
  sinceS: number | null;
  // ceiling + margin (startup) or the steady threshold (steady), in seconds; null when inert.
  thresholdS: number | null;
}

const usable = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

// Evaluation order — first match wins:
//  1. no usable config → inert.
//  2. engine never started: with NO tracking intent (permission denied — the engine effect never
//     runs) → inert: the app never claimed background tracking, so "tracking should be active" is
//     false; the join-time advisory and the Sleeping ping cover that rider (recorded deviation, see
//     log). WITH intent but no engine_started (start() rejected / hung) → the startup clock from the
//     intent, failing as 'never_engaged' (review r1).
//  3. engine_died → NOT reaching at once, whatever the clocks: "service termination detectable
//     while the process lives" IS the failure. Cleared only by the next engine_started.
//  4. no fix since engine start → STARTUP: reaching inside ceiling+margin, not reaching after.
//     No stationary exemption here — D90 forces moving at start; a stationary engine in startup IS
//     the Saver-at-start failure.
//  5. STEADY: reaching while the last fix is fresher than the threshold; else the stationary
//     exemption applies ONLY while the engine is ALIVE (it reported stationary AND has given any
//     signal within the threshold — a stationary engine heartbeats); a stationary engine silent for
//     a whole threshold is dead, not parked (R3-48: no unrepaired failure stays silent).
export function evaluateSelfHealth(i: SelfHealthInput): SelfHealthResult {
  const cfg = i.config;
  if (!cfg || !usable(cfg.startup_ceiling_s) || !usable(cfg.steady_state_threshold_s)) {
    return { phase: 'inert', reaching: true, reason: 'no_config', sinceS: null, thresholdS: null };
  }
  const marginS = i.startupMarginS ?? STARTUP_MARGIN_S;
  const windowS = cfg.startup_ceiling_s + marginS;
  if (i.engineStartedAtMs === null) {
    // Review r1: the app DID decide to track but start() never resolved (it rejected, or is hung) —
    // "the app's state says tracking should be active" holds, so this is the startup clock measured
    // from the intent, failing as 'never_engaged'. No intent at all (permission denied) stays inert.
    const intent = i.engineIntentAtMs ?? null;
    if (intent === null) {
      return { phase: 'inert', reaching: true, reason: 'engine_not_started', sinceS: null, thresholdS: null };
    }
    const inWindow = i.nowMs - intent < windowS * 1000;
    return {
      phase: 'startup',
      reaching: inWindow,
      reason: inWindow ? 'within_startup_window' : 'never_engaged',
      sinceS: Math.floor((i.nowMs - intent) / 1000),
      thresholdS: windowS,
    };
  }
  const steadyS = cfg.steady_state_threshold_s;
  const hasFixSinceStart = i.lastFixAtMs !== null && i.lastFixAtMs >= i.engineStartedAtMs;
  const sinceStartS = Math.floor((i.nowMs - i.engineStartedAtMs) / 1000);
  const sinceFixS = i.lastFixAtMs === null ? null : Math.floor((i.nowMs - i.lastFixAtMs) / 1000);

  if (i.engineDied) {
    return hasFixSinceStart
      ? { phase: 'steady', reaching: false, reason: 'engine_died', sinceS: sinceFixS, thresholdS: steadyS }
      : { phase: 'startup', reaching: false, reason: 'engine_died', sinceS: sinceStartS, thresholdS: windowS };
  }
  if (!hasFixSinceStart) {
    const inWindow = i.nowMs - i.engineStartedAtMs < windowS * 1000;
    return {
      phase: 'startup',
      reaching: inWindow,
      reason: inWindow ? 'within_startup_window' : 'no_first_fix',
      sinceS: sinceStartS,
      thresholdS: windowS,
    };
  }
  const sinceFixMs = i.nowMs - (i.lastFixAtMs as number);
  if (sinceFixMs < steadyS * 1000) {
    return { phase: 'steady', reaching: true, reason: 'fresh_fix', sinceS: sinceFixS, thresholdS: steadyS };
  }
  const engineAlive = i.lastEngineSignalAtMs !== null && i.nowMs - i.lastEngineSignalAtMs < steadyS * 1000;
  if (i.engineMoving === false && engineAlive) {
    return { phase: 'steady', reaching: true, reason: 'stationary_quiet', sinceS: sinceFixS, thresholdS: steadyS };
  }
  return {
    phase: 'steady',
    reaching: false,
    reason: i.engineMoving === false ? 'stationary_silent' : 'fix_gap',
    sinceS: sinceFixS,
    thresholdS: steadyS,
  };
}

// Episode dedupe: warning_fired is counted EXACTLY ONCE per reaching → not-reaching transition;
// repair resets silently (no post-heal message, no counter — "silence follows repair").
export interface EpisodeState {
  notReaching: boolean;
  warned: boolean;
}
export const INITIAL_EPISODE: EpisodeState = Object.freeze({ notReaching: false, warned: false });

export function nextEpisode(prev: EpisodeState, reaching: boolean): { state: EpisodeState; fireWarning: boolean } {
  if (!reaching && !prev.notReaching) return { state: { notReaching: true, warned: true }, fireWarning: true };
  if (!reaching) return { state: prev, fireWarning: false };
  if (prev.notReaching) return { state: INITIAL_EPISODE, fireWarning: false };
  return { state: prev, fireWarning: false };
}
