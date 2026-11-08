// W300 — pins the in-app account deletion order and guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runAccountDeletion,
  isDeleteConfirmed,
  classifyUserCheck,
  DELETION_EXPLANATION,
  DELETION_RETAINED,
} from '../src/lib/accountDeletion.ts';

function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    hasActiveRide: () => false,
    invokeDelete: async () => { calls.push('invokeDelete'); return { ok: true }; },
    checkUser: async () => { calls.push('checkUser'); return 'present'; },
    clearActive: () => calls.push('clearActive'),
    clearRosterCache: () => calls.push('clearRosterCache'),
    signOut: async () => { calls.push('signOut'); return { error: null }; },
    signOutLocal: async () => { calls.push('signOutLocal'); },
    ...overrides,
  };
}

test('happy path: delete, then clear holder + roster cache, then sign out (in that order)', async () => {
  const d = deps();
  const { outcome, steps } = await runAccountDeletion(d);
  assert.deepEqual(outcome, { ok: true, signedOut: true });
  assert.deepEqual(d.calls, ['invokeDelete', 'clearActive', 'clearRosterCache', 'signOut']);
  assert.deepEqual(steps, ['delete_called', 'clear_active', 'clear_roster_cache', 'sign_out']);
});

test('on an active ride (sync, async, or unreadable holder): refuses before calling the server', async () => {
  for (const hasActiveRide of [() => true, async () => true, async () => { throw new Error('storage'); }]) {
    const d = deps({ hasActiveRide });
    const { outcome, steps } = await runAccountDeletion(d);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'active_ride');
    assert.match(outcome.message, /Sign out and back in/); // the exit for a stale holder
    assert.deepEqual(d.calls, []);
    assert.deepEqual(steps, ['blocked_active_ride']);
  }
});

test('last admin refusal: shows the server message, nothing local changes', async () => {
  const msg = 'You’re the only organiser of Club X. Make another member an organiser first, then delete your account.';
  const d = deps({ invokeDelete: async () => { d.calls.push('invokeDelete'); return { ok: false, status: 409, error: 'last_admin', message: msg }; } });
  const { outcome } = await runAccountDeletion(d);
  assert.deepEqual(outcome, { ok: false, reason: 'last_admin', message: msg });
  assert.deepEqual(d.calls, ['invokeDelete']);
});

test('platform admin refusal is reported as such', async () => {
  const d = deps({ invokeDelete: async () => ({ ok: false, error: 'platform_admin', message: 'Contact support.' }) });
  const { outcome } = await runAccountDeletion(d);
  assert.equal(outcome.reason, 'platform_admin');
  assert.deepEqual(d.calls, []);
});

test('failure with the account still present: retry message (never "nothing was removed"), stays signed in', async () => {
  for (const invokeDelete of [
    async () => ({ ok: false, status: 500, error: 'deletion_failed', message: 'raw server text' }),
    async () => { throw new Error('network down'); },
  ]) {
    const d = deps({ invokeDelete });
    const { outcome, steps } = await runAccountDeletion(d);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'failed');
    assert.match(outcome.message, /try again/);
    assert.doesNotMatch(outcome.message, /nothing was removed/i);
    assert.doesNotMatch(outcome.message, /raw server text/);
    assert.deepEqual(d.calls, ['checkUser']);
    assert.deepEqual(steps, ['delete_called', 'delete_failed']);
  }
});

test('failure but the server confirms the account is gone (dropped response): finishes locally', async () => {
  const d = deps({
    invokeDelete: async () => { throw new Error('connection reset'); },
    checkUser: async () => 'gone',
  });
  const { outcome, steps } = await runAccountDeletion(d);
  assert.deepEqual(outcome, { ok: true, signedOut: true });
  assert.deepEqual(steps, ['delete_called', 'delete_failed', 'account_gone', 'clear_active', 'clear_roster_cache', 'sign_out']);
});

test('checkUser throwing or unknown counts as not gone', async () => {
  for (const checkUser of [async () => { throw new Error('offline'); }, async () => 'unknown']) {
    const d = deps({ invokeDelete: async () => ({ ok: false }), checkUser });
    const { outcome } = await runAccountDeletion(d);
    assert.equal(outcome.reason, 'failed');
    assert.equal(d.calls.includes('signOut'), false);
  }
});

test('dead session (revoked / expired): says the account was NOT deleted, device untouched', async () => {
  const d = deps({ invokeDelete: async () => ({ ok: false, status: 401 }), checkUser: async () => 'session' });
  const { outcome } = await runAccountDeletion(d);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'session');
  assert.match(outcome.message, /not deleted/);
  assert.deepEqual(d.calls, []);
});

test('classifyUserCheck: only user_not_found means gone (codes observed on staging)', () => {
  assert.equal(classifyUserCheck({ hasUser: true }), 'present');
  assert.equal(classifyUserCheck({ hasUser: false, status: 403, code: 'user_not_found' }), 'gone');
  assert.equal(classifyUserCheck({ hasUser: false, status: 403, code: 'bad_jwt' }), 'session');
  assert.equal(classifyUserCheck({ hasUser: false, status: 400, code: null }), 'session');
  assert.equal(classifyUserCheck({ hasUser: false, status: 403, code: 'session_not_found' }), 'session');
  assert.equal(classifyUserCheck({ hasUser: false, status: 404, code: null }), 'unknown');
  assert.equal(classifyUserCheck({ hasUser: false, status: null, code: null }), 'unknown');
});

test('both sign-outs failing: still ok (account gone) but signedOut=false so the UI can say so', async () => {
  const d = deps({
    signOut: async () => { throw new Error('offline'); },
    signOutLocal: async () => ({ error: new Error('storage') }),
  });
  const { outcome } = await runAccountDeletion(d);
  assert.deepEqual(outcome, { ok: true, signedOut: false });
});

test('global sign-out failing after deletion falls back to a local clear', async () => {
  for (const signOut of [
    async () => { d0.calls.push('signOut'); return { error: new Error('session not found') }; },
    async () => { d0.calls.push('signOut'); throw new Error('offline'); },
  ]) {
    var d0 = deps({ signOut });
    const { outcome, steps } = await runAccountDeletion(d0);
    assert.deepEqual(outcome, { ok: true, signedOut: true });
    assert.deepEqual(d0.calls, ['invokeDelete', 'clearActive', 'clearRosterCache', 'signOut', 'signOutLocal']);
    assert.equal(steps.at(-1), 'sign_out_local');
  }
});

test('typed confirmation: only the word DELETE (case and outer spaces forgiven)', () => {
  for (const ok of ['DELETE', 'delete', '  Delete ']) assert.equal(isDeleteConfirmed(ok), true, ok);
  for (const no of ['', 'DELET', 'DELETE ME', 'yes', 'D E L E T E']) assert.equal(isDeleteConfirmed(no), false, no);
});

test('copy never promises deletion of what the server keeps', () => {
  const deleted = DELETION_EXPLANATION.join(' ').toLowerCase();
  // Rides/routes the user created are reassigned, analytics are kept: neither may be in the deleted list.
  assert.doesNotMatch(deleted, /rides you created|routes|statistics|analytics/);
  const kept = DELETION_RETAINED.join(' ').toLowerCase();
  assert.match(kept, /rides and routes you created/);
  assert.match(kept, /statistics/);
  assert.match(kept, /support/);
  assert.match(kept, /logs may keep your email/);
  assert.match(kept, /different email address/);
});
