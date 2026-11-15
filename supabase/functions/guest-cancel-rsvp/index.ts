import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractSlug } from '../_shared/extractSlug.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * guest-cancel-rsvp edge function
 *
 * Public counterpart to guest-rsvp: lets an anonymous rider cancel the RSVP
 * they created from this browser. anon has no DELETE grant on ride_participants
 * (RLS is authenticated-only for self-cancel — participant_delete_policy's
 * `account_id = auth.uid()` branch), so guest cancellation runs through the
 * service role here, exactly as guest RSVP creation does.
 *
 * Ownership is proven by session_cookie_id — the same token guest-rsvp stamps
 * on the row and the "already joined" check reads. We only delete rows with
 * account_id IS NULL: those are the genuinely-anonymous RSVPs this session
 * owns. An email-matched auto-linked row (account_id set, D42) belongs to a
 * real identity and is out of reach of a bare session cookie.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ride_id, session_cookie_id } = await req.json()
    if (!ride_id || typeof ride_id !== 'string') throw new Error('ride_id is required')
    if (!session_cookie_id || typeof session_cookie_id !== 'string') throw new Error('session_cookie_id is required')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Derive tenant scope from Origin/Referer header (same pattern as guest-rsvp)
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
      .select('id')
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

    // Delete only this session's anonymous RSVP for this ride. account_id IS NULL
    // keeps a bare session cookie from removing an email-linked member row.
    const { error: deleteError } = await adminClient
      .from('ride_participants')
      .delete()
      .eq('ride_id', ride_id)
      .eq('session_cookie_id', session_cookie_id)
      .is('account_id', null)

    if (deleteError) throw deleteError

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
