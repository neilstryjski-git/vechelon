import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../store/useToast';

const MAX_AVATAR_BYTES  = 10 * 1024 * 1024; // 10 MB hard reject
const TARGET_AVATAR_BYTES = 500 * 1024;     // 500 KB target after compression

/** Compress any image file to a JPEG under TARGET_AVATAR_BYTES. */
async function compressToJpeg(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      // Scale down if very large — cap longest edge at 1024 px
      const MAX_DIM = 1024;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round((height / width) * MAX_DIM); width = MAX_DIM; }
        else                { width  = Math.round((width / height) * MAX_DIM); height = MAX_DIM; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      // Binary-search quality until output is under target
      let lo = 0.1, hi = 0.92, blob: Blob | null = null;
      const tryQuality = (q: number) =>
        new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', q));

      (async () => {
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          blob = await tryQuality(mid);
          if (blob.size <= TARGET_AVATAR_BYTES) lo = mid; else hi = mid;
        }
        blob = blob ?? await tryQuality(lo);
        resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      })().catch(reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

interface AccountProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

interface AffiliationInfo {
  status: string;
  role: string;
  joined_at: string;
  tenants: { name: string; logo_url: string | null };
}

function useProfile() {
  return useQuery<{ account: AccountProfile; affiliation: AffiliationInfo | null } | null>({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data: account, error: accountErr } = await supabase
        .from('accounts')
        .select('id, email, name, phone, avatar_url, emergency_contact_name, emergency_contact_phone')
        .eq('id', session.user.id)
        .maybeSingle();
      if (accountErr) throw accountErr;

      const { data: affiliation, error: affErr } = await supabase
        .from('account_tenants')
        .select(`
          status,
          role,
          joined_at,
          tenants (
            name,
            logo_url
          )
        `)
        .eq('account_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (affErr) throw affErr;

      return { 
        account: account as AccountProfile, 
        affiliation: affiliation as unknown as AffiliationInfo 
      };
    },
  });
}

