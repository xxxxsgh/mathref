/**
 * Modelo procedural do soldado (espaço de repouso — ver rig.js):
 * corpo (loft de tronco, tubos de braços/pernas), balaclava, óculos
 * balísticos, capacete high-cut com capa camuflada, trilhos, shroud de NVG,
 * contrapeso e fone com microfone; plate carrier com cummerbund, porta-
 * carregadores triplo com carregadores, admin pouch, rádio com antena,
 * torniquete, alça de arrasto, mochila de assalto; cinto de guerra com
 * bolsos, coldre de perna; joelheiras, bolsos cargo, botas com sola e
 * cadarço; luvas com protetor de nós; e o fuzil (osso `weapon`).
 *
 * Variantes (`variant`) mudam paleta do equipamento e alguns acessórios.
 */
import { SkinBuilder, GROUPS } from './geo.js';
import { B } from './rig.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ─── pesos ───────────────────────────────────────────────────────────────
function torsoW(p) {
  const y = p.y;
  const out = [];
  if (y < 0.98) out.push([B.hips, 1]);
  else if (y < 1.12) {
    const t = sstep(0.98, 1.12, y);
    out.push([B.hips, 1 - t], [B.spine, t]);
  } else if (y < 1.3) {
    const t = sstep(1.12, 1.3, y);
    out.push([B.spine, 1 - t], [B.chest, t]);
  } else if (y < 1.47) out.push([B.chest, 1]);
  else {
    const t = sstep(1.47, 1.58, y) * 0.7;
    out.push([B.chest, 1 - t], [B.neck, t]);
  }
  // quadril acompanha um pouco a coxa
  if (y < 0.96) {
    const k = sstep(0.96, 0.84, y) * 0.6 * sstep(0.02, 0.12, Math.abs(p.x));
    const th = p.x > 0 ? B['thigh.L'] : B['thigh.R'];
    for (const o of out) o[1] *= 1 - k;
    out.push([th, k]);
  }
  // ombro acompanha um pouco o braço
  if (Math.abs(p.x) > 0.12 && y > 1.33) {
    const k = sstep(0.12, 0.2, Math.abs(p.x)) * sstep(1.33, 1.43, y) * 0.35;
    const ua = p.x > 0 ? B['upperArm.L'] : B['upperArm.R'];
    for (const o of out) o[1] *= 1 - k;
    out.push([ua, k]);
  }
  return out;
}

const armW = (side) => (p) => {
  const ua = B['upperArm.' + side], fa = B['foreArm.' + side], hd = B['hand.' + side];
  const y = p.y;
  if (y > 1.18) {
    const k = sstep(1.4, 1.5, y) * 0.3;
    return [[ua, 1 - k], [B.chest, k]];
  }
  if (y > 1.12) {
    const t = sstep(1.18, 1.12, y);
    return [[ua, 1 - t], [fa, t]];
  }
  if (y > 0.915) return [[fa, 1]];
  if (y > 0.875) {
    const t = sstep(0.915, 0.875, y);
    return [[fa, 1 - t], [hd, t]];
  }
  return [[hd, 1]];
};

const legW = (side) => (p) => {
  const th = B['thigh.' + side], sh = B['shin.' + side], ft = B['foot.' + side];
  const y = p.y;
  if (y > 0.97) return [[B.hips, 1]];
  if (y > 0.88) {
    const t = sstep(0.97, 0.88, y);
    return [[B.hips, 1 - t], [th, t]];
  }
  if (y > 0.56) return [[th, 1]];
  if (y > 0.47) {
    const t = sstep(0.56, 0.47, y);
    return [[th, 1 - t], [sh, t]];
  }
  if (y > 0.17) return [[sh, 1]];
  if (y > 0.1) {
    const t = sstep(0.17, 0.1, y);
    return [[sh, 1 - t], [ft, t]];
  }
  return [[ft, 1]];
};

const headW = (p) => {
  if (p.y > 1.6) return [[B.head, 1]];
  const t = sstep(1.5, 1.6, p.y);
  return [[B.neck, 1 - t], [B.head, t]];
};

// ─── paletas de equipamento ──────────────────────────────────────────────
export const VARIANTS = [
  // fuzileiro: camuflagem verde escura, colete ranger green, mochila
  { name: 'rifleman', camo: 'woodland', gear: '#3f4232', gear2: '#33362a', helmetCamo: 1, belt: '#2f3027', glove: '#242422', boot: '#3e3428', bala: '#2a2b27', shirt: '#4b4d41', ruck: true },
  // metralhador: uniforme cinza-urbano, equipamento preto
  { name: 'gunner', camo: 'urban', gear: '#262725', gear2: '#1e1f1d', helmetCamo: 0, helmet: '#2b2c2a', belt: '#1f201e', glove: '#1b1b1a', boot: '#2c2722', bala: '#1f201e', shirt: '#3b3d39', ruck: false },
  // líder: colete coyote, camuflagem árida
  { name: 'lead', camo: 'arid', gear: '#6a5c46', gear2: '#55493a', helmetCamo: 1, belt: '#4f4436', glove: '#4e4234', boot: '#4a3c2c', bala: '#2f2d28', shirt: '#57524a', ruck: true },
];

