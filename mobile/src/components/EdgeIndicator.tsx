import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { edgeAnchorForBearing } from '../lib/geo';

// Directional arrow at the viewport boundary pointing toward the off-screen
// finish point (R3-13). Pure overlay — Haversine bearing, no routing engine
// (Pillar II Feature 1/4). The parent renders it ONLY when a finish point
// exists AND is off-screen (R3-14 handled there).
interface Props {
  bearingDeg: number;
  viewWidth: number;
  viewHeight: number;
}

const EdgeIndicator: React.FC<Props> = ({ bearingDeg, viewWidth, viewHeight }) => {
  if (viewWidth <= 0 || viewHeight <= 0) return null;
  const { x, y, rotationDeg } = edgeAnchorForBearing(bearingDeg, viewWidth, viewHeight);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.indicator,
        { left: x - SIZE / 2, top: y - SIZE / 2, transform: [{ rotate: `${rotationDeg}deg` }] },
      ]}
    >
      <Text style={styles.arrow}>▲</Text>
    </View>
  );
};

const SIZE = 44;

const styles = StyleSheet.create({
  indicator: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#0E0E10E6',
    borderColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // High-contrast glyph (§5.1 sunlight readable, ≥4.5:1 on the dark chip).
  arrow: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', lineHeight: 22 },
});

export default EdgeIndicator;
