import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// Dual-engine TRIAL toggle (debug builds only). Selects which background-location engine
// drives a ride so we can A/B them on the same device/walk:
//   'expo'  — expo-location: foreground watch (src:'fg') + FGS TaskManager task (src:'bg')
//   'tsbg'  — Transistorsoft Background Geolocation: unified source (src:'tsbg')
// BOTH paths carry the status-decoupling fix. Only the selected engine broadcasts (no
// double-send). Distinct sink tags let us compare cadence apples-to-apples. This is a
// validation construct — production ships ONE engine, not the toggle.
export type BgEngine = 'expo' | 'tsbg';

// EXPO_ONLY hard-locks the engine to 'expo' (used for the expo-only build that proved the
// free path can't track screen-off). Set FALSE here to validate the Transistorsoft engine
// ("positive positive") — TS native modules are linked again, so it's safe to select 'tsbg'.
export const EXPO_ONLY = false;

const KEY = 'rail3.bgEngine';
// Default 'tsbg' for the Transistorsoft validation build so a fresh install tests TS without
// needing the rider to toggle. The Home toggle is still available to A/B against expo.
let cached: BgEngine = 'tsbg';

export function getBgEngineSync(): BgEngine {
  return EXPO_ONLY ? 'expo' : cached;
}

export async function loadBgEngine(): Promise<BgEngine> {
  if (EXPO_ONLY) return 'expo';
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'expo' || v === 'tsbg') cached = v;
  } catch {
    // keep default
  }
  return cached;
}

export async function setBgEngine(e: BgEngine): Promise<void> {
  if (EXPO_ONLY) return;
  cached = e;
  try {
    await AsyncStorage.setItem(KEY, e);
  } catch {
    // best-effort
  }
}

// Hook for the debug toggle UI (Home screen).
export function useBgEngine(): [BgEngine, (e: BgEngine) => void] {
  const [engine, setEngine] = useState<BgEngine>(getBgEngineSync());
  useEffect(() => {
    void loadBgEngine().then(setEngine);
  }, []);
  const update = useCallback((e: BgEngine) => {
    if (EXPO_ONLY) return;
    setEngine(e);
    void setBgEngine(e);
  }, []);
  return [engine, update];
}
