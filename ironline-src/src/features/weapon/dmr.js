/**
 * Fuzil designado "SR-7" (design original do IRONLINE): 7,62, semiautomático
 * de pistão, receptor superior alto com assistente de ferrolho e defletor,
 * guarda-mão redondo longo com janelas de ventilação, cano canelado com
 * compensador, carregador de 20 levemente curvo, coronha de precisão com
 * apoio de face e soleira ajustáveis, luneta 4x (chevron com marcas de queda).
 */
import * as THREE from 'three';
import { Kit, side, section, rbox, cylZ, cylX, cylY, torus } from './geo.js';
import { picatinny, pistolGrip, triggerGuard, buildTrigger, buildSelector, swivel, pin, screw, muzzleDevice, buildScope } from './parts.js';
import { makeGuardSdf } from './grip.js';
import { basisFD, rifleReload } from './guns.js';
import { buildCasing338 } from './sniper.js';
import { assembleLongGun, scaleAction, inspectTrack, equipFor, V } from './rig.js';

const TOP = 0.019;
const HG = [0.245, 0.6];

export function buildSR7(M, view = null) {
  const root = new THREE.Group();
  root.name = 'SR-7';
  const K = new Kit();
  // ─── receptor superior ─────────────────────────────────────────────
  K.add('receiver', side([
    [0.0, -0.017], [0.242, -0.017], [0.246, -0.013], [0.246, TOP - 0.003], [0.242, TOP],
    [0.012, TOP], [0.004, TOP - 0.004], [0.0, TOP - 0.007],
  ], 0.031, { b: 0.0018, seg: 3 }));
  for (const sx of [-1, 1]) K.add('receiver', side([[0.07, -0.007], [0.238, -0.007], [0.238, 0.004], [0.085, 0.004]], 0.003, { b: 0.0008, cx: sx * 0.016 }));
  // assistente de ferrolho, capa da janela, defletor
  K.add('receiver', cylZ(0.0068, -0.025, -0.07, { x: 0.018, y: 0.005, seg: 16 }));
  K.add('steel', cylZ(0.0058, -0.07, -0.074, { x: 0.018, y: 0.005, seg: 16 }));
  K.add('steel', rbox(0.002, 0.018, 0.068, 0.0007, 0.0158, 0.0, -0.118));
  K.add('receiver', rbox(0.007, 0.015, 0.015, 0.002, 0.018, 0.004, -0.076));
  picatinny(K, 'rail', 0.006, 0.244, TOP);
  // ─── receptor inferior (poço para 7,62) ─────────────────────────────
  const lower = new THREE.Shape();
  lower.moveTo(-0.008, -0.0168);
  lower.lineTo(0.24, -0.0168);
  lower.lineTo(0.24, -0.03);
  lower.quadraticCurveTo(0.238, -0.037, 0.226, -0.04);
  lower.lineTo(0.222, -0.088);
  lower.quadraticCurveTo(0.224, -0.096, 0.23, -0.098);
  lower.lineTo(0.23, -0.104);
  lower.lineTo(0.132, -0.104);
  lower.lineTo(0.132, -0.098);
  lower.quadraticCurveTo(0.138, -0.095, 0.139, -0.088);
  lower.lineTo(0.14, -0.052);
  lower.lineTo(0.0, -0.05);
  lower.quadraticCurveTo(-0.014, -0.047, -0.016, -0.035);
  lower.lineTo(-0.016, -0.023);
  lower.quadraticCurveTo(-0.014, -0.017, -0.008, -0.0168);
  K.add('receiver', side(lower, 0.0275, { b: 0.0018, seg: 3 }));
  for (const sx of [-1, 1]) K.add('receiver', side([[0.146, -0.055], [0.216, -0.055], [0.214, -0.088], [0.148, -0.088]], 0.0016, { b: 0.0005, cx: sx * 0.0137 }));
  triggerGuard(K, 'receiver');
  pistolGrip(K, { style: 0 });
  for (const [u, v] of [[0.004, -0.028], [0.232, -0.025], [0.07, -0.038], [0.088, -0.038]]) pin(K, u, v, 0.0275, u < 0.05 || u > 0.2 ? 0.0032 : 0.0022);
  K.add('steel', cylX(0.0046, 0.0035, 0.0152, -0.043, -0.14, 20));
  swivel(K, 'steel', -0.016, -0.03, 0.0);
  // ─── guarda-mão redondo com janelas ─────────────────────────────────
  {
    const R0 = 0.0245, cy = -0.004;
    K.add('tan', cylZ(R0, -HG[0], -HG[1], { y: cy, seg: 40 }));
    for (let i = 0; i < 6; i++) {
      for (const a of [Math.PI, Math.PI * 1.5, 0]) {
        const z = -(HG[0] + 0.04 + i * 0.05);
        K.add('cavity', rbox(0.0042, 0.0042, 0.03, 0.002, Math.cos(a) * (R0 + 0.0001), cy + Math.sin(a) * (R0 + 0.0001), z, 1).rotateZ(0));
      }
    }
    picatinny(K, 'rail', HG[0], HG[1] - 0.004, cy + R0 - 0.0015, { w: 0.02 });
    K.add('tan', cylZ(R0 * 1.06, -HG[0], -(HG[0] + 0.012), { y: cy, seg: 40 }));
    for (const sx of [-1, 1]) screw(K, sx * R0 * 1.06, cy, -(HG[0] + 0.006), sx, 0.002);
    swivel(K, 'steel', -R0 - 0.002, cy - 0.01, -(HG[1] - 0.03));
  }
  // ─── cano canelado + compensador ────────────────────────────────────
  K.add('steel', cylZ(0.0108, -HG[1], -0.735, { seg: 28 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.add('cavity', rbox(0.003, 0.003, 0.09, 0.0014, Math.cos(a) * 0.0099, Math.sin(a) * 0.0099, -(HG[1] + 0.065), 1));
  }
  const mlen = muzzleDevice(K, 'comp', 0.735, 0.0112);
  const muzzleU = 0.735 + mlen;
  // ─── coronha de precisão sobre o tubo ───────────────────────────────
  K.add('receiver', cylZ(0.0148, 0.0, 0.17, { y: -0.004, seg: 28 }));
  K.add('steel', cylZ(0.0176, 0.0, 0.012, { y: -0.004, seg: 12 }));
  const st = new THREE.Shape();
  st.moveTo(-0.06, 0.014);
  st.lineTo(-0.265, 0.016);
  st.quadraticCurveTo(-0.275, 0.016, -0.275, 0.006);
  st.lineTo(-0.275, -0.105);
  st.lineTo(-0.24, -0.105);
  st.quadraticCurveTo(-0.2, -0.06, -0.1, -0.03);
  st.lineTo(-0.06, -0.026);
  K.add('polymer', side(st, 0.034, { b: 0.006, seg: 3, holes: [[[-0.11, -0.012], [-0.225, -0.008], [-0.24, -0.02], [-0.24, -0.075], [-0.2, -0.05]]] }));
  // apoio de face sobre hastes + botão
  K.add('polymer', rbox(0.032, 0.014, 0.13, 0.006, 0, 0.03, 0.17, 3));
  for (const z of [0.12, 0.22]) K.add('steel', cylY(0.0036, 0.016, 0, 0.018, z, 14));
  K.add('steel', cylX(0.006, 0.008, -0.018, 0.01, 0.17, 20));
  K.add('rubber', side([[-0.275, 0.018], [-0.292, 0.018], [-0.294, -0.108], [-0.276, -0.108]], 0.037, { b: 0.006, seg: 3 }));
  for (let i = 0; i < 10; i++) K.add('cavity', rbox(0.038, 0.0014, 0.012, 0.0005, 0, 0.012 - i * 0.012, 0.292, 1));

  root.add(K.build(M, 'sr7'));

  // ─── móveis ─────────────────────────────────────────────────────────
  const ch = new THREE.Group();
  ch.name = 'chargingHandle';
  {
    const k = new Kit();
    k.add('receiver', rbox(0.013, 0.005, 0.03, 0.0015, 0, 0.0135, 0.003));
    k.add('receiver', side([[-0.012, 0.009], [-0.002, 0.009], [-0.002, 0.017], [-0.012, 0.017]], 0.038, { b: 0.0018 }));
    ch.add(k.build(M, 'ch'));
  }
  root.add(ch);
  const boltCatch = new THREE.Group();
  {
    const k = new Kit();
    k.add('steel', side([[0, 0], [0.024, 0.0], [0.026, 0.006], [0.004, 0.009]], 0.0025, { b: 0.0006 }));
    boltCatch.add(k.build(M, 'bc'));
    boltCatch.position.set(-0.0148, -0.035, -0.13);
  }
  root.add(boltCatch);
  const trigger = buildTrigger(M, { flat: true });
  root.add(trigger);
  const sel = buildSelector(M, -0.015, -0.032, -0.03);
  root.add(sel);
  const mag = new THREE.Group();
  mag.name = 'mag';
  mag.position.set(0, -0.05, -0.182);
  {
    const k = new Kit();
    const s = new THREE.Shape();
    s.moveTo(-0.04, 0.012);
    s.lineTo(0.034, 0.012);
    s.lineTo(0.036, -0.04);
    s.quadraticCurveTo(0.042, -0.11, 0.056, -0.15);
    s.lineTo(-0.012, -0.158);
    s.quadraticCurveTo(-0.03, -0.1, -0.038, -0.04);
    k.add('polymer', side(s, 0.026, { b: 0.0018, seg: 2, curve: 14 }));
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) k.add('polymer', side([[-0.026 + i * 0.002, -0.11 - i * 0.012], [0.034 + i * 0.004, -0.11 - i * 0.012], [0.034 + i * 0.004, -0.106 - i * 0.012], [-0.026 + i * 0.002, -0.106 - i * 0.012]], 0.0015, { b: 0.0006, cx: sx * 0.0135 }));
    k.add('polymer', side([[-0.016, -0.152], [0.062, -0.144], [0.064, -0.16], [-0.016, -0.168]], 0.031, { b: 0.0025 }));
    k.add('steel', rbox(0.024, 0.004, 0.06, 0.001, 0, 0.012, 0.0));
    const g = k.build(M, 'dmag');
    const r = new Kit();
    for (const [x, y] of [[-0.0055, 0.02], [0.0055, 0.0158]]) {
      r.add('brass', cylZ(0.006, 0.03, -0.012, { x, y, seg: 16 }));
      r.add('brass', cylZ(0.006, -0.012, -0.018, { x, y, seg: 16, r1: 0.0041 }));
      r.add('copper', cylZ(0.0041, -0.018, -0.038, { x, y, seg: 16, r1: 0.001 }));
    }
    const rounds = r.build(M, 'rounds');
    rounds.name = 'rounds';
    g.add(rounds);
    mag.add(g);
  }
  root.add(mag);
  // luneta 4x
  const railTop = TOP + 0.0077;
  const sc = buildScope(M, { len: 0.27, tube: 0.0132, obj: 0.022, eye: 0.019, zoom: 4, reticle: 'chevron', view, rings: [0.2, 0.55], ringH: 0.028, turretH: 0.016, color: [1.0, 0.15, 0.05] });
  const scopeY = railTop + sc.ringH;
  sc.root.position.set(0, scopeY, 0.005);
  root.add(sc.root);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -(muzzleU + 0.004));
  root.add(muzzle);
  const ejectPort = new THREE.Object3D();
  ejectPort.position.set(0.017, 0.003, -0.118);
  root.add(ejectPort);
  return {
    root, mag, trigger, selector: sel, chargingHandle: ch, boltCatch, muzzle, ejectPort, scope: sc.root, scopeLens: sc.lens, glint: sc.glint,
    sight: new THREE.Vector3(0, scopeY, 0.005 - 0.004),
    railTop, opticRoot: null,
    mounts: {
      muzzle: { u: 0.735 + mlen - 0.01, r: 0.0118 },
      under: { u: HG[0] + 0.2, y: -0.0285 },
      side: { u: HG[0] + 0.24, x: -0.0245, y: -0.004 },
      top: null,
    },
    cosmetic: {
      counter: { pos: V(-0.0157, -0.005, -0.06) },
      stickers: [
        { pos: V(-0.0138, -0.072, -0.2), n: V(-1, 0, 0), size: 0.024 },
        { pos: V(-0.0158, 0.006, -0.17), n: V(-1, 0, 0), size: 0.018 },
        { pos: V(-0.0245, -0.004, -0.38), n: V(-1, 0, 0), size: 0.024 },
        { pos: V(-0.017, -0.04, 0.2), n: V(-1, 0, 0), size: 0.024 },
      ],
      charm: V(-0.022, -0.03, 0.0),
    },
  };
}

