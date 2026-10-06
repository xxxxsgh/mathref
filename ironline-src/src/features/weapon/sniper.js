/**
 * Fuzil de precisão de ferrolho "LR-50" (design original do IRONLINE):
 * ação cilíndrica de aço com ferrolho de 3 ressaltos (alavanca com bola à
 * direita), trilho de 20 MOA, chassi de alumínio em cerakote com poço para
 * carregador de 5, guarda-mão longo com M-LOK e bipé rebatido, cano pesado
 * canelado com freio de boca grande, coronha rebatível com apoio de face
 * ajustável e monopé, luneta 8x (imagem ampliada real + retículo em mils).
 *
 * Animação própria: depois de cada tiro a mão direita larga o punho, levanta
 * a alavanca, puxa o ferrolho (a cápsula sai), empurra, abaixa e volta.
 */
import * as THREE from 'three';
import { Kit, side, section, rbox, cylZ, cylX, cylY, torus } from './geo.js';
import { picatinny, slot, pistolGrip, triggerGuard, buildTrigger, swivel, pin, screw, muzzleDevice, buildScope } from './parts.js';
import { makeGuardSdf } from './grip.js';
import { POSES, clonePose } from './arms.js';
import { basis, basisFD, rifleReload } from './guns.js';
import { assembleLongGun, scaleAction, inspectTrack, equipFor, V } from './rig.js';
import { Track } from './anim.js';

const AR = 0.0172; // raio da ação
const HG = [0.235, 0.58]; // guarda-mão (u)
const BOLT_PULL = 0.088;

/** Cápsula .338 deflagrada (longa, gargalo). */
export function buildCasing338(M) {
  const k = new Kit();
  const S = 18;
  k.add('brass', cylZ(0.0074, 0.034, 0.0326, { seg: S }));
  k.add('brass', cylZ(0.0064, 0.0326, 0.0306, { seg: S, r1: 0.0071 }));
  k.add('brass', cylZ(0.0073, 0.0306, -0.0215, { seg: S, r1: 0.0068 }));
  k.add('brass', cylZ(0.0068, -0.0215, -0.0265, { seg: S, r1: 0.0046 }));
  k.add('brass', cylZ(0.0046, -0.0265, -0.036, { seg: S }));
  k.add('cavity', cylZ(0.0041, -0.0358, -0.0362, { seg: 14 }));
  k.add('steel', cylZ(0.0026, 0.0342, 0.034, { seg: 12 }));
  return k.build(M, 'casing338', { shadows: false });
}

