// Simulação do combate: naves (IA + capitais + o jogador como proxy),
// projéteis, mísseis, contramedidas, dano, mortes, e o desenho de tudo
// (raios HDR, rastros de motor, fumaça). Não conhece batalhas nem roteiro —
// isso é do battle.js; não conhece input — isso é do player.js.
import * as THREE from 'three/webgpu';
import { CLASS_STATS, MISSILES, SHIP_BUDGET, BOLT_BUDGET } from './config.js';
import { Relations } from './relations.js';
import { Combatant, PlayerProxy } from './ship.js';
import { FighterAI } from './ai.js';
import { CapitalCtl } from './capital.js';
import { Projectiles } from './weapons.js';
import { MissileSystem } from './missiles.js';
import { BoltBatch } from './render/bolts.js';
import { RibbonBatch } from './render/ribbons.js';
import { leadPoint, lookQuat } from './math.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sun = new THREE.Vector3();
const STEP = 1 / 60;

export class Sim {
  constructor(ctx) {
    this.ctx = ctx;
    this.seed = 2387;
    this._r = new ctx.Rng(this.seed);
    this.rand = () => this._r.next();
    this.now = 0; this.renderNow = 0;
    this.quiet = false;
    this.relations = new Relations();
    this.ships = [];
    this.player = new PlayerProxy(this);
    this.playerTarget = null;
    this.nextId = 1;
    this.lastChatter = -100;
    this.capitalBias = 2.2;
    const q = ctx.quality?.name || 'high';
    this.budget = SHIP_BUDGET[q] || 30;
    this.fx = null;
    try {
      this.fx = {
        bolts: new BoltBatch(ctx, BOLT_BUDGET[q] || 600),
        smoke: new RibbonBatch(ctx, { trails: q === 'mobile' ? 24 : 48, points: q === 'mobile' ? 28 : 40, mode: 'smoke' }),
        puffs: new RibbonBatch(ctx, { trails: q === 'mobile' ? 16 : 40, points: 3, mode: 'smoke' }),
        engineTrails: new RibbonBatch(ctx, { trails: this.budget + 8, points: q === 'mobile' ? 14 : 22, mode: 'glow' }),
      };
    } catch (e) { this.err('fx', e); this.fx = null; }
    this.projectiles = new Projectiles(this, BOLT_BUDGET[q] || 600);
    this.missiles = new MissileSystem(this);
    this._comb = []; this._combStep = -1; this.stepN = 0;
    this.listeners = [];
  }

  err(where, e) { this.ctx.errors?.push(`combat ${where}: ${e?.stack || e}`); console.error('[combat]', where, e); }
  emit(name, data) { try { this.ctx.bus.emit(name, data); } catch (e) { this.err('emit ' + name, e); } }
  near(pos, d) { return this.ctx.player.camWorld.distanceTo(pos) < d; }
  missileDef(kind) { return MISSILES[kind] || MISSILES.ir; }

  // ─── naves ─────────────────────────────────────────────────────────────
  /**
   * Cria um combatente. opts: { quat, vel, ai (obj|false), name, callsign,
   * battle, side, toughness, hull, weapons, missiles, boardable, disableOnly,
   * tags, seed, launch (capital), passive, throttle, invulnerable }
   */
  spawn(faction, classId, pos, opts = {}) {
    const small = ['fighter', 'interceptor'].includes(classId);
    if (small && this.ships.filter((s) => !s.capital).length >= this.budget && !opts.force) return null;
    const s = new Combatant(this, {
      id: opts.id || `cb${this.nextId++}`, faction, classId, pos: pos.clone(), quat: opts.quat || (opts.dir ? lookQuat(opts.dir, opts.up) : new THREE.Quaternion()),
      vel: opts.vel, throttle: opts.throttle, name: opts.name, callsign: opts.callsign, battle: opts.battle, side: opts.side,
      toughness: opts.toughness, hull: opts.hull, weapons: opts.weapons, missiles: opts.missiles, boardable: opts.boardable, disableOnly: opts.disableOnly,
      tags: opts.tags, seed: opts.seed ?? this.nextId, lite: opts.lite, shadows: opts.shadows, invulnerable: opts.invulnerable, paint: opts.paint, shieldMul: opts.shieldMul,
    });
    if (!opts.vel) s.vel.copy(s.fwd(_a)).multiplyScalar(s.stats.speed * (opts.throttle ?? 0.7));
    if (CLASS_STATS[s.classId].capital) new CapitalCtl(this, s, opts);
    else if (opts.ai !== false) new FighterAI(s, this, opts.ai || {});
    this.ships.push(s);
    this._combStep = -1;
    if (!this.quiet) this.emit('combat:spawn', { id: s.eventId, faction, classId: s.classId, pos: s.pos.clone() });
    return s;
  }

