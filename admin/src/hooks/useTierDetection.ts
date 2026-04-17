import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import type { UserTier } from '../store/useAppStore';

export const useTierDetection = () => {
  const { currentTenantId, setTier } = useAppStore();

  useEffect(() => {
    let cancelled = false;

    const syncTier = async (session: Session | null) => {
      if (cancelled) return;

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

      if (cancelled) return;

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

    // Subscribe first so we never miss a SIGNED_IN event from URL hash processing
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: Session | null) => {
      syncTier(session);
    });

    // Also check current session in case SIGNED_IN already fired before this effect ran
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => syncTier(data.session));

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [currentTenantId, setTier]);
};
