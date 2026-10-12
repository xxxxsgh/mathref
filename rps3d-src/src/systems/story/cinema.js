// Diretor de cena: câmeras cinematográficas NO MOTOR (nada de vídeo).
//
// Um "plano" é uma função de pose avaliada a cada frame:
//     shot = { dur, pose(u, t) → {pos, look, up?, fov?, roll?}, ease?, focus?, handheld? }
// u = progresso 0..1 (com easing), t = segundos desde o início do plano.
// Posições em MUNDO (double). A câmera do jogo fica na origem; o diretor
// escreve ctx.player.camWorld e ctx.camera.quaternion (contrato da origem
// flutuante). Só mexe na câmera enquanto há um plano ativo — fora disso quem
// manda é o sistema do modo atual (flight/foot).
//
// Também é o relógio das sequências: `await dir.wait(s)` resolve em tempo de
// jogo; `dir.skip()` resolve tudo na hora (pular cena).
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _up = new THREE.Vector3();
const _Z = new THREE.Vector3(0, 0, 1);

export const ease = {
  linear: (u) => u,
  inOut: (u) => u * u * (3 - 2 * u),
  inOut5: (u) => u * u * u * (u * (u * 6 - 15) + 10),
  out: (u) => 1 - (1 - u) * (1 - u),
  outExpo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  in: (u) => u * u,
};

/** Ruído suave de câmera na mão (somas de senos incomensuráveis). */
function handheld(t, amp) {
  const a = amp;
  return {
    yaw: (Math.sin(t * 0.71) * 0.6 + Math.sin(t * 1.93 + 1.3) * 0.3 + Math.sin(t * 4.1 + 0.4) * 0.1) * a,
    pitch: (Math.sin(t * 0.83 + 2.1) * 0.6 + Math.sin(t * 2.37 + 0.7) * 0.3 + Math.sin(t * 5.3 + 2.2) * 0.1) * a,
    roll: (Math.sin(t * 0.52 + 0.9) * 0.7 + Math.sin(t * 1.61) * 0.3) * a * 0.6,
  };
}

export class Director {
  constructor(ctx) {
    this.ctx = ctx;
    this.shot = null; this.t = 0;
    this.waits = [];
    this.skipping = false;
    this.fovBase = 72;
    this.pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60 };
    this.blend = null;
    this.dofOn = false;
  }

  get active() { return !!this.shot; }

  /** Toca um plano. Resolve quando termina (ou quando é substituído/pulado). */
  play(shot) {
    if (this.shot?.resolve) this.shot.resolve(false);
    const s = { ease: ease.inOut, handheld: 0, ...shot };
    if (shot.blendIn && this.shot) this.blend = { from: { pos: this.pose.pos.clone(), quat: this.pose.quat.clone(), fov: this.pose.fov }, t: 0, dur: shot.blendIn };
    else this.blend = null;
    this.shot = s; this.t = 0;
    this.ctx.services.rendering?.cut?.();
    this.apply(0);
    return new Promise((res) => { s.resolve = res; if (this.skipping) { this.shot = null; res(true); } });
  }

  /** Para de controlar a câmera (o modo de jogo volta a mandar). */
  release() {
    if (this.shot?.resolve) this.shot.resolve(false);
    this.shot = null;
    this.setDof(false);
  }

  wait(seconds) {
    if (this.skipping || seconds <= 0) return Promise.resolve();
    return new Promise((res) => this.waits.push({ t: seconds, res }));
  }
  /** Espera uma condição (testada por frame) com teto de tempo opcional. */
  until(fn, maxSeconds = Infinity) {
    if (this.skipping) return Promise.resolve();
    return new Promise((res) => this.waits.push({ t: maxSeconds, res, fn }));
  }

  skip() {
    this.skipping = true;
    for (const w of this.waits) w.res();
    this.waits.length = 0;
    if (this.shot?.resolve) this.shot.resolve(true);
    this.shot = null;
  }
  endSkip() { this.skipping = false; }

  setDof(o) {
    const r = this.ctx.services.rendering;
    if (!r?.setDof) return;
    try { r.setDof(o); this.dofOn = !!o; } catch { /* preset sem DoF */ }
  }

  apply(dt) {
    const s = this.shot; if (!s) return;
    const ctx = this.ctx;
    const dur = Math.max(1e-3, s.dur ?? 5);
    const u = s.ease(Math.min(1, this.t / dur));
    const p = s.pose(u, this.t);
    if (!p) return;
    const cam = ctx.camera;
    // orientação: olhar para `look` (ponto) ou `dir` (direção), com `up`
    _up.copy(p.up || _v.set(0, 1, 0));
    const pos = p.pos;
    if (p.quat) _q.copy(p.quat);
    else {
      const dir = p.dir ? p.dir.clone() : p.look.clone().sub(pos);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, -1);
      _m.lookAt(_v.set(0, 0, 0), dir.normalize(), _up);
      _q.setFromRotationMatrix(_m);
    }
    if (p.roll) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_Z, p.roll));
    const hh = s.handheld || p.handheld || 0;
    if (hh) {
      const h = handheld(this.t + (s.seed || 0), hh);
      _q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(h.pitch, h.yaw, h.roll, 'YXZ')));
    }
    let fov = p.fov ?? s.fov ?? this.fovBase;
    const outPos = this.pose.pos.copy(pos), outQ = this.pose.quat.copy(_q);
    if (this.blend) {
      const b = this.blend;
      b.t += dt;
      const k = ease.inOut(Math.min(1, b.t / b.dur));
      outPos.lerpVectors(b.from.pos, pos, k);
      outQ.copy(b.from.quat).slerp(_q, k);
      fov = b.from.fov + (fov - b.from.fov) * k;
      if (k >= 1) this.blend = null;
    }
    this.pose.fov = fov;
    ctx.player.camWorld.copy(outPos);
    cam.quaternion.copy(outQ);
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // foco: distância ao alvo do plano (ou ao ponto olhado)
    const focusPt = p.focus || (s.focus === 'look' && p.look) || null;
    if (focusPt && s.dof !== false) {
      const d = focusPt.distanceTo(outPos);
      this.setDof({ focus: d, range: p.dofRange ?? Math.max(4, d * 0.35), bokeh: p.bokeh ?? s.bokeh ?? 1 });
    } else if (s.dof === false && this.dofOn) this.setDof(false);
  }

  frame(dt) {
    // relógio das sequências
    if (this.waits.length) {
      const keep = [];
      for (const w of this.waits) {
        w.t -= dt;
        let done = w.t <= 0;
        if (!done && w.fn) { try { done = !!w.fn(); } catch { done = true; } }
        if (done) w.res(); else keep.push(w);
      }
      this.waits = keep;
    }
    const s = this.shot;
    if (!s) return;
    this.t += dt;
    this.apply(dt);
    if (this.t >= (s.dur ?? 5) && !s.hold) {
      const r = s.resolve; this.shot = s.next || null;
      if (this.shot) { this.t = 0; }
      r?.(true);
    }
  }
}

