// Plantas das naves maiores: cargueiro (com módulos de carga trocáveis),
// explorador de longo alcance (anel de salto, mastro de sensores) e fragata
// (torres, hangar ventral, ponte). Todas têm âncora de interior andável.
import * as THREE from 'three/webgpu';
import { Z, M, onSurface, loft, plate, fin, box, cyl, cylZ, sphere, latheZ, vent, rcs, antenna, pipe, gunBarrel, dish, torusZ } from './geo.js';
import { engine, canopy, navLights, stripLight, dress, V } from './kit.js';
import { addGear } from './bpSmall.js';
import { turret } from './capital.js';

/** Contêiner de carga com nervuras (origem no centro). */
function container(P, m, w, h, d, zone, rng) {
  P.add(box(w, h, d, 0.08), zone, { m, wear: 0.9 });
  const ribs = Math.max(3, Math.round(d / 1.1));
  for (let i = 0; i <= ribs; i++) {
    const z = -d / 2 + (i / ribs) * d;
    P.add(box(w + 0.08, 0.12, 0.14), Z.DARK, { m: m.clone().multiply(M(0, h / 2, z)), detail: true });
    P.add(box(0.12, h + 0.08, 0.14), Z.DARK, { m: m.clone().multiply(M(w / 2, 0, z)), detail: true });
    P.add(box(0.12, h + 0.08, 0.14), Z.DARK, { m: m.clone().multiply(M(-w / 2, 0, z)), detail: true });
  }
  // trava e etiqueta (faixa secundária)
  P.add(box(w * 0.3, 0.06, d * 0.08), Z.SECONDARY, { m: m.clone().multiply(M(w * 0.25, h / 2 + 0.05, d * 0.3)), detail: true });
}

