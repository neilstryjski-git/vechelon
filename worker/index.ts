/**
 * Host + path router for the Vechelon web app on Cloudflare Workers static assets.
 * Reproduces the rules that lived in vercel.json (see docs/hosting-migration/inventory.md §2.1):
 *   - /admin/*                      → /portal/*            (308, all hosts)
 *   - /ride/*   on the legacy host  → /portal/ride/*       (307)
 *   - /         on the legacy host  → landing.html
 *   - <slug>.vechelon.ca/*          → /portal/index.html   (filesystem first, like Vercel)
 *   - /portal/* deep links          → /portal/index.html
 * Everything that matches a real file is served as-is (html_handling gives /prototype → /prototype.html).
 * Namespaced hosts (<name>.preview.vechelon.ca, <name>.staging.vechelon.ca, legacy.<ns>.vechelon.ca)
 * are treated like the production host they mimic — same rule the app applies client-side.
 */
export interface Env {
  ASSETS: { fetch(request: Request | URL | string): Promise<Response> };
}

const LEGACY_HOST = 'vechelon.productdelivered.ca';
const TENANT_SUFFIX = '.vechelon.ca';
const NAMESPACES = ['preview', 'staging'];

function effectiveHost(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  for (const ns of NAMESPACES) {
    const suffix = `.${ns}${TENANT_SUFFIX}`;
    if (host.endsWith(suffix)) {
      const name = host.slice(0, -suffix.length);
      if (name && !name.includes('.')) return name === 'legacy' ? LEGACY_HOST : `${name}${TENANT_SUFFIX}`;
    }
  }
  return host;
}

function isSlugHost(host: string): boolean {
  // Mirrors vercel.json: (?<slug>[a-z0-9-]+)\.vechelon\.ca — includes admin.vechelon.ca.
  return /^[a-z0-9-]+\.vechelon\.ca$/.test(host);
}

function redirect(url: URL, path: string, status: 307 | 308): Response {
  const target = new URL(url.toString());
  target.pathname = path;
  return Response.redirect(target.toString(), status);
}

async function asset(env: Env, url: URL, path?: string): Promise<Response> {
  const target = new URL(url.toString());
  if (path) { target.pathname = path; target.search = ''; }
  return env.ASSETS.fetch(target);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const host = effectiveHost(url.hostname);
    const path = url.pathname;

    // /admin → /portal (Vercel "permanent": true → 308)
    if (path === '/admin' || path === '/admin/') return redirect(url, '/portal/', 308);
    if (path.startsWith('/admin/')) return redirect(url, '/portal/' + path.slice('/admin/'.length), 308);

    if (host === LEGACY_HOST) {
      if (path.startsWith('/ride/')) return redirect(url, '/portal' + path, 307);
      if (path === '/') return asset(env, url, '/landing.html');
    }

    // Filesystem first, then the SPA shell.
    const direct = await asset(env, url);
    if (direct.status !== 404) return direct;

    if (isSlugHost(host) || path.startsWith('/portal/') || path === '/portal') {
      return asset(env, url, '/portal/index.html');
    }
    return direct;
  },
};
