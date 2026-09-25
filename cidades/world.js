// Geometria do planetinha: kit de peças cel-shaded, construtores dos marcos,
// grade procedural da cidade, trem, veículos, gente e pipas.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const R = 80;          // raio do planeta
export const D = Math.PI / 180;
export const INK = 0x231a26;
const OUT = 0.055;            // espessura do contorno

// ─── coordenadas ────────────────────────────────────────────────────────────
// up    = normal da superfície
// east  = direção de +lon
// south = east × up  (o +Z local dos objetos aponta para o sul)
export function upAt(lat, lon, out = new THREE.Vector3()) {
  const a = lat * D, b = lon * D;
  return out.set(Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b));
}
export function eastAt(lon, out = new THREE.Vector3()) {
  const b = lon * D;
  return out.set(-Math.sin(b), 0, -Math.cos(b));
}
export function latLonOf(v) {
  const l = v.length();
  return { lat: Math.asin(THREE.MathUtils.clamp(v.y / l, -1, 1)) / D, lon: Math.atan2(-v.z, v.x) / D };
}
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3(), _fr = new THREE.Matrix4();
export function frameAt(lat, lon, heading = 0, h = 0, out = new THREE.Matrix4()) {
  const up = upAt(lat, lon, _fa), east = eastAt(lon, _fb), south = _fc.crossVectors(east, up);
  out.makeBasis(east, up, south);
  if (heading) out.multiply(_fr.makeRotationY(heading));
  out.setPosition(up.x * (R + h), up.y * (R + h), up.z * (R + h));
  return out;
}
// ângulo (graus) entre dois pontos lat/lon
export function angDeg(lat1, lon1, lat2, lon2) {
  const a = upAt(lat1, lon1, _fa), b = upAt(lat2, lon2, _fb);
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) / D;
}
function wrap(lon) { return ((lon % 360) + 540) % 360 - 180; }

// ─── materiais ──────────────────────────────────────────────────────────────
export const toonGrad = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 165, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
export const toonMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad });
export const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
export const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ─── kit ────────────────────────────────────────────────────────────────────
// Acumula peças (já transformadas) em três listas e as funde em poucas malhas:
// sólido (toon), contorno (casco invertido) e brilho (janelas, lâmpadas).
const _M = new THREE.Matrix4(), _L = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _Y = new THREE.Vector3(0, 1, 0), _col = new THREE.Color();

function paint(geo, color) {
  _col.set(color);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _col.r; a[i * 3 + 1] = _col.g; a[i * 3 + 2] = _col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
}
function L(x, y, z, ry = 0, rx = 0, rz = 0) {
  return _L.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _one);
}

export class Kit {
  constructor() { this.solid = []; this.line = []; this.glow = []; this.base = new THREE.Matrix4(); this.stack = []; }
  at(lat, lon, heading = 0, h = 0) { frameAt(lat, lon, heading, h, this.base); return this; }
  reset() { this.base.identity(); return this; }
  // empilha uma transformação local (para sub-conjuntos girados)
  push(x, y, z, ry = 0) { this.stack.push(this.base.clone()); this.base.multiply(L(x, y, z, ry)); return this; }
  pop() { this.base.copy(this.stack.pop()); return this; }

  add(geo, color, local, o = {}) {
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (!geo.index) geo = mergeVertices(geo);
    const M = _M.multiplyMatrices(this.base, local);
    if (o.glow) { paint(geo, color); geo.applyMatrix4(M); this.glow.push(geo); return this; }
    if (o.outline !== false) {
      geo.computeBoundingBox();
      geo.boundingBox.getSize(_s); geo.boundingBox.getCenter(_c);
      const t = o.t ?? OUT, f = (v) => (v > 0.001 ? (v + 2 * t) / v : 1);
      const g = geo.clone().translate(-_c.x, -_c.y, -_c.z).scale(f(_s.x), f(_s.y), f(_s.z)).translate(_c.x, _c.y, _c.z);
      g.applyMatrix4(M);
      this.line.push(g);
    }
    paint(geo, color); geo.applyMatrix4(M); this.solid.push(geo);
    return this;
  }
  // geometria já em coordenadas de mundo (manchas no chão, faixas)
  raw(geo, color) {
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (!geo.index) geo = mergeVertices(geo);
    paint(geo, color); this.solid.push(geo); return this;
  }
  box(c, w, h, d, x = 0, y = 0, z = 0, ry = 0, o) { return this.add(new THREE.BoxGeometry(w, h, d), c, L(x, y + h / 2, z, ry), o); }
  cyl(c, rt, rb, h, x = 0, y = 0, z = 0, seg = 10, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), c, L(x, y + h / 2, z), o); }
  cone(c, r, h, x = 0, y = 0, z = 0, seg = 10, o) { return this.cyl(c, 0.001, r, h, x, y, z, seg, o); }
  ball(c, r, x = 0, y = 0, z = 0, o) { return this.add(new THREE.SphereGeometry(r, 12, 8), c, L(x, y, z), o); }
  dome(c, r, x = 0, y = 0, z = 0, o) { return this.add(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, L(x, y, z), o); }
  onion(c, r, h, x = 0, y = 0, z = 0, o) {
    const pts = [[r * 0.8, 0], [r, h * 0.22], [r * 0.96, h * 0.42], [r * 0.62, h * 0.66], [r * 0.24, h * 0.84], [r * 0.08, h * 0.95], [0.001, h]]
      .map(([a, b]) => new THREE.Vector2(a, b));
    return this.add(new THREE.LatheGeometry(pts, 12), c, L(x, y, z), o);
  }
  torus(c, r, tube, x = 0, y = 0, z = 0, o) { return this.add(new THREE.TorusGeometry(r, tube, 6, 16), c, L(x, y, z, 0, Math.PI / 2), o); }
  // viga de a até b (vetores locais), seção tx × tz
  beam(c, a, b, tx = 0.2, tz = tx, o) {
    const dir = _c.subVectors(b, a); const len = dir.length(); dir.divideScalar(len);
    _q.setFromUnitVectors(_Y, dir);
    const m = _L.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _one);
    return this.add(new THREE.BoxGeometry(tx, len, tz), c, m, o);
  }
  // prisma: polígono 2D (plano XY) extrudado em Z, centrado
  prism(c, pts, depth, x = 0, y = 0, z = 0, ry = 0, o) {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.add(g, c, L(x, y, z, ry), o);
  }
  window(c, w, h, x, y, z, ry = 0) { return this.box(c, w, h, 0.08, x, y, z, ry, { glow: true }); }

  build() {
    const g = new THREE.Group();
    if (this.solid.length) g.add(new THREE.Mesh(mergeGeometries(this.solid), toonMat));
    if (this.line.length) g.add(new THREE.Mesh(mergeGeometries(this.line), inkMat));
    if (this.glow.length) g.add(new THREE.Mesh(mergeGeometries(this.glow), glowMat));
    this.solid = []; this.line = []; this.glow = [];
    return g;
  }
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ─── geometria de chão ──────────────────────────────────────────────────────
function pathMeridian(lon, lat0, lat1, step = 1) {
  const pts = []; for (let a = lat0; a <= lat1 + 1e-6; a += step) pts.push(upAt(a, lon)); return pts;
}
function pathParallel(lat, lon0, lon1, step = 1) {
  const pts = []; for (let b = lon0; b <= lon1 + 1e-6; b += step) pts.push(upAt(lat, b)); return pts;
}
function ribbonGeo(pts, hw, h, off = 0) {
  const n = pts.length, pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), idx = [];
  const t = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    t.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
    s.crossVectors(p, t).normalize();
    for (let k = 0; k < 2; k++) {
      const w = (k ? hw : -hw) + off;
      const j = (i * 2 + k) * 3;
      pos[j] = p.x * (R + h) + s.x * w; pos[j + 1] = p.y * (R + h) + s.y * w; pos[j + 2] = p.z * (R + h) + s.z * w;
      nor[j] = p.x; nor[j + 1] = p.y; nor[j + 2] = p.z;
    }
    if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
function capGeo(lat, lon, radDeg, h) {
  const g = new THREE.SphereGeometry(R + h, 48, 8, 0, Math.PI * 2, 0, radDeg * D);
  const up = upAt(lat, lon), east = eastAt(lon), south = new THREE.Vector3().crossVectors(east, up);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(east, up, south));
  return g;
}

