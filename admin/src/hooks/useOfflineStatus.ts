import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Hook to monitor and sync global online/offline status.
 * Fulfills S0-15: inform user of connectivity status.
 */
export const useOfflineStatus = () => {
  const setOnlineStatus = useAppStore((state) => state.setOnlineStatus);

  useEffect(() => {
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnlineStatus]);
};