export function makeSR7(M, handR, handL, params, extra = {}) {
  const R = buildSR7(M, extra.view || null);
  const guardSdf = makeGuardSdf({ cy: -0.004, hx: 0.0245, hy: 0.0245, r: 0.0235, railY: 0.0245, z0: -HG[0], z1: -HG[1] });
  return assembleLongGun(M, handR, handL, params, {
    id: 'sr7', kind: 'dmr', R,
    pivot: V(0, -0.035, -0.15),
    hip: [[0.105, -0.155, -0.43], [0.045, 0.2, -0.05]],
    sprint: [[-0.03, -0.045, 0.03], [-0.32, 0.62, 0.42]],
    eyeRelief: 0.09,
    vmFov: { hip: 50, ads: 30 },
    adsFovScope: 0.86,
    guardSdf, guardCy: -0.004,
    grip: { phi: 2.95, z: -0.35, fwd: 0.2, thumbUp: -0.012, thumbX: -0.03, over: true, roll: 0.5 },
    gripAds: { phi: 4.1, z: -0.34, fwd: 0.35, thumbUp: -0.014 },
    magRest: { pos: V(0, -0.05, -0.182), rot: new THREE.Euler(0, 0, 0) },
    magGrip: basisFD([0.1, -0.25, -1], [-1, 0.05, 0], [-0.036, -0.11, 0.06]),
    slap: basisFD([0.3, 0.1, -1], [-0.2, -1, 0], [-0.01, -0.24, -0.11]),
    catchGrip: basisFD([0, 0.3, -1], [-1, 0, 0], [-0.042, -0.056, -0.075]),
    catchRot: (p) => (R.boltCatch.rotation.z = -p * 0.25),
    anims: {
      reload: scaleAction(rifleReload(false), 1.04, { foley: [[0.47, 'mag_out'], [1.54, 'mag_in']] }),
      reloadEmpty: scaleAction(rifleReload(true), 1.05, { foley: [[0.47, 'mag_out'], [1.55, 'mag_in'], [2.16, 'bolt_release']] }),
      inspect: inspectTrack(3.6, [-0.075, 0.055, 0.025, 0.14, 0.8, -0.3], [-0.03, 0.06, 0.03, 0.26, -0.4, 0.8]),
      equip: equipFor(0.62),
    },
    holster: 0.32,
    occ: (hl, hr) => [
      { o: R.root, a: V(0, -0.004, -HG[0]), b: V(0, -0.004, -HG[1]), r: 0.025 },
      { o: hl.thumb[1], a: V(0, 0, 0.004), b: V(0, 0, -0.03), r: 0.011 },
      { o: R.root, a: V(0, -0.052, -0.035), b: V(0, -0.148, -0.0), r: 0.0155 },
      { o: R.scope, a: V(0, 0, -0.02), b: V(0, 0, -0.24), r: 0.016 },
      { o: R.root, a: V(0, -0.012, -0.01), b: V(0, -0.012, -0.24), r: 0.021 },
      { o: R.mag, a: V(0, -0.01, 0.0), b: V(0.03, -0.14, 0.0), r: 0.016 },
      { o: hl.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
      { o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
    ],
    casing: buildCasing338(M),
    recoil: { z: 0.9, x: 1.5, xAds: 0.75, climb: 0.0085, climbAds: 0.007, kick: 0.16 },
    anchorL: V(-0.25, -0.65, -0.16),
    extra,
  });
}
