// W280 — unit tests for the Battery Saver screen-lock advisory policy (Pillar II §5.1
// collision rule, Ledger B3, R3-06/R3-49). Runs via `npm test`
// (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decideSaverAdvisory,
  shouldShowSaverAdvisory,
  lockTransition,
} from '../src/lib/advisoryPolicy.ts';

// --- shouldShowSaverAdvisory truth table (4 cases) --------------------------------

test('Saver on + self-health inactive -> show', () => {
  assert.equal(shouldShowSaverAdvisory({ saverOn: true, selfHealthPromptActive: false }), true);
  assert.equal(decideSaverAdvisory({ saverOn: true, selfHealthPromptActive: false }), 'show');
});

test('Saver on + self-health active -> suppress (self-health takes precedence)', () => {
  assert.equal(shouldShowSaverAdvisory({ saverOn: true, selfHealthPromptActive: true }), false);
  assert.equal(decideSaverAdvisory({ saverOn: true, selfHealthPromptActive: true }), 'suppress');
});

test('Saver off + self-health inactive -> never', () => {
  assert.equal(shouldShowSaverAdvisory({ saverOn: false, selfHealthPromptActive: false }), false);
  assert.equal(decideSaverAdvisory({ saverOn: false, selfHealthPromptActive: false }), 'none');
});

test('Saver off + self-health active -> never (suppress is only meaningful when Saver is on)', () => {
  assert.equal(shouldShowSaverAdvisory({ saverOn: false, selfHealthPromptActive: true }), false);
  assert.equal(decideSaverAdvisory({ saverOn: false, selfHealthPromptActive: true }), 'none');
});

// --- The advisory can never block (R3-49) -----------------------------------------

test('advisory never returns a blocking outcome: decisions are a closed show/suppress/none set', () => {
  const allowed = new Set(['show', 'suppress', 'none']);
  for (const saverOn of [true, false]) {
    for (const selfHealthPromptActive of [true, false]) {
      const d = decideSaverAdvisory({ saverOn, selfHealthPromptActive });
      assert.ok(allowed.has(d), `unexpected decision ${d}`);
      assert.equal(typeof shouldShowSaverAdvisory({ saverOn, selfHealthPromptActive }), 'boolean');
    }
  }
  // There is no join-gate input at all: the policy cannot even be asked about join.
  assert.equal(decideSaverAdvisory.length, 1);
});

// --- lockTransition: one advisory per lock cycle ----------------------------------

test('active -> inactive and active -> background are both a lock', () => {
  assert.equal(lockTransition('active', 'inactive'), 'lock');
  assert.equal(lockTransition('active', 'background'), 'lock');
});

test('inactive -> background flap is NOT a second lock', () => {
  assert.equal(lockTransition('inactive', 'background'), 'none');
  assert.equal(lockTransition('background', 'inactive'), 'none');
});

test('return to active from background or inactive is an unlock; active -> active is nothing', () => {
  assert.equal(lockTransition('background', 'active'), 'unlock');
  assert.equal(lockTransition('inactive', 'active'), 'unlock');
  assert.equal(lockTransition('unknown', 'active'), 'unlock');
  assert.equal(lockTransition('active', 'active'), 'none');
});

// --- createScreenLockSaverWatcher: the AppState state machine, with fakes ----------
// (review round 1: the ticket's integration test — subscribe once per ride, unsubscribe on
// cleanup, no stacked listeners — plus the one-per-cycle and race behaviour.)

import { createScreenLockSaverWatcher } from '../src/lib/advisoryPolicy.ts';

const flush = () => new Promise((r) => setImmediate(r));

