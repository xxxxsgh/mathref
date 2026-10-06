/**
 * Montagem das armas do loadout na viewmodel: modelo, poses-base (hip, ADS,
 * corrida), pegas das mãos resolvidas contra a geometria real, trilhas de
 * animação (recarga, inspeção, saque, guarda) e cápsulas de oclusão.
 *
 * Cada `make*` devolve um objeto "arma" com a mesma forma, consumido por
 * index.js — a feature troca de arma reparentando as mãos e trocando o
 * objeto ativo.
 */
import * as THREE from 'three';
import { buildRifle, buildMag, buildCasing } from './rifle.js';
import { buildPistol, buildCasing9 } from './pistol.js';
import { makeLens } from './optic.js';
import { POSES, clonePose, FINGERS } from './arms.js';
import { solveClamp, fitHand, sdBox3, sdCapsule } from './grip.js';
import { Track } from './anim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Base por eixos x/y aproximados (ortonormalizada). */
export function basis(xAxis, yAxis, pos) {
  const x = new THREE.Vector3(...xAxis).normalize();
  const y0 = new THREE.Vector3(...yAxis);
  const z = new THREE.Vector3().crossVectors(x, y0).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return { pos: new THREE.Vector3(...pos), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
}
/** Base por direção dos dedos F (= −Z da mão) e do dorso D (= +Y). */
export function basisFD(F, D, pos) {
  const z = new THREE.Vector3(...F).normalize().negate();
  const y = new THREE.Vector3(...D);
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return { pos: new THREE.Vector3(...pos), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
}
const pose6 = (p, r) => ({ pos: V(...p), rot: new THREE.Euler(...r) });

/** Guarda (troca de arma): a arma desce e gira para fora do quadro. */
function makeHolster(T, k = 1) {
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: T, v: [0.03 * k, -0.26, 0.07, -0.85, 0.25, 0.45], e: 'in' },
  ]);
  return { name: 'holster', duration: T, gun, busy: true };
}

// ═════════════════════════════════════════════════════════════════════════
// KR-9 (fuzil)
// ═════════════════════════════════════════════════════════════════════════
// hip: pega POR CIMA do guarda-mão, perto do receptor (a mão fica grande e
// legível no quadro: dorso e nós voltados para a câmera, dedos abraçando o
// trilho, polegar no flanco esquerdo-baixo); ADS: C-clamp baixo (nada entra
// na janela da ótica)
export const RIFLE_GRIP = { phi: 2.9, z: -0.34, fwd: 0.2, thumbUp: -0.012, thumbX: -0.026, over: true, roll: 0.5 };
export const RIFLE_GRIP_ADS = { phi: 4.1, z: -0.32, fwd: 0.35, thumbUp: -0.014 };

