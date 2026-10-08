// Textura 3D de ruído periódico do sistema planets (gerada uma vez na CPU).
// Usada SÓ para detalhe visual (texturas de terreno, nuvens, ondas, faixas
// de gigantes gasosos) — o relevo vem de terrain.js. Amostrar ruído por
// textura 3D é muito mais barato que ALU, essencial no iPad.
//
// Canais (0..1, média ~0,5):
//   R  fBm gradiente, 4 oitavas, base 4
//   G  fBm gradiente, 4 oitavas, base 8 (deslocado)
//   B  Worley invertido F1 (células), 5 por período
//   A  ridged, 4 oitavas, base 4
import * as THREE from 'three/webgpu';
import { Rng } from '../../core/Rng.js';

function gradNoise(seed) {
  const r = new Rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  r.shuffle(p);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const g = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const z = r.range(-1, 1), a = r.range(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
    g[i * 3] = Math.cos(a) * s; g[i * 3 + 1] = Math.sin(a) * s; g[i * 3 + 2] = z;
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, z, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    let acc = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
      const X = (xi + dx) % per, Y = (yi + dy) % per, Z = (zi + dz) % per;
      const h = perm[perm[perm[X] + Y] + Z] * 3;
      const d = g[h] * (xf - dx) + g[h + 1] * (yf - dy) + g[h + 2] * (zf - dz);
      acc += d * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    }
    return acc;
  };
}

let cached = null;
export function planetNoiseTexture(N = 64) {
  if (cached) return cached;
  const noise = gradNoise(4242);
  const cells = 5, rr = new Rng(99);
  const pts = new Float32Array(cells ** 3 * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = 0.1 + rr.next() * 0.8;
  const data = new Uint8Array(N * N * N * 4);
  const fbm = (u, v, w, base, oct, off) => {
    let s = 0, a = 0.5, f = base, n = 0;
    for (let o = 0; o < oct; o++) { s += a * noise(u * f + off, v * f + off, w * f + off, f); n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
  let k = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, w = z / N;
    const r = fbm(u, v, w, 4, 4, 0) * 1.7 + 0.5;
    const g = fbm(u, v, w, 8, 3, 0) * 1.7 + 0.5;
    // Worley periódico
    const fx = u * cells, fy = v * cells, fz = w * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    let d1 = 9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const cx = ix + a, cy = iy + b, cz = iz + c;
      const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells, wz = ((cz % cells) + cells) % cells;
      const q = ((wz * cells + wy) * cells + wx) * 3;
      const d = (cx + pts[q] - fx) ** 2 + (cy + pts[q + 1] - fy) ** 2 + (cz + pts[q + 2] - fz) ** 2;
      if (d < d1) d1 = d;
    }
    const b = 1 - Math.min(1, Math.sqrt(d1) * 1.15);
    let s = 0, aa = 0.5, f = 4, wgt = 1, tot = 0;
    for (let o = 0; o < 4; o++) {
      let vv = 1 - Math.abs(noise(u * f + 3.1, v * f + 3.1, w * f + 3.1, f) * 1.5);
      vv = Math.max(0, vv); vv *= vv * wgt; wgt = Math.min(1, vv * 2);
      s += vv * aa; tot += aa; aa *= 0.5; f *= 2;
    }
    const A = s / tot;
    data[k++] = Math.max(0, Math.min(255, r * 255));
    data[k++] = Math.max(0, Math.min(255, g * 255));
    data[k++] = Math.max(0, Math.min(255, b * 255));
    data[k++] = Math.max(0, Math.min(255, A * 255 * 1.25));
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
