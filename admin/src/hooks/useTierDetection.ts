import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import type { UserTier } from '../store/useAppStore';

export const useTierDetection = () => {
  const { currentTenantId, setTier } = useAppStore();

  useEffect(() => {
    const syncTier = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session || !currentTenantId) {
        setTier('guest', null);
        return;
      }

      const { data, error } = await supabase
        .from('account_tenants')
        .select('status, role')
        .eq('account_id', session.user.id)
        .eq('tenant_id', currentTenantId)
        .maybeSingle();

      if (error || !data) {
        setTier('guest', null, null);
        return;
      }

      const { status, role } = data;
      let tier: UserTier = 'guest';
      if (status === 'affiliated') tier = 'affiliated';
      else if (status === 'initiated') tier = 'initiated';

      setTier(tier, status, role);
    };

    syncTier();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      syncTier();
    });

    return () => subscription.unsubscribe();
  }, [currentTenantId, setTier]);
};
