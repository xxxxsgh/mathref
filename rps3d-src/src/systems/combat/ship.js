// Combatente: estado físico (6DOF simplificado com inércia e deriva lateral),
// escudo/casco, armas com aquecimento, contramedidas e o vínculo com o modelo
// visual de `ships` (com reserva própria se `ships` não existir).
//
// O jogador é um combatente "proxy" (PlayerProxy): a física é do `flight`; o
// combate só lê pose/velocidade e manda dano via evento 'ship:hit'.
import * as THREE from 'three/webgpu';
import { CLASS_STATS, WEAPONS, FACTION_AI, BOLT_COLORS, FACTION_LABEL } from './config.js';
import { clamp } from './math.js';
import { ShieldBubble } from './render/shield.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const FWD = new THREE.Vector3(0, 0, -1);

let _fallbackGeo = null, _fallbackMat = null;
function fallbackModel(faction) {
  // reserva sem `ships`: casco torneado com acabamento metálico (nunca um cubo)
  if (!_fallbackGeo) {
    const prof = [[0, -7], [0.6, -6], [1.3, -3.5], [1.7, 0], [1.6, 3], [1.1, 5], [0.9, 5.4]];
    _fallbackGeo = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 12);
    _fallbackGeo.rotateX(Math.PI / 2);
    _fallbackMat = new THREE.MeshStandardNodeMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.32 });
  }
  const g = new THREE.Group();
  const m = new THREE.Mesh(_fallbackGeo, _fallbackMat);
  g.add(m);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 2.6), _fallbackMat);
  wing.position.z = 1.5; g.add(wing);
  g.userData.faction = faction;
  return g;
}

