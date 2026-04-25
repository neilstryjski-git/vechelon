import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import MobileMenu from './MobileMenu';
import ToastContainer from './ToastContainer';
import RideDetailSideSheet from './RideDetailSideSheet';

function useCurrentAvatar() {
  return useQuery<{ name: string | null; avatar_url: string | null } | null>({
    queryKey: ['current-user-avatar'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('accounts')
        .select('name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      return data;
    },
  });
}

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

  const isOnline = useAppStore((state) => state.isOnline);
  const userTier = useAppStore((state) => state.userTier);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const { data: currentUser } = useCurrentAvatar();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAvatarMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setIsAvatarMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsAvatarMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [isAvatarMenuOpen]);

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/portal/auth';
  };

  const riderLinks = [
    { to: '/', label: 'Home', end: true },
    ...(userTier !== 'guest' ? [{ to: '/calendar', label: 'Calendar' }] : []),
    ...(userTier !== 'guest' ? [{ to: '/routes', label: 'Routes' }] : []),
    ...(userTier === 'affiliated' ? [{ to: '/members', label: 'Members' }] : []),
    { to: '/profile', label: 'Profile' },  // mobile menu only
  ];

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body selection:bg-brand-primary/20">

      <MobileMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        links={riderLinks}
        title="RIDER PORTAL"
      />

      {/* Pending Affiliation HUD — Tier 2 (initiated) only */}
      {userTier === 'initiated' && (
        <div className="bg-primary text-on-primary font-label text-[10px] uppercase tracking-[0.2em] text-center py-1.5 animate-pulse z-[60] relative">
          Membership Pending — Awaiting Tactical Activation
        </div>
      )}

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

          {/* Tiered Navigation Links (Desktop) */}
          <div className="hidden md:flex gap-8 items-center">
            <NavLink to="/" end className={navLinkClass}>Home</NavLink>
            
            {userTier !== 'guest' && (
              <NavLink to="/calendar" className={navLinkClass}>Calendar</NavLink>
            )}
            
            {userTier !== 'guest' && (
              <NavLink to="/routes" className={navLinkClass}>Routes</NavLink>
            )}

            {userTier === 'affiliated' && (
              <NavLink to="/members" className={navLinkClass}>Members</NavLink>
            )}

          </div>

          {/* System HUD */}
          <div className="flex items-center gap-4">
            {!isOnline && (
              <span className="font-label text-[9px] text-error animate-pulse flex items-center gap-1.5 hidden sm:flex">
                <span className="w-1.5 h-1.5 bg-error rounded-full" />
                OFFLINE
              </span>
            )}
            <div className="relative hidden sm:block" ref={avatarMenuRef}>
              <button
                onClick={() => setIsAvatarMenuOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={isAvatarMenuOpen}
                className="w-8 h-8 rounded-full bg-surface-container-high border border-surface-container-highest overflow-hidden transition-transform hover:scale-105 active:scale-95"
                title="Account"
              >
                {currentUser?.avatar_url ? (
                  <img src={currentUser.avatar_url} alt={currentUser.name ?? 'Avatar'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-surface-container-highest flex items-center justify-center">
                    <span className="font-label text-[8px] text-on-surface-variant">
                      {currentUser?.name?.charAt(0).toUpperCase() ?? ''}
                    </span>
                  </div>
                )}
              </button>
              {isAvatarMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-48 bg-surface-container-lowest border border-outline-variant/15 rounded-xl shadow-ambient overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  <button
                    role="menuitem"
                    onClick={() => { setIsAvatarMenuOpen(false); navigate('/profile'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left font-body text-sm text-on-background hover:bg-surface-container-low transition-colors"
                  >
                    <span className="material-symbols-outlined text-base text-on-surface-variant">person</span>
                    Update Profile
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setIsAvatarMenuOpen(false); handleSignOut(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left font-body text-sm text-on-background hover:bg-surface-container-low transition-colors border-t border-outline-variant/10"
                  >
                    <span className="material-symbols-outlined text-base text-on-surface-variant">logout</span>
                    Log out
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Trigger */}
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="flex md:hidden p-2 rounded-full hover:bg-surface-container-low transition-colors duration-200 active:scale-95"
            >
              <span className="material-symbols-outlined text-on-background">menu</span>
            </button>
          </div>

        </nav>
      </header>

      {/* Main Viewport */}
      <main className="max-w-screen-2xl mx-auto px-6 py-12 animate-in fade-in duration-700">
        <Outlet />
      </main>

      <ToastContainer />
      <RideDetailSideSheet />

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
