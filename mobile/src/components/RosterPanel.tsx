import React, { useMemo } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { RideRoster } from '../hooks/useFleetPositions';
import {
  canSeePhone,
  rosterVisible,
  type FleetParticipant,
  type RideRole,
  type TacticalState,
} from '../lib/roleVisibility';

// Ride roster (§4.1 list view). The map renders only riders who are actively
// broadcasting (fleet = pings ⋈ roster); this panel is the COMPLEMENT — the full
// participant list from the RLS-gated roster, INCLUDING people who are in the ride
// but not on the app / not broadcasting (state = "Not tracking"). Same §4.1 access
// matrix as the map (Rider → Captain + SAG + self; Captain/SAG → everyone), enforced
// client-side by rosterVisible because for affiliated tenants the RLS returns every
// participant to a Rider (the RP-16 caveat). Live tactical state, when a participant
// IS broadcasting, is merged in from the map's already-live `fleet` — so this needs
// no second Broadcast channel and never suspends the viewer's own position send.
// Privacy: identity + role + live STATE only; no coordinates are read or shown (the
// no-coordinate-storage posture — last_lat/last_long/last_ping are never persisted).

interface Props {
  visible: boolean;
  onClose: () => void;
  roster: RideRoster; // identities of ALL visible participants (incl. non-broadcasting)
  fleet: FleetParticipant[]; // live states for participants currently broadcasting
  myRole: RideRole;
  myRiderId: string | null;
  rideName: string;
}

const ROLE_LABEL: Record<RideRole, string> = {
  captain: 'Captain',
  support: 'SAG',
  member: 'Rider',
  guest: 'Guest Rider',
};

// Order: command first (captain, then SAG), then riders/guests — mirrors who a
// rider most needs to find, and keeps the leadership pinned to the top for all.
const ROLE_RANK: Record<RideRole, number> = { captain: 0, support: 1, member: 2, guest: 3 };

// Live-state → row badge. Palette matches the map markers (RiderMarker) so the
// roster reads the same as the map: green = moving, dim = stopped, grey = dark,
// violet = sleeping. `null` = not currently broadcasting (in the ride, off the map).
const STATE_BADGE: Record<TacticalState, { label: string; color: string }> = {
  active: { label: 'Active', color: '#16A34A' },
  stopped: { label: 'Stopped', color: '#4D7C4A' },
  inactive: { label: 'Inactive', color: '#6E8B6C' },
  dark: { label: 'Dark', color: '#6B6B70' },
  dormant: { label: 'Sleeping', color: '#8B5CF6' },
};
const NOT_TRACKING = { label: 'Not tracking', color: '#5A5A5E' };

interface RosterRow {
  riderId: string;
  displayName: string;
  role: RideRole;
  phone: string | null;
  state: TacticalState | null; // null ⇒ not broadcasting (off the map)
  isSelf: boolean;
}

const RosterPanel: React.FC<Props> = ({
  visible,
  onClose,
  roster,
  fleet,
  myRole,
  myRiderId,
  rideName,
}) => {
  const theme = useTheme();

  const rows = useMemo<RosterRow[]>(() => {
    const liveState = new Map(fleet.map((f) => [f.riderId, f.state]));
    return Object.entries(roster)
      .map(([riderId, e]) => ({
        riderId,
        displayName: e.displayName,
        role: e.role,
        phone: e.phone,
        state: liveState.get(riderId) ?? null,
        isSelf: riderId === myRiderId,
      }))
      // §4.1 — the authoritative client-side gate (see rosterVisible).
      .filter((r) => rosterVisible(myRole, myRiderId ?? '', r))
      .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.displayName.localeCompare(b.displayName));
  }, [roster, fleet, myRole, myRiderId]);

  const trackingCount = rows.filter((r) => r.state && r.state !== 'dark').length;
  const subtitle =
    myRole === 'captain' || myRole === 'support'
      ? 'Everyone on this ride'
      : 'Support & ride captains';

  const renderRow = ({ item }: { item: RosterRow }) => {
    const badge = item.state ? STATE_BADGE[item.state] : NOT_TRACKING;
    const canCall = !item.isSelf && Boolean(item.phone) && canSeePhone(myRole, item.role);
    return (
      <View style={styles.row}>
        <View style={[styles.stateDot, { backgroundColor: badge.color }]} />
        <View style={styles.rowMeta}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {item.displayName}
              {item.isSelf ? ' (You)' : ''}
            </Text>
            <Text style={[styles.roleChip, { color: theme.primaryColor, borderColor: theme.primaryColor }]}>
              {ROLE_LABEL[item.role]}
            </Text>
          </View>
          <Text style={[styles.stateText, { color: badge.color }]}>{badge.label}</Text>
        </View>
        {canCall ? (
          <TouchableOpacity
            style={[styles.callButton, { borderColor: theme.primaryColor }]}
            onPress={() => void Linking.openURL(`tel:${item.phone}`)}
            accessibilityLabel={`Call ${item.displayName}`}
          >
            <Text style={[styles.callText, { color: theme.primaryColor }]}>Call</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>ROSTER</Text>
            <Text style={styles.rideName} numberOfLines={1}>{rideName}</Text>
            <Text style={styles.subtitle}>
              {subtitle} · {rows.length} shown · {trackingCount} tracking
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeButton, { borderColor: theme.primaryColor }]}
            onPress={onClose}
            accessibilityLabel="Close roster"
          >
            <Text style={[styles.closeText, { color: theme.primaryColor }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={rows}
          keyExtractor={(r) => r.riderId}
          renderItem={renderRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>No one on the roster yet.</Text>
          }
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E10', paddingTop: 54 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#26262B',
  },
  headerText: { flex: 1, marginRight: 12 },
  title: { color: '#9A9A9A', fontSize: 11, letterSpacing: 3, fontWeight: '800' },
  rideName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#7A7A7A', fontSize: 12, marginTop: 4 },
  closeButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  closeText: { fontWeight: '800', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161A',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    minHeight: 64,
  },
  stateDot: { width: 12, height: 12, borderRadius: 6, marginRight: 14 },
  rowMeta: { flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  roleChip: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 10,
    overflow: 'hidden',
  },
  stateText: { fontSize: 12, marginTop: 4, letterSpacing: 0.5 },
  callButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: 12,
  },
  callText: { fontWeight: '800', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  empty: { color: '#7A7A7A', fontSize: 13, marginTop: 24, textAlign: 'center' },
});

export default RosterPanel;
