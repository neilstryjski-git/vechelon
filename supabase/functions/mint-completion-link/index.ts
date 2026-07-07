import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateRawToken, hashToken } from '../_shared/completion-token.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * mint-completion-link edge function (W252, Goal G31)
 *
 * Admin-authed. Turns a phone number the club has into a shareable, single-use,
 * 7-day completion link WITHOUT any SMS provider — the admin copies the returned
 * URL and sends it by hand (SMS / WhatsApp). Two modes:
 *   - create: body { phone, name?, emergency_contact_name?, emergency_contact_phone? }
 *             -> inserts a pending_members shell for the caller's tenant.
 *   - re-mint: body { pending_member_id } -> rotates the token + expiry on an
 *             existing (still-pending or expired) shell, invalidating the old link.
 *
 * The RAW token is returned only inside the link and is never stored; only its
 * HMAC-SHA256 hash (pending_members.token_hash) is persisted. W253 validates a
 * submitted token by re-hashing and looking it up.
 *
 * verify_jwt=false: the JWT is verified manually here (mirrors admin-complete-guest /
 * invite-member) so the admin-role gate runs before any write. All writes use the
 * service-role client. Tenant is derived from the caller's own admin membership —
 * never trusted from the request body (no cross-tenant spoofing).
 *
 * supabase-patterns: Pattern 3 — the pending_members INSERT is a plain insert (no
 * partial-index upsert). Vault secret read via the get_completion_token_secret()
 * SECURITY DEFINER RPC (vault schema is not reachable through PostgREST).
 */

const TOKEN_TTL_DAYS = 7

const norm = (v: unknown): string | null =>
  typeof v === 'string' ? (v.trim() || null) : null

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 1. Authenticate the calling user ──────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    // ── 2. Verify admin role and resolve tenant (mirrors invite-member) ────
    const { data: adminRow, error: adminError } = await userClient
      .from('account_tenants')
      .select('tenant_id')
      .eq('account_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (adminError || !adminRow) {
      throw new Error('Permission denied: only tenant admins can create member shells')
    }
    const tenantId = adminRow.tenant_id

    // ── 3. Parse body ─────────────────────────────────────────────────────
    const {
      pending_member_id,
      phone,
      name,
      emergency_contact_name,
      emergency_contact_phone,
    } = await req.json().catch(() => ({}))

    // ── 4. Service-role client + Vault secret ─────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: secret, error: secretError } = await adminClient
      .rpc('get_completion_token_secret')
    if (secretError || !secret) throw new Error('completion_token_secret not configured')

    // ── 5. Mint the token (raw in the link, hash in the DB) ───────────────
    const rawToken = generateRawToken()
    const token_hash = await hashToken(rawToken, secret)
    // NOT NULL with no DB default (fail-closed) — always set it here.
    const expires_at = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000).toISOString()

    if (pending_member_id) {
      // Re-mint: rotate token + expiry, re-arm to pending. Scoped to the caller's
      // tenant; only a still-pending or expired shell can be re-minted (never a
      // completed/revoked one). Overwriting token_hash invalidates the old link.
      const { data: updated, error: updateError } = await adminClient
        .from('pending_members')
        .update({ token_hash, expires_at, status: 'pending' })
        .eq('id', pending_member_id)
        .eq('tenant_id', tenantId)
        .in('status', ['pending', 'expired'])
        .select('id')
        .maybeSingle()

      if (updateError) throw updateError
      if (!updated) throw new Error('No re-mintable pending member found for this club.')
    } else {
      // Create: phone is the only required field.
      const v_phone = norm(phone)
      if (!v_phone) throw new Error('phone is required')

      // Phone dedup — one phone per rider WITHIN this club. Tenant-scoped: the
      // same phone under a different email in another club is legitimate (dedicated
      // email per club), so only block when the number already belongs to a member
      // of THIS tenant, or to a still-pending shell in this tenant.
      const { data: canon } = await adminClient.rpc('normalize_phone', { raw: v_phone })
      if (canon) {
        const { data: acct } = await adminClient
          .from('accounts').select('name, email, account_tenants!inner(tenant_id)')
          .eq('phone', canon).eq('account_tenants.tenant_id', tenantId).limit(1)
        if (acct && acct.length > 0) {
          const o = acct[0] as { name: string | null; email: string }
          throw new Error(`That number already belongs to ${o.name || o.email}.`)
        }
        const { data: dupShell } = await adminClient
          .from('pending_members').select('name').eq('tenant_id', tenantId).eq('phone', canon).eq('status', 'pending').limit(1)
        if (dupShell && dupShell.length > 0) {
          const s = dupShell[0] as { name: string | null }
          throw new Error(`There's already a pending invite for that number${s.name ? ` (${s.name})` : ''}.`)
        }
      }

      const { error: insertError } = await adminClient
        .from('pending_members')
        .insert({
          tenant_id: tenantId,
          phone: v_phone,
          name: norm(name),
          emergency_contact_name: norm(emergency_contact_name),
          emergency_contact_phone: norm(emergency_contact_phone),
          token_hash,
          expires_at,
          created_by: user.id,
        })

      if (insertError) throw insertError
    }

    // ── 6. Build the host-aware completion URL (mirrors invite-member) ────
    // Legacy productdelivered.ca runs the SPA under /portal; *.vechelon.ca hosts
    // run at root. The public /complete-profile route must match Router's basename.
    let origin: string | null = req.headers.get('origin')
    if (!origin) {
      const referer = req.headers.get('referer')
      if (referer) {
        try { origin = new URL(referer).origin } catch { /* ignore */ }
      }
    }

    let portalBase: string
    if (origin) {
      let hostname = ''
      try { hostname = new URL(origin).hostname } catch { /* ignore */ }
      const isLegacyHost = hostname === 'vechelon.productdelivered.ca'
      portalBase = isLegacyHost ? `${origin}/portal` : origin
    } else {
      portalBase = Deno.env.get('PORTAL_URL') ?? 'https://vechelon.productdelivered.ca/portal'
    }

    const url = `${portalBase}/complete-profile?token=${rawToken}`

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