export function buildFreighter(bp, style, rng, faction) {
  const P = bp.parts;
  const e = Math.max(3.5, style.shape.e);
  // módulo de comando (proa)
  const cab = loft([
    { z: -25, w: 0.4, h: 0.4, y: 0.4, e: 2 },
    { z: -24, w: 2.2, h: 1.8, hb: 1.6, y: 0.4, e },
    { z: -21, w: 3.4, h: 2.8, hb: 2.4, y: 0.6, e },
    { z: -16, w: 3.8, h: 3.0, hb: 2.6, y: 0.6, e },
    { z: -12, w: 3.4, h: 2.6, hb: 2.4, y: 0.4, e },
  ], { seg: 40, sub: 4 });
  P.add(cab.geo, Z.PRIMARY, { wear: 0.6 });
  canopy(bp, { z0: -24.6, z1: -19.0, w: 2.6, h: 1.6, y: 1.6, ribs: 4, frameZone: Z.DARK, r: 0.09, e: 2.6 });
  bp.eye = V(-0.9, 2.4, -21.6);
  // quilha / espinha treliçada
  const keel = loft([{ z: -13, w: 1.85, h: 1.95, e: 5 }, { z: 14, w: 1.85, h: 1.95, e: 5 }], { seg: 20, sub: 1 });
  P.add(keel.geo, Z.DARK, { wear: 0.8 });
  for (let z = -11; z < 14; z += 2.5) {
    for (const s of [1, -1]) P.add(box(0.2, 0.2, 3.4), Z.METAL, { m: M(s * 1.75, 2.0, z + 1.2, 0.6, 0, 0), detail: true });
    P.add(box(3.8, 0.25, 0.25), Z.METAL, { m: M(0, 2.02, z), detail: true });
  }
  // módulos de carga (customizáveis: opts.modules.cargo = 0..16)
  const nCargo = Math.min(16, bp.modules.cargo ?? 12);
  let k = 0;
  const slots = [];
  for (let i = 0; i < 4; i++) for (const [x, y] of [[3.6, 0], [-3.6, 0], [3.6, 3.8], [-3.6, 3.8]]) slots.push([x, y, -9 + i * 6.4]);
  for (const [x, y, z] of slots) {
    if (k++ >= nCargo) break;
    const zone = faction === 'guilda' ? (rng.chance(0.5) ? Z.SECONDARY : Z.PRIMARY) : rng.pick([Z.PRIMARY, Z.SECONDARY, Z.METAL, Z.PRIMARY]);
    container(P, M(x, y - 1.2, z), 3.4, 3.4, 6.0, zone, rng);
  }
  bp.cargoSlots = slots.length;
  // bloco de propulsão
  const eb = loft([
    { z: 13, w: 3.0, h: 2.6, e },
    { z: 15, w: 5.2, h: 3.8, e },
    { z: 21, w: 5.4, h: 4.0, e },
    { z: 23.5, w: 4.8, h: 3.6, e },
  ], { seg: 36, sub: 3 });
  P.add(eb.geo, Z.PRIMARY, { wear: 0.7 });
  for (const [x, y] of [[2.6, 1.8], [-2.6, 1.8], [2.6, -1.8], [-2.6, -1.8]]) engine(bp, { x, y, z0: 18, z1: 24.5, r: 1.35, style, nacelle: false, plume: 12 });
  P.add(box(10.6, 7.6, 1.2, 0.3), Z.DARK, { m: M(0, 0, 23.6) });
  // radiadores laterais
  for (const s of [1, -1]) {
    P.add(box(0.3, 3.2, 6.5, 0.05), Z.METAL, { m: M(s * 6.4, 0.6, 17.5), wear: 0.4 });
    for (let i = 0; i < 9; i++) P.add(box(1.2, 3.0, 0.08), Z.DARK, { m: M(s * 7.1, 0.6, 14.6 + i * 0.72), detail: true });
    P.add(box(1.4, 0.4, 0.4), Z.DARK, { m: M(s * 5.9, 0.6, 17.5), detail: true });
  }
  // pernas de pouso pesadas
  for (const [x, z] of [[2.6, -17], [-2.6, -17], [4.4, 15], [-4.4, 15]]) {
    addGear(bp, { pivot: V(x, z < 0 ? -2.0 : -3.5, z), len: z < 0 ? 2.6 : 1.6, fold: z < 0 ? -1 : 1, pad: 1.1, r: 0.2, doorW: 0.7, doorL: 2.4, bayDepth: 0.6 });
  }
  // rampa de embarque sob a cabine
  P.add(box(2.4, 0.2, 4.2, 0.05), Z.DARK, { m: M(0, -2.4, -14.5) });
  P.light(V(0, -2.55, -13), [1, 0.9, 0.7], 12, 0.15);
  // janelas laterais da cabine
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) P.glowPart(box(0.05, 0.5, 0.9), [1.0, 0.82, 0.55], 4, { m: M(s * 3.72, 1.2, -18.6 + i * 1.3) });
  dress(bp, cab, style, rng, { z0: -23, z1: -12.5, scale: 2.2, faction });
  P.add(dish(1.2), Z.METAL, { m: M(0, 3.4, -13.5, -0.3, 0, 0), detail: true });
  P.add(antenna(3.5, 0.05), Z.METAL, { m: M(1.6, 3.0, -14) , detail: true });
  stripLight(bp, eb, { z0: 15.5, z1: 21, a: 0.0, color: style.glow, power: 4, width: 0.12 });
  navLights(bp, style, { tip: V(7.6, 0.6, 17.5), strobes: [V(0, 4.1, 19), V(0, 3.4, -18)], beacon: V(0, -4.1, 18), size: 0.18 });
  bp.interior = 'freighter';
  bp.interiorAnchor = V(0, 0, 0);
  bp.colliders.push({ center: V(0, 0.6, -18.5), half: V(3.9, 3.2, 6.6) });
  bp.colliders.push({ center: V(0, 0.9, 1.5), half: V(5.4, 3.6, 12) });
  bp.colliders.push({ center: V(0, 0, 18.5), half: V(7.6, 4.2, 5.5) });
}

