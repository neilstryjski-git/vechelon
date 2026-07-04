import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-loadtest-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * loadtest-teardown — removes what loadtest-seed created (W180 harness).
 *
 * Positions are broadcast-only and never stored (privacy posture), so the only
 * persistent residue is the ride, its roster, and any beacon/breadcrumb the run
 * produced — plus the fake accounts + auth users. accounts.id → auth.users is
 * ON DELETE NO ACTION, so accounts rows must be deleted BEFORE the auth users.
 *
 * Target one run with { runTag }, one ride with { rideId }, or every leftover
 * with { all: true }. Secret-gated (x-loadtest-secret). Staging-only.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const expected = Deno.env.get('LOADTEST_SECRET') ?? ''
    if (!expected || req.headers.get('x-loadtest-secret') !== expected) {
      return json({ error: 'forbidden' }, 403)
    }

    const { runTag, rideId, all = false } = (await req.json().catch(() => ({}))) as {
      runTag?: string
      rideId?: string
      all?: boolean
    }
    if (!runTag && !rideId && !all) {
      return json({ error: 'pass runTag, rideId, or all:true' }, 400)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ── Resolve target rides ─────────────────────────────────────────────────
    let rideQ = admin.from('rides').select('id')
    if (rideId) rideQ = rideQ.eq('id', rideId)
    else if (runTag) rideQ = rideQ.eq('name', `LOADTEST ${runTag}`)
    else rideQ = rideQ.like('name', 'LOADTEST %')
    const { data: rides, error: rQErr } = await rideQ
    if (rQErr) throw rQErr
    const rideIds = (rides ?? []).map((r) => r.id as string)

    // ── Resolve target fake accounts ─────────────────────────────────────────
    const emailPattern = runTag ? `loadtest+${runTag}-%` : 'loadtest+%'
    const { data: accts, error: aQErr } = await admin
      .from('accounts')
      .select('id')
      .like('email', emailPattern)
    if (aQErr) throw aQErr
    const acctIds = (accts ?? []).map((a) => a.id as string)

    // ── Delete ride-scoped rows (broadcast is never stored; these are the residue) ──
    if (rideIds.length) {
      for (const table of ['rail3_breadcrumb', 'beacon_alerts', 'rider_states', 'ride_participants']) {
        const { error } = await admin.from(table).delete().in('ride_id', rideIds)
        if (error) throw new Error(`delete ${table}: ${error.message}`)
      }
      const { error: rDel } = await admin.from('rides').delete().in('id', rideIds)
      if (rDel) throw new Error(`delete rides: ${rDel.message}`)
    }

    // ── Delete identities: memberships + any stray participant rows, then
    //    accounts, THEN the auth users (FK is NO ACTION → accounts must go first). ──
    let deletedUsers = 0
    if (acctIds.length) {
      const { error: mDel } = await admin.from('account_tenants').delete().in('account_id', acctIds)
      if (mDel) throw new Error(`delete account_tenants: ${mDel.message}`)
      const { error: pDel } = await admin.from('ride_participants').delete().in('account_id', acctIds)
      if (pDel) throw new Error(`delete stray ride_participants: ${pDel.message}`)
      const { error: aDel } = await admin.from('accounts').delete().in('id', acctIds)
      if (aDel) throw new Error(`delete accounts: ${aDel.message}`)
      for (const id of acctIds) {
        const { error } = await admin.auth.admin.deleteUser(id)
        if (!error) deletedUsers++
      }
    }

    return json({
      ok: true,
      deletedRides: rideIds.length,
      deletedAccounts: acctIds.length,
      deletedAuthUsers: deletedUsers,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
