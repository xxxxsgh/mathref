/**
 * Lógica PURA de tiro e mira (sem three; testada em weapon.test.mjs):
 *
 *  - `pelletPattern(n, spread, rng)`: chumbos da escopeta — um padrão fixo
 *    (centro + 2 anéis, como um choque de verdade) com desvio aleatório
 *    pequeno; todo chumbo fica DENTRO do cone `spread` (rad).
 *  - `scopeSway(t, amp)`: balanço da luneta (figura de Lissajous com
 *    harmônicos incomensuráveis), em rad, limitado por ~amp.
 *  - `BreathHold`: segurar a respiração (Shift mirando com luneta): até
 *    `hold` s quase sem balanço; depois cansa (balanço maior por `tired` s)
 *    e o fôlego volta devagar.
 *  - `falloff(dist, def)`: multiplicador de dano por distância (linear entre
 *    o início e o fim da queda, com piso).
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Direções dos chumbos como deslocamentos angulares [x, y] (rad).
 * rng() ∈ [0,1). Padrão: 1 no centro, ~1/3 num anel interno (≈50% do cone),
 * o resto no anel externo (≈90%), girado aleatoriamente + jitter de 12%.
 */
export function pelletPattern(n, spread, rng = Math.random) {
  const out = [];
  if (n <= 0) return out;
  const rot = rng() * Math.PI * 2;
  const inner = n > 1 ? Math.max(1, Math.round((n - 1) / 3)) : 0;
  const outer = Math.max(0, n - 1 - inner);
  const push = (r, a) => {
    const jr = spread * 0.12 * Math.sqrt(rng());
    const ja = rng() * Math.PI * 2;
    let x = Math.cos(a) * r + Math.cos(ja) * jr;
    let y = Math.sin(a) * r + Math.sin(ja) * jr;
    const m = Math.hypot(x, y);
    if (m > spread) (x *= spread / m), (y *= spread / m);
    out.push([x, y]);
  };
  push(0, 0);
  for (let i = 0; i < inner; i++) push(spread * 0.48, rot + (i / inner) * Math.PI * 2);
  for (let i = 0; i < outer; i++) push(spread * 0.88, rot + 0.4 + (i / outer) * Math.PI * 2);
  return out;
}

/** Balanço da luneta em rad: { x, y } (|x|,|y| ≲ amp). */
export function scopeSway(t, amp = 1) {
  const x = Math.sin(t * 0.83) * 0.55 + Math.sin(t * 2.17 + 1.1) * 0.28 + Math.sin(t * 4.9 + 2.3) * 0.08;
  const y = Math.sin(t * 1.21 + 0.4) * 0.45 + Math.sin(t * 0.57 + 2.0) * 0.38 + Math.sin(t * 3.7 + 0.9) * 0.1;
  return { x: x * amp, y: y * amp };
}

/**
 * Fôlego: `update(dt, want)` devolve o multiplicador de balanço (1 normal,
 * ~0.12 segurando, ~2.2 cansado). `want` = Shift apertado mirando com luneta.
 */
export class BreathHold {
  constructor({ hold = 4.5, tired = 2.6, recover = 0.35 } = {}) {
    this.cfg = { hold, tired, recover };
    this.stamina = 1; // 1 = fôlego cheio
    this.holding = false;
    this.tired = 0; // s restantes de cansaço
    this.mult = 1;
    this.events = []; // 'hold' | 'release' | 'gasp' (consumidos por quem quiser tocar som)
  }
  reset() {
    this.stamina = 1;
    this.holding = false;
    this.tired = 0;
    this.mult = 1;
  }
  update(dt, want) {
    const C = this.cfg;
    const can = this.tired <= 0 && this.stamina > 0.05;
    if (want && can && !this.holding) {
      this.holding = true;
      this.events.push('hold');
    }
    if (this.holding && (!want || this.stamina <= 0)) {
      this.holding = false;
      if (this.stamina <= 0) {
        this.tired = C.tired;
        this.events.push('gasp');
      } else this.events.push('release');
    }
    if (this.holding) this.stamina = Math.max(0, this.stamina - dt / C.hold);
    else {
      this.tired = Math.max(0, this.tired - dt);
      if (this.tired <= 0) this.stamina = Math.min(1, this.stamina + dt * C.recover);
    }
    const target = this.holding ? 0.12 : this.tired > 0 ? 1 + 1.2 * (this.tired / C.tired) : 1;
    // transição suave (não "teleporta" a mira)
    this.mult += (target - this.mult) * (1 - Math.exp(-dt * (this.holding ? 6 : 3)));
    return this.mult;
  }
}

/** Multiplicador de dano por distância: def.falloff = [início, fim?, piso]. */
export function falloff(dist, def) {
  const f = def?.falloff || [9999, 1];
  if (f.length < 3) return dist > f[0] ? f[1] : 1;
  const [a, b, floor] = f;
  return 1 - (1 - floor) * clamp((dist - a) / Math.max(1e-6, b - a), 0, 1);
}
