import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';

type Stage = 'idle' | 'sending' | 'sent' | 'error' | 'verifying';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const tenant = queryClient.getQueryData<{ name?: string, logo_url?: string }>(['tenant-config']);

  // Contextual Deep-Linking: Capture where the user wanted to go
  const redirectTo = searchParams.get('redirectTo') || '/';

  // 1. SILENT TOKEN EXCHANGE: Handle inbound email link tokens
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken && (type === 'magiclink' || type === 'signup')) {
      setStage('verifying');
      console.log('[Auth] Detected inbound magic link token. Synchronizing session...');
      
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (error) {
            console.error('[Auth] Session sync failed:', error);
            setStage('error');
            setErrorMsg(error.message);
          } else if (data.session) {
            console.log('[Auth] Session active. Ensuring account and redirecting to:', redirectTo);
            const { sessionCookieId, setIsRideGuest } = useAppStore.getState();
            
            supabase.rpc('ensure_account_exists', { p_session_cookie_id: sessionCookieId })
              .then(() => {
                setIsRideGuest(false);
                // Clear query cache to force fresh tier detection
                queryClient.invalidateQueries();
                navigate(redirectTo, { replace: true });
              });
          }
        });
    }
  }, [navigate, redirectTo, queryClient]);

  // 2. STANDARD AUTH STATE LISTENER
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && stage !== 'verifying') {
        const { sessionCookieId, setIsRideGuest } = useAppStore.getState();
        supabase.rpc('ensure_account_exists', { p_session_cookie_id: sessionCookieId }).then(() => {
          setIsRideGuest(false);
          navigate(redirectTo, { replace: true });
        });
      }
    });

    // If already authenticated and not in the middle of a token exchange, just go home
    if (stage === 'idle') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) navigate(redirectTo, { replace: true });
      });
    }

    return () => subscription.unsubscribe();
  }, [navigate, stage, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStage('sending');
    setErrorMsg('');

    // Construct the redirect URL for deep-linking
    const baseUrl = window.location.origin + window.location.pathname;
    const redirectUrl = `${baseUrl}?redirectTo=${encodeURIComponent(redirectTo)}`;

    const { data, error } = await supabase.functions.invoke('send-magic-link', {
      body: { 
        email: email.trim().toLowerCase(),
        redirectTo: redirectUrl
      },
    });

    if (error) {
      setStage('error');
      let msg = error.message;
      try {
        const body = await (error as any).context?.json();
        if (body?.error) msg = body.error;
        else if (body?.message) msg = body.message;
      } catch (e) {
        console.warn('[Auth] Error parsing context:', e);
      }
      setErrorMsg(msg);
      console.error('[Auth] Magic link error:', error, msg);
    } else if (data && data.error) {
      setStage('error');
      setErrorMsg(data.error);
    } else {
      setStage('sent');
    }
  };

  // SILENT EXCHANGE SPLASH SCREEN
  if (stage === 'verifying') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 animate-in fade-in duration-500">
        <div className="w-full max-w-sm text-center space-y-8">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 border-4 border-brand-primary/10 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-brand-primary rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-brand-primary text-3xl animate-pulse">sync_saved_locally</span>
            </div>
          </div>
          <div>
            <h1 className="font-headline font-extrabold text-2xl tracking-tighter italic text-on-background uppercase mb-2">
              Initializing Tactical Link
            </h1>
            <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant animate-pulse">
              Synchronizing Encrypted Session...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">

      {/* Club mark - Dynamic Branding */}
      <div className="mb-12 text-center animate-in slide-in-from-top-4 duration-700">
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt={tenant.name} className="h-16 w-auto object-contain mx-auto mb-6" />
        ) : (
          <div className="w-16 h-16 bg-brand-logo bg-contain bg-no-repeat bg-center mx-auto mb-6 grayscale contrast-125 opacity-40" />
        )}
        <h1 className="font-headline font-extrabold text-4xl tracking-tighter italic text-on-background uppercase">
          {tenant?.name || 'VECHELON'}
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant mt-2">
          Tactical Rider Portal
        </p>
      </div>

      {stage === 'sent' ? (
        /* Confirmation state */
        <div className="w-full max-w-sm text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto border border-brand-primary/20">
            <span className="material-symbols-outlined text-brand-primary text-4xl">mark_email_read</span>
          </div>
          <div className="space-y-3">
            <h2 className="font-headline font-bold text-2xl text-on-background uppercase italic tracking-tighter italic">Mission Dispatch Sent</h2>
            <p className="font-body text-sm text-on-surface-variant leading-relaxed">
              A secure tactical link has been dispatched to <span className="font-bold text-on-background">{email}</span>. 
              Check your comms to complete synchronization.
            </p>
          </div>
          <div className="pt-4">
            <button
              onClick={() => setStage('idle')}
              className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-brand-primary transition-colors flex items-center gap-2 mx-auto"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Return to Login
            </button>
          </div>
        </div>
      ) : (
        /* Email form */
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-8 animate-in fade-in duration-1000">
          <div className="space-y-4">
            <div>
              <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 px-1">
                Operator Identity (Email)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@vechelon.app"
                required
                autoFocus
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all shadow-sm"
              />
            </div>

            {stage === 'error' && (
              <div className="bg-error/10 border border-error/20 rounded-lg p-3 flex items-start gap-3">
                <span className="material-symbols-outlined text-error text-lg">report</span>
                <p className="font-label text-[10px] text-error leading-tight uppercase tracking-wide">{errorMsg}</p>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={stage === 'sending'}
            className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold tracking-widest uppercase text-sm flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-ambient"
          >
            {stage === 'sending' ? (
              <>
                <span className="material-symbols-outlined text-xl animate-spin">sync</span>
                Dispatching Link…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl">encrypted</span>
                Authorize Access
              </>
            )}
          </button>

          <div className="space-y-4">
            <p className="text-center font-label text-[9px] text-on-surface-variant/50 leading-relaxed uppercase tracking-widest">
              Zero-Password Protocol Active<br />
              Secure token will expire in 60 minutes
            </p>
            <div className="w-12 h-0.5 bg-outline-variant/10 mx-auto rounded-full" />
            <p className="text-center font-label text-[8px] text-on-surface-variant/30 leading-relaxed uppercase tracking-[0.2em]">
              New operators automatically registered<br />upon first authentication
            </p>
          </div>
        </form>
      )}
    </div>
  );
};

export default AuthPage;
