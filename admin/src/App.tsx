import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import CalendarGrid from './components/CalendarGrid';
import { useBranding } from './hooks/useBranding';
import { supabase } from './lib/supabase';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
    },
  },
});

// Phase-gated placeholders — styled with Velo Modern tokens
const RouteLibrary = () => (
  <div className="py-20 text-center">
    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-4">
      Coming Soon
    </span>
    <h2 className="font-headline text-4xl font-extrabold text-on-background mb-3">Route Library</h2>
    <p className="font-body text-on-surface-variant">Route management module initializing.</p>
  </div>
);

const Settings = () => (
  <div className="py-20 text-center">
    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-4">
      Configuration
    </span>
    <h2 className="font-headline text-4xl font-extrabold text-on-background mb-3">Club Settings</h2>
    <p className="font-body text-on-surface-variant">Settings module initializing.</p>
  </div>
);

function AppContent() {
  // Dynamic branding fetch from Supabase
  // In production, current tenant would be derived from subdomain or user profile
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
    }
  });

  useBranding(tenant ? {
    primaryColor: tenant.primary_color,
    accentColor: tenant.accent_color,
    logoUrl: tenant.logo_url || undefined,
  } : null);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index      element={<Dashboard />}    />
          <Route path="calendar" element={<CalendarGrid />} />
          <Route path="rides"    element={<RouteLibrary />} />
          <Route path="members"  element={<Members />}      />
          <Route path="settings" element={<Settings />}     />
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
