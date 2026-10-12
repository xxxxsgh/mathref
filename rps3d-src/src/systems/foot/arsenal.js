// Armas a pé: definições, munição/carregador/reserva, cadência, dispersão
// (movimento, mira, agachado, calor), recarga (inteira ou por cartucho),
// granadas e a lógica de disparo (projéteis de energia / raio de trilho).
import * as THREE from 'three/webgpu';
import { COLORS } from './beams.js';

export const WEAPONS = {
  rifle: { id: 'rifle', name: 'Rifle de Pulso', model: 'HV-9 Lança', mag: 32, reserve: 160, rpm: 600, auto: true, damage: 14, headMul: 1.8, spread: 0.007, aimSpread: 0.0012, moveSpread: 0.012, speed: 360, color: COLORS.blue, width: 0.07, len: 3.4, reload: 1.95, heat: 0.018, cool: 0.6, range: 450, noise: 55 },
  shotgun: { id: 'shotgun', name: 'Escopeta de Plasma', model: 'Brasa-12', mag: 8, reserve: 40, rpm: 80, auto: false, pellets: 10, damage: 10, headMul: 1.3, spread: 0.06, aimSpread: 0.042, moveSpread: 0.015, speed: 200, color: COLORS.orange, width: 0.1, len: 1.8, reload: 0.52, shellReload: true, heat: 0.12, cool: 0.5, range: 70, noise: 70, kind: 'pellet' },
  sniper: { id: 'sniper', name: 'Sniper de Trilho', model: 'Agulha', mag: 5, reserve: 25, rpm: 48, auto: false, damage: 150, headMul: 2.6, spread: 0.035, aimSpread: 0.0, moveSpread: 0.03, hitscan: true, color: COLORS.violet, width: 0.06, reload: 2.7, heat: 0.3, cool: 0.35, range: 2200, zoom: 0.26, noise: 90 },
  pistol: { id: 'pistol', name: 'Pistola de Íons', model: 'Faísca', mag: 14, reserve: 84, rpm: 380, auto: false, damage: 22, headMul: 2.0, spread: 0.008, aimSpread: 0.0022, moveSpread: 0.01, speed: 300, color: COLORS.green, width: 0.06, len: 2.4, reload: 1.35, heat: 0.03, cool: 0.8, range: 300, noise: 40 },
};
export const SLOTS = ['rifle', 'shotgun', 'sniper', 'pistol', 'multitool'];

export class Arsenal {
  constructor() {
    this.ammo = {}; this.reserve = {};
    for (const w of Object.values(WEAPONS)) { this.ammo[w.id] = w.mag; this.reserve[w.id] = w.reserve; }
    this.owned = new Set(['rifle', 'shotgun', 'sniper', 'pistol', 'multitool']);
    this.current = 'rifle';
    this.cooldown = 0;
    this.heat = {};
    this.grenades = 3; this.maxGrenades = 4;
    this.reloading = null; // {t, dur, weapon, shells}
    this.bloom = 0;        // dispersão acumulada por tiros seguidos
    this.triggerHeld = false;
    this.burst = 0;
  }
  get def() { return WEAPONS[this.current] || null; }
  isGun(id = this.current) { return !!WEAPONS[id]; }

  canFire() {
    const w = this.def;
    return !!w && this.cooldown <= 0 && this.ammo[w.id] > 0 && (!this.reloading || w.shellReload);
  }
  /** Dispersão atual (rad). */
  spread(ctrl, aimK) {
    const w = this.def; if (!w) return 0;
    let s = THREE.MathUtils.lerp(w.spread, w.aimSpread, aimK);
    s += w.moveSpread * Math.min(1, ctrl.speed / 5) * (1 - aimK * 0.6);
    if (!ctrl.grounded) s += w.moveSpread * 1.5;
    if (ctrl.crouching) s *= 0.7;
    s += this.bloom * (w.pellets ? 0.2 : 1) * 0.02 * (1 - aimK * 0.5);
    return s;
  }
  step(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - dt * 2.2);
    for (const k of Object.keys(this.heat)) this.heat[k] = Math.max(0, this.heat[k] - dt * (WEAPONS[k]?.cool || 0.5));
  }
  consume() {
    const w = this.def;
    this.ammo[w.id]--;
    this.cooldown = 60 / w.rpm;
    this.bloom = Math.min(1.5, this.bloom + (w.auto ? 0.12 : 0.3));
    this.heat[w.id] = Math.min(1, (this.heat[w.id] || 0) + w.heat);
  }
  needsReload() { const w = this.def; return !!w && this.ammo[w.id] < w.mag && this.reserve[w.id] > 0; }
  /** Começa a recarga; devolve a duração (0 = não precisa). */
  beginReload() {
    const w = this.def;
    if (!w || this.reloading || !this.needsReload()) return 0;
    if (w.shellReload) {
      const shells = Math.min(w.mag - this.ammo[w.id], this.reserve[w.id], 4);
      const dur = 0.35 + shells * w.reload + 0.3;
      this.reloading = { t: 0, dur, weapon: w.id, shells, inserted: 0 };
      return dur;
    }
    this.reloading = { t: 0, dur: w.reload, weapon: w.id };
    return w.reload;
  }
  stepReload(dt) {
    const r = this.reloading; if (!r) return false;
    r.t += dt;
    const w = WEAPONS[r.weapon];
    if (w.shellReload) {
      // insere cartuchos ao longo da animação
      const n = Math.min(r.shells, Math.floor(Math.max(0, r.t - 0.35) / w.reload + 0.4));
      while (r.inserted < n && this.reserve[w.id] > 0 && this.ammo[w.id] < w.mag) { this.ammo[w.id]++; this.reserve[w.id]--; r.inserted++; }
    }
    if (r.t >= r.dur) {
      if (!w.shellReload) {
        const need = w.mag - this.ammo[w.id];
        const take = Math.min(need, this.reserve[w.id]);
        this.ammo[w.id] += take; this.reserve[w.id] -= take;
      }
      this.reloading = null;
      return true;
    }
    return false;
  }
  cancelReload() { this.reloading = null; }
  addAmmo(id, n) { if (this.reserve[id] !== undefined) this.reserve[id] += n; }

  serialize() { return { ammo: this.ammo, reserve: this.reserve, grenades: this.grenades, current: this.current, owned: [...this.owned] }; }
  deserialize(d) {
    if (!d) return;
    Object.assign(this.ammo, d.ammo || {}); Object.assign(this.reserve, d.reserve || {});
    this.grenades = d.grenades ?? this.grenades;
    if (d.current) this.current = d.current;
    if (d.owned) this.owned = new Set(d.owned);
  }
}
