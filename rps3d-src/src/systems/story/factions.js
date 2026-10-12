// Reputação independente por facção (−100 … +100) e matriz de hostilidade.
//
// services.factions = {
//   rep(f) → número · change(f, delta, motivo?) → novo valor · set(f, v)
//   standing(f) → {id, label, tier}   (Inimigo jurado … Herói)
//   hostile(a, b) → bool   (a/b: id de facção ou 'player')
//   all() → [{id, name, color, rep, standing}]
//   list, FACTIONS
// }
// Emite 'rep:change' {faction, delta, value, reason}. Quando o `combat`
// existe, sincroniza a hostilidade do jogador com ele.

export const TIERS = [
  { min: -100, id: 'jurado', label: 'Inimigo jurado' },
  { min: -60, id: 'hostil', label: 'Hostil' },
  { min: -25, id: 'desconfiado', label: 'Desconfiado' },
  { min: -5, id: 'neutro', label: 'Neutro' },
  { min: 15, id: 'cordial', label: 'Cordial' },
  { min: 40, id: 'aliado', label: 'Aliado' },
  { min: 75, id: 'heroi', label: 'Herói' },
];

/** Relações fixas entre facções de IA (independem do jogador). */
const BASE = {
  'hegemonia|frente': true,
  'hegemonia|corsarios': true,
  'frente|corsarios': false,
  'guilda|corsarios': true,
  'vigilantes|hegemonia': true,
  'vigilantes|corsarios': true,
  'vigilantes|frente': false,
  'vigilantes|guilda': false,
  'guilda|hegemonia': false,
  'guilda|frente': false,
};

export class Factions {
  constructor(ctx, FACTIONS) {
    this.ctx = ctx;
    this.FACTIONS = FACTIONS;
    this.list = Object.keys(FACTIONS);
    this.values = {};
    this.overrides = {};   // 'a|b' → bool (eventos da campanha: ex. vigilantes despertos)
    this.reset();
  }
  /** Início de campanha: Rafael ainda é piloto da Hegemonia. */
  reset() {
    this.values = { hegemonia: 60, frente: -30, corsarios: -40, guilda: 5, vigilantes: 0 };
    this.overrides = {};
  }
  rep(f) { return this.values[f] ?? 0; }
  set(f, v) {
    if (!(f in this.FACTIONS)) return 0;
    const old = this.rep(f);
    this.values[f] = Math.max(-100, Math.min(100, Math.round(v)));
    if (this.values[f] !== old) this.ctx.bus.emit('rep:change', { faction: f, delta: this.values[f] - old, value: this.values[f] });
    this.sync();
    return this.values[f];
  }
  change(f, delta, reason = '') {
    if (!(f in this.FACTIONS) || !delta) return this.rep(f);
    const old = this.rep(f);
    const v = Math.max(-100, Math.min(100, Math.round(old + delta)));
    this.values[f] = v;
    if (v !== old) {
      this.ctx.bus.emit('rep:change', { faction: f, delta: v - old, value: v, reason });
      const oldT = this.tierOf(old), newT = this.tierOf(v);
      if (oldT !== newT) this.ctx.bus.emit('notify', { text: `${this.FACTIONS[f].name}: ${newT.label}`, kind: v > old ? 'reward' : 'warn' });
    }
    this.sync();
    return v;
  }
  tierOf(v) { let t = TIERS[0]; for (const x of TIERS) if (v >= x.min) t = x; return t; }
  standing(f) { const v = this.rep(f); const t = this.tierOf(v); return { id: t.id, label: t.label, value: v }; }
  /** Hostilidade entre dois lados. 'player' usa a reputação. */
  hostile(a, b) {
    if (!a || !b || a === b) return false;
    const key = `${a}|${b}`, rkey = `${b}|${a}`;
    if (key in this.overrides) return this.overrides[key];
    if (rkey in this.overrides) return this.overrides[rkey];
    if (a === 'player' || b === 'player') {
      const f = a === 'player' ? b : a;
      if (f === 'vigilantes') return this.rep(f) < -20;
      return this.rep(f) <= -25;
    }
    return BASE[key] ?? BASE[rkey] ?? false;
  }
  setHostile(a, b, v) {
    this.overrides[`${a}|${b}`] = !!v;
    delete this.overrides[`${b}|${a}`];
    this.sync();
  }
  clearOverride(a, b) { delete this.overrides[`${a}|${b}`]; delete this.overrides[`${b}|${a}`]; this.sync(); }
  all() { return this.list.map((id) => ({ id, name: this.FACTIONS[id].name, color: this.FACTIONS[id].color, rep: this.rep(id), standing: this.standing(id) })); }
  /** Repassa a hostilidade do jogador ao combate (se existir). */
  sync() {
    const c = this.ctx.services.combat;
    if (!c?.setHostile) return;
    for (const f of this.list) {
      try { c.setHostile('player', f, this.hostile('player', f)); } catch { /* combate antigo */ }
    }
  }
  serialize() { return { values: { ...this.values }, overrides: { ...this.overrides } }; }
  deserialize(d) {
    if (!d) return;
    this.values = { ...this.values, ...(d.values || {}) };
    this.overrides = { ...(d.overrides || {}) };
  }
  api() {
    return {
      rep: (f) => this.rep(f), change: (f, d, r) => this.change(f, d, r), set: (f, v) => this.set(f, v),
      standing: (f) => this.standing(f), hostile: (a, b) => this.hostile(a, b), setHostile: (a, b, v) => this.setHostile(a, b, v),
      all: () => this.all(), list: this.list, FACTIONS: this.FACTIONS, TIERS,
    };
  }
}
