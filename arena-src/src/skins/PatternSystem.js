import { mulberry32, hashString } from '../core/Rng.js';

/**
 * Pattern seed (0–1000) → parâmetros de padrão.
 *
 * O mesmo par (skin, seed) sempre produz a mesma variação; seeds diferentes
 * giram, deslocam e reescalam o padrão, movem o degradê e o decalque, e
 * mudam a direção dominante dos arranhões. É isto que faz duas cópias da
 * mesma skin serem colecionáveis distintas.
 */

export const PATTERN_SEED_MAX = 1000;

/**
 * Seeds "notáveis" por padrão — variações raras com distribuição de cor
 * especial (ex.: o degradê todo puxado para o acento). Só estética.
 */
const SPECIAL = {
  fade: [0, 77, 412, 999],
  circuit: [8, 321, 661],
  hex: [100, 505],
  pulse: [13, 444, 888],
  rupture: [66, 707],
};

/**
 * @typedef {Object} PatternParams
 * @property {number} rotation    radianos
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {number} gradient    posição do degradê (0..1)
 * @property {number} hueShift    pequena variação de distribuição de cor (-1..1)
 * @property {number} decalX
 * @property {number} decalY
 * @property {number} decalSize   0 = sem decalque
 * @property {number} scratchAngle
 * @property {boolean} special
 */

/**
 * @param {string} skinId
 * @param {string} pattern
 * @param {number} seed 0..1000
 * @returns {PatternParams}
 */
export function patternParams(skinId, pattern, seed) {
  const s = Math.max(0, Math.min(PATTERN_SEED_MAX, Math.round(seed)));
  const rng = mulberry32(hashString(skinId) ^ Math.imul(s + 1, 2654435761));
  const special = (SPECIAL[pattern] || []).includes(s);
  return {
    rotation: (rng() - 0.5) * Math.PI * 0.9,
    offsetX: rng() * 10,
    offsetY: rng() * 10,
    scale: 0.8 + rng() * 0.45,
    gradient: special ? 0.92 : rng(),
    hueShift: special ? 1 : rng() * 2 - 1,
    decalX: -0.05 + rng() * 0.25,
    decalY: -0.02 + rng() * 0.05,
    decalSize: rng() < 0.55 ? 0.012 + rng() * 0.012 : 0,
    scratchAngle: rng() * Math.PI,
    special,
  };
}

/**
 * Deslocamento de ruído do desgaste a partir do seed ÚNICO do item (não o
 * pattern seed). Duas cópias com mesma skin, mesmo float e mesmo pattern
 * seed ainda descascam em lugares diferentes.
 * @param {number} wearSeed
 */
export function wearNoiseOffset(wearSeed) {
  const rng = mulberry32(wearSeed >>> 0);
  return [rng() * 100, rng() * 100, rng() * 100];
}
