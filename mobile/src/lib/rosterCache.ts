// W289 — single-slot offline roster cache, I/O binding (Ledger slate 11, D1, §9.2 #2, §14 item 13;
// Pillar III R3-58, R3-57). The core and every rule live in ./rosterCachePure.ts (node-tested).
//
// STORAGE LLD (cost stated to the Senior PM 2026-10-03): the roster (contact fields included) is
// AES-256-GCM ciphertext in AsyncStorage under `rail3:roster-cache`; the 256-bit key is generated once
// per install and held in expo-secure-store (Android Keystore-backed) — the KEY, not the roster, lives
// there because SecureStore values are limited to ~2 KB. AES via @noble/ciphers (pure JS, Hermes-safe,
// never the webcrypto wrapper — D52: Hermes has no Web Crypto); random bytes via expo-crypto.
//
// LAUNCH SAFETY: AuthContext imports this module at launch, so AsyncStorage / expo-crypto / @noble
// are the only top-level imports (all launch-safe JS). expo-secure-store is a NEW native module whose
// JS calls requireNativeModule at eval, so it is required LAZILY inside try/catch: a binary that lacks
// it (the current field build — `runtimeVersion` is fixed, so an OTA carrying this code reaches it)
// runs the cache INERT: fail closed, nothing persisted, the roster behaves as before. It activates in
// the next build that includes the module.
//
// CLEAR CONTRACT: 'supersession' (overwrite on a successful load for another ride) and
// 'auth_transition' (AuthContext.runIdentityTransition on a user-id delta — AFTER the departure,
// never before, R3-58; also rotates the key). Nothing else; departure does NOT clear (§9.2 #2); no TTL.
// `clearRosterCache` keeps the SYNC `() => void` signature the W281 sequence depends on.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';

import { hasCoordinateKeys } from './telemetryPure';
import { createRosterCacheCore, type ClearReason, type KeystoreLike, type RosterSlot, type RosterCacheStatus } from './rosterCachePure';

export type { RosterSlot, CachedRow, ClearReason } from './rosterCachePure';

const core = createRosterCacheCore({
  storage: {
    getItem: (k) => AsyncStorage.getItem(k),
    setItem: (k, v) => AsyncStorage.setItem(k, v),
    removeItem: (k) => AsyncStorage.removeItem(k),
  },
  keystore: async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SS = require('expo-secure-store') as KeystoreLike & { isAvailableAsync?: () => Promise<boolean> };
    if (typeof SS.getItemAsync !== 'function') throw new Error('expo-secure-store missing');
    if (SS.isAvailableAsync && !(await SS.isAvailableAsync())) throw new Error('secure store unavailable');
    return SS;
  },
  aead: {
    seal: (k, n, pt) => gcm(k, n).encrypt(pt),
    open: (k, n, ct) => gcm(k, n).decrypt(ct),
  },
  randomBytes: (n) => Crypto.getRandomBytes(n),
  hasCoordinateKeys,
  now: () => new Date().toISOString(),
  log: (msg) => console.warn(`[Rail3][rosterCache] ${msg}`),
});

export function writeRosterCache(slot: Omit<RosterSlot, 'v' | 'savedAt'>): Promise<boolean> {
  return core.write(slot);
}

export function readRosterCache(rideId: string, userId: string | null): Promise<RosterSlot | null> {
  return core.read(rideId, userId);
}

export function getRosterCacheStatus(): Promise<RosterCacheStatus> {
  return core.status();
}

// Sync by contract; bounded retry (0 / 500 ms / 2 s) so a transient storage failure cannot leave
// another rider's contacts on the device. Reads stay tombstoned until a clear succeeds.
export function clearRosterCache(reason: ClearReason = 'auth_transition'): void {
  void (async () => {
    const delays = [0, 500, 2000];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
      if (await core.clear(reason)) return;
    }
  })();
}
