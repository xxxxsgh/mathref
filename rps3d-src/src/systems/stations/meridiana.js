// Estação Meridiana — megaestrutura da Guilda dos Mercadores em órbita de
// Verídia. Eixo da estação = Y local (espinha de ~1,2 km):
//
//   y  640  mastro de comunicação (farol)
//   y  452–560  torre de controle (vidro do controle de tráfego)
//   y  388–452  DISCO DE ATRACAÇÃO: 4 hangares abrindo para fora (64×26×80 m)
//   y  300–388  núcleo superior com faixas de janelas
//   y   60–300  treliça com dois anéis de tanques esféricos
//   y  -60– 60  cubo do anel (rolamentos)
//   y    0      ANEL HABITACIONAL girando (R 540 m) com 6 raios
//   y -120–-420 módulo industrial: radiadores e asas solares
//   y -420–-560 reator e bocais de manobra
//
// Hangar i: eixo radial a i·90° no plano XZ, piso em y = 392, boca em r = 130.
import * as THREE from 'three/webgpu';
import { Kit, V3, mat } from './geo.js';
import { ZONE as Z } from './materials.js';
import { greebleRect, tankRing, dish, mast, radiator, solarWing, nozzle, lightRing, dockMouth, portholes } from './modules.js';

const TAU = Math.PI * 2;
export const MERIDIANA = {
  hubY0: 388, hubY1: 452, hubR: 130, floorY: 392,
  bay: { w: 64, h: 26, d: 80, rIn: 50, rOut: 130 },
  ringR: 540, ringW: 62, ringH: 74,
  radius: 760,
};

/** Base (lado, cima, fora) do hangar i no referencial da estação. */
export function bayBasis(i) {
  const a = i * Math.PI / 2;
  const out = V3(Math.sin(a), 0, Math.cos(a));
  const up = V3(0, 1, 0);
  const side = V3().crossVectors(up, out).normalize();
  return { out, up, side, a };
}

export function buildMeridiana(seed = 4711, { lite = false } = {}) {
  const K = { main: new Kit(seed), ring: new Kit(seed + 1), hub: new Kit(seed + 2) };
  const M = MERIDIANA;
  spine(K.main, lite);
  habitatRing(K.ring, lite);
  hub(K.hub, lite);
  return { kits: K, info: M };
}

