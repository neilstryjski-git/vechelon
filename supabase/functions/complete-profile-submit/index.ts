import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendResendEmail } from '../_shared/resend.ts'
import { hashToken } from '../_shared/completion-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * complete-profile-submit edge function (W253, Goal G31)
 *
 * The recipient-facing back-end for phone-shell onboarding. A rider opens the
 * public /complete-profile?token=… page (W256), supplies their email (REQUIRED —
 * it becomes their auth identity, Vechelon is magic-link-only) plus name / phone /
 * optional emergency contact, and submits here.
 *
 * This is admin-complete-guest's provisioning MINUS the admin gate, PLUS token
 * validation: the caller is an unauthenticated stranger, so authorization is the
 * possession of a valid, single-use, unexpired token (its HMAC hash must match a
 * pending_members row). On success it provisions a REAL account (mirroring
 * invite-member / admin-complete-guest), marks the shell completed + linked, and
 * SENDS a branded magic-link so the rider can sign in.
 *
 * verify_jwt=false (public). All writes use the service-role client. The tenant is
 * derived from the shell row, never from the request body.
 *
 * supabase-patterns: Pattern 3 — accounts/account_tenants upserts target FULL
 * unique keys (accounts.id PK; account_tenants (account_id,tenant_id)).
 * Token secret read via the get_completion_token_secret() SECURITY DEFINER RPC.
 */

const CROSS_CLUB_MESSAGE =
  'This email is already registered on the Vechelon platform. Please use a dedicated email for this club.'

