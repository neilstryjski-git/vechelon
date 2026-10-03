import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { useRideDetails } from '../hooks/useRideDetails';
import type { RideRole } from '../lib/roleVisibility';
import {
  participationLabel,
  participationState,
  phoneVisibleTo,
  rosterOpenFor,
  rowVisibleTo,
} from '../lib/rosterLogic';
import { fetchRideStatus } from '../lib/rideStatus';
import { useResume } from '../hooks/useResume';
import { readRosterCache, writeRosterCache, type RosterSlot, type CachedRow } from '../lib/rosterCache';
import type { RootStackParamList } from '../navigation/RootNavigator';

// Ride roster (W250; W288 slate 17 / §4.1 ROSTER / R3-74). The COMPLETE participant record for
// every role — including non-app guests (account_id NULL) and members who have never opened the
// app — with name, participation state, and phone + tap-to-call per the committed envelope. The
// fleet map is a declared partial projection of this list (R3-74): it shows only app-tracked
// riders producing positions; this shows everyone, whether or not the ride is being tracked.
//
// §4.1 ROSTER rules (rosterLogic.ts is their single home):
//   • every row is visible to every role (a rider sees the whole roster);
//   • each row carries 'App tracked' or 'Roster only', derived ONLY from the durable in-app join
//     signal (ride_participants.rail3_joined_at) — never from current ping state; roster-only is
//     a declared structural state, never a failure;
//   • leaders' (Captain/SAG) numbers are visible to every viewer (slate 8, non-negotiable);
//     command sees every number (a call sheet, co-captains included); rider↔rider stays parked.
// UI-layer enforcement. The participant_tactical_select policy still over-returns phone to
// affiliated riders (D50 / RP-16), so for them this gate is the ONLY gate and the server-side
// column fix remains the security lane; conversely a NON-affiliated rider is handed only command
// rows + their own by RLS, so "all rows" holds to the extent the server returns them.
// Ride-scoped (slate 11): open for 'created'/'active' to participants, closed at ride end — the
// in-screen guard matters because popping the map from under this screen leaves it mounted.

