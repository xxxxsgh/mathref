/**
 * Gerador paramétrico de prédios de bairro urbano (pós-soviético /
 * Oriente Médio): fachadas com vãos reais, molduras, peitoris, sacadas,
 * cornijas, lojas no térreo com portas de enrolar e letreiros, ar-
 * condicionado, calhas, caixas d'água, antenas e estados de dano (vidro
 * quebrado, janelas tapadas com tábuas, incêndio, topo desmoronado).
 *
 * Estrutura de cada fachada detalhada (d = profundidade a partir da face):
 *   d ∈ [-0.3, 0]   parede (pilares, faixas acima/abaixo dos vãos)
 *   d ∈ [-D, -0.3]  "vazio" escuro dos cômodos (lajes por andar), visto
 *                   pelas janelas — dá profundidade real sem interior caro
 *   d < -D          núcleo maciço do prédio
 */
import * as THREE from 'three';
import { cylinder, cylBetween, cable, rebar, decal } from './shapes.js';
import { SIGN_COUNT, GRAFFITI_N, graffitiRect } from './decals.js';
import { awning } from './infra.js';

const D = 1.6; // profundidade do vazio dos cômodos
/** Altura do piso do andar f (mesma regra de building()). */
const fy0 = (s, f) => (f === 0 ? 0 : s.gf + (f - 1) * s.fh);

export const TINTS = {
  sand: [0.92, 0.82, 0.66],
  ochre: [0.9, 0.72, 0.5],
  cream: [0.96, 0.92, 0.82],
  pink: [0.9, 0.74, 0.68],
  blue: [0.74, 0.8, 0.84],
  green: [0.76, 0.82, 0.7],
  grey: [0.78, 0.78, 0.76],
  white: [0.97, 0.95, 0.92],
  yellow: [0.94, 0.84, 0.56],
};
const FRAME_TINTS = [[0.92, 0.92, 0.9], [0.45, 0.3, 0.2], [0.3, 0.45, 0.38], [0.85, 0.85, 0.82], [0.25, 0.25, 0.25]];
const SHUTTER_TINTS = [[0.35, 0.5, 0.42], [0.36, 0.45, 0.6], [0.55, 0.38, 0.25], [0.7, 0.68, 0.6]];
const CURTAIN_TINTS = [[0.8, 0.75, 0.6], [0.6, 0.25, 0.2], [0.4, 0.45, 0.6], [0.85, 0.85, 0.8], [0.55, 0.6, 0.35]];

/** Base local de uma face do footprint. */
function faceFrame(b, face) {
  const { x0, x1, z0, z1 } = b;
  switch (face) {
    case 'px': return { o: [x1, z1], u: [0, -1], n: [1, 0], W: z1 - z0, front: 'px', back: 'nx' };
    case 'nx': return { o: [x0, z0], u: [0, 1], n: [-1, 0], W: z1 - z0, front: 'nx', back: 'px' };
    case 'pz': return { o: [x0, z1], u: [1, 0], n: [0, 1], W: x1 - x0, front: 'pz', back: 'nz' };
    case 'nz': return { o: [x1, z0], u: [-1, 0], n: [0, -1], W: x1 - x0, front: 'nz', back: 'pz' };
  }
  throw new Error('face inválida ' + face);
}

/** Converte (u, d) da face em (x, z) de mundo. */
const P = (F, u, d) => [F.o[0] + F.u[0] * u + F.n[0] * d, F.o[1] + F.u[1] * u + F.n[1] * d];

/** Caixa no espaço da face → caixa de mundo. faces: { front, back, … } traduzidas. */
function fbox(B, F, u0, u1, y0, y1, d0, d1, mat, opts = {}) {
  const a = P(F, u0, d0), c = P(F, u1, d1);
  let faces;
  if (opts.front !== undefined || opts.back !== undefined || opts.top !== undefined || opts.bottom !== undefined || opts.sides !== undefined) {
    faces = {};
    if (opts.front !== undefined) faces[F.front] = opts.front;
    if (opts.back !== undefined) faces[F.back] = opts.back;
    if (opts.top !== undefined) faces.py = opts.top;
    if (opts.bottom !== undefined) faces.ny = opts.bottom;
    if (opts.sides !== undefined) {
      const ax = F.u[0] ? ['px', 'nx'] : ['pz', 'nz'];
      faces[ax[0]] = opts.sides;
      faces[ax[1]] = opts.sides;
    }
  }
  B.box(a[0], y0, a[1], c[0], y1, c[1], mat, { collide: false, ...opts, faces });
}

/** Ponto 3D na face. */
const P3 = (F, u, y, d) => {
  const p = P(F, u, d);
  return [p[0], y, p[1]];
};

/** Quad de janela com interior mapping (windows.js). */
function winQuad(W, F, u0, u1, y0, y1, d, room) {
  if (!W.win) return;
  W.win.add(P3(F, u0, y0, d), [F.u[0], 0, F.u[1]], [F.n[0], 0, F.n[1]], u1 - u0, y1 - y0, { seed: W.rng.next() * 997, ...room });
}

/**
 * Constrói um prédio. spec:
 *  { x0,x1,z0,z1, floors, faces:['nx',…], style:'plaster'|'brick'|'concrete',
 *    tint, shop:bool, gf (altura do térreo), fh, cond: 0..1 (dano),
 *    brokenTop:bool, exposed: [{face, y0}] (lateral rasgada), startFloor (0),
 *    noCollide, roofProps:bool, seed }
 */