function harness({ saverOn = true, selfHealth = false, initial = 'active' } = {}) {
  const h = {
    saverOn,
    selfHealth,
    handlers: [],
    addCalls: 0,
    removeCalls: 0,
    shows: 0,
    reads: 0,
    pendingReads: [], // resolvers, so a test can hold a read open
    holdReads: false,
  };
  h.dispose = createScreenLockSaverWatcher({
    currentState: () => initial,
    addEventListener: (handler) => {
      h.addCalls += 1;
      h.handlers.push(handler);
      return () => {
        h.removeCalls += 1;
        h.handlers = h.handlers.filter((x) => x !== handler);
      };
    },
    readSaver: () => {
      h.reads += 1;
      if (h.holdReads) return new Promise((resolve) => h.pendingReads.push(resolve));
      return Promise.resolve(h.saverOn);
    },
    isSelfHealthPromptActive: () => h.selfHealth,
    show: () => {
      h.shows += 1;
    },
  });
  h.emit = (state) => {
    for (const fn of [...h.handlers]) fn(state);
  };
  return h;
}

test('subscribes exactly once per watcher and remove() runs exactly once on dispose', () => {
  const h = harness();
  assert.equal(h.addCalls, 1);
  h.dispose();
  h.dispose(); // idempotent-safe: a second dispose must not double-remove
  assert.equal(h.removeCalls, 1);
  assert.equal(h.handlers.length, 0);
});

test('one lock cycle with Saver on and no self-health prompt -> exactly one show at unlock', async () => {
  const h = harness();
  h.emit('inactive'); // lock (active -> inactive)
  h.emit('background'); // Android flap — not a second lock
  assert.equal(h.reads, 0, 'nothing is read at lock; the lock only arms the check');
  h.emit('active'); // unlock
  await flush();
  assert.equal(h.reads, 1);
  assert.equal(h.shows, 1);
});

test('Saver off at unlock, or self-health prompt active, -> no show', async () => {
  const off = harness({ saverOn: false });
  off.emit('background');
  off.emit('active');
  await flush();
  assert.equal(off.shows, 0);

  const sh = harness({ selfHealth: true });
  sh.emit('background');
  sh.emit('active');
  await flush();
  assert.equal(sh.shows, 0, 'self-health takes precedence (§5.1)');
});

test('Saver switched ON while locked is surfaced at that same unlock', async () => {
  const h = harness({ saverOn: false });
  h.emit('background'); // lock with Saver off
  h.saverOn = true; // Android auto-enables Saver at its low-battery threshold while pocketed
  h.emit('active');
  await flush();
  assert.equal(h.shows, 1);
});

test('an unlock with no preceding lock in this watcher does not read or show', async () => {
  const h = harness({ initial: 'background' }); // subscribed while already backgrounded
  h.emit('active');
  await flush();
  assert.equal(h.reads, 0);
  assert.equal(h.shows, 0);
});

test('a read still pending when a newer lock cycle starts is discarded; the new cycle shows once', async () => {
  const h = harness();
  h.holdReads = true;
  h.emit('background');
  h.emit('active'); // unlock #1 — read held open
  h.emit('background'); // lock #2 begins while read #1 is pending
  h.emit('active'); // unlock #2 — read #2 held open too
  assert.equal(h.pendingReads.length, 2);
  h.pendingReads[0](true); // read #1 resolves late
  await flush();
  assert.equal(h.shows, 0, 'stale cycle result is dropped');
  h.pendingReads[1](true);
  await flush();
  assert.equal(h.shows, 1);
});

test('no show after dispose, even if a read resolves afterwards', async () => {
  const h = harness();
  h.holdReads = true;
  h.emit('background');
  h.emit('active');
  h.dispose();
  h.pendingReads[0](true);
  await flush();
  assert.equal(h.shows, 0);
});

test('a rejected Saver read is swallowed (never throws into the ride flow) and shows nothing', async () => {
  const h = harness();
  h.emit('background');
  const boom = createScreenLockSaverWatcher({
    currentState: () => 'active',
    addEventListener: (fn) => { h.handlers.push(fn); return () => {}; },
    readSaver: () => Promise.reject(new Error('expo-battery unavailable')),
    isSelfHealthPromptActive: () => false,
    show: () => { h.shows += 1; },
  });
  h.emit('background');
  h.emit('active');
  await flush();
  assert.equal(h.shows, 1, 'the healthy watcher still showed once');
  boom();
});
