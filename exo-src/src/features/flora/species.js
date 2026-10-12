/**
 * ESPÉCIES POR BIOMA (puro).
 *
 * Cada bioma do planeta (planet.biomeAt().id) vira uma lista de espécies com
 * gerador, parâmetros, cores tiradas da PALETA DO BIOMA (saturadas, com
 * variação por planeta pela seed), camada de espalhamento e distâncias de LOD.
 *
 * Camadas de espalhamento (index.js):
 *   grass  células ~12 m, tapete denso perto da câmera
 *   small  células ~24 m, flores, rosetas, seixos
 *   large  células ~80 m, árvores, fungos gigantes, cristais, rochas (até floraDistance)
 */
import { grassClump, flowerPatch, rosette, tree, mushroom, tendrils, crystals, rock } from './plants.js';
import { L } from './textures.js';
import { mulberry32 } from '../../core/Rng.js';

// ─── cor ──────────────────────────────────────────────────────────────
function hsv(c) {
  const [r, g, b] = c;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}
function rgb([h, s, v]) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
/** desloca matiz, multiplica saturação e valor (cores lineares) */
export function tone(c, dh = 0, ds = 1, dv = 1) {
  const [h, s, v] = hsv(c);
  return rgb([(h + dh + 1) % 1, Math.min(1, s * ds), Math.min(4, v * dv)]);
}
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ─── famílias reutilizáveis ───────────────────────────────────────────
function grassSpecies(P, o = {}) {
  const base = o.base ?? P.grass;
  return {
    id: 'grass', layer: 'grass', kind: 'grass', gen: grassClump, weight: 1,
    params: {
      height: o.height ?? 0.75, width: o.width ?? 0.045, blades: o.blades ?? 14, radius: o.radius ?? 0.3, lean: o.lean ?? 0.4,
      colBase: tone(base, 0, 1.1, o.baseV ?? 0.95), colTip: tone(base, o.tipHue ?? 0.03, o.tipSat ?? 0.92, o.tipV ?? 2.6), emit: o.emit ?? 0,
    },
    scale: o.scale ?? [0.7, 1.3], stiff: 1, transl: 0.9, slopeMax: 0.55, density: o.density ?? 1,
  };
}

function broadTree(P, rnd, o = {}) {
  const leaf = o.leaf;
  return {
    id: o.id ?? 'tree', layer: 'large', kind: 'tree', gen: tree, weight: o.weight ?? 1, imposter: true, shadow: true, variants: 2,
    params: {
      height: o.height ?? 16, trunkR: o.trunkR ?? 0.36, taper: 0.65, lean: 0.08, roots: 5, radial: 8,
      levels: o.levels ?? [
        { n: 9, start: 0.4, end: 0.97, angle: 1.0, len: 0.34, droop: -0.1 },
        { n: 4, start: 0.3, end: 1.0, angle: 0.75, len: 0.48, droop: 0.3 },
      ],
      leaf: o.leafCfg ?? { layer: L.BROAD, size: 1.35, aspect: 0.5, fan: 4, perBranch: 2, droop: 0.4, fold: 0.25, up: 0.3, sprigs: 6, sprigSize: 2.4 },
      bark: o.bark ?? tone(P.rock2 ?? P.rock, -0.01, 1.0, 1.35), leafBase: mul(leaf, 0.5), leafTip: tone(leaf, 0.02, 0.95, 1.3), softness: 0.55, crownY: 0.8,
    },
    scale: o.scale ?? [0.75, 1.35], stiff: 0.22, transl: 1, slopeMax: 0.4, radius: o.trunkR ?? 0.45, lod: o.lod ?? [42, 170], cluster: o.cluster ?? 0.5,
  };
}

