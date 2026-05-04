import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractSlug } from '../_shared/extractSlug.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * guest-view-ride edge function
 *
 * Public endpoint for the QR landing page. Returns ride details + tenant
 * branding via service role so the anon direct-PostgREST path on `rides`
 * can be removed (W143 / MT-H-05).
 *
 * Tenant-scoped: if the Origin header resolves to a *.vechelon.ca subdomain,
 * the ride_id must belong to that tenant — generic 404 on mismatch to avoid
 * leaking cross-tenant ride existence (CP-MT-06).
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { ride_id } = await req.json()
    if (!ride_id || typeof ride_id !== 'string') throw new Error('ride_id is required')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Derive tenant scope from Origin/Referer header when present
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

    let q = adminClient
      .from('rides')
      .select('id, name, type, scheduled_start, start_label, start_coords, finish_label, finish_coords, external_url, gpx_path, thumbnail_url, status, actual_end, tenant_id, tenants(primary_color, accent_color, logo_url, name, slug)')
      .eq('id', ride_id)

    if (tenantId) q = q.eq('tenant_id', tenantId)

    const { data: ride, error } = await q.maybeSingle()

    if (error) throw error
    if (!ride) {
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const { tenants: tenant, tenant_id: _tid, ...rideData } = ride as Record<string, unknown> & { tenants: unknown; tenant_id: string }
    return new Response(
      JSON.stringify({ ride: rideData, tenant }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