// ─── construtores de planos ───────────────────────────────────────────────
// `target` é sempre uma função () → {pos: Vector3, quat?: Quaternion} (ator,
// nave do jogador, corpo celeste...), avaliada a cada frame.

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

/** Offset no referencial do alvo (x direita, y cima, z trás) → mundo. */
export function localOffset(tgt, off, out = new THREE.Vector3()) {
  out.copy(off);
  if (tgt.quat) out.applyQuaternion(tgt.quat);
  return out.add(tgt.pos);
}

/** Câmera presa ao alvo, deslizando do offset a para b; olha para lookA→lookB (locais). */
export function chase(target, { from, to = from, lookFrom = new THREE.Vector3(), lookTo = lookFrom, fov = [55, 55], roll = [0, 0], upLocal = true, dur = 5, ...rest }) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3();
  return {
    dur, ...rest,
    pose(u) {
      const T = target();
      localOffset(T, tmpA.lerpVectors(from, to, u), pos);
      localOffset(T, tmpB.lerpVectors(lookFrom, lookTo, u), look);
      if (upLocal && T.quat) up.set(0, 1, 0).applyQuaternion(T.quat); else up.set(0, 1, 0);
      return { pos, look, up, fov: fov[0] + (fov[1] - fov[0]) * u, roll: roll[0] + (roll[1] - roll[0]) * u, focus: T.pos };
    },
  };
}

/** Órbita ao redor do alvo: guinada/arfagem/raio interpolados (rad, m). */
export function orbit(target, { yaw = [0, 0.6], pitch = [0.1, 0.1], radius = [40, 40], height = 0, lookOffset = null, upVec = null, fov = [50, 50], basis = null, dur = 10, ...rest }) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  return {
    dur, ...rest,
    pose(u) {
      const T = target();
      const yw = yaw[0] + (yaw[1] - yaw[0]) * u, pt = pitch[0] + (pitch[1] - pitch[0]) * u, r = radius[0] + (radius[1] - radius[0]) * u;
      const B = basis ? basis() : null; // {x,y,z} ortonormal de mundo; padrão: eixos de mundo
      const lx = Math.sin(yw) * Math.cos(pt) * r, ly = Math.sin(pt) * r + height, lz = Math.cos(yw) * Math.cos(pt) * r;
      if (B) pos.copy(T.pos).addScaledVector(B.x, lx).addScaledVector(B.y, ly).addScaledVector(B.z, lz);
      else pos.set(lx, ly, lz).add(T.pos);
      look.copy(T.pos);
      if (lookOffset) look.add(B ? tmpA.set(0, 0, 0).addScaledVector(B.x, lookOffset.x).addScaledVector(B.y, lookOffset.y).addScaledVector(B.z, lookOffset.z) : lookOffset);
      return { pos, look, up: upVec || (B ? B.y : undefined), fov: fov[0] + (fov[1] - fov[0]) * u, focus: T.pos };
    },
  };
}

/** Câmera parada (ou deslizando entre dois pontos de mundo) acompanhando o alvo. */
export function track(target, { from, to = from, fov = [50, 50], lead = null, roll = 0, up = null, dur = 5, ...rest }) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  return {
    dur, ...rest,
    pose(u) {
      const T = target();
      pos.lerpVectors(typeof from === 'function' ? from() : from, typeof to === 'function' ? to() : to, u);
      look.copy(T.pos);
      if (lead) look.add(lead);
      return { pos, look, up: up || undefined, fov: fov[0] + (fov[1] - fov[0]) * u, roll, focus: T.pos };
    },
  };
}

/** Plano totalmente livre: pose(u,t) definida pelo chamador. */
export function custom(dur, pose, rest = {}) { return { dur, pose, ...rest }; }
