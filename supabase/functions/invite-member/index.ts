import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * invite-member edge function
 *
 * Called by the admin portal "Invite Member" flow.
 * Uses the service role to:
 *   1. Send the branded invite email (triggers the `invite` Supabase template)
 *   2. Pre-create the account + account_tenants row at `affiliated` status
 *
 * Because the admin is personally vouching for the rider, no approval step
 * is required — the member lands as affiliated and can RSVP immediately.
 *
 * Security: verifies the caller holds the `admin` role in account_tenants
 * before doing anything.
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
    const { email } = await req.json()
    if (!email || typeof email !== 'string') throw new Error('email is required')

    // ── 4. Send the invite via service role (triggers `invite` template) ───
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const portalUrl = Deno.env.get('PORTAL_URL') ?? 'https://vechelon.productdelivered.ca/portal'

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      { redirectTo: portalUrl }
    )

    if (inviteError) throw inviteError

    const invitedUserId = inviteData.user.id

    // ── 5. Pre-create account row (idempotent) ─────────────────────────────
    await adminClient
      .from('accounts')
      .upsert(
        { id: invitedUserId, email: email.trim().toLowerCase() },
        { onConflict: 'id', ignoreDuplicates: true }
      )

    // ── 6. Pre-create account_tenants row as affiliated ────────────────────
    // Admin is personally vouching — no approval step required.
    // If the user already exists in this tenant, promote them to affiliated.
    const { error: tenantError } = await adminClient
      .from('account_tenants')
      .upsert(
        {
          account_id: invitedUserId,
          tenant_id: tenantId,
          role: 'member',
          status: 'affiliated',
        },
        { onConflict: 'account_id,tenant_id' }
      )

    if (tenantError) throw tenantError

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
