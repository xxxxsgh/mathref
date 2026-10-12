// Armas do jogador: canhões nos hardpoints da nave (convergência + mira
// assistida perto do indicador de antecipação), aquecimento via `flight`,
// dano escalado pela energia das armas, seleção de alvo (T), trava e
// lançamento de mísseis (botão secundário), contramedidas (X), avisos de
// míssil, abordagem de naves desativadas (F) e alimentação do cockpit/HUD.
import * as THREE from 'three/webgpu';
import { WEAPONS, MISSILES, FACTION_LABEL } from './config.js';
import { clamp } from './math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();

export class PlayerWeapons {
  constructor(sim) {
    this.sim = sim;
    // grupos de armas (R alterna): laser (escudos), massa (casco), íons (desativa sem destruir)
    this.groups = [['laser', 'laser'], ['massa', 'massa'], ['ion', 'ion']];
    this.group = 0;
    this.loadout = this.groups[0];
    this.missileKinds = ['ir', 'radar'];
    this.missileKind = 'ir';
    this.cd = 0; this.gun = 0;
    this.lock = 0; this.lockTarget = null; this.lockAnnounced = false;
    this.boardCandidate = null;
    this.cycle = [];
    this.warnT = 0;
    this.firing = false;
  }

  /** Velocidade do projétil do grupo de armas atual (para a antecipação). */
  get weaponSpeed() { return (WEAPONS[this.loadout[0]] || WEAPONS.laser).speed; }

  get guns() {
    const inst = this.sim.player.inst;
    const hp = (inst?.hardpoints || []).filter((h) => h.type === 'gun');
    return hp.length ? hp.map((h) => h.pos) : [new THREE.Vector3(-1.6, -0.5, -5), new THREE.Vector3(1.6, -0.5, -5)];
  }

  canFight(ctx) {
    const p = this.sim.player;
    if (!p.alive || ctx.game.mode !== 'ship' || ctx.game.paused || ctx.input.enabled === false) return false;
    const st = ctx.services.flight?.state;
    if (!st || st.landed || st.docked || st.quantum?.state === 'spool' || st.quantum?.state === 'travel' || st.jump?.state !== 'idle' && st.jump?.state) return false;
    return true;
  }

  step(dt, ctx) {
    const sim = this.sim, p = sim.player, inp = ctx.input;
    this.cd = Math.max(0, this.cd - dt);
    this.firing = false;
    if (!p.alive) { this.lock = 0; return; }
    const fight = this.canFight(ctx);
    // seleção de alvo · grupo de armas (R) · tipo de míssil (G)
    if (fight && inp.pressed('target')) this.cycleTarget();
    if (fight && inp.pressed('reload')) {
      this.group = (this.group + 1) % this.groups.length;
      this.loadout = this.groups[this.group];
      const def = WEAPONS[this.loadout[0]];
      ctx.bus.emit('notify', { text: `ARMAS: ${def.label}${def.kind === 'ion' ? ' — DESATIVA SEM DESTRUIR' : ''}`, kind: 'info' });
    }
    if (fight && inp.pressed('grenade')) {
      const i = this.missileKinds.indexOf(this.missileKind);
      this.missileKind = this.missileKinds[(i + 1) % this.missileKinds.length];
      this.lock = 0;
      ctx.bus.emit('notify', { text: `MÍSSEIS: ${MISSILES[this.missileKind].label} (${p.missiles[this.missileKind] ?? 0})`, kind: 'info' });
    }
    const T = sim.playerTarget;
    if (T && (!T.alive || T.state === 'dead')) sim.playerTarget = null;
    // disparo
    const fl = ctx.services.flight;
    const m = fl?.model;
    const overheat = !!(m?.overheat || (m?.heat ?? 0) >= 1);
    if (fight && inp.down('primary') && !overheat) this.fire(ctx, fl, m);
    // trava de míssil
    this.updateLock(dt, ctx);
    if (fight && inp.pressed('secondary')) this.launchMissile(ctx);
    // contramedidas
    if (fight && inp.pressed('countermeasure')) {
      if (sim.missiles.deploy(p, 'both', 2)) ctx.bus.emit('notify', { text: `CONTRAMEDIDAS — FLARES ${p.cm.flare} · CHAFF ${p.cm.chaff}`, kind: 'info' });
      else ctx.bus.emit('notify', { text: 'SEM CONTRAMEDIDAS', kind: 'warn' });
    }
    // abordagem
    this.boardCandidate = null;
    for (const s of sim.ships) {
      if (s.state !== 'disabled' || !s.boardable) continue;
      const d = s.pos.distanceTo(p.pos);
      const rv = _a.copy(s.vel).sub(p.vel).length();
      if (d < s.radius * 1.6 + 120 && rv < 40) { this.boardCandidate = s; break; }
    }
    if (this.boardCandidate && inp.pressed('interact') && ctx.game.mode === 'ship') sim.board(this.boardCandidate);
  }

