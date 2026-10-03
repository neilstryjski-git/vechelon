import { registerRootComponent } from 'expo';

import App from './App';
import { registerRail3HeadlessTask } from './src/lib/headlessTask';

// W286 (B1 device-side): register the Android headless task BEFORE the root component so the
// Transistorsoft SDK can deliver heartbeat / terminate / providerchange events to a headless JS
// context after the app is swiped away. headlessTask.ts is import-light: react-native + types at
// bundle eval, the SDK required ONCE at registration (try/catch — the one eager addition to the
// launch path, unavoidable for registerHeadlessTask), everything else lazily required inside the
// task — launch-safety per the D87 OTA rollback lesson.
registerRail3HeadlessTask();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and sets up the Expo entry so the app works in a native Dev Build.
registerRootComponent(App);
