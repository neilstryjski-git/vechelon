// W300 — in-app account deletion (Google Play User Data policy), as pure dependency-injected
// steps so `node --test` can pin the ORDER and the guards. No react-native / supabase imports.
//
//   guard:   on an active ride (the DURABLE holder, W286) → refuse (leave the ride first)
//   delete:  POST delete-account under the session JWT (no body: the server acts only on the
//            verified JWT's uid) → on a refusal STOP, nothing local changes; on a failure,
//            ask the server whether the account is already gone (the server isn't atomic, and
//            a dropped response can hide a success) and finish locally if so
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
  'Your name, email, phone and last position on rides you joined with this account or this email address. Those rides show "Deleted rider" instead.',
  'Your beacon alerts, ride status and any phone invite you joined from.',
];
export const DELETION_RETAINED: readonly string[] = [
  'Rides and routes you created, and rides you were assigned to support, stay with your club, credited to "Former member".',
  'Guest sign-ups made under a different email address, and never linked to this account, stay as they are.',
  'Anonymous usage statistics stay, but can no longer be linked to you.',
  'Our sign-in provider’s logs may keep your email address for about a day.',
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
  // signedOut=false: the account is gone but the device couldn't clear its session.
  | { ok: true; signedOut: boolean }
  | { ok: false; reason: 'active_ride' | 'last_admin' | 'platform_admin' | 'failed' | 'session'; message: string };

// What the auth server says about this device's session after a failed delete call.
//   gone     — the user no longer exists (GoTrue code user_not_found): the delete went through
//   present  — the user is still there: the delete really failed
//   session  — the SESSION is dead (revoked, expired, bad token) but says nothing about the
//              account: GoTrue returns 400/403 bad_jwt/session_not_found for these
//   unknown  — offline or anything else
export type UserCheck = 'gone' | 'present' | 'session' | 'unknown';

// Pure, so the classification is pinned by tests. Only user_not_found (verified on staging
// 2026-11-08: deleted user → 403 user_not_found; revoked session → 400; garbage JWT → 403
// bad_jwt) counts as gone. A bare status code never does.
export function classifyUserCheck(r: { hasUser: boolean; status?: number | null; code?: string | null }): UserCheck {
  if (r.hasUser) return 'present';
  if (r.code === 'user_not_found') return 'gone';
  if (r.code === 'bad_jwt' || r.code === 'session_not_found' || r.code === 'session_expired' || r.status === 400 || r.status === 401 || r.status === 403) {
    return 'session';
  }
  return 'unknown';
}

export type DeletionStep = 'blocked_active_ride' | 'delete_called' | 'delete_refused' | 'delete_failed' | 'account_gone' | 'clear_active' | 'clear_roster_cache' | 'sign_out' | 'sign_out_local';

export type DeletionDeps = {
  hasActiveRide: () => boolean | Promise<boolean>;
  invokeDelete: () => Promise<DeleteResponse>;
  // After a failed call: what the auth server says about this session (classifyUserCheck).
  checkUser: () => Promise<UserCheck>;
  clearActive: () => void;
  clearRosterCache: () => void;
  signOut: () => Promise<{ error?: unknown } | void>;
  signOutLocal: () => Promise<unknown>;
};

// Not "nothing was removed": the server can fail part-way. A retry finishes the job (every
// server step is idempotent).
const GENERIC_FAILURE = 'Your account deletion didn’t finish. Please try again.';
// The session died, which says nothing about the account; never imply it was deleted.
const SESSION_EXPIRED = 'Your sign-in has expired, so your account was not deleted. Sign out, sign in again, then try again.';

export async function runAccountDeletion(
  deps: DeletionDeps,
): Promise<{ outcome: DeletionOutcome; steps: DeletionStep[] }> {
  const steps: DeletionStep[] = [];

  let onRide = true; // fail closed if the holder can't be read
  try {
    onRide = await deps.hasActiveRide();
  } catch {
    onRide = true;
  }
  if (onRide) {
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
    if (res.error === 'last_admin' || res.error === 'platform_admin') {
      steps.push('delete_refused');
      // The server's refusal text names only the caller's own clubs.
      return { outcome: { ok: false, reason: res.error, message: res.message || GENERIC_FAILURE }, steps };
    }
    steps.push('delete_failed');
    let check: UserCheck = 'unknown';
    try {
      check = await deps.checkUser();
    } catch {
      check = 'unknown';
    }
    if (check === 'session') {
      return { outcome: { ok: false, reason: 'session', message: SESSION_EXPIRED }, steps };
    }
    if (check !== 'gone') {
      return { outcome: { ok: false, reason: 'failed', message: GENERIC_FAILURE }, steps };
    }
    steps.push('account_gone');
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
      const r = await deps.signOutLocal();
      signedOut = !(r && (r as { error?: unknown }).error);
    } catch {
      signedOut = false;
    }
    steps.push('sign_out_local');
  }
  return { outcome: { ok: true, signedOut }, steps };
}
