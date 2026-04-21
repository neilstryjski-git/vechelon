import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { fetchGpxPoints, parsePoint } from '../lib/maps';
import InteractiveMap from '../components/InteractiveMap';
import EndRideButton from '../components/EndRideButton';
import PageHeader from '../components/PageHeader';
import RideFormModal from '../components/RideFormModal';

// ---------------------------------------------------------------------------
// Stat queries
// ---------------------------------------------------------------------------

function useActiveRides() {
  return useQuery({
    queryKey: ['stats', 'active-rides-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, thumbnail_url, external_url, gpx_path, ride_participants(role)')
        .eq('status', 'active')
        .limit(5);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        hasCaptain: (r.ride_participants as { role: string }[] | null)?.some(p => p.role === 'captain') ?? false,
      }));
    },
  });
}

function useActiveRidesCount() {
  return useQuery({
    queryKey: ['stats', 'active-rides'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useUpcomingRidesCount() {
  return useQuery({
    queryKey: ['stats', 'upcoming-rides'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'created')
        .gt('scheduled_start', new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useMemberCounts() {
  return useQuery({
    queryKey: ['stats', 'member-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_tenants')
        .select('status')
        .in('status', ['affiliated', 'initiated']);
      if (error) throw error;
      const affiliated = data?.filter(r => r.status === 'affiliated').length ?? 0;
      const initiated  = data?.filter(r => r.status === 'initiated').length ?? 0;
      return { affiliated, initiated };
    },
  });
}

function useRideParticipants(rideId: string | null) {
  return useQuery({
    queryKey: ['ride-participants', rideId],
    queryFn: async () => {
      if (!rideId) return [];
      const { data, error } = await supabase
        .from('ride_participants')
        .select('id, display_name, role, status, last_location')
        .eq('ride_id', rideId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!rideId,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, isLoading, subCounts, roadmapNote }: {
  label:        string;
  value:        number;
  isLoading:    boolean;
  subCounts?:   { label: string; value: number; active?: boolean }[];
  roadmapNote?: string;
}) {
  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-ambient border border-surface-container-low/50 flex flex-col gap-3">
      <h3 className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
        {label}
      </h3>
      {isLoading ? (
        <div className="h-10 w-24 rounded bg-surface-container-high animate-pulse" />
      ) : (
        <p className="font-headline text-4xl font-extrabold text-on-background tracking-tighter">{value}</p>
      )}
      {!isLoading && subCounts && (
        <div className="flex flex-col gap-1 mt-1">
          {subCounts.map(sc => (
            <div key={sc.label} className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.active ? 'bg-brand-primary' : 'bg-on-surface-variant/30'}`} />
              <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">
                {sc.value} {sc.label}
              </span>
            </div>
          ))}
        </div>
      )}
      {roadmapNote && (
        <div className="mt-auto pt-2 border-t border-surface-container-low">
          <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant/40">{roadmapNote}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const setSelectedRideId = useAppStore((state) => state.setSelectedRideId);
  const setSelectedParticipantId = useAppStore((state) => state.setSelectedParticipantId);
  const selectedRideId    = useAppStore((state) => state.selectedRideId);
  const activeBeacons     = useAppStore((state) => state.activeBeacons);
  const isAdmin           = useAppStore((state) => state.isAdmin);
  const isRideGuest       = useAppStore((state) => state.isRideGuest);
  const userTier          = useAppStore((state) => state.userTier);
  
  const { data: activeRidesCount, isLoading: loadingCount } = useActiveRidesCount();
  const { data: upcomingRides,    isLoading: loadingUpcoming } = useUpcomingRidesCount();
  const { data: memberCounts,     isLoading: loadingMembers } = useMemberCounts();
  const { data: activeRidesList } = useActiveRides();

  const [isCreateRideOpen, setIsCreateRideOpen] = useState(false);

  const primaryRideId = selectedRideId || activeRidesList?.[0]?.id || null;
  const { data: participants = [] } = useRideParticipants(primaryRideId);

  // Fetch route + location data for the selected ride
  const { data: selectedRideData } = useQuery({
    queryKey: ['ride-gpx-path', primaryRideId],
    queryFn: async () => {
      const { data } = await supabase
        .from('rides')
        .select('gpx_path, meetup_coords, meetup_label, start_coords, start_label')
        .eq('id', primaryRideId!)
        .single();
      return data;
    },
    enabled: !!primaryRideId,
  });

  const [mapPoints, setMapPoints] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedRideData) {
      setMapPoints([]);
      return;
    }
    const gpxPath = selectedRideData.gpx_path;
    if (gpxPath) {
      fetchGpxPoints(gpxPath).then(setMapPoints).catch(console.error);
    } else {
      setMapPoints([]);
    }
  }, [selectedRideData]);

  // Convert participants to markers
  const participantMarkers = participants.map((p: any) => {
    if (!p.last_location) return null;
    const match = p.last_location.match(/\((.*),(.*)\)/);
    if (!match) return null;

    return {
      id: p.id,
      position: { lat: parseFloat(match[2]), lng: parseFloat(match[1]) },
      label: p.display_name,
      type: 'rider' as const,
      alert: activeBeacons.includes(p.id)
    };
  }).filter(Boolean);

  // Build meetup/start marker for the selected ride so the map always shows something
  const meetupMarker = (() => {
    if (!selectedRideData || !primaryRideId) return null;
    const coords = parsePoint(selectedRideData.meetup_coords ?? selectedRideData.start_coords);
    if (!coords) return null;
    return {
      id: `meetup-${primaryRideId}`,
      position: coords,
      label: selectedRideData.meetup_label ?? selectedRideData.start_label ?? 'Meetup',
      type: 'start' as const,
    };
  })();

  const allMarkers = [
    ...(meetupMarker ? [meetupMarker] : []),
    ...(participantMarkers as any[]),
  ];

  return (
    <div className="space-y-10">

      <PageHeader 
        label="Operations Overview"
        title="Command Centre"
      >
        <div className="text-right hidden md:block">
          <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block opacity-50 mb-1">System Status</span>
          <span className="font-label text-[10px] uppercase tracking-widest text-brand-primary flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-pulse" />
            Live Deployment
          </span>
        </div>
      </PageHeader>

      {/* Hero CTA — Plan a Ride */}
      {isAdmin && (
        <>
          <button
            onClick={() => setIsCreateRideOpen(true)}
            className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold text-base tracking-widest uppercase shadow-lg hover:opacity-90 transition-all active:scale-[0.99] flex items-center justify-center gap-3"
          >
            <span className="material-symbols-outlined text-xl">add_circle</span>
            Plan a Ride
          </button>
          <RideFormModal
            mode="create"
            isOpen={isCreateRideOpen}
            onClose={() => setIsCreateRideOpen(false)}
          />
        </>
      )}

      {/* Guest Conversion Card */}
      {userTier === 'guest' && isRideGuest && (
        <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="font-headline font-bold text-xl text-on-background">Claim your ride history</h3>
            <p className="font-body text-sm text-on-surface-variant max-w-md">
              You've joined tactical sessions as a guest. Create a permanent account to preserve your pings, routes, and club achievements.
            </p>
          </div>
          <button 
            onClick={() => navigate('/auth')}
            className="signature-gradient text-on-primary px-8 py-3 rounded-md font-headline font-bold shadow-lg hover:opacity-90 transition-all active:scale-95 whitespace-nowrap"
          >
            Create Account
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Active Rides"
          value={activeRidesCount ?? 0}
          isLoading={loadingCount}
          roadmapNote="v2.0 — Live tactical map on mobile"
        />
        <StatCard
          label="Upcoming Scheduled"
          value={upcomingRides ?? 0}
          isLoading={loadingUpcoming}
        />
        <StatCard
          label="Members"
          value={memberCounts?.affiliated ?? 0}
          isLoading={loadingMembers}
          subCounts={[
            { label: 'Affiliated', value: memberCounts?.affiliated ?? 0, active: true },
            { label: 'Pending',    value: memberCounts?.initiated  ?? 0, active: false },
          ]}
        />
      </div>

      {/* Tactical Testing Area (Mounting the End Ride Button) */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-8`}>
        
        {/* Active Rides Tactical Control */}
        {isAdmin && (
          <section className="space-y-4">
            <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-surface-container-low pb-2">
              Tactical Session Control
            </h3>
            <div className="space-y-4">
              {activeRidesList && activeRidesList.length > 0 ? (
                activeRidesList.map((ride: any) => (
                  <div 
                    key={ride.id} 
                    onClick={() => setSelectedRideId(ride.id)}
                    className={`bg-surface-container-lowest overflow-hidden rounded-2xl shadow-ambient border flex flex-col md:flex-row cursor-pointer transition-all group ${
                      primaryRideId === ride.id ? 'border-primary ring-1 ring-primary/20 bg-surface-container-low' : 'border-surface-container-low/50 hover:bg-surface-container-low'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-full md:w-48 h-32 bg-surface-container-high shrink-0">
                      {ride.thumbnail_url ? (
                        <img 
                          src={ride.thumbnail_url} 
                          alt={ride.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-on-surface-variant/30">map</span>
                        </div>
                      )}
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-headline font-bold text-lg text-on-background line-clamp-1">{ride.name}</h4>
                          {ride.external_url && (
                            <a
                              href={ride.external_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-label text-[9px] uppercase tracking-widest text-primary mt-1"
                            >
                              Activity Link <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="font-label text-[9px] bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full uppercase tracking-widest">Active</span>
                          {!ride.hasCaptain && (
                            <span className="flex items-center gap-1 font-label text-[9px] uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <span className="material-symbols-outlined text-[10px]">warning</span>
                              No Captain
                            </span>
                          )}
                        </div>
                      </div>
                      <EndRideButton rideId={ride.id} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-ambient border border-surface-container-low/50 min-h-[200px] flex flex-col justify-center text-center space-y-4">
                  <p className="font-body text-sm text-on-surface-variant opacity-60 italic">
                    No active tactical sessions detected.
                  </p>
                  <div className="pt-4 opacity-30 grayscale pointer-events-none">
                     <EndRideButton rideId="test-mock-id" />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Live Tactical Intelligence (Interactive Map) */}
        <section className="space-y-4">
          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-surface-container-low pb-2">
            Live Tactical Intelligence
          </h3>
          <div className="bg-surface-container-lowest rounded-2xl shadow-ambient border border-surface-container-low/50 overflow-hidden flex flex-col h-[400px] relative font-label">
            {primaryRideId ? (
              <InteractiveMap
                points={mapPoints}
                markers={allMarkers}
                focusedMarkerId={meetupMarker?.id ?? undefined}
                onMarkerClick={(id) => setSelectedParticipantId(id)}
              />
            ) : (
              <div className="p-12 text-center my-auto opacity-40">
                <p className="font-label text-sm text-on-surface-variant tracking-tight">
                  — No active tactical sessions to map —
                </p>
              </div>
            )}
          </div>
        </section>

      </div>

    </div>
  );
};

export default Dashboard;
