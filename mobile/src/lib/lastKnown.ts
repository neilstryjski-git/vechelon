// W282 (Ledger A4) — the ONE write path for MY ride_participants row.
//
// Persist MY last-known position (and, on a beacon raise, the beacon_active flag) to
// ride_participants — the fleet's FALLBACK when live pings stop (a rider goes quiet on stop /
// screen-lock / dead-zone). Shared by the periodic throttle (onLocation), the SDK stop
// transition (onMotionChange) and the Support Beacon raise (W282: the raise forces a fresh
// last-known in the SAME operation as the flag, so the alert always has a position to anchor).
//
// ONE overwritten row per rider — the last place we knew you were — not a coordinate trail, so
// within the Pillar II §2 last-known exception. No coordinates are ever logged (ids/ok only).
//
// SCOPE TO MY ROW EXPLICITLY: participant_update_policy also lets a Captain/SAG update anyone
// (that is how they clear another rider's beacon flag), so an unscoped update from a Captain
// would clobber the whole fleet's last position. RLS already permits account_id = auth.uid() —
// pure client write, no migration (W261/W266/W282).
//
// D77: `uid` is read from the LIVE session — the broadcast beside it used to carry a MOUNT-TIME
// snapshot, so after an account swap the same GPS fix went out as rider A while landing in
// rider B's row. Both sides now resolve to the live session, so they agree by construction.

import { supabase } from './supabase';
import { logMeasurement } from './measure';

export type LastKnownTrigger = 'stop' | 'throttle' | 'beacon' | 'headless';

// A4 CADENCE BOUND — declared HERE and nowhere else (W283, Ledger A4 / §14 item 21).
// How often EVERY device overwrites its last-known position while actively riding (W266). The
// SDK stop transition also writes it, but on real rides stopTimeout rarely fires, so without
// this periodic write the fallback is stale at ride-start. Proposed value 60 s, bounded
// [30 s, 120 s] — see docs/rail3/decision_briefs/a4_last_known_cadence_decision_brief.md:
//   • ceiling for privacy: never more often than the live ping cadence the fleet already
//     receives (30 s Stopped/Inactive ping interval), so the server-held row is never a second,
//     denser tracking channel — and it is ONE overwritten row, never a trail;
//   • floor for fallback quality: never less often than the 2-minute Stopped threshold, so a
//     rider who goes quiet is rendered where they were within one state rung (R3-62).
// The stop transition resets this clock (a stop write counts as a periodic write); the beacon
// raise (W282) writes the same row and does not reset it; departure nulls the row.
// Confirmed value lands in Pillar IV §12.2 by the TPM — the Hands never edit a Pillar.
export const LAST_KNOWN_WRITE_INTERVAL_MS = 60_000;

// The only columns this path may touch on MY row. Cancel-side flag clears for ANOTHER rider's
// row live in useBeacons (double-scoped by ride_id + that rider's account_id), never here.
export interface ParticipantSelfPatch {
  last_lat?: number;
  last_long?: number;
  last_ping?: string;
  beacon_active?: boolean;
}

// Returns whether the write succeeded. Never throws. `retries` = extra attempts after the first.
export async function persistMyParticipantPatch(
  rideId: string,
  patch: ParticipantSelfPatch,
  trigger: LastKnownTrigger,
  retries = 0,
): Promise<boolean> {
  let err: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return false;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const { error } = await supabase
        .from('ride_participants')
        .update(patch)
        .eq('ride_id', rideId)
        .eq('account_id', uid);
      err = error?.message ?? null;
      if (!error) break;
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  void logMeasurement({
    rideId,
    kind: 'last_position_write',
    payload: { ok: !err, trigger, fields: Object.keys(patch).sort(), ...(err ? { err } : {}) },
  });
  return !err;
}

export async function persistLastKnown(
  rideId: string,
  lat: number,
  lng: number,
  ts: number,
  trigger: LastKnownTrigger,
  extra: ParticipantSelfPatch = {},
): Promise<boolean> {
  return persistMyParticipantPatch(
    rideId,
    { last_lat: lat, last_long: lng, last_ping: new Date(ts).toISOString(), ...extra },
    trigger,
  );
}
