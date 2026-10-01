// W282 — unit tests for the beacon CURRENT-STATE helpers (Ledger slate 7 / A4, §5.3 overlay,
// SD-011). Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRaisePatch,
  buildCancelPatch,
  BEACON_CLEAR_PATCH,
  isStaleUnderBeacon,
  mergeSeededBeacons,
  anchorBeaconedFleet,
  SEED_RACE_GRACE_MS,
} from '../src/lib/beaconLogic.ts';

// --- buildRaisePatch (A4: flag + last-known in ONE patch) --------------------------------

test('buildRaisePatch with coords carries beacon_active:true AND last_lat/last_long/last_ping', () => {
  const at = new Date('2026-09-30T12:00:00.000Z');
  const p = buildRaisePatch({ lat: 45.5, lng: -73.6 }, at);
  assert.deepEqual(p, { beacon_active: true, last_lat: 45.5, last_long: -73.6, last_ping: '2026-09-30T12:00:00.000Z' });
});

test('buildRaisePatch before the first fix (no coords) sets the flag ONLY — last_* untouched (D79)', () => {
  const p = buildRaisePatch(null, new Date());
  assert.deepEqual(p, { beacon_active: true });
  assert.ok(!('last_lat' in p) && !('last_long' in p) && !('last_ping' in p));
});

test('cancel patch clears the flag only; buildCancelPatch still throws on a missing actor (SD-011)', () => {
  assert.deepEqual(BEACON_CLEAR_PATCH, { beacon_active: false });
  assert.throws(() => buildCancelPatch(null, new Date()), /SD-011/);
  assert.throws(() => buildCancelPatch(undefined, new Date()), /SD-011/);
  assert.throws(() => buildCancelPatch('', new Date()), /SD-011/);
});

// --- isStaleUnderBeacon (§5.3: presentation, Captain/SAG only, only with an active beacon) ----

test('isStaleUnderBeacon is true only for lastKnown + beacon active (command viewer)', () => {
  assert.equal(isStaleUnderBeacon('lastKnown', true, 'captain'), true);
  assert.equal(isStaleUnderBeacon('live', true, 'captain'), false);
  assert.equal(isStaleUnderBeacon('lastKnown', false, 'captain'), false);
  assert.equal(isStaleUnderBeacon(undefined, true, 'captain'), false);
  assert.equal(isStaleUnderBeacon('live', false, 'captain'), false);
});

test('isStaleUnderBeacon respects the viewer role and FAILS CLOSED without one', () => {
  assert.equal(isStaleUnderBeacon('lastKnown', true, 'captain'), true);
  assert.equal(isStaleUnderBeacon('lastKnown', true, 'support'), true);
  assert.equal(isStaleUnderBeacon('lastKnown', true, 'member'), false);
  assert.equal(isStaleUnderBeacon('lastKnown', true, 'guest'), false);
  assert.equal(isStaleUnderBeacon('lastKnown', true, undefined), false);
});

// --- mergeSeededBeacons (seed authoritative for absence, with two race exceptions) -----------

const T0 = 1_000_000;
const b = (riderId, triggeredAt, beaconId = null, anchor = null) => ({ beaconId, riderId, triggeredAt, anchor });

test('seed-only beacons are adopted (a beacon raised while this device was blind is surfaced)', () => {
  const seed = { A: b('A', T0 - 60_000, null, { lat: 1, lng: 2, ts: T0 - 60_000 }) };
  const next = mergeSeededBeacons({}, seed, T0, {});
  assert.deepEqual(next, seed);
});

test('a local beacon absent from the seed and older than the grace is DROPPED — settled server-side, never re-raised', () => {
  const prev = { A: b('A', T0 - SEED_RACE_GRACE_MS - 1, 'id-a') };
  const next = mergeSeededBeacons(prev, {}, T0, {});
  assert.deepEqual(next, {});
});

test('a local beacon absent from the seed but within the grace window is KEPT (live trigger racing the read)', () => {
  const prev = { A: b('A', T0 - 1_000, 'id-a') };
  const next = mergeSeededBeacons(prev, {}, T0, {});
  assert.deepEqual(next, prev);
});

