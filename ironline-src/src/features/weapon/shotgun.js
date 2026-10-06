/**
 * Escopeta de bomba "BR-12" (design original do IRONLINE): calibre 12,
 * receptor de liga usinado com janela de ejeção e porta de carga embaixo,
 * tubo de 7 cartuchos com tampa serrilhada, cano com braçadeira, telha de
 * bomba de polímero com sulcos, barras de ação de aço, alça de abertura
 * ("anel fantasma") + massa alta com inserto laranja, porta-cartuchos
 * lateral (4 cartuchos à vista no lado esquerdo) e coronha fixa com punho.
 *
 * Animações próprias: bomba depois de cada tiro (a mão de apoio vai junto,
 * a cápsula sai no recuo da telha) e recarga CARTUCHO A CARTUCHO montada
 * para o número que falta (atirar interrompe); vazio → bomba no fim.
 */
import * as THREE from 'three';
import { Kit, side, section, rbox, cylZ, cylX, cylY, torus } from './geo.js';
import { picatinny, pistolGrip, buildTrigger, swivel, pin, screw } from './parts.js';
import { makeGuardSdf } from './grip.js';
import { basisFD } from './guns.js';
import { assembleLongGun, inspectTrack, equipFor, V } from './rig.js';
import { Track } from './anim.js';

const TOP = 0.024;
const TUBE_Y = -0.0265;
const PUMP = [0.28, 0.465]; // telha em repouso (u)
const PUMP_TRAVEL = 0.075;

/** Cartucho 12 (casca vermelha, base de latão). Eixo ao longo de −Z, base em z = 0. */
export function buildShell(M, { fired = false } = {}) {
  const K = new Kit();
  K.add('brass', cylZ(0.0112, 0.0, -0.0016, { seg: 20 })); // aro
  K.add('brass', cylZ(0.0104, -0.0016, -0.016, { seg: 20 }));
  K.add('hull', cylZ(0.0101, -0.016, -0.065, { seg: 20 }));
  // dobra estrelada na boca (ou aberta, se deflagrado)
  if (fired) K.add('cavity', cylZ(0.0088, -0.0646, -0.0652, { seg: 16 }));
  else for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    K.add('hull', rbox(0.007, 0.0026, 0.004, 0.001, Math.cos(a) * 0.004, Math.sin(a) * 0.004, -0.066).rotateZ(0));
  }
  K.add('steel', cylZ(0.0026, 0.0002, -0.0004, { seg: 12 })); // espoleta
  return K.build(M, fired ? 'shellFired' : 'shell');
}

