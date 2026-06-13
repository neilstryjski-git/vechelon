import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import type RNMapView from 'react-native-maps';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { supabase } from '../lib/supabase';
import { useRideDetails } from '../hooks/useRideDetails';
import { useRideChannel } from '../hooks/useRideChannel';
import { useFleetPositions, useRideRoster } from '../hooks/useFleetPositions';
import { useBeacons } from '../hooks/useBeacons';
import { visibleParticipants, canOpenSheet, canExpandCluster, FleetParticipant } from '../lib/roleVisibility';
import { canSeeBeacon, canCancelBeacon } from '../lib/beaconLogic';
import { initialBearingDeg, regionContains } from '../lib/geo';
import RiderMarker from '../components/RiderMarker';
import EdgeIndicator from '../components/EdgeIndicator';
import RiderBottomSheet from '../components/RiderBottomSheet';
import SupportBeacon from '../components/SupportBeacon';
import FullScreenQR from '../components/FullScreenQR';
import RideControls from './RideControls';
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

// Starting frame ~25m radius (street level) once the device position is known
// (≈ latitudeDelta 0.0006 at mid-latitudes). Used by the auto-centre and the
// Centre button (D53).
const START_ZOOM_DELTA = 0.0006;

const RideMapScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'RideMap'>>();
  const navigation = useNavigation();
  const rideId = route.params.rideId;

  const { ride, loading, error } = useRideDetails(rideId);
  const [myRiderId, setMyRiderId] = useState<string | null>(null);
  const { roster, refetchRoster } = useRideRoster(rideId);
  // ONE channel per ride, shared by positions and beacons (see useFleetPositions).
  const { channel, status } = useRideChannel(rideId);
  const { fleet, myCoords, channelStatus } = useFleetPositions(
    rideId,
    myRiderId,
    roster,
    ride?.thresholds,
    channel,
    status,
    refetchRoster,
  );

  // useBeacons reads coords on trigger (lat/long audit snapshot) via a ref so
  // the callback identity stays stable across GPS updates.
  const myCoordsRef = useRef<typeof myCoords>(null);
  myCoordsRef.current = myCoords;
  const getMyCoords = useCallback(() => myCoordsRef.current, []);
  const { beacons, myBeacon, triggerBeacon, cancelBeacon, error: beaconError } = useBeacons(
    rideId,
    ride?.tenantId ?? null,
    myRiderId,
    channel,
    status,
    getMyCoords,
  );

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setMyRiderId(data.user?.id ?? null));
  }, []);

  // D54: self-enrol the opener as a ride participant if they aren't one yet.
  // The fleet renders only riders in the (RLS-gated) roster, so a tenant member
  // who merely opens a ride they're not in would be invisible to the Captain and
  // have their own pings dropped. participant_insert_policy permits self-RSVP
  // (account_id = auth.uid()); role 'member' (the Captain self-RSVPs separately).
  // This is the staging in-app join — the prod-web QR is unnecessary for it.
  useEffect(() => {
    if (!myRiderId || !rideId) return;
    let cancelled = false;
    void (async () => {
      const { data: existing } = await supabase
        .from('ride_participants')
        .select('account_id')
        .eq('ride_id', rideId)
        .eq('account_id', myRiderId)
        .maybeSingle();
      if (cancelled || existing) return;
      const { error: rsvpErr } = await supabase
        .from('ride_participants')
        .insert({ ride_id: rideId, account_id: myRiderId, role: 'member', status: 'rsvpd' });
      if (rsvpErr) console.warn('[Rail3] self-RSVP failed', rsvpErr);
    })();
    return () => {
      cancelled = true;
    };
  }, [myRiderId, rideId]);

  const mapRef = useRef<RNMapView | null>(null);
  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<FleetParticipant | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const myRole = ride?.myRole ?? 'member';

  // §4.1: Captain/SAG see the whole fleet; Riders see Captain+SAG only.
  // Defense-in-depth: the RLS-gated roster already bounds what a Rider can
  // identify; this client-side filter re-asserts the §4.1 matrix on top.
  const visible = useMemo(
    () => (myRiderId ? visibleParticipants(myRole, myRiderId, fleet) : []),
    [myRiderId, myRole, fleet],
  );

  // R3-13/R3-14: indicator only when a finish exists AND is off-screen.
  const finishOffscreen = Boolean(ride?.finish && !regionContains(region, ride.finish));
  const finishBearing = ride?.finish
    ? initialBearingDeg({ lat: region.latitude, lng: region.longitude }, ride.finish)
    : 0;

  // R3-12: Centre button returns the camera to the device's current position,
  // zoomed to the ~25m starting frame.
  const centreOnMe = useCallback(() => {
    if (!myCoords) return;
    mapRef.current?.animateToRegion(
      {
        latitude: myCoords.lat,
        longitude: myCoords.lng,
        latitudeDelta: START_ZOOM_DELTA,
        longitudeDelta: START_ZOOM_DELTA,
      },
      300,
    );
  }, [myCoords]);

  // D53: auto-centre on the device the first time a GPS fix arrives, at the same
  // ~25m radius. FALLBACK_REGION is only a neutral placeholder until then — the
  // original "immediately replaced by device position" was never implemented.
  const hasAutoCentredRef = useRef(false);
  useEffect(() => {
    if (!myCoords || hasAutoCentredRef.current) return;
    hasAutoCentredRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: myCoords.lat,
        longitude: myCoords.lng,
        latitudeDelta: START_ZOOM_DELTA,
        longitudeDelta: START_ZOOM_DELTA,
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
        // D53: pass the ref OBJECT (not a callback). react-native-map-clustering
        // does `if (ref) ref.current = map` on the forwarded ref — that works for
        // a ref object but silently drops a CALLBACK ref (sets `.current` on the
        // function instead of calling it), which left mapRef null and made
        // animateToRegion a no-op (dead Centre button + no auto-centre).
        ref={mapRef}
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
        {visible.map((p) => {
          const beacon = beacons[p.riderId];
          // W173 pitfall (F-07 pending): beacons render for Captain/SAG + self
          // ONLY — myRiderId-keyed self-rendering is handled below.
          const showBeacon = Boolean(beacon) && myRiderId != null && canSeeBeacon(myRole, myRiderId, p.riderId);
          return (
            <RiderMarker
              key={p.riderId}
              participant={p}
              // An active beacon makes the marker tappable for Captain/SAG so
              // the sheet's Cancel Support is reachable (§4.1).
              tappable={canOpenSheet(myRole, p.role) || (showBeacon && myRiderId != null && canCancelBeacon(myRole, myRiderId, p.riderId))}
              beaconActive={showBeacon}
              onPress={setSelected}
            />
          );
        })}
        {/* Self-view confirmation (Feature 2): the rider's own icon is the OS
            blue dot, so an active own-beacon renders a pulsing marker at the
            device position. Visible to self by definition. */}
        {myBeacon && myCoords && myRiderId ? (
          <RiderMarker
            participant={{
              riderId: myRiderId,
              displayName: 'You',
              role: myRole,
              phone: null,
              accountStatus: null,
              state: 'active',
              position: myCoords,
              lastPingAt: Date.now(),
            }}
            tappable={false}
            beaconActive
            onPress={() => {}}
          />
        ) : null}
      </MapView>

      {/* Floating overlays — no persistent chrome during a ride (§5.1). */}
      <View style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.backChip} onPress={() => navigation.goBack()}>
          <Text style={styles.chipText}>‹ {ride.name}</Text>
        </TouchableOpacity>
        <View style={styles.topRight}>
          {channelStatus !== 'SUBSCRIBED' ? (
            <View style={styles.statusChip}>
              <Text style={styles.chipText}>
                {channelStatus === 'CHANNEL_ERROR' ? 'CHANNEL DENIED' : 'CONNECTING…'}
              </Text>
            </View>
          ) : null}
          {/* R3-27: QR display is available to ALL roles — any participant can
              help a latecomer join. */}
          <TouchableOpacity
            style={styles.qrChip}
            onPress={() => setQrOpen(true)}
            accessibilityLabel="Show ride QR code"
          >
            <Text style={styles.chipText}>QR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* §4.1: End Ride is Captain-only — SAG and Riders never mount this. */}
      {myRole === 'captain' ? <RideControls rideId={ride.id} getMyCoords={getMyCoords} /> : null}

      <FullScreenQR
        visible={qrOpen}
        qrCode={ride.qrCode}
        rideName={ride.name}
        onClose={() => setQrOpen(false)}
      />

      {finishOffscreen ? (
        <EdgeIndicator
          bearingDeg={finishBearing}
          viewWidth={mapSize.width}
          viewHeight={mapSize.height}
        />
      ) : null}

      {/* W173: the highest-priority single-tap action — bottom-left thumb reach. */}
      <SupportBeacon
        active={Boolean(myBeacon)}
        onTrigger={() => void triggerBeacon()}
        onCancel={() => {
          if (myBeacon) void cancelBeacon(myBeacon);
        }}
      />
      {beaconError ? (
        <View style={styles.beaconErrorChip}>
          <Text style={styles.beaconErrorText}>{beaconError}</Text>
        </View>
      ) : null}

      {/* One-thumb reach (§5.1): bottom-right, 64dp. */}
      <TouchableOpacity
        style={[styles.centreButton, !myCoords && styles.centreButtonDisabled]}
        onPress={centreOnMe}
        disabled={!myCoords}
        accessibilityLabel={myCoords ? 'Centre on my position' : 'Waiting for GPS fix'}
      >
        <Text style={styles.centreGlyph}>◎</Text>
      </TouchableOpacity>

      <RiderBottomSheet
        participant={selected}
        myRole={myRole}
        onClose={() => setSelected(null)}
        onCancelBeacon={
          selected && myRiderId && beacons[selected.riderId] &&
          canCancelBeacon(myRole, myRiderId, selected.riderId)
            ? () => void cancelBeacon(beacons[selected.riderId])
            : null
        }
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
  topRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  qrChip: {
    backgroundColor: '#0E0E10E6',
    borderColor: '#FFFFFF',
    borderWidth: 1,
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
  centreButtonDisabled: { opacity: 0.35 },
  beaconErrorChip: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 124,
    backgroundColor: '#7F1D1D',
    borderRadius: 10,
    padding: 12,
  },
  beaconErrorText: { color: '#FFFFFF', fontSize: 12, lineHeight: 17 },
  centreGlyph: { color: '#FFFFFF', fontSize: 26 },
});

export default RideMapScreen;
