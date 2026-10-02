/**
 * Interior jogável: térreo do prédio R4 (x ∈ [9.5, 23.5], z ∈ [-14, 2]).
 *
 * Sala de apartamento/loja ocupada como posição de tiro: parede pintada em
 * duas cores (barra a óleo embaixo, filete escuro), piso de ladrilho
 * hidráulico (shader W_FLOOR: peças faltando, trincas, poeira nos rodapés,
 * caminho gasto), teto de reboco caiado com infiltração e um trecho
 * despencado mostrando a laje e a malha de vergalhões, rombo de explosão
 * na fachada com luz entrando, janelas com sacos de areia, móveis
 * revirados, caixas e latas de munição, papéis e entulho.
 *
 * Paredes, piso e teto são PAINÉIS SUBDIVIDIDOS com oclusão ambiente
 * assada por vértice (cantos, rodapés, junção com o teto) — sem custo
 * em tempo de execução.
 *
 * Ponto de vista do preset `interior`: (17.2, 0.17, -4.3) olhando para -X.
 */
import * as THREE from 'three';
import { cylinder, cylBetween, cable, rebar, decal, contact } from './shapes.js';
import { rubblePile, scatterBricks, crate, ammoCan, radiator, sandbagWall, trash, barrel } from './props.js';
import { mat4, cached } from './geo.js';
import { graffitiRect } from './decals.js';

export const ROOM = { x0: 9.5, x1: 23.5, z0: -14, z1: 2, h: 3.2, floor: 0.17, wall: 0.3 };

