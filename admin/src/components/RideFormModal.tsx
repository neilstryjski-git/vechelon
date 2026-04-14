import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { formatPoint, getStaticMapUrl } from '../lib/maps';
import { parseGPXCoords } from '../lib/validation';
import { useToast } from '../store/useToast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JOIN_BASE = import.meta.env.VITE_JOIN_BASE_URL ?? 'https://vechelon.app';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID   = '00000000-0000-0000-0000-00000000000a';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteRow {
  id:               string;
  name:             string;
  file_path:        string;
  distance_km:      number | null;
  elevation_gain_m: number | null;
  thumbnail_url:    string | null;
  file_hash:        string | null;
  created_at:       string;
}

interface EditFormValues {
  name:            string;
  scheduled_start: string;
  start_label:     string;
  finish_label:    string;
  external_url:    string;
}

interface RideFormModalProps {
  mode:             'create' | 'edit';
  rideId?:          string;
  initialValues?:   Partial<EditFormValues>;
  isOpen:           boolean;
  onClose:          () => void;
  onCreated?:       (rideId: string) => void;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function calculateHash(text: string): Promise<string> {
  if (!window.crypto?.subtle) return Date.now().toString(16);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}


async function generateQRWithLogo(url: string): Promise<string> {
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H', // 30% recovery capacity — required for logo overlay
    color: { dark: '#1a1a1a', light: '#ffffff' },
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const logoSize = Math.round(size * 0.20);
  const pad      = 10;
  const bgSize   = logoSize + pad * 2;
  const x        = (size - bgSize) / 2;
  const y        = (size - bgSize) / 2;
  const radius   = 12;

  // White rounded-rect background behind logo
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + bgSize - radius, y);
  ctx.quadraticCurveTo(x + bgSize, y, x + bgSize, y + radius);
  ctx.lineTo(x + bgSize, y + bgSize - radius);
  ctx.quadraticCurveTo(x + bgSize, y + bgSize, x + bgSize - radius, y + bgSize);
  ctx.lineTo(x + radius, y + bgSize);
  ctx.quadraticCurveTo(x, y + bgSize, x, y + bgSize - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Club mark: black circle with white "78" — drawn directly, no file dependency
  const cx = size / 2;
  const cy = size / 2;
  const r  = logoSize / 2;

  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font      = `bold ${Math.round(r * 1.1)}px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('78', cx, cy + Math.round(r * 0.05)); // subtle optical centring

  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useCreateRide(onCreated?: (rideId: string) => void, onClose?: () => void) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async ({
      name,
      scheduledStart,
      externalUrl,
      selectedRoute,
      pendingFile,
    }: {
      name:           string;
      scheduledStart: string;
      externalUrl:    string;
      selectedRoute:  RouteRow | null;
      pendingFile:    File | null;
    }) => {
      let gpxPath:      string | null = null;
      let thumbnailUrl: string | null = null;
      let startCoords:  string | null = null;
      let finishCoords: string | null = null;

      const applyGpxCoords = (parsed: ReturnType<typeof parseGPXCoords>) => {
        if (!parsed) return;
        if (parsed.start) startCoords  = formatPoint({ lat: parsed.start.lat, lng: parsed.start.lon });
        if (parsed.end)   finishCoords = formatPoint({ lat: parsed.end.lat,   lng: parsed.end.lon   });
      };

      if (selectedRoute) {
        gpxPath      = selectedRoute.file_path;
        thumbnailUrl = selectedRoute.thumbnail_url;
        // Fetch GPX to extract first/last track point
        const { data: gpxBlob } = await supabase.storage.from('gpx-routes').download(selectedRoute.file_path);
        if (gpxBlob) applyGpxCoords(parseGPXCoords(await gpxBlob.text()));
      } else if (pendingFile) {
        const text   = await pendingFile.text();
        const parsed = parseGPXCoords(text);
        if (!parsed) throw new Error('GPX file contains no track data');

        applyGpxCoords(parsed);

        const hash        = await calculateHash(text);
        const routeId     = crypto.randomUUID();
        const filePath    = `${TENANT_ID}/${routeId}.gpx`;
        const routeName   = name.trim() || parsed.name || pendingFile.name.replace(/\.gpx$/i, '');
        const thumbUrl    = parsed.points ? getStaticMapUrl(parsed.points) : null;

        const { error: upErr } = await supabase.storage
          .from('gpx-routes')
          .upload(filePath, pendingFile, { contentType: 'application/gpx+xml', upsert: false });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

        const { error: insErr } = await supabase.from('route_library').insert({
          id:               routeId,
          tenant_id:        TENANT_ID,
          name:             routeName,
          file_path:        filePath,
          distance_km:      parsed.distance_km,
          elevation_gain_m: parsed.elevation_gain,
          thumbnail_url:    thumbUrl,
          file_hash:        hash,
          created_by:       USER_ID,
          external_url:     null,
        });
        if (insErr) {
          await supabase.storage.from('gpx-routes').remove([filePath]);
          throw new Error(`Route library insert failed: ${insErr.message}`);
        }

        gpxPath      = filePath;
        thumbnailUrl = thumbUrl;
      }

      const rideId  = crypto.randomUUID();
      const joinUrl = `${JOIN_BASE}/join/${rideId}`;
      const qrCode  = await generateQRWithLogo(joinUrl);

      const { error } = await supabase.from('rides').insert({
        id:              rideId,
        name:            name.trim(),
        type:            'scheduled',
        status:          'created',
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
        external_url:    externalUrl.trim() || null,
        gpx_path:        gpxPath,
        thumbnail_url:   thumbnailUrl,
        start_coords:    startCoords,
        finish_coords:   finishCoords,
        qr_code:         qrCode,
        tenant_id:       TENANT_ID,
        created_by:      USER_ID,
      });
      if (error) throw error;

      return rideId;
    },
    onSuccess: (rideId) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-rides'] });
      queryClient.invalidateQueries({ queryKey: ['route-library'] });
      addToast('Ride scheduled. Opening builder…', 'success');
      onClose?.();
      onCreated?.(rideId);
    },
    onError: (err: Error) => {
      addToast(`Create failed: ${err.message}`, 'error');
    },
  });
}

function useUpdateRide(rideId: string | undefined, onClose: () => void) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async (values: EditFormValues) => {
      if (!rideId) throw new Error('No ride ID for update');
      const { error } = await supabase
        .from('rides')
        .update({
          name:            values.name.trim(),
          scheduled_start: values.scheduled_start
            ? new Date(values.scheduled_start).toISOString()
            : null,
          start_label:     values.start_label.trim()  || null,
          finish_label:    values.finish_label.trim() || null,
          external_url:    values.external_url.trim() || null,
        })
        .eq('id', rideId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-rides'] });
      queryClient.invalidateQueries({ queryKey: ['ride-detail', rideId] });
      addToast('Ride updated.', 'success');
      onClose();
    },
    onError: (err: Error) => {
      addToast(`Update failed: ${err.message}`, 'error');
    },
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RoutePickerLibrary({
  routes,
  selectedId,
  onSelect,
}: {
  routes:     RouteRow[];
  selectedId: string | null;
  onSelect:   (r: RouteRow) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = routes.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-base">search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter routes…"
          className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-md pl-9 pr-4 py-2 font-body text-sm text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-40">
          {routes.length === 0 ? 'No routes in library yet' : 'No matches'}
        </p>
      ) : (
        <div className="overflow-y-auto max-h-48 space-y-1.5 pr-1">
          {filtered.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                selectedId === r.id
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-outline-variant/20 bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-container-high shrink-0">
                {r.thumbnail_url ? (
                  <img src={r.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center material-symbols-outlined text-on-surface-variant/30 text-base">map</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-semibold text-on-background truncate">{r.name}</p>
                {r.distance_km != null && (
                  <p className="font-label text-[9px] text-on-surface-variant opacity-60">
                    {r.distance_km.toFixed(1)} km
                    {r.elevation_gain_m != null ? ` · ${r.elevation_gain_m} m gain` : ''}
                  </p>
                )}
              </div>
              {selectedId === r.id && (
                <span className="material-symbols-outlined text-primary text-base shrink-0">check_circle</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RouteUploader({
  routes,
  onRouteReady,
}: {
  routes:        RouteRow[];
  onRouteReady:  (result: { file: File; duplicate: RouteRow | null }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'duplicate' | 'ready'>('idle');
  const [preview, setPreview] = useState<{ name: string; distance: string } | null>(null);
  const [duplicate, setDuplicate] = useState<RouteRow | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.gpx')) {
      return;
    }

    setCurrentFile(file);
    setStatus('checking');
    setDuplicate(null);
    setPreview(null);

    const text   = await file.text();
    const hash   = await calculateHash(text);
    const parsed = parseGPXCoords(text);
    const dup    = routes.find(r => r.file_hash === hash) ?? null;

    const distStr = parsed?.distance_km != null
      ? `${parsed.distance_km.toFixed(1)} km`
      : '';

    setPreview({
      name:     parsed?.name || file.name.replace(/\.gpx$/i, ''),
      distance: distStr,
    });

    if (dup) {
      setDuplicate(dup);
      setStatus('duplicate');
      onRouteReady({ file, duplicate: dup });
    } else {
      setStatus('ready');
      onRouteReady({ file, duplicate: null });
    }
  };

  const handleUseExisting = () => {
    if (!duplicate) return;
    onRouteReady({ file: currentFile!, duplicate });
  };

  const handleUploadAnyway = () => {
    if (!currentFile) return;
    onRouteReady({ file: currentFile, duplicate: null });
    setStatus('ready');
    setDuplicate(null);
  };

  return (
    <div className="space-y-3">
      <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-outline-variant/40 rounded-xl cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all group">
        <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-primary/60 text-2xl mb-1">upload_file</span>
        <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant/60">
          {status === 'checking' ? 'Analysing…' : 'Drop GPX or click to browse'}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".gpx"
          onChange={handleFile}
          className="hidden"
        />
      </label>

      {status === 'checking' && (
        <div className="flex items-center gap-2 p-3 bg-surface-container-low rounded-xl">
          <span className="material-symbols-outlined text-on-surface-variant text-base animate-spin">sync</span>
          <span className="font-label text-[10px] text-on-surface-variant">Checking for duplicates…</span>
        </div>
      )}

      {status === 'duplicate' && duplicate && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl space-y-2">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-amber-500 text-base shrink-0 mt-0.5">warning</span>
            <p className="font-body text-xs text-amber-800 dark:text-amber-200">
              This route already exists as <span className="font-semibold">"{duplicate.name}"</span>. Use it or upload a new copy?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUseExisting}
              className="flex-1 bg-primary text-on-primary py-1.5 rounded-lg font-label text-[9px] uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              Use "{duplicate.name}"
            </button>
            <button
              type="button"
              onClick={handleUploadAnyway}
              className="flex-1 bg-surface-container-high text-on-surface-variant py-1.5 rounded-lg font-label text-[9px] uppercase tracking-widest hover:bg-surface-container-highest transition-colors"
            >
              Upload Anyway
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && preview && (
        <div className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl border border-outline-variant/20">
          <span className="material-symbols-outlined text-primary text-base">check_circle</span>
          <div>
            <p className="font-body text-sm font-semibold text-on-background">{preview.name}</p>
            {preview.distance && (
              <p className="font-label text-[9px] text-on-surface-variant opacity-60">{preview.distance}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const EMPTY_EDIT: EditFormValues = {
  name:            '',
  scheduled_start: '',
  start_label:     '',
  finish_label:    '',
  external_url:    '',
};

const RideFormModal: React.FC<RideFormModalProps> = ({
  mode,
  rideId,
  initialValues,
  isOpen,
  onClose,
  onCreated,
}) => {
  // ── Create state ────────────────────────────────────────────────────────
  const [name, setName]                   = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [externalUrl, setExternalUrl]     = useState('');
  const [routeTab, setRouteTab]           = useState<'library' | 'upload'>('library');
  const [selectedRoute, setSelectedRoute] = useState<RouteRow | null>(null);
  const [pendingFile, setPendingFile]     = useState<File | null>(null);

  // ── Edit state ───────────────────────────────────────────────────────────
  const [editValues, setEditValues] = useState<EditFormValues>(EMPTY_EDIT);

  const createMutation = useCreateRide(onCreated, onClose);
  const updateMutation = useUpdateRide(rideId, onClose);
  const isPending      = createMutation.isPending || updateMutation.isPending;

  const { data: routes = [] } = useQuery<RouteRow[]>({
    queryKey: ['route-library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('route_library')
        .select('id, name, file_path, distance_km, elevation_gain_m, thumbnail_url, file_hash, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isOpen && mode === 'create',
  });

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      setName('');
      setScheduledStart('');
      setExternalUrl('');
      setRouteTab('library');
      setSelectedRoute(null);
      setPendingFile(null);
    } else {
      setEditValues({ ...EMPTY_EDIT, ...initialValues });
    }
  }, [isOpen, mode]);

  const handleUseExistingFromDuplicate = (route: RouteRow) => {
    setSelectedRoute(route);
    setPendingFile(null);
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({ name, scheduledStart, externalUrl, selectedRoute, pendingFile });
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editValues.name.trim()) return;
    updateMutation.mutate(editValues);
  };

  if (!isOpen) return null;

  const inputClass =
    'w-full bg-surface-container-lowest border border-outline-variant/30 rounded-md px-4 py-2.5 font-body text-sm text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors';
  const labelClass =
    'font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-1.5';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/70 backdrop-blur-md z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="signature-gradient h-1 w-full" />

          {/* Header */}
          <div className="px-6 py-5 border-b border-surface-container-low flex justify-between items-center">
            <div>
              <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-0.5">
                {mode === 'create' ? 'New Scheduled Ride' : 'Edit Ride'}
              </span>
              <h2 className="font-headline font-bold text-lg text-on-background">
                {mode === 'create' ? 'Schedule a Ride' : 'Update Ride Details'}
              </h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>

          {/* ── CREATE FORM ─────────────────────────────────────────────── */}
          {mode === 'create' && (
            <form onSubmit={handleSubmitCreate} className="overflow-y-auto max-h-[75vh] p-6 space-y-5">

              {/* Name */}
              <div>
                <label className={labelClass}>Ride Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Saturday Morning Hammer Fest"
                  className={inputClass}
                  required
                />
              </div>

              {/* Date & Time */}
              <div>
                <label className={labelClass}>Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={e => setScheduledStart(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* External URL */}
              <div>
                <label className={labelClass}>Activity URL <span className="opacity-40 normal-case tracking-normal">(Garmin / Strava)</span></label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={e => setExternalUrl(e.target.value)}
                  placeholder="https://connect.garmin.com/…"
                  className={inputClass}
                />
              </div>

              {/* Route Section */}
              <div>
                <label className={labelClass}>Route</label>

                {/* Tabs */}
                <div className="flex gap-1 bg-surface-container-low p-1 rounded-lg mb-3">
                  {(['library', 'upload'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setRouteTab(tab)}
                      className={`flex-1 py-1.5 rounded-md font-label text-[9px] uppercase tracking-widest transition-all ${
                        routeTab === tab
                          ? 'bg-surface-container-lowest text-on-background shadow-sm'
                          : 'text-on-surface-variant hover:text-on-background'
                      }`}
                    >
                      {tab === 'library' ? 'From Library' : 'Upload GPX'}
                    </button>
                  ))}
                </div>

                {routeTab === 'library' ? (
                  <RoutePickerLibrary
                    routes={routes}
                    selectedId={selectedRoute?.id ?? null}
                    onSelect={r => { setSelectedRoute(r); setPendingFile(null); }}
                  />
                ) : (
                  <RouteUploader
                    routes={routes}
                    onRouteReady={({ file, duplicate }) => {
                      if (duplicate) {
                        handleUseExistingFromDuplicate(duplicate);
                      } else {
                        setPendingFile(file);
                        setSelectedRoute(null);
                      }
                    }}
                  />
                )}

                {/* Selected route summary */}
                {selectedRoute && (
                  <div className="mt-3 flex items-center gap-3 p-2.5 bg-primary/5 border border-primary/20 rounded-xl">
                    {selectedRoute.thumbnail_url && (
                      <img src={selectedRoute.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-xs font-semibold text-on-background truncate">{selectedRoute.name}</p>
                      <p className="font-label text-[9px] text-primary uppercase tracking-widest">Route selected</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedRoute(null)}
                      className="p-1 hover:bg-surface-container-high rounded-full transition-colors"
                    >
                      <span className="material-symbols-outlined text-on-surface-variant text-sm">close</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Geometry note */}
              <p className="font-label text-[9px] text-on-surface-variant/50 leading-relaxed bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                <span className="material-symbols-outlined text-[11px] align-middle mr-1">info</span>
                After creating, you'll be taken to Ride Builder to set the start point, finish, and any waypoints.
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest hover:bg-surface-container-highest transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !name.trim()}
                  className="flex-1 signature-gradient text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isPending ? 'sync' : 'arrow_forward'}
                  </span>
                  {isPending ? 'Creating…' : 'Create & Open Builder'}
                </button>
              </div>
            </form>
          )}

          {/* ── EDIT FORM ────────────────────────────────────────────────── */}
          {mode === 'edit' && (
            <form onSubmit={handleSubmitEdit} className="overflow-y-auto max-h-[70vh] p-6 space-y-5">

              <div>
                <label className={labelClass}>Ride Name *</label>
                <input
                  type="text"
                  value={editValues.name}
                  onChange={e => setEditValues(v => ({ ...v, name: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Date & Time</label>
                <input
                  type="datetime-local"
                  value={editValues.scheduled_start}
                  onChange={e => setEditValues(v => ({ ...v, scheduled_start: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Start Label</label>
                  <input
                    type="text"
                    value={editValues.start_label}
                    onChange={e => setEditValues(v => ({ ...v, start_label: e.target.value }))}
                    placeholder="e.g. Café Racer HQ"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Finish Label</label>
                  <input
                    type="text"
                    value={editValues.finish_label}
                    onChange={e => setEditValues(v => ({ ...v, finish_label: e.target.value }))}
                    placeholder="e.g. Velodrome"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Activity URL</label>
                <input
                  type="url"
                  value={editValues.external_url}
                  onChange={e => setEditValues(v => ({ ...v, external_url: e.target.value }))}
                  placeholder="https://connect.garmin.com/…"
                  className={inputClass}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-label text-[10px] uppercase tracking-widest hover:bg-surface-container-highest transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !editValues.name.trim()}
                  className="flex-1 signature-gradient text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isPending ? 'sync' : 'save'}
                  </span>
                  {isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};

export default RideFormModal;
