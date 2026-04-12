import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import RiderLayout from './components/RiderLayout';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
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

// Phase-gated placeholders — styled with Velo Modern tokens
const RouteLibrary = () => (
  <div className="py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-4">
      Coming Soon
    </span>
    <h2 className="font-headline text-4xl font-extrabold text-on-background mb-3">Route Library</h2>
    <p className="font-body text-on-surface-variant max-w-md mx-auto">Official club routes are being curated for your next ride.</p>
  </div>
);

const Settings = () => (
  <div className="py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-4">
      Configuration
    </span>
    <h2 className="font-headline text-4xl font-extrabold text-on-background mb-3">Club Settings</h2>
    <p className="font-body text-on-surface-variant">System and tenant configurations module initializing.</p>
  </div>
);

const Profile = () => (
  <div className="py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-4">
      Identity
    </span>
    <h2 className="font-headline text-4xl font-extrabold text-on-background mb-3">Your Profile</h2>
    <p className="font-body text-on-surface-variant">Personal details and preferences management initializing.</p>
  </div>
);

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
    <Router basename="/admin">
      <Routes>
        {/* ADMIN ROUTES */}
        <Route path="/manage" element={<Layout />}>
          <Route index      element={<Dashboard />}    />
          <Route path="calendar" element={<CalendarGrid />} />
          <Route path="rides"    element={<RouteLibrary />} />
          <Route path="members"  element={<Members />}      />
          <Route path="settings" element={<Settings />}     />
          {/* Catch-all for sub-paths under manage */}
          <Route path="*"       element={<Navigate to="/manage" replace />} />
        </Route>

        {/* RIDER PORTAL ROUTES */}
        <Route path="/" element={<RiderLayout />}>
          <Route index      element={<Dashboard />}    />
          <Route path="calendar" element={<CalendarGrid />} />
          <Route path="routes"   element={<RouteLibrary />} />
          <Route path="profile"  element={<Profile />}      />
          {/* Members redirect for riders */}
          <Route path="members"  element={<Navigate to="/manage/members" replace />} />
        </Route>

        {/* Global Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
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