// ─── placas de estação (amarelas, como as da Indian Railways) ───────────────
function signTexture(native, latin, lang) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#f5c518'; x.fillRect(0, 0, 512, 192);
  x.strokeStyle = '#231a26'; x.lineWidth = 10; x.strokeRect(5, 5, 502, 182);
  x.fillStyle = '#231a26'; x.textAlign = 'center';
  const fam = lang === 'bn' ? '"Noto Serif Bengali"' : '"Tiro Devanagari Hindi"';
  x.font = `700 70px ${fam}, serif`; x.fillText(native, 256, 92, 470);
  x.font = '700 44px "Mukta", sans-serif'; x.fillText(latin.toUpperCase(), 256, 160, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ─── peças recorrentes ──────────────────────────────────────────────────────
function chhatri(k, c, dome, s, x, y, z) {
  const p = 0.9 * s;
  k.box(c, 1.4 * s, 0.18 * s, 1.4 * s, x, y, z);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(c, 0.16 * s, p, 0.16 * s, x + a * 0.55 * s, y + 0.18 * s, z + b * 0.55 * s);
  k.box(c, 1.5 * s, 0.14 * s, 1.5 * s, x, y + 0.18 * s + p, z);
  k.onion(dome, 0.6 * s, 0.95 * s, x, y + 0.32 * s + p, z);
}
function tree(k, rng, x, z, big = 1) {
  const s = big * (0.8 + rng() * 0.5);
  k.cyl(0x6b4a33, 0.16 * s, 0.24 * s, 2.0 * s, x, 0, z, 7);
  const greens = [0x5f8f4a, 0x4f7d3e, 0x6f9a52, 0x46703a];
  k.ball(pick(rng, greens), 1.2 * s, x, 2.6 * s, z);
  k.ball(pick(rng, greens), 0.9 * s, x + 0.7 * s, 2.3 * s, z + 0.3 * s);
  k.ball(pick(rng, greens), 0.85 * s, x - 0.6 * s, 2.4 * s, z - 0.4 * s);
}
function lamp(k, x, z, ry = 0) {
  k.cyl(0x3a3a40, 0.06, 0.08, 3.4, x, 0, z, 6, { t: 0.03 });
  k.push(x, 0, z, ry);
  k.box(0x3a3a40, 0.08, 0.08, 0.8, 0, 3.35, 0.35, 0, { t: 0.03 });
  k.box(0xffe2a0, 0.3, 0.2, 0.3, 0, 3.12, 0.7, 0, { glow: true });
  k.pop();
}
function stall(k, rng, x, z, ry, kind) {
  const awn = pick(rng, [0xe84a3c, 0xf2b01e, 0x2f8fce, 0x3aa35c, 0xd6388a, 0xf08a24]);
  k.push(x, 0, z, ry);
  k.box(0x7a5234, 2.4, 0.9, 1.2, 0, 0, 0);
  for (const a of [-1.1, 1.1]) for (const b of [-0.55, 0.55]) k.box(0x5a3b25, 0.1, 2.2, 0.1, a, 0, b, 0, { t: 0.03 });
  k.add(new THREE.BoxGeometry(2.8, 0.1, 1.9), awn, L(0, 2.25, 0.15, 0, 0.22));
  const goods = kind === 'books' ? [0xa33b2c, 0x2f5d9e, 0xe0c060, 0x3a7a4a, 0xf0e8d8]
    : kind === 'food' ? [0xd9a441, 0xe8c07a, 0xc26b2c] : [0xd7263d, 0xf4d35e, 0x1b998b, 0xc5d86d, 0x7b2cbf];
  for (let i = 0; i < 6; i++) k.box(pick(rng, goods), 0.3, kind === 'books' ? 0.12 : 0.25, 0.4, -0.9 + i * 0.36, 0.9, -0.1, 0, { outline: false });
  k.pop();
}

// ─── casas procedurais ──────────────────────────────────────────────────────
function jaipurHouse(k, rng, w, d, h) {
  const pink = pick(rng, [0xe2957f, 0xd98672, 0xe8a384, 0xdc8b6f, 0xe39a86]);
  const trim = 0xf6e7d0, dark = 0xb5654f;
  k.box(dark, w + 0.2, 0.9, d + 0.2, 0, -0.5, 0);
  k.box(pink, w, h, d, 0, 0, 0);
  k.box(trim, w + 0.25, 0.16, d + 0.25, 0, h, 0);
  // parapeito
  k.box(pink, w, 0.5, 0.16, 0, h + 0.16, d / 2 - 0.08, 0, { t: 0.03 });
  k.box(pink, w, 0.5, 0.16, 0, h + 0.16, -d / 2 + 0.08, 0, { t: 0.03 });
  k.box(pink, 0.16, 0.5, d, w / 2 - 0.08, h + 0.16, 0, 0, { t: 0.03 });
  k.box(pink, 0.16, 0.5, d, -w / 2 + 0.08, h + 0.16, 0, 0, { t: 0.03 });
  const floors = Math.max(1, Math.floor(h / 2.3)), cols = Math.max(1, Math.floor(w / 1.7));
  for (let f = 0; f < floors; f++) {
    const y = 0.7 + f * 2.3;
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + (i + 0.5) * (w / cols);
      for (const s of [1, -1]) {
        const lit = rng() < 0.55 ? 0xffc86a : 0x2e2a3a;
        k.box(trim, 0.86, 1.34, 0.06, x, y - 0.08, s * (d / 2 + 0.02), 0, { outline: false });
        k.window(lit, 0.62, 1.1, x, y, s * (d / 2 + 0.05));
      }
    }
  }
  // jharokha (varanda coberta) na frente
  if (h > 4 && rng() < 0.7) {
    const y = h - 2.0;
    k.box(pink, 1.3, 1.1, 0.7, 0, y, d / 2 + 0.35);
    k.box(trim, 1.5, 0.12, 0.9, 0, y - 0.12, d / 2 + 0.4);
    k.onion(trim, 0.55, 0.7, 0, y + 1.1, d / 2 + 0.35);
    k.window(0xffc86a, 0.7, 0.6, 0, y + 0.3, d / 2 + 0.72);
  }
  if (rng() < 0.45) chhatri(k, trim, trim, 0.6 + rng() * 0.3, (rng() - 0.5) * (w - 1.6), h + 0.1, (rng() - 0.5) * (d - 1.6));
  return Math.hypot(w, d) * 0.4;
}

function kolkataHouse(k, rng, w, d, h) {
  const wall = pick(rng, [0xe9d9a8, 0xd8b56a, 0xb9cfa8, 0xe0a88e, 0xa84a3a, 0xd2c9b8, 0xe7c9a0]);
  const green = 0x2f6b4a, trim = 0xf3eee0;
  k.box(0x8a8278, w + 0.1, 0.8, d + 0.1, 0, -0.5, 0);
  k.box(wall, w, h, d, 0, 0, 0);
  k.box(trim, w + 0.2, 0.18, d + 0.2, 0, h, 0);
  // loja no térreo, com letreiro
  k.box(0x6d6a70, w * 0.7, 1.6, 0.08, 0, 0.1, d / 2 + 0.03, 0, { outline: false });
  k.box(pick(rng, [0xd7263d, 0x2f5d9e, 0xf4d35e, 0x1b998b, 0xffffff]), w * 0.8, 0.45, 0.12, 0, 1.85, d / 2 + 0.06);
  const floors = Math.max(1, Math.floor((h - 2.3) / 2.3)), cols = Math.max(1, Math.floor(w / 1.6));
  for (let f = 0; f < floors; f++) {
    const y = 2.8 + f * 2.3;
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + (i + 0.5) * (w / cols);
      for (const s of [1, -1]) {
        const lit = rng() < 0.5 ? 0xffd27a : 0x2a2b33;
        k.window(lit, 0.5, 1.1, x, y, s * (d / 2 + 0.03));
        k.box(green, 0.26, 1.2, 0.06, x - 0.4, y - 0.05, s * (d / 2 + 0.05), 0, { outline: false });
        k.box(green, 0.26, 1.2, 0.06, x + 0.4, y - 0.05, s * (d / 2 + 0.05), 0, { outline: false });
      }
    }
    // varanda com grade
    if (rng() < 0.6) {
      k.box(trim, w * 0.8, 0.12, 0.8, 0, y - 0.25, d / 2 + 0.4);
      k.box(0x2a2b33, w * 0.8, 0.6, 0.05, 0, y - 0.13, d / 2 + 0.78, 0, { outline: false });
    }
  }
  // caixa d'água preta no telhado
  if (rng() < 0.7) k.cyl(0x26262b, 0.5, 0.5, 1.0, (rng() - 0.5) * (w - 1.2), h + 0.18, (rng() - 0.5) * (d - 1.2), 10);
  if (rng() < 0.3) k.box(trim, w * 0.3, 1.4, d * 0.3, w * 0.25, h, -d * 0.2);
  return Math.hypot(w, d) * 0.4;
}

