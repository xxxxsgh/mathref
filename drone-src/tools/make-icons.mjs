/**
 * Gera os PNGs de ícone do PWA sem depender de nenhuma lib de imagem.
 *
 * Por que à mão: as únicas alternativas eram adicionar `sharp`/`canvas`
 * (binário nativo, ~10 MB) ao projeto ou commitar binários gerados fora do
 * repositório. O ícone é geometria simples — quatro rotores e um X — então
 * rasterizar na unha custa menos que a dependência.
 *
 *   node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [0x0a, 0x0d, 0x12];
const ACCENT = [0x35, 0xe0, 0xc8];

/** Cobertura por supersampling 3×3 — dá antialias sem filtro separado. */
const SS = 3;

function shape(x, y, s) {
  // Coordenadas normalizadas em [0,64] pra bater com o favicon.svg.
  const u = (x / s) * 64;
  const v = (y / s) * 64;

  // Corpo central
  if (u >= 26 && u <= 38 && v >= 26 && v <= 38) return true;

  // Braços em X (distância de ponto a segmento)
  const arms = [
    [20, 20, 44, 44],
    [44, 20, 20, 44],
  ];
  for (const [x1, y1, x2, y2] of arms) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy)));
    const px = u - (x1 + t * dx);
    const py = v - (y1 + t * dy);
    if (px * px + py * py <= 1.7 * 1.7) return true;
  }

  // Anéis dos rotores
  for (const [cx, cy] of [
    [20, 20],
    [44, 20],
    [20, 44],
    [44, 44],
  ]) {
    const d = Math.hypot(u - cx, v - cy);
    if (d <= 8.5 + 1.7 && d >= 8.5 - 1.7) return true;
  }
  return false;
}

/** Canto arredondado do fundo, no mesmo raio proporcional do SVG (14/64). */
function inBackground(x, y, s) {
  const r = (14 / 64) * s;
  const cx = Math.min(Math.max(x, r), s - r);
  const cy = Math.min(Math.max(y, r), s - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function render(size, opaque) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filtro "None" — o deflate já resolve bem em arte chapada
    for (let x = 0; x < size; x++) {
      let hits = 0;
      let bg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          // `maskable` precisa sangrar até a borda: sem canto arredondado o
          // sistema operacional aplica a máscara dele por cima.
          if (opaque || inBackground(px, py, size)) bg++;
          if (shape(px, py, size)) hits++;
        }
      }
      const total = SS * SS;
      const cov = hits / total;
      const alpha = Math.round((bg / total) * 255);
      const o = rowStart + 1 + x * 4;
      for (let c = 0; c < 3; c++) {
        raw[o + c] = Math.round(BG[c] * (1 - cov) + ACCENT[c] * cov);
      }
      raw[o + 3] = alpha;
    }
  }
  return raw;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function png(size, opaque) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size, opaque), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, opaque] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-512-maskable.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  const buf = png(size, opaque);
  writeFileSync(join(OUT, name), buf);
  console.log(`${name.padEnd(24)} ${size}×${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
