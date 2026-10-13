// Vegetação de RESERVA ao redor do jogador a pé (só quando o sistema `life`
// não fornece flora): árvores alienígenas (guarda-chuva com copas em camadas
// e manchas bioluminescentes, espirais com frondes caídas), samambaias,
// bulbos-lanterna, tufos de capim e pedras — instanciados num "remendo" no
// referencial do planeta (refeito quando o jogador se afasta), com vento no
// vértice e densidade por ruído (clareiras e matas) e por preset.
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, uniform, vec3, vec4, float, positionLocal, positionGeometry, sin, time, mix, smoothstep, clamp, instanceIndex, hash, normalLocal, max, pow, abs, dot, normalize,
} from 'three/tsl';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise, fbm } from './tsl.js';
import { rng, hashStr, quatFromFwdUp, anyPerp } from './util.js';

const C = new THREE.Color();

/** Geometria com cor/emissivo por vértice. */
function colored(geo, hex, emis = 0, rough = 0.8, ao = 0, jitter = 0) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), ex = new Float32Array(n * 2);
  C.set(hex);
  if (jitter) C.offsetHSL((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter * 0.5);
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    // oclusão falsa: faces para baixo mais escuras (volume das copas)
    const k = ao ? 1 - ao + ao * Math.max(0, Math.min(1, nr.getY(i) * 0.5 + 0.5)) ** 1.5 : 1;
    col[i * 3] = C.r * k; col[i * 3 + 1] = C.g * k; col[i * 3 + 2] = C.b * k; ex[i * 2] = emis; ex[i * 2 + 1] = rough;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 2));
  return g;
}
function xf(g, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, 'YXZ')), new THREE.Vector3(...scale));
  return g.applyMatrix4(m);
}
/** Funde vértices (normais suaves depois do ruído). */
function smoothGeo(g) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); return mergeVertices(g); }
/** Desloca vértices com ruído (copas orgânicas). */
function lumpy(g, amp, freq, seed) {
  const p = g.attributes.position; const r = rng(seed);
  const o = [r() * 10, r() * 10, r() * 10];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * freq + o[0]) * Math.sin(y * freq * 1.3 + o[1]) * Math.sin(z * freq * 0.9 + o[2]);
    const l = Math.hypot(x, y, z) || 1;
    p.setXYZ(i, x + x / l * n * amp, y + y / l * n * amp * 0.6, z + z / l * n * amp);
  }
  g.computeVertexNormals();
  return g;
}

/** Galho curvo (tubo por segmentos) de a até b com arco para cima. */
function branch(parts, a, b, r0, r1, hex, lift = 0.3, segs = 4) {
  let prev = a.clone();
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().lerp(b, t); p.y += Math.sin(t * Math.PI) * lift * a.distanceTo(b) * 0.3;
    const len = p.distanceTo(prev);
    const g = new THREE.CylinderGeometry(r0 + (r1 - r0) * t, r0 + (r1 - r0) * (t - 1 / segs), len * 1.06, 7, 1);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(prev).normalize()));
    g.translate(prev.x, prev.y, prev.z);
    parts.push(colored(g, hex, 0, 0.9, 0.3));
    prev = p;
  }
  return prev;
}
/** Massa de folhagem: vários blobs com ruído ao redor de um ponto. */
function foliage(parts, c, rad, pal, r, seed, flat = 0.55, leaves = null) {
  if (leaves) {
    // franja de folhas longas caindo da borda da copa (quebra a silhueta)
    const nf = 7 + Math.floor(r() * 4);
    for (let k = 0; k < nf; k++) {
      const a = k / nf * Math.PI * 2 + r() * 0.5;
      const g = frond(rad * (0.7 + r() * 0.5), 0.22 + r() * 0.1, 1.4 + r() * 1.2, r() < 0.5 ? pal.leaf : pal.leaf3);
      xf(g, [c.x + Math.cos(a) * rad * 0.55, c.y - rad * 0.1, c.z + Math.sin(a) * rad * 0.55], [0, -a, -0.15 + r() * 0.3]);
      leaves.push(g);
    }
  }
  const n = 4 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const rr = rad * (0.45 + r() * 0.45);
    const g = lumpy(smoothGeo(new THREE.IcosahedronGeometry(rr, 3)), rr * 0.22, 3.2 / rr, seed + k * 13);
    const a = r() * Math.PI * 2, d = rad * 0.55 * Math.sqrt(r());
    xf(g, [c.x + Math.cos(a) * d, c.y + (r() - 0.3) * rad * 0.35, c.z + Math.sin(a) * d], [0, r() * 3, 0], [1, flat + r() * 0.2, 1]);
    parts.push(colored(g, r() < 0.5 ? pal.leaf : pal.leaf2, 0, 0.62, 0.62, 0.06));
  }
}

