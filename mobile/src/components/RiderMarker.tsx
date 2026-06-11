import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { FleetParticipant } from '../lib/roleVisibility';

// Marker visual contract (Pillar II Feature 4 + §5.1 sunlight-readable):
//   Active   → solid filled
//   Stopped  → reduced opacity
//   Inactive → hollow (outline only)
//   Dark     → greyed at last known position (clear change, not a tonal shift)
// Icon differs by TACTICAL STATE only — never by account type (W172 pitfall).
// Role is surfaced as a small badge (C / S) so riders can tell Captain from
// SAG, which §4.1 requires for the rider view; badge ≠ icon differentiation.

const STATE_STYLE: Record<
  FleetParticipant['state'],
  { fill: string; border: string; opacity: number; hollow: boolean }
> = {
  active: { fill: '#E11D2A', border: '#FFFFFF', opacity: 1, hollow: false },
  stopped: { fill: '#E11D2A', border: '#FFFFFF', opacity: 0.55, hollow: false },
  inactive: { fill: 'transparent', border: '#E11D2A', opacity: 1, hollow: true },
  dark: { fill: '#6B6B70', border: '#3A3A3E', opacity: 1, hollow: false },
};

const ROLE_BADGE: Partial<Record<FleetParticipant['role'], string>> = {
  captain: 'C',
  support: 'S',
};

interface Props {
  participant: FleetParticipant;
  tappable: boolean; // canOpenSheet(myRole, participant.role)
  onPress: (participant: FleetParticipant) => void;
}

const RiderMarker: React.FC<Props> = ({ participant, tappable, onPress }) => {
  if (!participant.position) return null;
  const s = STATE_STYLE[participant.state];
  const badge = ROLE_BADGE[participant.role];

  return (
    <Marker
      coordinate={{
        latitude: participant.position.lat,
        longitude: participant.position.lng,
      }}
      tracksViewChanges={false}
      // Role gate, not a style choice: non-tappable markers must not open a
      // sheet even via the native press path (R3-10/R3-17).
      onPress={() => {
        if (tappable) onPress(participant);
      }}
      tappable={tappable}
    >
      <View style={[styles.markerWrap, { opacity: s.opacity }]}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor: s.hollow ? 'transparent' : s.fill,
              borderColor: s.border,
              borderWidth: s.hollow ? 3 : 2,
            },
          ]}
        />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  // ≥48dp touch target (§5.1 large tap targets) around a smaller visual dot.
  markerWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#0E0E10',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});

export default React.memo(RiderMarker);
