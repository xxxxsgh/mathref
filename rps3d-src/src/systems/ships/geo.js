// Geometria procedural de naves: loft de seções superelípticas (cascos de
// superfície dura), asas extrudadas, kit de "greebles" (respiros, antenas,
// blocos de RCS, placas, canos, domos) e um acumulador que funde tudo em
// poucas malhas por material (um draw call por material por nave).
//
// Convenção: metros; nariz para −Z, dorso +Y, direita +X.
// Atributo `aInfo` (vec3) em cada vértice do casco:
//   x = zona de pintura (Z.*), y = desgaste local (0..1), z = semente da peça.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Zonas de pintura (o material do casco escolhe cor/metal/rugosidade). */
export const Z = {
  PRIMARY: 0,   // pintura principal da facção
  SECONDARY: 1, // segunda cor / faixas / listras de perigo
  TRIM: 2,      // acabamento (dourado na Hegemonia, cobre etc.)
  METAL: 3,     // metal nu escovado
  DARK: 4,      // metal escuro (mecânica, entradas, trem)
  HOT: 5,       // metal de bocal (azulado pelo calor)
  GLOW: 6,      // painel luminoso (cor de destaque da facção)
  RUBBER: 7,    // borracha / composto fosco (pneus, vedação)
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** Matriz a partir de posição, rotação (Euler XYZ em rad) e escala. */
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _q.setFromEuler(new THREE.Euler(rx, ry, rz));
  return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), _q, new THREE.Vector3(sx, sy, sz));
}
/** Matriz que alinha +Y local à normal `n` (para colar peças numa superfície). */
export function onSurface(pos, n, spin = 0, scale = 1) {
  _q.setFromUnitVectors(UP, _v.copy(n).normalize());
  if (spin) _q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  return new THREE.Matrix4().compose(pos.clone(), _q.clone(), typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale);
}

/** Espelha em X preservando a ordem dos triângulos (geometria não indexada). */
export function mirrorX(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.scale(-1, 1, 1);
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = a.array[(i + 1) * n + k];
        a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k];
        a.array[(i + 2) * n + k] = t;
      }
    }
  }
  return g;
}

// ─── loft superelíptico ────────────────────────────────────────────────────
const crKeys = ['w', 'h', 'hb', 'y', 'e', 'x'];
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function normStation(s) { return { z: s.z, w: s.w, h: s.h, hb: s.hb ?? s.h, y: s.y ?? 0, e: s.e ?? 2.5, x: s.x ?? 0 }; }

/**
 * Casco por seções: stations = [{z, w, h, hb?, y?, e?, x?}] (z crescente,
 * do nariz à cauda). w = meia-largura, h/hb = meia-altura acima/abaixo do
 * eixo y, e = expoente (2 = elipse, 4+ = retângulo arredondado).
 * Retorna { geo, at(z, a) → {pos, normal}, params(z) }.
 */
