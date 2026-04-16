import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { fetchGpxPoints, formatPoint, parsePoint } from '../lib/maps';
import { useToast } from '../store/useToast';
import InteractiveMap from '../components/InteractiveMap';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  type: 'waypoint' | 'start' | 'finish' | 'meetup';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RideBuilder: React.FC = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [routePoints, setRoutePoints] = useState<{lat: number, lng: number}[]>([]);
  const [markers, setMarkers] = useState<Waypoint[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 1. Fetch Ride Data
  const { data: ride, isLoading } = useQuery({
    queryKey: ['ride-builder', rideId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rides')
        .select('*, waypoints(*)')
        .eq('id', rideId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!rideId,
  });

  // 2. Fetch Route Name from library
  const { data: routeRow } = useQuery({
    queryKey: ['route-for-ride', ride?.gpx_path],
    queryFn: async () => {
      const { data } = await supabase
        .from('route_library')
        .select('name, distance_km, elevation_gain_m')
        .eq('file_path', ride!.gpx_path)
        .maybeSingle();
      return data;
    },
    enabled: !!ride?.gpx_path,
  });

  // 3. Load GPX and Initialize Markers
  useEffect(() => {
    if (ride) {
      if (ride.gpx_path) {
        fetchGpxPoints(ride.gpx_path).then(setRoutePoints).catch(e => {
          addToast(`Failed to load route path: ${e.message}`, 'error');
        });
      }

      const initialMarkers: Waypoint[] = [];
      
      const start = parsePoint(ride.start_coords);
      if (start) initialMarkers.push({ 
        id: 'start', 
        ...start, 
        label: ride.start_label || 'Start', 
        type: 'start' 
      });

      const finish = parsePoint(ride.finish_coords);
      if (finish) initialMarkers.push({
        id: 'finish',
        ...finish,
        label: ride.finish_label || 'Finish',
        type: 'finish'
      });

      // Meetup marker — falls back to start if not separately set
      const meetup = parsePoint(ride.meetup_coords ?? ride.start_coords);
      if (meetup) initialMarkers.push({
        id: 'meetup',
        ...meetup,
        label: ride.meetup_label || 'Meetup',
        type: 'meetup',
      });

      ride.waypoints?.forEach((w: any) => {
        const p = parsePoint(w.coords);
        if (p) initialMarkers.push({ id: w.id, ...p, label: w.label || 'Waypoint', type: 'waypoint' });
      });

      setMarkers(initialMarkers);
    }
  }, [ride]);

  // 3. Handlers
  const handleMarkerDrag = (id: string, newPos: {lat: number, lng: number}) => {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, ...newPos } : m));
  };

  const handleMapClick = (pos: {lat: number, lng: number}) => {
    const newWaypoint: Waypoint = {
      id: crypto.randomUUID(),
      ...pos,
      label: `Waypoint ${markers.filter(m => m.type === 'waypoint').length + 1}`,
      type: 'waypoint'
    };
    setMarkers(prev => [...prev, newWaypoint]);
    setSelectedMarkerId(newWaypoint.id);
    addToast('Waypoint added. Drag to adjust.', 'info');
  };

  const updateWaypointLabel = (id: string, label: string) => {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, label } : m));
  };

  const deleteWaypoint = (id: string) => {
    if (id === 'start' || id === 'finish') return;
    setMarkers(prev => prev.filter(m => m.id !== id));
    setSelectedMarkerId(null);
    addToast('Waypoint removed.', 'info');
  };

  // 4. Helpers
  const formatScheduled = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  // 5. Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const start    = markers.find(m => m.type === 'start');
      const finish   = markers.find(m => m.type === 'finish');
      const meetup   = markers.find(m => m.type === 'meetup');
      const waypoints = markers.filter(m => m.type === 'waypoint');

      // Update Ride
      const { error: rideError } = await supabase
        .from('rides')
        .update({
          start_coords:  start  ? formatPoint(start)  : null,
          start_label:   start?.label  || null,
          finish_coords: finish ? formatPoint(finish) : null,
          finish_label:  finish?.label || null,
          meetup_coords: meetup ? formatPoint(meetup) : (start ? formatPoint(start) : null),
          meetup_label:  meetup?.label || start?.label || null,
        })
        .eq('id', rideId);
      if (rideError) throw rideError;

      // Sync Waypoints (Nuclear approach for MVP: Delete all and re-insert)
      const { error: delError } = await supabase
        .from('waypoints')
        .delete()
        .eq('ride_id', rideId);
      if (delError) throw delError;

      if (waypoints.length > 0) {
        const { error: insError } = await supabase
          .from('waypoints')
          .insert(waypoints.map((w, i) => ({
            ride_id: rideId,
            coords: formatPoint(w),
            label: w.label,
            order_index: i
          })));
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ride-builder', rideId] });
      addToast('Ride geometry saved successfully.', 'success');
      navigate('/calendar');
    },
    onError: (e: Error) => {
      addToast(`Failed to save geometry: ${e.message}`, 'error');
    }
  });

  const handleDelete = async () => {
    const { error } = await supabase.from('rides').delete().eq('id', rideId);
    if (error) { addToast(`Delete failed: ${error.message}`, 'error'); return; }
    addToast('Ride deleted.', 'success');
    queryClient.invalidateQueries({ queryKey: ['rides'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-rides'] });
    navigate('/');
  };

  if (isLoading) return <div className="p-12 animate-pulse text-center font-label uppercase">Initializing Tactical Builder...</div>;

  const selectedMarker = markers.find(m => m.id === selectedMarkerId);

  return (
    <>
    <Modal
      isOpen={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      onConfirm={handleDelete}
      title="Delete Ride"
      message={`Are you sure you want to delete "${ride?.name}"? This cannot be undone.`}
      confirmLabel="Delete"
      type="danger"
    />
    <div className="h-[calc(100vh-120px)] flex flex-col space-y-6">
      <PageHeader
        label="Ride Customization"
        title={`Builder: ${ride?.name}`}
      >
        <div className="flex gap-3">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 rounded-md border border-error/30 text-error font-label text-[10px] uppercase tracking-widest hover:bg-error/10 transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            Delete
          </button>
          <button
            onClick={() => navigate('/calendar')}
            className="px-4 py-2 rounded-md border border-outline-variant/30 font-label text-[10px] uppercase tracking-widest hover:bg-surface-container-low transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="signature-gradient text-on-primary px-6 py-2 rounded-md font-headline font-bold flex items-center gap-2 shadow-ambient disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-lg">
              {saveMutation.isPending ? 'sync' : 'save'}
            </span>
            {saveMutation.isPending ? 'Saving...' : 'Save Ride'}
          </button>
        </div>
      </PageHeader>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Map Area */}
        <div className="flex-1 bg-surface-container-low rounded-2xl overflow-hidden border border-outline-variant/10 shadow-ambient relative">
          <InteractiveMap
            points={routePoints}
            markers={markers.map(m => ({
              id: m.id,
              position: { lat: m.lat, lng: m.lng },
              label: m.label,
              type: m.type,
              draggable: true
            }))}
            focusedMarkerId={selectedMarkerId ?? undefined}
            onMarkerDragEnd={handleMarkerDrag}
            onMarkerClick={(id) => setSelectedMarkerId(id)}
            onMapClick={handleMapClick}
          />
          
          <div className="absolute bottom-6 left-6 glass p-4 rounded-xl shadow-ambient border border-outline-variant/10 max-w-xs">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 font-bold">Tactical Instructions</p>
            <ul className="space-y-1.5 font-body text-xs text-on-surface-variant/80">
              <li className="flex gap-2"><span className="text-tertiary">●</span> Drag markers to adjust positions.</li>
              <li className="flex gap-2"><span className="text-primary">●</span> Click map to add a new Waypoint.</li>
              <li className="flex gap-2"><span className="text-secondary">●</span> Select a waypoint to edit its label.</li>
            </ul>
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="w-80 space-y-6 overflow-y-auto pr-2">

          {/* Ride Details */}
          <section className="space-y-3">
            <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-surface-container-low pb-2">
              Ride Details
            </h3>
            <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
              <div>
                <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-0.5">Scheduled</p>
                <p className="font-body text-sm text-on-background font-medium">{formatScheduled(ride?.scheduled_start ?? null)}</p>
              </div>
              <div>
                <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-0.5">Status</p>
                <span className={`inline-block font-label text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  ride?.status === 'active' ? 'bg-tertiary/20 text-tertiary' :
                  ride?.status === 'alert'  ? 'bg-error/20 text-error' :
                  'bg-primary/10 text-primary'
                }`}>
                  {ride?.status ?? '—'}
                </span>
              </div>
              {ride?.external_url && (
                <div>
                  <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-0.5">External URL</p>
                  <a
                    href={ride.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-xs text-primary hover:underline break-all"
                  >
                    {ride.external_url}
                  </a>
                </div>
              )}
              {routeRow && (
                <div>
                  <p className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant mb-0.5">Route</p>
                  <p className="font-body text-sm text-on-background font-medium">{routeRow.name}</p>
                  {(routeRow.distance_km != null || routeRow.elevation_gain_m != null) && (
                    <p className="font-label text-[9px] text-on-surface-variant/60 mt-0.5">
                      {routeRow.distance_km != null ? `${routeRow.distance_km.toFixed(1)} km` : ''}
                      {routeRow.distance_km != null && routeRow.elevation_gain_m != null ? ' · ' : ''}
                      {routeRow.elevation_gain_m != null ? `↑${routeRow.elevation_gain_m} m` : ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-surface-container-low pb-2">
              Geometry Elements
            </h3>
            
            <div className="space-y-2">
              {markers.map(m => (
                <div 
                  key={m.id}
                  onClick={() => setSelectedMarkerId(m.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    selectedMarkerId === m.id 
                      ? 'bg-surface-container-highest border-brand-primary/50 shadow-ambient' 
                      : 'bg-surface-container-lowest border-outline-variant/10 hover:border-outline-variant/30'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        m.type === 'start' ? 'bg-tertiary' : m.type === 'finish' ? 'bg-error' : 'bg-primary'
                      }`} />
                      <span className="font-label text-[10px] uppercase tracking-widest font-bold">
                        {m.type}
                      </span>
                    </div>
                    {m.type === 'waypoint' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteWaypoint(m.id); }}
                        className="material-symbols-outlined text-sm text-on-surface-variant/40 hover:text-error transition-colors"
                      >
                        delete
                      </button>
                    )}
                  </div>
                  <p className="font-body text-sm font-medium text-on-background mt-1">{m.label}</p>
                </div>
              ))}
            </div>
          </section>

          {selectedMarker && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold border-b border-surface-container-low pb-2">
                Edit Element
              </h3>
              <div className="bg-surface-container-low p-4 rounded-xl space-y-4">
                <div>
                  <label className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1"> Label</label>
                  <input 
                    type="text" 
                    value={selectedMarker.label}
                    onChange={(e) => updateWaypointLabel(selectedMarker.id, e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/20 rounded-md p-2 font-body text-sm outline-none focus:border-brand-primary transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1">Latitude</label>
                    <div className="bg-surface-container-lowest p-2 rounded-md font-label text-[10px] text-on-surface-variant/60 tabular-nums">
                      {selectedMarker.lat.toFixed(6)}
                    </div>
                  </div>
                  <div>
                    <label className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1">Longitude</label>
                    <div className="bg-surface-container-lowest p-2 rounded-md font-label text-[10px] text-on-surface-variant/60 tabular-nums">
                      {selectedMarker.lng.toFixed(6)}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
    </>
  );
};

export default RideBuilder;
