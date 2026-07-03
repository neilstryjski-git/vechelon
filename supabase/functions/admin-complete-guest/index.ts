import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * admin-complete-guest edge function (W230, guest-conversion scope)
 *
 * The Members "RSVP'd" tab lists guest RSVPs — ride_participants rows with
 * account_id IS NULL, identified only by email. Completing a guest's contact
 * details is not an UPDATE (like admin_update_member_contact does for real
 * members) — the guest has NO auth identity, and accounts is FK-synced to
 * auth.users, so a SQL RPC cannot create one. This EF provisions/links the
 * account via the auth admin API (mirroring invite-member), writes the contact
 * details, promotes to affiliated when name+phone are present, and stamps
 * account_id onto the guest's ride_participants rows so ride history connects
 * (same intent as D42 email-match / ensure_account_exists).
 *
 * Admin-only: the caller must be a tenant admin of the ride's tenant. No email
 * is sent — provisioning is silent; the guest lands on this account the next
 * time they magic-link with the same address. (Flip to a welcome link by
 * generating one via auth.admin.generateLink + Resend, as invite-member does.)
 *
 * supabase-patterns: Pattern 3 — account/account_tenants upserts target FULL
 * unique keys (accounts.id PK; account_tenants (account_id,tenant_id)), never a
 * partial index. The ride_participants link is a plain UPDATE, not an upsert.
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

    // ── 2. Parse request body ──────────────────────────────────────────────
    const { ride_participant_id, name, phone, emergency_contact_name, emergency_contact_phone } = await req.json()
    if (!ride_participant_id || typeof ride_participant_id !== 'string') {
      throw new Error('ride_participant_id is required')
    }

    const v_name    = typeof name === 'string' ? name.trim() || null : null
    const v_phone   = typeof phone === 'string' ? phone.trim() || null : null
    const v_ec_name = typeof emergency_contact_name === 'string' ? emergency_contact_name.trim() || null : null
    const v_ec_phone = typeof emergency_contact_phone === 'string' ? emergency_contact_phone.trim() || null : null

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // ── 3. Load the guest RSVP row and derive its tenant ───────────────────
    const { data: rp, error: rpError } = await adminClient
      .from('ride_participants')
      .select('id, email, account_id, ride_id')
      .eq('id', ride_participant_id)
      .maybeSingle()

    if (rpError) throw rpError
    if (!rp) {
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }
    if (rp.account_id) throw new Error('This RSVP is already linked to a member account.')
    if (!rp.email) throw new Error('This guest has no email on file, so a member account cannot be created.')

    const { data: ride, error: rideError } = await adminClient
      .from('rides')
      .select('tenant_id')
      .eq('id', rp.ride_id)
      .maybeSingle()
    if (rideError) throw rideError
    if (!ride) {
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    const tenantId = ride.tenant_id
    const normalizedEmail = String(rp.email).trim().toLowerCase()

    // ── 4. Verify the caller is an admin of THIS tenant ────────────────────
    const { data: adminRow, error: adminError } = await adminClient
      .from('account_tenants')
      .select('account_id')
      .eq('account_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .maybeSingle()

    if (adminError) throw adminError
    if (!adminRow) throw new Error('Permission denied: only tenant admins can add members.')

    // ── 5. Cross-club email validation (W127 / Pillar II §2.3) ─────────────
    // Reject an email already registered to a DIFFERENT tenant (dedicated email
    // per club, VMT-D-33). Error must not reveal the source club (CP-MT-06).
    const { data: existingAccount, error: lookupError } = await adminClient
      .from('accounts')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (lookupError) throw lookupError

    let accountId: string
    if (existingAccount) {
      const { data: sameTenantLink, error: linkError } = await adminClient
        .from('account_tenants')
        .select('account_id, status')
        .eq('account_id', existingAccount.id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (linkError) throw linkError

      if (!sameTenantLink) {
        return new Response(
          JSON.stringify({
            error: 'This email is already registered on the Vechelon platform. Please use a dedicated email for this club.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        )
      }
      accountId = existingAccount.id
    } else {
      // ── 6. Provision a new auth identity + accounts row ──────────────────
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
      })
      if (createError || !created?.user) throw new Error(`Could not create account: ${createError?.message ?? 'unknown error'}`)
      accountId = created.user.id

      const { error: acctError } = await adminClient
        .from('accounts')
        .upsert({ id: accountId, email: normalizedEmail }, { onConflict: 'id', ignoreDuplicates: true })
      if (acctError) throw acctError
    }

    // ── 7. Write contact details to the accounts profile ───────────────────
    // MERGE, don't clobber: only write columns the admin actually provided. An
    // existing member can re-RSVP anonymously (same email) and surface in the
    // RSVP'd tab; the guest modal prefills phone/emergency as null (they aren't
    // read from the account), so a blind overwrite would wipe a real member's
    // phone + emergency contact. For a freshly createUser'd account every prior
    // value is null, so this behaves identically to a full write.
    const patch: Record<string, string> = {}
    if (v_name) patch.name = v_name
    if (v_phone) patch.phone = v_phone
    if (v_ec_name) patch.emergency_contact_name = v_ec_name
    if (v_ec_phone) patch.emergency_contact_phone = v_ec_phone
    if (Object.keys(patch).length > 0) {
      const { error: updError } = await adminClient
        .from('accounts')
        .update(patch)
        .eq('id', accountId)
      if (updError) throw updError
    }

    // ── 8. Create/keep the tenant membership ───────────────────────────────
    // name+phone complete => affiliated (mirrors W216 import + W230 member rule);
    // otherwise initiated (pending). Never downgrade an existing affiliation.
    const { data: currentLink, error: currentLinkError } = await adminClient
      .from('account_tenants')
      .select('status')
      .eq('account_id', accountId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (currentLinkError) throw currentLinkError  // never downgrade on a failed read

    const wantAffiliated = !!v_name && !!v_phone
    let newStatus: 'affiliated' | 'initiated'
    if (currentLink?.status === 'affiliated') {
      newStatus = 'affiliated'
    } else {
      newStatus = wantAffiliated ? 'affiliated' : 'initiated'
    }

    const { error: linkUpsertError } = await adminClient
      .from('account_tenants')
      .upsert(
        { account_id: accountId, tenant_id: tenantId, role: 'member', status: newStatus },
        { onConflict: 'account_id,tenant_id' }
      )
    if (linkUpsertError) throw linkUpsertError

    // ── 9. Link this session's guest RSVPs to the account ──────────────────
    // Connect every anonymous RSVP in this tenant sharing the email so ride
    // history follows the new member (same intent as ensure_account_exists).
    const { data: tenantRides, error: ridesError } = await adminClient
      .from('rides')
      .select('id')
      .eq('tenant_id', tenantId)
    if (ridesError) throw ridesError
    const rideIds = (tenantRides ?? []).map((r: { id: string }) => r.id)

    if (rideIds.length > 0) {
      const { error: linkRpError } = await adminClient
        .from('ride_participants')
        .update({ account_id: accountId, role: 'member' })
        .is('account_id', null)
        .ilike('email', normalizedEmail)
        .in('ride_id', rideIds)
      if (linkRpError) throw linkRpError
    }

    return new Response(
      JSON.stringify({ success: true, status: newStatus }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