export function buildSoldierGeometry(variant = VARIANTS[0]) {
  const b = new SkinBuilder();
  const V = variant;
  const M = {
    uniform: { color: '#e9e6dc', rough: 0.9, camo: 1, fabric: 1 },
    shirt: { color: V.shirt, rough: 0.92, fabric: 1 },
    gear: { color: V.gear, rough: 0.74, fabric: 1 },
    gear2: { color: V.gear2, rough: 0.76, fabric: 1 },
    webbing: { color: V.gear2, rough: 0.8, fabric: 0.9 },
    belt: { color: V.belt, rough: 0.78, fabric: 0.9 },
    bala: { color: V.bala, rough: 0.97, fabric: 1 },
    skin: { color: '#8e6a58', rough: 0.55, fabric: 0.35 },
    glove: { color: V.glove, rough: 0.72, fabric: 0.55 },
    knuckle: { color: '#1a1a19', rough: 0.45, fabric: 0.1 },
    boot: { color: V.boot, rough: 0.85, fabric: 0.5 },
    sole: { color: '#1e1c1a', rough: 0.92, fabric: 0.5 },
    lace: { color: '#2a2722', rough: 0.9, fabric: 1 },
    helmet: V.helmetCamo ? { color: '#e4e0d4', rough: 0.85, camo: 1, fabric: 1 } : { color: V.helmet || '#55553f', rough: 0.55, fabric: 0.45 },
    poly: { color: '#1f201f', rough: 0.55, fabric: 0.05 },
    gunPoly: { color: '#232423', rough: 0.58, fabric: -1 },
    gunMetal: { color: '#28292b', rough: 0.34, metal: 0.75, fabric: -1 },
    gunWorn: { color: '#3d3e41', rough: 0.28, metal: 0.85, fabric: -1 },
    gunRubber: { color: '#161616', rough: 0.85, fabric: -1 },
    gunMag: { color: '#2b2b28', rough: 0.5, fabric: -1 },
    gunLens: { color: '#191512', rough: 0.05, metal: 0.9, fabric: -1 },
    gunLensRed: { color: '#30100c', rough: 0.05, metal: 0.9, fabric: -1 },
    polyTan: { color: '#7d6d52', rough: 0.6, fabric: 0.05 },
    rubber: { color: '#151515', rough: 0.85, fabric: 0.5 },
    metal: { color: '#26272a', rough: 0.36, metal: 0.7, fabric: 0 },
    metalWorn: { color: '#3c3d40', rough: 0.3, metal: 0.85, fabric: 0 },
    lens: { color: '#191512', rough: 0.06, metal: 0.85, fabric: 0 },
    lensRed: { color: '#30100c', rough: 0.05, metal: 0.9, fabric: 0 },
    patch: { color: '#45463a', rough: 0.95, fabric: 1 },
    mag: { color: '#2c2c29', rough: 0.5, fabric: 0.1 },
    radio: { color: '#30322b', rough: 0.5, metal: 0.15, fabric: 0.1 },
    tq: { color: '#1b1b1a', rough: 0.8, fabric: 0.9 },
    tqTab: { color: '#5a2620', rough: 0.7, fabric: 0.3 },
    cup: { color: '#3d3f37', rough: 0.55, fabric: 0.15 },
    kneepad: { color: '#272826', rough: 0.6, fabric: 0.3 },
  };
  const core = GROUPS.core;

  // ═══ TRONCO ═══════════════════════════════════════════════════════════
  // calça (quadril) — loft camuflado
  b.loft(
    [
      { c: [0, 0.82, 0.0], ru: 0.135, rv: 0.095, n: 2.4 },
      { c: [0, 0.88, -0.004], ru: 0.162, rv: 0.11, rvb: 0.125, n: 2.4 },
      { c: [0, 0.95, -0.004], ru: 0.17, rv: 0.112, rvb: 0.122, n: 2.4 },
      { c: [0, 1.02, 0.0], ru: 0.162, rv: 0.105, rvb: 0.11, n: 2.4 },
    ],
    M.uniform,
    torsoW,
    core,
    { seg: 24, caps: [true, false] },
  );
  // camisa de combate (tronco) — fica quase toda sob o colete
  b.loft(
    [
      { c: [0, 1.0, 0.0], ru: 0.16, rv: 0.104, rvb: 0.108, n: 2.4 },
      { c: [0, 1.09, 0.006], ru: 0.152, rv: 0.1, rvb: 0.1, n: 2.4 },
      { c: [0, 1.19, 0.012], ru: 0.158, rv: 0.106, rvb: 0.1, n: 2.5 },
      { c: [0, 1.29, 0.012], ru: 0.175, rv: 0.114, rvb: 0.106, n: 2.6 },
      { c: [0, 1.37, 0.008], ru: 0.186, rv: 0.114, rvb: 0.104, n: 2.6 },
      { c: [0, 1.43, 0.0], ru: 0.19, rv: 0.104, rvb: 0.1, n: 2.5 },
      { c: [0, 1.475, -0.008], ru: 0.165, rv: 0.088, n: 2.3 },
      { c: [0, 1.505, -0.012], ru: 0.11, rv: 0.072, n: 2.2 },
      { c: [0, 1.53, -0.012], ru: 0.066, rv: 0.06, n: 2 },
    ],
    M.shirt,
    torsoW,
    core,
    { seg: 24, caps: [false, false] },
  );
  // gola da camisa (camuflada, gola alta tipo combat shirt)
  b.tube(
    [
      { p: [0, 1.5, -0.012], ru: 0.075, rv: 0.068 },
      { p: [0, 1.56, -0.012], ru: 0.07, rv: 0.064 },
    ],
    M.uniform,
    headW,
    core,
    { seg: 18, side: [1, 0, 0], caps: [false, false] },
  );

  // ═══ CABEÇA ═══════════════════════════════════════════════════════════
  b.cyl([0, 1.5, -0.012], [0, 1.66, 0.0], 0.056, 0.054, M.bala, headW, core, 14);
  b.ellipsoid([0.081, 0.106, 0.096], { p: [0, 1.692, 0.01] }, M.bala, headW, core, 20, 16);
  // mandíbula/queixo
  b.ellipsoid([0.066, 0.05, 0.066], { p: [0, 1.632, 0.038] }, M.bala, headW, core, 16, 10);
  // nariz sob o tecido
  b.ellipsoid([0.015, 0.026, 0.02], { p: [0, 1.684, 0.1], r: [0.25, 0, 0] }, M.bala, headW, core, 8, 6);
  // faixa de pele nos olhos
  b.ellipsoid([0.062, 0.02, 0.03], { p: [0, 1.708, 0.082] }, M.skin, headW, core, 16, 8);
  // óculos balísticos: lente curva + armação
  b.loft(
    [
      { c: [0, 1.69, 0.012], ru: 0.09, rv: 0.11, n: 2 },
      { c: [0, 1.728, 0.012], ru: 0.09, rv: 0.11, n: 2 },
    ],
    M.lens,
    headW,
    core,
    { seg: 16, caps: [false, false], arc: [0.12 * Math.PI, 0.88 * Math.PI] },
  );
  b.loft(
    [
      { c: [0, 1.728, 0.012], ru: 0.092, rv: 0.112, n: 2 },
      { c: [0, 1.735, 0.012], ru: 0.092, rv: 0.112, n: 2 },
    ],
    M.poly,
    headW,
    core,
    { seg: 16, caps: [false, false], arc: [0.1 * Math.PI, 0.9 * Math.PI] },
  );
  // hastes dos óculos
  for (const sx of [1, -1]) b.box([0.006, 0.008, 0.09], { p: [sx * 0.088, 1.72, -0.02] }, M.poly, B.head, core, 0.002);

  // ── fones (abafadores) com headband e microfone ──
  for (const sx of [1, -1]) {
    b.cyl([sx * 0.074, 1.69, -0.004], [sx * 0.112, 1.69, -0.004], 0.044, 0.04, M.cup, B.head, core, 18);
    b.cyl([sx * 0.11, 1.69, -0.004], [sx * 0.118, 1.69, -0.004], 0.036, 0.02, M.poly, B.head, core, 14);
    b.box([0.012, 0.07, 0.02], { p: [sx * 0.098, 1.74, -0.004] }, M.poly, B.head, core, 0.004);
  }
  b.tube(
    [
      { p: [0.105, 1.675, 0.03], ru: 0.005 },
      { p: [0.085, 1.645, 0.085], ru: 0.004 },
      { p: [0.035, 1.636, 0.112], ru: 0.004 },
    ],
    M.poly,
    B.head,
    core,
    { seg: 6 },
  );
  b.ellipsoid([0.012, 0.01, 0.012], { p: [0.025, 1.636, 0.115] }, M.rubber, B.head, core, 8, 6);

  // ── capacete high-cut ──
  {
    const hc = [0, 1.708, -0.006];
    const rx = 0.113, ry = 0.124, rz = 0.13;
    const rings = [];
    const NR = 12;
    for (let k = 0; k <= NR; k++) {
      // de cima (k=0) para a borda
      const th = 0.02 + (k / NR) * 1.62;
      rings.push(th);
    }
    // calota como loft de anéis horizontais; corte variável por ângulo
    const seg = 36;
    const verts = [];
    for (const th of rings) {
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const dz = Math.cos(a), dx = Math.sin(a);
        // linha de corte (ângulo polar máx.) — testa alta, laterais altas (high cut), nuca mais baixa
        const front = Math.max(0, dz), back = Math.max(0, -dz), side = Math.abs(dx);
        const thMax = 1.28 + back * 0.4 - front * 0.06;
        const sideCut = side * (1 - back) * 0.3;
        const t = Math.min(th, thMax - sideCut);
        ring.push([hc[0] + rx * Math.sin(t) * dx, hc[1] + ry * Math.cos(t), hc[2] + rz * Math.sin(t) * dz]);
      }
      verts.push(ring);
    }
    const loftRings = verts;
    // monta direto via tube-like: cria geometria manual
    addRingMesh(b, loftRings, M.helmet, B.head, core, true);
    // borda de borracha seguindo o último anel
    const edge = loftRings[loftRings.length - 1];
    const ep = [];
    for (let i = 0; i <= seg; i += 1) ep.push({ p: edge[i % seg], ru: 0.0065 });
    b.tube(ep, M.rubber, B.head, core, { seg: 6, caps: [false, false], side: [0, 1, 0] });
    // trilhos laterais (ARC)
    for (const sx of [1, -1]) {
      b.box([0.012, 0.022, 0.13], { p: [sx * 0.124, 1.735, -0.012], r: [0.12, 0, sx * 0.18] }, M.poly, B.head, core, 0.003);
      // parafusos de suspensão
      b.cyl([sx * 0.124, 1.705, 0.05], [sx * 0.131, 1.705, 0.05], 0.007, 0.007, M.metal, B.head, core, 8);
    }
    // shroud de NVG
    b.box([0.055, 0.045, 0.018], { p: [0, 1.79, 0.13], r: [-0.55, 0, 0] }, M.poly, B.head, core, 0.004);
    b.box([0.03, 0.018, 0.016], { p: [0, 1.775, 0.142], r: [-0.55, 0, 0] }, M.metal, B.head, core, 0.003);
    // velcro no topo e na traseira
    b.box([0.09, 0.008, 0.07], { p: [0, 1.842, -0.01], r: [-0.08, 0, 0] }, M.patch, B.head, core, 0.004);
    // contrapeso / bateria na nuca
    b.box([0.085, 0.055, 0.035], { p: [0, 1.745, -0.148], r: [0.45, 0, 0] }, M.gear2, B.head, core, 0.01);
    // cabo elástico (bungee) lateral
    for (const sx of [1, -1]) b.box([0.006, 0.006, 0.17], { p: [sx * 0.112, 1.785, -0.01], r: [0.28, 0, sx * 0.5] }, M.rubber, B.head, core, 0.002);
    // jugular (tirantes do queixo)
    for (const sx of [1, -1]) {
      b.tube(
        [
          { p: [sx * 0.118, 1.71, 0.03], ru: 0.006, rv: 0.0025 },
          { p: [sx * 0.092, 1.65, 0.05], ru: 0.006, rv: 0.0025 },
          { p: [sx * 0.05, 1.605, 0.055], ru: 0.006, rv: 0.0025 },
        ],
        M.webbing,
        B.head,
        core,
        { seg: 6, side: [0, 0, 1] },
      );
    }
  }

  // ═══ BRAÇOS ═══════════════════════════════════════════════════════════
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const grp = side === 'L' ? GROUPS.armL : GROUPS.armR;
    const w = armW(side);
    const X = (x) => sx * x;
    // manga (camuflada) do ombro ao punho
    b.tube(
      [
        { p: [X(0.17), 1.5, -0.012], ru: 0.05, rv: 0.06 },
        { p: [X(0.188), 1.45, -0.015], ru: 0.066, rv: 0.068 },
        { p: [X(0.192), 1.38, -0.017], ru: 0.066, rv: 0.066 },
        { p: [X(0.194), 1.3, -0.019], ru: 0.06, rv: 0.06 },
        { p: [X(0.196), 1.22, -0.022], ru: 0.055, rv: 0.056 },
        { p: [X(0.198), 1.155, -0.025], ru: 0.052, rv: 0.055 },
        { p: [X(0.2), 1.1, -0.022], ru: 0.054, rv: 0.052 },
        { p: [X(0.203), 1.03, -0.016], ru: 0.05, rv: 0.046 },
        { p: [X(0.206), 0.96, -0.01], ru: 0.044, rv: 0.04 },
        { p: [X(0.207), 0.925, -0.007], ru: 0.04, rv: 0.036 },
      ],
      M.uniform,
      w,
      grp,
      { seg: 16, caps: [true, true] },
    );
    // deltoide
    b.ellipsoid([0.07, 0.06, 0.07], { p: [X(0.18), 1.445, -0.014] }, M.uniform, (p) => [[B['upperArm.' + side], 0.75], [B.chest, 0.25]], grp, 14, 10);
    // bolso de ombro com velcro (patch)
    b.box([0.012, 0.08, 0.075], { p: [X(0.255), 1.37, -0.016], r: [0, 0, sx * -0.04] }, M.uniform, B['upperArm.' + side], grp, 0.006);
    b.box([0.006, 0.05, 0.06], { p: [X(0.263), 1.375, -0.016], r: [0, 0, sx * -0.04] }, M.patch, B['upperArm.' + side], grp, 0.003);
    // cotoveleira discreta (reforço)
    b.ellipsoid([0.045, 0.05, 0.03], { p: [X(0.2), 1.15, -0.06] }, M.uniform, w, grp, 10, 8);
    // punho da luva
    b.cyl([X(0.207), 0.94, -0.006], [X(0.208), 0.89, -0.005], 0.04, 0.036, M.glove, w, grp, 14);
    addHand(b, side, M, grp);
  }

  // ═══ PERNAS ═══════════════════════════════════════════════════════════
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const X = (x) => sx * x;
    const w = legW(side);
    b.tube(
      [
        { p: [X(0.092), 1.0, -0.002], ru: 0.088, rv: 0.1 },
        { p: [X(0.094), 0.92, 0.0], ru: 0.092, rv: 0.1 },
        { p: [X(0.096), 0.82, 0.004], ru: 0.088, rv: 0.094 },
        { p: [X(0.098), 0.72, 0.008], ru: 0.08, rv: 0.085 },
        { p: [X(0.099), 0.62, 0.01], ru: 0.07, rv: 0.074 },
        { p: [X(0.1), 0.545, 0.012], ru: 0.064, rv: 0.068 },
        { p: [X(0.1), 0.48, 0.008], ru: 0.062, rv: 0.064 },
        { p: [X(0.101), 0.4, 0.0], ru: 0.064, rv: 0.068 },
        { p: [X(0.102), 0.31, -0.006], ru: 0.06, rv: 0.062 },
        { p: [X(0.103), 0.23, -0.01], ru: 0.054, rv: 0.055 },
        { p: [X(0.104), 0.17, -0.012], ru: 0.056, rv: 0.058 },
      ],
      M.uniform,
      w,
      core,
      { seg: 18, caps: [false, true] },
    );
    // bolso cargo
    b.box([0.03, 0.15, 0.12], { p: [X(0.178), 0.74, 0.006], r: [0, 0, sx * 0.04] }, M.uniform, w, core, 0.014);
    b.box([0.034, 0.03, 0.124], { p: [X(0.18), 0.82, 0.006], r: [0, 0, sx * 0.04] }, M.uniform, w, core, 0.008);
    // joelheira articulada
    b.box([0.09, 0.115, 0.03], { p: [X(0.1), 0.5, 0.068], r: [-0.08, 0, 0] }, M.kneepad, (p) => [[B['shin.' + side], 0.6], [B['thigh.' + side], 0.4]], core, 0.014);
    b.ellipsoid([0.04, 0.05, 0.016], { p: [X(0.1), 0.505, 0.085] }, M.poly, (p) => [[B['shin.' + side], 0.6], [B['thigh.' + side], 0.4]], core, 10, 8);
    for (const yy of [0.465, 0.545]) b.box([0.11, 0.014, 0.012], { p: [X(0.1), yy, 0.06] }, M.webbing, w, core, 0.003);
    addBoot(b, side, M, core);
  }

  // ═══ COLETE (plate carrier) ═══════════════════════════════════════════
  const chestW = (p) => {
    // placa rígida: peito, com a base indo um pouco para a coluna
    const t = sstep(1.24, 1.14, p.y) * 0.7;
    return [[B.chest, 1 - t], [B.spine, t]];
  };
  // fileiras MOLLE (tiras horizontais) nas placas
  for (let k = 0; k < 4; k++) b.box([0.27, 0.012, 0.006], { p: [0, 1.255 + k * 0.026, 0.158 - k * 0.0016], r: [-0.06, 0, 0] }, M.webbing, chestW, core, 0.002, 1);
  for (let k = 0; k < 6; k++) b.box([0.28, 0.012, 0.006], { p: [0, 1.2 + k * 0.03, -0.157 - k * 0.0012], r: [0.04, 0, 0] }, M.webbing, chestW, core, 0.002, 1);
  // placa frontal e traseira
  b.box([0.3, 0.33, 0.055], { p: [0, 1.31, 0.128], r: [-0.06, 0, 0] }, M.gear, chestW, core, 0.02, 3);
  b.box([0.31, 0.35, 0.05], { p: [0, 1.32, -0.13], r: [0.04, 0, 0] }, M.gear, chestW, core, 0.02, 3);
  // cummerbund (faixa elástica em volta)
  b.loft(
    [
      { c: [0, 1.11, 0.0], ru: 0.178, rv: 0.13, n: 3 },
      { c: [0, 1.17, 0.0], ru: 0.186, rv: 0.135, n: 3 },
      { c: [0, 1.24, 0.0], ru: 0.192, rv: 0.138, n: 3 },
    ],
    M.gear,
    torsoW,
    core,
    { seg: 28, caps: [false, false] },
  );
  // fileiras MOLLE no cummerbund (tiras)
  for (const yy of [1.135, 1.175, 1.215])
    b.loft(
      [
        { c: [0, yy - 0.006, 0.0], ru: 0.191, rv: 0.14, n: 3 },
        { c: [0, yy + 0.006, 0.0], ru: 0.191, rv: 0.14, n: 3 },
      ],
      M.webbing,
      torsoW,
      core,
      { seg: 28, caps: [false, false] },
    );
  // alças de ombro
  for (const sx of [1, -1]) {
    b.tube(
      [
        { p: [sx * 0.115, 1.45, 0.125], ru: 0.04, rv: 0.012 },
        { p: [sx * 0.118, 1.5, 0.07], ru: 0.042, rv: 0.012 },
        { p: [sx * 0.12, 1.52, 0.0], ru: 0.043, rv: 0.012 },
        { p: [sx * 0.118, 1.5, -0.07], ru: 0.042, rv: 0.012 },
        { p: [sx * 0.115, 1.45, -0.13], ru: 0.04, rv: 0.012 },
      ],
      M.gear,
      chestW,
      core,
      { seg: 8, side: [1, 0, 0] },
    );
    // acolchoamento do ombro
    b.box([0.07, 0.016, 0.1], { p: [sx * 0.125, 1.524, 0.0], r: [0, 0, sx * -0.25] }, M.gear2, B.chest, core, 0.006);
  }
  // painel frontal (placard) com porta-carregadores triplo
  b.box([0.3, 0.12, 0.05], { p: [0, 1.2, 0.165], r: [-0.04, 0, 0] }, M.gear, chestW, core, 0.012);
  for (const mx of [-0.088, 0, 0.088]) {
    // bolsa
    b.box([0.078, 0.105, 0.048], { p: [mx, 1.212, 0.205], r: [-0.04, 0, 0] }, M.gear, chestW, core, 0.01);
    // carregador saindo da bolsa (preso por bungee)
    b.box([0.026, 0.07, 0.058], { p: [mx, 1.27, 0.204], r: [-0.12, 0, 0] }, M.mag, chestW, core, 0.005);
    b.box([0.03, 0.012, 0.062], { p: [mx, 1.305, 0.2], r: [-0.12, 0, 0] }, M.poly, chestW, core, 0.004);
    b.box([0.07, 0.008, 0.05], { p: [mx, 1.262, 0.21], r: [-0.04, 0, 0] }, M.rubber, chestW, core, 0.003);
  }
  // admin pouch + patch + luz/IR strobe
  b.box([0.2, 0.08, 0.03], { p: [0, 1.39, 0.172], r: [-0.07, 0, 0] }, M.gear2, B.chest, core, 0.01);
  b.box([0.08, 0.05, 0.006], { p: [0.04, 1.395, 0.189], r: [-0.07, 0, 0] }, M.patch, B.chest, core, 0.004);
  b.box([0.03, 0.04, 0.02], { p: [-0.075, 1.4, 0.19], r: [-0.07, 0, 0] }, M.poly, B.chest, core, 0.006);
  // torniquete na alça esquerda
  b.cyl([0.13, 1.475, 0.13], [0.13, 1.39, 0.15], 0.018, 0.018, M.tq, B.chest, core, 10);
  b.box([0.03, 0.016, 0.012], { p: [0.13, 1.49, 0.13] }, M.tqTab, B.chest, core, 0.004);
  // rádio nas costas (esquerda) + antena
  b.box([0.07, 0.15, 0.05], { p: [0.115, 1.32, -0.185] }, M.gear2, chestW, core, 0.01);
  b.box([0.06, 0.13, 0.04], { p: [0.115, 1.33, -0.19] }, M.radio, chestW, core, 0.008);
  b.cyl([0.13, 1.4, -0.19], [0.17, 1.72, -0.24], 0.005, 0.003, M.rubber, B.chest, core, 6);
  b.cyl([0.13, 1.4, -0.19], [0.13, 1.42, -0.19], 0.012, 0.01, M.poly, B.chest, core, 8);
  // cabo do PTT
  b.tube(
    [
      { p: [0.11, 1.4, -0.16], ru: 0.004 },
      { p: [0.13, 1.5, -0.06], ru: 0.004 },
      { p: [0.12, 1.47, 0.11], ru: 0.004 },
    ],
    M.rubber,
    B.chest,
    core,
    { seg: 5 },
  );
  // mochila de assalto / hidratação
  if (V.ruck) {
    b.box([0.25, 0.27, 0.075], { p: [-0.01, 1.3, -0.19], r: [0.05, 0, 0] }, M.gear2, chestW, core, 0.03, 3);
    b.box([0.2, 0.09, 0.03], { p: [-0.01, 1.22, -0.235], r: [0.05, 0, 0] }, M.gear, chestW, core, 0.012);
    for (const xx of [-0.08, 0.06]) b.box([0.025, 0.24, 0.008], { p: [xx, 1.3, -0.23], r: [0.05, 0, 0] }, M.webbing, chestW, core, 0.003);
  } else {
    b.box([0.12, 0.1, 0.05], { p: [-0.05, 1.25, -0.175] }, M.gear2, chestW, core, 0.014);
  }
  // alça de arrasto
  b.tube(
    [
      { p: [-0.05, 1.47, -0.155], ru: 0.012, rv: 0.006 },
      { p: [0, 1.5, -0.17], ru: 0.012, rv: 0.006 },
      { p: [0.05, 1.47, -0.155], ru: 0.012, rv: 0.006 },
    ],
    M.webbing,
    B.chest,
    core,
    { seg: 6, side: [0, 0, 1] },
  );
  // bolsos laterais no cummerbund
  for (const sx of [1, -1]) b.box([0.04, 0.09, 0.08], { p: [sx * 0.2, 1.17, -0.02] }, M.gear2, torsoW, core, 0.01);

  // ═══ CINTO DE GUERRA ══════════════════════════════════════════════════
  b.loft(
    [
      { c: [0, 0.965, -0.002], ru: 0.176, rv: 0.12, n: 2.6 },
      { c: [0, 1.015, -0.002], ru: 0.172, rv: 0.116, n: 2.6 },
    ],
    M.belt,
    torsoW,
    core,
    { seg: 28, caps: [false, false] },
  );
  b.box([0.06, 0.04, 0.012], { p: [0, 0.99, 0.12] }, M.metalWorn, B.hips, core, 0.004);
  // porta-carregadores de pistola (frente esquerda)
  for (const xx of [0.07, 0.11]) b.box([0.035, 0.08, 0.03], { p: [xx, 0.96, 0.118], r: [0, -0.25, 0] }, M.gear2, B.hips, core, 0.006);
  // IFAK na traseira + dump pouch
  b.box([0.14, 0.09, 0.06], { p: [0, 0.97, -0.145] }, M.gear2, B.hips, core, 0.016);
  b.box([0.1, 0.13, 0.05], { p: [-0.15, 0.94, -0.1], r: [0, 0.6, 0] }, M.gear, B.hips, core, 0.02);
  // granada / bolsa lateral esquerda
  b.cyl([0.18, 0.93, 0.0], [0.18, 1.02, 0.0], 0.03, 0.03, M.gear2, B.hips, core, 10);
  // coldre de perna (direita)
  {
    const tw = (p) => [[B['thigh.R'], 0.85], [B.hips, 0.15]];
    b.box([0.035, 0.18, 0.02], { p: [-0.17, 0.92, -0.01] }, M.webbing, B.hips, core, 0.004);
    b.box([0.05, 0.15, 0.1], { p: [-0.185, 0.8, 0.0], r: [0.15, 0, 0.05] }, M.poly, tw, core, 0.012);
    b.box([0.045, 0.06, 0.035], { p: [-0.185, 0.87, -0.04], r: [0.15, 0, 0.05] }, M.poly, tw, core, 0.008);
    for (const yy of [0.82, 0.74]) b.box([0.02, 0.025, 0.1], { p: [-0.17, yy, 0.0] }, M.webbing, tw, core, 0.004);
  }

  // ═══ FUZIL ════════════════════════════════════════════════════════════
  addRifle(b, M);

  return b.build();
}

