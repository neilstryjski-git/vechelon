import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const PlatformLayout: React.FC = () => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'global' });
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-surface-container border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-6 h-6 bg-brand-logo bg-contain bg-no-repeat bg-center" />
          <div className="flex items-center gap-2">
            <span className="font-headline font-extrabold text-lg tracking-tighter text-on-background uppercase">
              Vechelon
            </span>
            <span className="bg-brand-primary/10 text-brand-primary font-label text-[9px] uppercase tracking-[0.25em] px-2 py-0.5 rounded-full border border-brand-primary/20">
              Platform Admin
            </span>
          </div>
        </Link>
        <button
          onClick={handleSignOut}
          className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-background transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          Sign Out
        </button>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default PlatformLayout;
