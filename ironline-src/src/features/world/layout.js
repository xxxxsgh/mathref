/**
 * Planta do mapa "Distrito Velho": avenida principal N–S (eixo Z) em um
 * bairro urbano destruído, cruzamento em z ≈ -59, ruela à esquerda,
 * posto de controle com T-walls/HESCO, prédio colapsado à direita e um
 * interior jogável no térreo do prédio R4.
 *
 *   rua:       x ∈ [-6, 6]   (asfalto)
 *   calçadas:  |x| ∈ [6, 9.5] (topo 0.15)
 *   fachadas:  |x| = 9.5, prédios até |x| = 23.5
 *   jogador nasce em (0, 0, 20) olhando -Z
 */
import { building, TINTS } from './buildings.js';
import { buildInterior, ROOM } from './interior.js';
import * as P from './props.js';
import { cable, decal } from './shapes.js';
import * as THREE from 'three';
import { mat4, cached } from './geo.js';

const ROAD = 6, WALK = 9.5, DEPTH = 14;
const Z_N = 60, Z_S = -150;
const CROSS = [-66, -52];

export function buildLayout(W) {
  const { B, rng } = W;

  // chão e horizonte não projetam sombra (só encheriam o shadow map)
  W.B.cast = false;
  ground(W);
  W.B.cast = true;

  // ── prédios do lado esquerdo (fachada +X) ──
  const L = (z0, z1, o) => building(W, { x0: -WALK - DEPTH, x1: -WALK, z0, z1, faces: ['px'], ...o });
  const R = (z0, z1, o) => building(W, { x0: WALK, x1: WALK + DEPTH, z0, z1, faces: ['nx'], ...o });

  L(34, 52, { floors: 4, tint: TINTS.sand, shop: true, cond: 0.3 });
  L(20, 34, { floors: 5, tint: TINTS.cream, shop: true, cond: 0.4 });
  L(6, 20, { floors: 3, style: 'brick', tint: [1, 1, 1], shop: true, cond: 0.35 });
  L(-8, 6, { floors: 6, style: 'concrete', tint: [0.86, 0.85, 0.82], door: 2, cond: 0.45, balconies: 0.5, pitch: 3.0 });
  L(-16, -8, { floors: 4, tint: TINTS.ochre, shop: true, cond: 0.6, exposed: [{ face: 'nz', y0: 7 }] });
  L(-24, -16, { floors: 2, tint: TINTS.ochre, shop: true, cond: 0.9, brokenTop: true });
  L(-38, -24, { floors: 5, tint: TINTS.pink, shop: true, cond: 0.4 });
  L(-52, -42, { floors: 3, style: 'brick', tint: [1, 1, 1], shop: true, cond: 0.5, faces: ['px', 'nz'] });
  L(-84, -66, { floors: 5, tint: TINTS.blue, shop: true, cond: 0.35, faces: ['px', 'pz'] });
  L(-100, -84, { floors: 4, tint: TINTS.yellow, shop: true, cond: 0.3 });
  L(-120, -100, { floors: 7, style: 'concrete', tint: [0.8, 0.8, 0.78], door: 3, cond: 0.4, balconies: 0.45 });
  L(-140, -120, { floors: 3, tint: TINTS.green, shop: true, cond: 0.3 });

  R(30, 52, { floors: 3, tint: TINTS.white, shop: true, cond: 0.3 });
  R(16, 30, { floors: 4, style: 'brick', tint: [1, 1, 1], shop: true, cond: 0.3 });
  R(2, 16, { floors: 3, tint: TINTS.green, shop: true, cond: 0.4 });
  // R4: térreo é o interior jogável; andares de cima pelo gerador
  const r4tint = TINTS.sand;
  R(ROOM.z0, ROOM.z1, { floors: 4, tint: r4tint, startFloor: 1, cond: 0.5, noCollide: true, exposed: [{ face: 'nz', y0: 6.6 }] });
  W.B.collider([ROOM.x0, ROOM.h, ROOM.z0], [ROOM.x1, 3.2 * 4 + 1, ROOM.z1], 'plaster');
  buildInterior(W, r4tint);
  R(-22, ROOM.z0, { floors: 2, tint: TINTS.grey, shop: true, cond: 0.95, brokenTop: true });
  R(-38, -22, { floors: 5, tint: TINTS.cream, shop: true, cond: 0.45, exposed: [{ face: 'pz', y0: 6.6 }] });
  R(-52, -38, { floors: 4, tint: TINTS.pink, shop: true, cond: 0.4, faces: ['nx', 'nz'] });
  R(-80, -66, { floors: 3, style: 'brick', tint: [1, 1, 1], shop: true, cond: 0.4, faces: ['nx', 'pz'] });
  R(-104, -80, { floors: 5, tint: TINTS.sand, shop: true, cond: 0.35 });
  R(-140, -104, { floors: 4, tint: TINTS.white, shop: true, cond: 0.3 });

  // fundo das ruas: prédio que fecha a avenida ao sul e ao norte
  building(W, { x0: -26, x1: 26, z0: -168, z1: Z_S + 10, floors: 6, faces: ['pz'], tint: TINTS.cream, shop: true, cond: 0.3, pitch: 3.2 });
  building(W, { x0: -26, x1: 26, z0: Z_N, z1: Z_N + 14, floors: 5, faces: ['nz'], tint: TINTS.ochre, shop: true, cond: 0.4 });
  // rua transversal: fachadas visíveis do cruzamento
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -62 : WALK + DEPTH, xb = s < 0 ? -WALK - DEPTH : 62;
    building(W, { x0: xa, x1: xb, z0: CROSS[1] + 3.5, z1: CROSS[1] + 17, floors: 4, faces: ['nz'], tint: s < 0 ? TINTS.pink : TINTS.grey, shop: true, cond: 0.4 });
    building(W, { x0: xa, x1: xb, z0: CROSS[0] - 17, z1: CROSS[0] - 3.5, floors: 3, faces: ['pz'], tint: s < 0 ? TINTS.white : TINTS.sand, shop: true, cond: 0.4 });
  }

  W.B.cast = false;
  skyline(W);
  W.B.cast = true;
  dressStreet(W);
}

