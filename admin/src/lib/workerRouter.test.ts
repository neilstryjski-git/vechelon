// Unit tests for the Cloudflare Worker host/path router (worker/index.ts at the repo root).
// The ASSETS binding is stubbed: it "has" the files that exist in dist_production and
// records which pathname was requested, so each rule's request→asset mapping is asserted.
import { describe, it, expect } from 'vitest';
import worker, { effectiveHost, isSlugHost } from '../../../worker/index';

const EXISTING = new Set([
  '/landing.html', '/prototype.html', '/roadmap.html', '/privacy.html',
  '/portal/index.html', '/portal/assets/index-abc.js', '/racer-sportif-logo.png',
  '/.well-known/assetlinks.json',
]);

function makeEnv() {
  const requested: string[] = [];
  const ASSETS = {
    async fetch(input: Request | URL | string) {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      requested.push(url.pathname);
      return EXISTING.has(url.pathname)
        ? new Response('ok', { status: 200 })
        : new Response('not found', { status: 404 });
    },
  };
  return { env: { ASSETS }, requested };
}

async function route(host: string, path: string) {
  const { env, requested } = makeEnv();
  const res = await worker.fetch(new Request(`https://${host}${path}`), env);
  return { status: res.status, location: res.headers.get('location'), requested };
}

describe('effectiveHost / isSlugHost', () => {
  it('maps namespaces onto production hosts', () => {
    expect(effectiveHost('racer-sportif.preview.vechelon.ca')).toBe('racer-sportif.vechelon.ca');
    expect(effectiveHost('legacy.staging.vechelon.ca')).toBe('vechelon.productdelivered.ca');
    expect(effectiveHost('admin.vechelon.ca')).toBe('admin.vechelon.ca');
    expect(effectiveHost('vechelon-web.productdelivered.workers.dev')).toBe('vechelon-web.productdelivered.workers.dev');
  });
  it('matches the vercel.json slug-host regex, including admin', () => {
    expect(isSlugHost('racer-sportif.vechelon.ca')).toBe(true);
    expect(isSlugHost('admin.vechelon.ca')).toBe(true);
    expect(isSlugHost('vechelon.ca')).toBe(false);
    expect(isSlugHost('vechelon.productdelivered.ca')).toBe(false);
  });
});

describe('router rules (vercel.json parity)', () => {
  it('/admin and /admin/* → /portal/* with 308 on every host', async () => {
    expect(await route('racer-sportif.vechelon.ca', '/admin/')).toMatchObject({ status: 308, location: 'https://racer-sportif.vechelon.ca/portal/' });
    expect(await route('vechelon.productdelivered.ca', '/admin/rides')).toMatchObject({ status: 308, location: 'https://vechelon.productdelivered.ca/portal/rides' });
    expect(await route('legacy.preview.vechelon.ca', '/admin')).toMatchObject({ status: 308, location: 'https://legacy.preview.vechelon.ca/portal/' });
  });

  it('legacy host: / serves landing.html', async () => {
    const r = await route('vechelon.productdelivered.ca', '/');
    expect(r.status).toBe(200);
    expect(r.requested).toEqual(['/landing.html']);
  });

  it('legacy host: /ride and /ride/* → /portal/ride/* with 307; other hosts untouched', async () => {
    expect(await route('vechelon.productdelivered.ca', '/ride/abc?source=social')).toMatchObject({ status: 307, location: 'https://vechelon.productdelivered.ca/portal/ride/abc?source=social' });
    expect(await route('legacy.preview.vechelon.ca', '/ride')).toMatchObject({ status: 307, location: 'https://legacy.preview.vechelon.ca/portal/ride/' });
    expect((await route('racer-sportif.vechelon.ca', '/ride/abc')).status).toBe(200); // slug host: SPA shell
  });

  it('slug hosts: filesystem first, then /portal/index.html for anything else', async () => {
    let r = await route('racer-sportif.vechelon.ca', '/');
    expect(r.status).toBe(200); expect(r.requested).toEqual(['/', '/portal/index.html']);
    r = await route('bikes-and-beers.preview.vechelon.ca', '/rides/123');
    expect(r.status).toBe(200); expect(r.requested.at(-1)).toBe('/portal/index.html');
    r = await route('racer-sportif.vechelon.ca', '/racer-sportif-logo.png');
    expect(r.status).toBe(200); expect(r.requested).toEqual(['/racer-sportif-logo.png']);
  });

  it('/portal/* deep links serve the SPA shell on every host', async () => {
    for (const host of ['vechelon.productdelivered.ca', 'admin.vechelon.ca', 'vechelon-web.productdelivered.workers.dev']) {
      const r = await route(host, '/portal/rides/42');
      expect(r.status).toBe(200); expect(r.requested.at(-1)).toBe('/portal/index.html');
    }
  });

  it('/prototype, /roadmap, /privacy resolve to their html files (html_handling) and /.well-known is served as-is', async () => {
    // html_handling is Cloudflare's job; the router must pass these through untouched.
    for (const p of ['/prototype.html', '/roadmap.html', '/privacy.html', '/.well-known/assetlinks.json']) {
      const r = await route('vechelon.productdelivered.ca', p);
      expect(r.status).toBe(200); expect(r.requested).toEqual([p]);
    }
  });

  it('unknown paths on the legacy host and on workers.dev 404 (no SPA shell outside /portal)', async () => {
    expect((await route('vechelon.productdelivered.ca', '/rides')).status).toBe(404);
    expect((await route('vechelon-web.productdelivered.workers.dev', '/')).status).toBe(404);
  });
});