// ─── gente e bichos ─────────────────────────────────────────────────────────
const SKIN = [0x8d5a3b, 0xa86d4a, 0x6e4430, 0xb97f5a, 0x7a4b30];
const CLOTH = [0xd7263d, 0xf4a300, 0x1b998b, 0x7b2cbf, 0xe56399, 0x2f5d9e, 0xf08a24, 0x3aa35c, 0xffffff, 0xe7d8b8];
export function personKit(rng, city) {
  const k = new Kit();
  const skin = pick(rng, SKIN), female = rng() < 0.45;
  if (female) {
    const sari = pick(rng, CLOTH);
    k.cyl(sari, 0.24, 0.4, 1.0, 0, 0, 0, 10);
    k.cyl(pick(rng, CLOTH), 0.2, 0.24, 0.45, 0, 1.0, 0, 10);
    k.box(sari, 0.12, 0.8, 0.5, 0.12, 0.95, 0.05, 0, { t: 0.03 });
    k.ball(skin, 0.17, 0, 1.62, 0);
    k.ball(0x1c1418, 0.17, 0, 1.66, -0.04, { t: 0.02 });
    k.ball(0x1c1418, 0.1, 0, 1.64, -0.2, { t: 0.02 });
  } else {
    const kurta = pick(rng, CLOTH);
    k.box(0xf1ead8, 0.14, 0.75, 0.16, -0.1, 0, 0, 0, { t: 0.03 });
    k.box(0xf1ead8, 0.14, 0.75, 0.16, 0.1, 0, 0, 0, { t: 0.03 });
    k.cyl(kurta, 0.24, 0.3, 0.8, 0, 0.7, 0, 10);
    k.ball(skin, 0.17, 0, 1.64, 0);
    if (city === 'jaipur' && rng() < 0.7) {
      const pagri = pick(rng, [0xf4a300, 0xd7263d, 0xe56399, 0xf08a24]);
      k.cyl(pagri, 0.21, 0.19, 0.2, 0, 1.68, 0, 10);
      k.ball(pagri, 0.14, 0.05, 1.86, 0.02, { t: 0.03 });
      k.box(pagri, 0.1, 0.5, 0.05, 0, 1.3, -0.2, 0, { t: 0.02 });
    } else {
      k.ball(0x1c1418, 0.175, 0, 1.69, -0.03, { t: 0.02 });
    }
    if (rng() < 0.3) k.box(0xeeeeee, 0.3, 0.08, 0.04, 0, 1.66, 0.16, 0, { outline: false });
  }
  k.cyl(skin, 0.05, 0.06, 0.6, -0.3, 0.8, 0, 6, { t: 0.02 });
  k.cyl(skin, 0.05, 0.06, 0.6, 0.3, 0.8, 0, 6, { t: 0.02 });
  return k;
}
function camelKit() {
  const k = new Kit(), c = 0xc49a62;
  for (const [x, z] of [[-0.6, -0.25], [-0.6, 0.25], [0.6, -0.25], [0.6, 0.25]]) k.box(c, 0.16, 1.5, 0.16, x, 0, z, 0, { t: 0.03 });
  k.box(c, 1.8, 0.8, 0.7, 0, 1.4, 0);
  k.ball(c, 0.5, -0.1, 2.25, 0);
  k.box(0xd7263d, 1.0, 0.1, 0.9, -0.1, 2.15, 0);
  k.beam(c, V(0.8, 1.9, 0), V(1.35, 2.7, 0), 0.26);
  k.box(c, 0.6, 0.3, 0.3, 1.5, 2.6, 0);
  return k;
}
function cowKit() {
  const k = new Kit(), c = 0xefe9dc;
  for (const [x, z] of [[-0.5, -0.2], [-0.5, 0.2], [0.5, -0.2], [0.5, 0.2]]) k.box(c, 0.14, 0.7, 0.14, x, 0, z, 0, { t: 0.03 });
  k.box(c, 1.4, 0.65, 0.6, 0, 0.65, 0);
  k.box(c, 0.45, 0.4, 0.36, 0.85, 0.95, 0);
  k.box(0x3a2e2a, 0.18, 0.12, 0.3, 1.08, 0.95, 0, 0, { t: 0.02 });
  k.cone(0xf08a24, 0.05, 0.3, 0.8, 1.15, 0.15, 6, { t: 0.02 });
  k.cone(0x2f5d9e, 0.05, 0.3, 0.8, 1.15, -0.15, 6, { t: 0.02 });
  return k;
}
function taxiKit() {
  const k = new Kit(), y = 0xf2c12e;
  k.box(y, 3.4, 0.7, 1.5, 0, 0.35, 0);
  k.box(y, 1.9, 0.6, 1.4, -0.3, 1.05, 0);
  k.box(0x2e2a3a, 1.95, 0.4, 1.3, -0.3, 1.12, 0, 0, { outline: false });
  k.box(0x2e2a3a, 1.6, 0.4, 1.45, -0.3, 1.12, 0, 0, { outline: false });
  k.box(0xffffff, 0.5, 0.2, 0.3, -0.3, 1.65, 0, 0, { t: 0.03 });
  for (const [x, z] of [[-1.1, -0.75], [-1.1, 0.75], [1.1, -0.75], [1.1, 0.75]]) k.add(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 10), 0x1c1c20, L(x, 0.34, z, 0, Math.PI / 2));
  k.box(0xffe8a0, 0.06, 0.2, 0.3, 1.72, 0.55, 0.5, 0, { glow: true });
  k.box(0xffe8a0, 0.06, 0.2, 0.3, 1.72, 0.55, -0.5, 0, { glow: true });
  return k;
}
function autoKit() {
  const k = new Kit();
  k.box(0x2f7d3b, 2.2, 0.8, 1.3, 0, 0.3, 0);
  k.box(0xf2c230, 2.0, 0.12, 1.4, -0.1, 1.85, 0);
  k.box(0x2f7d3b, 0.1, 0.8, 1.2, 0.95, 1.05, 0);
  for (const x of [-0.9, -0.2]) k.box(0x1c1c20, 0.08, 0.75, 0.08, x, 1.1, 0.62, 0, { t: 0.02 });
  for (const x of [-0.9, -0.2]) k.box(0x1c1c20, 0.08, 0.75, 0.08, x, 1.1, -0.62, 0, { t: 0.02 });
  for (const [x, z] of [[-0.7, -0.65], [-0.7, 0.65], [0.9, 0]]) k.add(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 10), 0x1c1c20, L(x, 0.28, z, 0, Math.PI / 2));
  return k;
}

// ─── trem / bonde ───────────────────────────────────────────────────────────
function carKit(kind, loco) {
  const k = new Kit();
  if (kind === 'tram') {
    const cream = 0xeee2bf, blue = 0x2f5d9e;
    const len = 5.2;
    k.box(cream, len, 1.2, 1.9, 0, 0.35, 0);
    k.box(blue, len + 0.04, 0.3, 1.94, 0, 0.9, 0);
    k.box(cream, len, 1.1, 1.9, 0, 1.55, 0);
    k.box(0x6d6a70, len + 0.1, 0.16, 2.0, 0, 2.65, 0);
    for (let i = 0; i < 5; i++) for (const s of [1, -1]) k.window(0xffd98a, 0.75, 0.75, -2 + i, 1.8, s * 0.97);
    k.window(0xffd98a, 0.06, 0.75, len / 2 + 0.02, 1.8, 0);
    if (loco) { k.beam(0x1c1c20, V(1.4, 2.7, 0), V(-0.8, 4.55, 0), 0.07); k.box(0xd7263d, 0.5, 0.3, 0.06, 0, 2.2, 0.98, 0, { t: 0.02 }); }
    for (const x of [-1.6, 1.6]) k.box(0x2a2a2e, 1.0, 0.35, 1.5, x, 0.0, 0, 0, { outline: false });
    return { k, len };
  }
  const len = 4.8;
  if (loco) {
    k.box(0x5a1622, len, 1.5, 1.9, 0, 0.35, 0);
    k.cyl(0x5a1622, 0.75, 0.75, len * 0.6, 0.6, 1.1, 0, 12);
    k.box(0x3a0e16, 1.6, 1.4, 1.9, -1.6, 1.85, 0);
    k.box(0xd9a441, len + 0.05, 0.14, 1.95, 0, 1.2, 0);
    k.cyl(0x231a26, 0.22, 0.3, 0.8, 1.9, 1.8, 0, 8);
    k.window(0xffe8a0, 0.1, 0.4, len / 2 + 0.02, 1.3, 0);
  } else {
    k.box(0x7a1f2b, len, 2.1, 1.9, 0, 0.35, 0);
    k.box(0xd9a441, len + 0.04, 0.14, 1.94, 0, 0.8, 0);
    k.box(0xd9a441, len + 0.04, 0.1, 1.94, 0, 2.2, 0);
    k.box(0xeee2bf, len + 0.1, 0.22, 2.0, 0, 2.45, 0);
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) k.window(0xffd98a, 0.7, 0.8, -1.65 + i * 1.1, 1.3, s * 0.97);
  }
  for (const x of [-1.5, 1.5]) k.box(0x2a2a2e, 1.1, 0.35, 1.5, x, 0.0, 0, 0, { outline: false });
  return { k, len };
}

