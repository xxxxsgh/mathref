// Traje EVA: integridade (vida), energia, O₂, temperatura externa, toxinas,
// radiação. Os perigos vêm do bioma do corpo (Universe.BIOMES.hazard), da hora
// do dia, do clima e da altitude; a proteção do traje gasta energia e,
// quando a energia acaba, o perigo passa a ferir. Emite player:damage e
// player:death; avisos por notify.
import * as THREE from 'three/webgpu';
import { clamp } from './util.js';

const _up = new THREE.Vector3(), _s = new THREE.Vector3();

export class Suit {
  constructor(ctx) {
    this.ctx = ctx;
    this.health = 1; this.energy = 1; this.o2 = 1;
    this.temp = 21; this.tox = 0; this.rad = 0;
    this.exposure = { cold: 0, heat: 0, toxic: 0, radiation: 0 };
    this.prot = 0;              // 0..1 carga dos escudos ambientais
    this.lastHit = 99; this.dead = false;
    this.breathable = true;
    this.shield = 1;            // escudo pessoal (absorve energia/cinético)
    this.shieldDelay = 0;
    this.warned = {};
    this.flashlight = false;
    this.env = { kind: 'clear', intensity: 0, body: null, inside: false };
    this.hitDir = new THREE.Vector3();
    this.hitT = 9;
    this.upgrades = { o2: 1, energy: 1, armor: 1, hazard: 1 };
  }

