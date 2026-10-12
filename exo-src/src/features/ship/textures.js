/**
 * Texturas PROCEDURAIS do casco (geradas em código, sem assets):
 *
 *   detalhe (RGBA, ladrilhável)  R = altura dos painéis (sulcos, chapas,
 *                                    rebites, grelhas)  G = sujeira  B = máscara
 *                                    de lascas da pintura  A = variação de rugosidade
 *   normal  (RGB)                derivada da altura (Sobel com wrap)
 *
 * As duas são amostradas em TRIPLANAR no espaço do objeto pelo material do
 * casco (materials.js) — dispensa UVs e mantém a densidade de painéis igual
 * em todas as peças (fuselagem, asas, naceles, greebles, interior do cockpit).
 */
import * as THREE from 'three';
import { mulberry32 } from './util.js';

/** Ruído de valor ladrilhável (período em células). */
function makeTileNoise(rand, period) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = g[y0 * period + x0];
    const b = g[y0 * period + x1];
    const c = g[y1 * period + x0];
    const d = g[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** fbm ladrilhável em [0,1): coordenadas u,v em [0,1). */
function makeFbm(rand, basePeriod, octaves) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push({ n: makeTileNoise(rand, basePeriod << o), f: basePeriod << o, a: Math.pow(0.5, o) });
  const norm = layers.reduce((s, l) => s + l.a, 0);
  return (u, v) => {
    let s = 0;
    for (const l of layers) s += l.n(u * l.f, v * l.f) * l.a;
    return s / norm;
  };
}

/**
 * Gera as texturas de detalhe do casco.
 * @param {number} size  lado em px (potência de 2)
 * @param {number} seed
 */
