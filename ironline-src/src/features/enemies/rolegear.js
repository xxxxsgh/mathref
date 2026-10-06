/**
 * Equipamento das classes especiais (roles.js), assado na MESMA malha
 * skinnada do soldado (1 draw call, AO assada junto):
 *
 *   gasmask  máscara de gás com filtro lateral e lentes (arrombador)
 *   heavy    placa extra de peito + protetor de virilha (arrombador)
 *   shells   bandoleira de cartuchos atravessada no peito (arrombador)
 *   ghillie  capuz/ombros de ghillie em tiras com folhagem (atirador)
 *   visor    viseira balística fumê no capacete (escudeiro)
 *   pads     ombreiras rígidas (escudeiro)
 *   medic    braçadeiras brancas com cruz verde, bolsa médica e injetor
 *
 * E as armas alternativas no osso `weapon` (mesmos pontos de empunhadura
 * do fuzil — RIFLE.gripR/gripL/butt — para a IK dos braços servir):
 *   addShotgun  escopeta de bomba (tubo, telha de bomba, cartucheira lateral)
 *   addSniper   fuzil de ferrolho (cano pesado canelado, luneta grande,
 *               freio de boca, bipé rebatido, coronha com apoio de face)
 *
 * Convenções do modelo: pés na origem, soldado olha para +Z, esquerda dele = +X.
 */
import { B } from './rig.js';
import { GROUPS } from './geo.js';

/** Pontos notáveis das armas alternativas (espaço do osso `weapon`). */
export const GUNS = {
  rifle: { muzzle: [0, 0.072, 0.67] },
  shotgun: { muzzle: [0, 0.083, 0.64] },
  // objetiva da luneta (reflexo) e boca do cano
  sniper: { muzzle: [0, 0.072, 0.98], scope: [0, 0.168, 0.345] },
};

