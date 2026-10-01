/**
 * Infraestrutura urbana: postes de concreto cônicos com cruzetas de aço,
 * isoladores de disco empilhados, transformador, caixas de junção,
 * emaranhados de cabos (feixes com flechas diferentes, fios soltos
 * pendurados), luminárias "cabeça de cobra" com braço curvo e toldos de
 * lona com caimento e franja.
 */
import * as THREE from 'three';
import { cached, mat4 } from './geo.js';
import { cable, cylBetween, cylinder } from './shapes.js';

const UNIT = () => cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
const taper = () => cached('poleTaper', () => new THREE.CylinderGeometry(0.095, 0.16, 1, 10, 1));
const disc = () => cached('insDisc', () => new THREE.CylinderGeometry(1, 1, 1, 10, 1));

/** Poste de concreto. yaw = direção da cruzeta. Retorna os pontos de fixação. */
export function utilityPole(W, x, z, yaw = 0, opts = {}) {
  const { B, rng } = W;
  const h = opts.h || 8.6;
  const tilt = [rng.range(-0.025, 0.025), 0, rng.range(-0.025, 0.025)];
  const PM = mat4([x, 0, z], tilt);
  const L = (p, r = [0, 0, 0], s = [1, 1, 1]) => PM.clone().multiply(mat4(p, r, s));
  B.add(taper(), 'concrete', L([0, h / 2, 0], [0, 0, 0], [1, h, 1]), { color: [0.74, 0.72, 0.68], ao: [0, 1.2, 0.55] });
  // placa de numeração + cartazes velhos
  B.add(UNIT(), 'metal', L([0, 2.6, 0.15], [0, 0, 0], [0.16, 0.22, 0.01]), { color: [0.85, 0.85, 0.8], uvRand: true });
  const dir = [Math.cos(yaw), -Math.sin(yaw)];
  const pts = [];
  const arms = opts.arms ?? (rng.chance(0.4) ? 2 : 1);
  for (let a = 0; a < arms; a++) {
    const ya = h - 0.45 - a * 0.9;
    // cruzeta em cantoneira de aço + mãos-francesas
    B.add(UNIT(), 'metal', L([0, ya, 0], [0, yaw, 0], [2.0, 0.08, 0.08]), { color: [0.36, 0.34, 0.3], uvRand: true });
    for (const s of [-1, 1]) {
      const p0 = new THREE.Vector3(dir[0] * s * 0.6, ya - 0.04, dir[1] * s * 0.6).applyMatrix4(PM);
      const p1 = new THREE.Vector3(0, ya - 0.55, 0).applyMatrix4(PM);
      cylBetween(B, p0.toArray(), p1.toArray(), 0.012, 'metal', { seg: 4, color: [0.36, 0.34, 0.3] });
    }
    for (const s of [-0.85, -0.3, 0.3, 0.85]) {
      if (a === 1 && Math.abs(s) < 0.5) continue;
      const pp = new THREE.Vector3(dir[0] * s, ya + 0.05, dir[1] * s).applyMatrix4(PM);
      // isolador: 3 discos de vidro/porcelana
      for (let k = 0; k < 3; k++) B.add(disc(), k % 2 ? 'glass' : 'plastic', mat4([pp.x, pp.y + 0.04 + k * 0.055, pp.z], [0, 0, 0], [0.055 - k * 0.006, 0.035, 0.055 - k * 0.006]), { color: k % 2 ? [0.6, 0.8, 0.7] : [0.75, 0.62, 0.5] });
      pts.push([pp.x, pp.y + 0.2, pp.z]);
    }
  }
  if (opts.transformer) {
    const tp = new THREE.Vector3(0.38, h - 2.6, 0).applyMatrix4(PM);
    cylinder(B, tp.x, tp.y, tp.z, 0.3, 0.9, 'metal', { seg: 14, color: [0.5, 0.55, 0.52] });
    B.add(UNIT(), 'metal', mat4([tp.x - 0.05, tp.y + 0.45, tp.z], [0, 0, 0], [0.5, 0.06, 0.66]), { color: [0.45, 0.48, 0.45] });
    for (const s of [-0.12, 0, 0.12]) cylBetween(B, [tp.x + s, tp.y + 0.9, tp.z], [tp.x + s, tp.y + 1.15, tp.z], 0.025, 'plastic', { seg: 6, color: [0.55, 0.42, 0.32] });
    // escorrido de óleo no poste
  }
  // caixa de junção com cabos descendo pelo poste
  if (opts.junction ?? rng.chance(0.5)) {
    const jp = new THREE.Vector3(0, 3.2, -0.2).applyMatrix4(PM);
    B.add(UNIT(), 'metal', mat4([jp.x, jp.y, jp.z], [0, rng.range(-0.1, 0.1), 0], [0.32, 0.45, 0.18]), { color: [0.55, 0.58, 0.55], uvRand: true });
    for (let k = 0; k < 3; k++) cylBetween(B, [jp.x + k * 0.03 - 0.03, jp.y + 0.22, jp.z], [jp.x + k * 0.04 - 0.04, h - 0.6, jp.z + 0.06], 0.01, 'cable', { seg: 4 });
    cylBetween(B, [jp.x, jp.y - 0.22, jp.z], [jp.x + 0.02, 0.0, jp.z + 0.04], 0.018, 'plastic', { seg: 5, color: [0.2, 0.2, 0.2] });
  }
  B.collider([x - 0.17, 0, z - 0.17], [x + 0.17, h, z + 0.17], 'concrete');
  return pts;
}

