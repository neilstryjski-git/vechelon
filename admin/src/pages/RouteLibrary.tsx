import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { parseGPXCoords } from '../lib/validation';
import { getStaticMapUrl, downloadGpx } from '../lib/maps';
import { useToast } from '../store/useToast';
import { useAppStore } from '../store/useAppStore';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteRow {
  id:              string;
  name:            string;
  file_path:       string;
  distance_km:     number | null;
  elevation_gain_m: number | null;
  external_url:    string | null;
  thumbnail_url:   string | null;
  file_hash:       string | null;
  created_at:      string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

async function calculateHash(text: string): Promise<string> {
  if (!window.crypto || !window.crypto.subtle) {
    console.warn('[Vechelon] Web Crypto API not available, using fallback hash');
    return Date.now().toString(16); // Fallback for unsafe contexts
  }
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useRoutes() {
  return useQuery<RouteRow[]>({
    queryKey: ['route-library'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('route_library')
        .select('id, name, file_path, distance_km, elevation_gain_m, external_url, thumbnail_url, file_hash, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useUploadRoute() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async ({ file, name, externalUrl, hash }: { file: File; name: string; externalUrl: string; hash: string }) => {
      const text    = await file.text();
      const parsed  = parseGPXCoords(text);
      if (!parsed) throw new Error('GPX file contains no track data');

      const finalName = name.trim() || 
                        parsed.name || 
                        file.name.replace(/\.gpx$/i, '').replace(/[_-]/g, ' ');

      const thumbnailUrl = parsed.points ? getStaticMapUrl(parsed.points) : null;

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || '00000000-0000-0000-0000-00000000000a';

      const tenantId = '00000000-0000-0000-0000-000000000001';
      const routeId  = crypto.randomUUID();
      const filePath = `${tenantId}/${routeId}.gpx`;

      const uploadPromise = supabase.storage
        .from('gpx-routes')
        .upload(filePath, file, { contentType: 'application/gpx+xml', upsert: false });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Storage upload timed out after 30s')), 30000)
      );

      const { error: uploadErr } = await Promise.race([
        uploadPromise,
        timeoutPromise
      ]) as any;
      
      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      const { error: insertErr } = await supabase
        .from('route_library')
        .insert({
          id:               routeId,
          tenant_id:        tenantId,
          name:             finalName,
          file_path:        filePath,
          distance_km:      parsed.distance_km,
          elevation_gain_m: parsed.elevation_gain,
          external_url:     externalUrl.trim() || null,
          thumbnail_url:    thumbnailUrl,
          file_hash:        hash,
          created_by:       userId,
        });

      if (insertErr) {
        await supabase.storage.from('gpx-routes').remove([filePath]);
        throw new Error(`Database insert failed: ${insertErr.message}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-library'] });
      addToast('Route uploaded successfully.', 'success');
    },
    onError: (err) => {
      addToast(`Upload failed: ${(err as Error).message}`, 'error');
    }
  });
}

function useDeleteRoute() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath: string }) => {
      const { error: dbErr } = await supabase
        .from('route_library')
        .delete()
        .eq('id', id);
      if (dbErr) throw dbErr;

      const { error: storageErr } = await supabase.storage
        .from('gpx-routes')
        .remove([filePath]);
      if (storageErr) console.warn('Storage deletion failed:', storageErr);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-library'] });
      addToast('Route deleted.', 'info');
    },
    onError: (err) => {
      addToast(`Delete failed: ${(err as Error).message}`, 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-ambient animate-pulse">
      <div className="h-4 w-48 rounded bg-surface-container-high mb-4" />
      <div className="flex gap-6">
        <div className="h-3 w-20 rounded bg-surface-container-high" />
        <div className="h-3 w-20 rounded bg-surface-container-high" />
      </div>
    </div>
  );
}

function RouteCard({ route, onDelete }: { route: RouteRow; onDelete: (r: RouteRow) => void }) {
  const isAdmin = useAppStore((state) => state.isAdmin);
  const date = new Date(route.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="bg-surface-container-lowest overflow-hidden rounded-xl shadow-ambient hover:bg-surface-container-low transition-colors flex flex-col group relative">
      
      {/* Delete button (Admin Only) */}
      {isAdmin && (
        <button 
          onClick={() => onDelete(route)}
          className="absolute top-2 right-2 z-10 p-2 bg-error/20 hover:bg-error text-error hover:text-on-error rounded-full transition-all duration-300 backdrop-blur-md border border-error/20"
          title="Delete Route"
        >
          <span className="material-symbols-outlined text-sm">delete</span>
        </button>
      )}

      {/* Thumbnail */}
      {route.thumbnail_url ? (
        <div className="h-40 w-full bg-surface-container-high overflow-hidden">
          <img 
            src={route.thumbnail_url} 
            alt={route.name} 
            className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-all duration-500"
          />
        </div>
      ) : (
        <div className="h-40 w-full bg-surface-container-high flex items-center justify-center">
          <span className="material-symbols-outlined text-on-surface-variant/30 text-4xl">
            map
          </span>
        </div>
      )}

      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h4 className="font-headline font-bold text-on-background line-clamp-1">{route.name}</h4>
          <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant shrink-0 ml-4">
            {date}
          </span>
        </div>
        <div className="flex gap-6 mb-6">
          {route.distance_km != null && (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-base">
                straighten
              </span>
              <span className="font-label text-xs text-on-surface-variant">
                {route.distance_km.toFixed(1)} km
              </span>
            </div>
          )}
          {route.elevation_gain_m != null && (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-base">
                landscape
              </span>
              <span className="font-label text-xs text-on-surface-variant">
                {route.elevation_gain_m} m gain
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {(route.external_url || route.file_path) && (
          <div className="pt-4 border-t border-outline-variant/30 flex items-center gap-4">
            {route.external_url && (
              <a
                href={route.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">open_in_new</span>
                View on Garmin / Strava
              </a>
            )}
            {route.file_path && (
              <button
                onClick={() => downloadGpx(route.file_path, route.name)}
                className="inline-flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-background transition-colors"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Download GPX
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadForm({ onUpload }: { onUpload: (file: File, name: string, externalUrl: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName]               = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [fileErr, setFileErr]         = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileErr(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.gpx')) {
      setFileErr('Only .gpx files are accepted');
      e.target.value = '';
      return;
    }

    try {
      const text = await f.text();
      const parsed = parseGPXCoords(text);
      if (parsed?.name && !name) {
        setName(parsed.name);
      }
    } catch (err) {
      console.error('Error reading GPX for preview:', err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return; 
    onUpload(file, name.trim(), externalUrl.trim());
    setName('');
    setExternalUrl('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container-low p-6 rounded-xl space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
            Route Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Valley Loop"
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-md px-4 py-2.5 font-body text-sm text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
            External Activity URL
          </label>
          <input
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://connect.garmin.com/..."
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-md px-4 py-2.5 font-body text-sm text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant block mb-2">
            .GPX file
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx"
            onChange={handleFile}
            required
            className="w-full font-label text-xs text-on-surface-variant file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-label file:text-xs file:bg-surface-container-high file:text-on-surface-variant hover:file:bg-surface-container-highest cursor-pointer"
          />
          {fileErr && (
            <p className="mt-1 font-label text-[10px] text-error">{fileErr}</p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          className="signature-gradient text-on-primary px-8 py-2.5 rounded-md font-label text-xs font-medium hover:opacity-90 transition-all active:scale-95 shrink-0"
        >
          Upload Route
        </button>
      </div>
    </form>
  );
}

const RouteLibrary: React.FC = () => {
  const { data: routes = [], isLoading }               = useRoutes();
  const { mutate: upload, isPending }                  = useUploadRoute();
  const { mutate: deleteRoute }                        = useDeleteRoute();
  const isAdmin = useAppStore((state) => state.isAdmin);

  const [search, setSearch]           = useState('');

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    type?: 'danger' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const handleUpload = async (file: File, name: string, externalUrl: string) => {
    const text = await file.text();
    const hash = await calculateHash(text);

    // Check for duplicate
    const existingRoute = routes.find(r => r.file_hash === hash);

    const performUpload = () => {
      upload({ file, name, externalUrl, hash }, {
        onSuccess: () => {
          closeModal();
        },
        onError: () => {
          closeModal();
        },
      });
    };

    if (existingRoute) {
      setModalConfig({
        isOpen: true,
        title: 'Duplicate Route Detected',
        message: `This exact GPX file already exists in your library as "${existingRoute.name}". Are you sure you want to upload it again?`,
        confirmLabel: 'Upload Anyway',
        type: 'info',
        onConfirm: performUpload
      });
    } else {
      performUpload();
    }
  };

  const handleDelete = (route: RouteRow) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete Route',
      message: `Are you sure you want to permanently delete "${route.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      type: 'danger',
      onConfirm: () => {
        deleteRoute({ id: route.id, filePath: route.file_path }, {
          onSuccess: closeModal,
          onError: () => {
            closeModal();
          },
        });
      }
    });
  };

  const filteredRoutes = routes.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-10">
      
      <Modal 
        isOpen={modalConfig.isOpen}
        onClose={closeModal}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmLabel={modalConfig.confirmLabel}
        type={modalConfig.type}
      />

      <PageHeader 
        label="Route Management"
        title="Route Library"
        italicTitle={false}
        description="Curate the club's official route collection. Upload GPX files to extract coordinates, distance, and elevation automatically."
      />

      {/* Upload (Admin Only) */}
      {isAdmin && (
        <div>
          <h2 className="font-headline font-bold text-on-background mb-4">Add New Route</h2>
          <UploadForm onUpload={handleUpload} />
          {isPending && (
            <p className="mt-3 font-label text-xs text-on-surface-variant animate-pulse">
              Parsing and uploading route…
            </p>
          )}
        </div>
      )}

      {/* Route list */}
      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-surface-container-low pb-6">
          <h2 className="font-headline font-bold text-2xl text-on-background">
            Club Routes
            {!isLoading && (
              <span className="ml-3 font-label text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full align-middle">
                {filteredRoutes.length}
              </span>
            )}
          </h2>

          <div className="relative w-full md:w-72">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-xl">
              search
            </span>
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter routes by name..."
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg pl-10 pr-4 py-2 font-body text-sm text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 transition-all"
            />
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!isLoading && filteredRoutes.length === 0 && (
          <div className="py-20 text-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/30">
            <span className="material-symbols-outlined text-on-surface-variant/20 text-5xl mb-4">
              {search ? 'search_off' : 'route'}
            </span>
            <p className="font-label text-sm text-on-surface-variant">
              {search 
                ? `No routes matching "${search}"`
                : '— No routes yet. Upload the first one above. —'}
            </p>
          </div>
        )}

        {!isLoading && filteredRoutes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRoutes.map((r) => <RouteCard key={r.id} route={r} onDelete={handleDelete} />)}
          </div>
        )}
      </div>

    </div>
  );
};

export default RouteLibrary;
