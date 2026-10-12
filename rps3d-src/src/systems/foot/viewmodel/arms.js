// Braços em 1ª pessoa: luvas articuladas (poses por arma, dedos curvados em
// cadeias de 3 falanges + polegar), antebraço com bracelete e computador de
// pulso, braço; IK de dois ossos do ombro até o punho (cotovelo com vetor de
// polo para baixo/fora). Geometria das mãos refeita só quando a pose muda.
import * as THREE from 'three/webgpu';
import { Parts } from './geo.js';
import { paintMat, polymerMat, fabricMat, glowMat, metalMat, screenMat } from '../materials.js';

const D = Math.PI / 180;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export const POSES = {
  grip: { fingers: [[-38, -42, -22], [-78, -84, -48], [-82, -86, -50], [-84, -88, -52]], thumb: { spread: 34, curl: 46, roll: 0 } },
  trigger: { fingers: [[-58, -60, -30], [-78, -84, -48], [-82, -86, -50], [-84, -88, -52]], thumb: { spread: 34, curl: 46, roll: 0 } },
  fore: { fingers: [[-66, -70, -40], [-74, -78, -46], [-78, -80, -48], [-80, -84, -50]], thumb: { spread: 40, curl: 50, roll: 0 } },
  cup: { fingers: [[-32, -26, -14], [-36, -30, -16], [-40, -32, -18], [-44, -34, -20]], thumb: { spread: 52, curl: 22, roll: 0 } },
  hold: { fingers: [[-52, -58, -38], [-58, -62, -40], [-62, -66, -42], [-66, -70, -44]], thumb: { spread: 30, curl: 50, roll: 0 } },
  open: { fingers: [[-10, -10, -6], [-12, -12, -8], [-14, -14, -10], [-16, -16, -12]], thumb: { spread: 52, curl: 8, roll: 0 } },
  point: { fingers: [[-4, -4, -2], [-82, -86, -50], [-84, -88, -52], [-86, -90, -54]], thumb: { spread: 20, curl: 60, roll: 0 } },
};

const FINGERS = [
  { x: -0.029, len: [0.043, 0.026, 0.021], r: 0.0102 },
  { x: -0.0095, len: [0.047, 0.029, 0.023], r: 0.0106 },
  { x: 0.0105, len: [0.044, 0.027, 0.022], r: 0.0102 },
  { x: 0.029, len: [0.035, 0.021, 0.019], r: 0.0093 },
];

/** Materiais do traje (por preset). */
export function suitMaterials(lite) {
  return {
    glove: polymerMat({ color: '#2e3034', rough: 0.58, scale: 520, lite }),
    palm: polymerMat({ color: '#1d1f22', rough: 0.8, knurl: 1, scale: 900, lite }),
    plate: paintMat({ color: '#30343a', metal: '#9ea4aa', rough: 0.42, wear: 0.55, scale: 40, clearcoat: 0.2, seed: 21, lite, grime: 0.25 }),
    shell: paintMat({ color: '#d9d5cc', metal: '#a5a7a8', rough: 0.4, wear: 0.4, scale: 30, clearcoat: 0.3, seed: 23, lite, grime: 0.3 }),
    accent: paintMat({ color: '#cf5c26', metal: '#a89c90', rough: 0.42, wear: 0.6, scale: 40, clearcoat: 0.2, seed: 25, lite, grime: 0.15 }),
    fabric: fabricMat({ color: '#3a3f46', scale: 520, lite, stitch: '#c87a3a' }),
    joint: metalMat({ color: '#4b4f55', rough: 0.36, scale: 90, lite }),
    led: glowMat('#46d2ff', 7, { pulse: 1.5 }),
    ledOrange: glowMat('#ff8a3a', 5),
  };
}

/** Capsula ao longo de −Z começando em 0. */
function capsule(r, len) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 0.6), 4, 10);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -len / 2);
  return g;
}

