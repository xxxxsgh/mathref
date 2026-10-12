// Mísseis teleguiados (navegação proporcional com limite de curva, motor que
// acelera, espoleta de proximidade, rastro de fumaça iluminado com fogo na
// boca) e contramedidas: flares (despistam buscadores IR) e chaff (nuvem de
// lâminas cintilantes que despista radar).
import * as THREE from 'three/webgpu';
import { MISSILES } from './config.js';
import { makeMissileMesh } from './render/missileModel.js';
import { lookQuat, clamp } from './math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _los = new THREE.Vector3(), _q = new THREE.Quaternion();

class Missile {
  constructor(sys, owner, target, def, pos, dir, vel0) {
    this.sys = sys; this.owner = owner; this.target = target; this.def = def;
    this.pos = pos.clone(); this.prev = pos.clone(); this.renderPos = pos.clone();
    this.vel = (vel0 ? vel0.clone() : new THREE.Vector3()).addScaledVector(dir, def.speed0);
    this.dir = dir.clone();
    this.quat = lookQuat(dir);
    this.t = 0; this.alive = true; this.decoyed = false; this.checked = new Set();
    this.prevLos = null;
    const sim = sys.sim;
    this.mesh = makeMissileMesh(def.id === 'torpedo' ? 2.4 : 1);
    this.entry = sim.ctx.world.add(this.mesh, this.renderPos);
    this.smoke = sim.fx?.smoke.alloc({ life: def.id === 'torpedo' ? 6 : 3.6, width: def.id === 'torpedo' ? 2.2 : 1.3, grow: 12, minDist: def.id === 'torpedo' ? 10 : 14, color: [0.62, 0.6, 0.58], alpha: 0.95, heat: 0.5, seed: sim.rand() });
    this.motorT = 0;
  }

  step(dt) {
    const def = this.def, sim = this.sys.sim;
    this.prev.copy(this.pos);
    this.t += dt;
    let tgt = this.target;
    if (tgt && (tgt.alive === false || tgt.state === 'dead')) { tgt = this.target = null; }
    // buscador: decoys no cone do sensor podem roubar a trava (uma chance por decoy)
    if (tgt && !this.decoyed) {
      for (const d of this.sys.decoys) {
        if (this.checked.has(d) || d.kind !== (def.seeker === 'ir' ? 'flare' : 'chaff')) continue;
        _a.copy(d.pos).sub(this.pos);
        const dist = _a.length();
        if (dist > 1600) continue;
        const ang = Math.acos(clamp(_a.divideScalar(dist).dot(this.dir), -1, 1));
        if (ang > def.fov * 1.6) continue;
        this.checked.add(d);
        const p = d.kind === 'flare' ? 0.62 : 0.55;
        if (sim.rand() < p) { this.target = tgt = d; this.decoyed = true; break; }
      }
    }
    // guiamento: navegação proporcional + mira de interceptação
    const speedNow = this.vel.length();
    let want = this.dir;
    if (tgt) {
      const tp = tgt.pos, tv = tgt.vel || _c.set(0, 0, 0);
      _los.copy(tp).sub(this.pos);
      const dist = _los.length();
      const tti = dist / Math.max(100, speedNow);
      _a.copy(tp).addScaledVector(tv, Math.min(tti, 4) * 0.9).sub(this.pos).normalize();
      // fora do cone do buscador → perde a trava
      if (this.t > 0.6 && Math.acos(clamp(_los.clone().normalize().dot(this.dir), -1, 1)) > def.fov * 2.4) this.target = null;
      want = _a;
      // espoleta de proximidade
      const r = tgt.hitR ? tgt.hitR + def.blast * 0.35 : def.blast * 0.5;
      if (dist < r || dist < speedNow * dt * 1.2) { this.detonate(tgt.isDecoy ? null : tgt); return; }
    }
    // curva limitada (motor dá mais autoridade em alta velocidade, até o limite de G)
    const maxTurn = def.turn * dt * (this.t < 0.35 ? 0.3 : 1);
    const ang = Math.acos(clamp(this.dir.dot(want), -1, 1));
    if (ang > 1e-5) {
      _b.crossVectors(this.dir, want);
      if (_b.lengthSq() < 1e-10) _b.set(0, 1, 0);
      _b.normalize();
      this.dir.applyAxisAngle(_b, Math.min(ang, maxTurn)).normalize();
    }
    const spd = Math.min(def.speed, speedNow + def.accel * dt * (this.t > 0.25 ? 1 : 0.2));
    // velocidade segue o nariz (sustentação aerodinâmica falsa → curvas bonitas)
    this.vel.lerp(_a.copy(this.dir).multiplyScalar(spd), 1 - Math.exp(-dt * 6)).setLength(spd);
    this.pos.addScaledVector(this.vel, dt);
    lookQuat(this.vel, _c.set(0, 1, 0), this.quat);
    // colisão direta com qualquer nave no caminho (exceto o dono no início)
    for (const s of sim.colliders()) {
      if (!s.alive || (s === this.owner && this.t < 1.5)) continue;
      const R = s.hitR;
      const dx = s.pos.x - this.pos.x, dy = s.pos.y - this.pos.y, dz = s.pos.z - this.pos.z;
      if (dx * dx + dy * dy + dz * dz < R * R) { this.detonate(s); return; }
    }
    if (this.t > def.life) this.detonate(null, true);
  }

