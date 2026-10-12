// Soldados procedurais (Hegemonia, Corsários, Frente Livre): armadura por
// facção com placas, ombreiras, capacete com visor luminoso, mochila, arma
// própria; rig simples (quadril → tronco → cabeça/braços; coxas → canelas)
// animado proceduralmente (andar/correr, mirar, agachar na cobertura,
// reação a acertos, queda ao morrer). Braços por IK até a arma.
import * as THREE from 'three/webgpu';
import { Kit, pal, kitMaterial } from './kit.js';

const D = Math.PI / 180;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

export const LOOKS = {
  hegemonia: {
    plate: pal('#ece8df', 0.05, 0.32, 0, 0.12), plate2: pal('#d9d4c8', 0.05, 0.36, 0, 0.12), trim: pal('#c9a24a', 0.9, 0.28, 0, 0.1),
    under: pal('#262a31', 0, 0.82, 0, 0.2), dark: pal('#1b1e23', 0.4, 0.5, 0, 0.2), visor: pal('#ffb648', 0, 0.2, 1, 0), glow: pal('#ffcf6a', 0, 0.3, 1, 0),
    gun: pal('#e2ddd2', 0.05, 0.35, 0, 0.2), gunDark: pal('#2a2d32', 0.6, 0.4, 0, 0.3), crest: true, bolt: [1.0, 0.72, 0.28], name: 'Soldado da Hegemonia',
  },
  corsarios: {
    plate: pal('#4a4038', 0.2, 0.6, 0, 0.85), plate2: pal('#5e4a3a', 0.3, 0.55, 0, 0.9), trim: pal('#7b2a1e', 0.2, 0.6, 0, 0.8),
    under: pal('#221d1a', 0, 0.9, 0, 0.6), dark: pal('#2c2622', 0.5, 0.6, 0, 0.7), visor: pal('#ff3b2a', 0, 0.3, 1, 0), glow: pal('#ff4a30', 0, 0.3, 1, 0),
    gun: pal('#3a3430', 0.5, 0.5, 0, 0.8), gunDark: pal('#1e1b19', 0.6, 0.5, 0, 0.7), hood: true, bolt: [1.0, 0.22, 0.12], name: 'Corsário do Vazio',
  },
  frente: {
    plate: pal('#6d6a52', 0.05, 0.55, 0, 0.6), plate2: pal('#5a5844', 0.05, 0.6, 0, 0.6), trim: pal('#d0662e', 0.1, 0.45, 0, 0.5),
    under: pal('#2c2b25', 0, 0.88, 0, 0.4), dark: pal('#26261f', 0.4, 0.55, 0, 0.5), visor: pal('#ff9a4a', 0, 0.3, 1, 0), glow: pal('#ff9a4a', 0, 0.3, 1, 0),
    gun: pal('#4a4a40', 0.4, 0.5, 0, 0.6), gunDark: pal('#22221e', 0.6, 0.5, 0, 0.5), bolt: [1.0, 0.55, 0.2], name: 'Combatente da Frente Livre',
  },
};

/**
 * Constrói um soldado. variant: 'soldier' | 'heavy' | 'officer'.
 * Retorna { root, bones, mat, gun, muzzle, dims }.
 */