// pseudo-aleatório determinístico (a geometria é a mesma a cada carga)
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function addRoleGear(b, M, V, chestW) {
  const core = GROUPS.core;
  const head = B.head;
  if (V.gasmask) {
    const mask = { color: '#1b1c1b', rough: 0.62, fabric: 0.15 };
    const rub = { color: '#121212', rough: 0.82, fabric: 0.3 };
    // corpo da máscara (cobre boca/nariz/olhos)
    b.ellipsoid([0.074, 0.074, 0.052], { p: [0, 1.6, 0.094] }, mask, head, core, 16, 12);
    // focinho do diafragma de voz
    b.cyl([0, 1.565, 0.13], [0, 1.555, 0.158], 0.026, 0.022, rub, head, core, 14);
    for (let k = 0; k < 4; k++) b.box([0.04, 0.004, 0.006], { p: [0, 1.548 + k * 0.009, 0.159] }, M.metal, head, core, 0.001, 1);
    // filtro lateral (lado esquerdo dele), rosca e corpo canelado
    b.cyl([0.045, 1.57, 0.125], [0.075, 1.552, 0.16], 0.016, 0.016, rub, head, core, 12);
    b.cyl([0.075, 1.552, 0.16], [0.112, 1.535, 0.2], 0.04, 0.04, { color: '#3a3d33', rough: 0.45, metal: 0.4, fabric: 0 }, head, core, 18);
    for (let k = 0; k < 3; k++) {
      const t = 0.25 + k * 0.25;
      b.cyl([0.075 + 0.037 * t, 1.552 - 0.017 * t, 0.16 + 0.04 * t], [0.077 + 0.037 * t, 1.551 - 0.017 * t, 0.162 + 0.04 * t], 0.042, 0.042, M.metal, head, core, 18);
    }
    // lentes
    for (const sx of [1, -1]) {
      b.cyl([sx * 0.033, 1.638, 0.126], [sx * 0.035, 1.638, 0.142], 0.025, 0.025, rub, head, core, 16);
      b.cyl([sx * 0.035, 1.638, 0.142], [sx * 0.035, 1.638, 0.144], 0.02, 0.02, M.lens, head, core, 16);
    }
    // tirantes da cabeça
    for (const [y, r] of [[1.66, 0.105], [1.58, 0.1]])
      for (const sx of [1, -1]) b.box([0.012, 0.016, 0.12], { p: [sx * r * 0.9, y, 0.0], r: [0, sx * 0.5, 0] }, rub, head, core, 0.003);
  }

  if (V.heavy) {
    const plate = { color: '#2c2d2b', rough: 0.5, metal: 0.2, fabric: 0.2 };
    b.box([0.26, 0.2, 0.03], { p: [0, 1.36, 0.165], r: [-0.06, 0, 0] }, plate, chestW, core, 0.012, 2);
    // protetor de virilha
    b.box([0.17, 0.15, 0.025], { p: [0, 0.86, 0.13], r: [0.08, 0, 0] }, M.gear, (p) => [[B.hips, 1]], core, 0.01);
    // protetores de pescoço
    b.box([0.24, 0.05, 0.045], { p: [0, 1.5, 0.12], r: [-0.3, 0, 0] }, M.gear, chestW, core, 0.015);
  }

  if (V.shells) {
    // bandoleira atravessada (ombro direito → quadril esquerdo) com cartuchos
    const belt = { color: '#2a2722', rough: 0.85, fabric: 0.8 };
    const shell = { color: '#7a1f18', rough: 0.45, fabric: 0.05 };
    const brass = { color: '#9c7a3a', rough: 0.3, metal: 0.85, fabric: 0 };
    const a = [-0.16, 1.47, 0.16], c = [0.15, 1.08, 0.16];
    const n = 9;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t;
      const z = 0.175 + Math.sin(t * Math.PI) * 0.02;
      const ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
      b.box([0.05, 0.03, 0.012], { p: [x, y, z], r: [0, 0, ang] }, belt, chestW, core, 0.004);
      // cartucho em pé na alça (perpendicular à faixa)
      const px = -Math.sin(ang) * 0.01, py = Math.cos(ang) * 0.01;
      b.cyl([x - px * 2, y - py * 2, z + 0.012], [x + px * 2.4, y + py * 2.4, z + 0.012], 0.0095, 0.0095, shell, chestW, core, 8);
      b.cyl([x - px * 2.6, y - py * 2.6, z + 0.012], [x - px * 2, y - py * 2, z + 0.012], 0.0102, 0.0102, brass, chestW, core, 8);
    }
  }

  if (V.ghillie) {
    // tiras de juta/folhagem: capuz sobre o boonie, ombros e costas
    const rnd = prng(911);
    const cols = ['#4d4a33', '#5c5638', '#3e3f2a', '#6a6040', '#47452f', '#565a3a'];
    const strips = [];
    for (let k = 0; k < 70; k++) {
      // ângulo em torno do pescoço: costas e ombros (evita a frente do rosto)
      const a = (rnd() - 0.5) * Math.PI * 1.55 + Math.PI;
      const ring = rnd();
      const r = 0.11 + ring * 0.12;
      const y = 1.72 - ring * 0.32 + rnd() * 0.04;
      strips.push([a, r, y, 0.08 + rnd() * 0.14, cols[Math.floor(rnd() * cols.length)], rnd()]);
    }
    for (const [a, r, y, len, col, j] of strips) {
      const x = Math.sin(a) * r, z = Math.cos(a) * r * 0.9;
      const mat = { color: col, rough: 0.97, fabric: 1 };
      const w = y > 1.55 ? head : (p) => chestW(p);
      b.box([0.022 + j * 0.02, len, 0.006], { p: [x, y - len * 0.45, z], r: [Math.cos(a) * 0.35 * -1, a, Math.sin(a) * 0.3] }, mat, w, core, 0.002);
    }
  }

  if (V.visor) {
    // viseira balística: meia-casca fumê presa às laterais do capacete
    const vis = { color: '#1a2024', rough: 0.05, metal: 0.4, fabric: 0 };
    const segs = 9;
    for (let k = 0; k < segs; k++) {
      const a0 = -1.05 + (k / segs) * 2.1, a1 = -1.05 + ((k + 1) / segs) * 2.1;
      const am = (a0 + a1) / 2;
      const r = 0.128;
      b.box([r * (a1 - a0) + 0.003, 0.13, 0.006], { p: [Math.sin(am) * r, 1.605, Math.cos(am) * r + 0.012], r: [0.08, am, 0] }, vis, head, core, 0.002);
    }
    for (const sx of [1, -1]) b.cyl([sx * 0.12, 1.68, 0.04], [sx * 0.135, 1.68, 0.04], 0.018, 0.018, M.metal, head, core, 10);
    b.box([0.25, 0.018, 0.03], { p: [0, 1.672, 0.125], r: [0.1, 0, 0] }, M.poly, head, core, 0.006);
  }

  if (V.pads) {
    for (const sx of [1, -1]) {
      const ua = B[sx > 0 ? 'upperArm.L' : 'upperArm.R'];
      const grp = sx > 0 ? GROUPS.armL : GROUPS.armR;
      b.ellipsoid([0.075, 0.05, 0.08], { p: [sx * 0.205, 1.43, -0.005], r: [0, 0, sx * -0.35] }, { color: '#252725', rough: 0.55, fabric: 0.2 }, ua, grp, 12, 8);
      b.box([0.1, 0.012, 0.09], { p: [sx * 0.2, 1.385, 0], r: [0, 0, sx * -0.2] }, M.webbing, ua, grp, 0.004);
    }
  }

  if (V.medic) {
    const white = { color: '#d8d6cf', rough: 0.8, fabric: 0.9 };
    const green = { color: '#2e6b3a', rough: 0.7, fabric: 0.6 };
    for (const sx of [1, -1]) {
      const ua = B[sx > 0 ? 'upperArm.L' : 'upperArm.R'];
      const grp = sx > 0 ? GROUPS.armL : GROUPS.armR;
      // braçadeira (anel) + cruz verde do lado de fora
      b.cyl([sx * 0.193, 1.31, -0.018], [sx * 0.196, 1.255, -0.02], 0.066, 0.066, white, ua, grp, 16, true);
      b.cyl([sx * 0.193, 1.31, -0.018], [sx * 0.196, 1.255, -0.02], 0.064, 0.064, white, ua, grp, 16, true);
      b.box([0.006, 0.04, 0.014], { p: [sx * 0.262, 1.283, -0.019] }, green, ua, grp, 0.002);
      b.box([0.006, 0.014, 0.04], { p: [sx * 0.262, 1.283, -0.019] }, green, ua, grp, 0.002);
    }
    // bolsa médica no quadril direito (frente branca com faixa verde)
    const bag = { color: '#5f5444', rough: 0.75, fabric: 0.85 };
    b.box([0.12, 0.14, 0.09], { p: [-0.2, 0.9, 0.0] }, bag, (p) => [[B.hips, 1]], core, 0.018, 2);
    b.box([0.004, 0.06, 0.06], { p: [-0.262, 0.91, 0.0] }, white, (p) => [[B.hips, 1]], core, 0.002);
    b.box([0.005, 0.045, 0.014], { p: [-0.264, 0.91, 0.0] }, green, (p) => [[B.hips, 1]], core, 0.002);
    b.box([0.005, 0.014, 0.045], { p: [-0.264, 0.91, 0.0] }, green, (p) => [[B.hips, 1]], core, 0.002);
    // injetor no peito (tubo com tampa verde)
    b.cyl([0.06, 1.4, 0.172], [0.06, 1.3, 0.175], 0.011, 0.011, { color: '#c9c7bd', rough: 0.4, fabric: 0 }, chestW, core, 10);
    b.cyl([0.06, 1.4, 0.172], [0.06, 1.42, 0.171], 0.012, 0.012, green, chestW, core, 10);
    // faixa branca com cruz no capacete (traseira)
    b.box([0.07, 0.07, 0.006], { p: [0, 1.73, -0.128], r: [-0.4, 0, 0] }, white, head, core, 0.004);
    b.box([0.045, 0.012, 0.006], { p: [0, 1.73, -0.132], r: [-0.4, 0, 0] }, green, head, core, 0.002);
    b.box([0.012, 0.045, 0.006], { p: [0, 1.73, -0.132], r: [-0.4, 0, 0] }, green, head, core, 0.002);
  }
}

