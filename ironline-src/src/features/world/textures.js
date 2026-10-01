/**
 * Geradores de texturas PBR procedurais (albedo sRGB + normal + ORM).
 *
 * ORM empacotado como no glTF: R = oclusão (aoMap), G = rugosidade
 * (roughnessMap), B = metalicidade (metalnessMap). A MESMA textura serve aos
 * três slots — uma amostragem a menos para escrever e para o cache.
 *
 * Cada gerador recebe N (resolução) e devolve { albedo, normal, orm, world }
 * em Uint8Array RGBA; `world` = metros cobertos por uma repetição (densidade
 * de texel consistente: ~N/world texels por metro).
 */
import * as THREE from 'three';
import { fbm, white, worley, cracks, smooth, clamp01, lerp, blur, heightToNormal, cavity, mulberry } from './noise.js';

const S = (v) => Math.max(0, Math.min(255, v * 255));

function pack(N, fn) {
  const a = new Uint8Array(N * N * 4), o = new Uint8Array(N * N * 4);
  const c = [0, 0, 0], m = [1, 0.9, 0];
  for (let i = 0; i < N * N; i++) {
    fn(i, c, m);
    const k = i * 4;
    a[k] = S(c[0]); a[k + 1] = S(c[1]); a[k + 2] = S(c[2]); a[k + 3] = 255;
    o[k] = S(m[0]); o[k + 1] = S(m[1]); o[k + 2] = S(m[2]); o[k + 3] = 255;
  }
  return { albedo: a, orm: o };
}

// ─── reboco/estuque pintado, rachado, descascando ──────────────────────
export function genPlaster(N, seed = 11) {
  const big = fbm(N, seed, { period: 3, octaves: 6 });
  const grain = fbm(N, seed + 1, { period: 64, octaves: 3 });
  const peelN = fbm(N, seed + 2, { period: 4, octaves: 6, gain: 0.55 });
  const cr = cracks(N, seed + 3, { cells: 4, width: 0.018, coverage: 0.3 });
  const wn = white(N, seed + 4);
  const brick = genBrickMask(N, 4, 16);
  const brickZone = fbm(N, seed + 5, { period: 2, octaves: 3 });
  const fade = fbm(N, seed + 6, { period: 5, octaves: 5 });
  const h = new Float32Array(N * N);
  const peel = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const p = smooth(0.87, 0.885, peelN[i]);
    peel[i] = p;
    h[i] = big[i] * 0.25 + grain[i] * 0.5 + wn[i] * 0.12 - p * (0.9 + (brickZone[i] > 0.6 ? brick[i] * 0.3 : 0)) - cr[i] * 0.6;
  }
  const edge = blur(peel, N, 2);
  const hb = blur(h, N, 1);
  const normal = heightToNormal(hb, N, 2.2);
  const cav = cavity(hb, N, 3, 1.4);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const p = peel[i];
    const e = smooth(0.15, 0.5, edge[i]) * (1 - p); // borda clara da tinta descascada
    const dirt = 0.84 + big[i] * 0.16 + (grain[i] - 0.5) * 0.08 + (fade[i] - 0.5) * 0.1;
    // tinta (neutra clara — o tom vem da cor de vértice)
    let r = 0.86 * dirt, g = 0.84 * dirt, b = 0.8 * dirt;
    // por baixo: reboco de cimento cinza; tijolo só em algumas zonas
    const under = brickZone[i] > 0.65 && brick[i] > 0.5 ? [0.56, 0.42, 0.35] : [0.66, 0.64, 0.6];
    r = lerp(r, under[0] * (0.8 + wn[i] * 0.3), p);
    g = lerp(g, under[1] * (0.8 + wn[i] * 0.3), p);
    b = lerp(b, under[2] * (0.8 + wn[i] * 0.3), p);
    r += e * 0.08; g += e * 0.08; b += e * 0.07;
    const k = cav[i] * (1 - cr[i] * 0.6);
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
    m[0] = cav[i]; m[1] = lerp(0.84, 0.95, p) + grain[i] * 0.04; m[2] = 0;
  });
  return { albedo, normal, orm, world: 4.0 };
}

/** Máscara simples de tijolos (1 = tijolo, 0 = argamassa) para reuso. */
function genBrickMask(N, cols, rows) {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * rows;
    const row = Math.floor(fy);
    const off = row % 2 ? 0.5 : 0;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cols + off;
      const ex = Math.min(fx - Math.floor(fx), 1 - (fx - Math.floor(fx))) * (1 / cols) * 4;
      const ey = Math.min(fy - row, 1 - (fy - row)) * (1 / rows) * 4;
      out[y * N + x] = Math.min(ex, ey) > 0.012 ? 1 : 0;
    }
  }
  return out;
}

