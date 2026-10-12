// Projéteis (simulação balística no passo fixo, colisão por segmento contra
// esferas/caixas das naves e torres das capitais) e clarões (boca do cano,
// impactos, estilhaços de flak). O desenho vai para o BoltBatch.
import * as THREE from 'three/webgpu';
import { segSphere, segBox, pointSegDist2, coneJitter } from './math.js';
import { BOLT_COLORS } from './config.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _hp = new THREE.Vector3(), _n = new THREE.Vector3();

class Bolt {
  constructor() { this.pos = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.alive = false; }
}

export class Projectiles {
  constructor(sim, cap = 700) {
    this.sim = sim; this.cap = cap;
    this.pool = Array.from({ length: cap }, () => new Bolt());
    this.active = [];
    this.flashes = [];
  }

  /**
   * Dispara. owner: combatente (ou null), def: arma, pos/dir em mundo.
   * opts: { inherit (vel. do atirador), color, dmgMul, rnd }
   */
  fire(owner, def, pos, dir, opts = {}) {
    let b = null;
    if (this.active.length < this.cap) b = this.pool.find((x) => !x.alive);
    if (!b) b = this.active.shift(); // recicla o mais antigo
    if (!b) return null;
    const rnd = opts.rnd || this.sim.rand;
    coneJitter(dir, def.spread * (opts.spreadMul ?? 1), rnd, b.dir);
    b.alive = true;
    b.def = def; b.owner = owner; b.faction = owner?.faction || 'player';
    b.side = owner?.side;
    b.pos.copy(pos); b.prev.copy(pos);
    b.vel.copy(b.dir).multiplyScalar(def.speed);
    if (opts.inherit) b.vel.add(opts.inherit);
    b.life = def.range / def.speed;
    b.age = 0;
    b.dmgMul = opts.dmgMul ?? 1;
    const col = opts.color || (def.kind === 'ion' ? BOLT_COLORS.ion : def.kind === 'kinetic' ? BOLT_COLORS.kinetic : def.kind === 'flak' ? BOLT_COLORS.flak : owner?.boltColor || BOLT_COLORS.hegemonia);
    b.color = col;
    b.fuse = def.flak ? (opts.fuse ?? 0) : 0; // flak: distância até detonar perto de um alvo
    this.active.push(b);
    // clarão da boca do cano (preso à nave)
    if (owner && opts.muzzleLocal) this.flash({ owner, local: opts.muzzleLocal.clone(), size: def.width * (def.kind === 'heavy' ? 3 : 1.7), color: col, life: def.kind === 'heavy' ? 0.14 : 0.05, intensity: def.intensity * 0.32 });
    else if (opts.flashPos) this.flash({ pos: opts.flashPos.clone(), size: def.width * 3.5, color: col, life: 0.08, intensity: def.intensity * 0.5 });
    if (!this.sim.quiet) this.sim.emit('ship:fire', { owner: owner?.eventId || null, weapon: def.id, pos: pos.clone(), dir: b.dir.clone(), faction: b.faction });
    return b;
  }

  /** Clarão: { pos | owner+local, size, color, life, intensity, kind (1 brilho, 2 anel), vel } */
  flash(o) {
    if (this.flashes.length > 260) this.flashes.shift();
    o.t = 0; o.kind = o.kind ?? 1; o.intensity = o.intensity ?? 10;
    if (o.pos && !o.pos.isVector3) o.pos = new THREE.Vector3().copy(o.pos);
    this.flashes.push(o);
    return o;
  }

