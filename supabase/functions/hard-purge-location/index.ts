import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 4-hour Hard Purge Logic (Pillar II §5)
    // Nullifies GPS coordinates AND phone number for ride_participants
    // Targets rides that ended more than 4 hours ago
    
    // 1. Find rides that ended > 4 hours ago and haven't been purged (status = 'saved')
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    
    const { data: expiredRides, error: ridesError } = await supabase
      .from('rides')
      .select('id')
      .eq('status', 'saved')
      .lt('actual_end', fourHoursAgo)

    if (ridesError) throw ridesError

    const rideIds = expiredRides?.map(r => r.id) || []

    if (rideIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired rides found for purge.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Nullify location data and phone for all participants in those rides
    // Pillar II §5: phone must be deleted at Expiry + 4h alongside GPS breadcrumbs
    const { data: purgedParticipants, error: purgeError } = await supabase
      .from('ride_participants')
      .update({
        last_lat: null,
        last_long: null,
        last_ping: null, // Rail 3 (W171): clear the location ping timestamp alongside the position
        phone: null,
        status: 'purged'
      })
      .in('ride_id', rideIds)
      .neq('status', 'purged') // Don't re-purge already purged records
      .select()

    if (purgeError) throw purgeError

    // Rail 3 additive purge (W171): delete beacon_alerts and rider_states for the
    // expired rides — full purge, no Dark last-known retention (F-08 pending). DELETE
    // is idempotent (a re-fire deletes 0 rows). ride_summaries and accounts are never
    // touched. Wrapped so a Rail-3-side error (e.g. these tables absent on a project
    // that does not yet have the Rail 3 schema) can NEVER break the web-data purge
    // above — the existing purge behaviour is preserved exactly (isolation principle).
    // supabase-js returns query failures via `error` (it does NOT throw), so we check
    // each delete explicitly and surface failures — a swallowed error would mask a
    // failed privacy purge as success. We log + report but never throw, so a Rail-3-side
    // failure cannot break the web purge that already succeeded above. The try/catch is a
    // belt-and-suspenders for any truly thrown (e.g. network) error.
    const rail3Purged: { beacon_alerts: number; rider_states: number; errors: string[] } = {
      beacon_alerts: 0, rider_states: 0, errors: []
    }
    try {
      const { count: beaconCount, error: beaconErr } = await supabase
        .from('beacon_alerts').delete({ count: 'exact' }).in('ride_id', rideIds)
      if (beaconErr) {
        console.error('[hard-purge] beacon_alerts purge FAILED (web purge unaffected):', beaconErr)
        rail3Purged.errors.push(`beacon_alerts: ${beaconErr.message}`)
      } else {
        rail3Purged.beacon_alerts = beaconCount ?? 0
      }

      const { count: stateCount, error: stateErr } = await supabase
        .from('rider_states').delete({ count: 'exact' }).in('ride_id', rideIds)
      if (stateErr) {
        console.error('[hard-purge] rider_states purge FAILED (web purge unaffected):', stateErr)
        rail3Purged.errors.push(`rider_states: ${stateErr.message}`)
      } else {
        rail3Purged.rider_states = stateCount ?? 0
      }
    } catch (rail3Err) {
      console.error('[hard-purge] Rail 3 purge threw (web purge unaffected):', rail3Err)
      rail3Purged.errors.push(String((rail3Err as Error)?.message ?? rail3Err))
    }

    return new Response(JSON.stringify({
      message: `Hard purged location data for ${purgedParticipants?.length ?? 0} participants across ${rideIds.length} rides.`,
      purged_ride_ids: rideIds,
      rail3_purged: rail3Purged
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
