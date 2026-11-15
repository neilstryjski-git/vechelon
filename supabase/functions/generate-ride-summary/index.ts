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

  // D97 r2: caller must be signed in and allowed to end this ride — the effective rides UPDATE
  // gate (ride_admin_modify AND restrictive rides_tenant_scope_update): a club admin, or the
  // ride's creator while still affiliated with the club.
  // Without this, anyone holding the public anon key could spend a club's AI credits and
  // overwrite its ride summaries.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Not signed in' }, 401);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const rideId = typeof body?.rideId === 'string' ? body.rideId : '';
    if (!rideId) return json({ error: 'rideId is required' }, 400);

    // 1. Fetch Ride Metadata & Tenant Config
    const { data: ride, error: rideError } = await supabaseClient
      .from('rides')
      .select('*, tenants!inner(*)')
      .eq('id', rideId)
      .maybeSingle();

    if (rideError) throw rideError;
    if (!ride) return json({ error: 'Ride not found' }, 404);

    const { data: membership, error: memberError } = await supabaseClient
      .from('account_tenants')
      .select('role, status')
      .eq('account_id', user.id)
      .eq('tenant_id', ride.tenant_id)
      .maybeSingle();
    if (memberError) throw memberError;
    const isClubAdmin = membership?.role === 'admin';
    const isAffiliatedCreator = ride.created_by === user.id && membership?.status === 'affiliated';
    if (!isClubAdmin && !isAffiliatedCreator) {
      // Same answer as a missing ride, so the endpoint can't be used to probe other clubs' rides.
      return json({ error: 'Ride not found' }, 404);
    }

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

    // 5. Generate Summary using Provider Factory. D97: the key lives in the service-only
    //    tenant_ai_secrets table (never on tenants, which is world-readable for branding).
    const { data: secret, error: secretError } = await supabaseClient
      .from('tenant_ai_secrets')
      .select('ai_api_key')
      .eq('tenant_id', ride.tenant_id)
      .maybeSingle();
    if (secretError) throw new Error('Could not load the AI provider key');
    const provider = getAIProvider({ ...ride.tenants, ai_api_key: secret?.ai_api_key });
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

    return json({ summary, weather: weatherData }, 200);

  } catch (error) {
    // D97 r2: never echo the raw error — provider and network errors can carry request URLs
    // or upstream text. Log a type-only line; the caller gets a generic message.
    console.error('generate-ride-summary failed:', error instanceof Error ? error.name : typeof error);
    return json({ error: 'Could not generate the ride summary' }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