const Profile: React.FC = () => {
  const { data, isLoading } = useProfile();
  const profile = data?.account;
  const affiliation = data?.affiliation;
  
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const avatarRef = useRef<HTMLInputElement>(null);

  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyName, setEmergencyName]   = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setPhone(profile.phone ?? '');
      setEmergencyName(profile.emergency_contact_name ?? '');
      setEmergencyPhone(profile.emergency_contact_phone ?? '');
    }
  }, [profile]);

  // Profile update mutation
  const { mutate: saveProfile, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('accounts')
        .update({ 
          name: name.trim() || null, 
          phone: phone.trim() || null,
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null
        })
        .eq('id', session.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      addToast('Profile updated.', 'success');
    },
    onError: (err) => addToast(`Save failed: ${(err as Error).message}`, 'error'),
  });

  // Avatar upload mutation
  const { mutate: uploadAvatar, isPending: isUploading } = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_AVATAR_BYTES) throw new Error('Image is too large (max 10 MB)');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const compressed = await compressToJpeg(file);
      const path = `${session.user.id}/avatar.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const versionedUrl = `${publicUrl}?v=${Date.now()}`;

      const { error: updateErr } = await supabase
        .from('accounts')
        .update({ avatar_url: versionedUrl })
        .eq('id', session.user.id);
      if (updateErr) throw updateErr;

      return versionedUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      addToast('Photo updated.', 'success');
    },
    onError: (err) => addToast(`Upload failed: ${(err as Error).message}`, 'error'),
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAvatar(file);
    e.target.value = '';
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/portal/auth';
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse max-w-lg mx-auto pt-8">
        <div className="h-24 w-24 rounded-full bg-surface-container-high mx-auto" />
        <div className="h-4 w-48 bg-surface-container-high rounded mx-auto" />
        <div className="h-10 w-full bg-surface-container-high rounded" />
        <div className="h-10 w-full bg-surface-container-high rounded" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center pt-16 text-on-surface-variant font-label text-sm">
        Not signed in. <a href="/portal/auth" className="text-primary underline">Sign in</a>
      </div>
    );
  }

  const initials = profile.name
    ? profile.name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
    : (profile.email?.[0] ?? '?').toUpperCase();

  return (
    <div className="max-w-lg mx-auto space-y-10 pb-20">

      {/* Page label */}
      <div className="pt-8">
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">Rider Profile</p>
        <h1 className="font-headline font-bold text-3xl text-on-background tracking-tighter mt-1 uppercase italic">
          {profile.name || 'Your Account'}
        </h1>
      </div>

      {/* Affiliation Info Card - Pillar II Section 4.3 */}
      {affiliation && (
        <div className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {affiliation.tenants.logo_url ? (
                <img src={affiliation.tenants.logo_url} className="w-8 h-8 object-contain" alt="" />
              ) : (
                <span className="material-symbols-outlined text-primary">groups</span>
              )}
              <span className="font-headline font-bold text-sm text-on-background">{affiliation.tenants.name}</span>
            </div>
            <span className={`font-label text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest ${
              affiliation.status === 'affiliated' ? 'bg-tertiary/10 text-tertiary border border-tertiary/20' : 'bg-primary/10 text-primary border border-primary/20'
            }`}>
              {affiliation.status}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-outline-variant/10">
            <div>
              <span className="font-label text-[8px] uppercase tracking-tighter text-on-surface-variant block mb-0.5">Role</span>
              <p className="font-body text-xs font-semibold text-on-background uppercase tracking-wider">{affiliation.role}</p>
            </div>
            <div>
              <span className="font-label text-[8px] uppercase tracking-tighter text-on-surface-variant block mb-0.5">Joined</span>
              <p className="font-body text-xs font-semibold text-on-background uppercase tracking-wider">
                {new Date(affiliation.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Avatar */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={() => avatarRef.current?.click()}
          disabled={isUploading}
          className="relative group shadow-ambient rounded-full"
        >
          <div className="w-24 h-24 rounded-full overflow-hidden bg-surface-container-high border-2 border-outline-variant/20">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-headline font-bold text-3xl text-on-surface-variant">
                  {initials}
                </span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="material-symbols-outlined text-on-background text-xl">
              {isUploading ? 'sync' : 'photo_camera'}
            </span>
          </div>
        </button>
        <input
          ref={avatarRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarChange}
          className="hidden"
        />
        <p className="font-label text-[9px] text-on-surface-variant/60 uppercase tracking-widest">
          Click to change photo · max 2 MB
        </p>
      </div>

      {/* Profile form */}
      <div className="space-y-8">
        
        <div className="space-y-5">
          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant border-b border-outline-variant/10 pb-2">
            Identity & Contact
          </h3>
          
          <div>
            <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
              Email
            </label>
            <input
              type="email"
              value={profile.email ?? ''}
              disabled
              className="w-full bg-surface-container-low/50 border border-outline-variant/20 rounded-lg px-4 py-3 font-body text-sm text-on-surface-variant/60 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>

          <div>
            <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>
        </div>

        <div className="space-y-5">
          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-error border-b border-error/10 pb-2">
            Emergency Protocols
          </h3>
          
          <div>
            <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
              Emergency Contact Name
            </label>
            <input
              type="text"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="First Last"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>

          <div>
            <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
              Emergency Contact Phone
            </label>
            <input
              type="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>
        </div>

        <button
          onClick={() => saveProfile()}
          disabled={isSaving}
          className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-ambient"
        >
          {isSaving ? (
            <><span className="material-symbols-outlined text-lg animate-spin">sync</span> Synchronizing…</>
          ) : (
            <><span className="material-symbols-outlined text-lg">save</span> Commit Changes</>
          )}
        </button>
      </div>

      {/* Sign out */}
      <div className="pt-4 border-t border-surface-container-low">
        <button
          onClick={handleSignOut}
          className="w-full bg-surface-container-low text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Sign Out
        </button>
      </div>

    </div>
  );
};

export default Profile;