/** Malha a partir de anéis de pontos (fecha no topo com um leque). */
function addRingMesh(b, rings, mat, wfn, group, capTop) {
  // reaproveita o loft: converte anéis de pontos em geometria manualmente
  const pts = [];
  const seg = rings[0].length - 1;
  for (const r of rings) for (const p of r) pts.push(p);
  const idx = [];
  const W = seg + 1;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < seg; i++) {
      const a = r * W + i, c = a + W;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  if (capTop) {
    const top = rings[0].reduce((s, p) => [s[0] + p[0] / W, s[1] + p[1] / W, s[2] + p[2] / W], [0, 0, 0]);
    top[1] += 0.002;
    const ci = pts.length;
    pts.push(top);
    for (let i = 0; i < seg; i++) idx.push(ci, i + 1, i);
  }
  b._ringMesh(pts, idx, mat, wfn, group);
}

/** Mão enluvada fechada num cilindro de empunhadura ao longo do eixo Z local. */
export const GRIP = {
  // centro do cilindro de empunhadura relativo ao osso da mão (pulso)
  L: [-0.03, -0.092, 0.004],
  R: [0.03, -0.092, 0.004],
  radius: 0.02,
};

function addHand(b, side, M, grp) {
  const sx = side === 'L' ? 1 : -1;
  const hb = B['hand.' + side];
  const W0 = [sx * 0.208, 0.895, -0.005];
  const at = (dx, dy, dz) => [W0[0] + sx * dx, W0[1] + dy, W0[2] + dz];
  // palma + dorso (palma volta para -X na esquerda, +X na direita)
  b.box([0.032, 0.085, 0.082], { p: at(0.002, -0.045, 0.004) }, M.glove, (p) => (p.y > 0.875 ? [[hb, 0.7], [B['foreArm.' + side], 0.3]] : [[hb, 1]]), grp, 0.013);
  // protetor de nós
  b.box([0.012, 0.022, 0.07], { p: at(0.017, -0.075, 0.004) }, M.knuckle, hb, grp, 0.005);
  // dedos enrolados no cilindro (centro C, raio rf)
  const C = at(-0.03, -0.092, 0.004);
  const rf = GRIP.radius + 0.011;
  const fingers = [
    { z: 0.032, len: 1.05, r: 0.0095 },
    { z: 0.011, len: 1.15, r: 0.0098 },
    { z: -0.01, len: 1.1, r: 0.0095 },
    { z: -0.03, len: 0.95, r: 0.0085 },
  ];
  for (const f of fingers) {
    const pts = [];
    // começa no nó (lado do dorso, embaixo) e enrola para o lado da palma
    const a0 = Math.atan2(0.012, 0.03);
    const N = 6;
    for (let k = 0; k <= N; k++) {
      const a = a0 - (k / N) * Math.PI * f.len;
      pts.push({ p: [C[0] + sx * Math.cos(a) * rf, C[1] + Math.sin(a) * rf, C[2] + f.z], ru: f.r * (1 - 0.18 * (k / N)), rv: f.r * (1 - 0.18 * (k / N)) });
    }
    b.tube(pts, M.glove, hb, grp, { seg: 8, side: [0, 0, 1] });
  }
  // polegar: sai da base da palma (frente) e envolve por cima
  b.tube(
    [
      { p: at(-0.01, -0.03, 0.04), ru: 0.012 },
      { p: at(-0.035, -0.055, 0.05), ru: 0.0115 },
      { p: at(-0.055, -0.08, 0.045), ru: 0.0105 },
      { p: at(-0.06, -0.1, 0.035), ru: 0.0095 },
    ],
    M.glove,
    hb,
    grp,
    { seg: 8, side: [0, 0, 1] },
  );
}

