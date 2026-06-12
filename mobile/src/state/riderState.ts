// Rider tactical state machine (W174, Pillar II Feature 4 / §3.4).
// Pure logic — no react-native imports; runs under `node --test`
// (type-stripped) as well as in the app. Erasable-syntax TS only.
//
// Committed state table (architectural names; UX copy deferred per SD-013):
//   Active   — moving ping received
//   Stopped  — no movement for stopped_threshold (default 2 min)
//   Inactive — no movement for inactive_threshold (default 5 min)
//   Dark     — no PING for dark_threshold (default 15 min)
//   Recovery — Stopped/Inactive: MOVING ping → Active; Dark: VALID ping → Active
//
// THE SENDER/RECEIVER SPLIT (the part the ticket's publish-seam framing
// couldn't see): a Dark rider, by definition, cannot broadcast — so Dark is
// NEVER sender-computed. The machine has two halves:
//   * sender half (SenderStateTracker): Active/Stopped/Inactive from the
//     device's own movement; published in every position ping.
//   * receiver half (deriveRenderState): Dark derived from ping staleness on
//     the RECEIVING device, overriding whatever state the last ping carried.
// Transitions are passive — no automated alerts anywhere (pitfall 1); state
// feeds the icon only.

export type RiderTacticalState = 'active' | 'stopped' | 'inactive' | 'dark';

// Per-tenant thresholds (tenants.rail3_*_threshold_minutes — W169 schema).
// Defaults mirror the column defaults; never hardcode at call sites.
export interface StateThresholds {
  stoppedMinutes: number;
  inactiveMinutes: number;
  darkMinutes: number;
}

export const DEFAULT_THRESHOLDS: StateThresholds = {
  stoppedMinutes: 2,
  inactiveMinutes: 5,
  darkMinutes: 15,
};

// Movement below this distance between accepted samples is GPS jitter, not
// riding. At the ~5s publish cadence this implies a ~2 m/s detection floor —
// cycling always clears it; a parked device's wander (and a slow bike-walk)
// does not. Tunable; cadence/epsilon validation is W179's scope.
export const MOVE_EPSILON_M = 10;

const minToMs = (m: number) => m * 60_000;

export interface SenderSample {
  distanceFromLastM: number; // haversine from the previous accepted sample
  atMs: number;
}

// Sender half. Feed every GPS sample; read the state to publish.
// Plain class with no side effects so tests can drive synthetic clocks.
export class SenderStateTracker {
  private lastMoveAtMs: number | null = null;
  private lastSampleAtMs: number | null = null;
  private readonly thresholds: StateThresholds;

  constructor(thresholds: StateThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  // Returns the tactical state to publish with this sample.
  sample({ distanceFromLastM, atMs }: SenderSample): RiderTacticalState {
    // Dark-recovery rule (committed table: Dark recovers on a VALID ping, not
    // a moving one): a publish gap past the dark threshold means the fleet saw
    // us Dark — this ping is the recovery, so the movement clock resets and we
    // report Active rather than instantly Inactive-at-a-standstill.
    if (
      this.lastSampleAtMs !== null &&
      atMs - this.lastSampleAtMs >= minToMs(this.thresholds.darkMinutes)
    ) {
      this.lastMoveAtMs = atMs;
    }

    if (this.lastMoveAtMs === null || distanceFromLastM >= MOVE_EPSILON_M) {
      // First sample counts as movement (we just appeared on the ride);
      // afterwards only real displacement does (Stopped/Inactive recover on a
      // MOVING ping — a stationary ping must not reset the movement clock).
      this.lastMoveAtMs = atMs;
    }
    this.lastSampleAtMs = atMs;

    const stillMs = atMs - this.lastMoveAtMs;
    if (stillMs >= minToMs(this.thresholds.inactiveMinutes)) return 'inactive';
    if (stillMs >= minToMs(this.thresholds.stoppedMinutes)) return 'stopped';
    return 'active';
  }
}

// Receiver half: what the MAP should render for a participant, given the last
// ping's self-reported state and when that ping arrived. Staleness past the
// dark threshold overrides — the sender cannot report its own Dark. A fresh
// ping (this function simply being called with a recent lastPingAtMs) clears
// Dark automatically: render whatever the ping reported.
export function deriveRenderState(
  reportedState: RiderTacticalState,
  lastPingAtMs: number | null,
  nowMs: number,
  thresholds: StateThresholds = DEFAULT_THRESHOLDS,
): RiderTacticalState {
  if (lastPingAtMs === null) return 'dark'; // never heard from — fail dark, not active
  if (nowMs - lastPingAtMs >= minToMs(thresholds.darkMinutes)) return 'dark';
  return reportedState;
}

// Maps the W169 tenant columns (already fetched with the ride) onto thresholds,
// falling back per-field to the defaults.
export function thresholdsFromTenant(row: {
  rail3_stopped_threshold_minutes?: number | null;
  rail3_inactive_threshold_minutes?: number | null;
  rail3_dark_threshold_minutes?: number | null;
} | null | undefined): StateThresholds {
  return {
    stoppedMinutes: row?.rail3_stopped_threshold_minutes ?? DEFAULT_THRESHOLDS.stoppedMinutes,
    inactiveMinutes: row?.rail3_inactive_threshold_minutes ?? DEFAULT_THRESHOLDS.inactiveMinutes,
    darkMinutes: row?.rail3_dark_threshold_minutes ?? DEFAULT_THRESHOLDS.darkMinutes,
  };
}
