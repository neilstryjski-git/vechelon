import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendResendEmail } from '../_shared/resend.ts'
import { escapeHtml, safeHexColor, safeHttpsUrl } from '../_shared/html.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

/**
 * notify-crew-added — emails a member who was just added to a ride as captain/support.
 *
 * D96 hardening: previously anyone holding the public anon key could make this
 * function send arbitrary HTML from vechelon.ca to any address (phishing relay).
 * Now:
 *   1. the caller must be a signed-in user (getUser — the anon key alone is a
 *      valid JWT, so gateway verify_jwt is not authorization);
 *   2. the caller must be an admin of the RIDE's tenant (tenant taken from the
 *      ride row; any body tenant_id is ignored);
 *   3. the recipient must already be a ride_participants row on that ride with
 *      that email + role — and its display_name comes from that row;
 *   4. every interpolated value is HTML-escaped.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const { email, ride_id, role } = await req.json()

    // Only notify for captain or support — member additions are silent
    if (role !== 'captain' && role !== 'support') {
      return json({ success: true, skipped: true }, 200)
    }

    if (typeof email !== 'string' || !email.trim()) {
      console.warn(`notify-crew-added: no email for ride_id=${ride_id} — skipping`)
      return json({ success: true, skipped: true }, 200)
    }

    if (typeof ride_id !== 'string' || !ride_id) {
      return json({ error: 'ride_id is required' }, 400)
    }

    const recipient = email.trim().toLowerCase()

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Ride (and its tenant) — the tenant is taken from the ride, never the body.
    const { data: ride, error: rideError } = await adminClient
      .from('rides')
      .select('name, scheduled_start, tenant_id')
      .eq('id', ride_id)
      .maybeSingle()
    if (rideError) throw rideError
    if (!ride) return json({ error: 'Ride not found' }, 404)

    // Caller must administer the ride's tenant. is_tenant_admin is SECURITY
    // DEFINER keyed on auth.uid(), so call it with the caller's JWT.
    const { data: isAdmin, error: adminErr } = await userClient
      .rpc('is_tenant_admin', { t_id: ride.tenant_id })
    if (adminErr) throw adminErr
    if (isAdmin !== true) return json({ error: 'Forbidden' }, 403)

    // Recipient must be an actual crew row on this ride (RideBuilder inserts it
    // before invoking us) — stops this being used to email arbitrary addresses.
    const { data: participant, error: partErr } = await adminClient
      .from('ride_participants')
      .select('display_name')
      .eq('ride_id', ride_id)
      .eq('role', role)
      .eq('email', recipient)
      .limit(1)
      .maybeSingle()
    if (partErr) throw partErr
    if (!participant) return json({ error: 'Recipient is not crew on this ride' }, 403)

    // Fetch tenant branding
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('name, logo_url, primary_color, slug')
      .eq('id', ride.tenant_id)
      .single()
    if (tenantError) throw tenantError

    if (!tenant.slug || !/^[a-z0-9-]+$/.test(tenant.slug)) {
      throw new Error(`tenant ${ride.tenant_id} has no valid slug — cannot build URLs`)
    }

    const rawLogoUrl = tenant?.logo_url || ''
    const clubLogo = safeHttpsUrl(rawLogoUrl.startsWith('/')
      ? `https://${tenant.slug}.vechelon.ca${rawLogoUrl}`
      : rawLogoUrl)
    const brandColor = safeHexColor(tenant?.primary_color, '#1c1c1c')
    const rideLandingUrl = escapeHtml(`https://${tenant.slug}.vechelon.ca/ride/${encodeURIComponent(ride_id)}`)

    const roleLabel = role === 'captain' ? 'Captain' : 'Support'
    const rawRideName = ride?.name || 'Upcoming Ride'
    const rawClubName = tenant?.name || 'Vechelon'
    const clubName = escapeHtml(rawClubName)
    const rideName = escapeHtml(rawRideName)
    const greetingName = escapeHtml((participant.display_name ?? '').trim())

    const scheduledDate = ride?.scheduled_start
      ? escapeHtml(new Date(ride.scheduled_start).toLocaleDateString('en-CA', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }))
      : null

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1c1c1c; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 16px; border: 1px solid #eee;">
          ${clubLogo ? `<img src="${clubLogo}" alt="${clubName}" style="height: 40px; margin-bottom: 24px;">` : `<h1 style="font-style: italic; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 24px 0;">${escapeHtml(rawClubName.toUpperCase())}</h1>`}

          <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">You've been added to a ride</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #444; margin-bottom: 8px;">
            Hi${greetingName ? ` ${greetingName}` : ''},
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #444; margin-bottom: 24px;">
            You've been added to <strong>${rideName}</strong> as <strong>${roleLabel}</strong> by the <strong>${clubName}</strong> team.
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
            <tr>
              <td style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; padding: 8px 0 4px; border-top: 1px solid #eee;">Ride</td>
              <td style="font-size: 14px; color: #1c1c1c; padding: 8px 0 4px; border-top: 1px solid #eee;">${rideName}</td>
            </tr>
            ${scheduledDate ? `
            <tr>
              <td style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; padding: 8px 0 4px; border-top: 1px solid #eee;">When</td>
              <td style="font-size: 14px; color: #1c1c1c; padding: 8px 0 4px; border-top: 1px solid #eee;">${scheduledDate}</td>
            </tr>` : ''}
            <tr>
              <td style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; padding: 8px 0 4px; border-top: 1px solid #eee;">Your Role</td>
              <td style="font-size: 14px; font-weight: 700; color: ${brandColor}; padding: 8px 0 4px; border-top: 1px solid #eee;">${roleLabel}</td>
            </tr>
          </table>

          <div style="margin-bottom: 32px;">
            <a href="${rideLandingUrl}" style="background-color: ${brandColor}; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; text-transform: uppercase; letter-spacing: 0.1em;">
              View Ride
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 32px;">
          <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #aaa; font-weight: 600;">
            VECHELON · Tactical Ride Intelligence
          </p>
        </div>
      </div>
    `

    const { error: resendError } = await sendResendEmail({
      to: recipient,
      subject: `You've been added to ${rawRideName} as ${roleLabel} — ${rawClubName}`.replace(/[\r\n]+/g, ' '),
      html: emailHtml,
    })

    if (resendError) {
      console.error('notify-crew-added: Resend failure:', resendError)
      throw new Error(`Resend Error: ${resendError}`)
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