  detonate(hitShip, fizzle = false) {
    if (!this.alive) return;
    this.alive = false;
    const sim = this.sys.sim, def = this.def;
    const pos = this.pos.clone();
    sim.explode(pos, fizzle ? def.blast * 0.25 : def.blast * 0.42, 'missile', { vel: this.vel.clone().multiplyScalar(0.2) });
    if (!fizzle) {
      for (const s of sim.colliders()) {
        if (!s.alive) continue;
        const d = Math.max(0, s.pos.distanceTo(pos) - s.hitR * 0.7);
        if (d < def.blast) sim.damage(s, def.damage * (1 - d / def.blast) * (s === hitShip ? 1 : 0.6), { pos, from: this.owner, def: { id: def.id, kind: 'explosive', shieldMul: 0.9, hullMul: 1.2 }, splash: true });
      }
    }
    this.dispose();
  }

  frame(alpha) {
    this.renderPos.lerpVectors(this.prev, this.pos, alpha);
    this.mesh.quaternion.copy(this.quat);
    // fumaça sai do bocal
    if (this.smoke) this.smoke.push(_a.set(0, 0, 1.45 * this.mesh.scale.x).applyQuaternion(this.quat).add(this.renderPos), this.sys.sim.renderNow, 0.45);
  }

  dispose() {
    this.alive = false;
    this.entry.remove();
    this.smoke?.stop(this.sys.sim.renderNow);
  }
}

class Decoy {
  constructor(sys, kind, owner, pos, vel) {
    this.sys = sys; this.kind = kind; this.owner = owner; this.isDecoy = true;
    this.pos = pos.clone(); this.vel = vel.clone();
    this.t = 0; this.life = kind === 'flare' ? 4.5 : 6; this.alive = true;
    this.hitR = 6; this.seed = sys.sim.rand();
    if (kind === 'flare') this.smoke = sys.sim.fx?.smoke.alloc({ life: 2.2, width: 1.0, grow: 9, minDist: 3, color: [0.85, 0.84, 0.82], alpha: 0.7, heat: 0.35, seed: this.seed });
    else {
      // lâminas de chaff: pontos espalhados que crescem e cintilam
      const r = () => sys.sim.rand() * 2 - 1;
      this.glints = Array.from({ length: 34 }, () => ({ o: new THREE.Vector3(r(), r(), r()).normalize().multiplyScalar(0.3 + sys.sim.rand()), ph: sys.sim.rand() * 6.28, f: 8 + sys.sim.rand() * 14 }));
    }
  }
  step(dt) {
    this.t += dt;
    this.vel.multiplyScalar(Math.exp(-dt * (this.kind === 'flare' ? 0.5 : 1.6)));
    this.pos.addScaledVector(this.vel, dt);
    if (this.t > this.life) this.alive = false;
  }
  frame() {
    if (this.smoke && this.alive) this.smoke.push(this.pos, this.sys.sim.renderNow, Math.max(0, 1 - this.t / this.life));
  }
  draw(bolts, origin, now) {
    const k = 1 - this.t / this.life;
    if (k <= 0) return;
    if (this.kind === 'flare') {
      _a.copy(this.pos).sub(origin);
      const fl = 0.75 + 0.25 * Math.sin(now * 47 + this.seed * 20) * Math.sin(now * 31);
      const I = 7 * k * fl;
      bolts.glow(_a, 2.4 + 1.2 * k, 1.0 * I, 0.72 * I, 0.42 * I, 1);
      bolts.glow(_a, 0.55, 10 * k, 9 * k, 8 * k, 1);
    } else {
      const R = 6 + this.t * 9;
      for (const g of this.glints) {
        const s = Math.max(0, Math.sin(now * g.f + g.ph));
        if (s < 0.6) continue;
        _a.copy(g.o).multiplyScalar(R).add(this.pos).sub(origin);
        const I = (s - 0.6) * 2.5 * k * 9;
        bolts.glow(_a, 0.5, I * 0.85, I * 0.9, I, 1);
      }
    }
  }
  dispose() { this.smoke?.stop(this.sys.sim.renderNow); }
}