// ─── concreto moldado ──────────────────────────────────────────────────
export function genConcrete(N, seed = 21) {
  const big = fbm(N, seed, { period: 2, octaves: 6, gain: 0.55 });
  const mid = fbm(N, seed + 1, { period: 12, octaves: 4 });
  const fine = fbm(N, seed + 2, { period: 96, octaves: 2 });
  const wn = white(N, seed + 3);
  const cr = cracks(N, seed + 4, { cells: 4, width: 0.012, coverage: 0.25 });
  const streak = fbm(N, seed + 5, { period: 24, octaves: 3, stretchY: 0.08 });
  const h = new Float32Array(N * N);
  const pore = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const y = Math.floor(i / N);
    const form = Math.abs(((y / N) * 4) % 1 - 0.5) > 0.494 ? 1 : 0; // juntas da forma
    pore[i] = wn[i] > 0.985 && fine[i] > 0.4 ? 1 : 0;
    h[i] = mid[i] * 0.3 + fine[i] * 0.35 - pore[i] * 0.8 - form * 0.25 - cr[i];
  }
  const hb = blur(h, N, 1);
  const normal = heightToNormal(hb, N, 1.8);
  const cav = cavity(hb, N, 3, 2.4);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const v = 0.5 + (big[i] - 0.5) * 0.22 + (mid[i] - 0.5) * 0.1 + (fine[i] - 0.5) * 0.06 - (streak[i] > 0.62 ? (streak[i] - 0.62) * 0.5 : 0);
    const k = cav[i];
    c[0] = v * 1.0 * k; c[1] = v * 0.98 * k; c[2] = v * 0.94 * k;
    m[0] = k; m[1] = 0.86 + mid[i] * 0.1; m[2] = 0;
  });
  return { albedo, normal, orm, world: 3.0 };
}

// ─── tijolo aparente ───────────────────────────────────────────────────
// Repetição de 3.84 m (16 × 48 tijolos de 0.24 × 0.08 m com junta de 1 cm):
// tons de olaria por tijolo (terracota, queimado, amarelado, reaproveitado),
// arestas boleadas e lascadas, argamassa recuada com areia, eflorescência
// salina e fuligem que SEGUEM os tijolos (não manchas soltas).
export function genBrick(N, seed = 31) {
  const cols = 16, rows = 48, TW = 3.84;
  const r = mulberry(seed);
  const nB = cols * rows;
  const tone = new Float32Array(nB * 6);
  for (let i = 0; i < nB; i++) {
    const t = r(), k = r();
    let c;
    // tons de olaria dessaturados (tijolo velho, curtido de sol e poeira)
    if (k < 0.5) c = [lerp(0.5, 0.6, t), lerp(0.34, 0.4, t), lerp(0.27, 0.31, t)];
    else if (k < 0.72) c = [lerp(0.42, 0.5, t), lerp(0.29, 0.34, t), lerp(0.24, 0.27, t)];
    else if (k < 0.88) c = [lerp(0.6, 0.68, t), lerp(0.46, 0.52, t), lerp(0.36, 0.41, t)];
    else c = [lerp(0.5, 0.58, t), lerp(0.46, 0.52, t), lerp(0.42, 0.47, t)];
    tone[i * 6] = c[0]; tone[i * 6 + 1] = c[1]; tone[i * 6 + 2] = c[2];
    tone[i * 6 + 3] = r(); // fuligem / sujeira do tijolo
    tone[i * 6 + 4] = (r() - 0.5) * 2; // inclinação x
    tone[i * 6 + 5] = (r() - 0.5) * 2; // inclinação y
  }
  const n1 = fbm(N, seed + 1, { period: 64, octaves: 3 });
  const n2 = fbm(N, seed + 2, { period: 8, octaves: 5 });
  const chip = fbm(N, seed + 3, { period: 48, octaves: 3 });
  const eff = fbm(N, seed + 4, { period: 4, octaves: 5 });
  const pit = white(N, seed + 5);
  const sand = blur(white(N, seed + 6), N, 1);
  const h = new Float32Array(N * N);
  const isB = new Float32Array(N * N);
  const bid = new Int32Array(N * N);
  const edge = new Float32Array(N * N);
  const bw = TW / cols, bh = TW / rows;
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * rows;
    const row = Math.floor(fy);
    const off = row % 2 ? 0.5 : 0;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cols + off;
      const col = Math.floor(fx);
      const lx = fx - col, ly = fy - row;
      const ex = Math.min(lx, 1 - lx) * bw, ey = Math.min(ly, 1 - ly) * bh;
      const i = y * N + x;
      const id = (row * cols + (((col % cols) + cols) % cols)) % nB;
      bid[i] = id;
      // lascas: a aresta "come" o tijolo onde o ruído é alto
      const ch = smooth(0.55, 0.85, chip[i]) * 0.012;
      const e = Math.min(ex, ey) - ch;
      edge[i] = e;
      const mortar = 0.005;
      const b = smooth(mortar, mortar + 0.0035, e);
      isB[i] = b;
      const bevel = smooth(mortar, mortar + 0.012, e);
      const tilt = tone[id * 6 + 4] * (lx - 0.5) * 0.05 + tone[id * 6 + 5] * (ly - 0.5) * 0.05;
      h[i] = b * (0.55 + bevel * 0.25 + tilt + n1[i] * 0.1 - (pit[i] > 0.985 ? 0.12 : 0)) + (1 - b) * (0.1 + sand[i] * 0.12);
    }
  }
  const hb = blur(h, N, 1);
  const normal = heightToNormal(hb, N, 4);
  const cav = cavity(hb, N, 2, 1.6);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const b = isB[i];
    const t = bid[i] * 6;
    const v = 0.88 + n1[i] * 0.2 + (n2[i] - 0.5) * 0.12;
    const soot = tone[t + 3] > 0.9 ? 0.7 : tone[t + 3] > 0.75 ? 0.9 : 1;
    let br = tone[t] * v * soot, bg = tone[t + 1] * v * soot, bb = tone[t + 2] * v * soot;
    // lasca recente: miolo do tijolo mais claro/alaranjado
    const fresh = smooth(0.7, 0.9, chip[i]) * (1 - smooth(0.004, 0.02, edge[i])) * b;
    br = lerp(br, 0.6, fresh * 0.5); bg = lerp(bg, 0.38, fresh * 0.5); bb = lerp(bb, 0.28, fresh * 0.5);
    const mo = 0.62 + n2[i] * 0.1 + (sand[i] - 0.5) * 0.12;
    let cr = lerp(mo, br, b), cg = lerp(mo * 0.97, bg, b), cb = lerp(mo * 0.92, bb, b);
    // eflorescência salina (velatura esbranquiçada, mais na argamassa)
    const ef = smooth(0.66, 0.9, eff[i]) * (0.35 + 0.4 * (1 - b));
    cr = lerp(cr, 0.72, ef * 0.45); cg = lerp(cg, 0.7, ef * 0.45); cb = lerp(cb, 0.66, ef * 0.45);
    const k = 0.55 + cav[i] * 0.45;
    c[0] = cr * k; c[1] = cg * k; c[2] = cb * k;
    m[0] = cav[i]; m[1] = lerp(0.96, 0.8 + n1[i] * 0.1, b) + ef * 0.04; m[2] = 0;
  });
  return { albedo, normal, orm, world: TW };
}

