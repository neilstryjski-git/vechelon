// W288 — unit tests for the roster envelope (Ledger slate 17 / slate 8 / slate 11; Pillar II §4.1
// ROSTER; R3-74). Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  participationState,
  participationLabel,
  rowVisibleTo,
  phoneVisibleTo,
  rosterOpenFor,
  rosterRowFromRpc,
  rowParticipation,
} from '../src/lib/rosterLogic.ts';

const ROLES = ['captain', 'support', 'member', 'guest'];
const ISO = '2026-10-03T12:00:00.000Z';

// --- participation state: durable signal only -----------------------------------------------------

// W292 (C3 item 7, R3-65/70): the departed mark is a durable ROSTER state with precedence over the
// app-tracked stamp; a guest (no account) can never be departed; callers that omit it are unchanged.
test('participationState: departedAt wins over app_tracked AND roster_only for an account holder; never for a guest; omitted = W288 behaviour', () => {
  assert.equal(participationState({ accountId: 'acct-1', rail3JoinedAt: ISO, departedAt: ISO }), 'departed');
  assert.equal(participationState({ accountId: 'acct-1', rail3JoinedAt: null, departedAt: ISO }), 'departed');
  assert.equal(participationState({ accountId: null, rail3JoinedAt: null, departedAt: ISO }), 'roster_only', 'a guest cannot depart');
  assert.equal(participationState({ accountId: 'acct-1', rail3JoinedAt: ISO, departedAt: null }), 'app_tracked');
  assert.equal(participationState({ accountId: 'acct-1', rail3JoinedAt: ISO }), 'app_tracked', 'departedAt optional');
  assert.equal(participationState({ accountId: 'acct-1', rail3JoinedAt: null }), 'roster_only');
});

test('participationState: guest (no account) → roster_only; member who never opened the app → roster_only; app rider → app_tracked', () => {
  assert.equal(participationState({ accountId: null, rail3JoinedAt: null }), 'roster_only');
  assert.equal(participationState({ accountId: 'acct-1', rail3JoinedAt: null }), 'roster_only');
  assert.equal(participationState({ accountId: 'acct-1', rail3JoinedAt: ISO }), 'app_tracked');
  assert.equal(participationState({ accountId: null, rail3JoinedAt: ISO }), 'roster_only', 'no account can never be app-tracked');
});

test('participationState takes no ping/position input — a pocketed app rider is app_tracked by construction', () => {
  // The row type has exactly two fields; extra "state" keys are ignored, not consulted.
  const row = { accountId: 'acct-1', rail3JoinedAt: ISO, state: 'dark', lastPingAt: 0 };
  assert.equal(participationState(row), 'app_tracked');
});

test('labels are neutral — roster-only is never framed as a failure (R3-74)', () => {
  const bad = /fail|offline|lost|missing|error|no signal|dark|dead|inactive/i;
  for (const s of ['app_tracked', 'roster_only', 'departed']) assert.ok(!bad.test(participationLabel(s)), participationLabel(s));
  assert.equal(participationLabel('roster_only'), 'Roster only');
  assert.equal(participationLabel('app_tracked'), 'App tracked');
  assert.equal(participationLabel('departed'), 'Left ride'); // W292: a deliberate act, not the Dark/stale vocabulary
});

// --- §4.1: every row for every role ------------------------------------------------------------------

test('rowVisibleTo is true for every viewer × every row role (the roster is the complete record)', () => {
  for (const me of ROLES) for (const r of ROLES) assert.equal(rowVisibleTo(me, { role: r }), true, `${me} sees ${r}`);
});

// --- slate 8 / §4.1 phone matrix -----------------------------------------------------------------------

test("phoneVisibleTo: command sees everyone's number (co-captains included); riders and guests see leaders' numbers only", () => {
  for (const target of ROLES) {
    assert.equal(phoneVisibleTo('captain', target), true, `captain → ${target}`);
    assert.equal(phoneVisibleTo('support', target), true, `support → ${target}`);
  }
  for (const me of ['member', 'guest']) {
    assert.equal(phoneVisibleTo(me, 'captain'), true, `${me} → captain`);
    assert.equal(phoneVisibleTo(me, 'support'), true, `${me} → support`);
    assert.equal(phoneVisibleTo(me, 'member'), false, `${me} → member (O-07 parked)`);
    assert.equal(phoneVisibleTo(me, 'guest'), false, `${me} → guest`);
  }
});

