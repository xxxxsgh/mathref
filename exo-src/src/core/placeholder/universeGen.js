/**
 * Gerador PLACEHOLDER de galáxia/sistema (puro, testável em node). O sistema
 * `universe` substitui tudo isto; o formato dos dados é o do CONTRACT.md
 * (serviço `universe`), e serve de referência.
 *
 * ESCALA (documentada no CONTRACT.md):
 *   - planetas e luas em METROS reais: raio 60–200 km;
 *   - sistema COMPRIMIDO: vizinhos a 4e6–6e7 m do planeta atual (30–400
 *     raios), luas a 5–9 raios do planeta-mãe, estrela a ~3e9 m com raio
 *     calibrado para ~0,6° no céu;
 *   - referencial do mundo = fixo no planeta atual (centro na origem).
 */
import { WorldPos } from '../Space.js';

/** Classes espectrais: faixa de temperatura (K), peso de sorteio, intensidade relativa. */
export const SPECTRAL = {
  O: { t: [30000, 40000], w: 0.15, lum: 1.6 },
  B: { t: [10000, 30000], w: 0.6, lum: 1.4 },
  A: { t: [7500, 10000], w: 1.5, lum: 1.2 },
  F: { t: [6000, 7500], w: 3, lum: 1.1 },
  G: { t: [5200, 6000], w: 4, lum: 1.0 },
  K: { t: [3700, 5200], w: 3, lum: 0.85 },
  M: { t: [2400, 3700], w: 2, lum: 0.65 },
};

