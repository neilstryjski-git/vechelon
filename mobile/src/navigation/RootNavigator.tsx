import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';
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
