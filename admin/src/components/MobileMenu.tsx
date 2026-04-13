import React from 'react';
import { NavLink } from 'react-router-dom';

interface LinkItem {
  to: string;
  label: string;
  end?: boolean;
}

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  links: LinkItem[];
  title?: string;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-6 py-4 text-xl font-headline font-bold tracking-tight transition-all duration-300 ${
    isActive 
      ? 'bg-primary/10 text-primary border-l-4 border-primary' 
      : 'text-on-surface-variant hover:bg-surface-container-low border-l-4 border-transparent'
  }`;

const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose, links, title = 'VECHELON' }) => {
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

          {/* Footer Area */}
          <div className="p-6 border-t border-outline-variant/15 bg-surface-container-low/30">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-on-surface-variant">person</span>
              </div>
              <div>
                <p className="font-headline font-bold text-sm text-on-background">Admin User</p>
                <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Signed In</p>
              </div>
            </div>
            <button className="w-full py-3 rounded-lg border border-outline-variant/30 font-label text-[10px] uppercase tracking-[0.2em] hover:bg-surface-container-high transition-all">
              Sign Out
            </button>
          </div>

        </div>
      </aside>
    </>
  );
};

export default MobileMenu;
