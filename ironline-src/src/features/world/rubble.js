/**
 * Entulho em camadas ("fotogrametria procedural"):
 *
 *  - monte base: malha de altura radial com ruído multi-oitava, saia
 *    enterrada no chão (contato sem degrau), material triplanar de pó;
 *  - pedaços grandes de laje quebrada (contorno serrilhado extrudado) e
 *    blocos de concreto FRATURADOS (caixa cortada por planos aleatórios →
 *    facetas de quebra nítidas) cravados na encosta, inclinados pela
 *    normal do monte;
 *  - tijolos lascados (vários formatos, meios-tijolos), torrões de
 *    alvenaria (tijolos ainda colados com argamassa), placas de reboco
 *    curvas, vergalhões, canos e tábuas;
 *  - talude de cascalho miúdo na base (instanciado, sem sombra);
 *  - halo de poeira no chão em volta.
 *
 * Tudo instanciado por variante de geometria; materiais triplanares
 * (rubbleC = concreto, rubbleD = pó/terra) em espaço de mundo — sem UV
 * esticada, em qualquer orientação.
 */
import * as THREE from 'three';
import { cached, mat4 } from './geo.js';
import { mulberry } from './noise.js';
import { rebar, decal, cylBetween, contact } from './shapes.js';

// ─── ruído de valor 2D simples (para a altura do monte) ────────────────
function vnoise(x, z, seed) {
  const h = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm2 = (x, z, seed) => vnoise(x, z, seed) * 0.55 + vnoise(x * 2.1, z * 2.1, seed + 3) * 0.3 + vnoise(x * 4.3, z * 4.3, seed + 7) * 0.15;

// ─── geometrias de pedaços (cacheadas por variante) ────────────────────
/** Bloco fraturado: caixa subdividida "cortada" por 3–4 planos aleatórios. */
export const chunkGeo = (v) =>
  cached('rchunk' + v, () => {
    const r = mulberry(500 + v * 13);
    const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
    const P = g.attributes.position;
    const planes = [];
    const np = 3 + (v % 2);
    for (let k = 0; k < np; k++) {
      const n = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      planes.push([n, 0.22 + r() * 0.2]);
    }
    const p = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      for (const [n, d] of planes) {
        const s = p.dot(n) - d;
        if (s > 0) p.addScaledVector(n, -s); // projeta no plano de corte
      }
      // rugosidade de quebra
      p.x += (r() - 0.5) * 0.05; p.y += (r() - 0.5) * 0.05; p.z += (r() - 0.5) * 0.05;
      P.setXYZ(i, p.x, p.y, p.z);
    }
    const ng = g.toNonIndexed();
    ng.computeVertexNormals(); // facetas nítidas
    ng.scale(1, 0.55 + (v % 3) * 0.18, 0.75 + (v % 2) * 0.2);
    return ng;
  });

/** Laje partida: contorno serrilhado extrudado (13 cm), deitada em XZ. */
export const slabGeo = (v) =>
  cached('rslab' + v, () => {
    const r = mulberry(700 + v * 31);
    const pts = [];
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const q = 0.5 * (0.55 + r() * 0.6) * (k % 3 === 0 ? 0.75 : 1);
      pts.push(new THREE.Vector2(Math.cos(a) * q * 1.3, Math.sin(a) * q));
    }
    const th = 0.15 + r() * 0.08;
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: th, steps: 2, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -th / 2);
    g.rotateX(-Math.PI / 2);
    // face superior empenada + borda esmagada (não uma chapa perfeita)
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const w = Math.sin(x * 3.1 + v) * 0.025 + Math.cos(z * 2.7 + v * 2) * 0.02;
      P.setXYZ(i, x + (r() - 0.5) * 0.015, y + w + (r() - 0.5) * 0.012, z + (r() - 0.5) * 0.015);
    }
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    return ng;
  });

/** Tijolo lascado (0.24 × 0.07 × 0.115) — variantes com quinas comidas / meio tijolo. */
export const brickGeo = (v) =>
  cached('rbrick' + v, () => {
    const r = mulberry(900 + v * 7);
    const half = v === 3;
    const g = new THREE.BoxGeometry(half ? 0.12 : 0.24, 0.068, 0.115, 2, 1, 1);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const corner = Math.abs(x) > 0.05 && r() < 0.35;
      const k = corner ? 0.7 + r() * 0.2 : 0.96 + r() * 0.06;
      P.setXYZ(i, x * k, y * (0.94 + r() * 0.08), z * (corner ? 0.8 : 0.97 + r() * 0.05));
    }
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  });

