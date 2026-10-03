// W292 — unit tests for the pure fleet composition (Ledger C3 item 7; Pillar III R3-65 / R3-68 /
// R3-70). Runs via `npm test` (node --experimental-strip-types --test). deriveState is injected as
// the identity so the ladder itself (riderState.ts) is not under test here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeFleet,
  pingBeatsDeparture,
  lastKnownFromRows,
  mergeDepartedMarks,
} from '../src/lib/fleetCompose.ts';

const identity = (s) => s;
const roster = {
  cap: { role: 'captain', displayName: 'Cap', phone: '+1 555 0100', participantStatus: 'active' },
  r1: { role: 'member', displayName: 'R1', phone: null, participantStatus: 'active' },
  r2: { role: 'member', displayName: 'R2', phone: null, participantStatus: 'active' },
};
const ping = (riderId, ts, extra = {}) => ({ riderId, lat: 45.5, lng: -73.6, ts, receivedAtMs: ts + 50, state: 'active', ...extra });
const lk = (ts) => ({ lat: 45.4, lng: -73.5, ts });
const T = 1_700_000_000_000;
const compose = (over) => composeFleet({ pings: {}, lastKnown: {}, roster, departed: {}, nowMs: T + 60_000, deriveState: identity, ...over });

// --- regression: with no departed marks the join is the W262/W270 precedence, unchanged ------------

test('no marks: (pings ∪ lastKnown) ∩ roster, live wins when fresher, else last-known; roster-less ids dropped', () => {
  const out = compose({
    pings: { cap: ping('cap', T + 10_000), r1: ping('r1', T), ghost: ping('ghost', T) },
    lastKnown: { r1: lk(T + 5_000), r2: lk(T - 1_000), hidden: lk(T) },
  });
  const byId = Object.fromEntries(out.fleet.map((f) => [f.riderId, f]));
  assert.deepEqual(Object.keys(byId).sort(), ['cap', 'r1', 'r2']);
  assert.equal(byId.cap.source, 'live');
  assert.equal(byId.r1.source, 'lastKnown', 'a fresher stop write beats an older live ping');
  assert.equal(byId.r1.state, 'stopped');
  assert.equal(byId.r2.source, 'lastKnown');
  assert.deepEqual(out.unknownLiveRiderIds, ['ghost'], 'only a LIVE ping from an unknown id is a joiner signal');
  assert.deepEqual(out.departedSuppressed, []);
});

test('live ping equal to the last-known ts wins (>=), matching the inline join it replaced', () => {
  const out = compose({ pings: { r1: ping('r1', T) }, lastKnown: { r1: lk(T) } });
  assert.equal(out.fleet[0].source, 'live');
});

// --- the departed rule ------------------------------------------------------------------------------

test('departure beats seed: a marked rider with only a last-known entry is NOT rendered, and is reported as suppressed', () => {
  const out = compose({ lastKnown: { r1: lk(T + 50_000) }, departed: { r1: { atMs: T, seenAtMs: T + 1 } } });
  assert.deepEqual(out.fleet, []);
  assert.deepEqual(out.departedSuppressed, ['r1']);
});

test('departure does not beat rejoin: a live ping STRICTLY newer than the mark renders the rider from live, never from the stale seed', () => {
  const out = compose({
    pings: { r1: ping('r1', T + 1) },
    lastKnown: { r1: lk(T + 99_000) }, // a late write re-seeded coordinates onto the departed row
    departed: { r1: { atMs: T, seenAtMs: T } },
  });
  assert.equal(out.fleet.length, 1);
  assert.equal(out.fleet[0].source, 'live');
  assert.equal(out.fleet[0].lastPingAt, T + 1);
  assert.deepEqual(out.departedSuppressed, []);
});

test('a live ping OLDER than (or equal to) the mark is pre-departure noise and is suppressed', () => {
  for (const ts of [T - 1, T]) {
    const out = compose({ pings: { r1: ping('r1', ts) }, departed: { r1: { atMs: T, seenAtMs: T } } });
    assert.deepEqual(out.fleet, [], `ts=${ts}`);
    assert.deepEqual(out.departedSuppressed, ['r1']);
  }
});