  /** Naves vivas + o jogador (cacheado por passo). */
  combatants() {
    if (this._combStep === this.stepN) return this._comb;
    this._comb.length = 0;
    for (const s of this.ships) if (s.alive && s.state !== 'dead') this._comb.push(s);
    if (this.player.alive) this._comb.push(this.player);
    this._combStep = this.stepN;
    return this._comb;
  }
  colliders() { return this.combatants(); }
  attackers(o) { let n = 0; for (const s of this.ships) if (s.ai?.target === o) n++; return n; }
  anyHostileNear(s, r) { for (const o of this.combatants()) if (o.alive && this.relations.shipsHostile(s, o) && o.pos.distanceTo(s.pos) < r) return true; return false; }
  byId(id) { return id === 'player' ? this.player : this.ships.find((s) => s.id === id || s.eventId === id) || null; }

  /** Altitude/“cima” do corpo celeste mais próximo (desvio de planetas). */
  ground(pos) {
    const sys = this.ctx.universe.system;
    if (!sys) return null;
    let best = null, ba = Infinity;
    for (const b of sys.bodies) {
      const alt = pos.distanceTo(b.pos) - b.radius;
      if (alt < ba) { ba = alt; best = b; }
    }
    if (!best || ba > 20000) return null;
    const g = this._g || (this._g = { alt: 0, up: new THREE.Vector3(), body: null });
    g.alt = ba; g.body = best; g.up.copy(pos).sub(best.pos).normalize();
    return g;
  }

  // ─── dano ──────────────────────────────────────────────────────────────
  /**
   * Aplica dano. opts: { pos (mundo), from (combatente), def (arma), turret, normal, splash }
   * Retorna { shield: bool } ou null.
   */
  damage(t, amount, opts = {}) {
    if (!t || !t.alive || t.state === 'dead') return null;
    const from = opts.from || null, def = opts.def || {};
    // rancor: neutros atacados pelo jogador passam a revidar
    if (from?.isPlayer && !t.isPlayer && !this.relations.shipsHostile(t, from)) {
      t.friendlyHits = (t.friendlyHits || 0) + 1;
      if (t.friendlyHits > (t.faction === 'hegemonia' && t.battle?.opening ? 3 : 2)) {
        t.grudges.add('player');
        this.emit('combat:aggro', { id: t.eventId, faction: t.faction, by: 'player' });
      }
      this.emit('combat:friendlyFire', { target: t.eventId, faction: t.faction, count: t.friendlyHits });
    }
    if (from) { t.lastHitBy = from; t.lastHitT = this.now; }
    // jogador: o voo aplica (escudo por quadrante); o combate só emite
    if (t.isPlayer) {
      const dmg = amount * (def.kind === 'ion' ? 0.6 : 1);
      this.emit('ship:hit', { target: 'player', owner: from?.eventId || null, damage: dmg, pos: opts.pos ? opts.pos.clone() : null, shield: (this.player.shieldFrac ?? 0) > 0.05, normal: opts.normal?.clone?.() });
      return { shield: (this.player.shieldFrac ?? 0) > 0.05 };
    }
    if (t.invulnerable) return { shield: true };
    if (opts.turret && t.capital) {
      t.capital.damageTurret(opts.turret, amount * (def.hullMul ?? 1), from);
      if (opts.pos && !this.quiet) this.emit('ship:hit', { target: t.eventId, owner: from?.eventId || null, damage: amount, pos: opts.pos.clone(), shield: false, turret: opts.turret.tur?.id });
      return { shield: false };
    }
    let shieldHit = false;
    let dmg = amount;
    if (t.shield > 0) {
      const sMul = def.shieldMul ?? 1;
      const absorb = Math.min(t.shield, dmg * sMul);
      t.shield -= absorb;
      dmg = Math.max(0, dmg - absorb / sMul);
      shieldHit = true;
      t.shieldDelay = 3.5;
      if (opts.pos) {
        const fx = t.ensureShield();
        if (fx) { t.toLocal(opts.pos, _a); fx.hit(_a, Math.min(1, amount / 30)); }
      }
      if (t.shield <= 0) { t.shieldFx?.shatter(); this.emit('shield:down', { id: t.eventId, faction: t.faction }); }
    }
    if (dmg > 0) {
      t.hull -= dmg * (def.hullMul ?? 1);
      shieldHit = shieldHit && t.shield > 0;
      t.hitsTaken++;
      if (def.kind === 'ion' || def.disable) t.ion += amount * 2.5;
      if (t.ai && t.hullFrac < 0.75 && this.rand() < 0.08) t.ai.chat('hit');
    }
    t.shieldDelay = 3.5;
    if (opts.pos && !opts.splash) this.emit('ship:hit', { target: t.eventId, owner: from?.eventId || null, damage: amount, pos: opts.pos.clone(), shield: shieldHit, normal: opts.normal?.clone?.() });
    // desativação (abordável) ou morte
    if (t.state === 'ok' && t.boardable && (t.disableOnly || t.ion > t.hullMax * 0.6) && t.hull < t.hullMax * 0.25) this.disable(t, from);
    else if (t.hull <= 0) {
      if (t.state === 'disabled' && t.disableOnly) t.hull = 1;
      else this.die(t, from);
    }
    return { shield: shieldHit };
  }

