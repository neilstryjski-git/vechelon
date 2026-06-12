import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../theme/ThemeProvider';

// First-ride Foreground Service explainer (W176 / Pillar II §2 Background GPS,
// Pillar III R3-07, SD-009).
//
// A one-time, plain-language, dismissible explainer shown on a rider's FIRST ride
// join — before they lock their screen — explaining that dismissing the Android
// Foreground Service Notification stops location tracking (the rider goes "Dark" to
// their captain).
//
// Self-gating: the caller mounts <FirstRideExplainer riderId={...} /> whenever a ride
// is joined; this component checks AsyncStorage and renders nothing if this rider has
// already dismissed it, so the caller does not track "first join" state itself. The
// "seen" flag is keyed per rider id (not per device), so it follows the identity.
//
// It NEVER blocks ride join — it is informational and dismissible (pitfall). Copy here
// is placeholder pending Voice & Tone review (pitfall); the structure, not the wording,
// is the deliverable.

const SEEN_KEY_PREFIX = 'rail3:fgs-explainer-seen:';
const seenKey = (riderId: string) => `${SEEN_KEY_PREFIX}${riderId}`;

// Whether this rider has already dismissed the first-ride explainer. Exported so a
// caller can pre-check before mounting if it wants (e.g. to avoid a flash).
export async function hasSeenFirstRideExplainer(riderId: string): Promise<boolean> {
  if (!riderId) return false;
  try {
    return (await AsyncStorage.getItem(seenKey(riderId))) === 'true';
  } catch {
    // Storage failure -> treat as not-seen; showing an informational explainer again
    // is harmless, swallowing it silently is not.
    return false;
  }
}

type Props = {
  riderId: string;
  // Called after the rider dismisses (or when the explainer is skipped because it was
  // already seen) — lets the caller proceed with whatever follows the explainer.
  onDismiss?: () => void;
};

const FirstRideExplainer: React.FC<Props> = ({ riderId, onDismiss }) => {
  const theme = useTheme();
  // null = still checking storage; false = already seen / dismissed; true = show it.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    hasSeenFirstRideExplainer(riderId).then((seen) => {
      if (!mounted) return;
      setVisible(!seen);
      // If it was already seen we never render — tell the caller so it can continue.
      if (seen) onDismiss?.();
    });
    return () => {
      mounted = false;
    };
    // onDismiss intentionally omitted: we only want this to run on riderId change,
    // not on every parent re-render that passes a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId]);

  const dismiss = async () => {
    setVisible(false);
    try {
      await AsyncStorage.setItem(seenKey(riderId), 'true');
    } catch {
      // A failed write just means it may show again on the next join — acceptable for
      // an informational explainer; never throw into the ride-join path (pitfall).
    }
    onDismiss?.();
  };

  if (visible !== true) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Keep your ride visible</Text>
          {/* Placeholder copy — final wording pending Voice & Tone review (R3-07). */}
          <Text style={styles.body}>
            While you ride, Vechelon keeps a notification in your status bar that keeps
            your location sharing alive. If you swipe it away, tracking stops — you'll
            go <Text style={styles.dark}>Dark</Text> and your captain won't see you on
            the map. Please leave it in place for the whole ride.
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primaryColor }]}
            onPress={dismiss}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1A1A1D',
    borderColor: '#2C2C30',
    borderWidth: 1,
    borderRadius: 16,
    padding: 28,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 14,
  },
  body: {
    color: '#B8B8B8',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 28,
  },
  dark: {
    color: '#FF6B6B',
    fontWeight: '700',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontSize: 14,
  },
});

export default FirstRideExplainer;