function rifleReload(empty) {
  const T = empty ? 2.75 : 2.3;
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.3, v: [-0.095, 0.095, -0.035, 0.1, 0.4, -0.275], e: 'inOut' },
    { t: 0.6, v: [-0.1, 0.1, -0.03, 0.13, 0.43, -0.303] },
    { t: 1.15, v: [-0.105, 0.098, -0.03, 0.1, 0.44, -0.319] },
    { t: 1.42, v: [-0.101, 0.1, -0.03, 0.12, 0.42, -0.297], e: 'inOut' },
    { t: 1.5, v: [-0.101, 0.114, -0.032, 0.17, 0.41, -0.275], e: 'out' }, // encaixe: tranco p/ cima
    { t: 1.62, v: [-0.099, 0.104, -0.03, 0.13, 0.41, -0.286] },
    ...(empty
      ? [
          { t: 1.95, v: [-0.085, 0.09, -0.04, 0.06, 0.5, -0.165] },
          { t: 2.08, v: [-0.087, 0.096, -0.025, 0.1, 0.52, -0.154], e: 'out' }, // retém liberado
          { t: 2.75, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
        ]
      : [{ t: 2.3, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' }]),
  ]);
  const mag = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.42, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.52, v: [0, -0.05, 0.004, 0.05, 0, 0], e: 'in' },
    { t: 0.8, v: [-0.08, -0.32, 0.08, 0.5, 0.3, 0.6], e: 'in' },
    { t: 0.81, v: [-0.06, -0.34, 0.06, -0.3, 0.2, 0.4], e: 'linear' }, // troca fora da tela
    { t: 1.18, v: [0, -0.07, 0.006, 0.06, 0, 0.05], e: 'out3' },
    { t: 1.44, v: [0, -0.012, 0.0, 0.0, 0, 0], e: 'inOut' },
    { t: 1.5, v: [0, 0, 0, 0, 0, 0], e: 'out' },
    { t: 3, v: [0, 0, 0, 0, 0, 0] },
  ]);
  const hand = new Track([
    { t: 0, v: [1, 0, 0, 0] },
    { t: 0.4, v: [0, 1, 0, 0], e: 'inOut' },
    { t: 1.48, v: [0, 1, 0, 0] },
    { t: 1.56, v: [0, 0, 1, 0], e: 'out' },
    { t: 1.68, v: [0, 0, 1, 0] },
    ...(empty
      ? [
          { t: 1.95, v: [0, 0, 0, 1], e: 'inOut' },
          { t: 2.1, v: [0, 0, 0, 1] },
          { t: 2.55, v: [1, 0, 0, 0], e: 'inOut' },
        ]
      : [{ t: 2.12, v: [1, 0, 0, 0], e: 'inOut' }]),
  ]);
  // retém do ferrolho: pressionado no tapa (vazio)
  const catchT = new Track([{ t: 0, v: [0] }, { t: 2.02, v: [0] }, { t: 2.07, v: [1], e: 'out' }, { t: 2.2, v: [0] }]);
  return {
    name: empty ? 'reloadEmpty' : 'reload', duration: T, gun, mag, hand, catchT, insertAt: 1.5, swapAt: 0.81, busy: true,
    foley: [[0.45, 'mag_out'], [1.48, 'mag_in'], ...(empty ? [[2.06, 'bolt_release']] : [])],
  };
}
function rifleInspect() {
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.55, v: [-0.075, 0.06, 0.02, 0.12, 0.75, -0.28], e: 'inOut5' },
    { t: 1.5, v: [-0.08, 0.065, 0.015, 0.16, 0.82, -0.3] },
    { t: 2.1, v: [-0.03, 0.06, 0.03, 0.25, -0.35, 0.75], e: 'inOut5' },
    { t: 2.9, v: [-0.028, 0.062, 0.028, 0.28, -0.4, 0.8] },
    { t: 3.6, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
  ]);
  return { name: 'inspect', duration: 3.6, gun };
}
function rifleEquip() {
  const gun = new Track([
    { t: 0, v: [0.05, -0.28, 0.05, -0.9, 0.25, 0.5] },
    { t: 0.5, v: [0, 0.006, 0, 0.03, 0, -0.02], e: 'out3' },
    { t: 0.68, v: [0, 0, 0, 0, 0, 0], e: 'inOut' },
  ]);
  return { name: 'equip', duration: 0.68, gun, busy: true, leftIn: [0.25, 0.6] };
}

