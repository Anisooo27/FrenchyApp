// One-off script (kept for reproducibility): derives the two logo assets
// used by the app from the source brand file images/MAINlogo.png.
//   - public/logo.png        — tight crop of the wordmark on its brand teal
//                               background, used in the UI (header, login/PIN screens).
//   - server/receipt-logo.png — black-on-white silhouette of the same crop,
//                               for thermal receipt printing (a plain luminance
//                               threshold would render the teal fill as a
//                               solid black block, so ink/no-ink is precomputed here).
// Re-run this if the source logo ever changes.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'images', 'MAINlogo.png');
const UI_LOGO_OUT = path.join(__dirname, '..', 'public', 'logo.png');
const RECEIPT_LOGO_OUT = path.join(__dirname, 'receipt-logo.png');
const PAD = 32;

const src = PNG.sync.read(fs.readFileSync(SRC));
const { width, height, data } = src;

function getPixel(x, y) {
  const idx = (width * y + x) << 2;
  return [data[idx], data[idx + 1], data[idx + 2]];
}

// Locate the gold wordmark's bounding box (distinct from the dark teal fill).
function isGoldish([r, g, b]) {
  return r > 120 && g > 80 && b < 160 && r > b + 40 && g > b + 10;
}
let minX = width, maxX = 0, minY = height, maxY = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (isGoldish(getPixel(x, y))) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
minX = Math.max(0, minX - PAD);
maxX = Math.min(width - 1, maxX + PAD);
minY = Math.max(0, minY - PAD);
maxY = Math.min(height - 1, maxY + PAD);
const cw = maxX - minX + 1;
const ch = maxY - minY + 1;

// ===== UI logo: cropped, full color =====
const uiLogo = new PNG({ width: cw, height: ch });
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const s = (width * (y + minY) + (x + minX)) << 2;
    const d = (cw * y + x) << 2;
    uiLogo.data[d] = src.data[s];
    uiLogo.data[d + 1] = src.data[s + 1];
    uiLogo.data[d + 2] = src.data[s + 2];
    uiLogo.data[d + 3] = src.data[s + 3];
  }
}
fs.writeFileSync(UI_LOGO_OUT, PNG.sync.write(uiLogo));

// ===== Receipt logo: same crop, thresholded to pure black/white =====
const bg = [14, 62, 64]; // brand teal, sampled from the source background
function isInk(r, g, b) {
  return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 60;
}
const receiptLogo = new PNG({ width: cw, height: ch, colorType: 0 });
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const s = (width * (y + minY) + (x + minX)) << 2;
    const d = (cw * y + x) << 2;
    const v = isInk(src.data[s], src.data[s + 1], src.data[s + 2]) ? 0 : 255;
    receiptLogo.data[d] = v;
    receiptLogo.data[d + 1] = v;
    receiptLogo.data[d + 2] = v;
    receiptLogo.data[d + 3] = 255;
  }
}
fs.writeFileSync(RECEIPT_LOGO_OUT, PNG.sync.write(receiptLogo));

console.log(`Generated ${UI_LOGO_OUT} and ${RECEIPT_LOGO_OUT} (${cw}x${ch})`);
