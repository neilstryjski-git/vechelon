import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export type UserTier = 'guest' | 'initiated' | 'affiliated';
export type RiderStatus = 'active' | 'stopped' | 'inactive' | 'dark';

export interface Participant {
  id: string; // account_id
  displayName: string;
  lastLat: number | null;
  lastLong: number | null;
  lastPingAt: number; // Date.now()
  status: RiderStatus;
  beaconActive: boolean;
}

interface AppState {
  // UI State (Persisted)
  currentTenantId: string | null;
  isSidebarOpen: boolean;
  
  // Tactical & Auth State (Non-Persisted)
  isOnline: boolean;
  isPriorityMode: boolean;
  userTier: UserTier;
  isAdmin: boolean;
  membershipStatus: string | null;
  activeBeacons: string[]; // participantIds
  cachedParticipants: Record<string, Participant[]>; // rideId -> participants
  
  // Actions
  setTenantId: (id: string | null) => void;
  toggleSidebar: () => void;
  setOnlineStatus: (status: boolean) => void;
  setTier: (tier: UserTier, status?: string | null, role?: string | null) => void;
  updateCachedParticipants: (rideId: string, participants: Participant[]) => void;
  processLocationUpdate: (rideId: string, update: Partial<Participant> & { id: string }) => void;
  runHeartbeat: (rideId: string) => void;
  endRide: (rideId: string) => Promise<{ summary: string; weather: any }>;
  addActiveBeacon: (participantId: string) => void;
  removeActiveBeacon: (participantId: string) => void;
}

/**
 * Global Zustand store with tactical state and Rider State Machine.
 * Fulfills W23: Implement Fleet Heartbeat & Rider State Machine.
 * Fulfills W26: Implement Ride Closure logic.
 * Fulfills W35: Rider Portal state.
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentTenantId: '00000000-0000-0000-0000-000000000001',
      isSidebarOpen: true,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isPriorityMode: false,
      userTier: 'guest',
      isAdmin: false,
      membershipStatus: null,
      activeBeacons: [],
      cachedParticipants: {},

      setTenantId: (id) => set({ currentTenantId: id }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setOnlineStatus: (status) => set({ isOnline: status }),
      setTier: (tier, status = null, role = null) => set({ 
        userTier: tier, 
        membershipStatus: status,
        isAdmin: role === 'admin'
      }),
      
      /**
       * Handle incoming real-time location pings.
       */
      processLocationUpdate: (rideId, update) => set((state) => {
        const current = state.cachedParticipants[rideId] || [];
        const existingIdx = current.findIndex(p => p.id === update.id);
        
        const newParticipant: Participant = existingIdx > -1 
          ? { ...current[existingIdx], ...update, lastPingAt: Date.now(), status: 'active' }
          : { 
              id: update.id, 
              displayName: update.displayName || 'Unknown', 
              lastLat: update.lastLat || null, 
              lastLong: update.lastLong || null, 
              lastPingAt: Date.now(), 
              status: 'active', 
              beaconActive: update.beaconActive || false 
            };

        const nextList = existingIdx > -1
          ? current.map((p, i) => i === existingIdx ? newParticipant : p)
          : [...current, newParticipant];

        return {
          cachedParticipants: {
            ...state.cachedParticipants,
            [rideId]: nextList
          }
        };
      }),

      /**
       * Temporal degradation loop (The Fleet Heartbeat).
       */
      runHeartbeat: (rideId) => set((state) => {
        const participants = state.cachedParticipants[rideId];
        if (!participants) return state;

        const now = Date.now();
        let changed = false;

        const updated = participants.map(p => {
          const diffMs = now - p.lastPingAt;
          let nextStatus = p.status;

          if (diffMs > 15 * 60 * 1000) nextStatus = 'dark';
          else if (diffMs > 5 * 60 * 1000) nextStatus = 'inactive';
          else if (diffMs > 2 * 60 * 1000) nextStatus = 'stopped';
          else nextStatus = 'active';

          if (nextStatus !== p.status) {
            changed = true;
            return { ...p, status: nextStatus };
          }
          return p;
        });

        if (!changed) return state;

        return {
          cachedParticipants: {
            ...state.cachedParticipants,
            [rideId]: updated
          }
        };
      }),

      /**
       * Finalize a ride, capture metadata, and fetch AI summary.
       * Fulfills W26: Implement Ride Closure logic.
       */
      endRide: async (rideId) => {
        // 1. Capture final coordinates (lat/long from browser)
        const coords = await new Promise<GeolocationPosition>((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => {
            // Fallback if permission denied
            resolve({ coords: { latitude: 0, longitude: 0 } } as any);
          });
        });

        const lat = coords.coords.latitude;
        const long = coords.coords.longitude;

        // 2. Update DB Status to 'saved'
        const { error: updateError } = await supabase
          .from('rides')
          .update({ 
            status: 'saved', 
            actual_end: new Date().toISOString(),
            finish_coords: `(${long},${lat})`
          })
          .eq('id', rideId);

        if (updateError) throw updateError;

        // 3. Trigger AI Summary Edge Function
        const { data, error: functionError } = await supabase.functions.invoke('generate-ride-summary', {
          body: { rideId }
        });

        if (functionError) throw functionError;

        return data;
      },

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
        isSidebarOpen: state.isSidebarOpen,
      }),
    }
  )
);
