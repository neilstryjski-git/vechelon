// W285 — I/O half of the R3-40 self-health overlay (Ledger A3 / slate 4; Pillar III R3-40 / R3-43
// / R3-48). Reads the engine signal store (lib/selfHealthSignals.ts, fed by useFleetPositions'
// startBgGeo callbacks) and the operator config cache (telemetry.ts), runs the PURE clocks
// (lib/selfHealth.ts) on a tick and on every signal, and owns the two side effects: the
// warning_fired counter (exactly once per episode) and the unlock-and-focus prompt.
//
// ADVISORY ONLY (R3-49): nothing here calls start/stop/nudge on the engine, gates join, or blocks
// recovery. Self-heal is SILENT — no counter, no message, the badge simply disappears.
//
// Null config = inert (iOS row empty by ruling; Android until W279's measured values are populated
// into rail3_operator_config). Never a tenant threshold in this path (item 22).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';

import { evaluateSelfHealth, nextEpisode, INITIAL_EPISODE } from '../lib/selfHealth';
import type { EpisodeState, SelfHealthPhase, SelfHealthReason, SelfHealthResult } from '../lib/selfHealth';
import { getSelfHealthSnapshot, subscribeSelfHealth } from '../lib/selfHealthSignals';
import { getCachedOperatorConfig } from '../lib/telemetry';
import { recordCounter } from '../lib/telemetry';
import { isEngineSessionActive } from '../lib/bgGeo';
import { logResumeSignal } from '../lib/lifecycle';
import { useResume } from './useResume';
import type { ResumeSource } from '../lib/resumeDetector';

// Re-derive without inbound data (a dead engine sends nothing — that is the point). Cheap: store
// read + arithmetic; React state only changes when the verdict does.
const SELF_HEALTH_TICK_MS = 5000;

// The ONE evaluation, synchronous, with no React state in its path: store + config cache + engine
// session flag + clock. The W287 heartbeat ride-end teardown calls stopBgGeo() directly (not via
// the engine effect cleanup), so a store that still holds engineStartedAtMs after the session ended
// must read as inert — isEngineSessionActive() is that gate.
export function evaluateSelfHealthNow(): SelfHealthResult {
  const snap = getSelfHealthSnapshot();
  const cfg = getCachedOperatorConfig();
  return evaluateSelfHealth({
    engineStartedAtMs: isEngineSessionActive() ? snap.engineStartedAtMs : null,
    lastFixAtMs: snap.lastFixAtMs,
    lastEngineSignalAtMs: snap.lastEngineSignalAtMs,
    engineMoving: snap.engineMoving,
    engineDied: snap.engineDied,
    nowMs: Date.now(),
    config: cfg ? { startup_ceiling_s: cfg.startup_ceiling_s, steady_state_threshold_s: cfg.steady_state_threshold_s } : null,
  });
}

// §5.1 collision input for the Battery Saver screen-lock watcher (advisoryPolicy): a module-level
// function, so RideMapScreen passes it without touching that effect's deps, and it is computed at
// the unlock edge itself (the Saver watcher reads it ~1.2 s BEFORE our debounced resume prompt).
export function isSelfHealthPromptActiveNow(): boolean {
  return evaluateSelfHealthNow().reaching === false;
}

// Placeholder copy — Voice & Tone pending (SD-013 / PDoD-06). Framed as a condition the rider can
// act on; never blames, never alarms past the fact.
function showSelfHealthPrompt(onClose: () => void): void {
  Alert.alert(
    "Your position isn't reaching the group",
    "Vechelon hasn't had a GPS fix for a while, so your Captain can't see where you are. Keep Vechelon " +
      'open and on screen for a moment so tracking can recover. If this keeps happening, check that ' +
      'Location is on and Battery Saver is off.',
    [
      { text: 'OK', style: 'cancel', onPress: onClose },
      {
        text: 'Open settings',
        onPress: () => {
          onClose();
          void Linking.openSettings();
        },
      },
    ],
    { cancelable: true, onDismiss: onClose },
  );
}

export function useSelfHealth(rideId: string | null): {
  notReaching: boolean;
  phase: SelfHealthPhase;
  reason: SelfHealthReason;
} {
  const [verdict, setVerdict] = useState<{ phase: SelfHealthPhase; reaching: boolean; reason: SelfHealthReason }>({
    phase: 'inert',
    reaching: true,
    reason: 'no_config',
  });
  const rideIdRef = useRef<string | null>(rideId);
  rideIdRef.current = rideId;
  const episodeRef = useRef<EpisodeState>(INITIAL_EPISODE);
  const promptOpenRef = useRef(false);

  // New ride = new episode history (the store itself is reset by the engine effect cleanup).
  useEffect(() => {
    episodeRef.current = INITIAL_EPISODE;
    promptOpenRef.current = false;
  }, [rideId]);

  useEffect(() => {
    if (!rideId) return;
    const evaluate = () => {
      const r = evaluateSelfHealthNow();
      const { state, fireWarning } = nextEpisode(episodeRef.current, r.reaching);
      episodeRef.current = state;
      if (fireWarning) {
        const snap = getSelfHealthSnapshot();
        // ids/durations/counts only — never a coordinate (Pillar II §2). `fixes_seen` is the F-7
        // observation W284 asked for (distinguishes "engine produced then stopped" from "never").
        recordCounter(rideId, 'warning_fired', {
          phase: r.phase,
          reason: r.reason,
          threshold_s: r.thresholdS,
          since_s: r.sinceS,
          fixes_seen: snap.fixesSinceStart,
        });
      }
      setVerdict((prev) =>
        prev.phase === r.phase && prev.reaching === r.reaching && prev.reason === r.reason
          ? prev
          : { phase: r.phase, reaching: r.reaching, reason: r.reason },
      );
    };
    evaluate();
    const t = setInterval(evaluate, SELF_HEALTH_TICK_MS);
    const unsub = subscribeSelfHealth(evaluate); // engine_died / first fix flip without waiting a tick
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [rideId]);

  // The unlock-and-focus prompt (slate 4): issued only while the condition PERSISTS and the rider
  // can act (app active) — re-issued on each unlock while it persists (a rider who dismissed once,
  // pocketed, and is still invisible must be told again: R3-48 "no unrepaired failure stays
  // silent"), never stacked while one is showing, never on repair. 'stale' is the channel-liveness
  // sweep, not a focus event, so it does not prompt. Evaluated AFTER the resume debounce — i.e.
  // after useFleetPositions' resume nudge has had its chance — so a self-heal inside that window is
  // silent by construction.
  const onResume = useCallback((source: ResumeSource) => {
    logResumeSignal(rideIdRef.current, source, 'self_health');
    if (source === 'stale') return;
    if (AppState.currentState !== 'active') return;
    if (promptOpenRef.current) return;
    if (!isSelfHealthPromptActiveNow()) return;
    promptOpenRef.current = true;
    showSelfHealthPrompt(() => {
      promptOpenRef.current = false;
    });
  }, []);
  useResume(rideId, onResume);

  return { notReaching: !verdict.reaching, phase: verdict.phase, reason: verdict.reason };
}