function palmTree(P, rnd, o = {}) {
  const leaf = o.leaf;
  return {
    id: o.id ?? 'palm', layer: 'large', kind: 'tree', gen: tree, weight: o.weight ?? 1, imposter: true, shadow: true, variants: 2,
    params: {
      height: o.height ?? 14, trunkR: 0.32, taper: 0.45, lean: 0.12, roots: 0, radial: 7, palm: true, whorls: 3, trunkLen: 1,
      levels: [{ n: 0 }],
      leaf: { layer: o.layer ?? L.FROND, size: o.size ?? 6, aspect: o.aspect ?? 0.42, fan: o.fan ?? 9, droop: o.droop ?? 0.75, fold: 0.3, up: 0.55 },
      bark: o.bark ?? tone(P.rock2 ?? P.rock, 0, 0.5, 1.3), leafBase: mul(leaf, 0.5), leafTip: tone(leaf, 0.03, 0.9, 1.4), softness: 0.45,
    },
    scale: [0.75, 1.3], stiff: 0.25, transl: 1, slopeMax: 0.45, radius: 0.35, lod: [70, 230], cluster: o.cluster ?? 0.4,
  };
}

function rockSpecies(P, o = {}) {
  return {
    id: o.id ?? 'rock', layer: o.layer ?? 'large', kind: 'rock', gen: rock, weight: o.weight ?? 0.5, imposter: false, shadow: o.layer !== 'small',
    params: { size: o.size ?? 1.6, flat: o.flat ?? 0.6, col: tone(P.rock, 0, 0.8, 1.6), moss: o.moss ?? 0.8, mossCol: o.mossCol ?? tone(P.grass, 0, 1, 1.1), detail: 2 },
    scale: o.scale ?? [0.5, 2.2], stiff: 0, transl: 0, slopeMax: 1, radius: (o.size ?? 1.6) * 0.8, lod: [110, 99999], variants: o.variants ?? 2, cluster: 0,
  };
}

function flowerSpecies(petal, P, o = {}) {
  return {
    id: o.id ?? 'flower', layer: 'small', kind: 'flower', gen: flowerPatch, weight: o.weight ?? 1,
    params: { count: 7, height: o.height ?? 0.6, spread: 0.5, head: o.head ?? 0.17, petal, stem: tone(P.grass, 0, 1, 0.9), leaf: tone(P.grass, 0, 1, 1.3), emit: o.emit ?? 0.35 },
    scale: [0.7, 1.4], stiff: 0.8, transl: 1, slopeMax: 0.5, radius: 0.3, cluster: 0.8,
  };
}

function rosetteSpecies(P, o) {
  return {
    id: o.id ?? 'rosette', layer: o.layer ?? 'small', kind: 'plant', gen: rosette, weight: o.weight ?? 1, shadow: o.layer === 'large', imposter: false,
    params: {
      leaves: o.leaves ?? 9, length: o.length ?? 1, aspect: o.aspect ?? 0.45, elev: o.elev ?? 0.9, droop: o.droop ?? 0.55,
      layer: o.tex ?? L.FRILL, colBase: mul(o.col, 0.35), colTip: tone(o.col, 0.02, 0.9, 1.5), emit: o.emit ?? 0, fold: o.fold ?? 0.3, curl: o.curl ?? 0.1,
    },
    scale: o.scale ?? [0.6, 1.5], stiff: 0.5, transl: 1, slopeMax: 0.55, radius: 0.5, lod: [80, 99999], cluster: o.cluster ?? 0.6,
  };
}

// ─── biomas ───────────────────────────────────────────────────────────
/**
 * @param {string} biome  id do bioma (planet.biomeAt().id ou planet.biome.id)
 * @param {object} P      paleta linear do planeta
 * @param {number} seed   seed do planeta (variação de cores/escala)
 */
