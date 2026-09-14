// W279 (wTBD2) — unit tests for the engine-start → first-fix tracker. Pure module: no React
// Native, no supabase, no native SDK, so it loads under `npm test` with types stripped.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createFirstFixTracker, withTimeout } from '../src/lib/engineFirstFix.ts';

test('reports the first fix exactly once with the delta from engine start', () => {
  const t = createFirstFixTracker();
  t.begin({ startTs: 1000, coldStart: true, saverOn: true });
  assert.equal(t.pending(), true);
  const info = t.onFix(4500);
  assert.deepEqual(info, {
    outcome: 'fix',
    delta_ms: 3500,
    cold_start: true,
    saver_on: true,
    engine_start_ts: 1000,
  });
  assert.equal(t.onFix(5000), null, 'second fix is not reported');
  assert.equal(t.onStop(9000), null, 'stop after a fix is not a no_fix run');
  assert.equal(t.pending(), false);
});

test('markStarted refines the start timestamp only until a fix arrives', () => {
  const t = createFirstFixTracker();
  t.begin({ startTs: 1000, coldStart: false, saverOn: false });
  t.markStarted(1800);
  const info = t.onFix(2800);
  assert.equal(info?.delta_ms, 1000);
  assert.equal(info?.engine_start_ts, 1800);

  const early = createFirstFixTracker();
  early.begin({ startTs: 1000, coldStart: false, saverOn: null });
  const first = early.onFix(1200); // fix before start() resolved
  early.markStarted(1800); // must not rewrite history
  assert.equal(first?.delta_ms, 200);
  assert.equal(first?.engine_start_ts, 1000);
});

test('a run that stops without any fix reports no_fix with how long it ran', () => {
  const t = createFirstFixTracker();
  t.begin({ startTs: 5000, coldStart: true, saverOn: null });
  const info = t.onStop(65000);
  assert.deepEqual(info, {
    outcome: 'no_fix',
    delta_ms: 60000,
    cold_start: true,
    saver_on: null,
    engine_start_ts: 5000,
  });
  assert.equal(t.onStop(70000), null, 'a second stop reports nothing');
  assert.equal(t.onFix(70000), null, 'a late fix after stop is not attributed to the closed run');
  assert.equal(t.pending(), false);
});

test('nothing is reported before begin, and a new run resets the report state', () => {
  const t = createFirstFixTracker();
  assert.equal(t.onFix(100), null);
  assert.equal(t.onStop(100), null);
  assert.equal(t.pending(), false);

  t.begin({ startTs: 100, coldStart: true, saverOn: true });
  assert.ok(t.onFix(150));
  t.begin({ startTs: 1000, coldStart: false, saverOn: false }); // warm restart, same process
  const second = t.onFix(1300);
  assert.equal(second?.cold_start, false);
  assert.equal(second?.delta_ms, 300);
});

test('delta never goes negative if the clock steps backwards', () => {
  const t = createFirstFixTracker();
  t.begin({ startTs: 5000, coldStart: true, saverOn: true });
  assert.equal(t.onFix(4000)?.delta_ms, 0);
});

test('a fix stamped before the run began is a carry-over and is not the first fix', () => {
  const t = createFirstFixTracker();
  t.begin({ startTs: 10000, coldStart: false, saverOn: false });
  assert.equal(t.onFix(10050, 9000), null, 'queued fix from the previous engine run is ignored');
  assert.equal(t.pending(), true, 'the run is still waiting for its real first fix');
  const real = t.onFix(12000, 11900);
  assert.equal(real?.delta_ms, 2000);
  assert.equal(t.onFix(13000, 5000), null, 'nothing after the report, carry-over or not');
});

test('withTimeout resolves the fallback on timeout, rejection and sync throw; the value otherwise', async () => {
  assert.equal(await withTimeout(() => Promise.resolve(true), 50, null), true);
  assert.equal(await withTimeout(() => true, 50, null), true, 'a plain value is accepted');
  assert.equal(await withTimeout(() => Promise.reject(new Error('boom')), 50, null), null);
  assert.equal(await withTimeout(() => { throw new Error('sync'); }, 50, null), null);
  const slow = () => new Promise((resolve) => setTimeout(() => resolve(true), 200));
  assert.equal(await withTimeout(slow, 10, null), null);
});
