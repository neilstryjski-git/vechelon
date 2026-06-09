import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { supabase } from './src/lib/supabase';
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
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
