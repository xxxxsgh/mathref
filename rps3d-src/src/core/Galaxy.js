// Galáxia procedural por seed — DADOS puros (sem Three). É a fonte única da
// verdade sobre o que existe no universo: sistemas, estrelas, planetas, luas,
// cinturões e estações. Renderização e jogabilidade leem daqui.
//
// Unidades: metros e segundos. Cada sistema tem o próprio referencial com a
// estrela em (0,0,0). O núcleo cuida da origem flutuante (World.js).
//
// Escala "percebida": planetas rochosos com 30–110 km de raio, gigantes
// gasosos com 350–900 km, órbitas de 2.000–40.000 km. Grande o bastante para
// a curvatura e a atmosfera impressionarem, pequeno o bastante para a viagem
// quântica levar segundos.

import { makeRng, hash } from './Rng.js';

export const BIOMES = {
  lush: {
    label: 'Exuberante',
    landable: true,
    atmosphere: { density: 1.0, rayleigh: [5.8, 13.5, 33.1], mie: 21, mieG: 0.76, heightFrac: 0.12, tint: [0.55, 0.75, 1.0] },
    clouds: { coverage: 0.5, color: [1, 1, 1] },
    seaLevel: 0.0,
    palette: { deep: '#0a3550', shallow: '#1f8a8a', beach: '#cdbb7e', low: '#2f6b2a', mid: '#5c8f2f', high: '#6d6a52', peak: '#e6eef0', accent: '#b23cff' },
    temperature: 22,
    hazards: [],
    weather: ['clear', 'rain', 'storm', 'fog'],
  },
  desert: {
    label: 'Desértico',
    landable: true,
    atmosphere: { density: 0.7, rayleigh: [14, 9.5, 5.5], mie: 40, mieG: 0.8, heightFrac: 0.09, tint: [1.0, 0.78, 0.5] },
    clouds: { coverage: 0.12, color: [1, 0.92, 0.82] },
    seaLevel: null,
    palette: { deep: '#6b3a1e', shallow: '#8a4a22', beach: '#d9a066', low: '#c98a4b', mid: '#b5683a', high: '#8c4a2f', peak: '#e8c49a', accent: '#ff6a1a' },
    temperature: 58,
    hazards: ['heat', 'sandstorm', 'worms'],
    weather: ['clear', 'sandstorm', 'haze'],
  },
  ice: {
    label: 'Gelado',
    landable: true,
    atmosphere: { density: 0.8, rayleigh: [6.5, 14.5, 30], mie: 12, mieG: 0.7, heightFrac: 0.1, tint: [0.7, 0.85, 1.0] },
    clouds: { coverage: 0.65, color: [0.95, 0.97, 1] },
    seaLevel: -0.2,
    palette: { deep: '#14324f', shallow: '#3c7aa8', beach: '#bcd6ea', low: '#d7e6f2', mid: '#a9c5dc', high: '#7d98b3', peak: '#ffffff', accent: '#5fe3ff' },
    temperature: -48,
    hazards: ['cold', 'blizzard'],
    weather: ['clear', 'snow', 'blizzard'],
  },
  volcanic: {
    label: 'Vulcânico',
    landable: true,
    atmosphere: { density: 1.3, rayleigh: [18, 8, 4], mie: 60, mieG: 0.82, heightFrac: 0.1, tint: [1.0, 0.5, 0.3] },
    clouds: { coverage: 0.55, color: [0.25, 0.22, 0.22] },
    seaLevel: -0.1, // "mar" de lava
    lavaSea: true,
    palette: { deep: '#ff4a00', shallow: '#ff8a1a', beach: '#2a2220', low: '#1d1715', mid: '#33281f', high: '#4a3a2f', peak: '#6b5b4f', accent: '#ffb000' },
    temperature: 140,
    hazards: ['heat', 'ash', 'geysers'],
    weather: ['ash', 'clear', 'ashstorm'],
  },
  toxic: {
    label: 'Tóxico',
    landable: true,
    atmosphere: { density: 1.6, rayleigh: [8, 22, 6], mie: 70, mieG: 0.8, heightFrac: 0.13, tint: [0.6, 1.0, 0.35] },
    clouds: { coverage: 0.7, color: [0.75, 0.9, 0.45] },
    seaLevel: -0.05,
    acidSea: true,
    palette: { deep: '#2a3d0a', shallow: '#6d8f12', beach: '#3a3a1a', low: '#3f4a1c', mid: '#5a5f22', high: '#4a3f2a', peak: '#9aa36a', accent: '#39ff9a' },
    temperature: 36,
    hazards: ['toxic', 'acidrain'],
    weather: ['fog', 'acidrain', 'clear'],
  },
  ocean: {
    label: 'Oceânico',
    landable: true,
    atmosphere: { density: 1.1, rayleigh: [5.2, 12.5, 34], mie: 18, mieG: 0.75, heightFrac: 0.12, tint: [0.5, 0.75, 1.0] },
    clouds: { coverage: 0.6, color: [1, 1, 1] },
    seaLevel: 0.35,
    palette: { deep: '#03203f', shallow: '#0f6c93', beach: '#e6d7a5', low: '#3a8a3a', mid: '#5f9a3c', high: '#7a7a62', peak: '#d9e2e0', accent: '#00f0d0' },
    temperature: 26,
    hazards: ['storm'],
    weather: ['clear', 'rain', 'storm'],
  },
  dead: {
    label: 'Morto/Irradiado',
    landable: true,
    atmosphere: { density: 0.25, rayleigh: [9, 9, 12], mie: 8, mieG: 0.7, heightFrac: 0.06, tint: [0.8, 0.8, 0.9] },
    clouds: { coverage: 0.05, color: [0.6, 0.6, 0.65] },
    seaLevel: null,
    palette: { deep: '#2a2a30', shallow: '#3a3a40', beach: '#55555c', low: '#5d5a58', mid: '#76716a', high: '#8f8a80', peak: '#b7b2a6', accent: '#7af0ff' },
    temperature: -10,
    hazards: ['radiation', 'electricstorm'],
    weather: ['clear', 'electricstorm'],
  },
  gas: {
    label: 'Gigante gasoso',
    landable: false,
    atmosphere: { density: 2.0, rayleigh: [6, 10, 22], mie: 30, mieG: 0.8, heightFrac: 0.05, tint: [0.9, 0.8, 0.6] },
    clouds: { coverage: 1, color: [1, 0.9, 0.75] },
    seaLevel: null,
    palette: { deep: '#6b4a2a', shallow: '#a9784a', beach: '#d9b98a', low: '#efe2c4', mid: '#c48a5a', high: '#8a5a3a', peak: '#f5ecd8', accent: '#ff9a5a' },
    temperature: -120,
    hazards: ['pressure'],
    weather: ['storm'],
  },
};