// ─── asfalto: agregado fino + ligante gasto ────────────────────────────
// Só a camada de "material". Remendos, rachaduras seladas, couro de
// jacaré, trilhas de pneu, sarjeta, buracos e poças vêm do shader de
// estrada (materials.js → W_ROAD) em coordenadas de mundo, sem repetição.
export function genAsphalt(N, seed = 41) {
  const big = fbm(N, seed, { period: 2, octaves: 6, gain: 0.55 });
  const mid = fbm(N, seed + 1, { period: 10, octaves: 4 });
  // agregado angular e miúdo: bordas de Worley (f2-f1) em duas escalas
  const w = worley(N, 220, seed + 2, { jitter: 1 });
  const w2 = worley(N, 90, seed + 5, { jitter: 1 });
  const wn = white(N, seed + 3);
  const sand = fbm(N, seed + 7, { period: 3, octaves: 5 });
  const ravel = fbm(N, seed + 8, { period: 6, octaves: 5 });
  const h = new Float32Array(N * N);
  const stoneM = new Float32Array(N * N);
  const sid = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const expo = 0.3 + smooth(0.45, 0.8, ravel[i]) * 0.45;
    const e1 = w.f2[i] - w.f1[i], e2 = w2.f2[i] - w2.f1[i];
    const s1 = smooth(0.06, 0.2, e1) * (w.id[i] < expo ? 1 : 0);
    const s2 = smooth(0.05, 0.16, e2) * (w2.id[i] < expo * 0.5 ? 1 : 0);
    const st = Math.max(s1 * 0.8, s2);
    stoneM[i] = st;
    sid[i] = s2 > s1 * 0.8 ? w2.id[i] : w.id[i];
    h[i] = st * (0.35 + sid[i] * 0.2) + (wn[i] - 0.5) * 0.08 + mid[i] * 0.15;
  }
  const hb = blur(h, N, 1);
  const normal = heightToNormal(hb, N, 1.3);
  const cav = cavity(hb, N, 2, 1.4);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const st = stoneM[i];
    let v = 0.19 + (big[i] - 0.5) * 0.05 + (mid[i] - 0.5) * 0.04 + (wn[i] - 0.5) * 0.03;
    const sv = 0.25 + sid[i] * 0.16;
    let r = lerp(v, sv * 1.03, st * 0.85), g = lerp(v * 0.99, sv, st * 0.85), b = lerp(v * 0.97, sv * 0.95, st * 0.85);
    const sd = smooth(0.6, 0.88, sand[i]) * 0.35;
    r = lerp(r, 0.44, sd); g = lerp(g, 0.4, sd); b = lerp(b, 0.35, sd);
    const k = 0.8 + cav[i] * 0.2;
    c[0] = r * k; c[1] = g * k; c[2] = b * k;
    m[0] = cav[i]; m[1] = lerp(0.93, 0.86, st) + sd * 0.05; m[2] = 0;
  });
  return { albedo, normal, orm, world: 4 };
}

