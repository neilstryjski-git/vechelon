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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { useRideDetails } from '../hooks/useRideDetails';
import { canSeePhone, RideRole } from '../lib/roleVisibility';
import type { RootStackParamList } from '../navigation/RootNavigator';

// Captain/Support ride roster (W250). A scrollable list of EVERYONE on the ride —
// including non-app guests (account_id NULL) that the captain seeded — with
// name + phone + tap-to-call. Complements the map's per-marker bottom sheet:
// the map only shows riders who are broadcasting a position; this shows the
// whole roster whether or not the ride is being tracked.
//
// Role-scoping is the map's, verbatim: it reuses roleVisibility.ts (§4.1). A
// rider sees only captain/SAG; command roles see everyone; phone + Call render
// only when canSeePhone() allows. UI-layer enforcement — identical to the map,
// no looser. The participant_tactical_select policy still over-returns phone to
// affiliated riders (D50), so the true server-side fix remains owed.

type AccountEmbed = { name: string | null; phone: string | null };
type Row = {
  id: string;
  account_id: string | null;
  display_name: string | null;
  phone: string | null;
  role: RideRole;
  accounts: AccountEmbed | AccountEmbed[] | null;
};

const dialable = (phone: string): string => phone.replace(/[^\d+]/g, '');
const isCommand = (r: RideRole) => r === 'captain' || r === 'support';
const roleRank: Record<RideRole, number> = { captain: 0, support: 1, member: 2, guest: 3 };

// The account record is the source of truth for a member's current name + phone
// (editing the member page must show here even if the ride row predates it).
// The ride row's own name/phone is the fallback — used for guests with no account.
const acctOf = (r: Row): AccountEmbed | null =>
  (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) ?? null;
const nameOf = (r: Row): string =>
  acctOf(r)?.name?.trim() || r.display_name?.trim() || 'Unnamed rider';
const phoneOf = (r: Row): string | null =>
  acctOf(r)?.phone?.trim() || r.phone?.trim() || null;

const RosterScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Roster'>>();
  const rideId = route.params.rideId;
  const theme = useTheme();
  const { session } = useAuth();
  const myUserId = session?.user?.id ?? null;

  // Viewer's role for THIS ride (server-derived, fail-closed to 'member').
  const { ride } = useRideDetails(rideId);
  const myRole: RideRole = ride?.myRole ?? 'member';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: pErr } = await supabase
        .from('ride_participants')
        .select('id, account_id, display_name, phone, role, accounts(name, phone)')
        .eq('ride_id', rideId);
      if (pErr) throw pErr;
      setRows((data ?? []) as Row[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the roster.');
    }
  }, [rideId]);

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
    Linking.openURL(`tel:${dialable(phone)}`).catch(() =>
      setError('This device can’t place calls.'),
    );
  };

  // §4.1 list scoping: command roles see everyone; riders see only captain/SAG.
  // Self is never listed. Sorted captain -> support -> member -> guest, then name.
  const iAmCommand = isCommand(myRole);
  const visible = rows
    .filter((r) => !(myUserId && r.account_id === myUserId)) // never list self
    .filter((r) => (iAmCommand ? true : isCommand(r.role))) // riders see only captain/SAG
    .sort(
      (a, b) => roleRank[a.role] - roleRank[b.role] || nameOf(a).localeCompare(nameOf(b)),
    );

  const renderItem = ({ item }: { item: Row }) => {
    const name = nameOf(item);
    const resolvedPhone = phoneOf(item);
    const lead = isCommand(item.role);
    // Roster rule: command roles (captain/SAG) can call ANYONE on the ride,
    // incl. co-captains — this is a call sheet, not the tactical map. Riders keep
    // the strict map gate (captain/SAG numbers only). Slight divergence from the
    // map's canSeePhone (which hides captain<->captain); may warrant a §4.1 note.
    const phoneAllowed = iAmCommand || canSeePhone(myRole, item.role);
    const hasPhone = !!resolvedPhone;
    const showCall = phoneAllowed && hasPhone;
    const phoneLine = !phoneAllowed
      ? 'Contact held by the ride team'
      : hasPhone
        ? (resolvedPhone as string)
        : 'No number on file';

    return (
      <View style={styles.row}>
        <View style={styles.rowText}>
          <View style={styles.nameLine}>
            <Text style={styles.name}>{name}</Text>
            {lead && (
              <Text style={[styles.roleChip, { color: theme.primaryColor, borderColor: theme.primaryColor }]}>
                {item.role === 'support' ? 'SAG' : 'CAPTAIN'}
              </Text>
            )}
          </View>
          <Text style={[styles.phone, !showCall && styles.phoneMuted]}>{phoneLine}</Text>
        </View>
        {showCall && (
          <TouchableOpacity
            style={[styles.callBtn, { backgroundColor: theme.primaryColor }]}
            onPress={() => call(resolvedPhone as string)}
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

      {ride?.name && <Text style={styles.rideName}>{ride.name}</Text>}
      <Text style={styles.subnote}>
        Everyone on the ride — tap to call. Works whether or not the ride is being tracked.
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
          data={visible}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryColor} />
          }
          ListEmptyComponent={<Text style={styles.empty}>No riders on this roster yet.</Text>}
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
  rideName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', paddingHorizontal: 20, marginTop: 12 },
  subnote: { color: '#7A7A7A', fontSize: 13, lineHeight: 19, paddingHorizontal: 20, marginTop: 6, marginBottom: 14 },
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
