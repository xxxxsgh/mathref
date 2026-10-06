/**
 * Metralhadora leve "HM-60" (design original do IRONLINE): 7,62 com fita,
 * receptor de chapa de aço estampada com rebites, tampa de alimentação
 * articulada (trilho em cima, abre na recarga), bandeja de alimentação no
 * lado esquerdo, caixa de 100 em cordura sob o receptor com a FITA subindo
 * em arco até a bandeja (os cartuchos visíveis somem no fim da caixa),
 * guarda-calor perfurado sobre o cano, tubo de gás, alça de transporte
 * rebatida, massa de mira, quebra-chamas, bipé rebatido, coronha esqueleto
 * com apoio de ombro e mira reflexa grande.
 *
 * Recarga longa: abre a tampa, troca a caixa, assenta a fita, fecha a tampa
 * com um tapa (vazio: puxa o manejo). ADS lento (def.adsTime).
 */
import * as THREE from 'three';
import { Kit, side, section, rbox, cylZ, cylX, cylY, torus } from './geo.js';
import { picatinny, pistolGrip, triggerGuard, buildTrigger, swivel, pin, screw, muzzleDevice, buildReflex } from './parts.js';
import { makeGuardSdf } from './grip.js';
import { basisFD } from './guns.js';
import { buildCasing338 } from './sniper.js';
import { assembleLongGun, inspectTrack, equipFor, V } from './rig.js';
import { Track } from './anim.js';

const TOP = 0.03;
const HG = [0.31, 0.5];
const BELT_N = 14;

/** Um cartucho 7,62 com elo de fita (eixo −Z, centro na origem). */
function linkRound(K) {
  K.add('brass', cylZ(0.006, 0.026, -0.01, { seg: 14 }));
  K.add('brass', cylZ(0.006, -0.01, -0.016, { seg: 14, r1: 0.0041 }));
  K.add('copper', cylZ(0.0041, -0.016, -0.036, { seg: 14, r1: 0.001 }));
  K.add('link', torus(0.0066, 0.0011, 0, 0, 0.012, 0, 0, 0));
  K.add('link', torus(0.0066, 0.0011, 0, 0, -0.004, 0, 0, 0));
  K.add('link', rbox(0.004, 0.0024, 0.016, 0.0008, 0, 0.0068, 0.004));
}

