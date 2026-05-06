import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { usePlatformAdminCheck } from '../hooks/usePlatformAdminCheck';
import AuthPage from './rider/AuthPage';
import PlatformLayout from '../components/PlatformLayout';
import PlatformHome from './platform/PlatformHome';
import CreateClub from './platform/CreateClub';
import ProvisioningChecklist from './platform/ProvisioningChecklist';
import NotAuthorised from './platform/NotAuthorised';

function PlatformRouter() {
  const { isLoading, isAuthenticated, isPlatformAdmin } = usePlatformAdminCheck();

  if (isLoading) {
    return (
      <div className="p-20 text-center font-label animate-pulse text-on-surface-variant flex flex-col items-center justify-center min-h-screen bg-surface">
        <span className="material-symbols-outlined text-4xl mb-4 animate-spin text-primary/20">sync</span>
        VERIFYING CLEARANCE...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (!isPlatformAdmin) {
    return <NotAuthorised />;
  }

  return (
    <Routes>
      <Route element={<PlatformLayout />}>
        <Route index element={<PlatformHome />} />
        <Route path="clubs/new" element={<CreateClub />} />
        <Route path="clubs/:tenantId/provisioning" element={<ProvisioningChecklist />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

const PlatformAdminApp: React.FC = () => {
  return (
    <Router basename="/">
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/*" element={<PlatformRouter />} />
      </Routes>
    </Router>
  );
};

export default PlatformAdminApp;
