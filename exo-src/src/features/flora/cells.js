/**
 * GRADE DE CÉLULAS NA ESFERA + AZULEJOS DE POISSON (puro).
 *
 * Cubo-esfera EQUIÂNGULO (tan) — células quase do mesmo tamanho em metros
 * em toda a face (±15%). Uma célula é (face, i, j) num nível S (células por
 * lado da face); a semente de cada célula vem do caminho (planeta, camada,
 * face, i, j), então o conteúdo é determinístico e independente da ordem de
 * carregamento.
 *
 * Dentro da célula os pontos vêm de um azulejo de Poisson (ruído azul)
 * toroidal, com uma das 8 simetrias do quadrado sorteada por célula, e cada
 * ponto tem um POSTO (rank) aleatório: densidade d mantém os pontos com
 * rank < d — afinar a densidade preserva a distribuição azul.
 */
import { mulberry32 } from '../../core/Rng.js';

const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, -1] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [0, 0, 1], v: [-1, 0, 0] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
];
const Q = Math.PI / 4;

/** (face, a, b) com a,b ∈ [−1, 1] → direção unitária (out: {x,y,z}) */
export function faceDir(f, a, b, out) {
  const F = FACES[f];
  const ta = Math.tan(a * Q), tb = Math.tan(b * Q);
  const x = F.n[0] + F.u[0] * ta + F.v[0] * tb;
  const y = F.n[1] + F.u[1] * ta + F.v[1] * tb;
  const z = F.n[2] + F.u[2] * ta + F.v[2] * tb;
  const l = 1 / Math.sqrt(x * x + y * y + z * z);
  out.x = x * l;
  out.y = y * l;
  out.z = z * l;
  return out;
}

/** direção → [face, a, b] */
export function dirFace(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f;
  if (ax >= ay && ax >= az) f = x > 0 ? 0 : 1;
  else if (ay >= az) f = y > 0 ? 2 : 3;
  else f = z > 0 ? 4 : 5;
  const F = FACES[f];
  const dn = x * F.n[0] + y * F.n[1] + z * F.n[2];
  const du = x * F.u[0] + y * F.u[1] + z * F.u[2];
  const dv = x * F.v[0] + y * F.v[1] + z * F.v[2];
  return [f, Math.atan(du / dn) / Q, Math.atan(dv / dn) / Q];
}

/** direção → chave da célula no nível S */
export function cellOf(x, y, z, S) {
  const [f, a, b] = dirFace(x, y, z);
  const i = Math.max(0, Math.min(S - 1, Math.floor(((a + 1) / 2) * S)));
  const j = Math.max(0, Math.min(S - 1, Math.floor(((b + 1) / 2) * S)));
  return { f, i, j, key: `${f}:${i}:${j}` };
}

/** coordenadas (s,t) ∈ [0,1]² dentro da célula → direção */
export function cellDir(f, i, j, S, s, t, out) {
  const a = -1 + ((i + s) / S) * 2;
  const b = -1 + ((j + t) / S) * 2;
  return faceDir(f, a, b, out);
}

/**
 * Azulejo de Poisson toroidal no quadrado unitário com ~n pontos.
 * @returns Float32Array [x, y, rank, rnd, ...]
 */
export function poissonTile(n, seed) {
  const rnd = mulberry32(seed);
  const r = 0.72 / Math.sqrt(n); // distância mínima (≈ empacotamento de ruído azul)
  const cs = r / Math.SQRT2;
  const G = Math.ceil(1 / cs);
  const grid = new Int32Array(G * G).fill(-1);
  const pts = [];
  let fails = 0;
  while (pts.length < n && fails < n * 60) {
    const x = rnd(), y = rnd();
    const gx = Math.floor(x * G) % G, gy = Math.floor(y * G) % G;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) {
      for (let dx = -2; dx <= 2 && ok; dx++) {
        const k = grid[((gy + dy + G) % G) * G + ((gx + dx + G) % G)];
        if (k < 0) continue;
        let ddx = Math.abs(pts[k][0] - x), ddy = Math.abs(pts[k][1] - y);
        if (ddx > 0.5) ddx = 1 - ddx;
        if (ddy > 0.5) ddy = 1 - ddy;
        if (ddx * ddx + ddy * ddy < r * r) ok = false;
      }
    }
    if (ok) {
      grid[gy * G + gx] = pts.length;
      pts.push([x, y]);
      fails = 0;
    } else fails++;
  }
  const out = new Float32Array(pts.length * 4);
  pts.forEach((p, k) => {
    out[k * 4] = p[0];
    out[k * 4 + 1] = p[1];
    out[k * 4 + 2] = rnd();
    out[k * 4 + 3] = rnd();
  });
  return out;
}

/** aplica uma das 8 simetrias do quadrado */
export function sym(k, x, y) {
  switch (k & 7) {
    case 0: return [x, y];
    case 1: return [1 - x, y];
    case 2: return [x, 1 - y];
    case 3: return [1 - x, 1 - y];
    case 4: return [y, x];
    case 5: return [1 - y, x];
    case 6: return [y, 1 - x];
    default: return [1 - y, 1 - x];
  }
}

// ─── ruído de valor 3D (máscaras de floresta/clareira e manchas) ──────
function h3(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    r += h3(xi + dx, yi + dy, zi + dz, s) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
export function fbm3(x, y, z, s = 0, oct = 3) {
  let a = 0.5, f = 1, r = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    r += vnoise3(x * f, y * f, z * f, s + i * 17) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return r / n;
}
