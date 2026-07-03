// Shared member-provisioning logic used by both the single `invite-member`
// edge function and the bulk `bulk-create-members` edge function (W216).
//
// Encapsulates the per-member flow that was originally inline in invite-member:
//   1. cross-club email guard (W127 / Pillar II §2.3 — never names the other club)
//   2. generate an invite link (falls back to a magic link if the user exists)
//   3. optionally send the branded Resend invite email
//   4. upsert the accounts row (incl. optional profile fields: name/phone/emergency)
//   5. upsert the account_tenants row at the requested status
//
// The single-invite caller and the bulk caller differ only in options
// (skipExisting, profile fields, status, sendEmail) — the logic is shared.

import { sendResendEmail } from './resend.ts'

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export type ProvisionOutcome =
  | 'created' // new account_tenants row written
  | 'updated' // existing this-tenant row re-affirmed (single-invite re-issue)
  | 'skipped_existing' // already a member of this tenant (bulk skips, no email)
  | 'failed_cross_club' // email belongs to another tenant — rejected, club NOT named
  | 'failed_error' // unexpected error for this member

export interface ProvisionResult {
  email: string
  outcome: ProvisionOutcome
  status?: 'affiliated' | 'initiated'
  /** Human-readable reason; for cross-club this is the verbatim, club-agnostic string. */
  message?: string
}

export interface ProvisionContext {
  /** service-role client — bypasses RLS for cross-tenant lookups + writes */
  adminClient: SupabaseClient
  tenantId: string
  /** club name for email copy */
  clubName: string
  /** host-aware portal URL used as the magic-link redirect */
  portalUrl: string
}

export interface ProvisionInput {
  email: string
  role: 'admin' | 'member'
  name?: string | null
  phone?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  status: 'affiliated' | 'initiated'
  /** send the branded invite email (single-invite: true; bulk: configurable) */
  sendEmail: boolean
  /**
   * When the email is already a member of THIS tenant:
   *  - false (single-invite): re-issue the link/email (outcome 'updated')
   *  - true  (bulk): skip silently, no email (outcome 'skipped_existing')
   */
  skipExisting: boolean
}

/** Verbatim cross-club rejection string (Pillar II §2.3 / CP-MT-06 — must NOT name the source club). */
export const CROSS_CLUB_MESSAGE =
  'This email is already registered on the Vechelon platform. Please use a dedicated email for this club.'

export interface MembershipLookup {
  existingId: string | null
  /** the email already belongs to THIS tenant */
  alreadyThisTenant: boolean
  /** the email belongs to a DIFFERENT tenant (cross-club — reject, don't name it) */
  crossClub: boolean
}

/**
 * Read-only membership check for an email against a tenant. Used by both
 * provisionMember (the write path) and the dry-run preview path. Bypasses RLS
 * via the service-role client to detect the cross-tenant case (W127).
 */
export async function lookupMembership(
  adminClient: SupabaseClient,
  tenantId: string,
  email: string,
): Promise<MembershipLookup> {
  const normalized = email.trim().toLowerCase()
  const { data: existingAccount, error: lookupError } = await adminClient
    .from('accounts').select('id').eq('email', normalized).maybeSingle()
  if (lookupError) throw lookupError
  if (!existingAccount) return { existingId: null, alreadyThisTenant: false, crossClub: false }

  const { data: currentLink, error: linkError } = await adminClient
    .from('account_tenants').select('account_id')
    .eq('account_id', existingAccount.id).eq('tenant_id', tenantId).maybeSingle()
  if (linkError) throw linkError

  return { existingId: existingAccount.id, alreadyThisTenant: !!currentLink, crossClub: !currentLink }
}

/**
 * Provision a single member into the given tenant. Never throws for the
 * cross-club case (returns a structured `failed_cross_club` result); throws
 * only on genuinely unexpected infrastructure errors so the caller can decide
 * whether to abort (single) or record-and-continue (bulk).
 */
