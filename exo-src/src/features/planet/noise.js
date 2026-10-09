/**
 * RUÍDO do sistema planet — puro (sem three/DOM): roda igual no thread
 * principal (heightAt síncrono) e nos workers (malhas). Tudo em double.
 *
 *   gnoise(x, y, z, s)   ruído de gradiente 3D (quíntico), ~[-1, 1]
 *   gnoised(x, y, z, s)  idem + derivadas analíticas em D[0..2] (erosão)
 *   pnoise2(x, y, P, s)  ruído 2D PERIÓDICO (período P) — texturas que repetem sem costura
 *   hash32(...)          hash inteiro estável (sementes por região)
 *
 * Determinismo: só aritmética de double + Math.imul — o mesmo resultado no
 * worker e no thread principal (mesmo motor JS).
 */

// gradientes: 12 arestas do cubo + 4 repetidas (índice de 4 bits)
const GX = new Int8Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, -1, 0, 0]);
const GY = new Int8Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, 1, -1, -1]);
const GZ = new Int8Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 0, 1, -1]);

/** Derivadas da última chamada de gnoised (∂/∂x, ∂/∂y, ∂/∂z no espaço do ruído). */
export const D = new Float64Array(3);

function h3(ix, iy, iz, s) {
  let n = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x1b873593) ^ s) | 0;
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return (n ^ (n >>> 16)) & 15;
}

/** Hash uint32 de até 5 inteiros. */
export function hash32(a, b = 0, c = 0, d = 0, e = 0) {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(d | 0, 0x27d4eb2f) ^ Math.imul(e | 0, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** [0,1) a partir de um hash. */
export const unit = (h) => (h >>> 0) / 4294967296;

/** Ruído de gradiente 3D sem derivadas. */
export function gnoise(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  let g;
  g = h3(ix, iy, iz, s); const va = GX[g] * fx + GY[g] * fy + GZ[g] * fz;
  g = h3(ix + 1, iy, iz, s); const vb = GX[g] * (fx - 1) + GY[g] * fy + GZ[g] * fz;
  g = h3(ix, iy + 1, iz, s); const vc = GX[g] * fx + GY[g] * (fy - 1) + GZ[g] * fz;
  g = h3(ix + 1, iy + 1, iz, s); const vd = GX[g] * (fx - 1) + GY[g] * (fy - 1) + GZ[g] * fz;
  g = h3(ix, iy, iz + 1, s); const ve = GX[g] * fx + GY[g] * fy + GZ[g] * (fz - 1);
  g = h3(ix + 1, iy, iz + 1, s); const vf = GX[g] * (fx - 1) + GY[g] * fy + GZ[g] * (fz - 1);
  g = h3(ix, iy + 1, iz + 1, s); const vg = GX[g] * fx + GY[g] * (fy - 1) + GZ[g] * (fz - 1);
  g = h3(ix + 1, iy + 1, iz + 1, s); const vh = GX[g] * (fx - 1) + GY[g] * (fy - 1) + GZ[g] * (fz - 1);
  const x1 = va + ux * (vb - va), x2 = vc + ux * (vd - vc);
  const x3 = ve + ux * (vf - ve), x4 = vg + ux * (vh - vg);
  const y1 = x1 + uy * (x2 - x1), y2 = x3 + uy * (x4 - x3);
  return y1 + uz * (y2 - y1);
}

/** Ruído de gradiente 3D com derivadas analíticas (em D). Fórmula de I. Quilez. */
export function gnoised(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const a = h3(ix, iy, iz, s), b = h3(ix + 1, iy, iz, s), c = h3(ix, iy + 1, iz, s), d = h3(ix + 1, iy + 1, iz, s);
  const e = h3(ix, iy, iz + 1, s), f = h3(ix + 1, iy, iz + 1, s), g = h3(ix, iy + 1, iz + 1, s), h = h3(ix + 1, iy + 1, iz + 1, s);
  const gax = GX[a], gay = GY[a], gaz = GZ[a];
  const gbx = GX[b], gby = GY[b], gbz = GZ[b];
  const gcx = GX[c], gcy = GY[c], gcz = GZ[c];
  const gdx = GX[d], gdy = GY[d], gdz = GZ[d];
  const gex = GX[e], gey = GY[e], gez = GZ[e];
  const gfx = GX[f], gfy = GY[f], gfz = GZ[f];
  const ggx = GX[g], ggy = GY[g], ggz = GZ[g];
  const ghx = GX[h], ghy = GY[h], ghz = GZ[h];
  const va = gax * fx + gay * fy + gaz * fz;
  const vb = gbx * (fx - 1) + gby * fy + gbz * fz;
  const vc = gcx * fx + gcy * (fy - 1) + gcz * fz;
  const vd = gdx * (fx - 1) + gdy * (fy - 1) + gdz * fz;
  const ve = gex * fx + gey * fy + gez * (fz - 1);
  const vf = gfx * (fx - 1) + gfy * fy + gfz * (fz - 1);
  const vg = ggx * fx + ggy * (fy - 1) + ggz * (fz - 1);
  const vh = ghx * (fx - 1) + ghy * (fy - 1) + ghz * (fz - 1);
  const k1 = vb - va, k2 = vc - va, k3 = ve - va;
  const k4 = va - vb - vc + vd, k5 = va - vc - ve + vg, k6 = va - vb - ve + vf;
  const k7 = -va + vb + vc - vd + ve - vf - vg + vh;
  const uxy = ux * uy, uyz = uy * uz, uzx = uz * ux, uxyz = uxy * uz;
  // gradiente interpolado dos cantos
  D[0] = gax + ux * (gbx - gax) + uy * (gcx - gax) + uz * (gex - gax) + uxy * (gax - gbx - gcx + gdx) + uyz * (gax - gcx - gex + ggx) + uzx * (gax - gbx - gex + gfx) + uxyz * (-gax + gbx + gcx - gdx + gex - gfx - ggx + ghx) + dux * (k1 + k4 * uy + k6 * uz + k7 * uyz);
  D[1] = gay + ux * (gby - gay) + uy * (gcy - gay) + uz * (gey - gay) + uxy * (gay - gby - gcy + gdy) + uyz * (gay - gcy - gey + ggy) + uzx * (gay - gby - gey + gfy) + uxyz * (-gay + gby + gcy - gdy + gey - gfy - ggy + ghy) + duy * (k2 + k5 * uz + k4 * ux + k7 * uzx);
  D[2] = gaz + ux * (gbz - gaz) + uy * (gcz - gaz) + uz * (gez - gaz) + uxy * (gaz - gbz - gcz + gdz) + uyz * (gaz - gcz - gez + ggz) + uzx * (gaz - gbz - gez + gfz) + uxyz * (-gaz + gbz + gcz - gdz + gez - gfz - ggz + ghz) + duz * (k3 + k6 * ux + k5 * uy + k7 * uxy);
  return va + ux * k1 + uy * k2 + uz * k3 + uxy * k4 + uyz * k5 + uzx * k6 + uxyz * k7;
}

/** fBm 3D simples (valor ~[-1,1]). */
export function fbm(x, y, z, s, oct, lac = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * gnoise(x, y, z, s + i * 1013);
    norm += amp;
    amp *= gain;
    x = x * lac + 5.31;
    y = y * lac - 2.77;
    z = z * lac + 1.19;
  }
  return sum / norm;
}

// ─── 2D periódico (texturas) ────────────────────────────────────────────
const G2X = new Float64Array(16), G2Y = new Float64Array(16);
for (let i = 0; i < 16; i++) {
  G2X[i] = Math.cos((i / 16) * Math.PI * 2);
  G2Y[i] = Math.sin((i / 16) * Math.PI * 2);
}
function h2(ix, iy, s) {
  let n = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ s) | 0;
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return (n ^ (n >>> 16)) & 15;
}
const mod = (a, p) => ((a % p) + p) % p;