/** Monta a geometria de uma mão numa pose (mirror = mão esquerda). */
function buildHand(M, pose, mirror) {
  const P = new Parts();
  const sx = mirror ? -1 : 1;
  // palma + dorso
  P.box(M.glove, 0.084, 0.03, 0.096, [0, 0, -0.05], [0, 0, 0], { r: 0.012, seg: 3 });
  P.box(M.palm, 0.072, 0.008, 0.07, [0, -0.014, -0.055], [0, 0, 0], { r: 0.003 });
  P.box(M.plate, 0.068, 0.012, 0.058, [0.0, 0.019, -0.058], [4 * D, 0, 0], { r: 0.005, seg: 2 });
  P.box(M.accent, 0.012, 0.0125, 0.03, [sx * -0.022, 0.02, -0.06], [4 * D, 0, 0], { r: 0.003 });
  // punho da luva (cano)
  P.cylZ(M.glove, 0.04, 0.036, 0.05, [0, 0, 0.012], { seg: 16 });
  P.ringZ(M.joint, 0.039, 0.004, [0, 0, -0.004], { seg: 20, tube: 6 });
  // dedos
  const curls = pose.fingers;
  FINGERS.forEach((f, i) => {
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3(sx * f.x, 0.0, -0.096);
    // leve espalhamento
    const spread = (i - 1.5) * 3 * D * sx;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -spread);
    const c = curls[i];
    for (let s = 0; s < 3; s++) {
      q.multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), c[s] * D));
      const len = f.len[s], r = f.r * (1 - s * 0.08);
      const geo = capsule(r, len);
      P.add(M.glove, geo, pos.toArray(), q.clone());
      // proteções nos nós (primeira falange)
      if (s === 0) {
        const pg = new THREE.BoxGeometry(r * 1.9, r * 0.9, len * 0.6);
        pg.translate(0, r * 0.75, -len * 0.45);
        P.add(M.plate, pg, pos.toArray(), q.clone());
      }
      pos.add(_v.set(0, 0, -len * 0.92).applyQuaternion(q));
    }
  });
  // polegar
  const th = pose.thumb;
  const base = new THREE.Vector3(sx * -0.038, -0.006, -0.028);
  let dir = new THREE.Vector3(sx * -0.55, -0.2, -0.8).normalize();
  const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  // abre para longe da palma
  tq.premultiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), sx * (th.spread - 30) * D));
  const pos = base.clone();
  const lens = [0.038, 0.03, 0.024];
  for (let s = 0; s < 3; s++) {
    // dobra em direção à palma/indicador
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(tq);
    const toward = new THREE.Vector3(sx * 0.7, -0.7, -0.2).normalize();
    const ax = new THREE.Vector3().crossVectors(d, toward).normalize();
    if (s > 0 || true) tq.premultiply(_q.setFromAxisAngle(ax, (th.curl / 3) * D * (s === 0 ? 0.6 : 1.2)));
    const len = lens[s], r = 0.0118 * (1 - s * 0.1);
    P.add(M.glove, capsule(r, len), pos.toArray(), tq.clone());
    if (s === 1) {
      const pg = new THREE.BoxGeometry(r * 1.8, r * 0.8, len * 0.6); pg.translate(0, r * 0.7, -len * 0.5);
      P.add(M.plate, pg, pos.toArray(), tq.clone());
    }
    pos.add(_v.set(0, 0, -len * 0.92).applyQuaternion(tq));
  }
  // base do polegar (músculo)
  P.sphere(M.glove, 0.02, [sx * -0.03, -0.006, -0.03], { seg: 10, scale: [1, 0.8, 1.4] });
  const g = P.build('mao');
  if (mirror) {
    // espelha a geometria inteira em X (winding corrigido)
    g.traverse((o) => {
      if (!o.isMesh) return;
      void o;
    });
  }
  return g;
}

/** Cilindro com dobras de tecido (ruído radial). */
function foldedSleeve(r0, r1, len, seed = 1) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 20, 10, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.06 * Math.sin(y * 38 + Math.sin(a * 3 + seed) * 2) * (0.6 + 0.4 * Math.sin(a * 2 + y * 9)) + 0.03 * Math.sin(a * 5 + y * 21);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  g.translate(0, len / 2, 0);
  return g;
}
/** Placa curva (setor de cilindro) — blindagem que abraça o braço. */
function curvedPlate(r, len, arc, start, thick = 0.006) {
  const outer = new THREE.CylinderGeometry(r + thick, r + thick, len, 16, 1, false, start, arc);
  outer.translate(0, len / 2, 0);
  return outer;
}

