import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import type { UserTier } from '../store/useAppStore';

/**
 * Hook to automatically detect and sync the user's access tier.
 * Fulfills W35: Tier state updates based on user data.
 */
export const useTierDetection = () => {
  const { currentTenantId, setTier } = useAppStore();

  useEffect(() => {
    const syncTier = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session || !currentTenantId) {
        setTier('guest', null);
        return;
      }

      // Fetch status from junction table
      const { data, error } = await supabase
        .from('account_tenants')
        .select('status')
        .eq('account_id', session.user.id)
        .eq('tenant_id', currentTenantId)
        .maybeSingle();

      if (error || !data) {
        setTier('guest', null);
        return;
      }

      // Map DB status to Tier
      const status = data.status;
      let tier: UserTier = 'guest';
      
      if (status === 'affiliated') tier = 'affiliated';
      else if (status === 'initiated') tier = 'initiated';

      setTier(tier, status);
    };

    syncTier();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      syncTier();
    });

    return () => subscription.unsubscribe();
  }, [currentTenantId, setTier]);
};
