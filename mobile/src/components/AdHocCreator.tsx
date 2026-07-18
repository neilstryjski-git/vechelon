import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import QRCode from 'react-native-qrcode-svg';

import { supabase } from '../lib/supabase';
import { selfRsvpWithIdentity } from '../lib/rideJoin';
import { TENANT_SLUG } from '../lib/env';
import { useTheme } from '../theme/ThemeProvider';
import {
  adHocProximityConflict,
  adHocRideName,
  adHocRideRow,
  buildRideJoinUrl,
  randomRideWord,
  AD_HOC_PROXIMITY_HOURS,
} from '../lib/rideControlsLogic';
import type { RootStackParamList } from '../navigation/RootNavigator';

// Ad Hoc ride creation (W175, Pillar II Feature 3 / Scenarios 11+12).
// Captain-only and only when no ride is Active — so it lives on Home, shown by
// the parent when the live-rides list is empty. Creating a ride is gated
// server-side by ride_admin_insert (is_tenant_admin), which is also prod
// reality: the web's ride creators are tenant admins. The PoC captain account
// is therefore seeded with account_tenants.role='admin' (W186 roster note).
//
// Flow: tap → Scenario-12 proximity check (any scheduled ride within ±2h →
// warning + EXPLICIT confirm; one of exactly two confirmation gates in Rail 3)
// → GPS fix → mint the ride id, build the Rails-1/2 join URL, render it as a
// QR off-screen and capture the PNG data-URL (the SAME qr_code convention the
// web stores and <img>-displays) → insert the ride (Active immediately) + own
// captain participant row → straight onto the fleet map.
const AdHocCreator: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const theme = useTheme();
  const [phase, setPhase] = useState<'idle' | 'checking' | 'warn' | 'creating'>('idle');
  // Why we're warning: a real conflict, or a failed check (fail-closed copy).
  const [warnReason, setWarnReason] = useState<'conflict' | 'unverified'>('conflict');
  const [error, setError] = useState<string | null>(null);

  // Hidden QR: render the join URL off-screen, then toDataURL() captures the
  // PNG. The ref API is callback-based, so creation awaits a one-shot promise.
  // Each capture is a TOKENED job (review finding): a late toDataURL callback
  // from a timed-out attempt must never resolve a retry's promise with a QR
  // encoding the old, never-inserted rideId — that would persist durable bad
  // data the web also displays.
  const [qrJob, setQrJob] = useState<{ url: string; token: number } | null>(null);
  const qrJobTokenRef = useRef(0);
  const qrResolveRef = useRef<{ token: number; resolve: (dataUrl: string) => void } | null>(null);
  const svgRef = useRef<{ toDataURL: (cb: (b64: string) => void) => void } | null>(null);

  useEffect(() => {
    if (!qrJob) return;
    const { token } = qrJob;
    // Give the hidden QR a frame to mount before capturing.
    const t = setTimeout(() => {
      svgRef.current?.toDataURL((b64) => {
        const pending = qrResolveRef.current;
        if (!pending || pending.token !== token) return; // stale job — drop it
        qrResolveRef.current = null;
        pending.resolve(`data:image/png;base64,${b64}`);
      });
      // D51: give the on-screen-but-transparent QR more time to mount + paint
      // before capturing — 50ms was too tight on some Android OEMs.
    }, 250);
    return () => clearTimeout(t);
  }, [qrJob]);

  const renderQrDataUrl = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const token = ++qrJobTokenRef.current;
      const timeout = setTimeout(() => {
        if (qrResolveRef.current?.token === token) qrResolveRef.current = null;
        reject(new Error('QR render timed out'));
      }, 5000);
      qrResolveRef.current = {
        token,
        resolve: (dataUrl) => {
          clearTimeout(timeout);
          resolve(dataUrl);
        },
      };
      setQrJob({ url, token });
    });

  const startCreate = async () => {
    setError(null);
    setPhase('checking');
    // Scenario 12: any scheduled ride within ±2h means this is probably a
    // duplicate of the real ride — warn and require explicit confirmation.
    const windowMs = AD_HOC_PROXIMITY_HOURS * 3_600_000;
    const { data, error: qErr } = await supabase
      .from('rides')
      .select('scheduled_start')
      .eq('status', 'created')
      .gte('scheduled_start', new Date(Date.now() - windowMs).toISOString())
      .lte('scheduled_start', new Date(Date.now() + windowMs).toISOString());
    if (qErr) {
      // FAIL CLOSED (review finding): a network blip must not silently bypass
      // one of Rail 3's two confirmation gates — warn as if a conflict exists.
      console.warn('[Rail3] proximity check failed — failing closed', qErr);
      setWarnReason('unverified');
      setPhase('warn');
      return;
    }
    const starts = (data ?? []).map((r) => r.scheduled_start as string | null);
    if (adHocProximityConflict(starts, Date.now())) {
      setWarnReason('conflict');
      setPhase('warn'); // Captain must explicitly confirm past the warning
      return;
    }
    await create();
  };

  const create = async () => {
    setPhase('creating');
    setError(null);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') throw new Error('Location permission is required to start a ride.');
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: fix.coords.latitude, lng: fix.coords.longitude };

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('Not signed in.');
      if (!TENANT_SLUG) {
        // Without the build's club slug the join URL would encode an invalid
        // host (https://.vechelon.ca/…) and persist it — refuse instead.
        throw new Error('Tenant not configured — set EXPO_PUBLIC_TENANT_SLUG.');
      }
      // Membership PINNED to the build's club (review finding): a multi-club
      // account must create the ride in the tenant whose slug the QR encodes,
      // not an arbitrary membership row.
      const { data: membership } = await supabase
        .from('account_tenants')
        .select('tenant_id, tenants!inner(slug)')
        .eq('account_id', userId)
        .eq('tenants.slug', TENANT_SLUG)
        .limit(1)
        .maybeSingle();
      if (!membership?.tenant_id) throw new Error('No membership in this club.');

      const rideId = Crypto.randomUUID();
      const joinUrl = buildRideJoinUrl(rideId, TENANT_SLUG);

      // D51: the off-screen QR PNG capture must NEVER block creating the ride.
      // Try to capture it up front; if it times out / fails, create the ride
      // anyway with an empty qr_code and re-attach the PNG in the background — a
      // captain can always start (and run) a ride even when the capture flakes.
      let qrDataUrl = '';
      try {
        qrDataUrl = await renderQrDataUrl(joinUrl);
      } catch (qrErr) {
        console.warn('[Rail3] QR capture failed up front — creating ride without it (D51)', qrErr);
      }

      const row = adHocRideRow({
        rideId,
        tenantId: membership.tenant_id,
        createdBy: userId,
        coords,
        qrDataUrl,
        at: new Date(),
        name: adHocRideName(randomRideWord()),
      });
      const { error: insErr } = await supabase.from('rides').insert(row);
      if (insErr) throw new Error(`Could not create the ride: ${insErr.message}`);

      // Best-effort late re-attach of the join QR if the up-front capture failed,
      // so the stored qr_code eventually matches the web PNG convention without
      // ever having blocked ride creation.
      if (!qrDataUrl) {
        void renderQrDataUrl(joinUrl)
          .then((late) =>
            supabase.from('rides').update({ qr_code: late }).eq('id', rideId),
          )
          .catch(() => {
            /* leave qr_code empty — the ride still runs; QR can be regenerated */
          });
      }

      // Self-RSVP as captain (participant_insert_policy branch 1) so the map
      // roster knows who runs this ride. W195: hydrate display_name/email from
      // accounts so Race Control shows the captain's real name, not 'Rider'.
      // D83: the captain MUST be on the roster — the ride's breadcrumb write RLS
      // (is_rail3_ride_captain), the leader election, and §4.1 visibility all require the captain's
      // participant row. A swallowed self-RSVP failure left the ride ACTIVE with its own captain
      // missing. Retry transient failures; treat a duplicate as success (the row is already there);
      // on persistent failure roll back the orphan ride and surface the error rather than entering
      // a broken, captain-less ride.
      let partErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { error } = await selfRsvpWithIdentity({ rideId, accountId: userId, role: 'captain' });
        if (!error) {
          partErr = null;
          break;
        }
        partErr = error;
        const code = (error as { code?: string })?.code ?? '';
        const msg = (error as { message?: string })?.message ?? '';
        if (code === '23505' || /duplicate|already exists|unique/i.test(msg)) {
          partErr = null; // the captain row is already present — treat as success
          break;
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
      if (partErr) {
        // Roll back the orphan ride so we never leave behind (or enter) a captain-less active ride.
        await supabase.from('rides').delete().eq('id', rideId);
        throw new Error('Could not add you as captain — ride not started. Please try again.');
      }

      setPhase('idle');
      setQrJob(null);
      navigation.navigate('RideMap', { rideId });
    } catch (e) {
      setPhase('idle');
      setQrJob(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primaryColor }]}
        onPress={() => void startCreate()}
        disabled={phase === 'checking' || phase === 'creating'}
        accessibilityLabel="Create ad hoc ride"
      >
        <Text style={styles.buttonText}>
          {phase === 'creating' ? 'Starting…' : 'Create Ad Hoc Ride'}
        </Text>
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Off-screen QR used only to capture the data-URL during creation. */}
      {qrJob ? (
        <View style={styles.hiddenQr} pointerEvents="none">
          <QRCode
            value={qrJob.url}
            size={320}
            ecl="H"
            backgroundColor="#ffffff"
            color="#1a1a1a"
            getRef={(ref) => {
              svgRef.current = ref;
            }}
          />
        </View>
      ) : null}

      {/* D66: the warning is a SCREEN-ROOT Modal, not an absolute overlay inside
          this component. AdHocCreator mounts in a small Home container; an
          absoluteFill overlay filled only THAT box, so the bottom-pinned sheet
          (and its "Create Anyway" button) was clipped. A transparent Modal renders
          at the window root, so the sheet pins to the real screen bottom. */}
      <Modal
        visible={phase === 'warn'}
        transparent
        animationType="fade"
        onRequestClose={() => setPhase('idle')}
      >
        <View style={styles.warnOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setPhase('idle')} />
          <View style={styles.warnSheet}>
            <Text style={styles.warnTitle}>
              {warnReason === 'conflict' ? 'A scheduled ride is close by' : "Couldn't verify the schedule"}
            </Text>
            <Text style={styles.warnBody}>
              {warnReason === 'conflict'
                ? `A scheduled ride exists within ${AD_HOC_PROXIMITY_HOURS} hours. Starting an Ad Hoc ride now may split the group. Create it anyway?`
                : `The schedule check failed — a scheduled ride may exist within ${AD_HOC_PROXIMITY_HOURS} hours. Starting an Ad Hoc ride now may split the group. Create it anyway?`}
            </Text>
            <TouchableOpacity style={styles.warnConfirm} onPress={() => void create()}>
              <Text style={styles.warnConfirmText}>Create Ad Hoc Ride Anyway</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.warnCancel} onPress={() => setPhase('idle')}>
              <Text style={styles.warnCancelText}>Never Mind</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    minHeight: 64, // §5.1 ride-control floor
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  error: { color: '#F87171', fontSize: 13, marginTop: 10 },
  // D51: kept in the on-screen paint tree (top/left 0) but fully transparent and
  // behind everything. A view positioned far off-screen (left:-1000) is culled on
  // some Android OEMs, so react-native-svg's toDataURL callback never fires.
  hiddenQr: { position: 'absolute', left: 0, top: 0, opacity: 0, zIndex: -1 },
  // Fills the Modal's screen-root container (D66). The sheet inside pins to the
  // real screen bottom, so its buttons are never clipped by this component's box.
  warnOverlay: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: '#00000099' },
  warnSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#16161A',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 24,
    paddingBottom: 40,
  },
  warnTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  warnBody: { color: '#C9C9CE', fontSize: 14, lineHeight: 20, marginTop: 10 },
  warnConfirm: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  warnConfirmText: {
    color: '#0E0E10',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  warnCancel: {
    borderColor: '#2C2C30',
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  warnCancelText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

export default AdHocCreator;
