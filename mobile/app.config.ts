import type { ExpoConfig, ConfigContext } from 'expo/config';
import {
  withAppBuildGradle,
  withGradleProperties,
  type ConfigPlugin,
} from 'expo/config-plugins';

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
    // RC4 (engine swap trial) — Transistorsoft Background Geolocation. Garmin-class
    // continuous live tracking that survives Doze where expo-location batches. NO
    // license key here: DEBUG builds run the full SDK unlicensed ("try before you
    // buy"); only a RELEASE build needs the $399 Starter key. The config plugin adds
    // the maven repo + manifest entries (FGS location type, etc.) at prebuild.
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
  // Longer maven HTTP timeouts apply to every build (jitpack flake can bite any
  // build that resolves the Transistorsoft deps — harmless elsewhere).
  const hardened = withLongHttpTimeouts(base) as ExpoConfig;
  // Only the 'trial' profile builds the standalone DEBUG APK (unlicensed Transistorsoft).
  return process.env.EAS_BUILD_PROFILE === 'trial'
    ? (withBundleInDebug(hardened) as ExpoConfig)
    : hardened;
};
