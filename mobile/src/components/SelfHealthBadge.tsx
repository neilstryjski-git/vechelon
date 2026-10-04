// W285 — the R3-40 self-health badge: a BINARY overlay on the rider's own position (Ledger A3,
// D-G33-A3-01). Rendered ONLY in the not-reaching state (absent = reaching), so its existence is the
// signal — no animation, no second state, no swatch in the ladder (overlays are presentations, not
// rungs). It carries NO position of its own: the caller passes the coordinate of the ONE self glyph
// on screen — the live OS blue dot (via MapView onUserLocationChange, review r1: the engine's last
// fix is frozen exactly while this badge shows) or, during an own SOS, the red beacon marker's
// myCoords (the OS dot is suppressed then). One position, ever (D79).
//
// Geometry (D-G33-A3-01, chosen values logged in log_of_changes): static; badge centre at
// (+12, −12) dp from the marker centre = 1:30 o'clock, 17 dp radial → non-concentric with the 26 dp
// dot (r 13) and the 44 dp beacon ring (the pulse and the OS accuracy halo own that channel);
// zIndex above the beacon marker (which sets none); a non-flat Marker never rotates with bearing
// (screen-anchored); 16 dp = half the 26 dp dot rounded UP to the legibility floor, with a 2 dp
// white ring. Fixed colour OUTSIDE tenant theming (RiderMarker's SOS_RED pattern — no useTheme):
// near-black ink + white ring is distinct from rider green, SOS red, sleep violet, beacon amber,
// Dark grey, cluster red and the OS blue dot, and has the highest sunlight contrast (§5.1).
//
// `cluster={false}` is LOAD-BEARING: react-native-map-clustering counts every Marker child whose
// `cluster` prop is not false as a point; the own-beacon marker sits at the identical coordinate, so
// without this the two would collapse into a red "2" cluster for a Captain/SAG viewer.

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { LatLng } from '../lib/geo';

export const HEALTH_INK = '#111111'; // fixed, outside theming
export const HEALTH_RING = '#FFFFFF';
export const HEALTH_BADGE_DP = 16;
const WRAP_DP = 48; // matches RiderMarker's markerWrap so the offset geometry is shared

const SelfHealthBadge: React.FC<{ coordinate: LatLng }> = ({ coordinate }) => {
  // Android bitmap gotcha (RiderMarker's proven pattern): track view changes until the first paint
  // has landed, then freeze. Content is static and the badge mounts fresh each time it appears.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker
      coordinate={{ latitude: coordinate.lat, longitude: coordinate.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={10}
      tappable={false}
      // @ts-expect-error react-native-map-clustering reads this prop off children; not in the Marker typings
      cluster={false}
      tracksViewChanges={tracks}
      onPress={() => {}}
      accessibilityLabel="Your position may not be reaching the group"
    >
      <View style={styles.wrap}>
        <View style={styles.badge}>
          <Text style={styles.mark}>!</Text>
        </View>
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  wrap: { width: WRAP_DP, height: WRAP_DP, backgroundColor: 'transparent' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: HEALTH_BADGE_DP,
    height: HEALTH_BADGE_DP,
    borderRadius: HEALTH_BADGE_DP / 2,
    backgroundColor: HEALTH_INK,
    borderWidth: 2,
    borderColor: HEALTH_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', lineHeight: 11 },
});

export default React.memo(SelfHealthBadge);