const norm = (v: unknown): string | null =>
  typeof v === 'string' ? (v.trim() || null) : null

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 1. Parse + validate input ─────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const token = norm(body.token)
    if (!token) throw new Error('This link is invalid.')

    // Peek mode: the public page validates the token on load and prefills the
    // admin-seeded details WITHOUT provisioning. Read-only, email not required.
    const isPeek = body.peek === true

    const normalizedEmail = typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : ''

    const v_name = norm(body.name)
    const v_phone = norm(body.phone)
    const v_ec_name = norm(body.emergency_contact_name)
    const v_ec_phone = norm(body.emergency_contact_phone)

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ── 2. Validate the token: hash → look up shell → single-use + expiry ──
    const { data: secret, error: secretError } = await adminClient
      .rpc('get_completion_token_secret')
    if (secretError || !secret) throw new Error('completion_token_secret not configured')

    const token_hash = await hashToken(token, secret)

    const { data: shell, error: shellError } = await adminClient
      .from('pending_members')
      .select('id, tenant_id, phone, name, emergency_contact_name, emergency_contact_phone, status, expires_at')
      .eq('token_hash', token_hash)
      .maybeSingle()
    if (shellError) throw shellError
    // Generic message — never reveal whether a token existed.
    if (!shell) throw new Error('This link is invalid or has already been used.')

    if (shell.status !== 'pending') {
      throw new Error('This link is invalid or has already been used.')
    }
    if (new Date(shell.expires_at).getTime() <= Date.now()) {
      // Flip to expired so it can't be retried; ask for a fresh link.
      await adminClient
        .from('pending_members')
        .update({ status: 'expired' })
        .eq('id', shell.id)
        .eq('status', 'pending')
      throw new Error('This link has expired. Please ask your club to send you a new one.')
    }

    // Peek: token is valid → return the admin-seeded details for the form to
    // prefill. No writes, no email requirement.
    if (isPeek) {
      return new Response(
        JSON.stringify({
          valid: true,
          name: shell.name ?? null,
          phone: shell.phone ?? null,
          emergency_contact_name: shell.emergency_contact_name ?? null,
          emergency_contact_phone: shell.emergency_contact_phone ?? null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    // Submit path requires the email — it becomes the auth identity, so without
    // it the rider could never sign in.
    if (!normalizedEmail) {
      throw new Error('An email is required to finish setting up your account.')
    }

    const tenantId = shell.tenant_id
    const shellPhone = shell.phone ? String(shell.phone) : null

    // ── 3. Cross-club email validation (W127 / Pillar II §2.3) ─────────────
    // Reject an email already registered to a DIFFERENT tenant. Must NOT reveal
    // the source club (CP-MT-06).
    const { data: existingAccount, error: lookupError } = await adminClient
      .from('accounts')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()
    if (lookupError) throw lookupError

    const isNewAccount = !existingAccount
    let accountId: string
    if (existingAccount) {
      const { data: sameTenantLink, error: linkError } = await adminClient
        .from('account_tenants')
        .select('account_id')
        .eq('account_id', existingAccount.id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (linkError) throw linkError

      if (!sameTenantLink) {
        return new Response(
          JSON.stringify({ error: CROSS_CLUB_MESSAGE }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 },
        )
      }
      accountId = existingAccount.id
    } else {
      // ── 4. Resolve/create the auth identity, ensure an accounts row ──────
      // Mirror invite-member / admin-complete-guest: generateLink 'invite'
      // creates a brand-new user; on error (already exists) fall back to
      // 'magiclink'. generateLink does NOT send email — provisioning is silent
      // here; the login email is sent explicitly in step 7.
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email: normalizedEmail,
      })
      if (inviteError || !inviteData?.user) {
        const { data: mlData, error: mlError } = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email: normalizedEmail,
        })
        if (mlError || !mlData?.user) {
          throw new Error(`Could not create account: ${(inviteError ?? mlError)?.message ?? 'unknown error'}`)
        }
        accountId = mlData.user.id
      } else {
        accountId = inviteData.user.id
      }

      const { error: acctError } = await adminClient
        .from('accounts')
        .upsert({ id: accountId, email: normalizedEmail }, { onConflict: 'id', ignoreDuplicates: true })
      if (acctError) throw acctError
    }

    // ── 5. Write contact details (merge — don't clobber a real member) ─────
    // A brand-new account may inherit the admin-seeded shell phone; an EXISTING
    // account (e.g. a prior guest RSVP / member sharing this email) must only get
    // the rider's explicitly-submitted phone — never the seeded fallback — so a
    // blank phone field can't overwrite their real number (mirrors admin-complete-guest).
    const phoneToWrite = isNewAccount ? (v_phone ?? shellPhone) : v_phone
    const patch: Record<string, string> = {}
    if (v_name) patch.name = v_name
    if (phoneToWrite) patch.phone = phoneToWrite
    if (v_ec_name) patch.emergency_contact_name = v_ec_name
    if (v_ec_phone) patch.emergency_contact_phone = v_ec_phone
    if (Object.keys(patch).length > 0) {
      const { error: updError } = await adminClient
        .from('accounts')
        .update(patch)
        .eq('id', accountId)
      if (updError) throw updError
    }

    // ── 6. Create/keep the tenant membership ───────────────────────────────
    // name+phone complete => affiliated; otherwise initiated. Never downgrade.
    const { data: currentLink, error: currentLinkError } = await adminClient
      .from('account_tenants')
      .select('status')
      .eq('account_id', accountId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (currentLinkError) throw currentLinkError

    const wantAffiliated = !!v_name && !!phoneToWrite
    const newStatus: 'affiliated' | 'initiated' =
      currentLink?.status === 'affiliated'
        ? 'affiliated'
        : (wantAffiliated ? 'affiliated' : 'initiated')

    const { error: linkUpsertError } = await adminClient
      .from('account_tenants')
      .upsert(
        { account_id: accountId, tenant_id: tenantId, role: 'member', status: newStatus },
        { onConflict: 'account_id,tenant_id' },
      )
    if (linkUpsertError) throw linkUpsertError

    // ── 7. Mark the shell completed (single-use, AFTER provisioning) ───────
    // Conditional on status='pending' so a concurrent double-submit can't
    // complete twice. Done after provisioning so a provisioning failure leaves
    // the shell re-submittable. If the race is lost (0 rows), the account is
    // still provisioned — the winning request sends the email; we return quietly.
    const { data: completedRow, error: completeError } = await adminClient
      .from('pending_members')
      .update({ status: 'completed', completed_at: new Date().toISOString(), account_id: accountId })
      .eq('id', shell.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (completeError) throw completeError
    if (!completedRow) {
      // A concurrent submit already completed this shell; avoid a duplicate email.
      return new Response(
        JSON.stringify({ success: true, status: newStatus, emailSent: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      )
    }

    // ── 8. Send the branded magic-link so the rider can sign in ────────────
    const { data: tenant } = await adminClient
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle()
    const clubName = tenant?.name || 'Vechelon'

    // Host-aware portal base (mirrors invite-member): legacy productdelivered.ca
    // serves the SPA under /portal; *.vechelon.ca hosts run at root.
    let origin: string | null = req.headers.get('origin')
    if (!origin) {
      const referer = req.headers.get('referer')
      if (referer) {
        try { origin = new URL(referer).origin } catch { /* ignore */ }
      }
    }
    let portalUrl: string
    if (origin) {
      let hostname = ''
      try { hostname = new URL(origin).hostname } catch { /* ignore */ }
      portalUrl = hostname === 'vechelon.productdelivered.ca' ? `${origin}/portal` : origin
    } else {
      portalUrl = Deno.env.get('PORTAL_URL') ?? 'https://vechelon.productdelivered.ca/portal'
    }

    const { data: mlData, error: mlError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: { redirectTo: portalUrl },
    })
    // A failed email must not fail the whole request — the account is already
    // set up and the admin can re-issue a sign-in link. Report it in the payload.
    let emailSent = false
    if (!mlError && mlData?.properties?.action_link) {
      const signInLink = mlData.properties.action_link
      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#1c1c1c;padding:32px 40px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#888;font-weight:600;">${clubName}</p>
            <h1 style="margin:8px 0 0;font-size:36px;font-weight:900;font-style:italic;letter-spacing:-0.04em;color:#ffffff;">VECHELON</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#1c1c1c;letter-spacing:-0.02em;">You're all set.</h2>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#444;">
              Your profile for <strong>${clubName}</strong> is complete. Tap below to sign in — no password needed.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#1c1c1c;border-radius:8px;">
                  <a href="${signInLink}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.05em;text-transform:uppercase;">Sign In →</a>
                </td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:12px;color:#999;">
              Or copy this link into your browser:<br>
              <a href="${signInLink}" style="color:#555;word-break:break-all;">${signInLink}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f9;border-top:1px solid #eee;padding:24px 40px;">
            <p style="margin:0;font-size:11px;color:#bbb;letter-spacing:0.15em;text-transform:uppercase;">Vechelon · vechelon.ca</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      const { error: resendError } = await sendResendEmail({
        to: normalizedEmail,
        subject: `You're in | ${clubName} on Vechelon`,
        html: emailHtml,
      })
      emailSent = !resendError
    }

    return new Response(
      JSON.stringify({ success: true, status: newStatus, emailSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})
