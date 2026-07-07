import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Which JS bundle is this device actually running? On-screen (HomeScreen) so a tester can
// confirm OTA-vs-baked at a glance instead of riding + querying the sink. Ships via OTA (the
// expo-updates native module is already baked into the build), so no new build is needed.

const asStr = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

// Read the expo-updates constants defensively: they're safe in dev (updates disabled →
// isEmbeddedLaunch=true, updateId=null), but wrap in case the native module is ever absent.
function readUpdates() {
  try {
    return {
      updateId: Updates.updateId ?? null,
      isEmbedded: Updates.isEmbeddedLaunch ?? null,
      channel: Updates.channel ?? null,
    };
  } catch {
    return { updateId: null as string | null, isEmbedded: null as boolean | null, channel: null as string | null };
  }
}
const u = readUpdates();

// Short git commit of the RUNNING bundle. EXPO_PUBLIC_GIT_COMMIT is inlined at bundle time,
// and crucially it's set on `eas update` export too (unlike the EAS_BUILD_* vars, which are
// build-only and come through empty over OTA — the "{}" we saw in the sink), so an OTA bundle
// carries its real commit. Falls back to the native build's baked extra.gitCommit, else null.
const GIT_COMMIT =
  asStr(process.env.EXPO_PUBLIC_GIT_COMMIT) ?? asStr(Constants.expoConfig?.extra?.gitCommit);

export const VERSION_INFO = {
  appVersion: asStr(Constants.expoConfig?.version),
  gitCommit: GIT_COMMIT,
  // Native SHELL identity (baked at build time). Over OTA these describe the underlying
  // build, not the running JS — the running bundle is updateId/isEmbedded. Coerced so an
  // absent value logs null, never the "{}" that made these useless in the sink.
  buildId: asStr(Constants.expoConfig?.extra?.buildId),
  buildProfile: asStr(Constants.expoConfig?.extra?.buildProfile),
  updateId: u.updateId,
  isEmbedded: u.isEmbedded,
  channel: u.channel,
} as const;

// Compact one-line label, e.g. "v0.1.0 · OTA 6a1980c · validate" or "v0.1.0 · embedded 2657d09".
// OTA-vs-embedded is the distinction that's been costing device-management time; the commit
// makes it human rather than an opaque update UUID.
export function versionLabel(): string {
  const v = VERSION_INFO.appVersion ? `v${VERSION_INFO.appVersion}` : 'v?';
  // A non-null updateId means we're running an OTA update; null ⇒ the embedded/baked bundle.
  const src = VERSION_INFO.updateId ? 'OTA' : 'embedded';
  const id = VERSION_INFO.gitCommit ?? (VERSION_INFO.updateId ? VERSION_INFO.updateId.slice(0, 7) : '—');
  const chan = VERSION_INFO.channel ? ` · ${VERSION_INFO.channel}` : '';
  return `${v} · ${src} ${id}${chan}`;
}
