import * as Updates from 'expo-updates';

// Manual OTA force-pull for the field test. expo-updates' automatic check is gated by
// fallbackToCacheTimeout and only runs on a TRUE cold start — it downloads in the background and
// applies on the NEXT launch, so a tester can't reliably know (or force) that they're on the
// latest JS. This checks, downloads, and RELOADS into the new bundle in a single tap.
//
// Ships via OTA itself (expo-updates is baked into the build), but its value is the manual escape
// hatch when the automatic path is being flaky — see D85 follow-up.

export type UpdateResult =
  | { status: 'updated' } //     new bundle fetched; the app is about to reload (code after won't run)
  | { status: 'current' } //     already on the newest bundle for this channel + runtime
  | { status: 'unavailable' } // updates disabled (dev build / native module absent)
  | { status: 'error'; message: string };

export async function checkAndApplyUpdate(): Promise<UpdateResult> {
  // In dev, or a build with updates disabled, Updates.isEnabled is false and checking would throw.
  if (!Updates.isEnabled) return { status: 'unavailable' };
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return { status: 'current' };
    await Updates.fetchUpdateAsync();
    // reloadAsync restarts the JS runtime into the just-fetched bundle. Nothing after it runs.
    await Updates.reloadAsync();
    return { status: 'updated' };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
