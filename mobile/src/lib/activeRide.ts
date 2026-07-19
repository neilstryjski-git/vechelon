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

export interface ActiveRide {
  rideId: string;
  riderId: string;
}

let active: ActiveRide | null = null;

export function setActiveRide(v: ActiveRide): void {
  active = v;
}

export function getActiveRide(): ActiveRide | null {
  return active;
}

export function clearActiveRide(): void {
  active = null;
}
