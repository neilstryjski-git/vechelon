import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

/**
 * rider-hash edge function (W133)
 *
 * Returns a deterministic 12-char base32 HMAC-SHA256 hash for the calling
 * authenticated user. The hash is stable across sessions (same user always
 * gets the same hash) and non-reversible client-side (secret lives in Vault).
 * Server-side reversal is possible via reverse_rider_hash(text) PL/pgSQL fn.
 *
 * Used as the ?ref= parameter in rider-shared ride URLs so H5 attribution
 * can credit the sharer without exposing their identity in the URL.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verify JWT — user-scoped client resolves the caller's identity
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Fetch Vault secret via service role
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: vaultRow, error: vaultError } = await adminClient
      .schema('vault')
      .from('decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', 'rider_hash_secret')
      .maybeSingle()

    if (vaultError || !vaultRow?.decrypted_secret) {
      throw new Error('rider_hash_secret not configured')
    }

    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(vaultRow.decrypted_secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(user.id))

    // RFC 4648 Base32 encode
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const bytes = new Uint8Array(signature)
    let bits = 0
    let value = 0
    let encoded = ''
    for (const byte of bytes) {
      value = (value << 8) | byte
      bits += 8
      while (bits >= 5) {
        encoded += CHARS[(value >>> (bits - 5)) & 31]
        bits -= 5
      }
    }
    if (bits > 0) {
      encoded += CHARS[(value << (5 - bits)) & 31]
    }

    return new Response(
      JSON.stringify({ hash: encoded.slice(0, 12).toLowerCase() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
