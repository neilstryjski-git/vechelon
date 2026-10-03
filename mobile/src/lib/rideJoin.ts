import { supabase } from './supabase';
import type { RideRole } from './roleVisibility';

// W195 — hydrate ride_participants identity from accounts on a mobile self-RSVP so
// the captain roster AND the web Race Control view show a real name, not the generic
// 'Rider' fallback. useRideRoster reads display_name straight off ride_participants,
// so identity must be copied here at insert time.
//
// Identity source is the signed-in user's accounts row (accounts has NO
// display_name column; `name`, `phone`, `email` are the source of truth, verified
// against the prod schema). name + phone are the ride-useful identifiers; email is
// carried too as a better fallback than the generic 'Rider'. Driven off accounts,
// NOT the staging-only W191 tenant auto-join, so the hydration survives promotion.
//
// display_name is stored as `name ?? email` so the email fallback propagates to BOTH
// the captain's roster AND web Race Control without each having to re-implement it
// (the read side keeps a final `?? 'Rider'` only for a truly empty row).
//
// Best-effort: a missing/failed accounts read still inserts the participant row —
// the rider must appear in the fleet even un-named; identity must never block the
// join (Pillar III).
//
// NOTE: populating phone is orthogonal to the RP-16 / D50 PII defect, which governs
// who the RLS lets READ phone (participant_tactical_select over-read) — a separate
// security-lane fix. For the PoC, captain contact-triage wants phone present.
//
// W288 (slate 17): the in-app join is the APP-TRACKED signal — `rail3_joined_at` is stamped on
// this insert and, for rows that already exist (admin-added crew, web RSVP, a rejoin), by
// markRail3Joined() below. Why this column: `joined_at` is NOT NULL DEFAULT now() on every path
// including web, so it says nothing about the app; the engine-start holder (setActiveRide) runs
// only after the background-permission grant, so a rider who denies background would read as
// roster-only while riding with the app open. The signal is "opened the ride in the app", full stop.
export async function selfRsvpWithIdentity(opts: {
  rideId: string;
  accountId: string;
  role: RideRole;
  status?: string;
}): Promise<{ error: unknown }> {
  const { rideId, accountId, role, status = 'rsvpd' } = opts;

  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  try {
    const { data } = await supabase
      .from('accounts')
      .select('name, email, phone')
      .eq('id', accountId) // account_self_select RLS: id = auth.uid()
      .maybeSingle();
    if (data) {
      name = data.name ?? null;
      email = data.email ?? null;
      phone = data.phone ?? null;
    }
  } catch {
    // best-effort — proceed with a nameless row rather than block the join
  }

  const { error } = await supabase.from('ride_participants').insert({
    ride_id: rideId,
    account_id: accountId,
    role,
    status,
    display_name: name ?? email, // email beats 'Rider' as the fallback
    email,
    phone,
    rail3_joined_at: new Date().toISOString(), // W288: app-tracked signal
  });
  return { error };
}

// W288: stamp the app-tracked signal on MY existing participant row (own row under
// participant_update_policy). Idempotent — only a NULL is written, so a rejoin never moves the
// first-open timestamp and a zero-row match is not an error. Best-effort, never blocks the open.
export async function markRail3Joined(rideId: string, accountId: string): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from('ride_participants')
    .update({ rail3_joined_at: new Date().toISOString() })
    .eq('ride_id', rideId)
    .eq('account_id', accountId)
    .is('rail3_joined_at', null);
  return { error };
}
