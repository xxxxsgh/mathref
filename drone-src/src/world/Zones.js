import { CONFIG } from '../config.js';
import { ridged2D, fbm2D } from './noise.js';
import { smoothstep } from '../core/MathUtils.js';

/**
 * As três zonas do mundo.
 *
 * O critério aqui é o do roadmap: as zonas têm que exigir PILOTAGEM diferente,
 * não só cor diferente. O que muda de verdade em cada uma:
 *
 * - Vale industrial: relevo baixo e liso, mas cheio de estrutura grande. Voar
 *   rápido é fácil; voar rápido *entre* as coisas é que não é. Vento canalizado.
 * - Floresta: relevo ondulado e densidade altíssima de troncos. Obriga a voar
 *   baixo e devagar, com visibilidade curta — o oposto do vale.
 * - Costa: penhascos com cristas afiadas, muito vento e térmicas subindo pelas
 *   paredes. Voo alto e longo, onde o vento é o adversário e não o cenário.
 *
 * Cada zona tem um centro e as bordas se misturam por peso. Fronteira dura
 * ficaria visível como uma linha reta no terreno, que denuncia o truque.
 */

export const ZONES = [
  {
    id: 'vale',
    name: 'Vale industrial',
    center: { x: 0, z: 0 },
    radius: 620,
    terrain: {
      amplitude: 15,
      frequency: 1 / 470,
      octaves: 3,
      lacunarity: 2.03,
      gain: 0.44,
      seaLevel: -40,
    },
    palette: { grass: 0x77785e, sand: 0x9a9179, rock: 0x8b8985, water: 0x1d2f38 },
    props: { pole: 1.6, tree: 0.35, container: 2.0, hangar: 0.28, antenna: 0.3 },
    atmosphere: { horizon: 0xc4c9c6, zenith: 0x5386b8, fogScale: 1.0 },
    wind: { scale: 1.25, directionDeg: 35 },
  },
  {
    id: 'floresta',
    name: 'Floresta',
    center: { x: -320, z: -980 },
    radius: 700,
    terrain: {
      amplitude: 34,
      frequency: 1 / 330,
      octaves: 4,
      lacunarity: 2.1,
      gain: 0.5,
      seaLevel: -40,
    },
    palette: { grass: 0x4a6440, sand: 0x6b6349, rock: 0x60655c, water: 0x1a2a26 },
    // Densidade de tronco altíssima: é ela que fecha a visibilidade e força o
    // voo lento e baixo. A floresta é feita de props, não de terreno.
    props: { pole: 0.1, tree: 7.5, container: 0.05, hangar: 0.01, antenna: 0.02 },
    atmosphere: { horizon: 0xa8bba4, zenith: 0x4d7fa8, fogScale: 0.55 },
    wind: { scale: 0.45, directionDeg: 300 },
  },
  {
    id: 'costa',
    name: 'Costa e penhascos',
    center: { x: 1180, z: 240 },
    radius: 760,
    terrain: {
      amplitude: 78,
      frequency: 1 / 560,
      octaves: 4,
      lacunarity: 2.2,
      gain: 0.52,
      seaLevel: 4,
      // Cristas afiadas: o `ridged` inverte os vales e cria parede de penhasco
      // onde o fBm sozinho faria só duna arredondada.
      ridged: 0.55,
    },
    palette: { grass: 0x8e8c6a, sand: 0xc9b98d, rock: 0x9a958c, water: 0x1b4356 },
    props: { pole: 0.5, tree: 0.5, container: 0.2, hangar: 0.05, antenna: 0.25 },
    atmosphere: { horizon: 0xd3dde2, zenith: 0x4f8fc4, fogScale: 1.5 },
    wind: { scale: 2.1, directionDeg: 250 },
  },
];

const TRANSITION = 320; // largura da faixa de mistura entre zonas

/**
 * Pesos das zonas num ponto. Sempre somam 1.
 *
 * Peso por distância com queda suave, e não "a zona mais próxima vence": o
 * segundo evita mistura nenhuma e desenha uma fronteira reta e artificial no
 * terreno.
 */
