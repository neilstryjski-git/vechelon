// W175 — unit tests for the ride-control rules: End Ride patch shape (the
// Hard Purge pair), the Scenario-12 proximity safeguard, the Rails-1/2 join
// URL, and the Ad Hoc row builder.
// Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRideJoinUrl,
  endRidePatch,
  adHocProximityConflict,
  adHocRideName,
  adHocRideRow,
} from '../src/lib/rideControlsLogic.ts';

const NOW = Date.parse('2026-06-12T18:00:00Z');

test('endRidePatch sets BOTH status=saved AND actual_end (the Hard Purge pair)', () => {
  const at = new Date('2026-06-12T18:30:00Z');
  const p = endRidePatch(at, { lat: 43.65, lng: -79.38 });
  assert.equal(p.status, 'saved');
  assert.equal(p.actual_end, at.toISOString());
  // finish snapshot mirrors web endRide, prod '(lng,lat)' convention
  assert.equal(p.finish_coords, '(-79.38,43.65)');
});

test('endRidePatch without a GPS fix omits finish_coords but never the purge pair', () => {
  const p = endRidePatch(new Date(NOW), null);
  assert.equal(p.status, 'saved');
  assert.ok(p.actual_end);
  assert.equal('finish_coords' in p, false);
});

test('Scenario 12: proximity safeguard fires for scheduled rides within ±2h', () => {
  const mins = (m) => new Date(NOW + m * 60_000).toISOString();
  assert.equal(adHocProximityConflict([mins(90)], NOW), true); // 1.5h ahead
  assert.equal(adHocProximityConflict([mins(-90)], NOW), true); // 1.5h ago (should be rolling)
  assert.equal(adHocProximityConflict([mins(121)], NOW), false); // just outside
  assert.equal(adHocProximityConflict([mins(-121)], NOW), false);
  assert.equal(adHocProximityConflict([], NOW), false); // no scheduled rides → no warning
  assert.equal(adHocProximityConflict([null, 'garbage'], NOW), false); // bad data never blocks
});

test('proximity window honors a custom width', () => {
  const mins = (m) => new Date(NOW + m * 60_000).toISOString();
  assert.equal(adHocProximityConflict([mins(150)], NOW, 3), true);
  assert.equal(adHocProximityConflict([mins(150)], NOW, 2), false);
});

test('join URL is the Rails-1/2 ridecard URL — never a new scheme', () => {
  assert.equal(
    buildRideJoinUrl('abc-123', 'racer-sportif'),
    'https://racer-sportif.vechelon.ca/ride/abc-123?source=ridecard',
  );
});

test('Ad Hoc row: same schema/lifecycle as scheduled rides, Active immediately', () => {
  const at = new Date('2026-06-12T18:00:00Z');
  const row = adHocRideRow({
    rideId: 'ride-1',
    tenantId: 'tenant-1',
    createdBy: 'cap-1',
    coords: { lat: 43.65, lng: -79.38 },
    qrDataUrl: 'data:image/png;base64,AAA',
    at,
  });
  assert.equal(row.type, 'adhoc');
  assert.equal(row.status, 'active'); // Active immediately (Feature 3)
  assert.equal(row.start_coords, '(-79.38,43.65)');
  assert.equal(row.qr_code, 'data:image/png;base64,AAA');
  assert.equal(row.created_by, 'cap-1'); // ride_admin_modify lets the creator End it
  assert.equal(row.actual_start, at.toISOString());
  assert.equal(adHocRideName(at), 'Ad Hoc Ride — 2026-06-12');
  assert.equal('finish_coords' in row, false); // no finish → Edge Indicator suppressed (R3-14)
});
