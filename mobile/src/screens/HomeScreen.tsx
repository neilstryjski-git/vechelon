import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';
import { TENANT_SLUG } from '../lib/env';
import AdHocCreator from '../components/AdHocCreator';
import { useBgEngine } from '../lib/bgEngine';
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
// (W178 pitfall: runtime lookup only). Branding via the W178 ThemeProvider.
const HomeScreen: React.FC = () => {
  const { session, signOut } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rides, setRides] = useState<ActiveRide[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Ad Hoc creation (W175): Captain-only per §4.1, and rides INSERT is gated
  // server-side by ride_admin_insert (is_tenant_admin) — same as prod, where
  // ride creators are tenant admins. Show the control only to accounts that
  // can actually use it (PoC captains are seeded as tenant admins).
  const [canCreate, setCanCreate] = useState(false);
  // Dual-engine TRIAL toggle (debug A/B; remove for production).
  const [bgEngine, setBgEngine] = useBgEngine();

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !mounted) return;
      // Pinned to the build's club slug (multi-membership safe); without a
      // slug the creator can't mint a valid join URL anyway, so stay hidden.
      if (!TENANT_SLUG) return;
      const { data } = await supabase
        .from('account_tenants')
        .select('role, tenants!inner(slug)')
        .eq('account_id', auth.user.id)
        .eq('tenants.slug', TENANT_SLUG)
        .limit(1)
        .maybeSingle();
      if (mounted) setCanCreate(data?.role === 'admin');
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  // Refetch on every focus (not just mount) so returning from an ended ride drops it
  // off the list right away — no manual pull-to-refresh needed (field-test UX fix).
  useFocusEffect(
    useCallback(() => {
      void loadRides();
    }, [loadRides]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRides();
    setRefreshing(false);
  }, [loadRides]);

  return (
    <View style={styles.container}>
      <Text style={[styles.club, { color: theme.primaryColor }]}>
        {theme.clubName.toUpperCase()}
      </Text>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.email}>{session?.user.email ?? 'unknown'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.signOut, { borderColor: theme.primaryColor }]}
          onPress={signOut}
        >
          <Text style={[styles.signOutText, { color: theme.primaryColor }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Dual-engine TRIAL toggle (debug A/B). Pick the background-location engine, join a
          ride, and walk; flip and repeat to compare. Remove for production. */}
      <View style={styles.engineRow}>
        <Text style={styles.engineLabel}>BG engine</Text>
        {(['expo', 'tsbg'] as const).map((e) => (
          <TouchableOpacity
            key={e}
            style={[
              styles.enginePill,
              bgEngine === e && { backgroundColor: theme.primaryColor, borderColor: theme.primaryColor },
            ]}
            onPress={() => setBgEngine(e)}
          >
            <Text style={[styles.enginePillText, bgEngine === e && { color: '#FFFFFF' }]}>
              {e === 'expo' ? 'expo-location' : 'Transistorsoft'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Live rides</Text>
      <FlatList
        data={rides}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primaryColor}
          />
        }
        ListEmptyComponent={
          loaded ? (
            <View>
              <Text style={styles.empty}>
                No live rides right now. Pull to refresh when your ride starts.
              </Text>
              {/* Feature 3: Ad Hoc creation is available when no ride is Active. */}
              {canCreate ? <AdHocCreator /> : null}
            </View>
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
  club: {
    fontSize: 22,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 1,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  label: { color: '#9A9A9A', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' },
  email: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 4 },
  signOut: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  signOutText: {
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
  engineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
  engineLabel: {
    color: '#9A9A9A',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginRight: 2,
  },
  enginePill: {
    borderWidth: 1,
    borderColor: '#3A3A3E',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  enginePillText: { color: '#9A9A9A', fontSize: 12, fontWeight: '700' },
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
