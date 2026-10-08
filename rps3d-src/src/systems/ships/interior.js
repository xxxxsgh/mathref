// Interiores andáveis das naves maiores (cargueiro, explorador, fragata).
// Geometria no espaço LOCAL da nave (mesmo referencial do casco), colisores
// em caixas (para ctx.collision com o frame da nave), pontos de nascimento,
// assento do piloto e portas. Luz: material de interior com lâmpadas falsas
// (fileira periódica no teto + pontos), sem custo de luzes reais.
import * as THREE from 'three/webgpu';
import { Z, M, Parts, box, cyl, cylZ, sphere, pipe, vent, torusZ } from './geo.js';
import { makeHullMaterial, makeLightsMaterial } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const STYLE = {
  primary: [0.34, 0.35, 0.36], secondary: [0.12, 0.125, 0.13], trim: [0.9, 0.62, 0.12],
  metal: [0.55, 0.55, 0.56], dark: [0.04, 0.042, 0.046], glow: [0.6, 0.85, 1.0],
  paint: { metal: 0.25, rough: 0.5, clearcoat: 0.1 }, wear: 0.55, patch: 0, hazard: 1, teeth: 0, circuits: 0, iridescence: 0,
};

/** Especificação por classe: seções ao longo de z (no espaço da nave). */
const SPEC = {
  freighter: { floor: -1.5, ceil: 1.75, halfW: 1.65, z0: -23.2, z1: 21.5, bridge: [-23.2, -17], hold: [-3, 13], engine: [13.6, 21.5], seat: V(-0.9, -0.6, -21.2) },
  explorer: { floor: -1.35, ceil: 1.6, halfW: 1.5, z0: -15.5, z1: 11, bridge: [-15.5, -10.5], hold: [-4, 4], engine: [5, 11], seat: V(0, -0.5, -13.6) },
  frigate: { floor: -3.0, ceil: 0.6, halfW: 2.2, z0: -40, z1: 44, bridge: [-40, -32], hold: [-12, 18], engine: [30, 44], seat: V(0, -2.2, -36) },
};

