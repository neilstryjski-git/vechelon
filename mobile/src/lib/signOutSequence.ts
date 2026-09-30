// W281 — the sign-out and identity-transition sequences as pure, dependency-injected steps
// (Ledger §8.4 R3-58, §8.2 D1; Pillar III R3-56/57/58). Kept free of react-native and supabase
// imports so `node --test` can pin the ORDER, which is the load-bearing part:
//
//   sign-out:   departure (bounded wait) → clear active-ride holder → supabase.auth.signOut()
//   transition: [user-id changed] reset measure identity → clear holder → clear roster cache
//
// Why the order matters (D1): the departure broadcast and the last-known null-out both need the
// outgoing rider's still-valid JWT. Tear the session down first and the departure has no
// credentials — that is the phantom participant D1 was ruled to close. Fire-and-forget means
// "sign-out does not wait for acknowledgement", NOT "issue it after the session is gone": the
// call is ISSUED before signOut and sign-out proceeds after a bounded window whether or not the
// network answered. A bare `void departure()` would race the token revoke and usually lose.

export type ActiveBinding = { rideId: string; riderId: string };

export type SignOutStep =
  | 'departure_issued'
  | 'departure_done'
  | 'departure_timed_out'
  | 'departure_failed'
  | 'no_active_ride'
  | 'clear_active'
  | 'sign_out';

export type SignOutDeps = {
  getActive: () => ActiveBinding | null;
  // Issues the depart broadcast + last-known null-out under the current JWT. Never expected to
  // throw, but a rejection is tolerated and never blocks sign-out.
  departure: (rideId: string, riderId: string) => Promise<unknown>;
  clearActive: () => void;
  signOut: () => Promise<unknown>;
  // How long sign-out waits for the departure before proceeding anyway. The departure keeps
  // running in the background; only the WAIT is bounded.
  departureTimeoutMs?: number;
  // Injected for tests; default to the platform timers.
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
};

export const DEFAULT_DEPARTURE_TIMEOUT_MS = 3000;

// Runs the sign-out sequence and returns the steps taken, in order (the evidence trail).
// `signOut` rejections propagate exactly as a direct `await supabase.auth.signOut()` would.
export async function runSignOutSequence(deps: SignOutDeps): Promise<SignOutStep[]> {
  const steps: SignOutStep[] = [];
  const active = deps.getActive();
  if (!active) {
    steps.push('no_active_ride');
  } else {
    steps.push('departure_issued');
    const timeoutMs = deps.departureTimeoutMs ?? DEFAULT_DEPARTURE_TIMEOUT_MS;
    const setT = deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    const clearT = deps.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    let handle: unknown;
    const timeout = new Promise<'timeout'>((resolve) => {
      handle = setT(() => resolve('timeout'), timeoutMs);
    });
    try {
      const outcome = await Promise.race([
        deps.departure(active.rideId, active.riderId).then(() => 'done' as const),
        timeout,
      ]);
      steps.push(outcome === 'timeout' ? 'departure_timed_out' : 'departure_done');
    } catch {
      steps.push('departure_failed');
    } finally {
      clearT(handle);
    }
    // After the departure has been issued — never before (D1), and regardless of its outcome,
    // so a later sign-out cannot re-depart a ride we already left.
    deps.clearActive();
    steps.push('clear_active');
  }
  await deps.signOut();
  steps.push('sign_out');
  return steps;
}

export type IdentityTransitionStep = 'reset_measure' | 'clear_active' | 'clear_roster_cache';

export type IdentityTransitionDeps = {
  resetMeasure: (userChanged: boolean) => void;
  clearActive: () => void;
  clearRosterCache: () => void;
};

// The auth-transition half. Runs on EVERY auth event (resetMeasure decides internally what a
// refresh means), but the holder and the roster cache clear ONLY on a user-id delta — a token
// refresh (~hourly, mid-ride) must never touch them. Ordering: this runs after signOut's
// departure by construction (signOut awaits the departure window before revoking the session,
// and the SIGNED_OUT event that lands here is emitted by that revoke). On a swap that bypasses
// signOut (SIGNED_IN as B, or a server-side expiry) the outgoing JWT is already gone, so no
// departure CAN be sent — clearing the holder here is what stops B inheriting A's binding
// (R3-57); A's roster row is then reconciled server-side (staleness detector, later sprint).
export function runIdentityTransition(
  userChanged: boolean,
  deps: IdentityTransitionDeps,
): IdentityTransitionStep[] {
  const steps: IdentityTransitionStep[] = [];
  deps.resetMeasure(userChanged);
  steps.push('reset_measure');
  if (userChanged) {
    deps.clearActive();
    steps.push('clear_active');
    deps.clearRosterCache();
    steps.push('clear_roster_cache');
  }
  return steps;
}
