import * as THREE from 'three';
import { RecoilSystem } from '../weapons/RecoilSystem.js';
import { STAND_HEIGHT, CROUCH_HEIGHT } from '../combat/Combatant.js';
import { UPLINK } from '../world/Arena.js';
import { damp } from '../core/Rng.js';

/**
 * IA dos bots — máquina de estados com "pensamento" em baixa frequência.
 *
 *   objective → segue a rota até o Uplink e o segura
 *   engage    → inimigo visível: mira (com tempo de reação e erro), atira
 *               em rajadas, strafe, agacha (difícil+)
 *   cover     → procura um ponto escondido da ameaça (tomou dano sem ver
 *               quem, precisa recarregar, ou está ferido = retreat)
 *   chase     → perdeu o alvo: vai até a última posição conhecida
 *
 * Percepção, decisão e pathfinding rodam a ~10 Hz com fase escalonada entre
 * bots; só o movimento e a mira rodam todo frame. Isso mantém o custo da IA
 * baixo e constante.
 */

export const DIFFICULTY = {
  easy: { label: 'Fácil', reaction: 0.65, turn: 3.2, aimError: 0.075, head: 0.12, fireCone: 0.1, burst: [2, 4], pause: [0.45, 0.85], view: 40, fov: 100, strafe: false, crouch: false, retreatHP: 0, sprayErr: 0.012 },
  normal: { label: 'Normal', reaction: 0.42, turn: 5, aimError: 0.042, head: 0.25, fireCone: 0.065, burst: [3, 6], pause: [0.3, 0.55], view: 55, fov: 110, strafe: true, crouch: false, retreatHP: 30, sprayErr: 0.008 },
  hard: { label: 'Difícil', reaction: 0.27, turn: 8, aimError: 0.025, head: 0.4, fireCone: 0.045, burst: [3, 8], pause: [0.2, 0.4], view: 70, fov: 120, strafe: true, crouch: true, retreatHP: 35, sprayErr: 0.005 },
  expert: { label: 'Expert', reaction: 0.17, turn: 12, aimError: 0.013, head: 0.55, fireCone: 0.035, burst: [4, 10], pause: [0.15, 0.3], view: 85, fov: 130, strafe: true, crouch: true, retreatHP: 40, sprayErr: 0.003 },
};

const ROUTES = {
  lane: ['laneM', 'lane0'],
  mid: ['midR', 'ctE'],
  corridor: ['corM', 'cor0', 'conS'],
  platform: ['stairsBot', 'stairsTop', 'plat0'],
};

const BOT_SPEED = 4.6;
const tmpV = new THREE.Vector3();
const tmpE = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpD = new THREE.Vector3();

let thinkPhase = 0;

export class BotController {
  /**
   * @param {import('../combat/Combatant.js').Combatant} actor
   * @param {{ arena: import('../world/Arena.js').Arena, combat: import('../combat/CombatSystem.js').CombatSystem, audio: import('../audio/AudioManager.js').AudioManager, fx: import('../fx/Effects.js').Effects }} ctx
   * @param {keyof typeof DIFFICULTY} difficulty
   * @param {keyof typeof ROUTES} role
   * @param {import('./BotModel.js').BotModel} model
   */
  constructor(actor, ctx, difficulty, role, model) {
    this.actor = actor;
    this.ctx = ctx;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.role = role;
    this.model = model;
    this.recoil = new RecoilSystem();
    /** @type {'objective'|'engage'|'cover'|'chase'|'hold'|'idle'} */
    this.state = 'objective';
    this.thinkTimer = (thinkPhase++ % 8) * 0.0125;
    /** @type {import('../combat/Combatant.js').Combatant|null} */
    this.target = null;
    this.seenSince = 0;
    this.lastSeenPos = new THREE.Vector3();
    this.lastSeenTime = -99;
    this.time = 0;
    /** @type {number[]} */
    this.path = [];
    this.pathGoal = new THREE.Vector3();
    /** @type {THREE.Vector3|null} */
    this.moveTarget = null;
    this.routeIndex = 0;
    this.nextFire = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.reloadTimer = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.crouchWant = false;
    this.aimOff = new THREE.Vector3();
    this.aimOffTimer = 0;
    this.focus = 0;
    this.aimHead = false;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    this.coverTimer = 0;
    this.holdPoint = new THREE.Vector3();
    this.frozen = false;
    this.speed = 0;
    this.footDist = 0;
    this.respawnTimer = 0;
    /** @type {number|undefined} */
    this.desiredYaw = undefined;
    /** @type {{ x: number, z: number, low: boolean }|null} */
    this.coverPoint = null;
  }

