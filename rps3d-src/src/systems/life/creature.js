// Instância de criatura: malha com pele + esqueleto próprio, locomoção
// procedural (passos com coordenação entre pernas vizinhas, IK de 2 ossos com
// os pés plantados no relevo, corpo inclinado pelo terreno, balanço do tronco,
// cauda em onda, pescoço/cabeça olhando e pastando, asas batendo) e teste de
// acerto (cápsula do tronco + esfera da cabeça).
//
// Coordenadas: tudo no referencial do REMENDO (ver patch.js).
import * as THREE from 'three/webgpu';
import { basisZY, clamp, damp, dampAngle, smooth01, wrapAngle } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _mInv = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
let NEXT_ID = 1;

/** Protótipo por espécie: geometria, material e inversas de bind (compartilhados). */
export class CreatureProto {
  constructor(species, built, material) {
    this.sp = species;
    this.geo = built.geo;
    this.rig = built.rig;
    this.mat = material;
    this.inverses = this.rig.bones.map((b) => new THREE.Matrix4().makeTranslation(-b.pos.x, -b.pos.y, -b.pos.z));
    this.restLocal = this.rig.bones.map((b) => (b.parent >= 0 ? b.pos.clone().sub(this.rig.bones[b.parent].pos) : b.pos.clone()));
    this.restAxis = this.rig.bones.map(() => null);
    for (let i = 0; i < this.rig.bones.length; i++) {
      const p = this.rig.bones[i].parent;
      if (p >= 0 && !this.restAxis[p]) this.restAxis[p] = this.restLocal[i].clone().normalize();
    }
    this.count = 0;
  }
}

