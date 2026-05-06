import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

export function usePlatformAdminCheck() {
  const setPlatformAdmin = useAppStore((s) => s.setPlatformAdmin);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-admin-check'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { authenticated: false, isPlatformAdmin: false };

      const { data: account } = await supabase
        .from('accounts')
        .select('platform_admin')
        .eq('id', user.id)
        .maybeSingle();

      return {
        authenticated: true,
        isPlatformAdmin: account?.platform_admin === true,
      };
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  useEffect(() => {
    if (data) setPlatformAdmin(data.isPlatformAdmin);
  }, [data, setPlatformAdmin]);

  return {
    isLoading,
    isAuthenticated: data?.authenticated ?? false,
    isPlatformAdmin: data?.isPlatformAdmin ?? false,
  };
}
