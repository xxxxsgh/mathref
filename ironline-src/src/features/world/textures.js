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
  return { albedo, normal, orm, world: 2.4 };
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
export function genBrick(N, seed = 31) {
  const cols = 8, rows = 24; // 1.92 m → tijolo 0.24 × 0.08
  const r = mulberry(seed);
  const tint = new Float32Array(cols * 2 * rows * 3);
  for (let i = 0; i < tint.length / 3; i++) {
    const t = r();
    const dark = r() < 0.12 ? 0.7 : 1;
    tint[i * 3] = lerp(0.52, 0.68, t) * dark;
    tint[i * 3 + 1] = lerp(0.26, 0.4, t * t) * dark;
    tint[i * 3 + 2] = lerp(0.18, 0.28, t) * dark;
  }
  const n1 = fbm(N, seed + 1, { period: 48, octaves: 3 });
  const n2 = fbm(N, seed + 2, { period: 4, octaves: 5 });
  const chip = fbm(N, seed + 3, { period: 32, octaves: 3 });
  const soot = fbm(N, seed + 4, { period: 3, octaves: 5 });
  const h = new Float32Array(N * N);
  const isB = new Float32Array(N * N);
  const bid = new Int32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * rows;
    const row = Math.floor(fy);
    const off = row % 2 ? 0.5 : 0;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cols + off;
      const col = Math.floor(fx);
      const lx = fx - col, ly = fy - row;
      const ex = Math.min(lx, 1 - lx) * (0.24 / 1), ey = Math.min(ly, 1 - ly) * 0.08;
      const e = Math.min(ex, ey); // metros até a junta
      const i = y * N + x;
      const mortar = 0.006 + (chip[i] - 0.5) * 0.006;
      const b = smooth(mortar, mortar + 0.004, e);
      isB[i] = b;
      bid[i] = (row * cols * 2 + (col % (cols * 2))) % (cols * 2 * rows);
      h[i] = b * (0.7 + n1[i] * 0.25) + (1 - b) * n1[i] * 0.2;
    }
  }
  const hb = blur(h, N, 1);
  const normal = heightToNormal(hb, N, 3);
  const cav = cavity(hb, N, 3, 2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const b = isB[i];
    const t = bid[i] * 3;
    const v = 0.85 + n1[i] * 0.3;
    const sd = 1 - smooth(0.55, 0.9, soot[i]) * 0.35;
    const br = tint[t] * v, bg = tint[t + 1] * v, bb = tint[t + 2] * v;
    const mo = 0.55 + n2[i] * 0.12;
    c[0] = lerp(mo, br, b) * cav[i] * sd;
    c[1] = lerp(mo * 0.96, bg, b) * cav[i] * sd;
    c[2] = lerp(mo * 0.9, bb, b) * cav[i] * sd;
    m[0] = cav[i]; m[1] = lerp(0.95, 0.82, b); m[2] = 0;
  });
  return { albedo, normal, orm, world: 1.92 };
}

// ─── asfalto com agregado, remendos e rachaduras ───────────────────────
export function genAsphalt(N, seed = 41) {
  const big = fbm(N, seed, { period: 2, octaves: 6, gain: 0.55 });
  const mid = fbm(N, seed + 1, { period: 8, octaves: 4 });
  const wn = white(N, seed + 2);
  const wn2 = white(N, seed + 3);
  const cr = cracks(N, seed + 4, { cells: 3, width: 0.012, coverage: 0.4, warp: 0.1 });
  const sand = fbm(N, seed + 7, { period: 3, octaves: 5 });
  const patchN = fbm(N, seed + 5, { period: 2, octaves: 2 });
  const oil = fbm(N, seed + 6, { period: 5, octaves: 4 });
  const agg = blur(wn, N, 1);
  const h = new Float32Array(N * N);
  const patch = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      // remendo retangular: quadrado de borda reta (asfalto mais novo/escuro)
      const px = x / N, py = y / N;
      const inP = px > 0.12 && px < 0.42 && py > 0.55 && py < 0.8 ? 1 : 0;
      const inP2 = px > 0.62 && px < 0.9 && py > 0.1 && py < 0.28 ? 1 : 0;
      patch[i] = Math.max(inP * (patchN[i] > 0.3 ? 1 : 0), inP2);
      h[i] = (agg[i] - 0.5) * 1.2 + (wn2[i] > 0.93 ? 0.4 : 0) + mid[i] * 0.2 + cr[i] * (1 - patch[i]) * 0.5 + patch[i] * 0.1;
    }
  }
  const normal = heightToNormal(h, N, 1.6);
  const cav = cavity(h, N, 2, 2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const p = patch[i];
    const stone = wn2[i] > 0.93 ? 0.12 * (wn2[i] - 0.93) * 14 : 0;
    let v = 0.3 + (big[i] - 0.5) * 0.12 + (mid[i] - 0.5) * 0.06 + stone * 0.5;
    v = lerp(v, 0.19 + mid[i] * 0.04, p);
    const o = smooth(0.74, 0.88, oil[i]) * 0.35 * (1 - p);
    v *= 1 - o;
    v *= 1 - cr[i] * 0.45;
    // areia/poeira assentada (tom quente)
    const sd = smooth(0.55, 0.85, sand[i]) * 0.5;
    c[0] = lerp(v, 0.5, sd * 0.5) * cav[i]; c[1] = lerp(v * 0.985, 0.45, sd * 0.5) * cav[i]; c[2] = lerp(v * 0.955, 0.38, sd * 0.5) * cav[i];
    m[0] = cav[i]; m[1] = lerp(0.88, 0.62, Math.max(o, cr[i] * 0.6)) - stone * 0.25; m[2] = 0;
  });
  return { albedo, normal, orm, world: 7 };
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

