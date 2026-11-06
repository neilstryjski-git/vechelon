import { describe, it, expect } from 'vitest';
// Tests the deployed edge-function module directly (pure TS) — no mirror copy.
import { classifyRedirect } from '../../../supabase/functions/_shared/redirectAllowlist';
import { decodeVerifyLink, safeInternalPath } from './authLinks';

describe('classifyRedirect (send-magic-link redirectTo allowlist, D96)', () => {
  it('accepts tenant, preview and staging subdomains of vechelon.ca', () => {
    expect(classifyRedirect('https://racer-sportif.vechelon.ca/auth')).toBe('web');
    expect(classifyRedirect('https://bikes-and-beers.vechelon.ca/auth?redirectTo=%2Fride%2F1')).toBe('web');
    expect(classifyRedirect('https://legacy.preview.vechelon.ca/portal/auth')).toBe('web');
    expect(classifyRedirect('https://racer-sportif.staging.vechelon.ca/auth')).toBe('web');
    expect(classifyRedirect('https://vechelon.ca/auth')).toBe('web');
  });

  it('accepts the legacy prod portal', () => {
    expect(classifyRedirect('https://vechelon.productdelivered.ca/portal/auth')).toBe('web');
  });

  it('rejects re-claimable third-party aliases and local dev origins', () => {
    expect(classifyRedirect('https://vechelon-rail3-staging.vercel.app/auth')).toBeNull();
    expect(classifyRedirect('http://localhost:5173/auth')).toBeNull();
  });

  it('normalises case, trailing dots and IDN before matching', () => {
    expect(classifyRedirect('HTTPS://Racer-Sportif.VECHELON.CA/auth')).toBe('web');
    expect(classifyRedirect('https://racer-sportif.vechelon.ca./auth')).toBe('web');
    // WHATWG parses a backslash as a path separator: host is vechelon.ca, and the
    // emailed link is rebuilt from the parsed origin, so this can only reach us.
    expect(classifyRedirect('https://vechelon.ca\\@evil.com/')).toBe('web');
    expect(classifyRedirect('https://evil.com\\.vechelon.ca/')).toBeNull();
    expect(classifyRedirect('https://xn--vechlon-gya.ca/auth')).toBeNull();
  });

  it('accepts native deep links (code-only email, no clickable token)', () => {
    expect(classifyRedirect('rail3://auth')).toBe('deep_link');
    expect(classifyRedirect('exp://192.168.1.20:8081/--/auth')).toBe('deep_link');
  });

  it('rejects foreign hosts and lookalikes', () => {
    expect(classifyRedirect('https://evil.example/')).toBeNull();
    expect(classifyRedirect('https://vechelon.ca.evil.com/auth')).toBeNull();
    expect(classifyRedirect('https://evilvechelon.ca/auth')).toBeNull();
    expect(classifyRedirect('https://productdelivered.ca/auth')).toBeNull();
    expect(classifyRedirect('https://other.productdelivered.ca/auth')).toBeNull();
    expect(classifyRedirect('https://attacker.vercel.app/auth')).toBeNull();
  });

  it('rejects userinfo, ports, plain http and script schemes', () => {
    expect(classifyRedirect('https://vechelon.ca@evil.com/')).toBeNull();
    expect(classifyRedirect('https://user:pw@racer-sportif.vechelon.ca/')).toBeNull();
    expect(classifyRedirect('https://racer-sportif.vechelon.ca:8443/auth')).toBeNull();
    expect(classifyRedirect('http://racer-sportif.vechelon.ca/auth')).toBeNull();
    expect(classifyRedirect('http://localhost:8080/auth')).toBeNull();
    expect(classifyRedirect('javascript:alert(1)')).toBeNull();
    expect(classifyRedirect('data:text/html,hi')).toBeNull();
  });

  it('rejects empty, non-string and unparsable input', () => {
    expect(classifyRedirect('')).toBeNull();
    expect(classifyRedirect(undefined)).toBeNull();
    expect(classifyRedirect(42)).toBeNull();
    expect(classifyRedirect('not a url')).toBeNull();
    expect(classifyRedirect('/auth')).toBeNull();
  });
});

describe('decodeVerifyLink (AuthPage ?c=, D96)', () => {
  const SB = 'https://abcdefgh.supabase.co';
  const enc = (s: string) => btoa(s);

  it('accepts the project verify link', () => {
    const link = `${SB}/auth/v1/verify?token=abc&type=magiclink&redirect_to=https%3A%2F%2Fracer-sportif.vechelon.ca%2Fauth`;
    expect(decodeVerifyLink(enc(link), SB)).toBe(link);
    expect(decodeVerifyLink(enc(link), `${SB}/`)).toBe(link);
  });

  it('rejects other origins, paths and schemes', () => {
    expect(decodeVerifyLink(enc('https://evil.example/auth/v1/verify?token=x'), SB)).toBeNull();
    expect(decodeVerifyLink(enc('https://other.supabase.co/auth/v1/verify?token=x'), SB)).toBeNull();
    expect(decodeVerifyLink(enc(`${SB}/rest/v1/accounts`), SB)).toBeNull();
    expect(decodeVerifyLink(enc('javascript:alert(document.cookie)'), SB)).toBeNull();
    expect(decodeVerifyLink(enc(`https://x@abcdefgh.supabase.co/auth/v1/verify`), SB)).toBeNull();
  });

  it('rejects malformed input and missing config', () => {
    expect(decodeVerifyLink('%%%not-base64', SB)).toBeNull();
    expect(decodeVerifyLink(null, SB)).toBeNull();
    expect(decodeVerifyLink(enc(`${SB}/auth/v1/verify`), undefined)).toBeNull();
  });
});

describe('safeInternalPath (AuthPage ?redirectTo=, D96)', () => {
  it('keeps same-site paths', () => {
    expect(safeInternalPath('/ride/123?x=1')).toBe('/ride/123?x=1');
    expect(safeInternalPath('/')).toBe('/');
  });

  it('falls back to / for anything off-site', () => {
    expect(safeInternalPath(null)).toBe('/');
    expect(safeInternalPath('https://evil.example')).toBe('/');
    expect(safeInternalPath('//evil.example')).toBe('/');
    expect(safeInternalPath('/\\evil.example')).toBe('/');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
    expect(safeInternalPath('/ok\nbad')).toBe('/');
  });
});
