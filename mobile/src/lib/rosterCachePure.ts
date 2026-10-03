// W289 — pure core of the single-slot offline roster cache (Ledger slate 11, D1, §9.2 #2, §14 item
// 13; Pillar III R3-58 cache clause, R3-57). Erasable TypeScript, NO runtime imports (node's
// --experimental-strip-types needs full specifiers, so the coordinate guard is INJECTED): exercised
// by tests/rosterCache.test.mjs with in-memory adapters and a fake AEAD, plus one run with the real
// AES-GCM. The I/O binding (AsyncStorage + expo-secure-store + @noble/ciphers + expo-crypto) is
// ./rosterCache.ts.
//
// Contract: exactly ONE ride is cached — the most recent this device joined (= the first successful
// roster load of a ride other than the cached one supersedes the slot by overwriting it). Cleared by
// SUPERSESSION and by the AUTH TRANSITION only. Departure does NOT clear it (§9.2 correction #2: a
// rider who leaves and rejoins, or is bounced by an OS kill, must not be stranded). No TTL, no
// sweep. No position data of any kind. Renders from the slot are LAST-KNOWN, never live, and still
// pass the §4.1 gates at render.

import type { RideRole } from './roleVisibility';

export type ClearReason = 'supersession' | 'auth_transition';

export interface CachedRow {
  id: string;
  account_id: string | null;
  display_name: string | null;
  phone: string | null;
  role: RideRole;
  rail3_joined_at: string | null;
  accounts: { name: string | null; phone: string | null } | null;
}

export interface RosterSlot {
  v: 1;
  rideId: string;
  // The signed-in user the slot was written for — unreadable by anyone else (R3-57 belt-and-braces
  // beside the auth-transition clear, which also rotates the key).
  userId: string;
  savedAt: string; // ISO, device clock
  // Offline the live status and role are unknown: the slot carries the last ones seen so "closes at
  // ride end" (slate 11) and the §4.1 phone gate still hold from cache.
  lastStatus: string | null;
  myRole: RideRole;
  rows: CachedRow[];
}

export const ROSTER_CACHE_KEY = 'rail3:roster-cache'; // AsyncStorage: ciphertext envelope
export const ROSTER_CACHE_KEY_ALIAS = 'rail3.roster-cache-key'; // SecureStore: [A-Za-z0-9._-]

const ROLES = new Set<string>(['captain', 'support', 'member', 'guest']);

export function shouldSupersede(slot: RosterSlot | null, rideId: string): boolean {
  return slot !== null && slot.rideId !== rideId;
}

export function slotReadableBy(slot: RosterSlot | null, userId: string | null, rideId: string): slot is RosterSlot {
  if (!slot || !userId) return false;
  return slot.v === 1 && slot.userId === userId && slot.rideId === rideId;
}

// Fail CLOSED: garbage, partial, foreign-version or wrongly-shaped JSON reads as "no slot".
export function parseSlot(json: string | null | undefined): RosterSlot | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    if (typeof v !== 'object' || v === null) return null;
    const s = v as Record<string, unknown>;
    if (s.v !== 1) return null;
    if (typeof s.rideId !== 'string' || !s.rideId) return null;
    if (typeof s.userId !== 'string' || !s.userId) return null;
    if (typeof s.savedAt !== 'string' || Number.isNaN(Date.parse(s.savedAt))) return null;
    if (!(s.lastStatus === null || typeof s.lastStatus === 'string')) return null;
    if (typeof s.myRole !== 'string' || !ROLES.has(s.myRole)) return null;
    if (!Array.isArray(s.rows)) return null;
    const rows: CachedRow[] = [];
    for (const r of s.rows) {
      if (typeof r !== 'object' || r === null) return null;
      const row = r as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.role !== 'string' || !ROLES.has(row.role)) return null;
      const acct = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
      const a = typeof acct === 'object' && acct !== null ? (acct as Record<string, unknown>) : null;
      rows.push({
        id: row.id,
        account_id: typeof row.account_id === 'string' ? row.account_id : null,
        display_name: typeof row.display_name === 'string' ? row.display_name : null,
        phone: typeof row.phone === 'string' ? row.phone : null,
        role: row.role as RideRole,
        rail3_joined_at: typeof row.rail3_joined_at === 'string' ? row.rail3_joined_at : null,
        accounts: a ? { name: typeof a.name === 'string' ? a.name : null, phone: typeof a.phone === 'string' ? a.phone : null } : null,
      });
    }
    return { v: 1, rideId: s.rideId, userId: s.userId, savedAt: s.savedAt, lastStatus: s.lastStatus as string | null, myRole: s.myRole as RideRole, rows };
  } catch {
    return null;
  }
}