/**
 * Detalhe de estrada (linear, 12 m por repetição), amostrado pelo shader
 * W_ROAD: R = rachaduras abertas, G = selante de piche ("cobrinhas"),
 * B = rede fina de couro de jacaré, A = máscara de zonas de jacaré.
 */
export function genRoadDetail(N, seed = 141) {
  const open = cracks(N, seed, { cells: 3, width: 0.012, coverage: 0.5, warp: 0.08 });
  const seal = cracks(N, seed + 50, { cells: 2, width: 0.03, coverage: 0.45, warp: 0.1 });
  const gator = cracks(N, seed + 90, { cells: 16, width: 0.05, coverage: 0.95, warp: 0.05 });
  const zone = fbm(N, seed + 120, { period: 3, octaves: 4 });
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = S(open[i]);
    d[i * 4 + 1] = S(smooth(0.2, 0.6, seal[i]));
    d[i * 4 + 2] = S(gator[i]);
    d[i * 4 + 3] = S(zone[i]);
  }
  return d;
}

// ─── calçada de placas de concreto ─────────────────────────────────────
export function genPavers(N, seed = 51) {
  const tiles = 8; // 0.4 m
  const r = mulberry(seed);
  const tv = new Float32Array(tiles * tiles * 4);
  for (let i = 0; i < tiles * tiles; i++) {
    tv[i * 4] = r(); tv[i * 4 + 1] = (r() - 0.5) * 2; tv[i * 4 + 2] = (r() - 0.5) * 2; tv[i * 4 + 3] = r();
  }
  const n1 = fbm(N, seed + 1, { period: 3, octaves: 6 });
  const n2 = fbm(N, seed + 2, { period: 64, octaves: 2 });
  const cr = cracks(N, seed + 3, { cells: 8, width: 0.02, coverage: 0.5 });
  const h = new Float32Array(N * N);
  const gap = new Float32Array(N * N);
  const tid = new Int32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * tiles, fy = (y / N) * tiles;
      const cx = Math.floor(fx), cy = Math.floor(fy);
      const lx = fx - cx, ly = fy - cy;
      const e = Math.min(lx, 1 - lx, ly, 1 - ly);
      const i = y * N + x;
      const t = cy * tiles + cx;
      tid[i] = t;
      const g = 1 - smooth(0.015, 0.03, e);
      gap[i] = g;
      const tilt = tv[t * 4 + 1] * (lx - 0.5) * 0.25 + tv[t * 4 + 2] * (ly - 0.5) * 0.25;
      const broken = tv[t * 4 + 3] > 0.75 ? cr[i] : 0;
      h[i] = (1 - g) * (0.6 + tilt + n2[i] * 0.15) - broken * 0.8 + smooth(0.03, 0.06, e) * 0.08;
    }
  }
  const hb = blur(h, N, 1);
  const normal = heightToNormal(hb, N, 2.2);
  const cav = cavity(hb, N, 3, 2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const t = tid[i];
    const v = (0.56 + (tv[t * 4] - 0.5) * 0.12 + (n1[i] - 0.5) * 0.2) * (1 - gap[i] * 0.55);
    const dirt = smooth(0.55, 0.9, n1[i]) * 0.2;
    c[0] = (v - dirt * 0.1) * cav[i]; c[1] = (v * 0.97 - dirt * 0.14) * cav[i]; c[2] = (v * 0.92 - dirt * 0.2) * cav[i];
    m[0] = cav[i]; m[1] = 0.88; m[2] = 0;
  });
  return { albedo, normal, orm, world: 3.2 };
}