export function makeRifle(M, handR, handL, params) {
  const R = buildRifle(M);
  const pivot = V(0, -0.035, -0.14); // perto do poço do carregador
  R.root.position.copy(pivot).negate();
  const ow = R.opticWindow;
  const lens = makeLens({ w: ow.w, h: ow.h });
  lens.position.set(0, ow.y, (ow.z0 + ow.z1) / 2 + 0.006);
  R.root.add(lens);
  const magSpare = buildMag(M);
  magSpare.visible = false;
  R.root.add(magSpare);

  const eyeRelief = 0.2;
  // hip: guarda-mão girado ~11° para a esquerda — a mão de apoio aparece de
  // lado (dorso, nós e dedos por cima do trilho) em vez de "de punho"
  const hip = pose6([0.105, -0.152, -0.425], [0.045, 0.2, -0.05]);
  const ads = pose6([0, 0, 0], [0, 0, 0]);
  ads.pos.set(0, 0, -eyeRelief).sub(R.sight.clone().sub(pivot));
  const sprint = pose6([-0.03, -0.045, 0.03], [-0.32, 0.62, 0.42]);

  // ─ mãos ─
  R.root.add(handR.root, handL.root);
  const hR = basis([0.06, -1, -0.18], [1, 0.05, 0.12], [0.034, -0.088, 0.052]);
  handR.root.position.copy(hR.pos);
  handR.root.quaternion.copy(hR.quat);
  const G = { ...RIFLE_GRIP };
  const wg = params.get('wgrip');
  if (wg) {
    const [phi, fwd, thumbUp, z, over, thumbX, roll] = wg.split(',').map(Number);
    Object.assign(G, { phi, fwd, thumbUp, over: !!over }, Number.isFinite(z) ? { z } : {}, Number.isFinite(thumbX) ? { thumbX } : {}, Number.isFinite(roll) ? { roll } : {});
  }
  // mão direita: médio/anelar/mínimo abraçam o punho; indicador na face do
  // gatilho; polegar por cima, no flanco esquerdo do receptor
  const fitR = fitHand(handR, R.root, {
    sdf: rifleGripSdf,
    fingers: [1, 2, 3],
    base: POSES.trigger,
    gap: 0.0008,
    indexTarget: V(0.0, -0.06, -0.084),
    thumb: { target: V(-0.021, -0.04, -0.07), weight: 40 },
  });
  const poseTrigger = fitR.pose;
  const poseGrip = clonePose(poseTrigger);
  poseGrip.f[0] = [0.3, 0.35, 0.15];
  const c0 = solveClamp(handL, R.root, G);
  const cA = solveClamp(handL, R.root, RIFLE_GRIP_ADS);

  const occ = (hl, hr) => [
    { o: R.root, a: V(0, -0.007, -0.25), b: V(0, -0.007, -0.578), r: 0.0235 }, // guarda-mão
    { o: hl.thumb[1], a: V(0, 0, 0.004), b: V(0, 0, -0.03), r: 0.011 }, // polegar esq.
    { o: R.root, a: V(0, -0.045, -0.53), b: V(0, -0.045, -0.555), r: 0.011 }, // batente
    { o: R.root, a: V(0, -0.052, -0.035), b: V(0, -0.148, -0.0), r: 0.0155 }, // punho
    { o: R.root, a: V(0, 0.0315, -0.072), b: V(0, 0.0315, -0.148), r: 0.016 }, // base da ótica
    { o: R.root, a: V(0, 0.05, -0.096), b: V(0, 0.05, -0.13), r: 0.02 }, // capô da ótica
    { o: R.root, a: V(0, -0.012, -0.01), b: V(0, -0.012, -0.225), r: 0.02 }, // receptor
    { o: R.mag, a: V(0, -0.01, 0.0), b: V(0.036, -0.17, 0.0), r: 0.016 }, // carregador
    { o: hl.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 }, // palma esq.
    { o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 }, // palma dir.
    { o: R.root, a: V(0, -0.004, 0.0), b: V(0, -0.004, 0.2), r: 0.0148 }, // tubo da coronha
  ];

  return {
    id: 'kr9', kind: 'rifle', R, root: R.root, pivot, lens, magSpare,
    hip, ads, sprint, vmFov: { hip: 50, ads: 19 },
    handR: hR, poseGrip, poseTrigger,
    gripL: { pos: c0.pos, quat: c0.quat, pose: c0.pose }, gripLAds: { pos: cA.pos, quat: cA.quat, pose: cA.pose },
    magRest: { pos: V(0, -0.05, -0.172), rot: new THREE.Euler(0, 0, 0) },
    magGrip: basisFD([0.1, -0.25, -1], [-1, 0.05, 0], [-0.034, -0.12, 0.06]),
    slap: basisFD([0.3, 0.1, -1], [-0.2, -1, 0], [-0.01, -0.268, -0.11]),
    catchGrip: basisFD([0, 0.3, -1], [-1, 0, 0], [-0.042, -0.055, -0.075]),
    catchObj: R.boltCatch, catchRot: (p) => (R.boltCatch.rotation.z = -p * 0.25),
    anims: { reload: rifleReload(false), reloadEmpty: rifleReload(true), inspect: rifleInspect(), equip: rifleEquip(), holster: makeHolster(0.32) },
    occ, casing: buildCasing(M),
    recoil: { z: 0.55, x: 0.9, xAds: 0.35, climb: 0.0042, climbAds: 0.0032, kick: 0.09 },
    // anchors dos antebraços (ombros) no espaço do rig
    anchorL: V(-0.25, -0.65, -0.15), followL: 0, wristL: 0.4,
  };
}