/** Escopeta de bomba (pontos de empunhadura compatíveis com o fuzil). */
export function addShotgun(b, M) {
  const g = GROUPS.gun, w = B.weapon;
  const BORE = 0.083;
  const wood = { color: '#3a2a1c', rough: 0.55, fabric: -1 };
  // receptor alto
  b.box([0.034, 0.066, 0.2], { p: [0, 0.066, 0.06] }, M.gunMetal, w, g, 0.006);
  b.box([0.004, 0.022, 0.07], { p: [-0.018, 0.075, 0.08] }, M.gunWorn, w, g, 0.001);
  // empunhadura de pistola + guarda-mato
  b.box([0.03, 0.115, 0.042], { p: [0, -0.02, -0.012], r: [0.35, 0, 0] }, M.gunPoly, w, g, 0.009);
  b.box([0.008, 0.006, 0.07], { p: [0, 0.012, 0.04] }, M.gunMetal, w, g, 0.002);
  // coronha cheia
  b.box([0.04, 0.085, 0.2], { p: [0, 0.05, -0.15], r: [0.06, 0, 0] }, M.gunPoly, w, g, 0.014);
  b.box([0.044, 0.105, 0.022], { p: [0, 0.04, -0.248] }, M.gunRubber, w, g, 0.008);
  // cano + tubo do depósito + telha de bomba (onde fica a mão esquerda)
  b.cyl([0, BORE, 0.16], [0, BORE, 0.64], 0.0115, 0.0115, M.gunMetal, w, g, 14);
  b.cyl([0, 0.054, 0.16], [0, 0.054, 0.56], 0.0125, 0.0125, M.gunMetal, w, g, 14);
  b.cyl([0, 0.054, 0.56], [0, 0.054, 0.575], 0.0135, 0.0135, M.gunWorn, w, g, 14);
  b.box([0.044, 0.05, 0.14], { p: [0, 0.058, 0.24] }, wood, w, g, 0.012);
  for (let k = 0; k < 6; k++) b.box([0.046, 0.004, 0.008], { p: [0, 0.036, 0.185 + k * 0.022] }, M.gunRubber, w, g, 0.001, 1);
  // escudo de calor perfurado sobre o cano
  b.box([0.026, 0.008, 0.3], { p: [0, BORE + 0.016, 0.42] }, M.gunPoly, w, g, 0.002);
  for (let k = 0; k < 8; k++) b.box([0.012, 0.009, 0.012], { p: [0, BORE + 0.017, 0.3 + k * 0.035] }, M.gunRubber, w, g, 0.001, 1);
  // massa de mira (conta) e alça fantasma
  b.cyl([0, BORE + 0.018, 0.625], [0, BORE + 0.026, 0.625], 0.003, 0.003, { color: '#c79a3a', rough: 0.3, metal: 0.8, fabric: -1 }, w, g, 8);
  b.box([0.028, 0.02, 0.016], { p: [0, 0.108, 0.1] }, M.gunMetal, w, g, 0.003);
  // cartucheira lateral (6 cartuchos vermelhos no lado esquerdo do receptor)
  b.box([0.008, 0.04, 0.09], { p: [0.021, 0.07, 0.05] }, M.gunPoly, w, g, 0.003);
  for (let k = 0; k < 6; k++) {
    const z = 0.015 + k * 0.014;
    b.cyl([0.03, 0.05, z], [0.03, 0.088, z], 0.0062, 0.0062, { color: '#8a2219', rough: 0.45, fabric: -1 }, w, g, 8);
    b.cyl([0.03, 0.046, z], [0.03, 0.052, z], 0.0066, 0.0066, { color: '#a07c3c', rough: 0.3, metal: 0.85, fabric: -1 }, w, g, 8);
  }
}

