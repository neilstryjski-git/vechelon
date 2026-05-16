import React from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import RiderLayout from './components/RiderLayout';
import Dashboard from './pages/Dashboard';
import AdminRideFeed from './pages/AdminRideFeed';
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
import { usePlatformAdminCheck } from './hooks/usePlatformAdminCheck';
import { useAppStore } from './store/useAppStore';
import { supabase } from './lib/supabase';
import { extractSlug } from './lib/extractSlug';
import { PORTAL_BASE } from './lib/portalBase';
import { firePortalVisitOnce, type RiderType } from './lib/analyticsEvents';
import ClubNotFound from './pages/ClubNotFound';
import PlatformAdminApp from './pages/PlatformAdminApp';

// W140: store now initializes currentTenantId to null. The AdaptiveLayout
// effect and the broadcast_copy guard short-circuit on null, so no placeholder
// UUID is needed. Pre-W140 a placeholder seeded the store; that pattern is
// gone.

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
          <h1 className="text-on-background text-2xl font-bold mb-2 uppercase tracking-tighter">Something went wrong</h1>
          <p className="text-on-surface-variant mb-6 font-body max-w-md mx-auto">
            Something went wrong loading the app. This may be due to connectivity issues or a configuration mismatch.
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
            Reload
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
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin);
  return (isAdmin || isPlatformAdmin) ? <Dashboard /> : <RiderHome />;
}

/** Renders full admin Members page for admins, rider-safe MemberDirectory for riders. */
function SmartMembers() {
  const isAdmin = useAppStore((s) => s.isAdmin);
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin);
  return (isAdmin || isPlatformAdmin) ? <Members /> : <MemberDirectory />;
}

/**
 * Adaptive UI Switcher.
 * Returns the Admin Sidebar layout or Rider Top-Nav layout based on role.
 * Platform admins always get the admin layout regardless of account_tenants role.
 */
function AdaptiveLayout({ tenant }: { tenant: any }) {
  useTierDetection();
  const { isLoading: paLoading } = usePlatformAdminCheck();
  const isAdmin = useAppStore((s) => s.isAdmin);
  const isPlatformAdmin = useAppStore((s) => s.isPlatformAdmin);
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

  // Wait for platform admin check before committing to a layout — prevents
  // non-affiliated platform admins from briefly seeing the initiated HUD.
  if (paLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl animate-spin text-on-surface-variant/20">sync</span>
      </div>
    );
  }

  if (isAdmin || isPlatformAdmin) {
    return <Layout tenant={tenant || {}} />;
  }

  return <RiderLayout />;
}

function AppContent() {
  // MT-S0-03 / W124: subdomain-slug routing. The slug derived here is the
  // single source of truth for which tenant the app loads. Apex, admin.*,
  // localhost, vercel previews, and unrelated domains all resolve to null —
  // those contexts render ClubNotFound (no fallback to "first tenant").
  const slug = React.useMemo(() => extractSlug(window.location.hostname), []);

  // W129: admin.vechelon.ca is the Platform Admin surface. Short-circuit
  // here before slug===null falls through to ClubNotFound.
  const isAdminHost = React.useMemo(
    () => window.location.hostname === 'admin.vechelon.ca' || window.location.hostname.startsWith('admin.'),
    []
  );

  const { data: tenant, error: tenantError, isLoading: tenantLoading } = useQuery({
    queryKey: ['tenant-config', slug],
    enabled: slug !== null,
    queryFn: async () => {
      const fetchPromise = supabase
        .from('tenants')
        .select('id, primary_color, accent_color, logo_url, qr_mark_url, banner_url, name, slug')
        .eq('slug', slug as string)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tenant config fetch timed out')), 5000)
      );

      const result = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (result instanceof Error) throw result;
      if (result.error) throw result.error;

      return result.data ?? null;
    },
    retry: 1,
    staleTime: Infinity
  });

  if (tenantError) {
    console.warn('[Vechelon] Tenant lookup failed', { code: (tenantError as { code?: string })?.code });
  }

  // No-tenant context: slug is null OR query resolved with no row. We reset
  // tab title and store tenant id so navigating from a valid tenant to a
  // ClubNotFound state does not leave the previous tenant's name/id behind.
  const isNoTenantContext = slug === null || (!tenantLoading && !tenant);

  React.useEffect(() => {
    if (isAdminHost) {
      document.title = 'Vechelon Platform Admin';
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (link) link.href = '/portal/vechelon-halfchainring.svg';
      return;
    }
    if (tenant?.name) {
      document.title = tenant.name;
    } else if (isNoTenantContext) {
      document.title = 'Vechelon';
    }
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (link) {
      link.href = tenant?.qr_mark_url ?? tenant?.logo_url ?? '/portal/favicon.svg';
    }
  }, [isAdminHost, tenant?.name, tenant?.logo_url, tenant?.qr_mark_url, isNoTenantContext]);

  const setTenantId = useAppStore((s) => s.setTenantId);
  const setQrMarkUrl = useAppStore((s) => s.setQrMarkUrl);
  React.useEffect(() => {
    if (tenant?.id) {
      setTenantId(tenant.id);
      setQrMarkUrl(tenant.qr_mark_url ?? null);
    } else if (isNoTenantContext) {
      setTenantId(null);
      setQrMarkUrl(null);
    }
  }, [tenant?.id, tenant?.qr_mark_url, isNoTenantContext, setTenantId, setQrMarkUrl]);

  // Pass null to useBranding on no-tenant paths so it doesn't write any
  // tenant CSS variables onto :root (the hook already no-ops on null).
  useBranding(
    !isNoTenantContext && tenant && tenant.primary_color
      ? {
          primaryColor: tenant.primary_color,
          accentColor: tenant.accent_color,
          logoUrl: tenant.logo_url || undefined,
        }
      : null
  );

  if (isAdminHost) {
    return <PlatformAdminApp />;
  }

  if (slug === null) {
    return <ClubNotFound />;
  }

  if (tenantLoading) {
    return <div className="p-20 text-center font-label animate-pulse text-on-surface-variant flex flex-col items-center justify-center min-h-screen bg-surface">
      <span className="material-symbols-outlined text-4xl mb-4 animate-spin text-primary/20">sync</span>
      LOADING…
    </div>;
  }

  if (!tenant) {
    return <ClubNotFound />;
  }

  return (
    <Router basename={PORTAL_BASE}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        
        {/* ONE UNIFIED ENTRY POINT — AdaptiveLayout renders either admin Layout or RiderLayout */}
        <Route path="/" element={<AdaptiveLayout tenant={tenant} />}>
          {/* Index: SmartHome switches based on role */}
          <Route index           element={<SmartHome />}         />
          <Route path="dashboard" element={<Dashboard />}        />
          <Route path="rides"     element={<AdminRideFeed />}   />
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
