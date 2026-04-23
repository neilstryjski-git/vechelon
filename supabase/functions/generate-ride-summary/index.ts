import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAIProvider } from '../_shared/ai-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { rideId } = await req.json();

    // 1. Fetch Ride Metadata & Tenant Config
    const { data: ride, error: rideError } = await supabaseClient
      .from('rides')
      .select('*, tenants!inner(*)')
      .eq('id', rideId)
      .single();

    if (rideError) throw rideError;

    // 2. Fetch Participant Count & Stats
    const { count: participantCount } = await supabaseClient
      .from('ride_participants')
      .select('*', { count: 'exact', head: true })
      .eq('ride_id', rideId);

    // 3. Fetch Weather from Open-Meteo (at finish_coords)
    let weatherData = {};
    if (ride.finish_coords) {
      // Point type is typically "(long,lat)" in postgis, but we store as standard Point
      // Extracting from standard PostGIS point string format if necessary, 
      // but assuming we passed them as lat/long in the request or they are readable.
      try {
        const [lng, lat] = ride.finish_coords.replace(/[()]/g, '').split(',');
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat.trim()}&longitude=${lng.trim()}&current_weather=true`
        );
        weatherData = await weatherRes.json();
      } catch (e) {
        console.warn('Weather fetch failed', e);
      }
    }

    // 4. Construct AI Prompt
    const prompt = `
      You are an elite cycling tour director. Write a professional, punchy summary for a WhatsApp group post.
      Club: ${ride.tenants.name}
      Ride: ${ride.title}
      Participants: ${participantCount}
      Weather: ${JSON.stringify(weatherData.current_weather || 'Clear')}
      Instructions: Use 3 bullet points. Include one tactical observation. End with "See you next time."
    `;

    // 5. Generate Summary using Provider Factory
    const provider = getAIProvider(ride.tenants);
    const summary = await provider.generateSummary(prompt);

    // 6. Persist to ride_summaries
    const { error: summaryError } = await supabaseClient
      .from('ride_summaries')
      .upsert({
        ride_id: rideId,
        post_ride_summary: summary,
        weather_data: weatherData,
        generated_at: new Date().toISOString()
      });

    if (summaryError) throw summaryError;

    return new Response(JSON.stringify({ summary, weather: weatherData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
