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
      },
    ],
  ],
});