export function building(W, spec) {
  const { B, rng } = W;
  const s = { fh: 3.2, gf: spec.shop ? 3.8 : 3.2, style: 'plaster', tint: TINTS.sand, cond: 0.3, startFloor: 0, roofProps: true, ...spec };
  const fy = (f) => (f === 0 ? 0 : s.gf + (f - 1) * s.fh);
  const H = fy(s.floors);
  s.H = H;
  const wallMat = s.style;
  const tint = s.tint;
  const trimTint = s.style === 'plaster' ? tint.map((c) => Math.min(1, c * 1.06 + 0.04)) : [0.85, 0.83, 0.8];
  const trimMat = s.style === 'brick' ? 'concrete' : s.style === 'concrete' ? 'concrete' : 'plaster';
  const frameTint = rng.pick(FRAME_TINTS);
  const frameMat = rng.chance(0.3) ? 'wood' : 'metal';
  const balconyP = s.balconies ?? (s.style === 'brick' ? 0.15 : 0.35);
  const y0 = fy(s.startFloor);
  B.cast = false;
  B.proxy([s.x0 + 0.02, y0, s.z0 + 0.02], [s.x1 - 0.02, s.brokenTop ? H : H + 0.9, s.z1 - 0.02]);

  // ── núcleo ──
  const has = (f) => s.faces.includes(f);
  const cx0 = s.x0 + (has('nx') ? D : 0), cx1 = s.x1 - (has('px') ? D : 0);
  const cz0 = s.z0 + (has('nz') ? D : 0), cz1 = s.z1 - (has('pz') ? D : 0);
  const coreFaces = {};
  for (const f of s.faces) coreFaces[f] = 'room';
  coreFaces.py = 'concrete';
  B.box(cx0, y0, cz0, cx1, H, cz1, wallMat, { collide: false, color: tint, faces: coreFaces });
  // colisor do volume inteiro
  if (!s.noCollide) B.collider([s.x0, y0, s.z0], [s.x1, H + 1, s.z1], wallMat);

  const quoins = rng.chance(0.55), surround = s.style === 'plaster' && rng.chance(0.5);
  for (const face of s.faces) facade(W, s, faceFrame(s, face), { fy, H, wallMat, tint, trimTint, trimMat, frameTint, frameMat, balconyP, quoins, surround });

  // ── telhado ──
  B.box(s.x0, H - 0.25, s.z0, s.x1, H, s.z1, 'concrete', { collide: false, color: [0.7, 0.68, 0.65], faces: { ny: null } });
  if (!s.brokenTop) {
    // platibanda em todo o perímetro
    const pt = 0.25, ph = 0.9;
    const sides = [
      [s.x0, s.z0, s.x1, s.z0 + pt], [s.x0, s.z1 - pt, s.x1, s.z1],
      [s.x0, s.z0, s.x0 + pt, s.z1], [s.x1 - pt, s.z0, s.x1, s.z1],
    ];
    for (const [a, b, c, d] of sides) {
      B.box(a, H, b, c, H + ph, d, wallMat, { collide: false, color: tint });
      B.box(a - 0.05, H + ph, b - 0.05, c + 0.05, H + ph + 0.08, d + 0.05, 'concrete', { collide: false, color: [0.75, 0.73, 0.7] });
    }
    B.cast = true;
    if (s.roofProps) roofProps(W, s, H);
  } else {
    B.cast = true;
    brokenTop(W, s, H);
  }
  B.cast = false;

  B.cast = true;
  for (const ex of s.exposed || []) exposedSide(W, s, faceFrame(s, ex.face), ex.y0, H, fy);
  return s;
}

