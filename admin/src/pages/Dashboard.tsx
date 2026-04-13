import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import EndRideButton from '../components/EndRideButton';

// ---------------------------------------------------------------------------
// Stat queries
// ---------------------------------------------------------------------------

function useActiveRides() {
  return useQuery({
    queryKey: ['stats', 'active-rides-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, thumbnail_url, external_url')
        .eq('status', 'active')
        .limit(5);
      if (error) throw error;
      return data || [];
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

function useTotalMembersCount() {
  return useQuery({
    queryKey: ['stats', 'total-members'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('account_tenants')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'affiliated');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, isLoading }: {
  label:     string;
  value:     number;
  isLoading: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-ambient border border-surface-container-low/50">
      <h3 className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-3">
        {label}
      </h3>
      {isLoading ? (
        <div className="h-10 w-24 rounded bg-surface-container-high animate-pulse" />
      ) : (
        <p className="font-headline text-4xl font-extrabold text-on-background tracking-tighter">{value}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const Dashboard: React.FC = () => {
  const { data: activeRidesCount, isLoading: loadingCount } = useActiveRidesCount();
  const { data: upcomingRides,    isLoading: loadingUpcoming } = useUpcomingRidesCount();
  const { data: totalMembers,     isLoading: loadingMembers } = useTotalMembersCount();
  const { data: activeRidesList } = useActiveRides();

  return (
    <div className="space-y-10">

      {/* Editorial Header */}
      <header className="flex justify-between items-end">
        <div>
          <span className="font-label text-[10px] uppercase tracking-[0.3em] text-brand-primary mb-2 block font-bold">
            Operations Overview
          </span>
          <h2 className="font-headline text-5xl font-extrabold tracking-tighter text-on-background italic">
            Command Centre
          </h2>
        </div>
        <div className="text-right hidden md:block">
          <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block opacity-50">System Status</span>
          <span className="font-label text-[10px] uppercase tracking-widest text-brand-primary flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-pulse" />
            Live Deployment
          </span>
        </div>
      </header>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Active Rides"       value={activeRidesCount ?? 0} isLoading={loadingCount}   />
        <StatCard label="Upcoming Scheduled" value={upcomingRides    ?? 0} isLoading={loadingUpcoming} />
        <StatCard label="Total Members"      value={totalMembers     ?? 0} isLoading={loadingMembers}  />
      </div>

      {/* Tactical Testing Area (Mounting the End Ride Button) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Active Rides Tactical Control */}
        <section className="space-y-4">
          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-surface-container-low pb-2">
            Tactical Session Control
          </h3>
          <div className="space-y-4">
            {activeRidesList && activeRidesList.length > 0 ? (
              activeRidesList.map((ride: any) => (
                <div key={ride.id} className="bg-surface-container-lowest overflow-hidden rounded-2xl shadow-ambient border border-surface-container-low/50 flex flex-col md:flex-row">
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
                      <span className="font-label text-[9px] bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">Active</span>
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

        {/* Recent Activity Placeholder */}
        <section className="space-y-4">
          <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-surface-container-low pb-2">
            Recent Intelligence
          </h3>
          <div className="bg-surface-container-lowest rounded-2xl shadow-ambient border border-surface-container-low/50 overflow-hidden flex flex-col h-full min-h-[200px]">
            <div className="p-12 text-center my-auto opacity-40">
              <p className="font-label text-sm text-on-surface-variant tracking-tight">
                — No recent activity to display —
              </p>
            </div>
          </div>
        </section>

      </div>

    </div>
  );
};

export default Dashboard;