export class MissileSystem {
  constructor(sim) { this.sim = sim; this.list = []; this.decoys = []; }

  launch(owner, target, kind = 'ir', opts = {}) {
    const def = MISSILES[kind] || MISSILES.ir;
    const pos = opts.pos ? opts.pos.clone() : owner.toWorld(owner.missilePods?.length ? owner.missilePods[(owner._pod = (owner._pod || 0) + 1) % owner.missilePods.length] : _a.set(0, -1.2, 0), new THREE.Vector3());
    const dir = opts.dir ? opts.dir.clone().normalize() : owner.fwd(new THREE.Vector3());
    // ejeção: cai um pouco antes de acender
    const v0 = (owner.vel ? owner.vel.clone() : new THREE.Vector3()).addScaledVector(owner.up ? owner.up(_b).negate() : _b.set(0, -1, 0), 14);
    const m = new Missile(this, owner, target, def, pos, dir, v0);
    this.list.push(m);
    if (!this.sim.quiet) {
      this.sim.emit('missile:launch', { owner: owner?.eventId || null, target: target?.eventId || null, kind });
    }
    if (target) target.incoming = m;
    return m;
  }

  /** Solta contramedidas. kind: 'flare' | 'chaff' | 'both'. */
  deploy(owner, kind = 'flare', n = 2) {
    const kinds = kind === 'both' ? ['flare', 'chaff'] : [kind];
    let any = false;
    for (const k of kinds) {
      const count = k === 'flare' ? n : 1;
      if ((owner.cm?.[k] ?? 0) <= 0) continue;
      owner.cm[k] = Math.max(0, owner.cm[k] - count);
      any = true;
      for (let i = 0; i < count; i++) {
        const side = (i % 2 ? 1 : -1);
        const dir = _a.set(side * 0.7, -0.6 - this.sim.rand() * 0.3, 0.45).normalize();
        const w = owner.dirToLocal ? dir.applyQuaternion(owner.quat) : dir;
        const vel = (owner.vel ? owner.vel.clone().multiplyScalar(0.9) : new THREE.Vector3()).addScaledVector(w, 45 + this.sim.rand() * 25);
        const p = owner.toWorld ? owner.toWorld(_b.set(side * 1.5, -1.0, 2.5), new THREE.Vector3()) : owner.pos.clone();
        this.decoys.push(new Decoy(this, k, owner, p, vel));
      }
      if (!this.sim.quiet) this.sim.emit('countermeasure', { owner: owner?.eventId || null, kind: k });
    }
    return any;
  }

  /** Míssil mais próximo vindo para `ship` (ou null). */
  incoming(ship) {
    let best = null, bd = Infinity;
    for (const m of this.list) {
      if (!m.alive || m.target !== ship) continue;
      const d = m.pos.distanceTo(ship.pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { missile: best, dist: bd } : null;
  }

  step(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      if (m.alive) m.step(dt);
      if (!m.alive) this.list.splice(i, 1);
    }
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.step(dt);
      if (!d.alive) { d.dispose(); this.decoys.splice(i, 1); }
    }
  }

  frame(alpha) { for (const m of this.list) m.frame(alpha); for (const d of this.decoys) d.frame(); }

  draw(bolts, origin, now) {
    for (const m of this.list) {
      if (!m.alive) continue;
      // chama do motor: núcleo branco + halo laranja
      _a.set(0, 0, 1.6 * m.mesh.scale.x).applyQuaternion(m.quat).add(m.renderPos).sub(origin);
      const f = 0.85 + Math.sin(now * 61 + m.t * 13) * 0.15;
      const s = m.mesh.scale.x;
      // halo laranja moderado + núcleo branco pequeno + pluma esticada para trás
      bolts.glow(_a, 1.5 * s * f, 5 * f, 2.2 * f, 0.7 * f, 1);
      bolts.glow(_a, 0.42 * s, 14, 12, 9, 1);
      _b.copy(m.vel).normalize();
      bolts.bolt(_a, _b, 4.2 * s * f, 0.32 * s, 7, 3.2, 1.1);
    }
    for (const d of this.decoys) d.draw(bolts, origin, now);
  }

  clear() {
    for (const m of this.list) m.dispose();
    for (const d of this.decoys) d.dispose();
    this.list.length = 0; this.decoys.length = 0;
  }
}
