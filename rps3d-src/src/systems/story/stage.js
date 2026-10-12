// Palco das cenas: atores roteirizados (naves de verdade do sistema `ships`)
// que voam, atiram e explodem sob o comando do roteiro. Usado nas cinemáticas
// (enquadramento controlado) e como batalha de reserva quando o sistema
// `combat` não está presente. Tudo em coordenadas de MUNDO (origem flutuante
// via ctx.world.add).
import * as THREE from 'three/webgpu';
import { float, vec3, uniform, normalView, positionView, uv, sin, time, pow, abs, mix, smoothstep } from 'three/tsl';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const BOLT = { hegemonia: 'gold', frente: 'red', corsarios: 'green', guilda: 'blue', vigilantes: 'blue', player: 'gold' };

export function lookQuat(dir, up = UP, out = new THREE.Quaternion()) {
  _m.lookAt(_v3.set(0, 0, 0), dir, up);
  return out.setFromRotationMatrix(_m);
}

// ─── raio de bombardeio orbital (lança da Hegemonia) ───────────────────────
function beamMaterial(color, intensity) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const U = { color: uniform(new THREE.Color(color)), k: uniform(intensity), on: uniform(1) };
  const facing = abs(normalView.dot(positionView.normalize().negate()));
  const core = pow(facing, float(6.0));
  const halo = pow(facing, float(1.6));
  const along = uv().y;
  const flick = sin(along.mul(900.0).sub(time.mul(60.0))).mul(0.12).add(0.88);
  const ends = smoothstep(0.0, 0.015, along).mul(smoothstep(1.0, 0.97, along));
  const c = mix(U.color, vec3(1.0, 0.97, 0.92), core);
  mat.colorNode = c.mul(halo.mul(0.6).add(core.mul(2.5))).mul(U.k).mul(flick).mul(U.on);
  mat.opacityNode = halo.mul(ends).mul(U.on);
  mat.U = U;
  return mat;
}

