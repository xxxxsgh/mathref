// Acampamentos de combate em terra: barreiras de campo desdobráveis (com
// membrana de escudo holográfica na Hegemonia), caixotes de suprimento,
// torre de luz, antena, gerador; para os Corsários, muros de sucata, barris
// e lona. Tudo fundido numa malha por acampamento (+ escudos aditivos) e
// com colisores/coberturas no referencial do acampamento.
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, uv, abs, fract, smoothstep, min, max, sin, time, float, positionLocal } from 'three/tsl';
import { Kit, pal, kitMaterial } from './kit.js';

const D = Math.PI / 180;

const HEG = { plate: pal('#e6e2d8', 0.05, 0.34, 0, 0.25), trim: pal('#c9a24a', 0.9, 0.3, 0, 0.15), dark: pal('#23262b', 0.5, 0.45, 0, 0.3), glow: pal('#ffcf6a', 0, 0.3, 1, 0), steel: pal('#5a5e64', 0.9, 0.35, 0, 0.3), stripe: pal('#2a2e35', 0.1, 0.5, 0, 0.3) };
const COR = { plate: pal('#5a4c40', 0.6, 0.55, 0, 0.95), trim: pal('#7b2a1e', 0.3, 0.6, 0, 0.9), dark: pal('#2a2522', 0.5, 0.6, 0, 0.8), glow: pal('#ff4a30', 0, 0.3, 1, 0), steel: pal('#6b6157', 0.8, 0.5, 0, 0.9), stripe: pal('#c8a020', 0.2, 0.5, 0, 0.9), cloth: pal('#3a3226', 0, 0.95, 0, 0.6) };

/** Material holográfico do escudo (hexágonos dourados). */
function shieldMaterial(color = '#ffc860') {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const U = { k: uniform(1), color: uniform(new THREE.Color(color)) };
  m.colorNode = Fn(() => {
    const p = uv().mul(vec3(22, 7, 0).xy);
    const q = vec3(p.x.mul(1.1547), p.y.add(p.x.mul(0.5774)), 0);
    const f = fract(q.xy);
    const e = min(min(f.x, f.y), min(float(1).sub(f.x), float(1).sub(f.y)));
    const hex = smoothstep(0.05, 0.0, e);
    const v = uv().y, u = uv().x;
    const edgeX = smoothstep(0.08, 0.0, u).add(smoothstep(0.92, 1.0, u));
    const top = smoothstep(0.9, 1.0, v);
    const body = smoothstep(0.0, 0.15, v).mul(smoothstep(1.0, 0.75, v));
    const scan = smoothstep(0.97, 1.0, sin(v.mul(18).sub(time.mul(2.5))).mul(0.5).add(0.5));
    const fl = sin(time.mul(23.0).add(positionLocal.x.mul(3.0))).mul(0.06).add(0.94);
    const k = body.mul(hex.mul(0.22).add(0.05)).add(edgeX.mul(0.8)).add(top.mul(0.4)).add(scan.mul(body).mul(0.25));
    return vec4(U.color.mul(k.mul(U.k).mul(fl).mul(1.4)), 1);
  })();
  m.userData.U = U;
  void abs; void max;
  return m;
}

/**
 * Monta um acampamento. heightAt(x, z) → altura do terreno (m) relativa ao
 * centro, no plano local (x leste, z sul; −z = frente/ameaça).
 */