/** Árvore guarda-chuva (Verídia): tronco curvo com sapopemas, galhos em leque e copas em nuvens. */
function umbrellaTree(seed, pal) {
  const r = rng(seed);
  const parts = [], leaves = [];
  const H = 7 + r() * 5;
  // tronco curvo (segmentos)
  let pos = new THREE.Vector3(0, 0, 0), dir = new THREE.Vector3(0, 1, 0);
  const bend = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).multiplyScalar(0.22);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const len = H / segs;
    const r0 = 0.42 * (1 - i / segs * 0.62), r1 = 0.42 * (1 - (i + 1) / segs * 0.62);
    const g = lumpy(new THREE.CylinderGeometry(r1, r0, len * 1.05, 10, 2), 0.04, 9, seed + i);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate(pos.x, pos.y, pos.z);
    parts.push(colored(g, pal.bark, 0, 0.92, 0.25));
    pos = pos.clone().addScaledVector(dir, len);
    dir = dir.clone().add(bend).normalize();
  }
  // sapopemas (raízes tabulares)
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + r() * 0.5;
    const g = new THREE.BoxGeometry(0.12, 1.4, 1.1);
    g.translate(0, 0.5, 0.45);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); if (y > 0.4) p.setZ(i, z * 0.3); if (z > 0.6) p.setY(i, Math.min(y, 0.15)); }
    g.computeVertexNormals();
    xf(g, [0, -0.1, 0], [0, a, 0]);
    parts.push(colored(g, pal.bark, 0, 0.95, 0.35));
  }
  // galhos em leque + copas
  const nb = 5 + Math.floor(r() * 3);
  const top = pos.clone();
  for (let k = 0; k < nb; k++) {
    const a = k / nb * Math.PI * 2 + r() * 0.6;
    const L = 2.2 + r() * 1.8;
    const tip = top.clone().add(new THREE.Vector3(Math.cos(a) * L, 0.6 + r() * 1.2, Math.sin(a) * L));
    const end = branch(parts, top.clone().addScaledVector(dir, -0.6 - r() * 1.2), tip, 0.16, 0.05, pal.bark, 0.6);
    foliage(parts, end.clone().add(new THREE.Vector3(0, 0.4, 0)), 1.5 + r() * 0.8, pal, r, seed * 7 + k, 0.55, leaves);
    // vagens luminosas penduradas
    for (let s2 = 0; s2 < 2; s2++) {
      const L2 = 0.6 + r() * 1.4;
      const px = end.x + (r() - 0.5) * 1.6, pz = end.z + (r() - 0.5) * 1.6, py = end.y - 0.1;
      const st = new THREE.CylinderGeometry(0.012, 0.012, L2, 4); st.translate(px, py - L2 / 2, pz);
      parts.push(colored(st, pal.leaf2, 0, 0.8));
      const pod = new THREE.SphereGeometry(0.09 + r() * 0.06, 8, 6); xf(pod, [px, py - L2 - 0.08, pz], [0, 0, 0], [1, 1.5, 1]);
      parts.push(colored(pod, pal.glow, 1, 0.35));
    }
  }
  foliage(parts, top.clone().add(new THREE.Vector3(0, 0.9, 0)), 2.0, pal, r, seed * 3, 0.5);
  return { solid: mergeGeometries(parts, false), leaves: mergeGeometries(leaves, false) };
}

/** Fronde em fita (folha longa caída), dupla face. */
function frond(L, w, droop, hex, hex2) {
  const N = 8;
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = t * L, y = droop * (t * 0.35 - t * t);
    const ww = w * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.3);
    const fold = ww * 0.25;
    pos.push(x, y + fold, -ww, x, y - fold * 0.2, 0, x, y + fold, ww);
  }
  for (let i = 0; i < N; i++) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const out = colored(g, hex, 0, 0.6, 0.3, 0.05);
  // ponta mais clara
  void hex2;
  return out;
}

