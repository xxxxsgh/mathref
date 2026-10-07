/**
 * Submetralhadora "MX-9" (design original do IRONLINE): 9 mm, ferrolho
 * fechado, receptor superior monolítico com caneluras de alívio, manejo
 * lateral (não recíproco) no lado esquerdo, guarda-mão octogonal curto com
 * M-LOK, compensador, carregador reto de 32, coronha telescópica de duas
 * hastes com soleira de borracha e mira reflexa compacta.
 *
 * Mesma convenção e mesmo gabarito de punho/gatilho do KR-9 (ver parts.js).
 */
import * as THREE from 'three';
import { Kit, side, section, rbox, cylZ, cylX, cylY, torus } from './geo.js';
import { picatinny, railAt, slot, pistolGrip, triggerGuard, buildTrigger, buildSelector, swivel, pin, screw, muzzleDevice, buildReflex } from './parts.js';
import { buildCasing9 } from './pistol.js';
import { makeGuardSdf } from './grip.js';
import { basisFD, rifleReload } from './guns.js';
import { assembleLongGun, scaleAction, inspectTrack, equipFor, V } from './rig.js';
import { Track } from './anim.js';

const TOP = 0.019; // topo do receptor superior
const HG = [0.215, 0.338]; // guarda-mão (u)