export function buildBR12(M) {
  const root = new THREE.Group();
  root.name = 'BR-12';
  const K = new Kit();

  // ─── receptor ────────────────────────────────────────────────────────
  K.add('receiver', side([
    [-0.018, -0.03], [0.205, -0.034], [0.212, -0.028], [0.212, TOP - 0.006], [0.205, TOP],
    [0.02, TOP], [-0.004, TOP - 0.002], [-0.018, 0.006],
  ], 0.032, { b: 0.0026, seg: 3 }));
  // painéis rebaixados nos flancos
  for (const sx of [-1, 1]) K.add('receiver', side([[0.03, -0.022], [0.19, -0.022], [0.19, 0.016], [0.03, 0.016]], 0.0012, { b: 0.0005, cx: sx * 0.0162 }));
  // janela de ejeção (direita) com o ferrolho aparecendo
  K.add('cavity', rbox(0.0012, 0.022, 0.06, 0.0015, 0.0168, 0.002, -0.11, 1));
  // porta de carga (embaixo) e elevador
  K.add('cavity', rbox(0.022, 0.0012, 0.07, 0.003, 0, -0.0335, -0.165, 1));
  K.add('steel', rbox(0.018, 0.001, 0.05, 0.001, 0, -0.031, -0.17));
  // botão de liberação da ação (atrás do guarda-mato, esquerda) e trava cruzada
  K.add('steel', rbox(0.004, 0.012, 0.009, 0.0016, -0.0165, -0.042, -0.135));
  K.add('steel', cylX(0.0042, 0.036, 0, -0.04, -0.03, 16));
  // pinos do grupo do gatilho
  for (const u of [0.045, 0.165]) pin(K, u, -0.022, 0.032, 0.0028);
  // placa do gatilho + guarda-mato
  const tg = new THREE.Shape();
  tg.moveTo(0.14, -0.034);
  tg.lineTo(0.14, -0.06);
  tg.quadraticCurveTo(0.136, -0.073, 0.12, -0.074);
  tg.lineTo(0.048, -0.072);
  tg.lineTo(0.03, -0.05);
  tg.lineTo(0.03, -0.033);
  K.add('polymer', side(tg, 0.016, { b: 0.002, holes: [[[0.052, -0.044], [0.118, -0.044], [0.124, -0.05], [0.122, -0.066], [0.056, -0.066], [0.05, -0.058]]] }));
  pistolGrip(K, { style: 2 });
  // trilho curto no topo + alça de abertura (anel fantasma)
  picatinny(K, 'rail', 0.0, 0.11, TOP, { w: 0.02 });
  const railTop = TOP + 0.0077;
  {
    const ry = railTop;
    K.add('steel', rbox(0.022, 0.006, 0.018, 0.0015, 0, ry + 0.003, -0.03));
    for (const sx of [-1, 1]) K.add('steel', rbox(0.004, 0.022, 0.012, 0.0014, sx * 0.0095, ry + 0.014, -0.03));
    K.add('steel', torus(0.0052, 0.0018, 0, ry + 0.0158, -0.03, 0, 0, 0));
    K.add('steel', rbox(0.004, 0.004, 0.006, 0.001, 0, ry + 0.023, -0.03));
  }
  const sightY = railTop + 0.0158;

  // ─── cano, tubo do carregador, braçadeira, massa de mira ──────────────
  K.add('steel', cylZ(0.0108, -0.205, -0.665, { seg: 28 }));
  K.add('cavity', cylZ(0.0092, -0.6648, -0.6656, { seg: 24 }));
  K.add('steel', cylZ(0.0118, -0.205, -0.24, { seg: 28 })); // reforço (castelo)
  K.add('steel', cylZ(0.0118, -0.205, -0.635, { y: TUBE_Y, seg: 28 }));
  // tampa do tubo serrilhada + olhal
  K.add('steel', cylZ(0.0128, -0.635, -0.66, { y: TUBE_Y, seg: 28 }));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    K.add('steel', rbox(0.0016, 0.0016, 0.018, 0.0005, Math.cos(a) * 0.0129, TUBE_Y + Math.sin(a) * 0.0129, -0.648, 1));
  }
  K.add('steel', torus(0.006, 0.0015, -0.012, TUBE_Y, -0.65, 0, Math.PI / 2, 0));
  // braçadeira cano-tubo
  K.add('receiver', rbox(0.03, 0.05, 0.016, 0.006, 0, -0.012, -0.6));
  screw(K, -0.0152, -0.012, -0.6, -1, 0.0022);
  // massa de mira alta (rampa + lâmina com inserto laranja)
  K.add('steel', side([[0.6, 0.009], [0.648, 0.009], [0.646, 0.018], [0.635, 0.03], [0.628, sightY - 0.002], [0.622, sightY - 0.002], [0.618, 0.022], [0.605, 0.013]], 0.008, { b: 0.0012 }));
  K.add('sightRing', rbox(0.0034, 0.0045, 0.0022, 0.0006, 0, sightY - 0.003, -0.6226));

  // ─── barras de ação (aparecem quando a bomba recua) ─────────────────
  // (fixas no receptor; as da telha vão no grupo móvel)
  // ─── coronha fixa com punho ─────────────────────────────────────────
  const st = new THREE.Shape();
  st.moveTo(-0.016, 0.012);
  st.lineTo(-0.11, 0.018);
  st.lineTo(-0.27, 0.024);
  st.quadraticCurveTo(-0.282, 0.024, -0.282, 0.012);
  st.lineTo(-0.282, -0.098);
  st.quadraticCurveTo(-0.27, -0.105, -0.25, -0.1);
  st.quadraticCurveTo(-0.13, -0.07, -0.06, -0.06);
  st.lineTo(-0.03, -0.05);
  st.lineTo(-0.018, -0.03);
  K.add('polymer', side(st, 0.034, { b: 0.008, seg: 4, holes: [[[-0.07, -0.035], [-0.2, -0.03], [-0.24, -0.04], [-0.24, -0.075], [-0.2, -0.078], [-0.1, -0.055]]] }));
  K.add('rubber', side([[-0.282, 0.025], [-0.302, 0.026], [-0.304, -0.1], [-0.284, -0.1]], 0.037, { b: 0.006, seg: 3 }));
  for (let i = 0; i < 10; i++) K.add('cavity', rbox(0.038, 0.0014, 0.012, 0.0005, 0, 0.016 - i * 0.012, 0.301, 1));
  swivel(K, 'steel', -0.018, -0.07, 0.24);

  // ─── porta-cartuchos lateral (esquerda) com 4 cartuchos ─────────────
  K.add('polymer', rbox(0.006, 0.05, 0.072, 0.003, -0.0195, -0.004, -0.12));
  for (let i = 0; i < 4; i++) {
    const z = -0.093 - i * 0.0185;
    K.add('polymer', rbox(0.004, 0.012, 0.0045, 0.0012, -0.0235, 0.014, z - 0.0092));
  }
  root.add(K.build(M, 'br12'));
  // cartuchos no porta-cartuchos (base para baixo)
  for (let i = 0; i < 4; i++) {
    const s = buildShell(M);
    s.position.set(-0.0335, -0.03, -0.093 - i * 0.0185);
    s.rotation.x = Math.PI / 2; // base de latão embaixo, casca para cima
    root.add(s);
  }

  // ─── telha da bomba (móvel) ──────────────────────────────────────────
  const pump = new THREE.Group();
  pump.name = 'pump';
  {
    const k = new Kit();
    const L = PUMP[1] - PUMP[0];
    const sec = [];
    const hw = 0.0205, top = -0.003, bot = -0.05, r = 0.009;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI;
      sec.push([Math.cos(a) * hw, bot + r + Math.sin(a) * r * 0.0 + (i === 0 || i === 8 ? 0 : 0)]);
    }
    const prof = [[-hw, top], [-hw, bot + r], [-hw + r * 0.3, bot + r * 0.3], [-hw + r, bot], [hw - r, bot], [hw - r * 0.3, bot + r * 0.3], [hw, bot + r], [hw, top], [hw - 0.006, top + 0.005], [-hw + 0.006, top + 0.005]];
    k.add('polymer', section(prof, -PUMP[0], L, { b: 0.003, seg: 3 }));
    // sulcos de pegada (anéis rebaixados) e batentes nas pontas
    for (let i = 0; i < 9; i++) {
      const z = -(PUMP[0] + 0.03 + i * 0.015);
      for (const sx of [-1, 1]) k.add('cavity', rbox(0.0012, 0.03, 0.0042, 0.0008, sx * (hw + 0.0002), -0.026, z, 1));
      k.add('cavity', rbox(0.026, 0.0012, 0.0042, 0.0008, 0, bot - 0.0002, z, 1));
    }
    k.add('polymer', section(prof.map(([x, y]) => [x * 1.08, y * 1.04 + 0.001]), -PUMP[0], 0.012, { b: 0.003 }));
    k.add('polymer', section(prof.map(([x, y]) => [x * 1.06, y * 1.03 + 0.0008]), -(PUMP[1] - 0.012), 0.012, { b: 0.003 }));
    // barras de ação (saem para trás da telha até o receptor)
    for (const sx of [-1, 1]) k.add('steel', rbox(0.002, 0.007, 0.075, 0.0006, sx * 0.0128, -0.017, -(PUMP[0] - 0.035)));
    pump.add(k.build(M, 'pump'));
  }
  root.add(pump);

  // ─── peças móveis ───────────────────────────────────────────────────
  const trigger = buildTrigger(M, { mat: 'steel' });
  root.add(trigger);
  // ferrolho visível na janela (recua com a bomba)
  const bolt = new THREE.Group();
  {
    const k = new Kit();
    k.add('bright', rbox(0.004, 0.016, 0.05, 0.0015, 0.0155, 0.002, -0.11));
    k.add('steel', cylX(0.0018, 0.003, 0.0172, 0.004, -0.13, 10));
    bolt.add(k.build(M, 'bolt'));
  }
  root.add(bolt);
  // cartucho da recarga (vai da mão até a porta de carga) — o "carregador" da mecânica genérica
  const mag = new THREE.Group();
  mag.name = 'mag';
  const shellIn = buildShell(M);
  shellIn.rotation.x = 0;
  mag.add(shellIn);
  mag.position.set(0, -0.03, -0.14);
  mag.visible = false;
  root.add(mag);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -0.67);
  root.add(muzzle);
  const ejectPort = new THREE.Object3D();
  ejectPort.position.set(0.017, 0.003, -0.11);
  root.add(ejectPort);

  return {
    root, pump, bolt, mag, trigger, muzzle, ejectPort,
    sight: new THREE.Vector3(0, sightY, -0.03),
    railTop,
    mounts: {
      muzzle: null,
      under: null,
      side: { u: 0.5, x: -0.0215, y: -0.032, onPump: true },
      top: null,
    },
    cosmetic: {
      counter: { pos: V(-0.0168, -0.012, -0.05) },
      stickers: [
        { pos: V(-0.0168, 0.004, -0.17), n: V(-1, 0, 0), size: 0.022 },
        { pos: V(-0.017, -0.06, 0.12), n: V(-1, 0, 0), size: 0.026 },
        { pos: V(-0.017, -0.02, 0.2), n: V(-1, 0, 0), size: 0.022 },
        { pos: V(-0.0168, 0.004, -0.04), n: V(-1, 0, 0), size: 0.016 },
      ],
      charm: V(-0.026, -0.072, 0.24),
    },
  };
}

