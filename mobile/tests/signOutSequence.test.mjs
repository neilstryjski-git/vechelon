// W281 — pins the sign-out and identity-transition ORDER (Ledger R3-58 / D1; R3-56/57).
// Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runSignOutSequence,
  runIdentityTransition,
  DEFAULT_DEPARTURE_TIMEOUT_MS,
} from '../src/lib/signOutSequence.ts';

function fakeTimers() {
  const pending = [];
  return {
    setTimeoutFn: (fn, ms) => { const h = { fn, ms, cleared: false }; pending.push(h); return h; },
    clearTimeoutFn: (h) => { if (h) h.cleared = true; },
    fire: () => { for (const h of pending) if (!h.cleared) { h.cleared = true; h.fn(); } },
    pending,
  };
}

function deps(overrides = {}) {
  const calls = [];
  const t = fakeTimers();
  const d = {
    calls,
    timers: t,
    getActive: () => ({ rideId: 'ride-1', riderId: 'rider-A' }),
    departure: async (rideId, riderId) => { calls.push(['departure', rideId, riderId]); },
    clearActive: () => { calls.push(['clearActive']); },
    signOut: async () => { calls.push(['signOut']); },
    setTimeoutFn: t.setTimeoutFn,
    clearTimeoutFn: t.clearTimeoutFn,
    ...overrides,
  };
  return d;
}

test('sign-out: departure precedes clearActive precedes signOut (the D1 ordering)', async () => {
  const d = deps();
  const steps = await runSignOutSequence(d);
  assert.deepEqual(d.calls.map((c) => c[0]), ['departure', 'clearActive', 'signOut']);
  assert.deepEqual(d.calls[0], ['departure', 'ride-1', 'rider-A']);
  assert.deepEqual(steps, ['departure_issued', 'departure_done', 'clear_active', 'sign_out']);
});

test('sign-out with no active ride: no departure, no clear, sign-out still runs', async () => {
  const d = deps({ getActive: () => null });
  const steps = await runSignOutSequence(d);
  assert.deepEqual(d.calls.map((c) => c[0]), ['signOut']);
  assert.deepEqual(steps, ['no_active_ride', 'sign_out']);
});

test('a rejected departure never blocks sign-out; holder still clears AFTER the attempt', async () => {
  const d = deps({ departure: async () => { throw new Error('offline'); } });
  const steps = await runSignOutSequence(d);
  assert.deepEqual(d.calls.map((c) => c[0]), ['clearActive', 'signOut']);
  assert.deepEqual(steps, ['departure_issued', 'departure_failed', 'clear_active', 'sign_out']);
});

test('a HUNG departure is waited for only a bounded window, then sign-out proceeds (fire-and-forget)', async () => {
  let resolveLater;
  const d = deps({ departure: () => new Promise((r) => { resolveLater = r; }) });
  const run = runSignOutSequence(d);
  await new Promise((r) => setImmediate(r));
  assert.equal(d.timers.pending.length, 1);
  assert.equal(d.timers.pending[0].ms, DEFAULT_DEPARTURE_TIMEOUT_MS);
  assert.deepEqual(d.calls.map((c) => c[0]), [], 'nothing else runs while the window is open');
  d.timers.fire();
  const steps = await run;
  assert.deepEqual(d.calls.map((c) => c[0]), ['clearActive', 'signOut']);
  assert.deepEqual(steps, ['departure_issued', 'departure_timed_out', 'clear_active', 'sign_out']);
  resolveLater(); // late network answer after sign-out is simply ignored
});

test('the departure is ISSUED before signOut is even called — never a bare void after it', async () => {
  const order = [];
  const d = deps({
    departure: async () => { order.push('departure-issued'); },
    signOut: async () => { order.push('signOut-called'); },
  });
  await runSignOutSequence(d);
  assert.deepEqual(order, ['departure-issued', 'signOut-called']);
});

test('the timeout timer is cleared once the departure completes (no leaked timer)', async () => {
  const d = deps();
  await runSignOutSequence(d);
  assert.ok(d.timers.pending.every((h) => h.cleared));
});

test('signOut rejection propagates (a failed revoke is not swallowed)', async () => {
  const d = deps({ signOut: async () => { throw new Error('revoke failed'); } });
  await assert.rejects(() => runSignOutSequence(d), /revoke failed/);
  assert.deepEqual(d.calls.map((c) => c[0]), ['departure', 'clearActive']);
});

test('identity transition: on a user-id delta, reset measure → clear holder → clear roster cache', () => {
  const calls = [];
  const steps = runIdentityTransition(true, {
    resetMeasure: (c) => calls.push(['resetMeasure', c]),
    clearActive: () => calls.push(['clearActive']),
    clearRosterCache: () => calls.push(['clearRosterCache']),
  });
  assert.deepEqual(calls, [['resetMeasure', true], ['clearActive'], ['clearRosterCache']]);
  assert.deepEqual(steps, ['reset_measure', 'clear_active', 'clear_roster_cache']);
});

test('identity transition: a token refresh (same user) clears NOTHING', () => {
  const calls = [];
  const steps = runIdentityTransition(false, {
    resetMeasure: (c) => calls.push(['resetMeasure', c]),
    clearActive: () => calls.push(['clearActive']),
    clearRosterCache: () => calls.push(['clearRosterCache']),
  });
  assert.deepEqual(calls, [['resetMeasure', false]]);
  assert.deepEqual(steps, ['reset_measure']);
});
