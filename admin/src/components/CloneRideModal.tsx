import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { parsePoint, formatPoint } from '../lib/maps';
import { useToast } from '../store/useToast';
import { useAppStore } from '../store/useAppStore';
import { buildRideUrl } from '../lib/portalBase';
import { generateQRWithLogo } from '../lib/qr';

// ---------------------------------------------------------------------------
// CloneRideModal — duplicates an existing ride to a new date.
//
// Scope (locked with PM 2026-06-07):
//   • Always produces a SINGLE standalone ride (series_id = null), never a
//     series — series creation lives in RideFormModal's create flow.
//   • Roster is NOT copied — a new date means fresh RSVPs. ride_participants
//     are deliberately left untouched.
//   • Route AND meetup rides clone identically: every geometry/route/label
//     column travels with the copy; only identity (id, qr_code), lifecycle
//     (status → 'created', actual_*/auto_closed reset) and the date change.
// ---------------------------------------------------------------------------

interface CloneRideModalProps {
  isOpen:       boolean;
  sourceRideId: string | null;
  sourceName?:  string | null;
  onClose:      () => void;
  onCloned?:    (newRideId: string) => void;
}

/** Format a Date into the value a <input type="datetime-local"> expects. */
function toLocalInputValue(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Re-normalise a POINT (string '(lng,lat)' or {x,y}) into an insert-safe string. */
function normPoint(v: unknown): string | null {
  const p = parsePoint(v as Parameters<typeof parsePoint>[0]);
  return p ? formatPoint(p) : null;
}

const CloneRideModal: React.FC<CloneRideModalProps> = ({
  isOpen,
  sourceRideId,
  sourceName,
  onClose,
  onCloned,
}) => {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [scheduledStart, setScheduledStart] = useState('');

  // Seed the date field with source + 7 days whenever the modal opens — the
  // most common clone is "same ride, next week". Admin can adjust freely.
  useEffect(() => {
    if (!isOpen || !sourceRideId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('rides')
        .select('scheduled_start')
        .eq('id', sourceRideId)
        .maybeSingle();
      if (cancelled) return;
      const base = data?.scheduled_start ? new Date(data.scheduled_start) : new Date();
      base.setDate(base.getDate() + 7);
      setScheduledStart(toLocalInputValue(base));
    })();
    return () => { cancelled = true; };
  }, [isOpen, sourceRideId]);

  const cloneMutation = useMutation({
    mutationFn: async (newDate: string) => {
      if (!sourceRideId) throw new Error('No source ride to clone.');
      if (!newDate) throw new Error('Pick a date for the duplicated ride.');

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('Not authenticated. Please sign in again.');

      // Pull the full source row + its waypoints so unknown columns
      // (meetup_coords, thumbnail_url, external_url, group_id, …) travel too.
      const { data: source, error: srcErr } = await supabase
        .from('rides')
        .select('*, waypoints(*)')
        .eq('id', sourceRideId)
        .single();
      if (srcErr) throw srcErr;

      const newId     = crypto.randomUUID();
      const joinUrl   = buildRideUrl(newId, 'ridecard');
      const qrMarkUrl = useAppStore.getState().qrMarkUrl;
      const qrCode    = await generateQRWithLogo(joinUrl, qrMarkUrl);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { waypoints: sourceWaypoints, ...rideCols } = source as any;
      // Drop identity + lifecycle columns — the clone starts fresh.
      delete rideCols.id;
      delete rideCols.created_at;
      delete rideCols.actual_start;
      delete rideCols.actual_end;
      delete rideCols.auto_closed;

      const newRow = {
        ...rideCols,
        id:              newId,
        scheduled_start: new Date(newDate).toISOString(),
        status:          'created',
        series_id:       null,       // standalone — not glued to the source's series
        qr_code:         qrCode,
        created_by:      userId,     // the admin performing the clone owns the copy
        start_coords:    normPoint(rideCols.start_coords),
        finish_coords:   rideCols.finish_coords != null ? normPoint(rideCols.finish_coords) : null,
        meetup_coords:   rideCols.meetup_coords != null ? normPoint(rideCols.meetup_coords) : null,
      };

      const { error: insErr } = await supabase.from('rides').insert(newRow);
      if (insErr) throw insErr;

      // Geometry travels with the clone; roster (ride_participants) does NOT.
      if (Array.isArray(sourceWaypoints) && sourceWaypoints.length > 0) {
        const wpRows = [...sourceWaypoints]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((w: any, i: number) => ({
            ride_id:     newId,
            coords:      normPoint(w.coords),
            label:       w.label ?? null,
            order_index: w.order_index ?? i,
          }));
        const { error: wpErr } = await supabase.from('waypoints').insert(wpRows);
        if (wpErr) throw wpErr;
      }

      return newId;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-rides'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-rides'] });
      queryClient.invalidateQueries({ queryKey: ['rides'] });
      addToast('Ride duplicated — fresh RSVPs required on the new date.', 'success');
      onCloned?.(newId);
      onClose();
    },
    onError: (err: Error) => {
      addToast(`Clone failed: ${err.message}`, 'error');
    },
  });

  if (!isOpen) return null;

  const inputClass =
    'w-full bg-surface-container-lowest border border-outline-variant/30 rounded-md px-4 py-2.5 font-body text-sm text-on-background placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/70 backdrop-blur-md z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="signature-gradient h-1 w-full" />

          {/* Header */}
          <div className="px-6 py-5 border-b border-surface-container-low flex justify-between items-center">
            <div>
              <span className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant block mb-0.5">
                Duplicate Ride
              </span>
              <h2 className="font-headline font-bold text-lg text-on-background">
                {sourceName ? `Copy of ${sourceName}` : 'Copy this ride'}
              </h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-full transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant">close</span>
            </button>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); cloneMutation.mutate(scheduledStart); }}
            className="p-6 space-y-5"
          >
            <div className="border-l-2 border-primary pl-4 py-1">
              <label className="font-label text-[10px] uppercase tracking-widest text-primary block mb-1.5 font-bold">
                New Date &amp; Time <span className="text-error">*</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={e => setScheduledStart(e.target.value)}
                className={`${inputClass} border-primary/40 focus:border-primary`}
                required
              />
            </div>

            <p className="font-label text-[9px] text-on-surface-variant/60 leading-relaxed bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
              <span className="material-symbols-outlined text-[11px] align-middle mr-1">content_copy</span>
              Route, meetup location, labels and waypoints are copied. The roster
              starts empty — riders RSVP fresh for the new date. A new QR code is
              generated.
            </p>

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
                disabled={cloneMutation.isPending || !scheduledStart}
                className="flex-1 signature-gradient text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 shadow-ambient hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">
                  {cloneMutation.isPending ? 'sync' : 'content_copy'}
                </span>
                {cloneMutation.isPending ? 'Duplicating…' : 'Duplicate Ride'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CloneRideModal;