// ─── trilhas ─────────────────────────────────────────────────────────────
const Z6 = [0, 0, 0, 0, 0, 0];
/** Bomba depois do tiro: a telha vai e volta, a cápsula sai no recuo. */
function pumpAction() {
  const D = 0.44;
  return {
    name: 'pump', duration: D, allowAds: true,
    gun: new Track([{ t: 0, v: Z6 }, { t: 0.1, v: [0.004, -0.006, 0.012, 0.02, 0.03, 0.05], e: 'out' }, { t: 0.24, v: [-0.002, 0.004, -0.006, -0.015, 0.0, -0.02], e: 'inOut' }, { t: D, v: Z6, e: 'inOut' }]),
    pumpT: new Track([{ t: 0, v: [0] }, { t: 0.04, v: [0] }, { t: 0.15, v: [1], e: 'out' }, { t: 0.2, v: [1] }, { t: 0.3, v: [0], e: 'in' }, { t: D, v: [0] }]),
    ejectAt: 0.13,
    foley: [[0.05, 'pump_back'], [0.22, 'pump_fwd']],
  };
}

/**
 * Recarga cartucho a cartucho: entra (gira a arma para mostrar a porta),
 * n × (pega o cartucho, encaixa, empurra), sai; vazio → bomba no fim.
 */
