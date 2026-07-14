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
  rideLeaderId,
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
  // D80: the STARTER is recorded at start time. Starting an Ad Hoc ride and authoring it are the
  // same act, so this equals created_by here — but it is written explicitly because the
  // breadcrumb leader must be a recorded fact, never re-derived from roster roles.
  assert.equal(row.started_by, 'cap-1');
  assert.equal(row.actual_start, at.toISOString());
  // adHocRideName takes a WORD, not a Date (679dfad — friendly random word, not a date stamp).
  // This assertion still passed `at` and had been red ever since, which is why the D80
  // started_by guard above could not have signalled a regression: the case never went green.
  assert.equal(adHocRideName('Trampoline'), 'Ad Hoc Ride — Trampoline');
  assert.equal('finish_coords' in row, false); // no finish → Edge Indicator suppressed (R3-14)
});

// D80 — the leader rule: the breadcrumb captain is THE ACCOUNT THAT STARTED THE RIDE.
// These guard the rule itself, which used to be an unordered roster scan that could elect a
// club captain who had never opened the app.
test('D80 leader rule: started_by wins; created_by is only a fallback', () => {
  // Normal case — the recorded starter is the leader, even when someone else authored the ride.
  assert.equal(rideLeaderId({ started_by: 'starter-1', created_by: 'admin-9' }), 'starter-1');

  // Pre-D80 rides (never backfilled): fall back to the author, who WAS the starter by
  // construction (the ad-hoc creator both authors and starts the ride).
  assert.equal(rideLeaderId({ started_by: null, created_by: 'cap-1' }), 'cap-1');
  assert.equal(rideLeaderId({ created_by: 'cap-1' }), 'cap-1');

  // A ride nobody started has NO leader. Callers must fail closed and draw nothing —
  // guessing a leader is the entire defect this fixes.
  assert.equal(rideLeaderId({ started_by: null, created_by: null }), null);
  assert.equal(rideLeaderId({}), null);
});

test('D80 leader rule: role on the roster is irrelevant — a phantom captain cannot be elected', () => {
  // The regression guard. Sven (staging 8be41c20) is role='captain' on 25 rides with zero pings
  // ever; the old scan elected him. The rule now reads ONE field off the ride row, so no roster
  // membership, role, or key order can influence the result.
  const ride = { started_by: 'real-starter', created_by: 'real-starter' };
  assert.equal(rideLeaderId(ride), 'real-starter');
  // Deterministic: same input, same answer, every call, on every surface.
  assert.equal(rideLeaderId(ride), rideLeaderId(ride));
});
