import * as THREE from 'three';
import { computeDamage, isBackstab } from './DamageSystem.js';
import { TEAM_COLORS } from './Combatant.js';
import { WEAPONS, KNIFE_HEAVY, KNIFE_LIGHT } from '../weapons/WeaponData.js';

/**
 * Resolve tiros e golpes: traça o raio contra o mundo e contra as hitboxes,
 * aplica dano (com queda por distância, região, colete) e emite eventos
 * (kill feed, hitmarker, indicador de dano). Não sabe nada de rounds — quem
 * ouve os eventos decide o que fazer.
 */

/**
 * @typedef {Object} ShotResult
 * @property {boolean} hitActor
 * @property {boolean} headshot
 * @property {boolean} kill
 * @property {THREE.Vector3} point
 * @property {number} damage
 */

/**
 * @typedef {Object} KillEvent
 * @property {import('./Combatant.js').Combatant} killer
 * @property {import('./Combatant.js').Combatant} victim
 * @property {string} weapon
 * @property {boolean} headshot
 * @property {boolean} wallbang
 * @property {import('./Combatant.js').Combatant|null} assister
 */

export class CombatSystem {
  /**
   * @param {import('../world/Collision.js').CollisionWorld} world
   * @param {import('../fx/Effects.js').Effects} fx
   * @param {import('../audio/AudioManager.js').AudioManager} audio
   */
  constructor(world, fx, audio) {
    this.world = world;
    this.fx = fx;
    this.audio = audio;
    /** @type {import('./Combatant.js').Combatant[]} */
    this.actors = [];
    this.friendlyFire = false;
    this.time = 0;
    /** @type {((e: KillEvent) => void)[]} */
    this.onKill = [];
    /** @type {((victim: any, attacker: any, dmg: number, from: THREE.Vector3) => void)[]} */
    this.onDamage = [];
    /** @type {((shooter: any, pos: THREE.Vector3) => void)[]} */
    this.onShotHeard = [];
    this.hit = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
    this.tmpP = new THREE.Vector3();
    this.tmpD = new THREE.Vector3();
  }

  /** @param {import('./Combatant.js').Combatant} a */
  add(a) {
    this.actors.push(a);
  }

  /** @param {import('./Combatant.js').Combatant} a */
  remove(a) {
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
  }

  /**
   * Primeiro combatente atingido pelo raio (antes de maxT).
   * @param {import('./Combatant.js').Combatant} shooter
   */
  traceActors(shooter, o, d, maxT) {
    let best = null;
    let bestT = maxT;
    let group = '';
    for (const a of this.actors) {
      if (a === shooter || !a.alive) continue;
      if (!this.friendlyFire && a.team === shooter.team && !a.isTarget) continue;
      if (a.isTarget && shooter.isBot) continue;
      const r = a.rayTest(o.x, o.y, o.z, d.x, d.y, d.z, bestT);
      if (r && r.t < bestT) {
        bestT = r.t;
        best = a;
        group = r.group;
      }
    }
    return best ? { actor: best, t: bestT, group } : null;
  }