export class Combatant {
  constructor(sim, o) {
    this.sim = sim;
    const ctx = sim.ctx;
    this.id = o.id;
    this.faction = o.faction;
    this.classId = CLASS_STATS[o.classId] ? o.classId : 'fighter';
    this.stats = CLASS_STATS[this.classId];
    this.ai = null; this.capital = null; this.isPlayer = false;
    this.name = o.name || '';
    this.callsign = o.callsign || '';
    this.grudges = new Set();
    this.tags = new Set(o.tags || []);
    this.battle = o.battle || null;
    this.side = o.side || this.faction;
    this.persona = FACTION_AI[this.faction] || FACTION_AI.guilda;
    // estado físico
    this.pos = o.pos.clone(); this.prevPos = this.pos.clone(); this.renderPos = this.pos.clone();
    this.quat = (o.quat || new THREE.Quaternion()).clone(); this.prevQuat = this.quat.clone();
    this.vel = o.vel ? o.vel.clone() : new THREE.Vector3();
    this.angRate = new THREE.Vector3();
    this.throttle = o.throttle ?? 0.7; this.boost = false; this.boostT = 0;
    this.ctl = { pitch: 0, yaw: 0, roll: 0, throttle: this.throttle, boost: false };
    // vida
    const k = o.toughness ?? 1;
    this.hullMax = this.stats.hull * k; this.hull = this.hullMax * (o.hull ?? 1);
    this.shieldMax = this.stats.shield * k * (o.shieldMul ?? 1); this.shield = this.shieldMax;
    this.shieldDelay = 0; this.ion = 0;
    this.heat = 0; this.overheat = false;
    this.state = 'ok'; // ok | disabled | dying | dead
    this.alive = true;
    this.lastHitBy = null; this.lastHitT = -100; this.hitsTaken = 0;
    this.boardable = o.boardable ?? this.stats.boardable;
    this.disableOnly = !!o.disableOnly;
    this.invulnerable = !!o.invulnerable;
    this.skill = o.skill ?? 1;
    // armas
    const wl = o.weapons || this.persona.weapons || this.stats.weapons;
    this.inst = null;
    try { this.inst = ctx.services.ships?.create?.(this.classId, this.faction, { seed: o.seed ?? 1, throttle: this.throttle, lite: o.lite, shadows: o.shadows ?? (this.stats.capital || sim.near(this.pos, 1500)), paint: o.paint }); } catch (e) { sim.err('ships.create', e); }
    this.group = this.inst?.group || fallbackModel(this.faction);
    this.group.quaternion.copy(this.quat);
    this.radius = this.inst?.radius || (this.stats.capital ? 400 : 9);
    this.length = this.inst?.length || this.radius * 1.6;
    this.box = this.inst?.bp?.box?.clone?.() || new THREE.Box3(new THREE.Vector3(-this.radius * 0.5, -this.radius * 0.2, -this.radius * 0.8), new THREE.Vector3(this.radius * 0.5, this.radius * 0.2, this.radius * 0.8));
    this.hitR = this.stats.capital ? this.radius : Math.max(3, this.radius * 0.62);
    this.colliders = (this.inst?.colliders || []).map((c) => ({ center: c.center.clone(), half: c.half.clone() }));
    const guns = (this.inst?.hardpoints || []).filter((h) => h.type === 'gun' || h.type === 'beam');
    this.weapons = wl.map((id, i) => {
      const hp = guns.length ? guns[i % guns.length] : null;
      return { def: WEAPONS[id] || WEAPONS.laser, hp: hp ? hp.pos.clone() : new THREE.Vector3((i % 2 ? 1 : -1) * this.radius * 0.3, -0.4, -this.length * 0.35), cd: Math.random() * 0.3 };
    });
    this.missilePods = (this.inst?.hardpoints || []).filter((h) => h.type === 'missile').map((h) => h.pos.clone());
    this.missiles = { ...(this.stats.missiles || {}) };
    if (o.missiles) Object.assign(this.missiles, o.missiles);
    this.cm = { flare: 0, chaff: 0, ...(this.stats.cm || {}) };
    this.cmCd = 0; this.missileCd = 2 + Math.random() * 3;
    this.boltColor = BOLT_COLORS[this.faction] || BOLT_COLORS.hegemonia;
    const ec = this.inst?.style?.engine || [0.6, 0.75, 1.0];
    const em = Math.max(ec[0], ec[1], ec[2], 1e-3);
    this.engineColor = [ec[0] / em, ec[1] / em, ec[2] / em]; // só a cor; a intensidade é do rastro
    this.entry = ctx.world.add(this.group, this.renderPos);
    // rastro do motor (média dos bocais)
    this.nozzle = new THREE.Vector3(0, 0, this.length * 0.45);
    this.nozzleR = this.radius * 0.08;
    const th = this.inst?.thrusters || [];
    if (th.length) {
      this.nozzle.set(0, 0, 0);
      let r = 0;
      for (const t of th) { this.nozzle.add(t.posLocal); r += t.r; }
      this.nozzle.divideScalar(th.length);
      this.nozzleR = r / th.length;
      this.nozzles = th.map((t) => t.posLocal.clone());
    }
    this.trail = null;
    if (!this.stats.capital && sim.fx) {
      this.trail = sim.fx.engineTrails.alloc({ life: this.classId === 'fighter' || this.classId === 'interceptor' ? 0.4 : 0.9, width: Math.max(0.25, this.nozzleR * 0.45), minDist: 5, color: this.engineColor, intensity: 1.6, alpha: 0.85, seed: Math.random() });
    }
    this.shieldFx = null;
    this.t = 0; this.flicker = 0; this.sparkT = 0;
    this.smoke = null;
    this.threat = 0; this.incoming = null; // míssil vindo nesta direção
    this.lockOn = null; this.lockT = 0;
  }

  get label() { return (this.inst?.model || this.classId).toUpperCase(); }
  get factionLabel() { return FACTION_LABEL[this.faction] || this.faction; }
  get hullFrac() { return this.hull / this.hullMax; }
  get shieldFrac() { return this.shieldMax > 0 ? this.shield / this.shieldMax : 0; }
  /** id usado nos eventos (o id da instância de `ships`, para o dano visual). */
  get eventId() { return this.inst?.id || this.id; }
  fwd(out = new THREE.Vector3()) { return out.copy(FWD).applyQuaternion(this.quat); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out = new THREE.Vector3()) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  toWorld(local, out = new THREE.Vector3()) { return out.copy(local).applyQuaternion(this.quat).add(this.pos); }
  toLocal(world, out = new THREE.Vector3()) { return out.copy(world).sub(this.pos).applyQuaternion(_q.copy(this.quat).invert()); }
  dirToLocal(dir, out = new THREE.Vector3()) { return out.copy(dir).applyQuaternion(_q.copy(this.quat).invert()); }

