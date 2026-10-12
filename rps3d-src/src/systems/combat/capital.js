// Controle de nave capital: torres independentes (mira com antecipação,
// rajadas, campo de tiro acima do convés, destrutíveis uma a uma), hangares
// que lançam ondas de caças, brechas no casco com fumaça e fogo conforme o
// dano, e a sequência de destruição (explosões em cadeia → explosão final).
import * as THREE from 'three/webgpu';
import { WEAPONS, CLASS_STATS } from './config.js';
import { leadPoint, segSphere } from './math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion();

export class CapitalCtl {
  constructor(sim, ship, opts = {}) {
    this.sim = sim; this.ship = ship;
    ship.capital = this;
    const S = CLASS_STATS[ship.classId];
    const inst = ship.inst;
    this.turrets = (inst?.turrets || []).map((tur, i) => {
      const def = tur.kind === 'heavy' ? WEAPONS.heavy : tur.kind === 'pd' ? WEAPONS.pd : WEAPONS.massa;
      const hp = (S.turretHp || 200) * (tur.kind === 'heavy' ? 1.8 : tur.kind === 'pd' ? 0.7 : 1);
      return { tur, i, def, hp, hpMax: hp, cd: sim.rand() * 2, burst: 0, target: null, aimT: 0, retarget: sim.rand() * 1.5, size: tur.size, alive: true };
    });
    this.hangars = (inst?.hangars || []).map((h) => ({ ...h, cd: 4 + sim.rand() * 6 }));
    this.launch = { enabled: opts.launch ?? (ship.classId === 'carrier'), wave: S.hangarWave || 2, interval: opts.launchInterval ?? 22, max: opts.maxLaunch ?? 10, launched: 0, cls: opts.launchClass || ['interceptor', 'fighter'], timer: opts.firstLaunch ?? 6 };
    this.breaches = [];
    this.dying = null;
    this.focus = null; // alvo prioritário (ex.: o jogador depois da deserção)
    this.passive = !!opts.passive;
    this.cruise = opts.cruise ?? 0.35;
  }

  get aliveTurrets() { return this.turrets.filter((t) => t.alive).length; }

  /** Posição de mundo de uma torre (base + metade da altura). */
  turretWorld(t, out = new THREE.Vector3()) {
    return this.ship.toWorld(_c.copy(t.tur.posLocal).addScaledVector(t.tur.up, t.size * 0.7), out);
  }

  /** Segmento contra as esferas das torres: { f, turret } | null. */
  hitTurret(p0, p1) {
    let best = null;
    for (const t of this.turrets) {
      if (!t.alive) continue;
      this.turretWorld(t, _a);
      const f = segSphere(p0, p1, _a, t.size * 1.25);
      if (f >= 0 && (!best || f < best.f)) best = { f, turret: t };
    }
    return best;
  }

  damageTurret(t, amount, from) {
    if (!t.alive) return;
    t.hp -= amount;
    if (t.hp <= 0) {
      t.alive = false;
      const pos = this.turretWorld(t, new THREE.Vector3());
      try { t.tur.detach?.(); } catch (e) { this.sim.err('detachTurret', e); }
      this.sim.explode(pos, t.size * 3.2, 'small', { quietFx: true });
      this.addBreach(t.tur.posLocal.clone(), 0.9);
      this.sim.emit('turret:destroyed', { ship: this.ship.eventId, turret: t.tur.id, pos, byPlayer: !!from?.isPlayer, left: this.aliveTurrets });
      if (from?.isPlayer) this.sim.emit('notify', { text: `TORRE DESTRUÍDA — ${this.aliveTurrets} RESTANTES`, kind: 'reward' });
    }
  }

  /** Brecha no casco: fumaça + fogo saindo de um ponto local. */
  addBreach(local, heat = 0.7) {
    if (this.breaches.length >= 8 || !this.sim.fx) return;
    const tr = this.sim.fx.smoke.alloc({ life: 7, width: this.ship.radius * 0.012 + 2.5, grow: 9, minDist: 6, color: [0.3, 0.29, 0.28], alpha: 0.8, heat, seed: this.sim.rand() });
    if (tr) this.breaches.push({ local, tr, heat, t: 0 });
  }