function makeTrain(cfg) {
  const kind = cfg.trainKind, n = kind === 'tram' ? 2 : 6;
  const cars = []; let off = 0;
  for (let i = 0; i < n; i++) {
    const { k, len } = carKit(kind, i === 0);
    const g = k.build(); g.matrixAutoUpdate = false;
    if (i > 0) off += (cars[i - 1].len / 2 + 0.35 + len / 2) / R / D;
    cars.push({ group: g, len, off });
  }
  const total = off;
  const cruise = (kind === 'tram' ? 5.5 : 7.5) / R / D; // graus/s
  const dwell = 8;
  const st = cfg.stations.map((s) => s.lon).sort((a, b) => a - b);
  const legs = []; let T = 0;
  st.forEach((s, i) => {
    const next = i + 1 < st.length ? st[i + 1] : st[0] + 360;
    const dist = next - s, travel = (dist / cruise) * 1.3;
    legs.push({ t0: T, s, dist, travel, idx: i }); T += dwell + travel;
  });
  const state = { lon: 0, stopped: true, station: 0, speed: 0 };
  function update(t) {
    const tt = ((t % T) + T) % T;
    let leg = legs[legs.length - 1];
    for (const l of legs) if (tt >= l.t0) leg = l;
    const u = tt - leg.t0;
    const prev = state.lon;
    if (u < dwell) { state.lon = leg.s; state.stopped = true; state.station = leg.idx; }
    else {
      const f = (u - dwell) / leg.travel;
      state.lon = leg.s + leg.dist * (0.5 - 0.5 * Math.cos(Math.PI * f));
      state.stopped = false; state.station = -1;
    }
    state.speed = state.lon - prev;
    const head = state.lon + total / 2;
    for (const c of cars) { c.lon = head - c.off; frameAt(0, c.lon, 0, 0.2, c.group.matrix); }
    return state;
  }
  return { cars, update, state, stations: st, period: T };
}

// ─── pipas ──────────────────────────────────────────────────────────────────
function makeKites(scene, rng, lat0, lon0, spread, count) {
  const kites = [];
  const shape = new THREE.Shape([V(0, 0.9, 0), V(0.7, 0, 0), V(0, -0.9, 0), V(-0.7, 0, 0)].map((v) => new THREE.Vector2(v.x, v.y)));
  const geo = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < count; i++) {
    const lat = lat0 + (rng() - 0.5) * spread * 2, lon = lon0 + (rng() - 0.5) * spread * 2 / Math.max(0.2, Math.cos(lat * D));
    const root = new THREE.Group(); root.matrixAutoUpdate = false;
    frameAt(Math.max(-89.5, Math.min(89.5, lat)), lon, 0, 0, root.matrix);
    const mat = new THREE.MeshBasicMaterial({ color: pick(rng, [0xd7263d, 0xf4a300, 0x1b998b, 0x7b2cbf, 0xe56399, 0x2f5d9e, 0xf08a24]), side: THREE.DoubleSide });
    const kite = new THREE.Mesh(geo, mat);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: INK }));
    kite.add(edge);
    const str = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 1, 0), V(0, 10, 0)]), new THREE.LineBasicMaterial({ color: 0xf6efe0, transparent: true, opacity: 0.7 }));
    root.add(kite, str); scene.add(root);
    kites.push({ kite, str, h: 12 + rng() * 14, ph: rng() * 10, dx: (rng() - 0.5) * 10, dz: (rng() - 0.5) * 10 });
  }
  return (t) => {
    for (const k of kites) {
      const x = k.dx + Math.sin(t * 0.4 + k.ph) * 2, z = k.dz + Math.cos(t * 0.33 + k.ph) * 1.5, y = k.h + Math.sin(t * 0.7 + k.ph) * 1.2;
      k.kite.position.set(x, y, z);
      k.kite.rotation.set(0.3 * Math.sin(t + k.ph), t * 0.2 + k.ph, 0.4 * Math.sin(t * 1.3 + k.ph));
      const p = k.str.geometry.attributes.position; p.setXYZ(0, 0, 1.2, 0); p.setXYZ(1, x, y - 0.8, z); p.needsUpdate = true;
    }
  };
}

// ─── marcos de Jaipur ───────────────────────────────────────────────────────
const LM = {};
LM.hawaMahal = (k) => {
  const pink = 0xe0876c, light = 0xf0a488, trim = 0xf7e6cf;
  const widths = [18, 16, 13, 9, 5.5];
  let y = 0;
  k.box(0xb5654f, 19, 1.6, 5, 0, -1.2, 0);
  widths.forEach((w, i) => {
    const h = 2.2, d = 4 - i * 0.4;
    k.box(pink, w, h, d, 0, y, 0);
    k.box(trim, w + 0.2, 0.14, d + 0.2, 0, y + h, 0);
    const n = Math.floor(w / 1.25);
    for (let j = 0; j < n; j++) {
      const x = -w / 2 + (j + 0.5) * (w / n);
      k.box(light, 0.95, 1.5, 0.55, x, y + 0.2, d / 2 + 0.27);
      k.window(j % 3 ? 0xffc86a : 0x2e2a3a, 0.45, 0.75, x, y + 0.55, d / 2 + 0.57);
      k.onion(trim, 0.42, 0.5, x, y + 1.7, d / 2 + 0.27);
    }
    y += h + 0.14;
  });
  for (const x of [-1.6, 0, 1.6]) k.onion(trim, 0.6, 1.2, x, y, 0);
  k.box(pink, 3.2, 3.2, 1.2, 0, -0.1, 2.6);
  k.box(0x3a2a2a, 1.4, 2.2, 0.1, 0, 0, 3.22, 0, { outline: false });
};
LM.jantarMantar = (k) => {
  const ochre = 0xdca55f, trim = 0xf2e2c4, dark = 0x9b6b3d;
  // Samrat Yantra: gnomon triangular gigante
  k.prism(ochre, [[-8, 0], [8, 0], [8, 11]], 1.6, 0, 0, 0);
  k.beam(trim, V(-8, 0.1, 0.85), V(8, 11.1, 0.85), 0.2, 0.1);
  k.beam(trim, V(-8, 0.1, -0.85), V(8, 11.1, -0.85), 0.2, 0.1);
  chhatri(k, ochre, trim, 0.9, 8, 11, 0);
  // quadrantes
  for (const z of [-3.5, 3.5]) {
    const pts = [];
    for (let a = 0; a <= 90; a += 10) pts.push([6 * Math.cos(a * D), 6 * Math.sin(a * D)]);
    for (let a = 90; a >= 0; a -= 10) pts.push([4.8 * Math.cos(a * D), 4.8 * Math.sin(a * D)]);
    k.prism(ochre, pts, 1.2, -4, 0, z);
  }
  // Jai Prakash: tigelas
  for (const x of [-9, -4]) { k.torus(trim, 2.2, 0.25, x, 0.25, 7); k.add(new THREE.CircleGeometry(2.1, 24), dark, L(x, 0.12, 7, 0, -Math.PI / 2), { outline: false }); }
  k.cyl(ochre, 1.6, 1.8, 2.4, 7, 0, 7, 16); k.cone(trim, 0.2, 2.2, 7, 2.4, 7, 6);
};
LM.albertHall = (k, rng) => {
  const sand = 0xe8c48a, trim = 0xf6ead2, red = 0xc2593f;
  k.box(sand, 18, 0.8, 11, 0, -0.5, 0);
  k.box(sand, 16, 4.2, 9, 0, 0.3, 0);
  k.box(trim, 16.4, 0.3, 9.4, 0, 4.5, 0);
  for (let i = 0; i < 9; i++) for (const s of [1, -1]) {
    const x = -7 + i * 1.75;
    k.box(0x3a2a2a, 1.0, 2.2, 0.1, x, 0.8, s * 4.52, 0, { outline: false });
    k.onion(red, 0.5, 0.35, x, 3.0, s * 4.5, { outline: false });
  }
  k.box(sand, 5, 5.5, 5, 0, 4.5, 0);
  k.cyl(trim, 2.3, 2.4, 1.2, 0, 10, 0, 16);
  k.onion(trim, 2.3, 3.6, 0, 11.2, 0);
  for (const [a, b] of [[-7, -3.5], [7, -3.5], [-7, 3.5], [7, 3.5]]) chhatri(k, sand, trim, 1.1, a, 4.8, b);
  for (let i = 0; i < 6; i++) tree(k, rng, -11 + i * 4.4, -8.5);
};
LM.jalMahal = (k) => {
  const sand = 0xe6c08a, trim = 0xf6ead2;
  k.box(0xb8905e, 9, 1.5, 9, 0, -1.2, 0);
  k.box(sand, 8, 3.4, 8, 0, 0.3, 0);
  k.box(trim, 8.4, 0.2, 8.4, 0, 3.7, 0);
  for (let i = 0; i < 5; i++) for (const s of [1, -1]) { k.window(0xffc86a, 0.6, 1.0, -3 + i * 1.5, 1.8, s * 4.05); k.window(0xffc86a, 0.6, 1.0, s * 4.05, 1.8, -3 + i * 1.5, Math.PI / 2); }
  for (const [a, b] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
    k.cyl(sand, 0.9, 0.9, 1.6, a, 3.8, b, 8);
    k.onion(trim, 0.95, 1.4, a, 5.4, b);
  }
  k.box(sand, 3.4, 1.6, 2.2, 0, 3.8, 0);
  k.add(new THREE.CylinderGeometry(1.3, 1.3, 3.2, 12, 1, false, Math.PI / 2, Math.PI), trim, L(0, 5.4, 0, Math.PI / 2, Math.PI / 2));
};
LM.patrikaGate = (k) => {
  const bands = [0xe56399, 0xf4a300, 0x2f8fce, 0x3aa35c, 0xd7263d, 0x7b2cbf];
  for (const x of [-4, 4]) {
    for (let i = 0; i < 6; i++) k.box(bands[i], 2.2, 1.3, 2.2, x, i * 1.3, 0);
    chhatri(k, 0xf6ead2, 0xe56399, 1.1, x, 7.8, 0);
  }
  k.box(0xf4a300, 10.4, 1.4, 2.4, 0, 6.2, 0);
  k.box(0xe56399, 10.6, 0.3, 2.6, 0, 7.6, 0);
  for (let i = 0; i < 5; i++) k.onion(0xf6ead2, 0.45, 0.8, -3 + i * 1.5, 7.9, 0);
  k.add(new THREE.CylinderGeometry(2.9, 2.9, 2.0, 16, 1, true, Math.PI / 2, Math.PI), 0x2f8fce, L(0, 3.4, 0, 0, Math.PI / 2), { outline: false });
};
LM.johari = (k, rng) => {
  const pink = 0xe2957f, trim = 0xf6e7d0;
  for (let i = 0; i < 4; i++) {
    const x = -12 + i * 8;
    k.box(pink, 7, 5.5, 4, x, -0.4, -4);
    for (let a = 0; a < 3; a++) {
      k.box(trim, 1.5, 2.4, 0.1, x - 2.2 + a * 2.2, 0, -1.95, 0, { outline: false });
      k.onion(trim, 0.75, 0.5, x - 2.2 + a * 2.2, 2.4, -1.95, { outline: false });
    }
    for (let j = 0; j < 3; j++) k.window(0xffc86a, 0.7, 1.0, x - 2.2 + j * 2.2, 3.6, -1.95);
    stall(k, rng, x, 0.6, 0, 'jewel');
  }
};
LM.amer = (k, rng) => {
  // a muralha é montada fora (anel de segmentos); aqui fica o palácio central
  const honey = 0xe5c07b, trim = 0xf6ead2;
  k.box(0xc8a066, 16, 1.5, 16, 0, -1, 0);
  k.box(honey, 14, 3, 14, 0, 0.5, 0);
  k.box(honey, 10, 3, 10, 0, 3.5, 0);
  k.box(honey, 6, 3, 6, 0, 6.5, 0);
  for (const s of [3.5, 6.5]) k.box(trim, s === 3.5 ? 14.3 : 10.3, 0.2, s === 3.5 ? 14.3 : 10.3, 0, s, 0);
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) { k.window(0xffc86a, 0.8, 1.2, -5 + i * 2, 1.6, s * 7.05); k.window(0xffc86a, 0.8, 1.2, s * 7.05, 1.6, -5 + i * 2, Math.PI / 2); }
  for (const [a, b] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]]) chhatri(k, honey, trim, 1.2, a, 6.5, b);
  chhatri(k, honey, trim, 2.2, 0, 9.5, 0);
  // Diwan-e-Aam: pavilhão de colunas
  k.box(trim, 8, 0.5, 5, 0, 0, 10.5);
  for (let i = 0; i < 5; i++) for (const z of [8.5, 12.5]) k.cyl(0xd6734f, 0.22, 0.26, 3, -3.2 + i * 1.6, 0.5, z, 8);
  k.box(honey, 8.4, 0.5, 5.4, 0, 3.5, 10.5);
  for (let i = 0; i < 5; i++) tree(k, rng, -12 + i * 6, -11);
};
LM.kites = (k, rng) => {
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; tree(k, rng, Math.cos(a) * 17, Math.sin(a) * 17, 1.2); }
  // terraço com mureta, de onde se empina pipa
  k.box(0xe2957f, 8, 2.2, 8, 0, -0.3, 0);
  k.box(0xf6e7d0, 8.3, 0.16, 8.3, 0, 1.9, 0);
  for (const s of [1, -1]) { k.box(0xe2957f, 8, 0.6, 0.2, 0, 2, s * 3.9); k.box(0xe2957f, 0.2, 0.6, 8, s * 3.9, 2, 0); }
};

