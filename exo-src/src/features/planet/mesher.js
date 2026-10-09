/**
 * MALHAS DE TERRENO (puro — roda no worker e, sem Worker, no thread principal).
 *
 * buildChunk: um nó da quadtree → grade (N+1)² + saias, com
 *   pos    Float32 ×3  relativo à ÂNCORA do chunk (dir_centro·R, em double)
 *   nor    Int8 ×4     normal (xyz) + oclusão/cavidade (w)
 *   morph  Float32 ×3  delta até a posição que o vértice tem na malha do PAI
 *                      (geomorphing: o shader interpola pela distância)
 *   data   Uint8 ×4    umidade, erosão, variação regional, estratos
 * As saias (paredes nas 4 bordas, para dentro do planeta) escondem as
 * frestas entre vizinhos de LOD diferente sem stitching.
 *
 * buildWaterDepth: profundidade sob a calota do oceano (espuma / cor rasa).
 */
import { createTerrain, applyEdits, DATA } from './terrain.js';
import { faceDir } from './cube.js';

const terrains = new Map();
/** Terreno cacheado por configuração (o worker recebe a cfg a cada job — é pequena). */
export function terrainFor(cfg) {
  const key = `${cfg.seed}|${cfg.radius}|${cfg.biome}|${cfg.seaLevel}`;
  let t = terrains.get(key);
  if (!t) {
    t = createTerrain(cfg);
    terrains.set(key, t);
  }
  return t;
}

/** Índices compartilhados por todos os chunks (mesma topologia). */
export function buildIndex(N) {
  const V = N + 1;
  const quads = N * N + 8 * N; // grade + saias dos dois lados
  const idx = new Uint16Array(quads * 6);
  let o = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      idx[o++] = a; idx[o++] = b; idx[o++] = c;
      idx[o++] = b; idx[o++] = d; idx[o++] = c;
    }
  }
  const base = V * V;
  // saias: 4 bordas × V vértices (ordem: j=0, j=N, i=0, i=N)
  const S = (e, k) => base + e * V + k;
  const G = (i, j) => j * V + i;
  for (let k = 0; k < N; k++) {
    // borda inferior (j=0), normal −V
    let a = G(k, 0), b = G(k + 1, 0), a2 = S(0, k), b2 = S(0, k + 1);
    idx[o++] = a; idx[o++] = a2; idx[o++] = b;
    idx[o++] = b; idx[o++] = a2; idx[o++] = b2;
    // borda superior (j=N), normal +V
    a = G(k, N); b = G(k + 1, N); a2 = S(1, k); b2 = S(1, k + 1);
    idx[o++] = a; idx[o++] = b; idx[o++] = a2;
    idx[o++] = b; idx[o++] = b2; idx[o++] = a2;
    // borda esquerda (i=0), normal −U
    a = G(0, k); b = G(0, k + 1); a2 = S(2, k); b2 = S(2, k + 1);
    idx[o++] = a; idx[o++] = b; idx[o++] = a2;
    idx[o++] = b; idx[o++] = b2; idx[o++] = a2;
    // borda direita (i=N), normal +U
    a = G(N, k); b = G(N, k + 1); a2 = S(3, k); b2 = S(3, k + 1);
    idx[o++] = a; idx[o++] = a2; idx[o++] = b;
    idx[o++] = b; idx[o++] = a2; idx[o++] = b2;
  }
  // saias com a face oposta também (frestas vistas pelos dois lados)
  const end = o;
  for (let t = N * N * 6; t < end; t += 3) {
    idx[o++] = idx[t]; idx[o++] = idx[t + 2]; idx[o++] = idx[t + 1];
  }
  return idx;
}

/**
 * payload: { cfg, face, L, x, y, N, edits: [{x,y,z,r,s}] }
 * → { pos, nor, morph, data, anchor:[x,y,z], bounds:{cx,cy,cz,r,hmin,hmax}, ms }
 */
