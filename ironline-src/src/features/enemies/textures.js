/**
 * Texturas procedurais do soldado (geradas uma vez, compartilhadas):
 *
 *   camo   RGBA — R/G/B = máscaras das 3 manchas do padrão de camuflagem
 *                 (multi-tom, bordas suaves com granulado de impressão),
 *                 A = sujeira/desgaste de baixa frequência.
 *   detail RGBA — R = trama ripstop (altura), G = rugas/dobras de tecido
 *                 (ruído anisotrópico, alongado na horizontal),
 *                 B = granulado (couro, polímero, borracha), A = manchas.
 *
 * Tudo amostrado em triplanar no espaço de REPOUSO do modelo, então a
 * estampa fica grudada no corpo quando o esqueleto anima.
 */
import * as THREE from 'three';

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** ruído de valor tileável (período px × py células) */
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a, p) => ((a % p) + p) % p;
  const a = hash(w(xi, px), w(yi, py), seed), b = hash(w(xi + 1, px), w(yi, py), seed);
  const c = hash(w(xi, px), w(yi + 1, py), seed), d = hash(w(xi + 1, px), w(yi + 1, py), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** fBm tileável em [0,1]² com frequência base (fx, fy) */
function fbm(u, v, fx, fy, oct, seed, gain = 0.5) {
  let s = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    const m = 1 << o;
    s += amp * vnoise(u * fx * m, v * fy * m, fx * m, fy * m, seed + o * 17);
    norm += amp;
    amp *= gain;
  }
  return s / norm;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function toTexture(data, size, { srgb = false } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function camoTexture(size = 256) {
  // padrão multi-terreno: manchas grandes suaves, manchas médias e
  // "galhos"/pontos pequenos de alto contraste; bordas levemente serrilhadas
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const wu = u + 0.06 * (fbm(u, v, 5, 5, 3, 91) - 0.5);
      const wv = v + 0.06 * (fbm(u, v, 5, 5, 3, 57) - 0.5);
      const grain = (hash(x, y, 3) - 0.5) * 0.05;
      const n1 = fbm(wu, wv, 3, 3, 4, 11) + grain;
      const n2 = fbm(wu + 0.31, wv, 6, 6, 3, 23) + grain;
      // galhos: ruído "ridged" fino
      const rr = 1 - Math.abs(fbm(wu, wv, 5, 7, 3, 37) * 2 - 1);
      const n4 = fbm(wu, wv, 12, 12, 2, 47) + grain;
      const i = (y * size + x) * 4;
      const big = smooth(0.5, 0.53, n1);
      const mid = smooth(0.58, 0.61, n2) * (1 - big * 0.6);
      const small = Math.max(smooth(0.9, 0.93, rr) * 0.9, smooth(0.66, 0.69, n4));
      d[i] = 255 * big;
      d[i + 1] = 255 * mid;
      d[i + 2] = 255 * small;
      d[i + 3] = 255 * fbm(u, v, 3, 3, 5, 71, 0.6);
    }
  return toTexture(d, size);
}

export function detailTexture(size = 256) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // trama: fios alternados + grade ripstop a cada 16 px
      const wx = Math.sin((x / size) * Math.PI * 2 * 64), wy = Math.sin((y / size) * Math.PI * 2 * 64);
      let weave = 0.5 + 0.25 * (wx > 0 === wy > 0 ? wx * wy : -wx * wy);
      const gx = x % 16, gy = y % 16;
      if (gx < 2 || gy < 2) weave = 0.85;
      // rugas: ruído alongado em u (dobras horizontais nas mangas e pernas)
      const wr = fbm(u + 0.05 * fbm(u, v, 2, 6, 2, 5), v, 2, 9, 4, 13);
      const wrinkle = Math.pow(Math.abs(Math.sin(wr * Math.PI * 3.0)), 0.6);
      const grain = 0.6 * fbm(u, v, 32, 32, 2, 41) + 0.4 * hash(x, y, 9);
      const blot = fbm(u, v, 5, 5, 4, 61);
      const i = (y * size + x) * 4;
      d[i] = 255 * weave;
      d[i + 1] = 255 * wrinkle;
      d[i + 2] = 255 * grain;
      d[i + 3] = 255 * blot;
    }
  return toTexture(d, size);
}