export function buildLR50(M, view = null) {
  const root = new THREE.Group();
  root.name = 'LR-50';
  const K = new Kit();

  // ─── ação (aço) ───────────────────────────────────────────────────────
  K.add('steel', cylZ(AR, 0.012, -0.215, { seg: 36 }));
  K.add('steel', cylZ(AR * 0.92, 0.024, 0.012, { seg: 36, r1: AR }));
  // janela de ejeção (direita) — recorte escuro com o ferrolho por dentro
  K.add('cavity', rbox(0.006, 0.016, 0.07, 0.003, AR - 0.0018, 0.004, -0.105, 2));
  // base de trilho 20 MOA (alumínio) e parafusos
  const railY = AR + 0.0012;
  K.add('mount', rbox(0.022, 0.006, 0.235, 0.0018, 0, railY + 0.002, -0.1));
  picatinny(K, 'rail', -0.012, 0.218, railY + 0.005, { w: 0.021 });
  const railTop = railY + 0.005 + 0.0077;
  for (const u of [0.01, 0.07, 0.15, 0.205]) K.add('steel', cylY(0.0022, 0.002, 0, railY + 0.0052, -u, 12));
  // recoil lug e parafusos da ação no chassi
  K.add('steel', rbox(0.026, 0.008, 0.012, 0.002, 0, -AR - 0.002, -0.2));

  // ─── chassi (alumínio cerakote) ──────────────────────────────────────
  const ch = new THREE.Shape();
  ch.moveTo(-0.04, -0.008);
  ch.lineTo(0.24, -0.008);
  ch.lineTo(0.24, -0.046);
  ch.lineTo(0.205, -0.05);
  ch.lineTo(0.2, -0.094);
  ch.quadraticCurveTo(0.2, -0.1, 0.205, -0.102);
  ch.lineTo(0.205, -0.108);
  ch.lineTo(0.132, -0.108);
  ch.lineTo(0.132, -0.1);
  ch.quadraticCurveTo(0.138, -0.098, 0.138, -0.09);
  ch.lineTo(0.138, -0.05);
  ch.lineTo(0.0, -0.048);
  ch.lineTo(-0.04, -0.04);
  K.add('tan', side(ch, 0.038, { b: 0.003, seg: 3, holes: [[[0.21, -0.016], [0.236, -0.016], [0.236, -0.04], [0.21, -0.04]]] }));
  // abas do chassi abraçando a ação (cantos chanfrados)
  for (const sx of [-1, 1]) K.add('tan', side([[-0.03, -0.008], [0.235, -0.008], [0.235, 0.004], [-0.03, 0.002]], 0.004, { b: 0.0012, cx: sx * 0.017 }));
  // alavanca de liberação do carregador (na frente do guarda-mato)
  K.add('steel', side([[0.13, -0.06], [0.138, -0.06], [0.136, -0.082], [0.13, -0.082]], 0.012, { b: 0.0012 }));
  triggerGuard(K, 'tan');
  pistolGrip(K, { style: 2, mat: 'polymer' });
  // trava de segurança (esquerda, alavanca de 2 posições)
  K.add('steel', rbox(0.003, 0.006, 0.016, 0.0012, -0.02, -0.022, -0.03));
  // parafusos do chassi
  for (const u of [0.02, 0.18]) screw(K, -0.0192, -0.03, -u, -1, 0.0024);

  // ─── guarda-mão longo com M-LOK ─────────────────────────────────────
  {
    const hw = 0.022, top = 0.019, bot = -0.04, c = 0.009;
    const oct = [[-hw + c, bot], [hw - c, bot], [hw, bot + c], [hw, top - c * 0.6], [hw - c * 0.6, top], [-hw + c * 0.6, top], [-hw, top - c * 0.6], [-hw, bot + c]];
    K.add('tan', section(oct, -HG[0], HG[1] - HG[0], { b: 0.002, seg: 2 }));
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) K.add('cavity', rbox(0.0014, 0.0075, 0.03, 0.0035, sx * (hw + 0.0001), -0.011, -(HG[0] + 0.03 + i * 0.044), 2));
    for (let i = 0; i < 6; i++) K.add('cavity', rbox(0.0075, 0.0014, 0.03, 0.0035, 0, bot - 0.0001, -(HG[0] + 0.05 + i * 0.044), 2));
    picatinny(K, 'rail', HG[0], HG[1] - 0.004, top, { w: 0.021 });
    // trilho curto embaixo na frente (bipé) e olhal QD
    swivel(K, 'steel', -0.023, -0.03, -(HG[1] - 0.03));
  }
  // ─── cano pesado canelado + freio de boca ───────────────────────────
  K.add('steel', cylZ(0.0128, -HG[0], -(HG[1] + 0.02), { seg: 32 }));
  K.add('steel', cylZ(0.0118, -(HG[1] + 0.02), -0.785, { seg: 32, r1: 0.0108 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.add('cavity', rbox(0.0035, 0.0035, 0.14, 0.0016, Math.cos(a) * 0.0108, Math.sin(a) * 0.0108, -(HG[1] + 0.1), 1).rotateZ(0));
  }
  const mlen = muzzleDevice(K, 'brake', 0.785, 0.0118);
  const muzzleU = 0.785 + mlen;

  // ─── bipé rebatido (pernas ao longo do guarda-mão, embaixo) ─────────
  K.add('receiver', rbox(0.03, 0.012, 0.03, 0.003, 0, -0.047, -(HG[1] - 0.03)));
  for (const sx of [-1, 1]) {
    K.add('receiver', cylZ(0.0048, -(HG[1] - 0.04), -(HG[0] + 0.08), { x: sx * 0.011, y: -0.055, seg: 14 }));
    K.add('steel', cylZ(0.0036, -(HG[0] + 0.08), -(HG[0] + 0.06), { x: sx * 0.011, y: -0.055, seg: 12 }));
    K.add('rubber', rbox(0.01, 0.008, 0.014, 0.003, sx * 0.011, -0.055, -(HG[0] + 0.055)));
  }

  // ─── coronha rebatível (dobradiça + esqueleto + apoio de face + soleira) ──
  K.add('steel', rbox(0.03, 0.04, 0.016, 0.003, 0, -0.024, 0.048));
  K.add('steel', cylY(0.0055, 0.045, 0.017, -0.024, 0.044, 16));
  const stock = new THREE.Shape();
  stock.moveTo(-0.055, 0.012);
  stock.lineTo(-0.3, 0.012);
  stock.lineTo(-0.31, 0.004);
  stock.lineTo(-0.31, -0.1);
  stock.lineTo(-0.29, -0.11);
  stock.lineTo(-0.25, -0.1);
  stock.lineTo(-0.08, -0.04);
  stock.lineTo(-0.055, -0.04);
  K.add('tan', side(stock, 0.024, { b: 0.0025, seg: 2, holes: [[[-0.09, 0.0], [-0.27, 0.0], [-0.282, -0.012], [-0.282, -0.075], [-0.25, -0.082], [-0.1, -0.03]]] }));
  // apoio de face ajustável (sobe sobre duas hastes) com botões
  K.add('polymer', rbox(0.03, 0.016, 0.14, 0.006, 0, 0.032, 0.2, 3));
  for (const z of [0.15, 0.25]) K.add('steel', cylY(0.0038, 0.02, 0, 0.018, z, 14));
  K.add('steel', cylX(0.0065, 0.01, -0.017, 0.012, 0.2, 20));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    K.add('steel', rbox(0.01, 0.0014, 0.0014, 0.0004, -0.017, 0.012 + Math.sin(a) * 0.0067, 0.2 + Math.cos(a) * 0.0067, 1));
  }
  // soleira com espaçadores e borracha
  K.add('polymer', rbox(0.036, 0.13, 0.014, 0.004, 0, -0.045, 0.317));
  K.add('rubber', rbox(0.038, 0.134, 0.016, 0.005, 0, -0.045, 0.332, 3));
  for (let i = 0; i < 10; i++) K.add('cavity', rbox(0.039, 0.0014, 0.012, 0.0005, 0, 0.015 - i * 0.0125, 0.333, 1));
  // monopé traseiro (botão serrilhado)
  K.add('steel', cylY(0.006, 0.03, 0, -0.105, 0.28, 18));
  K.add('rubber', cylY(0.0075, 0.008, 0, -0.123, 0.28, 18));
  swivel(K, 'steel', -0.013, -0.08, 0.27);

  root.add(K.build(M, 'lr50'));

  // ─── ferrolho (gira + desliza) ──────────────────────────────────────
  const bolt = new THREE.Group();
  bolt.name = 'bolt';
  const knob = new THREE.Object3D();
  {
    const k = new Kit();
    k.add('bright', cylZ(0.0095, -0.03, -0.17, { seg: 24 }));
    // ressaltos e canal da extração
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.add('bright', rbox(0.006, 0.006, 0.012, 0.0015, Math.cos(a) * 0.009, Math.sin(a) * 0.009, -0.165));
    }
    // capa traseira (cocking piece) com indicador vermelho
    k.add('steel', cylZ(0.012, 0.03, 0.012, { seg: 24, r1: 0.0105 }));
    k.add('sightRing', cylZ(0.003, 0.0302, 0.0298, { seg: 12 }));
    // alavanca (sai para a direita-baixo) + bola serrilhada
    const ang = -0.45;
    const hx = Math.cos(ang), hy = Math.sin(ang);
    const L = 0.05;
    const m = new THREE.Matrix4().makeRotationZ(ang).setPosition(hx * (L / 2 + 0.006), hy * (L / 2 + 0.006), -0.012);
    k.add('steel', rbox(L, 0.006, 0.007, 0.0025), m);
    k.add('steel', new THREE.SphereGeometry(0.0095, 20, 14).translate(hx * (L + 0.008), hy * (L + 0.008), -0.012));
    for (let i = 0; i < 6; i++) k.add('cavity', torus(0.0094, 0.0005, hx * (L + 0.008), hy * (L + 0.008), -0.012 - 0.006 + i * 0.0024, 0, 0, 0));
    knob.position.set(hx * (L + 0.008), hy * (L + 0.008), -0.012);
    bolt.add(k.build(M, 'bolt'));
    bolt.add(knob);
  }
  root.add(bolt);
  const trigger = buildTrigger(M, { flat: true });
  root.add(trigger);

  // carregador de 5 (polímero com lábios de aço)
  const mag = new THREE.Group();
  mag.name = 'mag';
  mag.position.set(0, -0.05, -0.168);
  {
    const k = new Kit();
    k.add('polymer', rbox(0.024, 0.075, 0.07, 0.004, 0, -0.03, 0.0));
    for (const sx of [-1, 1]) k.add('polymer', rbox(0.0012, 0.05, 0.052, 0.0005, sx * 0.0121, -0.028, 0.0));
    k.add('polymer', rbox(0.03, 0.01, 0.074, 0.003, 0, -0.07, 0.0));
    k.add('steel', rbox(0.02, 0.004, 0.06, 0.0008, 0, 0.007, 0.002));
    const g = k.build(M, 'smag');
    const r = new Kit();
    r.add('brass', cylZ(0.0072, 0.03, -0.012, { y: 0.014, seg: 16 }));
    r.add('brass', cylZ(0.0068, -0.012, -0.018, { y: 0.014, seg: 16, r1: 0.0045 }));
    r.add('copper', cylZ(0.0045, -0.018, -0.04, { y: 0.014, seg: 16, r1: 0.0012 }));
    const rounds = r.build(M, 'rounds');
    rounds.name = 'rounds';
    g.add(rounds);
    mag.add(g);
  }
  root.add(mag);

  // luneta 8x nos anéis
  const sc = buildScope(M, { len: 0.34, tube: 0.015, obj: 0.027, eye: 0.0205, zoom: 8, reticle: 'mil', view, rings: [0.22, 0.52], ringH: 0.03 });
  const scopeY = railTop + sc.ringH;
  sc.root.position.set(0, scopeY, 0.03);
  root.add(sc.root);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -(muzzleU + 0.004));
  root.add(muzzle);
  const ejectPort = new THREE.Object3D();
  ejectPort.position.set(0.019, 0.004, -0.1);
  root.add(ejectPort);

  return {
    root, bolt, knob, mag, trigger, muzzle, ejectPort, scope: sc.root, scopeLens: sc.lens, glint: sc.glint,
    sight: new THREE.Vector3(0, scopeY, 0.03 - 0.004),
    railTop, opticRoot: null,
    mounts: {
      muzzle: { u: 0.785 + mlen - 0.012, r: 0.0125 },
      under: null,
      side: { u: HG[0] + 0.25, x: -0.022, y: -0.008 },
      top: null,
    },
    cosmetic: {
      counter: { pos: V(-0.0196, -0.026, -0.08) },
      stickers: [
        { pos: V(-0.0192, -0.03, -0.17), n: V(-1, 0, 0), size: 0.024 },
        { pos: V(-0.0222, -0.01, -0.33), n: V(-1, 0, 0), size: 0.024 },
        { pos: V(-0.0122, -0.03, 0.17), n: V(-1, 0, 0), size: 0.024 },
        { pos: V(-0.0222, -0.01, -0.45), n: V(-1, 0, 0), size: 0.02 },
      ],
      charm: V(-0.0186, -0.082, 0.27),
    },
  };
}