// ─── metal pintado com ferrugem (tingido por cor de vértice) ───────────
export function genPaintedMetal(N, seed = 61, rustT = 0.74) {
  const chipN = fbm(N, seed, { period: 6, octaves: 6, gain: 0.6 });
  const streak = fbm(N, seed + 1, { period: 16, octaves: 4, stretchY: 0.1 });
  const fine = fbm(N, seed + 2, { period: 96, octaves: 2 });
  const big = fbm(N, seed + 3, { period: 2, octaves: 4 });
  const wn = white(N, seed + 4);
  const h = new Float32Array(N * N);
  const rust = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const rr = clamp01(smooth(rustT, rustT + 0.03, chipN[i]) + smooth(rustT - 0.04, rustT + 0.16, streak[i]) * 0.45 * (rustT < 0.8 ? 1 : 0.2));
    rust[i] = rr;
    h[i] = -smooth(rustT, rustT + 0.02, chipN[i]) * 0.5 + rr * fine[i] * 0.4 + (wn[i] > 0.997 ? -0.5 : 0);
  }
  const normal = heightToNormal(blur(h, N, 1), N, 1.6);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const rr = rust[i];
    const pv = 0.78 + (big[i] - 0.5) * 0.15 - (fine[i] - 0.5) * 0.05;
    const rv = 0.6 + fine[i] * 0.5;
    // ferrugem é escrita "negativa" no canal de tinta: o shader não a tinge
    c[0] = lerp(pv, 0.42 * rv, rr); c[1] = lerp(pv, 0.2 * rv, rr); c[2] = lerp(pv, 0.1 * rv, rr);
    m[0] = 1; m[1] = lerp(0.45 + fine[i] * 0.15, 0.85, rr); m[2] = lerp(0.35, 0.05, rr);
  });
  return { albedo, normal, orm, world: 1.5, rust };
}

// ─── chapa ondulada enferrujada (portas de enrolar, telhados, cercas) ──
export function genCorrugated(N, seed = 71) {
  const waves = 24; // ondas por repetição (2.4 m → 10 cm)
  const rustN = fbm(N, seed, { period: 4, octaves: 6, gain: 0.6 });
  const streak = fbm(N, seed + 1, { period: 32, octaves: 3, stretchY: 0.06 });
  const fine = fbm(N, seed + 2, { period: 128, octaves: 2 });
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      h[i] = Math.sin((x / N) * Math.PI * 2 * waves) * 0.5 + fine[i] * 0.1;
    }
  }
  const normal = heightToNormal(h, N, 1.6 * (N / 1024) * 4);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const rr = clamp01(smooth(0.45, 0.7, rustN[i]) + smooth(0.55, 0.8, streak[i]) * 0.5);
    const groove = 0.85 + h[i] * 0.15;
    const pv = 0.7 * groove;
    const rv = (0.55 + fine[i] * 0.6) * groove;
    c[0] = lerp(pv, 0.38 * rv, rr); c[1] = lerp(pv, 0.2 * rv, rr); c[2] = lerp(pv, 0.11 * rv, rr);
    m[0] = 0.75 + groove * 0.25; m[1] = lerp(0.5, 0.88, rr); m[2] = lerp(0.4, 0.1, rr);
  });
  return { albedo, normal, orm, world: 2.4 };
}

// ─── madeira gasta (tábuas verticais) ──────────────────────────────────
export function genWood(N, seed = 81) {
  const planks = 8; // 0.15 m em 1.2 m
  const r = mulberry(seed);
  const pv = Array.from({ length: planks * 3 }, () => r());
  const grain = fbm(N, seed + 1, { period: 64, octaves: 4, stretchY: 0.06 });
  const knots = worley(N, 6, seed + 2, { cellsY: 6 });
  const big = fbm(N, seed + 3, { period: 3, octaves: 5 });
  const h = new Float32Array(N * N);
  const gap = new Float32Array(N * N);
  const pid = new Int32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const fx = (x / N) * planks;
      const p = Math.floor(fx);
      const lx = fx - p;
      // cada tábua tem emendas em alturas diferentes
      const seg = Math.floor((y / N) * 3 + pv[p * 3]) ;
      const ly = ((y / N) * 3 + pv[p * 3]) - seg;
      const e = Math.min(lx * 0.15, (1 - lx) * 0.15, ly * 0.4, (1 - ly) * 0.4);
      const g = 1 - smooth(0.003, 0.008, e);
      gap[i] = g;
      pid[i] = (p * 3 + seg) % pv.length;
      const k = Math.max(0, 0.15 - knots.f1[i]) * 6;
      h[i] = (1 - g) * (0.5 + grain[i] * 0.4 + k) - g;
    }
  }
  const normal = heightToNormal(blur(h, N, 1), N, 2);
  const cav = cavity(h, N, 2, 1.5);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const t = pv[pid[i]];
    const k = Math.max(0, 0.15 - knots.f1[i]) * 4;
    const weather = 0.4 + big[i] * 0.4; // cinza (envelhecido) ↔ marrom
    const base = 0.42 + t * 0.15 + (grain[i] - 0.5) * 0.25 - k;
    const br = base * 0.95, bgc = base * 0.72, bb = base * 0.5;
    const gr = base * 0.85;
    c[0] = lerp(br, gr, weather) * cav[i] * (1 - gap[i] * 0.7);
    c[1] = lerp(bgc, gr * 0.95, weather) * cav[i] * (1 - gap[i] * 0.7);
    c[2] = lerp(bb, gr * 0.85, weather) * cav[i] * (1 - gap[i] * 0.7);
    m[0] = cav[i]; m[1] = 0.85; m[2] = 0;
  });
  return { albedo, normal, orm, world: 1.2 };
}

