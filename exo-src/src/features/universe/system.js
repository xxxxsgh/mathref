/**
 * GERADOR DE SISTEMA ESTELAR (puro, testável em node; só usa WorldPos do núcleo).
 *
 * ESCALA COMPRIMIDA (documentada; CONTRACT.md §4):
 *   - planetas rochosos e luas em METROS reais: raio 60–200 km (pousáveis);
 *     gigantes gasosos 0,55–1,3·10⁶ m (não pousáveis, `landable: false`);
 *   - "disco local": os planetas ficam num plano (eclíptica) que contém a
 *     direção da estrela, a 1,5–4,5·10⁷ m um do outro → com o pulso de
 *     impulso a `PULSE_SPEED` = 5·10⁵ m/s a viagem entre vizinhos leva
 *     30–90 s (`travelTime(a, b)`);
 *   - luas a 5–9 raios do planeta-mãe;
 *   - estrela a ~3·10⁹ m, raio calibrado para 0,35–1,05° no céu conforme a
 *     classe (G: 0,5–0,75°, como no placeholder);
 *   - zona térmica: a projeção da posição do planeta na direção da estrela
 *     (normalizada pelo tamanho do disco) + o calor da classe espectral
 *     escolhe o bioma (quente → queimado/tóxico, temperado → exuberante/
 *     oceano/exótico, frio → congelado; gigantes preferem o lado frio);
 *   - cinturão de asteroides: anel no plano da eclíptica, centrado no
 *     baricentro do disco, entre as órbitas;
 *   - campos de detritos (halos) em volta de alguns planetas: casca entre
 *     3 e 7 raios do centro (nunca abaixo de 2 raios de altitude);
 *   - estação/âncora: em órbita do planeta 0 (chegada do salto) a ~1,9 raios.
 *
 * Referencial: o sistema é gerado com o planeta 0 na origem e depois
 * RECENTRADO no planeta atual (o mundo é fixo no planeta atual).
 *
 * Compatibilidade: a estrela e o planeta 0 (e suas luas) usam EXATAMENTE as
 * mesmas sorteadas do placeholder do núcleo (core/placeholder/universeGen.js)
 * — o sistema inicial continua com a mesma estrela G, o mesmo planeta
 * exuberante de ~110 km e as mesmas luas que os presets já enquadram.
 */
import { WorldPos } from '../../core/Space.js';
import { SPECTRAL, kelvinToRGB, makeName } from './galaxy.js';

export const STAR_DIST = 3e9;
export const PULSE_SPEED = 5e5;
export const BIOMES = ['lush', 'barren', 'frozen', 'toxic', 'scorched', 'exotic', 'ocean', 'radioactive'];