function shellReload(n, empty) {
  const n2 = Math.max(1, n);
  const S = 0.46; // por cartucho
  const IN = 0.34, OUT = empty ? 0.62 : 0.32;
  const D = IN + n2 * S + OUT;
  const tilt = [-0.04, 0.06, -0.02, 0.18, 0.18, -0.62];
  const gunK = [{ t: 0, v: Z6 }, { t: IN, v: tilt, e: 'inOut' }];
  const magK = [{ t: 0, v: [-0.05, -0.2, 0.06, 0.6, 0.2, 0.3] }];
  const handK = [{ t: 0, v: [1, 0, 0, 0] }, { t: IN * 0.8, v: [0, 1, 0, 0], e: 'inOut' }];
  const inserts = [];
  const foley = [];
  for (let i = 0; i < n2; i++) {
    const t0 = IN + i * S;
    // cartucho: aparece embaixo (mão), sobe até a porta, entra e some
    magK.push(
      { t: t0, v: [-0.05, -0.2, 0.06, 0.6, 0.2, 0.3] },
      { t: t0 + 0.2, v: [0.0, -0.022, 0.03, 0.12, 0, 0.0], e: 'out' },
      { t: t0 + 0.3, v: [0.0, -0.004, 0.026, 0.0, 0, 0.0], e: 'inOut' },
      { t: t0 + 0.37, v: [0.0, 0.0, -0.035, 0.0, 0, 0.0], e: 'in' },
      { t: t0 + 0.38, v: [-0.05, -0.2, 0.06, 0.6, 0.2, 0.3], e: 'linear' },
    );
    // a arma dá um tranquinho no encaixe
    gunK.push({ t: t0 + 0.34, v: tilt }, { t: t0 + 0.38, v: tilt.map((x, k) => x + [0, 0.004, 0, 0.02, 0, 0][k]), e: 'out' }, { t: t0 + S, v: tilt, e: 'inOut' });
    inserts.push(t0 + 0.37);
    foley.push([t0 + 0.32, 'shell_in']);
  }
  const tEnd = IN + n2 * S;
  if (empty) {
    gunK.push({ t: tEnd + 0.18, v: [0, 0.01, 0, 0.05, 0.05, -0.1], e: 'inOut' }, { t: tEnd + 0.4, v: [0.005, -0.004, 0.012, 0.02, 0.03, 0.05], e: 'out' }, { t: D, v: Z6, e: 'inOut5' });
    foley.push([tEnd + 0.26, 'pump_back'], [tEnd + 0.44, 'pump_fwd']);
  } else gunK.push({ t: D, v: Z6, e: 'inOut5' });
  handK.push({ t: tEnd - 0.06, v: [0, 1, 0, 0] }, { t: tEnd + 0.16, v: [1, 0, 0, 0], e: 'inOut' });
  const pumpK = [{ t: 0, v: [0] }, { t: tEnd + 0.2, v: [0] }];
  if (empty) pumpK.push({ t: tEnd + 0.3, v: [1], e: 'out' }, { t: tEnd + 0.36, v: [1] }, { t: tEnd + 0.46, v: [0], e: 'in' });
  pumpK.push({ t: D + 0.01, v: [0] });
  return {
    name: empty ? 'reloadEmpty' : 'reload', duration: D, busy: true, shells: n2,
    gun: new Track(gunK), mag: new Track(magK), hand: new Track(handK), pumpT: new Track(pumpK),
    inserts, foley, shellWin: Array.from({ length: n2 }, (_, i) => [IN + i * S + 0.01, IN + i * S + 0.375]),
  };
}
/** Sair da recarga no meio (atirou): volta rápido à pega. */
function reloadExit() {
  const D = 0.26;
  return {
    name: 'reloadExit', duration: D, busy: true,
    gun: new Track([{ t: 0, v: [-0.04, 0.06, -0.02, 0.18, 0.18, -0.62] }, { t: D, v: Z6, e: 'inOut' }]),
    hand: new Track([{ t: 0, v: [0, 1, 0, 0] }, { t: D * 0.8, v: [1, 0, 0, 0], e: 'inOut' }]),
  };
}

