// W287 — unit tests for the convergent ride-end teardown's pure decisions (Ledger slate 13, A2;
// R3-69 / R3-35 / R3-67 / R3-70). Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldTearDown,
  statusRetryDelayMs,
  readStatusWithRetry,
  decideRideEndAction,
  shouldReadStatusOnBeat,
  STATUS_READ_MAX_ATTEMPTS,
  STATUS_READ_BASE_MS,
  STATUS_READ_CAP_MS,
  HEARTBEAT_STATUS_EVERY_N_BEATS,
} from '../src/lib/rideEndCheck.ts';

// --- A2: only an affirmative 'saved' ----------------------------------------------------------

test("shouldTearDown is true for 'saved' and nothing else (null/unknown is never an affirmative read)", () => {
  assert.equal(shouldTearDown('saved'), true);
  for (const s of ['active', 'created', 'purged', 'SAVED', 'Saved', '', null, undefined]) {
    assert.equal(shouldTearDown(s), false, `status=${s}`);
  }
});

// --- bounded jittered retry ---------------------------------------------------------------------

test('retry delay is jittered within [base/2, base) and capped', () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const base = Math.min(STATUS_READ_CAP_MS, STATUS_READ_BASE_MS * 2 ** attempt);
    assert.equal(statusRetryDelayMs(attempt, () => 0), base / 2);
    assert.ok(statusRetryDelayMs(attempt, () => 0.999) < base);
  }
  assert.equal(statusRetryDelayMs(10, () => 0), STATUS_READ_CAP_MS / 2, 'capped');
});

test('readStatusWithRetry: two throws then an answer → the answer, with bounded sleeps', async () => {
  let calls = 0;
  const sleeps = [];
  const fetchStatus = async () => {
    calls += 1;
    if (calls < 3) throw new Error('offline');
    return 'saved';
  };
  const status = await readStatusWithRetry(fetchStatus, { rand: () => 0, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(status, 'saved');
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [STATUS_READ_BASE_MS / 2, STATUS_READ_BASE_MS]);
});

test('readStatusWithRetry: always throws → null after max attempts (never a teardown); a null ROW is an answer on the first try', async () => {
  let calls = 0;
  const status = await readStatusWithRetry(async () => { calls += 1; throw new Error('x'); }, { sleep: async () => {} });
  assert.equal(status, null);
  assert.equal(calls, STATUS_READ_MAX_ATTEMPTS);
  let calls2 = 0;
  const s2 = await readStatusWithRetry(async () => { calls2 += 1; return null; }, { sleep: async () => {} });
  assert.equal(s2, null);
  assert.equal(calls2, 1);
});

// --- foreground action --------------------------------------------------------------------------

test('decideRideEndAction: saved+active → notify; saved+background/inactive/null → silent; captain → silent; non-saved → none', () => {
  assert.equal(decideRideEndAction({ status: 'saved', appState: 'active' }), 'teardown_notify');
  for (const appState of ['background', 'inactive', null, undefined]) {
    assert.equal(decideRideEndAction({ status: 'saved', appState }), 'teardown_silent', `appState=${appState}`);
  }
  assert.equal(decideRideEndAction({ status: 'saved', appState: 'active', iAmCaptain: true }), 'teardown_silent');
  for (const status of ['active', 'created', null]) {
    assert.equal(decideRideEndAction({ status, appState: 'active' }), 'none', `status=${status}`);
  }
});

// --- heartbeat cadence --------------------------------------------------------------------------

test('shouldReadStatusOnBeat: every beat when the engine is disabled, every Nth beat when enabled (first beat reads)', () => {
  for (let i = 0; i < 6; i += 1) assert.equal(shouldReadStatusOnBeat({ beatIndex: i, engineEnabled: false }), true);
  assert.equal(shouldReadStatusOnBeat({ beatIndex: 0, engineEnabled: true }), true);
  assert.equal(shouldReadStatusOnBeat({ beatIndex: 1, engineEnabled: true }), false);
  assert.equal(shouldReadStatusOnBeat({ beatIndex: HEARTBEAT_STATUS_EVERY_N_BEATS, engineEnabled: true }), true);
});