  step(dt) {
    const s = this.ship, sim = this.sim;
    if (this.dying) return this.stepDying(dt);
    // cruzeiro lento em linha reta
    s.ctl.throttle = this.cruise; s.ctl.pitch = 0; s.ctl.yaw = 0; s.ctl.roll = 0;
    if (this.passive || s.state !== 'ok') return;
    // torres
    for (const t of this.turrets) {
      if (!t.alive) continue;
      t.cd -= dt; t.retarget -= dt;
      if (t.retarget <= 0 || (t.target && (!t.target.alive || t.target.state === 'dead'))) {
        t.retarget = 1.2 + sim.rand() * 1.6;
        t.target = this.pickTarget(t);
        t.aimT = 0;
      }
      if (!t.target) continue;
      const wp = this.turretWorld(t, _a);
      const lp = leadPoint(wp, s.vel, t.target.pos, t.target.vel || _b.set(0, 0, 0), t.def.speed, _b);
      const dir = _c.copy(lp).sub(wp);
      const dist = dir.length();
      dir.divideScalar(dist || 1);
      const dl = s.dirToLocal(dir, new THREE.Vector3());
      // campo de tiro: hemisfério acima do convés da torre
      if (dl.dot(t.tur.up) < -0.05 || dist > t.def.range) { t.aimT = 0; continue; }
      try { t.tur.aimLocal?.(dl); } catch { /* torre sem mira */ }
      t.aimT += dt;
      if (t.aimT < 0.7 || t.cd > 0) continue;
      // rajada
      if (t.burst <= 0) t.burst = t.def.kind === 'heavy' ? 1 : t.def.kind === 'flak' ? 6 : 4;
      t.burst--;
      t.cd = t.burst > 0 ? 1 / t.def.rof : (t.def.kind === 'heavy' ? 1 / t.def.rof : 0.9 + sim.rand() * 1.4);
      let muzzleL = null;
      try { muzzleL = t.tur.muzzleLocal?.(); } catch { muzzleL = null; }
      const mw = muzzleL ? s.toWorld(muzzleL, new THREE.Vector3()) : wp.clone();
      const fdir = _c.copy(lp).sub(mw).normalize();
      const fuse = t.def.flak ? dist : 0;
      sim.projectiles.fire(s, t.def, mw, fdir, { inherit: s.vel, muzzleLocal: muzzleL, spreadMul: t.def.kind === 'flak' ? 1 : 1.6, fuse, color: t.def.kind === 'heavy' ? s.boltColor : undefined });
    }
    // torpedos contra naves grandes hostis (fragatas, cargueiros, capitais)
    this.torpCd = (this.torpCd ?? 8 + sim.rand() * 10) - dt;
    if (this.torpCd <= 0 && (s.missiles.torpedo ?? 0) > 0) {
      this.torpCd = 18 + sim.rand() * 14;
      let best = null, bd = Infinity;
      for (const o of sim.combatants()) {
        if (!o.alive || o.state === 'dead' || !sim.relations.shipsHostile(s, o)) continue;
        const big = o.capital || o.classId === 'frigate' || o.classId === 'freighter';
        if (!big) continue;
        const d = o.pos.distanceTo(s.pos);
        if (d < 8000 && d > 900 && d < bd) { bd = d; best = o; }
      }
      if (best) {
        s.missiles.torpedo--;
        const dir = best.pos.clone().sub(s.pos).normalize();
        const pos = s.toWorld(_a.set(0, s.box.max.y * 0.5, s.box.min.z * 0.6), new THREE.Vector3());
        sim.missiles.launch(s, best, 'torpedo', { pos, dir });
      }
    }
    // hangares
    const L = this.launch;
    if (L.enabled && this.hangars.length && L.launched < L.max) {
      L.timer -= dt;
      if (L.timer <= 0 && sim.anyHostileNear(s, 12000)) {
        L.timer = L.interval;
        const n = Math.min(L.wave, L.max - L.launched);
        for (let i = 0; i < n; i++) this.launchFighter(i);
      }
    }
    // brechas seguem o casco
    for (const b of this.breaches) {
      b.t += dt;
      s.toWorld(b.local, _a);
      b.tr.push(_a, sim.now, b.heat * (0.7 + 0.3 * Math.sin(b.t * 7)));
    }
    // casco abaixo de 60% → novas brechas
    if (s.hullFrac < 0.6 && this.breaches.length < 2 + Math.floor((1 - s.hullFrac) * 8) && sim.rand() < dt * 0.6) this.addBreach(this.randomHullPoint(), 0.8);
  }

