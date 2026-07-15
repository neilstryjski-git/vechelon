// W269 — unit tests for the device-agnostic resume detector: clock-gap detection, the
// staleness-sweep gate, and trailing coalescing of multiple emitters into one recovery.
//
// Runs via `npm test` (node --experimental-strip-types --test) — resumeDetector.ts is loaded
// directly with types stripped. It imports no React Native and no supabase precisely so this
// works: the detection logic must be testable without a device.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOCK_GAP_THRESHOLD_MS,
  CHANNEL_SILENCE_MS,
  STALE_COOLDOWN_MS,
  ResumeCoalescer,
  isChannelStale,
  isClockGap,
} from '../src/lib/resumeDetector.ts';

// --- clock gap: a timer that did not run ------------------------------------------------------

test('a tick arriving on schedule is not a gap', () => {
  const t = 1_000_000;
  assert.equal(isClockGap(t + 1000, t), false);
});

test('normal timer jitter is not a gap', () => {
  const t = 1_000_000;
  assert.equal(isClockGap(t + CLOCK_GAP_THRESHOLD_MS - 1, t), false);
});

test('a suspended thread (wall clock jumped past the threshold) is a gap', () => {
  const t = 1_000_000;
  assert.equal(isClockGap(t + CLOCK_GAP_THRESHOLD_MS, t), true);
  assert.equal(isClockGap(t + 33 * 60 * 1000, t), true); // the 2026-07-09 morning pocket
});

test('clock-gap threshold is caller-overridable', () => {
  const t = 1_000_000;
  assert.equal(isClockGap(t + 2000, t, 1500), true);
  assert.equal(isClockGap(t + 2000, t, 2500), false);
});

// --- staleness sweep: a channel that died while we stayed awake --------------------------------

const staleBase = {
  nowMs: 1_000_000,
  lastActivityMs: 1_000_000 - CHANNEL_SILENCE_MS,
  peerCount: 2,
  lastStaleEmitMs: 0,
};

test('silence past the threshold with peers on the roster is stale', () => {
  assert.equal(isChannelStale(staleBase), true);
});

test('a SUBSCRIBED (healthy) channel is never swept, however long it is quiet (D85)', () => {
  // Post-ride: nobody broadcasts, channel is fine — the pre-D85 sweep rebuilt it every 5 min forever.
  assert.equal(isChannelStale({ ...staleBase, channelSubscribed: true }), false);
  // even long past the cooldown, a healthy channel stays unswept
  assert.equal(
    isChannelStale({ ...staleBase, channelSubscribed: true, lastStaleEmitMs: staleBase.nowMs - STALE_COOLDOWN_MS }),
    false,
  );
});

test('a dead (not-subscribed) channel is still swept — the D72 case survives the D85 gate', () => {
  assert.equal(isChannelStale({ ...staleBase, channelSubscribed: false }), true);
});

test('riding alone is never stale — silence is correct, a rebuild is pure cost', () => {
  assert.equal(isChannelStale({ ...staleBase, peerCount: 0 }), false);
});

test('a recently active channel is not stale', () => {
  assert.equal(
    isChannelStale({ ...staleBase, lastActivityMs: staleBase.nowMs - 1000 }),
    false,
  );
});

test('the cooldown stops the sweep re-firing every tick while a channel stays quiet', () => {
  const justEmitted = { ...staleBase, lastStaleEmitMs: staleBase.nowMs - 1000 };
  assert.equal(isChannelStale(justEmitted), false);
  const cooledDown = { ...staleBase, lastStaleEmitMs: staleBase.nowMs - STALE_COOLDOWN_MS };
  assert.equal(isChannelStale(cooledDown), true);
});

// --- coalescing: one unlock, one recovery ------------------------------------------------------

test('nothing is due before anything is offered', () => {
  const c = new ResumeCoalescer(1200);
  assert.equal(c.flushDue(1_000_000), null);
  assert.equal(c.isPending, false);
});

test('a single offer flushes once the window elapses, and only once', () => {
  const c = new ResumeCoalescer(1200);
  const t = 1_000_000;
  c.offer('appstate', t);
  assert.equal(c.flushDue(t + 1199), null, 'window still open');
  assert.equal(c.flushDue(t + 1200), 'appstate');
  assert.equal(c.flushDue(t + 5000), null, 'cleared after flush');
});

test('two emitters inside the window collapse to ONE recovery, attributed to the detector that fired first', () => {
  const c = new ResumeCoalescer(1200);
  const t = 1_000_000;
  c.offer('appstate', t);
  c.offer('clockgap', t + 100); // same unlock, both emitters trip
  const flushes = [];
  for (let now = t; now <= t + 4000; now += 100) {
    const due = c.flushDue(now);
    if (due) flushes.push(due);
  }
  assert.deepEqual(flushes, ['appstate'], 'exactly one emission, first source wins');
});

test('a trailing offer extends the window (a flap settles, it does not thrash)', () => {
  const c = new ResumeCoalescer(1200);
  const t = 1_000_000;
  c.offer('clockgap', t);
  c.offer('appstate', t + 1000); // extends the deadline to t+2200
  assert.equal(c.flushDue(t + 1200), null, 'original deadline superseded');
  assert.equal(c.flushDue(t + 2200), 'clockgap');
});

test('reset drops a half-open window so it cannot flush into the next ride', () => {
  const c = new ResumeCoalescer(1200);
  const t = 1_000_000;
  c.offer('clockgap', t);
  assert.equal(c.isPending, true);
  c.reset(); // driver teardown between rides
  assert.equal(c.isPending, false);
  assert.equal(c.flushDue(t + 5000), null, 'no phantom recovery on the next ride');
});

test('a second unlock after a flush emits again', () => {
  const c = new ResumeCoalescer(1200);
  const t = 1_000_000;
  c.offer('clockgap', t);
  assert.equal(c.flushDue(t + 1200), 'clockgap');
  c.offer('stale', t + 10_000);
  assert.equal(c.flushDue(t + 11_200), 'stale');
});
