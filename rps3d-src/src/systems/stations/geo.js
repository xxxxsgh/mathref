// Kit de geometria procedural das estruturas.
//
// Tudo é montado em "camadas" (uma por material) e fundido num único
// BufferGeometry por camada — poucas chamadas de desenho mesmo com milhares
// de peças. Cada vértice carrega:
//   uv        coordenadas EM METROS na superfície da peça (painéis, janelas)
//   aInfo     vec3(zona do material, semente da peça, extra)
// As zonas escolhem o acabamento dentro do mesmo programa de material
// (ver materials.js → ZONE).
//
// Transformações empilháveis (push/pop) permitem montar módulos no próprio
// espaço e depois posicioná-los.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Gerador determinístico pequeno (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

/** Garante índice (mergeGeometries exige todos indexados ou nenhum). */
function ensureIndexed(g) {
  if (g.index) return g;
  const n = g.attributes.position.count;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** UV em metros por projeção na face dominante (caixas, placas, peças retas). */
export function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i) * Math.sign(n.getX(i) || 1); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i) * Math.sign(n.getY(i) || 1); }
    else { u = -p.getX(i) * Math.sign(n.getZ(i) || 1); v = p.getY(i); }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** UV em metros para superfícies de revolução em torno de Y: (ângulo·r, y). */
export function cylUV(g, r) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (Math.abs(n.getY(i)) > 0.9) { uv[i * 2] = x; uv[i * 2 + 1] = z; continue; } // tampas
    const a = Math.atan2(x, z);
    uv[i * 2] = a * (r || Math.hypot(x, z)); uv[i * 2 + 1] = y;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function stamp(g, zone, seed, extra) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = zone; a[i * 3 + 1] = seed; a[i * 3 + 2] = extra; }
  g.setAttribute('aInfo', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'aInfo') g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