/** Antebraço: ao longo de +Y local (punho em 0 → cotovelo em len). */
function buildForearm(M, len, left, wristScreen) {
  const P = new Parts();
  const sx = left ? -1 : 1;
  // manga de tecido com dobras
  P.add(M.fabric, foldedSleeve(0.036, 0.046, len, left ? 2 : 1), [0, 0, 0]);
  // punho da luva sobre a manga
  P.cylY(M.glove, 0.044, 0.047, 0.06, [0, 0.03, 0], { seg: 18 });
  P.ringZ(M.joint, 0.046, 0.0045, [0, 0.062, 0], { seg: 22, rot: [Math.PI / 2, 0, 0] });
  // braçadeira segmentada (três placas curvas sobrepostas no dorso)
  for (let i = 0; i < 3; i++) {
    const y0 = 0.08 + i * 0.058;
    P.add(i === 1 ? M.shell : M.plate, curvedPlate(0.047 + i * 0.002, 0.066, Math.PI * 1.05, Math.PI * 0.475), [0, y0, 0]);
    P.add(M.joint, curvedPlate(0.05 + i * 0.002, 0.006, Math.PI * 1.05, Math.PI * 0.475, 0.002), [0, y0 + 0.064, 0]);
  }
  // faixa laranja e parafusos
  P.box(M.accent, 0.012, 0.15, 0.006, [0, 0.16, -0.0535], [0, 0, 0], { r: 0.002 });
  for (const yy of [0.1, 0.22]) for (const xx of [-0.03, 0.03]) P.cylZ(M.joint, 0.0032, 0.0032, 0.004, [xx, yy, -0.052], { seg: 8 });
  // tiras
  P.ringZ(M.palm, 0.052, 0.005, [0, len * 0.86, 0], { seg: 22, rot: [Math.PI / 2, 0, 0] });
  // computador de pulso (braço esquerdo): tela voltada para o rosto
  if (wristScreen) {
    P.box(M.plate, 0.056, 0.066, 0.024, [0, 0.11, -0.058], [0, 0, 0], { r: 0.007 });
    P.box(M.joint, 0.06, 0.07, 0.012, [0, 0.11, -0.05], [0, 0, 0], { r: 0.004 });
    P.add(screenMat(wristScreen.tex, 1.8), new THREE.PlaneGeometry(0.044, 0.052), [0, 0.11, -0.0705], [0, Math.PI, 0]);
    P.box(M.led, 0.004, 0.004, 0.004, [-0.024, 0.11 + 0.029, -0.071], [0, 0, 0]);
    P.box(M.ledOrange, 0.004, 0.004, 0.004, [-0.016, 0.11 + 0.029, -0.071], [0, 0, 0]);
  } else {
    // módulo de controle do jetpack/traje no braço direito
    P.box(M.plate, 0.03, 0.06, 0.02, [sx * 0.048, 0.15, 0.0], [0, 0, 0], { r: 0.005 });
    for (let i = 0; i < 3; i++) P.box(i ? M.led : M.ledOrange, 0.004, 0.009, 0.004, [sx * 0.059, 0.13 + i * 0.016, 0.0], [0, 0, 0]);
  }
  return P.build('antebraco');
}

function buildUpperArm(M, len) {
  const P = new Parts();
  P.cylY(M.fabric, 0.05, 0.055, len, [0, len / 2, 0], { seg: 16 });
  P.cylY(M.plate, 0.06, 0.058, len * 0.4, [0, len * 0.65, 0], { seg: 16 });
  P.sphere(M.joint, 0.046, [0, 0, 0], { seg: 12 });
  return P.build('braco');
}