export function buildChunk(p) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const T = terrainFor(p.cfg);
  const R = p.cfg.radius;
  const { face, L, x, y, N } = p;
  const edits = p.edits || [];
  const V = N + 1;
  const W = N + 3; // com borda de 1 amostra
  const n = 1 << L;
  const du = 2 / n;
  const u0 = -1 + x * du, v0 = -1 + y * du;
  const arc = (R * Math.PI * 0.5) / n;
  const sp = arc / N; // espaçamento aproximado (m)
  const d = [0, 0, 0];
  faceDir(face, u0 + du / 2, v0 + du / 2, d);
  const ax = d[0] * R, ay = d[1] * R, az = d[2] * R;

  // amostras em double (com borda)
  const PX = new Float64Array(W * W), PY = new Float64Array(W * W), PZ = new Float64Array(W * W);
  const H = new Float64Array(W * W);
  const DX = new Float64Array(W * W), DY = new Float64Array(W * W), DZ = new Float64Array(W * W);
  const data = new Uint8Array(V * V * 4 + 4 * V * 4);
  let caveAO = null;
  for (let j = -1; j <= N + 1; j++) {
    for (let i = -1; i <= N + 1; i++) {
      faceDir(face, u0 + (i / N) * du, v0 + (j / N) * du, d);
      const inner = i >= 0 && j >= 0 && i <= N && j <= N;
      let h = inner ? T.sample(d[0], d[1], d[2], sp) : T.height(d[0], d[1], d[2], sp);
      if (edits.length) h = applyEdits(d[0], d[1], d[2], R, h, edits);
      const k = (j + 1) * W + (i + 1);
      const r = R + h;
      H[k] = h;
      DX[k] = d[0];
      DY[k] = d[1];
      DZ[k] = d[2];
      PX[k] = d[0] * r - ax;
      PY[k] = d[1] * r - ay;
      PZ[k] = d[2] * r - az;
      if (inner) {
        const o = (j * V + i) * 4;
        data[o] = DATA[0] * 255;
        data[o + 1] = DATA[1] * 255;
        data[o + 2] = DATA[2] * 255;
        data[o + 3] = DATA[3] * 255;
        if (DATA[4] < 1) {
          if (!caveAO) caveAO = new Float32Array(V * V).fill(1);
          caveAO[j * V + i] = DATA[4];
        }
      }
    }
  }

  const NV = V * V + 4 * V;
  const pos = new Float32Array(NV * 3);
  const nor = new Int8Array(NV * 4);
  const morph = new Float32Array(NV * 4); // xyz = delta do geomorph, w = profundidade da saia (0 na grade)
  let hmin = Infinity, hmax = -Infinity;
  let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = (j + 1) * W + (i + 1);
      const v = j * V + i;
      const px = PX[k], py = PY[k], pz = PZ[k];
      pos[v * 3] = px;
      pos[v * 3 + 1] = py;
      pos[v * 3 + 2] = pz;
      if (px < bx0) bx0 = px;
      if (py < by0) by0 = py;
      if (pz < bz0) bz0 = pz;
      if (px > bx1) bx1 = px;
      if (py > by1) by1 = py;
      if (pz > bz1) bz1 = pz;
      if (H[k] < hmin) hmin = H[k];
      if (H[k] > hmax) hmax = H[k];
      // normal por diferenças centrais (U × V = para fora)
      const kl = k - 1, kr = k + 1, kd = k - W, ku = k + W;
      const tx = PX[kr] - PX[kl], ty = PY[kr] - PY[kl], tz = PZ[kr] - PZ[kl];
      const bx = PX[ku] - PX[kd], by = PY[ku] - PY[kd], bz = PZ[ku] - PZ[kd];
      let nx = ty * bz - tz * by, ny = tz * bx - tx * bz, nz = tx * by - ty * bx;
      const nl = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      nx *= nl;
      ny *= nl;
      nz *= nl;
      // cavidade: altura relativa à média dos vizinhos (m), normalizada pelo espaçamento
      const cav = (H[k] - 0.25 * (H[kl] + H[kr] + H[kd] + H[ku])) / Math.max(sp, 0.5);
      let ao = Math.min(1, Math.max(0.3, 0.92 + cav * 0.9));
      if (caveAO) ao *= caveAO[v];
      nor[v * 4] = nx * 127;
      nor[v * 4 + 1] = ny * 127;
      nor[v * 4 + 2] = nz * 127;
      nor[v * 4 + 3] = ao * 127;
    }
  }

  // geomorphing: posições que o vértice teria na malha do pai
  if (L > 0) {
    // alturas grosseiras (espaçamento do pai) nos vértices pares
    const CX = new Float64Array(V * V), CY = new Float64Array(V * V), CZ = new Float64Array(V * V);
    for (let j = 0; j <= N; j += 2) {
      for (let i = 0; i <= N; i += 2) {
        const k = (j + 1) * W + (i + 1);
        const dx = DX[k], dy = DY[k], dz = DZ[k];
        let h = T.height(dx, dy, dz, sp * 2);
        if (edits.length) h = applyEdits(dx, dy, dz, R, h, edits);
        const r = R + h;
        const v = j * V + i;
        CX[v] = dx * r - ax;
        CY[v] = dy * r - ay;
        CZ[v] = dz * r - az;
      }
    }
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const v = j * V + i;
        let cx, cy, cz;
        const oi = i & 1, oj = j & 1;
        if (!oi && !oj) {
          cx = CX[v]; cy = CY[v]; cz = CZ[v];
        } else if (oi && !oj) {
          const a = v - 1, b = v + 1;
          cx = (CX[a] + CX[b]) * 0.5; cy = (CY[a] + CY[b]) * 0.5; cz = (CZ[a] + CZ[b]) * 0.5;
        } else if (!oi && oj) {
          const a = v - V, b = v + V;
          cx = (CX[a] + CX[b]) * 0.5; cy = (CY[a] + CY[b]) * 0.5; cz = (CZ[a] + CZ[b]) * 0.5;
        } else {
          // diagonal do quad do pai: (i+1, j−1) — (i−1, j+1)
          const a = v - V + 1, b = v + V - 1;
          cx = (CX[a] + CX[b]) * 0.5; cy = (CY[a] + CY[b]) * 0.5; cz = (CZ[a] + CZ[b]) * 0.5;
        }
        morph[v * 4] = cx - pos[v * 3];
        morph[v * 4 + 1] = cy - pos[v * 3 + 1];
        morph[v * 4 + 2] = cz - pos[v * 3 + 2];
      }
    }
  }

  // saias: cópia das bordas empurrada para o centro do planeta
  const skirt = Math.max(sp * 3, 1.5) + (hmax - hmin) * 0.05;
  const base = V * V;
  const edge = [(k) => k, (k) => N * V + k, (k) => k * V, (k) => k * V + N];
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k <= N; k++) {
      const src = edge[e](k);
      const dst = base + e * V + k;
      const sk = (Math.floor(src / V) + 1) * W + (src % V) + 1;
      pos[dst * 3] = pos[src * 3] - DX[sk] * skirt;
      pos[dst * 3 + 1] = pos[src * 3 + 1] - DY[sk] * skirt;
      pos[dst * 3 + 2] = pos[src * 3 + 2] - DZ[sk] * skirt;
      morph[dst * 4] = morph[src * 4];
      morph[dst * 4 + 1] = morph[src * 4 + 1];
      morph[dst * 4 + 2] = morph[src * 4 + 2];
      morph[dst * 4 + 3] = skirt;
      for (let c = 0; c < 4; c++) {
        nor[dst * 4 + c] = nor[src * 4 + c];
        data[dst * 4 + c] = data[src * 4 + c];
      }
    }
  }
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, cz = (bz0 + bz1) / 2;
  const r = Math.hypot(bx1 - bx0, by1 - by0, bz1 - bz0) / 2 + skirt;
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    pos, nor, morph, data,
    anchor: [ax, ay, az],
    bounds: { cx, cy, cz, r, hmin, hmax },
    ms: t1 - t0,
  };
}

/** Profundidade do terreno sob vértices de água (dirs Float32 ×3) → Float32 (m abaixo do nível do mar). */
export function buildWaterDepth(p) {
  const T = terrainFor(p.cfg);
  const dirs = p.dirs;
  const n = dirs.length / 3;
  const out = new Float32Array(n);
  const sea = p.cfg.seaLevel ?? 0;
  for (let i = 0; i < n; i++) {
    const x = dirs[i * 3], y = dirs[i * 3 + 1], z = dirs[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    out[i] = sea - T.height(x / l, y / l, z / l, p.sp ? p.sp[i] : 0);
  }
  return out;
}
