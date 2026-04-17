import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendResendEmail } from '../_shared/resend.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * send-magic-link edge function
 * 
 * Fulfills W63: Branded Transactional Email (Magic Link).
 * Generates a secure OTP link and sends it via Resend API.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email } = await req.json()
    if (!email) throw new Error('Email is required')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const portalUrl = Deno.env.get('PORTAL_URL') ?? 'https://vechelon.productdelivered.ca/portal/auth'
    const portalBase = portalUrl.replace('/auth', '')

    // 1. Generate the Magic Link (OTP)
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: email.trim().toLowerCase(),
      options: { redirectTo: portalUrl }
    })

    if (linkError) throw linkError

    const magicLink = linkData.properties.action_link

    // Wrap behind a click-through page so email scanners (Gmail etc.) can't
    // consume the one-time OTP by following the link automatically.
    const clickThroughUrl = `${portalBase}/auth?c=${btoa(magicLink)}`

    // 2. Send via Resend with branding
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1c1c1c;">
        <h1 style="font-style: italic; font-weight: 800; letter-spacing: -0.05em;">VECHELON</h1>
        <p style="font-size: 14px; line-height: 1.6;">Click the button below to sign in to the <strong>Racer Sportif</strong> Rider Portal.</p>
        <div style="margin: 30px 0;">
          <a href="${clickThroughUrl}" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Sign In to Portal</a>
        </div>
        <p style="font-size: 12px; color: #666;">This link will expire in 1 hour. If you didn't request this email, you can safely ignore it.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #999;">Tactical Ride Intelligence</p>
      </div>
    `;

    const { error: resendError } = await sendResendEmail({
      to: email.trim().toLowerCase(),
      subject: 'Sign in to Vechelon',
      html: emailHtml
    })

    if (resendError) throw new Error(`Resend Error: ${resendError}`)

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