// ─── piso cerâmico (interior) ──────────────────────────────────────────
export function genTiles(N, seed = 91) {
  const tiles = 8; // 0.3 m em 2.4 m
  const r = mulberry(seed);
  const tv = Array.from({ length: tiles * tiles * 2 }, () => r());
  const dust = fbm(N, seed + 1, { period: 3, octaves: 6 });
  const fine = fbm(N, seed + 2, { period: 128, octaves: 2 });
  const cr = cracks(N, seed + 3, { cells: 7, width: 0.015, coverage: 0.4 });
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
      const g = 1 - smooth(0.012, 0.025, e);
      gap[i] = g;
      tid[i] = cy * tiles + cx;
      // padrão geométrico (losango em cada ladrilho, alternando)
      const d = Math.abs(lx - 0.5) + Math.abs(ly - 0.5);
      pat[i] = ((cx + cy) % 2 ? 1 : 0) * 0.5 + (d < 0.32 ? 0.5 : 0);
      const broken = tv[tid[i] * 2 + 1] > 0.8 ? cr[i] : 0;
      h[i] = (1 - g) * 0.6 - broken * 0.6;
    }
  }
  const normal = heightToNormal(blur(h, N, 1), N, 2);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const p = pat[i];
    const t = tv[tid[i] * 2];
    let rr = 0.66, gg = 0.62, bb = 0.55;
    if (p >= 0.5 && p < 1) { rr = 0.5; gg = 0.45; bb = 0.38; }
    if (p >= 1) { rr = 0.42; gg = 0.44; bb = 0.42; }
    if (p === 0.5) { rr = 0.56; gg = 0.4; bb = 0.33; }
    const v = 0.9 + t * 0.15 + (fine[i] - 0.5) * 0.05;
    const dd = smooth(0.2, 0.75, dust[i]);
    const dc = [0.55, 0.5, 0.44];
    const gp = gap[i];
    c[0] = lerp(lerp(rr * v, dc[0], dd * 0.6), 0.32, gp);
    c[1] = lerp(lerp(gg * v, dc[1], dd * 0.6), 0.3, gp);
    c[2] = lerp(lerp(bb * v, dc[2], dd * 0.6), 0.27, gp);
    m[0] = 1 - gp * 0.4; m[1] = lerp(0.25, 0.85, Math.max(dd, gp)); m[2] = 0;
  });
  return { albedo, normal, orm, world: 2.4 };
}

// ─── terra/entulho miúdo ───────────────────────────────────────────────
export function genDirt(N, seed = 101) {
  const big = fbm(N, seed, { period: 3, octaves: 6, gain: 0.55 });
  const w = worley(N, 22, seed + 1);
  const w2 = worley(N, 60, seed + 2);
  const fine = fbm(N, seed + 3, { period: 128, octaves: 2 });
  const h = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const peb = Math.max(0, 0.34 - w.f1[i]) * 2 * (w.id[i] > 0.4 ? 1 : 0);
    const peb2 = Math.max(0, 0.4 - w2.f1[i]) * (w2.id[i] > 0.5 ? 1 : 0);
    h[i] = big[i] * 0.3 + peb + peb2 * 0.6 + fine[i] * 0.2;
  }
  const normal = heightToNormal(h, N, 2.5);
  const cav = cavity(h, N, 2, 2.5);
  const { albedo, orm } = pack(N, (i, c, m) => {
    const t = w.id[i];
    let r = 0.5 + (big[i] - 0.5) * 0.2, g = 0.44 + (big[i] - 0.5) * 0.18, b = 0.36 + (big[i] - 0.5) * 0.12;
    // pedrinhas: só um pouco mais claras/cinzentas que a terra, borda suave
    const pk = (1 - smooth(0.22, 0.34, w.f1[i])) * (t > 0.4 ? 1 : 0) * 0.6;
    const v = 0.42 + t * 0.18;
    r = lerp(r, v, pk); g = lerp(g, v * 0.97, pk); b = lerp(b, v * 0.92, pk);
    c[0] = r * cav[i]; c[1] = g * cav[i]; c[2] = b * cav[i];
    m[0] = cav[i]; m[1] = 0.95; m[2] = 0;
  });
  return { albedo, normal, orm, world: 2.5 };
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
