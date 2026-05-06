import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';

// ---------------------------------------------------------------------------
// Per-tenant queries
// ---------------------------------------------------------------------------

function useTenantRideCount(tenantId: string) {
  return useQuery({
    queryKey: ['pa-stats', 'rides', tenantId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 1000 * 60 * 2,
  });
}

function useTenantMemberCounts(tenantId: string) {
  return useQuery({
    queryKey: ['pa-stats', 'members', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_tenants')
        .select('status')
        .eq('tenant_id', tenantId)
        .in('status', ['affiliated', 'initiated']);
      if (error) throw error;
      const affiliated = data?.filter((r) => r.status === 'affiliated').length ?? 0;
      const initiated  = data?.filter((r) => r.status === 'initiated').length ?? 0;
      return { affiliated, initiated };
    },
    staleTime: 1000 * 60 * 2,
  });
}

// Returns the current user's role for this tenant, or null if no record.
// null = read-only fallback per Pillar II §4.2 / acceptance criteria.
function useMyTenantRole(tenantId: string) {
  return useQuery({
    queryKey: ['pa-my-role', tenantId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase
        .from('account_tenants')
        .select('role')
        .eq('tenant_id', tenantId)
        .eq('account_id', session.user.id)
        .maybeSingle();
      return (data?.role as string | null) ?? null;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ---------------------------------------------------------------------------
// TenantCard — mirrors Dashboard.tsx StatCard layout per patterns_to_follow
// ---------------------------------------------------------------------------

interface TenantCardProps {
  tenant: { id: string; name: string; slug: string; enrollment_mode: string };
}

function TenantCard({ tenant }: TenantCardProps) {
  const { data: rideCount, isLoading: loadingRides }  = useTenantRideCount(tenant.id);
  const { data: members,   isLoading: loadingMembers } = useTenantMemberCounts(tenant.id);
  const { data: myRole }                               = useMyTenantRole(tenant.id);

  // null or undefined = no account_tenants record → read-only fallback
  const isClubAdmin = myRole === 'admin';

  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-ambient border border-surface-container-low/50 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-headline font-extrabold text-xl tracking-tighter text-on-background">
            {tenant.name}
          </h3>
          <p className="font-mono text-[11px] text-on-surface-variant mt-0.5">{tenant.slug}.vechelon.ca</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className={`font-label text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
            tenant.enrollment_mode === 'open'
              ? 'bg-tertiary/10 text-tertiary border-tertiary/20'
              : 'bg-on-surface-variant/10 text-on-surface-variant border-outline-variant/30'
          }`}>
            {tenant.enrollment_mode}
          </span>
          {/* Role badge — shows inherited access level from account_tenants */}
          <span className={`font-label text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
            isClubAdmin
              ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
              : 'bg-surface-container-high text-on-surface-variant/50 border-outline-variant/20'
          }`}>
            {isClubAdmin ? 'Admin' : 'Read-only'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-surface-container-low">
        <div>
          <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-1">Rides</p>
          {loadingRides ? (
            <div className="h-7 w-12 rounded bg-surface-container-high animate-pulse" />
          ) : (
            <p className="font-headline text-3xl font-extrabold tracking-tighter text-on-background">{rideCount}</p>
          )}
        </div>
        <div>
          <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-1">Members</p>
          {loadingMembers ? (
            <div className="h-7 w-12 rounded bg-surface-container-high animate-pulse" />
          ) : (
            <>
              <p className="font-headline text-3xl font-extrabold tracking-tighter text-on-background">
                {(members?.affiliated ?? 0) + (members?.initiated ?? 0)}
              </p>
              <div className="flex flex-col gap-0.5 mt-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
                  <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">
                    {members?.affiliated ?? 0} affiliated
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/30 flex-shrink-0" />
                  <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">
                    {members?.initiated ?? 0} pending
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Role-gated write control: "Open Portal" only when account_tenants role=admin */}
      <div className="mt-auto flex flex-col gap-2">
        {isClubAdmin ? (
          <a
            href={`https://${tenant.slug}.vechelon.ca`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-brand-primary/10 text-brand-primary font-label text-[10px] uppercase tracking-widest border border-brand-primary/20 hover:bg-brand-primary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
            Open Club Portal
          </a>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-surface-container-high text-on-surface-variant/40 font-label text-[10px] uppercase tracking-widest border border-outline-variant/10 cursor-not-allowed">
            <span className="material-symbols-outlined text-sm">lock</span>
            Read-only — no admin record
          </div>
        )}
        <Link
          to={`/clubs/${tenant.id}/provisioning`}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-surface-container-low text-on-surface-variant font-label text-[9px] uppercase tracking-widest border border-outline-variant/20 hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-sm">checklist</span>
          Provisioning
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformHome
// ---------------------------------------------------------------------------

interface Tenant {
  id: string;
  name: string;
  slug: string;
  enrollment_mode: string;
  created_at: string;
}

const PlatformHome: React.FC = () => {
  const { data: tenants, isLoading } = useQuery<Tenant[]>({
    queryKey: ['pa-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, enrollment_mode, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="space-y-8">
      <PageHeader label="Platform Admin" title="All Clubs" italicTitle>
        <Link
          to="/clubs/new"
          className="signature-gradient text-on-primary px-6 py-3 rounded-xl font-headline font-bold tracking-widest uppercase text-xs flex items-center gap-2 shadow-ambient whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-sm">add_circle</span>
          Create Club
        </Link>
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="bg-surface-container-lowest p-6 rounded-xl border border-surface-container-low/50 animate-pulse h-52" />
          ))}
        </div>
      ) : tenants && tenants.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((t) => (
            <TenantCard key={t.id} tenant={t} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/20">domain_add</span>
          <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">No clubs provisioned yet</p>
          <Link
            to="/clubs/new"
            className="mt-2 font-label text-[10px] uppercase tracking-widest text-brand-primary hover:opacity-80 transition-opacity"
          >
            Create the first club →
          </Link>
        </div>
      )}
    </div>
  );
};

export default PlatformHome;