  /** Passo de física. ctl: {pitch,yaw,roll (−1..1), throttle 0..1, boost} */
  integrate(dt) {
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
    const S = this.stats, c = this.ctl;
    const dis = this.state !== 'ok';
    const tr = S.turn;
    if (this.state === 'dying') {
      // giro descontrolado
      this.angRate.addScaledVector(this.spin || _v.set(0.5, 0.3, 2), dt * 0.4);
    } else if (!dis) {
      const k = 1 - Math.exp(-dt * 5);
      this.angRate.x += (clamp(c.pitch, -1, 1) * tr.pitch - this.angRate.x) * k;
      this.angRate.y += (clamp(c.yaw, -1, 1) * tr.yaw - this.angRate.y) * k;
      this.angRate.z += (clamp(c.roll, -1, 1) * tr.roll - this.angRate.z) * k;
    } else this.angRate.multiplyScalar(Math.exp(-dt * 0.3));
    _e.set(this.angRate.x * dt, this.angRate.y * dt, this.angRate.z * dt, 'YXZ');
    this.quat.multiply(_q.setFromEuler(_e)).normalize();
    // velocidade: frente com aceleração limitada, lateral amortecida (acoplado)
    const f = this.fwd(_v);
    if (!dis) {
      this.boostT = Math.max(0, this.boostT - dt);
      const boosting = c.boost && this.heat < 0.9;
      this.boost = boosting;
      const target = (boosting ? S.boost : S.speed * clamp(c.throttle, 0, 1.1));
      const vf = this.vel.dot(f);
      const acc = S.accel * (boosting ? 1.8 : 1);
      const dv = clamp(target - vf, -acc * dt * 1.5, acc * dt);
      this.vel.addScaledVector(f, dv);
      // deriva lateral decai (assistência de voo)
      _v2.copy(this.vel).addScaledVector(f, -this.vel.dot(f));
      this.vel.addScaledVector(_v2, -(1 - Math.exp(-dt * S.grip)));
      this.throttle += (clamp(c.throttle, 0, 1) - this.throttle) * (1 - Math.exp(-dt * 3));
    } else {
      this.throttle *= Math.exp(-dt * 2);
    }
    this.pos.addScaledVector(this.vel, dt);
    // calor e escudo
    this.heat = Math.max(0, this.heat - dt * (this.overheat ? 0.22 : 0.16));
    if (this.overheat && this.heat < 0.35) this.overheat = false;
    if (this.heat >= 1) this.overheat = true;
    if (this.shieldDelay > 0) this.shieldDelay -= dt;
    else if (this.shield < this.shieldMax && this.state === 'ok') this.shield = Math.min(this.shieldMax, this.shield + S.regen * dt);
    this.ion = Math.max(0, this.ion - dt * this.hullMax * 0.012);
    this.cmCd = Math.max(0, this.cmCd - dt);
    this.missileCd = Math.max(0, this.missileCd - dt);
    for (const w of this.weapons) w.cd = Math.max(0, w.cd - dt);
  }

  /** Visual por quadro (interpolação, propulsores, escudo, faíscas). */
  frame(dt, alpha) {
    this.t += dt;
    this.renderPos.lerpVectors(this.prevPos, this.pos, alpha);
    this.group.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);
    const inst = this.inst;
    if (inst) {
      const ok = this.state === 'ok';
      // fxThrottle/fxBoost: cenas podem forçar o visual do motor independente da física
      const th = this.fxThrottle ?? this.throttle, bo = this.fxBoost ?? this.boost;
      inst.setThrottle?.(ok ? 0.15 + th * 0.85 : this.state === 'dying' ? 0.2 + Math.random() * 0.3 : 0);
      inst.setBoost?.(ok && bo ? 1 : 0);
      if (this.state === 'disabled') {
        this.flicker -= dt;
        if (this.flicker <= 0) { this.flicker = 0.05 + Math.random() * (Math.random() < 0.2 ? 1.5 : 0.25); inst.setLights?.(Math.random() < 0.35); }
      }
    }
    if (this.shieldFx) this.shieldFx.frame(dt, this.shieldFrac);
    if (this.trail) {
      const th = this.fxThrottle ?? this.throttle;
      if (this.state === 'ok' && th > 0.05) this.trail.push(this.toWorldRender(this.nozzle, _v), this.sim.renderNow);
      this.trail.intensity = 0.4 + th * 0.9 + ((this.fxBoost ?? this.boost) ? 0.8 : 0);
    }
  }

  toWorldRender(local, out) { return out.copy(local).applyQuaternion(this.group.quaternion).add(this.renderPos); }

  ensureShield() {
    if (this.shieldFx || this.shieldMax <= 0 || !this.sim.fx) return this.shieldFx;
    const col = this.faction === 'vigilantes' ? [0.5, 0.9, 1.0] : this.faction === 'corsarios' ? [0.9, 0.35, 1.0] : this.faction === 'frente' ? [1.0, 0.55, 0.3] : this.faction === 'guilda' ? [0.35, 1.0, 0.8] : [0.45, 0.7, 1.0];
    try { this.shieldFx = new ShieldBubble(this.group, this.box, col, !!this.stats.capital || this.classId === 'frigate'); } catch (e) { this.sim.err('shield', e); this.shieldMax = this.shieldMax; }
    return this.shieldFx;
  }

  dispose() {
    this.alive = false;
    this.entry?.remove();
    this.shieldFx?.dispose();
    this.trail?.stop(this.sim.renderNow);
    this.smoke?.stop(this.sim.renderNow);
    try { this.inst?.dispose(); } catch { /* já liberada */ }
  }
}