export function buildInterior(ctx, classId) {
  const sp = SPEC[classId];
  if (!sp) return null;
  const lite = ctx.quality?.name === 'mobile';
  const P = new Parts(9001);
  const cols = [];
  const col = (c, h) => cols.push({ center: c, half: h });
  const { floor: F, ceil: C, halfW: W, z0, z1 } = sp;
  const H = C - F, midY = (F + C) / 2, L = z1 - z0, midZ = (z0 + z1) / 2;
  // casca: piso, teto, paredes, anteparas
  P.add(box(W * 2 + 0.2, 0.12, L), Z.DARK, { m: M(0, F - 0.06, midZ) });
  P.add(box(W * 2 + 0.2, 0.12, L), Z.PRIMARY, { m: M(0, C + 0.06, midZ) });
  for (const s of [1, -1]) P.add(box(0.12, H, L), Z.PRIMARY, { m: M(s * (W + 0.06), midY, midZ) });
  P.add(box(W * 2, H, 0.12), Z.PRIMARY, { m: M(0, midY, z0 - 0.06) });
  P.add(box(W * 2, H, 0.12), Z.PRIMARY, { m: M(0, midY, z1 + 0.06) });
  col(V(0, F - 0.25, midZ), V(W + 0.3, 0.25, L / 2));
  col(V(0, C + 0.25, midZ), V(W + 0.3, 0.25, L / 2));
  for (const s of [1, -1]) col(V(s * (W + 0.25), midY, midZ), V(0.25, H / 2 + 0.3, L / 2));
  col(V(0, midY, z0 - 0.25), V(W, H / 2, 0.25));
  col(V(0, midY, z1 + 0.25), V(W, H / 2, 0.25));

  // grade do piso com canaleta central iluminada
  for (let z = z0 + 0.6; z < z1 - 0.3; z += 1.2) {
    P.add(box(W * 2 - 0.2, 0.04, 1.1, 0.01), Z.METAL, { m: M(0, F + 0.02, z), wear: 0.8 });
    for (let k = -3; k <= 3; k++) P.add(box(0.03, 0.05, 1.0), Z.DARK, { m: M(k * 0.38, F + 0.045, z), detail: true });
  }
  for (const s of [1, -1]) P.glowPart(box(0.04, 0.012, L - 1), [0.45, 0.8, 1.0], 1.6, { m: M(s * (W - 0.12), F + 0.06, midZ) });
  // cavernas (nervuras estruturais) a cada 1,6 m, com faixas de perigo nas bases
  for (let z = z0 + 1.2; z < z1 - 0.4; z += 1.6) {
    for (const s of [1, -1]) {
      P.add(box(0.22, H, 0.26, 0.03), Z.PRIMARY, { m: M(s * (W - 0.1), midY, z), wear: 0.7 });
      P.add(box(0.24, 0.35, 0.28), Z.SECONDARY, { m: M(s * (W - 0.1), F + 0.2, z), wear: 0.9 });
      // mísulas inclinadas no canto do teto
      P.add(box(0.2, 0.55, 0.22), Z.PRIMARY, { m: M(s * (W - 0.32), C - 0.22, z, 0, 0, s * 0.8) });
    }
    P.add(box(W * 2, 0.24, 0.26, 0.03), Z.PRIMARY, { m: M(0, C - 0.1, z) });
  }
  // luminárias de teto (emissivas) + painéis de parede entre cavernas
  for (let z = z0 + 2.0; z < z1 - 0.6; z += 3.2) {
    P.add(box(0.9, 0.06, 0.5, 0.02), Z.DARK, { m: M(0, C - 0.03, z) });
    P.glowPart(box(0.8, 0.02, 0.4), [1.0, 0.92, 0.8], 7, { m: M(0, C - 0.07, z) });
  }
  // dutos e cabos no teto
  for (const x of [-0.75, 0.75]) P.add(cylZ(0.09, 0.09, L - 0.6, 10), Z.METAL, { m: M(x, C - 0.32, midZ), wear: 0.6 });
  P.add(pipe([[W - 0.3, C - 0.25, z0 + 1], [W - 0.32, C - 0.28, midZ], [W - 0.3, C - 0.25, z1 - 1]], 0.035, 30), Z.TRIM);
  P.add(pipe([[-W + 0.3, C - 0.45, z0 + 1], [-W + 0.33, C - 0.48, midZ], [-W + 0.3, C - 0.45, z1 - 1]], 0.05, 30), Z.RUBBER);
  // armários e painéis de serviço ao longo das paredes (fora da baia)
  const rng = mulberry(77);
  for (let z = z0 + 2.0; z < z1 - 1; z += 1.6) {
    if (z > sp.hold[0] - 0.6 && z < sp.hold[1]) continue;
    if (z > sp.bridge[0] && z < sp.bridge[1]) continue;
    for (const s of [1, -1]) {
      const kind = Math.floor(rng() * 4);
      const x = s * (W - 0.2);
      if (kind === 0) { // armário com porta
        P.add(box(0.3, 1.9, 1.1, 0.02), Z.PRIMARY, { m: M(x, F + 0.95, z + 0.8), wear: 0.7 });
        P.add(box(0.02, 0.5, 0.06), Z.METAL, { m: M(x - s * 0.16, F + 1.1, z + 0.4) });
        P.glowPart(box(0.01, 0.05, 0.12), [0.3, 1.0, 0.45], 2, { m: M(x - s * 0.16, F + 1.5, z + 0.8) });
        col(V(x, F + 0.95, z + 0.8), V(0.18, 0.95, 0.55));
      } else if (kind === 1) { // painel com tela
        P.add(box(0.12, 0.7, 0.9, 0.02), Z.DARK, { m: M(x, F + 1.35, z + 0.8) });
        P.glowPart(box(0.01, 0.42, 0.62), [0.25, 0.6, 0.9], 1.4, { m: M(x - s * 0.065, F + 1.38, z + 0.8) });
        for (let k = 0; k < 4; k++) P.glowPart(box(0.012, 0.03, 0.05), k % 2 ? [1.0, 0.6, 0.15] : [0.3, 1.0, 0.45], 2.4, { m: M(x - s * 0.065, F + 1.0, z + 0.5 + k * 0.18) });
      } else if (kind === 2) { // respiro e tubulação
        P.add(vent(0.6, 0.8, 7, 0.04), Z.DARK, { m: M(x, F + 0.7, z + 0.8, 0, 0, s * Math.PI / 2) });
        P.add(pipe([[x, F + 0.2, z + 0.2], [x - s * 0.1, F + 1.2, z + 0.5], [x, C - 0.4, z + 1.2]], 0.04, 16), Z.METAL);
      } else { // extintor + caixa
        P.add(cyl(0.08, 0.08, 0.5, 12), Z.SECONDARY, { m: M(x - s * 0.1, F + 0.9, z + 0.8) });
        P.add(box(0.25, 0.3, 0.4, 0.02), Z.DARK, { m: M(x, F + 0.35, z + 0.8) });
      }
    }
  }
  // ── ponte ──
  const [b0, b1] = sp.bridge;
  P.add(box(W * 2 - 0.2, 0.5, 1.0, 0.04), Z.DARK, { m: M(0, F + 0.95, b0 + 0.9, 0.4, 0, 0) });
  for (let k = 0; k < 3; k++) P.glowPart(box(0.5, 0.01, 0.32), [0.3, 0.7, 1.0], 2.2, { m: M(-0.8 + k * 0.8, F + 1.23, b0 + 0.95, 0.4, 0, 0) });
  for (const x of [-0.9, 0.9]) {
    P.add(box(0.55, 0.12, 0.55, 0.04), Z.SECONDARY, { m: M(x, F + 0.5, b0 + 2.4) });
    P.add(box(0.55, 0.8, 0.12, 0.04), Z.SECONDARY, { m: M(x, F + 0.95, b0 + 2.7, -0.15, 0, 0) });
    P.add(cyl(0.05, 0.08, 0.45, 10), Z.METAL, { m: M(x, F + 0.22, b0 + 2.4) });
  }
  col(V(0, F + 0.55, b0 + 0.9), V(W, 0.55, 0.5));
  // antepara/porta entre ponte e corredor (porta aberta em fenda)
  for (const s of [1, -1]) {
    P.add(box(W - 0.6, H, 0.2), Z.PRIMARY, { m: M(s * (W - (W - 0.6) / 2), midY, b1) });
    col(V(s * (W - (W - 0.6) / 2), midY, b1), V((W - 0.6) / 2, H / 2, 0.1));
    P.add(box(0.12, H, 0.3), Z.SECONDARY, { m: M(s * 0.66, midY, b1) });
    P.glowPart(box(0.02, H * 0.8, 0.02), [1.0, 0.65, 0.2], 3, { m: M(s * 0.6, midY, b1 - 0.16) });
  }
  // ── baia de carga: caixotes, contêiner, guindaste ──
  const [h0, h1] = sp.hold;
  for (let i = 0; i < 9; i++) {
    const s = i % 2 ? 1 : -1;
    const z = h0 + 1.2 + Math.floor(i / 2) * 2.6 + rng() * 0.5;
    const w = 0.8 + rng() * 0.5, h = 0.6 + rng() * 0.6, d = 0.8 + rng() * 0.6;
    const x = s * (W - 0.25 - w / 2);
    const zone = rng() < 0.4 ? Z.SECONDARY : rng() < 0.5 ? Z.TRIM : Z.PRIMARY;
    P.add(box(w, h, d, 0.03), zone, { m: M(x, F + h / 2, z, 0, (rng() - 0.5) * 0.2, 0), wear: 1 });
    P.add(box(w + 0.02, 0.06, 0.06), Z.DARK, { m: M(x, F + h * 0.7, z) });
    col(V(x, F + h / 2, z), V(w / 2, h / 2, d / 2));
    if (rng() < 0.5) {
      const h2 = 0.4 + rng() * 0.3;
      P.add(box(w * 0.7, h2, d * 0.7, 0.03), Z.PRIMARY, { m: M(x, F + h + h2 / 2, z, 0, 0.3, 0), wear: 1 });
    }
  }
  // trilho do guindaste no teto
  P.add(box(0.2, 0.15, h1 - h0), Z.TRIM, { m: M(0, C - 0.55, (h0 + h1) / 2) });
  P.add(box(0.5, 0.3, 0.6), Z.SECONDARY, { m: M(0, C - 0.75, h0 + 4) });
  P.add(cyl(0.01, 0.01, 1.2, 4), Z.METAL, { m: M(0, C - 1.5, h0 + 4) });
  P.add(box(0.3, 0.12, 0.2), Z.TRIM, { m: M(0, C - 2.1, h0 + 4) });
  // rampa (piso inclinado marcado)
  P.add(box(1.8, 0.02, 2.4), Z.SECONDARY, { m: M(0, F + 0.05, h0 + 1.5) });
  // ── sala de máquinas: reator ──
  const [e0, e1] = sp.engine;
  const rz = (e0 + e1) / 2;
  P.add(cyl(0.75, 0.75, H * 0.9, 24), Z.METAL, { m: M(0, midY, rz), wear: 0.5 });
  for (let k = 0; k < 4; k++) P.add(torusZ(0.8, 0.06, 24).rotateX(Math.PI / 2), Z.TRIM, { m: M(0, F + 0.4 + k * H * 0.25, rz) });
  P.glowPart(cyl(0.45, 0.45, H * 0.82, 20, true), [0.45, 0.8, 1.0], 5, { m: M(0, midY, rz) });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    P.add(box(0.12, H * 0.82, 0.12), Z.DARK, { m: M(Math.cos(a) * 0.62, midY, rz + Math.sin(a) * 0.62) });
  }
  col(V(0, midY, rz), V(0.85, H / 2, 0.85));
  for (const s of [1, -1]) P.add(pipe([[0, C - 0.4, rz], [s * 0.8, C - 0.3, rz - 1.5], [s * (W - 0.3), C - 0.6, rz - 3]], 0.08, 20), Z.METAL);
  // portas nas extremidades da baia
  for (const z of [h0 - 0.4, e0]) for (const s of [1, -1]) {
    P.add(box(W - 0.75, H, 0.25), Z.PRIMARY, { m: M(s * (W - (W - 0.75) / 2), midY, z) });
    col(V(s * (W - (W - 0.75) / 2), midY, z), V((W - 0.75) / 2, H / 2, 0.12));
    P.add(box(0.05, H * 0.9, 0.3), Z.SECONDARY, { m: M(s * 0.76, midY, z) });
  }
  P.add(box(1.5, 0.4, 0.25), Z.PRIMARY, { m: M(0, C - 0.2, h0 - 0.4) });

  const mat = makeHullMaterial(STYLE, { panel: 0.8, lite, fill: true });
  const U = mat.userData.U;
  U.fillAmb.value.setRGB(0.05, 0.055, 0.06);
  U.rowCol.value.setRGB(1.6, 1.45, 1.25);
  U.row.value.set(3.2, C - 0.12, 0, 1.8);
  // luminárias em z0 + 2 + k·3,2
  U.rowPh.value = z0 + 2.0 - 1.6;
  U.lamps.array[0].set(0, midY, rz, 2.2); U.lampCol.array[0].setRGB(0.6, 1.1, 1.6);
  U.lamps.array[1].set(0, F + 1.2, b0 + 1.0, 1.4); U.lampCol.array[1].setRGB(0.4, 0.8, 1.3);
  U.lamps.array[2].set(0, midY, h0 + 4, 3); U.lampCol.array[2].setRGB(0.6, 0.45, 0.2);

  const group = new THREE.Group();
  group.name = `interior:${classId}`;
  const hull = Parts.merge(P.hull), det = Parts.merge(P.detail), lit = Parts.merge(P.lights);
  const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.receiveShadow = true; group.add(o); return o; };
  mk(hull, mat); if (det) mk(det, mat);
  mk(lit, makeLightsMaterial());
  return {
    group, material: mat, colliders: cols,
    spawn: V(0, F + 0.05, (h0 + b1) / 2),
    seat: sp.seat.clone(),
    eyeHeight: 1.65,
    floorY: F, ceilY: C,
    bounds: { min: V(-W, F, z0), max: V(W, C, z1) },
  };
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
