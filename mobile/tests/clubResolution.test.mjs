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

test('member of some other club only -> join the fallback club', () => {
  assert.deepEqual(chooseActiveClub([m('lakeside-wheelers')], RS, BB), { kind: 'join-fallback', slug: BB });
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
  assert.deepEqual(chooseActiveClub([m(RS)], '', BB), { kind: 'join-fallback', slug: BB });
});