// Position data is forbidden in the slot (slate 11). `hasCoordinateKeys` is injected (telemetryPure).
export function assertNoPosition(rows: unknown, hasCoordinateKeys: (v: unknown) => boolean): void {
  if (hasCoordinateKeys(rows)) throw new Error('roster-cache: position data refused');
}

// --- byte helpers: no Buffer, no btoa/atob, no TextEncoder/TextDecoder (Hermes does not guarantee
// TextDecoder; node tests need none of the globals) ------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? '=' : B64[(n >> 6) & 63]) + (c === undefined ? '=' : B64[n & 63]);
  }
  return out;
}
export function base64ToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) throw new Error('bad base64');
  const clean = s.replace(/=+$/, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k += 1) n = (n << 6) | (k < chunk.length ? B64.indexOf(chunk[k]) : 0);
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return new Uint8Array(out);
}
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00); i += 1; }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(out);
}
export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i];
    let cp: number;
    if (x < 0x80) { cp = x; i += 1; }
    else if ((x & 0xe0) === 0xc0) { cp = ((x & 31) << 6) | (b[i + 1] & 63); i += 2; }
    else if ((x & 0xf0) === 0xe0) { cp = ((x & 15) << 12) | ((b[i + 1] & 63) << 6) | (b[i + 2] & 63); i += 3; }
    else { cp = ((x & 7) << 18) | ((b[i + 1] & 63) << 12) | ((b[i + 2] & 63) << 6) | (b[i + 3] & 63); i += 4; }
    if (cp >= 0x10000) { cp -= 0x10000; s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); } else s += String.fromCharCode(cp);
  }
  return s;
}
export const NONCE_BYTES = 12;
export function packEnvelope(nonce: Uint8Array, ct: Uint8Array): string {
  const out = new Uint8Array(nonce.length + ct.length); out.set(nonce, 0); out.set(ct, nonce.length);
  return bytesToBase64(out);
}
export function unpackEnvelope(s: string): { nonce: Uint8Array; ct: Uint8Array } | null {
  try {
    const bytes = base64ToBytes(s);
    if (bytes.length <= NONCE_BYTES) return null;
    return { nonce: bytes.slice(0, NONCE_BYTES), ct: bytes.slice(NONCE_BYTES) };
  } catch {
    return null;
  }
}

// --- the core, with every side effect injected -------------------------------------------------------
export interface Aead {
  seal(key: Uint8Array, nonce: Uint8Array, pt: Uint8Array): Uint8Array;
  open(key: Uint8Array, nonce: Uint8Array, ct: Uint8Array): Uint8Array;
}
export interface KeystoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
export interface CoreDeps {
  storage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void>; removeItem(k: string): Promise<void> };
  // Resolves the keystore; null, or a throw, ⇒ the cache is INERT (fail closed).
  keystore: (() => Promise<KeystoreLike>) | null;
  aead: Aead;
  randomBytes(n: number): Uint8Array;
  hasCoordinateKeys(v: unknown): boolean;
  now(): string;
  log(msg: string): void;
}
export type RosterCacheStatus = 'ready' | 'inert_no_keystore';

