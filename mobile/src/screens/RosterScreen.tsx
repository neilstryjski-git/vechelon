import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { supabase } from '../lib/supabase';
import { TENANT_SLUG } from '../lib/env';
import { useTheme } from '../theme/ThemeProvider';

// Captain roster (W250 — native slice). A read-only view over ride_participants
// for the tenant's current ride: name + phone + tap-to-call. The captain sees
// every rider's number via participant_tactical_select (is_captain_or_support =
// full-row access). No live tracking, no map — works on any ride and exists so
// riders know the captain can reach them on the road.
//
// NOTE — role-scoping is NOT yet enforced: participant_tactical_select's tier-3
// clause over-exposes phone to ANY affiliated member (defect D50, deferred to
// the W197 promotion gate). Fine for the captain-calling use case (only the
// captain runs the app today); rider-facing use of this screen needs D50 fixed.

type Participant = {
  id: string;
  display_name: string | null;
  phone: string | null;
  role: 'captain' | 'support' | 'member' | 'guest';
};

type RideInfo = { id: string; name: string };

// A tel: URI needs a bare dialable string — strip spaces, dashes, parens.
const dialable = (phone: string): string => phone.replace(/[^\d+]/g, '');

const roleRank: Record<Participant['role'], number> = {
  captain: 0,
  support: 1,
  member: 2,
  guest: 3,
};

const RosterScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const theme = useTheme();

  const [ride, setRide] = useState<RideInfo | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // 1. Resolve tenant_id from the build's tenant slug (tenants is anon-readable).
      const { data: tenant, error: tErr } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', TENANT_SLUG)
        .single();
      if (tErr) throw tErr;

      // 2. The tenant's most recent ride is "the ride" for the roster.
      const { data: rideRow, error: rErr } = await supabase
        .from('rides')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!rideRow) {
        setRide(null);
        setParticipants([]);
        return;
      }
      setRide(rideRow as RideInfo);

      // 3. Roster for that ride. RLS returns every row to the captain.
      const { data: rows, error: pErr } = await supabase
        .from('ride_participants')
        .select('id, display_name, phone, role')
        .eq('ride_id', rideRow.id);
      if (pErr) throw pErr;

      const sorted = ((rows ?? []) as Participant[]).sort(
        (a, b) =>
          roleRank[a.role] - roleRank[b.role] ||
          (a.display_name ?? '').localeCompare(b.display_name ?? ''),
      );
      setParticipants(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the roster.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const call = (phone: string) => {
    Linking.openURL(`tel:${dialable(phone)}`).catch(() => {
      setError('This device can’t place calls.');
    });
  };

  const renderItem = ({ item }: { item: Participant }) => {
    const name = item.display_name?.trim() || 'Unnamed rider';
    const hasPhone = !!item.phone?.trim();
    const isLead = item.role === 'captain' || item.role === 'support';
    return (
      <View style={styles.row}>
        <View style={styles.rowText}>
          <View style={styles.nameLine}>
            <Text style={styles.name}>{name}</Text>
            {isLead && (
              <Text style={[styles.roleChip, { color: theme.primaryColor, borderColor: theme.primaryColor }]}>
                {item.role.toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={[styles.phone, !hasPhone && styles.phoneMuted]}>
            {hasPhone ? item.phone : 'No number on file'}
          </Text>
        </View>
        {hasPhone && (
          <TouchableOpacity
            style={[styles.callBtn, { backgroundColor: theme.primaryColor }]}
            onPress={() => call(item.phone as string)}
            accessibilityLabel={`Call ${name}`}
          >
            <Text style={styles.callBtnText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.back, { color: theme.primaryColor }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerLabel}>RIDE ROSTER</Text>
        <View style={styles.backSpacer} />
      </View>

      {ride && <Text style={styles.rideName}>{ride.name}</Text>}
      <Text style={styles.subnote}>
        Everyone on the ride — tap to call. Your captain has these numbers even when the ride isn’t tracked.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primaryColor} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={[styles.retry, { borderColor: theme.primaryColor }]} onPress={onRefresh}>
            <Text style={[styles.retryText, { color: theme.primaryColor }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={participants}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryColor} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {ride ? 'No riders on this roster yet.' : 'No ride found for this club yet.'}
            </Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E10', paddingTop: 56 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  back: { fontSize: 16, fontWeight: '600' },
  backSpacer: { width: 48 },
  headerLabel: { color: '#9A9A9A', fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  rideName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginTop: 12,
  },
  subnote: {
    color: '#7A7A7A',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 20,
    marginTop: 6,
    marginBottom: 14,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowText: { flex: 1, paddingRight: 12 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  roleChip: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 10,
    overflow: 'hidden',
  },
  phone: { color: '#C8C8C8', fontSize: 15, marginTop: 3 },
  phoneMuted: { color: '#5A5A5A', fontStyle: 'italic' },
  callBtn: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 20 },
  callBtnText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.5, fontSize: 14 },
  sep: { height: 1, backgroundColor: '#1C1C20' },
  empty: { color: '#7A7A7A', fontSize: 14, textAlign: 'center', marginTop: 48 },
  error: { color: '#E06666', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retry: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 26, marginTop: 18 },
  retryText: { fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontSize: 13 },
});

export default RosterScreen;
