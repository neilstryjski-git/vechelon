import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeProvider';

// Placeholder authenticated surface. Proves the auth gate works end-to-end; the
// live fleet map, beacon, and ride controls land in later Rail 3 tasks
// (W172 / W173 / W175 etc.). For now: confirm who is signed in and allow sign-out.
const HomeScreen: React.FC = () => {
  const { session, signOut } = useAuth();
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.club, { color: theme.primaryColor }]}>
        {theme.clubName.toUpperCase()}
      </Text>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.email}>{session?.user.email ?? 'unknown'}</Text>

      <Text style={styles.note}>
        Rail 3 authenticated shell. Ride surfaces arrive in later tasks.
      </Text>

      <TouchableOpacity
        style={[styles.button, { borderColor: theme.primaryColor }]}
        onPress={signOut}
      >
        <Text style={[styles.buttonText, { color: theme.primaryColor }]}>
          Sign Out
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E10',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  club: {
    fontSize: 22,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 1,
    marginBottom: 28,
  },
  label: {
    color: '#9A9A9A',
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  email: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: 8 },
  note: {
    color: '#7A7A7A',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 24,
  },
  button: {
    borderColor: '#2C2C30',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    marginTop: 40,
  },
  buttonText: {
    color: '#E11D2A',
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontSize: 13,
  },
});

export default HomeScreen;
