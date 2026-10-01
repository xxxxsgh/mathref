/**
 * Texturas procedurais da arma e dos braços (geradas na CPU uma única vez).
 *
 * Nada aqui depende de UV bem comportada: as texturas de detalhe da arma são
 * amostradas em TRIPLANAR no espaço do objeto (ver materials.js), então os
 * geradores só precisam ser tileáveis.
 *
 *  grime   RGBA  R = ruído fino (rugosidade), G = arranhões, B = manchas
 *                grandes (sujeira/óleo), A = pontilhado (poeira/poros)
 *  fabric  RGBA  R = altura da trama (cordura), G = fibra/fiapos,
 *                B = variação larga, A = costura/abrasão
 *  camo    sRGB  padrão de camuflagem multi-terreno original (manchas em 5 tons)
 */
import * as THREE from 'three';

/** PRNG mulberry32 (determinístico; independe do Math.random semeado). */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise tileável (período px × py) somado em `out` com amplitude amp. */
function octave(N, px, py, r, out, amp) {
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  for (let y = 0; y < N; y++) {
    const fy = (y * py) / N, j = Math.floor(fy), ty = fade(fy - j);
    const r0 = (j % py) * px, r1 = ((j + 1) % py) * px;
    for (let x = 0; x < N; x++) {
      const fx = (x * px) / N, i = Math.floor(fx), tx = fade(fx - i);
      const i0 = i % px, i1 = (i + 1) % px;
      const a = lat[r0 + i0], b = lat[r0 + i1], c = lat[r1 + i0], d = lat[r1 + i1];
      const top = a + (b - a) * tx, bot = c + (d - c) * tx;
      out[y * N + x] += (top + (bot - top) * ty) * amp;
    }
  }
}

/** fBm tileável normalizado para [0,1]. */
export function fbm(N, seed, period = 4, octaves = 5, gain = 0.5, stretch = 1) {
  const r = mulberry(seed);
  const out = new Float32Array(N * N);
  let amp = 1, p = period, sum = 0;
  for (let o = 0; o < octaves && p <= N; o++) {
    octave(N, p, Math.max(1, Math.round(p * stretch)), r, out, amp);
    sum += amp;
    amp *= gain;
    p *= 2;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i] /= sum;
    lo = Math.min(lo, out[i]);
    hi = Math.max(hi, out[i]);
  }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function dataTex(data, N, { srgb = false, repeat = true } = {}) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Arranhões: segmentos finos, levemente curvos, tileáveis (desenhados com wrap). */
function scratches(N, seed, count) {
  const r = mulberry(seed);
  const out = new Float32Array(N * N);
  const plot = (x, y, v) => {
    const xi = ((Math.round(x) % N) + N) % N, yi = ((Math.round(y) % N) + N) % N;
    const k = yi * N + xi;
    out[k] = Math.max(out[k], v);
  };
  for (let s = 0; s < count; s++) {
    let x = r() * N, y = r() * N;
    // famílias de direção: a maioria dos arranhões de manuseio é paralela
    const fam = r();
    let ang = fam < 0.45 ? 0.1 + r() * 0.3 : fam < 0.8 ? 1.4 + r() * 0.35 : r() * Math.PI;
    const len = 6 + Math.pow(r(), 2.2) * N * 0.35;
    const strength = 0.35 + r() * 0.65;
    const bend = (r() - 0.5) * 0.004;
    for (let i = 0; i < len; i++) {
      const f = i / len;
      const taper = Math.sin(Math.PI * f) ** 0.6;
      plot(x, y, strength * taper);
      if (r() < 0.25) plot(x + 1, y, strength * taper * 0.35);
      x += Math.cos(ang);
      y += Math.sin(ang);
      ang += bend;
    }
  }
  return out;
}