/** Matriz a partir de {pos, rot:[x,y,z] (rad) | quat, scale}. */
export function mat(pos = null, rot = null, scale = null) {
  const m = new THREE.Matrix4();
  if (rot && rot.isQuaternion) _q.copy(rot);
  else if (rot) _q.setFromEuler(_e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  else _q.identity();
  if (typeof scale === 'number') _s.setScalar(scale); else if (scale) _s.copy(scale); else _s.set(1, 1, 1);
  return m.compose(pos || V3(), _q, _s);
}

export class Kit {
  constructor(seed = 1) {
    this.layers = new Map();
    this.stack = [new THREE.Matrix4()];
    this.r = rng(seed);
    this.lights = [];   // {pos, color:[r,g,b] HDR, size, blink}
    this.tris = 0;
  }
  get top() { return this.stack[this.stack.length - 1]; }
  /** Empilha uma transformação (aplicada a tudo que for adicionado até pop). */
  push(m) { this.stack.push(this.top.clone().multiply(m)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** Adiciona uma geometria pronta (já com UV em metros) na camada. */
  add(layer, g, m = null, zone = 0, seed = null, extra = 0) {
    g = ensureIndexed(g);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) boxUV(g);
    stamp(g, zone, seed ?? this.r(), extra);
    _m.copy(this.top);
    if (m) _m.multiply(m);
    g.applyMatrix4(_m);
    if (!this.layers.has(layer)) this.layers.set(layer, []);
    this.layers.get(layer).push(g);
    this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    return g;
  }
  /** Caixa w×h×d centrada em pos. */
  box(layer, w, h, d, pos, rot = null, zone = 0, seed = null, extra = 0) {
    const g = boxUV(new THREE.BoxGeometry(w, h, d));
    return this.add(layer, g, mat(pos, rot), zone, seed, extra);
  }
  /** Caixa com subdivisão (para luz assada por vértice nos interiores). */
  boxSeg(layer, w, h, d, pos, seg = 1, rot = null, zone = 0, seed = null, extra = 0) {
    const sx = Math.max(1, Math.ceil(w / seg)), sy = Math.max(1, Math.ceil(h / seg)), sz = Math.max(1, Math.ceil(d / seg));
    const g = boxUV(new THREE.BoxGeometry(w, h, d, sx, sy, sz));
    return this.add(layer, g, mat(pos, rot), zone, seed, extra);
  }
  /** Cilindro em Y (raios topo/base). */
  cyl(layer, rt, rb, h, pos, rot = null, zone = 0, seg = 24, seed = null, open = false, extra = 0, hseg = 1) {
    const g = cylUV(new THREE.CylinderGeometry(rt, rb, h, seg, hseg, open), Math.max(rt, rb));
    return this.add(layer, g, mat(pos, rot), zone, seed, extra);
  }
  /** Cilindro deitado no eixo X / Z. */
  cylX(layer, r, len, pos, zone = 0, seg = 20, seed = null) { return this.cyl(layer, r, r, len, pos, [0, 0, Math.PI / 2], zone, seg, seed); }
  cylZ(layer, r, len, pos, zone = 0, seg = 20, seed = null) { return this.cyl(layer, r, r, len, pos, [Math.PI / 2, 0, 0], zone, seg, seed); }
  sphere(layer, r, pos, zone = 0, ws = 24, hs = 16, seed = null, phiLen = Math.PI * 2, thetaLen = Math.PI) {
    const g = cylUV(new THREE.SphereGeometry(r, ws, hs, 0, phiLen, 0, thetaLen), r);
    return this.add(layer, g, mat(pos), zone, seed);
  }
  /** Superfície de revolução em Y a partir de um perfil [[r, y], ...]. */
  lathe(layer, prof, pos, zone = 0, seg = 48, seed = null, rot = null, phiStart = 0, phiLen = Math.PI * 2) {
    const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
    const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLen);
    g.computeVertexNormals();
    cylUV(g, Math.max(...prof.map((p) => p[0])));
    return this.add(layer, g, mat(pos, rot), zone, seed);
  }
  /** Toro (anel de tubo) em torno de Y. */
  torus(layer, R, r, pos, zone = 0, rs = 64, ts = 12, seed = null, rot = null, arc = Math.PI * 2) {
    const g = new THREE.TorusGeometry(R, r, ts, rs, arc);
    g.rotateX(Math.PI / 2);
    cylUV(g, R);
    return this.add(layer, g, mat(pos, rot), zone, seed);
  }
  /**
   * Anel poligonal de seção retangular em torno de Y (cascos de anel,
   * passarelas circulares). R = raio médio, w = espessura radial, h = altura.
   * faces: {outer, inner, top, bottom} → zona de cada face (null = sem face).
   */
  ring(layer, R, w, h, y, seg, faces = { outer: 0, inner: 0, top: 0, bottom: 0 }, seed = null, arc0 = 0, arc = Math.PI * 2) {
    const pos = [], nrm = [], uvs = [], info = [], idx = [];
    const ri = R - w / 2, ro = R + w / 2, y0 = y - h / 2, y1 = y + h / 2;
    const sd = seed ?? this.r();
    const quad = (a, b, c, d, n, uA, uB, vA, vB, zone) => {
      const base = pos.length / 3;
      for (const [p, u, v] of [[a, uA, vA], [b, uB, vA], [c, uB, vB], [d, uA, vB]]) {
        pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uvs.push(u, v); info.push(zone, sd, 0);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let i = 0; i < seg; i++) {
      const a0 = arc0 + (i / seg) * arc, a1 = arc0 + ((i + 1) / seg) * arc, am = (a0 + a1) / 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n = V3(Math.sin(am), 0, Math.cos(am));
      const P = (r, a, yy) => V3(Math.sin(a) * r, yy, Math.cos(a) * r);
      const L = (2 * Math.PI * R) / seg * (arc / (2 * Math.PI));
      const u0 = i * L, u1 = (i + 1) * L;
      void c0; void s0; void c1; void s1;
      if (faces.outer != null) quad(P(ro, a0, y0), P(ro, a1, y0), P(ro, a1, y1), P(ro, a0, y1), n, u0 * ro / R, u1 * ro / R, y0, y1, faces.outer);
      if (faces.inner != null) quad(P(ri, a1, y0), P(ri, a0, y0), P(ri, a0, y1), P(ri, a1, y1), n.clone().negate(), u1 * ri / R, u0 * ri / R, y0, y1, faces.inner);
      if (faces.top != null) quad(P(ri, a0, y1), P(ro, a0, y1), P(ro, a1, y1), P(ri, a1, y1), V3(0, 1, 0), ri, ro, u0, u1, faces.top);
      if (faces.bottom != null) quad(P(ro, a0, y0), P(ri, a0, y0), P(ri, a1, y0), P(ro, a1, y0), V3(0, -1, 0), ro, ri, u0, u1, faces.bottom);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
    g.setIndex(idx);
    g.applyMatrix4(this.top);
    if (!this.layers.has(layer)) this.layers.set(layer, []);
    this.layers.get(layer).push(g);
    this.tris += idx.length / 3;
    return g;
  }
  /** Viga entre dois pontos (seção quadrada s). */
  beam(layer, a, b, s, zone = 2, seed = null) {
    const d = b.clone().sub(a), len = d.length();
    if (len < 1e-3) return null;
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.divideScalar(len));
    const g = boxUV(new THREE.BoxGeometry(s, len, s));
    return this.add(layer, g, mat(a.clone().add(b).multiplyScalar(0.5), q), zone, seed);
  }
  /** Tubo cilíndrico entre dois pontos. */
  pipe(layer, a, b, r, zone = 3, seg = 10, seed = null) {
    const d = b.clone().sub(a), len = d.length();
    if (len < 1e-3) return null;
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.divideScalar(len));
    const g = cylUV(new THREE.CylinderGeometry(r, r, len, seg, 1, true), r);
    return this.add(layer, g, mat(a.clone().add(b).multiplyScalar(0.5), q), zone, seed);
  }
  /**
   * Treliça entre a e b: 4 longarinas + travessas em X a cada `step`.
   * w = largura da seção; s = bitola das barras.
   */
  truss(layer, a, b, w, s, step = null, zone = 2, seed = null) {
    const d = b.clone().sub(a), len = d.length();
    const f = d.clone().normalize();
    const ref = Math.abs(f.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0);
    const r = V3().crossVectors(f, ref).normalize(), u = V3().crossVectors(r, f).normalize();
    const h = w / 2;
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, y]) => r.clone().multiplyScalar(x * h).addScaledVector(u, y * h));
    for (const c of corners) this.beam(layer, a.clone().add(c), b.clone().add(c), s, zone, seed);
    const n = Math.max(1, Math.round(len / (step || w)));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().addScaledVector(f, (i / n) * len);
      for (let k = 0; k < 4; k++) this.beam(layer, p.clone().add(corners[k]), p.clone().add(corners[(k + 1) % 4]), s * 0.7, zone, seed);
      if (i < n) {
        const p2 = a.clone().addScaledVector(f, ((i + 1) / n) * len);
        for (let k = 0; k < 4; k++) this.beam(layer, p.clone().add(corners[k]), p2.clone().add(corners[(k + 1) % 4]), s * 0.55, zone, seed);
      }
    }
  }
  /** Luz pontual decorativa (navegação, faróis, janelas de destaque). blink: 0 fixa, >0 estrobo (Hz), <0 pulso lento (Hz). */
  light(pos, color, size = 1, blink = 0, phase = null) {
    const p = pos.clone().applyMatrix4(this.top);
    this.lights.push({ pos: p, color, size, blink, phase: phase ?? this.r() });
  }
  /** Funde a camada num único BufferGeometry (ou null). */
  merge(layer) {
    const list = this.layers.get(layer);
    if (!list || !list.length) return null;
    const g = mergeGeometries(list, false);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  layerNames() { return [...this.layers.keys()]; }
}