/** Atmosfera padrão para um planeta de raio R (m): mesma espessura óptica zenital da Terra (formato do contrato). */
export function defaultAtmosphere(R, tint = 1, density = 1) {
  const Hr = R * 0.025;
  const Hm = R * 0.005;
  const kr = (8000 / Hr) * density;
  const km = (1200 / Hm) * density;
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

/** Calor relativo da classe (empurra a zona habitável). */
const CLASS_HEAT = { O: 0.55, B: 0.4, A: 0.22, F: 0.1, G: 0, K: -0.12, M: -0.25 };

/** Paletas de anéis (lineares). */
const RING_COLORS = [
  [0.82, 0.74, 0.62],
  [0.7, 0.78, 0.86],
  [0.86, 0.66, 0.6],
  [0.62, 0.66, 0.58],
  [0.9, 0.84, 0.74],
];

function biomeForHeat(h, rng) {
  if (h > 0.42) return rng.weighted([['scorched', 3], ['toxic', 1], ['barren', 1]]);
  if (h > 0.16) return rng.weighted([['toxic', 2], ['scorched', 1], ['exotic', 1.2], ['radioactive', 1.2], ['lush', 0.6]]);
  if (h > -0.14) return rng.weighted([['lush', 3], ['ocean', 1.6], ['exotic', 1], ['radioactive', 0.5], ['toxic', 0.5]]);
  if (h > -0.4) return rng.weighted([['frozen', 2], ['barren', 1.5], ['radioactive', 0.6], ['lush', 0.4]]);
  return rng.weighted([['frozen', 3], ['barren', 2]]);
}

function unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Gera o sistema `index` da galáxia `galaxy` (modelo de galaxy.js).
 * @returns {{ id, index, galaxy, name, star, stars, planets, belts, fields, anchors, bodies, currentPlanetIndex, sys }}
 */
export function generateSystem(seed, galaxy, index, planetIndex = 0) {
  const g = galaxy.index;
  const info = galaxy.star(index);
  const r = seed.derive('galaxy', g, 'system', index);
  // mesmas 2 primeiras sorteadas de galaxy.star(): classe e temperatura
  r.next();
  const cls = info.cls;
  const sp = SPECTRAL[cls];
  r.next();
  const temperature = info.temperature;
  const color = kelvinToRGB(temperature);
  const angDeg = r.range(sp.ang[0], sp.ang[1]);
  const starRadius = STAR_DIST * Math.tan((angDeg * Math.PI) / 180 / 2) * 2;
  const decl = r.range(-0.25, 0.25);
  const slon = r.range(0, Math.PI * 2);
  const starDir = [Math.cos(decl) * Math.cos(slon), Math.sin(decl), -Math.cos(decl) * Math.sin(slon)];
  const sysId = `g${g}.s${index}`;
  const stars = [
    {
      id: `${sysId}.star0`,
      kind: 'star',
      name: info.name,
      class: cls,
      spectralClass: cls,
      temperature,
      color,
      intensity: sp.I,
      luminosity: sp.L,
      solarRadii: sp.R,
      radius: starRadius,
      angularSize: angDeg,
      position: new WorldPos(starDir[0] * STAR_DIST, starDir[1] * STAR_DIST, starDir[2] * STAR_DIST),
      _sys: [starDir[0] * STAR_DIST, starDir[1] * STAR_DIST, starDir[2] * STAR_DIST],
    },
  ];
  // binária: companheira mais fria e menor, a 5–18° da primária no céu
  if (info.binary) {
    const br = r.derive('companion');
    const ci = Math.min(6, Object.keys(SPECTRAL).indexOf(cls) + br.int(1, 3));
    const ccls = Object.keys(SPECTRAL)[ci];
    const csp = SPECTRAL[ccls];
    const ct = br.range(csp.t[0], csp.t[1]);
    const sep = (br.range(5, 18) * Math.PI) / 180;
    const az = br.range(0, Math.PI * 2);
    const up = [0, 1, 0];
    const e1 = unit(cross(up, starDir));
    const e2 = cross(starDir, e1);
    const cd = unit([0, 1, 2].map((k) => starDir[k] * Math.cos(sep) + (e1[k] * Math.cos(az) + e2[k] * Math.sin(az)) * Math.sin(sep)));
    const dist = STAR_DIST * br.range(1.1, 1.4);
    const cang = br.range(csp.ang[0], csp.ang[1]) * 0.85;
    stars.push({
      id: `${sysId}.star1`,
      kind: 'star',
      name: `${info.name} B`,
      class: ccls,
      spectralClass: ccls,
      temperature: ct,
      color: kelvinToRGB(ct),
      intensity: csp.I * 0.55,
      luminosity: csp.L,
      solarRadii: csp.R,
      radius: dist * Math.tan((cang * Math.PI) / 180 / 2) * 2,
      angularSize: cang,
      companion: true,
      position: new WorldPos(cd[0] * dist, cd[1] * dist, cd[2] * dist),
      _sys: [cd[0] * dist, cd[1] * dist, cd[2] * dist],
    });
  }

  // ─── eclíptica: plano que contém a direção da estrela, quase equatorial ─
  const lr = r.derive('layout');
  const tilt = lr.range(-0.12, 0.12);
  const e1 = unit([starDir[0], 0, starDir[2]]);
  const nE = unit([Math.sin(tilt) * -e1[2], Math.cos(tilt), Math.sin(tilt) * e1[0]]);
  const e2 = unit(cross(nE, e1));
  const inPlane = (rho, phi, z = 0) => [0, 1, 2].map((k) => (e1[k] * Math.cos(phi) + e2[k] * Math.sin(phi)) * rho + nE[k] * z);

  const home = index === 0;
  const n = home ? 5 : lr.weighted([[2, 0.6], [3, 1.4], [4, 1.8], [5, 1.4], [6, 0.8]]);
  const planets = [];
  // distâncias ao planeta 0 crescentes (vizinho mais perto 1,5–2,6e7 m)
  let rho = 0;
  const heat = CLASS_HEAT[cls] ?? 0;
  for (let k = 0; k < n; k++) {
    const pr = r.derive('planet', k);
    let radius;
    let biome;
    let gas = false;
    let pos;
    if (k === 0) {
      // ── planeta 0: sorteadas idênticas ao placeholder ──
      radius = pr.range(110000, 140000);
      biome = home ? 'lush' : biomeForHeat(heat + lr.range(-0.12, 0.12), lr.derive('biome0'));
      pos = [0, 0, 0];
    } else {
      rho += k === 1 ? lr.range(1.5e7, 2.4e7) : lr.range(1.2e7, 2.4e7);
      const phi = lr.range(-Math.PI, Math.PI) * (k === 1 ? 0.5 : 1);
      pos = inPlane(rho, phi, lr.range(-1, 1) * 1.2e6);
      const along = (pos[0] * starDir[0] + pos[1] * starDir[1] + pos[2] * starDir[2]) / 8e7;
      const h = heat + along * 0.45 + pr.range(-0.1, 0.1);
      gas = (home && k === 2) || (!home && pr.chance(h < 0 ? 0.42 : 0.18));
      if (gas) {
        radius = pr.range(5.5e5, 1.3e6);
        biome = 'gas';
      } else {
        radius = pr.range(60000, 200000);
        biome = biomeForHeat(h, pr.derive('biome'));
      }
      if (home && k === 1) biome = 'frozen';
    }
    const id = `${sysId}.p${k}`;
    const name = k === 0 && home ? makeName(pr.derive('name'), 2, 2) : makeName(pr.derive('name'), 2, 3);
    let atmosphere = null;
    if (gas) atmosphere = defaultAtmosphere(radius, 1, 0.6);
    else if (biome !== 'barren') atmosphere = defaultAtmosphere(radius, biome === 'scorched' ? 2.5 : 1);
    let rings = null;
    if (k !== 0) {
      const rr = pr.derive('rings');
      if ((gas && rr.chance(home ? 1 : 0.6)) || (!gas && rr.chance(0.18))) {
        rings = {
          inner: radius * rr.range(1.35, 1.65),
          outer: radius * rr.range(2.1, 2.9),
          color: rr.pick(RING_COLORS),
          tilt: rr.range(-0.55, 0.55),
          seed: rr.range(0, 100),
        };
        if (home) rings.tilt = 0.32;
      }
    }
    const planet = {
      id,
      kind: 'planet',
      index: k,
      name,
      seed: seed.hash('galaxy', g, 'system', index, 'planet', k),
      radius,
      biome,
      type: gas ? 'gas' : 'rocky',
      landable: !gas,
      gravity: gas ? 24 : 9.8 * Math.sqrt(radius / 120000),
      seaLevel: biome === 'ocean' || biome === 'lush' ? 0 : null,
      atmosphere,
      rings,
      moons: [],
      field: null,
      position: new WorldPos(),
      _sys: pos,
    };
    // luas
    const nm = k === 0 ? pr.int(1, 2) : gas ? pr.int(1, 3) : pr.int(0, 2);
    for (let m = 0; m < nm; m++) {
      const mr = pr.derive('moon', m);
      let mRadius, dist, v;
      if (k === 0) {
        // idêntico ao placeholder
        mRadius = m === 0 ? mr.range(32000, 45000) : mr.range(12000, 40000);
        dist = radius * mr.range(5, 9) + mRadius;
        v = mr.unitVector();
        v[1] *= 0.4;
      } else {
        mRadius = gas ? mr.range(25000, 70000) : mr.range(12000, 40000);
        dist = radius * (gas ? mr.range(3.2, 6) : mr.range(5, 9)) + mRadius;
        v = mr.unitVector();
        v[1] *= 0.4;
      }
      const l = Math.hypot(v[0], v[1], v[2]);
      const rel = v.map((x) => (x / l) * dist);
      const mb = mr.derive('kind').weighted([['barren', 3], ['frozen', 2], ['scorched', 1], ['toxic', 0.4]]);
      planet.moons.push({
        id: `${id}.m${m}`,
        kind: 'moon',
        index: m,
        parent: id,
        name: `${name} ${['I', 'II', 'III', 'IV'][m]}`,
        seed: seed.hash('galaxy', g, 'system', index, 'planet', k, 'moon', m),
        radius: mRadius,
        biome: mb,
        type: 'rocky',
        landable: true,
        gravity: 9.8 * Math.sqrt(mRadius / 120000),
        seaLevel: null,
        atmosphere: null,
        rings: null,
        position: new WorldPos(),
        _sys: [pos[0] + rel[0], pos[1] + rel[1], pos[2] + rel[2]],
      });
    }
    // halo de detritos
    const fr = pr.derive('field');
    if ((home && k === 0) || fr.chance(gas ? 0.6 : 0.35)) {
      planet.field = {
        inner: radius * (gas ? 2.2 : 3),
        outer: radius * (gas ? 5 : 7),
        density: fr.range(0.6, 1.2),
        seed: fr.u32(),
        tint: fr.pick([[0.42, 0.38, 0.34], [0.3, 0.36, 0.4], [0.46, 0.34, 0.3], [0.36, 0.4, 0.34]]),
      };
    }
    planets.push(planet);
  }

  // ─── cinturão principal ───────────────────────────────────────────────
  const belts = [];
  const cen = [0, 0, 0];
  for (const p of planets) for (let k = 0; k < 3; k++) cen[k] += p._sys[k] / planets.length;
  const br = r.derive('belt');
  if (home || br.chance(0.62)) {
    const maxR = Math.max(...planets.map((p) => Math.hypot(p._sys[0] - cen[0], p._sys[1] - cen[1], p._sys[2] - cen[2])), 2e7);
    const mid = maxR * br.range(0.55, 0.85);
    const width = br.range(2.5e6, 5.5e6);
    belts.push({
      id: `${sysId}.belt0`,
      kind: 'belt',
      inner: mid - width,
      outer: mid + width,
      thickness: br.range(5e5, 1.3e6),
      normal: nE.slice(),
      density: br.range(0.7, 1.3),
      seed: br.u32(),
      tint: br.pick([[0.4, 0.37, 0.33], [0.33, 0.37, 0.42], [0.44, 0.35, 0.3]]),
      center: new WorldPos(),
      _sys: cen.slice(),
    });
  }

  // ─── âncoras (estação espacial perto do planeta 0) ─────────────────────
  const anchors = [];
  const ar = r.derive('station');
  if (home || ar.chance(0.75)) {
    const p0 = planets[0];
    const toStar = starDir;
    const side = unit([toStar[0] + ar.range(-0.6, 0.6), ar.range(-0.25, 0.25), toStar[2] + ar.range(-0.6, 0.6)]);
    const d = p0.radius * ar.range(1.8, 2.1);
    anchors.push({
      id: `${sysId}.station0`,
      kind: 'station',
      name: `Estação ${makeName(ar.derive('name'), 2, 2)}`,
      parent: p0.id,
      radius: 900,
      seed: ar.u32(),
      spin: ar.range(0.01, 0.03),
      position: new WorldPos(),
      _sys: side.map((x) => x * d),
    });
  }

  const sys = {
    id: sysId,
    index,
    galaxy: g,
    name: info.name,
    class: cls,
    binary: stars.length > 1,
    galacticPosition: info.pos.slice(),
    stars,
    planets,
    belts,
    anchors,
    ecliptic: { normal: nE, e1, e2 },
    bodies: [],
    currentPlanetIndex: 0,
  };
  sys.bodies = [...stars];
  for (const p of planets) {
    sys.bodies.push(p);
    for (const m of p.moons) sys.bodies.push(m);
  }
  recenter(sys, Math.max(0, Math.min(planetIndex, planets.length - 1)));
  return sys;
}

/** Lista plana de tudo que tem posição (para recentrar). */
export function allPositioned(sys) {
  return [...sys.bodies, ...sys.belts, ...sys.anchors];
}

/**
 * Recentra o sistema no planeta `k` (planeta atual na origem). Planetas não
 * pousáveis (gasosos) são trocados pelo pousável mais próximo.
 */
export function recenter(sys, k) {
  let cur = sys.planets[k] || sys.planets[0];
  if (!cur.landable) {
    let best = sys.planets[0];
    let bd = Infinity;
    for (const p of sys.planets) {
      if (!p.landable) continue;
      const d = Math.hypot(p._sys[0] - cur._sys[0], p._sys[1] - cur._sys[1], p._sys[2] - cur._sys[2]);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    cur = best;
  }
  const o = cur._sys;
  for (const b of allPositioned(sys)) {
    const wp = b.kind === 'belt' ? b.center : b.position;
    wp.set(b._sys[0] - o[0], b._sys[1] - o[1], b._sys[2] - o[2]);
  }
  sys.currentPlanetIndex = sys.planets.indexOf(cur);
  return cur;
}

/** Tempo de viagem (s) por pulso entre duas posições (m). */
export function travelTime(a, b, speed = PULSE_SPEED) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / speed;
}