  /** Dano (0..1 da vida). type: kinetic|energy|heat|cold|toxic|radiation|fall */
  damage(amount, type = 'kinetic', dirLocal = null) {
    if (this.dead || amount <= 0) return;
    let a = amount;
    if (type === 'kinetic' || type === 'energy') {
      const absorb = Math.min(this.shield, a * 0.8);
      this.shield -= absorb; a -= absorb * 0.85;
      this.shieldDelay = 3.2;
      a /= this.upgrades.armor;
    }
    this.health = Math.max(0, this.health - a);
    this.lastHit = 0;
    if (dirLocal) { this.hitDir.copy(dirLocal); this.hitT = 0; }
    this.ctx.services.rendering?.setDamage?.(Math.min(1, a * 4 + 0.15));
    if (this.health <= 0) this.die(type);
  }
  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.ctx.bus.emit('player:death', { cause });
  }
  respawn() { this.dead = false; this.health = 1; this.shield = 1; this.o2 = Math.max(this.o2, 0.6); this.energy = Math.max(this.energy, 0.6); }
  refill() { this.o2 = 1; this.energy = 1; this.shield = 1; this.health = Math.max(this.health, 0.5); }

  /**
   * Passo de simulação. info = { body, worldPos, inside (abrigo/interior),
   * weather {kind,intensity}, jetting, sprinting, underwater }
   */
  step(dt, info) {
    if (this.dead) return;
    const ctx = this.ctx;
    this.lastHit += dt; this.hitT += dt;
    const b = info.body;
    const inside = !!info.inside;
    const hz = b?.hazard || { temp: 0, tox: 0, rad: 0 };
    // temperatura externa: bioma + dia/noite + clima + altitude
    let T = 21;
    let dayK = 0;
    if (b && !inside) {
      _up.copy(info.worldPos).sub(b.pos).normalize();
      _s.copy(ctx.universe.system.star.pos).sub(info.worldPos).normalize();
      const elev = Math.asin(clamp(_up.dot(_s), -1, 1));
      dayK = elev;
      T = (hz.temp >= 0 ? 18 + hz.temp * 110 : 18 + hz.temp * 95) + (elev > 0 ? elev * 22 : -14);
      const w = info.weather || {};
      if (w.kind === 'blizzard') T -= 25 * w.intensity;
      if (w.kind === 'sandstorm') T += 8 * w.intensity;
      if (w.kind === 'ash') T += 12 * w.intensity;
      if (w.kind === 'rain') T -= 6 * w.intensity;
      if (!b.atmosphere) T = elev > 0 ? 90 + hz.temp * 40 : -140;
      if (info.underwater) T = Math.min(T, 8);
    }
    this.temp = Math.round(T);
    this.dayElev = dayK;
    // toxinas e radiação
    const w = info.weather || {};
    this.tox = inside || !b ? 0 : clamp(hz.tox + (w.kind === 'acid' ? 0.4 * w.intensity : 0) + (w.kind === 'ash' ? 0.15 * w.intensity : 0), 0, 1);
    this.rad = inside || !b ? 0 : clamp(hz.rad + (w.kind === 'electric' ? 0.3 * w.intensity : 0), 0, 1);
    this.breathable = inside || (b && b.atmosphere && (b.type === 'lush' || b.type === 'ocean') && !info.underwater);
    // demanda dos sistemas de proteção
    const cold = clamp((-10 - T) / 80, 0, 1), heat = clamp((T - 50) / 70, 0, 1);
    const demand = (cold + heat) * 0.6 + this.tox * 0.7 + this.rad * 0.8;
    this.exposure.cold = cold; this.exposure.heat = heat; this.exposure.toxic = this.tox; this.exposure.radiation = this.rad;
    const drain = demand * 0.012 / this.upgrades.hazard + (this.flashlight ? 0.0015 : 0) + (info.sprinting ? 0.0006 : 0);
    if (inside) this.energy = Math.min(1, this.energy + dt * 0.05);
    else this.energy = Math.max(0, this.energy - drain * dt / this.upgrades.energy);
    // O₂: reserva de ~8 min fora de atmosfera respirável; recarrega ao respirar ar
    if (this.breathable) this.o2 = Math.min(1, this.o2 + dt * 0.03);
    else this.o2 = Math.max(0, this.o2 - dt / (480 * this.upgrades.o2) * (info.sprinting ? 1.6 : 1) * (info.jetting ? 1.3 : 1));
    // dano ambiental quando as reservas acabam
    if (this.energy <= 0 && demand > 0.05) {
      const type = this.rad > Math.max(this.tox, cold, heat) ? 'radiation' : this.tox > Math.max(cold, heat) ? 'toxic' : cold > heat ? 'cold' : 'heat';
      this.damage(demand * 0.02 * dt, type);
      if (this.lastHit < dt * 2) ctx.bus.emit('player:damage', { amount: demand * 0.02 * dt, type });
    }
    if (this.o2 <= 0) { this.damage(0.035 * dt, 'toxic'); }
    // regeneração
    if (this.lastHit > 6 && this.health < 1 && this.o2 > 0) this.health = Math.min(1, this.health + dt * 0.035);
    this.shieldDelay -= dt;
    if (this.shieldDelay <= 0 && this.energy > 0.02) this.shield = Math.min(1, this.shield + dt * 0.25);
    // avisos (uma vez por limiar)
    this.warn('o2', this.o2 < 0.25, 'OXIGÊNIO BAIXO — VOLTE À NAVE OU RESPIRE AR', 'warn');
    this.warn('energy', this.energy < 0.15 && demand > 0.05, 'ENERGIA DO TRAJE CRÍTICA — PROTEÇÃO FALHANDO', 'warn');
    this.warn('cold', cold > 0.5 && !inside, 'FRIO EXTREMO — AQUECIMENTO DO TRAJE ATIVO', 'info');
    this.warn('heat', heat > 0.5 && !inside, 'CALOR EXTREMO — RESFRIAMENTO DO TRAJE ATIVO', 'info');
    this.warn('tox', this.tox > 0.45 && !inside, 'ATMOSFERA TÓXICA — FILTROS SELADOS', 'info');
    this.warn('rad', this.rad > 0.45 && !inside, 'RADIAÇÃO ELEVADA — BLINDAGEM ATIVA', 'info');
  }
  warn(k, cond, text, kind) {
    if (cond && !this.warned[k]) { this.warned[k] = true; if (!this.ctx.shot) this.ctx.bus.emit('notify', { text, kind }); }
    else if (!cond) this.warned[k] = false;
  }

  serialize() { return { health: this.health, energy: this.energy, o2: this.o2, shield: this.shield, upgrades: this.upgrades }; }
  deserialize(d) { if (!d) return; Object.assign(this, { health: d.health ?? 1, energy: d.energy ?? 1, o2: d.o2 ?? 1, shield: d.shield ?? 1 }); if (d.upgrades) Object.assign(this.upgrades, d.upgrades); }
}