/** Tela do pulso: hora local + O₂. */
export class WristScreen {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = 96; this.cv.height = 112;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.last = '';
    this.draw({ hour: 12, o2: 1, hp: 1 });
  }
  draw({ hour = 12, o2 = 1, hp = 1 }) {
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    const key = `${hh}:${mm}|${Math.round(o2 * 20)}|${Math.round(hp * 20)}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.g;
    g.fillStyle = '#03080b'; g.fillRect(0, 0, 96, 112);
    g.fillStyle = '#46d2ff'; g.font = '700 22px "DejaVu Sans Mono", monospace'; g.textAlign = 'center';
    g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 48, 34);
    g.font = '600 10px "DejaVu Sans Mono", monospace';
    g.fillText('O2', 24, 62); g.fillText('VIT', 72, 62);
    for (const [x, v, c] of [[24, o2, o2 < 0.25 ? '#ffb040' : '#46d2ff'], [72, hp, hp < 0.3 ? '#ff5a48' : '#6dff9a']]) {
      g.strokeStyle = 'rgba(70,210,255,0.25)'; g.lineWidth = 4; g.beginPath(); g.arc(x, 84, 15, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = c; g.beginPath(); g.arc(x, 84, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, v))); g.stroke();
    }
    this.tex.needsUpdate = true;
  }
}

/** Espelha um Group de malhas em X (para a mão esquerda). */
function mirrorGroup(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    const p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
    // inverte a ordem dos vértices de cada triângulo (não indexado)
    for (const name of ['position', 'normal', 'uv']) {
      const a = geo.attributes[name]; if (!a) continue;
      const s = a.itemSize, arr = a.array;
      for (let t = 0; t < a.count; t += 3) {
        for (let k = 0; k < s; k++) { const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k; const tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp; }
      }
      a.needsUpdate = true;
    }
  });
  return g;
}

export class Arm {
  constructor(M, side, { upper = 0.33, fore = 0.31, wristScreen = null } = {}) {
    this.M = M; this.side = side; this.left = side === 'left';
    this.upperLen = upper; this.foreLen = fore;
    this.group = new THREE.Group(); this.group.name = 'braco-' + side;
    this.hand = new THREE.Group(); this.group.add(this.hand);
    this.fore = buildForearm(M, fore, this.left, wristScreen); this.group.add(this.fore);
    this.upper = buildUpperArm(M, upper); this.group.add(this.upper);
    this.handCache = new Map();
    this.poseKey = null;
    this.setPose('grip');
    this.shoulder = new THREE.Vector3(this.left ? -0.25 : 0.24, this.left ? -0.4 : -0.46, this.left ? 0.06 : 0.06);
  }
  setPose(name) {
    if (this.poseKey === name) return;
    this.poseKey = name;
    let g = this.handCache.get(name);
    if (!g) {
      g = buildHand(this.M, POSES[name] || POSES.grip, false);
      if (this.left) mirrorGroup(g);
      this.handCache.set(name, g);
    }
    this.hand.clear();
    this.hand.add(g);
  }
  /**
   * Resolve o braço: wristPos/wristQuat no espaço do grupo pai (viewmodel).
   */
  solve(wristPos, wristQuat) {
    this.hand.position.copy(wristPos);
    this.hand.quaternion.copy(wristQuat);
    const S = this.shoulder, W = wristPos;
    const a = this.upperLen, b = this.foreLen;
    const d = _v.copy(W).sub(S);
    let L = d.length();
    const dir = d.divideScalar(L || 1);
    L = Math.min(L, a + b - 1e-4);
    // cotovelo: lei dos cossenos; polo para baixo/fora
    const cosA = (a * a + L * L - b * b) / (2 * a * L);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pole = _w.set(this.left ? -1.0 : 0.7, this.left ? -0.55 : -1, 0.15).normalize();
    const perp = _a.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = _b.copy(S).addScaledVector(dir, cosA * a).addScaledVector(perp, sinA * a);
    // antebraço: +Y do punho ao cotovelo; roda alinhada ao dorso da mão
    const fy = _c.copy(elbow).sub(W).normalize();
    const handY = new THREE.Vector3(0, 1, 0).applyQuaternion(wristQuat);
    // −Z do antebraço = dorso (alinhado ao dorso da mão)
    const fz = handY.clone().addScaledVector(fy, -handY.dot(fy));
    if (fz.lengthSq() < 1e-6) fz.set(0, 0, 1);
    fz.normalize().negate();
    const fx = new THREE.Vector3().crossVectors(fy, fz);
    this.fore.position.copy(W);
    this.fore.quaternion.setFromRotationMatrix(_m.makeBasis(fx, fy, fz));
    // braço: do cotovelo ao ombro
    const uy = new THREE.Vector3().copy(S).sub(elbow).normalize();
    const uz = new THREE.Vector3().crossVectors(fx, uy).normalize();
    const ux = new THREE.Vector3().crossVectors(uy, uz);
    this.upper.position.copy(elbow);
    this.upper.quaternion.setFromRotationMatrix(_m.makeBasis(ux, uy, uz));
  }
}
