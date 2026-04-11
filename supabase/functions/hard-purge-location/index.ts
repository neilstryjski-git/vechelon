import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 4-hour Hard Purge Logic
    // Nullifies last_lat and last_long for ride_participants
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

    // 2. Nullify location data for all participants in those rides
    const { data: purgedParticipants, error: purgeError } = await supabase
      .from('ride_participants')
      .update({ 
        last_lat: null, 
        last_long: null,
        status: 'purged'
      })
      .in('ride_id', rideIds)
      .neq('status', 'purged') // Don't re-purge already purged records
      .select()

    if (purgeError) throw purgeError

    return new Response(JSON.stringify({ 
      message: `Hard purged location data for ${purgedParticipants?.length ?? 0} participants across ${rideIds.length} rides.`,
      purged_ride_ids: rideIds
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