  disable(t, from, opts = {}) {
    if (!t || t.state !== 'ok') return;
    if (opts.silent) {
      t.state = 'disabled'; t.shield = 0; t.ctl.throttle = 0; t.ctl.boost = false; t.throttle = 0;
      t.angRate.set((this.rand() - 0.5) * 0.04, (this.rand() - 0.5) * 0.04, (this.rand() - 0.5) * 0.1);
      return;
    }
    t.state = 'disabled';
    t.shield = 0; t.hull = Math.max(t.hull, t.hullMax * 0.05);
    t.ctl.throttle = 0; t.ctl.boost = false;
    t.spin = new THREE.Vector3((this.rand() - 0.5) * 0.08, (this.rand() - 0.5) * 0.08, (this.rand() - 0.5) * 0.2);
    t.angRate.copy(t.spin);
    this.explode(t.pos.clone().addScaledVector(t.up(_a), t.radius * 0.2), t.radius * 0.35, 'small', { vel: t.vel.clone() });
    this.emit('ship:disabled', { id: t.eventId, faction: t.faction, classId: t.classId, pos: t.pos.clone(), boardable: t.boardable, byPlayer: !!from?.isPlayer });
    if (from?.isPlayer) this.emit('notify', { text: `${t.label} DESATIVADA — APROXIME-SE PARA ABORDAR`, kind: 'info' });
    if (this.playerTarget === t) this.playerTarget = t; // continua como alvo (para abordar)
  }

  die(t, from) {
    if (t.state === 'dying' || t.state === 'dead') return;
    if (t.capital) { t.capital.die(from); return; }
    const small = t.classId === 'fighter' || t.classId === 'interceptor';
    t.killer = from;
    if (small && this.rand() < 0.5) {
      // descontrolado em chamas antes de explodir
      t.state = 'dying';
      t.dieT = 0.9 + this.rand() * 1.6;
      t.spin = new THREE.Vector3((this.rand() - 0.5) * 3, (this.rand() - 0.5) * 2, (this.rand() - 0.5) * 9);
      if (this.fx) t.smoke = this.fx.smoke.alloc({ life: 3.5, width: t.radius * 0.18, grow: 6, minDist: 4, color: [0.22, 0.21, 0.2], alpha: 0.9, heat: 1, seed: this.rand() });
      this.explode(t.pos.clone(), t.radius * 0.5, 'small', { vel: t.vel.clone() });
      if (t.ai) t.ai.chat('hit', true);
    } else this.finishDeath(t, from);
  }

  finishDeath(t, from = t.killer) {
    if (t.state === 'dead') return;
    t.state = 'dead';
    const pos = t.pos.clone();
    if (!t.capital) this.explode(pos, t.radius * (t.classId === 'fighter' || t.classId === 'interceptor' ? 2.2 : 2.8), 'ship', { vel: t.vel.clone().multiplyScalar(0.5) });
    this.emit('ship:destroyed', { id: t.eventId, faction: t.faction, classId: t.classId, pos, byPlayer: !!from?.isPlayer, size: t.radius * 2, battle: t.battle?.id || null });
    if (from?.ai) from.ai.chat('kill');
    if (from?.isPlayer) this.emit('notify', { text: `${t.label} ABATIDA`, kind: 'reward' });
    this.remove(t);
  }

