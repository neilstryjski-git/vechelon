// D96: AuthPage helpers that keep the sign-in page from being an open redirect.

/**
 * Decodes the ?c= click-through payload and returns it ONLY if it is this
 * project's own Supabase Auth verify endpoint. Anything else (attacker URL,
 * javascript:, malformed base64) returns null and AuthPage falls through to
 * the normal sign-in form.
 *
 * send-magic-link sets c = btoa(generateLink().action_link), which is always
 * `${SUPABASE_URL}/auth/v1/verify?token=…&type=magiclink&redirect_to=…`.
 */
export function decodeVerifyLink(encoded: string | null, supabaseUrl: string | undefined): string | null {
  if (!encoded || !supabaseUrl) return null;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }

  let target: URL;
  let expected: URL;
  try {
    target = new URL(decoded);
    expected = new URL(supabaseUrl);
  } catch {
    return null;
  }

  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && expected.protocol === 'http:')) return null;
  if (target.username || target.password) return null;
  if (target.origin !== expected.origin) return null;
  if (target.pathname.replace(/\/+$/, '') !== '/auth/v1/verify') return null;

  return target.toString();
}

/**
 * Restricts the post-sign-in ?redirectTo= to a same-site path. Rejects absolute
 * URLs, protocol-relative `//host`, and backslash variants browsers normalise
 * to `//`. Falls back to '/'.
 */
export function safeInternalPath(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f]/.test(raw)) return '/';
  return raw;
}
