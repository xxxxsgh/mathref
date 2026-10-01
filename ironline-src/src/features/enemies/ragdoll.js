/**
 * Ragdoll por partículas de Verlet (Jakobsen): juntas do esqueleto viram
 * partículas ligadas por restrições de distância; o tronco é um cluster
 * quase rígido, membros têm limites mínimos (não dobram "para dentro"),
 * e o fuzil vira um corpo rígido de 3 partículas que cai separado.
 *
 * Colisão: chão via raycast para baixo (calçada, degraus, entulho) e
 * paredes via raycast entre a posição anterior e a atual. Atrito no chão
 * e "sono" quando a energia cai. A pose dos ossos é reconstruída a cada
 * frame a partir das partículas (mesmo caminho de quadros da IK).
 */
import * as THREE from 'three';
import { B, NB, REST, PARENT, frameQuat, perp } from './rig.js';
import { RIFLE } from './soldier.js';

const P = {
  pelvis: 0, spine: 1, chest: 2, neck: 3, head: 4,
  shL: 5, elL: 6, wrL: 7, tipL: 8,
  shR: 9, elR: 10, wrR: 11, tipR: 12,
  hipL: 13, knL: 14, anL: 15, toeL: 16,
  hipR: 17, knR: 18, anR: 19, toeR: 20,
  gun: 21, muzzle: 22, gunTop: 23,
};
const NP = 24;
const RADIUS = [0.12, 0.12, 0.13, 0.06, 0.11, 0.07, 0.05, 0.04, 0.03, 0.07, 0.05, 0.04, 0.03, 0.08, 0.06, 0.05, 0.04, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.03];

const HEAD_OFF = new THREE.Vector3(0, 0.1, 0.01);
const TIP_OFF = new THREE.Vector3(0, -0.09, 0);
const TOE_OFF = new THREE.Vector3(0, -0.07, 0.17);
const MUZZLE = new THREE.Vector3(...RIFLE.muzzle);
const GUNTOP = new THREE.Vector3(0, 0.2, 0);

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const _lu = new THREE.Vector3(), _ls = new THREE.Vector3(), _lf = new THREE.Vector3();
const _la = new THREE.Vector3(), _lm = new THREE.Vector3(), _lo = new THREE.Vector3();

/** posições das partículas a partir de uma pose (Qm/Pm, espaço do modelo) */
function particlesFromPose(anim, out) {
  const { Qm, Pm } = anim;
  const set = (i, v) => out[i].copy(v);
  set(P.pelvis, Pm[B.hips]);
  set(P.spine, Pm[B.spine]);
  set(P.chest, Pm[B.chest]);
  set(P.neck, Pm[B.neck]);
  out[P.head].copy(HEAD_OFF).applyQuaternion(Qm[B.head]).add(Pm[B.head]);
  for (const s of ['L', 'R']) {
    set(P['sh' + s], Pm[B['upperArm.' + s]]);
    set(P['el' + s], Pm[B['foreArm.' + s]]);
    set(P['wr' + s], Pm[B['hand.' + s]]);
    out[P['tip' + s]].copy(TIP_OFF).applyQuaternion(Qm[B['hand.' + s]]).add(Pm[B['hand.' + s]]);
    set(P['hip' + s], Pm[B['thigh.' + s]]);
    set(P['kn' + s], Pm[B['shin.' + s]]);
    set(P['an' + s], Pm[B['foot.' + s]]);
    out[P['toe' + s]].copy(TOE_OFF).applyQuaternion(Qm[B['foot.' + s]]).add(Pm[B['foot.' + s]]);
  }
  out[P.gun].copy(anim.weaponP);
  out[P.muzzle].copy(MUZZLE).applyQuaternion(anim.weaponQ).add(anim.weaponP);
  out[P.gunTop].copy(GUNTOP).applyQuaternion(anim.weaponQ).add(anim.weaponP);
}

/** pose de repouso → comprimentos de referência */
const restPos = (() => {
  const fake = { Qm: Array.from({ length: NB }, () => new THREE.Quaternion()), Pm: REST.map((p) => p.clone()), weaponP: new THREE.Vector3(0, 1.2, 0.3), weaponQ: new THREE.Quaternion() };
  const out = Array.from({ length: NP }, () => new THREE.Vector3());
  particlesFromPose(fake, out);
  return out;
})();

