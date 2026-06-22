import { useEffect, useRef } from 'react';

// Minimal structural types for the Screen Wake Lock API so we don't depend on the
// TS lib.dom version shipping WakeLock/WakeLockSentinel.
interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', cb: () => void) => void;
}
interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

// Hold a SCREEN wake lock while a live console page is mounted, so the operator's
// display doesn't auto-sleep — which would freeze the realtime websocket and
// truncate the live fleet + breadcrumb (W215 field finding: a slept PC stopped
// receiving the captain's pings, so the trail only partially rendered).
//
// Best-effort by design: unsupported browsers and a denied request are silent
// no-ops, and the OS still drops the lock on a MANUAL lock (Win+L / lid close) —
// that case leaves a gap because the breadcrumb does not backfill (Pillar II §2).
// The browser auto-releases the lock when the tab is hidden, so we re-acquire on
// refocus via visibilitychange.
export function useScreenWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const wakeLock = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return; // unsupported — no-op

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        // The browser releases the lock when the tab hides; clear our ref so the
        // visibility handler re-acquires it on refocus.
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null;
        });
      } catch {
        // Denied (low battery, permission, etc.) — best-effort, ignore.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [enabled]);
}
