import React, { useEffect, useRef, useState } from 'react';
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
  className?: string;
}

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
const FleetMap: React.FC<FleetMapProps> = ({ markers, onMarkerClick, className = 'w-full h-full' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [loaderError, setLoaderError] = useState<string | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const hasFitRef = useRef(false);
  // Stable ref so the marker click listener always calls the latest handler.
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => { onMarkerClickRef.current = onMarkerClick; }, [onMarkerClick]);

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
    // camera belongs to the operator.
    if (!hasFitRef.current && markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend(m.position));
      map.fitBounds(bounds);
      if (markers.length === 1) {
        const listener = google.maps.event.addListener(map, 'idle', () => {
          map.setZoom(15);
          google.maps.event.removeListener(listener);
        });
      }
      hasFitRef.current = true;
    }
  }, [isLoaded, map, markers]);

  if (loaderError) {
    return (
      <div className={`${className} bg-surface-container-high flex flex-col items-center justify-center text-on-surface-variant font-label p-6 text-center`}>
        <span className="material-symbols-outlined text-3xl mb-2 text-error opacity-40">map</span>
        <p className="text-[10px] uppercase tracking-widest font-bold">Fleet Map Load Error</p>
        <p className="text-[9px] mt-2 max-w-[200px] leading-relaxed opacity-70">{loaderError}</p>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
};

export default FleetMap;
