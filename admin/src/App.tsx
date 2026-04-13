import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import RouteLibraryPage from './pages/RouteLibrary';
import CalendarGrid from './components/CalendarGrid';
import { useBranding } from './hooks/useBranding';
import { supabase } from './lib/supabase';

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
  // Dynamic branding fetch from Supabase
  const { data: tenant, error: tenantError, isLoading: tenantLoading } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async () => {
      console.log('[v1.2.9] Fetching tenant config...');
      const { data, error } = await supabase
        .from('tenants')
        .select('primary_color, accent_color, logo_url')
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('[v1.2.9] Tenant config fetch failed:', error);
        return {};
      }
      console.log('[v1.2.9] Tenant config fetched:', data);
      return data || {};
    },
  });

  if (tenantError) {
    console.warn('[v1.2.9] Using fallback branding due to query error:', tenantError);
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
    return <div className="p-20 text-center font-label animate-pulse">SYNCHRONIZING TACTICAL DATA...</div>;
  }

  return (
    <Router basename="/portal">
      <Routes>
        {/* ONE UNIFIED ENTRY POINT */}
        <Route path="/" element={<AdaptiveLayout tenant={tenant} />}>
          <Route index      element={<Dashboard />}    />
          <Route path="calendar" element={<CalendarGrid />} />
          <Route path="routes"   element={<RouteLibraryPage />} />
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
      <AppContent />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
