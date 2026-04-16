import React, { useEffect, useRef, useState } from 'react';
import { importLibrary } from '../lib/mapsLoader';
import { veloModernStyle } from '../lib/mapStyles';

interface Coordinate {
  lat: number;
  lng: number;
}

interface MarkerData {
  id: string;
  position: Coordinate;
  label?: string;
  draggable?: boolean;
  type?: 'start' | 'finish' | 'waypoint' | 'rider' | 'meetup';
  alert?: boolean;
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

function markerIcon(type: MarkerData['type'], alert: boolean, focused: boolean) {
  let color = 'blue';
  if (type === 'start') color = 'green';
  if (type === 'finish') color = 'red';
  if (type === 'meetup') color = 'green';
  if (type === 'rider') color = alert ? 'orange' : 'yellow';
  
  return {
    url: focused
      ? `${ICON_BASE}pink-dot.png` 
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
  // Keep a stable ref so the map click listener always calls the latest handler
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  useEffect(() => {
    const initMap = async () => {
      try {
        const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;
        await importLibrary('marker');
        
        if (mapRef.current && !map) {
          const newMap = new Map(mapRef.current, {
            center,
            zoom,
            styles: veloModernStyle,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            scaleControl: true,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
          });

          if (!readOnly) {
            newMap.addListener('click', (e: google.maps.MapMouseEvent) => {
              if (e.latLng && onMapClickRef.current) {
                onMapClickRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
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

  // Fit bounds to markers if no points are provided
  useEffect(() => {
    if (!isLoaded || !map || points.length > 0 || markers.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    markers.forEach(m => bounds.extend(m.position));
    map.fitBounds(bounds);
    
    // If only one marker, zoom out a bit after fitting
    if (markers.length === 1) {
      const listener = google.maps.event.addListener(map, 'idle', () => {
        map.setZoom(15);
        google.maps.event.removeListener(listener);
      });
    }
  }, [isLoaded, map, points.length, markers]);

  // Sync Markers + highlight focused + pulse alerts
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
        marker.setIcon(markerIcon(m.type, !!m.alert, focused));
        marker.setZIndex(focused || m.alert ? 10 : 1);
        marker.setAnimation(m.alert ? google.maps.Animation.BOUNCE : null);
      } else {
        marker = new google.maps.Marker({
          position:  m.position,
          map,
          title:     m.label,
          draggable: m.draggable && !readOnly,
          icon:      markerIcon(m.type, !!m.alert, focused),
          zIndex:    focused || m.alert ? 10 : 1,
          animation: m.alert ? google.maps.Animation.BOUNCE : null,
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
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
};

export default InteractiveMap;
