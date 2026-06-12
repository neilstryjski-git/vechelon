import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';

// The Support Beacon control (W173, Pillar II Feature 2 + §5.1):
// "the highest-priority single-tap action — within natural thumb reach at all
// times". Bottom-LEFT overlay (the Centre button owns bottom-right), 72dp.
//
// R3-19 / pitfall: SINGLE TAP, NO CONFIRMATION — speed is the UX priority in a
// distress event. Active state pulses and flips to CANCEL (self-cancel, also
// one tap). Haptics fire in useBeacons (strong on trigger / medium on cancel)
// so they stay paired with the actual state change, not the button press.
interface Props {
  active: boolean;
  onTrigger: () => void;
  onCancel: () => void;
}

const SupportBeacon: React.FC<Props> = ({ active, onTrigger, onCancel }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale: pulse }] }]}>
      <TouchableOpacity
        style={[styles.button, active && styles.buttonActive]}
        onPress={active ? onCancel : onTrigger}
        accessibilityLabel={active ? 'Cancel support beacon' : 'Trigger support beacon'}
      >
        <Text style={styles.glyph}>{active ? '✕' : 'SOS'}</Text>
        <Text style={styles.label}>{active ? 'CANCEL' : 'SUPPORT'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // One-thumb reach, mirrored from the Centre button (§5.1).
  wrap: { position: 'absolute', left: 18, bottom: 40 },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E11D2A',
    borderColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Active = high-visibility amber so CANCEL never reads as a second SOS.
  buttonActive: { backgroundColor: '#F59E0B' },
  glyph: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  label: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 1 },
});

export default SupportBeacon;
