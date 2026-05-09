import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendResendEmail } from '../_shared/resend.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, display_name, ride_id, role, tenant_id } = await req.json()

    // Only notify for captain or support — member additions are silent
    if (role !== 'captain' && role !== 'support') {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!email) {
      console.warn(`notify-crew-added: no email for display_name=${display_name}, ride_id=${ride_id} — skipping`)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!ride_id || !tenant_id) {
      throw new Error('ride_id and tenant_id are required')
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch ride details
    const { data: ride, error: rideError } = await adminClient
      .from('rides')
      .select('name, scheduled_start')
      .eq('id', ride_id)
      .single()
    if (rideError) throw rideError

    // Fetch tenant branding
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('name, logo_url, primary_color, slug')
      .eq('id', tenant_id)
      .single()
    if (tenantError) throw tenantError

    if (!tenant.slug) throw new Error(`tenant ${tenant_id} has no slug — cannot build URLs`)

    const clubName = tenant?.name || 'Vechelon'
    const rawLogoUrl = tenant?.logo_url || ''
    const clubLogo = rawLogoUrl.startsWith('/')
      ? `https://${tenant.slug}.vechelon.ca${rawLogoUrl}`
      : rawLogoUrl
    const brandColor = tenant?.primary_color || '#1c1c1c'
    const rideLandingUrl = `https://${tenant.slug}.vechelon.ca/ride/${ride_id}`

    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
    const rideName = ride?.name || 'Upcoming Ride'

    const scheduledDate = ride?.scheduled_start
      ? new Date(ride.scheduled_start).toLocaleDateString('en-CA', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      : null

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1c1c1c; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 16px; border: 1px solid #eee;">
          ${clubLogo ? `<img src="${clubLogo}" alt="${clubName}" style="height: 40px; margin-bottom: 24px;">` : `<h1 style="font-style: italic; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 24px 0;">${clubName.toUpperCase()}</h1>`}

          <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">You've been added to a ride</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #444; margin-bottom: 8px;">
            Hi${display_name?.trim() ? ` ${display_name.trim()}` : ''},
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
      to: email.trim().toLowerCase(),
      subject: `You've been added to ${rideName} as ${roleLabel} — ${clubName}`,
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