export function buildSoldier(faction = 'hegemonia', variant = 'soldier', { lite = false, seed = 1 } = {}) {
  const L = LOOKS[faction] || LOOKS.hegemonia;
  const K = new Kit();
  const heavy = variant === 'heavy';
  const bulk = heavy ? 1.18 : 1;
  const rnd = mulberry(seed);
  // ── quadril / pélvis (origem na altura do quadril)
  K.box('pelvis', L.under, 0.3 * bulk, 0.16, 0.2, [0, 0, 0], null, 0.05);
  K.box('pelvis', L.plate, 0.32 * bulk, 0.1, 0.06, [0, -0.02, -0.1], [8 * D, 0, 0], 0.02);
  K.box('pelvis', L.dark, 0.36 * bulk, 0.05, 0.22, [0, 0.07, 0], null, 0.015);
  K.box('pelvis', L.trim, 0.05, 0.05, 0.03, [0, 0.07, -0.115], null, 0.01);
  for (const s of [-1, 1]) K.box('pelvis', L.plate2, 0.06, 0.14, 0.17, [s * 0.18 * bulk, -0.06, 0], [0, 0, s * 8 * D], 0.02);
  // ── tronco (origem no topo da pélvis; sobe 0,55)
  K.box('torso', L.under, 0.3 * bulk, 0.3, 0.2, [0, 0.14, 0], null, 0.06);
  K.box('torso', L.plate, 0.44 * bulk, 0.3, 0.27, [0, 0.36, -0.01], null, 0.07);
  K.box('torso', L.plate2, 0.34 * bulk, 0.14, 0.05, [0, 0.27, -0.14], [-10 * D, 0, 0], 0.02);
  K.box('torso', L.trim, 0.2, 0.025, 0.02, [0, 0.43, -0.15], null, 0.008);
  K.box('torso', L.dark, 0.16, 0.06, 0.04, [0, 0.12, -0.11], null, 0.01);
  for (let i = 0; i < 3; i++) K.box('torso', L.plate2, 0.24 * bulk - i * 0.03, 0.04, 0.2, [0, 0.03 + i * 0.05, -0.02], null, 0.015);
  // gola e mochila
  K.box('torso', L.dark, 0.22, 0.07, 0.2, [0, 0.52, 0.0], null, 0.03);
  K.box('torso', L.dark, 0.34 * bulk, 0.36, 0.14, [0, 0.36, 0.19], null, 0.04);
  K.box('torso', L.plate, 0.3 * bulk, 0.1, 0.1, [0, 0.5, 0.2], null, 0.03);
  for (const s of [-1, 1]) { K.cyl('torso', L.dark, 0.035, 0.035, 0.26, [s * 0.12, 0.33, 0.27], null, 10); K.box('torso', L.glow, 0.01, 0.12, 0.012, [s * 0.12, 0.33, 0.306], null); }
  K.box('torso', L.glow, 0.08, 0.012, 0.012, [0, 0.42, -0.155], null);
  // ombreiras (no tronco)
  for (const s of [-1, 1]) {
    K.box('torso', L.plate, 0.15 * bulk, 0.07, 0.2 * bulk, [s * (0.27 * bulk), 0.48, 0], [0, 0, s * -18 * D], 0.03);
    K.box('torso', L.trim, 0.15 * bulk, 0.015, 0.2 * bulk, [s * (0.28 * bulk), 0.445, 0], [0, 0, s * -18 * D], 0.006);
    if (heavy) K.box('torso', L.plate2, 0.12, 0.1, 0.22, [s * 0.33, 0.42, 0], [0, 0, s * -30 * D], 0.03);
  }
  if (faction === 'corsarios') {
    // retalhos, cabos e uma placa improvisada
    K.box('torso', pal('#6b5a46', 0.6, 0.45, 0, 0.9), 0.18, 0.12, 0.02, [0.06, 0.34, -0.16], [0, 0.2, 0.15], 0.005);
    K.torus('torso', pal('#2a2420', 0, 0.9, 0, 0.6), 0.18, 0.03, [0, 0.5, 0.02], [Math.PI / 2, 0, 0.3], 12);
  }
  // ── cabeça / capacete (origem no pescoço)
  K.cyl('head', L.under, 0.06, 0.07, 0.1, [0, 0.04, 0], null, 10);
  K.sphere('head', L.plate, 0.135, [0, 0.16, 0.0], [0.95, 1.05, 1.12], 16);
  K.box('head', L.dark, 0.2, 0.08, 0.1, [0, 0.14, -0.1], null, 0.03);
  K.box('head', L.visor, 0.17, 0.028, 0.03, [0, 0.165, -0.142], [0, 0, 0], 0.01);
  K.box('head', L.plate2, 0.22, 0.04, 0.16, [0, 0.07, -0.02], null, 0.02);
  for (const s of [-1, 1]) { K.cyl('head', L.trim, 0.045, 0.045, 0.03, [s * 0.13, 0.15, 0.0], [0, 0, Math.PI / 2], 12); K.box('head', L.glow, 0.004, 0.02, 0.004, [s * 0.148, 0.15, -0.02], null); }
  if (L.crest) K.box('head', L.trim, 0.025, 0.04, 0.24, [0, 0.29, 0.01], [-6 * D, 0, 0], 0.01);
  if (L.hood) { K.sphere('head', L.under, 0.17, [0, 0.16, 0.03], [1.05, 1.05, 1.15], 12); K.box('head', L.under, 0.3, 0.16, 0.2, [0, 0.02, 0.06], null, 0.06); }
  if (variant === 'officer') K.box('head', L.glow, 0.02, 0.02, 0.18, [0.1, 0.24, 0.0], null);
  // ── braços (origem no ombro/cotovelo, para −Y)
  for (const s of ['L', 'R']) {
    K.capsule('upper' + s, L.under, 0.055 * bulk, 0.3, [0, -0.14, 0], null, 8);
    K.box('upper' + s, L.plate2, 0.11 * bulk, 0.14, 0.11 * bulk, [0, -0.12, 0], null, 0.03);
    K.capsule('fore' + s, L.under, 0.048 * bulk, 0.27, [0, -0.13, 0], null, 8);
    K.box('fore' + s, L.plate, 0.1 * bulk, 0.16, 0.1 * bulk, [0, -0.12, 0], null, 0.03);
    K.box('fore' + s, L.trim, 0.104 * bulk, 0.02, 0.104 * bulk, [0, -0.04, 0], null, 0.008);
    K.box('fore' + s, L.dark, 0.08, 0.09, 0.1, [0, -0.3, -0.01], null, 0.025);
    K.box('fore' + s, L.glow, 0.004, 0.03, 0.004, [s === 'L' ? -0.052 : 0.052, -0.14, 0.02], null);
  }
  // ── pernas (origem no quadril/joelho, para −Y)
  for (const s of ['L', 'R']) {
    K.capsule('thigh' + s, L.under, 0.075 * bulk, 0.46, [0, -0.22, 0], null, 8);
    K.box('thigh' + s, L.plate, 0.13 * bulk, 0.24, 0.07, [0, -0.2, -0.065], null, 0.03);
    K.box('thigh' + s, L.plate2, 0.06, 0.2, 0.12, [s === 'L' ? -0.075 : 0.075, -0.2, 0], null, 0.02);
    K.capsule('shin' + s, L.under, 0.062 * bulk, 0.44, [0, -0.21, 0], null, 8);
    K.box('shin' + s, L.plate, 0.11 * bulk, 0.3, 0.08, [0, -0.2, -0.055], null, 0.03);
    K.box('shin' + s, L.trim, 0.12, 0.08, 0.05, [0, -0.005, -0.075], [-10 * D, 0, 0], 0.02);
    K.box('shin' + s, L.dark, 0.13, 0.1, 0.27, [0, -0.43, -0.04], null, 0.03);
    K.box('shin' + s, L.plate2, 0.135, 0.04, 0.12, [0, -0.39, -0.1], null, 0.015);
  }
  // ── arma (origem na empunhadura; cano para −Z)
  K.box('gun', L.gun, 0.06, 0.09, 0.42, [0, 0.03, -0.12], null, 0.02);
  K.box('gun', L.gunDark, 0.05, 0.05, 0.3, [0, 0.03, 0.18], [6 * D, 0, 0], 0.015);
  K.cyl('gun', L.gunDark, 0.016, 0.016, 0.34, [0, 0.045, -0.45], [Math.PI / 2, 0, 0], 10);
  K.box('gun', L.gunDark, 0.035, 0.1, 0.05, [0, -0.04, 0.02], [14 * D, 0, 0], 0.012);
  K.box('gun', L.gunDark, 0.035, 0.13, 0.05, [0, -0.06, -0.16], [-8 * D, 0, 0], 0.012);
  K.box('gun', L.glow, 0.064, 0.012, 0.16, [0, 0.06, -0.15], null);
  K.cyl('gun', L.glow, 0.02, 0.02, 0.02, [0, 0.045, -0.62], [Math.PI / 2, 0, 0], 10);
  K.box('gun', L.trim, 0.03, 0.03, 0.1, [0, 0.095, -0.05], null, 0.008);
  if (heavy) { K.box('gun', L.gunDark, 0.09, 0.12, 0.3, [0, 0.02, -0.25], null, 0.025); K.cyl('gun', L.glow, 0.03, 0.03, 0.02, [0, 0.03, -0.66], [Math.PI / 2, 0, 0], 10); }
  void rnd;

  const mat = kitMaterial({ lite, scale: 9 });
  const bones = K.build(mat, { shadows: !lite });
  // hierarquia do rig
  const root = new THREE.Group(); root.name = 'soldado';
  const hipH = 0.98;
  const hips = new THREE.Group(); hips.position.y = hipH; root.add(hips);
  hips.add(bones.pelvis);
  const spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
  spine.add(bones.torso);
  const neck = new THREE.Group(); neck.position.set(0, 0.55, 0); spine.add(neck); neck.add(bones.head);
  for (const s of ['L', 'R']) { spine.add(bones['upper' + s]); spine.add(bones['fore' + s]); }
  const thighs = {}, shins = {};
  for (const s of ['L', 'R']) {
    const t = new THREE.Group(); t.position.set(s === 'L' ? -0.11 : 0.11, -0.04, 0); hips.add(t); t.add(bones['thigh' + s]);
    const k = new THREE.Group(); k.position.y = -0.45; t.add(k); k.add(bones['shin' + s]);
    thighs[s] = t; shins[s] = k;
  }
  const gun = new THREE.Group(); gun.add(bones.gun); spine.add(gun);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.045, heavy ? -0.68 : -0.64); gun.add(muzzle);
  const gripR = new THREE.Vector3(0, -0.04, 0.02), gripL = new THREE.Vector3(0, -0.07, -0.16);
  return {
    root, mat, gun, muzzle, hips, spine, neck, thighs, shins, bones, look: L, bulk,
    upper: { L: bones.upperL, R: bones.upperR }, fore: { L: bones.foreL, R: bones.foreR },
    grips: { R: gripR, L: gripL }, hipH,
  };
}