/** O jogador visto pelo combate (física e dano reais ficam no `flight`). */
export class PlayerProxy {
  constructor(sim) {
    this.sim = sim;
    this.id = 'player'; this.isPlayer = true; this.faction = 'player'; this.side = 'player';
    this.classId = 'fighter'; this.stats = CLASS_STATS.fighter;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.quat = new THREE.Quaternion();
    this.prevPos = new THREE.Vector3(); this.renderPos = new THREE.Vector3();
    this.grudges = new Set(); this.tags = new Set();
    this.alive = false; this.state = 'ok';
    this.radius = 9; this.hitR = 6; this.length = 18; this.colliders = [];
    this.box = new THREE.Box3(new THREE.Vector3(-6, -2, -9), new THREE.Vector3(6, 2, 9));
    this.hullMax = 100; this.shieldMax = 100;
    this.persona = FACTION_AI.hegemonia;
    this.incoming = null; this.threat = 0;
    this.boltColor = BOLT_COLORS.player;
    this.cm = { flare: 24, chaff: 12 };
    this.missiles = { ir: 6, radar: 2 };
    this.name = 'RAFAEL PAOLI'; this.callsign = 'LANÇA-7';
    this.lastHitBy = null; this.lastHitT = -100;
  }
  get label() { return 'LANÇA-7'; }
  get factionLabel() { return 'Rafael Paoli'; }
  get eventId() { return 'player'; }
  get hull() { return this.sim.ctx.services.flight?.model?.hull ?? 1; }
  get hullFrac() { return this.hull; }
  get shieldFrac() { const s = this.sim.ctx.services.flight?.model?.shields; return s ? (s.f + s.b + s.l + s.r) / 4 : 1; }
  get inst() { return this.sim.ctx.services.flight?.instance || null; }
  fwd(out = new THREE.Vector3()) { return out.copy(FWD).applyQuaternion(this.quat); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  right(out = new THREE.Vector3()) { return out.set(1, 0, 0).applyQuaternion(this.quat); }
  toWorld(local, out = new THREE.Vector3()) { return out.copy(local).applyQuaternion(this.quat).add(this.pos); }
  toLocal(world, out = new THREE.Vector3()) { return out.copy(world).sub(this.pos).applyQuaternion(_q.copy(this.quat).invert()); }
  dirToLocal(dir, out = new THREE.Vector3()) { return out.copy(dir).applyQuaternion(_q.copy(this.quat).invert()); }
  /** Lê a pose do `flight`. Retorna false se não há nave ou não está voando. */
  sync(ctx) {
    const fl = ctx.services.flight;
    const st = fl?.state;
    const ok = !!st && (ctx.game.mode === 'ship' || ctx.game.mode === 'cinematic');
    if (!ok) { this.alive = false; return false; }
    this.prevPos.copy(this.pos);
    let done = false;
    try {
      const m = fl.model;
      if (m?.worldPos && m?.worldQuat) { m.worldPos(ctx.time.world, this.pos); m.worldQuat(ctx.time.world, this.quat); done = true; }
    } catch { done = false; }
    if (!done) {
      let pose = null;
      try { pose = fl.pose?.(); } catch { pose = null; }
      if (pose) { this.pos.copy(pose.pos); this.quat.copy(pose.quat); } else this.pos.copy(ctx.player.pos);
    }
    this.vel.copy(ctx.player.vel);
    this.radius = st.radius || 9; this.length = st.length || 18; this.hitR = Math.max(4, this.radius * 0.6);
    this.classId = st.classId || 'fighter';
    const q = st.quantum?.state;
    // em quântico/salto/pousado/atracado não participa
    this.alive = !(q === 'travel' || st.jump?.state === 'travel' || st.docked) && (st.hull ?? 1) > 0;
    this.quantum = q;
    this.landed = !!st.landed;
    return this.alive;
  }
}