function addBoot(b, side, M, grp) {
  const sx = side === 'L' ? 1 : -1;
  const fb = B['foot.' + side];
  const legw = legW(side);
  const X = 0.104 * sx, Z = -0.012;
  // sola com salto
  b.box([0.105, 0.03, 0.29], { p: [X, 0.015, Z + 0.07] }, M.sole, fb, grp, 0.012);
  b.box([0.098, 0.012, 0.28], { p: [X, 0.035, Z + 0.07] }, M.rubber, fb, grp, 0.004);
  // gáspea + biqueira
  b.loft(
    [
      { c: [X, 0.04, Z + 0.07], ru: 0.05, rv: 0.14, n: 2.6 },
      { c: [X, 0.075, Z + 0.06], ru: 0.05, rv: 0.13, n: 2.4 },
      { c: [X, 0.1, Z + 0.035], ru: 0.048, rv: 0.1, n: 2.2 },
      { c: [X, 0.12, Z + 0.01], ru: 0.047, rv: 0.065, n: 2 },
    ],
    M.boot,
    legw,
    grp,
    { seg: 20, caps: [false, true] },
  );
  // cano da bota
  b.cyl([X, 0.1, Z], [X, 0.2, Z - 0.002], 0.056, 0.06, M.boot, legw, grp, 18);
  b.cyl([X, 0.195, Z - 0.002], [X, 0.215, Z - 0.002], 0.062, 0.062, M.sole, legw, grp, 18);
  // cadarço (sobe pela frente do cano)
  for (let k = 0; k < 6; k++) {
    const t = k / 5;
    const y = 0.095 + t * 0.1, z = Z + 0.142 - t * 0.08;
    b.box([0.05, 0.006, 0.01], { p: [X, y, z], r: [-0.75, 0, 0] }, M.lace, k > 2 ? legw : fb, grp, 0.002);
  }
  // reforço do calcanhar
  b.box([0.09, 0.05, 0.03], { p: [X, 0.06, Z - 0.075] }, M.sole, fb, grp, 0.012);
}

