import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { formatPoint, getStaticMapUrl, getStaticMapPinUrl } from '../lib/maps';
import { parseGPXCoords } from '../lib/validation';
import { useToast } from '../store/useToast';
import type { RideType } from '../store/useAppStore';
import { importLibrary } from '../lib/mapsLoader';


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JOIN_BASE = import.meta.env.VITE_JOIN_BASE_URL ?? 'https://vechelon.productdelivered.ca';
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
  onCreated?:       (rideId: string | null) => void;
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
// Series date generation
// ---------------------------------------------------------------------------

type Frequency = 'weekly' | 'biweekly' | 'monthly';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function generateSeriesDates(
  startDateStr: string,
  frequency: Frequency,
  selectedDays: number[], // 0 = Mon … 6 = Sun
  count: number,
): Date[] {
  if (!startDateStr || count < 1) return [];
  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return [];

  const h = start.getHours();
  const m = start.getMinutes();
  const jsToOur = (d: number) => (d + 6) % 7;
  const startOurDay = jsToOur(start.getDay());
  const days = [...(selectedDays.length > 0 ? selectedDays : [startOurDay])].sort((a, b) => a - b);

  if (frequency === 'monthly') {
    const dates: Date[] = [];
    const d = new Date(start);
    while (dates.length < count) {
      dates.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
    return dates;
  }

  const intervalWeeks = frequency === 'biweekly' ? 2 : 1;
  const weekBase = new Date(start);
  weekBase.setDate(start.getDate() - startOurDay);
  weekBase.setHours(h, m, 0, 0);

  const dates: Date[] = [];
  const cursor = new Date(weekBase);

  while (dates.length < count) {
    for (const day of days) {
      if (dates.length >= count) break;
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + day);
      if (d >= start) dates.push(new Date(d));
    }
    cursor.setDate(cursor.getDate() + intervalWeeks * 7);
  }

  return dates;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useCreateRide(onCreated?: (rideId: string | null) => void, onClose?: () => void) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async ({
      name,
      scheduledStart,
      externalUrl,
      selectedRoute,
      pendingFile,
      isRecurring,
      frequency,
      selectedDays,
      occurrenceCount,
      rideType,
      meetupLabel,
      meetupCoords,
      singleRideId,
    }: {
      name:            string;
      scheduledStart:  string;
      externalUrl:     string;
      selectedRoute:   RouteRow | null;
      pendingFile:     File | null;
      isRecurring:     boolean;
      frequency:       Frequency;
      selectedDays:    number[];
      occurrenceCount: number;
      rideType:        RideType;
      meetupLabel:     string;
      meetupCoords:    { lat: number; lng: number } | null;
      singleRideId?:   string;
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
        if (gpxBlob) {
          const parsed = parseGPXCoords(await gpxBlob.text());
          if (!parsed) throw new Error('Failed to extract coordinates from selected route GPX');
          applyGpxCoords(parsed);
        } else {
          throw new Error('Failed to download selected route GPX');
        }
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

      // For meetup rides: use the admin pin-drop coords instead of GPX coords
      if (rideType === 'meetup' && meetupCoords) {
        startCoords = formatPoint(meetupCoords);
        thumbnailUrl = getStaticMapPinUrl(meetupCoords.lat, meetupCoords.lng);
      }

      // Safety check: rides table REQUIRES start_coords
      if (!startCoords) {
        throw new Error(
          rideType === 'meetup'
            ? 'A meetup location pin is required.'
            : 'A route or GPX file is required to provide the mandatory start coordinates.'
        );
      }

      // Build ride dates — one date for single, multiple for series
      const dates: Date[] = isRecurring
        ? generateSeriesDates(scheduledStart, frequency, selectedDays, occurrenceCount)
        : scheduledStart ? [new Date(scheduledStart)] : [new Date()];

      const seriesId = isRecurring ? crypto.randomUUID() : null;
      const rideName = name.trim();

      // Build all rows (generating a QR per instance)
      const rows = await Promise.all(dates.map(async (date, i) => {
        const rideId  = (i === 0 && singleRideId) ? singleRideId : crypto.randomUUID();
        const joinUrl = `${JOIN_BASE}/portal/ride/${rideId}`;
        const qrCode  = await generateQRWithLogo(joinUrl);
        return {
          id:              rideId,
          name:            rideName,
          type:            rideType,
          status:          'created',
          scheduled_start: date.toISOString(),
          external_url:    externalUrl.trim() || null,
          gpx_path:        rideType === 'meetup' ? null : gpxPath,
          thumbnail_url:   thumbnailUrl,
          start_coords:    startCoords,
          start_label:     rideType === 'meetup'
                             ? (meetupLabel.trim() || 'Meetup')
                             : (startCoords ? 'Start' : null),
          finish_coords:   rideType === 'meetup' ? null : finishCoords,
          finish_label:    (rideType !== 'meetup' && finishCoords) ? 'Finish' : null,
          meetup_coords:   meetupCoords ? formatPoint(meetupCoords) : startCoords,
          meetup_label:    meetupLabel.trim() || (rideType === 'meetup' ? 'Meetup' : 'Start'),
          qr_code:         qrCode,
          series_id:       seriesId,
          tenant_id:       TENANT_ID,
          created_by:      USER_ID,
        };
      }));

      const { error } = await supabase.from('rides').insert(rows);
      if (error) throw error;

      // Return first rideId for single rides (→ builder), null for series (→ calendar)
      return isRecurring ? null : rows[0].id;
    },
    onSuccess: (rideId) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-rides'] });
      queryClient.invalidateQueries({ queryKey: ['route-library'] });
      addToast(rideId ? 'Ride saved — broadcast copied to clipboard.' : 'Series created and added to calendar.', 'success');
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
// Shared style constant (used by sub-components and main form)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// MeetupLocationPicker — inline Google Maps picker with Places Autocomplete
// ---------------------------------------------------------------------------

interface MeetupLocationPickerProps {
  coords:         { lat: number; lng: number } | null;
  label:          string;
  onCoordsChange: (c: { lat: number; lng: number }) => void;
  onLabelChange:  (l: string) => void;
}

function MeetupLocationPicker({ coords, onCoordsChange, onLabelChange }: MeetupLocationPickerProps) {
  const mapDivRef      = useRef<HTMLDivElement>(null);
  const acContainerRef = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<google.maps.Map | null>(null);
  const markerRef      = useRef<google.maps.Marker | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    if (!mapDivRef.current) return;
    let cancelled = false;

    (async () => {
      const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
      await importLibrary('marker');
      await importLibrary('places');
      if (cancelled || !mapDivRef.current) return;

      const defaultCenter = coords ?? { lat: 43.6532, lng: -79.3832 };
      const map = new Map(mapDivRef.current, {
        center: defaultCenter,
        zoom:   coords ? 15 : 11,
        disableDefaultUI: true,
        zoomControl: true,
      });
      mapRef.current = map;

      const marker = new google.maps.Marker({
        map,
        position:  defaultCenter,
        draggable: true,
        visible:   !!coords,
      });
      markerRef.current = marker;

      const applyLocation = (pos: { lat: number; lng: number }, name?: string) => {
        map.panTo(pos);
        map.setZoom(16);
        marker.setPosition(pos);
        marker.setVisible(true);
        onCoordsChange(pos);
        if (name) onLabelChange(name);
        // Scroll map into view in case form is scrolled up
        mapDivRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PlaceAutocompleteElement = (google.maps.places as any).PlaceAutocompleteElement;
      if (acContainerRef.current && PlaceAutocompleteElement) {
        const placeAC = new PlaceAutocompleteElement();
        acContainerRef.current.appendChild(placeAC);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        placeAC.addEventListener('gmp-placeselect', async (event: any) => {
          const place = event.place ?? event.detail?.place;
          if (!place) return;
          try {
            await place.fetchFields({ fields: ['location', 'displayName'] });
          } catch (e) {
            console.error('[MeetupPicker] fetchFields error:', e);
          }
          const loc = place.location;
          console.log('[MeetupPicker] place selected, location:', loc, 'displayName:', place.displayName);
          if (loc) {
            const lat = typeof loc.lat === 'function' ? loc.lat() : (loc.lat as number);
            const lng = typeof loc.lng === 'function' ? loc.lng() : (loc.lng as number);
            applyLocation({ lat, lng }, place.displayName);
          } else {
            // fetchFields returned no location — fall back to Geocoder
            const query = place.displayName;
            if (!query) return;
            new google.maps.Geocoder().geocode({ address: query }, (results: any, status: any) => {
              console.log('[MeetupPicker] geocoder fallback:', status, results?.[0]?.geometry?.location);
              if (status === 'OK' && results?.[0]?.geometry?.location) {
                const g = results[0].geometry.location;
                applyLocation({ lat: g.lat(), lng: g.lng() }, query);
              }
            });
          }
        });
      }

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        applyLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });

      marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        onCoordsChange({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });

      setIsMapReady(true);
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync externally-set coords (e.g. GPX auto-populate)
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !markerRef.current || !coords) return;
    mapRef.current.panTo(coords);
    mapRef.current.setZoom(16);
    markerRef.current.setPosition(coords);
    markerRef.current.setVisible(true);
  }, [isMapReady, coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="w-full rounded-lg border border-outline-variant/30 overflow-hidden focus-within:border-primary transition-colors">
        <div
          ref={acContainerRef}
          className="w-full [&>gmp-placeautocomplete]:w-full [&>gmp-placeautocomplete]:block"
        />
      </div>
      <div
        ref={mapDivRef}
        className="w-full h-[200px] rounded-xl overflow-hidden border border-outline-variant/20"
      />
      <p className="font-label text-[9px] text-on-surface-variant/50">
        {coords
          ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} · Click map or drag pin to adjust`
          : 'Search above or click the map to drop a pin'}
      </p>
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

  // ── Ride type + meetup location state ───────────────────────────────────
  const [rideType, setRideType]         = useState<RideType>('route');
  const [meetupLabel, setMeetupLabel]   = useState('');
  const [meetupCoords, setMeetupCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ── Recurring state ──────────────────────────────────────────────────────
  const [isRecurring, setIsRecurring]       = useState(false);
  const [frequency, setFrequency]           = useState<Frequency>('weekly');
  const [selectedDays, setSelectedDays]     = useState<number[]>([]);
  const [occurrenceCount, setOccurrenceCount] = useState(8);

  // Auto-select the start date's day-of-week when it changes
  useEffect(() => {
    if (scheduledStart) {
      const d = new Date(scheduledStart);
      const ourDay = (d.getDay() + 6) % 7;
      setSelectedDays([ourDay]);
    }
  }, [scheduledStart]);

  // Auto-populate meetup pin from GPX start coords (Route Rides only)
  useEffect(() => {
    if (rideType !== 'route') return;
    if (!selectedRoute && !pendingFile) return;

    (async () => {
      let parsed: ReturnType<typeof parseGPXCoords> | null = null;
      if (selectedRoute) {
        const { data: gpxBlob } = await supabase.storage
          .from('gpx-routes')
          .download(selectedRoute.file_path);
        if (gpxBlob) parsed = parseGPXCoords(await gpxBlob.text());
      } else if (pendingFile) {
        parsed = parseGPXCoords(await pendingFile.text());
      }
      if (parsed?.start) {
        setMeetupCoords({ lat: parsed.start.lat, lng: parsed.start.lon });
      }
    })();
  }, [selectedRoute, pendingFile, rideType]); // eslint-disable-line react-hooks/exhaustive-deps

  const seriesDates = isRecurring && scheduledStart
    ? generateSeriesDates(scheduledStart, frequency, selectedDays, occurrenceCount)
    : [];
  const projectedEnd = seriesDates.length > 0
    ? seriesDates[seriesDates.length - 1]
    : null;

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
      setIsRecurring(false);
      setFrequency('weekly');
      setSelectedDays([]);
      setOccurrenceCount(8);
      setRideType('route');
      setMeetupLabel('');
      setMeetupCoords(null);
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

    // Pre-generate the ride ID so the broadcast URL is complete
    const singleRideId = isRecurring ? undefined : crypto.randomUUID();

    // Copy broadcast immediately on click (before async save) — single rides only
    if (singleRideId) {
      try {
        const dt = scheduledStart ? new Date(scheduledStart) : new Date();
        const dateStr = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const meetupValue = meetupCoords
          ? `${meetupLabel.trim() || 'Start'} — https://maps.google.com/maps?q=${meetupCoords.lat},${meetupCoords.lng}`
          : meetupLabel.trim() || '—';
        const broadcast = [
          `*${name.trim()}*`,
          `Date/Time: ${dateStr} · ${timeStr}`,
          ...(externalUrl.trim() ? [`Route: ${externalUrl.trim()}`] : []),
          `Meetup: ${meetupValue}`,
          `Details: ${JOIN_BASE}/portal/ride/${singleRideId}`,
          '',
        ].join('\n');
        navigator.clipboard.writeText(broadcast).catch(() => {});
      } catch {
        // clipboard failure is non-fatal
      }
    }

    createMutation.mutate({ name, scheduledStart, externalUrl, selectedRoute, pendingFile, isRecurring, frequency, selectedDays, occurrenceCount, rideType, meetupLabel, meetupCoords, singleRideId });
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
                {mode === 'create' ? (rideType === 'meetup' ? 'New Meetup Ride' : 'New Route Ride') : 'Edit Ride'}
              </span>
              <h2 className="font-headline font-bold text-lg text-on-background">
                {mode === 'create' ? (rideType === 'meetup' ? 'Plan a Meetup' : 'Schedule a Ride') : 'Update Ride Details'}
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

              {/* Ride Type Toggle */}
              <div>
                <label className={labelClass}>Ride Type</label>
                <div className="flex gap-2">
                  {(['route', 'meetup'] as RideType[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setRideType(t);
                        if (t === 'meetup') { setSelectedRoute(null); setPendingFile(null); }
                      }}
                      className={`flex-1 py-1.5 rounded-lg font-label text-[9px] uppercase tracking-widest transition-all ${
                        rideType === t
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {t === 'route' ? 'Route Ride' : 'Meetup Ride'}
                    </button>
                  ))}
                </div>
                {rideType === 'meetup' && (
                  <p className="font-body text-xs text-on-surface-variant/60 mt-1.5">
                    No GPX required — group decides the route at the start.
                  </p>
                )}
              </div>

              {/* Route Section — route rides only */}
              {rideType !== 'meetup' && (
                <div>
                  <label className={labelClass}>Route *</label>

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
              )}

              {/* Meetup Location — all ride types */}
              <div>
                <label className={labelClass}>
                  Meetup Location{rideType === 'meetup' ? ' *' : ' (optional override)'}
                </label>
                <input
                  type="text"
                  value={meetupLabel}
                  onChange={e => setMeetupLabel(e.target.value)}
                  placeholder="e.g. Snug Harbour, 2214 Bloor St W"
                  className={`${inputClass} mb-2`}
                />
                <MeetupLocationPicker
                  coords={meetupCoords}
                  label={meetupLabel}
                  onCoordsChange={setMeetupCoords}
                  onLabelChange={setMeetupLabel}
                />
                {rideType === 'route' && !meetupCoords && (
                  <p className="font-body text-xs text-on-surface-variant/60 mt-1.5">
                    Auto-populated from GPX start when a route is selected.
                  </p>
                )}
              </div>

              {/* Recurring Ride Toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Recurring Ride</p>
                  <p className="font-body text-xs text-on-surface-variant/60 mt-0.5">Create a series of individual ride instances</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecurring(v => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${isRecurring ? 'bg-primary' : 'bg-outline-variant/40'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${isRecurring ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Recurring Controls */}
              {isRecurring && (
                <div className="bg-surface-container-low rounded-xl p-4 space-y-4 border border-outline-variant/10">

                  {/* Frequency */}
                  <div>
                    <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-2">Repeat Frequency</p>
                    <div className="flex gap-2">
                      {(['weekly', 'biweekly', 'monthly'] as Frequency[]).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          className={`flex-1 py-1.5 rounded-lg font-label text-[9px] uppercase tracking-widest transition-all ${
                            frequency === f
                              ? 'bg-primary text-on-primary shadow-sm'
                              : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                        >
                          {f === 'biweekly' ? 'Bi-Weekly' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day Selector (not shown for monthly) */}
                  {frequency !== 'monthly' && (
                    <div>
                      <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-2">Select Days</p>
                      <div className="flex gap-1.5">
                        {DAY_LABELS.map((label, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedDays(prev =>
                              prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i]
                            )}
                            className={`flex-1 aspect-square flex items-center justify-center rounded-lg font-label text-[10px] font-bold transition-all ${
                              selectedDays.includes(i)
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Occurrence Count */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">Occurrences</p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setOccurrenceCount(v => Math.max(1, v - 1))} className="w-5 h-5 rounded-full bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high flex items-center justify-center font-bold text-xs transition-colors">−</button>
                        <span className="font-headline font-bold text-on-background text-sm w-6 text-center tabular-nums">{occurrenceCount}</span>
                        <button type="button" onClick={() => setOccurrenceCount(v => Math.min(52, v + 1))} className="w-5 h-5 rounded-full bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high flex items-center justify-center font-bold text-xs transition-colors">+</button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={1} max={52}
                      value={occurrenceCount}
                      onChange={e => setOccurrenceCount(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* Projected End Date */}
                  {projectedEnd && (
                    <div className="flex items-center justify-between pt-1 border-t border-outline-variant/10">
                      <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant">Projected End</p>
                      <p className="font-body text-sm font-semibold text-on-background">
                        {projectedEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* External URL */}
              <div>
                <label className={labelClass}>External Link <span className="opacity-40 normal-case tracking-normal">{rideType === 'meetup' ? '(Event page / details link)' : '(Route / course link)'}</span></label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={e => setExternalUrl(e.target.value)}
                  placeholder="https://www.komoot.com/…"
                  className={inputClass}
                />
              </div>

              {/* Geometry note */}
              <p className="font-label text-[9px] text-on-surface-variant/50 leading-relaxed bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
                <span className="material-symbols-outlined text-[11px] align-middle mr-1">info</span>
                {rideType === 'meetup'
                  ? 'Meetup rides gather at the pinned location. No GPX route is required — the group decides on the day.'
                  : isRecurring
                    ? `${occurrenceCount} individual ride instances will be created and added to your calendar.`
                    : "After creating, you'll be taken to Ride Builder to fine-tune start, finish, and waypoints."}
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
                  disabled={isPending || !name.trim() || (rideType === 'meetup' && (!meetupCoords || !meetupLabel.trim()))}
                  className="flex-1 signature-gradient text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">
                    {isPending ? 'sync' : isRecurring ? 'event_repeat' : rideType === 'meetup' ? 'location_on' : 'arrow_forward'}
                  </span>
                  {isPending ? 'Creating…' : isRecurring ? `Create ${occurrenceCount} Rides` : rideType === 'meetup' ? 'Create Meetup' : 'Create & Open Builder'}
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
                <label className={labelClass}>External Link</label>
                <input
                  type="url"
                  value={editValues.external_url}
                  onChange={e => setEditValues(v => ({ ...v, external_url: e.target.value }))}
                  placeholder="https://www.komoot.com/…"
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