// ─── espinha ──────────────────────────────────────────────────────────────
function spine(k, lite) {
  const L = 'hull';
  // reator / popa
  k.lathe(L, [[8, -560], [30, -556], [52, -540], [64, -515], [66, -470], [58, -440], [40, -425], [36, -420]], V3(), Z.PAINT, 48);
  k.torus(L, 60, 3.2, V3(0, -480, 0), Z.GLOW, 96, 8);
  k.torus(L, 66.5, 1.6, V3(0, -500, 0), Z.DARK, 96, 6);
  k.torus(L, 66.5, 1.6, V3(0, -460, 0), Z.DARK, 96, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26;
    nozzle(k, L, V3(Math.sin(a) * 34, -556, Math.cos(a) * 34), V3(0, -1, 0), 9, L);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    k.box(L, 6, 40, 10, V3(Math.sin(a) * 64, -495, Math.cos(a) * 64), [0, a, 0], Z.DARK);
  }
  lightRing(k, -442, 59, 16, [8, 8, 8], 0.7, 0.6);
  // módulo industrial
  k.cyl(L, 34, 34, 300, V3(0, -270, 0), null, Z.PAINT, 48);
  for (let y = -410; y <= -130; y += 20) k.torus(L, 34.6, 1.2, V3(0, y, 0), Z.DARK, 64, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const n = V3(Math.sin(a), 0, Math.cos(a));
    const u = V3(0, 1, 0), uu = V3().crossVectors(u, n);
    greebleRect(k, L, n.clone().multiplyScalar(34).setY(-330), uu, u, n, 24, 160, 0.05, 1.2);
    k.box(L, 7, 280, 3, n.clone().multiplyScalar(35.5).setY(-270), [0, a, 0], i % 2 ? Z.ACCENT : Z.DARK);
  }
  // radiadores
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const out = V3(Math.sin(a), 0, Math.cos(a));
    radiator(k, L, out.clone().multiplyScalar(34).setY(-200), out, V3(0, 1, 0), lite ? 120 : 150, 44);
  }
  // asas solares
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const out = V3(Math.sin(a), 0, Math.cos(a));
    solarWing(k, L, out.clone().multiplyScalar(34).setY(-380), out, V3(0, 1, 0).applyAxisAngle(out, 0.35), 330, 44, lite ? 4 : 7);
  }
  // cubo do anel
  k.cyl(L, 80, 80, 120, V3(0, 0, 0), null, Z.PAINT, 64);
  k.cyl(L, 86, 86, 26, V3(0, 0, 0), null, Z.DARK, 64);
  k.cyl(L, 60, 80, 30, V3(0, 75, 0), null, Z.PAINT, 64);
  k.cyl(L, 80, 60, 30, V3(0, -75, 0), null, Z.PAINT, 64);
  k.cyl(L, 81, 81, 8, V3(0, 30, 0), null, Z.WINDOW, 64);
  k.cyl(L, 81, 81, 8, V3(0, -30, 0), null, Z.WINDOW, 64);
  k.torus(L, 87, 2.5, V3(0, 14, 0), Z.METAL, 96, 8);
  k.torus(L, 87, 2.5, V3(0, -14, 0), Z.METAL, 96, 8);
  lightRing(k, 46, 81, 24, [0.6, 3.5, 3.0], 0.6, 0);
  lightRing(k, -46, 81, 24, [0.6, 3.5, 3.0], 0.6, 0);
  // treliça + tanques
  k.cyl(L, 22, 22, 220, V3(0, 190, 0), null, Z.METAL, 32);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const o = V3(Math.sin(a) * 30, 0, Math.cos(a) * 30);
    k.truss(L, o.clone().setY(80), o.clone().setY(300), 7, 0.9, 10, Z.DARK);
  }
  tankRing(k, L, 140, 62, 8, 16, true);
  // racks de contêineres (escala e cor)
  const zs = [Z.ACCENT, Z.PAINT, Z.RUST, Z.ACCENT, Z.HAZARD, Z.DARK, Z.PAINT, Z.RUST];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + 0.1;
    const n = V3(Math.sin(a), 0, Math.cos(a));
    for (let j = 0; j < 3; j++) for (let l = 0; l < 2; l++) {
      if (((i * 7 + j * 3 + l) % 5) === 0) continue; // vagas
      const p = n.clone().multiplyScalar(44 + l * 13).setY(186 + j * 6.2);
      k.box(L, 5.6, 5.6, 12.5, p, [0, a, 0], zs[(i * 3 + j * 5 + l) % zs.length]);
    }
    k.box(L, 1.2, 22, 1.2, n.clone().multiplyScalar(37).setY(192), [0, a, 0], Z.DARK);
  }
  k.cyl(L, 72, 72, 1.5, V3(0, 181.5, 0), null, Z.DARK, 48);
  k.cyl(L, 72, 72, 1.5, V3(0, 205, 0), null, Z.DARK, 48);
  lightRing(k, 206.5, 72, 36, [3.2, 2.4, 1.4], 0.5, 0);
  tankRing(k, L, 236, 58, 6, 11, false);
  k.cyl(L, 70, 70, 4, V3(0, 112, 0), null, Z.DARK, 48);
  k.cyl(L, 70, 70, 4, V3(0, 168, 0), null, Z.DARK, 48);
  // núcleo superior
  k.cyl(L, 46, 46, 88, V3(0, 344, 0), null, Z.PAINT, 64);
  k.cyl(L, 47, 47, 6, V3(0, 320, 0), null, Z.WINDOW, 64);
  k.cyl(L, 47, 47, 6, V3(0, 336, 0), null, Z.WINDOW, 64);
  k.cyl(L, 47, 47, 6, V3(0, 352, 0), null, Z.WINDOW, 64);
  k.cyl(L, 50, 50, 3, V3(0, 300, 0), null, Z.ACCENT, 64);
  k.cyl(L, 50, 50, 3, V3(0, 368, 0), null, Z.ACCENT, 64);
  portholes(k, 300, 50.5, 32, [2.5, 3.2, 3.0], 0.45);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.1;
    const n = V3(Math.sin(a), 0, Math.cos(a));
    greebleRect(k, L, n.clone().multiplyScalar(46).setY(382), V3().crossVectors(V3(0, 1, 0), n), V3(0, 1, 0), n, 30, 8, 0.12, 0.8);
  }
}