// restrições: [a, b, rigidez, modo] — modo 0 = igual, 1 = mínimo, 2 = máximo
const C = [];
const link = (a, b, k = 1, mode = 0, len = null, scale = 1) => C.push([P[a], P[b], k, mode, len, scale]);
const cluster = (names, k) => {
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) link(names[i], names[j], k);
};
cluster(['pelvis', 'hipL', 'hipR', 'spine'], 1);
cluster(['chest', 'shL', 'shR', 'neck'], 1);
cluster(['spine', 'chest', 'shL', 'shR'], 0.35);
link('pelvis', 'chest', 0.25);
link('hipL', 'chest', 0.15);
link('hipR', 'chest', 0.15);
link('neck', 'head', 1);
link('chest', 'head', 0.6);
link('shL', 'head', 0.3);
link('shR', 'head', 0.3);
for (const s of ['L', 'R']) {
  link('sh' + s, 'el' + s);
  link('el' + s, 'wr' + s);
  link('wr' + s, 'tip' + s);
  link('el' + s, 'tip' + s, 0.3);
  link('sh' + s, 'wr' + s, 0.6, 1, 0.16);
  link('hip' + s, 'kn' + s);
  link('kn' + s, 'an' + s);
  link('an' + s, 'toe' + s);
  link('kn' + s, 'toe' + s, 1);
  link('hip' + s, 'an' + s, 0.8, 1, 0.42);
  link('pelvis', 'kn' + s, 0.5, 1, 0.32);
}
// "tônus" fraco: pernas e tronco tendem a ficar estendidos
for (const s of ['L', 'R']) {
  link('hip' + s, 'an' + s, 0.06, 0, null, 0.95);
  link('sh' + s, 'wr' + s, 0.03, 0, null, 0.85);
}
link('pelvis', 'neck', 0.08, 0, null, 1);
link('hipL', 'knR', 0.3, 1, 0.16);
link('hipR', 'knL', 0.3, 1, 0.16);
link('knL', 'knR', 0.4, 1, 0.12);
link('anL', 'anR', 0.4, 1, 0.1);
cluster(['gun', 'muzzle', 'gunTop'], 1);
for (const c of C) if (c[4] == null) c[4] = restPos[c[0]].distanceTo(restPos[c[1]]) * (c[5] ?? 1);

export class Ragdoll {
  /**
   * @param anim   Animator do soldado (pose atual)
   * @param group  grupo do soldado (transform no mundo, fixo na morte)
   * @param collision mundo de colisão
   * @param vel    velocidade do corpo no mundo (Vector3)
   */
  constructor(anim, group, collision, vel) {
    this.anim = anim;
    this.group = group;
    this.collision = collision;
    this.x = Array.from({ length: NP }, () => new THREE.Vector3());
    this.px = Array.from({ length: NP }, () => new THREE.Vector3());
    this.ground = new Float32Array(NP).fill(-1e9);
    this.grounded = new Uint8Array(NP);
    particlesFromPose(anim, this.x);
    group.updateMatrixWorld(true);
    this.m = group.matrixWorld.clone();
    this.mi = this.m.clone().invert();
    const dt = 1 / 60;
    for (let i = 0; i < NP; i++) {
      this.x[i].applyMatrix4(this.m);
      this.px[i].copy(this.x[i]).addScaledVector(vel, -dt);
    }
    this.t = 0;
    this.still = 0;
    this.asleep = false;
    this.filter = (c) => !c.data?.enemy && c.tag !== 'player' && c.tag !== 'enemy';
    this._updateGround(true);
  }

  /** Impulso (m/s) numa posição do mundo, com decaimento por distância. */
  impulse(point, dir, speed) {
    const dt = 1 / 60;
    for (let i = 0; i < NP; i++) {
      if (i >= P.gun) continue;
      const d = this.x[i].distanceTo(point);
      const k = Math.exp(-d * d * 18);
      if (k < 0.02) continue;
      this.px[i].addScaledVector(dir, -speed * k * dt);
    }
    this.asleep = false;
    this.still = 0;
  }

  /** empurrão inicial "dramático" mas plausível: joelhos cedem, tronco tomba */
  slump(dir, rng) {
    const dt = 1 / 60;
    const side = (rng() - 0.5) * 0.8;
    for (const n of ['knL', 'knR']) this.px[P[n]].addScaledVector(_v.set(0, 0, 1).transformDirection(this.m), -0.35 * dt);
    this.px[P.pelvis].y += 0.6 * dt;
    for (const n of ['chest', 'neck', 'head', 'shL', 'shR']) {
      this.px[P[n]].addScaledVector(dir, -1.1 * dt);
      this.px[P[n]].x += side * dt;
    }
  }

  _updateGround(all = false) {
    for (let i = 0; i < NP; i++) {
      if (!all && (this.t * 60 + i) % 3 !== 0) continue;
      const x = this.x[i];
      const hit = this.collision.raycast(_v.set(x.x, x.y + 0.6, x.z), DOWN, 3, { bullets: false, filter: this.filter });
      this.ground[i] = hit ? hit.point.y : -1e9;
    }
  }

