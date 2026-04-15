import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { parsePoint } from '../lib/maps';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../store/useToast';
import Modal from './Modal';

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
  external_url: string | null;
  start_coords: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RideDetailSideSheet: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const selectedRideId = useAppStore((state) => state.selectedRideId);
  const setSelectedRideId = useAppStore((state) => state.setSelectedRideId);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const userTier = useAppStore((state) => state.userTier);
  const joinRide = useAppStore((state) => state.joinRide);

  const [isJoining, setIsJoining] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const tenant = queryClient.getQueryData<{ logo_url?: string | null }>(['tenant-config']);

  const isOpen = !!selectedRideId;

  const close = () => setSelectedRideId(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: any }) => setCurrentUser(data.user));
  }, []);

  useEffect(() => {
    if (!selectedRideId) { setQrDataUrl(null); return; }
    const url = `${window.location.origin}/portal/ride/${selectedRideId}`;
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#1c1c1c', light: '#fafafa' },
    }).then(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // White circle background for logo
      const logoSize = size * 0.22;
      const cx = size / 2;
      const cy = size / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, logoSize * 0.65, 0, 2 * Math.PI);
      ctx.fillStyle = '#fafafa';
      ctx.fill();

      // Draw Vechelon logo in center
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
        setQrDataUrl(canvas.toDataURL('image/png'));
      };
      img.onerror = () => setQrDataUrl(canvas.toDataURL('image/png'));
      img.src = '/portal/favicon.svg';
    }).catch(() => setQrDataUrl(null));
  }, [selectedRideId, tenant?.logo_url]);

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
        .select('id, name, status, thumbnail_url, scheduled_start, start_label, finish_label, external_url, start_coords')
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

  const hasJoined = participants.some(p => p.id === currentUser?.id);

  const handleJoin = async () => {
    if (!selectedRideId) return;
    setIsJoining(true);
    try {
      await joinRide(selectedRideId);
      addToast(ride?.status === 'active' ? 'Joined tactical session.' : 'RSVP confirmed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['ride-participants', selectedRideId] });
      queryClient.invalidateQueries({ queryKey: ['my-participation', selectedRideId] });
    } catch (e: any) {
      addToast(`Failed to join: ${e.message}`, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCopyBroadcast = async () => {
    if (!ride) return;

    const dt = new Date(ride.scheduled_start);
    const dateStr = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const coords = parsePoint(ride.start_coords);
    const mapsUrl = coords
      ? `https://maps.google.com/maps?q=${coords.lat},${coords.lng}`
      : null;

    const meetupLines = ride.start_label && mapsUrl
      ? [`📍 ${ride.start_label}`, mapsUrl]
      : ride.start_label
        ? [`📍 ${ride.start_label}`]
        : [];

    const lines = [
      ride.name,
      '',
      `📅 ${dateStr} · ${timeStr}`,
      ...(meetupLines.length ? ['', ...meetupLines] : []),
      ...(ride.external_url ? [`🔗 Route: ${ride.external_url}`] : []),
      `🔵 Details: https://vechelon.app/ride/${ride.id}`,
    ];

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      addToast('Copied!', 'success');
    } catch {
      addToast('Could not access clipboard', 'error');
    }
  };

  const handleDelete = async () => {
    if (!selectedRideId) return;
    const { error } = await supabase.from('rides').delete().eq('id', selectedRideId);
    if (error) { addToast(`Delete failed: ${error.message}`, 'error'); return; }
    addToast('Ride deleted.', 'success');
    close();
    queryClient.invalidateQueries({ queryKey: ['rides'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-rides'] });
    navigate('/');
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

      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Ride"
        message={`Are you sure you want to delete "${ride?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        type="danger"
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
                    <p className="font-body text-sm font-medium text-on-background truncate">
                      {ride.start_label || 'Default Start'}
                    </p>
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                    <span className="font-label text-[9px] uppercase tracking-tighter text-on-surface-variant block mb-1">Finish Point</span>
                    <p className="font-body text-sm font-medium text-on-background truncate">
                      {ride.finish_label || 'Default Finish'}
                    </p>
                  </div>
                </div>
              </div>

              {/* QR Code */}
              {qrDataUrl && (
                <div className="flex items-center gap-4 bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
                  <img src={qrDataUrl} alt="Ride QR Code" className="w-20 h-20 rounded-lg shrink-0" />
                  <div>
                    <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">Scan to Join</p>
                    <p className="font-body text-xs text-on-surface-variant/70">Share this ride with your group — opens the rider landing page.</p>
                  </div>
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
                {userTier === 'affiliated' && !hasJoined && (
                  <button 
                    onClick={handleJoin}
                    disabled={isJoining}
                    className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 mb-2"
                  >
                    <span className="material-symbols-outlined">
                      {ride?.status === 'active' ? 'play_circle' : 'event_available'}
                    </span>
                    {isJoining ? 'Processing...' : (ride?.status === 'active' ? 'Join This Ride' : 'RSVP to Ride')}
                  </button>
                )}

                {hasJoined && (
                  <div className="flex items-center justify-center gap-2 py-4 bg-tertiary/10 text-tertiary rounded-xl border border-tertiary/20 mb-2">
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    <span className="font-headline font-bold uppercase tracking-widest text-xs">RSVP Confirmed</span>
                  </div>
                )}

                <button 
                  className="w-full signature-gradient text-on-primary py-4 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-[0.98]"
                  onClick={() => {
                    close();
                    navigate('/');
                  }}
                >
                  <span className="material-symbols-outlined">map</span>
                  View on Tactical HUD
                </button>

                <button
                  className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                  onClick={handleCopyBroadcast}
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  Copy Broadcast
                </button>

                {isAdmin && (
                  <>
                    <button
                      className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                      onClick={() => { close(); navigate(`/builder/${selectedRideId}`); }}
                    >
                      <span className="material-symbols-outlined text-sm">edit_location_alt</span>
                      Customize Geometry
                    </button>
                    <button
                      className="w-full bg-error/10 text-error py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-error/20 transition-colors"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Delete Ride
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
};

export default RideDetailSideSheet;