/** SDF do punho do fuzil (caixa inclinada) ∪ receptor inferior/guarda-mato. */
const RIFLE_TILT = 0.26;
const _rq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -RIFLE_TILT);
const _rp = new THREE.Vector3();
function rifleGripSdf(p) {
  _rp.set(p.x, p.y + 0.1, p.z + 0.008).applyQuaternion(_rq);
  const grip = sdBox3(_rp, { x: 0, y: 0, z: 0 }, { x: 0.0145, y: 0.056, z: 0.0215 }, 0.0075);
  const lower = sdBox3(p, { x: 0, y: -0.03, z: -0.1 }, { x: 0.016, y: 0.016, z: 0.1 }, 0.003);
  const guard = sdBox3(p, { x: 0, y: -0.068, z: -0.085 }, { x: 0.006, y: 0.004, z: 0.03 }, 0.002);
  return Math.min(grip, lower, guard);
}

// ═════════════════════════════════════════════════════════════════════════
// P-11 (pistola)
// ═════════════════════════════════════════════════════════════════════════
const GRIP_TILT = 0.21; // inclinação do punho (rad)
const _gq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -GRIP_TILT);
const _gp = new THREE.Vector3();
/** SDF do punho da pistola (caixa arredondada inclinada) ∪ armação. */
function pistolGripSdf(p, pad = 0) {
  _gp.set(p.x, p.y + 0.068, p.z + 0.008).applyQuaternion(_gq);
  const grip = sdBox3(_gp, { x: 0, y: 0, z: 0 }, { x: 0.0149 + pad, y: 0.05, z: 0.0255 + pad }, 0.0085);
  const frame = sdBox3(p, { x: 0, y: -0.004, z: -0.09 }, { x: 0.0122, y: 0.0175, z: 0.09 }, 0.003);
  return Math.min(grip, frame);
}
function pistolReload(empty) {
  const T = empty ? 1.95 : 1.6;
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.22, v: [-0.03, 0.05, -0.01, 0.22, 0.32, -0.32], e: 'inOut' },
    { t: 0.95, v: [-0.035, 0.055, -0.012, 0.26, 0.36, -0.36] },
    { t: 1.03, v: [-0.035, 0.07, -0.014, 0.33, 0.35, -0.33], e: 'out' }, // encaixe
    { t: 1.15, v: [-0.034, 0.058, -0.012, 0.26, 0.35, -0.35] },
    ...(empty
      ? [
          { t: 1.42, v: [-0.03, 0.05, -0.012, 0.2, 0.3, -0.25] },
          { t: 1.5, v: [-0.03, 0.058, -0.004, 0.27, 0.3, -0.25], e: 'out' }, // ferrolho fecha
          { t: 1.95, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
        ]
      : [{ t: 1.6, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' }]),
  ]);
  // carregador: desliza pelo eixo do punho (−Y local inclinado)
  const ax = (d) => [0, -Math.cos(GRIP_TILT) * d, Math.sin(GRIP_TILT) * d];
  const mag = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.16, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.24, v: [...ax(0.04), 0, 0, 0], e: 'in' },
    { t: 0.45, v: [...ax(0.3).map((x, i) => x + [0.01, 0, 0.02][i]), 0.4, 0.1, 0.3], e: 'in' },
    { t: 0.46, v: [-0.05, -0.25, 0.07, 0.5, 0.1, 0.4], e: 'linear' }, // troca fora da tela
    { t: 0.85, v: [...ax(0.05), 0.08, 0, 0.03], e: 'out3' },
    { t: 1.0, v: [...ax(0.008), 0, 0, 0], e: 'inOut' },
    { t: 1.03, v: [0, 0, 0, 0, 0, 0], e: 'out' },
    { t: 3, v: [0, 0, 0, 0, 0, 0] },
  ]);
  const hand = new Track([
    { t: 0, v: [1, 0, 0, 0] },
    { t: 0.28, v: [0, 1, 0, 0], e: 'inOut' },
    { t: 1.01, v: [0, 1, 0, 0] },
    { t: 1.07, v: [0, 0, 1, 0], e: 'out' },
    { t: 1.16, v: [0, 0, 1, 0] },
    ...(empty
      ? [
          { t: 1.36, v: [0, 0, 0, 1], e: 'inOut' },
          { t: 1.5, v: [0, 0, 0, 1] },
          { t: 1.8, v: [1, 0, 0, 0], e: 'inOut' },
        ]
      : [{ t: 1.48, v: [1, 0, 0, 0], e: 'inOut' }]),
  ]);
  const catchT = new Track([{ t: 0, v: [0] }, { t: 1.44, v: [0] }, { t: 1.48, v: [1], e: 'out' }, { t: 1.6, v: [0] }]);
  return {
    name: empty ? 'reloadEmpty' : 'reload', duration: T, gun, mag, hand, catchT, insertAt: 1.03, swapAt: 0.46, busy: true,
    slideReleaseAt: empty ? 1.48 : null,
    foley: [[0.2, 'mag_out'], [1.02, 'mag_in'], ...(empty ? [[1.48, 'bolt_release']] : [])],
  };
}
function pistolInspect() {
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.5, v: [-0.04, 0.05, 0.03, 0.15, 0.85, -0.25], e: 'inOut5' },
    { t: 1.3, v: [-0.045, 0.055, 0.025, 0.18, 0.9, -0.28] },
    { t: 1.9, v: [0.0, 0.05, 0.04, 0.3, -0.6, 0.85], e: 'inOut5' },
    { t: 2.6, v: [0.0, 0.052, 0.038, 0.32, -0.65, 0.9] },
    { t: 3.2, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
  ]);
  return { name: 'inspect', duration: 3.2, gun };
}
function pistolEquip() {
  const gun = new Track([
    { t: 0, v: [0.07, -0.24, 0.08, -1.1, 0.3, 0.35] },
    { t: 0.36, v: [0, 0.008, 0, 0.05, 0, -0.03], e: 'out3' },
    { t: 0.5, v: [0, 0, 0, 0, 0, 0], e: 'inOut' },
  ]);
  return { name: 'equip', duration: 0.5, gun, busy: true, leftIn: [0.18, 0.42] };
}

