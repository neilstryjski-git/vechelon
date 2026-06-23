import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { provisionMember, derivePortalUrl, CROSS_CLUB_MESSAGE } from '../_shared/member-provision.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * invite-member edge function
 *
 * Called by the admin portal "Invite Member" flow. Provisions a single member
 * at `affiliated` status and emails a branded invite. The per-member logic
 * (cross-club guard, link generation, Resend email, accounts + account_tenants
 * upserts) lives in ../_shared/member-provision.ts and is shared with the bulk
 * importer (W216). Behaviour is unchanged: single member, affiliated, re-issues
 * the link for an existing this-tenant member, and rejects cross-club emails
 * with a 409 that does not name the other club (W127 / Pillar II §2.3).
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 1. Authenticate the calling user ──────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    // ── 2. Verify admin role and resolve tenant ────────────────────────────
    const { data: adminRow, error: adminError } = await userClient
      .from('account_tenants')
      .select('tenant_id, role')
      .eq('account_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (adminError || !adminRow) {
      throw new Error('Permission denied: only admins can invite members')
    }

    const tenantId = adminRow.tenant_id

    // ── 3. Parse request body ──────────────────────────────────────────────
    const { email, role } = await req.json()
    if (!email || typeof email !== 'string') throw new Error('email is required')
    const inviteRole: 'admin' | 'member' = role === 'admin' ? 'admin' : 'member'

    // Service-role client for cross-tenant lookups + account pre-creation.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: tenant } = await adminClient
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle()
    const clubName = tenant?.name || 'Vechelon'

    // ── 4. Provision the single member (shared helper) ─────────────────────
    const result = await provisionMember(
      { adminClient, tenantId, clubName, portalUrl: derivePortalUrl(req) },
      {
        email,
        role: inviteRole,
        status: 'affiliated',
        sendEmail: true,
        skipExisting: false, // single-invite re-issues the link for an existing member
      }
    )

    if (result.outcome === 'failed_cross_club') {
      return new Response(JSON.stringify({ error: CROSS_CLUB_MESSAGE }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409,
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