  get weapon() {
    return this.actor.weapon;
  }

  /** Reinicia o "cérebro" no começo do round / ao renascer. */
  reset() {
    this.state = 'objective';
    this.target = null;
    this.path = [];
    this.moveTarget = null;
    this.routeIndex = 0;
    this.seenSince = 0;
    this.lastSeenTime = -99;
    this.burstLeft = 0;
    this.reloadTimer = 0;
    this.recoil.reset();
    this.focus = 0;
    this.crouchWant = false;
    this.actor.crouching = false;
  }

  /** Ouviu um tiro inimigo (CombatSystem.onShotHeard). */
  hear(shooter, pos) {
    const a = this.actor;
    if (!a.alive || shooter.team === a.team || shooter.isTarget) return;
    const d = a.body.pos.distanceTo(pos);
    if (d > 38) return;
    if (this.state !== 'engage') {
      this.lastSeenPos.copy(shooter.body.pos);
      this.lastSeenTime = this.time;
      if (this.state !== 'cover') this.setState('chase');
    }
  }

  /** Levou dano (CombatSystem.onDamage). */
  hurt(attacker) {
    const a = this.actor;
    if (!a.alive || !attacker || attacker.team === a.team) return;
    this.lastSeenPos.copy(attacker.body.pos);
    this.lastSeenTime = this.time;
    if (this.state !== 'engage') {
      // não sabe de onde veio: vira para o atacante e, se ferido, procura cobertura
      const dx = attacker.body.pos.x - a.body.pos.x;
      const dz = attacker.body.pos.z - a.body.pos.z;
      this.desiredYaw = Math.atan2(-dx, -dz);
      if (a.health < 60 && this.findCover(attacker.body.pos)) this.setState('cover');
      else this.setState('chase');
    } else if (a.health < this.diff.retreatHP && Math.random() < 0.6 && this.findCover(attacker.body.pos)) {
      this.setState('cover');
    }
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.path = [];
    this.moveTarget = null;
    if (s === 'cover') this.coverTimer = 1.2 + Math.random() * 1.5;
  }

