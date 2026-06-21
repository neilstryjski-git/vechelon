import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { canNavigateToRider, canSeePhone, FleetParticipant, RideRole } from '../lib/roleVisibility';
import { buildMapsDirUrl } from '../lib/geo';

// Role-gated contact sheet (R3-15/R3-16, Pillar II Feature 1 + §5.1):
// display name, account state, tactical state, phone in large monospace.
// W211 (PoC): Copy Number is now an inline clipboard ICON on the phone row
// (Pillar III literally says "clipboard icon"), which frees its old full-width
// slot for a full-width NAVIGATE button — SAG only — that launches Maps directions
// to the rider's last-known position. Dial stays full-width (R3-16); the meta line
// is kept (no committed content removed). Slides up on icon tap; dismissed by tap
// outside (and the parent only opens it when canOpenSheet passes).
// Custom Animated implementation — no extra bottom-sheet/reanimated deps for
// the PoC.
interface Props {
  participant: FleetParticipant | null;
  myRole: RideRole;
  onClose: () => void;
  // W173: present when the participant has an active beacon AND the viewer may
  // cancel it (canCancelBeacon — Captain/SAG; §4.1 "Cancel any rider's beacon").
  onCancelBeacon?: (() => void) | null;
}

const ROLE_LABEL: Record<RideRole, string> = {
  captain: 'Captain',
  support: 'SAG',
  member: 'Rider',
  guest: 'Guest Rider',
};

const RiderBottomSheet: React.FC<Props> = ({ participant, myRole, onClose, onCancelBeacon }) => {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: participant ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [participant, slide]);

  if (!participant) return null;

  // D60-style truthfulness: separate a ROLE restriction from simply having no number
  // on file. A Captain/SAG who CAN see a rider but the rider has no phone must not be
  // told it's "your role" (the reported bug). Role gate first, then data.
  const roleCanSeeContact = canSeePhone(myRole, participant.role);
  const showPhone = roleCanSeeContact && Boolean(participant.phone);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.grabber} />
        <Text style={styles.name}>{participant.displayName}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaChip}>{ROLE_LABEL[participant.role]}</Text>
          {participant.accountStatus ? (
            <Text style={styles.metaChip}>{participant.accountStatus}</Text>
          ) : null}
          <Text style={styles.metaChip}>{participant.state.toUpperCase()}</Text>
        </View>

        {onCancelBeacon ? (
          <TouchableOpacity
            style={styles.cancelBeaconButton}
            onPress={() => {
              onCancelBeacon();
              onClose();
            }}
          >
            <Text style={styles.cancelBeaconText}>Cancel Support</Text>
          </TouchableOpacity>
        ) : null}

        {showPhone ? (
          // Phone row: number + inline Copy ICON (Pillar III "clipboard icon").
          <View style={styles.phoneRow}>
            <Text style={styles.phone}>{participant.phone}</Text>
            <TouchableOpacity
              style={styles.copyIcon}
              onPress={() => void Clipboard.setStringAsync(participant.phone ?? '')}
              accessibilityLabel="Copy number"
            >
              <Text style={styles.copyIconGlyph}>⧉</Text>
            </TouchableOpacity>
          </View>
        ) : roleCanSeeContact ? (
          <Text style={styles.noPhone}>No contact on file.</Text>
        ) : (
          <Text style={styles.noPhone}>Contact hidden for this role.</Text>
        )}

        {/* W211 — Navigate (SAG only). Full-width primary, in the slot Copy vacated.
            Independent of phone (a SAG may need to reach a phoneless rider). Routes to
            the rider's last-known position; a Dark rider's label discloses staleness
            (D60). position null → a disabled, honest "no position" state (not a dead tap). */}
        {canNavigateToRider(myRole) ? (
          participant.position ? (
            <TouchableOpacity
              style={styles.navigateButton}
              onPress={() => void Linking.openURL(buildMapsDirUrl(participant.position!))}
            >
              <Text style={styles.navigateText}>
                {participant.state === 'dark' ? 'Navigate · last known' : 'Navigate'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.navigateButton, styles.navigateDisabled]}>
              <Text style={styles.navigateText}>No position received yet</Text>
            </View>
          )
        ) : null}

        {/* Dial — full-width (R3-16), only when a number is on file. */}
        {showPhone ? (
          <TouchableOpacity
            style={styles.dialButton}
            onPress={() => void Linking.openURL(`tel:${participant.phone}`)}
          >
            <Text style={styles.dialText}>Dial</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#16161A',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 34,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3E',
    marginBottom: 14,
  },
  name: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  metaChip: {
    color: '#C9C9CE',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    backgroundColor: '#222226',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  // Large monospace number (§5.1 bold/large typography in the sheet).
  phone: {
    color: '#FFFFFF',
    fontSize: 28,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    flexShrink: 1, // let a long number shrink rather than push the copy icon off-row
  },
  // W211 — phone row holds the number + the inline Copy icon (replaces the old
  // full-width Copy Number button so Navigate can occupy that slot).
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  copyIcon: {
    minWidth: 44, // §5.1 tap target
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  copyIconGlyph: { color: '#FFFFFF', fontSize: 22 },
  dialButton: {
    backgroundColor: '#E11D2A',
    borderRadius: 12,
    minHeight: 64, // §5.1: ride control buttons ≥64dp; full row width (R3-16)
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  dialText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  // W211 — Navigate: full-width primary, maps-blue (distinct from the red Dial and
  // the amber Cancel Support). 64dp per §5.1.
  navigateButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  navigateDisabled: { backgroundColor: '#2C2C30' },
  navigateText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  noPhone: { color: '#7A7A7A', fontSize: 14, marginTop: 16 },
  // Distress action — visually distinct from contact actions (amber, 64dp).
  cancelBeaconButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  cancelBeaconText: {
    color: '#0E0E10',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});

export default RiderBottomSheet;
