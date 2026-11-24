// W173 — unit tests for the Support Beacon's pure rules: §4.1 beacon
// visibility/cancel gates, the SD-011 null-guard, and D-55 latency math.
// Runs via `npm test` (node --experimental-strip-types --test).
// The DB-backed audit-trail branches are tests/beaconAudit.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canSeeBeacon,
  beaconPositionLine,
  canCancelBeacon,
  buildCancelPatch,
  latencyDeltaMs,
} from '../src/lib/beaconLogic.ts';

// ── §4.1 visibility (Pillar II v1.2.0, W315): every app participant on the ride sees every
//    active beacon on it. Before v1.2.0 a rider did not see another rider's. ──────────────────

test('beacon visibility (W315): a rider sees another rider\'s active beacon; every role sees every beacon', () => {
  assert.equal(canSeeBeacon('member', 'r1', 'r2', 'member'), true);
  assert.equal(canSeeBeacon('guest', 'g1', 'r2', 'member'), true);
  assert.equal(canSeeBeacon('member', 'r1', 'r2'), true);
  assert.equal(canSeeBeacon('captain', 'cap', 'r1', 'member'), true);
  assert.equal(canSeeBeacon('support', 'sag', 'r1', 'member'), true);
  assert.equal(canSeeBeacon('member', 'r1', 'r1'), true);
  assert.equal(canSeeBeacon('member', 'r1', 'cap', 'captain'), true);
});

test('reduced sheet position line: live within a minute, otherwise its age in whole minutes', () => {
  const now = 1_000_000_000;
  assert.equal(beaconPositionLine(now - 5_000, now), 'On the map now');
  assert.equal(beaconPositionLine(now - 60_000, now), 'On the map now');
  assert.equal(beaconPositionLine(now - 61_000, now), 'Last seen 1 min ago');
  assert.equal(beaconPositionLine(now - 7 * 60_000, now), 'Last seen 7 min ago');
  assert.equal(beaconPositionLine(now + 5_000, now), 'On the map now'); // sender clock ahead
  assert.equal(beaconPositionLine(null, now), 'No position received yet');
});

test('R3-22: Captain/SAG can cancel any beacon; rider only their own', () => {
  assert.equal(canCancelBeacon('support', 'sag', 'r1'), true);
  assert.equal(canCancelBeacon('captain', 'cap', 'r1'), true);
  assert.equal(canCancelBeacon('member', 'r1', 'r1'), true); // self-cancel
  assert.equal(canCancelBeacon('member', 'r1', 'r2'), false);
  assert.equal(canCancelBeacon('guest', 'g1', 'r2'), false);
});

// ── SD-011: null cancelled_by is the SYSTEM ERROR sentinel ───────────────────

test('SD-011: cancel patch always carries the actor UUID', () => {
  const at = new Date('2026-06-12T12:00:00Z');
  const self = buildCancelPatch('rider-uuid', at);
  assert.equal(self.beacon_cancelled_by, 'rider-uuid'); // R3-21: own uuid, never null
  assert.equal(self.beacon_cancelled_at, at.toISOString());

  const byCaptain = buildCancelPatch('captain-uuid', at);
  assert.equal(byCaptain.beacon_cancelled_by, 'captain-uuid'); // R3-20
});

test('SD-011: a cancel without an actor throws — it must never write null', () => {
  for (const bad of [null, undefined, '']) {
    assert.throws(() => buildCancelPatch(bad, new Date()), /SD-011/);
  }
});

// ── D-55 latency instrumentation ─────────────────────────────────────────────

test('latency delta: positive deltas pass through, skew artifacts clamp to 0', () => {
  assert.equal(latencyDeltaMs(1000, 1350), 350);
  assert.equal(latencyDeltaMs(1000, 900), 0); // receiver clock behind sender
  assert.equal(latencyDeltaMs(NaN, 1000), 0);
  assert.equal(latencyDeltaMs(1000, Infinity), 0);
});
