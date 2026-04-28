import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

interface LinkItem {
  to: string;
  label: string;
  end?: boolean;
}

export interface MobileMenuUser {
  name: string | null;
  avatarUrl: string | null;
}

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  links: LinkItem[];
  title?: string;
  /**
   * Currently signed-in user, or null/undefined when no auth session.
   * Drives the footer rendering: signed-in → name + Sign Out button;
   * unauthenticated → "Not signed in" + Sign In CTA.
   * D36 fix — replaces hardcoded "Admin User" placeholder.
   */
  currentUser?: MobileMenuUser | null;
  /**
   * Sign-out handler invoked when the signed-in user taps Sign Out.
   * Should call supabase.auth.signOut({ scope: 'global' }) per D33.
   */
  onSignOut?: () => void;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-6 py-4 text-xl font-headline font-bold tracking-tight transition-all duration-300 ${
    isActive
      ? 'bg-primary/10 text-primary border-l-4 border-primary'
      : 'text-on-surface-variant hover:bg-surface-container-low border-l-4 border-transparent'
  }`;

const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  links,
  title = 'VECHELON',
  currentUser,
  onSignOut,
}) => {
  const navigate = useNavigate();
  const isSignedIn = !!currentUser;

  const handleSignIn = () => {
    onClose();
    navigate('/auth');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-background/60 backdrop-blur-md transition-opacity duration-500 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 z-[70] h-full w-80 bg-surface-container-lowest border-l border-outline-variant/30 shadow-2xl transition-transform duration-500 ease-out transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-6 border-b border-outline-variant/15">
            <span className="font-headline text-2xl font-extrabold tracking-tighter italic">{title}</span>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Links */}
          <nav className="flex-1 py-4 overflow-y-auto">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={navLinkClass}
                onClick={onClose}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Footer Area — branches on auth state (D36) */}
          <div className="p-6 border-t border-outline-variant/15 bg-surface-container-low/30">
            {isSignedIn ? (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden">
                    {currentUser?.avatarUrl ? (
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.name ?? 'Avatar'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-on-surface-variant">person</span>
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-headline font-bold text-sm text-on-background truncate">
                      {currentUser?.name?.trim() || 'Member'}
                    </p>
                    <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                      Signed In
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { onClose(); onSignOut?.(); }}
                  disabled={!onSignOut}
                  className="w-full py-3 rounded-lg border border-outline-variant/30 font-label text-[10px] uppercase tracking-[0.2em] hover:bg-surface-container-high transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">person_off</span>
                  </div>
                  <div>
                    <p className="font-headline font-bold text-sm text-on-background">Not signed in</p>
                    <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                      Guest
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSignIn}
                  className="w-full py-3 rounded-lg bg-primary text-on-primary font-label text-[10px] uppercase tracking-[0.2em] hover:opacity-90 transition-all"
                >
                  Sign In
                </button>
              </>
            )}
          </div>

        </div>
      </aside>
    </>
  );
};

export default MobileMenu;