export function buildExplorer(bp, style, rng, faction) {
  const P = bp.parts;
  const e = style.shape.e;
  const st = [
    { z: -20, w: 0.08, h: 0.08, e: 2 },
    { z: -17.5, w: 1.2, h: 0.9, hb: 0.8, e },
    { z: -12, w: 2.5, h: 2.0, hb: 1.6, e },
    { z: -5, w: 3.0, h: 2.6, hb: 2.0, e },
    { z: 4, w: 2.8, h: 2.4, hb: 2.0, e },
    { z: 11, w: 2.2, h: 2.0, hb: 1.8, e },
    { z: 15, w: 1.8, h: 1.7, hb: 1.6, e },
  ];
  const L = loft(st, { seg: 40, sub: 5 });
  P.add(L.geo, Z.PRIMARY, { wear: 0.4 });
  bp.hullLoft = L;
  canopy(bp, { z0: -17.2, z1: -10.5, w: 1.7, h: 1.2, y: 1.3, ribs: 3, frameZone: faction === 'hegemonia' ? Z.TRIM : Z.DARK, r: 0.07 });
  bp.eye = V(0, 2.1, -13.6);
  // módulo habitacional com janelas
  for (const s of [1, -1]) for (let i = 0; i < 7; i++) P.glowPart(box(0.05, 0.35, 0.7), [1.0, 0.85, 0.6], 4, { m: M(s * 2.96, 0.8, -6 + i * 1.4) });
  // anel do motor de salto
  const ringZ = 7;
  P.add(torusZ(5.6, 0.42, 64), Z.SECONDARY, { m: M(0, 0, ringZ), wear: 0.3 });
  P.add(torusZ(5.6, 0.2, 64), Z.DARK, { m: M(0, 0, ringZ + 0.55) });
  P.glowPart(torusZ(5.6, 0.12, 64), style.engine, 5, { m: M(0, 0, ringZ - 0.42) });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const g = box(0.35, 3.2, 1.2, 0.08);
    P.add(g, Z.PRIMARY, { m: M(Math.sin(a) * 4.0, Math.cos(a) * 4.0, ringZ, 0, 0, -a), wear: 0.4 });
    P.add(box(0.8, 0.8, 1.6, 0.1), Z.DARK, { m: M(Math.sin(a) * 5.6, Math.cos(a) * 5.6, ringZ, 0, 0, -a), detail: true });
  }
  // mastro de sensores + prato
  P.add(box(0.3, 2.4, 0.5), Z.METAL, { m: M(0, 3.4, -3.5, -0.2, 0, 0) });
  P.add(dish(1.6), Z.METAL, { m: M(0, 4.6, -3.8, -0.9, 0, 0) });
  P.add(antenna(2.2, 0.04), Z.METAL, { m: M(0.9, 2.5, 2), detail: true });
  P.add(antenna(1.6, 0.04), Z.METAL, { m: M(-0.9, 2.5, 3), detail: true });
  // painéis/aletas radiais
  P.add(plate([[2.6, 1], [7.5, 5.5], [7.5, 9.5], [2.4, 10]], 0.16, { bevel: 0.04 }), Z.PRIMARY, { m: M(0, -0.6, 0, 0, 0, -0.18), mirror: true, wear: 0.4 });
  P.add(plate([[6.4, 5.0], [7.5, 5.5], [7.5, 9.5], [6.4, 9.6]], 0.2, { bevel: 0.04 }), Z.SECONDARY, { m: M(0, -0.6, 0, 0, 0, -0.18), mirror: true });
  P.add(fin([[6, 0], [13, 0], [14.5, 3.4], [12.6, 3.5], [8, 0.4]], 0.16), Z.SECONDARY, { m: M(0, 1.9, 0) });
  // motores
  engine(bp, { x: 0, y: 0, z0: 12, z1: 16.5, r: 1.4, style, nacelle: false, plume: 14, ringZone: Z.TRIM });
  engine(bp, { x: 2.6, y: -0.8, z0: 7, z1: 15.5, r: 0.7, style, mirror: true, plume: 7 });
  // trem
  addGear(bp, { pivot: V(0, -1.4, -13), len: 2.0, fold: -1, pad: 0.7, r: 0.12, doorW: 0.45, doorL: 1.8 });
  addGear(bp, { pivot: V(2.0, -1.8, 6), len: 1.7, fold: 1, pad: 0.8, r: 0.13, doorW: 0.5, doorL: 2.0 });
  addGear(bp, { pivot: V(-2.0, -1.8, 6), len: 1.7, fold: 1, pad: 0.8, r: 0.13, doorW: 0.5, doorL: 2.0 });
  dress(bp, L, style, rng, { z0: -15, z1: 13, scale: 1.6, faction });
  stripLight(bp, L, { z0: -9, z1: 10, a: -0.25, color: style.glow, power: 4, width: 0.08 });
  navLights(bp, style, { tip: V(7.6, -0.6, 8), strobes: [V(0, 5.4, 13.5)], beacon: V(0, -2.0, 0), size: 0.14 });
  bp.interior = 'explorer';
  bp.colliders.push({ center: V(0, 0, -2.5), half: V(3.1, 2.7, 17.5) });
  bp.colliders.push({ center: V(0, 0, ringZ), half: V(6.1, 6.1, 0.8) });
}

