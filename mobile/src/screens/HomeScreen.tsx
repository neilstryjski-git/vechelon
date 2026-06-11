import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from './../navigation/RootNavigator';

interface ActiveRide {
  id: string;
  name: string;
  status: string;
  scheduled_start: string | null;
}

// Authenticated landing surface: live rides for the rider's club, entry point
// to the W172 fleet map. Ride DISCOVERY is a one-shot DB read (a meaningful
// event); everything live on the map itself is Broadcast-only. RLS scopes the
// list to the signed-in member's tenant — no tenant id is ever hardcoded here
// (W178 pitfall: runtime lookup only).
const HomeScreen: React.FC = () => {
  const { session, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rides, setRides] = useState<ActiveRide[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadRides = useCallback(async () => {
    const { data, error } = await supabase
      .from('rides')
      .select('id, name, status, scheduled_start')
      .eq('status', 'active')
      .order('scheduled_start', { ascending: false })
      .limit(20);
    if (!error && data) setRides(data as ActiveRide[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRides();
    setRefreshing(false);
  }, [loadRides]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.email}>{session?.user.email ?? 'unknown'}</Text>
        </View>
        <TouchableOpacity style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Live rides</Text>
      <FlatList
        data={rides}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E11D2A" />
        }
        ListEmptyComponent={
          loaded ? (
            <Text style={styles.empty}>
              No live rides right now. Pull to refresh when your ride starts.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.rideCard}
            onPress={() => navigation.navigate('RideMap', { rideId: item.id })}
          >
            <View style={styles.liveDot} />
            <View style={styles.rideMeta}>
              <Text style={styles.rideName}>{item.name}</Text>
              <Text style={styles.rideSub}>LIVE — open fleet map</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E10', paddingHorizontal: 20, paddingTop: 64 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  label: { color: '#9A9A9A', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' },
  email: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 4 },
  signOut: {
    borderColor: '#2C2C30',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  signOutText: {
    color: '#E11D2A',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: '#9A9A9A',
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  empty: { color: '#7A7A7A', fontSize: 13, lineHeight: 19, marginTop: 12 },
  rideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161A',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    minHeight: 64,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2ECC71' },
  rideMeta: { flex: 1, marginLeft: 14 },
  rideName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  rideSub: { color: '#7A7A7A', fontSize: 11, letterSpacing: 1.5, marginTop: 3 },
  chevron: { color: '#5A5A5E', fontSize: 26, fontWeight: '300' },
});

export default HomeScreen;