export function makeBR12(M, handR, handL, params, extra = {}) {
  const R = buildBR12(M);
  const guardSdf = makeGuardSdf({ cy: -0.0265, hx: 0.0205, hy: 0.0235, r: 0.009, z0: -PUMP[0], z1: -PUMP[1] });
  const tmp = [0];
  const tmp6 = [0, 0, 0, 0, 0, 0];
  return assembleLongGun(M, handR, handL, params, {
    id: 'br12', kind: 'shotgun', R,
    pivot: V(0, -0.03, -0.16),
    hip: [[0.1, -0.15, -0.44], [0.045, 0.19, -0.06]],
    sprint: [[-0.03, -0.05, 0.03], [-0.34, 0.6, 0.42]],
    eyeRelief: 0.26,
    vmFov: { hip: 50, ads: 34 },
    guardSdf, guardCy: -0.0265,
    grip: { phi: 3.75, z: -0.385, fwd: 0.25, thumbUp: -0.004, thumbX: -0.026, over: false },
    gripAds: { phi: 4.05, z: -0.38, fwd: 0.3, thumbUp: -0.008 },
    magRest: { pos: V(0, -0.03, -0.14), rot: new THREE.Euler(0, 0, 0) },
    // mão no cartucho: dedos em volta da casca, por baixo
    magGrip: basisFD([0.15, 0.3, -1], [-1, -0.2, 0], [-0.03, -0.035, 0.02]),
    slap: basisFD([0.3, 0.1, -1], [-0.2, -1, 0], [-0.01, -0.2, -0.11]),
    catchGrip: basisFD([0, 0.3, -1], [-1, 0, 0], [-0.042, -0.055, -0.06]),
    anims: {
      reload: shellReload(1, false),
      reloadEmpty: shellReload(1, true),
      reloadExit: reloadExit(),
      pump: pumpAction(),
      inspect: inspectTrack(3.4, [-0.07, 0.055, 0.03, 0.12, 0.85, -0.3], [-0.02, 0.06, 0.04, 0.2, -0.45, 0.85], { mid: [-0.05, 0.08, 0.02, 0.05, 0.4, -0.9] }),
      equip: equipFor(0.6),
    },
    holster: 0.3,
    shellReload,
    occ: (hl, hr) => [
      { o: R.pump, a: V(0, -0.026, -PUMP[0]), b: V(0, -0.026, -PUMP[1]), r: 0.024 },
      { o: hl.thumb[1], a: V(0, 0, 0.004), b: V(0, 0, -0.03), r: 0.011 },
      { o: R.root, a: V(0, -0.052, -0.035), b: V(0, -0.148, -0.0), r: 0.0155 },
      { o: R.root, a: V(0, 0.0, -0.21), b: V(0, 0.0, -0.66), r: 0.011 },
      { o: R.root, a: V(0, -0.005, -0.0), b: V(0, -0.005, -0.2), r: 0.022 },
      { o: hl.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
      { o: hr.root, a: V(0, 0.0, -0.03), b: V(0, 0.0, -0.065), r: 0.03 },
    ],
    casing: buildShell(M, { fired: true }),
    recoil: { z: 1.3, x: 2.4, xAds: 1.5, climb: 0.016, climbAds: 0.013, kick: 0.26, yaw: 1.8 },
    anchorL: V(-0.24, -0.62, -0.18),
    animate: (g, info) => {
      const act = info.act;
      let p = 0;
      if (act?.pumpT) p = act.pumpT.eval(info.t, tmp)[0];
      R.pump.position.z = p * PUMP_TRAVEL;
      R.bolt.position.z = p * 0.06;
      g.leftOffset = p > 0 ? (g._lo ||= new THREE.Vector3()).set(0, 0, p * PUMP_TRAVEL) : null;
      // cartucho da recarga: visível só enquanto está na mão/entrando
      let vis = false;
      if (act?.shellWin) for (const [a, b] of act.shellWin) if (info.t >= a && info.t <= b) vis = true;
      R.mag.visible = vis;
      void tmp6;
    },
    extra,
  });
}
