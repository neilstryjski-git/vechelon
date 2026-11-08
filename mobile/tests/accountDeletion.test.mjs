// W300 — pins the in-app account deletion order and guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runAccountDeletion,
  isDeleteConfirmed,
  DELETION_EXPLANATION,
  DELETION_RETAINED,
} from '../src/lib/accountDeletion.ts';

function deps(overrides = {}) {
  const calls = [];
  return {
    calls,
    hasActiveRide: () => false,
    invokeDelete: async () => { calls.push('invokeDelete'); return { ok: true }; },
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
  assert.deepEqual(outcome, { ok: true });
  assert.deepEqual(d.calls, ['invokeDelete', 'clearActive', 'clearRosterCache', 'signOut']);
  assert.deepEqual(steps, ['delete_called', 'clear_active', 'clear_roster_cache', 'sign_out']);
});

test('on an active ride: refuses before calling the server, touches nothing', async () => {
  const d = deps({ hasActiveRide: () => true });
  const { outcome, steps } = await runAccountDeletion(d);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'active_ride');
  assert.deepEqual(d.calls, []);
  assert.deepEqual(steps, ['blocked_active_ride']);
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

test('server failure or a thrown network error: generic message, stays signed in', async () => {
  for (const invokeDelete of [
    async () => ({ ok: false, status: 500, error: 'deletion_failed', message: 'raw server text' }),
    async () => { throw new Error('network down'); },
  ]) {
    const d = deps({ invokeDelete });
    const { outcome } = await runAccountDeletion(d);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'failed');
    assert.match(outcome.message, /Nothing was removed/);
    assert.deepEqual(d.calls, []);
  }
});

test('global sign-out failing after deletion falls back to a local clear', async () => {
  for (const signOut of [
    async () => { d0.calls.push('signOut'); return { error: new Error('session not found') }; },
    async () => { d0.calls.push('signOut'); throw new Error('offline'); },
  ]) {
    var d0 = deps({ signOut });
    const { outcome, steps } = await runAccountDeletion(d0);
    assert.deepEqual(outcome, { ok: true });
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
});
