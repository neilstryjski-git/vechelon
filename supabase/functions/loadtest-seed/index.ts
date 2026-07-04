import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-loadtest-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * loadtest-seed — STAGING-ONLY synthetic fleet seeder (W180 load-test harness).
 *
 * Stands up a throwaway "LOADTEST <runTag>" ride and N fake riders with a role
 * composition (default { captains: 2, sag: 2, riders: 16 } = 20) so the Node
 * harness can drive Supabase Broadcast fan-out at fleet scale. Model C: fake
 * riders are REAL rows in the REAL render pipeline, not a demo-only draw path.
 *
 * Why service_role: markers are ROSTER-GATED (useFleetPositions drops any pos
 * from a rider with no ride_participants row) and channel send/receive is
 * tenant-gated (W170 → account_tenants must match the ride's tenant). accounts.id
 * FKs auth.users, so fake riders can only be minted with the admin API. There is
 * NO auto-provision trigger on auth.users here — accounts + account_tenants +
 * ride_participants are all created explicitly.
 *
 * SAFETY: gated on a shared secret (x-loadtest-secret == LOADTEST_SECRET). Never
 * deploy to production. Everything it creates is tagged (email loadtest+<runTag>-,
 * ride name "LOADTEST <runTag>") so loadtest-teardown can remove it cleanly.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // ── Secret gate (fail-closed) ──────────────────────────────────────────
    const expected = Deno.env.get('LOADTEST_SECRET') ?? ''
    if (!expected || req.headers.get('x-loadtest-secret') !== expected) {
      return json({ error: 'forbidden' }, 403)
    }

    const {
      captains = 2,
      sag = 2,
      riders = 16,
      tenantSlug = 'racer-sportif',
      password,
      // Ride start point (RS field-test area default). Only used to frame the map.
      lat = 44.2312,
      lng = -76.4860,
    } = (await req.json().catch(() => ({}))) as Record<string, number | string | undefined>

    const nCaptains = Number(captains) || 0
    const nSag = Number(sag) || 0
    const nRiders = Number(riders) || 0
    const total = nCaptains + nSag + nRiders
    if (total < 1) return json({ error: 'need at least one rider' }, 400)
    if (total > 500) return json({ error: 'refusing > 500 fake riders' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // ── Resolve tenant ─────────────────────────────────────────────────────
    const { data: tenant, error: tErr } = await admin
      .from('tenants')
      .select('id, name')
      .eq('slug', tenantSlug)
      .maybeSingle()
    if (tErr) throw tErr
    if (!tenant) return json({ error: `tenant not found: ${tenantSlug}` }, 400)
    const tenantId = tenant.id as string

    const runTag = `${Date.now()}`
    const pwd = (password as string) || `LoadTest!${runTag}`

    // ride_participant_role enum: captain / support / member. Map the composition.
    const plan: Array<{ role: 'captain' | 'support' | 'member'; label: string }> = [
      ...Array.from({ length: nCaptains }, () => ({ role: 'captain' as const, label: 'Captain' })),
      ...Array.from({ length: nSag }, () => ({ role: 'support' as const, label: 'Support' })),
      ...Array.from({ length: nRiders }, () => ({ role: 'member' as const, label: 'Rider' })),
    ]

    // ── Create fake identities (auth.users → accounts → account_tenants) ─────
    const perRole: Record<string, number> = {}
    const seeded: Array<{ accountId: string; email: string; role: string; displayName: string }> = []
    for (let i = 0; i < plan.length; i++) {
      const { role, label } = plan[i]
      perRole[role] = (perRole[role] ?? 0) + 1
      const displayName = `${label} ${perRole[role]}`
      const email = `loadtest+${runTag}-${i}@loadtest.vechelon.ca`

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: pwd,
        email_confirm: true,
        user_metadata: { loadtest: true, runTag },
      })
      if (cErr) throw new Error(`createUser ${email}: ${cErr.message}`)
      const accountId = created.user!.id

      const { error: aErr } = await admin
        .from('accounts')
        .insert({ id: accountId, email, name: displayName })
      if (aErr) throw new Error(`accounts insert ${email}: ${aErr.message}`)

      const { error: mErr } = await admin
        .from('account_tenants')
        .insert({ account_id: accountId, tenant_id: tenantId, role: 'member', status: 'affiliated' })
      if (mErr) throw new Error(`account_tenants insert ${email}: ${mErr.message}`)

      seeded.push({ accountId, email, role, displayName })
    }

    // ── Create the load-test ride ────────────────────────────────────────────
    const createdBy = (seeded.find((r) => r.role === 'captain') ?? seeded[0]).accountId
    const { data: ride, error: rErr } = await admin
      .from('rides')
      .insert({
        tenant_id: tenantId,
        name: `LOADTEST ${runTag}`,
        type: 'adhoc',
        status: 'active',
        start_coords: `(${lng},${lat})`, // Postgres point is (x=lng, y=lat)
        qr_code: `LOADTEST-${runTag}`,
        created_by: createdBy,
        actual_start: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (rErr) throw new Error(`rides insert: ${rErr.message}`)
    const rideId = ride.id as string

    // ── Roster rows (render gate) ────────────────────────────────────────────
    const partRows = seeded.map((r, i) => ({
      ride_id: rideId,
      account_id: r.accountId,
      display_name: r.displayName,
      phone: `+1613555${String(1000 + i).slice(-4)}`,
      role: r.role,
      status: 'active',
    }))
    const { error: pErr } = await admin.from('ride_participants').insert(partRows)
    if (pErr) throw new Error(`ride_participants insert: ${pErr.message}`)

    return json({
      ok: true,
      runTag,
      rideId,
      tenantId,
      tenantName: tenant.name,
      topic: `rail3:ride:${rideId}`,
      password: pwd,
      start: { lat, lng },
      composition: { captains: nCaptains, sag: nSag, riders: nRiders, total },
      riders: seeded,
    })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