function facade(W, s, F, k) {
  const { B, rng } = W;
  const { fy, H, wallMat, tint, trimTint, trimMat, frameTint, frameMat, balconyP } = k;
  const cw = 0.55;
  const pitch = s.pitch || rng.range(2.8, 3.4);
  const nb = Math.max(1, Math.round((F.W - 2 * cw) / pitch));
  const bw = (F.W - 2 * cw) / nb;
  const ww = Math.min(1.5, Math.max(0.9, bw * 0.48));
  const wallOpts = { color: tint, back: 'room' };

  // fechamento lateral do vazio nas pontas
  for (const u of [0, F.W - 0.3]) fbox(B, F, u, u + 0.3, fy(s.startFloor), H, -D, -0.3, wallMat, { color: tint });

  // sóculo de concreto
  if (s.startFloor === 0) fbox(B, F, -0.04, F.W + 0.04, 0, 0.55, 0, 0.06, 'concrete', { color: [0.62, 0.6, 0.57] });

  for (let f = s.startFloor; f < s.floors; f++) {
    const y = fy(f), yTop = fy(f + 1);
    const shop = f === 0 && s.shop;
    // laje entre andares (dentro do vazio) e faixa de cornija na fachada
    if (!(f === s.startFloor && f > 0)) fbox(B, F, 0.3, F.W - 0.3, y - (f ? 0.22 : 0), y + 0.02, -D, -0.3, 'room');
    if (f > 0) fbox(B, F, -0.06, F.W + 0.06, y - 0.12, y + 0.06, 0, 0.09, trimMat, { color: trimTint });

    // vãos deste andar
    const openings = [];
    for (let i = 0; i < nb; i++) {
      const bs = cw + i * bw, be = bs + bw, c = (bs + be) / 2;
      if (shop) {
        openings.push({ kind: 'shop', u0: bs + 0.22, u1: be - 0.22, y0: y + 0.02, y1: y + 2.75, i });
        continue;
      }
      if (f === 0 && s.door === i) {
        openings.push({ kind: 'door', u0: c - 0.6, u1: c + 0.6, y0: y + 0.02, y1: y + 2.3, i });
        continue;
      }
      // rombo de granada/tanque atravessando a parede (prédios danificados)
      const forced = (s.blasts || []).some((b) => b.f === f && b.i === i);
      if ((rng.chance(s.cond * 0.11) && i > 0 && i < nb - 1) || forced) {
        const hw = Math.min(bw * 0.62, rng.range(0.9, 1.5));
        openings.push({ kind: 'blast', u0: c - hw, u1: c + hw, y0: y, y1: yTop, i });
        continue;
      }
      const balcony = f > 0 && rng.chance(balconyP) && !(s.brokenTop && f === s.floors - 1);
      if (balcony) openings.push({ kind: 'balcony', u0: c - ww / 2, u1: c + ww / 2, y0: y + 0.02, y1: y + 2.3, i });
      else openings.push({ kind: 'window', u0: c - ww / 2, u1: c + ww / 2, y0: y + 0.9, y1: y + 2.25, i });
    }
    // paredes: segmentos cheios entre vãos + faixas acima/abaixo
    // faces escondidas (topo/base de pilares, laterais coladas) são omitidas:
    // ~40% menos triângulos de fachada
    let u = 0;
    const pier = { ...wallOpts, top: null, bottom: null };
    for (const o of openings) {
      if (o.u0 > u) {
        fbox(B, F, u, o.u0, y, yTop, -0.3, 0, wallMat, pier);
        if (shop) cladding(W, F, u, o.u0, y);
      }
      if (o.kind === 'blast') blastHole(W, s, F, o, y, yTop, wallMat, tint, f);
      else {
        if (o.y0 > y + 0.01) fbox(B, F, o.u0, o.u1, y, o.y0, -0.3, 0, wallMat, { ...wallOpts, bottom: null, sides: null });
        fbox(B, F, o.u0, o.u1, o.y1, yTop, -0.3, 0, wallMat, { ...wallOpts, top: null, sides: null });
      }
      u = o.u1;
    }
    if (u < F.W) {
      fbox(B, F, u, F.W, y, yTop, -0.3, 0, wallMat, pier);
      if (shop) cladding(W, F, u, F.W, y);
    }

    for (const o of openings) {
      if (o.kind === 'shop') shopfront(W, s, F, o, y);
      else if (o.kind === 'door') entrance(W, s, F, o, y, frameTint);
      else if (o.kind !== 'blast') opening(W, s, F, o, f, { frameTint, frameMat, tint, trimTint, trimMat, surround: k.surround });
    }
  }
  // cornija do topo em degraus (sombra em camadas, não uma "tampa")
  if (!s.brokenTop) {
    fbox(B, F, -0.06, F.W + 0.06, H - 0.42, H - 0.3, 0, 0.07, trimMat, { color: trimTint });
    fbox(B, F, -0.1, F.W + 0.1, H - 0.3, H - 0.16, 0, 0.15, trimMat, { color: trimTint });
    fbox(B, F, -0.14, F.W + 0.14, H - 0.16, H + 0.04, 0, 0.26, trimMat, { color: trimTint });
  }
  // cunhais (pedras de quina) nas pontas das fachadas de reboco
  if (s.style === 'plaster' && k.quoins) {
    const qt = trimTint.map((v) => v * 0.97);
    for (const end of [0, 1]) {
      let yy = fy(s.startFloor) + 0.6, alt = 0;
      while (yy < H - 0.6) {
        const qw = alt++ % 2 ? 0.32 : 0.5, qh = 0.34;
        const ua = end ? F.W - qw : 0, ub = end ? F.W : qw;
        fbox(B, F, ua, ub, yy, yy + qh - 0.025, 0, 0.035, trimMat, { color: qt });
        yy += qh;
      }
    }
  }

  // calhas verticais nas pontas
  if (rng.chance(0.7)) {
    const uu = rng.chance(0.5) ? 0.25 : F.W - 0.25;
    const p = P3(F, uu, 0, 0.1);
    cylinder(B, p[0], 0.1, p[2], 0.055, H - 0.1, 'metal', { seg: 8, color: [0.55, 0.55, 0.52] });
  }
  // hera descendo do beiral (poucas fachadas)
  if (rng.chance(0.18) && !s.brokenTop) {
    W.ivySpots ??= [];
    const uu = rng.range(1, F.W - 3);
    W.ivySpots.push({ p: P3(F, uu, H - 0.2, 0.0), u: [F.u[0], 0, F.u[1]], n: [F.n[0], 0, F.n[1]], w: rng.range(1.5, 3.5), h: rng.range(3, Math.min(9, H - 1)) });
  }
  // cabos correndo pela fachada (ligações clandestinas, típicas)
  const nCables = rng.int(0, 2);
  for (let c = 0; c < nCables; c++) {
    const yy = fy(rng.int(1, Math.max(1, s.floors - 1))) - 0.4 + rng.range(-0.2, 0.2);
    if (yy < 2.5 || yy > H - 1) continue;
    const ua = rng.range(0.5, F.W * 0.4), ub = rng.range(F.W * 0.6, F.W - 0.5);
    cable(B, P3(F, ua, yy, 0.06), P3(F, ub, yy + rng.range(-0.4, 0.4), 0.06), rng.range(0.15, 0.5), 0.01);
  }
  // pichação/cartazes no térreo: variantes do atlas, escala/rotação/altura variadas
  const ng = rng.chance(0.75) ? rng.int(1, 3) : 0;
  for (let i = 0; i < ng; i++) {
    const sc = rng.range(0.6, 1.5);
    const uu = rng.range(1.2 * sc, F.W - 1.2 * sc);
    const p = P3(F, uu, rng.range(0.9, 1.9) + (sc - 1) * 0.4, 0.012 + i * 0.0007);
    decal(B, 'graffiti', p, F.front, [2.4 * sc, 1.2 * sc], graffitiRect(nextGraffiti(W)), rng.range(-0.12, 0.12));
  }
  if (rng.chance(0.7)) {
    const n = rng.int(1, 4);
    const uu = rng.range(0.8, F.W - 2);
    for (let i = 0; i < n; i++) {
      const q = rng.int(0, 7);
      const p = P3(F, uu + i * 0.62 + rng.range(-0.05, 0.05), 1.55 + rng.range(-0.1, 0.1), 0.014 + i * 0.001);
      decal(B, 'posters', p, F.front, [0.6, 0.6], [(q % 4) / 4, 1 - (Math.floor(q / 4) + 1) / 2, (q % 4 + 1) / 4, 1 - Math.floor(q / 4) / 2], rng.range(-0.06, 0.06));
    }
  }
  // marcas de tiro (bairro em guerra): rajadas com relevo, mais no térreo
  const holes = rng.int(1, 4) + Math.round(s.cond * 3);
  for (let i = 0; i < holes; i++) {
    const p = P3(F, rng.range(1, F.W - 1), rng.chance(0.6) ? rng.range(0.6, 3.5) : rng.range(3.5, Math.min(H - 1, 10)), 0.013 + i * 0.0004);
    const sz = rng.range(0.9, 2.2);
    decal(B, 'bullets', p, F.front, [sz, sz * rng.range(0.8, 1.2)], [0, 0, 1, 1], rng.range(0, 6.28));
  }
  if (rng.chance(0.6)) {
    const p = P3(F, rng.range(1, F.W - 1), rng.range(2, Math.min(H - 1, 9)), 0.011);
    decal(B, 'cracks', p, F.front, [rng.range(1.5, 3), rng.range(1.5, 3)], [0, 0, 1, 1], rng.range(0, 6.28));
  }
  // reboco arrancado (expondo tijolo/cimento): quinas, base e perto de vãos
  if (s.style === 'plaster') {
    const nc = rng.int(1, 3) + Math.round(s.cond * 3);
    for (let i = 0; i < nc; i++) {
      const edgeU = rng.chance(0.4) ? (rng.chance(0.5) ? rng.range(0.2, 0.9) : F.W - rng.range(0.2, 0.9)) : rng.range(1, F.W - 1);
      const p = P3(F, edgeU, rng.chance(0.4) ? rng.range(0.5, 1.4) : rng.range(2, H - 1), 0.0105 + i * 0.0003);
      const sz = rng.range(0.7, 2.0);
      const q = rng.int(0, 3);
      decal(B, 'chips', p, F.front, [sz, sz * rng.range(0.6, 1.0)], [(q % 2) * 0.5, Math.floor(q / 2) * 0.5, (q % 2) * 0.5 + 0.5, Math.floor(q / 2) * 0.5 + 0.5], rng.range(0, 6.28));
    }
  }
  // queimado de explosão na fachada (prédios mais danificados)
  if (rng.chance(s.cond * 0.6)) {
    const p = P3(F, rng.range(2, F.W - 2), rng.range(0.5, 4), 0.0095);
    const sz = rng.range(3, 6);
    decal(B, 'scorch', p, F.front, [sz, sz], [0, 0, 1, 1], rng.range(0, 6.28));
  }
}