/** Árvore espiral com frondes caídas. */
function spiralTree(seed, pal) {
  const r = rng(seed);
  const parts = [], leaves = [];
  const H = 5 + r() * 4;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const t = i / N, a = t * Math.PI * 3;
    const y = t * H;
    const rad = 0.3 * (1 - t * 0.65);
    const g = lumpy(new THREE.SphereGeometry(rad * 1.3, 9, 7), rad * 0.15, 8, seed + i);
    xf(g, [Math.cos(a) * 0.25 * t, y, Math.sin(a) * 0.25 * t], [0, a, 0], [1, 1.7, 1]);
    parts.push(colored(g, i % 2 ? pal.bark2 : pal.bark, 0, 0.85, 0.3));
  }
  const top = new THREE.Vector3(Math.cos(Math.PI * 3) * 0.25, H, Math.sin(Math.PI * 3) * 0.25);
  const F = 11;
  for (let k = 0; k < F; k++) {
    const a = k / F * Math.PI * 2 + r() * 0.4;
    const g = frond(2.8 + r() * 1.6, 0.42 + r() * 0.15, 2.2 + r() * 1.2, r() < 0.5 ? pal.leaf : pal.leaf3);
    xf(g, [top.x, top.y + 0.1, top.z], [0, -a, (r() - 0.3) * 0.4]);
    leaves.push(g);
  }
  const crown = new THREE.SphereGeometry(0.32, 10, 8); xf(crown, [top.x, H + 0.25, top.z], [0, 0, 0], [1, 1.3, 1]);
  parts.push(colored(crown, pal.glow, 1, 0.4));
  return { solid: mergeGeometries(parts, false), leaves: mergeGeometries(leaves, false) };
}

function fern(seed, pal) {
  const r = rng(seed);
  const parts = [];
  const F = 7;
  for (let k = 0; k < F; k++) {
    const a = k / F * Math.PI * 2 + r() * 0.5;
    const L = 0.9 + r() * 0.7;
    for (let s = 0; s < 5; s++) {
      const t = s / 5;
      const g = new THREE.SphereGeometry(0.16 * (1 - t * 0.5), 6, 3);
      xf(g, [Math.cos(a) * L * t, 0.15 + 0.9 * t - 0.8 * t * t, Math.sin(a) * L * t], [0, -a, 0.3], [2, 0.15, 0.9]);
      parts.push(colored(g, s % 2 ? pal.leaf3 : pal.leaf, 0, 0.6));
    }
  }
  return mergeGeometries(parts, false);
}

function lantern(seed, pal) {
  const r = rng(seed);
  const parts = [];
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.8 + r() * 1.2, a = r() * 6.28, d = r() * 0.3;
    const stem = new THREE.CylinderGeometry(0.03, 0.05, h, 5); stem.translate(0, h / 2, 0);
    xf(stem, [Math.cos(a) * d, 0, Math.sin(a) * d], [0.1 * (r() - 0.5), 0, 0.1 * (r() - 0.5)]);
    parts.push(colored(stem, pal.leaf2, 0, 0.8));
    const bulb = new THREE.SphereGeometry(0.16 + r() * 0.08, 10, 7);
    xf(bulb, [Math.cos(a) * d, h + 0.05, Math.sin(a) * d], [0, 0, 0], [1, 1.35, 1]);
    parts.push(colored(bulb, pal.glow2, 0.8, 0.3));
  }
  return mergeGeometries(parts, false);
}

function grassTuft(seed, pal) {
  const r = rng(seed);
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.35 + r() * 0.45, w = 0.045;
    const g = new THREE.PlaneGeometry(w, h, 1, 3);
    // afina a ponta e curva
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k) + h / 2; const t = y / h; p.setX(k, p.getX(k) * (1 - t * 0.9)); p.setZ(k, t * t * 0.12); p.setY(k, y); }
    g.computeVertexNormals();
    xf(g, [(r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25], [r() * 0.3, r() * Math.PI, 0]);
    parts.push(colored(g, i % 3 ? pal.grass : pal.grass2, 0, 0.75));
  }
  return mergeGeometries(parts, false);
}

function rock(seed, pal) {
  const r = rng(seed);
  // rocha facetada: dodecaedro com ruído forte e cortes planos (normais por face)
  const g = lumpy(new THREE.DodecahedronGeometry(1, 1), 0.32, 1.7, seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.55) p.setY(i, 0.55 + (y - 0.55) * 0.3); if (y < -0.2) p.setY(i, -0.2); }
  g.computeVertexNormals();
  xf(g, [0, 0.2, 0], [r() * 0.4, r() * 6, r() * 0.4], [1 + r() * 0.6, 0.6 + r() * 0.4, 1 + r() * 0.4]);
  return colored(g, pal.rock, 0, 0.9);
}

