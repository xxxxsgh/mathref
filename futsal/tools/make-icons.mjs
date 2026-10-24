// Gera os ícones PNG do PWA em pixel art (sem dependências).
// Uso: node tools/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'icons');

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#0b1120'), WOOD = hex('#c8894a'), WOOD2 = hex('#b5763c'), LINE = hex('#f5f5f4'), BALL = hex('#f8fafc'), DARK = hex('#1e293b'), SH = hex('#7a4b25'), GOLD = hex('#facc15');

// Arte base 32x32: bola sobre o piso de madeira da quadra.
function art(x, y) {
  if (y >= 22) {
    if (y === 24) return LINE;
    return (Math.floor((x + (y % 2) * 5) / 6) % 2) ? WOOD : WOOD2;
  }
  // brilho do ginásio
  const cx = 16, cy = 13, r = 7.5;
  const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
  if (d <= r) {
    const pent = [[15, 12], [16, 12], [15, 13], [16, 13], [12, 9], [19, 9], [11, 15], [20, 15], [15, 18], [16, 18]];
    if (pent.some(([a, b]) => a === x && b === y)) return DARK;
    if (d > r - 1) return DARK;
    return BALL;
  }
  if (y === 21 && x >= 11 && x <= 20) return SH;
  if ((x === 3 || x === 28) && y >= 4 && y <= 21) return LINE; // traves
  if (y === 4 && (x <= 3 || x >= 28)) return LINE;
  if ((x + y) % 7 === 0 && y < 6) return GOLD;
  return BG;
}

function render(size, pad = 0) {
  return png(size, (x, y) => {
    const s = size * (1 - pad * 2);
    const ux = (x - size * pad) / s, uy = (y - size * pad) / s;
    if (ux < 0 || uy < 0 || ux >= 1 || uy >= 1) return uy >= 0.6875 && uy < 2 ? WOOD : BG;
    return art(Math.floor(ux * 32), Math.floor(uy * 32));
  });
}

writeFileSync(join(out, 'icon-192.png'), render(192));
writeFileSync(join(out, 'icon-512.png'), render(512));
writeFileSync(join(out, 'apple-touch-icon.png'), render(180));
writeFileSync(join(out, 'icon-512-maskable.png'), render(512, 0.1));
console.log('Ícones gerados em', out);