export function buildInterior(W, tint) {
  const { B, rng } = W;
  const R = ROOM;
  const ix0 = R.x0 + R.wall, ix1 = R.x1 - R.wall, iz0 = R.z0 + R.wall, iz1 = R.z1 - R.wall;
  const lower = [0.47, 0.6, 0.55]; // barra verde-água a óleo
  const upper = [0.88, 0.84, 0.74];
  const F = R.floor;
  const DADO = F + 1.15;
  const CEIL = R.h;

  // ── AO assada: produto de termos por plano perpendicular próximo ──
  const occ = (d, a = 0.5, r = 0.32) => 1 - a * Math.exp(-Math.max(0, d) / r);
  const aoAt = (p, skip) => {
    let k = 1;
    if (skip !== 'x0') k *= occ(p.x - ix0);
    if (skip !== 'x1') k *= occ(ix1 - p.x);
    if (skip !== 'z0') k *= occ(p.z - iz0);
    if (skip !== 'z1') k *= occ(iz1 - p.z);
    if (skip !== 'f') k *= occ(p.y - F, 0.42, 0.28);
    if (skip !== 'c') k *= occ(CEIL - p.y, 0.5, 0.35);
    // viga central (z ≈ -6.4) escurece o teto em volta
    if (skip === 'c') k *= occ(Math.abs(p.z + 6.4) - 0.2, 0.35, 0.3);
    return k;
  };
  const tinted = (c, skip) => (p) => {
    const k = aoAt(p, skip);
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  const seg = (len, step = 0.25) => Math.max(2, Math.round(len / step));

  // ── piso (painel com AO) + base/colisor ──
  B.box(R.x0, -0.3, R.z0, R.x1, F - 0.002, R.z1, 'concrete', { color: [0.5, 0.48, 0.45], faces: { ny: null, py: null } });
  B.collider([R.x0, -0.3, R.z0], [R.x1, F, R.z1], 'tiles');
  B.panel([ix0 - 0.02, F, iz1], [ix1 - ix0 + 0.04, 0, 0], [0, 0, iz0 - iz1], seg(ix1 - ix0), seg(iz1 - iz0), 'tiles', { color: tinted([1, 1, 1], 'f') });

  // ── teto: laje grossa (sem vazamento de sol) + reboco caiado com AO ──
  B.box(R.x0 - 0.3, CEIL, R.z0 - 0.3, R.x1 + 0.3, CEIL + 0.4, R.z1 + 0.3, 'concrete', { collide: true, color: [0.7, 0.68, 0.64], faces: { ny: null } });
  B.proxy([R.x0 - 0.35, CEIL + 0.05, R.z0 - 0.35], [R.x1 + 0.35, CEIL + 1.2, R.z1 + 0.35], true);
  // trecho despencado (perto da janela norte): laje aparente + malha de vergalhões
  const hole = { x0: 11.6, x1: 14.4, z0: -2.6, z1: 0.4 };
  const ceilC = [0.84, 0.85, 0.86];
  const cpanel = (xa, xb, za, zb) => {
    if (xb - xa < 0.05 || zb - za < 0.05) return;
    B.panel([xa, CEIL - 0.001, za], [xb - xa, 0, 0], [0, 0, zb - za], seg(xb - xa), seg(zb - za), 'plasterIn', { color: tinted(ceilC, 'c') });
  };
  cpanel(ix0, ix1, iz0, hole.z0);
  cpanel(ix0, ix1, hole.z1, iz1);
  cpanel(ix0, hole.x0, hole.z0, hole.z1);
  cpanel(hole.x1, ix1, hole.z0, hole.z1);
  {
    // laje exposta, um pouco acima (sem o reboco), bordas do reboco quebradas
    B.panel([hole.x0, CEIL + 0.025, hole.z0], [hole.x1 - hole.x0, 0, 0], [0, 0, hole.z1 - hole.z0], 8, 8, 'concrete', { color: tinted([0.62, 0.6, 0.57], 'c') });
    for (const [a, b, c, d] of [[hole.x0, hole.x1, hole.z0, hole.z0 + 0.02], [hole.x0, hole.x1, hole.z1 - 0.02, hole.z1], [hole.x0, hole.x0 + 0.02, hole.z0, hole.z1], [hole.x1 - 0.02, hole.x1, hole.z0, hole.z1]]) {
      B.box(a, CEIL - 0.003, c, b, CEIL + 0.026, d, 'plasterIn', { collide: false, color: [0.75, 0.73, 0.69] });
    }
    // malha de vergalhões (alguns soltos pendendo)
    for (let x = hole.x0 + 0.15; x < hole.x1; x += 0.2) cylBetween(B, [x, CEIL + 0.02, hole.z0 + 0.05], [x, CEIL + 0.02, hole.z1 - 0.05], 0.006, 'metal', { seg: 4, color: [0.42, 0.28, 0.2] });
    for (let z = hole.z0 + 0.15; z < hole.z1; z += 0.2) cylBetween(B, [hole.x0 + 0.05, CEIL + 0.012, z], [hole.x1 - 0.05, CEIL + 0.012, z], 0.006, 'metal', { seg: 4, color: [0.42, 0.28, 0.2] });
    for (let i = 0; i < 4; i++) rebar(B, [rng.range(hole.x0 + 0.3, hole.x1 - 0.3), CEIL + 0.01, rng.range(hole.z0 + 0.3, hole.z1 - 0.3)], [rng.range(-0.4, 0.4), -1, rng.range(-0.4, 0.4)], rng.range(0.4, 0.9), rng);
    // placa de reboco pendurada pela tela
    B.obox([hole.x1 - 0.5, CEIL - 0.35, hole.z0 + 0.6], [0.9, 0.025, 0.7], [0.9, 0.3, 0.2], 'plasterIn', { color: [0.85, 0.83, 0.79] });
    // laje despencada: pendurada pela armadura na borda norte do buraco,
    // caída em diagonal para -z, ponta apoiada no monte de entulho
    {
      const th = 0.95, len = hole.z1 - hole.z0 - 0.1, wid = hole.x1 - hole.x0 - 0.12;
      const hz = hole.z1 - 0.05, cx = (hole.x0 + hole.x1) / 2;
      const c = [cx, CEIL - Math.sin(th) * len / 2, hz - Math.cos(th) * len / 2];
      // eixo longo em z, inclinado: rotação em torno de x
      B.obox(c, [wid, 0.16, len], [-th, 0, 0], 'concrete', { color: [0.7, 0.68, 0.64], collide: true });
      const n = [0, Math.cos(th), -Math.sin(th)]; // normal de baixo → (0, -cos, +sin)
      B.obox([c[0], c[1] - n[1] * 0.085, c[2] - n[2] * 0.085], [wid - 0.15, 0.012, len - 0.1], [-th, 0, 0], 'plasterIn', { color: ceilC.map((v) => v * 0.92) });
      const tip = [CEIL - Math.sin(th) * len, hz - Math.cos(th) * len];
      for (let xx = hole.x0 + 0.15; xx < hole.x1 - 0.1; xx += 0.2) {
        cylBetween(B, [xx, CEIL + 0.02, hole.z1 + 0.05], [xx + rng.range(-0.03, 0.03), CEIL - 0.14, hz - 0.08], 0.006, 'metal', { seg: 4, color: [0.42, 0.28, 0.2] });
        if (rng.chance(0.7)) rebar(B, [xx, tip[0], tip[1]], [rng.range(-0.3, 0.3), -Math.sin(th) + rng.range(-0.2, 0.4), -Math.cos(th) + rng.range(-0.3, 0.3)], rng.range(0.15, 0.5), rng);
      }
      rubblePile(W, cx + 0.2, tip[1] - 0.2, 1.5, 0.65, { y: F - 0.03, tint: [0.95, 0.94, 0.92], brick: 0.2, big: 0.8, density: 1.0 });
    }
  }
  // nervuras da laje (vigas secundárias de concreto aparente, perpendiculares
  // à viga central): relevo real no teto, AO nas junções, quebra a planura
  for (const rx of [12.1, 14.75, 19.9, 22.15]) {
    const segs = rx > hole.x0 - 0.2 && rx < hole.x1 + 0.2 ? [[iz0, hole.z0 - 0.05], [hole.z1 + 0.05, iz1]] : [[iz0, iz1]];
    for (const [za, zb] of segs) {
      if (zb - za < 0.3) continue;
      B.box(rx - 0.16, CEIL - 0.3, za, rx + 0.16, CEIL - 0.001, zb, 'plasterIn', { collide: false, color: (p) => {
        const k = 0.72 + 0.28 * Math.min(1, (CEIL - p.y) / 0.3);
        return [0.8 * k, 0.8 * k, 0.79 * k];
      }, faces: { py: null } });
      // reboco caído na aresta: concreto e estribo aparentes num trecho
      if (zb - za > 3) {
        const zc = za + (zb - za) * (0.3 + 0.4 * rng.next());
        B.box(rx - 0.165, CEIL - 0.305, zc - 0.35, rx + 0.165, CEIL - 0.27, zc + 0.35, 'concrete', { collide: false, color: [0.55, 0.53, 0.5] });
        for (const s of [-1, 1]) cylBetween(B, [rx + s * 0.1, CEIL - 0.31, zc - 0.33], [rx + s * 0.1, CEIL - 0.31, zc + 0.33], 0.007, 'metal', { seg: 4, color: [0.4, 0.26, 0.18] });
      }
    }
  }
  // infiltração e fuligem no teto
  decal(B, 'stains', [17, CEIL - 0.01, -9.5], 'ny', [3.5, 3], [0, 0, 0.5, 0.5], 0.4, [0.75, 0.62, 0.45]);
  decal(B, 'stains', [20.5, CEIL - 0.011, -2], 'ny', [2.5, 2.8], [0, 0.5, 0.5, 1], 1.1, [0.8, 0.66, 0.48]);
  decal(B, 'cracks', [16, CEIL - 0.012, -4], 'ny', [3, 3], [0, 0, 1, 1], 0.7);
  decal(B, 'soot', [11.2, CEIL - 0.013, -7.1], 'ny', [3.4, 3.2]);

  /** Parede interna em painéis: barra embaixo, filete, tinta clara em cima. */
  const wallPanel = (o, u, nrm, skip) => {
    // o = canto inferior (no piso), u = vetor ao longo da parede
    const len = Math.hypot(u[0], u[2]);
    B.panel([o[0], F, o[2]], u, [0, DADO - F, 0], seg(len), 5, 'plasterIn', { color: tinted(lower, skip) });
    B.panel([o[0], DADO, o[2]], u, [0, CEIL - DADO, 0], seg(len), 8, 'plasterIn', { color: tinted(upper, skip) });
    // filete escuro da pintura e rodapé
    const e = [o[0] + nrm[0] * 0.004, DADO, o[2] + nrm[2] * 0.004];
    B.panel([e[0], DADO - 0.015, e[2]], u, [0, 0.03, 0], seg(len, 1), 1, 'plasterIn', { color: [0.18, 0.22, 0.2] });
    const rb = [o[0] + nrm[0] * 0.02, F, o[2] + nrm[2] * 0.02];
    B.panel(rb, u, [0, 0.1, 0], seg(len, 1), 1, 'wood', { color: [0.3, 0.24, 0.18] });
    B.panel([rb[0], F + 0.1, rb[2]], u, [-nrm[0] * 0.02, 0, -nrm[2] * 0.02], seg(len, 1), 1, 'wood', { color: [0.3, 0.24, 0.18] });
  };
  // fundo (x = ix1, voltada para -x), laterais (z = iz0 voltada +z; z = iz1 voltada -z)
  wallPanel([ix1, 0, iz0], [0, 0, iz1 - iz0], [-1, 0, 0], 'x1');
  wallPanel([ix0, 0, iz0], [ix1 - ix0, 0, 0], [0, 0, 1], 'z0');
  wallPanel([ix1, 0, iz1], [ix0 - ix1, 0, 0], [0, 0, -1], 'z1');
  // massa das paredes (lado externo com a tinta do prédio) + colisores
  B.box(ix1, 0, R.z0, R.x1, CEIL, R.z1, 'plaster', { collide: false, color: tint, faces: { nx: null } });
  B.box(R.x0, 0, R.z0, ix1, CEIL, iz0, 'plaster', { collide: false, color: tint, faces: { pz: null } });
  B.box(R.x0, 0, iz1, ix1, CEIL, R.z1, 'plaster', { collide: false, color: tint, faces: { nz: null } });
  B.collider([ix1, 0, R.z0], [R.x1, CEIL, R.z1], 'plaster');
  B.collider([R.x0, 0, R.z0], [R.x1, CEIL, iz0], 'plaster');
  B.collider([R.x0, 0, iz1], [R.x1, CEIL, R.z1], 'plaster');

  // ── parede da frente (x = 9.5…9.8) com janelas, rombo e porta ──
  const fx0 = R.x0, fx1 = R.x0 + R.wall;
  const ops = [
    { z0: -11.2, z1: -9.0, y0: F + 0.85, y1: 2.45, kind: 'window' },
    { z0: -8.6, z1: -5.6, kind: 'hole' },
    { z0: -4.8, z1: -3.2, y0: F, y1: 2.35, kind: 'door' },
    { z0: -1.2, z1: 1.0, y0: F + 0.85, y1: 2.45, kind: 'window' },
  ];
  // face interna em duas cores com AO vertical (rodapé e junção com o teto)
  const frontWall = (za, zb, ya, yb) => {
    if (zb - za < 0.01 || yb - ya < 0.01) return;
    const lo = (y) => tinted(lower, 'x0')({ x: fx1, y, z: (za + zb) / 2 });
    if (ya < DADO) B.box(fx0, ya, za, fx1, Math.min(yb, DADO), zb, 'plasterIn', { color: (p) => (p.x > fx1 - 0.01 ? lo(p.y) : lower), faces: { nx: null }, collide: false });
    if (yb > DADO) B.box(fx0, Math.max(ya, DADO), za, fx1, yb, zb, 'plasterIn', { color: (p) => (p.x > fx1 - 0.01 ? tinted(upper, 'x0')({ x: fx1, y: p.y, z: p.z }) : upper), faces: { nx: null }, collide: false });
    B.collider([fx0, ya, za], [fx1, yb, zb], 'plaster');
  };
  // tinta externa (face da rua)
  const extSkin = (za, zb, ya, yb) => {
    if (zb - za < 0.01 || yb - ya < 0.01) return;
    B.box(fx0 - 0.005, ya, za, fx0, yb, zb, 'plaster', { color: tint, collide: false, faces: { px: null, py: null, ny: null, pz: null, nz: null } });
  };
  let z = iz0 - R.wall;
  for (const o of ops) {
    frontWall(z, o.z0, 0, CEIL);
    extSkin(z, o.z0, 0, CEIL);
    if (o.kind !== 'hole') {
      frontWall(o.z0, o.z1, o.y1, CEIL);
      extSkin(o.z0, o.z1, o.y1, CEIL);
      if (o.y0 > 0.01) {
        frontWall(o.z0, o.z1, 0, o.y0);
        extSkin(o.z0, o.z1, 0, o.y0);
      }
    }
    z = o.z1;
  }
  frontWall(z, R.z1, 0, CEIL);
  extSkin(z, R.z1, 0, CEIL);

  // rombo de explosão: colunas de 0.15 m com borda irregular; quebra em tijolo
  {
    const hz0 = -8.6, hz1 = -5.6, cx = (hz0 + hz1) / 2, cy = 1.35;
    const n = Math.round((hz1 - hz0) / 0.15);
    for (let i = 0; i < n; i++) {
      const za = hz0 + (i / n) * (hz1 - hz0), zb = hz0 + ((i + 1) / n) * (hz1 - hz0);
      const t = ((za + zb) / 2 - cx) / ((hz1 - hz0) / 2); // -1..1
      const half = Math.sqrt(Math.max(0, 1 - t * t)) * 1.05 + rng.range(-0.18, 0.12);
      const yb = Math.max(F, cy - half - rng.range(0, 0.15));
      const yt = Math.min(CEIL, cy + half * 1.05 + rng.range(-0.1, 0.15));
      const faces = { nx: null, px: 'plasterIn', py: 'brick', ny: 'brick', pz: 'brick', nz: 'brick' };
      const dz = rng.range(-0.06, 0);
      if (yb > 0.02) {
        B.box(fx0, 0, za, fx1 + dz, yb, zb, 'plasterIn', { color: lower, faces, collide: false });
        B.collider([fx0, 0, za], [fx1, yb, zb], 'brick');
        extSkin(za, zb, 0, yb);
      }
      if (yt < CEIL - 0.02) {
        B.box(fx0, yt, za, fx1 + dz, CEIL, zb, 'plasterIn', { color: yt > DADO ? upper : lower, faces, collide: false });
        B.collider([fx0, yt, za], [fx1, CEIL, zb], 'brick');
        extSkin(za, zb, yt, CEIL);
      }
      if (rng.chance(0.4)) rebar(B, [fx0 + 0.15, yt, (za + zb) / 2], [rng.range(-1, 1), -1, rng.range(-0.3, 0.3)], rng.range(0.3, 0.7), rng);
    }
    // fuligem e lascas em volta do rombo (fora e dentro)
    decal(B, 'scorch', [fx0 - 0.012, cy + 0.4, cx], 'nx', [5, 4.6], [0, 0, 1, 1], 0.6);
    decal(B, 'bullets', [fx0 - 0.013, 1.6, cx + 2.2], 'nx', [2.0, 2.0], [0, 0, 1, 1], 1.2);
    decal(B, 'chips', [fx1 + 0.012, cy + 0.3, cx - 1.9], 'px', [1.4, 1.1], [0, 0, 0.5, 0.5], 0.4);
    decal(B, 'chips', [fx1 + 0.0125, cy - 0.2, cx + 1.9], 'px', [1.2, 1.0], [0.5, 0.5, 1, 1], 2.4);
    decal(B, 'soot', [fx1 + 0.013, cy + 1.2, cx], 'px', [3.6, 3.4]);
    // entulho dentro e fora
    rubblePile(W, fx1 + 1.0, cx, 1.5, 0.6, { y: F - 0.05, tint: lower, brick: 0.7 });
    rubblePile(W, fx0 - 0.9, cx, 1.1, 0.4, { y: 0.1, collide: false, brick: 0.7 });
    scatterBricks(W, fx1 + 2.4, cx, 2.0, 30, { y: F, brick: 0.6 });
  }

  // caixilhos das janelas (quebradas), radiadores e porta arrombada
  for (const o of ops) {
    if (o.kind === 'window') {
      const ft = [0.88, 0.88, 0.85];
      B.box(fx0 + 0.08, o.y0, o.z0, fx0 + 0.16, o.y0 + 0.06, o.z1, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y1 - 0.06, o.z0, fx0 + 0.16, o.y1, o.z1, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y0, o.z0, fx0 + 0.16, o.y1, o.z0 + 0.06, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y0, o.z1 - 0.06, fx0 + 0.16, o.y1, o.z1, 'wood', { color: ft, collide: false });
      B.box(fx0 + 0.08, o.y0, (o.z0 + o.z1) / 2 - 0.03, fx0 + 0.16, o.y1, (o.z0 + o.z1) / 2 + 0.03, 'wood', { color: ft, collide: false });
      // cacos restantes
      B.box(fx0 + 0.11, o.y1 - 0.5, o.z0 + 0.06, fx0 + 0.12, o.y1 - 0.06, o.z0 + 0.4, 'glass', { collide: false });
      B.box(fx0 + 0.11, o.y0 + 0.06, o.z1 - 0.35, fx0 + 0.12, o.y0 + 0.3, o.z1 - 0.06, 'glass', { collide: false });
      // peitoril interno de madeira e externo de concreto
      B.box(fx1 - 0.02, o.y0 - 0.04, o.z0 - 0.08, fx1 + 0.12, o.y0, o.z1 + 0.08, 'wood', { color: [0.86, 0.84, 0.8], collide: false });
      B.box(fx0 - 0.12, o.y0 - 0.07, o.z0 - 0.1, fx0 + 0.05, o.y0, o.z1 + 0.1, 'concrete', { color: [0.8, 0.78, 0.74], collide: false });
      const rz = (o.z0 + o.z1) / 2;
      radiator(W, [fx1 + 0.1, rz - 0.62], [fx1 + 0.1, rz + 0.62], F + 0.08, [1, 0], { n: 10 });
      decal(B, 'streaks', [fx0 - 0.01, o.y0 - 1.0, rz], 'nx', [2.6, 2]);
      // marca de calor/sujeira acima do radiador
      decal(B, 'soot', [fx1 + 0.011, o.y0 + 0.5, rz], 'px', [1.6, 1.4]);
    }
    if (o.kind === 'door') {
      const ft = [0.4, 0.3, 0.22];
      B.box(fx0, o.y1, o.z0 - 0.08, fx1 + 0.02, o.y1 + 0.1, o.z1 + 0.08, 'wood', { color: ft, collide: false });
      B.box(fx0, F, o.z0 - 0.08, fx1 + 0.02, o.y1, o.z0, 'wood', { color: ft, collide: false });
      B.box(fx0, F, o.z1, fx1 + 0.02, o.y1, o.z1 + 0.08, 'wood', { color: ft, collide: false });
      // folha arrombada caída para dentro (almofadas + maçaneta)
      const M = mat4([fx1 + 0.9, F + 0.06, (o.z0 + o.z1) / 2 + 0.3], [0, 0.25, 0.04]);
      const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
      B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [2.05, 0.05, 0.84])), { color: [0.5, 0.38, 0.28] });
      for (const a of [-0.5, 0.5]) B.add(UNIT, 'wood', M.clone().multiply(mat4([a, 0.03, 0], [0, 0, 0], [0.8, 0.02, 0.6])), { color: [0.44, 0.33, 0.24] });
      B.add(UNIT, 'chrome', M.clone().multiply(mat4([0.1, 0.05, 0.32], [0, 0, 0], [0.12, 0.03, 0.03])), { color: [0.6, 0.55, 0.45] });
      B.collider([fx1 - 0.2, F, o.z0], [fx1 + 2.0, F + 0.12, o.z1 + 0.6], 'wood');
    }
  }

  // pilar de concreto e viga (com lascas nas arestas)
  B.box(17.2, F, -6.6, 17.6, CEIL, -6.2, 'concrete', { color: [0.8, 0.78, 0.74], ao: [F, F + 0.6, 0.6] });
  contact(B, 17.4, F, -6.4, 1.1, 1.1, 0, 1);
  B.box(ix0, CEIL - 0.35, -6.6, ix1, CEIL, -6.2, 'concrete', { color: [0.8, 0.78, 0.74], collide: false });
  decal(B, 'chips', [17.4, 1.2, -6.6 - 0.011], 'nz', [0.5, 0.7], [0, 0.5, 0.5, 1], 0.3);
  decal(B, 'bullets', [17.4, 1.5, -6.2 + 0.011], 'pz', [0.45, 0.9], [0.2, 0.2, 0.5, 0.8], 0);

  // manchas e marcas nas paredes internas
  decal(B, 'cracks', [ix1 - 0.012, 2.2, -9], 'nx', [3, 2.4], [0, 0, 1, 1], 0.7);
  decal(B, 'streaks', [ix1 - 0.012, 2.4, -1], 'nx', [3, 1.6]);
  decal(B, 'bullets', [ix1 - 0.013, 1.4, -4.5], 'nx', [2.0, 1.8], [0, 0, 1, 1], 2.1);
  decal(B, 'graffiti', [ix1 - 0.014, 1.9, -11], 'nx', [2.0, 1.0], graffitiRect(2));
  decal(B, 'graffiti', [12.5, 1.75, iz0 + 0.014], 'pz', [1.6, 0.8], graffitiRect(10), 0.05);
  decal(B, 'cracks', [15, 2.3, iz1 - 0.012], 'nz', [2.5, 2], [0, 0, 1, 1], 2.0);
  decal(B, 'chips', [19.5, 0.9, iz1 - 0.0125], 'nz', [1.2, 0.8], [0.5, 0, 1, 0.5], 0.2);
  decal(B, 'soot', [20, 2.0, iz0 + 0.012], 'pz', [2.6, 2.8]);
  decal(B, 'posters', [13.5, 1.7, iz0 + 0.013], 'pz', [0.7, 0.7], [0.25, 0.5, 0.5, 1], 0.05);
  // marcas de mobília removida (tinta mais clara) e escorrido de infiltração
  decal(B, 'streaks', [ix1 - 0.011, 2.95, -6.0], 'nx', [1.8, 2.4]);

  // ── mobília revirada ──
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  // mesa virada (barricada improvisada)
  {
    const M = mat4([18.6, F + 0.38, -9.4], [Math.PI / 2 - 0.05, 0.6, 0]);
    B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [1.6, 0.05, 0.9])), { color: [0.55, 0.4, 0.28] });
    for (const a of [-0.7, 0.7]) for (const b of [-0.38, 0.38]) B.add(UNIT, 'wood', M.clone().multiply(mat4([a, 0.38, b], [0, 0, 0], [0.06, 0.72, 0.06])), { color: [0.45, 0.32, 0.22] });
    B.collider([17.8, F, -10.0], [19.4, F + 0.9, -8.8], 'wood');
    contact(B, 18.6, F, -9.4, 1.9, 1.0, 0.6, 2);
  }
  // cadeiras
  for (const [cx, cz, yaw, fallen] of [[20.5, -7.5, 0.4, false], [15.2, -11.5, 2.2, true], [21.5, -11.8, -0.8, false]]) {
    const M = fallen ? mat4([cx, F + 0.22, cz], [Math.PI / 2, yaw, 0]) : mat4([cx, F, cz], [0, yaw, 0]);
    B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0.45, 0], [0, 0, 0], [0.45, 0.04, 0.45])), { color: [0.5, 0.36, 0.25] });
    B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0.75, -0.21], [0, 0, 0], [0.45, 0.6, 0.04])), { color: [0.5, 0.36, 0.25] });
    for (const a of [-0.2, 0.2]) for (const b of [-0.2, 0.2]) B.add(UNIT, 'wood', M.clone().multiply(mat4([a, 0.22, b], [0, 0, 0], [0.04, 0.45, 0.04])), { color: [0.42, 0.3, 0.2] });
    contact(B, cx, F, cz, 0.75, 0.75, yaw, 1);
  }
  // sofá contra o fundo (assento afundado, braços arredondados)
  {
    const t = [0.42, 0.28, 0.24];
    B.box(ix1 - 0.9, F, -2.2, ix1 - 0.05, F + 0.42, 0.3, 'fabric', { color: t, ao: [F, F + 0.3, 0.6] });
    B.box(ix1 - 0.3, F + 0.42, -2.2, ix1 - 0.05, F + 0.95, 0.3, 'fabric', { color: t, collide: false });
    for (const zz of [-2.2, 0.05]) B.box(ix1 - 0.9, F + 0.42, zz, ix1 - 0.05, F + 0.66, zz + 0.25, 'fabric', { color: t.map((c) => c * 0.92), collide: false });
    B.obox([ix1 - 0.6, F + 0.47, -1.35], [0.6, 0.1, 1.0], [0.05, 0, 0.08], 'fabric', { color: t.map((c) => c * 1.08) });
    B.obox([ix1 - 1.6, F + 0.08, -0.9], [0.55, 0.14, 0.5], [0.1, 0.5, 0], 'fabric', { color: [0.5, 0.34, 0.3] });
    contact(B, ix1 - 0.48, F, -0.95, 1.25, 2.9, 0, 2);
  }
  // armário no canto e estante tombada
  B.box(ix1 - 0.6, F, iz0 + 0.1, ix1 - 0.05, F + 2.1, iz0 + 1.3, 'wood', { color: [0.42, 0.3, 0.2], ao: [F, F + 0.5, 0.6] });
  B.box(ix1 - 0.61, F + 0.15, iz0 + 0.69, ix1 - 0.6, F + 1.95, iz0 + 0.71, 'black', { collide: false });
  B.obox([20.3, F + 0.3, iz1 - 0.6], [1.9, 0.6, 0.4], [0, 0.15, 0], 'wood', { color: [0.5, 0.36, 0.24], collide: true });
  contact(B, ix1 - 0.33, F, iz0 + 0.7, 0.9, 1.6, 0, 2);
  contact(B, 20.3, F, iz1 - 0.6, 2.3, 0.8, 0.15, 2);
  // colchão no chão + tapete
  B.box(13.2, F, -13.5, 15.2, F + 0.18, -12.0, 'fabric', { color: [0.82, 0.78, 0.66] });
  contact(B, 14.2, F, -12.75, 2.3, 1.8, 0, 1);
  B.obox([14.6, F + 0.006, -9.6], [2.6, 0.012, 1.8], 0.38, 'fabric', { color: [0.72, 0.3, 0.22] });
  B.obox([14.6, F + 0.013, -9.6], [2.2, 0.004, 1.4], 0.38, 'fabric', { color: [0.5, 0.2, 0.16] });
  decal(B, 'stains', [14.4, F + 0.016, -9.2], 'py', [2.0, 2.0], [0.5, 0, 1, 0.5], 0.3);
  // quadro torto na parede
  B.obox([ix1 - 0.03, 2.0, -7.6], [0.04, 0.6, 0.85], [0.08, 0, 0], 'wood', { color: [0.3, 0.22, 0.16] });
  B.obox([ix1 - 0.055, 2.0, -7.6], [0.01, 0.5, 0.75], [0.08, 0, 0], 'plasterIn', { color: [0.5, 0.6, 0.65] });

  // armário de arquivo tombado perto da porta
  {
    const M = mat4([13.4, F + 0.24, -6.6], [0, 0.35, Math.PI / 2 - 0.04]);
    B.add(UNIT, 'metal', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [0.48, 1.3, 0.6])), { color: [0.33, 0.37, 0.33], uvRand: true });
    for (let k = 0; k < 4; k++) {
      B.add(UNIT, 'metal', M.clone().multiply(mat4([0, -0.48 + k * 0.32, 0.31], [0, 0, 0], [0.44, 0.28, 0.02])), { color: [0.38, 0.42, 0.37], uvRand: true });
      B.add(UNIT, 'chrome', M.clone().multiply(mat4([0, -0.42 + k * 0.32, 0.33], [0, 0, 0], [0.14, 0.03, 0.03])), { color: [0.5, 0.5, 0.5] });
    }
    B.collider([12.6, F, -7.4], [14.2, F + 0.5, -5.8], 'metal');
    contact(B, 13.4, F, -6.6, 1.6, 0.85, 0.35, 2);
  }
  // placas de forro caídas, entulho
  B.obox([15.6, F + 0.12, -8.6], [1.2, 0.03, 1.2], [0.22, 0.6, 0.1], 'plasterIn', { color: [0.9, 0.88, 0.84] });
  B.obox([19.8, F + 0.03, -3.0], [0.9, 0.02, 0.7], [0, 1.1, 0], 'plasterIn', { color: [0.85, 0.83, 0.8] });
  rubblePile(W, 20.5, -4.6, 0.8, 0.22, { y: F, collide: false, big: 0.5 });
  for (let i = 0; i < 3; i++) rebar(B, [rng.range(14, 21), CEIL - 0.02, rng.range(-12, 0)], [rng.range(-0.3, 0.3), -1, rng.range(-0.3, 0.3)], rng.range(0.3, 0.8), rng, 'cable');

  // posição de tiro: sacos de areia sob a janela norte, caixas e latas de munição
  sandbagWall(W, [[fx1 + 0.45, -1.4], [fx1 + 0.45, 1.25]], 5, { y: F });
  crate(W, 12.3, -2.25, 0.3, 0.95, { y: F });
  crate(W, 12.1, -2.0, 1.25, 0.8, { y: F + 0.475 });
  crate(W, 21.8, -12.6, 0.1, 1.0, { y: F });
  crate(W, 21.6, -11.6, -0.25, 0.9, { y: F });
  ammoCan(W, 11.7, F, -3.0, 0.4);
  ammoCan(W, 11.95, F, -3.3, 1.2);
  ammoCan(W, 12.4, F + 0.95, -2.3, 0.1);
  barrel(W, 22.6, 0.9, { tint: [0.3, 0.35, 0.25], y: F });
  // cartuchos deflagrados junto da posição de tiro (instanciados)
  for (let i = 0; i < 60; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * 1.1;
    W.I.add('casing', cached('casing', () => new THREE.CylinderGeometry(0.005, 0.0055, 0.039, 6)), 'chrome', mat4([11.4 + Math.cos(a) * d, F + 0.006, -0.2 + Math.sin(a) * d], [Math.PI / 2, rng.range(0, 6), 0]), [0.85, 0.62, 0.3], { shadow: false });
  }
  trash(W, 16, -6, 5.5, 46, F + 0.02);
  scatterBricks(W, 17, -9, 3, 18, { y: F });

  // lâmpada pendurada pelo fio (desligada), luminária tubular pendendo de uma corrente
  cylBetween(B, [16.5, CEIL, -3.0], [16.5, CEIL - 0.7, -3.0], 0.006, 'cable');
  cylinder(B, 16.5, CEIL - 0.82, -3.0, 0.045, 0.12, 'plastic', { color: [0.3, 0.3, 0.3] });
  {
    const a = [19.0, CEIL - 0.02, -10.0], b = [20.4, CEIL - 0.95, -10.3];
    cylBetween(B, [a[0], a[1], a[2]], [a[0] + 0.05, a[1] - 0.25, a[2]], 0.004, 'metal', { color: [0.3, 0.3, 0.3] });
    cylBetween(B, [a[0] + 0.05, a[1] - 0.25, a[2]], b, 0.05, 'metal', { seg: 8, color: [0.85, 0.85, 0.82] });
    cylBetween(B, [a[0] + 0.07, a[1] - 0.29, a[2] + 0.02], [b[0] + 0.02, b[1] - 0.04, b[2] + 0.02], 0.022, 'glass', { seg: 8, color: [1.2, 1.2, 1.15] });
  }
  cable(B, [16.5, CEIL - 0.02, -3.0], [ix1 - 0.05, CEIL - 0.02, -5], 0.2, 0.008);
  cable(B, [ix0 + 0.1, 2.6, iz1 - 0.1], [ix1 - 0.1, 2.75, iz1 - 0.1], 0.35, 0.009);
  // eletroduto aparente no teto até a caixa de luz
  cylBetween(B, [ix0 + 0.4, CEIL - 0.03, -12.5], [ix0 + 0.4, CEIL - 0.03, 1.2], 0.012, 'plastic', { seg: 6, color: [0.85, 0.85, 0.82] });
  B.box(ix0 + 0.33, CEIL - 0.07, -6.5, ix0 + 0.47, CEIL, -6.36, 'plastic', { collide: false, color: [0.8, 0.8, 0.78] });

  // chão: poeira de reboco, areia trazida da rua, papéis
  for (let i = 0; i < 9; i++) {
    decal(B, 'stains', [rng.range(ix0 + 1, ix1 - 1), F + 0.014 + i * 0.0003, rng.range(iz0 + 1, iz1 - 1)], 'py', [rng.range(2, 4), rng.range(2, 4)], [0, 0.5, 0.5, 1], rng.range(0, 6), [1.1, 1.05, 1]);
  }
  decal(B, 'stains', [fx1 + 1.2, F + 0.017, -4], 'py', [2.5, 2.2], [0, 0.5, 0.5, 1], 0.4, [1.2, 1.1, 1]);
  decal(B, 'stains', [fx1 + 1.6, F + 0.0175, -7.1], 'py', [3.5, 3.0], [0, 0.5, 0.5, 1], 1.4, [1.25, 1.15, 1.0]);
  decal(B, 'stains', [ix1 - 1, F + 0.015, -9], 'py', [2.4, 3], [0, 0.5, 0.5, 1]);
  decal(B, 'stains', [12, F + 0.015, -8], 'py', [3, 3], [0, 0.5, 0.5, 1], 1);

  return { ix0, ix1, iz0, iz1 };
}