/** Próxima pichação do baralho embaralhado (sem repetir vizinhas). */
function nextGraffiti(W) {
  if (!W.gDeck?.length) {
    W.gDeck = Array.from({ length: GRAFFITI_N }, (_, i) => i);
    for (let i = W.gDeck.length - 1; i > 0; i--) {
      const j = Math.floor(W.rng.next() * (i + 1));
      [W.gDeck[i], W.gDeck[j]] = [W.gDeck[j], W.gDeck[i]];
    }
  }
  return W.gDeck.pop();
}

/** Próximo letreiro (baralho embaralhado: os 16 aparecem antes de repetir). */
function nextSign(W) {
  if (!W.sDeck?.length) {
    W.sDeck = Array.from({ length: SIGN_COUNT }, (_, i) => i);
    for (let i = W.sDeck.length - 1; i > 0; i--) {
      const j = Math.floor(W.rng.next() * (i + 1));
      [W.sDeck[i], W.sDeck[j]] = [W.sDeck[j], W.sDeck[i]];
    }
  }
  return W.sDeck.pop();
}

/** Revestimento de placas de pedra nos pilares do térreo comercial. */
function cladding(W, F, u0, u1, y) {
  const { B, rng } = W;
  if (u1 - u0 < 0.15) return;
  const tint = rng.pick([[0.86, 0.8, 0.68], [0.7, 0.68, 0.64], [0.8, 0.74, 0.66]]);
  for (let yy = y + 0.55; yy < y + 3.1; yy += 0.6) {
    const v = rng.range(0.92, 1.05);
    fbox(B, F, u0 + 0.01, u1 - 0.01, yy + 0.012, Math.min(y + 3.2, yy + 0.6) - 0.012, 0, 0.03, 'concrete', { color: tint.map((c) => c * v) });
  }
}

/**
 * Rombo de explosão atravessando a fachada: colunas de 0.15 m com perfil
 * irregular (elipse + ruído), faces de quebra em tijolo, vergalhões
 * pendurados, fuligem, lascas e entulho na calçada. O cômodo aparece pelo
 * interior mapping (quad atrás da parede).
 */
function blastHole(W, s, F, o, y, yTop, wallMat, tint, f) {
  const { B, rng } = W;
  const c = (o.u0 + o.u1) / 2, hw = (o.u1 - o.u0) / 2;
  const cy = y + rng.range(1.1, 1.5), ry = Math.min(rng.range(0.9, 1.3), (yTop - y) * 0.48);
  const n = Math.max(4, Math.round((o.u1 - o.u0) / 0.15));
  const cut = s.style === 'brick' ? 'brick' : 'brick';
  const wo = { color: tint, back: 'room', sides: cut, top: cut, bottom: cut };
  for (let i = 0; i < n; i++) {
    const ua = o.u0 + (i / n) * (o.u1 - o.u0), ub = o.u0 + ((i + 1) / n) * (o.u1 - o.u0);
    const t = ((ua + ub) / 2 - c) / hw;
    const half = Math.sqrt(Math.max(0, 1 - t * t)) * ry;
    const yb = Math.max(y, cy - half + rng.range(-0.12, 0.18));
    const yt = Math.min(yTop, cy + half + rng.range(-0.15, 0.12));
    if (yb > y + 0.01) fbox(B, F, ua, ub, y, yb, -0.3 + rng.range(0, 0.08), 0, wallMat, { ...wo, top: cut });
    if (yt < yTop - 0.01) fbox(B, F, ua, ub, yt, yTop, -0.3 + rng.range(0, 0.08), 0, wallMat, { ...wo, bottom: cut });
    if (yt < yTop - 0.05 && rng.chance(0.35)) rebar(B, P3(F, (ua + ub) / 2, yt + 0.03, -0.15), [F.n[0] * 0.3 + rng.range(-0.2, 0.2), -1, F.n[1] * 0.3 + rng.range(-0.2, 0.2)], rng.range(0.25, 0.7), rng);
  }
  winQuad(W, F, o.u0, o.u1, y, yTop, -0.27, { depth: rng.range(3, 4.5), sill: 0.02, margin: 0.4, top: 0.1, kind: rng.chance(0.5) ? 2 : 1 });
  decal(B, 'scorch', P3(F, c, cy + 0.2, 0.012), F.front, [hw * 4.2, ry * 4.2], [0, 0, 1, 1], rng.range(0, 6.28));
  for (let k = 0; k < 3; k++) {
    const q = rng.int(0, 3);
    decal(B, 'chips', P3(F, c + rng.range(-1, 1) * hw * 1.3, cy + rng.range(-1, 1) * ry * 1.2, 0.0115 + k * 0.0003), F.front, [rng.range(0.6, 1.2), rng.range(0.5, 1)], [(q % 2) * 0.5, Math.floor(q / 2) * 0.5, (q % 2) * 0.5 + 0.5, Math.floor(q / 2) * 0.5 + 0.5], rng.range(0, 6.28));
  }
  // entulho caído na calçada abaixo
  if (s.startFloor === 0 || f > 0) W.rubbleSpots.push({ p: P3(F, c, 0.15, 1.1), r: 0.9 + hw * 0.5, n: 16, small: false });
}

