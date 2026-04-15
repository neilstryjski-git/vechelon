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

    const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1c1c1c;padding:32px 40px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#888;font-weight:600;">Tactical Ride Intelligence</p>
            <h1 style="margin:8px 0 0;font-size:36px;font-weight:900;font-style:italic;letter-spacing:-0.04em;color:#ffffff;">VECHELON</h1>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#1c1c1c;letter-spacing:-0.02em;">You've been invited to ride.</h2>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#444;">
              Your club admin has added you to the <strong>Racer Sportif</strong> portal on Vechelon — the tactical command centre for serious group rides.
            </p>
            <p style="margin:0 0 32px;font-size:15px;line-height:1.7;color:#444;">
              Once you accept, you'll have access to the ride calendar, route library, live ride tracking, and RSVP tools — everything your club needs to ride together, faster and smarter.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#1c1c1c;border-radius:8px;">
                  <a href="${inviteLink}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Accept Invitation →</a>
                </td>
              </tr>
            </table>

            <p style="margin:20px 0 0;font-size:12px;color:#999;">
              Or copy this link into your browser:<br>
              <a href="${inviteLink}" style="color:#555;word-break:break-all;">${inviteLink}</a>
            </p>
          </td>
        </tr>

        <!-- Feature Grid -->
        <tr>
          <td style="padding:0 40px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="48%" style="background:#f9f9f9;border-radius:8px;padding:20px;vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#888;">Ride Calendar</p>
                  <p style="margin:0;font-size:13px;color:#444;line-height:1.5;">Browse upcoming rides, RSVP instantly, and never miss a roll-out.</p>
                </td>
                <td width="4%"></td>
                <td width="48%" style="background:#f9f9f9;border-radius:8px;padding:20px;vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#888;">Route Library</p>
                  <p style="margin:0;font-size:13px;color:#444;line-height:1.5;">Access your club's curated routes with elevation profiles and GPX downloads.</p>
                </td>
              </tr>
              <tr><td colspan="3" style="height:12px;"></td></tr>
              <tr>
                <td width="48%" style="background:#f9f9f9;border-radius:8px;padding:20px;vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#888;">Live Tracking</p>
                  <p style="margin:0;font-size:13px;color:#444;line-height:1.5;">See your peloton in real time during active rides with the tactical HUD.</p>
                </td>
                <td width="4%"></td>
                <td width="48%" style="background:#f9f9f9;border-radius:8px;padding:20px;vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#888;">WhatsApp Ready</p>
                  <p style="margin:0;font-size:13px;color:#444;line-height:1.5;">Ride announcements broadcast directly to your group with one tap.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;border-top:1px solid #eee;padding:24px 40px;">
            <p style="margin:0 0 8px;font-size:12px;color:#999;line-height:1.6;">
              This invitation was sent by your club admin at <strong>Racer Sportif</strong>. If you weren't expecting this, you can safely ignore it — no account will be created unless you click the link above.
            </p>
            <p style="margin:0;font-size:11px;color:#bbb;letter-spacing:0.15em;text-transform:uppercase;">Vechelon · Tactical Ride Intelligence · vechelon.ca</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

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
