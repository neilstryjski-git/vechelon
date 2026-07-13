// D77 — the one rule that separates "a DIFFERENT person is now using this app" from "the SAME
// person's token was refreshed". Two places depend on it and they must agree by construction,
// not by comment:
//
//   - AuthContext  resets the module-level analytics caches on a CHANGE (never on a refresh)
//   - RootNavigator remounts the whole authed subtree on a CHANGE (never on a refresh)
//
// Getting it wrong in either direction is a real bug, and they are NOT symmetric:
//   - refresh mistaken for a change ⇒ a live ride tears down its foreground service and its
//     channel roughly hourly, mid-ride, for nothing.
//   - change mistaken for a refresh ⇒ the app keeps acting as the PREVIOUS account. That is
//     D77 itself: broadcasting as A while writing B's rows under B's token.
//
// The USER ID is the fact. The supabase auth EVENT name is only a hint — SIGNED_IN fires both
// for a genuinely new user and for a same-user re-auth, so comparing ids is strictly safer than
// trusting the event. Kept free of React Native and supabase imports so `node --test` can load
// it (same posture as resumeDetector.ts).

/** The React key for the authed subtree: a stable id per signed-in account. */
export const SIGNED_OUT_KEY = 'signed-out';

/**
 * True when the signed-in ACCOUNT changed — a swap, a sign-in, or a sign-out.
 * False for a token refresh, which delivers a brand-new session object for the same person.
 */
export function isIdentityChange(prev: string | null, next: string | null): boolean {
  return prev !== next;
}

/**
 * Remount key for the authed subtree. Distinct per account, and constant across the hourly
 * TOKEN_REFRESHED — so React rebuilds the ride tree exactly when the person changes, and never
 * merely because the session object did.
 */
export function identityKey(userId: string | null): string {
  return userId ?? SIGNED_OUT_KEY;
}