export function loft(stations, { seg = 32, sub = 4, capStart = true, capEnd = true, smooth = true } = {}) {
  const S = stations.map(normStation);
  const rows = [];
  for (let i = 0; i < S.length - 1; i++) {
    const n = i === S.length - 2 ? sub + 1 : sub;
    for (let k = 0; k < n; k++) rows.push(paramsAtIdx(S, i, k / sub, smooth));
  }
  const pos = [], idx = [];
  for (const r of rows) for (let j = 0; j < seg; j++) {
    const p = sectionPoint(r, (j / seg) * Math.PI * 2);
    pos.push(p.x, p.y, r.z);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + (j + 1) % seg, c = (i + 1) * seg + j, d = (i + 1) * seg + (j + 1) % seg;
    idx.push(a, c, b, b, c, d);
  }
  let vc = rows.length * seg;
  if (capStart) {
    const r = rows[0]; pos.push(r.x, r.y, r.z - Math.min(r.w, r.h) * 0.05);
    for (let j = 0; j < seg; j++) idx.push(vc, j, (j + 1) % seg);
    vc++;
  }
  if (capEnd) {
    const r = rows[rows.length - 1], base = (rows.length - 1) * seg;
    pos.push(r.x, r.y, r.z + Math.min(r.w, r.h) * 0.05);
    for (let j = 0; j < seg; j++) idx.push(vc, base + (j + 1) % seg, base + j);
    vc++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const params = (z) => paramsAtZ(S, z, smooth);
  const at = (z, a) => {
    const r = params(z);
    const p = sectionPoint(r, a);
    const p1 = sectionPoint(r, a + 0.01), r2 = params(z + 0.05), p2 = sectionPoint(r2, a);
    const ta = new THREE.Vector3(p1.x - p.x, p1.y - p.y, 0);
    const tz = new THREE.Vector3(p2.x - p.x, p2.y - p.y, 0.05);
    const nrm = new THREE.Vector3().crossVectors(tz, ta).normalize();
    // garante a normal para fora do eixo
    if (nrm.x * (p.x - r.x) + nrm.y * (p.y - r.y) < 0) nrm.negate();
    return { pos: new THREE.Vector3(p.x, p.y, z), normal: nrm };
  };
  return { geo, at, params, stations: S };
}
function sectionPoint(r, a) {
  const c = Math.cos(a), s = Math.sin(a), k = 2 / r.e;
  const x = r.w * Math.sign(c) * Math.abs(c) ** k;
  const y = (s >= 0 ? r.h : r.hb) * Math.sign(s) * Math.abs(s) ** k;
  return { x: x + r.x, y: y + r.y };
}
function paramsAtIdx(S, i, t, smooth) {
  const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
  const o = { z: b.z + (c.z - b.z) * t };
  for (const k of crKeys) o[k] = smooth ? Math.max(k === 'e' ? 1.2 : -1e9, cr(a[k], b[k], c[k], d[k], t)) : b[k] + (c[k] - b[k]) * t;
  o.w = Math.max(o.w, 0.001); o.h = Math.max(o.h, 0.001); o.hb = Math.max(o.hb, 0.001);
  return o;
}
function paramsAtZ(S, z, smooth) {
  if (z <= S[0].z) return { ...S[0], z };
  for (let i = 0; i < S.length - 1; i++) if (z <= S[i + 1].z) return paramsAtIdx(S, i, (z - S[i].z) / (S[i + 1].z - S[i].z || 1), smooth);
  return { ...S[S.length - 1], z };
}

// ─── asas e lâminas ───────────────────────────────────────────────────────
/**
 * Placa plana extrudada a partir de um contorno [[x, z], ...] no plano XZ
 * (x = envergadura, z = corda para trás), espessura `t` centrada em y=0.
 */
export function plate(pts, t = 0.2, { bevel = 0.06, bevelSeg = 1 } = {}) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], -pts[i][1]);
  sh.closePath();
  const b = Math.min(bevel, t * 0.45);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: bevelSeg, curveSegments: 1 });
  // shape (x, y=−z) → plano XZ; extrusão (z) → y
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(t - 2 * b) / 2, 0);
  g.deleteAttribute('uv');
  return g;
}
/** Placa vertical (aleta): contorno [[z, y], ...] no plano YZ, espessura em X. */
export function fin(pts, t = 0.15, opts) {
  const g = plate(pts.map(([z, y]) => [y, z]), t, opts); // x=y, z=z → gira p/ vertical
  g.rotateZ(Math.PI / 2);
  return g;
}
function flipWinding(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(ng.attributes)) {
    const a = ng.attributes[name], n = a.itemSize;
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < n; k++) {
      const t = a.array[(i + 1) * n + k]; a.array[(i + 1) * n + k] = a.array[(i + 2) * n + k]; a.array[(i + 2) * n + k] = t;
    }
  }
  return ng;
}

