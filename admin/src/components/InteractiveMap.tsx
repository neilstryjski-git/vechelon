import React, { useEffect, useRef, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

interface Coordinate {
  lat: number;
  lng: number;
}

interface MarkerData {
  id: string;
  position: Coordinate;
  label?: string;
  draggable?: boolean;
  type?: 'start' | 'finish' | 'waypoint' | 'rider';
}

interface InteractiveMapProps {
  center?: Coordinate;
  zoom?: number;
  points?: Coordinate[];
  markers?: MarkerData[];
  focusedMarkerId?: string;
  onMarkerDragEnd?: (id: string, newPos: Coordinate) => void;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (pos: Coordinate) => void;
  className?: string;
  readOnly?: boolean;
  pathColor?: string;
}

const ICON_BASE = 'https://maps.google.com/mapfiles/ms/icons/';

function markerIcon(type: MarkerData['type'], focused: boolean) {
  const color = type === 'start' ? 'green' : type === 'finish' ? 'red' : 'blue';
  return {
    url: focused
      ? `${ICON_BASE}yellow-dot.png`
      : `${ICON_BASE}${color}-dot.png`,
    scaledSize: new google.maps.Size(focused ? 44 : 32, focused ? 44 : 32),
  };
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  center = { lat: 43.6532, lng: -79.3832 },
  zoom = 12,
  points = [],
  markers = [],
  focusedMarkerId,
  onMarkerDragEnd,
  onMarkerClick,
  onMapClick,
  className = "w-full h-full",
  readOnly = false,
  pathColor = "#006e35",
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [loaderError, setLoaderError] = useState<string | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    console.log('[Vechelon] Map API Key detected:', apiKey ? 'YES (starts with ' + apiKey.substring(0, 4) + ')' : 'NO');
    
    if (!apiKey) {
      setLoaderError("Google Maps API Key Missing");
      return;
    }

    setOptions({
      key: apiKey,
      version: "weekly"
    } as any);

    const initMap = async () => {
      try {
        console.log('[Vechelon] Importing Google Maps library...');
        const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
        console.log('[Vechelon] Maps library imported successfully.');
        // Marker library is often needed for newer features
        await importLibrary('marker');
        
        if (mapRef.current && !map) {
          const newMap = new Map(mapRef.current, {
            center,
            zoom,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            scaleControl: true,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
          });

          if (onMapClick && !readOnly) {
            newMap.addListener('click', (e: google.maps.MapMouseEvent) => {
              if (e.latLng) {
                onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
              }
            });
          }

          setMap(newMap);
          setIsLoaded(true);
        }
      } catch (e: any) {
        console.error("Google Maps Load Error:", e);
        setLoaderError(`Load Error: ${e.message}`);
      }
    };

    initMap();
  }, []);

  // Sync Points (Path)
  useEffect(() => {
    if (!isLoaded || !map || points.length === 0) return;

    const polyline = new google.maps.Polyline({
      path: points,
      geodesic: true,
      strokeColor: pathColor,
      strokeOpacity: 0.8,
      strokeWeight: 4,
    });

    polyline.setMap(map);

    const bounds = new google.maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);

    return () => polyline.setMap(null);
  }, [isLoaded, map, points, pathColor]);

  // Sync Markers + highlight focused
  useEffect(() => {
    if (!isLoaded || !map) return;

    // Remove stale markers
    Object.keys(markersRef.current).forEach(id => {
      if (!markers.find(m => m.id === id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
      }
    });

    markers.forEach(m => {
      const focused = m.id === focusedMarkerId;
      let marker = markersRef.current[m.id];

      if (marker) {
        marker.setPosition(m.position);
        marker.setIcon(markerIcon(m.type, focused));
        marker.setZIndex(focused ? 10 : 1);
      } else {
        marker = new google.maps.Marker({
          position:  m.position,
          map,
          title:     m.label,
          draggable: m.draggable && !readOnly,
          icon:      markerIcon(m.type, focused),
          zIndex:    focused ? 10 : 1,
        });

        marker.addListener('click', () => {
          if (onMarkerClick) onMarkerClick(m.id);
        });

        if (onMarkerDragEnd && !readOnly) {
          marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) {
              onMarkerDragEnd(m.id, { lat: e.latLng.lat(), lng: e.latLng.lng() });
            }
          });
        }

        markersRef.current[m.id] = marker;
      }
    });
  }, [isLoaded, map, markers, readOnly, focusedMarkerId]);

  // Pan to focused marker when selection changes
  useEffect(() => {
    if (!isLoaded || !map || !focusedMarkerId) return;
    const marker = markersRef.current[focusedMarkerId];
    if (marker) {
      const pos = marker.getPosition();
      if (pos) map.panTo(pos);
    }
  }, [isLoaded, map, focusedMarkerId]);

  if (loaderError) {
    return (
      <div className={`${className} bg-surface-container-high flex flex-col items-center justify-center text-on-surface-variant font-label p-6 text-center`}>
        <span className="material-symbols-outlined text-3xl mb-2 text-error opacity-40">map</span>
        <p className="text-[10px] uppercase tracking-widest font-bold">Interactive Map Load Error</p>
        <p className="text-[9px] mt-2 max-w-[200px] leading-relaxed opacity-70">
          {loaderError}
        </p>
        <p className="text-[8px] mt-2 opacity-50 uppercase tracking-tighter">
          Check API Key Restrictions and enabled Services
        </p>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
};

export default InteractiveMap;