export function buildHM60(M) {
  const root = new THREE.Group();
  root.name = 'HM-60';
  const K = new Kit();
  // ─── receptor de chapa ──────────────────────────────────────────────
  K.add('receiver', side([
    [-0.03, -0.036], [0.305, -0.036], [0.312, -0.03], [0.312, TOP - 0.004], [0.305, TOP],
    [-0.022, TOP], [-0.03, TOP - 0.008],
  ], 0.04, { b: 0.0022, seg: 2 }));
  // nervuras estampadas e rebites nos flancos
  for (const sx of [-1, 1]) {
    K.add('receiver', side([[0.0, -0.028], [0.29, -0.028], [0.29, -0.022], [0.0, -0.022]], 0.0016, { b: 0.0006, cx: sx * 0.0205 }));
    for (const u of [0.01, 0.05, 0.12, 0.2, 0.27, 0.3]) for (const v of [-0.012, 0.016]) K.add('steel', cylX(0.0018, 0.0012, sx * 0.0205, v, -u, 10));
  }
  // bandeja de alimentação (esquerda) e janela de ejeção (direita, embaixo)
  K.add('receiver', rbox(0.012, 0.03, 0.05, 0.003, -0.025, 0.012, -0.17));
  K.add('cavity', rbox(0.004, 0.018, 0.04, 0.002, -0.031, 0.014, -0.17, 1));
  K.add('cavity', rbox(0.0012, 0.012, 0.05, 0.0015, 0.0205, -0.02, -0.15, 1));
  // manejo grande (direita) com fenda
  K.add('cavity', rbox(0.0012, 0.008, 0.16, 0.002, 0.0205, 0.008, -0.17, 1));
  // pistola, guarda-mato, placa do gatilho
  const plate = new THREE.Shape();
  plate.moveTo(-0.01, -0.036);
  plate.lineTo(0.14, -0.036);
  plate.lineTo(0.14, -0.052);
  plate.lineTo(0.0, -0.05);
  plate.lineTo(-0.01, -0.044);
  K.add('receiver', side(plate, 0.03, { b: 0.002 }));
  triggerGuard(K, 'receiver');
  pistolGrip(K, { style: 1 });
  for (const u of [0.02, 0.13]) pin(K, u, -0.043, 0.03, 0.003);
  // ─── cano, guarda-calor perfurado, tubo de gás, massa, quebra-chamas ──
  K.add('steel', cylZ(0.0122, -0.312, -0.66, { seg: 28 }));
  // guarda-calor (meia-cana perfurada em cima)
  K.add('receiver', cylZ(0.0175, -0.33, -0.5, { seg: 30, open: true, start: -Math.PI * 0.15, len: Math.PI * 1.3 }));
  for (let i = 0; i < 7; i++) for (const a of [0.35, 0.8, 1.25]) {
    const z = -(0.345 + i * 0.022);
    const ang = Math.PI / 2 + (a - 0.8);
    K.add('cavity', cylX(0.0035, 0.001, 0, 0, 0, 10).rotateZ(ang + Math.PI / 2).translate(Math.cos(ang) * 0.0177, Math.sin(ang) * 0.0177, z));
  }
  K.add('steel', cylZ(0.0062, -0.312, -0.6, { y: -0.026, seg: 16 }));
  K.add('steel', rbox(0.02, 0.04, 0.022, 0.004, 0, -0.012, -0.6));
  // massa de mira (orelhas + poste) e quebra-chamas
  K.add('steel', side([[0.585, 0.012], [0.615, 0.012], [0.612, 0.05], [0.588, 0.05]], 0.016, { b: 0.0015 }));
  K.add('cavity', rbox(0.006, 0.02, 0.03, 0.001, 0, 0.04, -0.6, 1));
  K.add('steel', rbox(0.0024, 0.02, 0.003, 0.0006, 0, 0.042, -0.6));
  const mlen = muzzleDevice(K, 'flash', 0.66, 0.0125);
  const muzzleU = 0.66 + mlen;
  // alça de transporte rebatida sobre o cano (atrás da massa)
  K.add('steel', rbox(0.026, 0.006, 0.012, 0.002, 0, 0.022, -0.52));
  K.add('polymer', rbox(0.016, 0.01, 0.075, 0.004, 0.0, 0.027, -0.468));
  // ─── guarda-mão de polímero sob o cano ───────────────────────────────
  {
    const hw = 0.026, top = -0.004, bot = -0.054, c = 0.012;
    const sec = [[-hw + c, bot], [hw - c, bot], [hw, bot + c], [hw, top], [-hw, top], [-hw, bot + c]];
    K.add('tan', section(sec, -HG[0], HG[1] - HG[0], { b: 0.003, seg: 3 }));
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) K.add('cavity', rbox(0.0014, 0.02, 0.012, 0.004, sx * (hw + 0.0001), -0.028, -(HG[0] + 0.025 + i * 0.033), 2));
    K.add('tan', rbox(0.056, 0.008, 0.014, 0.003, 0, -0.04, -(HG[1] - 0.007)));
  }
  // bipé rebatido para a frente
  K.add('receiver', rbox(0.03, 0.014, 0.022, 0.004, 0, -0.012, -0.55));
  for (const sx of [-1, 1]) {
    K.add('steel', cylZ(0.004, -0.55, -0.7, { x: sx * 0.008, y: -0.024, seg: 12 }));
    K.add('rubber', rbox(0.012, 0.01, 0.016, 0.004, sx * 0.008, -0.024, -0.705));
  }
  // ─── coronha esqueleto com apoio de ombro ───────────────────────────
  const st = new THREE.Shape();
  st.moveTo(-0.028, 0.018);
  st.lineTo(-0.28, 0.022);
  st.lineTo(-0.29, 0.012);
  st.lineTo(-0.29, -0.11);
  st.lineTo(-0.27, -0.112);
  st.lineTo(-0.1, -0.05);
  st.lineTo(-0.028, -0.036);
  K.add('polymer', side(st, 0.03, { b: 0.005, seg: 3, holes: [[[-0.06, 0.004], [-0.255, 0.006], [-0.262, -0.004], [-0.262, -0.085], [-0.1, -0.03], [-0.06, -0.02]]] }));
  K.add('rubber', side([[-0.29, 0.024], [-0.308, 0.024], [-0.31, -0.114], [-0.291, -0.114]], 0.034, { b: 0.006, seg: 3 }));
  K.add('steel', side([[-0.302, -0.05], [-0.33, -0.05], [-0.334, 0.006], [-0.31, 0.012]], 0.012, { b: 0.002 })); // apoio de ombro rebatido
  swivel(K, 'steel', -0.016, -0.06, 0.15);
  root.add(K.build(M, 'hm60'));

  // ─── tampa de alimentação (articulada atrás) ────────────────────────
  const cover = new THREE.Group();
  cover.name = 'cover';
  cover.position.set(0, TOP, 0.0);
  {
    const k = new Kit();
    k.add('receiver', side([[0.0, 0.0], [0.27, 0.0], [0.27, 0.012], [0.02, 0.014], [0.0, 0.008]], 0.042, { b: 0.002, seg: 2 }));
    k.add('steel', cylX(0.004, 0.044, 0, 0.004, 0.0, 16));
    k.add('steel', rbox(0.012, 0.006, 0.014, 0.002, -0.02, 0.006, -0.25)); // trava
    picatinny(k, 'rail', 0.03, 0.25, 0.013, { w: 0.021 });
    cover.add(k.build(M, 'cover'));
  }
  root.add(cover);
  const railTop = TOP + 0.013 + 0.0077;
  const rx = buildReflex(M, { w: 0.034, h: 0.026, depth: 0.038, base: 0.006 });
  rx.root.position.set(0, 0.013 + 0.0077, -0.12);
  cover.add(rx.root);

  // ─── caixa de 100 + fita (o "carregador": troca inteira na recarga) ──
  const mag = new THREE.Group();
  mag.name = 'mag';
  mag.position.set(-0.022, -0.04, -0.17);
  const belt = [];
  {
    const k = new Kit();
    // bolsa de cordura com tampa, alça e reforços
    k.add('pouch', rbox(0.06, 0.1, 0.11, 0.012, -0.012, -0.055, 0.0, 3));
    k.add('pouch', rbox(0.064, 0.016, 0.114, 0.006, -0.012, -0.002, 0.0, 2));
    k.add('strap', rbox(0.066, 0.012, 0.02, 0.002, -0.012, -0.06, 0.0));
    k.add('polymer', rbox(0.05, 0.012, 0.06, 0.003, 0.0, 0.008, 0.0));
    const g = k.build(M, 'box');
    // fita: arco saindo da caixa (esquerda) até a bandeja
    const roundsG = new THREE.Group();
    roundsG.name = 'rounds';
    for (let i = 0; i < BELT_N; i++) {
      const t = i / (BELT_N - 1);
      const kk = new Kit();
      linkRound(kk);
      const r = kk.build(M, 'belt' + i);
      // arco: sai de dentro da caixa (−X, baixo) e sobe até a bandeja
      const a = -0.25 + t * 1.6;
      r.position.set(-0.028 - Math.cos(a) * 0.018, 0.012 + Math.sin(a) * 0.04 + t * 0.012, 0.0);
      r.rotation.z = a * 0.6;
      belt.push(r);
      roundsG.add(r);
    }
    g.add(roundsG);
    mag.add(g);
  }
  root.add(mag);
  const trigger = buildTrigger(M);
  root.add(trigger);
  // manejo (direita) — recua na recarga vazia
  const ch = new THREE.Group();
  ch.name = 'chargingHandle';
  {
    const k = new Kit();
    k.add('steel', rbox(0.016, 0.006, 0.012, 0.002, 0.028, 0.008, 0));
    k.add('rubber', rbox(0.008, 0.016, 0.016, 0.004, 0.038, 0.008, 0));
    ch.add(k.build(M, 'ch'));
    ch.position.set(0, 0, -0.24);
  }
  root.add(ch);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -(muzzleU + 0.004));
  root.add(muzzle);
  const ejectPort = new THREE.Object3D();
  ejectPort.position.set(0.021, -0.02, -0.15);
  root.add(ejectPort);
  return {
    root, cover, mag, belt, trigger, chargingHandle: ch, muzzle, ejectPort, lens: rx.lens,
    sight: new THREE.Vector3(0, TOP + 0.013 + 0.0077 + rx.sightY, -0.12 + rx.sightZ),
    railTop, opticRoot: rx.root,
    mounts: {
      muzzle: { u: 0.66 + mlen - 0.01, r: 0.0128 },
      under: { u: HG[0] + 0.13, y: -0.054 },
      side: { u: HG[0] + 0.07, x: -0.026, y: -0.028 },
      top: { u: 0.08, y: railTop, parent: cover },
    },
    cosmetic: {
      counter: { pos: V(-0.0213, -0.004, -0.07) },
      stickers: [
        { pos: V(-0.0212, 0.005, -0.26), n: V(-1, 0, 0), size: 0.022 },
        { pos: V(-0.0212, -0.016, -0.02), n: V(-1, 0, 0), size: 0.02 },
        { pos: V(-0.016, -0.03, 0.12), n: V(-1, 0, 0), size: 0.026 },
        { pos: V(-0.027, -0.03, -0.36), n: V(-1, 0, 0), size: 0.02 },
      ],
      charm: V(-0.021, -0.062, 0.15),
    },
  };
}

