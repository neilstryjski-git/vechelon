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
  });
  return { error };
}
