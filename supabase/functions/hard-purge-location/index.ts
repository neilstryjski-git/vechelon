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
        phone: null,
        status: 'purged'
      })
      .in('ride_id', rideIds)
      .neq('status', 'purged') // Don't re-purge already purged records
      .select()

    if (purgeError) throw purgeError

    // 3. W284 — telemetry retention (Ledger §8.5). Full-capture rows are personal-data class:
    //    DELETE at T+4h. Always-on counters SURVIVE with identity stripped: account_id -> NULL,
    //    keyed to ride / platform / device class. Both are idempotent (filters exclude already-
    //    purged rows) because the ride selection above re-selects 'saved' rides on every run.
    //    Errors are logged, not thrown: the participant purge above must never be reverted by
    //    a telemetry failure (e.g. 42P01 before the W284 migration is pushed).
    const telemetry = { full_capture_deleted: 0, always_on_stripped: 0, error: null as string | null }
    try {
      const { data: deleted, error: delErr } = await supabase
        .from('rail3_telemetry_events')
        .delete()
        .in('ride_id', rideIds)
        .eq('tier', 'full_capture')
        .select('id')
      if (delErr) throw delErr
      telemetry.full_capture_deleted = deleted?.length ?? 0

      const { data: stripped, error: stripErr } = await supabase
        .from('rail3_telemetry_events')
        .update({ account_id: null })
        .in('ride_id', rideIds)
        .eq('tier', 'always_on')
        .not('account_id', 'is', null)
        .select('id')
      if (stripErr) throw stripErr
      telemetry.always_on_stripped = stripped?.length ?? 0

      // A purged ride can never remain the full-capture target (belt and braces to the FK's
      // ON DELETE SET NULL, which only fires on ride deletion).
      const { error: cfgErr } = await supabase
        .from('rail3_operator_config')
        .update({ full_capture_ride_id: null })
        .in('full_capture_ride_id', rideIds)
      if (cfgErr) throw cfgErr
    } catch (e) {
      telemetry.error = (e as { message?: string })?.message ?? String(e)
      console.error('[hard-purge] telemetry retention step failed', telemetry.error)
    }

    return new Response(JSON.stringify({ 
      message: `Hard purged location data for ${purgedParticipants?.length ?? 0} participants across ${rideIds.length} rides.`,
      purged_ride_ids: rideIds,
      telemetry
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
