// W286 — unit tests for the device-side recovery chain's pure decisions (Ledger B1 device-side;
// R3-42 / R3-48 / R3-67). Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_RIDE_KEY,
  parsePersistedRide,
  serializePersistedRide,
  decideHeadlessAction,
  decideForegroundHeartbeat,
  buildWakeAttemptPayload,
  isRecoveryEvent,
} from '../src/lib/headlessLogic.ts';
import { hasCoordinateKeys } from '../src/lib/telemetryPure.ts';

const ride = { rideId: 'ride-1', riderId: 'rider-A' };

// --- durable holder serialisation ---------------------------------------------------------------

test('persisted ride round-trips; garbage, partial and foreign shapes read as NO ride (fail closed)', () => {
  assert.equal(ACTIVE_RIDE_KEY, 'rail3:active-ride');
  assert.deepEqual(parsePersistedRide(serializePersistedRide(ride)), ride);
  for (const raw of [null, undefined, '', 'not json', '42', '"str"', '[]', '{}', '{"rideId":"x"}', '{"rideId":"","riderId":"y"}', '{"rideId":1,"riderId":"y"}']) {
    assert.equal(parsePersistedRide(raw), null, `raw=${raw}`);
  }
});

// --- headless decision matrix ---------------------------------------------------------------------

test('no persisted ride → noop for every event (R3-67: the task is inert after departure)', () => {
  for (const event of ['heartbeat', 'terminate', 'providerchange', 'location']) {
    assert.equal(decideHeadlessAction({ event, persistedRide: null, engineEnabled: false }), 'noop');
  }
});

test('enabled engine: heartbeat/providerchange → noop; terminate → write_last_known only', () => {
  assert.equal(decideHeadlessAction({ event: 'heartbeat', persistedRide: ride, engineEnabled: true }), 'noop');
  assert.equal(decideHeadlessAction({ event: 'providerchange', persistedRide: ride, engineEnabled: true }), 'noop');
  assert.equal(decideHeadlessAction({ event: 'terminate', persistedRide: ride, engineEnabled: true }), 'write_last_known');
});

test('disabled engine during an active ride: heartbeat/providerchange → reassert; terminate → reassert + last-known', () => {
  assert.equal(decideHeadlessAction({ event: 'heartbeat', persistedRide: ride, engineEnabled: false }), 'reassert');
  assert.equal(decideHeadlessAction({ event: 'providerchange', persistedRide: ride, engineEnabled: false }), 'reassert');
  assert.equal(decideHeadlessAction({ event: 'terminate', persistedRide: ride, engineEnabled: false }), 'reassert_and_write_last_known');
});

test('a ride already Saved or purged → noop even with a stale durable holder (teardown is the slate 13 sibling)', () => {
  assert.equal(decideHeadlessAction({ event: 'heartbeat', persistedRide: ride, engineEnabled: false, rideStatus: 'saved' }), 'noop');
  assert.equal(decideHeadlessAction({ event: 'terminate', persistedRide: ride, engineEnabled: false, rideStatus: 'purged' }), 'noop');
  assert.equal(decideHeadlessAction({ event: 'heartbeat', persistedRide: ride, engineEnabled: false, rideStatus: 'active' }), 'reassert');
  assert.equal(decideHeadlessAction({ event: 'heartbeat', persistedRide: ride, engineEnabled: false, rideStatus: null }), 'reassert');
});

test('unknown events are ignored', () => {
  for (const event of ['location', 'motionchange', '', 'http']) {
    assert.equal(decideHeadlessAction({ event, persistedRide: ride, engineEnabled: false }), 'noop');
  }
});

// --- in-process heartbeat decision ------------------------------------------------------------------

test('foreground heartbeat: enabled → proceed; stopping wins; then the engine-session guard; then the ride', () => {
  assert.equal(decideForegroundHeartbeat({ engineEnabled: true, persistedRide: null, stopping: true, engineSession: false }), 'proceed');
  assert.equal(decideForegroundHeartbeat({ engineEnabled: false, persistedRide: ride, stopping: true, engineSession: true }), 'skipped_stopping');
  assert.equal(decideForegroundHeartbeat({ engineEnabled: false, persistedRide: ride, stopping: false, engineSession: false }), 'skipped_no_session');
  assert.equal(decideForegroundHeartbeat({ engineEnabled: false, persistedRide: null, stopping: false, engineSession: true }), 'skipped_no_ride');
  assert.equal(decideForegroundHeartbeat({ engineEnabled: false, persistedRide: ride, stopping: false, engineSession: true }), 'reassert');
});

test('a stopped engine session is never re-asserted even with a durable holder present (the in-flight-beat race)', () => {
  // The engine effect's cleanup leaves the durable holder in place (D77 remount / permission flip is
  // not a departure); only the engine-session flag distinguishes "we stopped it" from "it died".
  assert.equal(decideForegroundHeartbeat({ engineEnabled: false, persistedRide: ride, stopping: false, engineSession: false }), 'skipped_no_session');
});

test('isRecoveryEvent admits exactly heartbeat / terminate / providerchange', () => {
  for (const e of ['heartbeat', 'terminate', 'providerchange']) assert.equal(isRecoveryEvent(e), true);
  for (const e of ['location', 'motionchange', 'http', 'activitychange', '', null, undefined]) assert.equal(isRecoveryEvent(e), false);
});

// --- wake_attempt payload: device state only ---------------------------------------------------------

test('wake_attempt payload carries outcome/reason/event/context and never a coordinate key', () => {
  const p = buildWakeAttemptPayload({ outcome: 'failed', reason: 'enabled_false', event: 'terminate', engineEnabledBefore: false, context: 'headless', err: 'x'.repeat(500) });
  assert.equal(p.outcome, 'failed');
  assert.equal(p.engine_enabled_before, false);
  assert.equal(p.context, 'headless');
  assert.equal(String(p.err).length, 200);
  assert.equal(hasCoordinateKeys(p), false);
  assert.ok(!('err' in buildWakeAttemptPayload({ outcome: 'ok', reason: 'enabled_false', event: 'heartbeat', engineEnabledBefore: false, context: 'foreground' })));
});
