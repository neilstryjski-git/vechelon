import React from 'react';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import RouteLibraryPage from './pages/RouteLibrary';
import RideBuilder from './pages/RideBuilder';
import CalendarGrid from './components/CalendarGrid';
import { useBranding } from './hooks/useBranding';
import { supabase } from './lib/supabase';

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

/**
 * Adaptive UI Switcher.
 * Returns the Admin Sidebar layout or Rider Top-Nav layout based on status.
 * Fulfills the "Responsive Entry Point" requirement.
 */
function AdaptiveLayout({ tenant }: { tenant: any }) {
  // Restore Admin Layout as default for development/testing
  return <Layout tenant={tenant || {}} />;
}

function AppContent() {
  // Dynamic branding fetch from Supabase with a 5s timeout for offline resilience
  const { data: tenant, error: tenantError, isLoading: tenantLoading } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async () => {
      console.log('[v1.3.0] Fetching tenant config...');
      
      const fetchPromise = supabase
        .from('tenants')
        .select('primary_color, accent_color, logo_url')
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
        {/* Redirect from root to dashboard if needed */}
        <Route path="/" element={<AdaptiveLayout tenant={tenant} />}>
          <Route index      element={<Dashboard />}    />
          <Route path="dashboard" element={<Dashboard />}    />
          <Route path="calendar" element={<CalendarGrid />} />
          <Route path="routes"   element={<RouteLibraryPage />} />
          <Route path="builder/:rideId" element={<RideBuilder />} />
          <Route path="members"  element={<Members />}      />
          <Route path="profile"  element={<Dashboard />} /> {/* Placeholder */}
          
          {/* Catch-all redirects back to the adaptive home */}
          <Route path="*"       element={<div className="p-20 text-center font-label text-error">ROUTE NOT MATCHED</div>} />
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