// ─── marcos de Kolkata ──────────────────────────────────────────────────────
// A ponte e outras peças compridas são "dobradas" sobre a curvatura.
function bend(x, y, z) { const a = x / R; return V((R + y) * Math.sin(a), (R + y) * Math.cos(a) - R, z); }
LM.howrah = (k) => {
  const grey = 0x9aa4aa, pier = 0x8a8278;
  const top = (x) => {
    const ax = Math.abs(x);
    if (ax <= 3.2) return 8.2;
    if (ax <= 6.6) return 8.2 + (ax - 3.2) / 3.4 * 4.8;
    return 13 - (ax - 6.6) / (12 - 6.6) * 11.2;
  };
  // tabuleiro
  for (let x = -12; x < 12; x += 1) {
    k.beam(0x55555c, bend(x, 0.06, 0), bend(x + 1.02, 0.06, 0), 0.14, 4.6, { outline: false });
    for (const z of [-0.72, 0.72]) k.beam(0xb8b8c0, bend(x, 0.16, z), bend(x + 1.02, 0.16, z), 0.06, 0.1, { outline: false });
  }
  for (const z of [-2.4, 2.4]) {
    for (let x = -12; x < 12; x += 1.5) {
      const x2 = Math.min(12, x + 1.5);
      k.beam(grey, bend(x, 0.5, z), bend(x2, 0.5, z), 0.3);
      k.beam(grey, bend(x, top(x), z), bend(x2, top(x2), z), 0.3);
      k.beam(grey, bend(x, 0.5, z), bend(x, top(x), z), 0.16, 0.16, { t: 0.035 });
      k.beam(grey, bend(x, 0.5, z), bend(x2, top(x2), z), 0.13, 0.13, { t: 0.03 });
    }
    k.beam(grey, bend(12, 0.5, z), bend(12, top(12), z), 0.2);
    for (const x of [-6.6, 6.6]) { k.beam(grey, bend(x, -0.6, z), bend(x, 13.6, z), 0.6); k.box(pier, 1.4, 1.6, 1.4, bend(x, 0, 0).x, bend(x, -1.4, 0).y, z); }
  }
  for (let x = -12; x <= 12; x += 3) {
    k.beam(grey, bend(x, top(x), -2.4), bend(x, top(x), 2.4), 0.14, 0.14, { t: 0.03 });
    if (Math.abs(x) < 11) k.beam(grey, bend(x, top(x), -2.4), bend(x + 3, top(x + 3), 2.4), 0.1, 0.1, { outline: false });
  }
};
LM.prinsep = (k) => {
  const white = 0xf2eee4;
  k.box(0xd8d2c4, 7, 0.8, 5, 0, -0.4, 0);
  for (let i = 0; i < 4; i++) for (const z of [-1.8, 1.8]) k.cyl(white, 0.22, 0.26, 3.6, -2.4 + i * 1.6, 0.4, z, 10);
  k.box(white, 6.4, 0.6, 4.4, 0, 4.0, 0);
  k.prism(white, [[-3.3, 0], [3.3, 0], [0, 1.3]], 4.4, 0, 4.6, 0);
};
LM.victoria = (k, rng) => {
  const marble = 0xf3f0e8, trim = 0xd8d2c4;
  k.box(trim, 24, 1.2, 16, 0, -0.6, 0);
  k.box(marble, 20, 5.5, 11, 0, 0.6, 0);
  k.box(marble, 7, 3, 3, 0, 0.6, 6.8);
  for (let i = 0; i < 6; i++) k.cyl(marble, 0.28, 0.3, 3, -2.8 + i * 1.12, 0.6, 8.4, 10);
  k.prism(marble, [[-3.8, 0], [3.8, 0], [0, 1.4]], 3.2, 0, 3.6, 6.8);
  for (let i = 0; i < 8; i++) for (const s of [1, -1]) k.window(0x2e2a3a, 0.8, 2.0, -8.4 + i * 2.4, 2.2, s * 5.52);
  k.cyl(marble, 4.2, 4.4, 2.2, 0, 6.1, 0, 20);
  k.dome(marble, 4.3, 0, 8.3, 0);
  k.cyl(trim, 0.6, 0.8, 1.2, 0, 12.4, 0, 10);
  k.ball(0x3b3a36, 0.4, 0, 14.1, 0); k.cone(0x3b3a36, 0.35, 1.2, 0, 13.4, 0, 8);
  for (const [a, b] of [[-8.5, -4], [8.5, -4], [-8.5, 4], [8.5, 4]]) { k.box(marble, 2.6, 2.4, 2.6, a, 6.1, b); k.dome(marble, 1.3, a, 8.5, b); }
  for (let i = 0; i < 10; i++) tree(k, rng, -18 + i * 4, -12);
};
LM.writers = (k) => {
  const red = 0xa8432f, white = 0xf3eee0;
  k.box(0x7e3526, 26, 1.4, 6, 0, -1.2, 0);
  k.box(red, 25, 7, 5, 0, 0, 0);
  k.box(white, 25.4, 0.3, 5.4, 0, 7, 0);
  k.box(white, 25.4, 0.2, 5.4, 0, 3.4, 0);
  for (let i = 0; i < 13; i++) {
    const x = -12 + i * 2;
    k.box(white, 0.3, 7, 0.15, x, 0, 2.55, 0, { outline: false });
    if (i < 12) for (const y of [1.2, 4.6]) k.window(0xffd27a, 0.7, 1.6, x + 1, y, 2.55);
  }
  k.box(red, 7, 2, 1, 0, 7.3, 2.6);
  k.prism(white, [[-3.8, 0], [3.8, 0], [0, 1.6]], 1.2, 0, 9.3, 2.6);
  for (const x of [-10, -5, 5, 10]) { k.box(white, 0.5, 0.5, 0.5, x, 7.3, 2.2); k.cone(white, 0.25, 1.3, x, 7.8, 2.2, 8); }
};
LM.pandal = (k, rng) => {
  const cols = [0xd7263d, 0xf4a300, 0xe56399, 0xf08a24];
  for (let i = 0; i < 8; i++) k.box(cols[i % 4], 12 / 8, 6, 8, -6 + (i + 0.5) * 1.5, 0, -1);
  k.prism(0xf4a300, [[-6.5, 0], [6.5, 0], [0, 3]], 8.4, 0, 6, -1);
  k.box(0xd7263d, 5, 5, 0.3, 0, 0, 3.2);
  k.add(new THREE.CylinderGeometry(2.1, 2.1, 0.32, 16, 1, false, Math.PI / 2, Math.PI), 0x2a1a22, L(0, 2.6, 3.3, 0, Math.PI / 2), { outline: false });
  k.box(0x2a1a22, 4.2, 2.6, 0.32, 0, 0, 3.3, 0, { outline: false });
  // a deusa
  k.box(0xf6ead2, 3, 0.8, 1.2, 0, 0, 1.6);
  k.cone(0xd7263d, 0.8, 2.2, 0, 0.8, 1.6, 10);
  k.ball(0xe0a060, 0.38, 0, 3.3, 1.6);
  k.torus(0xf4c430, 0.95, 0.1, 0, 3.4, 1.4);
  for (let i = 0; i < 10; i++) {
    const a = -0.9 + (i % 5) * 0.45, s = i < 5 ? 1 : -1;
    k.beam(0xe0a060, V(s * 0.3, 2.6, 1.6), V(s * (0.4 + Math.cos(a) * 1.1), 2.6 + Math.sin(a) * 1.1, 1.7), 0.08, 0.08, { t: 0.02 });
  }
  // cordões de luz
  for (let i = 0; i < 26; i++) {
    const x = -6.5 + i * 0.5;
    k.ball(i % 2 ? 0xffe066 : 0xff6b9a, 0.12, x, 6 + (3 - Math.abs(x) * 3 / 6.5) + 0.1, 3.3, { glow: true });
  }
  for (let i = 0; i < 18; i++) k.ball(i % 3 ? 0xffe066 : 0x66d9ff, 0.12, -6.1 + i * 0.72, 5.9, 3.2, { glow: true });
  for (let i = 0; i < 4; i++) tree(k, rng, -9 + i * 6, -8);
};
LM.collegeSt = (k, rng) => {
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) stall(k, rng, s * 3.4, -9 + i * 3.4, s > 0 ? -Math.PI / 2 : Math.PI / 2, 'books');
  // Coffee House
  k.box(0xe9d9a8, 6, 6, 5, 9, -0.3, 0);
  k.box(0x2f6b4a, 4, 0.8, 0.1, 9, 4, 2.53, 0, { t: 0.02 });
  for (let i = 0; i < 3; i++) k.window(0xffd27a, 0.8, 1.2, 7.3 + i * 1.7, 1.8, 2.53);
};
LM.minar = (k, rng) => {
  const cream = 0xf2ead3;
  k.box(cream, 4.2, 3.4, 4.2, 0, -0.4, 0);
  k.box(0xd8cdb2, 4.6, 0.3, 4.6, 0, 3.0, 0);
  k.cyl(cream, 1.1, 1.5, 17, 0, 3.3, 0, 12);
  k.cyl(0xd8cdb2, 1.7, 1.7, 0.35, 0, 13, 0, 12);
  k.cyl(cream, 0.85, 1.1, 5.5, 0, 20.3, 0, 12);
  k.cyl(0xd8cdb2, 1.5, 1.5, 0.35, 0, 25.6, 0, 12);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.cyl(cream, 0.12, 0.12, 1.6, Math.cos(a) * 0.9, 25.9, Math.sin(a) * 0.9, 6, { t: 0.03 }); }
  k.dome(cream, 1.1, 0, 27.5, 0);
  k.cone(0xd8cdb2, 0.15, 1.4, 0, 28.5, 0, 6);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; tree(k, rng, Math.cos(a) * 13, Math.sin(a) * 13, 1.1); }
};
LM.dakshineswar = (k, rng) => {
  const cream = 0xf2e6cc, terra = 0xc65b3a;
  k.box(0xd8cdb2, 16, 1.6, 16, 0, -0.6, 0);
  k.box(terra, 9, 5, 9, 0, 1, 0);
  k.box(cream, 9.3, 0.3, 9.3, 0, 6, 0);
  k.box(terra, 6, 3, 6, 0, 6.3, 0);
  k.box(cream, 6.3, 0.3, 6.3, 0, 9.3, 0);
  const spire = (x, y, z, s) => { k.box(terra, 1.6 * s, 1.4 * s, 1.6 * s, x, y, z); k.onion(cream, 0.9 * s, 2.4 * s, x, y + 1.4 * s, z); k.cone(0xf4c430, 0.08 * s, 0.8 * s, x, y + 3.7 * s, z, 6, { t: 0.02 }); };
  for (const [a, b] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) spire(a, 6.3, b, 1);
  for (const [a, b] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) spire(a, 9.6, b, 0.9);
  spire(0, 9.6, 0, 1.5);
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) k.window(0xffd27a, 1, 2, -3 + i * 3, 1.8, s * 4.52);
  for (let i = 0; i < 6; i++) { k.box(cream, 2.2, 3, 2.2, -12, 0, -10 + i * 4); k.onion(terra, 1.0, 1.6, -12, 3, -10 + i * 4); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; tree(k, rng, 14 + Math.cos(a) * 3, Math.sin(a) * 12, 1.2); }
};

