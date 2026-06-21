import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';

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
// Tactical state sets the COLOUR. W213: SAG (support) ALSO differs by ROLE — it
// renders as a distinct SHIELD SHAPE (not the circular dot), still COLOURED BY
// STATE (shape = role, colour = state), with the SOS-red override. This deviates
// from Pillar II Feature 1 "icon by tactical state only" (the icon now differs by
// role) — ratified by the Sr PM for the PoC, to be authored into the Rail 3a
// production Pillar. Captain keeps the small "C" badge; members/guests get the dot.

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

// Captain is a small letter badge; members/guests get none. SAG (support) is NOT a
// badge — it renders as a SHIELD-shaped marker (see SHIELD_PATH + the render).
const ROLE_BADGE: Partial<Record<FleetParticipant['role'], string>> = {
  captain: 'C',
};

// W213 — the SAG marker shape: a shield (24x24 viewBox), FILLED by the tactical-
// state colour and stroked like the dot. It's the whole CENTERED marker (not a
// corner badge), so it avoids the marker-bitmap-bounds clipping the van interim hit
// and reads as a distinct role at a glance while its state colour still shows.
const SHIELD_PATH = 'M12 2 L20 5 L20 11 C20 16.5 16.5 20 12 21.5 C7.5 20 4 16.5 4 11 L4 5 Z';

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
        {participant.role === 'support' ? (
          // W213 — SAG: a state-coloured SHIELD instead of the dot (shape = role,
          // colour = state; SOS-red override). Centered, so no corner clipping.
          <Svg width={30} height={30} viewBox="0 0 24 24">
            <Path
              d={SHIELD_PATH}
              fill={beaconActive ? SOS_RED : s.hollow ? 'transparent' : s.fill}
              stroke={beaconActive ? '#FFFFFF' : s.border}
              strokeWidth={beaconActive ? 1.5 : s.hollow ? 2 : 1.5}
            />
          </Svg>
        ) : (
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
        )}
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
