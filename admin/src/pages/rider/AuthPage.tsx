import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';

type Stage = 'idle' | 'sending' | 'sent' | 'error';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Decode the click-through param set by the edge function to defeat email scanners
  const encodedLink = searchParams.get('c');
  const pendingLink = encodedLink ? atob(encodedLink) : null;

  // If already authenticated, go straight to home
  useEffect(() => {
    // Subscribe first so we never miss SIGNED_IN
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      console.log('[Auth] onAuthStateChange', _event, session?.user?.id);
      if (session) {
        const { sessionCookieId, setIsRideGuest } = useAppStore.getState();
        supabase.rpc('ensure_account_exists', { p_session_cookie_id: sessionCookieId }).then(() => {
          setIsRideGuest(false);
          navigate('/', { replace: true });
        });
      }
    });

    // Handle #access_token= hash from Supabase redirect after magic link click
    const hash = window.location.hash;
    console.log('[Auth] hash on mount:', hash.slice(0, 60));
    if (hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.substring(1));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        console.log('[Auth] calling setSession from hash');
        supabase.auth.setSession({ access_token, refresh_token })
          .then(({ data, error }: any) => console.log('[Auth] setSession result', data?.session?.user?.id, error));
        return () => subscription.unsubscribe();
      }
    }

    supabase.auth.getSession().then(({ data }: { data: any }) => {
      console.log('[Auth] getSession', data?.session?.user?.id);
      if (data.session) navigate('/', { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStage('sending');
    setErrorMsg('');

    const { data, error } = await supabase.functions.invoke('send-magic-link', {
      body: { email: email.trim().toLowerCase() },
    });

    if (error || (data && data.error)) {
      setStage('error');
      setErrorMsg(error?.message || data.error);
    } else {
      setStage('sent');
    }
    };

  // Click-through page: user must click a button to follow the magic link.
  // This prevents email scanners (Gmail etc.) from consuming the one-time OTP.
  if (pendingLink) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center space-y-8">
          <h1 className="font-headline font-extrabold text-4xl tracking-tighter italic text-on-background">VECHELON</h1>
          <p className="font-body text-sm text-on-surface-variant">Tap the button below to complete your sign-in.</p>
          <a
            href={pendingLink}
            className="block w-full signature-gradient text-on-primary py-3.5 rounded-lg font-headline font-bold tracking-tight text-center hover:opacity-90 transition-all active:scale-[0.98]"
          >
            Enter the Portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">

      {/* Club mark */}
      <div className="mb-12 text-center">
        <img
          src="/portal/racer-sportif-logo.png"
          alt="Club"
          className="h-12 w-auto object-contain mx-auto mb-6 opacity-80"
        />
        <h1 className="font-headline font-extrabold text-4xl tracking-tighter italic text-on-background">
          VECHELON
        </h1>
        <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant mt-1">
          Rider Portal
        </p>
      </div>

      {stage === 'sent' ? (
        /* Confirmation state */
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-tertiary/10 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-tertiary text-3xl">mark_email_read</span>
          </div>
          <div>
            <h2 className="font-headline font-bold text-xl text-on-background mb-2">Check your inbox</h2>
            <p className="font-body text-sm text-on-surface-variant">
              We sent a sign-in link to <span className="font-semibold text-on-background">{email}</span>.
              Click the link to enter the portal.
            </p>
          </div>
          <button
            onClick={() => setStage('idle')}
            className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-background transition-colors"
          >
            Use a different email
          </button>
        </div>
      ) : (
        /* Email form */
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
          <div>
            <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {stage === 'error' && (
            <p className="font-label text-[10px] text-error">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={stage === 'sending'}
            className="w-full signature-gradient text-on-primary py-3.5 rounded-lg font-headline font-bold tracking-tight flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {stage === 'sending' ? (
              <>
                <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                Sending…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">send</span>
                Send Magic Link
              </>
            )}
          </button>

          <p className="text-center font-label text-[9px] text-on-surface-variant/60 leading-relaxed">
            No password required. We'll email you a secure sign-in link.<br />
            New accounts are automatically created on first sign-in.
          </p>
        </form>
      )}
    </div>
  );
};

export default AuthPage;
