import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';
import { identityKey } from '../lib/identityDelta';
import SignInScreen from '../screens/SignInScreen';
import HomeScreen from '../screens/HomeScreen';
import RideMapScreen from '../screens/RideMapScreen';
import RosterScreen from '../screens/RosterScreen';

export type RootStackParamList = {
  Home: undefined;
  SignIn: undefined;
  RideMap: { rideId: string };
  Roster: { rideId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Auth gate: a persisted/just-restored session routes to the app surface;
// otherwise the sign-in screen. While the initial session check runs we show a
// splash so we never flash the wrong screen on cold start.
const RootNavigator: React.FC = () => {
  const { session, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color="#E11D2A" size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      // D77 — IDENTITY REMOUNT. `session ?` below is a mere TRUTHINESS gate: an A→B account
      // swap with no intervening null never unmounted anything, so the whole ride tree stayed
      // mounted and kept running as A. Keying on the USER makes React tear the authed subtree
      // down and rebuild it whenever the signed-in account changes — and since every ride hook
      // derives identity at MOUNT (role, roster, channel, breadcrumb leader, canCreate, and the
      // bgGeo send closure), one remount re-derives all of them against the new user. That is
      // what actually closes the latch; patching any single call site would have left it alive
      // in the others.
      //
      // Key on the USER, NOT on `session` — the session object churns on every hourly
      // TOKEN_REFRESHED, and remounting a live ride tree mid-ride would tear down the
      // foreground service and the channel for no reason. identityKey is the shared rule
      // (identityDelta.ts) that AuthContext's cache reset also uses, so the two cannot drift.
      key={identityKey(session?.user?.id ?? null)}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0E0E10' } }}
    >
      {session ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="RideMap" component={RideMapScreen} />
          <Stack.Screen name="Roster" component={RosterScreen} />
        </>
      ) : (
        <Stack.Screen name="SignIn" component={SignInScreen} />
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0E0E10',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RootNavigator;
