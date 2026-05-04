import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractSlug } from '../_shared/extractSlug.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * guest-rsvp edge function
 *
 * Public endpoint for anon RSVP to a ride. Replaces the direct anon INSERT
 * into ride_participants so that RLS on that table can be tightened to
 * authenticated-only (W143 / MT-H-05).
 *
 * account_id is always NULL — identity is tied via session_cookie_id.
 * The ensure_account_exists RPC handles claiming guest history when
 * the user later authenticates via magic link.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ride_id, display_name, email, session_cookie_id } = await req.json()
    if (!ride_id || typeof ride_id !== 'string') throw new Error('ride_id is required')
    if (!display_name || typeof display_name !== 'string') throw new Error('display_name is required')
    if (!session_cookie_id || typeof session_cookie_id !== 'string') throw new Error('session_cookie_id is required')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Derive tenant scope from Origin/Referer header (same pattern as guest-view-ride)
    let tenantId: string | null = null
    const originHeader = req.headers.get('origin') ?? req.headers.get('referer')
    if (originHeader) {
      try {
        const slug = extractSlug(new URL(originHeader).hostname)
        if (slug) {
          const { data: tenant } = await adminClient
            .from('tenants')
            .select('id')
            .eq('slug', slug)
            .maybeSingle()
          tenantId = tenant?.id ?? null
        }
      } catch { /* ignore URL parse errors */ }
    }

    // Look up ride scoped to the requesting tenant (generic 404 on mismatch — CP-MT-06)
    let rideQuery = adminClient
      .from('rides')
      .select('id, tenant_id')
      .eq('id', ride_id)

    if (tenantId) rideQuery = rideQuery.eq('tenant_id', tenantId)

    const { data: ride, error: rideError } = await rideQuery.maybeSingle()

    if (rideError) throw rideError
    if (!ride) {
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    // Check enrollment_mode — manual clubs reject guest RSVPs
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('enrollment_mode')
      .eq('id', ride.tenant_id)
      .maybeSingle()

    if (tenantError) throw tenantError

    if (tenant?.enrollment_mode === 'manual') {
      return new Response(
        JSON.stringify({ error: 'This club requires admin approval. Please request an invitation to join rides.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const normalisedEmail = typeof email === 'string' ? email.trim().toLowerCase() || null : null

    const { error: insertError } = await adminClient
      .from('ride_participants')
      .insert({
        ride_id,
        account_id: null,
        display_name: display_name.trim(),
        email: normalisedEmail,
        role: 'guest',
        status: 'rsvpd',
        session_cookie_id,
      })

    // 23505 = unique_violation — duplicate RSVP, treat as no-op
    if (insertError && (insertError as { code?: string }).code !== '23505') {
      throw insertError
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