// ─── montagem da cidade ─────────────────────────────────────────────────────
export function buildCity(cfg, scene) {
  const rng = rngFrom(cfg.id === 'jaipur' ? 1876 : 1690);
  const isJ = cfg.id === 'jaipur';
  const world = { obstacles: [], blockers: [], npcs: [], vehicles: [], animals: [], landmarks: [], updaters: [] };
  const obst = (lat, lon, rUnits) => world.obstacles.push({ n: upAt(lat, lon), r: rUnits / R });

  // chão
  const ground = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), new THREE.MeshToonMaterial({ color: cfg.ground, gradientMap: toonGrad }));
  scene.add(ground);
  const rim = new THREE.Mesh(new THREE.SphereGeometry(R + 0.1, 96, 64), inkMat);
  scene.add(rim);

  const flat = new Kit(), k = new Kit();
  const RIVER = cfg.river;
  const roadHW = 2.2;
  const onBridge = (lon) => RIVER && Math.abs(wrap(lon - RIVER.lon)) < 9;

  // trilho no equador
  const trackSeg = (lon0, lon1) => {
    flat.raw(ribbonGeo(pathParallel(0, lon0, lon1, 0.5), 1.5, 0.05), 0x8b7f73);
    for (const o of [-0.72, 0.72]) flat.raw(ribbonGeo(pathParallel(0, lon0, lon1, 0.5), 0.06, 0.12, o), 0xc8c8d0);
    for (let b = lon0; b < lon1; b += 1.1) { k.at(0, b); k.box(0x5a4234, 0.35, 0.08, 2.2, 0, 0.05, 0, 0, { outline: false }); }
  };
  if (RIVER) { trackSeg(RIVER.lon + 9, RIVER.lon + 360 - 9); } else trackSeg(0, 360);

  // estradas: dois paralelos e seis meridianos
  for (const lat of [-30, 30]) {
    flat.raw(ribbonGeo(pathParallel(lat, 0, 360, 0.8), roadHW, 0.06), cfg.road);
    for (let b = 0; b < 360; b += 4) { k.at(lat, b); k.box(0xf3eee0, 0.8, 0.02, 0.12, 0, 0.07, 0, 0, { outline: false }); }
  }
  const meridians = [0, 60, 120, 180, 240, 300];
  for (const lon of meridians) {
    flat.raw(ribbonGeo(pathMeridian(lon, -66, 66, 0.8), roadHW, 0.065), cfg.road);
  }
  // postes ao longo das estradas
  for (const lat of [-30, 30]) for (let b = 3; b < 360; b += 11) { if (RIVER && Math.abs(wrap(b - RIVER.lon)) < 8 && Math.abs(lat) < RIVER.lat1 + 5) continue; k.at(lat + (lat > 0 ? 2.1 : -2.1), b, lat > 0 ? 0 : Math.PI); lamp(k, 0, 0); }
  for (const lon of meridians) for (let a = -60; a <= 60; a += 10) { if (Math.abs(a) < 8 || Math.abs(Math.abs(a) - 30) < 4) continue; k.at(a, lon + 2.2 / Math.cos(a * D), -Math.PI / 2); lamp(k, 0, 0); }

  // rio (Kolkata)
  if (RIVER) {
    const hwDeg = RIVER.halfWidth / R / D;
    flat.raw(ribbonGeo(pathMeridian(RIVER.lon, RIVER.lat0, RIVER.lat1, 0.5), RIVER.halfWidth, 0.04), 0x5d8fa8);
    flat.raw(capGeo(RIVER.lat1, RIVER.lon, hwDeg, 0.04), 0x5d8fa8);
    flat.raw(capGeo(RIVER.lat0, RIVER.lon, hwDeg, 0.04), 0x5d8fa8);
    for (const o of [-1, 1]) flat.raw(ribbonGeo(pathMeridian(RIVER.lon, RIVER.lat0, RIVER.lat1, 0.5), 0.35, 0.05, o * (RIVER.halfWidth + 0.2)), 0xb8ad98);
    world.blockers.push((lat, lon) => {
      if (Math.abs(lat) < RIVER.bridgeHalf) return false;
      const x = Math.abs(wrap(lon - RIVER.lon)) * Math.cos(lat * D) * D * R;
      if (lat > RIVER.lat0 && lat < RIVER.lat1) return x < RIVER.halfWidth + 0.3;
      const endLat = lat > 0 ? RIVER.lat1 : RIVER.lat0;
      return angDeg(lat, lon, endLat, RIVER.lon) * D * R < RIVER.halfWidth + 0.3;
    });
    // barquinhos
    for (let i = 0; i < 4; i++) {
      k.at(-20 + i * 11 + (i > 1 ? 6 : 0), RIVER.lon + (i % 2 ? 1.5 : -1.5), Math.PI / 2);
      k.box(0x6b4a33, 3, 0.4, 1.1, 0, -0.05, 0); k.box(0xe9d9a8, 1.4, 0.8, 1.0, -0.3, 0.35, 0);
    }
  }

  // estações
  world.stations = cfg.stations.map((s) => ({ ...s }));
  for (const s of cfg.stations) {
    flat.raw(ribbonGeo(pathParallel(2.6, s.lon - (isJ ? 12 : 6), s.lon + (isJ ? 12 : 6), 0.5), 1.1, 0.14), 0xcfc4b0);
    flat.raw(ribbonGeo(pathParallel(1.85, s.lon - (isJ ? 12 : 6), s.lon + (isJ ? 12 : 6), 0.5), 0.12, 0.16), 0xf4d35e);
    // cobertura
    for (let i = -2; i <= 2; i++) {
      k.at(2.9, s.lon + i * (isJ ? 4 : 2));
      k.cyl(0x6d6a70, 0.08, 0.1, 3.2, 0, 0, 0, 6, { t: 0.03 });
      k.box(isJ ? 0xc2593f : 0x2f6b4a, isJ ? 5.8 : 3, 0.14, 2.2, 0, 3.2, -0.2, 0);
      obst(2.9, s.lon + i * (isJ ? 4 : 2), 0.25);
    }
    // placa amarela
    const tex = signTexture(s.deva, s.latin, cfg.lang);
    const sign = new THREE.Group(); sign.matrixAutoUpdate = false; frameAt(3.1, s.lon + (isJ ? 7 : 4), 0, 0, sign.matrix);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
    plane.position.set(0, 2.4, 0);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.3, 0.08), new THREE.MeshBasicMaterial({ color: INK }));
    back.position.set(0, 2.4, -0.06);
    sign.add(plane, back); scene.add(sign);
    for (const x of [-1.4, 1.4]) { k.at(3.1, s.lon + (isJ ? 7 : 4)); k.box(INK, 0.1, 1.8, 0.1, x, 0, -0.1, 0, { t: 0.02 }); }
    obst(3.1, s.lon + (isJ ? 7 : 4), 0.9);
    world.landmarks.push({ n: upAt(1.5, s.lon), r: 10 / R, deva: s.deva, latin: s.latin, desc: isJ ? 'Estação do Palace on Wheels.' : 'Parada do bonde.', station: true });
  }

  // fios do bonde
  if (!isJ) {
    const pts = []; for (let b = 0; b <= 360; b += 1) pts.push(upAt(0, b).multiplyScalar(R + 4.55));
    const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: INK }));
    scene.add(wire);
    for (let b = 3; b < 360; b += 7) {
      if (onBridge(b)) continue;
      k.at(-2.2, b); k.cyl(0x3a4a3a, 0.08, 0.1, 5, 0, 0, 0, 6, { t: 0.03 });
      k.beam(0x3a4a3a, V(0, 4.9, 0), V(0, 4.9, -3.1), 0.06, 0.06, { t: 0.02 });
      obst(-2.2, b, 0.2);
    }
  }

  // marcos
  for (const lm of cfg.landmarks) {
    world.landmarks.push({ n: upAt(lm.lat, lm.lon), r: lm.zone * D * 0.75, deva: lm.deva, latin: lm.latin, desc: lm.desc });
    const heading = lm.key === 'patrikaGate' || lm.key === 'collegeSt' ? Math.PI / 2 : lm.lat < 0 ? Math.PI : 0;
    if (lm.key === 'jalMahal') { flat.raw(capGeo(lm.lat, lm.lon, 9, 0.05), 0x5d9ab0); obst(lm.lat, lm.lon, 9 * D * R); }
    if (lm.key === 'kites') flat.raw(capGeo(lm.lat, lm.lon, 16, 0.04), 0xc9b36a);
    if (lm.key === 'victoria') flat.raw(capGeo(lm.lat, lm.lon, 14, 0.04), 0x86b35a);
    if (lm.key === 'minar') flat.raw(capGeo(lm.lat, lm.lon, 11, 0.04), 0x86b35a);
    if (lm.key === 'jantarMantar') flat.raw(capGeo(lm.lat, lm.lon, 10, 0.04), 0xc9a27a);
    if (lm.key === 'albertHall') flat.raw(capGeo(lm.lat, lm.lon, 9, 0.04), 0x8fb35e);
    if (lm.key === 'amer') flat.raw(capGeo(lm.lat, lm.lon, 12, 0.04), 0xd6b577);
    k.at(lm.lat, lm.lon, heading);
    LM[lm.key](k, rng);
    // colisão dos marcos
    const col = { hawaMahal: [[0, 0, 8.5]], jantarMantar: [[0, 0, 7.5]], albertHall: [[0, 0, 7.5]], patrikaGate: [[-4, 0, 1.4], [4, 0, 1.4]],
      johari: [[-12, -4, 3.4], [-4, -4, 3.4], [4, -4, 3.4], [12, -4, 3.4]], amer: [[0, 0, 9.5]], kites: [[0, 0, 5]],
      howrah: [], prinsep: [[0, 0, 3.4]], victoria: [[0, 0, 9.5]], writers: [[-8, 0, 3.2], [0, 0, 3.2], [8, 0, 3.2]],
      pandal: [[0, -1, 6]], collegeSt: [[9, 0, 3.2]], minar: [[0, 0, 2.8]], dakshineswar: [[0, 0, 7.5], [-12, 0, 1.2]] }[lm.key] ?? [];
    for (const [x, z, r] of col) {
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(frameAt(lm.lat, lm.lon, heading, 0));
      const ll = latLonOf(p); obst(ll.lat, ll.lon, r);
    }
  }
  if (isJ) {
    // muralha de Amer em anel ao redor do polo norte, com portão
    const ringLat = 74, honey = 0xd9ae68;
    for (let b = 0; b < 360; b += 3) {
      if (b > 354 || b < 6) continue;
      k.at(ringLat, b + 1.5, 0);
      const len = 3 * D * R * Math.cos(ringLat * D) + 0.1;
      k.box(honey, len, 3.4, 1.2, 0, -0.4, 0);
      for (let m = -1; m <= 1; m++) k.box(honey, 0.5, 0.6, 1.2, m * len / 3, 3.0, 0, 0, { t: 0.03 });
      obst(ringLat, b + 1.5, 1.4);
      if (b % 30 === 0) { k.cyl(honey, 1.3, 1.5, 4.6, 0, -0.4, 0, 10); k.dome(0xf6ead2, 1.2, 0, 4.2, 0); obst(ringLat, b + 1.5, 1.6); }
    }
    // Suraj Pol
    k.at(ringLat, 0, 0);
    for (const x of [-3.3, 3.3]) { k.box(honey, 2.2, 7, 2.4, x, -0.4, 0); chhatri(k, honey, 0xf6ead2, 1, x, 6.6, 0); }
    k.box(honey, 8.8, 1.8, 2.4, 0, 5, 0);
    k.add(new THREE.CylinderGeometry(2.2, 2.2, 2.5, 16, 1, true, Math.PI / 2, Math.PI), 0x8a6a3e, L(0, 5, 0, 0, Math.PI / 2), { outline: false });
    for (const x of [-3.3, 3.3]) { const p = new THREE.Vector3(x, 0, 0).applyMatrix4(frameAt(ringLat, 0, 0)); const ll = latLonOf(p); obst(ll.lat, ll.lon, 1.5); }
  }

  // grade procedural
  const reserved = cfg.landmarks.map((l) => ({ lat: l.lat, lon: l.lon, zone: l.zone }));
  const stallSpots = [];
  let nBuild = 0;
  for (let lat = -62; lat <= 62; lat += 7.5) {
    if (Math.abs(lat) < 9) continue;
    const step = 7.5 / Math.cos(lat * D);
    for (let lon = rng() * step; lon < 360; lon += step) {
      const la = lat + (rng() - 0.5) * 1.2, lo = lon;
      const w = 3.4 + rng() * 2.6, d = 3.4 + rng() * 2.4;
      const half = Math.hypot(w, d) / 2;
      const halfDeg = half / R / D;
      // longe das estradas
      if (Math.abs(Math.abs(la) - 30) * D * R < roadHW + half + 0.8) continue;
      let nearRoad = false;
      for (const m of meridians) if (Math.abs(wrap(lo - m)) * Math.cos(la * D) * D * R < roadHW + half + 0.8) nearRoad = true;
      if (nearRoad) continue;
      if (Math.abs(la) < 5 + halfDeg + 1) continue;
      if (reserved.some((r) => angDeg(la, lo, r.lat, r.lon) < r.zone + halfDeg * 0.5)) continue;
      if (RIVER && Math.abs(wrap(lo - RIVER.lon)) * Math.cos(la * D) * D * R < RIVER.halfWidth + half + 1.5 && la > RIVER.lat0 - 8 && la < RIVER.lat1 + 8) continue;
      const roll = rng();
      k.at(la, lo, 0);
      if (roll < 0.8) {
        const hmax = isJ ? 6.5 : 9, hmin = isJ ? 3 : 4.2;
        const h = hmin + rng() * (hmax - hmin) * (Math.abs(la) < 16 ? 0.6 : 1);
        const r = isJ ? jaipurHouse(k, rng, w, d, h) : kolkataHouse(k, rng, w, d, h);
        obst(la, lo, r); nBuild++;
      } else if (roll < 0.92) {
        tree(k, rng, 0, 0, isJ ? 1 : 1.3); obst(la, lo, 0.5);
        if (rng() < 0.6) { tree(k, rng, 2, 1.5); tree(k, rng, -1.8, -1.2); }
      } else {
        stall(k, rng, 0, 0, 0, pick(rng, ['food', 'jewel', 'food']));
        obst(la, lo, 1.4);
        stallSpots.push({ lat: la + 1.4 * (la > 0 ? -1 : 1) / R / D * 1.3, lon: lo });
      }
    }
  }
  world.buildings = nBuild;

  // grupos estáticos
  scene.add(flat.build());
  scene.add(k.build());

  // ─── gente ───
  const spots = [];
  for (const s of stallSpots) spots.push({ lat: s.lat, lon: s.lon, role: isJ ? pick(rng, [0, 4, 7]) : pick(rng, [0, 4, 7]), still: true });
  for (const s of cfg.stations) for (let i = 0; i < 2; i++) spots.push({ lat: 2.8 + rng() * 0.6, lon: s.lon + (rng() - 0.5) * 8, role: isJ ? 3 : 6, still: i === 0 });
  for (const lm of cfg.landmarks) {
    const n = lm.key === 'kites' ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = lm.zone * (lm.key === 'kites' ? 0.5 : 0.8);
      const la = lm.lat === 90 || lm.lat === -90 ? lm.lat - Math.sign(lm.lat) * rr : lm.lat + Math.sin(a) * rr;
      const lo = lm.lat === 90 || lm.lat === -90 ? a / D : lm.lon + Math.cos(a) * rr / Math.cos(lm.lat * D);
      spots.push({ lat: la, lon: lo, role: lm.key === 'kites' ? 2 : lm.key === 'collegeSt' ? 2 : lm.key === 'pandal' ? 5 : pick(rng, [5, 6, 1, 3]), still: false });
    }
  }
  for (let i = 0; i < 26; i++) spots.push({ lat: (rng() < 0.5 ? 1 : -1) * (32.5 + rng() * 2) * (rng() < 0.7 ? 1 : 0.62), lon: rng() * 360, role: Math.floor(rng() * cfg.roles.length), still: false });

  for (const s of spots) {
    if (blocked(world, s.lat, s.lon)) continue;
    const g = personKit(rng, cfg.id).build(); g.matrixAutoUpdate = false; scene.add(g);
    const npc = { group: g, lat: s.lat, lon: s.lon, heading: rng() * Math.PI * 2, role: cfg.roles[s.role % cfg.roles.length], line: 0, still: s.still,
      home: { lat: s.lat, lon: s.lon }, target: null, pause: rng() * 4, bob: rng() * 10, talking: 0 };
    frameAt(npc.lat, npc.lon, npc.heading, 0, g.matrix);
    world.npcs.push(npc);
  }

  // ─── bichos parados ───
  for (let i = 0; i < (isJ ? 10 : 8); i++) {
    const la = (rng() < 0.5 ? 1 : -1) * (33 + rng() * 3), lo = rng() * 360;
    if (blocked(world, la, lo)) continue;
    const g = cowKit().build(); g.matrixAutoUpdate = false; frameAt(la, lo, rng() * 6, 0, g.matrix); scene.add(g);
    obst(la, lo, 0.8);
  }

  // ─── veículos nas avenidas ───
  const vk = isJ ? [autoKit, autoKit, camelKit] : [taxiKit];
  for (const lat of [-30, 30]) for (const dir of [1, -1]) {
    for (let i = 0; i < (isJ ? 5 : 7); i++) {
      const kind = pick(rng, vk);
      const g = kind().build(); g.matrixAutoUpdate = false; scene.add(g);
      const slow = kind === camelKit;
      world.vehicles.push({ group: g, lat: lat + dir * (lat > 0 ? -1 : 1) * 0.75, lon: rng() * 360, dir, speed: (slow ? 1.6 : 5 + rng() * 2) / (R * Math.cos(lat * D)) / D, honk: 4 + rng() * 12 });
    }
  }

  // ─── trem ───
  world.train = makeTrain(cfg);
  for (const c of world.train.cars) scene.add(c.group);

  // ─── pipas (Jaipur) ───
  if (isJ) {
    world.updaters.push(makeKites(scene, rng, -80, 0, 8, 16));
    world.updaters.push(makeKites(scene, rng, 20, 40, 14, 6));
    world.updaters.push(makeKites(scene, rng, -20, 200, 14, 6));
  }
  return world;
}

