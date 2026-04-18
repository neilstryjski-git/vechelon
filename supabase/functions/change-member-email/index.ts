import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * change-member-email edge function
 *
 * Fulfills W82: Change member email via Supabase admin API.
 * Client-side RLS cannot touch auth.users, so this function uses the
 * service role to call auth.admin.updateUserById, then mirrors the new
 * email onto the public.accounts row.
 *
 * Only tenant admins may call this. The target account must belong to
 * the same tenant as the calling admin.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 1. Authenticate the calling admin ─────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
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
      throw new Error('Permission denied: only admins can change member emails')
    }

    const tenantId = adminRow.tenant_id

    // ── 3. Parse and validate request body ────────────────────────────────
    const { account_id, email } = await req.json()

    if (!account_id || typeof account_id !== 'string') {
      throw new Error('account_id is required')
    }
    if (!email || typeof email !== 'string') {
      throw new Error('email is required')
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('Invalid email address')
    }

    // ── 4. Verify the target belongs to the same tenant ───────────────────
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: targetRow, error: targetError } = await adminClient
      .from('account_tenants')
      .select('account_id, status')
      .eq('account_id', account_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (targetError || !targetRow) {
      throw new Error('Member not found in your tenant')
    }

    // ── 5. Check email is not already taken by another auth user ──────────
    const { data: existing } = await adminClient
      .from('accounts')
      .select('id')
      .eq('email', normalizedEmail)
      .neq('id', account_id)
      .maybeSingle()

    if (existing) {
      throw new Error('That email address is already in use')
    }

    // ── 6. Update auth.users via admin API ────────────────────────────────
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
      account_id,
      { email: normalizedEmail }
    )

    if (authUpdateError) throw authUpdateError

    // ── 7. Mirror onto public.accounts ────────────────────────────────────
    const { error: accountsError } = await adminClient
      .from('accounts')
      .update({ email: normalizedEmail })
      .eq('id', account_id)

    if (accountsError) throw accountsError

    return new Response(JSON.stringify({ success: true, email: normalizedEmail }), {
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
