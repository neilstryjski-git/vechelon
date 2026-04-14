import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../store/useToast';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

interface AccountProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

function useProfile() {
  return useQuery<AccountProfile | null>({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase
        .from('accounts')
        .select('id, email, name, phone, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

const Profile: React.FC = () => {
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const avatarRef = useRef<HTMLInputElement>(null);

  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  // Profile update mutation
  const { mutate: saveProfile, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('accounts')
        .update({ name: name.trim() || null, phone: phone.trim() || null })
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
      if (file.size > MAX_AVATAR_BYTES) throw new Error('Image must be under 2 MB');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `${session.user.id}/avatar.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

      const { error: updateErr } = await supabase
        .from('accounts')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);
      if (updateErr) throw updateErr;

      return publicUrl;
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
    : profile.email[0].toUpperCase();

  return (
    <div className="max-w-lg mx-auto space-y-10">

      {/* Page label */}
      <div>
        <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">Rider Profile</p>
        <h1 className="font-headline font-bold text-3xl text-on-background tracking-tight mt-1">
          {profile.name || 'Your Account'}
        </h1>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={() => avatarRef.current?.click()}
          disabled={isUploading}
          className="relative group"
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
      <div className="space-y-5">
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
            Email
          </label>
          <input
            type="email"
            value={profile.email}
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
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
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
            placeholder="+44 7700 000000"
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-4 py-3 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <button
          onClick={() => saveProfile()}
          disabled={isSaving}
          className="w-full signature-gradient text-on-primary py-3.5 rounded-xl font-headline font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {isSaving ? (
            <><span className="material-symbols-outlined text-lg animate-spin">sync</span> Saving…</>
          ) : (
            <><span className="material-symbols-outlined text-lg">save</span> Save Changes</>
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
