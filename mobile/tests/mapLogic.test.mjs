// W172 — unit tests for the fleet map's pure logic: the §4.1 role-visibility
// matrix, Haversine bearing/distance, Edge Indicator placement/suppression,
// and prod-convention point parsing.
//
// Runs via `npm test` (node --experimental-strip-types --test) — the .ts
// sources are loaded directly with types stripped; no build step, no DB, no
// device. The behavioral RLS/Broadcast matrix is tests/rlsIsolation.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePoint,
  haversineDistanceM,
  initialBearingDeg,
  regionContains,
  edgeAnchorForBearing,
} from '../src/lib/geo.ts';
import {
  visibleParticipants,
  canOpenSheet,
  canSeePhone,
  canExpandCluster,
} from '../src/lib/roleVisibility.ts';

const P = (riderId, role) => ({
  riderId,
  displayName: riderId,
  role,
  phone: '555-0000',
  accountStatus: 'affiliated',
  state: 'active',
  position: { lat: 43.6, lng: -79.4 },
  lastPingAt: Date.now(),
});

const FLEET = [
  P('cap', 'captain'),
  P('sag', 'support'),
  P('r1', 'member'),
  P('r2', 'member'),
  P('g1', 'guest'),
];

// ── §4.1 visibility matrix ───────────────────────────────────────────────────

test('R3-10: Rider sees only Captain + SAG — never other riders', () => {
  const visible = visibleParticipants('member', 'r1', FLEET);
  assert.deepEqual(visible.map((p) => p.riderId).sort(), ['cap', 'sag']);
});

test('guest rider has identical visibility to member rider (role gates, not account type)', () => {
  const member = visibleParticipants('member', 'r1', FLEET).map((p) => p.riderId).sort();
  const guest = visibleParticipants('guest', 'g1', FLEET).map((p) => p.riderId).sort();
  assert.deepEqual(guest, member);
});

test('R3-08/R3-09: Captain and SAG see the full fleet (minus self)', () => {
  assert.equal(visibleParticipants('captain', 'cap', FLEET).length, 4);
  assert.equal(visibleParticipants('support', 'sag', FLEET).length, 4);
});

test('R3-17: Rider cannot open the sheet for other riders, only Captain/SAG', () => {
  assert.equal(canOpenSheet('member', 'member'), false);
  assert.equal(canOpenSheet('member', 'guest'), false);
  assert.equal(canOpenSheet('member', 'captain'), true);
  assert.equal(canOpenSheet('member', 'support'), true);
});

test('Captain taps riders + SAG; SAG taps riders + Captain (§4.1)', () => {
  assert.equal(canOpenSheet('captain', 'member'), true);
  assert.equal(canOpenSheet('captain', 'guest'), true);
  assert.equal(canOpenSheet('captain', 'support'), true);
  assert.equal(canOpenSheet('captain', 'captain'), false);
  assert.equal(canOpenSheet('support', 'member'), true);
  assert.equal(canOpenSheet('support', 'guest'), true);
  assert.equal(canOpenSheet('support', 'captain'), true);
  assert.equal(canOpenSheet('support', 'support'), false);
});

test('contact gate mirrors the sheet gate; clusters expand for Captain/SAG only', () => {
  assert.equal(canSeePhone('member', 'member'), false);
  assert.equal(canSeePhone('support', 'member'), true);
  assert.equal(canExpandCluster('captain'), true);
  assert.equal(canExpandCluster('support'), true);
  assert.equal(canExpandCluster('member'), false);
  assert.equal(canExpandCluster('guest'), false);
});

// ── Geo math ─────────────────────────────────────────────────────────────────

test('haversine: Toronto→Montreal ≈ 504 km', () => {
  const d = haversineDistanceM({ lat: 43.6532, lng: -79.3832 }, { lat: 45.5019, lng: -73.5674 });
  assert.ok(Math.abs(d - 504000) < 6000, `expected ~504km, got ${(d / 1000).toFixed(1)}km`);
});

test('bearing: cardinal directions normalize to [0,360)', () => {
  const origin = { lat: 43.0, lng: -79.0 };
  assert.ok(Math.abs(initialBearingDeg(origin, { lat: 44.0, lng: -79.0 }) - 0) < 0.5); // north
  assert.ok(Math.abs(initialBearingDeg(origin, { lat: 43.0, lng: -78.0 }) - 90) < 1); // east
  assert.ok(Math.abs(initialBearingDeg(origin, { lat: 42.0, lng: -79.0 }) - 180) < 0.5); // south
  assert.ok(Math.abs(initialBearingDeg(origin, { lat: 43.0, lng: -80.0 }) - 270) < 1); // west
});

// ── Edge Indicator (R3-13 / R3-14) ───────────────────────────────────────────

test('R3-14 precondition: regionContains separates on-screen from off-screen', () => {
  const region = { latitude: 43.65, longitude: -79.38, latitudeDelta: 0.1, longitudeDelta: 0.1 };
  assert.equal(regionContains(region, { lat: 43.65, lng: -79.38 }), true); // centre
  assert.equal(regionContains(region, { lat: 45.5, lng: -73.5 }), false); // far away
});

test('edge anchor sits on the inset boundary and rotates with the bearing', () => {
  const w = 400;
  const h = 800;
  const inset = 28;
  const approx = (a, b) => Math.abs(a - b) < 0.001;
  const north = edgeAnchorForBearing(0, w, h, inset);
  assert.ok(approx(north.x, w / 2) && approx(north.y, inset), `north anchor ${north.x},${north.y}`);
  assert.equal(north.rotationDeg, 0);

  const east = edgeAnchorForBearing(90, w, h, inset);
  assert.ok(approx(east.x, w - inset) && approx(east.y, h / 2), `east anchor ${east.x},${east.y}`);

  // Diagonal bearings still land on (not beyond) the inset rectangle.
  const d = edgeAnchorForBearing(135, w, h, inset);
  assert.ok(d.x >= inset && d.x <= w - inset);
  assert.ok(d.y >= inset && d.y <= h - inset);
});

// ── Point parsing (prod convention: '(lng,lat)') ─────────────────────────────

test("parsePoint mirrors the web app: '(lng,lat)' string and {x,y} object", () => {
  assert.deepEqual(parsePoint('(-79.3832,43.6532)'), { lat: 43.6532, lng: -79.3832 });
  assert.deepEqual(parsePoint({ x: -79.3832, y: 43.6532 }), { lat: 43.6532, lng: -79.3832 });
  assert.equal(parsePoint(null), null);
  assert.equal(parsePoint('garbage'), null);
});
