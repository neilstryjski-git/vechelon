import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Rect, Circle } from 'react-native-svg';

import type { FleetParticipant } from '../lib/roleVisibility';

// Marker visual contract (Pillar II Feature 4 + §5.1 sunlight-readable):
//   Active   → solid GREEN
//   Stopped  → green, reduced opacity
//   Inactive → hollow green (outline only)
//   Dark     → greyed at last known position (clear change, not a tonal shift)
//   Sleeping → calm VIOLET (rider gracefully backgrounded, app asleep — expected,
//              distinct from the alarming grey Dark)
//   SOS      → solid RED (reserved for distress; overrides the state colour)
// Colour is GREEN for peers so red stays exclusively a distress signal, and so
// peers read distinct from the viewer's own OS blue dot.
// Icon differs by TACTICAL STATE only — never by account type (W172 pitfall).
// Role is surfaced as a small overlay BADGE so riders can tell Captain from SAG,
// which §4.1 requires for the rider view; the badge is an overlay, NOT icon
// differentiation (the state-colored dot is untouched — Pillar II Feature 1
// "icon by tactical state only" holds). W213 (PoC interim): SAG gets a distinctive
// white van glyph so the support VEHICLE is glanceable in a field of rider dots;
// Captain keeps the small "C" badge. The "wholesome" production version (a fully
// distinct SAG marker SHAPE) is a Rail 3a item — see dossier §H.

// Riders render GREEN, varied by tactical state. RED is RESERVED for an active
// SOS beacon (applied to the dot below, overriding the state fill) so red always
// means distress, never "normal rider". Own position is the OS blue dot, so green
// also keeps peers visually distinct from self. Dark = grey (a clear change).
const RIDER_GREEN = '#16A34A';
const SOS_RED = '#E11D2A';
// Sleeping: a calm violet — distinct from active green, Dark grey, SOS red, and the
// viewer's own OS-blue dot, so "asleep" never reads as "lost" or "distress".
const SLEEP_VIOLET = '#8B5CF6';

const STATE_STYLE: Record<
  FleetParticipant['state'],
  { fill: string; border: string; opacity: number; hollow: boolean }
> = {
  active: { fill: RIDER_GREEN, border: '#FFFFFF', opacity: 1, hollow: false },
  stopped: { fill: RIDER_GREEN, border: '#FFFFFF', opacity: 0.55, hollow: false },
  inactive: { fill: 'transparent', border: RIDER_GREEN, opacity: 1, hollow: true },
  dark: { fill: '#6B6B70', border: '#3A3A3E', opacity: 1, hollow: false },
  dormant: { fill: SLEEP_VIOLET, border: '#FFFFFF', opacity: 0.85, hollow: false },
};

// Captain is a letter badge; SAG (support) is the van glyph below. Members/guests
// get no badge. (W213: 'support' moved off the letter badge onto the van.)
const ROLE_BADGE: Partial<Record<FleetParticipant['role'], string>> = {
  captain: 'C',
};

// W213 — SAG distinctive marker (PoC interim). A white rounded-square badge (a
// shape distinct from the Captain's round "C") holding a dark van silhouette, so
// the support VEHICLE reads at a glance. White + dark avoids the reserved palette
// (red=SOS, blue=own, green=active, violet=sleep, grey=Dark, amber=beacon ring)
// and stays sunlight-readable (§5.1). Drawn from primitives so it rasterizes
// cleanly into the Android marker bitmap.
const VAN_DARK = '#0E0E10';
const SagVanBadge: React.FC = () => (
  <View style={styles.sagBadge}>
    <Svg width={14} height={14} viewBox="0 0 24 24">
      {/* body */}
      <Rect x="3" y="7" width="16" height="7.5" rx="2" fill={VAN_DARK} />
      {/* windshield */}
      <Rect x="5" y="8.8" width="4.5" height="3" rx="0.6" fill="#FFFFFF" />
      {/* wheels */}
      <Circle cx="8" cy="16.3" r="2" fill={VAN_DARK} />
      <Circle cx="15" cy="16.3" r="2" fill={VAN_DARK} />
    </Svg>
  </View>
);

