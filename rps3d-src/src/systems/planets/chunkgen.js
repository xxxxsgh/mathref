// Geração de um chunk do quadtree da cube-sphere (puro, sem three: roda no
// worker e no laço principal). Cada chunk é uma grade (N+1)² sobre um
// pedaço de face do cubo, projetada na esfera com mapeamento equiangular
// (tan) para densidade uniforme, deslocada pela função de altura, com saias
// nas bordas (escondem fendas entre níveis de LOD) e normais calculadas pelos
// vizinhos (inclui uma borda extra para não haver costura).
//
// Atributos (float32):
//   position  relativo ao centro do chunk (precisão de float perto da câmera)
//   normal    normal geométrica, referencial local do planeta
//   aUp       direção radial unitária (coordenada macro de texturas)
//   aDet      posição local menos deslocamento múltiplo de DET_PERIOD
//             (coordenada de detalhe precisa, periódica e sem emenda)
//   aDat      (h metros, m, s, q) — ver terrain.js
// Água (se o chunk tem fundo abaixo do mar): mesma grade no raio do mar com
// aUp, aDet e aDepth (profundidade em m; negativa = terra acima do mar).
import { getTerrain } from './terrain.js';

export const DET_PERIOD = 2048;

/** Faces do cubo: normal, eixo u, eixo v (u × v = normal → enrolamento externo). */
export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const QP = Math.PI / 4;
/** Ponto da face (a,b ∈ [-1,1]) → direção unitária (equiangular). */
export function faceDir(face, a, b, out) {
  const F = FACES[face];
  const ta = Math.tan(a * QP), tb = Math.tan(b * QP);
  const x = F.n[0] + F.u[0] * ta + F.v[0] * tb;
  const y = F.n[1] + F.u[1] * ta + F.v[1] * tb;
  const z = F.n[2] + F.u[2] * ta + F.v[2] * tb;
  const l = Math.hypot(x, y, z);
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

/** Limites (a0,b0,size) de um nó: nível L, índices ix,iy. */
export function nodeRect(level, ix, iy) {
  const size = 2 / (1 << level);
  return { a0: -1 + ix * size, b0: -1 + iy * size, size };
}

/**
 * Constrói o chunk. job = {desc, face, level, ix, iy, N, skirt}
 * Retorna objeto com typed arrays (transferíveis).
 */
export function buildChunk(job) {
  const T = getTerrain(job.desc);
  const R = job.desc.radius;
  const N = job.N;
  const { a0, b0, size } = nodeRect(job.level, job.ix, job.iy);
  const S = N + 3; // grade com borda de 1 de cada lado
  const P = new Float64Array(S * S * 3);
  const D = new Float32Array(S * S * 4);
  const U = new Float64Array(S * S * 3);
  const dir = [0, 0, 0];
  let minH = Infinity, maxH = -Infinity;
  const o = { h: 0, m: 0, s: 0, q: 0 };
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const a = a0 + ((i - 1) / N) * size, b = b0 + ((j - 1) / N) * size;
      faceDir(job.face, a, b, dir);
      T.sample(dir[0], dir[1], dir[2], o);
      const k = j * S + i, r = R + o.h;
      P[k * 3] = dir[0] * r; P[k * 3 + 1] = dir[1] * r; P[k * 3 + 2] = dir[2] * r;
      U[k * 3] = dir[0]; U[k * 3 + 1] = dir[1]; U[k * 3 + 2] = dir[2];
      D[k * 4] = o.h; D[k * 4 + 1] = o.m; D[k * 4 + 2] = o.s; D[k * 4 + 3] = o.q;
      if (i >= 1 && i <= N + 1 && j >= 1 && j <= N + 1) { if (o.h < minH) minH = o.h; if (o.h > maxH) maxH = o.h; }
    }
  }
  // centro do chunk (direção do meio, no raio médio)
  const cdir = faceDir(job.face, a0 + size / 2, b0 + size / 2, [0, 0, 0]);
  const midH = (minH + maxH) / 2;
  const C = [cdir[0] * (R + midH), cdir[1] * (R + midH), cdir[2] * (R + midH)];
  const per = DET_PERIOD;
  const off = [Math.round(C[0] / per) * per, Math.round(C[1] / per) * per, Math.round(C[2] / per) * per];

  const V = (N + 1) * (N + 1);
  const nSkirt = 4 * (N + 1);
  const total = V + nSkirt;
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), up = new Float32Array(total * 3);
  const det = new Float32Array(total * 3), dat = new Float32Array(total * 4);
  const morph = new Float32Array(total * 3); // delta até a posição do nível pai (geomorfose sem fendas)
  const lod = new Float32Array(total);
  let br = 0;
  const vi = (i, j) => j * (N + 1) + i;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = (j + 1) * S + (i + 1), v = vi(i, j);
      const px = P[k * 3], py = P[k * 3 + 1], pz = P[k * 3 + 2];
      pos[v * 3] = px - C[0]; pos[v * 3 + 1] = py - C[1]; pos[v * 3 + 2] = pz - C[2];
      const d2 = (px - C[0]) ** 2 + (py - C[1]) ** 2 + (pz - C[2]) ** 2; if (d2 > br) br = d2;
      det[v * 3] = px - off[0]; det[v * 3 + 1] = py - off[1]; det[v * 3 + 2] = pz - off[2];
      up[v * 3] = U[k * 3]; up[v * 3 + 1] = U[k * 3 + 1]; up[v * 3 + 2] = U[k * 3 + 2];
      // normal por diferenças centrais
      const kl = k - 1, kr = k + 1, kd = k - S, ku = k + S;
      const ax = P[kr * 3] - P[kl * 3], ay = P[kr * 3 + 1] - P[kl * 3 + 1], az = P[kr * 3 + 2] - P[kl * 3 + 2];
      const bx = P[ku * 3] - P[kd * 3], by = P[ku * 3 + 1] - P[kd * 3 + 1], bz = P[ku * 3 + 2] - P[kd * 3 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      if (nx * U[k * 3] + ny * U[k * 3 + 1] + nz * U[k * 3 + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm[v * 3] = nx / nl; nrm[v * 3 + 1] = ny / nl; nrm[v * 3 + 2] = nz / nl;
      dat[v * 4] = D[k * 4]; dat[v * 4 + 1] = D[k * 4 + 1]; dat[v * 4 + 2] = D[k * 4 + 2]; dat[v * 4 + 3] = D[k * 4 + 3];
    }
  }
  // geomorfose: vértices ímpares vão para onde o triângulo do PAI passaria
  // (média dos vizinhos pares na mesma triangulação), então a malha encaixa
  // exatamente no nível mais grosso quando o fator de morph chega a 1
  const parentFlip = (I, J) => ((I + (job.ix & 1) * (N / 2) + J + (job.iy & 1) * (N / 2)) & 1);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const v = vi(i, j), oi = i & 1, oj = j & 1;
      if (!oi && !oj) continue;
      let a, b;
      if (oi && !oj) { a = vi(i - 1, j); b = vi(i + 1, j); }
      else if (!oi && oj) { a = vi(i, j - 1); b = vi(i, j + 1); }
      else {
        // centro de uma célula do pai: na diagonal escolhida pelo pai
        const I = (i - 1) >> 1, J = (j - 1) >> 1;
        if (parentFlip(I, J)) { a = vi(i - 1, j - 1); b = vi(i + 1, j + 1); }
        else { a = vi(i + 1, j - 1); b = vi(i - 1, j + 1); }
      }
      for (let c = 0; c < 3; c++) morph[v * 3 + c] = (pos[a * 3 + c] + pos[b * 3 + c]) * 0.5 - pos[v * 3 + c];
    }
  }
  lod.fill((size * QP * R) / N);
  // saias: cópia das bordas afundada ao longo da radial
  const spacing = (size * QP * R) / N;
  const skirt = Math.max(2, spacing * 1.5 + (maxH - minH) * 0.02);
  const edge = [];
  for (let i = 0; i <= N; i++) edge.push(vi(i, 0));
  for (let j = 0; j <= N; j++) edge.push(vi(N, j));
  for (let i = N; i >= 0; i--) edge.push(vi(i, N));
  for (let j = N; j >= 0; j--) edge.push(vi(0, j));
  for (let e = 0; e < nSkirt; e++) {
    const s = edge[e], v = V + e;
    for (let c = 0; c < 3; c++) {
      pos[v * 3 + c] = pos[s * 3 + c] - up[s * 3 + c] * skirt;
      det[v * 3 + c] = det[s * 3 + c] - up[s * 3 + c] * skirt;
      nrm[v * 3 + c] = nrm[s * 3 + c]; up[v * 3 + c] = up[s * 3 + c];
      morph[v * 3 + c] = morph[s * 3 + c];
    }
    for (let c = 0; c < 4; c++) dat[v * 4 + c] = dat[s * 4 + c];
  }
  // índices (u × v = normal → CCW visto de fora)
  const tris = N * N * 2 + nSkirt * 2;
  const idx = new Uint16Array(tris * 3);
  let t = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = vi(i, j), b = vi(i + 1, j), c = vi(i, j + 1), d = vi(i + 1, j + 1);
    // diagonal alternada (menos artefatos direcionais)
    if ((i + j) & 1) { idx[t++] = a; idx[t++] = b; idx[t++] = d; idx[t++] = a; idx[t++] = d; idx[t++] = c; }
    else { idx[t++] = a; idx[t++] = b; idx[t++] = c; idx[t++] = b; idx[t++] = d; idx[t++] = c; }
  }
  // saia: quads entre borda (sentido do perímetro) e cópia afundada
  for (let e = 0; e < nSkirt; e++) {
    const e2 = (e + 1) % nSkirt;
    if (e2 === 0) continue;
    const a = edge[e], b = edge[e2], c = V + e, d = V + e2;
    if (a === b) continue;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const index = idx.subarray(0, t);

  const out = {
    key: job.key, center: C, boundR: Math.sqrt(br) + skirt, minH, maxH, spacing,
    pos, nrm, up, det, dat, morph, lod, index, water: null,
  };

  // água: só se há mar e parte do chunk está abaixo dele
  if (T.hasSea && minH < 2) {
    const wpos = new Float32Array(V * 3), wup = new Float32Array(V * 3), wdet = new Float32Array(V * 3), wdep = new Float32Array(V);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = (j + 1) * S + (i + 1), v = vi(i, j);
      const ux = U[k * 3], uy = U[k * 3 + 1], uz = U[k * 3 + 2];
      wpos[v * 3] = ux * R - C[0]; wpos[v * 3 + 1] = uy * R - C[1]; wpos[v * 3 + 2] = uz * R - C[2];
      wup[v * 3] = ux; wup[v * 3 + 1] = uy; wup[v * 3 + 2] = uz;
      wdet[v * 3] = ux * R - off[0]; wdet[v * 3 + 1] = uy * R - off[1]; wdet[v * 3 + 2] = uz * R - off[2];
      wdep[v] = -D[k * 4];
    }
    const widx = new Uint16Array(N * N * 6);
    let w = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = vi(i, j), b = vi(i + 1, j), c = vi(i, j + 1), d = vi(i + 1, j + 1);
      widx[w++] = a; widx[w++] = b; widx[w++] = c; widx[w++] = b; widx[w++] = d; widx[w++] = c;
    }
    out.water = { pos: wpos, up: wup, det: wdet, depth: wdep, index: widx };
  }
  return out;
}

/** Lista de buffers transferíveis do resultado. */
export function transferables(r) {
  const l = [r.pos.buffer, r.nrm.buffer, r.up.buffer, r.det.buffer, r.dat.buffer, r.morph.buffer, r.lod.buffer, r.index.buffer];
  if (r.water) l.push(r.water.pos.buffer, r.water.up.buffer, r.water.det.buffer, r.water.depth.buffer, r.water.index.buffer);
  return l;
}
