// Mirror of supabase/functions/_shared/redirectAllowlist.ts — keep in sync (D96).
//
// D96: send-magic-link wraps the real one-time token in a click-through URL
// built from the caller-supplied redirectTo origin. Without this check anyone
// could request a link for a victim's email with redirectTo=https://evil/ and
// receive the victim's token when they click the genuine Vechelon email.
// Supabase's uri_allow_list does NOT protect this path: the wrapper URL is
// built before Supabase sees redirectTo. This list mirrors the union of the
// prod + staging Auth uri_allow_list hosts — keep it in step with them.

const HTTPS_EXACT_HOSTS = new Set([
  'vechelon.ca',
  'vechelon.productdelivered.ca',      // legacy prod portal host
  'vechelon-rail3-staging.vercel.app', // staging Race Control alias
]);

// Any depth under vechelon.ca: tenant subdomains, *.preview, *.staging.
const HTTPS_HOST_SUFFIX = '.vechelon.ca';

// Local dev only (vite default port). A token sent here reaches the victim's
// own machine, never an attacker.
const HTTP_DEV_HOSTS = new Set(['localhost:5173']);

// Native callers receive a 6-digit code in the email, never a clickable link,
// so a deep-link redirectTo cannot carry a token anywhere. Limit to our app's
// scheme plus the Expo dev-client schemes used under `expo start`.
const DEEP_LINK_PROTOCOLS = new Set(['rail3:', 'exp:', 'exps:']);

export type RedirectKind = 'web' | 'deep_link';

/**
 * Returns the kind of an allowed redirectTo, or null if it must be rejected.
 * Hosts are compared exactly or by dotted suffix — never by substring.
 */
export function classifyRedirect(raw: unknown): RedirectKind | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  // userinfo tricks: https://vechelon.ca@evil.com/
  if (url.username || url.password) return null;

  const protocol = url.protocol.toLowerCase();

  if (DEEP_LINK_PROTOCOLS.has(protocol)) return 'deep_link';

  // url.hostname is already lowercased + IDNA-normalised by the URL parser.
  const host = url.hostname.replace(/\.$/, '');

  if (protocol === 'https:') {
    if (url.port !== '') return null;
    if (HTTPS_EXACT_HOSTS.has(host)) return 'web';
    if (host.endsWith(HTTPS_HOST_SUFFIX) && host.length > HTTPS_HOST_SUFFIX.length) return 'web';
    return null;
  }

  if (protocol === 'http:') {
    return HTTP_DEV_HOSTS.has(url.host) ? 'web' : null;
  }

  return null;
}
