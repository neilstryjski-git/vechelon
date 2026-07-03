import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  provisionMember,
  lookupMembership,
  derivePortalUrl,
  CROSS_CLUB_MESSAGE,
  type ProvisionResult,
} from '../_shared/member-provision.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * bulk-create-members edge function (W216)
 *
 * Admin-only. Loads a known roster onto the admin's own tenant from a parsed
 * CSV (the admin portal parses the file client-side and posts a JSON array).
 *
 * Per spec docs/bulk-member-import-spec.md:
 *  - hard cap 99 rows
 *  - rows with name AND phone -> affiliated; otherwise -> initiated
 *  - per-row report (created / created-incomplete / skipped / failed)
 *  - cross-club email rejected WITHOUT naming the other club
 *  - partial success: one bad row never aborts the batch
 *  - reuses invite-member's per-row logic via _shared/member-provision.ts
 */

const MAX_ROWS = 99
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface MemberRow {
  name?: string
  email?: string
  phone?: string
  role?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
}

interface RowReport {
  row: number // 1-based index in the submitted batch
  email: string
  result:
    | 'created-affiliated'
    | 'created-initiated'
    | 'skipped-already-member'
    | 'skipped-duplicate'
    | 'failed'
  reason?: string
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 1. Authenticate the caller ─────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) throw new Error('Unauthorized')

    // ── 2. Verify admin role and resolve tenant ────────────────────────────
    const { data: adminRow, error: adminError } = await userClient
      .from('account_tenants')
      .select('tenant_id, role')
      .eq('account_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()
    if (adminError || !adminRow) {
      throw new Error('Permission denied: only admins can import members')
    }
    const tenantId = adminRow.tenant_id

    // ── 3. Parse + validate the batch ──────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const members: MemberRow[] = Array.isArray(body?.members) ? body.members : []
    const sendEmail: boolean = body?.sendEmail !== false // default true (known-roster import)
    // Dry run: validate + DB-check every row (cross-club / already-member) WITHOUT
    // writing accounts/account_tenants or sending email — powers the pre-submit preview.
    const dryRun: boolean = body?.dryRun === true

    if (members.length === 0) {
      return json({ error: 'No members provided.' }, 400)
    }
    if (members.length > MAX_ROWS) {
      return json({ error: `Too many rows: ${members.length}. The import is capped at ${MAX_ROWS} per file.` }, 400)
    }

    // Service-role client for cross-tenant lookups + privileged writes.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: tenant } = await adminClient
      .from('tenants').select('name').eq('id', tenantId).maybeSingle()
    const clubName = tenant?.name || 'Vechelon'
    const portalUrl = derivePortalUrl(req)

    // ── 4. Per-row provisioning (collect, never abort the batch) ────────────
    const reports: RowReport[] = []
    const seen = new Set<string>()

    for (let i = 0; i < members.length; i++) {
      const raw = members[i]
      const rowNum = i + 1
      const email = clean(raw.email).toLowerCase()
      const name = clean(raw.name)
      const phone = clean(raw.phone)

      if (!email || !EMAIL_RE.test(email)) {
        reports.push({ row: rowNum, email, result: 'failed', reason: 'Missing or invalid email.' })
        continue
      }
      if (seen.has(email)) {
        reports.push({ row: rowNum, email, result: 'skipped-duplicate', reason: 'Duplicate email in this file.' })
        continue
      }
      seen.add(email)

      // Status gate: full contact details -> affiliated, else initiated.
      const status: 'affiliated' | 'initiated' = name && phone ? 'affiliated' : 'initiated'
      const role: 'admin' | 'member' = clean(raw.role).toLowerCase() === 'admin' ? 'admin' : 'member'

      // Dry-run: DB-check only (cross-club / already-member), no writes/email.
      if (dryRun) {
        try {
          const { alreadyThisTenant, crossClub } = await lookupMembership(adminClient, tenantId, email)
          if (crossClub) {
            reports.push({ row: rowNum, email, result: 'failed', reason: CROSS_CLUB_MESSAGE })
          } else if (alreadyThisTenant) {
            reports.push({ row: rowNum, email, result: 'skipped-already-member', reason: 'Already a member of this club.' })
          } else {
            reports.push({ row: rowNum, email, result: status === 'affiliated' ? 'created-affiliated' : 'created-initiated' })
          }
        } catch (err) {
          reports.push({ row: rowNum, email, result: 'failed', reason: (err as Error).message })
        }
        continue
      }

      try {
        const r: ProvisionResult = await provisionMember(
          { adminClient, tenantId, clubName, portalUrl },
          {
            email,
            role,
            name: name || null,
            phone: phone || null,
            emergencyContactName: clean(raw.emergency_contact_name) || null,
            emergencyContactPhone: clean(raw.emergency_contact_phone) || null,
            status,
            sendEmail,
            skipExisting: true,
          },
        )

        if (r.outcome === 'failed_cross_club') {
          reports.push({ row: rowNum, email, result: 'failed', reason: r.message })
        } else if (r.outcome === 'skipped_existing') {
          reports.push({ row: rowNum, email, result: 'skipped-already-member', reason: r.message })
        } else {
          reports.push({
            row: rowNum,
            email,
            result: status === 'affiliated' ? 'created-affiliated' : 'created-initiated',
          })
        }
      } catch (err) {
        reports.push({ row: rowNum, email, result: 'failed', reason: (err as Error).message })
      }
    }

    // ── 5. Summary + report ────────────────────────────────────────────────
    const summary = reports.reduce<Record<string, number>>((acc, r) => {
      acc[r.result] = (acc[r.result] ?? 0) + 1
      return acc
    }, {})

    return json({ success: true, dryRun, total: members.length, summary, reports }, 200)
  } catch (err) {
    return json({ error: (err as Error).message }, 400)
  }
})

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}