/**
 * Feixe de cabos entre dois pontos: n fios com flechas ligeiramente
 * diferentes (emaranhado), às vezes um fio solto pendendo.
 */
export function cableBundle(W, a, b, sag, n = 3, opts = {}) {
  const { B, rng } = W;
  for (let i = 0; i < n; i++) {
    const o = [rng.range(-0.05, 0.05), rng.range(-0.06, 0.06), rng.range(-0.05, 0.05)];
    cable(B, [a[0] + o[0], a[1] + o[1], a[2] + o[2]], [b[0] + o[0], b[1] + o[1], b[2] + o[2]], sag * rng.range(0.85, 1.25), rng.range(0.007, 0.014), 'cable', 12);
  }
  if (opts.loose ?? rng.chance(0.25)) {
    // fio rompido pendendo de um dos lados
    const t = rng.range(0.15, 0.4);
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    const q = [p[0] + rng.range(-0.4, 0.4), p[1] - rng.range(1.2, 3.5), p[2] + rng.range(-0.4, 0.4)];
    cable(B, p, q, -0.15, 0.008, 'cable', 8);
  }
}

/** Luminária com braço curvo e cabeça "cobra". side: lado da rua (+1/-1). */
export function streetLamp(W, x, z, side, opts = {}) {
  const { B, rng } = W;
  const h = opts.h || 7.2;
  const lean = rng.range(-0.02, 0.02);
  cylBetween(B, [x, 0, z], [x + lean, h, z], 0.075, 'metal', { seg: 10, color: [0.42, 0.44, 0.42], ao: [0, 1, 0.6] });
  cylBetween(B, [x, 0, z], [x, 0.5, z], 0.11, 'metal', { seg: 10, color: [0.38, 0.4, 0.38] });
  // braço curvo (arco em 6 segmentos)
  let prev = [x + lean, h, z];
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const p = [x + lean - side * 1.5 * t, h + 0.55 * Math.sin(t * Math.PI * 0.5), z];
    cylBetween(B, prev, p, 0.045, 'metal', { seg: 6, color: [0.42, 0.44, 0.42] });
    prev = p;
  }
  // cabeça: carcaça afunilada + refrator
  const hx = x + lean - side * 1.72;
  const head = cached('lampHead', () => {
    const g = new THREE.CylinderGeometry(0.16, 0.2, 0.62, 10, 1);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 0.5, 1);
    return g;
  });
  B.add(head, 'metal', mat4([hx, h + 0.52, z], [0, 0, side * 0.08]), { color: [0.5, 0.52, 0.5] });
  const broken = rng.chance(0.4);
  if (!broken) B.add(UNIT(), 'glass', mat4([hx, h + 0.45, z], [0, 0, side * 0.08], [0.48, 0.03, 0.24]), { color: [1.4, 1.4, 1.3] });
  else B.add(UNIT(), 'black', mat4([hx, h + 0.46, z], [0, 0, side * 0.08], [0.46, 0.02, 0.22]), { color: [1, 1, 1] });
  B.collider([x - 0.11, 0, z - 0.11], [x + 0.11, h, z + 0.11], 'metal');
}

/**
 * Toldo de lona com caimento: malha subdividida que cede no meio, franja
 * ondulada na borda e listras (cor de vértice). p: ponto de fixação no
 * centro da parede; uDir/nDir eixos da fachada.
 */
export function awning(W, p, uDir, nDir, width, depth, tint, opts = {}) {
  const { B, rng } = W;
  const nu = 10, nv = 4;
  const drop = opts.drop ?? 0.45;
  const torn = opts.torn ?? rng.chance(0.3);
  const pos = [];
  const cols = [];
  const pt = (i, j) => {
    const u = (i / nu - 0.5) * width, v = (j / nv) * depth;
    const sag = Math.sin((i / nu) * Math.PI) * 0.08 * (j / nv) + Math.sin((j / nv) * Math.PI) * 0.04;
    return [p[0] + uDir[0] * u + nDir[0] * v, p[1] - (j / nv) * drop - sag, p[2] + uDir[2] * u + nDir[2] * v];
  };
  const stripe = (i) => (Math.floor((i / nu) * 8) % 2 ? tint : [0.86, 0.84, 0.78]);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      if (torn && j === nv - 1 && (i === 3 || i === 4)) continue; // rasgo
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      const s = stripe(i);
      for (let k = 0; k < 6; k++) cols.push(s);
    }
  }
  // franja ondulada
  for (let i = 0; i < nu; i++) {
    const a = pt(i, nv), b = pt(i + 1, nv);
    const a2 = [a[0], a[1] - 0.16, a[2]], b2 = [b[0], b[1] - 0.16, b[2]];
    pos.push(...a, ...b, ...b2, ...a, ...b2, ...a2);
    for (let k = 0; k < 6; k++) cols.push(tint);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols.flat(), 3));
  B.add(g, 'fabricDS', null, { vcolor: true });
  // armação
  for (const s of [-0.5, 0.5]) {
    const a = [p[0] + uDir[0] * s * width, p[1], p[2] + uDir[2] * s * width];
    const b = [a[0] + nDir[0] * depth, p[1] - drop, a[2] + nDir[2] * depth];
    cylBetween(B, a, b, 0.012, 'metal', { seg: 4, color: [0.3, 0.3, 0.3] });
  }
}