/** Material com vento + cor/emissivo por vértice. */
function floraMaterial({ wind = 1, lite = false, alphaGrass = false, leaf = false } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ side: alphaGrass || leaf ? THREE.DoubleSide : THREE.FrontSide });
  const U = { wind: uniform(wind), gust: uniform(1), glow: uniform(1), windDir: uniform(new THREE.Vector3(1, 0, 0.3).normalize()) };
  const col = attribute('color', 'vec3'), ex = attribute('aEx', 'vec2');
  const seed = hash(instanceIndex);
  const P = positionLocal;
  const h = max(positionGeometry.y, 0);
  const sway = sin(time.mul(1.3).add(seed.mul(6.28)).add(P.x.mul(0.3))).mul(0.6).add(sin(time.mul(2.7).add(seed.mul(17.0))).mul(0.25));
  const bendK = pow(h.mul(alphaGrass ? 2.0 : 0.12), 2).mul(U.wind).mul(U.gust).mul(alphaGrass ? 0.18 : leaf ? 0.09 : 0.05);
  m.positionNode = P.add(U.windDir.mul(sway.mul(bendK)));
  const n = vnoise(P.mul(3.0).add(seed.mul(13.0)));
  const tint = mix(float(0.8), float(1.15), seed);
  const base = col.mul(tint).mul(float(0.85).add(n.mul(0.3)));
  // grama mais clara na ponta
  m.colorNode = alphaGrass ? base.mul(mix(float(0.55), float(1.3), clamp(h.mul(2.2), 0, 1))) : base;
  m.roughnessNode = ex.y;
  m.metalnessNode = float(0);
  m.emissiveNode = col.mul(ex.x.mul(U.glow).mul(4.0));
  void fbm; void vec3; void vec4; void smoothstep; void normalLocal; void abs; void dot; void normalize; void lite;
  m.userData.U = U;
  return m;
}

const PALETTES = {
  lush: { bark: '#3b2a22', bark2: '#4a3a2c', leaf: '#1f6a52', leaf2: '#2c7f45', leaf3: '#3e8f3a', glow: '#6ff0ff', glow2: '#b6ff7a', grass: '#3f7a35', grass2: '#5f8f3a', rock: '#5b5a52' },
  toxic: { bark: '#2a2228', bark2: '#3a2a3a', leaf: '#5a2a7a', leaf2: '#7a3a8a', leaf3: '#8fbf2a', glow: '#d6f04a', glow2: '#ff7ae0', grass: '#4b5a1a', grass2: '#6a2a7a', rock: '#3a3a30' },
  ocean: { bark: '#4a3a2a', bark2: '#5a4630', leaf: '#2a7f6a', leaf2: '#3d8f4a', leaf3: '#5aa04a', glow: '#7affd8', glow2: '#ffe07a', grass: '#4a8a45', grass2: '#7a9a4a', rock: '#6a665a' },
  desert: { bark: '#5a3a22', bark2: '#6a4a2a', leaf: '#7a6a3a', leaf2: '#8a5a2a', leaf3: '#9a7a3a', glow: '#ffb070', glow2: '#ff8a50', grass: '#8a7040', grass2: '#a08050', rock: '#8a5a3a' },
  ice: { bark: '#3a3a44', bark2: '#4a4a55', leaf: '#5a7a8a', leaf2: '#7a9aaa', leaf3: '#a0c0d0', glow: '#9ae6ff', glow2: '#c0f0ff', grass: '#7a9aa8', grass2: '#a8c0cc', rock: '#7a8a96' },
};