/** Janela/porta de sacada num andar. */
function opening(W, s, F, o, f, k) {
  const { B, rng } = W;
  const { frameTint, frameMat } = k;
  const c = (o.u0 + o.u1) / 2, w = o.u1 - o.u0;
  const isBal = o.kind === 'balcony';
  // estado: intacto / quebrado / tapado / queimado / vazio
  const r = rng.next();
  const dmg = s.cond;
  let state = 'glass';
  if (r < dmg * 0.45) state = 'broken';
  else if (r < dmg * 0.65) state = 'boarded';
  else if (r < dmg * 0.8) state = 'burnt';
  if (f === 0 && !isBal && rng.chance(0.6)) state = state === 'glass' ? 'barred' : state;

  // peitoril
  if (!isBal) fbox(B, F, o.u0 - 0.1, o.u1 + 0.1, o.y0 - 0.07, o.y0, -0.12, 0.12, k.trimMat, { color: k.trimTint });
  // verga
  if (s.style !== 'concrete') fbox(B, F, o.u0 - 0.12, o.u1 + 0.12, o.y1, o.y1 + 0.18, 0, 0.04, k.trimMat, { color: k.trimTint });
  // guarnição saliente em volta do vão + fecho (prédios de reboco "clássicos")
  if (k.surround && !isBal) {
    const g = 0.1, dz = 0.045;
    fbox(B, F, o.u0 - g, o.u0, o.y0, o.y1, 0, dz, k.trimMat, { color: k.trimTint });
    fbox(B, F, o.u1, o.u1 + g, o.y0, o.y1, 0, dz, k.trimMat, { color: k.trimTint });
    fbox(B, F, o.u0 - 0.16, o.u1 + 0.16, o.y1 + 0.18, o.y1 + 0.27, 0, 0.09, k.trimMat, { color: k.trimTint });
    fbox(B, F, c - 0.09, c + 0.09, o.y1, o.y1 + 0.24, 0, 0.07, k.trimMat, { color: k.trimTint });
  }

  const ft = state === 'burnt' ? [0.08, 0.07, 0.06] : frameTint;
  if (state !== 'burnt' || rng.chance(0.5)) {
    // caixilho
    const t = 0.06, d0 = -0.2, d1 = -0.12;
    fbox(B, F, o.u0, o.u1, o.y0, o.y0 + t, d0, d1, frameMat, { color: ft, back: null });
    fbox(B, F, o.u0, o.u1, o.y1 - t, o.y1, d0, d1, frameMat, { color: ft, back: null });
    fbox(B, F, o.u0, o.u0 + t, o.y0, o.y1, d0, d1, frameMat, { color: ft, back: null });
    fbox(B, F, o.u1 - t, o.u1, o.y0, o.y1, d0, d1, frameMat, { color: ft, back: null });
    fbox(B, F, c - t / 2, c + t / 2, o.y0, o.y1, d0, d1, frameMat, { color: ft, back: null });
    if (!isBal) fbox(B, F, o.u0, o.u1, o.y1 - 0.42, o.y1 - 0.42 + t, d0, d1, frameMat, { color: ft, back: null });
  }
  // cômodo virtual atrás do vão (interior mapping) — vidro de verdade por cima
  const room = { depth: rng.range(3.2, 5), sill: isBal ? 0.02 : o.y0 - fy0(s, f), margin: rng.range(0.5, 1.4), top: Math.max(0.15, fy0(s, f + 1) - o.y1 - 0.25) };
  if (state === 'glass' || state === 'barred') {
    winQuad(W, F, o.u0, o.u1, o.y0, o.y1, -0.165, { ...room, kind: 0 });
  } else if (state === 'broken') {
    winQuad(W, F, o.u0, o.u1, o.y0, o.y1, -0.165, { ...room, kind: 1 });
    // cacos presos no caixilho
    for (let i = 0; i < 3; i++) {
      const ua = rng.range(o.u0, o.u1 - 0.3), ya = rng.chance(0.5) ? o.y0 + 0.05 : o.y1 - 0.35;
      fbox(B, F, ua, ua + rng.range(0.12, 0.3), ya, ya + rng.range(0.15, 0.3), -0.145, -0.135, 'glass', { color: [1, 1, 1] });
    }
  } else if (state === 'boarded') {
    winQuad(W, F, o.u0, o.u1, o.y0, o.y1, -0.165, { ...room, kind: 1 });
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const yy = o.y0 + 0.1 + (i / n) * (o.y1 - o.y0 - 0.2);
      const M = W.B.obox(P3(F, c, yy + 0.1, 0.03), F.u[0] ? [w + 0.25, 0.2, 0.03] : [0.03, 0.2, w + 0.25], [0, 0, 0], 'wood', { color: [0.8, 0.75, 0.65] });
      void M;
    }
    // tábua diagonal
    const a = Math.atan2(o.y1 - o.y0, w) * (rng.chance(0.5) ? 1 : -1);
    const p = P3(F, c, (o.y0 + o.y1) / 2, 0.06);
    if (F.u[0]) W.B.obox(p, [Math.hypot(w, o.y1 - o.y0), 0.18, 0.03], [0, 0, a * Math.sign(F.u[0])], 'wood', { color: [0.7, 0.66, 0.58] });
    else W.B.obox(p, [0.03, 0.18, Math.hypot(w, o.y1 - o.y0)], [a * Math.sign(F.u[1]), 0, 0], 'wood', { color: [0.7, 0.66, 0.58] });
  } else if (state === 'burnt') {
    winQuad(W, F, o.u0, o.u1, o.y0, o.y1, -0.165, { ...room, kind: 2 });
    decal(B, 'soot', P3(F, c, o.y1 + 0.9, 0.015), F.front, [w * 2.2, 2.6]);
  }
  if (state === 'barred') {
    const n = Math.round(w / 0.13);
    for (let i = 1; i < n; i++) {
      const uu = o.u0 + (i / n) * w;
      fbox(B, F, uu - 0.012, uu + 0.012, o.y0, o.y1, 0.02, 0.045, 'metal', { color: [0.2, 0.2, 0.2], back: null });
    }
    fbox(B, F, o.u0, o.u1, o.y0 + 0.3, o.y0 + 0.33, 0.02, 0.05, 'metal', { color: [0.2, 0.2, 0.2] });
    fbox(B, F, o.u0, o.u1, o.y1 - 0.33, o.y1 - 0.3, 0.02, 0.05, 'metal', { color: [0.2, 0.2, 0.2] });
  }
  // venezianas abertas (madeira pintada) contra a parede
  if (!isBal && state !== 'burnt' && f > 0 && rng.chance(s.shutters ?? 0.25)) {
    const st = rng.pick(SHUTTER_TINTS);
    const sw = w / 2;
    const ang = rng.chance(0.2);
    fbox(B, F, o.u0 - sw - 0.02, o.u0 - 0.02, o.y0, o.y1, 0.02, 0.06, 'wood', { color: st });
    if (!ang) fbox(B, F, o.u1 + 0.02, o.u1 + sw + 0.02, o.y0, o.y1, 0.02, 0.06, 'wood', { color: st });
  }
  // persiana de enrolar meio fechada
  if (!isBal && state === 'glass' && rng.chance(0.2)) {
    const down = rng.range(0.2, 0.8) * (o.y1 - o.y0);
    fbox(B, F, o.u0, o.u1, o.y1 - down, o.y1, -0.1, -0.06, 'corrugated', { color: rng.pick(SHUTTER_TINTS) });
  }
  // escorrido de sujeira sob o peitoril
  if (!isBal && rng.chance(0.75)) decal(B, 'streaks', P3(F, c, o.y0 - 1.0, 0.008), F.front, [w + 0.5, 2.0]);

  // ar-condicionado
  if (!isBal && f > 0 && rng.chance(0.28)) {
    const side = rng.chance(0.5) ? -1 : 1;
    const uu = side < 0 ? o.u0 - 0.55 : o.u1 + 0.55;
    if (uu > 0.5 && uu < F.W - 0.5) {
      B.cast = true;
      fbox(B, F, uu - 0.4, uu + 0.4, o.y0 - 0.2, o.y0 + 0.36, 0, 0.3, 'metal', { color: [0.86, 0.85, 0.8] });
      fbox(B, F, uu - 0.32, uu + 0.32, o.y0 - 0.14, o.y0 + 0.3, 0.3, 0.31, 'black', {});
      fbox(B, F, uu - 0.38, uu - 0.34, o.y0 - 0.32, o.y0 - 0.2, 0, 0.32, 'metal', { color: [0.3, 0.3, 0.3] });
      fbox(B, F, uu + 0.34, uu + 0.38, o.y0 - 0.32, o.y0 - 0.2, 0, 0.32, 'metal', { color: [0.3, 0.3, 0.3] });
      B.cast = false;
      decal(B, 'streaks', P3(F, uu, o.y0 - 1.3, 0.009), F.front, [0.6, 2.0]);
    }
  }

  if (isBal) {
    B.cast = true;
    balcony(W, s, F, o, k);
    B.cast = false;
  }
}