// ─── piso de ladrilho hidráulico (interior) ────────────────────────────
// 0.25 m, 8 × 8 por repetição de 2 m. Quatro desenhos clássicos (rosácea,
// quadrifólio, losango, liso) em tons terrosos desbotados; o shader W_FLOOR
// varia tom/peça por ladrilho no mundo, tira ladrilhos, junta poeira nos
// rodapés e gasta o caminho de passagem.
export function genTiles(N, seed = 91) {
  const tiles = 8;
  const r = mulberry(seed);
  const tv = Array.from({ length: tiles * tiles * 3 }, () => r());
  const fine = fbm(N, seed + 2, { period: 128, octaves: 2 });
  const mott = fbm(N, seed + 1, { period: 16, octaves: 4 });
  const cr = cracks(N, seed + 3, { cells: 9, width: 0.012, coverage: 0.35 });
  const h = new Float32Array(N * N);
  const gap = new Float32Array(N * N);
  const pat = new Float32Array(N * N);
  const tid = new Int32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const fx = (x / N) * tiles, fy = (y / N) * tiles;
      const cx = Math.floor(fx), cy = Math.floor(fy);
      const lx = fx - cx, ly = fy - cy;
      const e = Math.min(lx, 1 - lx, ly, 1 - ly);
      const g = 1 - smooth(0.012, 0.026, e);
      gap[i] = g;
      const t = cy * tiles + cx;
      tid[i] = t;
      // desenho em coordenadas do "módulo" de 2×2 ladrilhos (simetria de quadrante)
      const qx = (cx % 2 ? 1 - lx : lx), qy = (cy % 2 ? 1 - ly : ly); // 0 = centro do módulo
      const dc = Math.hypot(qx, qy);
      const dd = Math.abs(lx - 0.5) + Math.abs(ly - 0.5);
      const kind = Math.floor(tv[Math.floor(cy / 2) * tiles + Math.floor(cx / 2)] * 3); // módulos de 2×2
      let p = 0;
      if (kind === 0) p = dc < 0.42 ? (dc < 0.3 ? 2 : 1) : (dd > 0.82 ? 3 : 0); // rosácea
      else if (kind === 1) p = Math.abs(dc - 0.55) < 0.08 ? 1 : dd < 0.22 ? 2 : 0; // quadrifólio (arcos)
      else p = dd < 0.36 ? (dd < 0.18 ? 3 : 2) : e < 0.07 ? 1 : 0; // losango com filete
      pat[i] = p;
      const broken = tv[t * 3 + 1] > 0.86 ? cr[i] : 0;
      h[i] = (1 - g) * (0.6 + (tv[t * 3 + 2] - 0.5) * 0.04) - broken * 0.5 + fine[i] * 0.03;
    }
  }
  const normal = heightToNormal(blur(h, N, 1), N, 2.4);
  const cols = [
    [0.66, 0.62, 0.54], // creme
    [0.52, 0.3, 0.22], // terracota
    [0.3, 0.34, 0.36], // grafite
    [0.46, 0.42, 0.3], // ocre
  ];
  const { albedo, orm } = pack(N, (i, c, m) => {
    const col = cols[pat[i]];
    const t = tv[tid[i] * 3];
    const v = 0.9 + t * 0.12 + (fine[i] - 0.5) * 0.06 + (mott[i] - 0.5) * 0.1;
    const gp = gap[i];
    c[0] = lerp(col[0] * v, 0.3, gp);
    c[1] = lerp(col[1] * v, 0.28, gp);
    c[2] = lerp(col[2] * v, 0.25, gp);
    m[0] = 1 - gp * 0.45; m[1] = lerp(0.62 + mott[i] * 0.2, 0.95, gp); m[2] = 0;
  });
  return { albedo, normal, orm, world: 2 };
}