/** Torrão de alvenaria: 4–7 tijolos ainda presos pela argamassa. */
export const clusterGeo = (v) =>
  cached('rclus' + v, () => {
    const r = mulberry(1100 + v * 17);
    const parts = [];
    const rows = 2 + (v % 2);
    for (let row = 0; row < rows; row++) {
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const b = brickGeo(Math.floor(r() * 3)).clone();
        b.translate(k * 0.25 + (row % 2) * 0.125 - 0.25, row * 0.078, 0);
        parts.push(b);
      }
    }
    // argamassa (núcleo cinza) entre fiadas
    const m = new THREE.BoxGeometry(0.62, rows * 0.078 - 0.02, 0.1).toNonIndexed();
    m.translate(-0.03, (rows - 1) * 0.039, 0);
    parts.push(m);
    return merge(parts);
  });

/** Placa de reboco curva (2.5 cm), quebrada. */
export const sheetGeo = (v) =>
  cached('rsheet' + v, () => {
    const r = mulberry(1300 + v * 23);
    const g = new THREE.BoxGeometry(1, 0.025, 0.7, 5, 1, 4);
    const P = g.attributes.position;
    const bend = 0.12 + r() * 0.18;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      const edge = Math.max(Math.abs(x) * 2, Math.abs(z) * 2.8);
      const bite = edge > 0.85 ? (r() - 0.3) * 0.12 : 0;
      P.setXYZ(i, x * (1 - Math.abs(bite)), P.getY(i) + bend * (1 - 4 * x * x) * 0.5 + (r() - 0.5) * 0.01, z * (1 - Math.abs(bite) * 0.7));
    }
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  });

/** Solda vértices coincidentes (posição quantizada a 1 mm) → geometria indexada. */
function mergeVerts(g) {
  const P = g.attributes.position;
  const map = new Map(), verts = [], idx = [];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
    let j = map.get(k);
    if (j === undefined) {
      j = verts.length / 3;
      map.set(k, j);
      verts.push(x, y, z);
    }
    idx.push(j);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  o.setIndex(idx);
  return o;
}

function merge(geos) {
  const pos = [], nor = [], uv = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uv.push(...g.attributes.uv.array);
    else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const BRICK_T = [[0.62, 0.34, 0.25], [0.5, 0.29, 0.22], [0.7, 0.46, 0.33], [0.55, 0.47, 0.4], [0.66, 0.38, 0.27], [0.36, 0.24, 0.2]];
// concreto quente e sujo de pó (cinza puro lia azulado sob o céu)
const CONC_T = [[0.62, 0.58, 0.52], [0.53, 0.5, 0.45], [0.68, 0.63, 0.55], [0.43, 0.41, 0.38], [0.58, 0.54, 0.47], [0.36, 0.34, 0.31]];

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _nv = new THREE.Vector3();

/** Matriz com orientação alinhada a uma normal (pedaço deitado na encosta). */
function onSlope(pos, n, spin, tilt, scale) {
  _nv.set(n[0], n[1], n[2]).normalize();
  _q.setFromUnitVectors(_up, _nv);
  _q2.setFromEuler(_e.set(tilt[0], spin, tilt[1], 'YXZ'));
  _q.multiply(_q2);
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])));
}

/**
 * Monte de entulho. (x, z) centro, r raio, h altura.
 * opts: { y (cota do chão), tint (cor do reboco/pintura do prédio de origem),
 *         brick (0..1 proporção de tijolo), collide, dust, mound (bool) }
 */
