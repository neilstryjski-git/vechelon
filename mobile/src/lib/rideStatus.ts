// W287 — the ONE persisted-ride-status read, shared by the foreground watch (useRideEndWatch),
// the in-process heartbeat (bgGeo) and the Android headless task. Throws on a transport / query
// error OR on a hung request (deadline below) so readStatusWithRetry can retry and the callers'
// single-flight guards are always released; a missing row (RLS-hidden, stale JWT) resolves null,
// which the callers treat as "not an affirmative read" (A2) — never as Saved.

import { supabase } from './supabase';
import { withTimeout } from './engineFirstFix';

export const RIDE_STATUS_READ_TIMEOUT_MS = 8000;

const TIMED_OUT = Symbol('ride-status-timeout');

export async function fetchRideStatus(rideId: string): Promise<string | null> {
  // withTimeout maps a rejection to the fallback too, so capture the real error to rethrow it
  // (a retry attempt should carry its true reason, not "timed out").
  let failure: unknown = null;
  const result = await withTimeout<string | null | typeof TIMED_OUT>(
    async () => {
      try {
        const { data, error } = await supabase.from('rides').select('status').eq('id', rideId).maybeSingle();
        if (error) throw new Error(error.message);
        return (data?.status as string | undefined) ?? null;
      } catch (e) {
        failure = e;
        return TIMED_OUT;
      }
    },
    RIDE_STATUS_READ_TIMEOUT_MS,
    TIMED_OUT,
  );
  if (result === TIMED_OUT) throw failure instanceof Error ? failure : new Error('ride status read timed out');
  return result;
}