  /**
   * Abordagem: emite 'board' e entrega para o sistema `foot` (se existir).
   * O casco e o interior continuam no mundo (ships.attachInterior) para a
   * luta a pé pelos corredores.
   */
  board(t) {
    if (!t || t.state !== 'disabled' || !t.boardable) return false;
    t.tags.add('abordada');
    const payload = { ship: t.eventId, classId: t.classId, faction: t.faction, pos: t.pos.clone(), quat: t.quat.clone(), instance: t.inst || null, combatant: t };
    this.emit('board', payload);
    const foot = this.ctx.services.foot;
    let ok = false;
    try { if (typeof foot?.board === 'function') ok = foot.board(payload) !== false; } catch (e) { this.err('foot.board', e); }
    if (!ok && !foot) this.emit('notify', { text: 'ABORDAGEM: ACOPLADO À ESCOTILHA (SISTEMA A PÉ INDISPONÍVEL)', kind: 'warn' });
    return ok;
  }

  /** Sai do combate por salto (fuga). */
  jumpOut(t) {
    if (!t.alive || t.state !== 'ok') return;
    const f = t.fwd(_a);
    this.projectiles.flash({ pos: t.pos.clone(), size: t.radius * 3, color: [0.55, 0.75, 1.0], life: 0.5, intensity: 24 });
    this.projectiles.flash({ pos: t.pos.clone().addScaledVector(f, t.radius * 4), size: t.radius * 6, color: [0.5, 0.7, 1.0], life: 0.7, intensity: 8, kind: 2 });
    this.emit('ship:jumpout', { id: t.eventId, faction: t.faction, pos: t.pos.clone() });
    this.remove(t);
  }

  remove(t) {
    // durante o passo a lista é limpa no fim (não mexe no array em iteração)
    if (!this.stepping) { const i = this.ships.indexOf(t); if (i >= 0) this.ships.splice(i, 1); }
    t.capital?.dispose();
    t.dispose();
    t.state = 'dead'; t.alive = false;
    if (this.playerTarget === t) this.playerTarget = null;
    this._combStep = -1;
  }

  /** Explosão (o sistema rendering desenha; reserva própria se ele faltar). */
  explode(pos, size, kind = 'ship', opts = {}) {
    if (!this.quiet || opts.force) this.emit('explosion', { pos: pos.clone(), size, kind, vel: opts.vel || null });
    if (!this.ctx.services.rendering) {
      this.projectiles.flash({ pos: pos.clone(), size: size * 1.4, color: [1.0, 0.6, 0.25], life: 0.9, intensity: 30 });
      this.projectiles.flash({ pos: pos.clone(), size: size * 2.2, color: [1.0, 0.5, 0.2], life: 1.2, intensity: 6, kind: 2 });
    }
    if (kind !== 'small' && this.player.alive) {
      const d = pos.distanceTo(this.player.pos);
      const a = size / Math.max(size, d) * (kind === 'capital' ? 2 : 1);
      if (a > 0.02 && !this.quiet) this.emit('shake', { amount: Math.min(0.8, a * 1.5), duration: 0.4 + a });
    }
  }

  flakSmoke(pos) {
    if (!this.fx) return;
    const tr = this.fx.puffs.alloc({ life: 2.2 + this.rand(), width: 4, grow: 3.2, minDist: 0.1, color: [0.32, 0.3, 0.29], alpha: 0.7, heat: 0.6, seed: this.rand() });
    if (!tr) return;
    _a.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(4);
    tr.push(_b.copy(pos).sub(_a), this.renderNow); tr.push(_b.copy(pos).add(_a), this.renderNow);
    tr.stop(this.renderNow);
  }

  /** Antecipação para um atirador (padrão: o jogador) contra `target`. */
  lead(target, speed = 1750, shooter = this.player) {
    if (!target || !shooter) return null;
    const p = leadPoint(shooter.pos, shooter.vel, target.pos, target.vel || _a.set(0, 0, 0), speed, new THREE.Vector3());
    const dir = p.clone().sub(shooter.pos);
    const dist = dir.length();
    dir.divideScalar(dist || 1);
    return { pos: p, dir, dist, time: dist / speed, localDir: shooter.dirToLocal ? shooter.dirToLocal(dir, new THREE.Vector3()) : null };
  }

