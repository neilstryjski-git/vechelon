import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export type UserTier = 'guest' | 'initiated' | 'affiliated';
export type RiderStatus = 'active' | 'stopped' | 'inactive' | 'dark';
export type RideType = 'route' | 'adhoc' | 'meetup';

export const RIDE_TYPE_LABELS: Record<RideType | string, string> = {
  route:  'Route Ride',
  meetup: 'Meetup Ride',
  adhoc:  'Ad Hoc',
};

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
  sessionCookieId: string | null;
  
  // Tactical & Auth State (Non-Persisted)
  isOnline: boolean;
  isPriorityMode: boolean;
  userTier: UserTier;
  isAdmin: boolean;
  isRideGuest: boolean;
  membershipStatus: string | null;
  activeBeacons: string[]; // participantIds
  cachedParticipants: Record<string, Participant[]>; // rideId -> participants
  selectedRideId: string | null;
  selectedParticipantId: string | null;
  rideSheetVisible: boolean;

  // Actions
  setTenantId: (id: string | null) => void;
  setSelectedRideId: (id: string | null) => void;
  closeSheet: () => void;
  setSelectedParticipantId: (id: string | null) => void;
  toggleSidebar: () => void;
  setOnlineStatus: (status: boolean) => void;
  setIsRideGuest: (status: boolean) => void;
  setTier: (tier: UserTier, status?: string | null, role?: string | null) => void;
  updateCachedParticipants: (rideId: string, participants: Participant[]) => void;
  processLocationUpdate: (rideId: string, update: Partial<Participant> & { id: string }) => void;
  runHeartbeat: (rideId: string) => void;
  joinRide: (rideId: string, guestName?: string, guestEmail?: string) => Promise<void>;
  endRide: (rideId: string) => Promise<{ summary: string; weather: any }>;
  addActiveBeacon: (participantId: string) => void;
  removeActiveBeacon: (participantId: string) => void;
}

/**
 * Global Zustand store with tactical state and Rider State Machine.
 * Fulfills W23: Implement Fleet Heartbeat & Rider State Machine.
 * Fulfills W26: Implement Ride Closure logic.
 * Fulfills W35: Rider Portal state.
 * Fulfills W59: Implement Linked History Logic (Post-Registration).
 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentTenantId: '00000000-0000-0000-0000-000000000001',
      isSidebarOpen: true,
      sessionCookieId: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isPriorityMode: false,
      userTier: 'guest',
      isAdmin: false,
      isRideGuest: false,
      membershipStatus: null,
      activeBeacons: [],
      cachedParticipants: {},
      selectedRideId: null,
      selectedParticipantId: null,
      rideSheetVisible: false,

      setTenantId: (id) => set({ currentTenantId: id }),
      setSelectedRideId: (id) => set({ selectedRideId: id, rideSheetVisible: id !== null }),
      closeSheet: () => set({ rideSheetVisible: false }),
      setSelectedParticipantId: (id) => set({ selectedParticipantId: id }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setOnlineStatus: (status) => set({ isOnline: status }),
      setIsRideGuest: (status) => set({ isRideGuest: status }),
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
       * RSVP to a ride (affiliates the user with the ride instance).
       * Fulfills Pillar 2 / Section 10.5.
       * Fulfills W64: Anonymous Join (No Auth).
       */
      joinRide: async (rideId, guestName?: string, guestEmail?: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        const sessionCookieId = useAppStore.getState().sessionCookieId;

        let accountId = user?.id || null;
        let displayName = guestName ?? 'Guest Rider';
        let phone = null;

        if (user) {
          const { data: account } = await supabase
            .from('accounts')
            .select('name, phone')
            .eq('id', user.id)
            .maybeSingle();

          displayName = account?.name || user.email?.split('@')[0] || 'Member';
          phone = account?.phone;
        } else {
          // If not logged in, we set the guest flag for history conversion
          set({ isRideGuest: true });
        }

        const { error } = await supabase
          .from('ride_participants')
          .insert({
            ride_id: rideId,
            account_id: accountId,
            display_name: displayName,
            phone: phone,
            email: user ? null : (guestEmail || null),
            role: user ? 'member' : 'guest',
            status: 'rsvpd',
            session_cookie_id: sessionCookieId
          });

        if (error) throw error;
      },

      /**
       * Finalize a ride, capture metadata, and fetch AI summary.
       * Fulfills W26: Implement Ride Closure logic.
       */
      endRide: async (rideId) => {
        const coords = await new Promise<GeolocationPosition>((resolve) => {
          navigator.geolocation.getCurrentPosition(resolve, () => {
            resolve({ coords: { latitude: 0, longitude: 0 } } as any);
          });
        });

        const lat = coords.coords.latitude;
        const long = coords.coords.longitude;

        const { error: updateError } = await supabase
          .from('rides')
          .update({ 
            status: 'saved', 
            actual_end: new Date().toISOString(),
            finish_coords: `(${long},${lat})`
          })
          .eq('id', rideId);

        if (updateError) throw updateError;

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
      name: 'vechelon-admin-storage-v2',
      onRehydrateStorage: () => (state) => {
        // Initialize sessionCookieId if missing after rehydration
        if (state && !state.sessionCookieId) {
          state.sessionCookieId = crypto.randomUUID();
        }
      },
      partialize: (state) => ({ 
        isSidebarOpen: state.isSidebarOpen,
        sessionCookieId: state.sessionCookieId,
        isRideGuest: state.isRideGuest,
      }),
    }
  )
);