export function buildMX9(M) {
  const root = new THREE.Group();
  root.name = 'MX-9';
  const K = new Kit();

  // ─── receptor superior ─────────────────────────────────────────────
  K.add('receiver', side([
    [0.0, -0.016], [0.215, -0.016], [0.219, -0.012], [0.219, TOP - 0.003], [0.215, TOP],
    [0.016, TOP], [0.006, TOP - 0.006], [0.0, TOP - 0.009],
  ], 0.031, { b: 0.0018, seg: 3 }));
  // caneluras de alívio (três sulcos longos) nos dois flancos
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const v = 0.011 - i * 0.0075;
      K.add('cavity', rbox(0.0012, 0.0032, i === 1 ? 0.07 : 0.09, 0.0012, sx * 0.0153, v, -(0.135 + (i === 1 ? 0.01 : 0)), 2));
    }
  }
  // fenda do manejo lateral (esquerda) e a alavanca (dobrável, borracha)
  K.add('cavity', rbox(0.0012, 0.0055, 0.075, 0.0015, -0.0154, 0.0115, -0.16, 1));
  // janela de ejeção (direita) com defletor
  K.add('cavity', rbox(0.001, 0.012, 0.042, 0.0012, 0.0154, 0.001, -0.075, 1));
  K.add('steel', rbox(0.0016, 0.011, 0.04, 0.0006, 0.0156, 0.001, -0.075));
  K.add('receiver', rbox(0.006, 0.012, 0.01, 0.0018, 0.0175, 0.004, -0.045));
  picatinny(K, 'rail', 0.008, 0.335, TOP);

  // ─── guarda-mão octogonal com M-LOK ─────────────────────────────────
  {
    const oct = [];
    const hw = 0.0185, top = 0.0165, bot = -0.031, c = 0.006;
    oct.push([-hw + c, bot], [hw - c, bot], [hw, bot + c], [hw, top - c], [hw - c, top], [-hw + c, top], [-hw, top - c], [-hw, bot + c]);
    K.add('tan', section(oct, -HG[0], HG[1] - HG[0], { b: 0.0016, seg: 2 }));
    // ranhuras M-LOK (cavidades rasas) — laterais e fundo
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) K.add('cavity', rbox(0.0012, 0.0072, 0.028, 0.0034, sx * (hw + 0.0001), -0.008, -(HG[0] + 0.022 + i * 0.036), 2));
    for (let i = 0; i < 2; i++) K.add('cavity', rbox(0.0072, 0.0012, 0.028, 0.0034, 0, bot - 0.0001, -(HG[0] + 0.035 + i * 0.045), 2));
    // anel frontal e parafusos da braçadeira
    K.add('tan', section(oct.map(([x, y]) => [x * 1.06, y * 1.04 - 0.0005]), -(HG[1] - 0.008), 0.008, { b: 0.0012 }));
    for (const sx of [-1, 1]) screw(K, sx * 0.019, -0.022, -(HG[0] + 0.008), sx, 0.0019);
    // barreira de mão (degrau no fundo, na frente)
    K.add('tan', rbox(0.026, 0.012, 0.008, 0.003, 0, -0.035, -(HG[1] - 0.012)));
  }
  // ─── cano, rosca e compensador ──────────────────────────────────────
  K.add('steel', cylZ(0.0085, -HG[1], -(HG[1] + 0.024), { seg: 24 }));
  K.add('steel', cylZ(0.0072, -(HG[1] + 0.024), -(HG[1] + 0.032), { seg: 24 }));
  for (let i = 0; i < 6; i++) K.add('steel', cylZ(0.0076, -(HG[1] + 0.025 + i * 0.0012), -(HG[1] + 0.0255 + i * 0.0012), { seg: 24 }));
  const mlen = muzzleDevice(K, 'comp', HG[1] + 0.032, 0.0105);
  const muzzleU = HG[1] + 0.032 + mlen;

  // ─── receptor inferior + poço do carregador ─────────────────────────
  const lower = new THREE.Shape();
  lower.moveTo(-0.006, -0.0158);
  lower.lineTo(0.214, -0.0158);
  lower.lineTo(0.214, -0.026);
  lower.quadraticCurveTo(0.212, -0.034, 0.2, -0.036);
  lower.lineTo(0.198, -0.098);
  lower.quadraticCurveTo(0.2, -0.106, 0.206, -0.108);
  lower.lineTo(0.205, -0.113);
  lower.lineTo(0.13, -0.113);
  lower.lineTo(0.13, -0.106);
  lower.quadraticCurveTo(0.136, -0.103, 0.137, -0.096);
  lower.lineTo(0.138, -0.05);
  lower.lineTo(0.0, -0.049);
  lower.quadraticCurveTo(-0.01, -0.046, -0.012, -0.034);
  lower.lineTo(-0.012, -0.022);
  lower.quadraticCurveTo(-0.01, -0.016, -0.006, -0.0158);
  K.add('receiver', side(lower, 0.027, { b: 0.0018, seg: 3 }));
  // abas do poço (alargamento para carregar rápido) e janela de contagem
  for (const sx of [-1, 1]) {
    K.add('receiver', side([[0.14, -0.06], [0.196, -0.06], [0.194, -0.095], [0.142, -0.095]], 0.0016, { b: 0.0005, cx: sx * 0.0135 }));
    K.add('cavity', rbox(0.0012, 0.026, 0.0045, 0.0018, sx * 0.0146, -0.078, -0.168, 1));
  }
  triggerGuard(K, 'receiver');
  pistolGrip(K, { style: 1 });
  for (const [u, v] of [[0.004, -0.028], [0.205, -0.024], [0.07, -0.037], [0.088, -0.037]]) pin(K, u, v, 0.027, u < 0.05 || u > 0.2 ? 0.003 : 0.0022);
  // retém do carregador (ambos os lados) e alavanca de retém do ferrolho
  for (const sx of [-1, 1]) K.add('steel', rbox(0.003, 0.009, 0.012, 0.0014, sx * 0.0145, -0.043, -0.128));
  K.add('steel', rbox(0.0025, 0.016, 0.006, 0.001, -0.0145, -0.04, -0.118));
  swivel(K, 'steel', -0.016, -0.03, 0.0);

  // ─── coronha telescópica de duas hastes ─────────────────────────────
  K.add('receiver', rbox(0.034, 0.05, 0.016, 0.004, 0, -0.016, 0.006));
  for (const y of [0.006, -0.036]) {
    for (const sx of [-1, 1]) {
      K.add('steel', cylZ(0.0044, 0.0, 0.205, { x: sx * 0.0115, y, seg: 16 }));
    }
  }
  // trava da coronha (botão) e placa da soleira com borracha
  K.add('steel', rbox(0.01, 0.008, 0.012, 0.002, 0, -0.045, 0.012));
  const butt = new THREE.Shape();
  butt.moveTo(-0.2, 0.024);
  butt.lineTo(-0.214, 0.026);
  butt.lineTo(-0.218, -0.078);
  butt.lineTo(-0.204, -0.078);
  butt.quadraticCurveTo(-0.198, -0.03, -0.2, 0.024);
  K.add('polymer', side(butt, 0.038, { b: 0.006, seg: 3 }));
  K.add('rubber', side([[-0.216, 0.027], [-0.226, 0.027], [-0.228, -0.08], [-0.217, -0.08]], 0.04, { b: 0.005, seg: 3 }));
  for (let i = 0; i < 9; i++) K.add('cavity', rbox(0.04, 0.0012, 0.004, 0.0004, 0, 0.018 - i * 0.011, 0.2275, 1));
  swivel(K, 'steel', -0.02, -0.06, 0.205);

  root.add(K.build(M, 'mx9'));

  // ─── peças móveis ───────────────────────────────────────────────────
  // alavanca de manejo lateral (desliza +Z com o ferrolho na recarga vazia)
  const ch = new THREE.Group();
  ch.name = 'chargingHandle';
  {
    const k = new Kit();
    k.add('steel', rbox(0.006, 0.0045, 0.008, 0.0012, -0.018, 0.0115, 0));
    k.add('rubber', rbox(0.01, 0.009, 0.012, 0.003, -0.025, 0.0115, 0.001));
    ch.add(k.build(M, 'ch'));
    ch.position.set(0, 0, -0.192);
  }
  root.add(ch);
  const trigger = buildTrigger(M);
  root.add(trigger);
  const sel = buildSelector(M);
  root.add(sel);
  // retém do ferrolho (paleta) para a recarga vazia
  const boltCatch = new THREE.Group();
  {
    const k = new Kit();
    k.add('steel', side([[0, 0], [0.02, 0.0], [0.022, 0.005], [0.004, 0.008]], 0.0024, { b: 0.0006 }));
    boltCatch.add(k.build(M, 'bc'));
    boltCatch.position.set(-0.0148, -0.034, -0.11);
  }
  root.add(boltCatch);

  // carregador reto de 32 (pivô no topo do poço)
  const mag = new THREE.Group();
  mag.name = 'mag';
  mag.position.set(0, -0.05, -0.166);
  mag.add(buildStickMag(M));
  root.add(mag);

  // mira reflexa compacta
  const rx = buildReflex(M, { w: 0.024, h: 0.019, depth: 0.03, base: 0.005 });
  const railTop = TOP + 0.0035 + 0.0042;
  rx.root.position.set(0, railTop, -0.05);
  root.add(rx.root);
  // mira traseira de emergência rebatida (detalhe)
  {
    const k = new Kit();
    k.add('steel', rbox(0.018, 0.006, 0.012, 0.0015, 0, railTop + 0.003, -0.016));
    k.add('steel', rbox(0.014, 0.004, 0.02, 0.0012, 0, railTop + 0.0075, -0.012));
    root.add(k.build(M, 'buis'));
  }

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -(muzzleU + 0.004));
  root.add(muzzle);
  const ejectPort = new THREE.Object3D();
  ejectPort.position.set(0.016, 0.002, -0.075);
  root.add(ejectPort);

  return {
    root, mag, trigger, selector: sel, chargingHandle: ch, boltCatch, muzzle, ejectPort, lens: rx.lens,
    sight: new THREE.Vector3(0, railTop + rx.sightY, -0.05 + rx.sightZ),
    opticRoot: rx.root, railTop,
    mounts: {
      muzzle: { u: HG[1] + 0.032, r: 0.0105, base: mlen, dev: 'comp' },
      under: { u: HG[0] + 0.07, y: -0.031 },
      side: { u: HG[0] + 0.05, x: -0.0185, y: -0.006 },
      top: { u: 0.05, y: railTop },
    },
    cosmetic: {
      counter: { pos: V(-0.0158, 0.003, -0.04), rotY: -Math.PI / 2 },
      stickers: [
        { pos: V(-0.0136, -0.075, -0.186), n: V(-1, 0, 0), size: 0.022 },
        { pos: V(-0.0155, -0.004, -0.11), n: V(-1, 0, 0), size: 0.018 },
        { pos: V(-0.0185, -0.008, -0.29), n: V(-1, 0, 0), size: 0.02 },
        { pos: V(-0.019, -0.03, -0.192), n: V(-1, 0, 0), size: 0.016 },
      ],
      charm: V(-0.022, -0.03, 0.0),
    },
  };
}

