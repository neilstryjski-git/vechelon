import type { ExpoConfig, ConfigContext } from 'expo/config';

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
export default ({ config }: ConfigContext): ExpoConfig => ({
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
  ],
});
