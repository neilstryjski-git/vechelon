// W193 — unit tests for the app's channel layout (lib/channelLayout.ts). The server rules are
// proved by the denial suite (tests/denial); these pin the app's side of the same table.
// Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rideTopic,
  legacyRideTopic,
  isLeaderRole,
  receiveKinds,
  sendKinds,
  listenKinds,
  setSendContext,
  sendTopicsFor,
} from '../src/lib/channelLayout.ts';
import * as denial from './denial/layout.mjs';

const RIDE = '11111111-2222-3333-4444-555555555555';

test('topics are rail3:<kind>:<ride> and never the legacy topic', () => {
  for (const k of ['crew', 'lead', 'all', 'sos']) {
    assert.equal(rideTopic(k, RIDE), `rail3:${k}:${RIDE}`);
    assert.notEqual(rideTopic(k, RIDE), legacyRideTopic(RIDE));
  }
});

test('captain and support are leaders; member, guest and unknown are not', () => {
  assert.equal(isLeaderRole('captain'), true);
  assert.equal(isLeaderRole('support'), true);
  for (const r of ['member', 'guest', null, undefined, 'admin']) assert.equal(isLeaderRole(r), false);
});

test('a rider never joins crew; a leader does', () => {
  assert.ok(!receiveKinds('member').includes('crew'));
  assert.ok(!receiveKinds(null).includes('crew'));
  assert.ok(receiveKinds('captain').includes('crew'));
  assert.ok(receiveKinds('support').includes('crew'));
  for (const r of ['member', 'captain', 'support']) {
    assert.ok(receiveKinds(r).includes('all'));
    assert.ok(receiveKinds(r).includes('lead'));
  }
});

test('a rider position goes to crew only, and to sos as well only while their beacon is active', () => {
  assert.deepEqual(sendKinds('member', 'pos'), ['crew']);
  assert.deepEqual(sendKinds('member', 'pos', { beaconActive: false }), ['crew']);
  assert.deepEqual(sendKinds('member', 'pos', { beaconActive: true }), ['crew', 'sos']);
  assert.ok(!sendKinds('member', 'pos', { beaconActive: true }).includes('lead'));
  assert.ok(!sendKinds('member', 'pos', { beaconActive: true }).includes('all'));
});

test('a leader position goes to lead only, beacon or not', () => {
  assert.deepEqual(sendKinds('captain', 'pos'), ['lead']);
  assert.deepEqual(sendKinds('support', 'pos', { beaconActive: true }), ['lead']);
});

test('beacon, depart and ride-ended events go to all, for every role', () => {
  for (const ev of ['beacon', 'depart', 'ride_ended']) {
    for (const r of ['member', 'captain', 'support', null]) assert.deepEqual(sendKinds(r, ev, { beaconActive: true }), ['all']);
  }
});

test('position handlers bind on every position-carrying topic; other events on all', () => {
  assert.deepEqual([...listenKinds('pos')].sort(), ['crew', 'lead', 'sos']);
  assert.deepEqual(listenKinds('beacon'), ['all']);
  assert.deepEqual(listenKinds('depart'), ['all']);
});

test('with no send context a position is routed as an ordinary rider with no beacon (least exposure)', () => {
  setSendContext(null);
  assert.deepEqual(sendTopicsFor(RIDE, 'pos'), [`rail3:crew:${RIDE}`]);
  // A context for a different ride does not apply.
  setSendContext({ rideId: 'other', role: 'captain', beaconActive: true });
  assert.deepEqual(sendTopicsFor(RIDE, 'pos'), [`rail3:crew:${RIDE}`]);
  setSendContext({ rideId: RIDE, role: 'captain', beaconActive: false });
  assert.deepEqual(sendTopicsFor(RIDE, 'pos'), [`rail3:lead:${RIDE}`]);
  setSendContext({ rideId: RIDE, role: 'member', beaconActive: true });
  assert.deepEqual(sendTopicsFor(RIDE, 'pos'), [`rail3:crew:${RIDE}`, `rail3:sos:${RIDE}`]);
  setSendContext(null);
});

// The denial suite proves the SERVER against tests/denial/layout.mjs. If the app's layout
// drifts from that file, the server proof no longer describes the app.
test('the app layout matches the layout the denial suite proves', () => {
  const pairs = [['rider', 'member'], ['captain', 'captain'], ['sag', 'support']];
  for (const [suiteRole, appRole] of pairs) {
    assert.deepEqual(
      [...denial.receiveTopics(suiteRole, RIDE)].sort(),
      receiveKinds(appRole).map((k) => rideTopic(k, RIDE)).sort(),
      `receive topics differ for ${suiteRole}`,
    );
    for (const ev of Object.values(denial.EVENTS)) {
      for (const beaconActive of [false, true]) {
        assert.deepEqual(
          [...denial.sendTopics(suiteRole, ev, RIDE, { beaconActive })].sort(),
          sendKinds(appRole, ev, { beaconActive }).map((k) => rideTopic(k, RIDE)).sort(),
          `send topics differ for ${suiteRole} ${ev} beacon=${beaconActive}`,
        );
      }
    }
  }
});