// ─── anel habitacional (gira) ─────────────────────────────────────────────
function habitatRing(k, lite) {
  const L = 'hull';
  const { ringR: R, ringW: W, ringH: H } = MERIDIANA;
  const seg = lite ? 48 : 96;
  const ro = R + W / 2, ri = R - W / 2;
  // face externa em faixas (de baixo para cima)
  const y0 = -H / 2;
  const band = (a, b, f) => k.ring(L, R, W, b - a, y0 + (a + b) / 2, seg, f);
  band(0, 16, { outer: Z.PAINT, inner: Z.PAINT, top: null, bottom: Z.PAINT });
  band(16, 29, { outer: Z.WINDOW, inner: Z.WINDOW, top: null, bottom: null });
  band(29, 33, { outer: Z.ACCENT, inner: Z.DARK, top: null, bottom: null });
  band(33, 46, { outer: Z.WINDOW, inner: Z.WINDOW, top: null, bottom: null });
  band(46, H, { outer: Z.PAINT, inner: Z.PAINT, top: Z.PAINT, bottom: null });
  // faixa luminosa contínua (teal da Guilda) e frisos
  k.ring(L, R, W + 1.2, 0.8, y0 + 31, seg, { outer: Z.GLOW, inner: null, top: null, bottom: null });
  k.ring(L, R, W + 2.4, 1.6, -H / 2 + 0.8, seg, { outer: Z.DARK, inner: Z.DARK, top: Z.DARK, bottom: Z.DARK });
  k.ring(L, R, W + 2.4, 1.6, H / 2 - 0.8, seg, { outer: Z.DARK, inner: Z.DARK, top: Z.DARK, bottom: Z.DARK });
  // quilha inferior contínua (dutos e trilho de manutenção)
  k.ring(L, R + W * 0.1, W * 0.45, 8, -H / 2 - 4, seg, { outer: Z.DARK, inner: Z.DARK, top: null, bottom: Z.METAL });
  k.ring(L, R - W * 0.32, 3, 3, -H / 2 - 9, seg, { outer: Z.ACCENT, inner: Z.ACCENT, top: null, bottom: Z.ACCENT });
  // jardins: abóbadas de vidro no teto do anel (estufas iluminadas)
  for (let i = 0; i < seg; i += 2) {
    const a0 = (i / seg) * Math.PI * 2;
    const am = a0 + Math.PI / seg;
    const n = V3(Math.sin(am), 0, Math.cos(am));
    const t = V3(Math.cos(am), 0, -Math.sin(am));
    const len = (2 * Math.PI * R / seg) * 1.6;
    const g = new THREE.CylinderGeometry(W * 0.26, W * 0.26, len, 16, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    k.add(L, g, mat(n.clone().multiplyScalar(R).setY(H / 2), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, V3(0, 1, 0), V3().crossVectors(t, V3(0, 1, 0))))), Z.GLASS);
    if (i % 4 === 0) k.light(n.clone().multiplyScalar(R).setY(H / 2 + W * 0.12), [0.8, 2.6, 0.9], 1.6, 0);
  }
  // cavernas estruturais, módulos e luzes
  const nRib = lite ? 24 : 48;
  for (let i = 0; i < nRib; i++) {
    const a = (i / nRib) * TAU;
    const n = V3(Math.sin(a), 0, Math.cos(a));
    const t = V3(Math.cos(a), 0, -Math.sin(a));
    k.push(mat(n.clone().multiplyScalar(R), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, V3(0, 1, 0), n.clone().negate()))));
    k.box(L, 3.2, H + 4, W + 4, V3(0, 0, 0), null, Z.DARK);
    k.box(L, 3.6, 2.4, W + 5, V3(0, H / 2 + 1.2, 0), null, Z.METAL);
    if (i % 2 === 0) {
      // módulo externo (carga/hidroponia) com escotilhas
      k.box(L, 26, 12, 9, V3(14, -H / 2 + 9, -W / 2 - 4.5), null, i % 4 ? Z.PAINT : Z.ACCENT);
      k.box(L, 22, 2, 9.6, V3(14, -H / 2 + 9, -W / 2 - 4.5), null, Z.DARK);
      k.box(L, 20, 10, 18, V3(14, -H / 2 - 6, 0), null, Z.PAINT);
      k.light(V3(14, -H / 2 - 11.2, 0), [3.2, 2.4, 1.4], 0.6, 0);
      greebleRect(k, L, V3(14, H / 2, 0), V3(1, 0, 0), V3(0, 0, 1), V3(0, 1, 0), 22, W - 6, 0.06, 0.9);
    }
    k.light(V3(0, H / 2 + 2.6, -W / 2 - 2), i % 6 === 0 ? [12, 12, 12] : [0.6, 3.0, 2.6], i % 6 === 0 ? 0.9 : 0.5, i % 6 === 0 ? 0.7 : 0);
    k.light(V3(0, -H / 2 - 1.5, -W / 2 - 2), [3.2, 2.4, 1.4], 0.5, 0);
    k.pop();
  }
  // raios (6) com tubo de elevador
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const n = V3(Math.sin(a), 0, Math.cos(a));
    const p0 = n.clone().multiplyScalar(86), p1 = n.clone().multiplyScalar(ri - 1);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), n);
    const mid = p0.clone().add(p1).multiplyScalar(0.5), len = p0.distanceTo(p1);
    k.add(L, new THREE.BoxGeometry(26, len, 20), mat(mid, q), Z.PAINT);
    k.add(L, new THREE.BoxGeometry(27, len, 3), mat(mid.clone().add(V3(0, 11.5, 0)), q), Z.DARK);
    k.add(L, new THREE.BoxGeometry(27, len, 3), mat(mid.clone().add(V3(0, -11.5, 0)), q), Z.DARK);
    k.add(L, new THREE.BoxGeometry(26.4, len - 20, 5), mat(mid.clone().add(V3(0, 0, 0)), q), Z.WINDOW);
    const side = V3().crossVectors(V3(0, 1, 0), n);
    k.pipe(L, p0.clone().addScaledVector(side, 17).add(V3(0, 5, 0)), p1.clone().addScaledVector(side, 17).add(V3(0, 5, 0)), 3.2, Z.METAL, 12);
    k.pipe(L, p0.clone().addScaledVector(side, -17).add(V3(0, -5, 0)), p1.clone().addScaledVector(side, -17).add(V3(0, -5, 0)), 2.4, Z.ACCENT, 12);
    k.truss(L, p0.clone().add(V3(0, 18, 0)), p1.clone().add(V3(0, 18, 0)), 6, 0.8, 12, Z.DARK);
    for (let j = 1; j < 8; j++) {
      const p = p0.clone().lerp(p1, j / 8);
      k.add(L, new THREE.BoxGeometry(36, 4, 26), mat(p, q), Z.DARK);
      k.light(p.clone().addScaledVector(side, 18.5).add(V3(0, 2, 0)), [0.6, 3.0, 2.6], 0.5, 0);
      k.light(p.clone().addScaledVector(side, -18.5).add(V3(0, 2, 0)), [0.6, 3.0, 2.6], 0.5, 0);
    }
    // junção com o anel
    k.add(L, new THREE.BoxGeometry(44, 14, 50), mat(n.clone().multiplyScalar(ri - 8), q), Z.ACCENT);
  }
  // letreiro: faixas de destaque grandes em 4 posições (lado de fora)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    k.ring(L, R, W + 0.6, 26, 0, 18, { outer: Z.ACCENT, inner: null, top: null, bottom: null }, null, a, 0.22);
  }
}

