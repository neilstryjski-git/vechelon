import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../store/useToast';

/**
 * ProfileCompletionPrompt (W264) — supersedes W107.
 *
 * A non-blocking nudge for a logged-in rider who signed up by email but never
 * entered a name, so their club can identify them on the roster. Applies to BOTH
 * tiers: `initiated` riders in a `manual`-enrollment club (awaiting admin
 * approval) AND `affiliated` riders in an `open` club (auto-affiliated on sign-in
 * but still unnamed).
 *
 * It writes name/phone/emergency contact to the rider's OWN account via the
 * accounts self-update policy (id = auth.uid()) — the same path Profile.tsx uses.
 * It deliberately does NOT change account_tenants.status: affiliation is owned by
 * tenants.enrollment_mode, and self-promoting would silently defeat a manual
 * club's approval gate.
 *
 * Self-gating: renders nothing for guests, for a rider who already has a name, or
 * once dismissed for the session.
 */

interface AccountProfile {
  id: string;
  name: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

const ProfileCompletionPrompt: React.FC = () => {
  const userTier = useAppStore((s) => s.userTier);
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data: account } = useQuery<AccountProfile | null>({
    queryKey: ['profile-completion'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('accounts')
        .select('id, name, phone, emergency_contact_name, emergency_contact_phone')
        .eq('id', user.id)
        .maybeSingle();
      return (data as AccountProfile) ?? null;
    },
    enabled: userTier !== 'guest',
    staleTime: 1000 * 60,
  });

  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');

  // Prefill from the account ONCE, at the moment the modal opens — not via an
  // effect on `account`, so a background refetch can't clobber in-progress typing.
  const openModal = () => {
    setName(account?.name ?? '');
    setPhone(account?.phone ?? '');
    setEcName(account?.emergency_contact_name ?? '');
    setEcPhone(account?.emergency_contact_phone ?? '');
    setOpen(true);
  };

  // The roster pain is an UNNAMED rider — trigger on a missing name only.
  const incomplete = userTier !== 'guest' && !!account && !account.name?.trim();
  if (!incomplete || dismissed) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !account) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('accounts')
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          emergency_contact_name: ecName.trim() || null,
          emergency_contact_phone: ecPhone.trim() || null,
        })
        .eq('id', account.id);
      if (error) throw error;
      addToast('Thanks — your profile is updated.', 'success');
      // Refresh the surfaces that read the account name.
      queryClient.invalidateQueries({ queryKey: ['profile-completion'] });
      queryClient.invalidateQueries({ queryKey: ['current-user-avatar'] });
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      setOpen(false);
    } catch (err) {
      addToast((err as Error).message || 'Could not save your profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-surface-container-highest text-on-background font-body text-sm px-4 py-3 rounded-lg border border-outline-variant/30 focus:outline-none focus:border-primary/60 placeholder:text-on-surface-variant/40 disabled:opacity-50';

  return (
    <>
      {/* Nudge banner */}
      <div className="bg-brand-primary/10 border-b border-brand-primary/20 text-on-background z-[59] relative">
        <div className="max-w-screen-2xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-brand-primary text-lg shrink-0">badge</span>
            <p className="font-body text-xs text-on-surface truncate">
              Add your name so your club knows who you are on the roster.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={openModal}
              className="signature-gradient text-on-primary px-4 py-1.5 rounded-md font-label text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-95"
            >
              Complete profile
            </button>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              title="Dismiss for now"
              className="p-1 rounded text-on-surface-variant/60 hover:text-on-background hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-base leading-none">close</span>
            </button>
          </div>
        </div>
      </div>

      {/* Completion modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="bg-surface-container-lowest rounded-2xl shadow-xl border border-surface-container-low p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-headline text-lg font-bold text-on-background">Complete your profile</h3>
            <p className="font-label text-[11px] text-on-surface-variant/70 mt-1 leading-relaxed">
              Your club uses this to identify you on the ride roster and to reach you in an emergency.
            </p>
            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div>
                <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
                  Full name <span className="text-primary">*</span>
                </label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="First Last" required autoFocus disabled={saving} className={inputClass} />
              </div>
              <div>
                <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
                  Mobile number
                </label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 416 555 0100" disabled={saving} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
                    Emergency contact
                  </label>
                  <input type="text" value={ecName} onChange={(e) => setEcName(e.target.value)}
                    placeholder="Name" disabled={saving} className={inputClass} />
                </div>
                <div>
                  <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
                    Emergency number
                  </label>
                  <input type="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)}
                    placeholder="+1 416 555 0101" disabled={saving} className={inputClass} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} disabled={saving}
                  className="px-5 py-2.5 rounded-lg border border-outline-variant/30 font-label text-xs text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving || !name.trim()}
                  className="signature-gradient text-on-primary px-5 py-2.5 rounded-lg font-label text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default ProfileCompletionPrompt;