/** IK de braço no espaço do tronco: posiciona upper/fore até a mão alvo. */
export function solveArm(rig, side, handT) {
  const S = _v.set(side === 'L' ? -0.25 * rig.bulk : 0.25 * rig.bulk, 0.44, 0.0);
  const a = 0.3, b = 0.3;
  const d = _w.copy(handT).sub(S);
  let L = d.length();
  const dir = d.divideScalar(L || 1);
  L = Math.min(L, a + b - 1e-3);
  const cosA = (a * a + L * L - b * b) / (2 * a * L);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const pole = _a.set(side === 'L' ? -0.5 : 0.5, -1, 0.3).normalize();
  const perp = pole.addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = _b.copy(S).addScaledVector(dir, cosA * a).addScaledVector(perp, sinA * a);
  const up = rig.upper[side], fo = rig.fore[side];
  up.position.copy(S);
  up.quaternion.setFromUnitVectors(_v2.set(0, -1, 0), _v3.copy(elbow).sub(S).normalize());
  fo.position.copy(elbow);
  fo.quaternion.setFromUnitVectors(_v2.set(0, -1, 0), _v3.copy(handT).sub(elbow).normalize());
}
const _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

/**
 * Pose procedural. s = { t, speed (m/s), phase, crouch 0..1, aimPitch, aimYaw,
 * hitX, hitZ (inclinação de reação), dead (0..1), deadDir, firing }
 */
