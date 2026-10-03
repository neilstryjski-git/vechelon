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
} from '../src/lib/rosterLogic.ts';

const ROLES = ['captain', 'support', 'member', 'guest'];
const ISO = '2026-10-03T12:00:00.000Z';

// --- participation state: durable signal only -----------------------------------------------------

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
  for (const s of ['app_tracked', 'roster_only']) assert.ok(!bad.test(participationLabel(s)), participationLabel(s));
  assert.equal(participationLabel('roster_only'), 'Roster only');
  assert.equal(participationLabel('app_tracked'), 'App tracked');
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