// ─── recarga (abre tampa → troca caixa → fita → fecha) ───────────────────
const Z6 = [0, 0, 0, 0, 0, 0];
function lmgReload(empty) {
  const D = empty ? 5.9 : 5.2;
  const tilt = [-0.07, 0.07, -0.03, 0.14, 0.45, -0.32];
  const gun = new Track([
    { t: 0, v: Z6 },
    { t: 0.45, v: tilt, e: 'inOut' },
    { t: 0.9, v: tilt.map((x, i) => x + [0, 0.006, 0, 0.03, 0, 0][i]) },
    { t: 1.0, v: tilt, e: 'out' }, // tampa abriu
    { t: 3.6, v: tilt },
    { t: 3.75, v: tilt.map((x, i) => x + [0, -0.012, 0, -0.06, 0, 0][i]), e: 'out' }, // tapa na tampa
    { t: 3.95, v: tilt, e: 'inOut' },
    ...(empty ? [{ t: 4.5, v: [-0.03, 0.04, -0.01, 0.06, 0.25, -0.15], e: 'inOut' }, { t: 4.9, v: [-0.028, 0.036, 0.004, 0.04, 0.25, -0.12], e: 'out' }] : []),
    { t: D, v: Z6, e: 'inOut5' },
  ]);
  const mag = new Track([
    { t: 0, v: Z6 }, { t: 1.4, v: Z6 },
    { t: 1.55, v: [0, -0.03, 0.01, 0.1, 0, 0], e: 'in' },
    { t: 1.9, v: [-0.08, -0.34, 0.08, 0.5, 0.3, 0.6], e: 'in' },
    { t: 1.91, v: [-0.08, -0.36, 0.06, -0.3, 0.2, 0.4], e: 'linear' },
    { t: 2.4, v: [0, -0.05, 0.01, 0.08, 0, 0.05], e: 'out3' },
    { t: 2.62, v: Z6, e: 'inOut' },
    { t: 9, v: Z6 },
  ]);
  // pesos [pega, caixa, tapa (fita/tampa), tampa]
  const hand = new Track([
    { t: 0, v: [1, 0, 0, 0] },
    { t: 0.6, v: [0, 0, 0, 1], e: 'inOut' }, // vai à trava da tampa
    { t: 1.05, v: [0, 0, 0, 1] },
    { t: 1.4, v: [0, 1, 0, 0], e: 'inOut' }, // pega a caixa
    { t: 2.66, v: [0, 1, 0, 0] },
    { t: 3.0, v: [0, 0, 1, 0], e: 'inOut' }, // assenta a fita / fecha
    { t: 3.9, v: [0, 0, 1, 0] },
    { t: 4.3, v: [1, 0, 0, 0], e: 'inOut' },
  ]);
  const coverT = new Track([{ t: 0, v: [0] }, { t: 0.8, v: [0] }, { t: 1.0, v: [1], e: 'out' }, { t: 3.55, v: [1] }, { t: 3.72, v: [0], e: 'in' }, { t: 9, v: [0] }]);
  const chT = new Track(empty ? [{ t: 0, v: [0] }, { t: 4.6, v: [0] }, { t: 4.8, v: [1], e: 'out' }, { t: 4.92, v: [0], e: 'in' }, { t: 9, v: [0] }] : [{ t: 0, v: [0] }, { t: 9, v: [0] }]);
  return {
    name: empty ? 'reloadEmpty' : 'reload', duration: D, gun, mag, hand, coverT, chT, insertAt: 2.62, swapAt: 1.91, busy: true,
    foley: [[0.95, 'cover_open'], [1.55, 'mag_out'], [2.6, 'mag_in'], [3.1, 'belt'], [3.72, 'cover_close'], ...(empty ? [[4.8, 'bolt']] : [])],
  };
}

