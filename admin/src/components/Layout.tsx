import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { supabase } from '../lib/supabase';
import MobileMenu from './MobileMenu';
import RideDetailSideSheet from './RideDetailSideSheet';
import ParticipantDetailSheet from './ParticipantDetailSheet';
import ToastContainer from './ToastContainer';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `pb-1 border-b-2 transition-colors duration-200 ${
    isActive
      ? 'text-on-background border-on-background'
      : 'text-on-surface-variant border-transparent hover:text-on-background hover:border-outline-variant'
  }`;

interface LayoutProps {
  tenant: {
    name?: string;
    logo_url?: string;
  };
}

const Layout: React.FC<LayoutProps> = ({ tenant }) => {
  const isPriorityMode = useAppStore((state) => state.isPriorityMode);
  const isAdmin = useAppStore((state) => state.isAdmin);
  useOfflineStatus();

  const { data: profile } = useQuery<{ name: string | null; avatar_url: string | null } | null>({
    queryKey: ['my-avatar'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const { data } = await supabase
        .from('accounts')
        .select('name, avatar_url')
        .eq('id', session.user.id)
        .maybeSingle();
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
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
    await supabase.auth.signOut({ scope: 'global' });
    window.location.href = '/portal/auth';
  };

  const baseLinks: { to: string; label: string; end?: boolean }[] = [
    { to: '/', label: 'Command Centre', end: true },
    { to: '/calendar', label: 'Calendar' },
    { to: '/routes', label: 'Route Library' },
  ];

  const adminLinks: { to: string; label: string; end?: boolean }[] = [
    { to: '/members', label: 'Member Directory' },
    { to: '/settings', label: 'Club Settings' },
  ];

  const activeLinks = isAdmin ? [...baseLinks, ...adminLinks] : baseLinks;

  return (
    <div className={`min-h-screen bg-surface transition-colors duration-500 ${isPriorityMode ? 'selection:bg-error/30' : ''}`}>
      
      {/* Priority Banner */}
      {isPriorityMode && (
        <div className="bg-error text-on-error font-label text-[10px] uppercase tracking-[0.2em] text-center py-1.5 animate-pulse z-[60] relative">
          Priority Mode Active — Support Beacon Engaged
        </div>
      )}

      {/* Header */}
      <header className={`sticky top-0 z-50 transition-all duration-500 border-b ${
        isPriorityMode 
          ? 'bg-white/90 backdrop-blur-xl border-error/20 shadow-error/5' 
          : 'bg-white/80 backdrop-blur-md border-outline-variant/10 shadow-sm'
      }`}>
        <nav className="max-w-screen-2xl mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* Brand */}
          <NavLink to="/" className="flex items-center gap-3 group">
            {/* 1. Tenant club logo */}
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt={tenant.name || 'Club'}
                className="h-10 w-auto max-w-[120px] object-contain flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-surface-container-highest border border-outline-variant/20 flex-shrink-0">
                <span className="material-symbols-outlined text-on-surface-variant text-xl">
                  {isPriorityMode ? 'report_problem' : 'groups'}
                </span>
              </div>
            )}

            {/* 2. Portal role badge */}
            <span className={`text-[8px] font-bold px-2 py-1 rounded tracking-widest transition-colors duration-500 flex-shrink-0 ${
              isPriorityMode
                ? 'bg-error text-on-error'
                : isAdmin
                  ? 'bg-on-background text-background'
                  : 'bg-surface-container-highest text-on-surface-variant border border-outline-variant/30'
            }`}>
              {isAdmin ? 'ADMIN' : 'MEMBER'}
            </span>

            {/* 3. Vechelon half-chainring logo */}
            <img
              src="/portal/vechelon-halfchainring.svg"
              alt="Vechelon"
              className="h-8 w-auto flex-shrink-0 opacity-90 group-hover:opacity-100 transition-opacity"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = 'none';
                el.insertAdjacentHTML('afterend', '<span class="font-headline font-black text-lg tracking-tighter text-on-background">VEcheLOn</span>');
              }}
            />
          </NavLink>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {activeLinks.map((link) => (
              <NavLink 
                key={link.to}
                to={link.to} 
                end={link.end}
                className={navLinkClass}
              >
                <span className="font-label text-[10px] uppercase tracking-[0.2em] font-medium">{link.label}</span>
              </NavLink>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button className="hidden md:flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors">
              <span className="material-symbols-outlined text-xl">notifications</span>
            </button>
            <div className="w-px h-6 bg-outline-variant/20 hidden md:block" />
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-on-surface">menu</span>
            </button>
            <div className="relative" ref={avatarMenuRef}>
              <button
                onClick={() => setIsAvatarMenuOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={isAvatarMenuOpen}
                className="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all overflow-hidden"
                title="Account"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Profile"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span className="material-symbols-outlined text-on-surface-variant">person</span>
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
          </div>

        </nav>
      </header>

      {/* Page Content */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        <Outlet />
      </main>

      <RideDetailSideSheet />
      <ParticipantDetailSheet />
      <ToastContainer />

      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        links={activeLinks}
        currentUser={profile ? { name: profile.name, avatarUrl: profile.avatar_url } : null}
        onSignOut={handleSignOut}
      />

    </div>
  );
};

export default Layout;
