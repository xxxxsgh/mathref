/**
 * Aleatoriedade determinística.
 *
 * Tudo que precisa ser reproduzível (padrão de skin, desgaste, seed de item)
 * passa por aqui em vez de `Math.random`: dado o mesmo seed, o mesmo item
 * tem exatamente a mesma aparência em qualquer máquina e depois de recarregar
 * o save.
 */

/**
 * PRNG mulberry32 — 32 bits de estado, rápido e bom o bastante para jogo.
 * @param {number} seed
 * @returns {() => number} função que devolve [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash inteiro de uma string (FNV-1a). Usado para derivar seeds estáveis a
 * partir de IDs ("ITEM-0001842" → número).
 * @param {string} str
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Inteiro em [min, max] usando o gerador dado. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Escolhe um elemento com pesos: `[{ weight, ... }]`. */
export function weightedPick(rng, items) {
  let total = 0;
  for (const it of items) total += it.weight;
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Aproximação exponencial independente de framerate. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
