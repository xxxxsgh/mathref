// Hostilidade entre facções (simétrica) + rancores individuais: uma nave
// neutra atacada pelo jogador passa a tratá-lo como hostil, mesmo que a
// facção dela não o seja.
import { DEFAULT_HOSTILE } from './config.js';

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class Relations {
  constructor() { this.reset(); }
  reset() {
    this.hostile = new Set(DEFAULT_HOSTILE.map(([a, b]) => key(a, b)));
    this.allied = new Set();
  }
  set(a, b, hostile) {
    if (a === b) return;
    const k = key(a, b);
    if (hostile) { this.hostile.add(k); this.allied.delete(k); } else this.hostile.delete(k);
  }
  setAllied(a, b, on) { const k = key(a, b); if (on) { this.allied.add(k); this.hostile.delete(k); } else this.allied.delete(k); }
  isHostile(a, b) { return a !== b && this.hostile.has(key(a, b)); }
  isAllied(a, b) { return a === b || this.allied.has(key(a, b)); }
  /** 'hostile' | 'friendly' | 'neutral' de `b` visto por `a`. */
  rel(a, b) { return this.isHostile(a, b) ? 'hostile' : this.isAllied(a, b) ? 'friendly' : 'neutral'; }
  /** Duas naves (Combatant) são inimigas? Considera rancores individuais. */
  shipsHostile(s, o) {
    if (s === o || !s || !o) return false;
    if (s.grudges.has(o.id) || o.grudges.has(s.id)) return true;
    return this.isHostile(s.faction, o.faction);
  }
  serialize() { return { h: [...this.hostile], a: [...this.allied] }; }
  deserialize(d) { if (!d) return; this.hostile = new Set(d.h || []); this.allied = new Set(d.a || []); }
}
