import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendResendEmail } from '../_shared/resend.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * invite-member edge function
 *
 * Called by the admin portal "Invite Member" flow.
 * Uses the service role to:
 *   1. Send a branded invite email via Resend
 *   2. Pre-create the account + account_tenants row at `affiliated` status
 *
 * Fulfills W63: Wire up Resend as SMTP provider for transactional email.
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

    // ── 4. Generate Invite Link & Send via Resend ─────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const origin = req.headers.get('origin') ?? req.headers.get('referer')?.split('/portal')[0]
    const portalUrl = origin ? `${origin}/portal` : (Deno.env.get('PORTAL_URL') ?? 'https://vechelon.productdelivered.ca/portal')

    const normalizedEmail = email.trim().toLowerCase()

    let inviteLink: string
    let invitedUserId: string

    // Try invite first; if user already exists fall back to magic link
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo: portalUrl }
    })

    if (inviteError) {
      // User likely already exists — send a magic link instead
      const { data: mlData, error: mlError } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: normalizedEmail,
        options: { redirectTo: portalUrl }
      })
      if (mlError) throw mlError
      inviteLink = mlData.properties.action_link
      invitedUserId = mlData.user.id
    } else {
      inviteLink = inviteData.properties.action_link
      invitedUserId = inviteData.user.id
    }

    // Fetch the invite template (optional: could just inline a basic one for MVP)
    // For now, let's use a polished HTML string inline that matches our branding
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1c1c1c;">
        <h1 style="font-style: italic; font-weight: 800; letter-spacing: -0.05em;">VECHELON</h1>
        <p style="font-size: 14px; line-height: 1.6;">You have been invited to join the <strong>Racer Sportif</strong> club portal.</p>
        <div style="margin: 30px 0;">
          <a href="${inviteLink}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Accept Invitation</a>
        </div>
        <p style="font-size: 12px; color: #666;">If you didn't expect this invitation, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #999;">Tactical Ride Intelligence</p>
      </div>
    `;

    const { error: resendError } = await sendResendEmail({
      to: normalizedEmail,
      subject: 'Join Vechelon | Racer Sportif Invitation',
      html: emailHtml
    })

    if (resendError) throw new Error(`Resend Error: ${resendError}`)

    // ── 5. Pre-create account row (idempotent) ─────────────────────────────
    await adminClient
      .from('accounts')
      .upsert(
        { id: invitedUserId, email: normalizedEmail },
        { onConflict: 'id', ignoreDuplicates: true }
      )

    // ── 6. Pre-create account_tenants row as affiliated ────────────────────
    const { error: tenantError } = await adminClient
      .from('account_tenants')
      .upsert(
        {
          account_id: invitedUserId,
          tenant_id: tenantId,
          role: inviteRole,
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