function balcony(W, s, F, o, k) {
  const { B, rng } = W;
  const u0 = o.u0 - 0.5, u1 = o.u1 + 0.5;
  const depth = rng.range(0.8, 1.1);
  const y = o.y0 - 0.02;
  // laje com bordas quebradas às vezes
  fbox(B, F, u0, u1, y - 0.16, y + 0.02, 0, depth, 'concrete', { color: [0.72, 0.7, 0.67] });
  const kind = rng.next();
  if (kind < 0.45) {
    // guarda-corpo de barras metálicas
    const tint = rng.pick([[0.15, 0.15, 0.15], [0.3, 0.42, 0.35], [0.5, 0.48, 0.45]]);
    fbox(B, F, u0, u1, y + 0.95, y + 1.0, depth - 0.05, depth, 'metal', { color: tint });
    fbox(B, F, u0, u0 + 0.04, y, y + 1.0, 0, depth, 'metal', { color: tint, front: null });
    fbox(B, F, u1 - 0.04, u1, y, y + 1.0, 0, depth, 'metal', { color: tint, front: null });
    fbox(B, F, u0, u0 + 0.04, y + 0.95, y + 1.0, 0, depth, 'metal', { color: tint });
    fbox(B, F, u1 - 0.04, u1, y + 0.95, y + 1.0, 0, depth, 'metal', { color: tint });
    const n = Math.round((u1 - u0) / 0.17);
    for (let i = 1; i < n; i++) {
      const uu = u0 + (i / n) * (u1 - u0);
      fbox(B, F, uu - 0.01, uu + 0.01, y, y + 0.95, depth - 0.04, depth - 0.02, 'metal', { color: tint, back: null });
    }
  } else if (kind < 0.8) {
    // parapeito maciço de alvenaria
    fbox(B, F, u0, u1, y, y + 1.0, depth - 0.12, depth, s.style === 'brick' ? 'brick' : 'plaster', { color: k.trimTint ?? [1, 1, 1] });
    fbox(B, F, u0, u0 + 0.12, y, y + 1.0, 0, depth, 'plaster', { color: k.trimTint });
    fbox(B, F, u1 - 0.12, u1, y, y + 1.0, 0, depth, 'plaster', { color: k.trimTint });
    decal(B, 'streaks', P3(F, (u0 + u1) / 2, y - 1.0, depth + 0.01), F.front, [u1 - u0, 2.0]);
  } else {
    // sacada fechada com chapa ondulada e vidro (puxadinho)
    fbox(B, F, u0, u1, y, y + 1.0, depth - 0.04, depth, 'corrugated', { color: rng.pick(SHUTTER_TINTS) });
    fbox(B, F, u0, u1, y + 1.0, y + 2.2, depth - 0.03, depth - 0.02, 'glass', {});
    fbox(B, F, u0, u1, y + 2.2, y + 2.35, 0, depth + 0.05, 'corrugated', { color: [0.6, 0.58, 0.55] });
  }
  // roupa no varal / antena parabólica
  if (rng.chance(0.3)) {
    const yy = y + 1.7;
    cable(B, P3(F, u0 + 0.1, yy, depth - 0.1), P3(F, u1 - 0.1, yy, depth - 0.1), 0.05, 0.006);
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const uu = u0 + 0.3 + (i / n) * (u1 - u0 - 0.6);
      fbox(B, F, uu, uu + rng.range(0.3, 0.5), yy - rng.range(0.4, 0.7), yy - 0.03, depth - 0.11, depth - 0.1, 'fabric', { color: rng.pick(CURTAIN_TINTS) });
    }
  }
  if (rng.chance(0.25)) {
    const p = P3(F, u1 - 0.35, y + 1.6, depth - 0.25);
    W.dishes.push({ p, n: F.n });
  }
}

