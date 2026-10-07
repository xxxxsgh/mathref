// Textura 3D de ruído periódica (tileable), gerada uma única vez na CPU.
//
// Ruído procedural direto no shader (Perlin/Worley em TSL) é caro demais
// para raymarching volumétrico — principalmente no fallback WebGL2 por CPU
// (SwiftShader). Em vez disso amostramos esta textura 3D com filtro
// trilinear: uma busca = 4 oitavas "prontas" (um canal por oitava).
//
//   R → gradiente (Perlin) frequência 4   (formas grandes)
//   G → gradiente frequência 8
//   B → Worley invertido frequência 4   (nuvens "fofas", células)
//   A → gradiente frequência 16          (detalhe fino)
//
// Todos os canais são periódicos no cubo [0,1)³ → RepeatWrapping sem costura.

import * as THREE from 'three/webgpu';
import { makeRng } from '../../core/Rng.js';

const SIZE = 64;
let cached = null;

/** Gradiente periódico (Perlin melhorado) com período `per` células. */
function makePerlin(seed) {
  const r = makeRng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => {
    const u = (h & 15) < 8 ? x : y;
    const v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  };
  return (x, y, z, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const X0 = ((xi % per) + per) % per, Y0 = ((yi % per) + per) % per, Z0 = ((zi % per) + per) % per;
    const X1 = (X0 + 1) % per, Y1 = (Y0 + 1) % per, Z1 = (Z0 + 1) % per;
    const h = (a, b, c) => perm[perm[perm[a] + b] + c];
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(grad(h(X0, Y0, Z0), xf, yf, zf), grad(h(X1, Y0, Z0), xf - 1, yf, zf), u), l(grad(h(X0, Y1, Z0), xf, yf - 1, zf), grad(h(X1, Y1, Z0), xf - 1, yf - 1, zf), u), v),
      l(l(grad(h(X0, Y0, Z1), xf, yf, zf - 1), grad(h(X1, Y0, Z1), xf - 1, yf, zf - 1), u), l(grad(h(X0, Y1, Z1), xf, yf - 1, zf - 1), grad(h(X1, Y1, Z1), xf - 1, yf - 1, zf - 1), u), v),
      w,
    );
  };
}

/** Worley periódico (F1) com `n` células por lado, 1 ponto por célula. */
function makeWorley(seed, n) {
  const r = makeRng(seed);
  const pts = new Float32Array(n * n * n * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = r();
  return (x, y, z) => {
    const fx = x * n, fy = y * n, fz = z * n;
    const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
    let best = 1e9;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const ix = cx + dx, iy = cy + dy, iz = cz + dz;
          const wx = ((ix % n) + n) % n, wy = ((iy % n) + n) % n, wz = ((iz % n) + n) % n;
          const k = (wx + wy * n + wz * n * n) * 3;
          const px = ix + pts[k] - fx, py = iy + pts[k + 1] - fy, pz = iz + pts[k + 2] - fz;
          const d = px * px + py * py + pz * pz;
          if (d < best) best = d;
        }
    return Math.sqrt(best);
  };
}

/** Data3DTexture RGBA8 64³ periódica (cacheada para todo o jogo). */
export function noiseTexture3D() {
  if (cached) return cached;
  const N = SIZE;
  const data = new Uint8Array(N * N * N * 4);
  const pa = makePerlin(101);
  const pb = makePerlin(202);
  const pc = makePerlin(303);
  const wo = makeWorley(404, 4);
  const to8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  let k = 0;
  for (let z = 0; z < N; z++) {
    const w = z / N;
    for (let y = 0; y < N; y++) {
      const v = y / N;
      for (let x = 0; x < N; x++) {
        const u = x / N;
        // gradiente ∈ ~[-0.9,0.9] → [0,1]
        data[k++] = to8(0.5 + 0.55 * pa(u * 4, v * 4, w * 4, 4));
        data[k++] = to8(0.5 + 0.55 * pb(u * 8, v * 8, w * 8, 8));
        data[k++] = to8(1 - Math.min(1, wo(u, v, w) * 1.6));
        data[k++] = to8(0.5 + 0.55 * pc(u * 16, v * 16, w * 16, 16));
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  tex.name = 'space-noise3d';
  cached = tex;
  return tex;
}