// ─── disco de atracação + torre ───────────────────────────────────────────
function hub(k, lite) {
  const L = 'hull';
  const M = MERIDIANA, B = M.bay;
  const y0 = M.hubY0, y1 = M.hubY1, R = M.hubR;
  const halfA = Math.asin((B.w / 2 + 4) / R);
  // paredes externas entre as bocas, em faixas
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + halfA, arc = Math.PI / 2 - halfA * 2;
    k.ring(L, R - 3, 6, 10, y0 + 5, 16, { outer: Z.PAINT, inner: null, top: null, bottom: null }, null, a0, arc);
    k.ring(L, R - 3, 6, 12, y0 + 16, 16, { outer: Z.WINDOW, inner: null, top: null, bottom: null }, null, a0, arc);
    k.ring(L, R - 3, 6, 3, y0 + 23.5, 16, { outer: Z.GLOW, inner: null, top: null, bottom: null }, null, a0, arc);
    k.ring(L, R - 3, 6, 15, y0 + 32.5, 16, { outer: Z.PAINT, inner: null, top: null, bottom: null }, null, a0, arc);
    k.ring(L, R - 3, 6, 8, y0 + 44, 16, { outer: Z.WINDOW, inner: null, top: null, bottom: null }, null, a0, arc);
    k.ring(L, R - 3, 6, 4, y1 - 2, 16, { outer: Z.ACCENT, inner: null, top: null, bottom: null }, null, a0, arc);
  }
  // acima das bocas a parede continua (faixa sobre o hangar)
  k.ring(L, R - 3, 6, y1 - (y0 + B.h + 6), (y0 + B.h + 6 + y1) / 2, 64, { outer: Z.PAINT, inner: null, top: null, bottom: null });
  // tampas
  k.cyl(L, R, R, 2, V3(0, y1 + 1, 0), null, Z.PAINT, 64);
  k.cyl(L, R + 2, R + 2, 3, V3(0, y1 - 1, 0), null, Z.DARK, 64);
  k.lathe(L, [[46, y0 - 40], [80, y0 - 20], [R, y0 - 2], [R + 2, y0]], V3(), Z.PAINT, 64);
  k.cyl(L, R + 2, R + 2, 3, V3(0, y0 + 1, 0), null, Z.DARK, 64);
  // telhado: módulos, dutos e plataformas de antena
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const n = V3(Math.sin(a), 0, Math.cos(a));
    greebleRect(k, L, n.clone().multiplyScalar(80).setY(y1 + 2), V3().crossVectors(V3(0, 1, 0), n), n, V3(0, 1, 0), 60, 60, 0.05, 1.4);
    dish(k, L, n.clone().multiplyScalar(96).setY(y1 + 12), V3(0, 1, 0).addScaledVector(n, 0.8).normalize(), i % 2 ? 16 : 11);
    k.cyl(L, 3, 4, 10, n.clone().multiplyScalar(96).setY(y1 + 5), null, Z.DARK, 12);
  }
  // armações dos letreiros em néon (o texto é montado em station.js)
  for (const a of [Math.PI / 4, Math.PI * 1.25]) {
    const n = V3(Math.sin(a), 0, Math.cos(a));
    const c = n.clone().multiplyScalar(R - 7.2).setY(y1 + 16);
    k.box(L, 116, 24, 1.4, c, [0, a, 0], Z.DARK);
    k.box(L, 118, 1.2, 2.4, c.clone().add(V3(0, 12.6, 0)), [0, a, 0], Z.METAL);
    k.box(L, 118, 1.2, 2.4, c.clone().add(V3(0, -12.6, 0)), [0, a, 0], Z.METAL);
    const t = V3(Math.cos(a), 0, -Math.sin(a));
    for (const s2 of [-50, -17, 17, 50]) k.beam(L, c.clone().addScaledVector(t, s2).add(V3(0, -12, 0)).addScaledVector(n, -1), c.clone().addScaledVector(t, s2).setY(y1 + 1).addScaledVector(n, -14), 1.6, Z.DARK);
  }
  // torre de controle
  k.lathe(L, [[58, y1 + 2], [56, y1 + 22], [44, y1 + 40], [40, y1 + 58]], V3(), Z.PAINT, 64);
  k.lathe(L, [[40, y1 + 58], [46, y1 + 64], [47, y1 + 74], [42, y1 + 80]], V3(), Z.GLASS, 64);
  k.cyl(L, 47.5, 47.5, 1.0, V3(0, y1 + 69, 0), null, Z.DARK, 64);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.box(L, 0.8, 16, 0.8, V3(Math.sin(a) * 46.2, y1 + 69, Math.cos(a) * 46.2), [0, a, 0], Z.DARK); }
  k.lathe(L, [[42, y1 + 80], [36, y1 + 92], [12, y1 + 100], [8, y1 + 104]], V3(), Z.PAINT, 64);
  k.lathe(L, [[45, y1 + 70], [45.2, y1 + 70.4]], V3(), Z.GLOW, 64);
  portholes(k, y1 + 30, 51, 40, [3.2, 2.4, 1.4], 0.45);
  portholes(k, y1 + 68, 44.5, 48, [0.8, 2.8, 3.2], 0.55); // console do controle de tráfego por trás do vidro
  mast(k, L, V3(0, y1 + 104, 0), V3(0, 1, 0), 90, 2.2);
  lightRing(k, y1 + 3, R + 2, 32, [12, 12, 12], 0.8, 0.5);
  lightRing(k, y0 - 1, R + 2, 32, [0.5, 3.0, 2.5], 0.6, 0);
  // bocas dos hangares
  for (let i = 0; i < 4; i++) {
    const b = bayBasis(i);
    const c = b.out.clone().multiplyScalar(R + 1).setY(M.floorY);
    dockMouth(k, L, L, c, b.out, b.up, B.w, B.h, 8);
    // número do hangar (faixa de destaque) e pórticos de aproximação
    k.push(mat(c, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(b.side, b.up, b.out))));
    k.box(L, 12, 5, 0.6, V3(-B.w / 2 + 8, B.h + 8, 4.4), null, Z.ACCENT);
    // braços laterais de doca com luzes-guia
    for (const s of [-1, 1]) {
      k.box(L, 4, 4, 70, V3(s * (B.w / 2 + 6), -6, 38), null, Z.DARK);
      k.box(L, 2, 1, 70, V3(s * (B.w / 2 + 6), -3.6, 38), null, Z.HAZARD);
      for (let j = 0; j < 7; j++) k.light(V3(s * (B.w / 2 + 6), -3.6, 8 + j * 10), [0.4, 4.5, 3.6], 0.5, -0.9, 1 - j / 7);
      k.box(L, 3, 30, 3, V3(s * (B.w / 2 + 6), 9, 72), null, Z.DARK);
      k.light(V3(s * (B.w / 2 + 6), 24.5, 72), s < 0 ? [12, 0.5, 0.3] : [0.3, 12, 1], 0.9, 1.0);
    }
    k.pop();
    // hangares 1–3: cavidade simples vista de fora (o 0 tem interior completo)
    if (i !== 0) bayCavity(k, L, b, B, M.floorY, R);
  }
  // colar inferior com dutos para o núcleo
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const n = V3(Math.sin(a), 0, Math.cos(a));
    k.pipe(L, n.clone().multiplyScalar(110).setY(y0 - 2), n.clone().multiplyScalar(48).setY(y0 - 44), 3, Z.METAL, 12);
  }
}

