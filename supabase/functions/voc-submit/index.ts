import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type FeedbackType = 'bug' | 'feature-request'
type FeedbackTheme = 'navigation' | 'performance' | 'ride-management' | 'membership-admin' | 'other'

const VALID_TYPES    = new Set<string>(['bug', 'feature-request'])
const VALID_THEMES   = new Set<string>(['navigation', 'performance', 'ride-management', 'membership-admin', 'other'])
const RATE_LIMIT_MIN = 12  // 5 per hour = 1 per 12 minutes

/**
 * voc-submit edge function (W130 / MT-S0-10)
 *
 * Accepts authenticated VoC feedback from affiliated riders and opens a
 * GitHub Issue with the appropriate labels. Rate-limited to 5/hour per
 * account (1 per 12 minutes) using last_voc_submission timestamp.
 *
 * PAT stored as vault secret 'github_voc_pat' with issues:write scope.
 * Club slug derived server-side from account_tenants (CP-VoC-02).
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 1. JWT validation ───────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // ── 2. Affiliation check ────────────────────────────────────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: memberships } = await adminClient
      .from('account_tenants')
      .select('status, tenant_id')
      .eq('account_id', user.id)
      .eq('status', 'affiliated')
      .limit(1)

    const membership = memberships?.[0] ?? null

    if (!membership) {
      return json({ error: 'Affiliation required to submit feedback' }, 403)
    }

    // ── 3. Rate limit ───────────────────────────────────────────────────────
    const { data: account } = await adminClient
      .from('accounts')
      .select('last_voc_submission')
      .eq('id', user.id)
      .maybeSingle()

    if (account?.last_voc_submission) {
      const ageMs  = Date.now() - new Date(account.last_voc_submission).getTime()
      const ageMin = ageMs / 60_000
      if (ageMin < RATE_LIMIT_MIN) {
        const waitMin = Math.ceil(RATE_LIMIT_MIN - ageMin)
        return json(
          { error: `Please wait before submitting again (${waitMin} min remaining)` },
          429
        )
      }
    }

    // ── 4. Payload validation ───────────────────────────────────────────────
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Invalid JSON body' }, 400)

    const { type, theme, title, detail } = body as {
      type?: string; theme?: string; title?: string; detail?: string
    }

    if (!type || !VALID_TYPES.has(type)) {
      return json({ error: 'type must be "bug" or "feature-request"' }, 400)
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return json({ error: 'title is required' }, 400)
    }
    const trimmedTitle  = title.trim().slice(0, 200)
    const trimmedDetail = typeof detail === 'string' ? detail.trim().slice(0, 2000) : ''
    const validTheme    = theme && VALID_THEMES.has(theme) ? theme as FeedbackTheme : null

    // ── 5. Derive tenant slug server-side ───────────────────────────────────
    const { data: tenant } = await adminClient
      .from('tenants')
      .select('slug')
      .eq('id', membership.tenant_id)
      .maybeSingle()

    const clubLabel = tenant?.slug ? `club:${tenant.slug}` : null

    // ── 6. Fetch GitHub PAT from Vault via SECURITY DEFINER helper ─────────
    // vault schema is not exposed via PostgREST — schema('vault').from() fails.
    const { data: ghPat, error: ghPatError } = await adminClient
      .rpc('get_github_voc_pat')

    if (ghPatError || !ghPat) {
      console.error('[voc-submit] github_voc_pat not found in vault', ghPatError)
      return json({ error: 'Something went wrong, please try again' }, 500)
    }

    // ── 7. Build and POST GitHub Issue ─────────────────────────────────────
    const labels: string[] = [
      `type:${type}`,
      'source:voc',
      ...(validTheme ? [`theme:${validTheme}`] : []),
      ...(clubLabel ? [clubLabel] : []),
    ]

    const issueBody = trimmedDetail
      ? `${trimmedDetail}`
      : '_No additional detail provided._'

    const ghResp = await fetch(
      'https://api.github.com/repos/neilstryjski-git/vechelon/issues',
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${ghPat}`,
          'Content-Type': 'application/json',
          'User-Agent': 'vechelon-voc-submit/1.0',
        },
        body: JSON.stringify({ title: trimmedTitle, body: issueBody, labels }),
      }
    )

    if (!ghResp.ok) {
      const ghErr = await ghResp.text().catch(() => '')
      console.error('[voc-submit] GitHub API error', ghResp.status, ghErr)
      return json({ error: 'Something went wrong, please try again' }, 500)
    }

    const ghData = await ghResp.json()

    // ── 8. Update rate-limit clock (only on success) ────────────────────────
    await adminClient
      .from('accounts')
      .update({ last_voc_submission: new Date().toISOString() })
      .eq('id', user.id)

    return json({ success: true, issue_number: ghData.number, issue_url: ghData.html_url }, 200)

  } catch (err) {
    console.error('[voc-submit] unhandled error:', err)
    return json({ error: 'Something went wrong, please try again' }, 500)
  }
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}
