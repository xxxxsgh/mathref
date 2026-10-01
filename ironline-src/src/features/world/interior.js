/**
 * Interior jogável: térreo do prédio R4 (x ∈ [9.5, 23.5], z ∈ [-14, 2]).
 *
 * Sala de apartamento/loja ocupada como posição de tiro: parede pintada em
 * duas cores (barra a óleo embaixo), piso cerâmico empoeirado, teto com
 * reboco caindo, rombo de explosão na fachada, janelas com sacos de areia,
 * móveis revirados, caixas de munição, papéis e entulho.
 *
 * Ponto de vista do preset `interior`: (16, 0.17, -4) olhando para -X
 * (porta ao centro, rombo à esquerda, janelas nas laterais).
 */
import * as THREE from 'three';
import { cylinder, cylBetween, cable, rebar, decal } from './shapes.js';
import { rubblePile, scatterBricks, crate, sandbagWall, trash, barrel } from './props.js';
import { mat4, cached } from './geo.js';

export const ROOM = { x0: 9.5, x1: 23.5, z0: -14, z1: 2, h: 3.2, floor: 0.17, wall: 0.3 };

export function buildInterior(W, tint) {
  const { B, rng } = W;
  const R = ROOM;
  const ix0 = R.x0 + R.wall, ix1 = R.x1 - R.wall, iz0 = R.z0 + R.wall, iz1 = R.z1 - R.wall;
  const lower = [0.5, 0.64, 0.58]; // barra verde-água a óleo
  const upper = [0.9, 0.86, 0.76];
  const F = R.floor;
  const DADO = F + 1.15;

  // piso e teto
  B.box(R.x0, -0.3, R.z0, R.x1, F, R.z1, 'tiles', { color: [1, 1, 1], faces: { ny: null } });
  B.box(R.x0, R.h, R.z0, R.x1, R.h + 0.25, R.z1, 'concrete', { collide: true, color: [1.05, 1.05, 1.08] });
  // reboco caído do teto (manchas escuras + placa pendurada)
  decal(B, 'cracks', [17, R.h - 0.01, -6], 'ny', [3, 3]);
  decal(B, 'stains', [13, R.h - 0.012, -10], 'ny', [3, 3], [0, 0.5, 0.5, 1]);

  /** Parede interna em duas cores: lado `inner` (face voltada para dentro). */
  const wall = (x0, z0, x1, z1, y0, y1, inner, outerMat = 'plaster', outerTint = tint, extra = {}) => {
    const faces = {};
    const outer = { px: 'nx', nx: 'px', pz: 'nz', nz: 'pz' }[inner];
    faces[outer] = outerMat;
    // parte de baixo (barra)
    if (y0 < DADO) {
      const ya = y0, yb = Math.min(y1, DADO);
      B.box(x0, ya, z0, x1, yb, z1, 'plasterIn', { color: lower, faces: { ...faces, [outer]: outerMat }, ...extra, collide: false });
    }
    if (y1 > DADO) {
      B.box(x0, Math.max(y0, DADO), z0, x1, y1, z1, 'plasterIn', { color: upper, faces: { ...faces }, ...extra, collide: false });
    }
    // tinta externa usa o tom do prédio
    void outerTint;
    B.collider([Math.min(x0, x1), y0, Math.min(z0, z1)], [Math.max(x0, x1), y1, Math.max(z0, z1)], 'plaster');
  };

  // ── parede da frente (x = 9.5…9.8) com porta, janelas e rombo ──
  const fx0 = R.x0, fx1 = R.x0 + R.wall;
  const ops = [
    { z0: -11.2, z1: -9.0, y0: F + 0.85, y1: 2.45, kind: 'window' },
    { z0: -8.6, z1: -5.6, kind: 'hole' },
    { z0: -4.8, z1: -3.2, y0: F, y1: 2.35, kind: 'door' },
    { z0: -1.2, z1: 1.0, y0: F + 0.85, y1: 2.45, kind: 'window' },
  ];
  let z = iz0 - R.wall;
  const frontWall = (za, zb, ya, yb) => {
    if (zb - za < 0.01 || yb - ya < 0.01) return;
    // exterior com o reboco do prédio (tinta), interior em duas cores
    if (ya < DADO) B.box(fx0, ya, za, fx1, Math.min(yb, DADO), zb, 'plasterIn', { color: lower, faces: { nx: null }, collide: false });
    if (yb > DADO) B.box(fx0, Math.max(ya, DADO), za, fx1, yb, zb, 'plasterIn', { color: upper, faces: { nx: null }, collide: false });
    B.collider([fx0, ya, za], [fx1, yb, zb], 'plaster');
  };
  // tinta externa: a face nx herda a cor de vértice — usamos uma segunda passada só externa
  const extSkin = (za, zb, ya, yb) => {
    if (zb - za < 0.01 || yb - ya < 0.01) return;
    B.box(fx0 - 0.005, ya, za, fx0, yb, zb, 'plaster', { color: tint, collide: false, faces: { px: null, py: null, ny: null, pz: null, nz: null } });
  };
  for (const o of ops) {
    if (o.kind === 'hole') continue;
    frontWall(z, o.z0, 0, R.h);
    extSkin(z, o.z0, 0, R.h);
    frontWall(o.z0, o.z1, o.y1, R.h);
    extSkin(o.z0, o.z1, o.y1, R.h);
    if (o.y0 > 0.01) {
      frontWall(o.z0, o.z1, 0, o.y0);
      extSkin(o.z0, o.z1, 0, o.y0);
    }
    z = o.z1;
  }
  frontWall(z, R.z1, 0, R.h);
  extSkin(z, R.z1, 0, R.h);

  // rombo de explosão: colunas de 0.2 m com borda irregular; bordas em tijolo
  {
    const hz0 = -8.6, hz1 = -5.6, cx = (hz0 + hz1) / 2, cy = 1.35;
    const n = Math.round((hz1 - hz0) / 0.15);
    for (let i = 0; i < n; i++) {
      const za = hz0 + (i / n) * (hz1 - hz0), zb = hz0 + ((i + 1) / n) * (hz1 - hz0);
      const t = ((za + zb) / 2 - cx) / ((hz1 - hz0) / 2); // -1..1
      const half = Math.sqrt(Math.max(0, 1 - t * t)) * 1.05 + rng.range(-0.18, 0.12);
      const yb = Math.max(F, cy - half - rng.range(0, 0.15));
      const yt = Math.min(R.h, cy + half * 1.05 + rng.range(-0.1, 0.15));
      const faces = { nx: null, px: 'plasterIn', py: 'brick', ny: 'brick', pz: 'brick', nz: 'brick' };
      if (yb > 0.02) {
        B.box(fx0, 0, za, fx1 + rng.range(-0.05, 0), yb, zb, 'plasterIn', { color: lower, faces, collide: false });
        B.collider([fx0, 0, za], [fx1, yb, zb], 'brick');
        extSkin(za, zb, 0, yb);
      }
      if (yt < R.h - 0.02) {
        B.box(fx0, yt, za, fx1, R.h, zb, 'plasterIn', { color: yt > DADO ? upper : lower, faces, collide: false });
        B.collider([fx0, yt, za], [fx1, R.h, zb], 'brick');
        extSkin(za, zb, yt, R.h);
      }
      if (rng.chance(0.35)) rebar(B, [fx0 + 0.15, yt, (za + zb) / 2], [rng.range(-1, 1), -1, rng.range(-0.3, 0.3)], rng.range(0.3, 0.7), rng);
    }
    // fuligem em volta do rombo (fora e dentro)
    decal(B, 'soot', [fx0 - 0.012, cy + 0.9, cx], 'nx', [4.2, 4.5]);
    decal(B, 'bullets', [fx0 - 0.013, 1.6, cx + 2.2], 'nx', [2.4, 2.4], [0, 0, 1, 1], 1.2);
    decal(B, 'cracks', [fx1 + 0.012, cy, cx], 'px', [4, 3.6], [0, 0, 1, 1], 0.4);
    // entulho dentro e fora
    rubblePile(W, fx1 + 1.1, cx, 1.4, 0.55, { n: 18, tint: lower });
    rubblePile(W, fx0 - 0.9, cx, 1.0, 0.35, { n: 10, collide: false });
    scatterBricks(W, fx1 + 2.2, cx, 2.2, 30, { y: F });
  }

  // caixilhos das janelas (quebradas) e porta arrombada
  for (const o of ops) {
    if (o.kind === 'window') {
      const ft = [0.92, 0.92, 0.9];
      B.box(fx0 + 0.08, o.y0, o.z0, fx0 + 0.16, o.y0 + 0.06, o.z1, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y1 - 0.06, o.z0, fx0 + 0.16, o.y1, o.z1, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y0, o.z0, fx0 + 0.16, o.y1, o.z0 + 0.06, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y0, o.z1 - 0.06, fx0 + 0.16, o.y1, o.z1, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y0, (o.z0 + o.z1) / 2 - 0.03, fx0 + 0.16, o.y1, (o.z0 + o.z1) / 2 + 0.03, 'wood', { color: ft, collide: false });
      // caco de vidro restante
      B.box(fx0 + 0.11, o.y1 - 0.5, o.z0 + 0.06, fx0 + 0.12, o.y1 - 0.06, o.z0 + 0.4, 'glass', { collide: false });
      // peitoril externo
      B.box(fx0 - 0.12, o.y0 - 0.07, o.z0 - 0.1, fx0 + 0.05, o.y0, o.z1 + 0.1, 'concrete', { color: [0.8, 0.78, 0.74], collide: false });
      // radiador sob a janela
      const rz = (o.z0 + o.z1) / 2;
      for (let k = 0; k < 9; k++) B.box(fx1 + 0.06, F + 0.15, rz - 0.6 + k * 0.14, fx1 + 0.16, F + 0.7, rz - 0.6 + k * 0.14 + 0.08, 'metal', { color: [0.85, 0.84, 0.8], collide: false });
      decal(B, 'streaks', [fx0 - 0.01, o.y0 - 1.0, rz], 'nx', [2.6, 2]);
    }
    if (o.kind === 'door') {
      // batente + folha arrombada caída para dentro
      const ft = [0.4, 0.3, 0.22];
      B.box(fx0, o.y1, o.z0 - 0.08, fx1 + 0.02, o.y1 + 0.1, o.z1 + 0.08, 'wood', { color: ft, collide: false });
      B.box(fx0, F, o.z0 - 0.08, fx1 + 0.02, o.y1, o.z0, 'wood', { color: ft, collide: false });
      B.box(fx0, F, o.z1, fx1 + 0.02, o.y1, o.z1 + 0.08, 'wood', { color: ft, collide: false });
      B.obox([fx1 + 0.9, F + 0.06, (o.z0 + o.z1) / 2 + 0.3], [2.1, 0.05, 0.85], [0, 0.25, 0.04], 'wood', { color: [0.5, 0.38, 0.28] });
    }
  }

  // ── fundo e laterais ──
  wall(ix1, iz0 - R.wall, R.x1, iz1 + R.wall, 0, R.h, 'nx', 'plaster');
  wall(R.x0, R.z0, R.x1, iz0, 0, R.h, 'pz', 'plaster');
  wall(R.x0, iz1, R.x1, R.z1, 0, R.h, 'nz', 'plaster');
  // rodapé
  B.box(ix0, F, iz0, ix1, F + 0.1, iz0 + 0.02, 'wood', { color: [0.35, 0.28, 0.2], collide: false });
  B.box(ix0, F, iz1 - 0.02, ix1, F + 0.1, iz1, 'wood', { color: [0.35, 0.28, 0.2], collide: false });
  B.box(ix1 - 0.02, F, iz0, ix1, F + 0.1, iz1, 'wood', { color: [0.35, 0.28, 0.2], collide: false });
  // pilar de concreto e viga
  B.box(17.2, F, -6.6, 17.6, R.h, -6.2, 'concrete', { color: [0.82, 0.8, 0.76] });
  B.box(ix0, R.h - 0.35, -6.6, ix1, R.h, -6.2, 'concrete', { color: [0.82, 0.8, 0.76], collide: false });

  // manchas e marcas nas paredes internas
  decal(B, 'cracks', [ix1 - 0.012, 2.2, -9], 'nx', [3, 2.4], [0, 0, 1, 1], 0.7);
  decal(B, 'streaks', [ix1 - 0.012, 2.4, -1], 'nx', [3, 1.6]);
  decal(B, 'bullets', [ix1 - 0.013, 1.4, -4.5], 'nx', [2.6, 2.2], [0, 0, 1, 1], 2.1);
  decal(B, 'graffiti', [ix1 - 0.014, 1.9, -11], 'nx', [2.4, 1.2], [0, 0.5, 0.5, 1]);
  decal(B, 'cracks', [15, 2.3, iz1 - 0.012], 'nz', [2.5, 2], [0, 0, 1, 1], 2.0);
  decal(B, 'soot', [20, 2.0, iz0 + 0.012], 'pz', [2.6, 2.8]);
  decal(B, 'posters', [13.5, 1.7, iz0 + 0.013], 'pz', [0.7, 0.7], [0.25, 0.5, 0.5, 1], 0.05);

  // ── mobília revirada ──
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  // mesa virada
  {
    const M = mat4([18.6, F + 0.38, -9.4], [Math.PI / 2 - 0.05, 0.6, 0]);
    B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [1.6, 0.05, 0.9])), { color: [0.55, 0.4, 0.28] });
    for (const a of [-0.7, 0.7]) for (const b of [-0.38, 0.38]) B.add(UNIT, 'wood', M.clone().multiply(mat4([a, 0.38, b], [0, 0, 0], [0.06, 0.72, 0.06])), { color: [0.45, 0.32, 0.22] });
    B.collider([17.8, F, -10.0], [19.4, F + 0.9, -8.8], 'wood');
  }
  // cadeiras
  for (const [cx, cz, yaw, fallen] of [[20.5, -7.5, 0.4, false], [15.2, -11.5, 2.2, true], [21.5, -11.8, -0.8, false]]) {
    const M = fallen ? mat4([cx, F + 0.22, cz], [Math.PI / 2, yaw, 0]) : mat4([cx, F, cz], [0, yaw, 0]);
    B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0.45, 0], [0, 0, 0], [0.45, 0.04, 0.45])), { color: [0.5, 0.36, 0.25] });
    B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0.75, -0.21], [0, 0, 0], [0.45, 0.6, 0.04])), { color: [0.5, 0.36, 0.25] });
    for (const a of [-0.2, 0.2]) for (const b of [-0.2, 0.2]) B.add(UNIT, 'wood', M.clone().multiply(mat4([a, 0.22, b], [0, 0, 0], [0.04, 0.45, 0.04])), { color: [0.42, 0.3, 0.2] });
  }
  // sofá contra o fundo
  {
    const t = [0.45, 0.3, 0.26];
    B.box(ix1 - 0.9, F, -2.2, ix1 - 0.05, F + 0.45, 0.3, 'fabric', { color: t });
    B.box(ix1 - 0.3, F + 0.45, -2.2, ix1 - 0.05, F + 0.95, 0.3, 'fabric', { color: t, collide: false });
    B.box(ix1 - 0.9, F + 0.45, -2.2, ix1 - 0.05, F + 0.65, -1.95, 'fabric', { color: t, collide: false });
    B.box(ix1 - 0.9, F + 0.45, 0.05, ix1 - 0.05, F + 0.65, 0.3, 'fabric', { color: t, collide: false });
    // almofada rasgada caída
    B.obox([ix1 - 1.6, F + 0.08, -0.9], [0.55, 0.14, 0.5], [0.1, 0.5, 0], 'fabric', { color: [0.5, 0.34, 0.3] });
  }
  // guarda-roupa / estante tombada no canto
  B.box(ix1 - 0.6, F, iz0 + 0.1, ix1 - 0.05, F + 2.1, iz0 + 1.3, 'wood', { color: [0.42, 0.3, 0.2] });
  B.obox([20.3, F + 0.3, iz1 - 0.6], [1.9, 0.6, 0.4], [0, 0.15, 0], 'wood', { color: [0.5, 0.36, 0.24], collide: true });
  // colchão no chão + tapete
  B.box(13.2, F, -13.5, 15.2, F + 0.18, -12.0, 'fabric', { color: [0.82, 0.78, 0.66] });
  B.obox([16.4, F + 0.006, -4.2], [3.4, 0.012, 2.4], 0.08, 'fabric', { color: [0.78, 0.36, 0.28] });
  B.obox([16.4, F + 0.013, -4.2], [3.0, 0.004, 2.0], 0.08, 'fabric', { color: [0.5, 0.2, 0.18] });
  decal(B, 'stains', [16.2, F + 0.016, -3.6], 'py', [2.4, 2.4], [0.5, 0, 1, 0.5], 0.3);
  // quadro torto na parede
  B.obox([ix1 - 0.03, 2.0, -7.6], [0.04, 0.6, 0.85], [0.08, 0, 0], 'wood', { color: [0.3, 0.22, 0.16] });
  B.obox([ix1 - 0.055, 2.0, -7.6], [0.01, 0.5, 0.75], [0.08, 0, 0], 'plasterIn', { color: [0.5, 0.6, 0.65] });

  // armário de metal tombado perto da porta, placa de forro caída, cabos
  {
    // armário de arquivo tombado: corpo + frentes de gaveta + puxadores
    const M = mat4([13.4, F + 0.24, -6.6], [0, 0.35, Math.PI / 2 - 0.04]);
    const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
    B.add(UNIT, 'metal', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [0.48, 1.3, 0.6])), { color: [0.55, 0.6, 0.55] });
    for (let k = 0; k < 4; k++) {
      B.add(UNIT, 'metal', M.clone().multiply(mat4([0, -0.48 + k * 0.32, 0.31], [0, 0, 0], [0.44, 0.28, 0.02])), { color: [0.6, 0.64, 0.58] });
      B.add(UNIT, 'chrome', M.clone().multiply(mat4([0, -0.42 + k * 0.32, 0.33], [0, 0, 0], [0.14, 0.03, 0.03])), { color: [0.5, 0.5, 0.5] });
    }
    B.collider([12.6, F, -7.4], [14.2, F + 0.5, -5.8], 'metal');
  }
  B.obox([15.6, F + 0.12, -8.6], [1.2, 0.03, 1.2], [0.22, 0.6, 0.1], 'plasterIn', { color: [0.9, 0.88, 0.84] });
  B.obox([19.8, F + 0.03, -3.0], [0.9, 0.02, 0.7], [0, 1.1, 0], 'plasterIn', { color: [0.85, 0.83, 0.8] });
  rubblePile(W, 20.5, -4.6, 0.9, 0.3, { n: 8, collide: false });
  for (let i = 0; i < 3; i++) rebar(B, [rng.range(14, 21), R.h - 0.02, rng.range(-12, 0)], [rng.range(-0.3, 0.3), -1, rng.range(-0.3, 0.3)], rng.range(0.3, 0.8), rng, 'cable');

  // posição de tiro: sacos de areia sob a janela norte e caixas de munição
  sandbagWall(W, [[fx1 + 0.45, -1.4], [fx1 + 0.45, 1.25]], 5);
  crate(W, 12.2, -2.2, 0.3, 0.75, { tint: [0.55, 0.6, 0.4], y: F });
  crate(W, 12.0, -1.9, 1.2, 0.6, { tint: [0.55, 0.6, 0.4], y: F + 0.45 });
  crate(W, 21.8, -12.6, 0.1, 0.9, { tint: [0.58, 0.62, 0.42], y: F });
  barrel(W, 22.6, 0.9, { tint: [0.3, 0.35, 0.25] });
  trash(W, 16, -6, 5.5, 46, F + 0.02);
  scatterBricks(W, 17, -9, 3, 18, { y: F });

  // lâmpada pendurada pelo fio (desligada) + fiação exposta no teto
  cylBetween(B, [16.5, R.h, -3.0], [16.5, R.h - 0.7, -3.0], 0.006, 'cable');
  cylinder(B, 16.5, R.h - 0.82, -3.0, 0.045, 0.12, 'plastic', { color: [0.3, 0.3, 0.3] });
  cable(B, [16.5, R.h - 0.02, -3.0], [ix1 - 0.05, R.h - 0.02, -5], 0.2, 0.008);
  cable(B, [ix0 + 0.1, 2.6, iz1 - 0.1], [ix1 - 0.1, 2.75, iz1 - 0.1], 0.35, 0.009);

  // chão: poeira de reboco, areia trazida da rua
  for (let i = 0; i < 9; i++) {
    decal(B, 'stains', [rng.range(ix0 + 1, ix1 - 1), F + 0.014 + i * 0.0003, rng.range(iz0 + 1, iz1 - 1)], 'py', [rng.range(2, 4), rng.range(2, 4)], [0, 0.5, 0.5, 1], rng.range(0, 6), [1.1, 1.05, 1]);
  }
  decal(B, 'stains', [fx1 + 1.2, F + 0.017, -4], 'py', [2.5, 2.2], [0, 0.5, 0.5, 1], 0.4, [1.2, 1.1, 1]);
  decal(B, 'stains', [ix1 - 1, F + 0.015, -9], 'py', [2.4, 3], [0, 0.5, 0.5, 1]);
  decal(B, 'stains', [12, F + 0.015, -8], 'py', [3, 3], [0, 0.5, 0.5, 1], 1);

  return { ix0, ix1, iz0, iz1 };
}