/** Carregador reto 9 mm (aço com nervuras, base de polímero, cartucho no topo). */
export function buildStickMag(M) {
  const K = new Kit();
  const L = 0.165;
  K.add('steel', rbox(0.0205, L, 0.03, 0.003, 0, -L / 2 + 0.006, 0.001));
  for (const sx of [-1, 1]) {
    K.add('steel', rbox(0.0012, L - 0.03, 0.006, 0.0005, sx * 0.0105, -L / 2, -0.004));
    for (let i = 0; i < 6; i++) K.add('cavity', cylX(0.0011, 0.0006, sx * 0.0104, -0.03 - i * 0.02, 0.011, 10));
  }
  K.add('polymer', rbox(0.026, 0.012, 0.038, 0.003, 0, -L + 0.002, 0.002));
  K.add('rubber', rbox(0.022, 0.003, 0.034, 0.0012, 0, -L - 0.004, 0.002));
  K.add('steel', rbox(0.018, 0.004, 0.026, 0.0008, 0, 0.007, 0.002));
  const g = K.build(M, 'smag');
  const r = new Kit();
  r.add('brass', cylZ(0.0049, 0.012, -0.004, { y: 0.0125, seg: 16 }));
  r.add('copper', cylZ(0.0045, -0.004, -0.0115, { y: 0.0125, seg: 16, r1: 0.0025 }));
  const rounds = r.build(M, 'rounds');
  rounds.name = 'rounds';
  g.add(rounds);
  return g;
}

