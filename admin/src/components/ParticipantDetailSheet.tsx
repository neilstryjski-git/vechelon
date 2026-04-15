import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../store/useToast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipantDetail {
  id: string;
  display_name: string;
  role: 'member' | 'captain' | 'support' | 'guest';
  status: string;
  phone: string | null;
  last_ping_at: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ParticipantDetailSheet: React.FC = () => {
  const selectedParticipantId = useAppStore((state) => state.selectedParticipantId);
  const setSelectedParticipantId = useAppStore((state) => state.setSelectedParticipantId);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const { addToast } = useToast();

  const isOpen = !!selectedParticipantId;
  const close = () => setSelectedParticipantId(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const { data: participant, isLoading } = useQuery<ParticipantDetail>({
    queryKey: ['participant-detail', selectedParticipantId],
    queryFn: async () => {
      if (!selectedParticipantId) return null as any;
      const { data, error } = await supabase
        .from('ride_participants')
        .select('id, display_name, role, status, phone, last_ping_at')
        .eq('id', selectedParticipantId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedParticipantId,
  });

  return (
    <>
      {/* Backdrop - Stitch Glassmorphism */}
      <div 
        className={`fixed inset-0 bg-white/85 backdrop-blur-[20px] z-[80] transition-opacity duration-500 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
      />

      {/* Bottom Sheet */}
      <aside 
        className={`fixed bottom-0 left-0 right-0 w-full max-w-2xl mx-auto bg-white/90 backdrop-blur-[20px] shadow-2xl z-[90] transform transition-transform duration-500 ease-out rounded-t-3xl border-t border-outline-variant/20 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle for dragging visual */}
        <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={close}>
          <div className="w-12 h-1.5 bg-outline-variant/30 rounded-full" />
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 w-1/2 bg-surface-container-high rounded" />
              <div className="h-4 w-1/4 bg-surface-container-high rounded" />
              <div className="h-20 w-full bg-surface-container-high rounded-xl" />
            </div>
          ) : participant && (
            <>
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-headline font-bold text-2xl text-on-background tracking-tighter">
                      {participant.display_name}
                    </h2>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-label tracking-widest uppercase border border-outline-variant/20 ${
                      participant.role === 'captain' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {participant.role}
                    </span>
                  </div>
                  <p className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant opacity-60">
                    Tactical Status: <span className={participant.status === 'active' ? 'text-tertiary font-bold' : ''}>{participant.status}</span>
                  </p>
                </div>
                <button 
                  onClick={close}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                >
                  <span className="material-symbols-outlined text-on-surface-variant">close</span>
                </button>
              </div>

              {/* Triage Grid */}
              <div className="grid grid-cols-2 gap-4">
                <a 
                  href={`tel:${participant.phone}`}
                  className="flex flex-col items-center justify-center p-6 bg-white border border-outline-variant/10 rounded-2xl hover:bg-surface-container-low transition-all shadow-sm group"
                >
                  <span className="material-symbols-outlined text-primary text-3xl mb-2 group-active:scale-95 transition-transform">call</span>
                  <span className="font-label text-[10px] uppercase tracking-[0.2em] font-bold">Voice Call</span>
                </a>
                <a 
                  href={`https://wa.me/${participant.phone?.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center p-6 bg-white border border-outline-variant/10 rounded-2xl hover:bg-surface-container-low transition-all shadow-sm group"
                >
                  <span className="material-symbols-outlined text-tertiary text-3xl mb-2 group-active:scale-95 transition-transform">chat</span>
                  <span className="font-label text-[10px] uppercase tracking-[0.2em] font-bold">WhatsApp</span>
                </a>
              </div>

              {/* Tactical Meta */}
              <div className="bg-surface-container-low/30 p-5 rounded-xl space-y-3 border border-outline-variant/5">
                <div className="flex justify-between items-center text-on-surface-variant">
                  <span className="font-label text-[9px] uppercase tracking-[0.2em]">Phone Identity</span>
                  <span className="font-body text-xs font-medium tabular-nums">{participant.phone || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center border-t border-outline-variant/10 pt-3 text-on-surface-variant">
                  <span className="font-label text-[9px] uppercase tracking-[0.2em]">Last Signal</span>
                  <span className="font-body text-xs font-medium">
                    {participant.last_ping_at ? new Date(participant.last_ping_at).toLocaleTimeString('en-GB') : 'Unknown'}
                  </span>
                </div>
              </div>

              {/* SAG Action */}
              {isAdmin && (
                <div className="pt-2">
                  <button 
                    className="w-full bg-error text-on-error py-4 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
                    onClick={() => {
                      addToast(`Tactical unit dispatched to ${participant.display_name}.`, 'error');
                    }}
                  >
                    <span className="material-symbols-outlined">sos</span>
                    Dispatch Support Unit
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
};

export default ParticipantDetailSheet;
