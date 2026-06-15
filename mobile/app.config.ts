import type { ExpoConfig, ConfigContext } from 'expo/config';
import {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
  type ConfigPlugin,
} from 'expo/config-plugins';

// THE jitpack fix. react-native-background-fetch declares its native dep as a
// wildcard — `implementation 'com.transistorsoft:tsbackgroundfetch:+'`. The `+`
// makes gradle ENUMERATE every available version (fetch maven-metadata.xml) across
// all repos to pick the newest, which drags in jitpack.io's metadata endpoint —
// and jitpack's flaky "Read timed out" killed THREE billed EAS builds (b83e86cf,
// e12e23d9, 38b7fc64). The version `+` actually resolves to is 4.1.1 from
// mavenCentral (the reliable host; jitpack is just a legacy/empty fallback, and
// the local ./libs only carries an ancient 1.0.4 that `+` never picks) — i.e.
// 4.1.1 is what the EARLIER SUCCESSFUL builds compiled with. Pinning the concrete
// 4.1.1 with resolutionStrategy.force turns the dynamic lookup into a direct
// artifact fetch from mavenCentral — gradle never lists versions, never queries
// jitpack — WITHOUT changing the version that ships. (Pinning 1.0.4 would have
// been a 3-major downgrade; do not.)
const PINNED_TSBGFETCH = 'com.transistorsoft:tsbackgroundfetch:4.1.1';
const withPinnedTsBackgroundFetch: ConfigPlugin = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    if (cfg.modResults.contents.includes(PINNED_TSBGFETCH)) return cfg;
    cfg.modResults.contents += `

// Injected by app.config.ts (withPinnedTsBackgroundFetch): force the locally
// vendored tsbackgroundfetch version so gradle never enumerates versions from
// the flaky jitpack.io metadata endpoint.
allprojects {
    configurations.all {
        resolutionStrategy {
            force '${PINNED_TSBGFETCH}'
        }
    }
}
`;
    return cfg;
  });

// Harden dependency resolution against slow/flaky maven hosts. Transistorsoft's
// `tsbackgroundfetch` is served from jitpack.io, which intermittently answers its
// maven-metadata.xml slower than gradle's DEFAULT 30s HTTP socket timeout — that
// "Read timed out" killed two billed EAS builds (b83e86cf, e12e23d9) at ~3m20s
// even though the source compiled the correct commit. Raising the connect/socket
// timeouts to 120s lets a slow jitpack respond instead of aborting the build.
const withLongHttpTimeouts: ConfigPlugin = (config) =>
  withGradleProperties(config, (cfg) => {
    const set = (key: string, value: string) => {
      const existing = cfg.modResults.find(
        (i) => i.type === 'property' && i.key === key,
      );
      if (existing && existing.type === 'property') {
        existing.value = value;
      } else {
        cfg.modResults.push({ type: 'property', key, value });
      }
    };
    set('systemProp.org.gradle.internal.http.connectionTimeout', '120000');
    set('systemProp.org.gradle.internal.http.socketTimeout', '120000');
    return cfg;
  });

// Trial-build helper: make the DEBUG-variant APK embed the JS bundle so it runs standalone
// (no Metro tether) — needed because Transistorsoft's free (unlicensed) mode only runs in a
// DEBUG build, but we still want a walk-able field APK. RN 0.76's react-native gradle plugin
// has NO `bundleInDebug` property (that fails config: "Could not set unknown property
// 'bundleInDebug'"). The correct lever is `debuggableVariants`: variants listed there SKIP
// bundling (expect Metro); default is ["debug"]. Setting it to [] makes the debug variant
// bundle JS while staying a debug build (BuildConfig.DEBUG=true → Transistorsoft free).
// Gated to the 'trial' EAS profile so normal dev/preview/release builds are untouched.
const withBundleInDebug: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (
      cfg.modResults.language === 'groovy' &&
      !cfg.modResults.contents.includes('debuggableVariants = []')
    ) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /react\s*\{/,
        'react {\n    debuggableVariants = []',
      );
    }
    return cfg;
  });

