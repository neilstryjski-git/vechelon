import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../store/useToast';
import { parsePoint } from '../lib/maps';
import RideFormModal from './RideFormModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipantDetail {
  id: string;
  display_name: string;
  role: 'member' | 'captain' | 'support' | 'guest';
  status: string;
}

interface RideDetail {
  id: string;
  name: string;
  status: string;
  thumbnail_url: string | null;
  scheduled_start: string;
  start_label: string | null;
  finish_label: string | null;
  type: 'scheduled' | 'adhoc';
  qr_code: string | null;
  external_url: string | null;
  gpx_path: string | null;
  start_coords: string | null;
  finish_coords: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RideDetailSideSheet: React.FC = () => {
  const navigate = useNavigate();
  const selectedRideId = useAppStore((state) => state.selectedRideId);
  const setSelectedRideId = useAppStore((state) => state.setSelectedRideId);

  const isOpen = !!selectedRideId;
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { addToast } = useToast();

  const close = () => setSelectedRideId(null);

  const formatCoord = (pointStr: string | null) => {
    const p = parsePoint(pointStr);
    if (!p) return null;
    return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const { data: ride, isLoading: loadingRide } = useQuery<RideDetail>({
    queryKey: ['ride-detail', selectedRideId],
    queryFn: async () => {
      if (!selectedRideId) return null as any;
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, status, thumbnail_url, scheduled_start, start_label, finish_label, type, qr_code, external_url, gpx_path, start_coords, finish_coords')
        .eq('id', selectedRideId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedRideId,
  });

  const { data: participants = [], isLoading: loadingParticipants } = useQuery<ParticipantDetail[]>({
    queryKey: ['ride-participants', selectedRideId],
    queryFn: async () => {
      if (!selectedRideId) return [];
      const { data, error } = await supabase
        .from('ride_participants')
        .select('id, display_name, role, status')
        .eq('ride_id', selectedRideId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedRideId,
  });

  const JOIN_BASE = import.meta.env.VITE_JOIN_BASE_URL ?? 'https://vechelon.app';
  const joinUrl = ride ? `${JOIN_BASE}/join/${ride.id}` : '';

  const isLoop = (() => {
    const s = parsePoint(ride?.start_coords ?? null);
    const f = parsePoint(ride?.finish_coords ?? null);
    if (!s || !f) return false;
    return Math.abs(s.lat - f.lat) < 0.0005 && Math.abs(s.lng - f.lng) < 0.0005;
  })();

  const downloadGpx = async () => {
    if (!ride?.gpx_path) return;
    const { data, error } = await supabase.storage.from('gpx-routes').download(ride.gpx_path);
    if (error || !data) { addToast('GPX download failed.', 'error'); return; }
    const url = URL.createObjectURL(data);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `${ride.name.replace(/\s+/g, '_')}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyWhatsAppSummary = async () => {
    if (!ride) return;
    const dateStr = ride.scheduled_start
      ? new Date(ride.scheduled_start).toLocaleString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long',
          year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : 'TBC';
    const text = [
      `*${ride.name}*`,
      '',
      `Date: ${dateStr}`,
      `Start: ${ride.start_label || 'TBC'}`,
      `Finish: ${ride.finish_label || 'TBC'}`,
      `Riders: ${participants.length}`,
      '',
      `Join link: ${joinUrl}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      addToast('WhatsApp summary copied to clipboard.', 'success');
    } catch {
      addToast('Clipboard access denied.', 'error');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-background/60 backdrop-blur-md z-40 transition-opacity duration-500 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
      />

      {/* Side Sheet */}
      <aside 
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-surface-container-lowest shadow-2xl z-50 transform transition-transform duration-500 ease-out border-l border-outline-variant/20 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-surface-container-low flex justify-between items-center bg-surface-container-low/30">
          <div>
            <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-1">
              Tactical Overview
            </span>
            <h2 className="font-headline font-bold text-xl text-on-background">
              {loadingRide ? 'Loading Ride...' : ride?.name || 'Ride Details'}
            </h2>
          </div>
          <button 
            onClick={close}
            className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-88px)] p-6 space-y-8">
          
          {loadingRide ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-40 w-full bg-surface-container-high rounded-xl" />
              <div className="h-4 w-3/4 bg-surface-container-high rounded" />
              <div className="h-4 w-1/2 bg-surface-container-high rounded" />
            </div>
          ) : ride && (
            <>
              {/* Visual & Core Stats */}
              <div className="space-y-4">
                <div className="h-48 w-full bg-surface-container-high rounded-2xl overflow-hidden shadow-ambient relative">
                  {ride.thumbnail_url ? (
                    <img src={ride.thumbnail_url} className="w-full h-full object-cover" alt={ride.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/20">map</span>
                    </div>
                  )}
                  <div className="absolute top-4 right-4">
                    <span className={`font-label text-[9px] px-2 py-0.5 rounded-full uppercase tracking-widest shadow-lg backdrop-blur-md border border-white/10 ${
                      ride.status === 'active' 
                        ? 'bg-tertiary text-on-tertiary' 
                        : 'bg-primary/20 text-primary'
                    }`}>
                      {ride.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                    <span className="font-label text-[9px] uppercase tracking-tighter text-on-surface-variant block mb-1">Start Point</span>
                    {ride.start_label ? (
                      <p className="font-body text-sm font-medium text-on-background truncate">{ride.start_label}</p>
                    ) : formatCoord(ride.start_coords) ? (
                      <p className="font-label text-[10px] text-on-surface-variant tabular-nums">{formatCoord(ride.start_coords)}</p>
                    ) : (
                      <p className="font-body text-sm text-on-surface-variant/40 italic">Not set</p>
                    )}
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                    <span className="font-label text-[9px] uppercase tracking-tighter text-on-surface-variant block mb-1">Finish Point</span>
                    {isLoop ? (
                      <p className="font-body text-sm font-medium text-on-background">Loop Ride</p>
                    ) : ride.finish_label ? (
                      <p className="font-body text-sm font-medium text-on-background truncate">{ride.finish_label}</p>
                    ) : formatCoord(ride.finish_coords) ? (
                      <p className="font-label text-[10px] text-on-surface-variant tabular-nums">{formatCoord(ride.finish_coords)}</p>
                    ) : (
                      <p className="font-body text-sm text-on-surface-variant/40 italic">Not set</p>
                    )}
                  </div>
                </div>
              </div>

              {/* QR Code */}
              {ride.qr_code && (
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10 flex flex-col items-center gap-3">
                  <span className="font-label text-[9px] uppercase tracking-tighter text-on-surface-variant">
                    Ride QR — Join Link
                  </span>
                  <img
                    src={ride.qr_code}
                    alt="Ride QR Code"
                    className="w-32 h-32 rounded-lg"
                  />
                  <span className="font-label text-[9px] text-on-surface-variant/60 break-all text-center">
                    {joinUrl}
                  </span>
                </div>
              )}

              {/* Participant List */}
              <section className="space-y-4">
                <div className="flex justify-between items-center border-b border-surface-container-low pb-2">
                  <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold">
                    Rider Roster
                  </h3>
                  <span className="font-label text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full">
                    {participants.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {loadingParticipants ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 w-full bg-surface-container-low rounded-lg animate-pulse" />
                    ))
                  ) : participants.length > 0 ? (
                    participants.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-surface-container-lowest hover:bg-surface-container-low rounded-xl border border-outline-variant/5 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            p.role === 'captain' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {p.display_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-body text-sm font-semibold text-on-background">{p.display_name}</p>
                            <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant opacity-60">{p.role}</p>
                          </div>
                        </div>
                        <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-tertiary' : 'bg-outline-variant'}`} />
                      </div>
                    ))
                  ) : (
                    <p className="text-center py-8 font-label text-xs text-on-surface-variant opacity-40 italic">
                      — No riders assigned yet —
                    </p>
                  )}
                </div>
              </section>

              {/* Action */}
              <div className="pt-4 space-y-3">
                <button
                  className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-[0.98]"
                  onClick={() => navigate('/')}
                >
                  <span className="material-symbols-outlined">map</span>
                  View on Tactical HUD
                </button>

                <button
                  onClick={() => setIsEditOpen(true)}
                  className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  Edit Ride Details
                </button>

                <button
                  onClick={copyWhatsAppSummary}
                  className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  Copy WhatsApp Summary
                </button>

                {ride.gpx_path && (
                  <button
                    onClick={downloadGpx}
                    className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Download GPX
                  </button>
                )}

                <button
                  className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                  onClick={() => {
                    close();
                    navigate(`/builder/${selectedRideId}`);
                  }}
                >
                  <span className="material-symbols-outlined text-sm">edit_location_alt</span>
                  Customize Geometry
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {ride && (
        <RideFormModal
          mode="edit"
          rideId={ride.id}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          initialValues={{
            name:            ride.name,
            scheduled_start: ride.scheduled_start
              ? new Date(ride.scheduled_start).toISOString().slice(0, 16)
              : '',
            start_label:     ride.start_label  ?? '',
            finish_label:    ride.finish_label ?? '',
            external_url:    ride.external_url ?? '',
          }}
        />
      )}
    </>
  );
};

export default RideDetailSideSheet;