export const STAR_TYPES = {
  red_dwarf: { label: 'Anã vermelha', color: [1.0, 0.45, 0.25], temp: 3200, radius: 1.2e5, lum: 0.6 },
  yellow: { label: 'Anã amarela', color: [1.0, 0.92, 0.8], temp: 5800, radius: 2.0e5, lum: 1.0 },
  orange: { label: 'Anã laranja', color: [1.0, 0.75, 0.5], temp: 4500, radius: 1.7e5, lum: 0.85 },
  blue_giant: { label: 'Gigante azul', color: [0.62, 0.75, 1.0], temp: 22000, radius: 6.0e5, lum: 2.2 },
  white_dwarf: { label: 'Anã branca', color: [0.9, 0.95, 1.0], temp: 9000, radius: 0.5e5, lum: 0.7 },
  binary: { label: 'Estrela binária', color: [1.0, 0.85, 0.7], temp: 6000, radius: 1.8e5, lum: 1.4 },
  black_hole: { label: 'Buraco negro', color: [1.0, 0.7, 0.4], temp: 0, radius: 8.0e4, lum: 0.5 }, // luz vem do disco de acreção
};

export const FACTIONS = {
  hegemony: { label: 'Hegemonia Solar', color: '#f2e6c4', accent: '#d4a73a' },
  free: { label: 'Frente Livre', color: '#d0563a', accent: '#f2a03a' },
  corsairs: { label: 'Corsários do Vazio', color: '#3a3a44', accent: '#c4202a' },
  guild: { label: 'Guilda dos Mercadores', color: '#2a6aa8', accent: '#e0e6ee' },
  watchers: { label: 'Os Vigilantes', color: '#101418', accent: '#5ff3ff' },
};

