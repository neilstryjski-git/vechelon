// D77 — the identity-delta rule. These cases are the whole defect in miniature.
//
// The app must act as the account that is LOGGED IN. Before D77 it snapshotted the user id at
// map-mount and threaded it as a value, so a sign-out/sign-in with NO app restart left the ride
// tree running as the previous account — broadcasting as A while writing B's rows under B's
// token. The fix remounts the authed subtree (and resets the analytics caches) on an identity
// CHANGE. The trap on the other side is just as real: a token refresh delivers a brand-new
// session object for the SAME person roughly hourly, and treating THAT as a change would tear
// down a live ride's foreground service and channel mid-ride.
//
// So both directions are pinned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isIdentityChange, identityKey, SIGNED_OUT_KEY } from '../src/lib/identityDelta.ts';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

test('a token refresh is NOT an identity change', () => {
  // TOKEN_REFRESHED hands us a new session object for the same person. If this returned true,
  // a live ride would remount ~hourly and lose its FGS and channel.
  assert.equal(isIdentityChange(A, A), false);
});

test('an account swap IS an identity change', () => {
  // The D77 case: sign out as A, sign in as B, no app restart.
  assert.equal(isIdentityChange(A, B), true);
});

test('sign-in and sign-out are identity changes', () => {
  assert.equal(isIdentityChange(null, A), true); // cold start / fresh sign-in
  assert.equal(isIdentityChange(A, null), true); // sign-out must tear the ride tree down
});

test('signed-out to signed-out is not a change', () => {
  assert.equal(isIdentityChange(null, null), false);
});

test('identityKey is stable per account and distinct across accounts', () => {
  // Stable => a token refresh cannot remount the subtree. Distinct => a swap must.
  assert.equal(identityKey(A), identityKey(A));
  assert.notEqual(identityKey(A), identityKey(B));
});

test('identityKey has a non-null key when signed out', () => {
  // A null/undefined React key would silently disable the remount entirely.
  assert.equal(identityKey(null), SIGNED_OUT_KEY);
  assert.ok(identityKey(null));
  assert.notEqual(identityKey(null), identityKey(A));
});