/** Cavidade do hangar (faces para dentro), luzes no teto, pórtico e uma nave estacionada fica a cargo do tráfego. */
export function bayCavity(k, L, b, B, floorY, R) {
  const c = b.out.clone().multiplyScalar(R - B.d / 2).setY(floorY);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(b.side, b.up, b.out));
  k.push(mat(c, q));
  const w = B.w, h = B.h, d = B.d;
  const plane = (W, H, pos, rot, zone) => { const g = new THREE.PlaneGeometry(W, H, 1, 1); k.add(L, g, mat(pos, rot), zone); };
  plane(w, d, V3(0, 0, 0), [-Math.PI / 2, 0, 0], Z.DARK);
  plane(w, d, V3(0, h, 0), [Math.PI / 2, 0, 0], Z.DARK);
  plane(d, h, V3(-w / 2, h / 2, 0), [0, Math.PI / 2, 0], Z.METAL);
  plane(d, h, V3(w / 2, h / 2, 0), [0, -Math.PI / 2, 0], Z.METAL);
  plane(w, h, V3(0, h / 2, -d / 2), [0, 0, 0], Z.PAINT);
  // faixa de pouso e luzes do teto
  k.box(L, 22, 0.1, 22, V3(0, 0.06, 4), null, Z.HAZARD);
  for (let j = 0; j < 5; j++) for (const s of [-1, 1]) k.light(V3(s * 18, h - 1, -d / 2 + 10 + j * 15), [6, 6, 5.5], 0.9, 0);
  for (let j = 0; j < 8; j++) k.light(V3(0, 0.2, -d / 2 + 5 + j * 10), [0.3, 3.5, 2.8], 0.35, -0.8, j / 8);
  k.pop();
}