  // ─── laço ──────────────────────────────────────────────────────────────
  step(dt) {
    this.now += dt; this.stepN++;
    this.player.sync(this.ctx);
    this._combStep = -1;
    this.stepping = true;
    try { this._stepShips(dt); } finally { this.stepping = false; }
    for (let i = this.ships.length - 1; i >= 0; i--) if (!this.ships[i].alive) this.ships.splice(i, 1);
  }

  _stepShips(dt) {
    for (const s of this.ships) {
      if (!s.alive) continue;
      if (s.state === 'dying' && !s.capital) {
        s.dieT -= dt;
        if (s.dieT <= 0) { this.finishDeath(s); continue; }
      }
      if (s.ai && s.state === 'ok') { s.ai.think(dt); s.ai.steer(dt); }
      if (s.capital) s.capital.step(dt);
      s.integrate(dt);
      // mísseis apontados para cá (avisos)
      s.incoming = null;
    }
    this.projectiles.step(dt);
    this.missiles.step(dt);
    for (let i = this.ships.length - 1; i >= 0; i--) if (!this.ships[i].alive) this.ships.splice(i, 1);
  }

  /** beforeDraw(): chamado depois de posicionar as naves e antes de desenhar (câmeras de cena). */
  frame(dt, alpha, beforeDraw = null) {
    const ctx = this.ctx;
    this.renderNow = this.now + alpha * STEP;
    for (const s of this.ships) {
      if (!s.alive) continue;
      s.frame(dt, alpha);
      if (s.state === 'dying' && s.smoke) s.smoke.push(s.renderPos, this.renderNow, 1);
      if (s.state === 'disabled') {
        s.sparkT -= dt;
        if (s.sparkT <= 0) {
          s.sparkT = 0.6 + this.rand() * 2.2;
          const r = ctx.services.rendering;
          const p = s.toWorld(_a.set((this.rand() - 0.5) * s.radius, (this.rand() - 0.2) * s.radius * 0.4, (this.rand() - 0.5) * s.length * 0.8), new THREE.Vector3());
          try { r?.particles?.sparks?.(p, null, 18, { speed: 18 }); } catch { /* sem partículas */ }
          this.projectiles.flash({ pos: p, size: 2.5, color: [0.5, 0.75, 1.0], life: 0.12, intensity: 16 });
        }
      }
    }
    this.missiles.frame(alpha);
    if (beforeDraw) { try { beforeDraw(); } catch (e) { this.err('beforeDraw', e); } }
    if (!this.fx) return;
    const origin = ctx.world.origin;
    // tudo é desenhado relativo à posição de câmera DESTE quadro
    origin.copy(ctx.player.camWorld);
    const B = this.fx.bolts;
    B.begin();
    this.projectiles.draw(B, origin, alpha, STEP);
    this.missiles.draw(B, origin, this.renderNow);
    // chamas de naves morrendo
    for (const s of this.ships) {
      if (s.state !== 'dying' || s.capital) continue;
      _a.copy(s.renderPos).sub(origin);
      const f = 0.7 + Math.sin(this.renderNow * 37 + s.radius) * 0.3;
      B.glow(_a, s.radius * 0.7 * f, 14 * f, 5 * f, 1.2 * f, 1);
    }
    B.end();
    // luz do sol na fumaça
    const rs = ctx.services.rendering?.sun;
    const U = this.fx.smoke.U;
    if (rs?.color) { U.sun.value.copy(rs.color).multiplyScalar(Math.min(3, (rs.intensity ?? 3) * 0.33)); }
    _sun.copy(origin).negate().normalize();
    for (const k of ['smoke', 'puffs', 'engineTrails']) {
      if (k !== 'engineTrails' && rs?.color) this.fx[k].U.sun.value.copy(U.sun.value);
      this.fx[k].update(this.renderNow, origin, _sun);
    }
  }

  /** Remove tudo (troca de sistema, fim de batalha geral). */
  clear() {
    for (const s of [...this.ships]) this.remove(s);
    this.projectiles.clear();
    this.missiles.clear();
    this.playerTarget = null;
  }

  dispose() {
    this.clear();
    if (this.fx) for (const k in this.fx) this.fx[k].dispose();
  }
}