test('present in both: the live beaconId wins, the seed supplies the missing anchor', () => {
  const prev = { A: b('A', T0 - 2_000, 'id-a', null) };
  const seed = { A: b('A', T0 - 5_000, null, { lat: 1, lng: 2, ts: T0 - 5_000 }) };
  const next = mergeSeededBeacons(prev, seed, T0, {});
  assert.equal(next.A.beaconId, 'id-a');
  assert.equal(next.A.triggeredAt, T0 - 2_000);
  assert.deepEqual(next.A.anchor, { lat: 1, lng: 2, ts: T0 - 5_000 });
});

test('a seed row for a rider this device cancelled AFTER the read started is not re-added (seed racing a live cancel)', () => {
  const seed = { A: b('A', T0 - 60_000) };
  assert.deepEqual(mergeSeededBeacons({}, seed, T0, { A: T0 + 500 }), {});
  // ...but a cancel that happened BEFORE the read started does not suppress a (re-raised) seed row
  assert.deepEqual(mergeSeededBeacons({}, seed, T0, { A: T0 - 500 }), seed);
});

test('merge never invents a fourth state: output riders ⊆ seed ∪ prev', () => {
  const prev = { A: b('A', T0 - 100, 'id-a'), B: b('B', T0 - 100_000, 'id-b') };
  const seed = { C: b('C', T0 - 1) };
  const next = mergeSeededBeacons(prev, seed, T0, {});
  assert.deepEqual(Object.keys(next).sort(), ['A', 'C']);
});

test('a PROTECTED local beacon (own raise write known-failed) survives an authoritative-absence seed', () => {
  const prev = { ME: b('ME', T0 - SEED_RACE_GRACE_MS - 60_000, 'id-me') };
  assert.deepEqual(mergeSeededBeacons(prev, {}, T0, {}), {}, 'unprotected it would be dropped');
  assert.deepEqual(mergeSeededBeacons(prev, {}, T0, {}, undefined, ['ME']), prev);
});

// --- anchorBeaconedFleet (R3-55 render half) ------------------------------------------------

const fp = (riderId, lastPingAt, source, lat = 0, lng = 0) => ({
  riderId, displayName: riderId, role: 'member', phone: null, accountStatus: null,
  state: 'active', position: { lat, lng }, lastPingAt, source,
});
const roster = { A: { displayName: 'A', role: 'member', phone: null, participantStatus: 'rsvpd' } };
const stateFor = () => 'stopped';

test('anchor newer than the fleet position wins and marks the rider lastKnown', () => {
  const fleet = [fp('A', T0 - 60_000, 'lastKnown', 1, 1)];
  const beacons = { A: b('A', T0, 'id-a', { lat: 9, lng: 9, ts: T0 - 1_000 }) };
  const [p] = anchorBeaconedFleet(fleet, beacons, (id) => roster[id] ?? null, stateFor);
  assert.deepEqual(p.position, { lat: 9, lng: 9 });
  assert.equal(p.source, 'lastKnown');
  assert.equal(p.lastPingAt, T0 - 1_000);
});

test('a LIVE fix at least as fresh as the anchor is kept — the overlay clears when live supersedes', () => {
  const fleet = [fp('A', T0, 'live', 1, 1)];
  const beacons = { A: b('A', T0 - 5_000, 'id-a', { lat: 9, lng: 9, ts: T0 - 1_000 }) };
  const [p] = anchorBeaconedFleet(fleet, beacons, (id) => roster[id] ?? null, stateFor);
  assert.deepEqual(p.position, { lat: 1, lng: 1 });
  assert.equal(p.source, 'live');
});

test('a beaconed rider the fleet does not list is surfaced from the roster at the anchor; unknown riders are not', () => {
  const beacons = {
    A: b('A', T0, null, { lat: 9, lng: 9, ts: T0 }),
    Z: b('Z', T0, null, { lat: 5, lng: 5, ts: T0 }), // hidden by RLS: not in the roster
  };
  const out = anchorBeaconedFleet([], beacons, (id) => roster[id] ?? null, stateFor);
  assert.deepEqual(out.map((p) => p.riderId), ['A']);
  assert.equal(out[0].source, 'lastKnown');
  assert.equal(out[0].state, 'stopped');
});

test('a beacon without an anchor changes nothing', () => {
  const fleet = [fp('A', T0 - 60_000, 'lastKnown', 1, 1)];
  const beacons = { A: b('A', T0, 'id-a', null) };
  assert.deepEqual(anchorBeaconedFleet(fleet, beacons, (id) => roster[id] ?? null, stateFor), fleet);
});
