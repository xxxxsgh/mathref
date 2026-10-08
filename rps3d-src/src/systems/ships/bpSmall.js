// Plantas das naves pequenas: caça leve e interceptador, com variações de
// forma por facção (nariz, asa, aletas, motores) além da pintura.
import * as THREE from 'three/webgpu';
import { Z, M, onSurface, loft, plate, fin, box, cyl, cylZ, sphere, latheZ, vent, rcs, antenna, pipe, gunBarrel } from './geo.js';
import { engine, canopy, gearLeg, missile, navLights, stripLight, dress, V } from './kit.js';

/** Trem de pouso padrão: perna + portas do alojamento. */
export function addGear(bp, { pivot, len, fold = 1, kind = 'pad', pad = 0.4, r = 0.07, doorW = 0.3, doorL = 1.2, doors = true, bayDepth = 0.3 }) {
  const leg = gearLeg(bp.seed + bp.gear.length, { len, r, pad, kind });
  const P = bp.parts;
  // alojamento escuro (visível com as portas abertas)
  P.add(box(doorW * 2 * 0.95, bayDepth, doorL * 0.95), Z.DARK, { m: M(pivot.x, pivot.y + bayDepth * 0.5 - 0.02, pivot.z + fold * doorL * 0.25) });
  const g = { pivot: pivot.clone(), parts: leg, axis: 'x', stow: fold * Math.PI / 2, doorList: [] };
  if (doors) for (const s of [1, -1]) {
    const dp = new (leg.constructor)(bp.seed + 77);
    dp.add(box(doorW, 0.04, doorL, 0.01), Z.PRIMARY, { m: M(s * doorW / 2, 0, 0), wear: 0.6 });
    g.doorList.push({ pivot: V(pivot.x + s * doorW * 2 * 0.5, pivot.y - 0.03, pivot.z + fold * doorL * 0.25), parts: dp, axis: 'z', open: -s * 1.45, side: s });
  }
  bp.gear.push(g);
  bp.gearHeight = Math.max(bp.gearHeight || 0, -(pivot.y - len - pad * 0.15));
  return g;
}

