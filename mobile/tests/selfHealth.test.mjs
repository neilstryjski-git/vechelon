// W285 — unit tests for the R3-40 self-health clocks (Ledger A3 / slate 4; Pillar III R3-40/43/48).
// Runs via `npm test` (node --experimental-strip-types --test). Config values here are TEST
// fixtures only — the app's values come from rail3_operator_config, never from code.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateSelfHealth,
  nextEpisode,
  INITIAL_EPISODE,
  STARTUP_MARGIN_S,
} from '../src/lib/selfHealth.ts';

const T0 = 1_000_000_000_000;
const S = 1000;
const CFG = { startup_ceiling_s: 180, steady_state_threshold_s: 90 };
const base = (over = {}) => ({
  engineStartedAtMs: T0,
  lastFixAtMs: null,
  lastEngineSignalAtMs: T0,
  engineMoving: null,
  engineDied: false,
  nowMs: T0,
  config: CFG,
  ...over,
});

// ── inert: never "not reaching" without a usable config or a started engine ─────────────────

test('inert: null config, either value null/zero, the empty iOS row, and a never-started engine are NEVER not-reaching at any time', () => {
  const inerts = [
    base({ config: null }),
    base({ config: undefined }),
    base({ config: { startup_ceiling_s: null, steady_state_threshold_s: 90 } }),
    base({ config: { startup_ceiling_s: 180, steady_state_threshold_s: null } }),
    base({ config: { startup_ceiling_s: 0, steady_state_threshold_s: 90 } }),
    base({ config: { startup_ceiling_s: null, steady_state_threshold_s: null } }), // iOS row by ruling
    base({ engineStartedAtMs: null, lastFixAtMs: T0 - 5 * S }), // permission denied / start() rejected
    base({ engineStartedAtMs: null, engineDied: true }),
  ];
  for (const inp of inerts) {
    for (const dt of [0, 60 * 60 * S, 24 * 60 * 60 * S]) {
      const r = evaluateSelfHealth({ ...inp, nowMs: T0 + dt });
      assert.equal(r.phase, 'inert', JSON.stringify({ inp, dt }));
      assert.equal(r.reaching, true);
      assert.equal(r.sinceS, null);
      assert.equal(r.thresholdS, null);
    }
  }
  assert.equal(evaluateSelfHealth(base({ config: null })).reason, 'no_config');
  assert.equal(evaluateSelfHealth(base({ engineStartedAtMs: null })).reason, 'engine_not_started');
});

// ── startup clock: ceiling + stated margin, no stationary exemption ────────────────────────────

test('startup: silent inside ceiling+margin (R3-43 window), not reaching at the boundary; margin override; stationary does not exempt', () => {
  const windowS = CFG.startup_ceiling_s + STARTUP_MARGIN_S;
  const inside = evaluateSelfHealth(base({ nowMs: T0 + windowS * S - 1 }));
  assert.deepEqual([inside.phase, inside.reaching, inside.reason, inside.thresholdS], ['startup', true, 'within_startup_window', windowS]);
  assert.equal(inside.sinceS, windowS - 1);
  const at = evaluateSelfHealth(base({ nowMs: T0 + windowS * S }));
  assert.deepEqual([at.phase, at.reaching, at.reason], ['startup', false, 'no_first_fix']);
  // margin override shifts the boundary to the bare ceiling
  assert.equal(evaluateSelfHealth(base({ nowMs: T0 + 180 * S, startupMarginS: 0 })).reaching, false);
  assert.equal(evaluateSelfHealth(base({ nowMs: T0 + 180 * S - 1, startupMarginS: 0 })).reaching, true);
  // a stationary engine in startup IS the Saver-at-start failure — no exemption
  assert.equal(evaluateSelfHealth(base({ nowMs: T0 + windowS * S, engineMoving: false, lastEngineSignalAtMs: T0 + windowS * S - 1 })).reaching, false);
});