export function buildCamp(faction, rng, heightAt, { lite = false } = {}) {
  const P = faction === 'corsarios' ? COR : HEG;
  const K = new Kit();
  const colliders = [], covers = [], lights = [], shields = [];
  const H = (x, z) => heightAt(x, z);
  const box = (p, w, h, d, x, y, z, ry = 0, r = 0.02, rx = 0, rz = 0) => K.box('camp', p, w, h, d, [x, y, z], [rx, ry, rz], r);
  const addCol = (x, y, z, hw, hh, hd, ry = 0) => colliders.push({ center: new THREE.Vector3(x, y, z), half: new THREE.Vector3(hw, hh, hd), ry });

  /** Barreira de campo em (x,z), virada para `ang` (rad; 0 = −z). */
  const barrier = (x, z, ang) => {
    const y = H(x, z);
    const c = Math.cos(ang), s = Math.sin(ang);
    const fwd = new THREE.Vector3(-s, 0, -c); // frente da barreira (para a ameaça)
    const rt = new THREE.Vector3(c, 0, -s);
    const at = (u, v, w) => [x + rt.x * u + fwd.x * w, y + v, z + rt.z * u + fwd.z * w];
    if (faction === 'corsarios') {
      // muro de sucata: chapas tortas, vigas, barris
      for (let i = 0; i < 3; i++) {
        const u = -0.9 + i * 0.9;
        const tilt = (rng() - 0.5) * 0.25;
        K.box('camp', i % 2 ? P.plate : P.steel, 0.95, 1.05 + rng() * 0.3, 0.06, at(u, 0.55, 0), [tilt * 0.5 - 0.08, ang, tilt], 0.01);
      }
      K.box('camp', P.dark, 2.8, 0.14, 0.14, at(0, 0.95, -0.08), [0, ang, 0.04], 0.01);
      for (const u of [-1.3, 1.3]) K.box('camp', P.dark, 0.12, 1.3, 0.12, at(u, 0.6, -0.1), [0, ang, 0], 0.01);
      K.box('camp', P.stripe, 0.5, 0.12, 0.065, at(-0.6, 0.75, 0.02), [0, ang, 0.1], 0.005);
      addCol(...at(0, 0.6, 0), 1.45, 0.62, 0.18, ang);
    } else {
      // muralha de campo da Hegemonia: perfil chanfrado com seteira, base
      // escura, aba dourada no topo, pilares-emissores nas pontas e membrana
      const prof = [[0.25, 0.0], [-0.25, 0.0], [-0.3, 0.42], [-0.18, 1.05], [-0.02, 1.2], [0.12, 1.2], [0.2, 1.0], [0.3, 0.4]];
      // perfil em (x = frente, y = cima) extrudado na largura (ao longo de `rt`)
      const wall = (u0, u1, pal2, inset = 0) => {
        const w = u1 - u0;
        const pts = prof.map(([x, y]) => [x - inset, y]);
        K.profile('camp', pal2, pts, w, at((u0 + u1) / 2, 0, 0), [0, ang, 0], 0.03);
      };
      wall(-1.25, -0.35, P.plate); wall(0.35, 1.25, P.plate);
      wall(-0.35, 0.35, P.plate2 || P.plate);
      // seteira (fenda de tiro) escura no meio
      K.box('camp', P.dark, 0.5, 0.12, 0.62, at(0, 0.98, 0.0), [0, ang, 0], 0.02);
      // base escura e faixas
      K.box('camp', P.dark, 2.56, 0.36, 0.66, at(0, 0.18, 0.0), [0, ang, 0], 0.04);
      K.box('camp', P.trim, 2.52, 0.05, 0.2, at(0, 1.2, 0.03), [0, ang, 0], 0.02);
      K.box('camp', P.stripe, 0.62, 0.3, 0.05, at(-0.78, 0.66, -0.28), [-0.2, ang, 0], 0.01);
      K.box('camp', P.glow, 0.5, 0.025, 0.03, at(-0.78, 0.86, -0.3), [-0.2, ang, 0], 0.004);
      // pilares-emissores
      for (const u of [-1.32, 1.32]) {
        K.box('camp', P.steel, 0.18, 1.7, 0.24, at(u, 0.85, 0.0), [0, ang, 0], 0.04);
        K.box('camp', P.trim, 0.2, 0.08, 0.26, at(u, 1.72, 0.0), [0, ang, 0], 0.02);
        K.box('camp', P.glow, 0.04, 0.9, 0.05, at(u, 1.15, -0.13), [0, ang, 0], 0.01);
      }
      addCol(...at(0, 0.62, 0), 1.35, 0.62, 0.3, ang);
      // membrana de escudo acima da barreira (entre os pilares)
      shields.push({ pos: new THREE.Vector3(...at(0, 1.62, 0.0)), ang, w: 2.6, h: 0.85 });
    }
    covers.push({ pos: new THREE.Vector3(...at(0, 0, -0.85)), normal: fwd.clone(), height: 1.1, taken: null });
    covers.push({ pos: new THREE.Vector3(...at(-0.8, 0, -0.85)), normal: fwd.clone(), height: 1.1, taken: null });
  };
  const crate = (x, z, ry, sz = 1) => {
    const y = H(x, z);
    const w = 1.1 * sz, h = 0.8 * sz, d = 0.8 * sz;
    box(P.plate, w, h, d, x, y + h / 2, z, ry, 0.04);
    box(P.dark, w + 0.02, 0.06, d + 0.02, x, y + 0.04, z, ry, 0.01);
    box(P.trim, w + 0.02, 0.05, d * 0.3, x, y + h * 0.7, z, ry, 0.01);
    box(P.stripe, w * 0.4, h * 0.3, 0.02, x + Math.cos(ry) * 0 - Math.sin(ry) * (d / 2 + 0.005), y + h * 0.45, z - Math.cos(ry) * (d / 2 + 0.005), ry, 0.005);
    addCol(x, y + h / 2, z, w / 2, h / 2, d / 2, ry);
    return y + h;
  };
  const barrel = (x, z) => {
    const y = H(x, z);
    K.cyl('camp', faction === 'corsarios' ? P.trim : P.steel, 0.3, 0.3, 0.9, [x, y + 0.45, z], null, 14);
    K.torus('camp', P.dark, 0.3, 0.025, [x, y + 0.25, z], [Math.PI / 2, 0, 0], 16);
    K.torus('camp', P.dark, 0.3, 0.025, [x, y + 0.7, z], [Math.PI / 2, 0, 0], 16);
    K.box('camp', P.stripe, 0.62, 0.15, 0.62, [x, y + 0.5, z], null, 0.01);
    addCol(x, y + 0.45, z, 0.3, 0.45, 0.3);
  };
  const tower = (x, z) => {
    const y = H(x, z);
    K.cyl('camp', P.steel, 0.07, 0.1, 5.2, [x, y + 2.6, z], null, 10);
    for (const a of [0, 2.1, 4.2]) K.box('camp', P.steel, 0.05, 2.2, 0.05, [x + Math.cos(a) * 0.5, y + 1.0, z + Math.sin(a) * 0.5], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], 0.01);
    K.box('camp', P.dark, 0.9, 0.35, 0.3, [x, y + 5.3, z], null, 0.04);
    K.box('camp', P.glow, 0.8, 0.22, 0.04, [x, y + 5.28, z - 0.16], [8 * D, 0, 0], 0.01);
    lights.push({ pos: new THREE.Vector3(x, y + 5.0, z - 0.6), color: faction === 'corsarios' ? 0xff7040 : 0xffe0a0, intensity: 120, dist: 40 });
    addCol(x, y + 2.6, z, 0.15, 2.6, 0.15);
  };
  const antenna = (x, z) => {
    const y = H(x, z);
    K.cyl('camp', P.dark, 0.05, 0.05, 3.4, [x, y + 1.7, z], null, 8);
    K.box('camp', P.plate, 0.6, 0.5, 0.4, [x, y + 0.25, z], null, 0.04);
    K.geo('camp', P.plate, new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), [x, y + 3.0, z], [-1.1, 0.4, 0]);
    K.sphere('camp', P.glow, 0.05, [x, y + 3.45, z], null, 8);
    addCol(x, y + 0.25, z, 0.3, 0.25, 0.2);
  };
  const generator = (x, z, ry) => {
    const y = H(x, z);
    box(P.dark, 1.4, 0.9, 0.9, x, y + 0.45, z, ry, 0.08);
    box(P.plate, 1.42, 0.25, 0.92, x, y + 0.92, z, ry, 0.05);
    for (let i = 0; i < 4; i++) box(P.glow, 0.04, 0.5, 0.02, x - 0.45 + i * 0.3, y + 0.45, z - 0.46, ry, 0.0);
    K.cyl('camp', P.steel, 0.12, 0.12, 0.5, [x + 0.4, y + 1.25, z + 0.2], null, 10);
    lights.push({ pos: new THREE.Vector3(x, y + 0.6, z - 0.9), color: faction === 'corsarios' ? 0xff5030 : 0xffc060, intensity: 14, dist: 8 });
    addCol(x, y + 0.5, z, 0.7, 0.5, 0.45, ry);
  };
  const tarp = (x, z) => {
    const y = H(x, z);
    for (const [u, v] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) K.cyl('camp', P.dark, 0.04, 0.04, 2.2, [x + u, y + 1.1, z + v], null, 6);
    K.box('camp', P.cloth || P.plate, 3.4, 0.04, 2.8, [x, y + 2.15, z], [0.08, 0, 0.05], 0.01);
  };

  // ── disposição: arco de barreiras à frente, núcleo de caixotes, torre atrás
  const n = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 1.9 + (rng() - 0.5) * 0.2;
    const R = 9 + rng() * 3;
    barrier(Math.sin(a) * R, -Math.cos(a) * R, a);
  }
  // segunda linha (coberturas internas)
  for (let i = 0; i < 2; i++) {
    const x = (i ? 1 : -1) * (3 + rng() * 2), z = -2 + rng() * 2;
    const top = crate(x, z, rng() * 0.6, 1);
    if (rng() < 0.6) { const y2 = top; K.box('camp', P.plate, 0.9, 0.6, 0.7, [x + 0.05, y2 + 0.3, z], [0, 0.4, 0], 0.03); addCol(x, y2 + 0.3, z, 0.45, 0.3, 0.35, 0.4); }
    covers.push({ pos: new THREE.Vector3(x, H(x, z), z + 1.0), normal: new THREE.Vector3(0, 0, -1), height: 0.8, taken: null });
  }
  if (faction === 'corsarios') { barrel(-1.2, 3.5); barrel(-0.5, 3.9); barrel(2.4, 1.5); tarp(0.5, 5.5); }
  else { crate(0.6, 4.2, 0.2, 1.2); crate(-1.6, 4.6, -0.3, 0.9); generator(3.6, 4.6, 0.3); antenna(-4.2, 5.0); }
  tower(faction === 'corsarios' ? 4 : -2.8, 2.2);

  const mat = kitMaterial({ lite, scale: 4 });
  const bones = K.build(mat, { shadows: !lite });
  const group = new THREE.Group(); group.name = 'acampamento-' + faction;
  group.add(bones.camp);
  // escudos (um mesh fundido)
  if (shields.length) {
    const geos = shields.map((s) => {
      const g = new THREE.PlaneGeometry(s.w, s.h, 1, 1);
      g.rotateX(-12 * D); g.rotateY(s.ang); g.translate(s.pos.x, s.pos.y, s.pos.z);
      return g;
    });
    const merged = geos.length > 1 ? mergeAll(geos) : geos[0];
    const sm = new THREE.Mesh(merged, shieldMaterial());
    sm.renderOrder = 12; sm.frustumCulled = false;
    group.add(sm);
  }
  return { group, mat, colliders, covers, lights };
}

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
function mergeAll(geos) { return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false); }