let _grime = null;
/** Textura de detalhe de superfícies duras (metal anodizado, polímero). */
export function grimeTexture() {
  if (_grime) return _grime;
  const N = 512;
  const fine = fbm(N, 101, 32, 4, 0.55);
  const sc = scratches(N, 202, 340);
  const blot = fbm(N, 303, 3, 6, 0.55);
  const speck = fbm(N, 404, 128, 2, 0.5);
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = fine[i] * 255;
    d[i * 4 + 1] = clamp01(sc[i]) * 255;
    d[i * 4 + 2] = blot[i] * 255;
    d[i * 4 + 3] = smooth(0.62, 0.9, speck[i]) * 255;
  }
  _grime = dataTex(d, N);
  return _grime;
}

let _fabric = null;
/** Trama de cordura (sarja 2×2) + fibras + variação, tileável. */
export function fabricTexture() {
  if (_fabric) return _fabric;
  const N = 256;
  const T = 16; // fios por repetição (por eixo)
  const fib = fbm(N, 505, 64, 3, 0.6);
  const big = fbm(N, 606, 4, 5, 0.55);
  const fuzz = fbm(N, 707, 16, 4, 0.5);
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * T, v = (y / N) * T;
      const cu = Math.floor(u), cv = Math.floor(v);
      const fu = u - cu, fv = v - cv;
      // sarja: o fio por cima alterna em diagonal
      const over = ((cu + cv) & 3) < 2;
      const warp = Math.sin(Math.PI * fu) ** 0.7 * (0.75 + 0.25 * Math.sin(Math.PI * fv));
      const weft = Math.sin(Math.PI * fv) ** 0.7 * (0.75 + 0.25 * Math.sin(Math.PI * fu));
      const h = over ? 0.25 + 0.75 * warp : 0.25 + 0.75 * weft;
      const i = y * N + x;
      d[i * 4] = clamp01(h * (0.8 + 0.4 * fib[i])) * 255;
      d[i * 4 + 1] = fib[i] * 255;
      d[i * 4 + 2] = big[i] * 255;
      d[i * 4 + 3] = smooth(0.55, 0.85, fuzz[i]) * 255;
    }
  }
  _fabric = dataTex(d, N);
  return _fabric;
}

let _camo = null;
/**
 * Camuflagem original "IRL-MT": base areia, manchas oliva/marrom, galhos
 * escuros finos e realces claros. sRGB.
 */
export function camoTexture() {
  if (_camo) return _camo;
  const N = 512;
  const a = fbm(N, 808, 3, 6, 0.6);
  const b = fbm(N, 909, 4, 6, 0.6, 1.6);
  const c = fbm(N, 1010, 6, 5, 0.6);
  const e = fbm(N, 1111, 5, 5, 0.55);
  const grain = fbm(N, 1212, 128, 2, 0.5);
  const pal = [
    [0.2, 0.175, 0.128], // areia queimada
    [0.105, 0.11, 0.07], // oliva
    [0.13, 0.09, 0.06], // marrom
    [0.045, 0.042, 0.035], // galho escuro
    [0.27, 0.25, 0.19], // realce claro
  ];
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    let col = pal[0];
    if (a[i] > 0.56) col = pal[1];
    if (b[i] > 0.6) col = pal[2];
    if (c[i] > 0.47 && c[i] < 0.5) col = pal[3];
    if (e[i] > 0.7) col = pal[4];
    const g = 0.92 + grain[i] * 0.16;
    d[i * 4] = Math.pow(clamp01(col[0] * g), 1 / 2.2) * 255;
    d[i * 4 + 1] = Math.pow(clamp01(col[1] * g), 1 / 2.2) * 255;
    d[i * 4 + 2] = Math.pow(clamp01(col[2] * g), 1 / 2.2) * 255;
    d[i * 4 + 3] = 255;
  }
  _camo = dataTex(d, N, { srgb: true });
  return _camo;
}

/** Gravação a laser (texto) para a lateral do receptor: canvas → textura α. */
export function engravingTexture(lines, { w = 512, h = 128, font = 'bold 34px monospace' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  const step = h / (lines.length + 0.5);
  lines.forEach((ln, i) => {
    g.font = ln.font || font;
    g.globalAlpha = ln.alpha ?? 1;
    g.fillText(ln.text, ln.x ?? 8, step * (i + 0.75));
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}
