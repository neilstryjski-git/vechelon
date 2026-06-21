import React, { useCallback, useEffect, useRef, useState } from 'react';
import { importLibrary } from '../lib/mapsLoader';
import { veloModernStyle } from '../lib/mapStyles';
import type { RideRole } from '../lib/roleVisibility';

export interface FleetMapMarker {
  id: string;
  position: { lat: number; lng: number };
  label: string;
  role: RideRole;
  stale: boolean;
}

interface FleetMapProps {
  markers: FleetMapMarker[];
  onMarkerClick?: (id: string) => void;
  // W215 — the ride-leader breadcrumb trail, drawn as a single polyline BELOW the
  // rider markers. Empty / <2 points → nothing drawn (and any existing line cleared).
  breadcrumb?: { lat: number; lng: number }[];
  className?: string;
}

// Mirror the mobile breadcrumb stroke (mobile RideMapScreen Polyline) so both
// surfaces read the same. Provisional colour/width pending a Feature-6 design pass.
const BREADCRUMB_COLOR = '#4F46E5';
const BREADCRUMB_WEIGHT = 5;

const ICON_BASE = 'https://maps.google.com/mapfiles/ms/icons/';
const TORONTO = { lat: 43.6532, lng: -79.3832 };

// Stale → grey (last-known, no longer live). Command roles (Captain/SAG) → blue
// to stand out from riders → yellow. Mirrors InteractiveMap's hosted-icon scheme.
function fleetIcon(role: RideRole, stale: boolean): google.maps.Icon {
  let color: string;
  if (stale) color = 'grey';
  else if (role === 'captain' || role === 'support') color = 'blue';
  else color = 'yellow';
  return {
    url: `${ICON_BASE}${color}-dot.png`,
    scaledSize: new google.maps.Size(32, 32),
  };
}

// Read-only live fleet canvas. Follows InteractiveMap's legacy-Marker lifecycle
// (markersRef keyed by id, upsert/remove on prop change) but deliberately fits
// bounds ONCE — a live tracker must not yank the camera on every ping; the
// operator pans/zooms freely after the initial fit.
const FleetMap: React.FC<FleetMapProps> = ({ markers, onMarkerClick, breadcrumb, className = 'w-full h-full' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [loaderError, setLoaderError] = useState<string | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const breadcrumbRef = useRef<google.maps.Polyline | null>(null);
  const hasFitRef = useRef(false);
  // Stable ref so the marker click listener always calls the latest handler.
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);

  // Snap the camera to encompass the whole fleet. Used for the initial one-time fit
  // AND the manual "Fit all riders" button (the operator can pan/zoom freely, then
  // re-fit on demand). A single marker would fitBounds to max zoom, so clamp it.
  const fitToMarkers = useCallback(() => {
    if (!map || markers.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend(m.position));
    map.fitBounds(bounds);
    if (markers.length === 1) {
      const listener = google.maps.event.addListener(map, 'idle', () => {
        map.setZoom(15);
        google.maps.event.removeListener(listener);
      });
    }
  }, [map, markers]);

  useEffect(() => {
    const initMap = async () => {
      try {
        const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
        await importLibrary('marker');

        if (mapRef.current && !map) {
          const newMap = new Map(mapRef.current, {
            center: TORONTO,
            zoom: 12,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            scaleControl: true,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
            styles: veloModernStyle,
          });
          setMap(newMap);
          setIsLoaded(true);
        }
      } catch (e: unknown) {
        console.error('Google Maps Load Error:', e);
        setLoaderError(`Load Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    initMap();
  }, []);

  // Sync markers: remove departed riders, upsert the rest.
  useEffect(() => {
    if (!isLoaded || !map) return;

    Object.keys(markersRef.current).forEach((id) => {
      if (!markers.find((m) => m.id === id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
      }
    });

    markers.forEach((m) => {
      let marker = markersRef.current[m.id];
      if (marker) {
        marker.setPosition(m.position);
        marker.setIcon(fleetIcon(m.role, m.stale));
        marker.setTitle(m.label);
        marker.setOpacity(m.stale ? 0.55 : 1);
      } else {
        marker = new google.maps.Marker({
          position: m.position,
          map,
          title: m.label,
          icon: fleetIcon(m.role, m.stale),
          opacity: m.stale ? 0.55 : 1,
        });
        marker.addListener('click', () => {
          onMarkerClickRef.current?.(m.id);
        });
        markersRef.current[m.id] = marker;
      }
    });

    // Fit to the fleet ONCE, the first time we have any markers. After that the
    // camera belongs to the operator (re-fit on demand via the button).
    if (!hasFitRef.current && markers.length > 0) {
      fitToMarkers();
      hasFitRef.current = true;
    }
  }, [isLoaded, map, markers, fitToMarkers]);

  // W215 — sync the breadcrumb polyline. One persistent Polyline whose path we
  // update in place (mirrors InteractiveMap's lifecycle). zIndex 1 keeps it under
  // the rider markers (markers always paint above shapes anyway). <2 points →
  // remove the line entirely (toggle off / new ride / not enough trail yet).
  useEffect(() => {
    if (!isLoaded || !map) return;
    const path = breadcrumb ?? [];
    if (path.length < 2) {
      if (breadcrumbRef.current) {
        breadcrumbRef.current.setMap(null);
        breadcrumbRef.current = null;
      }
      return;
    }
    if (breadcrumbRef.current) {
      breadcrumbRef.current.setPath(path);
    } else {
      breadcrumbRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: BREADCRUMB_COLOR,
        strokeOpacity: 0.9,
        strokeWeight: BREADCRUMB_WEIGHT,
        zIndex: 1,
        map,
      });
    }
  }, [isLoaded, map, breadcrumb]);

  // Tear the breadcrumb polyline off the map on unmount (navigating away from
  // Race Control). Kept SEPARATE from the sync effect above — an empty-deps
  // unmount-only effect — so the line isn't destroyed/recreated on every
  // breadcrumb update (which would flicker and defeat the in-place setPath).
  useEffect(() => {
    return () => {
      breadcrumbRef.current?.setMap(null);
      breadcrumbRef.current = null;
    };
  }, []);

  if (loaderError) {
    return (
      <div className={`${className} bg-surface-container-high flex flex-col items-center justify-center text-on-surface-variant font-label p-6 text-center`}>
        <span className="material-symbols-outlined text-3xl mb-2 text-error opacity-40">map</span>
        <p className="text-[10px] uppercase tracking-widest font-bold">Fleet Map Load Error</p>
        <p className="text-[9px] mt-2 max-w-[200px] leading-relaxed opacity-70">{loaderError}</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="w-full h-full" />
      {isLoaded ? (
        // Always visible once the map loads (discoverable), disabled when there's no
        // fleet to fit. Prominent: solid primary chip + icon, not a faint corner label.
        <button
          type="button"
          onClick={fitToMarkers}
          disabled={markers.length === 0}
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-primary text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-base">center_focus_strong</span>
          Fit all riders
        </button>
      ) : null}
    </div>
  );
};

export default FleetMap;