export function zoneWeights(x, z, out = []) {
  out.length = 0;
  let total = 0;
  for (const zone of ZONES) {
    const d = Math.hypot(x - zone.center.x, z - zone.center.z);
    // 1 dentro do raio, indo a 0 ao longo da faixa de transição.
    const w = 1 - smoothstep(zone.radius, zone.radius + TRANSITION, d);
    // O epsilon garante que longe de tudo ainda exista uma zona dominante em
    // vez de divisão por zero.
    const weight = w * w + 1e-4 / (1 + d * 0.002);
    out.push(weight);
    total += weight;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Zona dominante num ponto — é o nome que a HUD e o mapa mostram. */
export function dominantZone(x, z) {
  const w = zoneWeights(x, z);
  let best = 0;
  for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
  return { zone: ZONES[best], weight: w[best], weights: w };
}

const scratch = [];

/**
 * Perfil de terreno misturado. É esta função que o `Terrain.profileAt` passa a
 * usar na Fase 3, no lugar da constante da Fase 1.
 */
export function terrainProfileAt(x, z) {
  const w = zoneWeights(x, z, scratch);
  const base = CONFIG.WORLD.terrain;
  const out = {
    amplitude: 0,
    frequency: 0,
    octaves: base.octaves,
    lacunarity: 0,
    gain: 0,
    seaLevel: 0,
    palette: null,
    _ridge: 0,
  };

  let dominant = 0;
  for (let i = 0; i < ZONES.length; i++) {
    const t = ZONES[i].terrain;
    const k = w[i];
    out.amplitude += t.amplitude * k;
    out.frequency += t.frequency * k;
    out.lacunarity += t.lacunarity * k;
    out.gain += t.gain * k;
    out.seaLevel += t.seaLevel * k;
    out._ridge += (t.ridged ?? 0) * k;
    if (k > w[dominant]) dominant = i;
  }

  out.octaves = ZONES[dominant].terrain.octaves;
  out.palette = blendPalette(w);

  if (out._ridge > 0.01) {
    const strength = out._ridge;
    const freq = out.frequency;
    const amplitude = out.amplitude;
    out.ridge = (px, pz, seed) =>
      ridged2D(px * freq * 0.85, pz * freq * 0.85, seed + 313, 3, 2.2, 0.5) * amplitude * strength;
  }
  return out;
}

const paletteOut = { grass: 0, sand: 0, rock: 0, water: 0 };

/** Mistura as cores canal a canal — interpolar o inteiro hexadecimal borraria. */
function blendPalette(weights) {
  for (const key of ['grass', 'sand', 'rock', 'water']) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < ZONES.length; i++) {
      const hex = ZONES[i].palette[key];
      r += ((hex >> 16) & 0xff) * weights[i];
      g += ((hex >> 8) & 0xff) * weights[i];
      b += (hex & 0xff) * weights[i];
    }
    paletteOut[key] = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }
  return paletteOut;
}

/** Mistura de props por posição — vira o `Props.mixAt`. */
export function propMixAt(x, z) {
  const w = zoneWeights(x, z, scratch);
  const mix = { pole: 0, tree: 0, container: 0, hangar: 0, antenna: 0 };
  for (let i = 0; i < ZONES.length; i++) {
    for (const key of Object.keys(mix)) mix[key] += ZONES[i].props[key] * w[i];
  }
  return mix;
}

/** Atmosfera (céu + bruma) misturada, pra transição sem corte. */
export function atmosphereAt(x, z) {
  const w = zoneWeights(x, z, scratch);
  let hr = 0;
  let hg = 0;
  let hb = 0;
  let zr = 0;
  let zg = 0;
  let zb = 0;
  let fogScale = 0;
  let windScale = 0;
  let windDirX = 0;
  let windDirZ = 0;

  for (let i = 0; i < ZONES.length; i++) {
    const a = ZONES[i].atmosphere;
    const k = w[i];
    hr += ((a.horizon >> 16) & 0xff) * k;
    hg += ((a.horizon >> 8) & 0xff) * k;
    hb += (a.horizon & 0xff) * k;
    zr += ((a.zenith >> 16) & 0xff) * k;
    zg += ((a.zenith >> 8) & 0xff) * k;
    zb += (a.zenith & 0xff) * k;
    fogScale += a.fogScale * k;
    windScale += ZONES[i].wind.scale * k;
    // Direção em vetor e não em graus: a média de 350° e 10° em graus dá 180°,
    // que é exatamente o contrário do certo.
    const rad = (ZONES[i].wind.directionDeg * Math.PI) / 180;
    windDirX += Math.sin(rad) * k;
    windDirZ += Math.cos(rad) * k;
  }

  return {
    horizon: (Math.round(hr) << 16) | (Math.round(hg) << 8) | Math.round(hb),
    zenith: (Math.round(zr) << 16) | (Math.round(zg) << 8) | Math.round(zb),
    fogScale,
    windScale,
    windDirectionDeg: (Math.atan2(windDirX, windDirZ) * 180) / Math.PI,
  };
}

/** Ruído leve pra variar a densidade dentro da mesma zona. */
export const clumpiness = (x, z, seed) => (fbm2D(x * 0.0016, z * 0.0016, seed + 5501, 2, 2, 0.5) + 1) * 0.5;