  step(dt) {
    if (this.asleep) return;
    this.t += dt;
    const x = this.x, px = this.px;
    const g = -9.8 * dt * dt;
    let maxMove = 0;
    for (let i = 0; i < NP; i++) {
      const vx = (x[i].x - px[i].x) * 0.995, vy = (x[i].y - px[i].y) * 0.995, vz = (x[i].z - px[i].z) * 0.995;
      px[i].copy(x[i]);
      x[i].x += vx;
      x[i].y += vy + g;
      x[i].z += vz;
    }
    this._updateGround();
    for (let it = 0; it < 10; it++) {
      for (const [a, b, k, mode, len] of C) {
        _d.subVectors(x[b], x[a]);
        const d = _d.length();
        if (d < 1e-6) continue;
        if (mode === 1 && d >= len) continue;
        if (mode === 2 && d <= len) continue;
        const diff = ((d - len) / d) * 0.5 * k;
        x[a].addScaledVector(_d, diff);
        x[b].addScaledVector(_d, -diff);
      }
      this._jointLimits();
      // chão
      for (let i = 0; i < NP; i++) {
        const gy = this.ground[i] + RADIUS[i] * 0.85;
        if (x[i].y < gy) {
          x[i].y = gy;
          this.grounded[i] = 1;
        }
      }
    }
    // atrito no chão + paredes
    for (let i = 0; i < NP; i++) {
      if (this.grounded[i]) {
        px[i].x += (x[i].x - px[i].x) * 0.35;
        px[i].z += (x[i].z - px[i].z) * 0.35;
        if (px[i].y < x[i].y) px[i].y = x[i].y - (x[i].y - px[i].y) * 0.2;
        this.grounded[i] = 0;
      }
      _w.subVectors(x[i], px[i]);
      const m = _w.length();
      maxMove = Math.max(maxMove, m);
      if (m > 0.004 && (i < P.gun || i === P.gun)) {
        const dirn = _v.copy(_w).divideScalar(m);
        const hit = this.collision.raycast(px[i], dirn, m + RADIUS[i], { filter: this.filter });
        if (hit && hit.normal && Math.abs(hit.normal.y) < 0.7) {
          x[i].copy(hit.point).addScaledVector(hit.normal, RADIUS[i]);
          px[i].copy(x[i]);
        }
      }
    }
    if (this.t > 0.8 && maxMove < 0.0012) this.still++;
    else this.still = 0;
    if (this.still > 40 || this.t > 9) this.asleep = true;
  }

  /**
   * Limites articulares aproximados: joelho só dobra para trás (fica à
   * frente da linha quadril→tornozelo no plano sagital), coxa não abre
   * demais nem vai muito para trás, cotovelo não hiperestende.
   */
  _jointLimits() {
    const x = this.x;
    const up = _lu.subVectors(x[P.spine], x[P.pelvis]).normalize();
    const side = _ls.subVectors(x[P.hipL], x[P.hipR]);
    side.addScaledVector(up, -side.dot(up)).normalize();
    const fwd = _lf.crossVectors(side, up); // +Z do modelo
    for (const s of ['L', 'R']) {
      const h = x[P['hip' + s]], k = x[P['kn' + s]], a = x[P['an' + s]];
      // joelho: componente para frente em relação ao segmento quadril→tornozelo
      const ha = _la.subVectors(a, h);
      const len = ha.length() || 1;
      const mid = _lm.copy(h).addScaledVector(ha, 0.5);
      const off = _lo.subVectors(k, mid);
      const axis = ha.divideScalar(len);
      // plano de dobra: normal = lado do quadril
      const lat = off.dot(side);
      k.addScaledVector(side, -lat * 0.6);
      const fw = off.dot(fwd) - off.dot(axis) * axis.dot(fwd);
      if (fw < 0.02) k.addScaledVector(fwd, (0.02 - fw) * 0.8);
      // coxa: abdução/extensão limitadas
      const th = _lo.subVectors(k, h);
      const tl = th.length() || 1;
      const ab = th.dot(side) * (s === 'L' ? 1 : -1);
      if (ab > tl * 0.55) k.addScaledVector(side, (s === 'L' ? -1 : 1) * (ab - tl * 0.55) * 0.8);
      if (ab < -tl * 0.2) k.addScaledVector(side, (s === 'L' ? 1 : -1) * (-tl * 0.2 - ab) * 0.8);
      const ext = th.dot(fwd);
      if (ext < -tl * 0.35) k.addScaledVector(fwd, (-tl * 0.35 - ext) * 0.8);
    }
  }

