// W289 — tests for the single-slot offline roster cache core (Ledger slate 11, D1, §9.2 #2; R3-57/58).
// In-memory adapters + a deterministic fake AEAD; one case runs the REAL AES-GCM from @noble/ciphers.
// Runs via `npm test` (node --experimental-strip-types --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gcm } from '@noble/ciphers/aes.js';

import {
  createRosterCacheCore,
  parseSlot,
  shouldSupersede,
  slotReadableBy,
  bytesToBase64,
  base64ToBytes,
  utf8Encode,
  utf8Decode,
  ROSTER_CACHE_KEY,
  ROSTER_CACHE_KEY_ALIAS,
} from '../src/lib/rosterCachePure.ts';
import { hasCoordinateKeys } from '../src/lib/telemetryPure.ts';

const fakeAead = {
  seal: (k, n, pt) => pt.map((b, i) => b ^ k[i % k.length] ^ n[i % n.length]),
  open: (k, n, ct) => ct.map((b, i) => b ^ k[i % k.length] ^ n[i % n.length]),
};
let seq = 0;
const randomBytes = (n) => Uint8Array.from({ length: n }, (_, i) => (i + seq++) & 255);

function harness({ keystore = true, aead = fakeAead } = {}) {
  const store = new Map();
  const ks = new Map();
  const log = [];
  const core = createRosterCacheCore({
    storage: {
      getItem: async (k) => store.get(k) ?? null,
      setItem: async (k, v) => { store.set(k, v); },
      removeItem: async (k) => { store.delete(k); },
    },
    keystore: keystore
      ? async () => ({
          getItemAsync: async (k) => ks.get(k) ?? null,
          setItemAsync: async (k, v) => { ks.set(k, v); },
          deleteItemAsync: async (k) => { ks.delete(k); },
        })
      : null,
    aead,
    randomBytes,
    hasCoordinateKeys,
    now: () => '2026-10-03T12:00:00.000Z',
    log: (m) => log.push(m),
  });
  return { core, store, ks, log };
}
const rows = [
  { id: 'p1', account_id: 'cap', display_name: 'Cap', phone: '+1 555 0100', role: 'captain', rail3_joined_at: '2026-10-03T11:00:00.000Z', accounts: { name: 'Cap Tain', phone: '+1 555 0100' } },
  { id: 'p2', account_id: null, display_name: 'Guest Gé', phone: '+1 555 0200', role: 'guest', rail3_joined_at: null, accounts: null },
];
const slotFor = (rideId, userId = 'me', extra = {}) => ({ rideId, userId, lastStatus: 'active', myRole: 'member', rows, ...extra });

test('write then read round-trips for the same ride and user; contact fields are not stored in clear', async () => {
  const { core, store } = harness();
  assert.equal(await core.write(slotFor('ride-A')), true);
  const blob = store.get(ROSTER_CACHE_KEY);
  assert.ok(blob && !blob.includes('555') && !blob.includes('Cap'), 'ciphertext only');
  const slot = await core.read('ride-A', 'me');
  assert.equal(slot.rideId, 'ride-A');
  assert.equal(slot.savedAt, '2026-10-03T12:00:00.000Z');
  assert.equal(slot.rows[1].display_name, 'Guest Gé');
  assert.equal(slot.rows[0].accounts.phone, '+1 555 0100');
});

test('supersession: a write for another ride overwrites the single slot; the old ride is gone', async () => {
  const { core, log } = harness();
  await core.write(slotFor('ride-A'));
  await core.write(slotFor('ride-B'));
  assert.equal(await core.read('ride-A', 'me'), null);
  assert.equal((await core.read('ride-B', 'me')).rideId, 'ride-B');
  assert.ok(log.some((m) => m.includes('supersession')));
  assert.equal(shouldSupersede({ rideId: 'ride-A' }, 'ride-B'), true);
  assert.equal(shouldSupersede({ rideId: 'ride-A' }, 'ride-A'), false);
  assert.equal(shouldSupersede(null, 'ride-A'), false);
});

test('there is NO departure clear: the core exposes exactly write / read / clear / status', async () => {
  const { core } = harness();
  assert.deepEqual(Object.keys(core).sort(), ['clear', 'read', 'status', 'write']);
});

test('auth transition clears the slot AND rotates the key; reads return null afterwards', async () => {
  const { core, store, ks } = harness();
  await core.write(slotFor('ride-A'));
  assert.ok(ks.has(ROSTER_CACHE_KEY_ALIAS));
  assert.equal(await core.clear('auth_transition'), true);
  assert.equal(store.has(ROSTER_CACHE_KEY), false);
  assert.equal(ks.has(ROSTER_CACHE_KEY_ALIAS), false);
  assert.equal(await core.read('ride-A', 'me'), null);
});

test("another user's slot, or another ride's, is unreadable (R3-57 belt-and-braces)", async () => {
  const { core } = harness();
  await core.write(slotFor('ride-A', 'rider-A'));
  assert.equal(await core.read('ride-A', 'rider-B'), null);
  assert.equal(await core.read('ride-Z', 'rider-A'), null);
  assert.equal(await core.read('ride-A', null), null);
  assert.equal(slotReadableBy({ v: 1, rideId: 'r', userId: 'u' }, 'u', 'r'), true);
  assert.equal(slotReadableBy({ v: 2, rideId: 'r', userId: 'u' }, 'u', 'r'), false);
});