export class Beam {
  constructor(stage, { from, to, width = 18, color = '#ffd27a', intensity = 40, flare = 1 }) {
    this.stage = stage;
    // alarga em direção ao alvo (a perspectiva não afina a lança a 80 km)
    const geo = new THREE.CylinderGeometry(flare, 1, 1, 16, 1, true);
    geo.translate(0, 0.5, 0);
    this.mat = beamMaterial(color, intensity);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.from = from; this.to = to; this.width = width; this.life = 0; this.on = 1;
    this.pos = new THREE.Vector3();
    this.entry = stage.ctx.world.add(this.mesh, this.pos);
    this.update(0);
  }
  update(dt) {
    this.life += dt;
    const a = typeof this.from === 'function' ? this.from(_v) : _v.copy(this.from);
    const b = typeof this.to === 'function' ? this.to(_v2) : _v2.copy(this.to);
    this.pos.copy(a);
    const d = b.clone().sub(a);
    const L = d.length();
    this.mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(L || 1));
    const w = this.width * (0.85 + 0.15 * Math.sin(this.life * 37));
    this.mesh.scale.set(w, L, w);
    this.mat.U.on.value = this.on;
  }
  dispose() { this.entry.remove(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

// ─── ator ───────────────────────────────────────────────────────────────────
export class Actor {
  constructor(stage, o) {
    this.stage = stage;
    this.id = o.id || `ator${stage.nextId++}`;
    this.faction = o.faction || 'hegemonia';
    this.classId = o.classId || 'fighter';
    this.name = o.name || '';
    this.callsign = o.callsign || '';
    this.pos = (o.pos || new THREE.Vector3()).clone();
    this.quat = (o.quat || new THREE.Quaternion()).clone();
    this.vel = (o.vel || new THREE.Vector3()).clone();
    this.motion = o.motion || null;
    this.t = o.t0 || 0;
    this.alive = true;
    this.target = null;
    this.fire = o.fire || null;    // {rate, burst, spread, color, range}
    this.fireT = Math.random() * 2;
    this.burstLeft = 0;
    this.throttle = o.throttle ?? 0.8;
    this.inst = null;
    const ships = stage.ctx.services.ships;
    try { this.inst = ships?.create?.(this.classId, this.faction, { seed: o.seed ?? (stage.nextId * 13 + 1), throttle: this.throttle, shadows: o.shadows ?? false, paint: o.paint, id: o.shipId }); } catch (e) { stage.ctx.errors.push('story: ships.create: ' + (e.stack || e)); }
    if (this.inst) {
      this.entry = stage.ctx.world.add(this.inst.group, this.pos);
      this.inst.group.quaternion.copy(this.quat);
      try { this.inst.setLights?.(true); this.inst.setGear?.(false, true); } catch { /* opcional */ }
    }
    this.radius = this.inst?.radius || (this.classId === 'carrier' ? 380 : this.classId === 'destroyer' ? 280 : 9);
  }
  /** {pos, quat} para planos de câmera. */
  get pose() { return this; }
  muzzles(out = []) {
    out.length = 0;
    const hp = this.inst?.hardpoints?.filter((h) => h.type === 'gun') || [];
    if (!hp.length) out.push(_v.set(0, 0, -this.radius).applyQuaternion(this.quat).add(this.pos).clone());
    for (const h of hp) out.push(h.pos.clone().applyQuaternion(this.quat).add(this.pos));
    return out;
  }
  fwd(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.quat); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    if (this.motion) this.motion(dt, this.t, this);
    else this.pos.addScaledVector(this.vel, dt);
    if (this.inst) {
      this.inst.group.quaternion.copy(this.quat);
      this.inst.setThrottle?.(this.throttle);
    }
    // armas
    if (this.fire && this.target) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        const f = this.fire;
        if (this.burstLeft <= 0) this.burstLeft = f.burst || 4;
        this.shoot();
        this.burstLeft--;
        this.fireT = this.burstLeft > 0 ? (f.interval || 0.11) : (f.rate || 1.6) * (0.6 + Math.random() * 0.8);
      }
    }
    // torres das capitais acompanham o alvo
    if (this.inst?.turrets?.length && this.turretTarget) {
      const tp = typeof this.turretTarget === 'function' ? this.turretTarget(_v2) : this.turretTarget.pos;
      if (tp) {
        const dLocal = _v.copy(tp).sub(this.pos).applyQuaternion(_q.copy(this.quat).invert()).normalize();
        for (const t of this.inst.turrets) if (t.alive) t.aimLocal(dLocal);
      }
    }
  }
  /** Rajada na direção do alvo (com antecipação e dispersão). */
  shoot() {
    const r = this.stage.ctx.services.rendering;
    const tgt = this.target;
    const tp = typeof tgt === 'function' ? tgt(_v2) : tgt?.pos;
    if (!r?.particles || !tp) return;
    const f = this.fire;
    const speed = f.speed || 1400;
    const ms = this.muzzles(this.stage._mz);
    const color = f.color || BOLT[this.faction] || 'gold';
    for (const m of ms) {
      const d = _v.copy(tp);
      if (tgt.vel) d.addScaledVector(tgt.vel, m.distanceTo(tp) / speed);
      d.sub(m);
      const dist = d.length();
      if (f.range && dist > f.range) continue;
      d.divideScalar(dist);
      const sp = f.spread ?? 0.012;
      d.x += (Math.random() - 0.5) * sp; d.y += (Math.random() - 0.5) * sp; d.z += (Math.random() - 0.5) * sp;
      d.normalize();
      // só atira se o alvo estiver no cone frontal (caças)
      if (!this.inst?.turrets?.length && d.dot(this.fwd(_v3)) < 0.86 && !f.anyDir) continue;
      r.particles.bolt(m, d, { color, speed, length: f.length || 16, width: f.width || 0.4, brightness: f.brightness || 34, vel: this.vel, life: f.life || 1.4 });
      r.particles.glow?.(m, 1.6, color === 'red' ? [6, 1.4, 0.6] : color === 'blue' ? [1.5, 3, 7] : color === 'green' ? [2, 6, 2] : [7, 4.5, 1.5], 0.07, this.vel);
    }
    if (f.onShot) f.onShot(this, tp);
  }
  explode(size = null) {
    if (!this.alive) return;
    this.alive = false;
    const ctx = this.stage.ctx;
    ctx.bus.emit('explosion', { pos: this.pos.clone(), size: size ?? Math.max(12, this.radius * 1.6), kind: this.classId === 'carrier' || this.classId === 'destroyer' ? 'capital' : 'ship', vel: this.vel.clone() });
    this.dispose();
  }
  dispose() {
    this.alive = false;
    this.entry?.remove();
    try { this.inst?.dispose?.(); } catch { /* já liberada */ }
    this.inst = null;
  }
}

