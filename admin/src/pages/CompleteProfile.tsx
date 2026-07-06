import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { extractSlug } from '../lib/extractSlug';

/**
 * CompleteProfile — public, unauthenticated onboarding page (W256, Goal G31).
 *
 * A rider the club has only a phone number for opens /complete-profile?token=…
 * (the single-use, 7-day link an admin sent by SMS/WhatsApp). This page validates
 * the token on load (peek), prefills any admin-seeded details, and collects the
 * REQUIRED email (their auth identity) plus name / phone / optional emergency
 * contact. On submit, complete-profile-submit provisions a real account and sends
 * a branded magic-link; the page then tells the rider to check their email.
 *
 * Reached on the club's own subdomain, so tenant branding resolves via the slug.
 * The route is a sibling of /auth (outside the authed AdaptiveLayout) — the rider
 * has no session yet.
 */

type Stage = 'loading' | 'invalid' | 'form' | 'submitting' | 'done';

const CompleteProfile: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const slug = React.useMemo(() => extractSlug(window.location.hostname), []);
  // Distinct key (not App's shared ['tenant-config', slug]) so this page's
  // narrower select can never clobber the full tenant object App's branding reads.
  const { data: tenant } = useQuery<{ name?: string; logo_url?: string } | null>({
    queryKey: ['tenant-branding-complete-profile', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase
        .from('tenants')
        .select('name, logo_url')
        .eq('slug', slug)
        .maybeSingle();
      return data;
    },
    enabled: slug !== null,
    staleTime: 1000 * 60 * 5,
  });

  const [stage, setStage] = useState<Stage>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  // The phone the admin seeded is shown locked (this is the number the club has
  // for you); "Wrong number?" unlocks it for an inline edit.
  const [phoneLocked, setPhoneLocked] = useState(false);

  // ── Validate the token on load and prefill admin-seeded details (peek) ────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setStage('invalid');
        setErrorMsg('This link is missing its token. Please use the link your club sent you.');
        return;
      }
      const { data, error } = await supabase.functions.invoke('complete-profile-submit', {
        body: { token, peek: true },
      });
      if (cancelled) return;
      // A non-2xx from the function surfaces as a FunctionsHttpError; the
      // human-readable reason is in the JSON body under `error`.
      const reason = await extractError(error);
      if (reason || !data?.valid) {
        setStage('invalid');
        setErrorMsg(reason || 'This link is invalid or has already been used.');
        return;
      }
      if (data.name) setName(data.name);
      if (data.phone) { setPhone(data.phone); setPhoneLocked(true); }
      if (data.emergency_contact_name) setEcName(data.emergency_contact_name);
      if (data.emergency_contact_phone) setEcPhone(data.emergency_contact_phone);
      setStage('form');
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStage('submitting');
    setErrorMsg('');
    const { data, error } = await supabase.functions.invoke('complete-profile-submit', {
      body: {
        token,
        email: email.trim(),
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        emergency_contact_name: ecName.trim() || undefined,
        emergency_contact_phone: ecPhone.trim() || undefined,
      },
    });
    const reason = await extractError(error);
    if (reason || !data?.success) {
      setErrorMsg(reason || 'Something went wrong. Please try again.');
      setStage('form');
      return;
    }
    setStage('done');
  };

  const clubName = tenant?.name ?? 'your club';

  // ── Branded header (mirrors AuthPage) ─────────────────────────────────────
  const Header = () => (
    <div className="mb-10 text-center w-full max-w-sm">
      {tenant?.logo_url ? (
        <img src={tenant.logo_url} alt={tenant.name} className="h-16 w-auto object-contain mx-auto mb-6 mix-blend-multiply" />
      ) : tenant?.name ? (
        <p className="font-headline font-extrabold text-2xl tracking-tighter italic text-on-background uppercase mb-6">
          {tenant.name}
        </p>
      ) : null}
      <h1 className="font-headline font-extrabold text-4xl tracking-tighter italic text-on-background uppercase">
        VECHELON
      </h1>
      <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant mt-2">
        Complete your profile
      </p>
    </div>
  );

  // ── Loading (validating token) ────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
        <span className="material-symbols-outlined text-4xl animate-spin text-brand-primary/30">sync</span>
        <p className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant mt-4 animate-pulse">
          Checking your link…
        </p>
      </div>
    );
  }

  // ── Invalid / expired / used token ────────────────────────────────────────
  if (stage === 'invalid') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
        <Header />
        <div className="w-full max-w-sm text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mx-auto border border-error/20">
            <span className="material-symbols-outlined text-error text-4xl">link_off</span>
          </div>
          <div className="space-y-3">
            <h2 className="font-headline font-bold text-2xl text-on-background uppercase italic tracking-tighter">Link not valid</h2>
            <p className="font-body text-sm text-on-surface-variant leading-relaxed">{errorMsg}</p>
            <p className="font-body text-sm text-on-surface-variant/70 leading-relaxed">
              Ask an admin at {clubName} to send you a fresh link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6">
        <Header />
        <div className="w-full max-w-sm text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-brand-primary/10 flex items-center justify-center mx-auto border border-brand-primary/20">
            <span className="material-symbols-outlined text-brand-primary text-4xl">mark_email_read</span>
          </div>
          <div className="space-y-3">
            <h2 className="font-headline font-bold text-2xl text-on-background uppercase italic tracking-tighter">You're all set</h2>
            <p className="font-body text-sm text-on-surface-variant leading-relaxed">
              We've sent a sign-in link to <span className="font-bold text-on-background">{email}</span>.
              Check your email to finish signing in to {clubName}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form (stage 'form' or 'submitting') ───────────────────────────────────
  const busy = stage === 'submitting';
  const field = (
    label: string,
    value: string,
    setter: (v: string) => void,
    type: string,
    placeholder: string,
    required = false,
  ) => (
    <div>
      <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 px-1">
        {label}{required && <span className="text-brand-primary"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => setter(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={busy}
        className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all shadow-sm disabled:opacity-50"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <Header />
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6 animate-in fade-in duration-700">
        <p className="font-body text-sm text-on-surface-variant leading-relaxed text-center">
          Add your details to join <span className="font-bold text-on-background">{clubName}</span> on Vechelon.
        </p>
        <div className="space-y-4">
          {field('Email address', email, setEmail, 'email', 'you@example.com', true)}
          {field('Full name', name, setName, 'text', 'First Last')}
          {/* Mobile number — locked to the seeded value with an inline "Wrong number?" edit */}
          <div>
            <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2 px-1">
              Mobile number
            </label>
            {phoneLocked ? (
              <div className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 flex items-center justify-between gap-3 shadow-sm">
                <span className="font-body text-sm text-on-background truncate">{phone || '—'}</span>
                <button
                  type="button"
                  onClick={() => setPhoneLocked(false)}
                  disabled={busy}
                  className="font-label text-[10px] uppercase tracking-widest text-brand-primary hover:opacity-80 transition-opacity shrink-0 disabled:opacity-50"
                >
                  Wrong number?
                </button>
              </div>
            ) : (
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                disabled={busy}
                autoFocus
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-5 py-4 font-body text-sm text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:border-brand-primary transition-all shadow-sm disabled:opacity-50"
              />
            )}
          </div>
          <div className="pt-2">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant/60 mb-3 px-1">
              Emergency contact (optional)
            </p>
            <div className="space-y-4">
              {field('Contact name', ecName, setEcName, 'text', 'Contact name')}
              {field('Contact number', ecPhone, setEcPhone, 'tel', '+1 555 987 6543')}
            </div>
          </div>

          {errorMsg && (
            <div className="bg-error/10 border border-error/20 rounded-lg p-3 flex items-start gap-3">
              <span className="material-symbols-outlined text-error text-lg">report</span>
              <p className="font-label text-[10px] text-error leading-tight uppercase tracking-wide">{errorMsg}</p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold uppercase tracking-widest text-xs hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {busy ? (
            <><span className="material-symbols-outlined text-base animate-spin">sync</span>Finishing…</>
          ) : (
            'Complete my profile'
          )}
        </button>
        <p className="font-body text-[11px] text-on-surface-variant/60 leading-relaxed text-center">
          We'll email you a sign-in link — no password needed.
        </p>
      </form>
    </div>
  );
};

/**
 * supabase.functions.invoke surfaces a non-2xx as a FunctionsHttpError whose
 * `context` is the Response — the readable reason is in its JSON `error` field.
 */
async function extractError(error: unknown): Promise<string | null> {
  if (!error) return null;
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch { /* fall through */ }
  }
  const msg = (error as { message?: string }).message;
  return msg || 'This link is invalid or has already been used.';
}

export default CompleteProfile;