type AccountEmbed = { name: string | null; phone: string | null };
type Row = {
  id: string;
  account_id: string | null;
  display_name: string | null;
  phone: string | null;
  role: RideRole;
  rail3_joined_at: string | null; // W288: the app-tracked signal (NOT joined_at)
  departed_at: string | null; // W292: the durable departed mark (a timestamp, never a coordinate)
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
// W289: the roster fields the cache slot carries (contact fields included; nothing positional). W292 adds departed_at (eight).
const toCachedRow = (r: Row): CachedRow => ({
  id: r.id,
  account_id: r.account_id,
  display_name: r.display_name,
  phone: r.phone,
  role: r.role,
  rail3_joined_at: r.rail3_joined_at,
  departed_at: r.departed_at ?? null,
  accounts: acctOf(r),
});
const timeAgo = (iso: string): string => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};
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
  // W289: offline the ride row is unavailable and useRideDetails cannot say the role; the cached slot
  // carries the last role seen. Live wins whenever it exists.
  const [cached, setCached] = useState<RosterSlot | null>(null);
  const myRole: RideRole = ride?.myRole ?? cached?.myRole ?? 'member';
  // Refs so `load` stays stable (deps [rideId, myUserId]): re-creating it on every status/role
  // change re-fired the mount effect (spinner flash) and re-registered the focus effect.
  const liveRoleRef = useRef<RideRole | null>(ride?.myRole ?? null);
  liveRoleRef.current = ride?.myRole ?? null;

  const [rows, setRows] = useState<Row[]>([]);
  const [rideStatus, setRideStatus] = useState<string | null>(null);
  const rideStatusRef = useRef<string | null>(null);
  rideStatusRef.current = rideStatus;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: pErr } = await supabase
        .from('ride_participants')
        .select('id, account_id, display_name, phone, role, rail3_joined_at, departed_at, accounts(name, phone)')
        .eq('ride_id', rideId);
      if (pErr) throw pErr;
      const live = (data ?? []) as Row[];
      setRows(live);
      setCached(null);
      // Slate 11: re-read the persisted status on every load (useRideDetails reads once) so the
      // surface closes at ride end even if this screen outlives the map.
      let status: string | null = null;
      try {
        status = await fetchRideStatus(rideId);
        setRideStatus(status);
      } catch {
        // keep the previous status; a failed read never closes the roster
      }
      // W289 write-through (slate 11): the single slot follows the ride being viewed — a load for
      // another ride overwrites it (supersession). Contact fields go encrypted; no position data
      // exists in these rows by construction. Fire-and-forget; never blocks the render.
      if (myUserId) {
        void writeRosterCache({
          rideId,
          userId: myUserId,
          lastStatus: status ?? rideStatusRef.current,
          myRole: liveRoleRef.current ?? 'member',
          rows: live.map(toCachedRow),
        });
      }
    } catch (e) {
      // W289 read path: offline or failed → the last-known slot for THIS ride and THIS user, marked
      // as such (A3 honesty). No slot → the existing error + Retry state.
      const slot = myUserId ? await readRosterCache(rideId, myUserId) : null;
      if (slot) {
        setRows(slot.rows as Row[]);
        setCached(slot);
        if (slot.lastStatus !== null) setRideStatus((prev) => prev ?? slot.lastStatus);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : 'Could not load the roster.');
      }
    }
  }, [rideId, myUserId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  // Slate 11 "goes with the ride": re-read on every focus and on every resume signal so a roster
  // left open across ride end closes without a manual refresh (the map may already have popped
  // from under this screen — see the header). Cheap: one participants read + one status read.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const onResume = useCallback(() => {
    void load();
  }, [load]);
  useResume(rideId, onResume);

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

  // §4.1 ROSTER: every row for every role (rowVisibleTo is the envelope's single home). Self IS
  // listed (W288 decision: slate 17's point is seeing your own tracked/roster-only state; §4.1
  // says complete record) — marked YOU, with no phone line or Call button for yourself. Sorted
  // captain -> support -> member -> guest, then name.
  const isSelf = (r: Row) => Boolean(myUserId && r.account_id === myUserId);
  const iAmParticipant = rows.some(isSelf);
  const visible = rows
    .filter((r) => rowVisibleTo(myRole, r))
    .sort(
      (a, b) => roleRank[a.role] - roleRank[b.role] || nameOf(a).localeCompare(nameOf(b)),
    );
  // Slate 11: null status (first load / read failed) keeps the roster open; only an affirmative
  // 'saved' (or not being on the ride) closes it. A closed roster is a plain state, not an error.
  const open = rideStatus === null ? iAmParticipant || rows.length === 0 : rosterOpenFor(rideStatus, iAmParticipant);

  const renderItem = ({ item }: { item: Row }) => {
    const name = nameOf(item);
    const resolvedPhone = phoneOf(item);
    const lead = isCommand(item.role);
    const self = isSelf(item);
    const state = participationState({
      accountId: item.account_id,
      rail3JoinedAt: item.rail3_joined_at,
      departedAt: item.departed_at, // W292: a departed row is retained and marked, never dropped (R3-65/70)
    });
    // slate 8 / §4.1: leaders' numbers to everyone; every number to command (co-captains included —
    // a call sheet, a deliberate divergence from the map's canSeePhone). Rider↔rider parked.
    const phoneAllowed = !self && phoneVisibleTo(myRole, item.role);
    const hasPhone = !!resolvedPhone;
    const showCall = phoneAllowed && hasPhone;
    const phoneLine = self
      ? null
      : !phoneAllowed
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
            {self && <Text style={[styles.roleChip, styles.youChip]}>YOU</Text>}
            {/* R3-74: roster-only is a declared structural state — neutral grey, never a warning. */}
            {/* W292 / R3-65: 'Left ride' is its own look — not the grey of roster-only, not the light of
                tracked, not the map's dark/dormant palette — so left ≠ lost at a glance. */}
            <Text
              style={[
                styles.stateChip,
                state === 'app_tracked' && styles.stateChipTracked,
                state === 'departed' && styles.stateChipDeparted,
              ]}
            >
              {participationLabel(state).toUpperCase()}
            </Text>
          </View>
          {phoneLine !== null && (
            <Text style={[styles.phone, !showCall && styles.phoneMuted]}>{phoneLine}</Text>
          )}
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
        Everyone on the ride, tracked or not. Leaders' numbers are always shown.
      </Text>
      {cached && (
        // W289 / A3 honesty register: a cached roster is LAST-KNOWN, never live — say so, and when.
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>
            Last-known roster — saved {timeAgo(cached.savedAt)}. Not live; pull down to retry.
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primaryColor} size="large" />
        </View>
      ) : !open ? (
        <View style={styles.center}>
          <Text style={styles.closed}>
            {rideStatus === 'saved' ? 'This roster has closed — the ride has ended.' : 'You’re not on this ride.'}
          </Text>
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
  youChip: { color: '#9A9A9A', borderColor: '#9A9A9A' },
  cacheBanner: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3A3A40',
    backgroundColor: '#15151A',
  },
  cacheBannerText: { color: '#A0A0A6', fontSize: 12, lineHeight: 17 },
  stateChip: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#8A8A90',
    borderColor: '#3A3A40',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 8,
    overflow: 'hidden',
  },
  stateChipTracked: { color: '#C8C8C8', borderColor: '#5A5A60' },
  stateChipDeparted: { color: '#7FA6C9', borderColor: '#3E5F78' }, // W292: muted slate-blue — deliberate act, not failure
  closed: { color: '#9A9A9A', fontSize: 15, textAlign: 'center', lineHeight: 22 },
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