// ─── movimentos ─────────────────────────────────────────────────────────────
/** Laço de dogfight: órbita elíptica inclinada com ondulação e inclinação nas curvas. */
export function loopMotion({ center, e1, e2, R = 600, R2 = null, w = 0.25, phase = 0, wobble = 80, wobbleW = 0.7, bank = 1.0 }) {
  const c = new THREE.Vector3(), n = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const prev = new THREE.Vector3(), up = new THREE.Vector3(), acc = new THREE.Vector3(), lastVel = new THREE.Vector3();
  const Rb = R2 ?? R * 0.7;
  return (dt, t, a) => {
    const cc = typeof center === 'function' ? center(c) : c.copy(center);
    const th = w * t + phase;
    prev.copy(a.pos);
    a.pos.copy(cc).addScaledVector(e1, Math.cos(th) * R).addScaledVector(e2, Math.sin(th) * Rb).addScaledVector(n, Math.sin(t * wobbleW + phase * 1.7) * wobble);
    if (dt > 0) {
      const v = _v.copy(a.pos).sub(prev).divideScalar(dt);
      acc.copy(v).sub(lastVel).divideScalar(dt);
      lastVel.copy(v);
      a.vel.copy(v);
      const dir = v.clone().normalize();
      // inclinação: "cima" puxa para o centro da curva
      up.copy(n).multiplyScalar(1).addScaledVector(acc.clone().addScaledVector(dir, -acc.dot(dir)), bank * 0.004).normalize();
      if (Math.abs(up.dot(dir)) < 0.98) lookQuat(dir, up, _q);
      a.quat.slerp(_q, Math.min(1, dt * 6));
    }
  };
}

/** Voo em formação: posição presa ao líder (offset local) com balanço leve. */
export function formationMotion(leader, offset, { sway = 3, swayW = 0.6 } = {}) {
  const o = offset.clone();
  return (dt, t, a) => {
    const L = leader();
    if (!L) return;
    const s = _v.set(Math.sin(t * swayW) * sway, Math.sin(t * swayW * 1.3 + 1) * sway * 0.6, Math.sin(t * swayW * 0.7 + 2) * sway * 0.5);
    a.pos.copy(o).add(s).applyQuaternion(L.quat).add(L.pos);
    a.quat.copy(L.quat).multiply(_q.setFromAxisAngle(_v2.set(0, 0, 1), Math.sin(t * swayW * 0.9) * 0.05));
    if (L.vel) a.vel.copy(L.vel);
  };
}

/** Deriva retilínea com rotação lenta opcional. */
export function driftMotion(vel, spin = null) {
  const v = vel.clone();
  return (dt, t, a) => {
    a.vel.copy(v);
    a.pos.addScaledVector(v, dt);
    if (spin) a.quat.multiply(_q.setFromAxisAngle(spin.axis, spin.rate * dt));
  };
}

// ─── palco ──────────────────────────────────────────────────────────────────
export class Stage {
  constructor(ctx) {
    this.ctx = ctx;
    this.actors = [];
    this.beams = [];
    this.timers = [];
    this.nextId = 1;
    this._mz = [];
    this.t = 0;
  }
  add(o) { const a = new Actor(this, o); this.actors.push(a); return a; }
  beam(o) { const b = new Beam(this, o); this.beams.push(b); return b; }
  removeBeam(b) { b.dispose(); this.beams = this.beams.filter((x) => x !== b); }
  /** Agenda fn daqui a `s` segundos de cena (repete se every). */
  after(s, fn, every = 0) { const t = { at: this.t + s, fn, every }; this.timers.push(t); return t; }
  find(fn) { return this.actors.find((a) => a.alive && fn(a)); }
  byName(n) { return this.actors.find((a) => a.alive && (a.name === n || a.callsign === n)); }
  update(dt) {
    this.t += dt;
    for (const a of this.actors) a.update(dt);
    for (const b of this.beams) b.update(dt);
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.t);
      for (const t of due) {
        try { t.fn(); } catch (e) { this.ctx.errors.push('story: palco: ' + (e.stack || e)); }
        if (t.every > 0) t.at += t.every; else t.dead = true;
      }
      this.timers = this.timers.filter((t) => !t.dead);
    }
    this.actors = this.actors.filter((a) => a.alive);
  }
  clear() {
    for (const a of this.actors) a.dispose();
    for (const b of this.beams) b.dispose();
    this.actors = []; this.beams = []; this.timers = [];
  }
}