  /**
   * @param {number} dt
   * @param {import('../combat/Combatant.js').Combatant[]} actors
   * @param {{ canMove: boolean, canShoot: boolean }} rules
   */
  update(dt, actors, rules) {
    const a = this.actor;
    this.time += dt;
    this.recoil.update(dt, this.weapon.def);
    if (!a.alive) {
      this.model.update(dt, { x: a.body.pos.x, y: a.body.pos.y, z: a.body.pos.z, yaw: a.yaw, pitch: 0, speed: 0, crouch: 0, alive: false });
      return;
    }
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.1;
      this.think(actors, rules);
    }
    this.updateAimAndFire(dt, rules);
    this.updateMovement(dt, rules);
    this.model.setWeapon(this.weapon.def.type, null);
    this.model.update(dt, {
      x: a.body.pos.x,
      y: a.body.pos.y,
      z: a.body.pos.z,
      yaw: a.yaw,
      pitch: a.pitch,
      speed: this.speed,
      crouch: a.crouch,
      alive: true,
    });
  }

  /** Percepção + decisão (10 Hz). */
  think(actors, rules) {
    const a = this.actor;
    const eye = a.eye(tmpE);
    const fwdX = -Math.sin(a.yaw);
    const fwdZ = -Math.cos(a.yaw);
    const cosFov = Math.cos(((this.diff.fov / 2) * Math.PI) / 180);
    let best = null;
    let bestD = Infinity;
    for (const o of actors) {
      if (!o.alive || o.team === a.team || o.isTarget) continue;
      const dx = o.body.pos.x - a.body.pos.x;
      const dz = o.body.pos.z - a.body.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > this.diff.view) continue;
      const inFov = d < 4 || (dx * fwdX + dz * fwdZ) / (d || 1) > cosFov || o === this.target;
      if (!inFov) continue;
      // linha de visão para cabeça OU peito
      const oy = o.body.pos.y;
      const visible =
        this.ctx.arena.collision.segmentClear(eye.x, eye.y, eye.z, o.body.pos.x, oy + o.eyeHeight(), o.body.pos.z) ||
        this.ctx.arena.collision.segmentClear(eye.x, eye.y, eye.z, o.body.pos.x, oy + 1.1 - o.crouch * 0.35, o.body.pos.z);
      if (visible && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best;
        this.seenSince = this.time;
        this.focus = 0;
        this.aimHead = Math.random() < this.diff.head;
      }
      this.lastSeenPos.copy(best.body.pos);
      this.lastSeenTime = this.time;
      if (this.state !== 'cover' || this.coverTimer <= 0) this.state = 'engage';
      // ferido e em desvantagem: recua para cobertura
      if (a.health < this.diff.retreatHP && best.health > a.health && Math.random() < 0.15 && this.findCover(best.body.pos)) {
        this.setState('cover');
      }
    } else {
      if (this.state === 'engage') {
        this.target = null;
        // perdeu de vista: recarrega se precisar, senão persegue
        if (this.weapon.ammo < this.weapon.def.mag * 0.35 && this.weapon.def.type !== 'knife') this.startReload();
        this.setState(this.time - this.lastSeenTime < 8 ? 'chase' : 'objective');
      }
    }

    if (this.state === 'chase' && this.time - this.lastSeenTime > 7) this.setState('objective');
    if (this.state === 'engage' && this.weapon.ammo === 0 && this.weapon.def.type !== 'knife') {
      this.startReload();
      if (this.target && this.findCover(this.target.body.pos)) this.setState('cover');
    }
    // sem munição nenhuma na primária: troca para a secundária
    if (a.slot === 'primary' && this.weapon.ammo === 0 && this.weapon.reserve === 0 && a.weapons.secondary) a.slot = 'secondary';

    // fora de combate com pente baixo: recarrega
    if (this.state !== 'engage' && this.reloadTimer <= 0 && this.weapon.def.type !== 'knife' && this.weapon.ammo < this.weapon.def.mag * 0.6) this.startReload();

    // objetivos de movimento
    if (!rules.canMove) return;
    if (this.state === 'objective') this.planObjective();
    else if (this.state === 'chase') this.planTo(this.lastSeenPos);
    else if (this.state === 'cover') {
      this.coverTimer -= 0.1;
      if (this.coverTimer <= 0 && this.reloadTimer <= 0) this.setState(this.time - this.lastSeenTime < 6 ? 'chase' : 'objective');
    }
  }

  planObjective() {
    const a = this.actor;
    const nav = this.ctx.arena.nav;
    const route = ROUTES[this.role];
    const ids = this.ctx.arena.navIds;
    const side = a.team === 0 ? -1 : 1;
    if (this.routeIndex < route.length) {
      const name = route[this.routeIndex];
      const id = ids.get(side > 0 ? name : ids.has('~' + name) ? '~' + name : name);
      const n = nav.nodes[/** @type {number} */ (id)];
      tmpT.set(n.x, n.y, n.z);
      if (Math.hypot(a.body.pos.x - n.x, a.body.pos.z - n.z) < 1.6) this.routeIndex++;
      else this.planTo(tmpT);
      return;
    }
    // chegou: segura um ponto dentro do Uplink
    if (this.state === 'objective') {
      const d = Math.hypot(a.body.pos.x - this.holdPoint.x, a.body.pos.z - this.holdPoint.z);
      if (this.holdPoint.lengthSq() === 0 || (d < 0.6 && Math.random() < 0.03)) {
        for (let i = 0; i < 8; i++) {
          const ang = Math.random() * Math.PI * 2;
          const r = 0.8 + Math.random() * (UPLINK.radius - 1.4);
          const x = UPLINK.x + Math.cos(ang) * r;
          const z = UPLINK.z + Math.sin(ang) * r;
          if (!this.ctx.arena.collision.overlaps(x - 0.35, 0.05, z - 0.35, x + 0.35, 1.7, z + 0.35)) {
            this.holdPoint.set(x, 0, z);
            break;
          }
        }
      }
      this.planTo(this.holdPoint);
    }
  }

  /**
   * Caminho até um ponto: direto se houver linha livre na altura da cintura,
   * senão pelo grafo de navegação (só recalcula se o destino mudou).
   * @param {THREE.Vector3} goal
   */
  planTo(goal) {
    const a = this.actor;
    const col = this.ctx.arena.collision;
    const p = a.body.pos;
    const sameGoal = this.pathGoal.distanceToSquared(goal) < 1;
    if (Math.abs(goal.y - p.y) < 0.5 && col.segmentClear(p.x, p.y + 0.5, p.z, goal.x, goal.y + 0.5, goal.z) &&
        col.segmentClear(p.x + 0.25, p.y + 0.5, p.z, goal.x + 0.25, goal.y + 0.5, goal.z) &&
        col.segmentClear(p.x - 0.25, p.y + 0.5, p.z, goal.x - 0.25, goal.y + 0.5, goal.z)) {
      this.path = [];
      this.moveTarget = (this.moveTarget || new THREE.Vector3()).copy(goal);
      this.pathGoal.copy(goal);
      return;
    }
    if (sameGoal && this.path.length) return;
    const nav = this.ctx.arena.nav;
    const s = nav.nearest(p.x, p.y, p.z);
    const g = nav.nearest(goal.x, goal.y, goal.z);
    this.path = nav.path(s, g);
    this.pathGoal.copy(goal);
    this.advancePath();
  }

  advancePath() {
    const nav = this.ctx.arena.nav;
    if (!this.path.length) {
      this.moveTarget = (this.moveTarget || new THREE.Vector3()).copy(this.pathGoal);
      return;
    }
    const n = nav.nodes[this.path[0]];
    this.moveTarget = (this.moveTarget || new THREE.Vector3()).set(n.x, n.y, n.z);
  }

  /**
   * Ponto de cobertura escondido da ameaça, perto do bot.
   * @param {THREE.Vector3} threat
   */
  findCover(threat) {
    const a = this.actor;
    const col = this.ctx.arena.collision;
    let best = null;
    let bestScore = Infinity;
    for (const c of this.ctx.arena.coverPoints) {
      const d = Math.hypot(c.x - a.body.pos.x, c.z - a.body.pos.z);
      if (d > 14) continue;
      const dt = Math.hypot(c.x - threat.x, c.z - threat.z);
      if (dt < 5) continue;
      const hideY = c.low ? 0.95 : 1.5;
      if (col.segmentClear(threat.x, threat.y + 1.5, threat.z, c.x, hideY, c.z)) continue;
      const score = d - dt * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) return false;
    this.coverPoint = best;
    this.planTo(tmpV.set(best.x, 0, best.z));
    return true;
  }

  startReload() {
    const w = this.weapon;
    if (this.reloadTimer > 0 || w.reserve <= 0 || w.ammo >= w.def.mag || w.def.type === 'knife') return;
    this.reloadTimer = w.def.reloadTime;
  }

  /** Mira e disparo — todo frame. */
  updateAimAndFire(dt, rules) {
    const a = this.actor;
    const w = this.weapon;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const take = Math.min(w.def.mag - w.ammo, w.reserve);
        w.ammo += take;
        w.reserve -= take;
      }
    }
    this.nextFire -= dt;
    this.burstPause -= dt;
    const t = this.target;
    let wantYaw = this.desiredYaw ?? a.yaw;
    let wantPitch = 0;
    if (this.state === 'engage' && t && t.alive) {
      // ponto de mira: cabeça ou peito + erro que diminui com o "foco"
      this.focus = Math.min(1, this.focus + dt / 1.6);
      this.aimOffTimer -= dt;
      if (this.aimOffTimer <= 0) {
        this.aimOffTimer = 0.25 + Math.random() * 0.35;
        this.aimOff.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.7, Math.random() - 0.5).multiplyScalar(2);
      }
      const eye = a.eye(tmpE);
      const ty = t.body.pos.y + (this.aimHead ? t.eyeHeight() + 0.02 : 1.25 - t.crouch * 0.35);
      const dist = Math.hypot(t.body.pos.x - eye.x, t.body.pos.z - eye.z);
      const err = this.diff.aimError * (1.6 - this.focus) * dist;
      // movimento do alvo aumenta o erro (é mais difícil acompanhar)
      const tSpeed = Math.hypot(t.body.vel.x, t.body.vel.z);
      const e = err * (1 + tSpeed * 0.12);
      const tx = t.body.pos.x + this.aimOff.x * e * 0.5;
      const tz = t.body.pos.z + this.aimOff.z * e * 0.5;
      const tyy = ty + this.aimOff.y * e * 0.5;
      wantYaw = Math.atan2(-(tx - eye.x), -(tz - eye.z));
      wantPitch = Math.atan2(tyy - eye.y, Math.hypot(tx - eye.x, tz - eye.z));
      this.desiredYaw = wantYaw;
    } else if (this.moveTarget && this.state !== 'engage') {
      const dx = this.moveTarget.x - a.body.pos.x;
      const dz = this.moveTarget.z - a.body.pos.z;
      if (dx * dx + dz * dz > 0.25) wantYaw = Math.atan2(-dx, -dz);
      this.desiredYaw = wantYaw;
      if (this.state === 'chase' || this.state === 'cover') {
        // procurando: olha para onde viu o inimigo pela última vez quando perto
        const ldx = this.lastSeenPos.x - a.body.pos.x;
        const ldz = this.lastSeenPos.z - a.body.pos.z;
        if (Math.hypot(ldx, ldz) < 18 && this.time - this.lastSeenTime < 6) wantYaw = Math.atan2(-ldx, -ldz);
      }
    }
    // gira com velocidade angular limitada
    let dy = wantYaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const maxTurn = this.diff.turn * dt * (this.state === 'engage' ? 1 : 0.6);
    a.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy));
    a.yaw = Math.atan2(Math.sin(a.yaw), Math.cos(a.yaw));
    a.pitch = damp(a.pitch, wantPitch, 8, dt);

    // atirar?
    if (!rules.canShoot || this.state !== 'engage' || !t || !t.alive) return;
    if (this.time - this.seenSince < this.diff.reaction) return;
    if (this.reloadTimer > 0 || this.nextFire > 0 || this.burstPause > 0) return;
    if (w.def.type === 'knife') return;
    if (w.ammo <= 0) {
      this.startReload();
      return;
    }
    const dist = a.body.pos.distanceTo(t.body.pos);
    const cone = this.diff.fireCone + 0.4 / Math.max(2, dist);
    if (Math.abs(dy) > cone) return;
    if (this.burstLeft <= 0) {
      const [b0, b1] = this.diff.burst;
      this.burstLeft = w.def.auto ? b0 + Math.floor(Math.random() * (b1 - b0 + 1)) : 1;
    }
    this.fire();
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      const [p0, p1] = this.diff.pause;
      this.burstPause = w.def.auto ? p0 + Math.random() * (p1 - p0) : w.def.interval * (1.3 + Math.random() * 1.5) * (this.diff === DIFFICULTY.easy ? 2 : 1);
    }
  }

  fire() {
    const a = this.actor;
    const w = this.weapon;
    const def = w.def;
    w.ammo--;
    this.nextFire = def.interval;
    const eye = a.eye(tmpE);
    const dir = a.aimDir(tmpD);
    // dispersão da arma + erro de spray que cresce com o tiro na rajada
    const spread =
      this.recoil.spread(def, { speed: this.speed, grounded: a.body.grounded, crouching: a.crouching, sprinting: false }) +
      this.recoil.shotIndex * this.diff.sprayErr;
    const r = spread * Math.sqrt(Math.random());
    const th = Math.random() * Math.PI * 2;
    const right = tmpV.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    dir.addScaledVector(right, Math.cos(th) * r);
    dir.y += Math.sin(th) * r;
    dir.normalize();
    this.model.root.updateMatrixWorld(true);
    const muzzle = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    this.ctx.combat.fireHitscan(a, eye, dir, def, muzzle);
    this.recoil.addShot(def, Math.random);
    this.ctx.fx.muzzle(muzzle);
    this.ctx.audio.shot(def.sound, a.body.pos);
    this.model.fireKick();
  }

  /** Movimento — todo frame. */
  updateMovement(dt, rules) {
    const a = this.actor;
    const b = a.body;
    let wx = 0;
    let wz = 0;
    let speed = BOT_SPEED * this.weapon.def.moveMult;
    a.crouching = false;

    if (rules.canMove) {
      if (this.state === 'engage' && this.target) {
        const dist = b.pos.distanceTo(this.target.body.pos);
        // longe: para (precisão) e, no difícil+, agacha; perto: strafe
        if (dist > 16 || !this.diff.strafe) {
          a.crouching = this.diff.crouch && dist > 16 && this.reloadTimer <= 0;
        } else {
          this.strafeTimer -= dt;
          if (this.strafeTimer <= 0) {
            this.strafeTimer = 0.35 + Math.random() * 0.6;
            this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          }
          const rx = Math.cos(a.yaw) * this.strafeDir;
          const rz = -Math.sin(a.yaw) * this.strafeDir;
          if (this.ctx.arena.collision.segmentClear(b.pos.x, b.pos.y + 0.5, b.pos.z, b.pos.x + rx * 1.2, b.pos.y + 0.5, b.pos.z + rz * 1.2)) {
            wx = rx;
            wz = rz;
            speed *= 0.75;
          } else this.strafeDir *= -1;
          // aproximação com faca/curta distância? não: mantém distância
        }
      } else if (this.moveTarget) {
        const dx = this.moveTarget.x - b.pos.x;
        const dz = this.moveTarget.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) {
          if (this.path.length) {
            this.path.shift();
            this.advancePath();
          } else if (this.state === 'cover') {
            a.crouching = !!this.coverPoint?.low;
          }
        } else {
          wx = dx / d;
          wz = dz / d;
        }
        if (this.state === 'cover' && this.coverPoint && Math.hypot(this.coverPoint.x - b.pos.x, this.coverPoint.z - b.pos.z) < 0.9) {
          a.crouching = !!this.coverPoint.low;
        }
      }
    }
    if (a.crouching) speed *= 0.5;

    // aceleração simples
    const ax = wx * speed;
    const az = wz * speed;
    b.vel.x = damp(b.vel.x, ax, b.grounded ? 12 : 2, dt);
    b.vel.z = damp(b.vel.z, az, b.grounded ? 12 : 2, dt);
    b.vel.y -= 16 * dt;
    b.height = a.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;
    a.crouch = damp(a.crouch, a.crouching ? 1 : 0, 10, dt);
    const px = b.pos.x;
    const pz = b.pos.z;
    this.ctx.arena.collision.moveBody(b, dt);
    const moved = Math.hypot(b.pos.x - px, b.pos.z - pz);
    this.speed = moved / Math.max(dt, 1e-4);

    // travado? pula e recalcula a rota
    if ((wx || wz) && this.speed < 0.6) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.6 && b.grounded) {
        b.vel.y = 5.2;
        b.grounded = false;
      }
      if (this.stuckTimer > 1.4) {
        this.stuckTimer = 0;
        this.path = [];
        this.pathGoal.set(9999, 0, 9999);
      }
    } else this.stuckTimer = 0;

    // passos audíveis (só correndo, como o jogador)
    if (b.grounded && !a.crouching && this.speed > 2.5) {
      this.footDist += moved;
      if (this.footDist > 2.3) {
        this.footDist = 0;
        this.ctx.audio.footstep('concrete', b.pos, 1);
      }
    }
    if (b.pos.y < -6) b.pos.set(0, 1, 0);
  }
}
