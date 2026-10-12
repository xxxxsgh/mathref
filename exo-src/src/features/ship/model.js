/**
 * MODELO PROCEDURAL da nave (caça leve, ~16 m). Referencial da nave:
 * −Z frente, +Y cima, +X direita; origem = centro de massa (≈ meio da fuselagem).
 *
 * Construção:
 *   fuselagem       loft superelíptico (nariz afilado → cauda larga)
 *   canopi          bolha em loft + estrutura de tubos (arcos e espinha)
 *   dorso           corcova traseira com tomada de ar
 *   naceles (2)     loft circular, anel de admissão, faixa de pintura, bocal
 *                   torneado (lathe) com aletas e anel incandescente
 *   asas            placas chanfradas enflechadas (painel interno + ponta pintada)
 *   derivas (2)     placas inclinadas sobre as naceles, antena, estroboscópio
 *   canards, canhões, sensor de queixo, greebles (caixas, tubos, aletas)
 *   trem de pouso   3 pernas articuladas (grupos separados, animados)
 *
 * Tudo vira poucas malhas: casco (1 material PBR com detalhe triplanar),
 * vidro, emissivos e uma malha por perna do trem.
 */
import * as THREE from 'three';
import { paint, mergePainted, mat, matOnSurface, spline, loft, bevelBox, plate, mulberry32, lin } from './util.js';

/** Paletas (sRGB hex → linear no THREE.Color). */
export const PALETTES = {
  explorer: { primary: 0xd9d2c3, secondary: 0x3a3f47, accent: 0xe0782a, trim: 0x1d8a96, dark: 0x1b1d21, glow: [0.55, 0.75, 1.0], glass: 0x0a1722 },
  hostile: { primary: 0x2a2c31, secondary: 0x4a1418, accent: 0xb3261e, trim: 0x8a8f99, dark: 0x111214, glow: [1.0, 0.25, 0.15], glass: 0x220a08 },
  trader: { primary: 0x7a8a6a, secondary: 0x2c3036, accent: 0xd8b23a, trim: 0x3a6ea8, dark: 0x16181b, glow: [0.6, 1.0, 0.7], glass: 0x0b1a14 },
};

// superfícies: [metal, rough, desgaste, painéis]
const S_PAINT = [0.35, 0.42, 1.0, 1.0];
const S_DARK = [0.75, 0.5, 0.55, 0.8];
const S_MECH = [0.9, 0.38, 0.3, 0.35];
const S_RUBBER = [0.0, 0.85, 0.0, 0.1];
const S_FRAME = [0.85, 0.32, 0.6, 0.4];

/** Perfil da fuselagem em z. */
function fuselageProfile(z) {
  return {
    w: spline([{ t: -8.0, v: 0.12 }, { t: -7.6, v: 0.62 }, { t: -6.6, v: 1.02 }, { t: -4.6, v: 1.32 }, { t: -1.5, v: 1.42 }, { t: 1.5, v: 1.38 }, { t: 4, v: 1.18 }, { t: 5.5, v: 0.88 }], z),
    h: spline([{ t: -8.0, v: 0.1 }, { t: -7.6, v: 0.36 }, { t: -6.6, v: 0.5 }, { t: -4.6, v: 0.6 }, { t: -1.5, v: 0.7 }, { t: 2, v: 0.66 }, { t: 5.5, v: 0.48 }], z),
    hb: spline([{ t: -8.0, v: 0.1 }, { t: -7.6, v: 0.36 }, { t: -6.6, v: 0.56 }, { t: -3, v: 0.74 }, { t: 2, v: 0.74 }, { t: 5.5, v: 0.54 }], z),
    y: spline([{ t: -8.0, v: -0.12 }, { t: -6, v: 0.0 }, { t: 0, v: 0.08 }, { t: 5.5, v: 0.14 }], z),
    n: spline([{ t: -8.0, v: 2.0 }, { t: -6, v: 2.6 }, { t: 0, v: 3.0 }, { t: 5.5, v: 2.8 }], z),
  };
}

/** Topo da fuselagem (y) na linha central em z. */
function fuseTop(z) {
  const P = fuselageProfile(z);
  return P.y + P.h;
}

