import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useTierDetection } from '../hooks/useTierDetection';

const navLinkClass = ({ isActive }: { isActive: boolean }) => 
  `font-label text-[10px] uppercase tracking-[0.2em] transition-all duration-300 ${
    isActive 
      ? 'text-brand-primary opacity-100' 
      : 'text-on-surface opacity-40 hover:opacity-100 hover:text-brand-primary'
  }`;

/**
 * Main structural wrapper for the Rider Portal.
 * Fulfills W35: RiderLayout gates/shows components per tier.
 */
const RiderLayout: React.FC = () => {
  useOfflineStatus();
  useTierDetection();
  
  const isOnline = useAppStore((state) => state.isOnline);
  const userTier = useAppStore((state) => state.userTier);

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-brand-primary/20">
      
      {/* HUD / Navigation Header */}
      <header className="sticky top-0 z-50 bg-surface/85 backdrop-blur-xl border-b border-surface-container-low transition-colors duration-500">
        <nav className="flex justify-between items-center w-full px-6 py-4 max-w-screen-2xl mx-auto">
          
          {/* Logo Area */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-logo bg-contain bg-no-repeat bg-center grayscale contrast-125" />
            <span className="font-headline text-lg font-extrabold tracking-tighter italic">VECHELON</span>
            <span className="bg-surface-container-high text-on-surface-variant text-[8px] px-1.5 py-0.5 rounded-full font-label tracking-widest uppercase">
              {userTier}
            </span>
          </div>

          {/* Tiered Navigation Links */}
          <div className="flex gap-8 items-center">
            <NavLink to="/" end className={navLinkClass}>Home</NavLink>
            
            {/* Tier 3 (Affiliated) or Tier 2 (Conditional) access */}
            {userTier !== 'guest' && (
              <NavLink to="/calendar" className={navLinkClass}>Calendar</NavLink>
            )}
            
            {/* Tier 3 (Affiliated) only */}
            {userTier === 'affiliated' && (
              <NavLink to="/routes" className={navLinkClass}>Routes</NavLink>
            )}

            <NavLink to="/profile" className={navLinkClass}>Profile</NavLink>
          </div>

          {/* System HUD */}
          <div className="flex items-center gap-4">
            {!isOnline && (
              <span className="font-label text-[9px] text-error animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-error rounded-full" />
                OFFLINE
              </span>
            )}
            <button className="w-8 h-8 rounded-full bg-surface-container-high border border-surface-container-highest overflow-hidden transition-transform hover:scale-105 active:scale-95">
              {/* User avatar placeholder */}
              <div className="w-full h-full bg-surface-container-highest" />
            </button>
          </div>

        </nav>
      </header>

      {/* Main Viewport */}
      <main className="max-w-screen-2xl mx-auto px-6 py-12 animate-in fade-in duration-700">
        <Outlet />
      </main>

      {/* Global Footer */}
      <footer className="mt-20 border-t border-surface-container-low px-6 py-8">
        <div className="max-w-screen-2xl mx-auto flex justify-between items-center opacity-30">
          <span className="font-label text-[10px] tracking-tighter uppercase italic">The Silent Sentinel</span>
          <div className="flex gap-6 font-label text-[10px] uppercase tracking-widest">
            <a href="#" className="hover:text-brand-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-brand-primary transition-colors">Terms</a>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default RiderLayout;