const SYL_A = ['Or', 'Ka', 'Ve', 'Tha', 'Ly', 'Ser', 'Ar', 'Ny', 'Cal', 'Zer', 'Mi', 'Ho', 'Ae', 'Ix', 'Pra', 'Dra', 'Sol', 'Ul', 'Ke', 'Bel'];
const SYL_B = ['ion', 'ara', 'eth', 'ys', 'on', 'ane', 'ix', 'or', 'ea', 'um', 'is', 'ar', 'en', 'oth', 'ira', 'el'];
function makeName(r) {
  let n = r.pick(SYL_A) + r.pick(SYL_B);
  if (r.chance(0.35)) n += '-' + r.int(2, 99);
  return n;
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

function body(id, kind, name, biome, radius, orbitRadius, orbitAngle, seed, extra = {}) {
  const b = BIOMES[biome];
  return {
    id,
    kind, // 'planet' | 'moon' | 'gas_giant'
    name,
    biome,
    biomeLabel: b.label,
    radius,
    orbitRadius,
    orbitAngle,
    orbitIncl: 0,
    orbitSpeed: 0, // rad/s — mundo "congelado" por padrão (posições estáveis entre sessões)
    axialTilt: 0.2,
    dayLength: 1200, // s — dia completo em 20 min
    landable: b.landable,
    seed,
    atmosphere: { ...b.atmosphere, height: radius * b.atmosphere.heightFrac },
    clouds: { ...b.clouds },
    seaLevel: b.seaLevel, // fração da amplitude do relevo; null = sem mar
    palette: { ...b.palette },
    temperature: b.temperature,
    hazards: [...b.hazards],
    weather: [...b.weather],
    terrain: { amplitude: radius * 0.012, roughness: 0.5, ridges: 0.5, craters: biome === 'dead' ? 0.8 : 0.1 },
    rings: null,
    parent: null,
    ...extra,
  };
}

/** Posição do corpo no referencial do sistema (metros). Moons somam a do pai. */
export function bodyPosition(sys, b, t = 0, out = { x: 0, y: 0, z: 0 }) {
  const a = b.orbitAngle + b.orbitSpeed * t;
  let x = Math.cos(a) * b.orbitRadius;
  let z = Math.sin(a) * b.orbitRadius;
  let y = Math.sin(a) * b.orbitRadius * Math.sin(b.orbitIncl || 0);
  if (b.parent) {
    const p = sys.bodies.find((q) => q.id === b.parent);
    const pp = bodyPosition(sys, p, t);
    x += pp.x;
    y += pp.y;
    z += pp.z;
  }
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

// ─── sistemas fixos da campanha ────────────────────────────────────────────

/** Fenda de Órion — sistema inicial da fatia vertical: Orfeu. */
function makeOrfeu() {
  const seed = hash('orfeu');
  const sys = {
    id: 'orfeu',
    name: 'Orfeu',
    region: 'Fenda de Órion',
    seed,
    galPos: [0, 0, 0],
    star: { type: 'orange', ...STAR_TYPES.orange, name: 'Orfeu' },
    control: { hegemony: 0.25, free: 0.35, corsairs: 0.2, guild: 0.2 },
    economy: 'frontier',
    nebula: { color1: [0.55, 0.15, 0.45], color2: [0.1, 0.35, 0.6], density: 0.8 },
    bodies: [],
    belts: [],
    stations: [],
    events: [],
  };
  sys.bodies.push(
    body('talia', 'planet', 'Tália', 'lush', 62000, 9.0e6, 0.4, hash('talia'), { axialTilt: 0.35, dayLength: 1500 }),
    body('areth', 'planet', 'Areth', 'desert', 54000, 4.6e6, 2.3, hash('areth'), { axialTilt: 0.1, dayLength: 1100 }),
    body('nivalis', 'planet', 'Nivalis', 'ice', 46000, 1.6e7, -1.1, hash('nivalis'), { axialTilt: 0.5, dayLength: 1800 }),
    body('typhon', 'gas_giant', 'Tífon', 'gas', 640000, 2.9e7, 1.2, hash('typhon'), {
      landable: false,
      rings: { inner: 1.35, outer: 2.3, color: [0.85, 0.75, 0.6], opacity: 0.7 },
      axialTilt: 0.25,
    }),
    body('selene', 'moon', 'Selene (Tália I)', 'dead', 21000, 260000, 1.9, hash('selene'), { parent: 'talia', dayLength: 2400 }),
  );
  sys.belts.push({ id: 'orfeu-belt', name: 'Cinturão de Orfeu', innerR: 1.95e7, outerR: 2.25e7, thickness: 4.0e5, count: 4000, composition: ['ferro', 'níquel', 'gelo', 'titânio'] });
  sys.stations.push(
    { id: 'mercator', name: 'Estação Mercator', faction: 'guild', kind: 'orbital', parentBody: 'talia', orbitRadius: 150000, angle: 0.6 },
    { id: 'refugio', name: 'Refúgio de Cinza', faction: 'free', kind: 'asteroid_base', parentBody: null, orbitRadius: 2.1e7, angle: 0.9 },
    { id: 'aerostat-typhon', name: 'Colheitadeira Nimbus', faction: 'guild', kind: 'floating', parentBody: 'typhon', orbitRadius: 640000 * 1.02, angle: 0.3 },
  );
  return sys;
}

/** Halcyon — sistema da Hegemonia onde o jogo começa (a ordem de bombardeio). */
function makeHalcyon() {
  const sys = {
    id: 'halcyon',
    name: 'Halcyon',
    region: 'Núcleo da Hegemonia',
    seed: hash('halcyon'),
    galPos: [-180, 4, 260],
    star: { type: 'yellow', ...STAR_TYPES.yellow, name: 'Halcyon' },
    control: { hegemony: 0.95, free: 0.05, corsairs: 0, guild: 0 },
    economy: 'industrial',
    nebula: { color1: [0.2, 0.25, 0.55], color2: [0.6, 0.35, 0.15], density: 0.5 },
    bodies: [
      // Esperança — a colônia civil que a Hegemonia mandou bombardear.
      body('esperanca', 'planet', 'Nova Esperança', 'ocean', 70000, 8.0e6, 0.2, hash('esperanca'), { axialTilt: 0.3, dayLength: 1400 }),
      body('halcyon-b', 'gas_giant', 'Auric', 'gas', 520000, 1.9e7, 2.6, hash('auric'), { landable: false }),
    ],
    belts: [],
    stations: [],
    events: [],
  };
  return sys;
}

// ─── procedural ────────────────────────────────────────────────────────────

const PROC_BIOMES = ['lush', 'desert', 'ice', 'volcanic', 'toxic', 'ocean', 'dead'];
const PROC_STARS = ['red_dwarf', 'red_dwarf', 'yellow', 'orange', 'orange', 'blue_giant', 'white_dwarf', 'binary', 'black_hole'];

function makeProcedural(index, galaxySeed) {
  const seed = hash(galaxySeed, 'sys', index);
  const r = makeRng(seed);
  const starType = r.pick(PROC_STARS);
  const name = makeName(r);
  const ang = r() * Math.PI * 2;
  const rad = 40 + Math.sqrt(r()) * 900;
  const sys = {
    id: 'sys-' + index,
    name,
    region: rad < 400 ? 'Fenda de Órion' : 'Fronteira Exterior',
    seed,
    galPos: [Math.cos(ang) * rad, r.range(-20, 20), Math.sin(ang) * rad],
    star: { type: starType, ...STAR_TYPES[starType], name },
    control: { hegemony: r() * 0.6, free: r() * 0.5, corsairs: r() * 0.5, guild: r() * 0.4 },
    economy: r.pick(['mining', 'agri', 'industrial', 'tech', 'frontier']),
    nebula: { color1: [r(), r() * 0.5, r()], color2: [r() * 0.5, r(), r()], density: r.range(0.2, 1) },
    bodies: [],
    belts: [],
    stations: [],
    events: [],
  };
  if (starType === 'binary') sys.star.companion = { color: [0.7, 0.8, 1.0], radius: 1.1e5, separation: 1.2e6 };
  const n = r.int(2, 8);
  let orbit = r.range(3e6, 5e6);
  for (let i = 0; i < n; i++) {
    const gas = i >= n - 2 && r.chance(0.5);
    const biome = gas ? 'gas' : r.pick(PROC_BIOMES);
    const radius = gas ? r.range(3.5e5, 9e5) : r.range(30000, 110000);
    const b = body(`${sys.id}-p${i}`, gas ? 'gas_giant' : 'planet', `${name} ${ROMAN[i]}`, biome, radius, orbit, r() * Math.PI * 2, hash(seed, 'p', i), {
      axialTilt: r.range(0, 0.6),
      dayLength: r.range(900, 2600),
    });
    if (gas && r.chance(0.5)) b.rings = { inner: r.range(1.3, 1.6), outer: r.range(1.9, 2.6), color: [r.range(0.6, 1), r.range(0.5, 0.9), r.range(0.4, 0.8)], opacity: r.range(0.4, 0.85) };
    sys.bodies.push(b);
    const moons = gas ? r.int(0, 3) : r.int(0, 1);
    for (let m = 0; m < moons; m++) {
      const mb = r.pick(['dead', 'ice', 'volcanic', 'desert']);
      sys.bodies.push(body(`${b.id}-m${m}`, 'moon', `${b.name}-${String.fromCharCode(97 + m)}`, mb, r.range(14000, 30000), radius * r.range(3, 7), r() * Math.PI * 2, hash(seed, 'm', i, m), { parent: b.id }));
    }
    orbit *= r.range(1.4, 1.9);
    if (r.chance(0.2) && sys.belts.length === 0) {
      sys.belts.push({ id: `${sys.id}-belt`, name: `Cinturão de ${name}`, innerR: orbit * 0.9, outerR: orbit * 1.05, thickness: 3e5, count: 3000, composition: ['ferro', 'níquel', 'gelo'] });
      orbit *= 1.3;
    }
  }
  const landables = sys.bodies.filter((b) => b.kind === 'planet');
  if (landables.length && r.chance(0.8)) {
    const host = r.pick(landables);
    const fac = r.pick(['guild', 'guild', 'hegemony', 'free', 'corsairs']);
    sys.stations.push({ id: `${sys.id}-st`, name: `${fac === 'hegemony' ? 'Bastião' : fac === 'corsairs' ? 'Covil' : 'Estação'} ${makeName(r)}`, faction: fac, kind: 'orbital', parentBody: host.id, orbitRadius: host.radius * 2.6, angle: r() * 6.28 });
  }
  const gas = sys.bodies.find((b) => b.kind === 'gas_giant');
  if (gas && r.chance(0.6)) sys.stations.push({ id: `${sys.id}-aero`, name: `Aeróstato ${makeName(r)}`, faction: 'guild', kind: 'floating', parentBody: gas.id, orbitRadius: gas.radius * 1.02, angle: r() * 6.28 });
  return sys;
}

export class Galaxy {
  constructor(seed = 'fenda-de-orion') {
    this.seed = seed;
    this.count = 240;
    this.cache = new Map();
    this.fixed = { orfeu: makeOrfeu, halcyon: makeHalcyon };
  }
  /** Lista leve de todos os sistemas (para o mapa galáctico). */
  list() {
    const out = ['orfeu', 'halcyon'].map((id) => this.get(id));
    for (let i = 0; i < this.count; i++) out.push(this.get('sys-' + i));
    return out;
  }
  get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    let sys;
    if (this.fixed[id]) sys = this.fixed[id]();
    else if (id.startsWith('sys-')) sys = makeProcedural(Number(id.slice(4)), this.seed);
    else throw new Error('sistema desconhecido: ' + id);
    this.cache.set(id, sys);
    return sys;
  }
  /** Sistemas dentro do alcance de salto (anos-luz) a partir de `fromId`. */
  neighbors(fromId, range = 120) {
    const a = this.get(fromId).galPos;
    return this.list().filter((s) => s.id !== fromId && Math.hypot(s.galPos[0] - a[0], s.galPos[1] - a[1], s.galPos[2] - a[2]) <= range);
  }
}