  /**
   * Tiro hitscan.
   * @param {import('./Combatant.js').Combatant} shooter
   * @param {THREE.Vector3} origin olho do atirador
   * @param {THREE.Vector3} dir direção já com dispersão (normalizada)
   * @param {import('../weapons/WeaponData.js').WeaponDef} def
   * @param {THREE.Vector3|null} tracerFrom de onde desenhar o tracer
   * @returns {ShotResult}
   */
  fireHitscan(shooter, origin, dir, def, tracerFrom) {
    const wh = this.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, def.range, this.hit);
    const wallT = wh ? wh.t : def.range;
    const ah = this.traceActors(shooter, origin, dir, wallT);
    const end = this.tmpP.copy(origin).addScaledVector(dir, ah ? ah.t : wallT);
    /** @type {ShotResult} */
    const res = { hitActor: false, headshot: false, kill: false, point: end.clone(), damage: 0 };
    if (tracerFrom && Math.random() < def.tracerChance) this.fx.tracer(tracerFrom, end);
    if (ah) {
      const v = ah.actor;
      const dmg = computeDamage(def, ah.t, ah.group, v);
      res.hitActor = true;
      res.headshot = dmg.headshot;
      res.damage = dmg.health;
      this.fx.bodyHit(end, dir, v.isTarget ? 0xffe066 : TEAM_COLORS[v.team], dmg.headshot);
      res.kill = this.applyDamage(v, shooter, dmg.health, dmg.armor, def.id, dmg.headshot, origin);
    } else if (wh) {
      const n = { x: wh.nx, y: wh.ny, z: wh.nz };
      this.fx.impact(end, n, wh.box ? wh.box.surface : 'concrete');
      if (Math.random() < 0.5) this.audio.impact(wh.box ? wh.box.surface : 'concrete', end);
    }
    for (const fn of this.onShotHeard) fn(shooter, origin);
    return res;
  }

  /**
   * Golpe de faca: leque de 5 raios curtos (mira + 4 desvios), pega o
   * primeiro acerto. Retorna null se errou tudo (ou bateu em parede).
   * @param {import('./Combatant.js').Combatant} attacker
   * @param {THREE.Vector3} origin
   * @param {number} yaw @param {number} pitch
   * @param {boolean} heavy
   * @param {boolean} chained golpe leve em sequência (dano menor)
   */
  melee(attacker, origin, yaw, pitch, heavy, chained) {
    const range = heavy ? KNIFE_HEAVY.range : WEAPONS.knife.range;
    const offsets = [
      [0, 0],
      [0.12, 0],
      [-0.12, 0],
      [0, 0.1],
      [0, -0.12],
    ];
    for (const [oy, op] of offsets) {
      const d = attacker.aimDir(this.tmpD, yaw + oy, pitch + op);
      const wh = this.world.raycast(origin.x, origin.y, origin.z, d.x, d.y, d.z, range, this.hit);
      const maxT = wh ? wh.t : range;
      const ah = this.traceActors(attacker, origin, d, maxT);
      if (ah) {
        const v = ah.actor;
        const toTarget = Math.atan2(-(v.body.pos.x - attacker.body.pos.x), -(v.body.pos.z - attacker.body.pos.z));
        const back = !v.isTarget && isBackstab(toTarget, v.yaw);
        let base = heavy ? (back ? KNIFE_HEAVY.backstab : KNIFE_HEAVY.damage) : chained ? KNIFE_LIGHT.chain : KNIFE_LIGHT.first;
        if (!heavy && back) base *= KNIFE_LIGHT.backstabMult;
        const dmg = computeDamage(WEAPONS.knife, 0, 'chest', v, base);
        const p = this.tmpP.copy(origin).addScaledVector(d, ah.t);
        this.fx.bodyHit(p, d, v.isTarget ? 0xffe066 : TEAM_COLORS[v.team], back);
        this.audio.knifeHit(p);
        const kill = this.applyDamage(v, attacker, dmg.health, dmg.armor, 'knife', false, origin);
        return { hitActor: true, kill, backstab: back, damage: dmg.health };
      }
      if (wh && oy === 0 && op === 0) {
        const p = this.tmpP.copy(origin).addScaledVector(d, wh.t);
        this.fx.impact(p, { x: wh.nx, y: wh.ny, z: wh.nz }, wh.box ? wh.box.surface : 'concrete');
        this.audio.impact(wh.box ? wh.box.surface : 'concrete', p);
        return { hitActor: false, kill: false, backstab: false, damage: 0, wall: true };
      }
    }
    return null;
  }

  /**
   * @param {import('./Combatant.js').Combatant} v
   * @param {import('./Combatant.js').Combatant} attacker
   * @returns {boolean} morreu?
   */
  applyDamage(v, attacker, health, armor, weaponId, headshot, from) {
    if (!v.alive) return false;
    if (v.spawnProtect > 0) return false;
    const real = Math.min(v.health, health);
    v.health -= health;
    v.armor = Math.max(0, v.armor - armor);
    v.lastDamageTime = this.time;
    if (attacker.team !== v.team) {
      attacker.stats.damage += real;
      v.damageFrom.set(attacker.id, (v.damageFrom.get(attacker.id) || 0) + real);
    }
    for (const fn of this.onDamage) fn(v, attacker, real, from);
    if (v.health > 0) return false;
    v.health = 0;
    v.alive = false;
    v.stats.deaths++;
    if (attacker !== v && attacker.team !== v.team) {
      attacker.stats.kills++;
      attacker.stats.score += 2;
      if (headshot) attacker.stats.headshots++;
    }
    // assistência: quem causou ≥ 40 de dano e não matou
    let assister = null;
    for (const [id, d] of v.damageFrom) {
      if (id !== attacker.id && d >= 40) {
        assister = this.actors.find((a) => a.id === id) || null;
        if (assister) {
          assister.stats.assists++;
          assister.stats.score += 1;
        }
        break;
      }
    }
    for (const fn of this.onKill) fn({ killer: attacker, victim: v, weapon: weaponId, headshot, wallbang: false, assister });
    return true;
  }

  /** @param {number} dt */
  update(dt) {
    this.time += dt;
    for (const a of this.actors) if (a.spawnProtect > 0) a.spawnProtect -= dt;
  }
}