  randomHullPoint() {
    const b = this.ship.box;
    const r = () => this.sim.rand();
    return new THREE.Vector3(b.min.x + (b.max.x - b.min.x) * (0.3 + r() * 0.4), b.max.y * (0.4 + r() * 0.4), b.min.z + (b.max.z - b.min.z) * (0.15 + r() * 0.7));
  }

  pickTarget(t) {
    const s = this.ship, sim = this.sim;
    const wp = this.turretWorld(t, _a);
    let best = null, bs = Infinity;
    for (const o of sim.combatants()) {
      if (!o.alive || o.state === 'dead' || !sim.relations.shipsHostile(s, o)) continue;
      const d = o.pos.distanceTo(wp);
      if (d > t.def.range) continue;
      // defesa de ponto prefere caças; canhões pesados preferem naves grandes
      let score = d;
      const big = o.capital || o.classId === 'frigate' || o.classId === 'freighter';
      if (t.def.kind === 'heavy') score *= big ? 0.3 : 1.6;
      else if (big) score *= 1.5;
      if (this.focus && o === this.focus) score *= 0.35;
      score *= 0.8 + sim.rand() * 0.4;
      if (score < bs) { bs = score; best = o; }
    }
    // mísseis próximos viram alvos da defesa de ponto
    if (t.def.kind === 'flak') {
      for (const m of sim.missiles.list) {
        if (!m.alive || !sim.relations.shipsHostile(s, m.owner) || m.target !== s) continue;
        const d = m.pos.distanceTo(wp);
        if (d < 1500 && d < bs) { bs = d; best = m; }
      }
    }
    return best;
  }

  launchFighter(i) {
    const s = this.ship, sim = this.sim, L = this.launch;
    const h = this.hangars[(L.launched + i) % this.hangars.length];
    const cls = L.cls[(L.launched + i) % L.cls.length];
    const pos = s.toWorld(_a.copy(h.pos), new THREE.Vector3());
    const dir = h.dir.clone().applyQuaternion(s.quat).normalize();
    pos.addScaledVector(dir, 10 + i * 18);
    const f = s.fwd(new THREE.Vector3());
    const look = dir.clone().multiplyScalar(0.6).addScaledVector(f, 0.4).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), look, s.up(new THREE.Vector3())));
    const c = sim.spawn(s.faction, cls, pos, { quat: q, vel: s.vel.clone().addScaledVector(dir, 90), battle: s.battle, side: s.side, ai: { mode: 'launch', launchT: 2.2, focus: this.focus } });
    L.launched++;
    if (c && s.battle?.ships) s.battle.ships.push(c);
    if (c && !sim.quiet) sim.emit('capital:launch', { ship: s.eventId, fighter: c.eventId, pos });
    return c;
  }

  /** Início da destruição: explosões em cadeia ao longo do casco. */
  die(from) {
    if (this.dying) return;
    const s = this.ship;
    this.dying = { t: 0, next: 0.2, total: 7.5 + this.sim.rand() * 2, from };
    s.state = 'dying';
    s.spin = new THREE.Vector3((this.sim.rand() - 0.5) * 0.01, (this.sim.rand() - 0.5) * 0.008, (this.sim.rand() - 0.5) * 0.02);
    for (let i = 0; i < 3; i++) this.addBreach(this.randomHullPoint(), 1);
    if (!this.sim.quiet) this.sim.emit('radio', { faction: s.faction, speaker: s.name || s.label, text: 'Reator instável! Abandonar a nave! Abandonar a nave!', priority: 2 });
  }

  stepDying(dt) {
    const d = this.dying, s = this.ship, sim = this.sim;
    d.t += dt;
    d.next -= dt;
    for (const b of this.breaches) { s.toWorld(b.local, _a); b.tr.push(_a, sim.now, 1); }
    if (d.next <= 0) {
      d.next = 0.25 + sim.rand() * 0.6 * (1 - d.t / d.total);
      const p = s.toWorld(this.randomHullPoint(), new THREE.Vector3());
      sim.explode(p, 30 + sim.rand() * 45, 'ship', { vel: s.vel.clone() });
      if (sim.rand() < 0.35) this.addBreach(this.randomHullPoint(), 1);
    }
    if (d.t >= d.total) {
      sim.explode(s.pos.clone(), s.radius * 1.4, 'capital', { vel: s.vel.clone() });
      for (const b of this.breaches) b.tr.stop(sim.now);
      this.breaches.length = 0;
      sim.finishDeath(s, d.from);
    }
  }

  dispose() { for (const b of this.breaches) b.tr.stop(this.sim.now); this.breaches.length = 0; }
}
