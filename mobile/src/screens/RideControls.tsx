import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { RIDE_ENDED_EVENT } from '../hooks/useRideChannel';
import { endRidePatch } from '../lib/rideControlsLogic';
import type { LatLng } from '../lib/geo';

// Captain ride controls (W175, Pillar II Feature 3). Mounted by RideMapScreen
// ONLY for myRole === 'captain' — SAG and Riders never see these (R3-29/30;
// the §4.1 matrix gives SAG neither End Ride nor Ad Hoc).
//
// End Ride is one of exactly TWO confirmation gates in Rail 3 (§5.1): primary
// tap → confirmation sheet → "Confirm End Ride". Dismissing leaves the ride
// Active (R3-25). On confirm (R3-26), MIRRORING the web flow
// (admin/src/store/useAppStore.ts endRide): status='saved' + actual_end=now()
// (both — the Hard Purge 4h clock keys off the pair) + finish_coords from the
// device fix, then generate-ride-summary is invoked fire-and-forget — the
// summary is QUEUED, not awaited, and no participant is notified.
interface Props {
  rideId: string;
  getMyCoords: () => LatLng | null;
  // Shared ride channel (useRideChannel) — used to broadcast the end so other
  // participants leave the live map (D57).
  channel: RealtimeChannel | null;
}

const RideControls: React.FC<Props> = ({ rideId, getMyCoords, channel }) => {
  const navigation = useNavigation();
  const [confirming, setConfirming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmEndRide = async () => {
    setEnding(true);
    setError(null);

    const { data, error: updErr } = await supabase
      .from('rides')
      .update(endRidePatch(new Date(), getMyCoords()))
      .eq('id', rideId)
      .eq('status', 'active') // idempotent: a ride already Saved matches 0 rows
      .select('id');

    // D60: a real RLS/permission failure is `updErr`. 0 rows with NO error just
    // means the ride was ALREADY saved (the idempotent guard) — that's success,
    // not a permission problem, so don't show the scary message; just leave.
    if (updErr) {
      // RLS (ride_admin_modify: tenant admin OR created_by) or a true write error.
      setError(updErr.message || 'Could not end the ride — check your permissions.');
      setEnding(false);
      return;
    }

    const closedNow = (data?.length ?? 0) > 0;

    // Queue the AI summary ONLY when THIS call actually closed the ride (D60: not
    // on an already-saved no-op). Existing edge function, fire-and-forget (R3-26:
    // "queued for async generation"; no in-app notification to anyone).
    if (closedNow) {
      supabase.functions
        .invoke('generate-ride-summary', { body: { rideId } })
        .catch((e) => console.warn('[Rail3] generate-ride-summary invoke failed', e));
    }

    // D57: tell other participants the ride ended so their map reacts in real time.
    // Sent whether we closed it now or found it already saved (either way it's over).
    // Ephemeral + best-effort (ack:true → awaits server receipt); a fresh open also
    // reads ride.status as a fallback.
    try {
      await channel?.send({ type: 'broadcast', event: RIDE_ENDED_EVENT, payload: { rideId } });
    } catch (e) {
      console.warn('[Rail3] ride_ended broadcast failed', e);
    }

    setConfirming(false);
    setEnding(false);
    navigation.goBack(); // the ride is no longer live — leave the map
  };

  return (
    <>
      <TouchableOpacity
        style={styles.endChip}
        onPress={() => setConfirming(true)}
        accessibilityLabel="End ride"
      >
        <Text style={styles.endChipText}>END RIDE</Text>
      </TouchableOpacity>

      {confirming ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={styles.backdrop} onPress={() => setConfirming(false)} />
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmTitle}>End this ride?</Text>
            <Text style={styles.confirmBody}>
              The ride moves to Saved, live tracking stops for everyone, and ride data is
              purged 4 hours after close. A summary is generated in the background.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={() => void confirmEndRide()}
              disabled={ending}
            >
              <Text style={styles.confirmButtonText}>
                {ending ? 'Ending…' : 'Confirm End Ride'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setConfirming(false)}>
              <Text style={styles.cancelButtonText}>Keep Riding</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  // Top-right, below the status chip line — deliberately NOT in the bottom
  // thumb zone: ending the ride is rare and must never be a beacon mis-tap.
  endChip: {
    position: 'absolute',
    top: 110,
    right: 16,
    backgroundColor: '#0E0E10E6',
    borderColor: '#E11D2A',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  endChipText: { color: '#E11D2A', fontWeight: '800', fontSize: 12, letterSpacing: 1.5 },
  backdrop: { flex: 1, backgroundColor: '#00000099' },
  confirmSheet: {
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
  confirmTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  confirmBody: { color: '#C9C9CE', fontSize: 14, lineHeight: 20, marginTop: 10 },
  error: { color: '#F87171', fontSize: 13, marginTop: 10 },
  confirmButton: {
    backgroundColor: '#E11D2A',
    borderRadius: 12,
    minHeight: 64, // §5.1 ride-control floor
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cancelButton: {
    borderColor: '#2C2C30',
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  cancelButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

export default RideControls;
