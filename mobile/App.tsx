import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { ThemeProvider } from './src/theme/ThemeProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { supabase } from './src/lib/supabase';
import { identityKey } from './src/lib/identityDelta';
import { createSessionFromUrl } from './src/lib/deepLinkAuth';

// Tells supabase-js to auto-refresh the access token only while the app is in the
// foreground (the documented RN pattern). Without this, a backgrounded app burns
// refreshes or lets the token expire mid-session.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// D77 — the identity remount boundary. Keyed on the USER, so a change of account rebuilds the
// NavigationContainer, not merely the navigator inside it.
//
// Keying the navigator alone is NOT enough, and the difference is a real bug. NAVIGATION STATE
// lives in the container and survives a navigator remount: React Navigation rehydrates the old
// stack if the route names still match. So on an account swap with NO intervening null session —
// which createSessionFromUrl's setSession() below performs on an inbound magic link — the tree
// would rebuild as the new user but rehydrate onto the PREVIOUS user's route: B lands on A's ride
// map, and RideMapScreen's self-enrol effect then RSVPs B into A's ride. Remounting the container
// discards that state, so a new person starts where they belong (Home).
//
// The key is the user id, NEVER the session object: TOKEN_REFRESHED hands us a fresh session for
// the same person roughly hourly and mid-ride, and remounting on that would tear down the
// foreground service and the realtime channel of a live ride for nothing (see identityDelta.ts).
const AuthedNavigation: React.FC = () => {
  const { session } = useAuth();
  return (
    <NavigationContainer key={identityKey(session?.user?.id ?? null)}>
      <StatusBar style="light" />
      <RootNavigator />
    </NavigationContainer>
  );
};

export default function App() {
  // Handle the inbound magic-link deep link in two cases: a cold start where the
  // link launched the app (getInitialURL), and a warm app already in memory
  // (addEventListener). onAuthStateChange in AuthContext then flips the gate.
  const initialUrl = Linking.useURL();

  useEffect(() => {
    if (!initialUrl) return;
    createSessionFromUrl(initialUrl).catch((err) => {
      console.warn('[Rail3] Deep-link sign-in failed:', err);
    });
  }, [initialUrl]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AuthedNavigation />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
