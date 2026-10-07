// Textura 3D de ruído PERIÓDICO (repete sem emenda), gerada uma vez na CPU.
// Amostrar uma textura 3D com filtragem trilinear é MUITO mais barato que
// avaliar ruído procedural por ALU — é o que torna nebulosas por raymarching,
// disco de acreção e materiais de asteroide viáveis até no iPad.
//
// Canais (0..1):
//   R  fBm de Perlin, 4 oitavas, frequência base 4   (forma geral, nuvens)
//   G  fBm de Perlin, 4 oitavas, frequência base 8   (detalhe)
//   B  Worley invertido (células), frequência 6       (aglomerados, crateras)
//   A  ridged multifractal, frequência base 4         (filamentos, veios)
import * as THREE from 'three/webgpu';
import { Rng } from '../../core/Rng.js';

function makePerlin(seed) {
  const r = new Rng(seed);
  const perm = new Uint16Array(512);
  const p = [...Array(256).keys()];
  r.shuffle(p);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256), gz = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    // gradientes uniformes na esfera
    const z = r.range(-1, 1), a = r.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
    gx[i] = Math.cos(a) * s; gy[i] = Math.sin(a) * s; gz[i] = z;
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  /** Perlin periódico com período `per` (inteiro) em cada eixo. */
  return function noise(x, y, z, per) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    let acc = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
      const X = ((xi + dx) % per + per) % per, Y = ((yi + dy) % per + per) % per, Z = ((zi + dz) % per + per) % per;
      const h = perm[perm[perm[X] + Y] + Z];
      const d = gx[h] * (xf - dx) + gy[h] * (yf - dy) + gz[h] * (zf - dz);
      acc += d * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    }
    return acc; // ~[-0.9, 0.9]
  };
}

function makeWorley(seed, cells) {
  const r = new Rng(seed);
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = r.next();
  return function worley(x, y, z) { // x,y,z em [0,1)
    const fx = x * cells, fy = y * cells, fz = z * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let d1 = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cx = ix + a, cy = iy + b, cz = iz + c;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells, wz = ((cz % cells) + cells) % cells;
      const k = ((wz * cells + wy) * cells + wx) * 3;
      const px = cx + pts[k], py = cy + pts[k + 1], pz = cz + pts[k + 2];
      const d = (px - fx) ** 2 + (py - fy) ** 2 + (pz - fz) ** 2;
      if (d < d1) d1 = d;
    }
    return Math.sqrt(d1);
  };
}

let cached = null;

/** Data3DTexture compartilhada (criada uma vez). size padrão 64³. */
export function getNoise3D(size = 64, seed = 9001) {
  if (cached) return cached;
  const N = size;
  const data = new Uint8Array(N * N * N * 4);
  const perlin = makePerlin(seed);
  const worley = makeWorley(seed + 7, 6);
  const fbm = (x, y, z, base, oct) => {
    let s = 0, a = 0.5, f = base, n = 0;
    for (let o = 0; o < oct; o++) { s += a * perlin(x * f, y * f, z * f, f); n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
  const ridged = (x, y, z, base, oct) => {
    let s = 0, a = 0.5, f = base, w = 1, n = 0;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(perlin(x * f, y * f, z * f, f) * 1.4);
      v = Math.max(0, v); v *= v * w; w = Math.min(1, v * 2);
      s += v * a; n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  };
  let k = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    const r = fbm(u, v, w, 4, 4) * 1.6 * 0.5 + 0.5;
    const g = fbm(u + 0.37, v + 0.11, w + 0.73, 8, 3) * 1.6 * 0.5 + 0.5;
    const b = 1 - Math.min(1, worley(u, v, w) * 1.25);
    const a = ridged(u, v, w, 4, 4);
    data[k++] = Math.max(0, Math.min(255, r * 255));
    data[k++] = Math.max(0, Math.min(255, g * 255));
    data[k++] = Math.max(0, Math.min(255, b * 255));
    data[k++] = Math.max(0, Math.min(255, a * 255 * 1.3));
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