// ─── chão: asfalto, meio-fio, calçadas, ruela, terreno ─────────────────
function ground(W) {
  const { B, rng } = W;
  // terreno de fundo (terra) — sob tudo
  B.box(-260, -0.6, -320, 260, -0.02, 220, 'dirt', { color: [0.85, 0.8, 0.72], faces: { ny: null }, collide: false });
  B.collider([-260, -1, -320], [260, -0.02, 220], 'dirt');
  // avenida (em fatias de 20 m para culling)
  for (let z = Z_S; z < Z_N; z += 20) B.box(-ROAD, -0.4, z, ROAD, 0, Math.min(Z_N, z + 20), 'asphalt', { faces: { ny: null } });
  // transversal
  for (let x = -70; x < 70; x += 20) {
    if (x + 20 <= -ROAD || x >= ROAD) B.box(x, -0.4, CROSS[0] + 3.5, x + 20, 0, CROSS[1] - 3.5, 'asphalt', { faces: { ny: null } });
    else {
      if (x < -ROAD) B.box(x, -0.4, CROSS[0] + 3.5, -ROAD, 0, CROSS[1] - 3.5, 'asphalt', { faces: { ny: null } });
      if (x + 20 > ROAD) B.box(ROAD, -0.4, CROSS[0] + 3.5, x + 20, 0, CROSS[1] - 3.5, 'asphalt', { faces: { ny: null } });
    }
  }
  // calçadas + meio-fio (interrompidos no cruzamento)
  const walk = (x0, x1, z0, z1) => {
    for (let z = z0; z < z1; z += 20) {
      const zb = Math.min(z1, z + 20);
      B.box(x0, -0.4, z, x1, 0.15, zb, 'pavers', { faces: { ny: null } });
    }
  };
  const curb = (x0, x1, z0, z1) => B.box(x0, 0, z0, x1, 0.16, z1, 'concrete', { color: [0.8, 0.78, 0.74], collide: false });
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -WALK : ROAD, xb = s < 0 ? -ROAD : WALK;
    walk(xa, xb, CROSS[1], Z_N);
    walk(xa, xb, Z_S, CROSS[0]);
    const cx0 = s < 0 ? -ROAD - 0.02 : ROAD - 0.22, cx1 = cx0 + 0.24;
    curb(cx0, cx1, CROSS[1], Z_N);
    curb(cx0, cx1, Z_S, CROSS[0]);
    // calçadas da transversal
    const ax = s < 0 ? -70 : WALK, bx = s < 0 ? -WALK : 70;
    B.box(ax, -0.4, CROSS[1] - 3.5, bx, 0.15, CROSS[1], 'pavers', { faces: { ny: null } });
    B.box(ax, -0.4, CROSS[0], bx, 0.15, CROSS[0] + 3.5, 'pavers', { faces: { ny: null } });
    // quinas do cruzamento
    B.box(s < 0 ? -WALK : ROAD, -0.4, CROSS[1] - 3.5, s < 0 ? -ROAD : WALK, 0.15, CROSS[1], 'pavers', { faces: { ny: null } });
    B.box(s < 0 ? -WALK : ROAD, -0.4, CROSS[0], s < 0 ? -ROAD : WALK, 0.15, CROSS[0] + 3.5, 'pavers', { faces: { ny: null } });
  }
  // ruela à esquerda (z ∈ [-42, -38]) — terra batida com entulho
  B.box(-WALK - DEPTH, -0.3, -42, -WALK, 0.02, -38, 'dirt', { color: [0.9, 0.85, 0.78], faces: { ny: null } });
  B.box(-WALK - DEPTH - 0.3, 0, -42, -WALK - DEPTH, 2.6, -38, 'brick', { color: [0.9, 0.9, 0.9] });

  // ── pintura de rua: faixa central tracejada, faixas de pedestre, linhas de parada ──
  for (let z = Z_S + 2; z < Z_N - 2; z += 6) {
    if (z > CROSS[0] - 6 && z < CROSS[1] + 4) continue;
    decal(B, 'paint', [0, 0.012, z], 'py', [0.14, 3], [0, rng.next(), 1, rng.next() + 0.4], rng.range(-0.01, 0.01), [0.95, 0.85, 0.55]);
  }
  for (const zc of [CROSS[1] + 1.8, CROSS[0] - 1.8]) {
    for (let x = -ROAD + 0.8; x < ROAD - 0.4; x += 1.0) decal(B, 'paint', [x, 0.012, zc], 'py', [0.5, 3.0], [0, rng.next(), 1, rng.next() * 0.5 + 0.5]);
  }
  // manchas, queimados, bueiros, tampas
  for (let i = 0; i < 40; i++) {
    const z = rng.range(Z_S, Z_N), x = rng.range(-ROAD + 0.5, ROAD - 0.5);
    const q = rng.int(0, 3);
    decal(B, 'stains', [x, 0.014 + i * 0.0002, z], 'py', [rng.range(1.5, 4), rng.range(1.5, 4)], [(q % 2) * 0.5, Math.floor(q / 2) * 0.5, (q % 2) * 0.5 + 0.5, Math.floor(q / 2) * 0.5 + 0.5], rng.range(0, 6));
  }
  for (let z = Z_S + 8; z < Z_N; z += 23) {
    for (const s of [-1, 1]) B.box(s * (ROAD - 0.25) - 0.25, -0.02, z, s * (ROAD - 0.25) + 0.25, 0.006, z + 0.9, 'black', { collide: false });
  }
  for (let z = Z_S + 15; z < Z_N; z += 31) {
    const x = rng.range(-2.5, 2.5);
    B.add(cylGeo(), 'metal', mat4([x, 0.003, z], [0, 0, 0], [0.38, 0.012, 0.38]), { color: [0.35, 0.33, 0.3] });
  }
}

