/**
 * Montagem genérica das armas longas novas na viewmodel (mesma forma de
 * objeto que `makeRifle`/`makePistol` devolvem, consumida por index.js):
 * pivô, poses hip/ADS/corrida, pega da mão direita no punho (gabarito do
 * KR-9: mesma SDF, mesmo resolvedor), pega da mão de apoio resolvida contra
 * o guarda-mão/telha REAL de cada arma (SDF própria), trilhas de animação e
 * cápsulas de oclusão.
 *
 * Também: utilitários de trilha (escala de tempo de uma ação, inspeção
 * genérica parametrizada) usados pelos arquivos de cada arma.
 */
import * as THREE from 'three';
import { POSES, clonePose } from './arms.js';
import { solveClamp, fitHand } from './grip.js';
import { basis, rifleGripSdf, makeHolster, rifleEquip } from './guns.js';
import { Track } from './anim.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const pose6 = (p, r) => ({ pos: V(...p), rot: new THREE.Euler(...r) });

/** Clona uma trilha com os tempos multiplicados por k. */
export function scaleTrack(tr, k) {
  return new Track(tr.keys.map((key) => ({ ...key, t: key.t * k, v: key.v.slice() })), tr.defEase);
}
/** Clona uma ação (trilhas + instantes) com o tempo multiplicado por k. */
export function scaleAction(a, k, extra = {}) {
  const out = { ...a, duration: a.duration * k };
  for (const n of ['gun', 'mag', 'hand', 'catchT', 'aux']) if (a[n]) out[n] = scaleTrack(a[n], k);
  for (const n of ['insertAt', 'swapAt', 'slideReleaseAt', 'hitAt', 'pinAt', 'releaseAt']) if (a[n] != null) out[n] = a[n] * k;
  if (a.leftIn) out.leftIn = a.leftIn.map((t) => t * k);
  if (a.foley) out.foley = a.foley.map(([t, n]) => [t * k, n]);
  return Object.assign(out, extra);
}

/**
 * Inspeção genérica: olha o flanco esquerdo, gira para o direito e volta.
 * `L`/`R` = [px,py,pz,rx,ry,rz] das duas poses; T = duração.
 */
export function inspectTrack(T, L, R, { mid = null } = {}) {
  const k = T / 3.6;
  const keys = [
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.55 * k, v: L, e: 'inOut5' },
    { t: 1.5 * k, v: L.map((x, i) => x * (i >= 3 ? 1.06 : 1.02)) },
  ];
  if (mid) keys.push({ t: 1.85 * k, v: mid, e: 'inOut' });
  keys.push({ t: 2.1 * k + (mid ? 0.25 * k : 0), v: R, e: 'inOut5' }, { t: 2.9 * k + (mid ? 0.2 * k : 0), v: R.map((x, i) => x * (i >= 3 ? 1.05 : 1.02)) }, { t: T, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' });
  return { name: 'inspect', duration: T, gun: new Track(keys) };
}

/** Saque escalado para `draw` s. */
export function equipFor(draw) {
  return scaleAction(rifleEquip(), draw / 0.68);
}

/**
 * Monta a arma. cfg:
 *  id, kind, R (modelo: root, mag, trigger, muzzle, ejectPort, sight…),
 *  pivot, hip, sprint, eyeRelief, vmFov, guardSdf, guardCy, grip, gripAds,
 *  magRest, magGrip, slap, catchGrip, catchRot, anims, occ, casing, recoil,
 *  anchorL, followL, wristL, extra (campos somados ao objeto).
 */
export function assembleLongGun(M, handR, handL, params, cfg) {
  const R = cfg.R;
  const pivot = cfg.pivot || V(0, -0.035, -0.14);
  R.root.position.copy(pivot).negate();
  const hip = pose6(...cfg.hip);
  const sprint = pose6(...cfg.sprint);
  const ads = pose6([0, 0, 0], [0, 0, 0]);
  const setSight = (sight, eyeRelief) => {
    ads.pos.set(0, 0, -eyeRelief).sub(sight.clone().sub(pivot));
  };
  setSight(R.sight, cfg.eyeRelief);

  // ─ mão direita: punho no gabarito do KR-9 ─
  R.root.add(handR.root, handL.root);
  const hR = basis([0.06, -1, -0.18], [1, 0.05, 0.12], [0.034, -0.088, 0.052]);
  handR.root.position.copy(hR.pos);
  handR.root.quaternion.copy(hR.quat);
  const fitR = fitHand(handR, R.root, {
    sdf: cfg.gripSdf || rifleGripSdf,
    fingers: [1, 2, 3],
    base: POSES.trigger,
    gap: 0.0008,
    indexTarget: V(0.0, -0.06, -0.084),
    thumb: { target: cfg.thumbR || V(-0.021, -0.04, -0.07), weight: 40 },
  });
  const poseTrigger = fitR.pose;
  const poseGrip = clonePose(poseTrigger);
  poseGrip.f[0] = [0.3, 0.35, 0.15];

  // ─ mão de apoio: resolvida contra a SDF do guarda-mão/telha desta arma ─
  const G = { ...cfg.grip, sdf: cfg.guardSdf, cy: cfg.guardCy };
  const wg = params?.get?.('wgrip');
  if (wg && cfg.id === params.get('wgripid')) {
    const [phi, fwd, thumbUp, z, over, thumbX, roll] = wg.split(',').map(Number);
    Object.assign(G, { phi, fwd, thumbUp, over: !!over }, Number.isFinite(z) ? { z } : {}, Number.isFinite(thumbX) ? { thumbX } : {}, Number.isFinite(roll) ? { roll } : {});
  }
  const c0 = solveClamp(handL, R.root, G);
  const cA = cfg.gripAds ? solveClamp(handL, R.root, { ...cfg.gripAds, sdf: cfg.guardSdf, cy: cfg.guardCy }) : c0;

  const g = {
    id: cfg.id, kind: cfg.kind, R, root: R.root, pivot, lens: R.lens || null, magSpare: null,
    hip, ads, sprint, vmFov: { ...cfg.vmFov }, setSight, eyeRelief: cfg.eyeRelief, adsBase: { sight: R.sight.clone(), eyeRelief: cfg.eyeRelief, vmFov: cfg.vmFov.ads },
    handR: hR, poseGrip, poseTrigger,
    gripL: { pos: c0.pos, quat: c0.quat, pose: c0.pose }, gripLAds: { pos: cA.pos, quat: cA.quat, pose: cA.pose },
    magRest: cfg.magRest, magGrip: cfg.magGrip, slap: cfg.slap, catchGrip: cfg.catchGrip,
    catchRot: cfg.catchRot || (() => {}),
    anims: cfg.anims, occ: cfg.occ, casing: cfg.casing,
    recoil: cfg.recoil,
    anchorL: cfg.anchorL || V(-0.25, -0.65, -0.15), followL: cfg.followL ?? 0, wristL: cfg.wristL ?? 0.4,
    anchorR: cfg.anchorR,
    mounts: R.mounts || {}, cosmetic: R.cosmetic || {}, opticRoot: R.opticRoot || null,
    adsFovScope: cfg.adsFovScope,
    ...(cfg.extra || {}),
  };
  if (cfg.animate) g.animate = (info) => cfg.animate(g, info);
  if (cfg.shellReload) g.shellReload = cfg.shellReload;
  if (!g.anims.holster) g.anims.holster = makeHolster(cfg.holster || 0.32);
  return g;
}
