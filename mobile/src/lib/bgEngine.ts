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

const KEY = 'rail3.bgEngine';
// Default 'expo' so the first walk tests the FREE engine + the fix (answers "is the $399
// Transistorsoft engine even required?"); flip to 'tsbg' to compare.
let cached: BgEngine = 'expo';

export function getBgEngineSync(): BgEngine {
  return cached;
}

export async function loadBgEngine(): Promise<BgEngine> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'expo' || v === 'tsbg') cached = v;
  } catch {
    // keep default
  }
  return cached;
}

export async function setBgEngine(e: BgEngine): Promise<void> {
  cached = e;
  try {
    await AsyncStorage.setItem(KEY, e);
  } catch {
    // best-effort
  }
}

// Hook for the debug toggle UI (Home screen).
export function useBgEngine(): [BgEngine, (e: BgEngine) => void] {
  const [engine, setEngine] = useState<BgEngine>(cached);
  useEffect(() => {
    void loadBgEngine().then(setEngine);
  }, []);
  const update = useCallback((e: BgEngine) => {
    setEngine(e);
    void setBgEngine(e);
  }, []);
  return [engine, update];
}
