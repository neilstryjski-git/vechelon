import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

// Google Play PROMINENT DISCLOSURE for background location (W229).
//
// This is the in-app disclosure Google Play policy requires to be shown BEFORE the
// OS background-location permission request for any app that uses
// ACCESS_BACKGROUND_LOCATION. It is DISTINCT from FirstRideExplainer.tsx: the
// explainer is the Foreground-Service "don't swipe away the notification" notice
// (shown after join, single dismiss); this is a CONSENT GATE shown before the
// permission prompt, with affirmative Allow / Not now choices. Both must coexist.
//
// Policy contract (do not loosen without re-checking the Play policy):
//   - States that location is collected in the background, in Google's own framing
//     ("...even when the app is closed or not in use"). The DISCLOSURE_TEXT constant
//     is verbatim and is what the W225 demo video must film — keep it exact.
//   - Names WHO sees the data (the rider's club — captain & support) and WHY (the
//     live ride fleet view).
//   - Requires AFFIRMATIVE consent: two explicit choices, never a single "Got it".
//   - Decline (Not now, or the Android back gesture) requests NO permission and
//     simply calls onDeny — it must never throw into the caller's ride-join path.
//
// INTEGRATION POINT: this is a CONTROLLED component (caller owns `visible`). Mount it
// immediately ahead of the OS background-location permission request and gate that
// request on onAllow; on onDeny, abort the request and let the rider proceed without
// background sharing. That permission flow lives on the held W172/bgGeo chain (absent
// on master), so end-to-end wiring lands when that chain merges; the component and its
// consent contract are the deliverable here.

// Verbatim Google-intent phrasing. The W225 demo video films this exact string and
// the Play Permissions Declaration references it — do NOT paraphrase.
export const DISCLOSURE_TEXT =
  'Vechelon collects location data to show your position to your club during a ride, ' +
  'even when the app is closed or not in use.';

type Props = {
  visible: boolean;
  // Rider granted the disclosure — caller proceeds to the OS background-location prompt.
  onAllow: () => void;
  // Rider declined (button or Android back) — caller requests no permission and must
  // not treat this as an error. Ride join continues without background sharing.
  onDeny: () => void;
};

const LocationDisclosure: React.FC<Props> = ({ visible, onAllow, onDeny }) => {
  const theme = useTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDeny}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            Share your location during rides
          </Text>

          {/* Verbatim required phrasing — the policy-bearing sentence. */}
          <Text style={styles.body}>{DISCLOSURE_TEXT}</Text>

          {/* Who sees it + why — the second half of the prominent-disclosure contract. */}
          <Text style={styles.body}>
            Only your club&apos;s ride captain and support crew can see your position,
            and only while a ride is active — so they can keep the group together and
            reach you if you need help. You can turn this off any time.
          </Text>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, { backgroundColor: theme.primaryColor }]}
            onPress={onAllow}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Allow</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={onDeny}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
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
    marginBottom: 20,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButton: {
    marginTop: 4,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontSize: 14,
  },
  // Secondary (decline) reads as a calm, equal alternative — affirmative consent means
  // the rider must be able to clearly choose NOT to share, not just an easy-out "x".
  secondaryButton: {
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    color: '#B8B8B8',
    fontWeight: '600',
    letterSpacing: 0.5,
    fontSize: 14,
  },
});

export default LocationDisclosure;