// ─── trilhas ─────────────────────────────────────────────────────────────
const Z6 = [0, 0, 0, 0, 0, 0];
/** Ciclo do ferrolho: [levanta, puxa] (0..1) + mão direita fora do punho. */
function boltAction(D = 0.82) {
  return {
    name: 'bolt', duration: D, allowAds: true,
    gun: new Track([{ t: 0, v: Z6 }, { t: 0.14, v: [-0.035, 0.02, 0.015, 0.05, -0.28, 0.32], e: 'inOut' }, { t: 0.42, v: [-0.038, 0.022, 0.02, 0.04, -0.3, 0.36] }, { t: 0.6, v: [-0.03, 0.016, 0.012, 0.03, -0.24, 0.26], e: 'inOut' }, { t: D, v: Z6, e: 'inOut' }]),
    boltT: new Track([
      { t: 0, v: [0, 0] }, { t: 0.14, v: [0, 0] },
      { t: 0.2, v: [1, 0], e: 'out' }, { t: 0.34, v: [1, 1], e: 'out' }, { t: 0.4, v: [1, 1] },
      { t: 0.52, v: [1, 0], e: 'in' }, { t: 0.58, v: [0, 0], e: 'in' }, { t: D, v: [0, 0] },
    ]),
    handW: new Track([{ t: 0, v: [0] }, { t: 0.12, v: [1], e: 'inOut' }, { t: 0.6, v: [1] }, { t: 0.74, v: [0], e: 'inOut' }]),
    ejectAt: 0.32,
    foley: [[0.17, 'bolt_up'], [0.3, 'bolt_back'], [0.5, 'bolt_fwd'], [0.57, 'bolt_down']],
  };
}