// Dynamic config layered over app.json (W172). Two additions:
//
// 1. Google Maps Android API key — react-native-maps with PROVIDER_GOOGLE needs
//    a key in the manifest or the canvas renders blank. The key is injected at
//    BUILD time from GOOGLE_MAPS_ANDROID_API_KEY (set it as an EAS environment
//    variable for the project; restrict the key to package ca.vechelon.rail3 +
//    the build SHA-1 in Google Cloud Console). Local dev: put it in mobile/.env.
//    An empty key still builds — the map canvas is just blank tiles.
//
// 2. expo-location plugin — foreground "While using the app" permission for
//    live position pings on the fleet map. Background-mode permissions land
//    with W176/W179 (Foreground Service explainer / background GPS validation).
export default ({ config }: ConfigContext): ExpoConfig => {
  const base: ExpoConfig = {
  ...(config as ExpoConfig),
  // Build fingerprint for remote build identification (staging measurement sink).
  // EAS sets these env vars during the build; baked into extra so the running app
  // can report exactly which build it is (maps the APK/commit to a device's rows
  // in analytics_events). Null on local dev builds. NON-secret — git SHA + EAS ids.
  extra: {
    ...config.extra,
    buildId: process.env.EAS_BUILD_ID ?? null,
    gitCommit: process.env.EAS_BUILD_GIT_COMMIT_HASH ?? null,
    buildProfile: process.env.EAS_BUILD_PROFILE ?? null,
  },
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '',
      },
    },
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Your position is shared with your ride Captain and SAG during a live ride.',
        // W179: keep transmitting while the phone is pocketed so the Captain/SAG
        // and web views stay current. Background permission + a foreground
        // service (persistent notification) are required for Android background
        // location; the service is started/stopped per active ride.
        locationAlwaysAndWhenInUsePermission:
          'VEcheLOn shares your position with your ride Captain and SAG while a ride is active, even when the app is in the background.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    // RC4 (engine-swap trial) — Transistorsoft Background Geolocation. The expo-only walk
    // PROVED expo-location can't stream with the screen off (24-min dead on Unrestricted
    // battery); these plugins are RESTORED to validate the TS engine ("positive positive")
    // before the $399 buy. FREE in this debug/trial build — no license key. The plugins add
    // the maven repo + manifest entries (FGS location type) at prebuild. jitpack flake is
    // handled by withPinnedTsBackgroundFetch (force concrete version, never query jitpack).
    'react-native-background-geolocation',
    'react-native-background-fetch',
    [
      // Pin play-services-location to 21.x so bg-geo selects the matching
      // tslocationmanager-v21 AAR (its default of 20.0.0 picks the non-v21 artifact and
      // clashes with the 21.x play-services Expo 52 / RN 0.76 already ship → gradle fail).
      'expo-gradle-ext-vars',
      {
        googlePlayServicesLocationVersion: '21.3.0',
        // Align bg-geo's library module to the app's SDK levels (its defaults are
        // compileSdk 31 — too low for the FOREGROUND_SERVICE_LOCATION API-34 surface).
        compileSdkVersion: 35,
        targetSdkVersion: 34,
        minSdkVersion: 24,
      },
    ],
  ],
  };
  // Pin tsbackgroundfetch to its resolved version (kills the jitpack version-listing,
  // resolves from mavenCentral) and keep the longer maven HTTP timeouts as
  // belt-and-suspenders. Both are harmless on every build.
  const hardened = withLongHttpTimeouts(
    withPinnedTsBackgroundFetch(base),
  ) as ExpoConfig;
  // Only the 'trial' profile builds the standalone DEBUG APK (unlicensed Transistorsoft).
  return process.env.EAS_BUILD_PROFILE === 'trial'
    ? (withBundleInDebug(hardened) as ExpoConfig)
    : hardened;
};