const cylGeo = () => cached('cyl16', () => new THREE.CylinderGeometry(1, 1, 1, 16));
const sphereGeo = () => cached('sph18', () => new THREE.SphereGeometry(1, 18, 10));

// ─── horizonte: blocos distantes com fachada de janelas ────────────────
function skyline(W) {
  const { B, rng } = W;
  const placed = [];
  const add = (x0, z0, w, d, h) => {
    const t = rng.pick([[0.9, 0.86, 0.78], [0.82, 0.8, 0.76], [0.92, 0.82, 0.68], [0.78, 0.8, 0.82]]);
    B.box(x0, -0.1, z0, x0 + w, h, z0 + d, 'far', { color: t, collide: false, faces: { ny: null } });
    B.box(x0 - 0.2, h, z0 - 0.2, x0 + w + 0.2, h + 0.6, z0 + d + 0.2, 'concrete', { color: [0.7, 0.68, 0.64], collide: false, faces: { ny: null } });
    placed.push([x0, z0, w, d]);
  };
  // anéis atrás das fileiras principais
  for (const s of [-1, 1]) {
    for (let z = Z_S - 10; z < Z_N + 10; z += rng.range(14, 22)) {
      if (z > CROSS[0] - 22 && z < CROSS[1] + 18) continue;
      const x0 = s < 0 ? -WALK - DEPTH - rng.range(16, 26) : WALK + DEPTH + rng.range(2, 10);
      add(x0, z, rng.range(12, 18), rng.range(10, 16), rng.range(12, 30));
    }
  }
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(120, 260);
    const x = Math.cos(a) * d, z = Math.sin(a) * d - 40;
    if (Math.abs(x) < 30 && z > -170 && z < 80) continue;
    add(x, z, rng.range(14, 26), rng.range(14, 26), rng.range(10, 45));
  }
  // minarete + cúpula ao longe (silhueta característica)
  const mx = 70, mz = -230;
  B.add(cylGeo(), 'plaster', mat4([mx, 22, mz], [0, 0, 0], [2.2, 44, 2.2]), { color: [0.92, 0.88, 0.8] });
  B.add(cylGeo(), 'plaster', mat4([mx, 36, mz], [0, 0, 0], [3.2, 1.2, 3.2]), { color: [0.85, 0.8, 0.72] });
  B.add(sphereGeo(), 'metal', mat4([mx, 46, mz], [0, 0, 0], [1.8, 3.6, 1.8]), { color: [0.4, 0.55, 0.5] });
  B.add(sphereGeo(), 'plaster', mat4([mx - 28, 18, mz + 10], [0, 0, 0], [14, 12, 14]), { color: [0.75, 0.82, 0.8] });
  B.box(mx - 46, -0.1, mz - 8, mx - 10, 18, mz + 28, 'plaster', { color: [0.9, 0.85, 0.76], collide: false });
  // caixas d'água/torres distantes
  for (let i = 0; i < 3; i++) {
    const x = rng.range(-200, 200), z = rng.range(-300, -180);
    B.add(cylGeo(), 'concrete', mat4([x, 15, z], [0, 0, 0], [1.4, 30, 1.4]), { color: [0.8, 0.78, 0.74] });
    B.add(sphereGeo(), 'concrete', mat4([x, 32, z], [0, 0, 0], [5, 4, 5]), { color: [0.85, 0.82, 0.78] });
  }
}
// ─── vestir a rua ──────────────────────────────────────────────────────
function dressStreet(W) {
  const { B, rng } = W;

  streetGrime(W);

  // barreiras no primeiro plano (pista esquerda)
  P.jersey(W, -3.3, 16.5, Math.PI / 2 - 0.35);
  P.jersey(W, -5.0, 12.6, 0.15);
  P.scatterBricks(W, -2, 15, 2.2, 14);

  // carros estacionados / abandonados / queimados
  P.car(W, 4.6, 36, Math.PI / 2 + 0.03, { kind: 'sedan', tint: [0.85, 0.85, 0.82] });
  P.car(W, 4.7, 28.5, Math.PI / 2 - 0.05, { kind: 'hatch', tint: [0.55, 0.15, 0.12] });
  P.car(W, -4.2, 44, Math.PI / 2 + 0.5, { burnt: true, kind: 'sedan' });
  P.car(W, 4.75, 8, Math.PI / 2, { kind: 'hatch', tint: [0.62, 0.64, 0.66] });
  P.car(W, -2.8, -12, Math.PI / 2 + 0.75, { burnt: true, kind: 'sedan' });
  P.car(W, -4.7, -32, -Math.PI / 2 + 0.06, { kind: 'sedan', tint: [0.75, 0.68, 0.55] });
  P.car(W, 3.2, -78, Math.PI / 2 - 0.4, { burnt: true, kind: 'hatch' });
  P.car(W, -4.6, -92, Math.PI / 2, { kind: 'sedan', tint: [0.18, 0.24, 0.36] });
  P.car(W, 4.6, -112, Math.PI / 2 + 0.04, { kind: 'hatch', tint: [0.85, 0.85, 0.82] });
  P.car(W, -1.5, -128, 0.4, { burnt: true, kind: 'sedan' });

  // barreiras jersey em chicane (atrás do ponto do inimigo do preset combat)
  P.jersey(W, -3.6, -2.5, Math.PI / 2 + 0.2);
  P.jersey(W, -0.6, -3.0, Math.PI / 2 - 0.1);
  P.jersey(W, 3.6, -6.5, Math.PI / 2 + 0.05);
  P.jersey(W, 7.6, 12, 0.02, { tint: [0.85, 0.8, 0.7] });

  // posto de controle em z ≈ -30: T-walls à esquerda, HESCO à direita, arame
  P.twalls(W, -5.8, -30, Math.PI / 2, 4);
  P.hesco(W, 1.6, -31, Math.PI / 2, 4);
  P.concertina(W, [-6, -27.6], [-0.6, -27.6]);
  P.concertina(W, [1.2, -28.8], [6, -28.8]);
  P.sandbagWall(W, [[2.2, -33], [5.4, -33]], 4);
  P.crate(W, -0.5, -33.5, 0.3, 1);
  P.crate(W, -0.9, -34.6, 1.4, 0.8);
  P.barrel(W, 6.6, -29.5, {});
  P.barrel(W, 7.2, -30.3, {});
  P.barrel(W, 6.9, -31.6, { fallen: true });
  // ninho de metralhadora no cruzamento (alvo do preset ads)
  P.sandbagWall(W, [[-1.6, -47], [1.6, -47], [2.6, -45.5]], 5);
  P.sandbagWall(W, [[-1.6, -47], [-2.6, -45.5]], 5);
  P.crate(W, 0.2, -48.2, 0.1, 0.9);

  // bunker de sacos de areia na calçada esquerda
  P.sandbagWall(W, [[-6.6, 14], [-6.6, 10.5], [-9.3, 10.5]], 5);
  P.sandbagWall(W, [[-6.6, 14], [-8.8, 14.6]], 4);
  P.crate(W, -8.4, 12.3, 0.2, 0.8, { y: 0.15 });

  // entulho dos prédios desabados
  P.rubblePile(W, -8.5, -20, 3.2, 1.6, { tint: TINTS.ochre });
  P.rubblePile(W, -5.5, -22.5, 1.6, 0.6, {});
  P.rubblePile(W, 8.2, -18, 3.6, 1.9, { tint: TINTS.grey });
  P.rubblePile(W, 5.2, -16.5, 1.5, 0.5, {});
  P.rubblePile(W, 8.4, -40, 1.4, 0.6, { tint: TINTS.pink });
  P.rubblePile(W, -8.3, -96, 1.8, 0.8, { tint: TINTS.yellow });
  P.rubblePile(W, -16, -40, 2, 1.0, {});
  for (const r of W.rubbleSpots) {
    if (r.small) P.scatterBricks(W, r.p[0], r.p[2], r.r, r.n);
    else P.rubblePile(W, r.p[0], r.p[2], r.r, 0.4, { n: r.n, collide: false });
  }
  W.rubbleSpots.length = 0;
  for (let i = 0; i < 20; i++) P.scatterBricks(W, rng.range(-9, 9), rng.range(Z_S + 5, Z_N - 5), rng.range(0.6, 2), rng.int(2, 7));

  // postes de concreto com fiação + cabos atravessando a rua
  let prev = { '-1': null, '1': null };
  for (let z = 50; z > Z_S; z -= 21) {
    if (z > CROSS[0] - 4 && z < CROSS[1] + 4) {
      prev = { '-1': null, '1': null };
      continue;
    }
    for (const s of [-1, 1]) {
      const x = s * 7.6;
      const pts = P.utilityPole(W, x, z + (s > 0 ? 6 : 0), 0, { transformer: rng.chance(0.25) });
      const pv = prev[s];
      if (pv) for (let k = 0; k < 3; k++) cable(B, pv[k], pts[k], rng.range(0.4, 0.7), 0.01);
      prev[s] = pts;
      // ramal para a fachada
      if (rng.chance(0.7)) cable(B, pts[s > 0 ? 2 : 0], [s * WALK, rng.range(5, 7), z + (s > 0 ? 6 : 0) + rng.range(-3, 3)], 0.4, 0.009);
    }
  }
  for (let z = 48; z > Z_S; z -= rng.range(5, 9)) {
    if (z > CROSS[0] - 2 && z < CROSS[1] + 2) continue;
    const ya = rng.range(4.5, 9), yb = ya + rng.range(-1.5, 1.5);
    cable(B, [-WALK + 0.05, ya, z], [WALK - 0.05, yb, z + rng.range(-4, 4)], rng.range(0.5, 1.4), rng.range(0.008, 0.014));
    if (rng.chance(0.3)) cable(B, [-WALK + 0.05, ya - 0.3, z + 0.3], [WALK - 0.05, yb - 0.2, z + rng.range(-4, 4)], rng.range(0.6, 1.6), 0.01);
  }
  // luminárias
  for (let z = 40; z > Z_S; z -= 30) {
    if (z > CROSS[0] - 4 && z < CROSS[1] + 4) continue;
    P.streetLamp(W, 7.2, z - 12, 1);
    P.streetLamp(W, -7.2, z - 27, -1);
  }

  // árvores (com canteiro) e palmeiras nas esquinas
  const treeSpot = (x, z) => {
    B.box(x - 0.6, 0.0, z - 0.6, x + 0.6, 0.17, z + 0.6, 'concrete', { color: [0.7, 0.68, 0.65], collide: false, faces: { py: null } });
    B.box(x - 0.55, 0.0, z - 0.55, x + 0.55, 0.12, z + 0.55, 'dirt', { color: [0.8, 0.72, 0.62], collide: false });
    P.tree(W, x, z, {});
    P.grassTufts(W, x, z, 0.5, 8, { y: 0.12 });
  };
  treeSpot(-7.7, 30);
  treeSpot(7.9, 41);
  treeSpot(-7.7, -1);
  treeSpot(7.9, -44.5);
  treeSpot(-7.7, -88);
  treeSpot(7.9, -96);
  P.palm(W, 8.0, -50.3, { h: 9 });
  P.palm(W, -8.0, -68.2, { h: 8 });
  P.palm(W, -18, -59, { h: 10 });

  // caçambas, pneus, paletes, caixotes
  P.dumpster(W, 8.4, 21, 0.05);
  P.dumpster(W, -8.3, -36.2, Math.PI + 0.1);
  P.dumpster(W, -16.5, -40.5, 0.3);
  for (const [x, z] of [[-5.2, 23], [6.6, 2], [-6.3, -44], [5.5, -60], [-4.8, -104], [2.8, -136]]) P.tire(W, x, z);
  P.pallet(W, 8.7, 18.8, 0.2, 0.15);
  P.pallet(W, -16, -39, 1.1, 0.02);

  // lixo e mato
  for (const t of W.trashSpots) P.trash(W, t[0], t[1], t[2], 14, 0.17);
  W.trashSpots.length = 0;
  for (let z = Z_S + 3; z < Z_N - 3; z += rng.range(2.5, 5)) {
    for (const s of [-1, 1]) {
      if (rng.chance(0.55)) P.trash(W, s * rng.range(5.2, 5.8), z, 0.6, rng.int(2, 5), 0.02);
      if (rng.chance(0.45)) P.trash(W, s * rng.range(8.6, 9.3), z, 0.6, rng.int(1, 4), 0.17);
      if (rng.chance(0.4)) P.grassTufts(W, s * 9.35, z, 0, rng.int(2, 5), { dx: 0.12, dz: 0.8, y: 0.15 });
      if (rng.chance(0.35)) P.grassTufts(W, s * 5.95, z, 0, rng.int(1, 4), { dx: 0.06, dz: 0.6, y: 0.0 });
    }
  }
  P.grassTufts(W, -16, -40, 2.5, 30, { y: 0.02 });

  // antenas parabólicas registradas pelos prédios
  for (const d of W.dishes) P.dish(W, d.p, d.n);
  W.dishes.length = 0;
}