  fire(ctx, fl, m) {
    const sim = this.sim, p = sim.player;
    if (this.cd > 0) return;
    const guns = this.guns;
    const wIdx = this.gun % this.loadout.length;
    const def = WEAPONS[this.loadout[wIdx]] || WEAPONS.laser;
    const nGuns = guns.length;
    this.cd = 1 / (def.rof * Math.max(1, nGuns)); // canhões alternados: mesma cadência total da IA
    const hp = guns[this.gun % nGuns];
    this.gun++;
    const energy = m?.energy?.weapons ?? 0.5;
    const dmgMul = 0.7 + energy * 0.6;
    const fwd = p.fwd(_a);
    // mira: converge a 700 m; puxa até 3,5° para a antecipação do alvo
    let aim = _b.copy(p.pos).addScaledVector(fwd, 700);
    const T = this.sim.playerTarget;
    if (T && T.alive) {
      const L = sim.lead(T, def.speed);
      if (L && L.dist < def.range * 1.1) {
        const ang = Math.acos(clamp(L.dir.dot(fwd), -1, 1));
        if (ang < 0.061) aim = _b.copy(L.pos);
        else if (L.dist < 700) aim = _b.copy(p.pos).addScaledVector(fwd, L.dist);
      }
    }
    const muzzle = p.toWorld(hp, _c);
    const dir = _d.copy(aim).sub(muzzle).normalize();
    sim.projectiles.fire(p, def, muzzle, dir, { inherit: p.vel, muzzleLocal: hp.clone(), dmgMul, color: p.boltColor });
    try { fl?.addHeat?.(def.heat * 0.55); } catch { /* sem voo */ }
    this.firing = true;
    ctx.input.rumble?.(0.15, 0.05, 40);
  }

  cycleTarget() {
    const sim = this.sim, p = sim.player;
    const fwd = p.fwd(_a);
    const list = [];
    for (const s of sim.ships) {
      if (!s.alive || s.state === 'dead') continue;
      const d = s.pos.distanceTo(p.pos);
      if (d > 12000) continue;
      const ang = Math.acos(clamp(_b.copy(s.pos).sub(p.pos).normalize().dot(fwd), -1, 1));
      const hostile = sim.relations.shipsHostile(p, s);
      list.push({ s, score: ang * 3 + d / 4000 - (hostile ? 1.5 : 0) });
    }
    list.sort((x, y) => x.score - y.score);
    if (!list.length) { sim.playerTarget = null; return; }
    const cur = sim.playerTarget;
    const idx = list.findIndex((x) => x.s === cur);
    // primeira vez: o melhor; depois cicla
    const next = idx < 0 ? list[0].s : list[(idx + 1) % list.length].s;
    sim.playerTarget = next;
    this.lock = 0;
    sim.emit('combat:target', { id: next.eventId, faction: next.faction });
  }

  updateLock(dt, ctx) {
    const sim = this.sim, p = sim.player, T = sim.playerTarget;
    const def = MISSILES[this.missileKind];
    const n = p.missiles[this.missileKind] ?? 0;
    if (!T || !T.alive || n <= 0 || !this.canFight(ctx)) { this.lock = Math.max(0, this.lock - dt); this.lockTarget = null; return; }
    if (this.lockTarget !== T) { this.lock = 0; this.lockTarget = T; this.lockAnnounced = false; }
    const toT = _a.copy(T.pos).sub(p.pos);
    const d = toT.length();
    const ang = Math.acos(clamp(toT.divideScalar(d || 1).dot(p.fwd(_b)), -1, 1));
    if (d < def.range && ang < def.fov * 0.7) {
      this.lock = Math.min(1, this.lock + dt / def.lockTime);
      if (this.lock >= 1 && !this.lockAnnounced) { this.lockAnnounced = true; sim.emit('missile:lock', { target: T.eventId, by: 'player', progress: 1 }); }
    } else { this.lock = Math.max(0, this.lock - dt * 0.8); this.lockAnnounced = false; }
  }

