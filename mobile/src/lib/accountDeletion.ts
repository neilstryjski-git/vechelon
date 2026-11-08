// W300 — in-app account deletion (Google Play User Data policy), as pure dependency-injected
// steps so `node --test` can pin the ORDER and the guards. No react-native / supabase imports.
//
//   guard:   on an active ride → refuse (leave the ride first)
//   delete:  POST delete-account under the session JWT (no body: the server acts only on the
//            verified JWT's uid) → on a refusal or failure STOP, nothing local changes
//   after:   clear the active-ride holder → clear the roster cache → sign out
//
// Why refuse mid-ride: the depart broadcast and last-known null-out need the rider's account and
// JWT (D1). Deletion removes the account, so a rider deleted mid-ride would leave a phantom
// marker on everyone's map. Leaving the ride first runs the normal departure.
//
// Why sign out with a local fallback: deleting the auth user already revokes every session
// server-side. supabase.auth.signOut() (global, Pattern 4) then normally just clears the device;
// if that call fails (offline, or the server rejects a session it no longer has), the local
// clear is still correct, because no server session survives to re-authenticate the device.

// The copy follows the "AS BUILT" retention list on W299. Promise nothing the server keeps.
export const DELETION_EXPLANATION: readonly string[] = [
  'Your sign-in, profile, photo and club memberships.',
  'Your name, email, phone and last position on rides you joined. Those rides show "Deleted rider" instead.',
  'Your beacon alerts, ride status and any phone invite you joined from.',
];
export const DELETION_RETAINED: readonly string[] = [
  'Rides and routes you created stay with your club, credited to "Former member".',
  'Anonymous usage statistics stay, but can no longer be linked to you.',
];

export const DELETE_CONFIRM_WORD = 'DELETE';

// Second deliberate confirmation: the rider types the word. Case and surrounding spaces are
// forgiven; anything else is not.
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRM_WORD;
}

export type DeleteResponse =
  | { ok: true }
  | { ok: false; status?: number; error?: string; message?: string };

export type DeletionOutcome =
  | { ok: true }
  | { ok: false; reason: 'active_ride' | 'last_admin' | 'platform_admin' | 'failed'; message: string };

export type DeletionStep = 'blocked_active_ride' | 'delete_called' | 'delete_refused' | 'clear_active' | 'clear_roster_cache' | 'sign_out' | 'sign_out_local';

export type DeletionDeps = {
  hasActiveRide: () => boolean;
  invokeDelete: () => Promise<DeleteResponse>;
  clearActive: () => void;
  clearRosterCache: () => void;
  signOut: () => Promise<{ error?: unknown } | void>;
  signOutLocal: () => Promise<unknown>;
};

const GENERIC_FAILURE = 'Your account could not be deleted. Nothing was removed. Please try again.';

export async function runAccountDeletion(
  deps: DeletionDeps,
): Promise<{ outcome: DeletionOutcome; steps: DeletionStep[] }> {
  const steps: DeletionStep[] = [];

  if (deps.hasActiveRide()) {
    steps.push('blocked_active_ride');
    return {
      outcome: { ok: false, reason: 'active_ride', message: 'Leave your ride first, then delete your account.' },
      steps,
    };
  }

  steps.push('delete_called');
  let res: DeleteResponse;
  try {
    res = await deps.invokeDelete();
  } catch {
    res = { ok: false };
  }
  if (!res.ok) {
    steps.push('delete_refused');
    const reason = res.error === 'last_admin' || res.error === 'platform_admin' ? res.error : 'failed';
    // The server's refusal text names only the caller's own clubs; show it for the two known
    // refusals, never a raw error for anything else.
    const message = reason === 'failed' ? GENERIC_FAILURE : res.message || GENERIC_FAILURE;
    return { outcome: { ok: false, reason, message }, steps };
  }

  deps.clearActive();
  steps.push('clear_active');
  deps.clearRosterCache();
  steps.push('clear_roster_cache');

  let signedOut = false;
  try {
    const r = await deps.signOut();
    signedOut = !(r && (r as { error?: unknown }).error);
  } catch {
    signedOut = false;
  }
  steps.push('sign_out');
  if (!signedOut) {
    try {
      await deps.signOutLocal();
    } catch {
      // Nothing left to try; the server has no session for this user any more.
    }
    steps.push('sign_out_local');
  }
  return { outcome: { ok: true }, steps };
}