/** Caça leve. Variante pela facção. */
export function buildFighter(bp, style, rng, faction) {
  const P = bp.parts;
  const e = style.shape.e;
  const F = {
    hegemonia: { nose: 8.3, wing: 'delta', fins: 'twin', w: 1.0 },
    frente: { nose: 7.2, wing: 'straight', fins: 'single', w: 1.08 },
    corsarios: { nose: 9.6, wing: 'forward', fins: 'blades', w: 0.92 },
    guilda: { nose: 7.0, wing: 'stub', fins: 'twinSmall', w: 1.12 },
  }[faction] || { nose: 8.3, wing: 'delta', fins: 'twin', w: 1 };
  const W = F.w;
  const st = [
    { z: -F.nose, w: 0.05, h: 0.05, y: -0.1, e: 2 },
    { z: -F.nose + 0.9, w: 0.36 * W, h: 0.28, hb: 0.25, y: -0.1, e },
    { z: -5.6, w: 0.78 * W, h: 0.55, hb: 0.5, y: -0.05, e },
    { z: -3.6, w: 1.0 * W, h: 0.68, hb: 0.62, y: 0, e },
    { z: -1.2, w: 1.22 * W, h: 0.72, hb: 0.66, y: 0, e },
    { z: 1.5, w: 1.42 * W, h: 0.64, hb: 0.66, y: 0, e },
    { z: 4.5, w: 1.32 * W, h: 0.56, hb: 0.6, y: 0, e },
    { z: 7.0, w: 1.02 * W, h: 0.48, hb: 0.5, y: 0, e },
    { z: 7.7, w: 0.84 * W, h: 0.4, hb: 0.42, y: 0, e },
  ];
  const L = loft(st, { seg: 40, sub: 5 });
  P.add(L.geo, Z.PRIMARY, { wear: 0.5, cut: true });
  bp.hullLoft = L;

  // ponta do nariz (radome) em cor secundária/escura
  const nose = loft([{ z: -F.nose - 0.02, w: 0.06, h: 0.06, y: -0.1, e: 2 }, { z: -F.nose + 0.6, w: 0.3 * W, h: 0.23, hb: 0.21, y: -0.1, e }, { z: -F.nose + 1.0, w: 0.38 * W, h: 0.3, hb: 0.27, y: -0.1, e }], { seg: 40, sub: 3 });
  P.add(nose.geo, faction === 'hegemonia' ? Z.TRIM : Z.SECONDARY, { m: M(0, 0, 0, 0, 0, 0, 1.03, 1.03, 1.0), wear: 0.3 });
  // pitot
  P.add(cylZ(0.02, 0.012, 1.1, 6), Z.METAL, { m: M(0, -0.1, -F.nose - 0.5), detail: true });

  // espinha dorsal atrás do canopy
  const spine = loft([
    { z: -1.6, w: 0.08, h: 0.05, y: 0.62, e: 2.5 },
    { z: -0.6, w: 0.5, h: 0.28, hb: 0.1, y: 0.6, e: 3 },
    { z: 3.5, w: 0.5, h: 0.26, hb: 0.1, y: 0.56, e: 3 },
    { z: 6.6, w: 0.3, h: 0.1, hb: 0.1, y: 0.42, e: 3 },
  ], { seg: 24, sub: 3 });
  P.add(spine.geo, Z.PRIMARY, { wear: 0.4, cut: true });
  P.add(vent(0.42, 1.2, 8, 0.05), Z.DARK, { m: M(0, 0.86, 1.0), detail: true });
  P.add(vent(0.36, 0.8, 6, 0.05), Z.DARK, { m: M(0, 0.83, 2.6), detail: true });

  // canopy
  const cz0 = -5.15, cz1 = -1.2;
  canopy(bp, { z0: cz0, z1: cz1, w: 0.62 * W, h: 0.6, y: 0.42, ribs: faction === 'corsarios' ? 4 : 2, frameZone: faction === 'hegemonia' ? Z.TRIM : Z.DARK });
  bp.eye = V(0, 0.74, -3.05);

  // entradas de ar
  for (const s of [1, -1]) {
    const ix = s * 1.32 * W;
    const intake = loft([
      { z: -2.0, w: 0.3, h: 0.36, e: 5, x: ix, y: -0.22 },
      { z: -1.2, w: 0.36, h: 0.42, e: 5, x: ix, y: -0.22 },
      { z: 1.5, w: 0.34, h: 0.4, e: 5, x: ix * 0.92, y: -0.22 },
      { z: 2.5, w: 0.2, h: 0.3, e: 5, x: ix * 0.85, y: -0.22 },
    ], { seg: 24, sub: 3, capStart: false });
    P.add(intake.geo, faction === 'guilda' ? Z.SECONDARY : Z.PRIMARY, { wear: 0.6 });
    P.add(box(0.56, 0.68, 0.05), Z.DARK, { m: M(ix, -0.22, -1.7) });
    // lábio da entrada
    P.add(box(0.66, 0.05, 0.12), Z.TRIM, { m: M(ix, 0.2, -2.0), detail: true });
    // compressor visível
    P.add(cylZ(0.24, 0.24, 0.04, 16), Z.METAL, { m: M(ix, -0.22, -1.6), detail: true });
    for (let k = 0; k < 9; k++) P.add(box(0.03, 0.46, 0.02), Z.DARK, { m: M(ix, -0.22, -1.58, 0, 0, (k / 9) * Math.PI), detail: true });
  }

  // motores
  const mism = faction === 'frente';
  engine(bp, { x: 1.0 * W, y: -0.05, z0: 0.6, z1: 7.85, r: 0.6, style, cowlZone: mism ? Z.METAL : Z.PRIMARY, ringZone: faction === 'hegemonia' ? Z.TRIM : Z.DARK });
  engine(bp, { x: -1.0 * W, y: -0.05, z0: 0.6, z1: 7.85, r: mism ? 0.54 : 0.6, style, cowlZone: mism ? Z.SECONDARY : Z.PRIMARY, ringZone: faction === 'hegemonia' ? Z.TRIM : Z.DARK });
  if (faction === 'corsarios') {
    // propulsores auxiliares de arranque
    engine(bp, { x: 0.45, y: 0.55, z0: 4.2, z1: 7.2, r: 0.22, style, mirror: true, cowlZone: Z.DARK, plume: 2.2 });
  }

  // asas
  const wingY = -0.18;
  let inner, outer, tipX, tipZ;
  if (F.wing === 'delta') {
    inner = [[1.0, -0.6], [5.5, 3.3], [5.5, 6.4], [1.0, 6.6]];
    outer = [[5.5, 3.3], [6.4, 4.2], [6.95, 4.55], [6.95, 6.3], [5.5, 6.4]];
    tipX = 6.95; tipZ = 5.4;
  } else if (F.wing === 'straight') {
    inner = [[1.0, 1.2], [5.0, 2.4], [5.0, 5.6], [1.0, 6.4]];
    outer = [[5.0, 2.4], [6.4, 2.75], [6.6, 3.0], [6.6, 5.0], [5.0, 5.6]];
    tipX = 6.6; tipZ = 4.0;
  } else if (F.wing === 'forward') {
    inner = [[1.0, 0.4], [4.6, 1.6], [4.9, 3.6], [1.0, 6.6]];
    outer = [[4.6, 1.6], [6.6, 0.2], [7.3, -0.4], [7.0, 1.6], [4.9, 3.6]];
    tipX = 7.1; tipZ = 0.4;
  } else {
    inner = [[1.0, 0.6], [4.0, 1.4], [4.0, 5.4], [1.0, 6.2]];
    outer = [[4.0, 1.4], [4.8, 1.6], [4.8, 5.0], [4.0, 5.4]];
    tipX = 4.8; tipZ = 3.4;
  }
  const wingM = (s) => M(0, wingY, 0, 0, 0, -s * 0.05);
  const gInner = plate(inner, 0.26, { bevel: 0.07 });
  const gOuter = plate(outer, 0.22, { bevel: 0.06 });
  P.add(gInner, Z.PRIMARY, { m: wingM(1), mirror: true, wear: 0.6 });
  P.add(gOuter, faction === 'hegemonia' ? Z.TRIM : Z.SECONDARY, { m: wingM(1), mirror: true, wear: 0.6 });
  // flapes (painel escuro na borda de fuga)
  const flap = plate([[1.6, 5.9], [4.8, 5.75], [4.8, 6.35], [1.6, 6.55]], 0.27, { bevel: 0.02 });
  P.add(flap, Z.DARK, { m: wingM(1), mirror: true, detail: true });
  // canhões nas pontas (ou casulos na Guilda)
  const gunX = tipX + 0.05, gunY = wingY - 0.02;
  const podLen = faction === 'guilda' ? 3.2 : 2.6;
  P.add(latheZ([[0.001, -podLen / 2 - 0.3], [0.13, -podLen / 2], [0.17, 0], [0.16, podLen / 2], [0.1, podLen / 2 + 0.2]], 14), faction === 'guilda' ? Z.SECONDARY : Z.DARK, { m: M(gunX, gunY, tipZ), mirror: true });
  P.add(gunBarrel(1.8, 0.055), Z.METAL, { m: M(gunX, gunY, tipZ - podLen / 2 - 0.2), mirror: true });
  bp.hardpoints.push({ id: 'canhao_e', type: 'gun', pos: V(-gunX, gunY, tipZ - podLen / 2 - 2.0), dir: V(0, 0, -1) });
  bp.hardpoints.push({ id: 'canhao_d', type: 'gun', pos: V(gunX, gunY, tipZ - podLen / 2 - 2.0), dir: V(0, 0, -1) });
  // canhão de queixo
  P.add(box(0.36, 0.22, 1.1, 0.06), Z.DARK, { m: M(0, -0.62, -4.6) });
  P.add(gunBarrel(1.4, 0.06), Z.METAL, { m: M(0, -0.66, -5.1) });
  bp.hardpoints.push({ id: 'queixo', type: 'gun', pos: V(0, -0.66, -6.6), dir: V(0, 0, -1) });
  // pilones e mísseis
  for (const s of [1, -1]) {
    const mx = s * 3.3;
    P.add(box(0.12, 0.3, 1.3, 0.03), Z.DARK, { m: M(mx, wingY - 0.25, 3.4), detail: true });
    missile(P, M(mx, wingY - 0.52, 3.2), 2.4, 0.11, faction === 'hegemonia' ? Z.PRIMARY : Z.METAL);
    bp.hardpoints.push({ id: s > 0 ? 'missil_d' : 'missil_e', type: 'missile', pos: V(mx, wingY - 0.52, 2.0), dir: V(0, 0, -1) });
  }

  // aletas
  if (F.fins === 'twin' || F.fins === 'blades') {
    const prof = F.fins === 'blades'
      ? [[3.6, 0], [6.8, 0], [8.4, 2.2], [7.6, 2.3], [6.6, 1.2], [4.4, 0.3]]
      : [[3.8, 0], [6.6, 0], [7.8, 2.0], [7.0, 2.1], [4.6, 0.25]];
    const g = fin(prof, 0.13, { bevel: 0.04 });
    const cant = F.fins === 'blades' ? 0.55 : 0.32;
    P.add(g, Z.PRIMARY, { m: M(1.0 * W, 0.42, 0, 0, 0, -cant), mirror: true, wear: 0.5 });
    // ponta da aleta (secundária)
    const tipG = fin([[prof[2][0] - 1.0, prof[2][1] - 0.45], [prof[2][0], prof[2][1]], [prof[3][0], prof[3][1]], [prof[3][0] - 0.9, prof[2][1] - 0.4]], 0.15, { bevel: 0.02 });
    P.add(tipG, faction === 'hegemonia' ? Z.TRIM : Z.SECONDARY, { m: M(1.0 * W, 0.42, 0, 0, 0, -cant), mirror: true });
    const tp = V(1.0 * W + Math.sin(cant) * prof[2][1], 0.42 + Math.cos(cant) * prof[2][1], prof[2][0] - 0.3);
    bp._finTips = [tp, V(-tp.x, tp.y, tp.z)];
  } else if (F.fins === 'single') {
    const prof = [[3.2, 0], [6.8, 0], [8.0, 2.6], [7.0, 2.7], [4.4, 0.35]];
    P.add(fin(prof, 0.16, { bevel: 0.05 }), Z.PRIMARY, { m: M(0, 0.5, 0), wear: 1 });
    P.add(fin([[5.6, 0], [7.6, 0], [8.1, 1.1], [6.4, 0.4]], 0.12), Z.METAL, { m: M(1.1, 0.35, 0, 0, 0, -1.1), wear: 1 });
    bp._finTips = [V(0, 3.1, 7.6)];
  } else {
    const prof = [[4.6, 0], [7.0, 0], [7.6, 1.2], [6.8, 1.25], [5.2, 0.2]];
    P.add(fin(prof, 0.14), Z.SECONDARY, { m: M(1.1 * W, 0.42, 0, 0, 0, -0.2), mirror: true });
    P.add(fin([[4.8, 0], [7.2, 0], [7.4, -0.8], [6.2, -0.8]].map(([z, y]) => [z, y]), 0.14), Z.SECONDARY, { m: M(0, -0.55, 0) });
    bp._finTips = [V(1.35 * W, 1.6, 7.0), V(-1.35 * W, 1.6, 7.0)];
  }

  // mandíbulas dos Corsários
  if (faction === 'corsarios') {
    for (const s of [1, -1]) {
      const g = plate([[0, -2.2], [0.22, -1.8], [0.3, 1.8], [0, 2.2], [-0.18, 1.0]], 0.12, { bevel: 0.03 });
      P.add(g, Z.TRIM, { m: M(s * 1.28, -0.5, -3.6, 0, 0, s * 0.25), wear: 0.4 });
      P.add(cyl(0.001, 0.07, 0.6, 6), Z.METAL, { m: M(s * 1.3, -0.5, -6.0, -Math.PI / 2, 0, 0), detail: true });
    }
  }

  // sensor sob o nariz
  P.add(sphere(0.18, 14, 8, Math.PI * 2, Math.PI / 2), Z.DARK, { m: M(0, -0.52, -6.0, Math.PI, 0, 0), detail: true });

  // faixas de luz de formação
  stripLight(bp, L, { z0: -0.6, z1: 4.2, a: -0.18, color: style.glow, power: 4, width: 0.045 });
  stripLight(bp, L, { z0: -6.6, z1: -5.4, a: 0.35, color: style.glow, power: 3, width: 0.035 });

  // luzes
  navLights(bp, style, { tip: V(tipX + 0.05, wingY, tipZ + (F.wing === 'forward' ? -0.6 : 1.2)), strobes: bp._finTips, beacon: V(0, -0.68, 1.4) });
  bp.parts.light(V(0, -0.62, -5.4), [1, 0.95, 0.85], 25, 0.06);

  // trem de pouso
  addGear(bp, { pivot: V(0, -0.56, -4.2), len: 1.42, fold: -1, kind: faction === 'guilda' ? 'wheel' : 'pad', pad: 0.38, doorW: 0.22, doorL: 1.3 });
  addGear(bp, { pivot: V(1.0 * W, -0.62, 3.0), len: 1.36, fold: 1, pad: 0.46, doorW: 0.24, doorL: 1.4 });
  addGear(bp, { pivot: V(-1.0 * W, -0.62, 3.0), len: 1.36, fold: 1, pad: 0.46, doorW: 0.24, doorL: 1.4 });

  dress(bp, L, style, rng, { z0: -5.8, z1: 6.5, scale: 1, faction });

  bp.colliders.push({ center: V(0, 0, -0.3), half: V(1.6 * W, 0.8, 8.2) });
  bp.colliders.push({ center: V(0, wingY, 3.2), half: V(tipX + 0.2, 0.3, 3.4) });
  bp.length = F.nose + 8.5; bp.radius = 8.8;
}