  launchMissile(ctx) {
    const sim = this.sim, p = sim.player;
    const kind = this.missileKind;
    if ((p.missiles[kind] ?? 0) <= 0) { ctx.bus.emit('notify', { text: 'SEM MÍSSEIS', kind: 'warn' }); return; }
    if (this.lock < 1 || !sim.playerTarget) { ctx.bus.emit('notify', { text: 'SEM TRAVA', kind: 'warn' }); return; }
    p.missiles[kind]--;
    const pods = [new THREE.Vector3(-2.6, -0.9, 1.5), new THREE.Vector3(2.6, -0.9, 1.5)];
    const inst = p.inst;
    const hp = (inst?.hardpoints || []).filter((h) => h.type === 'missile').map((h) => h.pos);
    const pod = (hp.length ? hp : pods)[(p.missiles[kind]) % (hp.length || 2)];
    sim.missiles.launch(p, sim.playerTarget, kind, { pos: p.toWorld(pod, new THREE.Vector3()), dir: p.fwd(new THREE.Vector3()) });
    this.lock = 0.35;
    ctx.input.rumble?.(0.4, 0.2, 120);
  }

  /** Dados para o cockpit (MFDs + HUD holográfico). */
  cockpitData(ctx) {
    const sim = this.sim, p = sim.player;
    if (!p.alive) return null;
    const inv = _q.copy(p.quat).invert();
    const R = 6000;
    const contacts = [];
    for (const s of sim.ships) {
      if (!s.alive || s.state === 'dead') continue;
      const d = _a.copy(s.pos).sub(p.pos);
      const dist = d.length();
      if (dist > R * 1.6 && !s.capital) continue;
      contacts.push({ dir: d.divideScalar(dist || 1).applyQuaternion(inv).clone(), dist, rel: sim.relations.shipsHostile(p, s) ? 'hostile' : sim.relations.isAllied('player', s.faction) ? 'friendly' : 'neutral', capital: !!s.capital, selected: s === sim.playerTarget, name: s.label });
    }
    for (const m of sim.missiles.list) {
      if (!m.alive || m.target !== p) continue;
      const d = _a.copy(m.pos).sub(p.pos); const dist = d.length();
      contacts.push({ dir: d.divideScalar(dist || 1).applyQuaternion(inv).clone(), dist, rel: 'hostile', missile: true, name: 'MÍSSIL' });
    }
    const T = sim.playerTarget;
    let target = null;
    if (T && T.alive) {
      const d = _a.copy(T.pos).sub(p.pos); const dist = d.length();
      const L = sim.lead(T, this.weaponSpeed);
      target = {
        name: T.callsign ? `${T.label} · ${T.callsign}` : T.label, faction: FACTION_LABEL[T.faction] || T.faction,
        rel: sim.relations.shipsHostile(p, T) ? 'hostile' : sim.relations.isAllied('player', T.faction) ? 'friendly' : 'neutral',
        dist, speed: T.vel.length(), hull: T.hullFrac, shield: T.shieldFrac, locked: this.lock >= 1,
        dirLocal: d.divideScalar(dist || 1).applyQuaternion(inv).clone(), leadLocal: L?.localDir?.clone() || null,
        disabled: T.state === 'disabled', turrets: T.capital ? T.capital.aliveTurrets : undefined,
      };
    }
    const inc = sim.missiles.incoming(p);
    const warnings = [];
    if (inc) warnings.push(inc.dist < 1200 ? 'MÍSSIL — CONTRAMEDIDAS!' : 'MÍSSIL TRAVADO');
    if (this.boardCandidate) warnings.push('F — ABORDAR');
    return { contacts, target, lock: this.lock, missiles: p.missiles[this.missileKind] ?? 0, missileKind: this.missileKind, weapon: (WEAPONS[this.loadout[0]] || WEAPONS.laser).label, radarRange: R, warnings, cm: { ...p.cm } };
  }
}
