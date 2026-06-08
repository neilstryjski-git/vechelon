import QRCode from 'qrcode';

/**
 * Renders a join-URL QR code with the tenant logo (or a fallback "78" mark)
 * overlaid in the centre. Shared by the ride create flow (RideFormModal) and
 * the clone flow (CloneRideModal) so both produce identical-looking codes.
 *
 * Uses error-correction level 'H' (30% recovery) — required headroom for the
 * centre logo overlay to not corrupt the code.
 */
export async function generateQRWithLogo(url: string, logoUrl?: string | null): Promise<string> {
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H', // 30% recovery capacity — required for logo overlay
    color: { dark: '#1a1a1a', light: '#ffffff' },
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const logoSize = Math.round(size * 0.20);
  const pad      = 10;
  const bgSize   = logoSize + pad * 2;
  const x        = (size - bgSize) / 2;
  const y        = (size - bgSize) / 2;
  const radius   = 12;

  // White rounded-rect background behind logo
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + bgSize - radius, y);
  ctx.quadraticCurveTo(x + bgSize, y, x + bgSize, y + radius);
  ctx.lineTo(x + bgSize, y + bgSize - radius);
  ctx.quadraticCurveTo(x + bgSize, y + bgSize, x + bgSize - radius, y + bgSize);
  ctx.lineTo(x + radius, y + bgSize);
  ctx.quadraticCurveTo(x, y + bgSize, x, y + bgSize - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (logoUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          ctx.drawImage(img, x + pad, y + pad, logoSize, logoSize);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.onerror = () => resolve(canvas.toDataURL('image/png'));
      img.src = logoUrl;
    });
  }

  // Fallback: canvas "78" mark
  const cx = size / 2;
  const cy = size / 2;
  const r  = logoSize / 2;
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font      = `bold ${Math.round(r * 1.1)}px 'Arial Black', Arial, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('78', cx, cy + Math.round(r * 0.05));
  return canvas.toDataURL('image/png');
}
