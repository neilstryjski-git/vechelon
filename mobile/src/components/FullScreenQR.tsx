import React from 'react';
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

// Full-screen QR display (W175 / R3-27): maximum size, high contrast, available
// to ALL roles — any active participant can show it to help a latecomer join
// (Pillar II Feature 3). Renders the EXISTING rides.qr_code:
//   - the prod convention is a rendered PNG data-URL (web stores the canvas
//     output of generateQRWithLogo and displays it via <img src>) → <Image>;
//   - defensively, a plain-URL value renders as a generated QR of that URL —
//     either way the encoded join URL is the Rails 1/2 one, never re-minted.
interface Props {
  visible: boolean;
  qrCode: string | null;
  rideName: string;
  onClose: () => void;
}

const FullScreenQR: React.FC<Props> = ({ visible, qrCode, rideName, onClose }) => {
  const size = Math.min(Dimensions.get('window').width, Dimensions.get('window').height) - 64;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      {/* White sheet = maximum scan contrast in sunlight (§5.1). */}
      <Pressable style={styles.sheet} onPress={onClose} accessibilityLabel="Dismiss QR">
        {qrCode ? (
          qrCode.startsWith('data:') ? (
            <Image source={{ uri: qrCode }} style={{ width: size, height: size }} resizeMode="contain" />
          ) : (
            <QRCode value={qrCode} size={size} backgroundColor="#FFFFFF" color="#1a1a1a" />
          )
        ) : (
          <Text style={styles.missing}>No QR available for this ride.</Text>
        )}
        <Text style={styles.name}>{rideName}</Text>
        <Text style={styles.hint}>Scan to join — tap anywhere to close</Text>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  name: { color: '#1a1a1a', fontSize: 20, fontWeight: '800', marginTop: 24, textAlign: 'center' },
  hint: { color: '#6B6B70', fontSize: 13, marginTop: 8 },
  missing: { color: '#1a1a1a', fontSize: 16 },
});

export default FullScreenQR;