/** Depósito mineral (aglomerado de cristais) para o laser de mineração. */
export function buildDeposit(kind, rng, { lite = false } = {}) {
  const COL = { 'cristal': '#7fe8ff', 'ferro': '#c8643a', 'ouro': '#ffc850', 'carbono': '#7cff6a', 'relíquia': '#9fb8ff', 'enxofre': '#e8f04a', 'cobalto': '#4a7cff' };
  const c = COL[kind] || '#7fe8ff';
  const K = new Kit();
  const rock = pal('#3a3936', 0.1, 0.8, 0, 0.4);
  K.geo('d', rock, new THREE.DodecahedronGeometry(0.9, 0), [0, 0.2, 0], [rng(), rng(), rng()], [1.3, 0.7, 1.1]);
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.6;
    const h = 0.6 + rng() * 1.3;
    K.geo('d', pal(c, 0.1, 0.12, 0.35 + rng() * 0.25, 0), new THREE.CylinderGeometry(0, 0.12 + rng() * 0.1, h, 5), [Math.cos(a) * r, 0.4 + h / 2, Math.sin(a) * r], [(rng() - 0.5) * 0.9, rng() * 3, (rng() - 0.5) * 0.9]);
  }
  const mat = kitMaterial({ lite, scale: 5 });
  const b = K.build(mat, { shadows: !lite });
  const g = new THREE.Group(); g.add(b.d);
  return { group: g, mat, color: c };
}