function shopfront(W, s, F, o, y) {
  const { B, rng } = W;
  const c = (o.u0 + o.u1) / 2, w = o.u1 - o.u0;
  const kind = rng.next();
  // caixa da porta de enrolar no topo do vão
  fbox(B, F, o.u0, o.u1, o.y1 - 0.4, o.y1, -0.3, -0.05, 'metal', { color: [0.55, 0.55, 0.52], uvRand: true });
  if (kind < 0.55) {
    // porta de enrolar (aberta parcialmente às vezes)
    const open = rng.chance(0.35) ? rng.range(0.6, 1.6) : 0;
    const tint = rng.pick([[0.7, 0.7, 0.68], [0.45, 0.55, 0.6], [0.55, 0.45, 0.35], [0.4, 0.5, 0.42]]);
    fbox(B, F, o.u0, o.u1, o.y0 + open, o.y1 - 0.4, -0.22, -0.18, 'corrugated', { color: tint, uvRand: true });
    fbox(B, F, o.u0, o.u1, o.y0 + open, o.y0 + open + 0.06, -0.24, -0.16, 'metal', { color: [0.3, 0.3, 0.3], uvRand: true });
    if (open > 0) winQuad(W, F, o.u0, o.u1, o.y0, o.y0 + open, -0.2, { depth: rng.range(3.5, 6), sill: 0.0, margin: 0.2, top: 2.6 - open, kind: 4 });
    if (rng.chance(0.28)) {
      const sc = rng.range(0.55, 0.95);
      decal(B, 'graffiti', P3(F, c + rng.range(-0.3, 0.3) * w * (1 - sc), o.y0 + rng.range(0.9, 1.6), -0.17), F.front, [w * sc, w * sc * 0.5], graffitiRect(nextGraffiti(W)), rng.range(-0.1, 0.1));
    }
  } else if (kind < 0.8) {
    // vitrine (vidro + caixilho de alumínio), às vezes estilhaçada
    const broken = rng.chance(0.55);
    const t = 0.07;
    const ft = [0.75, 0.75, 0.72];
    fbox(B, F, o.u0, o.u1, o.y0, o.y0 + 0.45, -0.25, -0.1, 'metal', { color: ft });
    fbox(B, F, o.u0, o.u0 + t, o.y0, o.y1 - 0.4, -0.25, -0.1, 'metal', { color: ft });
    fbox(B, F, o.u1 - t, o.u1, o.y0, o.y1 - 0.4, -0.25, -0.1, 'metal', { color: ft });
    fbox(B, F, c - t / 2, c + t / 2, o.y0, o.y1 - 0.4, -0.25, -0.1, 'metal', { color: ft });
    const sroom = { depth: rng.range(3.5, 6), sill: 0.45, margin: 0.25, top: 0.3 };
    if (!broken) winQuad(W, F, o.u0 + t, o.u1 - t, o.y0 + 0.45, o.y1 - 0.4, -0.18, { ...sroom, kind: 3 });
    else {
      winQuad(W, F, o.u0 + t, c, o.y0 + 0.45, o.y1 - 0.4, -0.18, { ...sroom, kind: 3 });
      winQuad(W, F, c, o.u1 - t, o.y0 + 0.45, o.y1 - 0.4, -0.18, { ...sroom, kind: 4, sill: 0.45 });
      for (let i = 0; i < 3; i++) {
        const uu = rng.range(c, o.u1 - 0.4);
        fbox(B, F, uu, uu + rng.range(0.15, 0.35), o.y1 - 0.75, o.y1 - 0.4, -0.19, -0.17, 'glass', {});
      }
      W.glassPiles.push(P3(F, rng.range(c, o.u1), 0.16, 0.6));
    }
  } else {
    // vão tapado com blocos de concreto
    fbox(B, F, o.u0, o.u1, o.y0, o.y1 - 0.4, -0.2, -0.05, 'brick', { color: [0.62, 0.66, 0.68] });
  }
  // letreiro
  if (rng.chance(0.62)) {
    const si = nextSign(W);
    const sh = 0.55;
    const sy = o.y1 + 0.22;
    fbox(B, F, o.u0 - 0.05, o.u1 + 0.05, sy - 0.03, sy + sh + 0.03, 0, 0.1, 'metal', { color: [0.3, 0.3, 0.3] });
    const v0 = 1 - (si + 1) / SIGN_COUNT, v1 = 1 - si / SIGN_COUNT;
    decal(B, 'signs', P3(F, c, sy + sh / 2, 0.105), F.front, [w + 0.06, sh], [0, v0, 1, v1], 0, [0.92, 0.92, 0.92]);
  }
  // toldo de lona listrada com caimento (às vezes rasgado)
  if (rng.chance(0.32)) {
    const tint = rng.pick([[0.6, 0.2, 0.15], [0.2, 0.35, 0.5], [0.7, 0.6, 0.35], [0.3, 0.45, 0.3]]);
    awning(W, P3(F, c, o.y1 + 0.12, 0.02), [F.u[0], 0, F.u[1]], [F.n[0], 0, F.n[1]], w + 0.2, rng.range(0.9, 1.3), tint);
  }
}

function entrance(W, s, F, o, y, frameTint) {
  const { B, rng } = W;
  const c = (o.u0 + o.u1) / 2;
  // porta metálica/madeira recuada + degrau + marquise
  const mat = rng.chance(0.5) ? 'metal' : 'wood';
  const t = rng.pick([[0.35, 0.28, 0.22], [0.3, 0.4, 0.45], [0.5, 0.2, 0.15]]);
  fbox(B, F, o.u0, o.u1, o.y0, o.y1, -0.3, -0.24, mat, { color: t });
  fbox(B, F, c + 0.35, c + 0.45, o.y0 + 1.0, o.y0 + 1.06, -0.24, -0.18, 'chrome', {});
  fbox(B, F, o.u0 - 0.3, o.u1 + 0.3, 0, 0.16, 0, 0.45, 'concrete', { color: [0.7, 0.68, 0.64] });
  fbox(B, F, o.u0 - 0.4, o.u1 + 0.4, o.y1 + 0.2, o.y1 + 0.32, 0, 0.9, 'concrete', { color: [0.75, 0.73, 0.7] });
  void frameTint;
}