test('pingBeatsDeparture: no mark → true; strictly newer → true; equal/older → false', () => {
  assert.equal(pingBeatsDeparture(T, undefined), true);
  assert.equal(pingBeatsDeparture(T + 1, { atMs: T, seenAtMs: 0 }), true);
  assert.equal(pingBeatsDeparture(T, { atMs: T, seenAtMs: 0 }), false);
  assert.equal(pingBeatsDeparture(T - 1, { atMs: T, seenAtMs: 0 }), false);
});

test('"departed" never enters the ladder: a rendered rejoiner carries a real TacticalState and FleetParticipant gains no field', () => {
  const out = compose({ pings: { r1: ping('r1', T + 1, { state: 'stopped' }) }, departed: { r1: { atMs: T, seenAtMs: T } } });
  assert.equal(out.fleet[0].state, 'stopped');
  assert.deepEqual(Object.keys(out.fleet[0]).sort(), ['accountStatus', 'displayName', 'lastPingAt', 'phone', 'position', 'riderId', 'role', 'source', 'state']);
});

// --- lastKnownFromRows: the fetch split -----------------------------------------------------------------

test('lastKnownFromRows: a departed row goes to `departed` and is never a seed even when coordinates survive on it; usable counts renderable rows only', () => {
  const rows = [
    { account_id: 'cap', last_lat: 45.5, last_long: -73.6, last_ping: new Date(T).toISOString(), departed_at: null },
    { account_id: 'r1', last_lat: 45.5, last_long: -73.6, last_ping: new Date(T).toISOString(), departed_at: new Date(T + 10).toISOString() }, // late write
    { account_id: 'r2', last_lat: null, last_long: null, last_ping: null, departed_at: new Date(T + 20).toISOString() }, // the normal null-out
    { account_id: 'r3', last_lat: null, last_long: null, last_ping: null, departed_at: null }, // never pinged
    { account_id: null, last_lat: 1, last_long: 1, last_ping: new Date(T).toISOString(), departed_at: null }, // guest shell
    { account_id: 'bad', last_lat: 1, last_long: 1, last_ping: 'not-a-date', departed_at: null },
  ];
  const r = lastKnownFromRows(rows, T + 100);
  assert.deepEqual(Object.keys(r.lastKnown), ['cap']);
  assert.deepEqual(r.departed, { r1: { atMs: T + 10, seenAtMs: T + 100 }, r2: { atMs: T + 20, seenAtMs: T + 100 } });
  assert.equal(r.usable, 1);
  assert.equal(r.departedCount, 2);
});

test('lastKnownFromRows: an unparsable departed_at is ignored (fails open to today\'s behaviour for that row)', () => {
  const r = lastKnownFromRows([{ account_id: 'r1', last_lat: 1, last_long: 2, last_ping: new Date(T).toISOString(), departed_at: 'garbage' }], T);
  assert.deepEqual(Object.keys(r.lastKnown), ['r1']);
  assert.deepEqual(r.departed, {});
});

// --- mergeDepartedMarks: fetch authoritative, except marks learned after the fetch started ----------

test('mergeDepartedMarks: the fetch result wins, a broadcast mark learned AFTER the fetch started survives, one learned before it is dropped when the fetch says present', () => {
  const fetchStartedAt = T;
  const fetched = { r1: { atMs: T - 500, seenAtMs: T + 200 } };
  const local = {
    r2: { atMs: T + 50, seenAtMs: T + 60 }, // departed while the fetch was in flight → keep
    r3: { atMs: T - 900, seenAtMs: T - 800 }, // stale local mark, fetch says not departed → rejoin cleared it
    r1: { atMs: T - 400, seenAtMs: T + 10 }, // also in fetched → fetched wins
  };
  const merged = mergeDepartedMarks(fetched, local, fetchStartedAt);
  assert.deepEqual(merged, { r1: { atMs: T - 500, seenAtMs: T + 200 }, r2: { atMs: T + 50, seenAtMs: T + 60 } });
});
