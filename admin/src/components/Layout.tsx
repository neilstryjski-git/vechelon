import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'text-on-background border-b-2 border-on-background pb-1 transition-colors duration-200'
    : 'text-on-surface-variant hover:text-on-background transition-colors duration-200';

const Layout: React.FC = () => {
  useOfflineStatus();
  const isOnline  = useAppStore((state) => state.isOnline);
  const isPriorityMode = useAppStore((state) => state.isPriorityMode);

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body">

      {/* Priority Mode Banner */}
      {isPriorityMode && (
        <div className="bg-error text-on-error font-label text-[10px] uppercase tracking-[0.2em] text-center py-1.5 animate-pulse">
          ▲ Support Beacon Active — Priority Mode Engaged
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-surface-container-high text-on-surface-variant font-label text-[10px] uppercase tracking-[0.2em] text-center py-1.5">
          Offline Mode
        </div>
      )}

      {/* TopNavBar */}
      <header
        className={`sticky top-0 z-50 border-b border-outline-variant/15 transition-colors duration-300 ${
          isPriorityMode ? 'bg-error-container/10' : 'bg-surface-container-lowest'
        }`}
      >
        <nav className="flex justify-between items-center w-full px-6 py-4 max-w-screen-2xl mx-auto">

          {/* Logo */}
          <div className="flex items-center gap-2">
            <img
              src="/admin/racer-sportif-logo.png"
              alt="Racer Sportif"
              className="h-6 w-auto object-contain"
            />
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-label tracking-normal transition-colors ${
                isPriorityMode
                  ? 'bg-error text-on-error'
                  : 'bg-on-surface text-surface-container-lowest'
              }`}
            >
              {isPriorityMode ? 'PRIORITY' : 'ADMIN'}
            </span>
            <img
              src="/admin/vechelon-halfchainring.svg"
              alt="Vechelon"
              className="h-5 w-auto object-contain"
            />
          </div>

          {/* Primary Navigation */}
          <div className="hidden md:flex items-center gap-8 font-headline font-medium text-sm tracking-tight">
            <NavLink to="/"         end className={navLinkClass}>Dashboard</NavLink>
            <NavLink to="/calendar" className={navLinkClass}>Calendar</NavLink>
            <NavLink to="/rides"    className={navLinkClass}>Route Library</NavLink>
            <NavLink to="/members"  className={navLinkClass}>Member Directory</NavLink>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1">
            <NavLink
              to="/settings"
              className="p-2 rounded-full hover:bg-surface-container-low transition-colors duration-200 active:scale-95"
            >
              <span className="material-symbols-outlined text-on-surface-variant">settings</span>
            </NavLink>
            <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors duration-200 active:scale-95">
              <span className="material-symbols-outlined text-on-surface-variant">account_circle</span>
            </button>
          </div>

        </nav>
      </header>

      {/* Page Content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        <Outlet />
      </main>

    </div>
  );
};

export default Layout;
