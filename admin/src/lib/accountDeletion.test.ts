import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DELETION_EXPLANATION,
  DELETION_RETAINED,
  GENERIC_FAILURE,
  SESSION_EXPIRED,
  classifyUserCheck,
  isDeleteConfirmed,
  runWebAccountDeletion,
  type WebDeletionDeps,
} from './accountDeletion';

function deps(over: Partial<WebDeletionDeps> = {}): WebDeletionDeps {
  return {
    invokeDelete: vi.fn(async () => ({ ok: true as const })),
    checkUser: vi.fn(async () => 'present' as const),
    signOut: vi.fn(async () => ({})),
    signOutLocal: vi.fn(async () => ({})),
    ...over,
  };
}

describe('isDeleteConfirmed', () => {
  it('accepts DELETE in any case with surrounding spaces', () => {
    expect(isDeleteConfirmed('DELETE')).toBe(true);
    expect(isDeleteConfirmed('  delete ')).toBe(true);
  });
  it('rejects anything else', () => {
    for (const t of ['', 'DEL', 'DELETE!', 'DELETE ME', 'yes']) expect(isDeleteConfirmed(t)).toBe(false);
  });
});

describe('classifyUserCheck', () => {
  it('only user_not_found counts as gone', () => {
    expect(classifyUserCheck({ hasUser: false, status: 403, code: 'user_not_found' })).toBe('gone');
    expect(classifyUserCheck({ hasUser: false, status: 403, code: 'bad_jwt' })).toBe('session');
    expect(classifyUserCheck({ hasUser: false, status: 400 })).toBe('session');
    expect(classifyUserCheck({ hasUser: true })).toBe('present');
    expect(classifyUserCheck({ hasUser: false })).toBe('unknown');
  });
});

describe('runWebAccountDeletion', () => {
  it('deletes, then signs out globally', async () => {
    const d = deps();
    const { outcome, steps } = await runWebAccountDeletion(d);
    expect(outcome).toEqual({ ok: true, signedOut: true });
    expect(steps).toEqual(['delete_called', 'sign_out']);
    expect(d.signOutLocal).not.toHaveBeenCalled();
  });

  it('a server refusal stops before any sign-out and passes the server message through', async () => {
    const d = deps({
      invokeDelete: vi.fn(async () => ({ ok: false as const, error: 'last_admin', message: 'You’re the only organiser of Club X.' })),
    });
    const { outcome, steps } = await runWebAccountDeletion(d);
    expect(outcome).toEqual({ ok: false, reason: 'last_admin', message: 'You’re the only organiser of Club X.' });
    expect(steps).toEqual(['delete_called', 'delete_refused']);
    expect(d.checkUser).not.toHaveBeenCalled();
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('a failure with the account still present reports failure and keeps the session', async () => {
    const d = deps({ invokeDelete: vi.fn(async () => ({ ok: false as const, status: 500 })) });
    const { outcome } = await runWebAccountDeletion(d);
    expect(outcome).toEqual({ ok: false, reason: 'failed', message: GENERIC_FAILURE });
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('a dead session never claims the account was deleted', async () => {
    const d = deps({
      invokeDelete: vi.fn(async () => ({ ok: false as const, status: 401 })),
      checkUser: vi.fn(async () => 'session' as const),
    });
    const { outcome } = await runWebAccountDeletion(d);
    expect(outcome).toEqual({ ok: false, reason: 'session', message: SESSION_EXPIRED });
    expect(d.signOut).not.toHaveBeenCalled();
  });

  it('a thrown call whose account turns out gone finishes the sign-out', async () => {
    const d = deps({
      invokeDelete: vi.fn(async () => { throw new Error('network'); }),
      checkUser: vi.fn(async () => 'gone' as const),
    });
    const { outcome, steps } = await runWebAccountDeletion(d);
    expect(outcome.ok).toBe(true);
    expect(steps).toEqual(['delete_called', 'delete_failed', 'account_gone', 'sign_out']);
  });

  it('falls back to a local sign-out when the global one fails', async () => {
    const d = deps({ signOut: vi.fn(async () => ({ error: new Error('session gone') })) });
    const { outcome, steps } = await runWebAccountDeletion(d);
    expect(outcome).toEqual({ ok: true, signedOut: true });
    expect(steps).toEqual(['delete_called', 'sign_out', 'sign_out_local']);
  });
});

// The public page (Play Console's deletion URL) must say exactly what the in-product flow says,
// which is the W299 as-built retention list.
describe('delete-account.html (public deletion page)', () => {
  const html = readFileSync(resolve(__dirname, '../../../delete-account.html'), 'utf8');
  it.each([...DELETION_EXPLANATION, ...DELETION_RETAINED])('states: %s', (line) => {
    expect(html).toContain(line);
  });
});
