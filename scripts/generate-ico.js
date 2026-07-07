const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const size = 256;
const png = new PNG({ width: size, height: size });

function drawCircle(x0, y0, r, R, G, B, A) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - x0, dy = y - y0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r) {
        const idx = (y * size + x) * 4;
        const alpha = dist > r - 4 ? Math.round(A * (r - dist) / 4) : A;
        if (alpha > 0) {
          png.data[idx] = Math.round((png.data[idx] * (255 - alpha) + R * alpha) / 255);
          png.data[idx + 1] = Math.round((png.data[idx + 1] * (255 - alpha) + G * alpha) / 255);
          png.data[idx + 2] = Math.round((png.data[idx + 2] * (255 - alpha) + B * alpha) / 255);
          png.data[idx + 3] = Math.max(png.data[idx + 3], alpha);
        }
      }
    }
  }
}

function drawRect(x1, y1, x2, y2, R, G, B, A) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      const idx = (y * size + x) * 4;
      png.data[idx] = R; png.data[idx + 1] = G;
      png.data[idx + 2] = B; png.data[idx + 3] = A;
    }
  }
}

function drawLetterS(ox, oy, scale, R, G, B, A) {
  const s = Math.round(scale);
  drawRect(ox + s, oy, ox + s * 5, oy + s * 2, R, G, B, A);
  drawRect(ox + s, oy + s * 2, ox + s * 6, oy + s * 3, R, G, B, A);
  drawRect(ox + s * 3, oy + s * 3, ox + s * 6, oy + s * 5, R, G, B, A);
  drawRect(ox + s, oy + s * 5, ox + s * 6, oy + s * 6, R, G, B, A);
  drawRect(ox + s, oy + s * 6, ox + s * 5, oy + s * 8, R, G, B, A);
  drawRect(ox + s, oy, ox + s * 2, oy + s * 3, R, G, B, A);
  drawRect(ox + s * 4, oy + s * 5, ox + s * 5, oy + s * 6, R, G, B, A);
}

drawCircle(size / 2, size / 2, size / 2 - 8, 59, 130, 246, 255);
drawCircle(size / 2, size / 2, size / 2 - 14, 255, 255, 255, 255);
drawCircle(size / 2, size / 2, size / 2 - 18, 59, 130, 246, 255);
drawLetterS(80, 68, 15, 255, 255, 255, 255);

const pngBuf = PNG.sync.write(png);

// Build ICO: header + directory entry + PNG data
const ico = Buffer.alloc(6 + 16 + pngBuf.length);
ico.writeUInt16LE(0, 0);      // reserved
ico.writeUInt16LE(1, 2);      // type: icon
ico.writeUInt16LE(1, 4);      // count: 1 image
ico.writeUInt8(0, 6);         // width (0 = 256)
ico.writeUInt8(0, 7);         // height (0 = 256)
ico.writeUInt8(0, 8);         // colors
ico.writeUInt8(0, 9);         // reserved
ico.writeUInt16LE(1, 10);     // planes
ico.writeUInt16LE(32, 12);    // bpp
ico.writeUInt32LE(pngBuf.length, 14);  // size
ico.writeUInt32LE(22, 18);    // offset (header + dir entry)
pngBuf.copy(ico, 22);

const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), pngBuf);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
console.log('Generated: assets/icon.png and assets/icon.ico');