// EXPO-ONLY trial build (2026-06-15): exclude the Transistorsoft native modules from
// autolinking. These are classic React Native community modules (NOT Expo modules), so
// `expo.autolinking.exclude` in package.json does not reliably skip them on SDK 52 — RN
// autolinking still links `project :react-native-background-geolocation`, which drags in
// `com.transistorsoft:tslocationmanager-v21:3.+` / `tsbackgroundfetch:+` from the
// Cloudflare-walled jitpack repo and fails the build. Setting `platforms.<os> = null` tells
// React Native autolinking to skip these dependencies entirely, giving a pure expo-location
// build with zero jitpack exposure.
//
// To resume the dual-engine A/B: delete this file, restore the two plugins in app.config.ts,
// drop the package.json autolinking exclude, and flip EXPO_ONLY = false in src/lib/bgEngine.ts.
module.exports = {
  dependencies: {
    'react-native-background-geolocation': {
      platforms: { android: null, ios: null },
    },
    'react-native-background-fetch': {
      platforms: { android: null, ios: null },
    },
  },
};