export function rubblePile(W, x, z, r, h, opts = {}) {
  const { B, I, rng } = W;
  const y0 = opts.y ?? 0;
  const seed = rng.int(1, 9999);
  const brickK = opts.brick ?? 0.45;
  const tint = opts.tint || [0.86, 0.8, 0.7];
  const sx = rng.range(0.8, 1.2), sz = rng.range(0.8, 1.2), rot = rng.range(0, Math.PI * 2);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  // altura do monte em coordenadas locais (lx, lz)
  const height = (lx, lz) => {
    const ux = (lx * cr + lz * sr) / sx, uz = (-lx * sr + lz * cr) / sz;
    const d = Math.hypot(ux, uz) / r;
    if (d >= 1) return 0;
    const base = Math.pow(1 - d * d, 0.85);
    const n = fbm2(lx * 1.3 + seed, lz * 1.3, seed);
    const lump = fbm2(lx * 3.1, lz * 3.1 + seed, seed + 1);
    const grit = vnoise(lx * 7.3, lz * 7.3, seed + 5);
    // cristas (pedaços grandes enterrados sob o pó) + degraus de deslizamento
    const ridge = 1 - Math.abs(2 * vnoise(lx * 2.3 + 11, lz * 2.3, seed + 9) - 1);
    const ridge2 = 1 - Math.abs(2 * vnoise(lx * 5.1, lz * 5.1 + 7, seed + 13) - 1);
    // cascalho grosso: pedras de 5–15 cm moldando a superfície (Worley
    // aproximado por |ruído| em duas escalas) — não um domo liso
    const peb = 1 - Math.abs(2 * vnoise(lx * 9.7 + 3, lz * 9.7, seed + 17) - 1);
    const peb2 = 1 - Math.abs(2 * vnoise(lx * 17.3, lz * 17.3 + 5, seed + 19) - 1);
    const sb = Math.sqrt(base);
    return h * base * (0.62 + n * 0.7) + (lump - 0.5) * 0.3 * base + ridge * ridge * 0.16 * base + ridge2 * ridge2 * 0.07 * sb + (grit - 0.5) * 0.1 * sb + (peb * peb * peb * 0.075 + peb2 * peb2 * 0.03) * sb;
  };
  const normalAt = (lx, lz) => {
    const e = 0.08;
    const hx = height(lx + e, lz) - height(lx - e, lz), hz = height(lx, lz + e) - height(lx, lz - e);
    const n = [-hx / (2 * e), 1, -hz / (2 * e)];
    const l = Math.hypot(...n);
    return n.map((v) => v / l);
  };
  // ── monte base (malha radial) ──
  if (opts.mound !== false && h > 0.08) {
    const rings = Math.max(16, Math.round(r * 15)), segs = Math.max(40, Math.round(r * 36));
    const R = r * 1.08;
    const vtx = (ri, si) => {
      const t = ri / rings;
      const a = (si / segs) * Math.PI * 2;
      const rr = R * t * (ri === rings ? 1 : 1 + (vnoise(si * 0.7, ri, seed) - 0.5) * 0.25);
      const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
      const yy = ri === rings ? -0.04 : height(lx, lz) + 0.01;
      return [x + lx, y0 + yy, z + lz];
    };
    const pos = [];
    for (let ri = 0; ri < rings; ri++) {
      for (let si = 0; si < segs; si++) {
        const a = vtx(ri, si), b = vtx(ri, si + 1), c = vtx(ri + 1, si + 1), d = vtx(ri + 1, si);
        if (ri === 0) pos.push(...a, ...c, ...d);
        else pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // normais suaves (solda vértices coincidentes): monte de pó contínuo; o
    // detalhe de cascalho vem dos pedaços instanciados por cima
    g = mergeVerts(g);
    g.computeVertexNormals();
    g = g.toNonIndexed();
    const uv = new Float32Array((pos.length / 3) * 2);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // AO/cor: base mais escura (contato), topo mais claro (pó assentado)
    // (o cascalho triplanar já tem cor própria; aqui só AO de contato e um toque da tinta)
    const col = (p) => {
      const t = Math.min(1, Math.max(0, (p.y - y0) / Math.max(0.2, h)));
      // AO de contato forte no pé (encontro com asfalto/parede) + cavidades
      const k = (0.28 + 0.72 * Math.pow(t, 0.6)) * (0.82 + 0.18 * vnoise(p.x * 6.1, p.z * 6.1, seed + 29));
      return [(0.8 + tint[0] * 0.2) * k, (0.8 + tint[1] * 0.2) * k, (0.8 + tint[2] * 0.2) * k];
    };
    B.add(g, 'rubbleD', null, { color: col, at: [x, z] });
  }
  // ── halo de poeira no chão ──
  if (opts.mound !== false && h > 0.08) contact(B, x, y0, z, r * 2.5, r * 2.5, rot, 2);
  if (opts.dust !== false) decal(B, 'stains', [x, y0 + 0.012 + rng.range(0, 0.002), z], 'py', [r * 3.2, r * 3.0], [0, 0.5, 0.5, 1], rng.range(0, 6), [1.25, 1.15, 1.0]);

  const place = (lx, lz, lift = 0) => {
    const hh = height(lx, lz);
    return [x + lx, y0 + hh + lift, z + lz];
  };
  const randIn = (k = 1) => {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r * k;
    return [Math.cos(a) * d, Math.sin(a) * d];
  };
  // ── pedaços grandes: lajes e blocos fraturados ──
  const nBig = Math.max(1, Math.round(r * (r > 2 ? 3.6 : 2.6) * (opts.big ?? 1)));
  for (let i = 0; i < nBig; i++) {
    const [lx, lz] = randIn(0.75);
    const n = normalAt(lx, lz);
    if (rng.chance(0.45)) {
      const s = rng.range(0.6, 1.3) * Math.min(1, r / 1.2);
      I.add('rslab' + (i % 4), slabGeo(i % 4), 'rubbleC', onSlope(place(lx, lz, -0.03), n, rng.range(0, 6.28), [rng.range(-0.35, 0.35), rng.range(-0.35, 0.35)], [s, 1, s]), rng.pick(CONC_T));
      if (rng.chance(0.6)) rebar(B, place(lx, lz, 0.05), [rng.range(-1, 1), rng.range(0.2, 0.9), rng.range(-1, 1)], rng.range(0.4, 1.1), rng);
    } else {
      const s = rng.range(0.28, 0.6) * Math.min(1.2, r / 1.0);
      const v = rng.int(0, 7);
      const painted = rng.chance(0.35);
      I.add('rchunk' + v, chunkGeo(v), 'rubbleC', onSlope(place(lx, lz, s * 0.12), n, rng.range(0, 6.28), [rng.range(-0.6, 0.6), rng.range(-0.6, 0.6)], [s * rng.range(0.9, 1.4), s, s * rng.range(0.8, 1.2)]), painted ? tint.map((c) => c * 0.95) : rng.pick(CONC_T));
    }
  }
  // ── pedaços médios ──
  const nMed = Math.round(r * r * 26 * (opts.density ?? 1) * (r > 2 ? 1.4 : 1)) + 10;
  for (let i = 0; i < nMed; i++) {
    const [lx, lz] = randIn(0.95);
    const n = normalAt(lx, lz);
    const kind = rng.next();
    if (kind < brickK * 0.55) {
      const v = rng.int(0, 3);
      I.add('rbrick' + v, brickGeo(v), 'rubbleB', onSlope(place(lx, lz, 0.02), n, rng.range(0, 6.28), [rng.range(-0.5, 0.5), rng.range(-0.9, 0.9)], 1), rng.pick(BRICK_T), { shadow: true });
    } else if (kind < brickK * 0.8) {
      const v = rng.int(0, 2);
      I.add('rclus' + v, clusterGeo(v), 'rubbleB', onSlope(place(lx, lz, 0.0), n, rng.range(0, 6.28), [rng.range(-0.6, 0.6), rng.range(-0.6, 0.6)], rng.range(0.85, 1.15)), rng.pick(BRICK_T));
    } else if (kind < 0.93) {
      const s = rng.range(0.1, 0.3);
      const v = rng.int(0, 7);
      I.add('rchunk' + v, chunkGeo(v), 'rubbleC', onSlope(place(lx, lz, s * 0.15), n, rng.range(0, 6.28), [rng.range(-0.8, 0.8), rng.range(-0.8, 0.8)], s), rng.chance(0.3) ? tint : rng.pick(CONC_T));
    } else {
      const s = rng.range(0.35, 0.7);
      const v = rng.int(0, 2);
      I.add('rsheet' + v, sheetGeo(v), 'rubbleC', onSlope(place(lx, lz, 0.02), n, rng.range(0, 6.28), [rng.range(-0.5, 0.5), rng.range(-0.5, 0.5)], [s, 1, s]), tint.map((c) => c * rng.range(0.6, 0.8)));
    }
  }
  // ── talude de cascalho miúdo (sem sombra) ──
  const nSmall = Math.round(r * r * 60 * (opts.density ?? 1)) + 24;
  for (let i = 0; i < nSmall; i++) {
    // cobre o monte inteiro (mais denso na encosta/pé) e transborda além da borda
    const a = rng.range(0, Math.PI * 2), d = r * (rng.chance(0.65) ? rng.range(0.5, 1.3) : Math.sqrt(rng.next()) * 0.9);
    const lx = Math.cos(a) * d, lz = Math.sin(a) * d;
    const s = rng.range(0.03, 0.12);
    const v = rng.int(0, 7);
    const red = rng.chance(brickK * 0.5);
    I.add('rchunk' + v, chunkGeo(v), 'rubbleC', mat4(place(lx, lz, s * 0.2), [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)], s), red ? rng.pick(BRICK_T) : rng.pick(CONC_T), { shadow: false });
  }
  // ── vergalhões, canos e tábuas ──
  const nBar = Math.round(r * (opts.rebar ?? 3.4));
  for (let i = 0; i < nBar; i++) {
    const [lx, lz] = randIn(0.6);
    rebar(B, place(lx, lz, -0.05), [rng.range(-1, 1), rng.range(0.3, 1), rng.range(-1, 1)], rng.range(0.5, 1.5), rng);
  }
  if (r > 1.2 && rng.chance(0.6)) {
    const [lx, lz] = randIn(0.5);
    const a = place(lx, lz, 0.05);
    const ang = rng.range(0, 6.28), len = rng.range(1.2, 2.4);
    const b = [a[0] + Math.cos(ang) * len, a[1] + rng.range(-0.3, 0.4), a[2] + Math.sin(ang) * len];
    if (rng.chance(0.5)) cylBetween(B, a, b, 0.045, 'metal', { seg: 8, color: [0.55, 0.5, 0.45] });
    else B.obox([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [len, 0.05, 0.16], [rng.range(-0.3, 0.3), -ang, Math.atan2(b[1] - a[1], len)], 'wood', { color: [0.6, 0.55, 0.48] });
  }
  // colisor em degraus (≤ 0.4 m cada) — dá para subir o monte
  if (opts.collide !== false && h > 0.2) {
    const steps = Math.max(1, Math.ceil(h / 0.4));
    for (let k = 0; k < steps; k++) {
      const y1 = Math.min(h, (k + 1) * 0.4);
      const rr = r * Math.sqrt(Math.max(0.05, 1 - (y1 / h) ** 2)) * 0.8;
      B.collider([x - rr, y0, z - rr], [x + rr, y0 + y1 * 0.85, z + rr], 'dirt');
    }
  }
}

/**
 * Detritos soltos em AGLOMERADOS (não espalhados por igual): tijolos
 * lascados de vários tons, pedaços de concreto, lascas de reboco.
 */
export function scatterDebris(W, x, z, r, n, opts = {}) {
  const { I, rng } = W;
  const y = opts.y || 0;
  const nc = Math.max(1, Math.round(n / 6));
  const centers = Array.from({ length: nc }, () => {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    return [x + Math.cos(a) * d, z + Math.sin(a) * d];
  });
  for (let i = 0; i < n; i++) {
    const c = centers[i % nc];
    const a = rng.range(0, Math.PI * 2), d = Math.pow(rng.next(), 1.6) * Math.min(r, 1.2);
    const px = c[0] + Math.cos(a) * d, pz = c[1] + Math.sin(a) * d;
    const k = rng.next();
    if (k < (opts.brick ?? 0.4)) {
      const v = rng.int(0, 3);
      const onEdge = rng.chance(0.15);
      const bs = rng.range(0.7, 1.15);
      I.add('rbrick' + v, brickGeo(v), 'rubbleB', mat4([px, y + (onEdge ? 0.055 : 0.03) * bs, pz], [onEdge ? Math.PI / 2 : rng.range(-0.15, 0.15), rng.range(0, 6.28), rng.range(-0.15, 0.15)], bs), rng.pick(BRICK_T), { shadow: true });
    } else if (k < 0.85) {
      const s = rng.range(0.03, 0.13);
      const v = rng.int(0, 7);
      I.add('rchunk' + v, chunkGeo(v), 'rubbleC', mat4([px, y + s * 0.25, pz], [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)], s), rng.pick(CONC_T), { shadow: false });
    } else {
      const s = rng.range(0.12, 0.28);
      const v = rng.int(0, 2);
      I.add('rsheet' + v, sheetGeo(v), 'rubbleC', mat4([px, y + 0.02, pz], [rng.range(-0.2, 0.2), rng.range(0, 6), rng.range(-0.2, 0.2)], [s, 1, s]), (opts.tint || rng.pick(CONC_T)).map((c) => c * 0.7), { shadow: false });
    }
  }
}