export async function provisionMember(
  ctx: ProvisionContext,
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const { adminClient, tenantId, clubName, portalUrl } = ctx
  const email = input.email.trim().toLowerCase()

  // ── 1. Cross-club email guard (+ already-member short-circuit) ─────────
  const { alreadyThisTenant, crossClub } = await lookupMembership(adminClient, tenantId, email)
  if (crossClub) {
    // Registered to a different tenant — reject WITHOUT naming the source club.
    return { email, outcome: 'failed_cross_club', message: CROSS_CLUB_MESSAGE }
  }
  if (alreadyThisTenant && input.skipExisting) {
    return { email, outcome: 'skipped_existing', message: 'Already a member of this club.' }
  }

  // ── 2. Generate invite link (fallback to magic link if user exists) ────
  let inviteLink: string
  let invitedUserId: string
  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: portalUrl },
  })
  if (inviteError) {
    const { data: mlData, error: mlError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: portalUrl },
    })
    if (mlError) throw mlError
    inviteLink = mlData.properties.action_link
    invitedUserId = mlData.user.id
  } else {
    inviteLink = inviteData.properties.action_link
    invitedUserId = inviteData.user.id
  }

  // ── 3. Send branded invite email (optional) ────────────────────────────
  if (input.sendEmail) {
    const { error: resendError } = await sendResendEmail({
      to: email,
      subject: `Join Vechelon | ${clubName} Invitation`,
      html: buildInviteEmailHtml(clubName, inviteLink),
    })
    if (resendError) throw new Error(`Resend Error: ${resendError}`)
  }

  // ── 4. Upsert accounts (incl. optional profile fields) ─────────────────
  // Only include profile columns that were actually supplied, so we never
  // null out existing values for members who already have a profile.
  const accountRow: Record<string, unknown> = { id: invitedUserId, email }
  if (input.name != null) accountRow.name = input.name
  if (input.phone != null) accountRow.phone = input.phone
  if (input.emergencyContactName != null) accountRow.emergency_contact_name = input.emergencyContactName
  if (input.emergencyContactPhone != null) accountRow.emergency_contact_phone = input.emergencyContactPhone

  const hasProfileFields = Object.keys(accountRow).length > 2
  const { error: accountError } = await adminClient
    .from('accounts')
    // When profile fields are present we want them written even if the row
    // exists, so update-on-conflict. With only {id,email} (single-invite),
    // preserve the historical no-op-on-conflict behaviour.
    .upsert(accountRow, { onConflict: 'id', ignoreDuplicates: !hasProfileFields })
  if (accountError) throw accountError

  // ── 5. Upsert account_tenants at the requested status ──────────────────
  // Full UNIQUE(account_id, tenant_id) constraint → onConflict is valid
  // (supabase-patterns Pattern 3 — not a partial index).
  const { error: tenantError } = await adminClient
    .from('account_tenants')
    .upsert(
      { account_id: invitedUserId, tenant_id: tenantId, role: input.role, status: input.status },
      { onConflict: 'account_id,tenant_id' },
    )
  if (tenantError) throw tenantError

  return {
    email,
    outcome: alreadyThisTenant ? 'updated' : 'created',
    status: input.status,
  }
}

/** Branded Resend invite email (extracted verbatim from invite-member, parameterised). */
export function buildInviteEmailHtml(clubName: string, inviteLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#1c1c1c;padding:32px 40px;">
            <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#888;font-weight:600;">Tactical Ride Intelligence</p>
            <h1 style="margin:8px 0 0;font-size:36px;font-weight:900;font-style:italic;letter-spacing:-0.04em;color:#ffffff;">VECHELON</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <h2 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#1c1c1c;letter-spacing:-0.02em;">You've been invited to ride.</h2>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#444;">
              Your club admin has added you to the <strong>${clubName}</strong> portal on Vechelon — the tactical command centre for serious group rides.
            </p>
            <p style="margin:0 0 32px;font-size:15px;line-height:1.7;color:#444;">
              Once you accept, you'll have access to the ride calendar, route library, live ride tracking, and RSVP tools — everything your club needs to ride together, faster and smarter.
            </p>
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
        <tr>
          <td style="background:#f9f9f9;border-top:1px solid #eee;padding:24px 40px;">
            <p style="margin:0 0 8px;font-size:12px;color:#999;line-height:1.6;">
              This invitation was sent by your club admin at <strong>${clubName}</strong>. If you weren't expecting this, you can safely ignore it — no account will be created unless you click the link above.
            </p>
            <p style="margin:0;font-size:11px;color:#bbb;letter-spacing:0.15em;text-transform:uppercase;">Vechelon · Tactical Ride Intelligence · vechelon.ca</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Host-aware portal URL derivation (extracted from invite-member): legacy
 * productdelivered.ca runs the SPA under /portal; *.vechelon.ca runs at root.
 */
export function derivePortalUrl(req: Request): string {
  let origin: string | null = req.headers.get('origin')
  if (!origin) {
    const referer = req.headers.get('referer')
    if (referer) {
      try { origin = new URL(referer).origin } catch { /* ignore */ }
    }
  }
  if (origin) {
    let hostname = ''
    try { hostname = new URL(origin).hostname } catch { /* ignore */ }
    const isLegacyHost = hostname === 'vechelon.productdelivered.ca'
    return isLegacyHost ? `${origin}/portal` : origin
  }
  // Deno global is available in the edge runtime.
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env
  return env?.get('PORTAL_URL') ?? 'https://vechelon.productdelivered.ca/portal'
}
