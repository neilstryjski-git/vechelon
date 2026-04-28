import React from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RiderLayout from './components/RiderLayout';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import RouteLibraryPage from './pages/RouteLibrary';
import RideBuilder from './pages/RideBuilder';
import AuthPage from './pages/rider/AuthPage';
import RiderHome from './pages/rider/RiderHome';
import RideLanding from './pages/rider/RideLanding';
import Profile from './pages/rider/Profile';
import MemberDirectory from './pages/rider/MemberDirectory';
import CalendarGrid from './components/CalendarGrid';
import { useBranding } from './hooks/useBranding';
import { useTierDetection } from './hooks/useTierDetection';
import { useAppStore } from './store/useAppStore';
import { supabase } from './lib/supabase';
import { firePortalVisitOnce, type RiderType } from './lib/analyticsEvents';

// Placeholder tenant UUID seeded in useAppStore until the real tenant id
// resolves from the tenants query. The IA portal_visit effect must not fire
// against this UUID — it would either FK-violate the analytics_events insert
// or attribute the very first event of each session to a non-existent tenant.
const PLACEHOLDER_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Simple Error Boundary for UX stability
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('[Vechelon] Boundary caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-20 text-center font-label bg-surface min-h-screen flex flex-col items-center justify-center">
          <span className="material-symbols-outlined text-error text-5xl mb-4">report_problem</span>
          <h1 className="text-on-background text-2xl font-bold mb-2 uppercase tracking-tighter">Tactical System Error</h1>
          <p className="text-on-surface-variant mb-6 font-body max-w-md mx-auto">
            A critical failure occurred in the UI engine. This may be due to connectivity issues or a configuration mismatch.
          </p>
          <div className="bg-surface-container-high p-4 rounded-lg text-left w-full max-w-2xl overflow-auto border border-error/20">
            <code className="text-[10px] text-error font-mono whitespace-pre-wrap">
              {this.state.error?.toString()}
            </code>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 signature-gradient text-on-primary px-8 py-3 rounded-md font-headline font-bold shadow-lg uppercase tracking-widest text-xs"
          >
            Re-Initialize System
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: false,
    },
  },
});

function ClubSettings() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <span className="material-symbols-outlined text-5xl text-primary/30">settings</span>
      <h1 className="font-headline font-black text-2xl tracking-tighter text-on-background uppercase">Club Settings</h1>
      <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Coming Soon</p>
      <p className="font-body text-sm text-on-surface-variant/70 max-w-sm">
        Branding, membership tiers, notification preferences, and integrations will be configurable here.
      </p>
    </div>
  );
}

/** Renders Dashboard for admins, RiderHome for everyone else. */
function SmartHome() {
  const isAdmin = useAppStore((s) => s.isAdmin);
  return isAdmin ? <Dashboard /> : <RiderHome />;
}

/** Renders full admin Members page for admins, rider-safe MemberDirectory for riders. */
function SmartMembers() {
  const isAdmin = useAppStore((s) => s.isAdmin);
  return isAdmin ? <Members /> : <MemberDirectory />;
}

/**
 * Adaptive UI Switcher.
 * Returns the Admin Sidebar layout or Rider Top-Nav layout based on role.
 * Fulfills the "Responsive Entry Point" requirement.
 */
function AdaptiveLayout({ tenant }: { tenant: any }) {
  useTierDetection();
  const isAdmin = useAppStore((s) => s.isAdmin);
  const userTier = useAppStore((s) => s.userTier);
  const currentTenantId = useAppStore((s) => s.currentTenantId);

  // W131 / IA-S0-03: fire portal_visit ONCE per session arrival per VMT-D-42.
  // Idempotent within a session via the sessionStorage guard inside
  // firePortalVisitOnce. We wait for the REAL tenant id (not the store's
  // placeholder seed) before firing — otherwise the first event of every
  // session attributes to a tenant that may not exist, causing FK violations
  // on insert. The setTenantId effect in AppContent overwrites the seed once
  // the tenant query resolves.
  React.useEffect(() => {
    if (!currentTenantId) return;
    if (currentTenantId === PLACEHOLDER_TENANT_ID) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      let riderType: RiderType = 'unknown';
      if (data.user) {
        riderType = userTier === 'affiliated' ? 'member' : 'guest';
      }
      void firePortalVisitOnce({ tenantId: currentTenantId, riderType });
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTenantId, userTier]);

  if (isAdmin) {
    return <Layout tenant={tenant || {}} />;
  }

  return <RiderLayout />;
}

function AppContent() {
  // Dynamic branding fetch from Supabase with a 5s timeout for offline resilience
  const { data: tenant, error: tenantError, isLoading: tenantLoading } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async () => {
      console.log('[v1.3.0] Fetching tenant config...');
      
      const fetchPromise = supabase
        .from('tenants')
        .select('id, primary_color, accent_color, logo_url, name')
        .limit(1)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tenant config fetch timed out')), 5000)
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]) as any;
      
      if (result instanceof Error) throw result;
      if (result.error) throw result.error;
      
      return result.data || {};
    },
    retry: 1,
    staleTime: Infinity
  });

  if (tenantError) {
    console.warn('[v1.3.0] Using fallback branding:', tenantError);
  }

  // Update tab title to tenant name
  if (tenant?.name) document.title = tenant.name;

  // W131 / IA-S0-03: keep store tenant_id in sync with the resolved tenant
  // so analytics_events inserts attribute correctly. The store's hardcoded
  // placeholder UUID is left in place as a fallback for now; once subdomain
  // routing (MT-S0-03 / W124) lands, this set is the single source of truth.
  const setTenantId = useAppStore((s) => s.setTenantId);
  React.useEffect(() => {
    if (tenant?.id) setTenantId(tenant.id);
  }, [tenant?.id, setTenantId]);

  // Fallback to Velo Modern defaults
  useBranding(tenant && tenant.primary_color ? {
    primaryColor: tenant.primary_color,
    accentColor: tenant.accent_color,
    logoUrl: tenant.logo_url || undefined,
  } : {
    primaryColor: '#5f5e5e',
    accentColor: '#006e35',
  });

  if (tenantLoading) {
    return <div className="p-20 text-center font-label animate-pulse text-on-surface-variant flex flex-col items-center justify-center min-h-screen bg-surface">
      <span className="material-symbols-outlined text-4xl mb-4 animate-spin text-primary/20">sync</span>
      SYNCHRONIZING TACTICAL DATA...
    </div>;
  }

  console.log('[Vechelon] Rendering Router with basename /portal. Path:', window.location.pathname);

  return (
    <Router basename="/portal">
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        
        {/* ONE UNIFIED ENTRY POINT — AdaptiveLayout renders either admin Layout or RiderLayout */}
        <Route path="/" element={<AdaptiveLayout tenant={tenant} />}>
          {/* Index: SmartHome switches based on role */}
          <Route index           element={<SmartHome />}         />
          <Route path="dashboard" element={<Dashboard />}        />
          <Route path="calendar"  element={<CalendarGrid />}     />
          <Route path="routes"    element={<RouteLibraryPage />} />
          <Route path="builder/:rideId" element={<RideBuilder />} />
          <Route path="members"   element={<SmartMembers />}      />
          <Route path="profile"   element={<Profile />}          />
          <Route path="settings"  element={<ClubSettings />}    />
          <Route path="ride/:rideId" element={<RideLanding />}  />

          {/* Catch-all */}
          <Route path="*" element={<div className="p-20 text-center font-label text-error">ROUTE NOT MATCHED</div>} />
        </Route>
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