/**
 * Geometria de pontos de luz: um octaedro por luz que cresce com a distância
 * (tamanho mínimo em tela feito no shader). Atributos: aCenter (centro),
 * aLight (rgb HDR + blink), aSize (raio base, fase).
 */
export function lightsGeometry(lights) {
  if (!lights.length) return null;
  const base = new THREE.OctahedronGeometry(1, 1);
  const bp = base.attributes.position, bn = base.attributes.normal;
  const bi = base.index ? base.index.array : null;
  const nv = bp.count, ni = bi ? bi.length : nv;
  const N = lights.length;
  const pos = new Float32Array(N * nv * 3), nrm = new Float32Array(N * nv * 3), cen = new Float32Array(N * nv * 3);
  const col = new Float32Array(N * nv * 4), sz = new Float32Array(N * nv * 2);
  const idx = new Uint32Array(N * ni);
  lights.forEach((L, k) => {
    for (let i = 0; i < nv; i++) {
      const o = (k * nv + i);
      pos[o * 3] = L.pos.x + bp.getX(i) * L.size; pos[o * 3 + 1] = L.pos.y + bp.getY(i) * L.size; pos[o * 3 + 2] = L.pos.z + bp.getZ(i) * L.size;
      nrm[o * 3] = bn.getX(i); nrm[o * 3 + 1] = bn.getY(i); nrm[o * 3 + 2] = bn.getZ(i);
      cen[o * 3] = L.pos.x; cen[o * 3 + 1] = L.pos.y; cen[o * 3 + 2] = L.pos.z;
      col[o * 4] = L.color[0]; col[o * 4 + 1] = L.color[1]; col[o * 4 + 2] = L.color[2]; col[o * 4 + 3] = L.blink;
      sz[o * 2] = L.size; sz[o * 2 + 1] = L.phase;
    }
    for (let i = 0; i < ni; i++) idx[k * ni + i] = k * nv + (bi ? bi[i] : i);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3));
  g.setAttribute('aLight', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