/** Interceptador: agulha longa, canards, motor central grande + dois auxiliares. */
export function buildInterceptor(bp, style, rng, faction) {
  const P = bp.parts;
  const e = style.shape.e;
  const ag = faction === 'corsarios' ? 1.15 : 1;
  const st = [
    { z: -11.5 * ag, w: 0.04, h: 0.04, y: -0.05, e: 2 },
    { z: -10, w: 0.3, h: 0.25, hb: 0.22, y: -0.05, e },
    { z: -7, w: 0.62, h: 0.48, hb: 0.42, e },
    { z: -4, w: 0.85, h: 0.66, hb: 0.55, e },
    { z: -1, w: 1.0, h: 0.62, hb: 0.6, e },
    { z: 3, w: 1.2, h: 0.7, hb: 0.72, e },
    { z: 6.5, w: 1.25, h: 0.78, hb: 0.78, e },
    { z: 8.6, w: 1.1, h: 0.7, hb: 0.7, e },
  ];
  const L = loft(st, { seg: 40, sub: 5 });
  P.add(L.geo, Z.PRIMARY, { wear: 0.5 });
  bp.hullLoft = L;
  P.add(cylZ(0.022, 0.012, 2.2, 6), Z.METAL, { m: M(0, -0.05, -11.5 * ag - 1.0), detail: true });
  P.add(cylZ(0.05, 0.05, 0.3, 8), Z.TRIM, { m: M(0, -0.05, -11.5 * ag - 0.15), detail: true });

  canopy(bp, { z0: -8.0, z1: -4.4, w: 0.5, h: 0.48, y: 0.32, ribs: 2, frameZone: faction === 'hegemonia' ? Z.TRIM : Z.DARK, e: 2 });
  bp.eye = V(0, 0.62, -6.3);

  // motor central + auxiliares
  engine(bp, { x: 0, y: 0, z0: 4.5, z1: 9.4, r: 0.92, style, nacelle: false, ringZone: faction === 'hegemonia' ? Z.TRIM : Z.DARK, plume: 11 });
  engine(bp, { x: 1.55, y: -0.3, z0: 2.6, z1: 8.2, r: 0.36, style, mirror: true, cowlZone: Z.SECONDARY, plume: 4 });
  P.add(cylZ(0.95, 1.0, 1.2, 32), Z.DARK, { m: M(0, 0, 8.6) });

  // canards
  const can = plate([[0.6, 0], [2.3, 0.8], [2.4, 1.3], [0.6, 1.4]], 0.12, { bevel: 0.04 });
  P.add(can, Z.SECONDARY, { m: M(0, -0.05, -6.2, 0, 0, -0.08), mirror: true });
  // asas em flecha
  const wing = plate([[0.9, 1.0], [4.8, 5.8], [5.3, 6.4], [5.3, 7.6], [0.9, 8.2]], 0.2, { bevel: 0.06 });
  P.add(wing, Z.PRIMARY, { m: M(0, -0.25, 0, 0, 0, 0.06), mirror: true });
  const wt = plate([[4.2, 5.1], [4.8, 5.8], [5.3, 6.4], [5.3, 7.6], [4.2, 7.8]], 0.22, { bevel: 0.04 });
  P.add(wt, faction === 'hegemonia' ? Z.TRIM : Z.SECONDARY, { m: M(0, -0.25, 0, 0, 0, 0.06), mirror: true });
  // aleta ventral + dorsal
  P.add(fin([[3.5, 0], [8.4, 0], [9.4, 2.3], [8.4, 2.4], [5.2, 0.3]], 0.16, { bevel: 0.05 }), Z.PRIMARY, { m: M(0, 0.6, 0) });
  P.add(fin([[5.8, 0], [8.8, 0], [9.0, -1.2], [7.6, -1.2]], 0.14), Z.SECONDARY, { m: M(0, -0.6, 0) });
  // canhões gêmeos na raiz das asas
  for (const s of [1, -1]) {
    P.add(box(0.3, 0.28, 2.6, 0.06), Z.DARK, { m: M(s * 1.0, -0.42, -1.2) });
    P.add(gunBarrel(2.4, 0.06), Z.METAL, { m: M(s * 1.0, -0.42, -2.5) });
    bp.hardpoints.push({ id: s > 0 ? 'canhao_d' : 'canhao_e', type: 'gun', pos: V(s * 1.0, -0.42, -4.9), dir: V(0, 0, -1) });
    missile(P, M(s * 3.0, -0.6, 5.4), 2.0, 0.1, Z.METAL);
    bp.hardpoints.push({ id: s > 0 ? 'missil_d' : 'missil_e', type: 'missile', pos: V(s * 3.0, -0.6, 4.4), dir: V(0, 0, -1) });
  }
  stripLight(bp, L, { z0: -3.5, z1: 5.5, a: 0.0, color: style.glow, power: 4, width: 0.04 });
  navLights(bp, style, { tip: V(5.35, -0.1, 7.0), strobes: [V(0, 3.0, 9.2)], beacon: V(0, -0.65, 2.0) });
  addGear(bp, { pivot: V(0, -0.45, -6.0), len: 1.3, fold: -1, pad: 0.34, doorW: 0.2, doorL: 1.1 });
  addGear(bp, { pivot: V(1.15, -0.6, 4.6), len: 1.2, fold: 1, pad: 0.42, doorW: 0.22, doorL: 1.2 });
  addGear(bp, { pivot: V(-1.15, -0.6, 4.6), len: 1.2, fold: 1, pad: 0.42, doorW: 0.22, doorL: 1.2 });
  dress(bp, L, style, rng, { z0: -8.5, z1: 7.5, scale: 0.9, faction });
  bp.colliders.push({ center: V(0, 0, -1.5), half: V(1.3, 0.8, 10.5) });
  bp.colliders.push({ center: V(0, -0.25, 6.0), half: V(5.4, 0.3, 2.4) });
  bp.length = 22; bp.radius = 11;
}