export function createRosterCacheCore(deps: CoreDeps) {
  let key: Uint8Array | null = null;
  let keyPromise: Promise<Uint8Array | null> | null = null; // in-flight memo: concurrent first writes share one key
  let inert = false;
  let inertLogged = false;
  let lastWrittenRideId: string | null = null;
  let tombstoned = false; // an auth-transition clear is pending/failed: read nothing until it lands
  let generation = 0; // bumped by every auth-transition clear: an in-flight write for the OLD identity is dropped

  const resolveKey = async (): Promise<Uint8Array | null> => {
    if (inert || !deps.keystore) { markInert(); return null; }
    try {
      const ks = await deps.keystore();
      const existing = await ks.getItemAsync(ROSTER_CACHE_KEY_ALIAS);
      if (existing) {
        const k = base64ToBytes(existing);
        if (k.length === 32) { key = k; return key; }
      }
      const fresh = deps.randomBytes(32);
      await ks.setItemAsync(ROSTER_CACHE_KEY_ALIAS, bytesToBase64(fresh));
      key = fresh;
      return key;
    } catch {
      markInert();
      return null;
    }
  };
  const getKey = (): Promise<Uint8Array | null> => {
    if (key) return Promise.resolve(key);
    if (!keyPromise) {
      keyPromise = resolveKey().finally(() => { keyPromise = null; });
    }
    return keyPromise;
  };
  const markInert = () => {
    inert = true;
    if (!inertLogged) { inertLogged = true; deps.log('roster-cache inert: no keystore'); }
  };

  return {
    async status(): Promise<RosterCacheStatus> {
      return (await getKey()) ? 'ready' : 'inert_no_keystore';
    },
    // Write-through on a successful roster load; the overwrite IS supersession.
    async write(input: Omit<RosterSlot, 'v' | 'savedAt'>): Promise<boolean> {
      try {
        if (!input.rideId || !input.userId) return false;
        assertNoPosition(input.rows, deps.hasCoordinateKeys);
        const gen = generation;
        const k = await getKey();
        if (!k) return false;
        if (gen !== generation) return false; // an auth transition landed while the key resolved: never write A's roster under B
        if (lastWrittenRideId && lastWrittenRideId !== input.rideId) deps.log('roster-cache supersession');
        const slot: RosterSlot = { v: 1, savedAt: deps.now(), ...input };
        const nonce = deps.randomBytes(NONCE_BYTES);
        const blob = packEnvelope(nonce, deps.aead.seal(k, nonce, utf8Encode(JSON.stringify(slot))));
        if (gen !== generation) return false;
        await deps.storage.setItem(ROSTER_CACHE_KEY, blob);
        lastWrittenRideId = input.rideId;
        tombstoned = false;
        return true;
      } catch (e) {
        deps.log(`roster-cache write refused: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    // Read for the ride being viewed, by the user it was written for. Corrupt / tampered / foreign
    // slots are removed and read as null. Never throws.
    async read(rideId: string, userId: string | null): Promise<RosterSlot | null> {
      try {
        if (tombstoned) return null;
        const k = await getKey();
        if (!k) return null;
        const blob = await deps.storage.getItem(ROSTER_CACHE_KEY);
        if (!blob) return null;
        const env = unpackEnvelope(blob);
        const slot = env ? parseSlot(utf8Decode(deps.aead.open(k, env.nonce, env.ct))) : null;
        if (!slot) { await deps.storage.removeItem(ROSTER_CACHE_KEY).catch(() => {}); return null; }
        return slotReadableBy(slot, userId, rideId) ? slot : null;
      } catch {
        await deps.storage.removeItem(ROSTER_CACHE_KEY).catch(() => {});
        return null;
      }
    },
    // 'supersession' | 'auth_transition' ONLY. The auth transition also rotates the key, so even a
    // failed removeItem leaves rider A's ciphertext unreadable to rider B (R3-57).
    async clear(reason: ClearReason): Promise<boolean> {
      let ok = true;
      if (reason === 'auth_transition') tombstoned = true;
      try { await deps.storage.removeItem(ROSTER_CACHE_KEY); } catch { ok = false; }
      if (reason === 'auth_transition') {
        generation += 1;
        key = null;
        keyPromise = null;
        lastWrittenRideId = null;
        if (!deps.keystore) {
          markInert(); // no keystore at all: nothing to rotate, nothing was ever written
        } else if (!inert) {
          // Rotation. A keystore that cannot be RESOLVED (binary without the native module, nothing
          // ever written) is "nothing to rotate" → inert, not a failure; only a resolved keystore
          // whose delete rejects is a real failure (rider A's key would survive).
          let ks: KeystoreLike | null = null;
          try { ks = await deps.keystore(); } catch { markInert(); }
          if (ks) {
            try { await ks.deleteItemAsync(ROSTER_CACHE_KEY_ALIAS); } catch { ok = false; }
          }
        }
      }
      if (ok) tombstoned = false;
      deps.log(`roster-cache clear(${reason}) ${ok ? 'ok' : 'FAILED'}`);
      return ok;
    },
  };
}