export function makePistol(M, handR, handL, params) {
  const R = buildPistol(M);
  const pivot = V(0, -0.03, -0.03);
  R.root.position.copy(pivot).negate();
  const eyeRelief = 0.34;
  // hip: duas mãos, braços estendidos, baixa e à direita do centro
  // (mais baixa e mais de flanco: os polegares deitam no flanco esquerdo e o
  // dorso das mãos aparece, em vez de só os punhos vistos de trás)
  const hip = pose6([0.1, -0.125, -0.44], [-0.05, 0.6, -0.18]);
  const ads = pose6([0, 0, 0], [0, 0, 0]);
  ads.pos.set(0, 0, -eyeRelief).sub(R.sight.clone().sub(pivot));
  const sprint = pose6([0.02, -0.08, 0.06], [-0.55, 0.35, 0.25]);

  // ─ mão direita: punho alto sob o rabo-de-castor, indicador no gatilho ─
  R.root.add(handR.root, handL.root);
  const wr = params.get('wpr');
  // ?wpr=dx,dy,dz,px,py,pz — dorso da mão direita e ponto da palma (QA)
  const hrV = wr ? wr.split(',').map(Number) : [1, 0.0, 0.45, 0.015, -0.056, 0.02];
  const hR = basis([0.06, -1, -0.2], hrV.slice(0, 3), [0, 0, 0]);
  hR.pos.copy(V(hrV[3], hrV[4], hrV[5])).sub(V(0, -0.0195, -0.05).applyQuaternion(hR.quat));
  handR.root.position.copy(hR.pos);
  handR.root.quaternion.copy(hR.quat);
  // dedos médio/anelar/mínimo abraçam o punho; polegar para a frente no flanco esquerdo
  // ?wprt=tx,ty,tz,mx,my,mz,teto — alvo da ponta/da junta MCP do polegar direito (QA)
  const tR = params.get('wprt')?.split(',').map(Number) || [-0.022, -0.022, -0.028, -0.012, -0.032, 0.026, -0.012];
  const fitR = fitHand(handR, R.root, {
    sdf: (p) => pistolGripSdf(p),
    fingers: [1, 2, 3],
    base: POSES.trigger,
    indexTarget: V(0.0, -0.032, -0.0655), // face do gatilho
    gap: 0.0008,
    // polegar deitado no flanco esquerdo da armação, ABAIXO do ferrolho,
    // apontando para o alvo; a membrana fica sob o rabo-de-castor
    thumb: { target: V(tR[0], tR[1], tR[2]), weight: 60, mcpTarget: V(tR[3], tR[4], tR[5]), mcpWeight: 200, ceilY: tR[6], lim: [[-0.8, 2.4], [-0.8, 1.6], [-1.6, 1.6], [-0.1, 0.9], [-0.1, 0.9]] },
  });
  const poseTrigger = fitR.pose;
  const poseGrip = clonePose(poseTrigger);
  poseGrip.f[0] = [0.25, 0.3, 0.15]; // indicador estendido ao lado da armação

  // ─ mão esquerda (apoio): palma no flanco esquerdo do punho, dedos sobre os
  // da direita (sob o guarda-mato), polegar apontando para o alvo ─
  const wl = params.get('wpl');
  const L = wl ? wl.split(',').map(Number) : [0.25, -0.3, -0.9, -1, 0.25, 0.1, -0.02, -0.072, -0.022];
  const F = V(L[0], L[1], L[2]).normalize();
  const Dd = V(L[3], L[4], L[5]);
  const palmC = V(L[6], L[7], L[8]);
  const bl = basisFD(F.toArray(), Dd.toArray(), [0, 0, 0]);
  // palma (0, −0.0195, −0.05 local) sobre palmC
  const off = V(0, -0.0195, -0.05).applyQuaternion(bl.quat);
  bl.pos.copy(palmC).sub(off);
  handL.root.position.copy(bl.pos);
  handL.root.quaternion.copy(bl.quat);
  // os dedos da mão direita (pose final) viram cápsulas: a esquerda abraça
  // a geometria REAL deles, não uma caixa aproximada
  handR.apply(poseTrigger);
  R.root.updateMatrixWorld(true);
  const inv = R.root.matrixWorld.clone().invert();
  const caps = [];
  const at = (o, l) => new THREE.Vector3(...l).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
  handR.fingers.forEach((j, i) => {
    const f = FINGERS[i];
    for (let k = 0; k < 3; k++) caps.push([at(j[k], [0, 0, 0]), at(j[k], [0, 0, -f.L[k]]), f.r * (1 - k * 0.07)]);
  });
  // palma direita (lado direito do punho)
  caps.push([at(handR.root, [0, 0, -0.03]), at(handR.root, [0, 0, -0.07]), 0.018]);
  const tgC = V(0, -0.034, -0.07), tgH = V(0.0045, 0.0135, 0.03);
  const fistSdf = (p) => {
    // + guarda-mato: o indicador esquerdo passa por BAIXO dele
    let d = Math.min(pistolGripSdf(p), sdBox3(p, tgC, tgH, 0.003));
    for (const [a, b, r] of caps) d = Math.min(d, sdCapsule(p, a, b, r));
    return d;
  };
  // ?wplt=tx,ty,tz,teto — alvo da ponta do polegar esquerdo (QA)
  const tL = params.get('wplt')?.split(',').map(Number) || [-0.021, -0.032, -0.088, -0.012];
  const fitL = fitHand(handL, R.root, {
    sdf: fistSdf,
    minFlex: [0.25, 0.3, 0.2],
    gap: 0.0008,
    spread: [0.04, 0.0, -0.04, -0.09],
    thumb: { target: V(tL[0], tL[1], tL[2]), weight: 60, ceilY: tL[3] },
  });
  // ADS: mesma pega (a pistola sobe inteira até o olho)
  const gripL = { pos: bl.pos.clone(), quat: bl.quat.clone(), pose: fitL.pose };

  const occ = (hl, hr) => [
    { o: R.root, a: V(0, -0.03, -0.012), b: V(0, -0.1, 0.004), r: 0.017 }, // punho
    { o: R.slide, a: V(0, 0.003, 0.0), b: V(0, 0.003, -0.18), r: 0.0135 }, // ferrolho
    { o: R.root, a: V(0, -0.016, -0.04), b: V(0, -0.016, -0.17), r: 0.012 }, // armação
    { o: R.mag, a: V(0, -0.01, 0.0), b: V(0, -0.09, 0.0), r: 0.013 }, // carregador
    { o: hl.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.028 }, // palma esq.
    { o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.028 }, // palma dir.
    { o: hl.thumb[1], a: V(0, 0, 0.004), b: V(0, 0, -0.03), r: 0.01 }, // polegar esq.
  ];

  return {
    id: 'p11', kind: 'pistol', R, root: R.root, pivot, lens: null, magSpare: null,
    hip, ads, sprint, vmFov: { hip: 50, ads: 38 },
    handR: hR, poseGrip, poseTrigger,
    gripL, gripLAds: gripL,
    magRest: { pos: R.magBase.pos.clone(), rot: new THREE.Euler(R.magBase.rotX, 0, 0) },
    magGrip: basisFD([0.1, 0.55, -0.8], [-1, 0.05, 0.1], [-0.026, -0.165, 0.06]),
    slap: basisFD([0.05, 0.08, -1], [0.0, -1, 0], [0.0, -0.152, 0.055]),
    catchGrip: basisFD([0.25, -0.35, -1], [-1, 0.15, 0], [-0.05, -0.045, 0.025]),
    catchObj: R.slideStop, catchRot: (p) => (R.slideStop.rotation.z = -p * 0.18),
    anims: { reload: pistolReload(false), reloadEmpty: pistolReload(true), inspect: pistolInspect(), equip: pistolEquip(), holster: makeHolster(0.26, 1.4) },
    occ, casing: buildCasing9(M),
    recoil: { z: 0.4, x: 1.25, xAds: 0.7, climb: 0.0055, climbAds: 0.0045, kick: 0.11, slide: true },
    anchorL: V(-0.42, -0.55, -0.1), followL: 0.0, wristL: 0.8,
    anchorR: V(0.24, -0.55, -0.05),
  };
}
