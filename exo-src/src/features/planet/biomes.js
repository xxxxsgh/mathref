/**
 * BIOMAS (puro). Cada planeta escolhe UM bioma (pela seed do universe, ou
 * `params.biome` num preset) e tem variação regional (umidade, temperatura,
 * paleta A↔B, regiões secas). Paletas em RGB LINEAR, fortemente saturadas e
 * contrastantes — a assinatura visual de cada mundo.
 *
 * `style` controla a FORMA do relevo (terrain.js) e `features` a chance, por
 * região (~0,1 km²), de arcos, arcos flutuantes, rochas suspensas e cavernas.
 */
import { hash32, unit } from './noise.js';

export const BIOMES = {
  lush: {
    name: 'exuberante',
    temperature: 24, humidity: 0.75, flora: 0.95, fauna: 0.9,
    sea: 0,
    palette: {
      grass: [0.07, 0.25, 0.025], grass2: [0.02, 0.17, 0.07], dry: [0.3, 0.27, 0.045],
      rock: [0.15, 0.16, 0.18], rock2: [0.3, 0.24, 0.17], sand: [0.6, 0.5, 0.3],
      snow: [0.86, 0.9, 0.96], water: [0.01, 0.13, 0.17], deep: [0.0, 0.025, 0.06], seabed: [0.12, 0.18, 0.1],
      sky: [0.3, 0.55, 1.0], accent: [0.9, 0.35, 0.5],
    },
    style: {
      landBias: -0.08, warp: 5000, hillAmp: 380, hillWave: 2600, ridgeAmp: 1500, ridgeWave: 8000, mountains: 0.85,
      canyons: 0.2, canyonDepth: 220, plateaus: 0.08, terraceStep: 70, spires: 0.1, billow: 0, craters: 0,
      snowLine: 1350, rockSlope: 0.3, sandAmount: 0.15, strata: 0.35,
    },
    features: { arch: 0.035, floatArch: 0.01, floating: 0.03, cave: 0.04 },
  },
  frozen: {
    name: 'congelado',
    temperature: -38, humidity: 0.5, flora: 0.25, fauna: 0.3,
    sea: null,
    palette: {
      grass: [0.62, 0.74, 0.92], grass2: [0.4, 0.56, 0.86], dry: [0.5, 0.58, 0.72],
      rock: [0.07, 0.1, 0.2], rock2: [0.2, 0.26, 0.42], sand: [0.6, 0.7, 0.86],
      snow: [0.86, 0.92, 1.0], water: [0.25, 0.5, 0.72], deep: [0.04, 0.12, 0.25], seabed: [0.3, 0.4, 0.55],
      sky: [0.55, 0.7, 1.0], accent: [0.5, 0.2, 0.7],
    },
    style: {
      landBias: 0.3, warp: 6000, hillAmp: 420, hillWave: 2400, ridgeAmp: 2000, ridgeWave: 7000, mountains: 1,
      canyons: 0.1, canyonDepth: 200, plateaus: 0.15, terraceStep: 90, spires: 0.05, billow: 0, craters: 0,
      snowLine: -400, rockSlope: 0.4, sandAmount: 0, strata: 0.2,
    },
    features: { arch: 0.02, floatArch: 0.005, floating: 0.01, cave: 0.05 },
  },
  toxic: {
    name: 'tóxico',
    temperature: 41, humidity: 0.9, flora: 0.7, fauna: 0.5,
    sea: 0,
    palette: {
      grass: [0.42, 0.58, 0.015], grass2: [0.16, 0.42, 0.03], dry: [0.5, 0.4, 0.03],
      rock: [0.09, 0.05, 0.11], rock2: [0.22, 0.12, 0.2], sand: [0.45, 0.42, 0.08],
      snow: [0.75, 0.85, 0.5], water: [0.06, 0.24, 0.01], deep: [0.012, 0.05, 0.0], seabed: [0.18, 0.25, 0.04],
      sky: [0.65, 0.8, 0.25], accent: [0.6, 0.1, 0.8], emissiveWater: [0.05, 0.18, 0.0],
    },
    style: {
      landBias: 0.25, warp: 4000, hillAmp: 300, hillWave: 1900, ridgeAmp: 700, ridgeWave: 6000, mountains: 0.6,
      canyons: 0.2, canyonDepth: 160, plateaus: 0.1, terraceStep: 50, spires: 0, billow: 1, craters: 0,
      snowLine: 99999, rockSlope: 0.33, sandAmount: 0.25, strata: 0.2,
    },
    features: { arch: 0.04, floatArch: 0.02, floating: 0.04, cave: 0.06 },
  },
  radioactive: {
    name: 'radioativo',
    temperature: 30, humidity: 0.35, flora: 0.55, fauna: 0.4,
    sea: null,
    palette: {
      grass: [0.62, 0.32, 0.01], grass2: [0.5, 0.56, 0.02], dry: [0.55, 0.45, 0.12],
      rock: [0.07, 0.09, 0.04], rock2: [0.2, 0.2, 0.07], sand: [0.55, 0.45, 0.14],
      snow: [0.8, 0.85, 0.6], water: [0.2, 0.32, 0.02], deep: [0.04, 0.08, 0.0], seabed: [0.2, 0.2, 0.05],
      sky: [0.75, 0.8, 0.35], accent: [0.2, 0.9, 0.3],
    },
    style: {
      landBias: 0.4, warp: 4500, hillAmp: 350, hillWave: 2200, ridgeAmp: 1100, ridgeWave: 6500, mountains: 0.7,
      canyons: 0.35, canyonDepth: 200, plateaus: 0.45, terraceStep: 45, spires: 0.25, billow: 0.4, craters: 0.3,
      snowLine: 99999, rockSlope: 0.3, sandAmount: 0.3, strata: 0.6,
    },
    features: { arch: 0.04, floatArch: 0.015, floating: 0.03, cave: 0.05 },
  },
  scorched: {
    name: 'escaldante',
    temperature: 78, humidity: 0.08, flora: 0.2, fauna: 0.25,
    sea: null,
    palette: {
      grass: [0.5, 0.13, 0.03], grass2: [0.62, 0.27, 0.06], dry: [0.55, 0.22, 0.06],
      rock: [0.3, 0.075, 0.03], rock2: [0.55, 0.25, 0.09], sand: [0.68, 0.38, 0.15],
      snow: [0.85, 0.7, 0.55], water: [0.3, 0.08, 0.02], deep: [0.1, 0.02, 0.0], seabed: [0.3, 0.12, 0.05],
      sky: [0.95, 0.55, 0.3], accent: [1.0, 0.5, 0.1],
    },
    style: {
      landBias: 0.6, warp: 5000, hillAmp: 220, hillWave: 2600, ridgeAmp: 900, ridgeWave: 7500, mountains: 0.55,
      canyons: 1, canyonDepth: 340, plateaus: 0.9, terraceStep: 55, spires: 0.3, billow: 0, craters: 0.1,
      snowLine: 99999, rockSlope: 0.26, sandAmount: 0.35, strata: 1,
    },
    features: { arch: 0.07, floatArch: 0.015, floating: 0.02, cave: 0.05 },
  },
  dead: {
    name: 'morto',
    temperature: -12, humidity: 0.02, flora: 0.02, fauna: 0.02,
    sea: null,
    palette: {
      grass: [0.24, 0.23, 0.21], grass2: [0.3, 0.27, 0.23], dry: [0.36, 0.33, 0.28],
      rock: [0.1, 0.1, 0.11], rock2: [0.2, 0.19, 0.18], sand: [0.42, 0.39, 0.34],
      snow: [0.7, 0.72, 0.75], water: [0.05, 0.06, 0.07], deep: [0.01, 0.01, 0.02], seabed: [0.15, 0.15, 0.15],
      sky: [0.4, 0.42, 0.5], accent: [0.6, 0.6, 0.6],
    },
    style: {
      landBias: 0.6, warp: 3500, hillAmp: 260, hillWave: 2800, ridgeAmp: 900, ridgeWave: 9000, mountains: 0.5,
      canyons: 0.2, canyonDepth: 200, plateaus: 0.2, terraceStep: 80, spires: 0.05, billow: 0, craters: 1,
      snowLine: 99999, rockSlope: 0.28, sandAmount: 0.5, strata: 0.3,
    },
    features: { arch: 0.03, floatArch: 0.01, floating: 0.01, cave: 0.04 },
  },
  exotic: {
    name: 'exótico',
    temperature: 18, humidity: 0.6, flora: 0.8, fauna: 0.6,
    sea: 0,
    palette: {
      grass: [0.48, 0.035, 0.34], grass2: [0.14, 0.05, 0.5], dry: [0.6, 0.2, 0.45],
      rock: [0.05, 0.28, 0.3], rock2: [0.16, 0.46, 0.44], sand: [0.6, 0.48, 0.7],
      snow: [0.85, 0.85, 1.0], water: [0.05, 0.03, 0.2], deep: [0.01, 0.0, 0.05], seabed: [0.2, 0.1, 0.25],
      sky: [0.65, 0.42, 0.9], accent: [0.1, 1.0, 0.8],
    },
    style: {
      landBias: 0.3, warp: 4500, hillAmp: 300, hillWave: 2200, ridgeAmp: 1100, ridgeWave: 6000, mountains: 0.6,
      canyons: 0.3, canyonDepth: 200, plateaus: 0.35, terraceStep: 60, spires: 0.8, billow: 0.3, craters: 0,
      snowLine: 99999, rockSlope: 0.3, sandAmount: 0.2, strata: 0.5,
    },
    features: { arch: 0.09, floatArch: 0.06, floating: 0.09, cave: 0.04 },
  },
};

