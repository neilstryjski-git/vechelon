import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Participant {
  id: string;
  displayName: string;
  lastLat: number | null;
  lastLong: number | null;
  status: string;
  beaconActive: boolean;
}

interface AppState {
  // UI State (Persisted)
  currentTenantId: string | null;
  isSidebarOpen: boolean;
  
  // Tactical State (Non-Persisted)
  isOnline: boolean;
  isPriorityMode: boolean;
  activeBeacons: string[]; // participantIds
  cachedParticipants: Record<string, Participant[]>; // rideId -> participants
  
  // Actions
  setTenantId: (id: string) => void;
  toggleSidebar: () => void;
  setOnlineStatus: (status: boolean) => void;
  updateCachedParticipants: (rideId: string, participants: Participant[]) => void;
  setPriorityMode: (active: boolean) => void;
  addActiveBeacon: (participantId: string) => void;
  removeActiveBeacon: (participantId: string) => void;
}

/**
 * Global Zustand store with tactical state for real-time responsiveness.
 * Fulfills W15: Support Beacon real-time state.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentTenantId: null,
      isSidebarOpen: true,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isPriorityMode: false,
      activeBeacons: [],
      cachedParticipants: {},

      setTenantId: (id) => set({ currentTenantId: id }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setOnlineStatus: (status) => set({ isOnline: status }),
      
      setPriorityMode: (active) => set({ isPriorityMode: active }),
      
      addActiveBeacon: (id) => set((state) => {
        const next = [...new Set([...state.activeBeacons, id])];
        return { activeBeacons: next, isPriorityMode: next.length > 0 };
      }),
      
      removeActiveBeacon: (id) => set((state) => {
        const next = state.activeBeacons.filter(bid => bid !== id);
        return { activeBeacons: next, isPriorityMode: next.length > 0 };
      }),

      updateCachedParticipants: (rideId, participants) => 
        set((state) => ({
          cachedParticipants: {
            ...state.cachedParticipants,
            [rideId]: participants
          }
        })),
    }),
    {
      name: 'vechelon-admin-storage',
      partialize: (state) => ({ 
        currentTenantId: state.currentTenantId,
        // activeBeacons and isPriorityMode are NOT persisted
      }),
    }
  )
);
