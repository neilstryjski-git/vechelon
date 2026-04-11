import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Midnight UTC Auto-close Logic
    // Transitions 'active' rides to 'saved' and sets auto_closed = true
    const { data, error } = await supabase
      .from('rides')
      .update({ 
        status: 'saved', 
        auto_closed: true,
        actual_end: new Date().toISOString() 
      })
      .eq('status', 'active')
      .select()

    if (error) throw error

    return new Response(JSON.stringify({ 
      message: `Auto-closed ${data?.length ?? 0} rides.`,
      processed_rides: data 
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