  /** Escreve a pose dos ossos a partir das partículas. */
  pose() {
    const a = this.anim;
    const Qm = a.Qm, Pm = a.Pm;
    const L = this.x.map((p) => p.clone().applyMatrix4(this.mi));
    const side = (l, r) => _s.subVectors(L[l], L[r]);
    const up0 = REST[B.spine].clone().sub(REST[B.hips]).normalize();
    const X0 = new THREE.Vector3(1, 0, 0), Y0 = new THREE.Vector3(0, 1, 0), Z0 = new THREE.Vector3(0, 0, 1);
    // tronco
    frameQuat(_d.subVectors(L[P.spine], L[P.pelvis]).normalize(), side(P.hipL, P.hipR), up0, X0, Qm[B.hips]);
    const sideSh = side(P.shL, P.shR).clone();
    const sideAvg = sideSh.clone().add(side(P.hipL, P.hipR)).normalize();
    frameQuat(_d.subVectors(L[P.chest], L[P.spine]).normalize(), sideAvg, REST[B.chest].clone().sub(REST[B.spine]).normalize(), X0, Qm[B.spine]);
    frameQuat(_d.subVectors(L[P.neck], L[P.chest]).normalize(), sideSh, REST[B.neck].clone().sub(REST[B.chest]).normalize(), X0, Qm[B.chest]);
    frameQuat(_d.subVectors(L[P.head], L[P.neck]).normalize(), sideSh, HEAD_OFF.clone().add(REST[B.head]).sub(REST[B.neck]).normalize(), X0, Qm[B.neck]);
    Qm[B.head].copy(Qm[B.neck]);
    Qm[B.root].identity();
    Pm[B.hips].copy(L[P.pelvis]);
    // membros com dobradiça
    const hinge = (i0, i1, i2, bUp, bLo, pole, invert) => {
      const du = _d.subVectors(L[i1], L[i0]).normalize().clone();
      const lo = new THREE.Vector3().subVectors(L[i2], L[i1]);
      let s = perp(lo, du, new THREE.Vector3());
      if (s && invert) s.negate();
      if (!s) s = perp(pole, du, new THREE.Vector3()) || Z0.clone();
      const d0u = REST[bLo].clone().sub(REST[bUp]).normalize();
      frameQuat(du, s, d0u, Z0, Qm[bUp]);
      const ax = new THREE.Vector3().crossVectors(du, s);
      const dl = lo.normalize();
      const sl = new THREE.Vector3().crossVectors(ax, dl);
      const childOf = bLo + 1;
      const d0l = REST[childOf].clone().sub(REST[bLo]).normalize();
      const a0 = new THREE.Vector3().crossVectors(d0u, perp(Z0, d0u, new THREE.Vector3()));
      frameQuat(dl, sl, d0l, new THREE.Vector3().crossVectors(a0, d0l), Qm[bLo]);
      return sl;
    };
    const fwd = Z0.clone().applyQuaternion(Qm[B.hips]);
    for (const s of ['L', 'R']) {
      const sl = hinge(P['sh' + s], P['el' + s], P['wr' + s], B['upperArm.' + s], B['foreArm.' + s], fwd, false);
      frameQuat(_d.subVectors(L[P['tip' + s]], L[P['wr' + s]]).normalize(), sl, TIP_OFF.clone().normalize(), Z0, Qm[B['hand.' + s]]);
      const ss = hinge(P['hip' + s], P['kn' + s], P['an' + s], B['thigh.' + s], B['shin.' + s], fwd, true);
      const shinDir = _w.subVectors(L[P['an' + s]], L[P['kn' + s]]).normalize().negate();
      frameQuat(_d.subVectors(L[P['toe' + s]], L[P['an' + s]]).normalize(), shinDir, TOE_OFF.clone().normalize(), Y0, Qm[B['foot.' + s]]);
      void ss;
    }
    // fuzil
    frameQuat(_d.subVectors(L[P.muzzle], L[P.gun]).normalize(), _w.subVectors(L[P.gunTop], L[P.gun]), MUZZLE.clone().normalize(), Y0, a.weaponQ);
    a.weaponP.copy(L[P.gun]);
    // FK das posições (para hitboxes)
    for (let i = 1; i < NB; i++) {
      if (i === B.hips || i === B.weapon) continue;
      const par = PARENT[i];
      Pm[i].copy(REST[i]).sub(REST[par]).applyQuaternion(Qm[par]).add(Pm[par]);
    }
    a.applyModelPose();
  }

  /** caixa envolvente no mundo (para o colisor do corpo) */
  bounds(box) {
    box.makeEmpty();
    for (let i = 0; i < P.gun; i++) box.expandByPoint(this.x[i]);
    return box.expandByScalar(0.12);
  }
}
