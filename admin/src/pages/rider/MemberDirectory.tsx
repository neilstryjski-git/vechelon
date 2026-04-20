import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface MemberRow {
  id: string;
  name: string | null;
  avatar_url: string | null;
}

function useMemberDirectory() {
  return useQuery<MemberRow[]>({
    queryKey: ['rider-member-directory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, avatar_url')
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-10 h-10 rounded-full object-cover bg-surface-container-high"
      />
    );
  }

  return (
    <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
      <span className="font-label text-[10px] text-on-surface-variant tracking-widest">{initials}</span>
    </div>
  );
}

const MemberDirectory: React.FC = () => {
  const { data: members, isLoading, isError } = useMemberDirectory();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline font-black text-3xl tracking-tighter italic uppercase text-on-background">
          The Roster
        </h1>
        <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">
          {isLoading ? '—' : `${members?.length ?? 0} members`}
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/10 animate-pulse"
            >
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex-shrink-0" />
              <div className="h-3 w-28 rounded bg-surface-container-high" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <p className="font-body text-sm text-error">Failed to load member directory.</p>
      )}

      {!isLoading && !isError && members?.length === 0 && (
        <p className="font-body text-sm text-on-surface-variant">No members found.</p>
      )}

      {!isLoading && !isError && members && members.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {members.map(member => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/10"
            >
              <MemberAvatar
                name={member.name || 'Rider'}
                avatarUrl={member.avatar_url}
              />
              <span className="font-body text-sm text-on-background truncate">
                {member.name || 'Unnamed Rider'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MemberDirectory;
