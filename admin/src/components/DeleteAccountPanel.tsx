import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { AUTH_HREF } from '../lib/portalBase';
import {
  DELETION_EXPLANATION,
  DELETION_RETAINED,
  DELETE_CONFIRM_WORD,
  classifyUserCheck,
  isDeleteConfirmed,
  runWebAccountDeletion,
  type DeleteResponse,
  type UserCheck,
} from '../lib/accountDeletion';

// W301 — Delete account on the rider portal Profile. Two deliberate steps (read what is deleted,
// then type DELETE); cancelling at any point calls nothing.

type Stage = 'idle' | 'explain' | 'confirm' | 'working';

async function invokeDelete(): Promise<DeleteResponse> {
  // No body: the server acts ONLY on the session JWT's verified uid.
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (!error) return { ok: true };
  // supabase-js puts the function's JSON body on error.context, not in `data`.
  try {
    const ctx = (error as { context?: { status?: number; json?: () => Promise<{ error?: string; message?: string }> } }).context;
    const body = await ctx?.json?.();
    return { ok: false, status: ctx?.status, error: body?.error, message: body?.message };
  } catch {
    return { ok: false };
  }
}

async function checkUser(): Promise<UserCheck> {
  const { data, error } = await supabase.auth.getUser();
  const e = error as { status?: number; code?: string } | null;
  return classifyUserCheck({ hasUser: !!data?.user, status: e?.status ?? null, code: e?.code ?? null });
}

export const DeleteAccountPanel: React.FC<{
  // Injected for tests; production uses the real Supabase-backed steps.
  run?: typeof runWebAccountDeletion;
  onDeleted?: () => void;
}> = ({ run = runWebAccountDeletion, onDeleted }) => {
  const [stage, setStage] = useState<Stage>('idle');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const cancel = () => {
    setStage('idle');
    setTyped('');
    setMessage(null);
  };

  const confirm = async () => {
    if (!isDeleteConfirmed(typed)) return;
    setStage('working');
    setMessage(null);
    const { outcome } = await run({
      invokeDelete,
      checkUser,
      signOut: () => supabase.auth.signOut({ scope: 'global' }),
      // Fallback only after the account is gone: deleting the auth user already revoked every
      // server session, so clearing this browser is all that is left (Pattern 4 is satisfied).
      signOutLocal: () => supabase.auth.signOut({ scope: 'local' }),
    });
    if (outcome.ok) {
      if (onDeleted) onDeleted();
      else window.location.href = `${AUTH_HREF}?deleted=1`;
      return;
    }
    setMessage(outcome.message);
    setStage('confirm');
  };

  if (stage === 'idle') {
    return (
      <div className="pt-4 border-t border-surface-container-low">
        <button
          type="button"
          onClick={() => setStage('explain')}
          className="w-full py-3 rounded-xl font-label text-[10px] uppercase tracking-widest text-error hover:bg-error/5 transition-colors"
        >
          Delete account
        </button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="border border-error/30 rounded-2xl p-6 space-y-5 bg-surface-container-low"
    >
      <h3 id="delete-account-heading" className="font-headline font-bold text-lg text-on-background">
        Delete your account
      </h3>

      {stage === 'explain' && (
        <>
          <div className="space-y-2">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">What is deleted</p>
            <ul className="list-disc pl-5 space-y-1 font-body text-sm text-on-background">
              {DELETION_EXPLANATION.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">What stays</p>
            <ul className="list-disc pl-5 space-y-1 font-body text-sm text-on-surface-variant">
              {DELETION_RETAINED.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          <p className="font-body text-sm text-on-background">This can’t be undone.</p>
          <div className="flex gap-3">
            <button type="button" onClick={cancel} className="flex-1 py-3 rounded-xl bg-surface-container-high font-label text-[10px] uppercase tracking-widest">
              Cancel
            </button>
            <button type="button" onClick={() => setStage('confirm')} className="flex-1 py-3 rounded-xl bg-error text-on-error font-label text-[10px] uppercase tracking-widest">
              Continue
            </button>
          </div>
        </>
      )}

      {(stage === 'confirm' || stage === 'working') && (
        <>
          <label htmlFor="delete-confirm" className="block font-body text-sm text-on-background">
            Type <strong>{DELETE_CONFIRM_WORD}</strong> to permanently delete your account.
          </label>
          <input
            id="delete-confirm"
            type="text"
            autoComplete="off"
            value={typed}
            disabled={stage === 'working'}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full bg-surface border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm"
          />
          {message && (
            <p role="alert" className="font-body text-sm text-error">{message}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={stage === 'working'}
              className="flex-1 py-3 rounded-xl bg-surface-container-high font-label text-[10px] uppercase tracking-widest disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={stage === 'working' || !isDeleteConfirmed(typed)}
              className="flex-1 py-3 rounded-xl bg-error text-on-error font-label text-[10px] uppercase tracking-widest disabled:opacity-50"
            >
              {stage === 'working' ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </>
      )}
    </section>
  );
};

export default DeleteAccountPanel;
