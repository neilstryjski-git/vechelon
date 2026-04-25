import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { parsePoint, downloadGpx } from '../lib/maps';
import { useAppStore } from '../store/useAppStore';
import { useToast } from '../store/useToast';
import Modal from './Modal';
import RideFormModal from './RideFormModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParticipantDetail {
  id: string;
  display_name: string;
  role: 'member' | 'captain' | 'support' | 'guest';
  status: string;
  account_id: string | null;
}

interface RideDetail {
  id: string;
  name: string;
  type: 'route' | 'meetup' | 'adhoc';
  status: string;
  thumbnail_url: string | null;
  scheduled_start: string;
  start_label: string | null;
  finish_label: string | null;
  external_url: string | null;
  gpx_path:     string | null;
  start_coords: string | null;
  meetup_coords: string | null;
  meetup_label: string | null;
}

function resolveFinishLabel(finishLabel: string | null, type: 'route' | 'meetup' | 'adhoc') {
  if (finishLabel) return finishLabel;
  if (type === 'meetup') return 'Loop';
  return null;
}

function formatRideDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function formatRideTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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
  const rideSheetVisible = useAppStore((state) => state.rideSheetVisible);
  const closeSheet = useAppStore((state) => state.closeSheet);
  const setSelectedParticipantId = useAppStore((state) => state.setSelectedParticipantId);
  const isAdmin = useAppStore((state) => state.isAdmin);
  const userTier = useAppStore((state) => state.userTier);
  const joinRide = useAppStore((state) => state.joinRide);

  const [isJoining, setIsJoining] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ParticipantDetail | null>(null);
  const ROSTER_LIMIT = 8;

  const tenant = queryClient.getQueryData<{ logo_url?: string | null }>(['tenant-config']);

  const isOpen = rideSheetVisible && !!selectedRideId;

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

  const { data: ride, isLoading: loadingRide } = useQuery<RideDetail | null>({
    queryKey: ['ride-detail', selectedRideId],
    queryFn: async () => {
      if (!selectedRideId) return null;
      const { data, error } = await supabase
        .from('rides')
        .select('id, name, type, status, thumbnail_url, scheduled_start, start_label, finish_label, external_url, gpx_path, start_coords, meetup_coords, meetup_label')
        .eq('id', selectedRideId)
        .maybeSingle();
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
        .select('id, display_name, role, status, account_id')
        .eq('ride_id', selectedRideId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedRideId,
  });

  // If the ride was built from a library route (gpx_path == route_library.file_path),
  // pull the route's distance/elevation stats. One-off GPX uploads won't match.
  const { data: routeStats } = useQuery<{ distance_km: number | null; elevation_gain_m: number | null } | null>({
    queryKey: ['ride-route-stats', ride?.gpx_path],
    queryFn: async () => {
      if (!ride?.gpx_path) return null;
      const { data } = await supabase
        .from('route_library')
        .select('distance_km, elevation_gain_m')
        .eq('file_path', ride.gpx_path)
        .maybeSingle();
      return data;
    },
    enabled: !!ride?.gpx_path,
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

  const buildBroadcastText = () => {
    if (!ride) return '';
    const dt = new Date(ride.scheduled_start);
    const dateStr = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const meetupPoint = parsePoint(ride.meetup_coords ?? ride.start_coords);
    const meetupName  = ride.meetup_label ?? ride.start_label;
    const mapsUrl = meetupPoint
      ? `https://maps.google.com/maps?q=${meetupPoint.lat},${meetupPoint.lng}`
      : null;
    const meetupValue = meetupName && mapsUrl
      ? `${meetupName} — ${mapsUrl}`
      : meetupName ?? '—';

    const finishValue = resolveFinishLabel(ride.finish_label, ride.type);

    return [
      `*${ride.name}*`,
      `Date/Time: ${dateStr} · ${timeStr}`,
      ...(ride.external_url ? [`Route: ${ride.external_url}`] : []),
      `Meetup: ${meetupValue}`,
      ...(finishValue ? [`Finish: ${finishValue}`] : []),
      `Details: ${import.meta.env.VITE_JOIN_BASE_URL ?? 'https://vechelon.productdelivered.ca'}/portal/ride/${ride.id}`,
      '',
    ].join('\n');
  };

  const handleCopyBroadcast = async () => {
    try {
      await navigator.clipboard.writeText(buildBroadcastText());
      addToast('Copied!', 'success');
    } catch {
      addToast('Could not access clipboard', 'error');
    }
  };

  const handleCloseRide = async () => {
    if (!selectedRideId) return;
    const { error } = await supabase
      .from('rides')
      .update({ status: 'saved', actual_end: new Date().toISOString() })
      .eq('id', selectedRideId);
    if (error) { addToast(`Failed to close ride: ${error.message}`, 'error'); return; }
    addToast('Ride closed.', 'success');
    queryClient.invalidateQueries({ queryKey: ['ride-detail', selectedRideId] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'active-rides'] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'active-rides-list'] });
  };

  const handleDelete = async () => {
    if (!selectedRideId) return;
    const deletedRideId = selectedRideId;
    setShowDeleteConfirm(false);
    const { data, error } = await supabase
      .from('rides')
      .delete()
      .eq('id', deletedRideId)
      .select();
    if (error) { addToast(`Delete failed: ${error.message}`, 'error'); return; }
    if (!data || data.length === 0) {
      addToast('Could not delete this ride. You may not have permission.', 'error');
      return;
    }
    addToast('Ride deleted.', 'success');
    // Close every overlay related to the ride context
    close();
    closeSheet();
    setSelectedParticipantId(null);
    // Drop cached entries that key off the deleted ride id
    queryClient.removeQueries({ queryKey: ['ride-detail', deletedRideId] });
    queryClient.removeQueries({ queryKey: ['ride-gpx-path', deletedRideId] });
    queryClient.removeQueries({ queryKey: ['ride-participants', deletedRideId] });
    queryClient.removeQueries({ queryKey: ['ride-route-stats'] });
    // Invalidate list queries so the ride disappears from calendar / dashboard
    queryClient.invalidateQueries({ queryKey: ['calendar-rides'] });
    queryClient.invalidateQueries({ queryKey: ['next-ride'] });
    queryClient.invalidateQueries({ queryKey: ['upcoming-rides'] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'active-rides'] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'active-rides-list'] });
    queryClient.invalidateQueries({ queryKey: ['stats', 'upcoming-rides'] });
    navigate('/');
  };

  const handleRemoveParticipant = async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    const { error } = await supabase
      .from('ride_participants')
      .delete()
      .eq('id', target.id);
    if (error) {
      addToast(`Could not remove ${target.display_name}: ${error.message}`, 'error');
      return;
    }
    addToast(`${target.display_name} removed from roster.`, 'success');
    queryClient.invalidateQueries({ queryKey: ['ride-participants', selectedRideId] });
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

      <Modal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveParticipant}
        title="Remove from Roster"
        message={`Remove ${removeTarget?.display_name ?? 'this rider'} from the roster? They will need to RSVP again to rejoin.`}
        confirmLabel="Remove"
        type="danger"
      />

      {showEditModal && ride && (
        <RideFormModal
          mode="edit"
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          rideId={selectedRideId ?? undefined}
          initialValues={{
            name:             ride.name,
            scheduled_start:  ride.scheduled_start
              ? new Date(ride.scheduled_start).toISOString().slice(0, 16)
              : '',
            start_label:      ride.start_label  ?? '',
            finish_label:     ride.finish_label ?? '',
            external_url:     ride.external_url ?? '',
          }}
        />
      )}

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
            {ride?.scheduled_start && (
              <p className="font-body text-xs text-on-surface-variant mt-1">
                {formatRideDate(ride.scheduled_start)} · {formatRideTime(ride.scheduled_start)}
              </p>
            )}
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
          ) : !ride ? (
            <div className="text-center space-y-6 pt-12">
              <div className="w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-on-surface-variant text-2xl">search_off</span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-lg text-on-background">This ride no longer exists</h3>
                <p className="font-body text-sm text-on-surface-variant mt-2">
                  It may have been deleted or the link is outdated.
                </p>
              </div>
              <button
                onClick={close}
                className="font-label text-[10px] uppercase tracking-widest text-primary hover:opacity-70 transition-opacity"
              >
                Close
              </button>
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
                      {ride.start_label || '—'}
                    </p>
                    {ride.meetup_label && ride.meetup_label !== ride.start_label && (
                      <div className="mt-2">
                        <span className="font-label text-[9px] uppercase tracking-tighter text-on-surface-variant block mb-1">Meetup Point</span>
                        <p className="font-body text-sm font-medium text-on-background truncate">{ride.meetup_label}</p>
                      </div>
                    )}
                  </div>
                  <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                    <span className="font-label text-[9px] uppercase tracking-tighter text-on-surface-variant block mb-1">Finish Point</span>
                    <p className="font-body text-sm font-medium text-on-background truncate">
                      {resolveFinishLabel(ride.finish_label, ride.type) ?? '—'}
                    </p>
                  </div>
                </div>

                {(routeStats?.distance_km != null || routeStats?.elevation_gain_m != null) && (
                  <div className="flex gap-6 px-1">
                    {routeStats?.distance_km != null && (
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-on-surface-variant text-base">straighten</span>
                        <span className="font-label text-xs text-on-surface-variant">{routeStats.distance_km.toFixed(1)} km</span>
                      </div>
                    )}
                    {routeStats?.elevation_gain_m != null && (
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-on-surface-variant text-base">landscape</span>
                        <span className="font-label text-xs text-on-surface-variant">{routeStats.elevation_gain_m} m gain</span>
                      </div>
                    )}
                  </div>
                )}
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
                    <>
                      {(showAllParticipants ? participants : participants.slice(0, ROSTER_LIMIT)).map((p) => {
                        const canRemove = isAdmin;
                        return (
                          <div key={p.id} className="flex items-center justify-between p-3 bg-surface-container-lowest hover:bg-surface-container-low rounded-xl border border-outline-variant/5 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                p.role === 'captain' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                              }`}>
                                {(p.display_name ?? '?').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-body text-sm font-semibold text-on-background">{p.display_name}</p>
                                <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant opacity-60">
                                  {!p.account_id ? 'Guest' : p.role.charAt(0).toUpperCase() + p.role.slice(1)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'active' ? 'bg-tertiary' : 'bg-outline-variant'}`} />
                              {canRemove && (
                                <button
                                  onClick={() => setRemoveTarget(p)}
                                  aria-label={`Remove ${p.display_name} from roster`}
                                  className="p-1.5 rounded-full text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-base">person_remove</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {participants.length > ROSTER_LIMIT && (
                        <button
                          onClick={() => setShowAllParticipants(v => !v)}
                          className="w-full py-2 font-label text-[9px] uppercase tracking-widest text-on-surface-variant hover:text-on-background transition-colors"
                        >
                          {showAllParticipants ? 'Show less' : `+${participants.length - ROSTER_LIMIT} more`}
                        </button>
                      )}
                    </>
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
                    closeSheet();
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

                {ride.gpx_path && (
                  <button
                    className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                    onClick={() => downloadGpx(ride.gpx_path!, ride.name)}
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Download GPX
                  </button>
                )}

                {isAdmin && (
                  <>
                    <button
                      className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                      onClick={() => setShowEditModal(true)}
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                      Edit Ride
                    </button>
                    <button
                      className="w-full bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors"
                      onClick={() => { close(); navigate(`/builder/${selectedRideId}`); }}
                    >
                      <span className="material-symbols-outlined text-sm">edit_location_alt</span>
                      Edit Geometry & Crew
                    </button>
                    <button
                      className="w-full bg-error/10 text-error py-3 rounded-xl font-label text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-error/20 transition-colors"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Delete Ride
                    </button>
                    {ride?.status === 'active' && (
                      <button
                        onClick={handleCloseRide}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg font-label text-[10px] uppercase tracking-widest border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">flag</span>
                        Close Ride
                      </button>
                    )}
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