/** Temperatura de cor (K) → RGB LINEAR normalizado (máx = 1). Aproximação de Tanner Helland. */
export function kelvinToRGB(K) {
  const t = K / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const lin = (v) => {
    const c = Math.max(0, Math.min(255, v)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const out = [lin(r), lin(g), lin(b)];
  const m = Math.max(...out) || 1;
  return out.map((v) => v / m);
}

export const BIOMES = ['lush', 'barren', 'frozen', 'toxic', 'scorched', 'exotic', 'ocean', 'radioactive'];

const SYL = ['ka', 've', 'lo', 'ri', 'tha', 'mu', 'zen', 'or', 'is', 'ae', 'qu', 'ny', 'sol', 'dra', 'phe', 'xi', 'ul', 'an', 'te', 'mor'];
export function makeName(rng, min = 2, max = 3) {
  const n = rng.int(min, max);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(SYL);
  return s[0].toUpperCase() + s.slice(1);
}

/** Atmosfera padrão para um planeta de raio R (m): mesma espessura óptica zenital da Terra. */
export function defaultAtmosphere(R, tint = 1) {
  const Hr = R * 0.025;
  const Hm = R * 0.005;
  const kr = 8000 / Hr;
  const km = 1200 / Hm;
  return {
    radius: R * 1.1,
    rayleigh: [5.8e-6 * kr * tint, 13.5e-6 * kr, 33.1e-6 * kr],
    rayleighHeight: Hr,
    mie: 21e-6 * km,
    mieHeight: Hm,
    mieG: 0.76,
    sunIntensity: 12,
  };
}

/** Galáxia (placeholder): só metadados. */
export function generateGalaxy(seed, index = 0) {
  const r = seed.derive('galaxy', index);
  return { index, id: `g${index}`, name: makeName(r, 2, 3), systemCount: 1 << 16 };
}

/**
 * Sistema estelar. `planetIndex` = planeta atual (fica na origem do mundo).
 * Retorna { id, index, galaxy, name, stars[], planets[], belts[], bodies[] }.
 */
export function generateSystem(seed, { galaxy = 0, systemIndex = 0, planetIndex = 0 } = {}) {
  const r = seed.derive('galaxy', galaxy, 'system', systemIndex);
  const cls = r.weighted(Object.entries(SPECTRAL).map(([k, v]) => [k, v.w]));
  const sp = SPECTRAL[cls];
  const temperature = r.range(sp.t[0], sp.t[1]);
  const color = kelvinToRGB(temperature);
  const starDist = 3e9;
  const starRadius = starDist * Math.tan((r.range(0.5, 0.75) * Math.PI) / 180 / 2) * 2;
  // direção inercial da estrela vista do planeta: perto do equador (declinação baixa)
  const decl = r.range(-0.25, 0.25);
  const lon = r.range(0, Math.PI * 2);
  const starDir = [Math.cos(decl) * Math.cos(lon), Math.sin(decl), -Math.cos(decl) * Math.sin(lon)];
  const star = {
    id: `g${galaxy}.s${systemIndex}.star0`,
    kind: 'star',
    name: makeName(r.derive('starname')),
    class: cls,
    spectralClass: cls,
    temperature,
    color,
    intensity: sp.lum,
    radius: starRadius,
    /** posição INERCIAL (o céu gira com a hora do dia; ver serviço sky) */
    position: new WorldPos(starDir[0] * starDist, starDir[1] * starDist, starDir[2] * starDist),
  };
  const n = r.int(3, 6);
  const planets = [];
  for (let k = 0; k < n; k++) {
    const pr = r.derive('planet', k);
    const radius = k === planetIndex && k === 0 ? pr.range(110000, 140000) : pr.range(60000, 200000);
    const biome = k === 0 ? 'lush' : pr.pick(BIOMES);
    const planet = {
      id: `g${galaxy}.s${systemIndex}.p${k}`,
      kind: 'planet',
      index: k,
      name: makeName(pr.derive('name')),
      seed: seed.hash('galaxy', galaxy, 'system', systemIndex, 'planet', k),
      radius,
      biome,
      gravity: 9.8 * Math.sqrt(radius / 120000),
      seaLevel: biome === 'ocean' || biome === 'lush' ? 0 : null,
      atmosphere: biome === 'barren' ? null : defaultAtmosphere(radius, biome === 'scorched' ? 2.5 : 1),
      rings: k !== 0 && pr.chance(0.35) ? { inner: radius * pr.range(1.3, 1.6), outer: radius * pr.range(1.9, 2.6), color: [0.8, 0.72, 0.6], tilt: pr.range(-0.5, 0.5) } : null,
      moons: [],
      position: new WorldPos(),
      /** posição "toy" relativa ao planeta 0, antes de recentrar */
      _offset: null,
    };
    if (k === 0) planet._offset = [0, 0, 0];
    else {
      const d = pr.range(4e6, 6e7) * (0.6 + k * 0.25);
      const v = pr.unitVector();
      v[1] *= 0.25; // perto do plano da eclíptica
      const l = Math.hypot(...v);
      planet._offset = v.map((x) => (x / l) * d);
    }
    const nm = k === 0 ? pr.int(1, 2) : pr.int(0, 2);
    for (let m = 0; m < nm; m++) {
      const mr = pr.derive('moon', m);
      const mRadius = m === 0 && k === 0 ? mr.range(32000, 45000) : mr.range(12000, 40000);
      const dist = radius * mr.range(5, 9) + mRadius;
      const v = mr.unitVector();
      v[1] *= 0.4;
      const l = Math.hypot(...v);
      planet.moons.push({
        id: `${planet.id}.m${m}`,
        kind: 'moon',
        index: m,
        parent: planet.id,
        name: makeName(mr.derive('name')),
        seed: seed.hash('galaxy', galaxy, 'system', systemIndex, 'planet', k, 'moon', m),
        radius: mRadius,
        biome: mr.pick(['barren', 'frozen', 'scorched']),
        _rel: v.map((x) => (x / l) * dist),
        position: new WorldPos(),
      });
    }
    planets.push(planet);
  }
  // recentra: planeta atual na origem
  const cur = planets[Math.min(planetIndex, planets.length - 1)];
  const o = cur._offset;
  for (const p of planets) {
    p.position.set(p._offset[0] - o[0], p._offset[1] - o[1], p._offset[2] - o[2]);
    for (const m of p.moons) m.position.set(p.position.x + m._rel[0], p.position.y + m._rel[1], p.position.z + m._rel[2]);
  }
  const belts = r.chance(0.4) ? [{ id: `g${galaxy}.s${systemIndex}.belt0`, kind: 'belt', inner: 8e7, outer: 1.2e8 }] : [];
  const bodies = [star];
  for (const p of planets) {
    bodies.push(p);
    for (const m of p.moons) bodies.push(m);
  }
  return {
    id: `g${galaxy}.s${systemIndex}`,
    index: systemIndex,
    galaxy,
    name: makeName(r.derive('name')),
    stars: [star],
    planets,
    belts,
    bodies,
    currentPlanetIndex: planets.indexOf(cur),
  };
}