export function generateHullDetail(size = 1024, seed = 7) {
  const rand = mulberry32(seed);
  const N = size;
  const height = new Float32Array(N * N);
  const edge = new Float32Array(N * N).fill(1e9); // distância à borda do painel (px)
  const grimeSeed = new Float32Array(N * N);
  const s = N / 1024; // escala de px

  // ── 1. subdivisão recursiva em painéis (as bordas do ladrilho são sulcos → sem costura)
  const panels = [];
  const split = (x0, y0, x1, y1, depth) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const minSide = 40 * s;
    const can = (w > minSide * 2 || h > minSide * 2) && depth < 7;
    if (can && (depth < 2 || rand() < 0.78)) {
      const horiz = w > h ? rand() < 0.8 : rand() < 0.2;
      const t = 0.28 + rand() * 0.44;
      if (horiz && w > minSide * 2) {
        const xm = Math.round(x0 + w * t);
        split(x0, y0, xm, y1, depth + 1);
        split(xm, y0, x1, y1, depth + 1);
        return;
      }
      if (!horiz && h > minSide * 2) {
        const ym = Math.round(y0 + h * t);
        split(x0, y0, x1, ym, depth + 1);
        split(x0, ym, x1, y1, depth + 1);
        return;
      }
    }
    panels.push({ x0, y0, x1, y1 });
  };
  split(0, 0, N, N, 0);

  const groove = 2.2 * s;
  for (const P of panels) {
    const w = P.x1 - P.x0;
    const h = P.y1 - P.y0;
    const kind = rand();
    const lift = rand() < 0.35 ? (rand() - 0.4) * 0.5 : 0; // chapas elevadas/rebaixadas
    const rivets = rand() < 0.45;
    const vents = kind > 0.86 && w > 60 * s && h > 60 * s;
    const hatch = !vents && kind > 0.7 && w > 70 * s && h > 70 * s;
    const rivetStep = (14 + rand() * 10) * s;
    for (let y = P.y0; y < P.y1; y++) {
      for (let x = P.x0; x < P.x1; x++) {
        const dx = Math.min(x - P.x0, P.x1 - 1 - x);
        const dy = Math.min(y - P.y0, P.y1 - 1 - y);
        const d = Math.min(dx, dy);
        const i = y * N + x;
        edge[i] = d;
        // perfil do sulco: fundo arredondado + chanfro
        let hgt = 0.55 + lift;
        if (d < groove) hgt = 0.08 + 0.12 * (d / groove);
        else if (d < groove + 3 * s) hgt = 0.2 + (0.35 + lift) * ((d - groove) / (3 * s));
        if (rivets && d > 5 * s && d < 8.5 * s) {
          // fileira de rebites paralela à borda
          const along = dx < dy ? y - P.y0 : x - P.x0;
          const m = along % rivetStep;
          const rr = Math.hypot(m - rivetStep / 2, d - 6.8 * s);
          if (rr < 2.1 * s) hgt += 0.22 * (1 - rr / (2.1 * s));
        }
        if (vents) {
          // grelha de aletas no terço central
          const cx = (x - P.x0) / w;
          const cy = (y - P.y0) / h;
          if (cx > 0.2 && cx < 0.8 && cy > 0.25 && cy < 0.75) {
            const ph = ((y - P.y0) % (7 * s)) / (7 * s);
            hgt = 0.18 + 0.35 * Math.sin(ph * Math.PI);
          }
        }
        if (hatch) {
          const ix = x - (P.x0 + w * 0.3);
          const iy = y - (P.y0 + h * 0.3);
          const iw = w * 0.4;
          const ih = h * 0.4;
          const di = Math.min(ix, iw - ix, iy, ih - iy);
          if (di > -1 && di < 1.6 * s) hgt -= 0.25;
        }
        height[i] = hgt;
      }
    }
  }

  // ── 2. sujeira, lascas e rugosidade
  const fbmA = makeFbm(rand, 4, 5);
  const fbmB = makeFbm(rand, 8, 4);
  const fbmC = makeFbm(rand, 16, 3);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = x / N;
      const v = y / N;
      const nA = fbmA(u, v);
      const nB = fbmB(u, v);
      const nC = fbmC(u, v);
      grimeSeed[i] = nA;
      const d = edge[i];
      // sujeira acumula nos sulcos e escorre em manchas grandes
      const nearGroove = Math.exp(-d / (9 * s));
      let grime = 0.55 * nearGroove * (0.5 + nB) + Math.max(0, nA - 0.52) * 2.2 + Math.max(0, nB - 0.6) * 0.8;
      grime = Math.min(1, grime);
      // lascas: perto das bordas e onde o ruído fino passa do limiar
      const chipEdge = Math.exp(-d / (14 * s));
      const chip = Math.max(0, Math.min(1, (nC * 0.75 + nB * 0.45 + chipEdge * 0.5 - 0.95) * 6));
      const rough = 0.5 + (nB - 0.5) * 0.9 + (nC - 0.5) * 0.4;
      data[i * 4] = Math.max(0, Math.min(255, height[i] * 255));
      data[i * 4 + 1] = grime * 255;
      data[i * 4 + 2] = chip * 255;
      data[i * 4 + 3] = Math.max(0, Math.min(255, rough * 255));
    }
  }

  // ── 3. normal por Sobel (com wrap)
  const nrm = new Uint8Array(N * N * 4);
  const H = (x, y) => height[((y + N) % N) * N + ((x + N) % N)];
  const k = 3.2 / s;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const gx = H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1);
      const gy = H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1);
      let nx = -gx * k;
      let ny = -gy * k;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * N + x) * 4;
      nrm[i] = (nx * 0.5 + 0.5) * 255;
      nrm[i + 1] = (ny * 0.5 + 0.5) * 255;
      nrm[i + 2] = (nz * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;
    }
  }

  const mk = (buf) => {
    const t = new THREE.DataTexture(buf, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { detail: mk(data), normal: mk(nrm) };
}

/** Textura radial suave (sprites de brilho, poeira, faíscas). */
export function makeGlowTexture(size = 64, power = 2.2) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const r = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - r, power);
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(d, size, size);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Textura de nuvem de poeira (fofa, ruído) para partículas de pouso/fumaça. */
export function makePuffTexture(size = 128, seed = 3) {
  const rand = mulberry32(seed);
  const fbm = makeFbm(rand, 4, 4);
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = u * 2 - 1;
      const dy = v * 2 - 1;
      const r = Math.hypot(dx, dy);
      const n = fbm(u, v);
      const a = Math.max(0, 1 - r * (0.75 + n * 0.7));
      const i = (y * size + x) * 4;
      const c = 200 + n * 55;
      d[i] = d[i + 1] = d[i + 2] = c;
      d[i + 3] = Math.pow(a, 1.6) * 255;
    }
  }
  const t = new THREE.DataTexture(d, size, size);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