/** Biomas do universe que não existem aqui com o mesmo nome. */
const ALIAS = { barren: 'dead', ocean: 'lush', dust: 'dead', ice: 'frozen', hot: 'scorched', burning: 'scorched', irradiated: 'radioactive' };
export const BIOME_IDS = Object.keys(BIOMES);

export function resolveBiome(id, seed) {
  if (id && BIOMES[id]) return id;
  if (id && ALIAS[id]) return ALIAS[id];
  return BIOME_IDS[hash32(seed, 77) % BIOME_IDS.length];
}

// ─── variação de paleta por planeta ─────────────────────────────────────
function rgb2hsv([r, g, b]) {
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
function hsv2rgb([h, s, v]) {
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
export function shiftColor(c, dh, ds = 1, dv = 1) {
  const [h, s, v] = rgb2hsv(c);
  return hsv2rgb([(h + dh + 1) % 1, Math.min(1, s * ds), v * dv]);
}

/**
 * Configuração completa de um planeta (pura, serializável — vai para os
 * workers): { seed, radius, biome, seaLevel, style, features, palette }.
 */
export function planetConfig({ seed, radius, biome, seaLevel }) {
  seed >>>= 0;
  const id = resolveBiome(biome, seed);
  const B = BIOMES[id];
  const r = (k) => unit(hash32(seed, 4242, k));
  // variação de paleta por planeta: matiz da vegetação ±0,05, saturação e valor ±15%
  const dh = (r(1) - 0.5) * 0.1;
  const dh2 = (r(2) - 0.5) * 0.12;
  const palette = {};
  for (const [k, c] of Object.entries(B.palette)) {
    if (k === 'grass' || k === 'dry') palette[k] = shiftColor(c, dh, 0.9 + r(3) * 0.25, 0.9 + r(4) * 0.2);
    else if (k === 'grass2') palette[k] = shiftColor(c, dh2, 0.9 + r(5) * 0.25, 0.9 + r(6) * 0.2);
    else if (k === 'rock' || k === 'rock2') palette[k] = shiftColor(c, (r(7) - 0.5) * 0.06, 0.85 + r(8) * 0.3, 0.85 + r(9) * 0.3);
    else palette[k] = c.slice();
  }
  const style = { ...B.style };
  // variação de forma por planeta (±20%)
  for (const k of ['hillAmp', 'ridgeAmp', 'canyonDepth', 'terraceStep']) style[k] *= 0.85 + r(20 + k.length) * 0.35;
  return {
    seed,
    radius,
    biome: id,
    biomeName: B.name,
    seaLevel: seaLevel === undefined ? B.sea : seaLevel,
    style,
    features: { ...B.features },
    palette,
    temperature: B.temperature,
    humidity: B.humidity,
    flora: B.flora,
    fauna: B.fauna,
  };
}