// ─── kit de peças ─────────────────────────────────────────────────────────
export const box = (w, h, d, r = 0) => (r > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d));
export const cyl = (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
/** Cilindro ao longo de Z. */
export const cylZ = (r0, r1, len, seg = 16, open = false) => { const g = cyl(r1, r0, len, seg, open); g.rotateX(-Math.PI / 2); return g; };
export const sphere = (r, ws = 16, hs = 10, phiLen = Math.PI * 2, thetaLen = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, phiLen, 0, thetaLen);
/** Torno ao longo de Z (perfil [[r, z]...]). */
export function latheZ(prof, seg = 24) {
  const g = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(Math.max(r, 0.0001), z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}
export const torusZ = (R, r, seg = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 8, seg, arc);

/** Bocal de motor: carenagem externa + garganta + pétalas. Abre para +Z. */
export function nozzleParts(r, len, { petals = 12, flare = 1.12 } = {}) {
  const outer = latheZ([[r * 0.98, 0], [r * 1.02, len * 0.15], [r * flare, len * 0.85], [r * flare * 1.01, len], [r * flare * 0.93, len * 1.01], [r * 0.82, len * 0.6], [r * 0.6, len * 0.15]], 28);
  const petalsG = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const g = box(r * 0.42, r * 0.04, len * 0.55);
    g.rotateX(-0.12);
    g.translate(0, r * flare * 1.03, len * 0.62);
    g.rotateZ(a);
    petalsG.push(g);
  }
  return { outer, petals: mergeGeometries(petalsG.map((g) => g.index ? g.toNonIndexed() : g)) };
}

/** Respiro: moldura com aletas (fica sobre +Y). */
export function vent(w, d, n = 6, h = 0.06) {
  const parts = [box(w, h * 0.6, d)];
  for (let i = 0; i < n; i++) {
    const g = box(w * 0.88, h, d / (n * 2.2));
    g.rotateX(0.5);
    g.translate(0, h * 0.5, -d / 2 + (i + 0.5) * (d / n));
    parts.push(g);
  }
  return mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
}
/** Bloco de RCS: base + 3 bocais pequenos. */
export function rcs(s = 0.25) {
  const parts = [box(s, s * 0.6, s, s * 0.08)];
  for (const [x, z, rx, rz] of [[0, -s * 0.5, -Math.PI / 2, 0], [s * 0.5, 0, 0, -Math.PI / 2], [0, 0, 0, 0]]) {
    const g = cyl(s * 0.14, s * 0.2, s * 0.3, 10, true);
    g.rotateX(rx); g.rotateZ(rz);
    g.translate(x, s * 0.35, z);
    parts.push(g);
  }
  return mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g));
}
/** Antena com ponta (ao longo de +Y). */
export function antenna(h = 1.2, r = 0.02) {
  const a = cyl(r * 0.5, r, h, 6); a.translate(0, h / 2, 0);
  const b = sphere(r * 2.2, 8, 6); b.translate(0, h, 0);
  const c = cyl(r * 3, r * 3.6, r * 4, 8); c.translate(0, r * 2, 0);
  return mergeGeometries([a, b, c].map((g) => g.toNonIndexed()));
}
/** Cano ao longo de uma curva. */
export function pipe(points, r = 0.05, seg = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  return new THREE.TubeGeometry(curve, seg, r, 6, false);
}
/** Canhão com freio de boca, ao longo de −Z a partir da origem. */
export function gunBarrel(len = 2.5, r = 0.08) {
  const parts = [];
  const b = cylZ(r, r, len, 10); b.translate(0, 0, -len / 2); parts.push(b);
  const sh = cylZ(r * 2.1, r * 2.3, len * 0.28, 12); sh.translate(0, 0, -len * 0.14); parts.push(sh);
  const mz = cylZ(r * 1.6, r * 1.6, len * 0.12, 10); mz.translate(0, 0, -len * 0.96); parts.push(mz);
  for (let i = 0; i < 3; i++) { const ring = cylZ(r * 1.45, r * 1.45, len * 0.025, 10); ring.translate(0, 0, -len * (0.45 + i * 0.12)); parts.push(ring); }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}
/** Disco/prato de sensor (abre para +Y). */
export function dish(r = 0.6) {
  const g = new THREE.LatheGeometry([[0.001, 0], [r * 0.3, r * 0.03], [r * 0.7, r * 0.14], [r, r * 0.32], [r * 0.97, r * 0.34], [r * 0.68, r * 0.17], [r * 0.28, r * 0.06], [0.001, r * 0.04]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
  const st = cyl(r * 0.05, r * 0.05, r * 0.5, 6); st.translate(0, r * 0.3, 0);
  return mergeGeometries([g.toNonIndexed(), st.toNonIndexed()]);
}

// ─── acumulador ───────────────────────────────────────────────────────────
let _seed = 1;
function prep(geo, matrix, info, keep = []) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) {
    g.applyMatrix4(matrix);
    if (matrix.determinant() < 0) g = flipWinding(g);
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !keep.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (info) {
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = info[0]; a[i * 3 + 1] = info[1]; a[i * 3 + 2] = info[2]; }
    g.setAttribute('aInfo', new THREE.BufferAttribute(a, 3));
  }
  return g;
}