function canopyProfile(z) {
  return {
    w: spline([{ t: -5.7, v: 0.18 }, { t: -4.7, v: 0.68 }, { t: -3.1, v: 0.86 }, { t: -1.7, v: 0.8 }, { t: -0.9, v: 0.32 }], z),
    h: spline([{ t: -5.7, v: 0.04 }, { t: -4.7, v: 0.5 }, { t: -3.1, v: 0.82 }, { t: -1.7, v: 0.72 }, { t: -0.9, v: 0.18 }], z),
    hb: 0.02,
    y: fuseTop(z) - 0.06,
    n: 2.25,
  };
}

const NAC_X = 2.55;
const NR = 1.14; // escala radial das naceles
const NAC_Y = -0.08;
function nacelleProfile(z) {
  const r = spline([{ t: -3.3, v: 0.5 }, { t: -2.7, v: 0.76 }, { t: -1.5, v: 0.84 }, { t: 4.5, v: 0.86 }, { t: 6.4, v: 0.72 }], z);
  return { w: r, h: r, hb: r, y: 0, n: 2.0 };
}

/** Pontos de geometria úteis (referencial da nave). */
export const SHIP_POINTS = {
  eye: new THREE.Vector3(0, 1.02, -3.25),
  engines: [
    { pos: new THREE.Vector3(NAC_X, NAC_Y, 7.15), r: 0.56 * NR },
    { pos: new THREE.Vector3(-NAC_X, NAC_Y, 7.15), r: 0.56 * NR },
  ],
  muzzles: [new THREE.Vector3(1.42, -0.62, -6.3), new THREE.Vector3(-1.42, -0.62, -6.3)],
  rocketPods: [new THREE.Vector3(4.6, -0.55, 1.6), new THREE.Vector3(-4.6, -0.55, 1.6)],
  /** altura do centro da nave sobre o solo com o trem baixado */
  gearHeight: 2.27,
  radius: 9.5,
  length: 16.2,
  wingTips: [new THREE.Vector3(7.6, -0.05, 5.0), new THREE.Vector3(-7.6, -0.05, 5.0)],
};

/**
 * Constrói as geometrias da nave.
 * @returns {{ hull, glass, emissive, gear: [{geo, pivot, axis, stowAngle}] }}
 */