test('corrupt, tampered or wrongly-shaped slots read as null and are removed', async () => {
  const { core, store } = harness();
  store.set(ROSTER_CACHE_KEY, 'not base64!!');
  assert.equal(await core.read('ride-A', 'me'), null);
  assert.equal(store.has(ROSTER_CACHE_KEY), false);
  await core.write(slotFor('ride-A'));
  const blob = store.get(ROSTER_CACHE_KEY);
  store.set(ROSTER_CACHE_KEY, blob.slice(0, -4) + 'AAAA'); // tamper
  assert.equal(await core.read('ride-A', 'me'), null);
  for (const raw of [null, '', '{}', '{"v":2}', '[]', JSON.stringify({ v: 1, rideId: 'r', userId: 'u', savedAt: 'x', lastStatus: null, myRole: 'member', rows: [] }), JSON.stringify({ v: 1, rideId: 'r', userId: 'u', savedAt: '2026-10-03T00:00:00Z', lastStatus: null, myRole: 'boss', rows: [] })]) {
    assert.equal(parseSlot(raw), null, `raw=${raw}`);
  }
});

test('rows carrying position data are refused at write; storage stays untouched', async () => {
  const { core, store, log } = harness();
  for (const bad of [{ ...rows[0], lat: 1 }, { ...rows[0], accounts: { name: 'x', phone: null, coords: [1, 2] } }]) {
    assert.equal(await core.write(slotFor('ride-A', 'me', { rows: [bad] })), false);
    assert.equal(store.has(ROSTER_CACHE_KEY), false);
  }
  assert.ok(log.some((m) => m.includes('position data refused')));
});

test("lastStatus 'saved' and the role round-trip, so the surface can close and gate offline", async () => {
  const { core } = harness();
  await core.write(slotFor('ride-A', 'me', { lastStatus: 'saved', myRole: 'captain' }));
  const slot = await core.read('ride-A', 'me');
  assert.equal(slot.lastStatus, 'saved');
  assert.equal(slot.myRole, 'captain');
});

test('no keystore → inert: status inert_no_keystore, write false, read null, logged once', async () => {
  const { core, store, log } = harness({ keystore: false });
  assert.equal(await core.status(), 'inert_no_keystore');
  assert.equal(await core.write(slotFor('ride-A')), false);
  assert.equal(await core.read('ride-A', 'me'), null);
  assert.equal(store.size, 0);
  assert.equal(log.filter((m) => m.includes('inert')).length, 1);
});

test('real AES-256-GCM: round-trip, and a flipped ciphertext byte fails to open', async () => {
  const aead = { seal: (k, n, pt) => gcm(k, n).encrypt(pt), open: (k, n, ct) => gcm(k, n).decrypt(ct) };
  const { core, store } = harness({ aead });
  await core.write(slotFor('ride-A'));
  assert.equal((await core.read('ride-A', 'me')).rows.length, 2);
  const bytes = base64ToBytes(store.get(ROSTER_CACHE_KEY));
  bytes[20] ^= 1;
  store.set(ROSTER_CACHE_KEY, bytesToBase64(bytes));
  assert.equal(await core.read('ride-A', 'me'), null);
});

test('base64 and utf8 helpers round-trip including non-ASCII and 4-byte code points', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'Guest Gé — Ünïcode ✓ 🚴']) {
    assert.equal(utf8Decode(utf8Encode(s)), s);
    const b = utf8Encode(s);
    assert.deepEqual(Array.from(base64ToBytes(bytesToBase64(b))), Array.from(b));
  }
  assert.throws(() => base64ToBytes('@@@@'));
});

test('concurrent first writes share ONE key (in-flight memo): both slots stay readable under the stored key', async () => {
  const { core, ks } = harness();
  await Promise.all([core.write(slotFor('ride-A')), core.write(slotFor('ride-A', 'me', { lastStatus: 'created' }))]);
  assert.equal(ks.size, 1, 'exactly one key stored');
  assert.ok(await core.read('ride-A', 'me'), 'readable under the stored key');
});

test('auth-transition clear on a binary WITHOUT the keystore is "nothing to rotate": ok, inert, no FAILED log', async () => {
  const { core, log } = harness({ keystore: false });
  assert.equal(await core.clear('auth_transition'), true);
  assert.ok(!log.some((m) => m.includes('FAILED')));
  assert.ok(log.some((m) => m.includes('inert')));
  // a resolved keystore whose delete rejects IS a failure
  const store = new Map(); const logs = [];
  const broken = createRosterCacheCore({
    storage: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); }, removeItem: async (k) => { store.delete(k); } },
    keystore: async () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => { throw new Error('keystore busy'); } }),
    aead: fakeAead, randomBytes, hasCoordinateKeys, now: () => '2026-10-03T12:00:00.000Z', log: (m) => logs.push(m),
  });
  assert.equal(await broken.clear('auth_transition'), false);
  assert.ok(logs.some((m) => m.includes('FAILED')));
});

test('a write in flight across an auth-transition clear is dropped (never writes rider A under rider B)', async () => {
  const store = new Map(); const ks = new Map(); let release;
  const core = createRosterCacheCore({
    storage: { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => { store.set(k, v); }, removeItem: async (k) => { store.delete(k); } },
    keystore: async () => ({
      getItemAsync: async (k) => { await new Promise((r) => { release = r; }); return ks.get(k) ?? null; },
      setItemAsync: async (k, v) => { ks.set(k, v); }, deleteItemAsync: async (k) => { ks.delete(k); },
    }),
    aead: fakeAead, randomBytes, hasCoordinateKeys, now: () => '2026-10-03T12:00:00.000Z', log: () => {},
  });
  const pending = core.write(slotFor('ride-A', 'rider-A'));
  await new Promise((r) => setImmediate(r));
  await core.clear('auth_transition'); // rider A signs out while the key is still resolving
  release();
  assert.equal(await pending, false);
  assert.equal(store.has(ROSTER_CACHE_KEY), false);
});