export function makeMX9(M, handR, handL, params, extra = {}) {
  const R = buildMX9(M);
  const guardSdf = makeGuardSdf({ cy: -0.0072, hx: 0.0185, hy: 0.024, r: 0.006, railY: TOP + 0.004, z0: -HG[0], z1: -HG[1] });
  return assembleLongGun(M, handR, handL, params, {
    id: 'mx9', kind: 'smg', R,
    pivot: V(0, -0.035, -0.13),
    hip: [[0.1, -0.148, -0.4], [0.05, 0.2, -0.05]],
    sprint: [[-0.03, -0.045, 0.03], [-0.32, 0.62, 0.42]],
    eyeRelief: 0.2,
    vmFov: { hip: 50, ads: 30 },
    guardSdf, guardCy: -0.0072,
    grip: { phi: 2.9, z: -0.29, fwd: 0.2, thumbUp: -0.012, thumbX: -0.024, over: true, roll: 0.5 },
    gripAds: { phi: 4.1, z: -0.285, fwd: 0.35, thumbUp: -0.014 },
    magRest: { pos: V(0, -0.05, -0.166), rot: new THREE.Euler(0, 0, 0) },
    magGrip: basisFD([0.1, -0.25, -1], [-1, 0.05, 0], [-0.03, -0.11, 0.05]),
    slap: basisFD([0.3, 0.1, -1], [-0.2, -1, 0], [-0.01, -0.25, -0.11]),
    catchGrip: basisFD([0, 0.3, -1], [-1, 0, 0], [-0.042, -0.055, -0.06]),
    catchRot: (p) => {
      R.boltCatch.rotation.z = -p * 0.25;
    },
    anims: {
      reload: scaleAction(rifleReload(false), 0.83, { foley: [[0.37, 'mag_out'], [1.22, 'mag_in']] }),
      reloadEmpty: scaleAction(rifleReload(true), 0.84, { foley: [[0.38, 'mag_out'], [1.24, 'mag_in'], [1.73, 'bolt_release']] }),
      inspect: inspectTrack(3.3, [-0.07, 0.055, 0.02, 0.1, 0.8, -0.32], [-0.02, 0.06, 0.03, 0.22, -0.4, 0.82], { mid: [-0.05, 0.075, 0.02, -0.15, 0.3, 0.2] }),
      equip: equipFor(0.45),
    },
    holster: 0.25,
    occ: (hl, hr) => [
      { o: R.root, a: V(0, -0.007, -0.215), b: V(0, -0.007, -0.335), r: 0.022 },
      { o: hl.thumb[1], a: V(0, 0, 0.004), b: V(0, 0, -0.03), r: 0.011 },
      { o: R.root, a: V(0, -0.052, -0.035), b: V(0, -0.148, -0.0), r: 0.0155 },
      { o: R.root, a: V(0, 0.034, -0.03), b: V(0, 0.034, -0.08), r: 0.016 },
      { o: R.root, a: V(0, -0.012, -0.01), b: V(0, -0.012, -0.21), r: 0.021 },
      { o: R.mag, a: V(0, -0.01, 0.0), b: V(0, -0.15, 0.0), r: 0.015 },
      { o: hl.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
      { o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
    ],
    casing: buildCasing9(M),
    recoil: { z: 0.4, x: 0.62, xAds: 0.26, climb: 0.0026, climbAds: 0.002, kick: 0.06 },
    anchorL: V(-0.25, -0.65, -0.12),
    extra,
  });
}
