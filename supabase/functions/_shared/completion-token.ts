// Shared completion-token helpers (W252 / Goal G31).
//
// A phone-shell completion link carries a high-entropy RAW token in its URL; the
// database stores only an HMAC-SHA256 hash of that token (pending_members.token_hash).
// Mirrors the rider-hash pattern: the HMAC secret lives in Vault and is read via the
// get_completion_token_secret() SECURITY DEFINER RPC (never exposed to clients).
//
// Reused by W253 (complete-profile-submit): hashToken(submittedRaw, secret) and look
// up the shell by the resulting hash. The DB lookup IS the verification — a raw token
// that does not hash to a stored, still-pending, unexpired row is rejected.

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567' // RFC 4648, lowercased, URL-safe

function base32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * High-entropy (256-bit), URL-safe raw token. Goes in the completion link and is
 * NEVER persisted — only its HMAC hash is stored.
 */
export function generateRawToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base32(bytes)
}

/**
 * Deterministic HMAC-SHA256 hash (hex) of a raw token under the Vault secret.
 * THIS is what pending_members.token_hash stores and what W253 looks up by.
 */
export async function hashToken(rawToken: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawToken))
  return toHex(sig)
}
