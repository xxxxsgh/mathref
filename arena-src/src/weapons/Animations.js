import { prepareClip } from './Animator.js';
import { weightedPick } from '../core/Rng.js';

/**
 * Biblioteca de clipes da viewmodel. Valores são DESLOCAMENTOS em relação
 * ao idle de cada arma (ver Animator.js). Posições em metros no espaço da
 * câmera, rotações em radianos.
 */

const TAU = Math.PI * 2;
const PI = Math.PI;

/** @typedef {import('./Animator.js').Clip} Clip */

// ───────────────────────── FACA ─────────────────────────

/** Saque: sobe de baixo girando no punho. */
export const KNIFE_DRAW = prepareClip({
  name: 'draw',
  blendIn: 0,
  keys: [
    { t: 0, rp: [0.02, -0.24, 0.08], rr: [-1.0, 0.3, 0.6], ir: [-TAU, 0, 0] },
    { t: 0.42, rp: [0, 0.012, 0], rr: [0.08, 0, 0], ir: [-0.1, 0, 0], e: 'outCubic' },
    { t: 0.6, rp: [0, 0, 0], rr: [0, 0, 0], ir: [0, 0, 0], e: 'outBack' },
  ],
});

/** Equipar (início de round / troca de skin): saque com floreio. */
export const KNIFE_EQUIP = prepareClip({
  name: 'equip',
  blendIn: 0,
  keys: [
    { t: 0, rp: [0.06, -0.3, 0.1], rr: [-0.6, 0.6, 0.9] },
    { t: 0.45, rp: [-0.03, 0.02, 0.02], rr: [0.1, 0.3, 0.4], ir: [0, -TAU, 0], e: 'outCubic' },
    { t: 0.75, ir: [0, -TAU, 0], rr: [0.05, 0.1, 0.1] },
    { t: 1.05, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutBack' },
  ],
});

/** Golpe leve da direita para a esquerda. */
export const KNIFE_SLASH_A = prepareClip({
  name: 'slashA',
  blendIn: 0.04,
  events: { hit: 0.11 },
  keys: [
    { t: 0.07, rp: [0.06, 0.03, 0.03], rr: [0.05, -0.45, -0.45], e: 'outQuad' },
    { t: 0.19, rp: [-0.16, -0.02, -0.1], rr: [0.15, 0.95, 0.7], ir: [0, 0, 0.3], e: 'outCubic' },
    { t: 0.42, rp: [0, 0, 0], rr: [0, 0, 0], ir: [0, 0, 0], e: 'inOutCubic' },
  ],
});

/** Golpe leve de volta (esquerda para a direita). */
export const KNIFE_SLASH_B = prepareClip({
  name: 'slashB',
  blendIn: 0.04,
  events: { hit: 0.11 },
  keys: [
    { t: 0.07, rp: [-0.08, 0.04, 0.02], rr: [0.1, 0.6, 0.5], e: 'outQuad' },
    { t: 0.19, rp: [0.09, -0.04, -0.1], rr: [0.0, -0.7, -0.6], ir: [0, 0, -0.3], e: 'outCubic' },
    { t: 0.42, rp: [0, 0, 0], rr: [0, 0, 0], ir: [0, 0, 0], e: 'inOutCubic' },
  ],
});

/** Golpe pesado: recua e estoca. */
export const KNIFE_STAB = prepareClip({
  name: 'stab',
  blendIn: 0.05,
  events: { hit: 0.3 },
  keys: [
    { t: 0.22, rp: [0.03, 0.05, 0.12], rr: [0.5, 0.1, 0.1], ir: [-0.2, 0, 0], e: 'outCubic' },
    { t: 0.34, rp: [-0.06, 0.02, -0.24], rr: [-0.15, 0.05, 0], ir: [0.1, 0, 0], e: 'outQuint' },
    { t: 0.55, rp: [-0.05, 0.015, -0.2], rr: [-0.1, 0.05, 0] },
    { t: 1.0, rp: [0, 0, 0], rr: [0, 0, 0], ir: [0, 0, 0], e: 'inOutCubic' },
  ],
});

/**
 * Variações da inspeção da faca. Cada uma termina com rotações múltiplas de
 * 2π, então o fim é visualmente idêntico ao idle.
 */
export const KNIFE_INSPECTS = [
  {
    id: 'A',
    label: 'Rotação lenta da lâmina',
    weight: 30,
    clip: prepareClip({
      name: 'inspect',
      blendIn: 0.15,
      keys: [
        { t: 0.6, rp: [-0.1, 0.06, 0.05], rr: [0.15, 0.55, 0.65], e: 'inOutCubic' },
        { t: 1.7, ir: [0, 0, -1.35], rr: [0.18, 0.62, 0.55], e: 'inOutSine' },
        { t: 3.0, ir: [0, 0, 1.55], rr: [0.08, 0.7, 0.4], rp: [-0.11, 0.065, 0.065], e: 'inOutSine' },
        { t: 3.9, ir: [0, 0, 0.2], rp: [-0.07, 0.045, 0.04], rr: [0.12, 0.45, 0.5], e: 'inOutSine' },
        { t: 4.7, rp: [0, 0, 0], rr: [0, 0, 0], ir: [0, 0, 0], e: 'inOutCubic' },
      ],
    }),
  },
  {
    id: 'B',
    label: 'Giro rápido nos dedos',
    weight: 28,
    clip: prepareClip({
      name: 'inspect',
      blendIn: 0.12,
      keys: [
        { t: 0.35, rp: [-0.05, 0.04, 0.02], rr: [0.1, 0.3, 0.3], e: 'outCubic' },
        { t: 0.5, ir: [0.25, 0, 0], ip: [0, 0.01, 0], e: 'inQuad' },
        { t: 1.0, ir: [-TAU, 0, 0], ip: [0, 0.035, 0.01], e: 'outCubic' },
        { t: 1.25, ip: [0, 0, 0], ir: [-TAU, 0, 0], e: 'outBack' },
        { t: 2.1, rr: [0.22, 0.62, 0.75], rp: [-0.09, 0.055, 0.05], e: 'inOutSine' },
        { t: 2.6, rr: [0.18, 0.55, 0.62] },
        { t: 3.3, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutCubic' },
      ],
    }),
  },
  {
    id: 'C',
    label: 'Inspeção do cabo',
    weight: 24,
    clip: prepareClip({
      name: 'inspect',
      blendIn: 0.15,
      keys: [
        { t: 0.5, rp: [-0.07, 0.03, 0.04], rr: [-0.2, 0.2, 0.1], e: 'inOutCubic' },
        { t: 1.4, rp: [-0.09, 0.08, 0.04], rr: [-1.0, 0.3, 0.2], ip: [0, 0, 0.02], e: 'inOutCubic' },
        { t: 2.5, rr: [-1.08, -0.45, 0.3], e: 'inOutSine' },
        { t: 3.4, rp: [-0.09, 0.05, 0.06], rr: [-0.3, 0.7, 0.8], ip: [0, 0, 0], ir: [0, 0, 0.5], e: 'inOutCubic' },
        { t: 4.4, rp: [0, 0, 0], rr: [0, 0, 0], ir: [0, 0, 0], e: 'inOutCubic' },
      ],
    }),
  },
  {
    id: 'D',
    label: 'Giro curto',
    weight: 14,
    clip: prepareClip({
      name: 'inspect',
      blendIn: 0.1,
      keys: [
        { t: 0.3, rp: [-0.04, 0.03, 0], rr: [0.1, 0.2, 0.2], e: 'outCubic' },
        { t: 1.25, ir: [0, 2 * TAU, 0], e: 'outCubic' },
        { t: 1.6, rr: [0.16, 0.38, 0.38], ir: [0, 2 * TAU, 0], e: 'outBack' },
        { t: 2.5, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutCubic' },
      ],
    }),
  },
  {
    id: 'E',
    label: 'Especial rara',
    weight: 4,
    rare: true,
    clip: prepareClip({
      name: 'inspect',
      blendIn: 0.15,
      keys: [
        // 1. sobe e gira nos dedos (arremesso curto)
        { t: 0.4, rp: [-0.06, 0.05, 0.03], rr: [0.1, 0.3, 0.3], e: 'outCubic' },
        { t: 1.15, ip: [0, 0.2, 0.02], ir: [-3 * PI, 0, 0], e: 'outQuint' },
        { t: 1.65, ip: [0, 0, 0], ir: [-4 * PI, 0, 0], e: 'inQuad' },
        // 2. vira na horizontal (rola a lâmina e mostra a outra face)
        { t: 2.45, ir: [-4 * PI, 0, PI], rr: [0.1, 0.5, 0.4], e: 'inOutBack' },
        // 3. examina a lâmina de perto
        { t: 3.45, rp: [-0.1, 0.06, 0.06], rr: [0.18, 0.62, 0.55], ir: [-4 * PI, 0, PI - 1.3], e: 'inOutSine' },
        // 4. cabo em direção à câmera
        { t: 4.5, rp: [-0.08, 0.07, 0.04], rr: [-1.0, 0.2, 0.2], ir: [-4 * PI, 0, PI], e: 'inOutCubic' },
        // 5. giro curto (completa a volta da lâmina)
        { t: 5.35, rp: [-0.04, 0.03, 0.02], rr: [0.1, 0.3, 0.2], ir: [-4 * PI, 0, TAU], e: 'outBack' },
        // 6. volta ao idle
        { t: 6.3, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutCubic' },
      ],
    }),
  },
];

/**
 * Sorteia uma variação de inspeção. Evita repetir a anterior (exceto a
 * rara, que pode repetir se der sorte), para nunca parecer em loop.
 * @param {() => number} rng
 * @param {string} [lastId]
 */
export function pickKnifeInspect(rng, lastId) {
  const pool = KNIFE_INSPECTS.filter((v) => v.rare || v.id !== lastId);
  return /** @type {(typeof KNIFE_INSPECTS)[number]} */ (weightedPick(rng, pool));
}

// ───────────────────────── ARMAS DE FOGO ─────────────────────────

/** @param {number} time */
export function gunDraw(time) {
  return prepareClip({
    name: 'draw',
    blendIn: 0,
    keys: [
      { t: 0, rp: [0.02, -0.22, 0.06], rr: [-0.85, 0.25, 0.45] },
      { t: time * 0.75, rp: [0, 0.008, 0], rr: [0.05, 0, -0.02], e: 'outCubic' },
      { t: time, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutSine' },
    ],
  });
}

/** Recarga de fuzil/SMG/DMR: inclina, tira o pente, encaixa, puxa o ferrolho. */
export function rifleReload(time) {
  const k = time / 2.4;
  return prepareClip({
    name: 'reload',
    blendIn: 0.1,
    events: { magOut: 0.45 * k, magIn: 1.62 * k, bolt: 2.0 * k },
    keys: [
      { t: 0.3 * k, rp: [-0.02, -0.03, 0.03], rr: [0.22, 0.18, 0.5], e: 'outCubic' },
      { t: 0.65 * k, m: 1, e: 'inQuad' },
      { t: 1.25 * k, m: 1, rr: [0.25, 0.2, 0.55] },
      { t: 1.62 * k, m: 0, rr: [0.3, 0.18, 0.45], e: 'outBack' },
      { t: 1.85 * k, rp: [0.01, 0.0, 0.03], rr: [0.08, -0.12, -0.15], e: 'outCubic' },
      { t: 2.05 * k, rp: [0.01, 0.0, 0.05], rr: [0.04, -0.12, -0.15], e: 'outQuad' },
      { t: 2.4 * k, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutCubic' },
    ],
  });
}

/** Recarga de pistola. */
export function pistolReload(time) {
  const k = time / 2.0;
  return prepareClip({
    name: 'reload',
    blendIn: 0.1,
    events: { magOut: 0.35 * k, magIn: 1.3 * k, bolt: 1.65 * k },
    keys: [
      { t: 0.25 * k, rp: [-0.02, 0.0, 0.02], rr: [0.3, -0.1, 0.35], e: 'outCubic' },
      { t: 0.5 * k, m: 1, e: 'inQuad' },
      { t: 1.05 * k, m: 1 },
      { t: 1.3 * k, m: 0, rr: [0.35, -0.08, 0.3], e: 'outBack' },
      { t: 1.6 * k, rr: [0.1, 0.1, -0.1], rp: [0, 0.01, 0.01], e: 'outCubic' },
      { t: 2.0 * k, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutCubic' },
    ],
  });
}

/** Inspeções de arma de fogo (duas variações). */
export const GUN_INSPECTS = [
  {
    id: 'G1',
    label: 'Mostrar laterais',
    weight: 60,
    clip: prepareClip({
      name: 'inspect',
      blendIn: 0.15,
      keys: [
        { t: 0.7, rp: [-0.08, 0.035, 0.05], rr: [0.1, 0.55, 0.65], e: 'inOutCubic' },
        { t: 1.8, rr: [0.14, 0.6, 0.55], e: 'inOutSine' },
        { t: 2.8, rp: [-0.02, 0.02, 0.06], rr: [0.18, -0.45, -0.55], e: 'inOutCubic' },
        { t: 3.5, rr: [0.12, -0.4, -0.5], e: 'inOutSine' },
        { t: 4.3, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutCubic' },
      ],
    }),
  },
  {
    id: 'G2',
    label: 'Checar o pente',
    weight: 40,
    clip: prepareClip({
      name: 'inspect',
      blendIn: 0.15,
      keys: [
        { t: 0.6, rp: [-0.05, 0.02, 0.03], rr: [0.25, 0.25, 0.7], e: 'inOutCubic' },
        { t: 1.1, m: 0.35, e: 'outCubic' },
        { t: 1.8, m: 0.35, rr: [0.3, 0.3, 0.75] },
        { t: 2.1, m: 0, e: 'outBack' },
        { t: 2.9, rp: [-0.07, 0.03, 0.05], rr: [0.05, 0.55, 0.3], e: 'inOutCubic' },
        { t: 3.8, rp: [0, 0, 0], rr: [0, 0, 0], e: 'inOutCubic' },
      ],
    }),
  },
];
