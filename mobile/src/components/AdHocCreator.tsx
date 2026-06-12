import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import QRCode from 'react-native-qrcode-svg';

import { supabase } from '../lib/supabase';
import { TENANT_SLUG } from '../lib/env';
import { useTheme } from '../theme/ThemeProvider';
import {
  adHocProximityConflict,
  adHocRideRow,
  buildRideJoinUrl,
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
  const [error, setError] = useState<string | null>(null);

  // Hidden QR: render the join URL off-screen, then toDataURL() captures the
  // PNG. The ref API is callback-based, so creation awaits a one-shot promise.
  const [qrJob, setQrJob] = useState<{ url: string } | null>(null);
  const qrResolveRef = useRef<((dataUrl: string) => void) | null>(null);
  const svgRef = useRef<{ toDataURL: (cb: (b64: string) => void) => void } | null>(null);

  useEffect(() => {
    if (!qrJob) return;
    // Give the hidden QR a frame to mount before capturing.
    const t = setTimeout(() => {
      svgRef.current?.toDataURL((b64) => {
        qrResolveRef.current?.(`data:image/png;base64,${b64}`);
      });
    }, 50);
    return () => clearTimeout(t);
  }, [qrJob]);

  const renderQrDataUrl = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      qrResolveRef.current = resolve;
      setQrJob({ url });
      setTimeout(() => reject(new Error('QR render timed out')), 5000);
    });

  const startCreate = async () => {
    setError(null);
    setPhase('checking');
    // Scenario 12: any scheduled ride within ±2h means this is probably a
    // duplicate of the real ride — warn and require explicit confirmation.
    const windowMs = AD_HOC_PROXIMITY_HOURS * 3_600_000;
    const { data } = await supabase
      .from('rides')
      .select('scheduled_start')
      .eq('status', 'created')
      .gte('scheduled_start', new Date(Date.now() - windowMs).toISOString())
      .lte('scheduled_start', new Date(Date.now() + windowMs).toISOString());
    const starts = (data ?? []).map((r) => r.scheduled_start as string | null);
    if (adHocProximityConflict(starts, Date.now())) {
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
      const { data: membership } = await supabase
        .from('account_tenants')
        .select('tenant_id')
        .eq('account_id', userId)
        .limit(1)
        .maybeSingle();
      if (!membership?.tenant_id) throw new Error('No club membership found.');

      const rideId = Crypto.randomUUID();
      const qrDataUrl = await renderQrDataUrl(buildRideJoinUrl(rideId, TENANT_SLUG));

      const row = adHocRideRow({
        rideId,
        tenantId: membership.tenant_id,
        createdBy: userId,
        coords,
        qrDataUrl,
        at: new Date(),
      });
      const { error: insErr } = await supabase.from('rides').insert(row);
      if (insErr) throw new Error(`Could not create the ride: ${insErr.message}`);

      // Self-RSVP as captain (participant_insert_policy branch 1) so the map
      // roster knows who runs this ride.
      const { error: partErr } = await supabase
        .from('ride_participants')
        .insert({ ride_id: rideId, account_id: userId, role: 'captain', status: 'rsvpd' });
      if (partErr) console.warn('[Rail3] captain self-RSVP failed', partErr);

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

      {phase === 'warn' ? (
        <View style={styles.warnOverlay}>
          <Pressable style={styles.backdrop} onPress={() => setPhase('idle')} />
          <View style={styles.warnSheet}>
            <Text style={styles.warnTitle}>A scheduled ride is close by</Text>
            <Text style={styles.warnBody}>
              A scheduled ride exists within {AD_HOC_PROXIMITY_HOURS} hours. Starting an Ad Hoc
              ride now may split the group. Create it anyway?
            </Text>
            <TouchableOpacity style={styles.warnConfirm} onPress={() => void create()}>
              <Text style={styles.warnConfirmText}>Create Ad Hoc Ride Anyway</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.warnCancel} onPress={() => setPhase('idle')}>
              <Text style={styles.warnCancelText}>Never Mind</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
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
  hiddenQr: { position: 'absolute', left: -1000, top: -1000, opacity: 0 },
  warnOverlay: { ...StyleSheet.absoluteFillObject, position: 'absolute', zIndex: 10 },
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
