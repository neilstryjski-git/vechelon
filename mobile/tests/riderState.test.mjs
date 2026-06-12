// W174 — unit tests for the rider tactical state machine: sender-side
// transitions at (configurable) tenant thresholds, moving-ping recovery, the
// receiver-side Dark derivation, and the Dark-recovery reset.
// Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SenderStateTracker,
  deriveRenderState,
  thresholdsFromTenant,
  DEFAULT_THRESHOLDS,
  MOVE_EPSILON_M,
} from '../src/state/riderState.ts';

const MIN = 60_000;
const T0 = 1_000_000_000_000;

// Drive a tracker with (distance, minutesSinceT0) pairs; return last state.
function run(tracker, samples) {
  let out = null;
  for (const [d, min] of samples) out = tracker.sample({ distanceFromLastM: d, atMs: T0 + min * MIN });
  return out;
}

// ── Sender half: Active → Stopped → Inactive at thresholds ──────────────────

test('transitions fire at the default 2/5 thresholds; first sample is Active', () => {
  const t = new SenderStateTracker();
  assert.equal(run(t, [[Infinity, 0]]), 'active'); // appearing counts as movement
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 1.9 * MIN }), 'active');
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 2 * MIN }), 'stopped');
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 4.9 * MIN }), 'stopped');
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 5 * MIN }), 'inactive');
});

test('custom tenant thresholds shift the transition points', () => {
  const t = new SenderStateTracker({ stoppedMinutes: 1, inactiveMinutes: 3, darkMinutes: 10 });
  t.sample({ distanceFromLastM: Infinity, atMs: T0 });
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 1 * MIN }), 'stopped');
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 3 * MIN }), 'inactive');
});

test('recovery to Active requires a MOVING ping; stationary pings do not recover', () => {
  const t = new SenderStateTracker();
  t.sample({ distanceFromLastM: Infinity, atMs: T0 });
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 3 * MIN }), 'stopped');
  // Stationary ping (GPS jitter under epsilon) — still stopped.
  assert.equal(t.sample({ distanceFromLastM: MOVE_EPSILON_M - 1, atMs: T0 + 3.5 * MIN }), 'stopped');
  // Real displacement — Active again.
  assert.equal(t.sample({ distanceFromLastM: MOVE_EPSILON_M, atMs: T0 + 4 * MIN }), 'active');
});

test('Dark-recovery rule: a publish gap past the dark threshold resets to Active on the next ping', () => {
  const t = new SenderStateTracker();
  t.sample({ distanceFromLastM: Infinity, atMs: T0 });
  t.sample({ distanceFromLastM: 0, atMs: T0 + 6 * MIN }); // inactive
  // 16-minute silence (the fleet saw us Dark), then a stationary reconnect
  // ping: the committed table says Dark recovers on a VALID ping → Active.
  assert.equal(t.sample({ distanceFromLastM: 0, atMs: T0 + 22 * MIN }), 'active');
});

// ── Receiver half: Dark from staleness ──────────────────────────────────────

test('receiver derives Dark from receipt staleness, overriding the reported state', () => {
  const now = T0 + 20 * MIN;
  assert.equal(deriveRenderState('active', T0 + 19 * MIN, now), 'active'); // fresh
  assert.equal(deriveRenderState('stopped', T0 + 6 * MIN, now), 'stopped'); // stale but < 15 min
  assert.equal(deriveRenderState('active', T0 + 4 * MIN, now), 'dark'); // ≥ 15 min — sender claim irrelevant
  assert.equal(deriveRenderState('active', null, now), 'dark'); // never heard from: fail dark, not active
});

test('a fresh ping clears Dark implicitly (render whatever it reported)', () => {
  const now = T0 + 40 * MIN;
  // Was dark (last receipt 20 min ago) … new ping arrives now reporting stopped.
  assert.equal(deriveRenderState('stopped', now - 1000, now), 'stopped');
});

test('custom dark threshold honored receiver-side', () => {
  const th = { stoppedMinutes: 2, inactiveMinutes: 5, darkMinutes: 8 };
  const now = T0 + 10 * MIN;
  assert.equal(deriveRenderState('active', T0 + 1 * MIN, now, th), 'dark'); // 9 min ≥ 8
  assert.equal(deriveRenderState('active', T0 + 3 * MIN, now, th), 'active'); // 7 min < 8
});

// ── Threshold mapping from the W169 tenant columns ──────────────────────────

test('thresholdsFromTenant maps columns with per-field default fallback', () => {
  assert.deepEqual(thresholdsFromTenant(null), DEFAULT_THRESHOLDS);
  assert.deepEqual(
    thresholdsFromTenant({ rail3_stopped_threshold_minutes: 3, rail3_inactive_threshold_minutes: null }),
    { stoppedMinutes: 3, inactiveMinutes: 5, darkMinutes: 15 },
  );
});
