import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { parseGPXCoords } from '../lib/validation';

// ---------------------------------------------------------------------------
// BDD Scenarios (living documentation)
// ---------------------------------------------------------------------------
//
// Feature: Route Library Curation
//
//   Background:
//     Given I am authenticated as a tenant admin
//
//   Scenario: Uploading a valid GPX file
//     When I select a .gpx file and click Upload
//     Then the file is stored in the gpx-routes bucket at {tenantId}/{routeId}.gpx
//     And a route_library row is created with name, distance_km, elevation_gain_m
//     And the new route appears at the top of the list
//
//   Scenario: Rejecting a non-GPX file
//     When I select a .pdf file
//     Then I see "Only .gpx files are accepted"
//     And no upload is attempted
//
//   Scenario: Rejecting a malformed GPX file
//     When I upload a GPX with no track points
//     Then I see "GPX file contains no track data"
//     And no route_library row is created
//
//   Scenario: Viewing the route list
//     Given 3 routes exist in route_library
//     When I load the Route Library
//     Then I see 3 route cards with name, distance, and elevation
//
//   Scenario: Loading state
//     When the route list is fetching
//     Then I see skeleton placeholder cards

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteRow {
  id:              string;
  name:            string;
  file_path:       string;
  distance_km:     number | null;
  elevation_gain_m: number | null;
  created_at:      string;
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
        .select('id, name, file_path, distance_km, elevation_gain_m, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useUploadRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, name }: { file: File; name: string }) => {
      // 1. Parse GPX
      const text    = await file.text();
      const parsed  = parseGPXCoords(text);
      if (!parsed) throw new Error('GPX file contains no track data');

      // DERIVE NAME: Use user entry, OR GPX internal name, OR filename (cleaned)
      const finalName = name.trim() || 
                        parsed.name || 
                        file.name.replace(/\.gpx$/i, '').replace(/[_-]/g, ' ');

      // 2. Get tenant context (Mock bypass for prototyping)
      let { data: { user } } = await supabase.auth.getUser();
      
      // PROTOTYPE BYPASS: If not logged in, use the mock admin from seed.sql
      const userId = user?.id || '00000000-0000-0000-0000-00000000000a';

      const { data: tenantRow, error: tenantErr } = await supabase
        .from('account_tenants')
        .select('tenant_id')
        .eq('account_id', userId)
        .limit(1)
        .maybeSingle();

      if (tenantErr || !tenantRow) throw new Error('Could not resolve tenant for upload');

      const tenantId = tenantRow.tenant_id;
      const routeId  = crypto.randomUUID();
      const filePath = `${tenantId}/${routeId}.gpx`;

      // 3. Upload to Storage
      const { error: uploadErr } = await supabase.storage
        .from('gpx-routes')
        .upload(filePath, file, { contentType: 'application/gpx+xml', upsert: false });
      if (uploadErr) throw uploadErr;

      // 4. Insert route_library row
      const { error: insertErr } = await supabase
        .from('route_library')
        .insert({
          id:               routeId,
          tenant_id:        tenantId,
          name:             finalName,
          file_path:        filePath,
          distance_km:      parsed.distance_km,
          elevation_gain_m: parsed.elevation_gain,
          created_by:       userId,
        });

      if (insertErr) {
        // Roll back storage upload if DB insert fails
        await supabase.storage.from('gpx-routes').remove([filePath]);
        throw insertErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-library'] });
    },
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

function RouteCard({ route }: { route: RouteRow }) {
  const date = new Date(route.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-ambient hover:bg-surface-container-low transition-colors">
      <div className="flex justify-between items-start mb-4">
        <h4 className="font-headline font-bold text-on-background">{route.name}</h4>
        <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
          {date}
        </span>
      </div>
      <div className="flex gap-6">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload form
// ---------------------------------------------------------------------------

function UploadForm({ onUpload }: { onUpload: (file: File, name: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName]       = useState('');
  const [fileErr, setFileErr] = useState<string | null>(null);

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
    if (!file) return; // Only require the file; name is now optional
    onUpload(file, name.trim());
    setName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container-low p-6 rounded-xl flex flex-col md:flex-row gap-4 items-end"
    >
      <div className="flex-1">
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
      <div className="flex-1">
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
      <button
        type="submit"
        className="signature-gradient text-on-primary px-6 py-2.5 rounded-md font-label text-xs font-medium hover:opacity-90 transition-all active:scale-95 shrink-0"
      >
        Upload Route
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const RouteLibrary: React.FC = () => {
  const { data: routes = [], isLoading }               = useRoutes();
  const { mutate: upload, isPending } = useUploadRoute();

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleUpload = (file: File, name: string) => {
    setUploadError(null);
    setUploadSuccess(false);
    upload({ file, name }, {
      onSuccess: () => {
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
      },
      onError: (err) => setUploadError((err as Error).message),
    });
  };

  return (
    <div className="space-y-10">

      {/* Editorial Header */}
      <section>
        <span className="font-label text-xs uppercase tracking-widest text-primary mb-4 block">
          Route Management
        </span>
        <h1 className="font-headline text-5xl font-extrabold tracking-tight text-on-background mb-4">
          Route Library
        </h1>
        <p className="text-on-surface-variant text-lg leading-relaxed max-w-2xl">
          Curate the club's official route collection. Upload GPX files to extract
          coordinates, distance, and elevation automatically.
        </p>
      </section>

      {/* Upload */}
      <div>
        <h2 className="font-headline font-bold text-on-background mb-4">Add New Route</h2>
        <UploadForm onUpload={handleUpload} />
        {isPending && (
          <p className="mt-3 font-label text-xs text-on-surface-variant animate-pulse">
            Parsing and uploading route…
          </p>
        )}
        {uploadSuccess && (
          <p className="mt-3 font-label text-xs text-brand-primary">
            ✓ Route uploaded successfully.
          </p>
        )}
        {uploadError && (
          <p className="mt-3 font-label text-xs text-error">{uploadError}</p>
        )}
      </div>

      {/* Route list */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-headline font-bold text-on-background">
            Club Routes
            {!isLoading && (
              <span className="ml-3 font-label text-[10px] bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full align-middle">
                {routes.length}
              </span>
            )}
          </h2>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!isLoading && routes.length === 0 && (
          <div className="py-20 text-center">
            <p className="font-label text-sm text-on-surface-variant">
              — No routes yet. Upload the first one above. —
            </p>
          </div>
        )}

        {!isLoading && routes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {routes.map((r) => <RouteCard key={r.id} route={r} />)}
          </div>
        )}
      </div>

    </div>
  );
};

export default RouteLibrary;