// --- slate 11: ride-scoped ------------------------------------------------------------------------------

test('rosterOpenFor: open for created/active to participants; closed at saved/unknown; never for a non-participant', () => {
  assert.equal(rosterOpenFor('created', true), true);
  assert.equal(rosterOpenFor('active', true), true);
  for (const s of ['saved', null, undefined, '', 'purged']) assert.equal(rosterOpenFor(s, true), false, `status=${s}`);
  for (const s of ['created', 'active', 'saved']) assert.equal(rosterOpenFor(s, false), false, `non-participant ${s}`);
});

// --- W313: mapping the get_ride_roster result onto roster rows, per role ---------------------------

const rpc = (over = {}) => ({
  participant_id: 'p-1', account_id: 'acct-1', name: 'Ada Rider', role: 'member',
  participation: 'app_tracked', phone: null, rail3_joined_at: ISO, departed_at: null, ...over,
});

test('rosterRowFromRpc: a rider row as a rider receives it — name kept, no phone, state from the server', () => {
  const row = rosterRowFromRpc(rpc());
  assert.deepEqual(row, {
    id: 'p-1', account_id: 'acct-1', display_name: 'Ada Rider', phone: null, role: 'member',
    rail3_joined_at: ISO, departed_at: null, participation: 'app_tracked',
  });
  assert.equal(rowParticipation(row), 'app_tracked');
});

test('rosterRowFromRpc: leader rows carry the phone the server sent (Captain and SAG, to every viewer)', () => {
  for (const role of ['captain', 'support']) {
    const row = rosterRowFromRpc(rpc({ role, phone: '+14165550100' }));
    assert.equal(row.role, role);
    assert.equal(row.phone, '+14165550100');
  }
});

test('rosterRowFromRpc: as Captain or SAG, a rider row and a guest row carry their phones', () => {
  assert.equal(rosterRowFromRpc(rpc({ phone: '+14165550101' })).phone, '+14165550101');
  const guest = rosterRowFromRpc(rpc({ account_id: null, role: 'guest', participation: 'roster_only', phone: '+14165550102', rail3_joined_at: null }));
  assert.equal(guest.account_id, null);
  assert.equal(guest.role, 'guest');
  assert.equal(guest.phone, '+14165550102');
  assert.equal(rowParticipation(guest), 'roster_only');
});

test('rosterRowFromRpc never invents a phone: null and missing stay null', () => {
  assert.equal(rosterRowFromRpc(rpc({ phone: null })).phone, null);
  const { phone, ...noPhone } = rpc();
  assert.equal(rosterRowFromRpc(noPhone).phone, null);
});

test('rosterRowFromRpc: an unknown role fails closed to member (no leader treatment)', () => {
  assert.equal(rosterRowFromRpc(rpc({ role: 'marshal' })).role, 'member');
  assert.equal(rosterRowFromRpc(rpc({ role: null })).role, 'member');
});

test('a participation value this build does not know (a later fourth value) falls back to the durable marks', () => {
  const row = rosterRowFromRpc(rpc({ participation: 'app_open_only' }));
  assert.equal(row.participation, null);
  assert.equal(rowParticipation(row), 'app_tracked');
  const departed = rosterRowFromRpc(rpc({ participation: 'something_new', departed_at: ISO }));
  assert.equal(rowParticipation(departed), 'departed');
});

test('rowParticipation: a row from the offline cache has no server value and is derived', () => {
  assert.equal(rowParticipation({ account_id: 'acct-1', rail3_joined_at: null, departed_at: null }), 'roster_only');
  assert.equal(rowParticipation({ account_id: 'acct-1', rail3_joined_at: ISO, departed_at: ISO }), 'departed');
  assert.equal(rowParticipation({ account_id: null, rail3_joined_at: null }), 'roster_only');
});

