import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { PROVIDER_GOOGLE, Region, MapMarker } from 'react-native-maps';
import type RNMapView from 'react-native-maps';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { useRideDetails } from '../hooks/useRideDetails';
import { useFleetPositions, useMyFleetIdentity } from '../hooks/useFleetPositions';
import { visibleParticipants, canOpenSheet, canExpandCluster, FleetParticipant } from '../lib/roleVisibility';
import { initialBearingDeg, regionContains } from '../lib/geo';
import RiderMarker from '../components/RiderMarker';
import EdgeIndicator from '../components/EdgeIndicator';
import RiderBottomSheet from '../components/RiderBottomSheet';
import type { RootStackParamList } from '../navigation/RootNavigator';

// W172 — the live fleet map. Full-bleed canvas, floating overlay controls
// (§5.1): Centre button, Edge Indicator toward an off-screen finish, role-gated
// markers and Bottom Sheet (§4.1), clustering with tap-to-expand (Captain/SAG).
// Positions render exclusively from the Broadcast channel — zero DB reads or
// writes per ping (Pillar II §2). The Google Maps canvas itself is excluded
// from tenant branding in MVP (§5.2).

const FALLBACK_REGION: Region = {
  // Neutral wide view until the first GPS fix arrives; immediately replaced by
  // the device position. Never used for any data decision.
  latitude: 43.65,
  longitude: -79.38,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const RideMapScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'RideMap'>>();
  const navigation = useNavigation();
  const rideId = route.params.rideId;

  const { ride, loading, error } = useRideDetails(rideId);
  const { me } = useMyFleetIdentity(rideId);
  const { fleet, myCoords, channelStatus } = useFleetPositions(rideId, me);

  const mapRef = useRef<RNMapView | null>(null);
  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<FleetParticipant | null>(null);

  const myRole = ride?.myRole ?? 'member';

  // §4.1: Captain/SAG see the whole fleet; Riders see Captain+SAG only.
  const visible = useMemo(
    () => (me ? visibleParticipants(myRole, me.riderId, fleet) : []),
    [me, myRole, fleet],
  );

  // R3-13/R3-14: indicator only when a finish exists AND is off-screen.
  const finishOffscreen = Boolean(ride?.finish && !regionContains(region, ride.finish));
  const finishBearing = ride?.finish
    ? initialBearingDeg({ lat: region.latitude, lng: region.longitude }, ride.finish)
    : 0;

  // R3-12: Centre button returns the camera to the device's current position.
  const centreOnMe = useCallback(() => {
    if (!myCoords) return;
    mapRef.current?.animateToRegion(
      {
        latitude: myCoords.lat,
        longitude: myCoords.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      300,
    );
  }, [myCoords]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>Loading ride…</Text>
      </View>
    );
  }
  if (error || !ride) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{error ?? 'Ride unavailable'}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => setMapSize(e.nativeEvent.layout)}
    >
      <MapView
        ref={(r: RNMapView) => {
          mapRef.current = r;
        }}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={FALLBACK_REGION}
        onRegionChangeComplete={setRegion}
        // Own blue dot in ALL states — the OS location dot, not a marker
        // (Feature 4: even a Dark rider sees their own true position).
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        // R3-11: clusters expand on tap — gated to Captain/SAG per §4.1.
        // Riders render ≤2 markers (Captain+SAG) so clusters cannot form; the
        // explicit flag keeps the gate by role, not by coincidence.
        clusteringEnabled={canExpandCluster(myRole)}
        clusterColor="#E11D2A"
        spiralEnabled={false}
      >
        {visible.map((p) => (
          <RiderMarker
            key={p.riderId}
            participant={p}
            tappable={canOpenSheet(myRole, p.role)}
            onPress={setSelected}
          />
        ))}
      </MapView>

      {/* Floating overlays — no persistent chrome during a ride (§5.1). */}
      <View style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.backChip} onPress={() => navigation.goBack()}>
          <Text style={styles.chipText}>‹ {ride.name}</Text>
        </TouchableOpacity>
        {channelStatus !== 'SUBSCRIBED' ? (
          <View style={styles.statusChip}>
            <Text style={styles.chipText}>
              {channelStatus === 'CHANNEL_ERROR' ? 'CHANNEL DENIED' : 'CONNECTING…'}
            </Text>
          </View>
        ) : null}
      </View>

      {finishOffscreen ? (
        <EdgeIndicator
          bearingDeg={finishBearing}
          viewWidth={mapSize.width}
          viewHeight={mapSize.height}
        />
      ) : null}

      {/* One-thumb reach (§5.1): bottom-right, 64dp. */}
      <TouchableOpacity
        style={styles.centreButton}
        onPress={centreOnMe}
        accessibilityLabel="Centre on my position"
      >
        <Text style={styles.centreGlyph}>◎</Text>
      </TouchableOpacity>

      <RiderBottomSheet
        participant={selected}
        myRole={myRole}
        onClose={() => setSelected(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0E0E10' },
  center: {
    flex: 1,
    backgroundColor: '#0E0E10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { color: '#9A9A9A', fontSize: 14 },
  topBar: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backChip: {
    backgroundColor: '#0E0E10E6',
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  statusChip: {
    backgroundColor: '#0E0E10E6',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  chipText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  centreButton: {
    position: 'absolute',
    right: 18,
    bottom: 40,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0E0E10E6',
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreGlyph: { color: '#FFFFFF', fontSize: 26 },
});

export default RideMapScreen;