test('a fix that predates engine start keeps the clocks in STARTUP; a fix at/after start moves them to STEADY', () => {
  assert.equal(evaluateSelfHealth(base({ lastFixAtMs: T0 - 1 })).phase, 'startup');
  assert.equal(evaluateSelfHealth(base({ lastFixAtMs: T0 })).phase, 'steady');
  assert.equal(evaluateSelfHealth(base({ lastFixAtMs: T0 + 1 })).phase, 'steady');
});

// ── steady clock ────────────────────────────────────────────────────────────────────────────────

test('steady: reaching while the last fix is fresher than the threshold; fix_gap at the boundary', () => {
  const fix = T0 + 10 * S;
  const fresh = evaluateSelfHealth(base({ lastFixAtMs: fix, nowMs: fix + 90 * S - 1, engineMoving: true }));
  assert.deepEqual([fresh.phase, fresh.reaching, fresh.reason, fresh.thresholdS, fresh.sinceS], ['steady', true, 'fresh_fix', 90, 89]);
  const gap = evaluateSelfHealth(base({ lastFixAtMs: fix, nowMs: fix + 90 * S, engineMoving: true }));
  assert.deepEqual([gap.phase, gap.reaching, gap.reason, gap.sinceS], ['steady', false, 'fix_gap', 90]);
});

test('stationary exemption: a stationary engine that is still ALIVE is quiet, not failing; a silent one is dead; unknown motion gets no exemption', () => {
  const fix = T0 + 10 * S;
  const now = fix + 120 * S; // well past the 90 s threshold
  assert.equal(evaluateSelfHealth(base({ lastFixAtMs: fix, nowMs: now, engineMoving: false, lastEngineSignalAtMs: now - 60 * S })).reason, 'stationary_quiet');
  assert.equal(evaluateSelfHealth(base({ lastFixAtMs: fix, nowMs: now, engineMoving: false, lastEngineSignalAtMs: now - 60 * S })).reaching, true);
  const dead = evaluateSelfHealth(base({ lastFixAtMs: fix, nowMs: now, engineMoving: false, lastEngineSignalAtMs: now - 90 * S }));
  assert.deepEqual([dead.reaching, dead.reason], [false, 'stationary_silent']);
  assert.equal(evaluateSelfHealth(base({ lastFixAtMs: fix, nowMs: now, engineMoving: null, lastEngineSignalAtMs: now - 1 })).reason, 'fix_gap');
  assert.equal(evaluateSelfHealth(base({ lastFixAtMs: fix, nowMs: now, engineMoving: false, lastEngineSignalAtMs: null })).reason, 'stationary_silent');
});

test('engine_died is not reaching immediately in either phase, whatever the clocks say; a null config still wins (inert)', () => {
  const inStartup = evaluateSelfHealth(base({ engineDied: true, nowMs: T0 + 5 * S }));
  assert.deepEqual([inStartup.phase, inStartup.reaching, inStartup.reason], ['startup', false, 'engine_died']);
  const inSteady = evaluateSelfHealth(base({ engineDied: true, lastFixAtMs: T0 + 10 * S, nowMs: T0 + 11 * S }));
  assert.deepEqual([inSteady.phase, inSteady.reaching, inSteady.reason], ['steady', false, 'engine_died']);
  assert.equal(evaluateSelfHealth(base({ engineDied: true, config: null })).phase, 'inert');
});

// ── episode dedupe: exactly one warning per reaching → not-reaching transition ────────────────

test('nextEpisode: fires once on the transition, never while persisting, resets silently on repair, fires again on a new episode', () => {
  let s = INITIAL_EPISODE;
  const fired = [];
  for (const reaching of [true, false, false, true, false, false, true]) {
    const r = nextEpisode(s, reaching);
    s = r.state;
    fired.push(r.fireWarning);
  }
  assert.deepEqual(fired, [false, true, false, false, true, false, false]);
  assert.deepEqual(s, INITIAL_EPISODE);
  assert.deepEqual(nextEpisode(INITIAL_EPISODE, true), { state: INITIAL_EPISODE, fireWarning: false });
  assert.deepEqual(nextEpisode({ notReaching: true, warned: true }, false), { state: { notReaching: true, warned: true }, fireWarning: false });
});
