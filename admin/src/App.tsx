import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import RiderLayout from './components/RiderLayout';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import RouteLibraryPage from './pages/RouteLibrary';
import CalendarGrid from './components/CalendarGrid';
import { useBranding } from './hooks/useBranding';
import { supabase } from './lib/supabase';
import { useAppStore } from './store/useAppStore';

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
function AdaptiveLayout() {
  // In a real session, we check the account_tenants role.
  // For now, we use a simple toggle or look at the userTier.
  const userTier = useAppStore((state) => state.userTier);
  const membershipStatus = useAppStore((state) => state.membershipStatus);

  // LOGIC: If the user is an admin, show the full Sidebar layout.
  // For this prototype phase, we'll default to Layout (Admin) if no tier is found,
  // or RiderLayout if they are a Guest/Member.
  if (userTier === 'guest' || membershipStatus === 'initiated') {
    return <RiderLayout />;
  }

  return <Layout />;
}

function AppContent() {
  // Dynamic branding fetch from Supabase
  const { data: tenant } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('primary_color, accent_color, logo_url')
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Fallback to Velo Modern defaults
  useBranding(tenant ? {
    primaryColor: tenant.primary_color,
    accentColor: tenant.accent_color,
    logoUrl: tenant.logo_url || undefined,
  } : {
    primaryColor: '#5f5e5e',
    accentColor: '#006e35',
  });

  return (
    <Router basename="/portal">
      <Routes>
        {/* ONE UNIFIED ENTRY POINT */}
        <Route path="/" element={<AdaptiveLayout />}>
          <Route index      element={<Dashboard />}    />
          <Route path="calendar" element={<CalendarGrid />} />
          <Route path="routes"   element={<RouteLibraryPage />} />
          <Route path="members"  element={<Members />}      />
          <Route path="profile"  element={<Dashboard />} /> {/* Placeholder */}
          
          {/* Catch-all redirects back to the adaptive home */}
          <Route path="*"       element={<Navigate to="/" replace />} />
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