// ─── sujeira de rua: sarjetas, areia, crateras de granada ──────────────
function streetGrime(W) {
  const { B, rng, I } = W;
  // faixa de areia/poeira acumulada junto ao meio-fio e na base das fachadas
  for (let z = Z_S + 2; z < Z_N - 2; z += rng.range(3, 6)) {
    if (z > CROSS[0] - 1 && z < CROSS[1] + 1) continue;
    for (const s of [-1, 1]) {
      decal(B, 'stains', [s * (ROAD - rng.range(0.4, 0.7)), 0.013, z], 'py', [rng.range(1.0, 1.8), rng.range(4, 7)], [0, 0.5, 0.5, 1], rng.range(-0.15, 0.15), [1, 0.95, 0.85]);
      if (rng.chance(0.6)) decal(B, 'stains', [s * (WALK - rng.range(0.3, 0.6)), 0.163, z], 'py', [rng.range(0.8, 1.4), rng.range(3, 6)], [0, 0.5, 0.5, 1], rng.range(-0.1, 0.1));
      // detritos miúdos na sarjeta
      if (rng.chance(0.5)) P.scatterBricks(W, s * (ROAD - 0.35), z, 0.5, rng.int(2, 6));
    }
  }
  // crateras (impacto de morteiro): mancha queimada + borda de asfalto quebrado
  const craters = [[1.8, 24], [-2.2, -17], [3.0, -41], [-1.0, -84], [2.4, -118]];
  for (const [x, z] of craters) {
    const r = rng.range(1.0, 1.5);
    decal(B, 'stains', [x, 0.016, z], 'py', [r * 4.2, r * 4.2], [0.5, 0.5, 1, 1], rng.range(0, 6));
    decal(B, 'stains', [x, 0.017, z], 'py', [r * 1.8, r * 1.8], [0.5, 0.5, 1, 1], rng.range(0, 6), [0.6, 0.6, 0.6]);
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const d = r * rng.range(0.7, 1.15);
      const sz = rng.range(0.12, 0.3);
      const v = rng.int(0, 3);
      I.add('rock' + v, P.rockGeo(v), 'asphalt', mat4([x + Math.cos(a) * d, sz * 0.25, z + Math.sin(a) * d], [rng.range(-0.6, 0.6), rng.range(0, 6), rng.range(-0.6, 0.6)], [sz * 1.4, sz * 0.5, sz]), [0.9, 0.9, 0.9]);
    }
    P.scatterBricks(W, x, z, r * 2.5, 14);
  }
}