export function buildShipGeometry({ palette = PALETTES.explorer, seed = 11, detail = 1 } = {}) {
  const rand = mulberry32(seed);
  const C = {
    primary: lin(palette.primary),
    secondary: lin(palette.secondary),
    accent: lin(palette.accent),
    trim: lin(palette.trim),
    dark: lin(palette.dark),
  };
  const glowC = new THREE.Color(...palette.glow);
  const hull = [];
  const glass = [];
  const emis = [];
  const segA = detail > 0.5 ? 44 : 24;
  const segZ = detail > 0.5 ? 56 : 28;

  // ── fuselagem
  const fus = loft(-8.0, 5.5, fuselageProfile, { segZ, segA });
  hull.push(paint(fus.geo, C.primary, S_PAINT));
  // faixa de pintura no nariz e faixas laterais (loft levemente inflado)
  const band = (z0, z1, color, angFrom, angTo, inflate = 0.012) => {
    const L = loft(z0, z1, (z) => {
      const P = fuselageProfile(z);
      return { ...P, w: P.w + inflate, h: P.h + inflate, hb: P.hb + inflate };
    }, { segZ: 12, segA: 16, capStart: false, capEnd: false, angFrom, angTo });
    hull.push(paint(L.geo, color, S_PAINT));
  };
  band(-7.75, -6.7, C.accent, 0, Math.PI * 2);
  band(-6.45, -6.2, C.dark, 0, Math.PI * 2, 0.01);
  band(-1.0, 4.6, C.secondary, Math.PI * 1.08, Math.PI * 1.92, 0.012); // ventre escuro
  band(-5.5, 3.8, C.accent, 0.07, 0.2, 0.014); // filete lateral direito
  band(-5.5, 3.8, C.accent, Math.PI - 0.2, Math.PI - 0.07, 0.014);

  // ── canopi (vidro) + estrutura
  const can = loft(-5.7, -0.9, canopyProfile, { segZ: 24, segA: 28, angFrom: 0, angTo: Math.PI, capStart: false, capEnd: false });
  glass.push(paint(can.geo, new THREE.Color(1, 1, 1), [0, 0.05, 0, 0]));
  const arcAt = (z, r = 0.05, color = C.dark) => {
    const pts = [];
    for (let a = 0; a <= 16; a++) {
      const { p, n } = can.sample(z, (Math.PI * a) / 16);
      pts.push(p.addScaledVector(n, 0.02));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    hull.push(paint(new THREE.TubeGeometry(curve, 24, r, 6, false), color, S_FRAME));
  };
  arcAt(-4.65, 0.055);
  arcAt(-3.0, 0.045);
  arcAt(-1.55, 0.06);
  {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const z = -2.3 + (1.3 * i) / 14;
      const { p, n } = can.sample(z, Math.PI / 2);
      pts.push(p.addScaledVector(n, 0.02));
    }
    hull.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 6, false), C.dark, S_FRAME));
    // trilhos laterais do canopi
    for (const side of [0.03, Math.PI - 0.03]) {
      const pl = [];
      for (let i = 0; i <= 14; i++) {
        const z = -5.6 + (4.6 * i) / 14;
        const { p, n } = can.sample(z, side);
        pl.push(p.addScaledVector(n, 0.03));
      }
      hull.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pl), 24, 0.06, 6, false), C.secondary, S_FRAME));
    }
  }

  // ── dorso (corcova) atrás do canopi
  const dorsal = loft(-1.3, 5.3, (z) => ({
    w: spline([{ t: -1.3, v: 0.2 }, { t: -0.4, v: 0.55 }, { t: 3.5, v: 0.6 }, { t: 5.3, v: 0.35 }], z),
    h: spline([{ t: -1.3, v: 0.05 }, { t: -0.2, v: 0.42 }, { t: 3.2, v: 0.38 }, { t: 5.3, v: 0.1 }], z),
    hb: 0.05,
    y: fuseTop(z) - 0.08,
    n: 2.6,
  }), { segZ: 20, segA: 24 });
  hull.push(paint(dorsal.geo, C.secondary, S_DARK));
  // tomada de ar dorsal
  hull.push(paint(bevelBox(0.7, 0.28, 1.2, 0.05), C.dark, S_MECH, mat([0, fuseTop(0.5) + 0.42, 0.6], [-0.08, 0, 0])));
  hull.push(paint(bevelBox(0.56, 0.06, 0.08, 0.01), C.dark, S_MECH, mat([0, fuseTop(0.5) + 0.42, -0.05])));
  for (let i = 0; i < 5; i++) hull.push(paint(new THREE.BoxGeometry(0.58, 0.02, 0.05), C.secondary, S_MECH, mat([0, fuseTop(0.5) + 0.5, 0.2 + i * 0.18])));

  // ── naceles
  for (const sx of [1, -1]) {
    const x = NAC_X * sx;
    const nacH = [];
    const nacE = [];
    const nacM = new THREE.Matrix4().makeTranslation(x, NAC_Y, 0).multiply(new THREE.Matrix4().makeScale(NR, NR, 1));
    const nac = loft(-3.3, 6.4, nacelleProfile, { segZ: 30, segA: 32 });
    nacH.push(paint(nac.geo, C.secondary, S_DARK, mat([0, 0, 0])));
    // faixa pintada e anéis
    const ring = (z0, z1, color, infl, surf = S_PAINT) => {
      const L = loft(z0, z1, (z) => {
        const P = nacelleProfile(z);
        return { ...P, w: P.w + infl, h: P.h + infl, hb: P.hb + infl };
      }, { segZ: 4, segA: 32 });
      nacH.push(paint(L.geo, color, surf, mat([0, 0, 0])));
    };
    ring(0.4, 1.4, C.accent, 0.03);
    ring(1.55, 1.75, C.trim, 0.035);
    ring(-2.85, -2.55, C.primary, 0.04);
    ring(4.6, 5.0, C.primary, 0.03);
    // admissão
    const lip = new THREE.TorusGeometry(0.62, 0.11, 10, 32);
    nacH.push(paint(lip, C.dark, S_MECH, mat([0, 0, -3.25])));
    nacH.push(paint(new THREE.CircleGeometry(0.62, 24), new THREE.Color(0.01, 0.01, 0.012), S_RUBBER, mat([0, 0, -3.0], [0, Math.PI, 0])));
    // pás do compressor
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      nacH.push(paint(new THREE.BoxGeometry(0.05, 0.5, 0.02), C.trim, S_MECH, mat([Math.cos(a) * 0.3, Math.sin(a) * 0.3, -2.95], [0.3, 0, a + Math.PI / 2])));
    }
    nacH.push(paint(new THREE.ConeGeometry(0.18, 0.4, 12), C.dark, S_MECH, mat([0, 0, -3.05], [-Math.PI / 2, 0, 0])));
    // bocal torneado
    const prof = [
      [0.74, 6.3], [0.8, 6.55], [0.78, 7.0], [0.72, 7.35], [0.66, 7.38], [0.6, 7.1], [0.5, 6.8], [0.3, 6.7], [0.0, 6.68],
    ].map(([r, z]) => new THREE.Vector2(r, z));
    const lathe = new THREE.LatheGeometry(prof, 32);
    // lathe gira em torno de Y: leva Y → Z
    nacH.push(paint(lathe, C.dark, S_MECH, mat([0, 0, 0], [Math.PI / 2, 0, 0])));
    // aletas de vetoração ao redor do bocal
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      nacH.push(paint(new THREE.BoxGeometry(0.06, 0.16, 0.95), C.secondary, S_MECH, mat([Math.cos(a) * 0.84, Math.sin(a) * 0.84, 6.85], [0, 0, a + Math.PI / 2])));
    }
    // anel incandescente e núcleo do bocal
    nacE.push(paint(new THREE.TorusGeometry(0.56, 0.05, 8, 32), glowC.clone().multiplyScalar(1.2), [0, 0, 0, 0], mat([0, 0, 7.0])));
    nacE.push(paint(new THREE.CircleGeometry(0.5, 24), glowC.clone().lerp(new THREE.Color(1, 1, 1), 0.55).multiplyScalar(1.6), [0, 0, 0, 0], mat([0, 0, 6.75])));
    // faixas luminosas laterais na nacele
    nacE.push(paint(new THREE.BoxGeometry(0.04, 0.05, 2.2), glowC.clone().multiplyScalar(0.7), [0, 0, 0, 0], mat([0.86 * sx, 0.05, 2.6])));
    // greebles da nacele: tubos e caixas
    for (let i = 0; i < 7; i++) {
      const z = -1.6 + i * 0.95 + rand() * 0.3;
      const ang = (sx > 0 ? -0.35 : Math.PI + 0.35) + (rand() - 0.5) * 0.7;
      const { p, n } = nac.sample(z, ang);
      const sz = [0.18 + rand() * 0.35, 0.08 + rand() * 0.12, 0.25 + rand() * 0.6];
      nacH.push(paint(bevelBox(sz[0], sz[1], sz[2], 0.02), rand() < 0.3 ? C.trim : C.dark, S_MECH, matOnSurface(p, n, 0)));
    }
    // tubo hidráulico ao longo da nacele
    {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const z = -2.2 + i * 0.95;
        const { p, n } = nac.sample(z, sx > 0 ? -0.95 : Math.PI + 0.95);
        pts.push(p.addScaledVector(n, 0.05));
      }
      nacH.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.04, 6, false), C.dark, S_MECH));
    }
    for (const g of nacH) hull.push(g.applyMatrix4(nacM));
    for (const g of nacE) emis.push(g.applyMatrix4(nacM));
    // pilone (liga nacele e fuselagem)
    hull.push(paint(plate([[0, -1.2], [0, 4.3], [1.25, 4.0], [1.25, -0.4]], 0.34, 0.05), C.secondary, S_DARK, mat([0.95 * sx, 0.02, 0], [Math.PI / 2, 0, 0], [sx, 1, 1])));
  }

  // ── asas (painel interno + ponta pintada)
  const sweep = 0.9 + rand() * 0.25;
  const wingInner = [[2.9, -0.4], [2.9, 4.4], [5.3, 4.9], [5.3, 1.9 * sweep]];
  const wingOuter = [[5.3, 1.9 * sweep], [5.3, 4.9], [7.7, 5.5], [7.5, 3.7 * sweep]];
  for (const sx of [1, -1]) {
    const M = (y, rz) => new THREE.Matrix4().makeTranslation(0, y, 0).multiply(new THREE.Matrix4().makeRotationZ(rz)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    const mirror = new THREE.Matrix4().makeScale(sx, 1, 1);
    const m1 = mirror.clone().multiply(M(-0.18, 0.06));
    hull.push(paint(plate(wingInner, 0.42, 0.09), C.primary, S_PAINT, m1));
    hull.push(paint(plate(wingOuter, 0.3, 0.07), C.accent, S_PAINT, mirror.clone().multiply(M(-0.18 + 0.02, 0.06))));
    // faixa escura no bordo de ataque
    hull.push(paint(plate([[2.9, -0.5], [5.3, 1.8 * sweep], [7.5, 3.6 * sweep], [7.45, 3.85 * sweep], [5.3, 2.15 * sweep], [2.9, -0.15]], 0.2, 0.04), C.dark, S_MECH, mirror.clone().multiply(M(-0.17, 0.06))));
    // ponta: aleta vertical e luz de navegação
    hull.push(paint(plate([[0, 0], [1.6, 0], [1.9, -0.7], [0.9, -0.75]], 0.1, 0.03), C.secondary, S_DARK, mirror.clone().multiply(mat([7.62, 0.28, 3.9], [0, -Math.PI / 2, 0]))));
    emis.push(paint(new THREE.SphereGeometry(0.07, 8, 6), sx > 0 ? new THREE.Color(0.1, 1, 0.2) : new THREE.Color(1, 0.06, 0.04), [0, 0, 0, 0], mat([7.66 * sx, 0.3, 5.45])));
    // casulo de foguetes sob a asa
    hull.push(paint(bevelBox(0.5, 0.36, 2.0, 0.08), C.dark, S_MECH, mat([4.6 * sx, -0.55, 1.4])));
    for (let i = 0; i < 4; i++) {
      hull.push(paint(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 10), new THREE.Color(0.02, 0.02, 0.02), S_RUBBER, mat([4.6 * sx + (i % 2 ? 0.12 : -0.12), -0.55 + (i < 2 ? 0.08 : -0.08), 0.38], [Math.PI / 2, 0, 0])));
    }
    // canhões na raiz
    hull.push(paint(bevelBox(0.42, 0.34, 1.8, 0.06), C.secondary, S_MECH, mat([1.42 * sx, -0.6, -3.3])));
    hull.push(paint(new THREE.CylinderGeometry(0.075, 0.09, 2.6, 10), C.dark, S_MECH, mat([1.42 * sx, -0.62, -5.0], [Math.PI / 2, 0, 0])));
    hull.push(paint(new THREE.CylinderGeometry(0.11, 0.11, 0.35, 10), C.trim, S_MECH, mat([1.42 * sx, -0.62, -6.1], [Math.PI / 2, 0, 0])));
    for (let i = 0; i < 4; i++) hull.push(paint(new THREE.TorusGeometry(0.1, 0.02, 6, 12), C.dark, S_MECH, mat([1.42 * sx, -0.62, -4.0 - i * 0.35])));
    // canards
    hull.push(paint(plate([[0, 0], [1.1, 0.35], [1.15, 0.75], [0, 0.95]], 0.1, 0.03), C.primary, S_PAINT, mirror.clone().multiply(mat([0.9, 0.02, -5.6], [Math.PI / 2, 0, -0.05]))));
    // derivas
    const finPts = [[3.0, 0], [6.3, 0], [6.9, 2.1 + rand() * 0.3], [5.7, 2.2 + rand() * 0.3]];
    const finM = mirror.clone().multiply(new THREE.Matrix4().makeTranslation(NAC_X, 0.62, 0)).multiply(new THREE.Matrix4().makeRotationZ(-0.22)).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
    hull.push(paint(plate(finPts, 0.14, 0.04), C.accent, S_PAINT, finM));
    hull.push(paint(plate([[3.0, 0], [6.3, 0], [6.45, 0.35], [3.3, 0.35]], 0.18, 0.04), C.secondary, S_DARK, finM));
    hull.push(paint(new THREE.CylinderGeometry(0.015, 0.02, 1.2, 5), C.trim, S_MECH, finM.clone().multiply(mat([6.5, 2.7, 0]))));
    emis.push(paint(new THREE.SphereGeometry(0.06, 8, 6), new THREE.Color(1, 1, 1), [0, 0, 0, 0], finM.clone().multiply(mat([6.82, 2.15, 0]))));
    // tomadas laterais da fuselagem
    const { p: ip, n: inn } = fus.sample(-2.6, sx > 0 ? -0.15 : Math.PI + 0.15);
    hull.push(paint(bevelBox(0.5, 0.18, 1.8, 0.05), C.dark, S_MECH, matOnSurface(ip, inn, 0)));
    for (let i = 0; i < 6; i++) {
      const { p, n } = fus.sample(-3.3 + i * 0.25, sx > 0 ? -0.15 : Math.PI + 0.15);
      hull.push(paint(new THREE.BoxGeometry(0.42, 0.04, 0.05), C.secondary, S_MECH, matOnSurface(p.addScaledVector(n, 0.1), n, 0)));
    }
  }

  // ── placas de blindagem em camadas nas laterais (quebram a silhueta)
  for (const sx of [1, -1]) {
    const plates = [
      { z: -5.2, ang: 0.32, len: 1.8, w: 0.55, col: C.secondary },
      { z: -3.1, ang: 0.12, len: 2.6, w: 0.62, col: C.primary },
      { z: -0.6, ang: 0.18, len: 2.4, w: 0.7, col: C.accent },
      { z: 2.0, ang: 0.1, len: 2.6, w: 0.62, col: C.secondary },
      { z: -2.0, ang: -0.45, len: 3.4, w: 0.5, col: C.dark },
    ];
    for (const P of plates) {
      const ang = sx > 0 ? P.ang : Math.PI - P.ang;
      const { p, n } = fus.sample(P.z, ang);
      hull.push(paint(bevelBox(P.w, 0.09, P.len, 0.03), P.col, P.col === C.dark ? S_DARK : S_PAINT, matOnSurface(p.addScaledVector(n, 0.03), n, 0)));
    }
    // quilha ventral e luvas das asas
    hull.push(paint(bevelBox(0.9, 0.5, 3.6, 0.08), C.secondary, S_DARK, mat([1.75 * sx, -0.35, 1.6])));
    hull.push(paint(bevelBox(0.5, 0.18, 2.4, 0.05), C.accent, S_PAINT, mat([1.75 * sx, -0.02, 1.1])));
  }
  hull.push(paint(plate([[-0.0, 0], [3.2, 0], [3.6, -0.7], [0.8, -0.55]], 0.14, 0.04), C.secondary, S_DARK, new THREE.Matrix4().makeTranslation(0, -0.72, 1.6).multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))));

  // ── sensor de queixo e antenas
  hull.push(paint(new THREE.SphereGeometry(0.22, 16, 12), C.dark, S_MECH, mat([0, -0.42, -6.4])));
  emis.push(paint(new THREE.CircleGeometry(0.09, 12), new THREE.Color(1, 0.35, 0.1), [0, 0, 0, 0], mat([0, -0.45, -6.6], [0, Math.PI, 0])));
  hull.push(paint(new THREE.CylinderGeometry(0.012, 0.02, 0.9, 5), C.trim, S_MECH, mat([0.25, fuseTop(2.8) + 0.55, 2.8], [-0.35, 0, 0])));
  hull.push(paint(new THREE.CylinderGeometry(0.012, 0.02, 0.6, 5), C.trim, S_MECH, mat([-0.25, fuseTop(3.4) + 0.45, 3.4], [-0.35, 0, 0])));
  // luzes de pouso sob o ventre e faixa de cabine
  emis.push(paint(new THREE.CircleGeometry(0.1, 12), new THREE.Color(1, 0.95, 0.85), [0, 0, 0, 0], mat([0.5, -0.66, -3.8], [Math.PI / 2, 0, 0])));
  emis.push(paint(new THREE.CircleGeometry(0.1, 12), new THREE.Color(1, 0.95, 0.85), [0, 0, 0, 0], mat([-0.5, -0.66, -3.8], [Math.PI / 2, 0, 0])));

  // ── greebles na fuselagem (laterais e ventre)
  const nG = Math.round(70 * detail);
  for (let i = 0; i < nG; i++) {
    const side = rand() < 0.5 ? 1 : -1;
    const z = -4.6 + rand() * 9.4;
    let ang = -0.15 - rand() * 0.95;
    if (side < 0) ang = Math.PI - ang;
    const { p, n } = fus.sample(z, ang);
    const r = rand();
    let g;
    if (r < 0.55) g = bevelBox(0.12 + rand() * 0.45, 0.05 + rand() * 0.12, 0.15 + rand() * 0.7, 0.02);
    else if (r < 0.8) {
      g = new THREE.CylinderGeometry(0.035 + rand() * 0.04, 0.035 + rand() * 0.04, 0.4 + rand() * 1.2, 8);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.05, 0);
    } else {
      g = new THREE.CylinderGeometry(0.08 + rand() * 0.12, 0.1 + rand() * 0.12, 0.08, 12);
    }
    const col = rand() < 0.25 ? C.trim : rand() < 0.5 ? C.secondary : C.dark;
    hull.push(paint(g, col, S_MECH, matOnSurface(p, n, (rand() - 0.5) * 0.2)));
  }
  // greebles do dorso
  for (let i = 0; i < Math.round(26 * detail); i++) {
    const z = -0.4 + rand() * 5.2;
    const ang = 0.35 + rand() * (Math.PI - 0.7);
    const { p, n } = dorsal.sample(z, ang);
    const g = rand() < 0.6 ? bevelBox(0.1 + rand() * 0.25, 0.05 + rand() * 0.1, 0.2 + rand() * 0.5, 0.02) : new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10);
    hull.push(paint(g, rand() < 0.3 ? C.trim : C.dark, S_MECH, matOnSurface(p, n, 0)));
  }
  // grelhas de exaustão térmica na cauda
  for (let i = 0; i < 7; i++) {
    hull.push(paint(new THREE.BoxGeometry(1.2, 0.04, 0.06), C.dark, S_MECH, mat([0, fuseTop(5.0) - 0.02, 4.3 + i * 0.14], [0.1, 0, 0])));
  }
  // cauda da fuselagem: bocal auxiliar
  hull.push(paint(new THREE.CylinderGeometry(0.45, 0.55, 0.5, 20, 1, true), C.dark, S_MECH, mat([0, 0.12, 5.6], [Math.PI / 2, 0, 0])));
  emis.push(paint(new THREE.CircleGeometry(0.4, 20), glowC.clone().multiplyScalar(0.9), [0, 0, 0, 0], mat([0, 0.12, 5.55])));

  // ── trem de pouso (3 pernas)
  const gear = [];
  const leg = (len, wide) => {
    const parts = [];
    parts.push(paint(new THREE.CylinderGeometry(0.11, 0.11, len * 0.6, 10), C.dark, S_MECH, mat([0, -len * 0.3, 0])));
    parts.push(paint(new THREE.CylinderGeometry(0.075, 0.075, len * 0.55, 10), new THREE.Color(0.6, 0.62, 0.66), [1, 0.2, 0, 0], mat([0, -len * 0.72, 0])));
    parts.push(paint(bevelBox(0.3, 0.3, 0.4, 0.05), C.secondary, S_MECH, mat([0, -0.1, 0])));
    // braço de reação diagonal
    parts.push(paint(new THREE.CylinderGeometry(0.04, 0.04, len * 0.7, 6), C.trim, S_MECH, mat([0, -len * 0.35, 0.22], [0.35, 0, 0])));
    // sapata
    parts.push(paint(new THREE.CylinderGeometry(wide, wide * 1.15, 0.12, 16), C.dark, S_MECH, mat([0, -len, 0])));
    parts.push(paint(new THREE.CylinderGeometry(wide * 0.9, wide * 0.9, 0.05, 16), new THREE.Color(0.02, 0.02, 0.02), S_RUBBER, mat([0, -len - 0.07, 0])));
    return mergePainted(parts);
  };
  gear.push({ geo: leg(1.66, 0.26), pivot: new THREE.Vector3(0, -0.52, -4.5), stowAngle: -Math.PI / 2 });
  gear.push({ geo: leg(1.32, 0.3), pivot: new THREE.Vector3(NAC_X, -0.86, 3.3), stowAngle: Math.PI / 2 });
  gear.push({ geo: leg(1.32, 0.3), pivot: new THREE.Vector3(-NAC_X, -0.86, 3.3), stowAngle: Math.PI / 2 });

  return { hull: mergePainted(hull), glass: mergePainted(glass), emissive: mergePainted(emis), gear, canopySample: can.sample };
}
