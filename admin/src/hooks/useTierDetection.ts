import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import type { UserTier } from '../store/useAppStore';

export const useTierDetection = () => {
  const { currentTenantId, setTier } = useAppStore();
  const [userId, setUserId] = useState<string | null>(null);

  // Track session changes to keep userId in sync
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // React Query for account_tenants — can be invalidated by queryClient.invalidateQueries()
  // after ensure_account_exists creates the record, eliminating the SIGNED_IN race condition.
  const { data: tierData, isFetched } = useQuery({
    queryKey: ['user-tier', userId, currentTenantId],
    queryFn: async () => {
      if (!userId || !currentTenantId) return null;
      const { data, error } = await supabase
        .from('account_tenants')
        .select('status, role')
        .eq('account_id', userId)
        .eq('tenant_id', currentTenantId)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    },
    enabled: !!userId && !!currentTenantId,
  });

  // Sync React Query result to the Zustand store
  useEffect(() => {
    if (!userId) {
      setTier('guest', null);
      return;
    }
    // Authenticated — immediately promote out of guest so the "Sign In / Register"
    // button (which loops back for active sessions) is never shown while the
    // account_tenants query is in-flight. Update to the real tier once it resolves.
    if (!isFetched) {
      setTier('initiated', null, null);
      return;
    }
    if (!tierData) {
      // Authenticated but no club membership yet (new self-registered user).
      setTier('initiated', null, null);
      return;
    }
    const tier: UserTier =
      tierData.status === 'affiliated' ? 'affiliated' :
      tierData.status === 'initiated' ? 'initiated' : 'guest';
    setTier(tier, tierData.status, tierData.role);
  }, [tierData, userId, isFetched, setTier]);
};
