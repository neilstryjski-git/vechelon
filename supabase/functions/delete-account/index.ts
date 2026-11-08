import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * delete-account edge function (W299 — Google Play User Data policy).
 *
 * Deletes the CALLER's own account, and nobody else's: the only identity it acts on is
 * the uid of the verified JWT. The request body is ignored entirely, so there is no
 * target id to tamper with.
 *
 * Retention (Sr PM decision 2026-11-07, recorded on W299 and in the migration
 * 20261108000000_w299_account_self_deletion.sql):
 *   - the club keeps rides / routes / ride-support rows, handed to a per-club SYSTEM
 *     OWNER ("Former member": no membership, no password, banned in auth);
 *   - ride participation is anonymised ("Deleted rider", contact + last position cleared);
 *   - account, memberships, avatar and the auth user are deleted;
 *   - blocked while the caller is the last admin of a club, or a platform admin.
 *
 * Order matters and every step is retry-safe: a failure part-way leaves a state the next
 * call finishes (the SQL routine is idempotent; deleting an absent auth user is a no-op).
 */

const SYSTEM_OWNER_NAME = 'Former member'
// ~100 years: the system owner can never sign in.
const SYSTEM_OWNER_BAN = '876000h'

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// Random per attempt, so the address can't be claimed in advance to block creation;
// registration identifies the owner by admin-only app_metadata, never by address.
function systemOwnerEmail(): string {
  return `former-member+${crypto.randomUUID()}@system.vechelon.invalid`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Retry-safe: register_system_owner finds the owner by its admin-only markers, so an
// earlier half-finished attempt is picked up. Deletion trusts only the registry (see the
// migration header for why).
async function ensureSystemOwner(admin: SupabaseClient, tenantId: string): Promise<void> {
  if (!UUID_RE.test(tenantId)) throw new Error('bad tenant id')
  const { data: existing, error: lookupErr } = await admin
    .from('tenant_system_owners').select('account_id').eq('tenant_id', tenantId).maybeSingle()
  if (lookupErr) throw new Error('system owner lookup failed')
  if (existing) return

  // If an earlier attempt created the user but died before registering it, registration
  // finds that user; this one then stays an unused, banned, membership-less identity.
  const { error: createErr } = await admin.auth.admin.createUser({
    email: systemOwnerEmail(),
    email_confirm: true,
    ban_duration: SYSTEM_OWNER_BAN,
    // app_metadata is admin-only, so it marks this identity as ours (users can edit
    // user_metadata themselves).
    app_metadata: { system_owner: true, tenant_id: tenantId },
    user_metadata: { name: SYSTEM_OWNER_NAME },
  })

  if (createErr) console.error('[delete-account] system owner createUser:', createErr.message)

  const { error: regErr } = await admin.rpc('register_system_owner', { p_tenant_id: tenantId })
  if (regErr) throw new Error('could not register system owner')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // ── 1. Authenticate: the verified JWT's uid is the ONLY identity acted on ───────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'unauthorized' }, 401)
  const uid = user.id

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    // ── 2. Preflight: blocks + which clubs need a system owner ────────────────────────
    const { data: pre, error: preErr } = await admin.rpc('account_deletion_preflight', { p_uid: uid })
    if (preErr || !pre) throw new Error('preflight failed')

    if (pre.platform_admin) {
      return json({
        error: 'platform_admin',
        message: 'Platform admin accounts can’t be deleted from the app. Contact Vechelon support.',
      }, 409)
    }
    const lastAdminOf = (pre.last_admin_of ?? []) as { name: string }[]
    if (lastAdminOf.length > 0) {
      // Names only the caller's OWN clubs — no information about anyone else.
      return json({
        error: 'last_admin',
        clubs: lastAdminOf.map((c) => c.name),
        message: 'You’re the only organiser of ' + lastAdminOf.map((c) => c.name).join(', ') +
          '. Make another member an organiser first, then delete your account.',
      }, 409)
    }

    // ── 3. System owners for clubs whose records will be handed over ──────────────────
    for (const tenantId of (pre.owner_tenants ?? []) as string[]) {
      await ensureSystemOwner(admin, tenantId)
    }

    // ── 4. Reassign / anonymise / delete rows (one transaction, re-checks the blocks) ─
    const { error: delErr } = await admin.rpc('delete_account_data', { p_uid: uid })
    if (delErr) {
      if (delErr.message === 'last_admin' || delErr.message === 'platform_admin') {
        return json({ error: delErr.message, message: 'Your account can’t be deleted right now.' }, 409)
      }
      throw new Error('delete failed')
    }

    // ── 5. Avatar objects under avatars/<uid>/ (uid is a verified UUID, not user input) ─
    //    Fails BEFORE the auth user goes, so the user can still sign in and retry.
    if (UUID_RE.test(uid)) {
      const { data: files, error: listErr } = await admin.storage.from('avatars').list(uid)
      if (listErr) throw new Error('avatar list failed')
      const paths = (files ?? []).map((f) => `${uid}/${f.name}`)
      if (paths.length > 0) {
        const { error: rmErr } = await admin.storage.from('avatars').remove(paths)
        if (rmErr) throw new Error('avatar removal failed')
      }
    }

    // ── 6. The auth user (sessions + identities go with it) ───────────────────────────
    const { error: authDelErr } = await admin.auth.admin.deleteUser(uid)
    if (authDelErr && !/not.?found/i.test(authDelErr.message)) throw new Error('auth delete failed')

    return json({ deleted: true }, 200)
  } catch (err) {
    console.error('[delete-account]', (err as Error).message)
    return json({ error: 'deletion_failed', message: 'Something went wrong. Please try again.' }, 500)
  }
})
