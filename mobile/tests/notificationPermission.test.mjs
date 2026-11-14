// D101 — pins the POST_NOTIFICATIONS request gating (Android 13+ only, never throws).
// Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureNotificationPermission,
  POST_NOTIFICATIONS,
} from '../src/lib/notificationPermission.ts';

function recorder(answer) {
  const calls = [];
  return {
    calls,
    request: async (p) => {
      calls.push(p);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

test('requests POST_NOTIFICATIONS on Android API 33+', async () => {
  for (const api of [33, 34, 35]) {
    const r = recorder('granted');
    assert.equal(await ensureNotificationPermission({ os: 'android', apiLevel: api, request: r.request }), 'granted');
    assert.deepEqual(r.calls, [POST_NOTIFICATIONS]);
  }
});

test('Platform.Version given as a string is still gated correctly', async () => {
  const r = recorder('granted');
  assert.equal(await ensureNotificationPermission({ os: 'android', apiLevel: '34', request: r.request }), 'granted');
  assert.equal(r.calls.length, 1);
});

test('no request below API 33 (permission does not exist there)', async () => {
  const r = recorder('granted');
  assert.equal(await ensureNotificationPermission({ os: 'android', apiLevel: 32, request: r.request }), 'not_required');
  assert.equal(r.calls.length, 0);
});

test('no request on iOS (its Platform.Version is a string like "17.4")', async () => {
  const r = recorder('granted');
  assert.equal(await ensureNotificationPermission({ os: 'ios', apiLevel: '17.4', request: r.request }), 'not_required');
  assert.equal(r.calls.length, 0);
});

test('unparseable API level is treated as not required, never a crash', async () => {
  const r = recorder('granted');
  assert.equal(await ensureNotificationPermission({ os: 'android', apiLevel: 'abc', request: r.request }), 'not_required');
  assert.equal(r.calls.length, 0);
});

test('denied and never_ask_again both map to denied', async () => {
  for (const answer of ['denied', 'never_ask_again']) {
    const r = recorder(answer);
    assert.equal(await ensureNotificationPermission({ os: 'android', apiLevel: 33, request: r.request }), 'denied');
  }
});

test('a throwing request resolves to error and never rejects (join is never blocked)', async () => {
  const r = recorder(new Error('Activity is null'));
  assert.equal(await ensureNotificationPermission({ os: 'android', apiLevel: 34, request: r.request }), 'error');
});
