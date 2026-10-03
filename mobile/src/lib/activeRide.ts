// D87 — active-ride holder for departure-on-sign-out.
//
// Sign-out happens from HomeScreen, by which point the ride map (and its
// useFleetPositions) is usually already unmounted — so the ride context is gone from
// React state. This module-level holder remembers the LAST ride the rider was tracking so
// AuthContext.signOut can broadcast a departure for it BEFORE the session (and its JWT) is
// revoked. Set when tracking starts; deliberately NOT cleared on unmount (it must survive
// navigating Home → Sign Out); overwritten when the next ride starts. Firing a departure for
// the last-tracked ride on sign-out is always correct — signing out IS leaving that ride —
// and is harmless if the rider had already left it (a redundant broadcast + a no-op clear).
//
// W281 (R3-57): ALSO cleared on every user-id delta in AuthContext's auth transition, so an
// account swap that never went through signOut() (SIGNED_IN as B, server-side expiry) cannot
// hand A's binding to B. Never cleared on a token refresh.

//
// W286 (B1 device-side, R3-67): a DURABLE copy lives in AsyncStorage under ACTIVE_RIDE_KEY so the
// Android headless task and the heartbeat re-assert can read the "engine session" without React.
// It is cleared on every DEPARTURE — Leave Ride (RideMapScreen beforeRemove), sign-out, account
// swap — so no recovery mechanism can re-engage a departed session. It is NOT cleared by the
// engine effect's cleanup (a D77 remount or a backgroundReady flip is not a departure). The
// in-memory holder keeps its D87 job unchanged: it survives unmount for the sign-out departure.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { ACTIVE_RIDE_KEY, parsePersistedRide, serializePersistedRide } from './headlessLogic';

export interface ActiveRide {
  rideId: string;
  riderId: string;
}

let active: ActiveRide | null = null;

export function setActiveRide(v: ActiveRide): void {
  active = v;
  void AsyncStorage.setItem(ACTIVE_RIDE_KEY, serializePersistedRide(v)).catch(() => {});
}

export function getActiveRide(): ActiveRide | null {
  return active;
}

// Clears BOTH holders (sign-out / identity delta path).
export function clearActiveRide(): void {
  active = null;
  clearPersistedActiveRide();
}

// Clears the DURABLE holder only — the Leave Ride path. The in-memory holder stays so a later
// sign-out can still depart the last-tracked ride (D87; a redundant departure is harmless).
export function clearPersistedActiveRide(): void {
  void AsyncStorage.removeItem(ACTIVE_RIDE_KEY).catch(() => {});
}

// For non-React callers (headless task, heartbeat re-assert). Never throws; fails CLOSED.
export async function readPersistedActiveRide(): Promise<ActiveRide | null> {
  try {
    return parsePersistedRide(await AsyncStorage.getItem(ACTIVE_RIDE_KEY));
  } catch {
    return null;
  }
}
