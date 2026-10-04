import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView from 'react-native-map-clustering';
import { PROVIDER_GOOGLE, Marker, Polyline, Region } from 'react-native-maps';
import type RNMapView from 'react-native-maps';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';

import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { selfRsvpWithIdentity, markRail3Joined, markRail3Rejoined } from '../lib/rideJoin';
import {
  promptOemExclusionOnFirstJoin,
  promptIfBatterySaverOn,
  watchBatterySaverOnScreenLock,
  acquireRideWakelock,
  releaseRideWakelock,
} from '../lib/batteryGuards';
import FirstRideExplainer from '../components/FirstRideExplainer';
import { useRideDetails } from '../hooks/useRideDetails';
import { useRideChannel, RIDE_ENDED_EVENT } from '../hooks/useRideChannel';
import { useFleetPositions, useRideRoster } from '../hooks/useFleetPositions';
import { broadcastDeparture, awaitPendingDeparture } from '../lib/backgroundLocation';
import { clearActiveRide, clearPersistedActiveRide } from '../lib/activeRide';
import { useRideEndWatch } from '../hooks/useRideEndWatch';
import { useBeacons } from '../hooks/useBeacons';
import { useBreadcrumb } from '../hooks/useBreadcrumb';
import { visibleParticipants, canOpenSheet, canExpandCluster, FleetParticipant } from '../lib/roleVisibility';
import { canSeeBeacon, canCancelBeacon, isStaleUnderBeacon, anchorBeaconedFleet } from '../lib/beaconLogic';
import { canEndRide } from '../lib/rideControlsLogic';
import { deriveRenderState } from '../state/riderState';
import { initialBearingDeg, regionContains } from '../lib/geo';
import { logMeasurement } from '../lib/measure';
import RiderMarker from '../components/RiderMarker';
import SelfHealthBadge from '../components/SelfHealthBadge';
import { useSelfHealth, isSelfHealthPromptActiveNow } from '../hooks/useSelfHealth';
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

// Starting frame ~70m radius (street level + breathing room) once the device
// position is known (≈ latitudeDelta 0.0018 at mid-latitudes). Used by the
// auto-centre, the start-frame (W244) and the Centre button (D53). Widened 3×
// from the original 0.0006 — the ~25m frame read as too tight on recenter (Neil,
// 2026-06-28); this keeps nearby riders/road context in view.
const START_ZOOM_DELTA = 0.0018;

const RideMapScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'RideMap'>>();
  const navigation = useNavigation();
  const rideId = route.params.rideId;

  // `loading` is intentionally not consumed: W244 render-first means we never gate
  // the screen on it — the map shell mounts immediately and ride fields hydrate async.
  const { ride, error } = useRideDetails(rideId);
  // D77 — identity comes from the LIVE session, never a snapshot. This was a one-shot
  // supabase.auth.getUser() in a useEffect with deps [], pinned into state: it captured
  // whoever was signed in when the map mounted and never looked again. myRiderId is threaded
  // into every broadcast, DB write, role gate and beacon below, so a stale value made the app
  // ACT AS the previous user — while three sibling call sites read the session live, producing
  // a split identity (broadcast as A, written as B under B's token). RootNavigator remounts
  // this subtree on a user change, so this stays correct for the whole life of the screen.
  const { session } = useAuth();
  const myRiderId = session?.user?.id ?? null;
  const { roster, refetchRoster } = useRideRoster(rideId);
  // ONE channel per ride, shared by positions and beacons (see useFleetPositions).
  const { channel, status } = useRideChannel(rideId);
  // D63: enabled only after the W176 explainer flow grants BACKGROUND location.
  const [backgroundReady, setBackgroundReady] = useState(false);
  const { fleet, myCoords, channelStatus } = useFleetPositions(
    rideId,
    myRiderId,
    roster,
    ride?.leaderId ?? null,
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
  const { beacons, myBeacon, triggerBeacon, cancelBeacon, error: beaconError, clearLocalBeacons } = useBeacons(
    rideId,
    ride?.tenantId ?? null,
    myRiderId,
    channel,
    status,
    getMyCoords,
  );

  // W212 — ride-leader breadcrumb: the LEADER's accumulated trail, sourced from the shared 'pos'
  // broadcast (no new channel). Toggle (default ON) gates the RENDER only; the hook keeps
  // accumulating so toggling back on shows the full line.
  //
  // D80: the leader is the account that STARTED the ride (ride.leaderId ← rides.started_by), read
  // from the ride row — NOT the first captain-roled row in the roster, which elected a phantom.
  // W285 (R3-40 / A3): the self-health clocks — inert until the operator config rows carry W279's
  // measured values; never a tenant threshold; advisory only.
  const selfHealth = useSelfHealth(rideId);
  // W285 review r1 (CRITICAL — one position, ever): while not reaching there are by definition no
  // fresh ENGINE fixes, so `myCoords` is frozen at the last one, but the OS blue dot is drawn live by
  // the Maps SDK. Anchoring the badge to myCoords would show a moving rider a frozen glyph beside
  // their moving dot — a second self position (D79). So the badge rides the OS dot's own coordinate
  // (MapView onUserLocationChange). Memory-only: never stored, broadcast or logged (Pillar II §2).
  // Kept in a ref always; copied into state ONLY while the badge is showing, so a healthy ride does
  // not re-render on every OS location tick.
  const osCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [osCoords, setOsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const badgeShowingRef = useRef(false);
  badgeShowingRef.current = selfHealth.notReaching;
  useEffect(() => {
    if (selfHealth.notReaching) setOsCoords(osCoordsRef.current);
  }, [selfHealth.notReaching]);
  const onUserLocationChange = useCallback(
    (e: { nativeEvent: { coordinate?: { latitude: number; longitude: number } } }) => {
      const c = e.nativeEvent.coordinate;
      if (!c) return;
      const next = { lat: c.latitude, lng: c.longitude };
      osCoordsRef.current = next;
      if (badgeShowingRef.current) setOsCoords(next);
    },
    [],
  );

  // W290 (R3-72 / slate 9 / C1): segments (one polyline each, never joined across a capture gap),
  // liveness (live / stale / departed) and the departure instant for the cue.
  const {
    segments: breadcrumbSegments,
    live: breadcrumbLive,
    leaderDeparted,
    departedAtMs: leaderDepartedAtMs,
  } = useBreadcrumb(
    rideId,
    channel,
    ride?.leaderId ?? null,
    ride?.leaderSource ?? 'ride.created_by_fallback',
    ride?.thresholds,
  );
  // Cue dismissal is keyed to ONE departure instant: a later departure re-shows the banner.
  const [cueDismissedAt, setCueDismissedAt] = useState<number | null>(null);
  const [showBreadcrumb, setShowBreadcrumb] = useState(true);
  // Map the trail to Polyline coords ONCE per trail change, not on every render.
  // RideMapScreen re-renders on each fleet ping (~5s); without this memo the up-to-
  // 1500-point trail was re-mapped (and the array thrown away) every time. Keyed on
  // breadcrumbTrail so it only rebuilds when a new point is actually kept.
  const breadcrumbSegmentCoords = useMemo(
    () => breadcrumbSegments.map((seg) => seg.map((c) => ({ latitude: c.lat, longitude: c.lng }))),
    [breadcrumbSegments],
  );

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
      // W292: a quick leave → re-open must read the row AFTER the departure's UPDATE has landed, or
      // the mark would be stamped on a present rider with nothing left to clear it. Bounded wait;
      // no pending departure resolves immediately.
      await awaitPendingDeparture(rideId);
      if (cancelled) return;
      const { data: existing } = await supabase
        .from('ride_participants')
        .select('account_id, rail3_joined_at, departed_at')
        .eq('ride_id', rideId)
        .eq('account_id', myRiderId)
        .maybeSingle();
      if (cancelled) return;
      if (existing) {
        // W292 (R3-68): a row carrying the durable departed mark means THIS is a rejoin - a fresh
        // join in every respect: clear the mark and refresh rail3_joined_at in one statement.
        // Peers re-add us from our first live ping newer than the mark; their next last-known
        // fetch drops the mark. Best-effort; never blocks the open.
        if (existing.departed_at) {
          const { error: rejoinErr } = await markRail3Rejoined(rideId, myRiderId);
          if (rejoinErr) console.warn('[Rail3] markRail3Rejoined failed', rejoinErr);
          return;
        }
        // W288 (slate 17): an existing row (admin-added, web RSVP) becomes app-tracked the first
        // time the ride is opened in the app. Best-effort; never blocks the open.
        if (!existing.rail3_joined_at) {
          const { error: markErr } = await markRail3Joined(rideId, myRiderId);
          if (markErr) console.warn('[Rail3] markRail3Joined failed', markErr);
        }
        return;
      }
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

  // W280 (Ledger B3, R3-06): the screen-lock Battery Saver advisory, for the ride's duration.
  // Subscribed once tracking is engaged (backgroundReady) and unsubscribed on leave/unmount —
  // the effect's cleanup IS the unsubscribe, so there is exactly one listener per ride and
  // never a stacked one. Advisory only: it is never a precondition for anything (R3-49).
  // W285 (R3-40, §5.1 collision rule): the self-health signal is a MODULE-LEVEL function computed
  // synchronously from the engine signal store + operator config at the unlock edge, so this
  // effect's deps stay exactly [backgroundReady] (one subscription per ride) and the Saver watcher
  // reads the right answer ~1.2 s before the debounced self-health prompt itself would fire.
  useEffect(() => {
    if (!backgroundReady) return;
    return watchBatterySaverOnScreenLock({ isSelfHealthPromptActive: isSelfHealthPromptActiveNow });
  }, [backgroundReady]);

  const mapRef = useRef<RNMapView | null>(null);
  const [region, setRegion] = useState<Region>(FALLBACK_REGION);
  // D56: whether the camera is following the device dot. A manual pan disengages it
  // (so you can look around); the Centre button re-engages. On from the first fix.
  const [following, setFollowing] = useState(true);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<FleetParticipant | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const myRole = ride?.myRole ?? 'member';

  // W287 (slate 13 / A2) — CONVERGENT ride-end teardown. Re-reads persisted rides.status on mount,
  // on every resume signal and when the D57 RIDE_ENDED broadcast arrives (a trigger for the read,
  // never the decision); tears down only on an affirmative 'saved': local beacons cleared,
  // durable holder cleared, goBack → unmount removes the channel and stops the engine. Foreground
  // keeps the Alert (A2 foreground-only notification); backgrounded is silent. Replaces the old
  // one-shot ride.status effect, which could never converge after the open.
  const { endedRef, checkNow, markEnded } = useRideEndWatch(rideId, navigation, {
    clearLocalBeacons,
    // W291: the Captain who presses End Ride calls markEnded first, so the watch never decides for
    // them; every OTHER Captain is a co-Captain who should be told like anyone else. Muting all
    // captains would have left co-Captains with a silent teardown.
    iAmCaptain: false,
    ready: ride != null, // the ride row must resolve before the mount read
  });

  // D57 fast path: a captain's RIDE_ENDED_EVENT broadcast TRIGGERS the status read (RideControls
  // awaits the UPDATE before sending, so the read sees 'saved'); only the read acts. W291: bound for
  // EVERY role — a co-Captain's map must react to another Captain's End Ride in real time (the old
  // non-captain-only gate left it blind). The ending Captain has already called markEnded, so the
  // watch's endedRef makes their own echo a no-op. Bind once the ride is loaded.
  useEffect(() => {
    if (!channel || !ride) return;
    channel.on('broadcast', { event: RIDE_ENDED_EVENT }, () => checkNow('ride_ended_event'));
  }, [channel, ride, checkNow]);

  // D87: leaving the live ride map is a DELIBERATE departure — clear my marker for the fleet so
  // it doesn't linger as a greying phantom. Fires on genuine navigation-away (back / gesture /
  // the D57 ride-ended auto-leave). A D77 account-swap REMOUNT tears down via React (not a nav
  // pop), so it does NOT false-fire here — the swap/sign-out path is covered by AuthContext via
  // the active-ride holder. Fire-and-forget over REST so it escapes the unmount.
  //
  // W292 (C3 item 7): every path that pops this screen lands here - the back chip, the hardware
  // back / gesture, the W287 auto-leave (useRideEndWatch) and End Ride (RideControls). On the two
  // ride-end paths `endedRef.current = true` is set in the SAME synchronous continuation as the
  // goBack() that fires this listener (no await between them), so `clearLastKnown` is false there
  // by construction: no departed_at, last_* kept (R3-70). A Leave Ride mid-ride is a TRUE departure:
  // broadcastDeparture stamps the durable departed mark with the null-out.
  useEffect(() => {
    if (!rideId || !myRiderId) return;
    const unsub = navigation.addListener('beforeRemove', () => {
      // W286 (R3-67): a departure ends the ENGINE SESSION too — clear the durable holder first so
      // neither the headless task nor the heartbeat re-assert can re-engage this ride.
      clearPersistedActiveRide();
      // W292: on a RIDE-END teardown clear the in-memory holder too - a Saved ride has nothing to
      // depart from, so a later sign-out must not find it and "depart" (nulling last_* and stamping
      // departed_at on a Saved ride). Mid-ride the in-memory holder deliberately SURVIVES this
      // unmount so a sign-out from Home still departs the live ride (D87).
      if (endedRef.current) clearActiveRide();
      // W287 (R3-70): on a RIDE-END teardown the 'departed' broadcast still goes out, but my
      // last-known is NOT nulled — on a Saved ride it persists to the T+4h purge.
      void broadcastDeparture(rideId, myRiderId, { clearLastKnown: !endedRef.current });
    });
    return unsub;
  }, [navigation, rideId, myRiderId, endedRef]);

  // §4.1: Captain/SAG see the whole fleet; Riders see Captain+SAG only.
  // Defense-in-depth: the RLS-gated roster already bounds what a Rider can
  // identify; this client-side filter re-asserts the §4.1 matrix on top.
  // W282 (R3-55 render half): before the §4.1 filter, anchor beaconed riders at their raise-time
  // last-known when the fleet's position is older (or missing — a reconnect can adopt a beacon
  // before the fleet's own last-known fetch has run). Live newer than the anchor always wins.
  const anchoredFleet = useMemo(
    () =>
      anchorBeaconedFleet(
        fleet,
        beacons,
        (id) => roster[id] ?? null,
        (ts) => deriveRenderState('stopped', ts, Date.now(), ride?.thresholds),
      ),
    [fleet, beacons, roster, ride?.thresholds],
  );
  const visible = useMemo(
    () => (myRiderId ? visibleParticipants(myRole, myRiderId, anchoredFleet) : []),
    [myRiderId, myRole, anchoredFleet],
  );

  // R3-13/R3-14: indicator only when a finish exists AND is off-screen.
  const finishOffscreen = Boolean(ride?.finish && !regionContains(region, ride.finish));
  const finishBearing = ride?.finish
    ? initialBearingDeg({ lat: region.latitude, lng: region.longitude }, ride.finish)
    : 0;

  // R3-12: Centre button returns the camera to the device's current position,
  // zoomed to the ~70m starting frame (START_ZOOM_DELTA).
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

  // W244 — until the first position (a seeded last-known fix or the first live TS
  // fix) arrives, frame the camera on the ride's start so the opener sees the right
  // place immediately instead of the neutral fallback region. Runs once when the
  // ride resolves; if myCoords is already present (last-known seeded faster) this
  // no-ops and the follow effect above owns the camera.
  const hasFramedStartRef = useRef(false);
  useEffect(() => {
    if (hasFramedStartRef.current || myCoords || !ride?.start) return;
    hasFramedStartRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: ride.start.lat,
        longitude: ride.start.lng,
        latitudeDelta: START_ZOOM_DELTA,
        longitudeDelta: START_ZOOM_DELTA,
      },
      300,
    );
  }, [ride, myCoords]);

  // W244 render-first: only a HARD error short-circuits the live map. While `ride`
  // is still loading (null, no error) we render the map shell immediately — the
  // full-screen "Loading ride…" gate is off the perceived-start critical path, and
  // every ride-dependent overlay below null-guards on `ride`.
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>{error}</Text>
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
        onUserLocationChange={onUserLocationChange}
        // D56: a manual pan disengages dot-follow (programmatic animateToRegion does NOT
        // fire onPanDrag, so following only stops on a real user gesture).
        onPanDrag={() => setFollowing(false)}
        // Own blue dot — the OS location dot, not a marker (Feature 4: even a Dark rider sees
        // their own true position).
        //
        // SUPPRESSED DURING YOUR OWN SOS. The blue dot is drawn by the Google Maps SDK and its
        // colour is NOT ours to change — react-native-maps exposes no way to restyle it. So with
        // an active own-beacon the rider saw TWO dots for one person: the blue OS dot AND the red
        // pulsing beacon marker below, side by side, at the single worst moment to be ambiguous
        // about where you are. Hiding the OS dot leaves the red pulsing marker as the sole self
        // indicator — which is the intent: one dot, and it is red.
        //
        // The `myCoords` half of the guard is load-bearing: only hand the job over when there is
        // actually a red marker to hand it to. The beacon can fire before the first GPS fix lands
        // (useBeacons inserts lat/long as null in that case), and without this the rider would be
        // left with NO self dot at all during an SOS — strictly worse than two.
        showsUserLocation={!(myBeacon && myCoords)}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        // R3-11: clusters expand on tap — gated to Captain/SAG per §4.1.
        // Riders render ≤2 markers (Captain+SAG) so clusters cannot form; the
        // explicit flag keeps the gate by role, not by coincidence.
        clusteringEnabled={canExpandCluster(myRole)}
        clusterColor="#E11D2A"
        spiralEnabled={false}
      >
        {/* W212 — ride-leader breadcrumb. Rendered FIRST so it sits BELOW the rider
            markers (z-order = JSX order). Provisional colour/width — a Feature-6-style
            design pass (legible in sunlight, must not occlude rider icons) is pending. */}
        {/* W290 (R3-72, C1): ONE Polyline per segment — a capture gap is a visible break, never a
            straight line across it. A stopped trace (leader departed, or no leader ping within
            the Dark threshold) is dashed AND dimmed: lineDashPattern exists in react-native-maps
            1.18.0 for Android but its rendering is device-unverified, so the dim is the fallback
            that cannot fail. Index keys are stable: segments only append or are replaced whole. */}
        {showBreadcrumb
          ? breadcrumbSegmentCoords.map((coords, i) =>
              coords.length > 1 ? (
                <Polyline
                  key={`bc-${i}`}
                  coordinates={coords}
                  strokeColor={breadcrumbLive ? '#4F46E5' : '#4F46E580'}
                  strokeWidth={5}
                  lineDashPattern={breadcrumbLive ? undefined : [14, 10]}
                  lineCap="round"
                  lineJoin="round"
                />
              ) : null,
            )
          : null}
        {/* W244 start-pin fallback: until the FIRST position arrives (seeded
            last-known OR first live fix) there is no OS blue dot — e.g. a cold
            first-ride rider who hasn't yet granted foreground location. Drop a
            muted pin at the ride's start so the opener always has a position
            marker, per the AC. It disappears the instant myCoords exists (the
            blue dot / live marker takes over). */}
        {!myCoords && ride?.start ? (
          <Marker
            coordinate={{ latitude: ride.start.lat, longitude: ride.start.lng }}
            title="Ride start"
            pinColor="#9A9A9A"
            tracksViewChanges={false}
          />
        ) : null}
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
              // W282 / §5.3: overlay only when the beacon is anchored at last-known AND the
              // viewer is command (a Rider watching a Captain SOS gets the plain beacon).
              staleUnderBeacon={isStaleUnderBeacon(p.source, showBeacon, myRole)}
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
        {/* W285 (R3-40, A3, D-G33-A3-01): BINARY self-health overlay on the own position — present only
            while not reaching, on the SAME coordinate as the OS dot / own-beacon marker (one position,
            ever); above the beacon pulse; not gated on role, beacon or backgroundReady (the hook is
            inert on its own when there is no engine or no config). */}
        {/* Anchor: the LIVE OS dot normally; during an own SOS the OS dot is suppressed and the red
            beacon marker at myCoords is the one self indicator, so the badge sits on that. If the OS
            has no location either, no OS dot is drawn and myCoords is the only self glyph. */}
        {selfHealth.notReaching && (myBeacon ? myCoords : osCoords ?? myCoords) ? (
          <SelfHealthBadge coordinate={(myBeacon ? myCoords : osCoords ?? myCoords) as { lat: number; lng: number }} />
        ) : null}
      </MapView>

      {/* Floating overlays — no persistent chrome during a ride (§5.1). */}
      {/* W290 (slate 9): Captain-departure NEWS — never silent. Only for the leader's OWN
          departure (not a ride end, not a non-leader Captain), only while the ride is live;
          auto-clears when the Captain's pings resume, re-shows on a later departure. Copy is a
          placeholder — Voice & Tone pending. No route overlay: Feature 6 is not built (recorded). */}
      {leaderDeparted && leaderDepartedAtMs !== cueDismissedAt && ride?.status !== 'saved' ? (
        <View style={styles.captainLeftBanner} pointerEvents="box-none">
          <View style={styles.captainLeftText}>
            <Text style={styles.captainLeftTitle}>Captain has left the ride</Text>
            <Text style={styles.captainLeftBody}>Their trail is frozen where they left it.</Text>
          </View>
          <TouchableOpacity
            onPress={() => setCueDismissedAt(leaderDepartedAtMs)}
            accessibilityLabel="Dismiss"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.chipText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.backChip} onPress={() => navigation.goBack()}>
          <Text style={styles.chipText}>‹ {ride?.name ?? 'Ride'}</Text>
        </TouchableOpacity>
        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.backChip}
            onPress={() => (navigation as any).navigate('Roster', { rideId })}
            accessibilityLabel="Open ride roster"
          >
            <Text style={styles.chipText}>Roster</Text>
          </TouchableOpacity>
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

      {/* §4.1: End Ride is Captain-only — SAG and Riders never mount this. The
          `ride &&` guard covers the render-first window: until the role hydrates,
          myRole defaults to 'member' so this is already hidden, and ride.id is only
          read once the ride exists. */}
      {ride && canEndRide(myRole) ? (
        <RideControls rideId={ride.id} getMyCoords={getMyCoords} channel={channel} onRideEnded={markEnded} />
      ) : null}

      {ride ? (
        <FullScreenQR
          visible={qrOpen}
          qrCode={ride.qrCode}
          rideName={ride.name}
          onClose={() => setQrOpen(false)}
        />
      ) : null}

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

      {/* W212 — breadcrumb on/off toggle (PoC). Stacked above fit-all; dims when
          off. PoC-only control → strip or graduate at promotion (dossier §H). */}
      <TouchableOpacity
        style={[styles.breadcrumbButton, !showBreadcrumb && styles.centreButtonDisabled]}
        onPress={() => setShowBreadcrumb((v) => !v)}
        accessibilityLabel={showBreadcrumb ? 'Hide leader trail' : 'Show leader trail'}
      >
        <Text style={styles.centreGlyph}>≈</Text>
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
  // W290: Captain-departure cue — amber edge (news, not alarm); sits below the top bar.
  captainLeftBanner: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E0E10E6',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  captainLeftText: { flex: 1, marginRight: 12 },
  captainLeftTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  captainLeftBody: { color: '#C8C8C8', fontSize: 12, marginTop: 2 },
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
  // W212 — breadcrumb toggle, stacked above fit-all (which is at bottom 116).
  breadcrumbButton: {
    position: 'absolute',
    right: 18,
    bottom: 192,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0E0E10E6',
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
