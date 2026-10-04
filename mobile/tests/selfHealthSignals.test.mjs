// W285 — unit tests for the pure self-health signal store (lib/selfHealthSignals.ts).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSelfHealthSnapshot,
  subscribeSelfHealth,
  noteEngineStarted,
  noteEngineIntent,
  noteEngineDied,
  noteFix,
  noteMotion,
  noteHeartbeat,
  resetSelfHealthSignals,
} from '../src/lib/selfHealthSignals.ts';

const T0 = 1_000_000_000_000;
beforeEach(() => resetSelfHealthSignals());

test('initial snapshot is empty and frozen; every note() yields a NEW frozen object', () => {
  const s0 = getSelfHealthSnapshot();
  assert.deepEqual(s0, { engineIntentAtMs: null, engineStartedAtMs: null, lastFixAtMs: null, lastEngineSignalAtMs: null, engineMoving: null, engineDied: false, fixesSinceStart: 0 });
  assert.ok(Object.isFrozen(s0));
  noteEngineStarted(T0);
  const s1 = getSelfHealthSnapshot();
  assert.notEqual(s1, s0);
  assert.ok(Object.isFrozen(s1));
  assert.equal(s1.engineStartedAtMs, T0);
  assert.equal(s1.lastEngineSignalAtMs, T0);
});

test('noteEngineStarted resets the run (fixes, died, moving) but keeps lastFixAtMs; a fix before start is not counted, at/after it is', () => {
  noteFix(T0 - 10, true); // carry-over fix before any engine start
  assert.equal(getSelfHealthSnapshot().fixesSinceStart, 0);
  assert.equal(getSelfHealthSnapshot().lastFixAtMs, T0 - 10);
  noteEngineStarted(T0);
  assert.equal(getSelfHealthSnapshot().lastFixAtMs, T0 - 10, 'last fix survives a (re)start');
  noteFix(T0 - 1, true); // predates engine start → remembered, not counted
  assert.equal(getSelfHealthSnapshot().fixesSinceStart, 0);
  noteFix(T0, true);
  noteFix(T0 + 5000, false);
  const s = getSelfHealthSnapshot();
  assert.equal(s.fixesSinceStart, 2);
  assert.equal(s.lastFixAtMs, T0 + 5000);
  assert.equal(s.engineMoving, false);
  noteEngineDied();
  noteEngineStarted(T0 + 9000); // heartbeat_reassert
  const r = getSelfHealthSnapshot();
  assert.deepEqual([r.fixesSinceStart, r.engineDied, r.engineMoving, r.lastFixAtMs, r.engineStartedAtMs], [0, false, null, T0 + 5000, T0 + 9000]);
});

test('lastEngineSignalAtMs is the max over fix / motion / heartbeat; motion and heartbeat set engineMoving', () => {
  noteEngineStarted(T0);
  noteMotion(T0 + 3000, false);
  assert.equal(getSelfHealthSnapshot().engineMoving, false);
  assert.equal(getSelfHealthSnapshot().lastEngineSignalAtMs, T0 + 3000);
  noteHeartbeat(T0 + 2000, true); // older ts never moves it backwards
  assert.equal(getSelfHealthSnapshot().lastEngineSignalAtMs, T0 + 3000);
  assert.equal(getSelfHealthSnapshot().engineMoving, true);
  noteFix(T0 + 7000, true);
  assert.equal(getSelfHealthSnapshot().lastEngineSignalAtMs, T0 + 7000);
});

test('engineDied is one-shot until the next engine_started; reset clears everything', () => {
  noteEngineStarted(T0);
  const before = getSelfHealthSnapshot();
  noteEngineDied();
  const died = getSelfHealthSnapshot();
  assert.equal(died.engineDied, true);
  noteEngineDied();
  assert.equal(getSelfHealthSnapshot(), died, 'a repeated death does not re-emit');
  assert.notEqual(before, died);
  resetSelfHealthSignals();
  assert.deepEqual(getSelfHealthSnapshot(), { engineIntentAtMs: null, engineStartedAtMs: null, lastFixAtMs: null, lastEngineSignalAtMs: null, engineMoving: null, engineDied: false, fixesSinceStart: 0 });
});

test('subscribe fires once per note with the new snapshot; unsubscribe stops it; unsubscribing during emit is safe', () => {
  const seen = [];
  const unsubA = subscribeSelfHealth((s) => seen.push(['a', s.fixesSinceStart]));
  let unsubB = () => {};
  unsubB = subscribeSelfHealth(() => {
    seen.push(['b']);
    unsubB(); // removes itself mid-emit
  });
  noteEngineStarted(T0);
  noteFix(T0 + 1, true);
  assert.deepEqual(seen, [['a', 0], ['b'], ['a', 1]]);
  unsubA();
  noteFix(T0 + 2, true);
  assert.equal(seen.length, 3);
});

test('review r1: noteEngineIntent records the decision to track and survives engine_started; reset clears it', () => {
  noteEngineIntent(T0);
  assert.equal(getSelfHealthSnapshot().engineIntentAtMs, T0);
  noteEngineStarted(T0 + 500);
  assert.equal(getSelfHealthSnapshot().engineIntentAtMs, T0);
  resetSelfHealthSignals();
  assert.equal(getSelfHealthSnapshot().engineIntentAtMs, null);
});
