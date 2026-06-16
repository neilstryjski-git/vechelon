import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import type RNMapView from 'react-native-maps';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { selfRsvpWithIdentity } from '../lib/rideJoin';
import {
  promptOemExclusionOnFirstJoin,
  promptIfBatterySaverOn,
  acquireRideWakelock,
  releaseRideWakelock,
} from '../lib/batteryGuards';
import FirstRideExplainer from '../components/FirstRideExplainer';
import { useRideDetails } from '../hooks/useRideDetails';
import { useRideChannel, RIDE_ENDED_EVENT } from '../hooks/useRideChannel';
import { useFleetPositions, useRideRoster } from '../hooks/useFleetPositions';
import { useBeacons } from '../hooks/useBeacons';
import { visibleParticipants, canOpenSheet, canExpandCluster, FleetParticipant } from '../lib/roleVisibility';
import { canSeeBeacon, canCancelBeacon } from '../lib/beaconLogic';
import { initialBearingDeg, regionContains } from '../lib/geo';
import { logMeasurement } from '../lib/measure';
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
  // D63: enabled only after the W176 explainer flow grants BACKGROUND location.
  const [backgroundReady, setBackgroundReady] = useState(false);
  const { fleet, myCoords, channelStatus } = useFleetPositions(
    rideId,
    myRiderId,
    roster,
    ride?.thresholds,
    channel,
    status,
    refetchRoster,
    backgroundReady,
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

  // One build-stamped row per ride-open, so we can determine which build a device
  // is running EVEN when it never receives a ping (every measurement now carries
  // the build fingerprint; this guarantees at least one row exists per session).
  const stampedRef = useRef(false);
  useEffect(() => {
    if (stampedRef.current || !rideId || !myRiderId) return;
    stampedRef.current = true;
    void logMeasurement({ rideId, kind: 'app_state_change', payload: { event: 'ride_map_open' } });
  }, [rideId, myRiderId]);

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
      // W195: hydrate display_name/email from accounts so the captain + web Race
      // Control see a real name, not the 'Rider' fallback.
      const { error: rsvpErr } = await selfRsvpWithIdentity({
        rideId,
        accountId: myRiderId,
        role: 'member',
      });
      if (rsvpErr) console.warn('[Rail3] self-RSVP failed', rsvpErr);
    })();
    return () => {
      cancelled = true;
    };
  }, [myRiderId, rideId]);

  // D63 — after the W176 first-ride explainer is acknowledged, request BACKGROUND
  // location with proper rationale, fire the W177 battery advisories, hold the ride
  // wakelock, and (on grant) enable the background AppState handoff. The explainer
  // calls onDismiss immediately when it was already seen, so returning riders still
  // (re)establish background tracking each ride. Graceful denial (§5): if BACKGROUND
  // is denied, foreground-only tracking still runs — we just never flip backgroundReady.
  const handleExplainerDismiss = useCallback(async () => {
    if (!myRiderId) return;
    // Android requires FOREGROUND before BACKGROUND — request it first (idempotent
    // if the publish hook already prompted).
    const { status: fg } = await Location.requestForegroundPermissionsAsync().catch(
      () => ({ status: 'denied' as Location.PermissionStatus }),
    );
    if (fg !== 'granted') return;
    const { status: bg } = await Location.requestBackgroundPermissionsAsync().catch(
      () => ({ status: 'denied' as Location.PermissionStatus }),
    );
    // PoC/staging instrumentation: capture the actual grant result so the sink shows
    // — per device/OS — whether riders are reaching "Allow all the time" at all.
    void logMeasurement({ rideId, kind: 'ux_explainer_shown', payload: { fg, bg } });
    // Android 11+ reality: requestBackgroundPermissionsAsync does NOT show an inline
    // dialog after foreground is granted — the OS only grants "Allow all the time"
    // from the app's system Settings. So a silent `denied` here is the EXPECTED first
    // outcome, and the field walk's frozen-while-locked symptom. Guide the rider there
    // explicitly; the AppState re-check effect below picks up the grant when they return.
    if (bg !== 'granted') {
      Alert.alert(
        'Stay on the map when pocketed',
        'To keep sharing your position after your screen locks, set location access to "Allow all the time" in Settings. Without it, the group sees you go to sleep when you pocket your phone.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
        ],
      );
    }
    // W177 advisories fired AT JOIN (when the rider commits to a tracked ride) — the
    // conventional "you're starting an activity that needs background power" moment,
    // not reactively at screen-lock. One-time OEM battery-exclusion + a Battery-Saver
    // check (only alerts if it's actually on). Android-only no-ops elsewhere; both
    // advisory, never blocking.
    void promptOemExclusionOnFirstJoin(myRiderId);
    void promptIfBatterySaverOn('join');
    void acquireRideWakelock();
    setBackgroundReady(bg === 'granted');
  }, [myRiderId, rideId]);

  // Derive backgroundReady from the OS permission as GROUND TRUTH — on mount AND
  // whenever the app returns to foreground — NOT solely from the one-shot request in
  // handleExplainerDismiss (which races myRiderId / the already-seen explainer, so a
  // pre-granted "Allow all the time" could be missed for the whole session — the
  // field-walk symptom). AppState listeners don't fire on mount, so the initial
  // check() is essential; the 'active' re-check also catches a grant just made in
  // system Settings. This makes the FGS branch deterministic when the grant exists.
  useEffect(() => {
    const check = () =>
      Location.getBackgroundPermissionsAsync()
        .then(({ status }) => setBackgroundReady(status === 'granted'))
        .catch(() => {});
    void check(); // initial — listener below only fires on CHANGES
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => sub.remove();
  }, []);

  // Release the ride wakelock when leaving the ride.
  useEffect(() => {
    return () => {
      releaseRideWakelock();
    };
  }, []);

  const mapRef = useRef<RNMapView | null>(null);
  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  // D56: whether the camera is following the device dot. A manual pan disengages it
  // (so you can look around); the Centre button re-engages. On from the first fix.
  const [following, setFollowing] = useState(true);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<FleetParticipant | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const myRole = ride?.myRole ?? 'member';

  // D57 — leave the live map when the ride ends. The captain ends it itself (in
  // RideControls) and navigates there; only NON-captains react here. Guard against
  // double-firing once we've left.
  const leftEndedRef = useRef(false);

  // (a) Live: the captain's RIDE_ENDED_EVENT broadcast. Bind only once the ride is
  // loaded (so myRole is final, not the pre-load 'member') and never for the captain.
  useEffect(() => {
    if (!channel || !ride || myRole === 'captain') return;
    channel.on('broadcast', { event: RIDE_ENDED_EVENT }, () => {
      if (leftEndedRef.current) return;
      leftEndedRef.current = true;
      Alert.alert('Ride ended', 'The captain has ended this ride.');
      navigation.goBack();
    });
  }, [channel, ride, myRole, navigation]);

  // (b) Fresh open of an already-saved ride: a non-captain who opens a ride that is
  // no longer Active gets the same leave-the-map treatment (the broadcast is
  // ephemeral, so a late joiner relies on ride.status).
  useEffect(() => {
    if (!ride || myRole === 'captain' || leftEndedRef.current) return;
    if (ride.status !== 'active') {
      leftEndedRef.current = true;
      Alert.alert('Ride ended', 'This ride has already ended.');
      navigation.goBack();
    }
  }, [ride, myRole, navigation]);

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
    setFollowing(true); // D56: tapping Centre re-engages follow
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

  // Fit-all (W201): frame the whole role-VISIBLE fleet + self. CRITICAL — built from
  // `visible` (the §4.1 role-gated set), NEVER raw `fleet`: a Rider's frame must only
  // ever include Captain+SAG, or the camera BOUNDS would leak peer positions even
  // though no marker renders (QA R3-FIT-B). Self (the OS blue dot, absent from
  // `visible`) is added so you always see yourself relative to the fleet (R3-FIT-F).
  const fitAllCoords = useMemo(() => {
    const cs = visible
      .filter((p) => p.position)
      .map((p) => ({ latitude: p.position!.lat, longitude: p.position!.lng }));
    if (myCoords) cs.push({ latitude: myCoords.lat, longitude: myCoords.lng });
    return cs;
  }, [visible, myCoords]);

  const fitAll = useCallback(() => {
    if (fitAllCoords.length === 0) return;
    setFollowing(false); // D56: framing the fleet disengages dot-follow so it can't yank back
    if (fitAllCoords.length === 1) {
      // One point: fitToCoordinates over-zooms to max — use the street-level frame.
      const c = fitAllCoords[0];
      mapRef.current?.animateToRegion(
        { latitude: c.latitude, longitude: c.longitude, latitudeDelta: START_ZOOM_DELTA, longitudeDelta: START_ZOOM_DELTA },
        300,
      );
      return;
    }
    mapRef.current?.fitToCoordinates(fitAllCoords, {
      // Keep markers clear of the floating chrome (top bar + bottom buttons).
      edgePadding: { top: 120, right: 64, bottom: 150, left: 64 },
      animated: true,
    });
  }, [fitAllCoords]);

  // D56 (subsumes the D53 one-time auto-centre): keep the device dot in view while
  // riding. When following, re-centre on each new fix — street zoom (~25m) on the FIRST
  // fix, preserving the operator's current zoom thereafter. A manual pan disengages
  // following; the Centre button re-engages it. regionRef gives the live zoom without
  // re-running this effect on every camera move.
  const regionRef = useRef(region);
  regionRef.current = region;
  const hasInitialCentredRef = useRef(false);
  useEffect(() => {
    if (!following || !myCoords) return;
    const latDelta = hasInitialCentredRef.current ? regionRef.current.latitudeDelta : START_ZOOM_DELTA;
    const lngDelta = hasInitialCentredRef.current ? regionRef.current.longitudeDelta : START_ZOOM_DELTA;
    hasInitialCentredRef.current = true;
    mapRef.current?.animateToRegion(
      { latitude: myCoords.lat, longitude: myCoords.lng, latitudeDelta: latDelta, longitudeDelta: lngDelta },
      300,
    );
  }, [myCoords, following]);

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
        // D56: a manual pan disengages dot-follow (programmatic animateToRegion does NOT
        // fire onPanDrag, so following only stops on a real user gesture).
        onPanDrag={() => setFollowing(false)}
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
          // W206 (§4.1 amended): self + Captain/SAG see all beacons, AND every
          // rider sees a COMMAND rider's SOS (the Captain/SAG is already on the
          // map). Peer member→member beacons stay hidden (F-07 still pending) —
          // p.role is the beacon OWNER's role, which gates that command case.
          const showBeacon = Boolean(beacon) && myRiderId != null && canSeeBeacon(myRole, myRiderId, p.riderId, p.role);
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
          {/* D58: QR hidden for the PoC. buildRideJoinUrl points at the PROD web
              host (vechelon.ca), which 404s on the staging field test, and testers
              join via the in-app ride button (tap-to-join, D54), so the QR is
              redundant. The real fix (QR → rail3://ride/<id> app deep link) is
              deferred to promotion — tracked as a W197 blocker. To restore: re-add
              the QR chip below (state qrOpen / FullScreenQR are kept wired).
          <TouchableOpacity
            style={styles.qrChip}
            onPress={() => setQrOpen(true)}
            accessibilityLabel="Show ride QR code"
          >
            <Text style={styles.chipText}>QR</Text>
          </TouchableOpacity> */}
        </View>
      </View>

      {/* §4.1: End Ride is Captain-only — SAG and Riders never mount this. */}
      {myRole === 'captain' ? (
        <RideControls rideId={ride.id} getMyCoords={getMyCoords} channel={channel} />
      ) : null}

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

      {/* W201 fit-all-riders: stacked above the Centre button; disabled with no fleet. */}
      <TouchableOpacity
        style={[styles.fitAllButton, fitAllCoords.length === 0 && styles.centreButtonDisabled]}
        onPress={fitAll}
        disabled={fitAllCoords.length === 0}
        accessibilityLabel="Fit all riders in view"
      >
        <Text style={styles.centreGlyph}>⛶</Text>
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

      {/* W176 first-ride explainer: self-gates (shows once per rider), then its
          onDismiss drives the D63 background-permission + W177 battery flow. */}
      {myRiderId ? (
        <FirstRideExplainer riderId={myRiderId} onDismiss={handleExplainerDismiss} />
      ) : null}
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
  fitAllButton: {
    position: 'absolute',
    right: 18,
    bottom: 116,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0E0E10E6',
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