export function makeHM60(M, handR, handL, params, extra = {}) {
  const R = buildHM60(M);
  const guardSdf = makeGuardSdf({ cy: -0.029, hx: 0.026, hy: 0.025, r: 0.011, z0: -HG[0], z1: -HG[1] });
  const tmp = [0];
  const g = assembleLongGun(M, handR, handL, params, {
    id: 'hm60', kind: 'lmg', R,
    pivot: V(0, -0.035, -0.16),
    hip: [[0.11, -0.165, -0.46], [0.04, 0.18, -0.06]],
    sprint: [[-0.03, -0.06, 0.04], [-0.3, 0.6, 0.4]],
    eyeRelief: 0.22,
    vmFov: { hip: 50, ads: 30 },
    guardSdf, guardCy: -0.029,
    grip: { phi: 3.7, z: -0.4, fwd: 0.25, thumbUp: -0.008, thumbX: -0.03, over: false },
    gripAds: { phi: 4.1, z: -0.4, fwd: 0.3, thumbUp: -0.014 },
    magRest: { pos: V(-0.022, -0.04, -0.17), rot: new THREE.Euler(0, 0, 0) },
    magGrip: basisFD([0.2, -0.1, -1], [-1, 0.1, 0], [-0.065, -0.07, 0.05]),
    slap: basisFD([0.4, -0.2, -1], [-0.6, 0.8, 0], [-0.045, 0.06, -0.1]),
    catchGrip: basisFD([0.2, 0.0, -1], [-0.7, 0.7, 0], [-0.04, 0.06, -0.32]),
    anims: {
      reload: lmgReload(false),
      reloadEmpty: lmgReload(true),
      inspect: inspectTrack(3.8, [-0.07, 0.05, 0.03, 0.1, 0.7, -0.3], [-0.03, 0.06, 0.04, 0.18, -0.35, 0.7], { mid: [-0.06, 0.07, 0.03, 0.25, 0.45, -0.6] }),
      equip: equipFor(0.95),
    },
    holster: 0.45,
    occ: (hl, hr) => [
      { o: R.root, a: V(0, -0.029, -HG[0]), b: V(0, -0.029, -HG[1]), r: 0.026 },
      { o: hl.thumb[1], a: V(0, 0, 0.004), b: V(0, 0, -0.03), r: 0.011 },
      { o: R.root, a: V(0, -0.052, -0.035), b: V(0, -0.148, -0.0), r: 0.0155 },
      { o: R.root, a: V(0, 0.0, -0.0), b: V(0, 0.0, -0.3), r: 0.026 },
      { o: R.mag, a: V(-0.012, -0.03, 0.0), b: V(-0.012, -0.08, 0.0), r: 0.035 },
      { o: hl.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
      { o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
    ],
    casing: buildCasing338(M),
    recoil: { z: 0.6, x: 0.8, xAds: 0.3, climb: 0.0036, climbAds: 0.0026, kick: 0.08 },
    anchorL: V(-0.24, -0.66, -0.2),
    animate: (gg, info) => {
      const act = info.act;
      const c = act?.coverT ? act.coverT.eval(info.t, tmp)[0] : 0;
      R.cover.rotation.x = c * 1.15;
      const chp = act?.chT ? act.chT.eval(info.t, tmp)[0] : 0;
      R.chargingHandle.position.z = -0.24 + chp * 0.12;
      // fita: com a caixa no fim, os cartuchos do arco vão sumindo
      const ammo = info.ammo;
      const swapped = act?.mag && info.t >= (act.swapAt || 99);
      const n = swapped ? BELT_N : Math.min(BELT_N, ammo);
      for (let i = 0; i < BELT_N; i++) R.belt[i].visible = BELT_N - 1 - i < n;
    },
    extra,
  });
  return g;
}
