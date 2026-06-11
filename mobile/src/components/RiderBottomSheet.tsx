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

import { canSeePhone, FleetParticipant, RideRole } from '../lib/roleVisibility';

// Role-gated contact sheet (R3-15/R3-16, Pillar II Feature 1 + §5.1):
// display name, account state, tactical state, phone in large monospace,
// Copy Number, full-width Dial via tel:. Slides up on icon tap; dismissed by
// tap outside (and the parent only opens it when canOpenSheet passes).
// Custom Animated implementation — no extra bottom-sheet/reanimated deps for
// the PoC.
interface Props {
  participant: FleetParticipant | null;
  myRole: RideRole;
  onClose: () => void;
}

const ROLE_LABEL: Record<RideRole, string> = {
  captain: 'Captain',
  support: 'SAG',
  member: 'Rider',
  guest: 'Guest Rider',
};

const RiderBottomSheet: React.FC<Props> = ({ participant, myRole, onClose }) => {
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: participant ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [participant, slide]);

  if (!participant) return null;

  const showPhone = canSeePhone(myRole, participant.role) && Boolean(participant.phone);
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

        {showPhone ? (
          <>
            <Text style={styles.phone}>{participant.phone}</Text>
            {/* R3-16: Dial is FULL-WIDTH (the criterion is literal — reviewer
                finding); Copy Number stacks above it as a secondary action. */}
            <TouchableOpacity
              style={styles.copyButton}
              onPress={() => void Clipboard.setStringAsync(participant.phone ?? '')}
            >
              <Text style={styles.copyText}>Copy Number</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dialButton}
              onPress={() => void Linking.openURL(`tel:${participant.phone}`)}
            >
              <Text style={styles.dialText}>Dial</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.noPhone}>No contact available for your role.</Text>
        )}
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
    marginTop: 18,
  },
  copyButton: {
    borderColor: '#2C2C30',
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 48, // §5.1 floor for the secondary action
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  copyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
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
  noPhone: { color: '#7A7A7A', fontSize: 14, marginTop: 16 },
});

export default RiderBottomSheet;
