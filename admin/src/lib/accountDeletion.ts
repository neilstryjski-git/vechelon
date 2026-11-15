// W301 — web account deletion (Google Play User Data policy: deletion must be possible without
// the app). Same server path as the app's W300 flow: POST delete-account under the session JWT,
// no body (the server acts only on the verified JWT's uid), then a global sign-out.
//
// The copy follows the "AS BUILT" retention list on W299 and is word-for-word the app's
// (mobile/src/lib/accountDeletion.ts on rail3-integration) and the public page
// (delete-account.html at the repo root, copied into the build — a test pins it to these lists). Promise nothing the
// server keeps.
//
// No active-ride guard here, unlike the app: the web portal never runs the ride engine, so it
// holds no ride state to tear down. A rider deleting from the web while the app is on a ride is
// the case the Sr PM accepted on W300 (deletion is a deliberate act).

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

export type UserCheck = 'gone' | 'present' | 'session' | 'unknown';

// Only GoTrue's user_not_found means the account is gone (verified on staging 2026-11-08:
// deleted user → 403 user_not_found; revoked session → 400; garbage JWT → 403 bad_jwt).
// A bare status code never does.
export function classifyUserCheck(r: { hasUser: boolean; status?: number | null; code?: string | null }): UserCheck {
  if (r.hasUser) return 'present';
  if (r.code === 'user_not_found') return 'gone';
  if (r.code === 'bad_jwt' || r.code === 'session_not_found' || r.code === 'session_expired' || r.status === 400 || r.status === 401 || r.status === 403) {
    return 'session';
  }
  return 'unknown';
}

export type WebDeletionOutcome =
  | { ok: true; signedOut: boolean }
  | { ok: false; reason: 'last_admin' | 'platform_admin' | 'failed' | 'session'; message: string };

export type WebDeletionStep = 'delete_called' | 'delete_refused' | 'delete_failed' | 'account_gone' | 'sign_out' | 'sign_out_local';

export type WebDeletionDeps = {
  invokeDelete: () => Promise<DeleteResponse>;
  checkUser: () => Promise<UserCheck>;
  signOut: () => Promise<{ error?: unknown } | void>;
  signOutLocal: () => Promise<unknown>;
};

// Not "nothing was removed": the server can fail part-way. A retry finishes the job (every
// server step is idempotent).
export const GENERIC_FAILURE = 'Your account deletion didn’t finish. Please try again.';
// The session died, which says nothing about the account; never imply it was deleted.
export const SESSION_EXPIRED = 'Your sign-in has expired, so your account was not deleted. Sign out, sign in again, then try again.';

export async function runWebAccountDeletion(
  deps: WebDeletionDeps,
): Promise<{ outcome: WebDeletionOutcome; steps: WebDeletionStep[] }> {
  const steps: WebDeletionStep[] = ['delete_called'];
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
    if (check === 'session') return { outcome: { ok: false, reason: 'session', message: SESSION_EXPIRED }, steps };
    if (check !== 'gone') return { outcome: { ok: false, reason: 'failed', message: GENERIC_FAILURE }, steps };
    // The account is gone even though the call looked like a failure (dropped response).
    steps.push('account_gone');
  }

  // Pattern 4: global sign-out. Deleting the auth user already revoked every session, so if the
  // global call fails, a local clear is still correct.
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