interface Props {
  participant: FleetParticipant;
  tappable: boolean; // canOpenSheet(myRole, participant.role) — OR an active beacon the viewer may cancel (W173)
  // W173: pulsing high-visibility distress state. The CALLER gates this with
  // canSeeBeacon (Captain/SAG + self only) — this component just renders it.
  beaconActive?: boolean;
  onPress: (participant: FleetParticipant) => void;
}

const RiderMarker: React.FC<Props> = ({ participant, tappable, beaconActive, onPress }) => {
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!beaconActive) {
      ring.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 900, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [beaconActive, ring]);

  // CRITICAL (cross-device fleet bug): react-native-maps renders a custom marker
  // child to a BITMAP on Android. With tracksViewChanges permanently false, that
  // snapshot is taken before the dot <View> has laid out → a BLANK, frozen marker
  // (every rider's dot was invisible; only a beacon's re-render forced a repaint,
  // which is why a dot appeared only under SOS). Track changes until the view has
  // painted (and continuously while a beacon ring animates), then freeze for map
  // performance. Re-track briefly whenever the dot's bitmap actually changes
  // (tactical state / role badge); coordinate moves don't need a re-snapshot.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    if (beaconActive) {
      setTracksViewChanges(true); // keep repainting so the pulse animates
      return;
    }
    // Re-arm a fresh bitmap snapshot whenever the marker's visual inputs change
    // — mount, tactical state, role badge, AND every position update. Android can
    // take >1s to paint a custom marker child the first time; freezing too early
    // (the original bug) left it permanently blank. A generous 1.5s window plus
    // re-arming on each ping means a marker that missed its first paint becomes
    // visible on the next position update, then freezes for map performance.
    setTracksViewChanges(true);
    const t = setTimeout(() => setTracksViewChanges(false), 1500);
    return () => clearTimeout(t);
  }, [
    beaconActive,
    participant.state,
    participant.role,
    participant.position?.lat,
    participant.position?.lng,
  ]);

  if (!participant.position) return null;
  const s = STATE_STYLE[participant.state];
  const badge = ROLE_BADGE[participant.role];

  return (
    <Marker
      coordinate={{
        latitude: participant.position.lat,
        longitude: participant.position.lng,
      }}
      tracksViewChanges={tracksViewChanges}
      // Role gate, not a style choice: non-tappable markers must not open a
      // sheet even via the native press path (R3-10/R3-17).
      onPress={() => {
        if (tappable) onPress(participant);
      }}
      tappable={tappable}
    >
      <View style={[styles.markerWrap, { opacity: beaconActive ? 1 : s.opacity }]}>
        {beaconActive ? (
          <Animated.View
            style={[
              styles.beaconRing,
              {
                opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
                transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.8] }) }],
              },
            ]}
          />
        ) : null}
        <View
          style={[
            styles.dot,
            {
              // SOS overrides everything to solid red; otherwise green by state.
              backgroundColor: beaconActive ? SOS_RED : s.hollow ? 'transparent' : s.fill,
              borderColor: beaconActive ? '#FFFFFF' : s.border,
              borderWidth: beaconActive ? 2 : s.hollow ? 3 : 2,
            },
          ]}
        />
        {participant.role === 'support' ? (
          <SagVanBadge />
        ) : badge ? (
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
  // W213 — SAG van badge: white rounded-SQUARE (distinct from the Captain's round
  // "C") with a dark border, larger than the letter badge so it pops.
  sagBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: VAN_DARK,
  },
  // Sunlight-readable distress ring (§5.1) — amber, expanding, unmistakable.
  beaconRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: '#F59E0B',
    borderWidth: 4,
  },
});

export default React.memo(RiderMarker);