export function speciesFor(biome, P, seed = 1, o = {}) {
  const rnd = mulberry32(seed ^ 0x51f1);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const accent = P.accent ?? [0.9, 0.3, 0.6];
  switch (biome) {
    case 'lush': {
      // copa: dourada/laranja (como nas florestas de outono alienígenas), verde intenso ou rosada
      const opts = [[0.62, 0.3, 0.025], [0.75, 0.16, 0.05], tone(P.grass, 0.03, 1, 1.9), [0.5, 0.42, 0.03], [0.55, 0.08, 0.18]];
      const leafA = o.leaf != null ? opts[o.leaf % opts.length] : pick(opts);
      const leafB = tone(leafA, 0.05 + rnd() * 0.05, 1, 0.85);
      return [
        grassSpecies(P, { height: 0.72, blades: 12 }),
        flowerSpecies(pick([[0.95, 0.08, 0.25], [1, 0.6, 0.02], [0.9, 0.12, 0.04]]), P, { weight: 1.1 }),
        flowerSpecies(pick([[0.95, 0.95, 1.0], [0.6, 0.3, 1.0]]), P, { id: 'flower2', weight: 0.35, head: 0.09, height: 0.4 }),
        rosetteSpecies(P, { id: 'fern', tex: L.FERN, col: tone(P.grass, 0.02, 1, 1.6), length: 0.9, aspect: 0.5, leaves: 10, weight: 1.2 }),
        rosetteSpecies(P, { id: 'bush', layer: 'large', tex: L.BROAD, col: tone(leafA, -0.03, 1, 0.9), length: 1.5, aspect: 0.55, leaves: 14, elev: 1.2, weight: 0.9, scale: [0.8, 1.8] }),
        rockSpecies(P, { id: 'pebble', layer: 'small', size: 0.35, weight: 0.4, variants: 1, scale: [0.5, 1.6] }),
        broadTree(P, rnd, { id: 'tree', leaf: leafA, height: 17, weight: 1.3 }),
        palmTree(P, rnd, { id: 'palm', leaf: leafB, layer: L.BROAD, size: 4.2, aspect: 0.5, fan: 8, height: 15, droop: 0.65, weight: 1 }),
        rockSpecies(P, { weight: 0.35 }),
      ];
    }
    case 'exotic': {
      const capA = pick([[0.06, 0.3, 0.8], [0.05, 0.42, 0.6], [0.12, 0.2, 0.75]]);
      const glow = pick([accent, [0.2, 0.9, 1.0], [1.0, 0.4, 0.9]]);
      const crys = pick([[0.85, 0.1, 0.95], [0.6, 0.15, 1.0], [0.1, 0.9, 0.85]]);
      return [
        grassSpecies(P, { height: 0.8, blades: 12, tipHue: -0.02, tipV: 1.9, tipSat: 1 }),
        rosetteSpecies(P, { id: 'frill', tex: L.FRILL, col: tone(P.dry ?? P.grass, 0.02, 1, 2.2), length: 1.1, aspect: 0.6, leaves: 9, weight: 1, emit: 0.05 }),
        flowerSpecies(glow, P, { weight: 0.5, emit: 0.9 }),
        {
          id: 'crystal_s', layer: 'small', kind: 'crystal', gen: crystals, weight: 0.35,
          params: { count: 5, height: 0.9, r: 0.12, col: crys, emit: 1.2 }, scale: [0.6, 1.5], stiff: 0, transl: 0.6, slopeMax: 1, radius: 0.3,
        },
        {
          id: 'mushroom', layer: 'large', kind: 'mushroom', gen: mushroom, weight: 1.4, imposter: true, shadow: true, variants: 2,
          params: { height: 12, stemR: 0.85, capR: 6.5, capH: 0.42, capPow: 1.8, caps: 3, lean: 0.3, stem: tone(capA, 0.06, 0.75, 1.25), capTop: mul(capA, 0.45), capRim: tone(capA, 0.03, 0.85, 1.7), gill: glow, gillEmit: 1.6, emit: 1.0, wavy: 0.14 },
          scale: [0.55, 1.45], stiff: 0.06, transl: 0.6, slopeMax: 0.45, radius: 1.0, clear: 5, lod: [55, 220], cluster: 0.55,
        },
        {
          id: 'tendril', layer: 'large', kind: 'plant', gen: tendrils, weight: 0.8, imposter: true, shadow: true,
          params: { height: 5, r: 0.13, count: 11, curl: 0.5, col: tone(capA, 0.05, 0.8, 0.7), bulb: 1.8, bulbCol: glow, emit: 1.6, spikes: true },
          scale: [0.6, 1.6], stiff: 0.3, transl: 0.8, slopeMax: 0.5, radius: 0.5, lod: [70, 200], cluster: 0.6,
        },
        {
          id: 'crystal', layer: 'large', kind: 'crystal', gen: crystals, weight: 0.45, imposter: false, shadow: true,
          params: { count: 9, height: 3.2, r: 0.42, col: crys, emit: 1.3 }, scale: [0.5, 1.6], stiff: 0, transl: 0.6, slopeMax: 1, radius: 1, lod: [120, 99999], cluster: 0.3,
        },
        rockSpecies(P, { weight: 0.35, mossCol: tone(P.grass, 0, 1, 1.3) }),
      ];
    }
    case 'toxic': {
      const glow = pick([accent, [0.75, 0.2, 1.0]]);
      return [
        grassSpecies(P, { height: 0.6, blades: 11, tipV: 2.6 }),
        rosetteSpecies(P, { id: 'spikes', tex: L.SPIKE, col: tone(P.grass, 0.05, 1, 1.4), length: 0.9, aspect: 0.25, leaves: 12, elev: 1.6, droop: 0.2, weight: 1 }),
        flowerSpecies(glow, P, { weight: 0.4, emit: 1 }),
        {
          id: 'tendril', layer: 'large', kind: 'plant', gen: tendrils, weight: 1.2, imposter: true, shadow: true,
          params: { height: 6, r: 0.18, count: 8, curl: 0.35, col: tone(P.rock2, 0, 1, 1.4), bulb: 2.2, bulbCol: glow, emit: 1.4, spikes: true },
          scale: [0.6, 1.6], stiff: 0.3, transl: 0.8, slopeMax: 0.5, radius: 0.5, lod: [70, 200], cluster: 0.6,
        },
        {
          id: 'mushroom', layer: 'large', kind: 'mushroom', gen: mushroom, weight: 0.9, imposter: true, shadow: true, variants: 2,
          params: { height: 7, stemR: 0.4, capR: 3.5, capH: 0.5, caps: 2, lean: 0.3, stem: tone(P.sand, 0, 0.6, 1), capTop: tone(P.grass, 0.08, 1, 1.5), capRim: glow, gill: glow, gillEmit: 1, emit: 0.8, wavy: 0.15 },
          scale: [0.6, 1.5], stiff: 0.06, transl: 0.6, slopeMax: 0.45, radius: 0.5, clear: 3, lod: [70, 230], cluster: 0.5,
        },
        broadTree(P, rnd, {
          id: 'twisted', leaf: tone(P.grass, 0.05, 1, 1.6), height: 11, trunkR: 0.35, bark: tone(P.rock2, 0, 0.8, 1.2),
          leafCfg: { layer: L.SPIKE, size: 1.6, aspect: 0.35, fan: 5, perBranch: 3, droop: 0.2, fold: 0.4, up: 0.6 },
          levels: [
            { n: 6, start: 0.35, end: 0.95, angle: 1.2, len: 0.4, droop: 0.4 },
            { n: 3, start: 0.3, end: 1, angle: 0.9, len: 0.5, droop: 0.6 },
          ],
        }),
        rockSpecies(P, { weight: 0.4 }),
      ];
    }
    case 'radioactive': {
      const glow = pick([accent, [0.4, 1.0, 0.2]]);
      return [
        grassSpecies(P, { height: 0.55, blades: 11, tipV: 2.5 }),
        rosetteSpecies(P, { id: 'spikes', tex: L.SPIKE, col: tone(P.grass, -0.02, 1, 1.5), length: 0.8, aspect: 0.25, leaves: 12, elev: 1.8, droop: 0.15, weight: 1 }),
        {
          id: 'crystal_s', layer: 'small', kind: 'crystal', gen: crystals, weight: 0.5,
          params: { count: 5, height: 0.9, r: 0.13, col: glow, emit: 1.4 }, scale: [0.6, 1.5], stiff: 0, transl: 0.6, slopeMax: 1, radius: 0.3,
        },
        broadTree(P, rnd, {
          id: 'spiky', leaf: tone(P.grass2 ?? P.grass, 0, 1, 1.6), height: 10, trunkR: 0.3, bark: tone(P.rock2, 0, 0.6, 1.4),
          leafCfg: { layer: L.NEEDLE, size: 1.8, aspect: 0.6, fan: 4, perBranch: 4, droop: 0.15, fold: 0.1, up: 0.8 },
        }),
        {
          id: 'crystal', layer: 'large', kind: 'crystal', gen: crystals, weight: 0.7, imposter: false, shadow: true,
          params: { count: 9, height: 3.5, r: 0.45, col: glow, emit: 1.5 }, scale: [0.5, 1.7], stiff: 0, transl: 0.6, slopeMax: 1, radius: 1, lod: [120, 99999], cluster: 0.3,
        },
        rockSpecies(P, { weight: 0.6 }),
      ];
    }
    case 'frozen': {
      const ice = [0.45, 0.75, 1.0];
      return [
        grassSpecies(P, { height: 0.45, blades: 9, density: 0.5, tipV: 1.6 }),
        {
          id: 'crystal_s', layer: 'small', kind: 'crystal', gen: crystals, weight: 0.8,
          params: { count: 5, height: 0.8, r: 0.12, col: ice, emit: 0.6 }, scale: [0.6, 1.5], stiff: 0, transl: 0.6, slopeMax: 1, radius: 0.3,
        },
        broadTree(P, rnd, {
          id: 'conifer', leaf: [0.35, 0.55, 0.75], height: 13, trunkR: 0.3, bark: [0.2, 0.2, 0.25],
          leafCfg: { layer: L.NEEDLE, size: 2.2, aspect: 0.7, fan: 3, perBranch: 3, droop: 0.4, fold: 0.1, up: 0.1 },
          levels: [
            { n: 14, start: 0.15, end: 0.98, angle: 1.45, len: 0.22, droop: 0.4 },
            { n: 2, start: 0.4, end: 1, angle: 0.6, len: 0.4, droop: 0.2 },
          ],
          weight: 0.8,
        }),
        {
          id: 'crystal', layer: 'large', kind: 'crystal', gen: crystals, weight: 0.8, imposter: false, shadow: true,
          params: { count: 9, height: 4, r: 0.5, col: ice, emit: 0.7 }, scale: [0.5, 1.7], stiff: 0, transl: 0.6, slopeMax: 1, radius: 1, lod: [120, 99999], cluster: 0.3,
        },
        rockSpecies(P, { weight: 0.8, mossCol: P.snow, moss: 1 }),
      ];
    }
    case 'scorched': {
      const glow = [1.0, 0.45, 0.08];
      return [
        grassSpecies(P, { height: 0.5, blades: 9, density: 0.45, tipV: 1.8 }),
        rosetteSpecies(P, { id: 'spikes', tex: L.SPIKE, col: tone(P.dry, 0, 1, 1.4), length: 0.7, aspect: 0.22, leaves: 10, elev: 1.6, droop: 0.2, weight: 1 }),
        broadTree(P, rnd, {
          id: 'deadtree', leaf: tone(P.dry, 0, 1, 1.2), height: 9, trunkR: 0.3, bark: [0.12, 0.08, 0.06],
          leafCfg: { layer: L.SPIKE, size: 0.6, aspect: 0.3, fan: 2, perBranch: 1, droop: 0.1, fold: 0.3, up: 0.5 },
          levels: [
            { n: 5, start: 0.3, end: 0.9, angle: 0.9, len: 0.45, droop: -0.2 },
            { n: 3, start: 0.3, end: 1, angle: 0.7, len: 0.5, droop: -0.1 },
          ],
          weight: 0.6,
        }),
        {
          id: 'crystal', layer: 'large', kind: 'crystal', gen: crystals, weight: 0.4, imposter: false, shadow: true,
          params: { count: 8, height: 3, r: 0.4, col: glow, emit: 1.4 }, scale: [0.5, 1.5], stiff: 0, transl: 0.6, slopeMax: 1, radius: 1, lod: [120, 99999], cluster: 0.3,
        },
        rockSpecies(P, { weight: 1, moss: 0 }),
      ];
    }
    default: // dead e desconhecidos
      return [
        grassSpecies(P, { height: 0.35, blades: 6, density: 0.25, tipV: 1.3 }),
        rockSpecies(P, { id: 'pebble', layer: 'small', size: 0.4, weight: 1, variants: 1, scale: [0.5, 1.8], moss: 0 }),
        rockSpecies(P, { weight: 1, moss: 0 }),
      ];
  }
}

export { mix as mixColor, mul as mulColor };