/** Pontos notáveis do fuzil (espaço do osso `weapon`). */
export const RIFLE = {
  gripR: [0, -0.025, -0.012],
  gripL: [0, 0.072, 0.205],
  muzzle: [0, 0.072, 0.67],
  butt: [0, 0.045, -0.255],
  sight: [0, 0.152, 0.1],
  magwell: [0, -0.02, 0.13],
};

function addRifle(b, M) {
  const g = GROUPS.gun, w = B.weapon;
  const BORE = 0.072;
  // receptor inferior / superior
  b.box([0.028, 0.045, 0.19], { p: [0, 0.04, 0.07] }, M.gunMetal, w, g, 0.004);
  b.box([0.031, 0.042, 0.215], { p: [0, 0.083, 0.06] }, M.gunMetal, w, g, 0.004);
  // janela de ejeção / guarda-mato / gatilho
  b.box([0.004, 0.016, 0.05], { p: [-0.0165, 0.08, 0.08] }, M.gunWorn, w, g, 0.001);
  b.box([0.008, 0.006, 0.065], { p: [0, 0.0, 0.035] }, M.gunMetal, w, g, 0.002);
  b.box([0.006, 0.02, 0.006], { p: [0, 0.01, 0.045], r: [0.3, 0, 0] }, M.gunWorn, w, g, 0.001);
  // empunhadura
  b.box([0.03, 0.115, 0.042], { p: [0, -0.02, -0.012], r: [0.35, 0, 0] }, M.gunPoly, w, g, 0.009);
  // poço do carregador + carregador curvo
  b.box([0.032, 0.05, 0.078], { p: [0, 0.006, 0.128] }, M.gunMetal, w, g, 0.004);
  {
    let y = -0.02, z = 0.13, ang = -0.12;
    for (let k = 0; k < 4; k++) {
      const h = 0.045;
      b.box([0.026, h + 0.004, 0.068], { p: [0, y - h / 2, z + Math.sin(-ang) * h * 0.5], r: [ang, 0, 0] }, k === 3 ? M.gunPoly : M.gunMag, w, g, 0.004);
      y -= h * Math.cos(ang);
      z += h * Math.sin(-ang);
      ang -= 0.12;
    }
  }
  // trilho superior com dentes
  b.box([0.022, 0.01, 0.48], { p: [0, 0.109, 0.235] }, M.gunMetal, w, g, 0.002);
  for (let k = 0; k < 20; k++) b.box([0.024, 0.005, 0.009], { p: [0, 0.116, 0.02 + k * 0.022] }, M.gunMetal, w, g, 0.001, 1);
  // guarda-mão (com fendas M-LOK simuladas)
  b.box([0.046, 0.054, 0.33], { p: [0, BORE, 0.335] }, M.gunPoly, w, g, 0.012);
  for (const sx of [1, -1])
    for (let k = 0; k < 5; k++) b.box([0.004, 0.012, 0.035], { p: [sx * 0.022, BORE - 0.005, 0.22 + k * 0.055] }, M.gunRubber, w, g, 0.003);
  // cano, bloco de gases, quebra-chamas
  b.cyl([0, BORE, 0.5], [0, BORE, 0.6], 0.009, 0.009, M.gunMetal, w, g, 12);
  b.cyl([0, BORE, 0.585], [0, BORE, 0.67], 0.0145, 0.0145, M.gunMetal, w, g, 12);
  for (let k = 0; k < 3; k++) b.box([0.031, 0.004, 0.012], { p: [0, BORE, 0.6 + k * 0.022] }, M.gunRubber, w, g, 0.001, 1);
  // massa de mira frontal rebatida
  b.box([0.012, 0.016, 0.02], { p: [0, 0.122, 0.46] }, M.gunMetal, w, g, 0.003);
  // alavanca de manejo
  b.box([0.05, 0.008, 0.02], { p: [0, 0.1, -0.035] }, M.gunMetal, w, g, 0.003);
  // tubo do amortecedor + coronha + soleira
  b.cyl([0, 0.07, -0.04], [0, 0.07, -0.17], 0.0155, 0.0155, M.gunMetal, w, g, 12);
  b.box([0.04, 0.08, 0.13], { p: [0, 0.055, -0.17] }, M.gunPoly, w, g, 0.012);
  b.box([0.036, 0.022, 0.1], { p: [0, 0.098, -0.165] }, M.gunPoly, w, g, 0.008);
  b.box([0.042, 0.11, 0.02], { p: [0, 0.042, -0.245] }, M.gunRubber, w, g, 0.008);
  // mira holográfica / red dot
  b.box([0.03, 0.022, 0.05], { p: [0, 0.124, 0.1] }, M.gunMetal, w, g, 0.003);
  b.cyl([0, 0.153, 0.072], [0, 0.153, 0.14], 0.02, 0.02, M.gunMetal, w, g, 16);
  b.cyl([0, 0.153, 0.14], [0, 0.153, 0.142], 0.017, 0.017, M.gunLensRed, w, g, 16);
  b.cyl([0, 0.153, 0.07], [0, 0.153, 0.072], 0.017, 0.017, M.gunLens, w, g, 16);
  b.box([0.012, 0.012, 0.022], { p: [0.02, 0.153, 0.105] }, M.gunMetal, w, g, 0.003);
  // lanterna lateral
  b.cyl([-0.032, BORE + 0.005, 0.38], [-0.032, BORE + 0.005, 0.47], 0.0125, 0.0135, M.gunMetal, w, g, 12);
  b.cyl([-0.032, BORE + 0.005, 0.47], [-0.032, BORE + 0.005, 0.472], 0.012, 0.012, M.gunLens, w, g, 12);
}