export class Creature {
  constructor(proto, pos, heading, opts = {}) {
    this.id = 'c' + (NEXT_ID++);
    this.proto = proto;
    this.sp = proto.sp;
    this.rig = proto.rig;
    const nb = this.rig.bones.length;
    this.bones = [];
    for (let i = 0; i < nb; i++) {
      const b = new THREE.Bone(); b.name = this.rig.bones[i].name;
      b.position.copy(proto.restLocal[i]);
      this.bones.push(b);
      const p = this.rig.bones[i].parent;
      if (p >= 0) this.bones[p].add(b);
    }
    this.mesh = new THREE.SkinnedMesh(proto.geo, proto.mat);
    this.mesh.add(this.bones[0]);
    this.mesh.bind(new THREE.Skeleton(this.bones, proto.inverses), new THREE.Matrix4());
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.creature = this;
    // FK no espaço da malha
    this.mq = this.bones.map(() => new THREE.Quaternion());
    this.mp = this.bones.map(() => new THREE.Vector3());
    // estado
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.heading = heading;
    this.up = new THREE.Vector3(0, 1, 0);
    this.tiltUp = new THREE.Vector3(0, 1, 0);
    this.hp = this.sp.hp; this.alive = true; this.deadT = 0;
    this.scale = opts.scale ?? 1;
    this.mesh.scale.setScalar(this.scale);
    this.state = 'idle'; this.stateT = 0;
    this.desired = new THREE.Vector3();
    this.target = null;
    this.home = pos.clone();
    this.herd = null;
    this.phase = Math.random() * 10;
    this.look = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 };
    this.graze = 0; this.grazeT = 0;
    this.jaw = 0; this.jawT = 0;
    this.hitFlash = 0;
    this.alert = 0;
    this.attackCd = 0;
    this.seed = Math.random();
    this.lod = 0;
    this.air = 0;
    this.groundY = pos.y;
    this.legs = this.rig.legs.map((L, i) => ({
      def: L, i, foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, stepping: false, dur: 0.3, inited: false, lift: 0,
    }));
    // vizinhos (coordenação de passos)
    for (const leg of this.legs) {
      leg.nb = this.legs.filter((o) => o !== leg && ((o.def.pair === leg.def.pair) || (o.def.side === leg.def.side && Math.abs(o.def.pair - leg.def.pair) === 1)));
    }
    const sz = this.rig.dims;
    this.legLen = this.rig.legs.length ? this.rig.legs[0].L1 + this.rig.legs[0].L2 : 1;
    this.radius = Math.max(sz.G * 1.4, (sz.L || 1) * 0.6) * this.scale;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get fwd() { return _v.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  /** Centro aproximado do corpo (remendo). */
  center(out = new THREE.Vector3()) {
    if (this.rig.dims.H) return out.copy(this.up).multiplyScalar((this.rig.dims.H + this.rig.dims.G * 0.3) * this.scale).add(this.pos);
    return out.copy(this.mesh.position);
  }

  // ── cinemática direta no espaço da malha ────────────────────────────
  fk(i) {
    const p = this.rig.bones[i].parent, b = this.bones[i];
    if (p < 0) { this.mq[i].copy(b.quaternion); this.mp[i].copy(b.position); return; }
    this.mq[i].multiplyQuaternions(this.mq[p], b.quaternion);
    this.mp[i].copy(b.position).applyQuaternion(this.mq[p]).add(this.mp[p]);
  }
  fkAll() { for (let i = 0; i < this.bones.length; i++) this.fk(i); }

  /** Aponta o osso i (eixo de repouso → filho) para a direção dirMesh. */
  aim(i, dirMesh) {
    const p = this.rig.bones[i].parent;
    const axis = this.proto.restAxis[i]; if (!axis) return;
    _mInv.copy(this.mq[p]).invert();
    _w.copy(dirMesh).applyQuaternion(_mInv).normalize();
    this.bones[i].quaternion.setFromUnitVectors(axis, _w);
    this.fk(i);
  }

  /** Malha → remendo e vice-versa. */
  toMesh(p, out) { _mInv.copy(this.mesh.quaternion).invert(); return out.copy(p).sub(this.mesh.position).applyQuaternion(_mInv).divideScalar(this.scale); }
  fromMesh(p, out) { return out.copy(p).multiplyScalar(this.scale).applyQuaternion(this.mesh.quaternion).add(this.mesh.position); }

  /** Converte o estado entre referenciais (recentragem do remendo). */
  rebase(pt, dir) {
    pt(this.pos); pt(this.home); dir(this.vel); dir(this.up); dir(this.tiltUp);
    for (const L of this.legs) { pt(L.foot); pt(L.from); pt(L.to); }
    if (this.path) this.path.rebase?.(pt, dir);
    // o rumo é relativo à base do remendo: reprojeta
    const f = _u.set(Math.sin(this.heading), 0, Math.cos(this.heading)); dir(f);
    this.heading = Math.atan2(f.x, f.z);
  }

  // ── animação por frame ───────────────────────────────────────────────
  animate(dt, patch, camP, t) {
    const sp = this.sp;
    if (sp.plan === 'worm' || sp.plan === 'marine') return; // feitos por path.js
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    const dist = camP ? camP.distanceTo(this.pos) : 0;
    this.lod = dist < 70 ? 0 : dist < 180 ? 1 : 2;
    if (sp.plan === 'flyer') { this.animateFlyer(dt, patch, t); return; }
    const S = this.scale;
    const G = this.rig.dims;
    // chão sob o corpo e inclinação pelo relevo
    const gr = patch.ground(this.pos.x, this.pos.z, this._g || (this._g = {}));
    this.groundY = gr.y;
    if (!this.alive) { this.animateDead(dt, gr); return; }
    this.pos.y = gr.y;
    this.up.copy(gr.up);
    // inclinação: frente/trás e lados (amostras no relevo, suavizadas)
    if (this.lod < 2 || !this._tiltInit) {
      this._tiltInit = true;
      const f = this.fwd, Lh = Math.max(0.4, G.L * 0.55) * S, Wd = Math.max(0.3, G.G * 0.9) * S;
      const yf = patch.groundY(this.pos.x + f.x * Lh, this.pos.z + f.z * Lh), yb = patch.groundY(this.pos.x - f.x * Lh, this.pos.z - f.z * Lh);
      const yl = patch.groundY(this.pos.x + f.z * Wd, this.pos.z - f.x * Wd), yr = patch.groundY(this.pos.x - f.z * Wd, this.pos.z + f.x * Wd);
      const Fv = _a.copy(f).multiplyScalar(2 * Lh).addScaledVector(this.up, yf - yb);
      const Lv = _b.set(f.z, 0, -f.x).multiplyScalar(2 * Wd).addScaledVector(this.up, yl - yr);
      _c.crossVectors(Fv, Lv).normalize();
      // tronco um pouco mais nivelado que o chão
      _c.lerp(this.up, 0.35).normalize();
      const k = 1 - Math.exp(-dt * 6);
      this.tiltUp.lerp(_c, k).normalize();
    }
    // orientação da malha
    const fwd = _d.copy(this.fwd).addScaledVector(this.tiltUp, -this.fwd.dot(this.tiltUp)).normalize();
    basisZY(fwd, this.tiltUp, this.mesh.quaternion);
    this.mesh.position.copy(this.pos);
    // ritmo da marcha
    const spd = this.speed;
    this.phase += dt * (0.6 + spd / Math.max(0.3, this.legLen * S) * 1.1);
    // tronco: respiração, balanço, empinar (ameaça)
    const B = this.bones, R = this.rig;
    const breathe = Math.sin(t * 1.6 + this.seed * 9) * 0.012;
    const run = clamp(spd / Math.max(0.1, sp.behavior.run * 0.6), 0, 1);
    for (const i of R.spine) B[i].quaternion.identity();
    const pel = R.spine[0];
    B[pel].position.copy(this.proto.restLocal[pel]);
    let bob = 0;
    for (const L of this.legs) if (L.stepping) bob += Math.sin(L.t * Math.PI);
    bob = this.legs.length ? bob / this.legs.length : 0;
    B[pel].position.y += (-bob * 0.04 * (1 + run) + breathe) * (G.H || 1);
    const rear = this.rear || 0;
    _q.setFromAxisAngle(X, -rear * 0.5 - run * 0.04);
    B[pel].quaternion.multiply(_q);
    _q.setFromAxisAngle(Y, Math.sin(this.phase * Math.PI) * 0.04 * (0.3 + run));
    if (R.spine[1] >= 0) B[R.spine[1]].quaternion.copy(_q);
    _q.setFromAxisAngle(X, rear * 0.2 + run * 0.05);
    B[R.spine[2]].quaternion.copy(_q);
    // pescoço + cabeça: pastar, olhar, alerta
    const L0 = this.look;
    L0.yaw = damp(L0.yaw, L0.tyaw, 4, dt); L0.pitch = damp(L0.pitch, L0.tpitch, 3, dt);
    this.graze = damp(this.graze, this.state === 'graze' ? 1 : 0, 2.2, dt);
    const nN = R.neck.length || 1;
    const grazeDown = (sp.neck.raise + (sp.neck.len > sp.L * 0.7 ? 0.45 : 0.75)) * this.graze;
    for (const i of R.neck) {
      _q.setFromAxisAngle(Y, L0.yaw / (nN + 1));
      _q2.setFromAxisAngle(X, (grazeDown + L0.pitch * 0.6 - run * 0.12) / nN + Math.sin(t * 0.7 + this.seed * 5) * 0.02);
      B[i].quaternion.copy(_q).multiply(_q2);
    }
    if (R.head >= 0) {
      _q.setFromAxisAngle(Y, L0.yaw / (nN + 1));
      _q2.setFromAxisAngle(X, L0.pitch * 0.4 + this.graze * (0.25 + Math.sin(t * 5 + this.seed) * 0.08 * this.graze) - rear * 0.4);
      B[R.head].quaternion.copy(_q).multiply(_q2);
    }
    if (R.jaw >= 0) {
      this.jaw = damp(this.jaw, this.jawT + (this.graze > 0.5 ? (Math.sin(t * 7 + this.seed * 3) * 0.5 + 0.5) * 0.15 : 0), 10, dt);
      B[R.jaw].quaternion.setFromAxisAngle(X, this.jaw * 0.55);
    }
    // cauda em onda
    const nt = R.tail.length;
    for (let k = 0; k < nt; k++) {
      const i = R.tail[k];
      const w = Math.sin(t * (1.5 + run * 3) - k * 0.7 + this.seed * 6) * (0.08 + run * 0.1 + this.alert * 0.05);
      _q.setFromAxisAngle(Y, w);
      _q2.setFromAxisAngle(X, -0.05 * this.alert + (sp.plan === 'biped' ? -0.02 : 0.03) + Math.sin(t * 1.1 - k * 0.5) * 0.02);
      B[i].quaternion.copy(_q).multiply(_q2);
    }
    this.fkAll();
    // pernas
    if (this.legs.length) this.animateLegs(dt, patch, spd, run);
    // asas (voadores pousados não existem nesta versão)
  }

  animateLegs(dt, patch, spd, run) {
    const S = this.scale;
    const LL = this.legLen * S;
    const stride = LL * (0.75 + run * 0.6);
    const dur = clamp(stride * 0.6 / (spd + 0.6), 0.14 * Math.sqrt(LL), 0.42 * Math.sqrt(LL));
    const thresh = Math.max(LL * 0.1, Math.min(stride * 0.55, spd * dur * 1.15 + LL * 0.08));
    const mq = this.mesh.quaternion, mp = this.mesh.position;
    let nStep = 0;
    for (const L of this.legs) if (L.stepping) nStep++;
    const maxStep = Math.max(1, Math.ceil(this.legs.length / 2));
    const far = this.lod >= 2;
    for (const L of this.legs) {
      // ponto neutro (pé em repouso projetado no chão) + antecipação pela velocidade
      _a.set(L.def.rest.x, 0, L.def.rest.z).multiplyScalar(S).applyQuaternion(mq).add(mp);
      _a.addScaledVector(this.vel, dur * 0.55);
      if (!L.inited) {
        L.foot.copy(_a); L.foot.y = far ? this.groundY : patch.groundY(_a.x, _a.z); L.inited = true;
      }
      if (L.stepping) {
        L.t += dt / L.dur;
        L.to.copy(_a);
        L.to.y = far ? this.groundY + (_a.y - mp.y) : patch.groundY(_a.x, _a.z);
        if (L.t >= 1) { L.t = 1; L.stepping = false; nStep--; L.foot.copy(L.to); }
        else {
          const u = smooth01(L.t);
          L.foot.lerpVectors(L.from, L.to, u);
          L.foot.addScaledVector(this.tiltUp, Math.sin(L.t * Math.PI) * L.lift);
        }
      } else {
        const d = Math.hypot(L.foot.x - _a.x, L.foot.z - _a.z);
        if (d > LL * 3) { L.foot.copy(_a); L.foot.y = this.groundY; }
        else if (d > thresh && nStep < maxStep && !L.nb.some((o) => o.stepping && o.t < 0.85)) {
          L.stepping = true; L.t = 0; L.dur = dur; L.from.copy(L.foot); L.lift = LL * (0.12 + run * 0.1); nStep++;
        }
      }
      // IK
      this.solveLeg(L);
    }
  }

  solveLeg(L) {
    const D = L.def;
    const A = this.toMesh(L.foot, _b);
    A.y += D.ankleH;
    const hip = this.mp[D.hip];
    const L1 = D.L1, L2 = D.L2;
    let d = hip.distanceTo(A);
    // perna esticada demais: aproxima o alvo
    if (d > (L1 + L2) * 0.995) { A.sub(hip).setLength((L1 + L2) * 0.995).add(hip); d = (L1 + L2) * 0.995; }
    const dir = _c.copy(A).sub(hip).normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pole = _u.copy(D.pole).addScaledVector(dir, -D.pole.dot(dir)).normalize();
    const K = _d.copy(hip).addScaledVector(dir, a).addScaledVector(pole, h);
    this.aim(D.hip, _a.copy(K).sub(hip));
    this.aim(D.knee, _a.copy(A).sub(K));
    // pé nivelado com o chão (no espaço da malha ≈ identidade), ponta levantada no passo
    _mInv.copy(this.mq[D.knee]).invert();
    _q.setFromAxisAngle(X, L.stepping ? -Math.sin(L.t * Math.PI) * 0.5 : 0);
    this.bones[D.ankle].quaternion.multiplyQuaternions(_mInv, _q);
    this.fk(D.ankle);
  }

  animateFlyer(dt, patch, t) {
    const B = this.bones, R = this.rig;
    this.mesh.position.copy(this.pos);
    // orientação pela velocidade com inclinação nas curvas
    const v = this.vel;
    const sp = v.length();
    const f = sp > 0.1 ? _a.copy(v).divideScalar(sp) : _a.copy(this.fwd);
    const turn = this._turn || 0;
    const bank = clamp(-turn * 0.9, -0.9, 0.9);
    this._bank = damp(this._bank || 0, bank, 3, dt);
    basisZY(f, Y, _q);
    _q2.setFromAxisAngle(Z, this._bank);
    this.mesh.quaternion.copy(_q).multiply(_q2);
    // batida de asa (planeia às vezes)
    const glide = this.glide ?? (Math.sin(t * 0.4 + this.seed * 20) > 0.3 ? 1 : 0);
    this._glide = damp(this._glide || 0, glide, 2, dt);
    this.phase += dt * (2.2 + (1 - this._glide) * 1.2);
    const flap = Math.sin(this.phase * Math.PI) * (0.65 * (1 - this._glide) + 0.06);
    for (const W of R.wings) {
      _q.setFromAxisAngle(Z, W.side * (flap + 0.08));
      B[W.root].quaternion.copy(_q);
      _q.setFromAxisAngle(Z, W.side * Math.sin(this.phase * Math.PI - 0.8) * 0.45 * (1 - this._glide * 0.9));
      B[W.mid].quaternion.copy(_q);
    }
    // corpo ondula com a batida, cauda segue
    B[R.spine[0]].position.copy(this.proto.restLocal[R.spine[0]]);
    B[R.spine[0]].position.y += -flap * this.rig.dims.G * 0.25;
    for (let k = 0; k < R.tail.length; k++) {
      _q.setFromAxisAngle(X, Math.sin(this.phase * Math.PI - k * 0.6) * 0.1);
      _q2.setFromAxisAngle(Y, Math.sin(t * 1.3 - k * 0.5) * 0.08 + turn * 0.1);
      B[R.tail[k]].quaternion.copy(_q).multiply(_q2);
    }
    for (const i of R.neck) B[i].quaternion.setFromAxisAngle(X, 0.08);
    this.fkAll();
  }

  animateDead(dt, gr) {
    this.deadT += dt;
    const k = smooth01(this.deadT / 0.8);
    this.pos.y = gr.y;
    const fwd = _d.copy(this.fwd);
    basisZY(fwd, gr.up, _q);
    _q2.setFromAxisAngle(Z, (this.deadSide || 1) * k * Math.PI * 0.48);
    this.mesh.quaternion.copy(_q).multiply(_q2);
    this.mesh.position.copy(this.pos).addScaledVector(gr.up, this.rig.dims.G * this.scale * 0.8 * k - (this.rig.dims.H * this.scale * 0.55) * k);
    // pernas relaxam
    for (const L of this.legs) {
      const D = L.def;
      this.bones[D.hip].quaternion.slerp(_q.identity(), dt * 3);
      this.bones[D.knee].quaternion.slerp(_q.setFromAxisAngle(X, 0.6), dt * 3);
    }
    if (this.rig.jaw >= 0) this.bones[this.rig.jaw].quaternion.setFromAxisAngle(X, 0.4);
    this.fkAll();
  }

  // ── acerto ───────────────────────────────────────────────────────────
  /** Segmento p0→p1 (remendo). Retorna {t, part} ou null. */
  hitSegment(p0, p1) {
    if (!this.mesh.parent) return null;
    const h = this.rig.hit;
    const a = this.fromMesh(h.a, _a), b = this.fromMesh(h.b, _b);
    const r = h.r * this.scale;
    const res = segSeg(p0, p1, a, b);
    let best = null;
    if (res.d < r) best = { t: res.s, part: 'body' };
    const hc = this.rig.head >= 0 ? this.fromMesh(this.mp[this.rig.head].clone().add(new THREE.Vector3(0, 0, this.sp.head?.len * 0.4 || 0).applyQuaternion(this.mq[this.rig.head])), _c) : null;
    if (hc) {
      const hr = h.hr * this.scale;
      const d = _d.copy(p1).sub(p0); const L2 = d.lengthSq() || 1;
      const s = clamp(_u.copy(hc).sub(p0).dot(d) / L2, 0, 1);
      const cp = _w.copy(p0).addScaledVector(d, s);
      if (cp.distanceTo(hc) < hr && (!best || s < best.t)) best = { t: s, part: 'head' };
    }
    return best;
  }
}

const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3();
function segSeg(p0, p1, q0, q1) {
  const d1 = _s1.copy(p1).sub(p0), d2 = _s2.copy(q1).sub(q0), r = _s3.copy(p0).sub(q0);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2);
  const den = a * e - b * b;
  let s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let tt = e > 1e-9 ? (b * s + f) / e : 0;
  if (tt < 0) { tt = 0; s = a > 1e-9 ? clamp(-c / a, 0, 1) : 0; } else if (tt > 1) { tt = 1; s = a > 1e-9 ? clamp((b - c) / a, 0, 1) : 0; }
  const cx = p0.x + d1.x * s - (q0.x + d2.x * tt), cy = p0.y + d1.y * s - (q0.y + d2.y * tt), cz = p0.z + d1.z * s - (q0.z + d2.z * tt);
  return { s, t: tt, d: Math.hypot(cx, cy, cz) };
}

export { wrapAngle, dampAngle };
