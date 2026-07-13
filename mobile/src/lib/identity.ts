import { supabase } from './supabase';
import { logMeasurement } from './measure';

// D77 — THE IDENTITY INVARIANT.
//
// The app acts as the account that is LOGGED IN, and as nothing else. There is no device
// identity and no device→account mapping; the account is the sole identity.
//
// Before D77 the ride layer took ONE snapshot of the user id at screen mount and threaded it
// as a value into every broadcast, DB write, role gate and beacon — while three call sites
// (this broadcast's JWT, the last-known write, the channel subscribe) read the session LIVE.
// After a sign-out/sign-in with no app restart the two disagreed, and the app acted as TWO
// users in the same tick: broadcasting as rider A while writing rider B's row under B's token.
// That is fabricated data carrying a VALID signature — the server is architecturally unable to
// reject it, because the token really is B's.
//
// The structural fix is upstream: identity now flows from the live session (AuthContext), and
// the authed subtree REMOUNTS when the user changes (RootNavigator), so every hook re-derives
// against the new user. This module is the backstop. It is the one place where a CLAIMED
// identity is checked against the session that will actually sign the request, so a future
// regression surfaces as a logged, refused write instead of silently corrupting the fleet.

/** The user id of the CURRENT session — never a snapshot. Null when signed out. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * True when `claimed` is the current session's user.
 *
 * On a mismatch it writes an 'identity_mismatch' row to the sink (account uuids only — never
 * coordinates, per Pillar II §2) so the corruption is visible REMOTELY rather than inferred
 * from strange field behaviour, and returns false.
 *
 * Callers decide what false MEANS, and they deliberately differ:
 *   - a position broadcast REFUSES — a wrong-identity ping corrupts every receiver's fleet,
 *     and dropping one costs nothing (the next fix is seconds away).
 *   - the SOS beacon SENDS ANYWAY and only records the mismatch — a suppressed beacon is a
 *     SAFETY failure, a mis-attributed one is merely a data failure. An alert must never be
 *     blocked by a consistency check.
 *
 * Pass `sessionUserId` when the caller already holds the session, to avoid a second read.
 */
export async function isCurrentIdentity(
  claimed: string | null,
  rideId: string,
  where: 'broadcast' | 'beacon',
  sessionUserId?: string | null,
): Promise<boolean> {
  const uid = sessionUserId !== undefined ? sessionUserId : await currentUserId();
  if (uid && claimed && uid === claimed) return true;
  void logMeasurement({
    rideId,
    kind: 'identity_mismatch',
    payload: { where, claimed, session: uid },
  });
  return false;
}