// ─── terra / pó de entulho ─────────────────────────────────────────────
// Grãos finos e pó de reboco/cimento — sem "bolinhas" grandes repetidas.
export function genDirt(N, seed = 101) {
  const big = fbm(N, seed, { period: 3, octaves: 6, gain: 0.55 });
  const w = worley(N, 70, seed + 1, { jitter: 0.95 });
  const w2 = worley(N, 180, seed + 2, { jitter: 0.95 });
  const fine = fbm(N, seed + 3, { period: 128, octaves: 2 });
  const wn = white(N, seed + 4);
  const h = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const g1 = (1 - smooth(0.15, 0.45, w.f1[i])) * (w.id[i] > 0.55 ? 1 : 0) * (0.5 + w.id[i] * 0.5);
    const g2 = (1 - smooth(0.2, 0.5, w2.f1[i])) * (w2.id[i] > 0.4 ? 0.6 : 0);
    h[i] = big[i] * 0.4 + g1 * 0.5 + g2 * 0.35 + fine[i] * 0.15 + wn[i] * 0.06;
  }
  const hb = blur(h, N, 1);
  const normal = heightToNormal(hb, N, 2.2);
  const cav = cavity(hb, N, 2, 2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const t = w.id[i], t2 = w2.id[i];
    const b = big[i] - 0.5;
    let r = 0.5 + b * 0.16, g = 0.45 + b * 0.14, bl = 0.38 + b * 0.1;
    // grãos: cinza de concreto, bege de reboco, alguns avermelhados (tijolo moído)
    const g1 = (1 - smooth(0.15, 0.4, w.f1[i])) * (t > 0.55 ? 1 : 0);
    const gc = t > 0.9 ? [0.5, 0.33, 0.26] : t > 0.75 ? [0.62, 0.6, 0.55] : [0.56, 0.52, 0.45];
    r = lerp(r, gc[0], g1 * 0.7); g = lerp(g, gc[1], g1 * 0.7); bl = lerp(bl, gc[2], g1 * 0.7);
    const g2 = (1 - smooth(0.2, 0.45, w2.f1[i])) * (t2 > 0.4 ? 1 : 0) * 0.3;
    r += g2 * (t2 - 0.6) * 0.3; g += g2 * (t2 - 0.6) * 0.3; bl += g2 * (t2 - 0.6) * 0.28;
    const k = 0.65 + cav[i] * 0.35;
    c[0] = r * k; c[1] = g * k; c[2] = bl * k;
    m[0] = cav[i]; m[1] = 0.96; m[2] = 0;
  });
  return { albedo, normal, orm, world: 2.2 };
}

// ─── tecido de saco de areia (juta/polipropileno) ──────────────────────
export function genFabric(N, seed = 111) {
  const big = fbm(N, seed, { period: 3, octaves: 5 });
  const fine = fbm(N, seed + 1, { period: 64, octaves: 2 });
  const threads = 96;
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const u = (x / N) * threads * Math.PI * 2, v = (y / N) * threads * Math.PI * 2;
      const wx = Math.sin(u) * (Math.sin(v * 0.5) > 0 ? 1 : -1);
      h[i] = Math.abs(Math.sin(u)) * 0.5 + Math.abs(Math.sin(v)) * 0.5 + wx * 0.1 + fine[i] * 0.3;
    }
  }
  const normal = heightToNormal(h, N, 1.2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const v = 0.55 + (big[i] - 0.5) * 0.25 + h[i] * 0.08;
    const dirt = smooth(0.5, 0.9, big[i]) * 0.2;
    c[0] = v * 0.86 - dirt * 0.1; c[1] = v * 0.78 - dirt * 0.12; c[2] = v * 0.58 - dirt * 0.12;
    m[0] = 0.8 + h[i] * 0.2; m[1] = 0.95; m[2] = 0;
  });
  return { albedo, normal, orm, world: 0.6 };
}

// ─── vidro sujo (só rugosidade/albedo de poeira) ───────────────────────
export function genGrime(N, seed = 121) {
  const big = fbm(N, seed, { period: 3, octaves: 6 });
  const streak = fbm(N, seed + 1, { period: 24, octaves: 3, stretchY: 0.1 });
  const h = new Float32Array(N * N);
  const normal = heightToNormal(h, N, 1);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const d = clamp01(smooth(0.35, 0.9, big[i]) * 0.7 + smooth(0.6, 0.9, streak[i]) * 0.4);
    c[0] = 0.04 + d * 0.25; c[1] = 0.045 + d * 0.23; c[2] = 0.05 + d * 0.2;
    m[0] = 1; m[1] = 0.04 + d * 0.5; m[2] = 0;
  });
  return { albedo, normal, orm, world: 1.6 };
}

