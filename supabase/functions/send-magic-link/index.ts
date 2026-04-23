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
    const { email, redirectTo } = await req.json()
    if (!email) throw new Error('Email is required')

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Fetch Tenant branding for the email
    const { data: tenant } = await adminClient
      .from('tenants')
      .select('name, logo_url, primary_color')
      .limit(1)
      .maybeSingle()

    const clubName = tenant?.name || 'Vechelon'
    const clubLogo = tenant?.logo_url || ''
    const brandColor = tenant?.primary_color || '#1c1c1c'

    // 2. Generate the Magic Link (OTP)
    const finalRedirect = redirectTo || (Deno.env.get('PORTAL_URL') ?? 'https://vechelon.productdelivered.ca/portal/auth')
    
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: email.trim().toLowerCase(),
      options: { redirectTo: finalRedirect }
    })

    if (linkError) throw linkError

    const magicLink = linkData.properties.action_link

    // 3. Send via Resend with dynamic branding
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1c1c1c; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; padding: 40px; border-radius: 16px; shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #eee;">
          ${clubLogo ? `<img src="${clubLogo}" alt="${clubName}" style="height: 40px; margin-bottom: 24px;">` : `<h1 style="font-style: italic; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 24px 0;">${clubName.toUpperCase()}</h1>`}
          
          <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Authorization Required</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #444; margin-bottom: 32px;">
            Click the secure button below to authorize your session and enter the <strong>${clubName}</strong> Tactical Portal.
          </p>
          
          <div style="margin-bottom: 32px;">
            <a href="${magicLink}" style="background-color: ${brandColor}; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; display: inline-block; text-transform: uppercase; letter-spacing: 0.1em;">
              Authorize Session
            </a>
          </div>
          
          <p style="font-size: 12px; color: #888; margin-bottom: 0;">
            This link will expire in 60 minutes. If you didn't request this email, you can safely ignore it.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 32px;">
          <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #aaa; font-weight: 600;">
            VECHELON · Tactical Ride Intelligence
          </p>
        </div>
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