export function poseSoldier(rig, s) {
  const run = Math.min(1, s.speed / 4.5);
  const walk = Math.min(1, s.speed / 1.6);
  const ph = s.phase;
  const crouch = s.crouch;
  // pernas
  const swing = (0.42 + run * 0.35) * walk * (1 - crouch * 0.6);
  for (const [side, sgn] of [['L', 1], ['R', -1]]) {
    const p = ph + (sgn > 0 ? 0 : Math.PI);
    const th = Math.sin(p) * swing;
    const knee = Math.max(0, -Math.cos(p)) * (0.6 + run * 0.6) * walk;
    rig.thighs[side].rotation.set(th + crouch * 1.3, 0, sgn * 0.06 * crouch);
    rig.shins[side].rotation.set(-(knee + crouch * 1.95), 0, 0);
  }
  // quadril: desce agachado, balança andando
  rig.hips.position.y = rig.hipH - crouch * 0.42 - Math.abs(Math.sin(ph)) * 0.04 * walk + run * 0.02;
  rig.hips.rotation.set(0, Math.sin(ph) * 0.08 * walk, 0);
  // tronco: mira + reação
  rig.spine.rotation.set(s.aimPitch * 0.6 - crouch * 0.28 + (s.hitX || 0) - run * 0.14, s.aimYaw * 0.6, (s.hitZ || 0) + Math.sin(ph) * 0.04 * walk);
  rig.neck.rotation.set(s.aimPitch * 0.3 + crouch * 0.2, s.aimYaw * 0.4, 0);
  // arma: pronta (mira) ou baixa (correndo)
  const ready = s.ready ?? 1;
  rig.gun.position.set(0.13 - ready * 0.05, 0.36 + ready * 0.11, -0.3 - ready * 0.04);
  rig.gun.rotation.set(-0.5 * (1 - ready) - s.aimPitch * 0.0 + (s.recoil || 0), 0.35 * (1 - ready), 0.3 * (1 - ready));
  rig.gun.updateMatrix();
  // mãos nas empunhaduras da arma (no espaço do tronco)
  const hR = rig.grips.R.clone().applyMatrix4(rig.gun.matrix);
  const hL = rig.grips.L.clone().applyMatrix4(rig.gun.matrix);
  solveArm(rig, 'R', hR);
  solveArm(rig, 'L', hL);
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
void Y; void _m;