/**
 * Coletor de peças. Cada "canal" vira uma malha: hull (casco, material da
 * facção), detail (greebles — some à distância), glass, lights (emissores
 * pontuais com cor HDR e pisca), e grupos animados à parte (trem, torres).
 */
export class Parts {
  constructor(seed = 1) { this.hull = []; this.detail = []; this.glass = []; this.lights = []; this.glows = []; _seed = seed; this.mirror = false; }
  _info(zone, wear) { _seed = (_seed * 16807) % 2147483647; return [zone, wear, (_seed % 1000) / 1000]; }
  /** Peça do casco. opts: {m: Matrix4, wear, detail: bool, mirror: bool} */
  add(geo, zone = Z.PRIMARY, { m = null, wear = 0.5, detail = false, mirror = false, cut = false } = {}) {
    const list = detail ? this.detail : this.hull;
    const info = this._info(zone, wear);
    const g = prep(geo, m, info);
    if (cut) g.userData.cut = true;
    list.push(g);
    if (mirror) list.push(mirrorX(g));
    return this;
  }
  glassPart(geo, { m = null, mirror = false } = {}) {
    const g = prep(geo, m, null);
    this.glass.push(g); if (mirror) this.glass.push(mirrorX(g));
    return this;
  }
  /**
   * Luz pontual (navegação, estrobo, janela). color linear [r,g,b], potência
   * HDR, tamanho (m), blink: 0 = fixa, >0 = Hz (estrobo), <0 = pulso lento.
   */
  light(pos, color, power = 20, size = 0.1, blink = 0, { mirror = false, mirrorColor = null, shape = 'sphere' } = {}) {
    const g = shape === 'box' ? box(size[0] ?? size, size[1] ?? size, size[2] ?? size) : sphere(size, 8, 6);
    const mk = (p, c) => {
      const gg = prep(g, M(p.x, p.y, p.z), null);
      const n = gg.attributes.position.count;
      const col = new Float32Array(n * 4);
      const ph = Math.random();
      for (let i = 0; i < n; i++) { col[i * 4] = c[0] * power; col[i * 4 + 1] = c[1] * power; col[i * 4 + 2] = c[2] * power; col[i * 4 + 3] = blink === 0 ? 0 : blink > 0 ? blink + ph * 0.001 : blink; }
      gg.setAttribute('aLight', new THREE.BufferAttribute(col, 4));
      this.lights.push(gg);
    };
    const p = pos.isVector3 ? pos : new THREE.Vector3(...pos);
    mk(p, color);
    if (mirror) mk(new THREE.Vector3(-p.x, p.y, p.z), mirrorColor || color);
    return this;
  }
  /** Superfície luminosa arbitrária (janelas, faixas): geometria + cor HDR. */
  glowPart(geo, color, power = 6, { m = null, mirror = false, blink = 0 } = {}) {
    const mk = (gg) => {
      const n = gg.attributes.position.count;
      const col = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { col[i * 4] = color[0] * power; col[i * 4 + 1] = color[1] * power; col[i * 4 + 2] = color[2] * power; col[i * 4 + 3] = blink; }
      gg.setAttribute('aLight', new THREE.BufferAttribute(col, 4));
      this.lights.push(gg);
    };
    const g = prep(geo, m, null);
    mk(g); if (mirror) mk(mirrorX(g));
    return this;
  }
  static merge(list) {
    if (!list.length) return null;
    const g = mergeGeometries(list, false);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/**
 * Remove triângulos cujo centróide cai dentro da caixa (abre o casco para o
 * interior do cockpit). box = {min: Vector3, max: Vector3}.
 */
export function cutBox(geo, box) {
  const p = geo.attributes.position, n = p.count;
  const keep = [];
  for (let i = 0; i < n; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const inside = cx > box.min.x && cx < box.max.x && cy > box.min.y && cy < box.max.y && cz > box.min.z && cz < box.max.z;
    if (!inside) keep.push(i);
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name], k = a.itemSize;
    const arr = new Float32Array(keep.length * 3 * k);
    keep.forEach((i, j) => { for (let v = 0; v < 3; v++) for (let c = 0; c < k; c++) arr[(j * 3 + v) * k + c] = a.array[(i + v) * k + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, k));
  }
  out.userData = { ...geo.userData };
  return out;
}

export { mergeGeometries };