  step(dt) {
    const sim = this.sim;
    const ships = sim.colliders();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.age += dt;
      let hit = null, best = 2, turret = null;
      const segLen = b.vel.length() * dt;
      for (const s of ships) {
        if (s === b.owner || !s.alive || s.state === 'dead') continue;
        // fogo amigo entre IAs do mesmo lado é ignorado (o jogador continua podendo acertar aliados)
        if (b.owner && !b.owner.isPlayer && !s.isPlayer && b.side && b.side === s.side) continue;
        const R = s.hitR + segLen;
        const dx = s.pos.x - b.pos.x, dy = s.pos.y - b.pos.y, dz = s.pos.z - b.pos.z;
        if (dx * dx + dy * dy + dz * dz > (R + segLen) * (R + segLen)) {
          // flak: espoleta de proximidade só contra naves pequenas hostis
          continue;
        }
        if (s.capital) {
          // torres primeiro
          const tr = s.capital.hitTurret(b.prev, b.pos);
          if (tr && tr.f < best) { best = tr.f; hit = s; turret = tr.turret; continue; }
          if (s.colliders.length) {
            s.toLocal(b.prev, _a); s.toLocal(b.pos, _b);
            for (const c of s.colliders) {
              const f = segBox(_a, _b, c.center, c.half);
              if (f >= 0 && f < best) { best = f; hit = s; turret = null; }
            }
            continue;
          }
        }
        const f = segSphere(b.prev, b.pos, s.pos, s.hitR);
        if (f >= 0 && f < best) { best = f; hit = s; turret = null; }
      }
      if (hit) {
        _c.copy(b.prev).lerp(b.pos, best);
        this.impact(b, hit, _c, turret);
        b.alive = false; this.active.splice(i, 1);
        continue;
      }
      // flak: detona perto de naves pequenas hostis
      if (b.def.flak && b.age > 0.12) {
        const r2 = b.def.flak * b.def.flak;
        for (const s of ships) {
          if (s.capital || !s.alive || s === b.owner || !sim.relations.shipsHostile(b.owner, s)) continue;
          if (pointSegDist2(s.pos, b.prev, b.pos) < r2) {
            this.flakBurst(b, b.pos);
            b.alive = false; this.active.splice(i, 1);
            hit = s; break;
          }
        }
        // mísseis inimigos também ativam a espoleta (defesa de ponto)
        if (!hit) {
          for (const m of sim.missiles.list) {
            if (!m.alive || !sim.relations.shipsHostile(b.owner, m.owner)) continue;
            if (pointSegDist2(m.pos, b.prev, b.pos) < r2) {
              this.flakBurst(b, b.pos);
              m.detonate(null, true);
              b.alive = false; this.active.splice(i, 1);
              hit = m; break;
            }
          }
        }
        if (hit) continue;
      }
      if (b.age > b.life) {
        if (b.def.flak) this.flakBurst(b, b.pos);
        b.alive = false; this.active.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.vel && f.pos) f.pos.addScaledVector(f.vel, dt);
      if (f.t > f.life || (f.owner && !f.owner.alive)) this.flashes.splice(i, 1);
    }
  }

  flakBurst(b, pos) {
    const sim = this.sim;
    // estouro de flak: clarão curto + núcleo quente; a nuvem de fumaça fica
    this.flash({ pos: pos.clone(), size: b.def.flak * 0.32, color: [1.0, 0.6, 0.28], life: 0.18, intensity: 7, kind: 1 });
    this.flash({ pos: pos.clone(), size: b.def.flak * 0.1, color: [1.0, 0.9, 0.7], life: 0.07, intensity: 16, kind: 1 });
    sim.flakSmoke(pos);
    for (const s of sim.colliders()) {
      if (s.capital || !s.alive || s === b.owner) continue;
      const d = s.pos.distanceTo(pos);
      if (d < b.def.flak * 1.3) sim.damage(s, b.def.damage * 2.5 * (1 - d / (b.def.flak * 1.3)) * b.dmgMul, { pos, from: b.owner, def: b.def });
    }
  }

  impact(b, target, pos, turret) {
    const sim = this.sim;
    const def = b.def;
    _n.copy(b.dir).negate();
    const res = sim.damage(target, def.damage * b.dmgMul, { pos, from: b.owner, def, turret, normal: _n });
    const col = b.color;
    if (res?.shield) {
      this.flash({ pos: pos.clone(), size: def.width * 5 + 2, color: col, life: 0.12, intensity: 8 });
    } else {
      // metal: clarão quente, cor do raio por um instante
      const k = def.kind === 'kinetic' ? [1.0, 0.7, 0.4] : col;
      this.flash({ pos: pos.clone(), size: def.width * 4.5 + 1.5, color: k, life: 0.1, intensity: 14 });
      this.flash({ pos: pos.clone(), size: def.width * 2 + 0.8, color: [1, 0.9, 0.75], life: 0.05, intensity: 20 });
    }
  }

  /** Desenha raios e clarões. alpha = fração do passo fixo (interpolação). */
  draw(bolts, origin, alpha, dt) {
    for (const b of this.active) {
      _a.copy(b.pos).addScaledVector(b.vel, alpha * dt).sub(origin);
      const travelled = b.age * b.def.speed + alpha * dt * b.def.speed;
      const len = Math.min(b.def.length, travelled + 1);
      const I = b.def.intensity;
      bolts.bolt(_a, b.dir, len, b.def.width, b.color[0] * I, b.color[1] * I, b.color[2] * I);
    }
    for (const f of this.flashes) {
      const k = 1 - f.t / f.life;
      if (k <= 0) continue;
      if (f.owner) f.owner.toWorldRender ? f.owner.toWorldRender(f.local, _a) : f.owner.toWorld(f.local, _a);
      else _a.copy(f.pos);
      _a.sub(origin);
      const I = f.intensity * (f.kind === 2 ? k : k * k);
      const size = f.kind === 2 ? f.size * (0.4 + (1 - k) * 0.9) : f.size * (0.7 + 0.3 * k);
      bolts.glow(_a, size, f.color[0] * I, f.color[1] * I, f.color[2] * I, f.kind);
    }
  }

  clear() { for (const b of this.active) b.alive = false; this.active.length = 0; this.flashes.length = 0; }
}