// ─── fachada distante (janelas em grade, para o horizonte) ─────────────
export function genFarFacade(N, seed = 131) {
  const r = mulberry(seed);
  const cols = 6, rows = 8; // 3.2 m × 3.2 m por célula… cobre 19.2 m
  const lit = Array.from({ length: cols * rows }, () => r());
  const big = fbm(N, seed + 1, { period: 3, octaves: 5 });
  const h = new Float32Array(N * N);
  const win = new Float32Array(N * N);
  const cid = new Int32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const fx = (x / N) * cols, fy = (y / N) * rows;
      const cx = Math.floor(fx), cy = Math.floor(fy);
      const lx = fx - cx, ly = fy - cy;
      const w = lx > 0.28 && lx < 0.72 && ly > 0.25 && ly < 0.75 ? 1 : 0;
      win[i] = w;
      cid[i] = cy * cols + cx;
      const ledge = ly < 0.05 ? 0.4 : 0;
      h[i] = 1 - w * 0.8 + ledge;
    }
  }
  const normal = heightToNormal(blur(h, N, 1), N, 3);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const w = win[i];
    const t = lit[cid[i]];
    const v = 0.75 + (big[i] - 0.5) * 0.2;
    const wv = t > 0.85 ? 0.02 : 0.05 + t * 0.06; // janelas escuras / quebradas
    c[0] = lerp(v, wv, w); c[1] = lerp(v * 0.97, wv, w); c[2] = lerp(v * 0.92, wv * 1.1, w);
    m[0] = 1 - w * 0.5; m[1] = lerp(0.9, 0.3, w); m[2] = 0;
  });
  return { albedo, normal, orm, world: 19.2 };
}

// ─── chapa queimada (carcaças): carvão, cinza branca, ferrugem florescendo ─
export function genBurnt(N, seed = 161) {
  const a = fbm(N, seed, { period: 4, octaves: 6, gain: 0.6 });
  const b = fbm(N, seed + 1, { period: 12, octaves: 4 });
  const st = fbm(N, seed + 2, { period: 16, octaves: 3, stretchY: 0.12 });
  const wn = white(N, seed + 3);
  const h = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) h[i] = a[i] * 0.4 + b[i] * 0.3 + (wn[i] - 0.5) * 0.1 - smooth(0.6, 0.8, a[i]) * 0.2;
  const normal = heightToNormal(blur(h, N, 1), N, 2.2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const rust = clamp01(smooth(0.66, 0.82, a[i]) * 0.9 + smooth(0.7, 0.9, st[i]) * 0.4);
    const ash = smooth(0.62, 0.8, b[i]) * (1 - rust) * 0.7;
    const char = 0.05 + b[i] * 0.05;
    let r = lerp(char, 0.32 + wn[i] * 0.08, rust), g = lerp(char * 0.95, 0.15 + wn[i] * 0.04, rust), bb = lerp(char * 0.9, 0.07, rust);
    r = lerp(r, 0.36, ash); g = lerp(g, 0.35, ash); bb = lerp(bb, 0.33, ash);
    c[0] = r; c[1] = g; c[2] = bb;
    m[0] = 1; m[1] = lerp(0.82, 0.96, Math.max(rust, ash)); m[2] = lerp(0.15, 0.0, Math.max(rust, ash));
  });
  return { albedo, normal, orm, world: 1.8 };
}

// ─── casca de árvore (sulcos verticais + líquen) ────────────────────────
export function genBark(N, seed = 151) {
  const a = fbm(N, seed, { period: 12, octaves: 5, stretchY: 0.15 });
  const b = fbm(N, seed + 1, { period: 32, octaves: 3, stretchY: 0.3 });
  const lich = fbm(N, seed + 2, { period: 6, octaves: 5 });
  const h = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const ridge = 1 - Math.abs(a[i] * 2 - 1);
    h[i] = Math.pow(ridge, 1.6) * 0.8 + b[i] * 0.25;
  }
  const normal = heightToNormal(blur(h, N, 1), N, 4);
  const cav = cavity(h, N, 3, 2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const v = 0.3 + h[i] * 0.22;
    const l = smooth(0.68, 0.8, lich[i]) * 0.6;
    c[0] = lerp(v * 1.0, 0.5, l * 0.6) * cav[i];
    c[1] = lerp(v * 0.9, 0.55, l * 0.6) * cav[i];
    c[2] = lerp(v * 0.78, 0.38, l * 0.6) * cav[i];
    m[0] = cav[i]; m[1] = 0.92; m[2] = 0;
  });
  return { albedo, normal, orm, world: 1.2 };
}

// ─── DataTextures ──────────────────────────────────────────────────────
export function toTexture(data, N, { srgb = false, anisotropy = 8, repeat = 1 } = {}) {
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

/** Converte a saída de um gerador em { map, normalMap, orm, world }. */
export function makeSet(gen, N, anisotropy) {
  const g = gen(N);
  const rep = 1 / g.world; // UV em metros → uma repetição por `world` metros
  return {
    map: toTexture(g.albedo, N, { srgb: true, anisotropy, repeat: rep }),
    normalMap: toTexture(g.normal, N, { anisotropy, repeat: rep }),
    orm: toTexture(g.orm, N, { anisotropy, repeat: rep }),
    world: g.world,
  };
}
