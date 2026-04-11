import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getAIService, AIProviderType } from '../_shared/ai-provider.ts'

serve(async (req) => {
  try {
    const { rideId } = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch tenant AI config for the ride
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .select('tenant_id')
      .eq('id', rideId)
      .single()

    if (rideError) throw rideError

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('ai_provider, ai_api_key')
      .eq('id', ride.tenant_id)
      .single()

    if (tenantError) throw tenantError
    if (!tenant.ai_api_key) throw new Error('No AI API key configured for this tenant.')

    // 2. Get the specific AI service
    const aiService = getAIService(tenant.ai_provider as AIProviderType)

    // 3. Generate summary (using a placeholder prompt for now)
    const prompt = "Please provide a concise pro-tour style summary for a group cycling ride that just finished."
    const result = await aiService.generateText(prompt, tenant.ai_api_key)

    if (result.status !== 'success') {
      return new Response(JSON.stringify({ 
        status: result.status, 
        message: result.error || 'AI generation failed' 
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: result.status === 'invalid_key' ? 401 : 500,
      })
    }

    return new Response(JSON.stringify({ 
      summary: result.content,
      provider: tenant.ai_provider
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