export function blocked(world, lat, lon, pad = 0.35) {
  const n = upAt(lat, lon);
  for (const o of world.obstacles) if (n.dot(o.n) > Math.cos(o.r + pad / R)) return true;
  for (const b of world.blockers) if (b(lat, lon)) return true;
  return false;
}

// atualização das coisas que se movem
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _east = new THREE.Vector3(), _south = new THREE.Vector3();
export function updateWorld(world, dt, t, playerN, events) {
  const tr = world.train.update(t);
  for (const v of world.vehicles) {
    v.lon += v.dir * v.speed * dt;
    frameAt(v.lat, v.lon, v.dir > 0 ? 0 : Math.PI, 0, v.group.matrix);
    v.honk -= dt;
    if (v.honk < 0) { v.honk = 6 + Math.random() * 14; events.push({ type: 'honk', n: upAt(v.lat, v.lon) }); }
  }
  for (const npc of world.npcs) {
    npc.bob += dt;
    if (npc.talking > 0) {
      npc.talking -= dt;
      upAt(npc.lat, npc.lon, _n);
      _t.copy(playerN).sub(_n); _t.addScaledVector(_n, -_t.dot(_n));
      eastAt(npc.lon, _east); _south.crossVectors(_east, _n);
      const want = Math.atan2(_t.dot(_east), _t.dot(_south));
      npc.heading += Math.atan2(Math.sin(want - npc.heading), Math.cos(want - npc.heading)) * Math.min(1, dt * 6);
    } else if (!npc.still) {
      if (npc.pause > 0) npc.pause -= dt;
      else {
        if (!npc.target) {
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
          npc.target = { lat: THREE.MathUtils.clamp(npc.home.lat + Math.sin(a) * r, -88, 88), lon: npc.home.lon + Math.cos(a) * r / Math.max(0.2, Math.cos(npc.home.lat * D)) };
        }
        upAt(npc.lat, npc.lon, _n);
        _t.copy(upAt(npc.target.lat, npc.target.lon, _t)).sub(_n); _t.addScaledVector(_n, -_t.dot(_n));
        const dist = _t.length() * R;
        if (dist < 0.3) { npc.target = null; npc.pause = 2 + Math.random() * 6; }
        else {
          _t.normalize();
          const nn = _n.clone().addScaledVector(_t, (1.1 * dt) / R).normalize();
          const ll = latLonOf(nn);
          if (blocked(world, ll.lat, ll.lon, 0.3)) { npc.target = null; npc.pause = 1; }
          else {
            npc.lat = ll.lat; npc.lon = ll.lon;
            eastAt(npc.lon, _east); _south.crossVectors(_east, nn);
            npc.heading = Math.atan2(_t.dot(_east), _t.dot(_south));
          }
        }
      }
    }
    frameAt(npc.lat, npc.lon, npc.heading, npc.still || npc.pause > 0 ? Math.abs(Math.sin(npc.bob * 1.3)) * 0.02 : Math.abs(Math.sin(npc.bob * 8)) * 0.06, npc.group.matrix);
  }
  for (const u of world.updaters) u(t);
  return tr;
}