export function buildFrigate(bp, style, rng, faction) {
  const P = bp.parts;
  const e = Math.max(3, style.shape.e);
  const st = [
    { z: -66, w: 1, h: 1, y: -1, e: 2 },
    { z: -60, w: 6, h: 4, hb: 3.5, y: -1, e },
    { z: -40, w: 11, h: 7, hb: 6, e },
    { z: -10, w: 14, h: 8.5, hb: 7.5, e },
    { z: 25, w: 15, h: 9, hb: 8, e },
    { z: 48, w: 13, h: 8, hb: 7.5, e },
    { z: 56, w: 11, h: 7, hb: 6.5, e },
  ];
  const L = loft(st, { seg: 44, sub: 4 });
  P.add(L.geo, Z.PRIMARY, { wear: 0.5 });
  bp.hullLoft = L;
  const keel = loft(st.slice(1).map((s) => ({ ...s, w: s.w * 0.5, h: 0.5, hb: s.hb * 1.12 })), { seg: 28, sub: 3 });
  P.add(keel.geo, Z.DARK, { wear: 0.6 });
  // flancos em degrau
  for (const s of [1, -1]) P.add(box(1.5, 3.2, 70), Z.SECONDARY, { m: M(s * 14.6, 0, 5, 0, s * 0.02, 0), wear: 0.4 });
  // ponte
  const top = 8.5;
  const br = loft([
    { z: 6, w: 3, h: 1, hb: 0.5, y: top, e: 4 },
    { z: 10, w: 6, h: 6, hb: 0.5, y: top, e: 5 },
    { z: 20, w: 6.5, h: 7, hb: 0.5, y: top, e: 5 },
    { z: 25, w: 4, h: 4, hb: 0.5, y: top, e: 4 },
  ], { seg: 24, sub: 3 });
  P.add(br.geo, Z.PRIMARY, { wear: 0.3 });
  P.add(box(15, 2.2, 6, 0.4), Z.PRIMARY, { m: M(0, top + 7, 12) });
  P.add(box(15.2, 0.4, 6.2), faction === 'hegemonia' ? Z.TRIM : Z.SECONDARY, { m: M(0, top + 8.2, 12) });
  P.glowPart(box(14.2, 0.6, 0.12), [1.0, 0.85, 0.6], 6, { m: M(0, top + 7.2, 8.95) });
  bp.eye = V(0, top + 7.2, 10);
  P.add(antenna(9, 0.16), Z.METAL, { m: M(2, top + 8.4, 14), detail: true });
  P.add(dish(2.4), Z.METAL, { m: M(-3, top + 6.5, 20, -0.5, 0, 0), detail: true });
  // greebles de convés
  for (let i = 0; i < 40; i++) {
    const z = rng.range(-50, 50), a = Math.PI / 2 + rng.range(-0.8, 0.8);
    const q = L.at(z, a);
    const w = rng.range(1, 4), h = rng.range(0.4, 2), d = rng.range(2, 7);
    P.add(box(w, h, d), rng.pick([Z.PRIMARY, Z.DARK, Z.METAL]), { m: onSurface(q.pos, q.normal).multiply(M(0, h / 2 - 0.1, 0)), detail: i % 2 === 0, wear: 0.6 });
  }
  for (const [z, a] of [[-30, 0.2], [-10, 0.2], [30, 0.2], [-30, Math.PI - 0.2], [-10, Math.PI - 0.2], [30, Math.PI - 0.2]]) {
    const q = L.at(z, a);
    P.add(vent(3, 5, 8, 0.3), Z.DARK, { m: onSurface(q.pos, q.normal), detail: true });
  }
  // janelas
  for (const s of [1, -1]) for (let z = -38; z < 46; z += 2.6) if (rng.chance(0.75)) P.glowPart(box(0.1, 0.5, 1.0), [1.0, 0.84, 0.58], 4, { m: M(s * (L.params(z).w + 0.02), 2.4, z) });
  // hangar ventral
  P.add(box(12, 1.2, 18), Z.TRIM, { m: M(0, -8.6, 0) });
  P.glowPart(box(10, 0.3, 16), [0.3, 0.5, 1.0], 0.8, { m: M(0, -9.3, 0) });
  for (let i = 0; i < 4; i++) P.glowPart(box(9, 0.2, 0.4), [1.0, 0.85, 0.6], 3, { m: M(0, -9.2, -6 + i * 4) });
  bp.hangars.push({ id: 'hangar', pos: V(0, -11, 0), dir: V(0, -1, 0), size: V(10, 4, 16) });
  // motores
  for (const [x, y, r] of [[0, 0, 4.2], [-8, -1, 3.2], [8, -1, 3.2], [-4.5, 5, 2.4], [4.5, 5, 2.4], [-4.5, -5.5, 2.4], [4.5, -5.5, 2.4]]) engine(bp, { x, y, z0: 46, z1: 60, r, style, nacelle: false, plume: r * 6, ringZone: Z.TRIM });
  P.add(box(24, 16, 3, 0.6), Z.DARK, { m: M(0, 0, 57) });
  // torres
  for (const [z, a, sz, kind] of [[-42, Math.PI / 2, 2.6, 'heavy'], [-26, Math.PI / 2, 2.6, 'heavy'], [34, Math.PI / 2, 2.2, 'medium'], [-10, 0.35, 1.8, 'medium'], [-10, Math.PI - 0.35, 1.8, 'medium'], [20, -Math.PI / 2 + 0.4, 1.4, 'pd'], [20, -Math.PI / 2 - 0.4, 1.4, 'pd']]) {
    const q = L.at(z, a);
    turret(bp, q.pos, q.normal, sz, kind, style);
  }
  dress(bp, L, style, rng, { z0: -55, z1: 45, scale: 4, faction });
  navLights(bp, style, { tip: V(15.5, 0, 20), strobes: [V(0, top + 17, 14), V(0, -9, 40)], beacon: V(0, top + 9, 18), size: 0.4 });
  addGear(bp, { pivot: V(6, -8, -30), len: 4, fold: -1, pad: 2.4, r: 0.5, doorW: 1.6, doorL: 5, bayDepth: 1.2 });
  addGear(bp, { pivot: V(-6, -8, -30), len: 4, fold: -1, pad: 2.4, r: 0.5, doorW: 1.6, doorL: 5, bayDepth: 1.2 });
  addGear(bp, { pivot: V(8, -8, 34), len: 4, fold: 1, pad: 2.4, r: 0.5, doorW: 1.6, doorL: 5, bayDepth: 1.2 });
  addGear(bp, { pivot: V(-8, -8, 34), len: 4, fold: 1, pad: 2.4, r: 0.5, doorW: 1.6, doorL: 5, bayDepth: 1.2 });
  bp.interior = 'frigate';
  bp.colliders.push({ center: V(0, 0, -5), half: V(15.5, 9, 61) });
}