/** Ruído de gradiente 2D com período inteiro P (em células). ~[-0.7, 0.7]. */
export function pnoise2(x, y, P, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const x0 = mod(ix, P), y0 = mod(iy, P), x1 = mod(ix + 1, P), y1 = mod(iy + 1, P);
  let g;
  g = h2(x0, y0, s); const a = G2X[g] * fx + G2Y[g] * fy;
  g = h2(x1, y0, s); const b = G2X[g] * (fx - 1) + G2Y[g] * fy;
  g = h2(x0, y1, s); const c = G2X[g] * fx + G2Y[g] * (fy - 1);
  g = h2(x1, y1, s); const d = G2X[g] * (fx - 1) + G2Y[g] * (fy - 1);
  const t = a + ux * (b - a);
  return t + uy * (c + ux * (d - c) - t);
}

/** fBm 2D periódico: x,y em [0,1) do ladrilho; base = células na 1ª oitava. */
export function pfbm2(x, y, base, oct, s, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, P = base;
  for (let i = 0; i < oct; i++) {
    sum += amp * pnoise2(x * P, y * P, P, s + i * 7919);
    norm += amp;
    amp *= gain;
    P *= 2;
  }
  return sum / norm;
}

/** Voronoi 2D periódico: devolve [F1, F2, id] em células (distâncias normalizadas). */
export function pvoronoi2(x, y, P, s, out = [0, 0, 0]) {
  const X = x * P, Y = y * P;
  const ix = Math.floor(X), iy = Math.floor(Y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const hh = hash32(mod(cx, P), mod(cy, P), s);
      const px = cx + unit(hh), py = cy + unit(hash32(hh, 17));
      const d = Math.hypot(px - X, py - Y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hh;
      } else if (d < f2) f2 = d;
    }
  }
  out[0] = f1;
  out[1] = f2;
  out[2] = id;
  return out;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