export function makeLR50(M, handR, handL, params, extra = {}) {
  const R = buildLR50(M, extra.view || null);
  const guardSdf = makeGuardSdf({ cy: -0.0105, hx: 0.022, hy: 0.0295, r: 0.009, railY: 0.0225, z0: -HG[0], z1: -HG[1] });
  // mão direita no ferrolho: pinça na bola, dorso para cima/direita
  const boltHand = basisFD([-0.3, -0.2, -1], [0.6, 1, 0.2], [0, 0, 0]);
  const pinch = clonePose(POSES.pinch);
  const tmp2 = [0, 0];
  const tmp1 = [0];
  const reloadE = scaleAction(rifleReload(true), 1.12, { foley: [[0.5, 'mag_out'], [1.66, 'mag_in']], next: 'bolt' });
  // a recarga vazia termina com o ciclo do ferrolho (próxima ação)
  const g = assembleLongGun(M, handR, handL, params, {
    id: 'lr50', kind: 'sniper', R,
    pivot: V(0, -0.035, -0.15),
    hip: [[0.105, -0.158, -0.44], [0.045, 0.19, -0.05]],
    sprint: [[-0.03, -0.05, 0.03], [-0.34, 0.6, 0.42]],
    eyeRelief: 0.088,
    vmFov: { hip: 50, ads: 30 },
    adsFovScope: 0.86,
    guardSdf, guardCy: -0.0105,
    grip: { phi: 3.8, z: -0.36, fwd: 0.22, thumbUp: 0.002, thumbX: -0.028, over: false },
    gripAds: { phi: 4.2, z: -0.36, fwd: 0.3, thumbUp: -0.01 },
    magRest: { pos: V(0, -0.05, -0.168), rot: new THREE.Euler(0, 0, 0) },
    magGrip: basisFD([0.1, -0.25, -1], [-1, 0.05, 0], [-0.034, -0.055, 0.05]),
    slap: basisFD([0.3, 0.1, -1], [-0.2, -1, 0], [-0.01, -0.17, -0.11]),
    catchGrip: basisFD([0, 0.3, -1], [-1, 0, 0], [-0.042, -0.055, -0.06]),
    anims: {
      reload: scaleAction(rifleReload(false), 1.12, { foley: [[0.5, 'mag_out'], [1.66, 'mag_in']] }),
      reloadEmpty: reloadE,
      bolt: boltAction(),
      inspect: inspectTrack(3.8, [-0.075, 0.05, 0.03, 0.12, 0.85, -0.25], [-0.03, 0.06, 0.04, 0.2, -0.4, 0.75], { mid: [-0.06, 0.07, 0.03, -0.1, 0.5, 0.35] }),
      equip: equipFor(0.8),
    },
    holster: 0.4,
    occ: (hl, hr) => [
      { o: R.root, a: V(0, -0.01, -HG[0]), b: V(0, -0.01, -HG[1]), r: 0.026 },
      { o: hl.thumb[1], a: V(0, 0, 0.004), b: V(0, 0, -0.03), r: 0.011 },
      { o: R.root, a: V(0, -0.052, -0.035), b: V(0, -0.148, -0.0), r: 0.0155 },
      { o: R.scope, a: V(0, 0, -0.02), b: V(0, 0, -0.3), r: 0.018 },
      { o: R.root, a: V(0, 0.0, 0.0), b: V(0, 0.0, -0.21), r: 0.018 },
      { o: R.mag, a: V(0, -0.01, 0.0), b: V(0, -0.06, 0.0), r: 0.016 },
      { o: hl.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
      { o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
    ],
    casing: buildCasing338(M),
    recoil: { z: 1.4, x: 2.2, xAds: 1.2, climb: 0.02, climbAds: 0.017, kick: 0.3 },
    anchorL: V(-0.24, -0.62, -0.2),
    animate: (gg, info) => {
      const act = info.act;
      let lift = 0, pull = 0, w = 0;
      if (act?.boltT) {
        const b = act.boltT.eval(info.t, tmp2);
        lift = b[0];
        pull = b[1];
        w = act.handW.eval(info.t, tmp1)[0];
      }
      R.bolt.rotation.z = lift * 1.05;
      R.bolt.position.z = pull * BOLT_PULL;
      if (w > 0) {
        R.root.updateMatrix();
        R.bolt.updateMatrix();
        const kp = R.knob.position.clone().applyMatrix4(R.bolt.matrix);
        // palma atrás/acima da bola (polegar e indicador pinçam)
        const off = V(-0.004, 0.016, 0.058).applyQuaternion(boltHand.quat);
        gg.handROver = { pos: kp.clone().add(V(0.01, -0.006, 0.05)).sub(off.multiplyScalar(0)), quat: boltHand.quat, pose: pinch, w };
      }
    },
    extra,
  });
  return g;
}