function roofProps(W, s, H) {
  const { B, rng } = W;
  const ix0 = s.x0 + 1, ix1 = s.x1 - 1, iz0 = s.z0 + 1, iz1 = s.z1 - 1;
  if (ix1 - ix0 < 2 || iz1 - iz0 < 2) return;
  const n = rng.int(1, 4);
  for (let i = 0; i < n; i++) {
    const x = rng.range(ix0 + 0.6, ix1 - 0.6), z = rng.range(iz0 + 0.6, iz1 - 0.6);
    const kind = rng.next();
    if (kind < 0.45) {
      // caixa d'água (cilindro sobre pés)
      const r = rng.range(0.45, 0.7), h = rng.range(0.9, 1.3);
      const tint = rng.pick([[0.9, 0.9, 0.88], [0.25, 0.3, 0.45], [0.15, 0.15, 0.15], [0.75, 0.6, 0.3]]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(x + dx * r * 0.6 - 0.03, H, z + dz * r * 0.6 - 0.03, x + dx * r * 0.6 + 0.03, H + 0.4, z + dz * r * 0.6 + 0.03, 'metal', { collide: false, color: [0.3, 0.3, 0.3] });
      cylinder(B, x, H + 0.4, z, r, h, 'metal', { seg: 14, color: tint });
    } else if (kind < 0.65) {
      // aquecedor solar inclinado (típico no Oriente Médio)
      B.obox([x, H + 0.7, z], [2, 0.08, 1.1], [0.6, rng.range(0, 0.4), 0], 'glass', { color: [0.6, 0.65, 0.8] });
      B.obox([x, H + 1.05, z - 0.5], [1.8, 0.4, 0.4], [0, rng.range(0, 0.4), Math.PI / 2], 'metal', { color: [0.85, 0.85, 0.82] });
      cylinder(B, x, H + 0.95, z - 0.55, 0.22, 1.9, 'metal', { seg: 10, color: [0.85, 0.85, 0.82], rot: [0, 0, Math.PI / 2] });
    } else if (kind < 0.8) {
      // casinha da escada
      const w = rng.range(2, 3), d = rng.range(2, 3);
      const xx = Math.min(Math.max(x, ix0 + w / 2), ix1 - w / 2), zz = Math.min(Math.max(z, iz0 + d / 2), iz1 - d / 2);
      B.box(xx - w / 2, H, zz - d / 2, xx + w / 2, H + 2.5, zz + d / 2, s.style === 'brick' ? 'brick' : 'plaster', { collide: false, color: s.tint });
      B.box(xx - w / 2 - 0.1, H + 2.5, zz - d / 2 - 0.1, xx + w / 2 + 0.1, H + 2.62, zz + d / 2 + 0.1, 'concrete', { collide: false, color: [0.7, 0.68, 0.65] });
    } else {
      // antena + condensadoras
      cylBetween(B, [x, H, z], [x, H + rng.range(3, 6), z], 0.03, 'metal', { color: [0.4, 0.4, 0.4] });
      B.box(x + 0.4, H, z, x + 1.2, H + 0.7, z + 0.35, 'metal', { collide: false, color: [0.85, 0.85, 0.8] });
    }
  }
  if (rng.chance(0.5)) W.dishes.push({ p: [rng.range(ix0, ix1), H + 1.2, rng.range(iz0, iz1)], n: [rng.range(-1, 1), 0.5] });
}

/** Topo desmoronado: lajes partidas, pilares tocos, vergalhões e entulho. */
function brokenTop(W, s, H) {
  const { B, rng } = W;
  const nx = Math.max(2, Math.round((s.x1 - s.x0) / 1.6)), nz = Math.max(2, Math.round((s.z1 - s.z0) / 1.6));
  // tocos de parede irregulares na borda
  const edge = (ax, az, bx, bz, n) => {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const h = rng.chance(0.4) ? rng.range(0.1, 2.2) : rng.range(0, 0.4);
      const x0 = ax + (bx - ax) * t0, x1 = ax + (bx - ax) * t1 + (bx === ax ? 0.3 : 0);
      const z0 = az + (bz - az) * t0, z1 = az + (bz - az) * t1 + (bz === az ? 0.3 : 0);
      if (h > 0.15) B.box(x0, H, z0, x1, H + h, z1, s.style, { collide: false, color: s.tint });
      if (h > 0.6 && rng.chance(0.6)) rebar(B, [(x0 + x1) / 2, H + h, (z0 + z1) / 2], [rng.range(-0.3, 0.3), 1, rng.range(-0.3, 0.3)], rng.range(0.4, 1.2), rng);
    }
  };
  edge(s.x0, s.z0, s.x1, s.z0, nx);
  edge(s.x0, s.z1 - 0.3, s.x1, s.z1 - 0.3, nx);
  edge(s.x0, s.z0, s.x0, s.z1, nz);
  edge(s.x1 - 0.3, s.z0, s.x1 - 0.3, s.z1, nz);
  // pedaços de laje inclinados + entulho no topo
  for (let i = 0; i < 6; i++) {
    const x = rng.range(s.x0 + 1, s.x1 - 1), z = rng.range(s.z0 + 1, s.z1 - 1);
    B.obox([x, H + 0.2, z], [rng.range(1, 2.5), 0.2, rng.range(1, 2.5)], [rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4)], 'concrete', { color: [0.68, 0.66, 0.63] });
    W.rubbleSpots.push({ p: [x, H, z], r: rng.range(0.8, 1.6), n: 10 });
  }
  for (let i = 0; i < 10; i++) {
    const x = rng.range(s.x0 + 0.3, s.x1 - 0.3), z = rng.range(s.z0 + 0.3, s.z1 - 0.3);
    rebar(B, [x, H, z], [rng.range(-1, 1), rng.range(0.3, 1), rng.range(-1, 1)], rng.range(0.5, 1.4), rng);
  }
}

/** Lateral rasgada de um vizinho que desabou: cômodos expostos. */
function exposedSide(W, s, F, yFrom, H, fy) {
  const { B, rng } = W;
  const wallTints = [[0.62, 0.75, 0.68], [0.8, 0.72, 0.55], [0.6, 0.66, 0.8], [0.86, 0.8, 0.74], [0.75, 0.55, 0.5]];
  for (let f = 0; f < s.floors; f++) {
    const y = fy(f), yTop = fy(f + 1);
    if (yTop <= yFrom + 0.1) continue;
    const ya = Math.max(y, yFrom);
    // lajes salientes quebradas
    if (y >= yFrom - 0.05) {
      for (let u = 0; u < F.W; u += rng.range(0.8, 1.6)) {
        const len = rng.range(0.1, 0.7);
        fbox(B, F, u, Math.min(F.W, u + rng.range(0.6, 1.6)), y - 0.2, y + 0.02, 0, len, 'concrete', { color: [0.7, 0.68, 0.65] });
        if (rng.chance(0.5)) rebar(B, P3(F, u + 0.3, y - 0.1, len), [F.n[0], -0.2, F.n[1]], rng.range(0.3, 0.9), rng);
      }
    }
    // paredes de cômodos (pintura interna) com divisórias
    let u = 0.2;
    while (u < F.W - 0.5) {
      const rw = Math.min(F.W - 0.2 - u, rng.range(3, 5));
      const t = rng.pick(wallTints);
      fbox(B, F, u, u + rw, ya, yTop - 0.2, 0, 0.02, 'plasterIn', { color: t });
      // rodapé + faixa de barra (pintura a óleo na metade de baixo)
      if (ya === y) fbox(B, F, u, u + rw, y, y + 1.2, 0.02, 0.025, 'plasterIn', { color: t.map((c) => c * 0.75) });
      // divisória rasgada saindo da fachada
      if (rng.chance(0.6)) fbox(B, F, u + rw - 0.06, u + rw + 0.06, ya, ya + rng.range(0.6, yTop - ya - 0.2), 0, rng.range(0.2, 0.8), 'plaster', { color: [0.85, 0.83, 0.78] });
      u += rw + 0.1;
    }
  }
  void H;
}