export class Flora {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = null; this.entry = null;
    this.body = null; this.center = null; this.qL = new THREE.Quaternion();
    this.meshes = [];
    this.mats = {};
    this.protos = null;
    this.colliders = [];
    this.enabled = true;
    this._q = new THREE.Quaternion();
  }
  active() { return this.enabled && !this.ctx.services.life?.flora; }

  buildProtos(pal) {
    const P = { trees: [], spirals: [], ferns: [], lanterns: [], grass: [], rocks: [] };
    for (let i = 0; i < 3; i++) P.trees.push(umbrellaTree(101 + i, pal));
    for (let i = 0; i < 2; i++) P.spirals.push(spiralTree(201 + i, pal));
    for (let i = 0; i < 2; i++) P.ferns.push(fern(301 + i, pal));
    P.lanterns.push(lantern(401, pal));
    P.grass.push(grassTuft(501, pal));
    for (let i = 0; i < 2; i++) P.rocks.push(rock(601 + i, pal));
    return P;
  }

  /** Máscara de mata (0 clareira … 1 mata fechada) num ponto local do corpo. */
  forestAt(body, P) {
    const k = hashStr(body.id) % 1000;
    const gx = P.x / 90 + k, gz = P.z / 90, gy = P.y / 90;
    return 0.5 + 0.5 * Math.sin(gx * 1.3 + Math.sin(gz * 0.9)) * Math.cos(gz * 1.1 + gy * 0.7 + Math.sin(gx * 0.7));
  }

  /** Atualiza o remendo ao redor do jogador (local no corpo). */
  update(body, playerLocal) {
    if (!this.active() || !body || body.kind === 'gas_giant' || !['lush', 'toxic', 'ocean', 'desert', 'ice'].includes(body.type)) { this.clear(); return; }
    const need = !this.center || this.body !== body || this.center.distanceTo(playerLocal) > 70;
    if (!need) return;
    this.build(body, playerLocal.clone());
  }

  clear() {
    this.entry?.remove(); this.entry = null; this.group = null; this.center = null; this.body = null;
    for (const m of this.meshes) m.dispose?.();
    this.meshes = [];
  }

  build(body, center) {
    const ctx = this.ctx, pl = ctx.services.planets;
    if (!pl?.heightAtLocal) return;
    this.clear();
    const pal = PALETTES[body.type] || PALETTES.lush;
    if (this.palKey !== body.type) { this.protos = this.buildProtos(pal); this.palKey = body.type; }
    const lite = ctx.quality.name === 'mobile';
    const dens = ctx.quality.foliageDensity ?? 0.7;
    const R = body.radius;
    const up = center.clone().normalize();
    const e1 = anyPerp(up), e2 = new THREE.Vector3().crossVectors(up, e1);
    const hasSea = pl.view?.(body)?.terrain?.hasSea;
    const h0 = pl.heightAtLocal(body, up);
    const C0 = up.clone().multiplyScalar(R + h0);
    this.body = body; this.center = center.clone();
    this.qL = quatFromFwdUp(e2.clone().negate(), up, new THREE.Quaternion()); // x=e1, y=up, z=e2
    const qInv = this.qL.clone().invert();
    const group = new THREE.Group(); group.name = 'flora-reserva';
    const sampleAt = (x, z) => {
      const d = up.clone().multiplyScalar(R).addScaledVector(e1, x).addScaledVector(e2, z).normalize();
      const h = pl.heightAtLocal(body, d);
      return { d, h, p: d.clone().multiplyScalar(R + h) };
    };
    const forest = (x, z) => this.forestAt(body, C0.clone().addScaledVector(e1, x).addScaledVector(e2, z));
    const r = rng(hashStr(body.id + Math.round(center.x) + ':' + Math.round(center.z)));
    const lists = { trees: [], spirals: [], ferns: [], lanterns: [], grass: [], rocks: [] };
    const clear = (this.clearings || []).filter((c2) => c2.body === body).map((c2) => { const v = c2.local.clone().sub(C0); return { p: { x: v.dot(e1), z: v.dot(e2) }, r: c2.radius, all: !!c2.all }; });
    const place = (kind, x, z, scale, slopeMax = 0.35, minH = 1.2) => {
      if (clear.length) for (const c2 of clear) if ((c2.all || (kind !== 'trees' && kind !== 'spirals')) && Math.hypot(c2.p.x - x, c2.p.z - z) < c2.r) return false;
      const s = sampleAt(x, z);
      if (hasSea && s.h < minH) return false;
      const s2 = sampleAt(x + 1.5, z), s3 = sampleAt(x, z + 1.5);
      const slope = Math.hypot(s2.h - s.h, s3.h - s.h) / 1.5;
      if (slope > slopeMax) return false;
      const local = s.p.clone().sub(C0).applyQuaternion(qInv); // no espaço do grupo
      const n = s.d.clone().applyQuaternion(qInv);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2));
      lists[kind].push(new THREE.Matrix4().compose(local.addScaledVector(n, kind === 'rocks' ? -0.3 * scale : -0.05), q, new THREE.Vector3(scale, scale, scale)));
      return true;
    };
    const RAD = 170;
    const treeN = Math.round((body.type === 'lush' ? 260 : body.type === 'toxic' ? 160 : body.type === 'ocean' ? 120 : 40) * dens);
    for (let i = 0; i < treeN * 3 && lists.trees.length + lists.spirals.length < treeN; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * RAD;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const f = forest(x, z);
      if (r() > f * f * 1.3) continue;
      if (d < 4) continue;
      if (body.type === 'desert' || body.type === 'ice') { place('rocks', x, z, 1 + r() * 2.5, 0.8, -50); continue; }
      place(r() < 0.65 ? 'trees' : 'spirals', x, z, 0.8 + r() * 0.6, 0.45);
    }
    const smallN = Math.round(900 * dens);
    for (let i = 0; i < smallN; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 90;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const f = forest(x, z);
      const k = r();
      if (d < 3) continue;
      if (k < 0.45) { if (r() < 0.3 + f * 0.7) place('ferns', x, z, 0.7 + r() * 0.8, 0.6); }
      else if (k < 0.55) { if (r() < f) place('lanterns', x, z, 0.8 + r() * 0.6, 0.6); }
      else place('rocks', x, z, 0.25 + r() * 0.9 * (r() < 0.1 ? 3 : 1), 0.9, -50);
    }
    if (body.type !== 'ice') {
      const grassN = Math.round((lite ? 1600 : 9000) * dens * ({ lush: 1, ocean: 0.8, toxic: 0.6, desert: 0.1 }[body.type] ?? 0.5));
      for (let i = 0; i < grassN; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 38;
        place('grass', Math.cos(a) * d, Math.sin(a) * d, (0.6 + r() * 0.8) * (d < 6 ? 0.75 : 1), 0.7);
      }
    }
    const mat = this.mats.main || (this.mats.main = floraMaterial({ lite }));
    const gmat = this.mats.grass || (this.mats.grass = floraMaterial({ lite, alphaGrass: true }));
    const lmat = this.mats.leaf || (this.mats.leaf = floraMaterial({ lite, leaf: true }));
    const shadows = !lite && ctx.quality.shadows;
    const addIM = (geo, material, list, cast) => {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = cast; im.receiveShadow = true;
      im.frustumCulled = false;
      group.add(im);
      this.meshes.push(im);
    };
    for (const [kind, mats] of Object.entries(lists)) {
      if (!mats.length) continue;
      const protos = this.protos[kind];
      const cast = shadows && (kind === 'trees' || kind === 'spirals' || kind === 'rocks');
      // reparte as instâncias entre os protótipos
      protos.forEach((proto, pi) => {
        const mine = mats.filter((_, i) => i % protos.length === pi);
        if (!mine.length) return;
        if (proto.solid) { addIM(proto.solid, mat, mine, cast); addIM(proto.leaves, lmat, mine, cast); }
        else addIM(proto, kind === 'grass' ? gmat : mat, mine, cast);
      });
    }
    // troncos como colisores (cilindros → caixas finas) no referencial do corpo
    this.group = group;
    this.C0 = C0;
    this.entry = ctx.world.add(group, new THREE.Vector3(), { getPos: (out) => body.localToWorld(C0, ctx.time.world, out) });
    this.trunks = [...lists.trees, ...lists.spirals].map((m) => new THREE.Vector3().setFromMatrixPosition(m).applyQuaternion(this.qL).add(C0));
  }

  frame(ctx, night = 0) {
    if (!this.group || !this.body) return;
    this.group.quaternion.copy(this.body.rotationAt(ctx.time.world, this._q)).multiply(this.qL);
    if (this.mats.main) this.mats.main.userData.U.glow.value = 0.25 + night * 1.2;
    if (this.mats.grass) this.mats.grass.userData.U.glow.value = 0.25 + night * 1.2;
  }

  /** Empurra o jogador para fora dos troncos (local). */
  pushTrunks(local, radius = 0.35) {
    if (!this.trunks) return false;
    let hit = false;
    for (const t of this.trunks) {
      const d = local.clone().sub(t);
      const up = t.clone().normalize();
      const h = d.dot(up);
      if (h < -0.5 || h > 6) continue;
      d.addScaledVector(up, -h);
      const l = d.length(), R = 0.45 + radius;
      if (l < R && l > 1e-4) { local.addScaledVector(d, (R - l) / l); hit = true; }
    }
    return hit;
  }
}