/** Fuzil de ferrolho com luneta (reflexo na objetiva: gear.js). */
export function addSniper(b, M) {
  const g = GROUPS.gun, w = B.weapon;
  const BORE = 0.072;
  const stock = { color: '#3b3d33', rough: 0.62, fabric: -1 };
  // receptor cilíndrico + ferrolho com alavanca à direita (-X)
  b.cyl([0, 0.08, -0.03], [0, 0.08, 0.2], 0.021, 0.021, M.gunMetal, w, g, 16);
  b.cyl([-0.004, 0.084, 0.0], [-0.05, 0.07, -0.005], 0.0045, 0.0045, M.gunWorn, w, g, 8);
  b.ellipsoid([0.011, 0.011, 0.011], { p: [-0.053, 0.068, -0.005] }, M.gunWorn, w, g, 8, 6);
  // coronha de polímero com furo de polegar e apoio de face
  b.box([0.04, 0.05, 0.36], { p: [0, 0.045, 0.06] }, stock, w, g, 0.012);
  b.box([0.032, 0.115, 0.044], { p: [0, -0.02, -0.012], r: [0.35, 0, 0] }, stock, w, g, 0.009);
  b.box([0.038, 0.11, 0.2], { p: [0, 0.035, -0.16], r: [0.04, 0, 0] }, stock, w, g, 0.014);
  b.box([0.03, 0.03, 0.12], { p: [0, 0.108, -0.14] }, stock, w, g, 0.01);
  b.box([0.044, 0.12, 0.022], { p: [0, 0.035, -0.252] }, M.gunRubber, w, g, 0.008);
  // carregador destacável curto
  b.box([0.03, 0.05, 0.07], { p: [0, 0.0, 0.12] }, M.gunMag, w, g, 0.004);
  // cano pesado canelado + freio de boca
  b.cyl([0, BORE + 0.008, 0.2], [0, BORE, 0.9], 0.0145, 0.0115, M.gunMetal, w, g, 14);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.box([0.003, 0.003, 0.4], { p: [Math.cos(a) * 0.0135, BORE + 0.006 + Math.sin(a) * 0.0135, 0.48] }, M.gunRubber, w, g, 0.001, 1);
  }
  b.box([0.034, 0.024, 0.08], { p: [0, BORE, 0.94] }, M.gunMetal, w, g, 0.004);
  for (let k = 0; k < 3; k++) b.box([0.036, 0.016, 0.008], { p: [0, BORE, 0.915 + k * 0.022] }, M.gunRubber, w, g, 0.001, 1);
  // luneta: tubo, campânula da objetiva, ocular, torres, anéis
  const sc = 0.168;
  b.cyl([0, sc, -0.02], [0, sc, 0.25], 0.017, 0.017, M.gunMetal, w, g, 16);
  b.cyl([0, sc, 0.25], [0, sc, 0.3], 0.017, 0.029, M.gunMetal, w, g, 18);
  b.cyl([0, sc, 0.3], [0, sc, 0.34], 0.029, 0.029, M.gunMetal, w, g, 18);
  b.cyl([0, sc, 0.34], [0, sc, 0.343], 0.025, 0.025, M.gunLens, w, g, 18);
  b.cyl([0, sc, -0.06], [0, sc, -0.02], 0.021, 0.017, M.gunMetal, w, g, 16);
  b.cyl([0, sc, -0.062], [0, sc, -0.06], 0.018, 0.018, M.gunLens, w, g, 16);
  b.cyl([0, sc + 0.015, 0.11], [0, sc + 0.033, 0.11], 0.011, 0.011, M.gunWorn, w, g, 12);
  b.cyl([0.015, sc, 0.11], [0.032, sc, 0.11], 0.011, 0.011, M.gunWorn, w, g, 12);
  for (const z of [0.02, 0.19]) {
    b.box([0.024, 0.06, 0.018], { p: [0, sc - 0.06, z] }, M.gunMetal, w, g, 0.003);
    b.cyl([0, sc, z - 0.009], [0, sc, z + 0.009], 0.02, 0.02, M.gunMetal, w, g, 14);
  }
  // bipé rebatido + trilho do laser sob o guarda-mão
  for (const sx of [1, -1]) b.box([0.008, 0.008, 0.22], { p: [sx * 0.016, 0.012, 0.36] }, M.gunMetal, w, g, 0.002);
  b.box([0.022, 0.018, 0.05], { p: [0, 0.01, 0.23] }, M.gunPoly, w, g, 0.004);
}
