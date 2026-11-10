// W303 — unit tests for the active-club rule. Runs via `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chooseActiveClub } from '../src/lib/clubResolution.ts';

const RS = 'racer-sportif';
const BB = 'bikes-and-beers';
const m = (slug, status = 'affiliated', role = 'member') => ({ tenantId: `${slug}-id`, slug, role, status });

test('primary member gets the primary club', () => {
  const c = chooseActiveClub([m(RS)], RS, BB);
  assert.equal(c.kind, 'member');
  assert.equal(c.membership.slug, RS);
});

test('member of both clubs gets the primary club', () => {
  const c = chooseActiveClub([m(BB), m(RS, 'affiliated', 'admin')], RS, BB);
  assert.equal(c.membership.slug, RS);
  assert.equal(c.membership.role, 'admin');
});

test('fallback member gets the fallback club', () => {
  const c = chooseActiveClub([m(BB)], RS, BB);
  assert.equal(c.membership.slug, BB);
});

test('no memberships -> join the fallback club', () => {
  assert.deepEqual(chooseActiveClub([], RS, BB), { kind: 'join-fallback', slug: BB });
});

test('member of some other club only -> keeps that club (never pushed into the fallback)', () => {
  assert.equal(chooseActiveClub([m('vechelon-demo', 'affiliated', 'admin')], RS, BB).membership.slug, 'vechelon-demo');
});

test('several other clubs -> the admin one first', () => {
  const c = chooseActiveClub([m('a-club'), m('b-club', 'affiliated', 'admin')], RS, BB);
  assert.equal(c.membership.slug, 'b-club');
});

test('only inactive other-club rows -> join the fallback club', () => {
  assert.deepEqual(chooseActiveClub([m('a-club', 'archived')], RS, BB), { kind: 'join-fallback', slug: BB });
});

test('inactive primary membership does not count', () => {
  for (const s of ['suspended', 'archived', 'deleted']) {
    assert.deepEqual(chooseActiveClub([m(RS, s)], RS, BB), { kind: 'join-fallback', slug: BB });
  }
});

test('initiated (pending) primary membership still counts', () => {
  assert.equal(chooseActiveClub([m(RS, 'initiated')], RS, BB).membership.slug, RS);
});

test('removed from the fallback club -> never re-joined', () => {
  assert.deepEqual(chooseActiveClub([m(BB, 'suspended')], RS, BB), { kind: 'none' });
});

test('no fallback configured -> none', () => {
  assert.deepEqual(chooseActiveClub([], RS, ''), { kind: 'none' });
});

test('no primary configured -> fallback rules still apply', () => {
  assert.equal(chooseActiveClub([m(BB)], '', BB).membership.slug, BB);
  assert.equal(chooseActiveClub([m(RS)], '', BB).membership.slug, RS); // kept as an 'other' club
});

// ── W304: home-screen access state ───────────────────────────────────────────
import { clubAccess } from '../src/lib/clubResolution.ts';

test('W304: affiliated member sees the club', () => {
  assert.equal(clubAccess({ status: 'affiliated' }, false), 'member');
});

test('W304: initiated (pending) member gets the pending state', () => {
  assert.equal(clubAccess({ status: 'initiated' }, false), 'pending');
});

test('W304: no club resolved → none', () => {
  assert.equal(clubAccess(null, false), 'none');
});

test('W304: still resolving → loading, even with a stale club', () => {
  assert.equal(clubAccess(null, true), 'loading');
  assert.equal(clubAccess({ status: 'affiliated' }, true), 'loading');
});

test('W304: any other status never shows club data', () => {
  for (const s of ['suspended', 'archived', 'deleted', '', 'weird']) {
    assert.equal(clubAccess({ status: s }, false), 'none');
  }
});

test('W304: affiliated other club beats a PENDING primary row', () => {
  const c = chooseActiveClub([m(RS, 'initiated'), m('other-club', 'affiliated')], RS, BB);
  assert.equal(c.membership.slug, 'other-club');
  assert.equal(clubAccess(c.membership, false), 'member');
});

test('W304: affiliated fallback beats a pending primary', () => {
  const c = chooseActiveClub([m(RS, 'initiated'), m(BB)], RS, BB);
  assert.equal(c.membership.slug, BB);
});

test('W304: only pending rows → primary pending row, shown as pending', () => {
  const c = chooseActiveClub([m(BB, 'initiated'), m(RS, 'initiated')], RS, BB);
  assert.equal(c.membership.slug, RS);
  assert.equal(clubAccess(c.membership, false), 'pending');
});

test('W304: pending fallback row is never re-joined (no join-fallback)', () => {
  const c = chooseActiveClub([m(BB, 'initiated')], RS, BB);
  assert.equal(c.kind, 'member');
  assert.equal(c.membership.slug, BB);
});
