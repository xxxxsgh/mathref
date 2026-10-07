// Universo procedural — FONTE DA VERDADE dos dados do mundo. Todos os
// sistemas (planets, deepspace, stations, missions, economy...) leem daqui,
// então o mesmo seed gera exatamente o mesmo setor para todo mundo.
//
// Unidades: metros, segundos, radianos. Posições de sistema em coordenadas de
// mundo (double, origem = estrela). Galáxia em anos-luz.
//
// Escala percebida (não realista — calibrada para jogabilidade):
//   planeta pousável  raio 22–48 km
//   gigante gasoso    raio 260–480 km
//   estrela           raio 180–900 km (buraco negro: horizonte ~40 km)
//   órbitas           6.000–60.000 km da estrela
//   viagem quântica   ~2.000 km/s  →  10–30 s entre planetas
import * as THREE from 'three/webgpu';
import { Rng, mix, hashString } from './Rng.js';

export const FACTIONS = {
  hegemonia: { id: 'hegemonia', name: 'Hegemonia Solar', color: '#f2d27a', short: 'HEG' },
  frente: { id: 'frente', name: 'Frente Livre', color: '#ff7a4a', short: 'FRL' },
  corsarios: { id: 'corsarios', name: 'Corsários do Vazio', color: '#c04ad8', short: 'COR' },
  guilda: { id: 'guilda', name: 'Guilda dos Mercadores', color: '#5fd0b8', short: 'GLD' },
  vigilantes: { id: 'vigilantes', name: 'Os Vigilantes', color: '#7fb8ff', short: '???' },
};

export const STAR_TYPES = {
  red_dwarf: { name: 'Anã vermelha', color: [1.0, 0.42, 0.22], temp: 3100, radius: [180e3, 260e3], lum: 0.55 },
  yellow: { name: 'Estrela amarela', color: [1.0, 0.86, 0.66], temp: 5600, radius: [320e3, 460e3], lum: 1.0 },
  white: { name: 'Estrela branca', color: [0.92, 0.95, 1.0], temp: 8200, radius: [300e3, 420e3], lum: 1.25 },
  blue_giant: { name: 'Gigante azul', color: [0.62, 0.74, 1.0], temp: 18000, radius: [700e3, 900e3], lum: 2.2 },
  binary: { name: 'Estrela binária', color: [1.0, 0.8, 0.6], temp: 5200, radius: [260e3, 360e3], lum: 1.3 },
  black_hole: { name: 'Buraco negro', color: [1.0, 0.7, 0.45], temp: 0, radius: [38e3, 42e3], lum: 0.45 },
};

/** Biomas. `landable=false` só no gigante gasoso. Paletas em sRGB hex (dicas para planets/fauna). */
export const BIOMES = {
  lush: { name: 'Exuberante', landable: true, atmo: true, sea: 0.42, palette: ['#1f4d2b', '#3f7a35', '#8fae4a', '#c9b98a', '#2a6f8f'], sky: [0.25, 0.55, 1.0], hazard: { temp: 0, tox: 0, rad: 0 }, gravity: 9.2 },
  desert: { name: 'Desértico', landable: true, atmo: true, sea: null, palette: ['#7a3e1d', '#b8692e', '#e0a35b', '#f2d29a', '#5a2c18'], sky: [0.9, 0.62, 0.38], hazard: { temp: 0.6, tox: 0, rad: 0.1 }, gravity: 8.4 },
  ice: { name: 'Gelado', landable: true, atmo: true, sea: null, palette: ['#e8f1f8', '#a9c8de', '#5f88a8', '#2c4d6b', '#9ae6ff'], sky: [0.55, 0.75, 1.0], hazard: { temp: -0.8, tox: 0, rad: 0 }, gravity: 9.6 },
  volcanic: { name: 'Vulcânico', landable: true, atmo: true, sea: null, palette: ['#141012', '#2a1d1b', '#4a2f26', '#ff5a1a', '#ffb347'], sky: [0.7, 0.35, 0.25], hazard: { temp: 0.9, tox: 0.4, rad: 0.1 }, gravity: 10.5 },
  toxic: { name: 'Tóxico', landable: true, atmo: true, sea: 0.3, palette: ['#2a2f12', '#4b5a1a', '#8fbf2a', '#d6f04a', '#6a2a7a'], sky: [0.6, 0.9, 0.35], hazard: { temp: 0.1, tox: 0.9, rad: 0.2 }, gravity: 8.9 },
  ocean: { name: 'Oceânico', landable: true, atmo: true, sea: 0.78, palette: ['#0b2f4a', '#145a7a', '#2aa0b8', '#e8dcb0', '#3d8f4a'], sky: [0.3, 0.6, 1.0], hazard: { temp: 0, tox: 0, rad: 0 }, gravity: 9.8 },
  dead: { name: 'Morto / irradiado', landable: true, atmo: false, sea: null, palette: ['#2a2826', '#4a4642', '#77706a', '#a8a29a', '#6fd0ff'], sky: [0.0, 0.0, 0.0], hazard: { temp: -0.3, tox: 0, rad: 0.8 }, gravity: 4.1 },
  gas: { name: 'Gigante gasoso', landable: false, atmo: true, sea: null, palette: ['#c9a27a', '#8a5a3a', '#e8d2b0', '#6a7fa8', '#f2e6d0'], sky: [0.8, 0.7, 0.55], hazard: { temp: 0, tox: 0.5, rad: 0.3 }, gravity: 24 },
};

// ─── nomes procedurais ───────────────────────────────────────────────────
const SYL_A = ['ka', 've', 'ri', 'tha', 'or', 'ma', 'sel', 'dru', 'an', 'xe', 'lo', 'qui', 'nar', 'zo', 'el', 'cy', 'bra', 'mo', 'ti', 'vas', 'ul', 'no', 'pe', 'sha', 'ar', 'ion', 'ke', 'da', 'ru', 'ze'];
const SYL_B = ['ssa', 'dia', 'nis', 'ros', 'lon', 'ra', 'tis', 'mar', 'nae', 'thos', 'vex', 'lia', 'dor', 'ria', 'gon', 'phis', 'tera', 'lux', 'ven', 'cor', 'mis', 'ta', 'rex', 'nova', 'ris'];
export function makeName(r) {
  let s = r.pick(SYL_A) + (r.chance(0.5) ? r.pick(SYL_A) : '') + r.pick(SYL_B);
  return s[0].toUpperCase() + s.slice(1);
}
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

// ─── corpos ──────────────────────────────────────────────────────────────
const _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _axis = new THREE.Vector3();

export class Body {
  constructor(o) { Object.assign(this, o); this.pos = o.pos.clone(); }
  /** Rotação do planeta (eixo inclinado) no tempo de universo t. */
  rotationAt(t, out = new THREE.Quaternion()) {
    _axis.set(Math.sin(this.axialTilt), Math.cos(this.axialTilt), 0).normalize();
    const ang = (t / this.rotationPeriod) * Math.PI * 2 + this.rotationPhase;
    _qs.setFromAxisAngle(_axis, ang);
    return out.copy(_qs);
  }
  /** Ponto no referencial do planeta (centro=0, girando com a superfície) → mundo. */
  localToWorld(local, t, out = new THREE.Vector3()) {
    this.rotationAt(t, _q);
    return out.copy(local).applyQuaternion(_q).add(this.pos);
  }
  worldToLocal(world, t, out = new THREE.Vector3()) {
    this.rotationAt(t, _q).invert();
    return out.copy(world).sub(this.pos).applyQuaternion(_q);
  }
  /** Direção de mundo → referencial local. */
  dirToLocal(dir, t, out = new THREE.Vector3()) { this.rotationAt(t, _q).invert(); return out.copy(dir).applyQuaternion(_q); }
  dirToWorld(dir, t, out = new THREE.Vector3()) { this.rotationAt(t, _q); return out.copy(dir).applyQuaternion(_q); }
  /** Altitude aproximada (sem relevo) de um ponto de mundo. */
  altitudeOf(world) { return world.distanceTo(this.pos) - this.radius; }
  /** Raio da esfera de influência (onde o referencial do planeta passa a valer). */
  get soi() { return this.radius * (this.kind === 'gas_giant' ? 3 : 6); }
}

function makeBody(sys, r, kind, type, idx, pos, parent = null) {
  const b = BIOMES[type];
  const radius = kind === 'gas_giant' ? r.range(260e3, 480e3) : kind === 'moon' ? r.range(14e3, 26e3) : r.range(22e3, 48e3);
  const name = parent ? `${parent.name} ${String.fromCharCode(97 + idx)}` : `${sys.name} ${ROMAN[idx] || idx + 1}`;
  return new Body({
    id: `${sys.id}:${parent ? parent.id.split(':')[1] + '-' : ''}${kind[0]}${idx}`,
    name, kind, type, seed: mix(sys.seed, hashString(kind), idx * 7919 + (parent ? 31 : 0)),
    radius, pos, parent: parent ? parent.id : null,
    landable: b.landable,
    gravity: b.gravity * (radius / 35e3) ** 0.35 * (kind === 'gas_giant' ? 1 : 1),
    atmosphere: b.atmo ? {
      height: kind === 'gas_giant' ? radius * 0.08 : radius * r.range(0.075, 0.11),
      rayleigh: b.sky.map((c) => c * r.range(0.85, 1.15)),
      density: type === 'toxic' || type === 'volcanic' ? r.range(1.3, 1.8) : r.range(0.8, 1.2),
      mie: type === 'desert' || type === 'volcanic' ? r.range(1.5, 2.5) : r.range(0.7, 1.2),
    } : null,
    seaLevel: b.sea, // fração 0..1 do relevo coberta por líquido (null = sem mar)
    terrainAmplitude: kind === 'gas_giant' ? 0 : r.range(1800, 4200) * (type === 'dead' ? 1.3 : type === 'ocean' ? 0.6 : 1),
    rotationPeriod: r.range(1500, 2600),  // s (~25–43 min de dia completo)
    rotationPhase: r.range(0, Math.PI * 2),
    axialTilt: r.range(-0.4, 0.4),
    rings: kind === 'gas_giant' ? r.chance(0.7) : r.chance(0.08),
    clouds: b.atmo ? r.range(0.25, 0.75) : 0,
    palette: b.palette,
    hazard: { ...b.hazard },
    fauna: type === 'dead' ? 0.1 : type === 'gas' ? 0 : r.range(0.4, 1.0),
    flora: type === 'dead' ? 0.05 : type === 'gas' ? 0 : r.range(0.3, 1.0),
    ruins: type === 'dead' ? true : r.chance(0.35), // ruínas dos Arquitetos
    resources: pickResources(r, type),
  });
}

function pickResources(r, type) {
  const base = { lush: ['carbono', 'biomassa', 'água'], desert: ['silício', 'ferro', 'cobre'], ice: ['água', 'deutério', 'cristal'], volcanic: ['enxofre', 'titânio', 'ouro'], toxic: ['amônia', 'esporos', 'cobalto'], ocean: ['água', 'sal', 'biomassa'], dead: ['urânio', 'irídio', 'relíquia'], gas: ['hélio-3', 'hidrogênio', 'metano'] }[type];
  return r.shuffle([...base]);
}

// ─── sistema estelar ─────────────────────────────────────────────────────
export class StarSystem {
  constructor(entry, galaxySeed) {
    Object.assign(this, entry);
    const r = new Rng(mix(galaxySeed, this.seed));
    const st = STAR_TYPES[this.starType];
    this.star = {
      type: this.starType, name: st.name, color: st.color.slice(), temp: st.temp,
      radius: r.range(...st.radius), luminosity: st.lum * r.range(0.9, 1.1), pos: new THREE.Vector3(),
      companion: null, accretion: null,
    };
    if (this.starType === 'binary') {
      const cr = r.range(150e3, 240e3);
      this.star.companion = { color: [1.0, 0.5, 0.3], radius: cr, pos: new THREE.Vector3(r.range(2.2e6, 3e6), r.range(-2e5, 2e5), r.range(-1e6, 1e6)) };
    }
    if (this.starType === 'black_hole') this.star.accretion = { inner: this.star.radius * 3, outer: this.star.radius * 22, tilt: r.range(0.15, 0.4) };
    this.bodies = []; this.belts = []; this.stations = []; this.pois = [];
    const override = SPECIAL[this.id];
    if (override) override(this, r); else this.generate(r);
  }
  generate(r) {
    const n = r.int(2, 8);
    let dist = r.range(6e6, 9e6) * (this.starType === 'blue_giant' ? 1.6 : 1);
    const types = ['lush', 'desert', 'ice', 'volcanic', 'toxic', 'ocean', 'dead'];
    for (let i = 0; i < n; i++) {
      const inner = i / Math.max(1, n - 1);
      let type;
      if (r.chance(0.22 + inner * 0.35)) type = 'gas';
      else if (inner < 0.3) type = r.pick(['volcanic', 'desert', 'dead', 'toxic']);
      else if (inner < 0.65) type = r.pick(['lush', 'ocean', 'toxic', 'desert', 'dead']);
      else type = r.pick(['ice', 'dead', 'ice', 'toxic']);
      if (this.starType === 'black_hole' && r.chance(0.6)) type = 'dead';
      const ang = r.range(0, Math.PI * 2), inc = r.range(-0.06, 0.06);
      const pos = new THREE.Vector3(Math.cos(ang) * dist, Math.sin(inc) * dist, Math.sin(ang) * dist);
      const p = makeBody(this, r, type === 'gas' ? 'gas_giant' : 'planet', type, i, pos);
      this.bodies.push(p);
      const moons = type === 'gas' ? r.int(1, 3) : r.chance(0.35) ? 1 : 0;
      for (let m = 0; m < moons; m++) this.addMoon(r, p, m, r.pick(types));
      if (r.chance(type === 'gas' ? 0.6 : 0.25)) this.addStation(r, p, type === 'gas' ? 'floating' : r.pick(['trade', 'trade', 'military', 'outpost']));
      dist *= r.range(1.35, 1.8);
      if (i === Math.floor(n / 2) && r.chance(0.7)) {
        this.belts.push({ id: `${this.id}:belt0`, name: `Cinturão de ${this.name}`, center: new THREE.Vector3(), radiusInner: dist * 0.86, radiusOuter: dist * 0.94, thickness: 6e4, density: r.range(0.5, 1), seed: mix(this.seed, 77) });
        dist *= 1.2;
      }
    }
    if (!this.stations.length && this.bodies.length) this.addStation(r, this.bodies[0], 'trade');
    this.addEvents(r);
  }
  addMoon(r, parent, idx, type) {
    const d = parent.radius * r.range(4, 9);
    const a = r.range(0, Math.PI * 2);
    const pos = parent.pos.clone().add(new THREE.Vector3(Math.cos(a) * d, r.range(-0.1, 0.1) * d, Math.sin(a) * d));
    const m = makeBody(this, r, 'moon', type, idx, pos, parent);
    this.bodies.push(m);
    return m;
  }
  addStation(r, body, kind, name, faction) {
    const dir = new THREE.Vector3(r.range(-1, 1), r.range(-0.2, 0.2), r.range(-1, 1)).normalize();
    const alt = kind === 'floating' ? body.radius * 0.02 + 6e3 : body.radius * 0.6 + 2e4;
    const st = {
      id: `${this.id}:st${this.stations.length}`, kind,
      name: name || `${kind === 'military' ? 'Posto' : kind === 'floating' ? 'Plataforma' : kind === 'outpost' ? 'Entreposto' : 'Estação'} ${makeName(r)}`,
      faction: faction || (kind === 'military' ? 'hegemonia' : kind === 'trade' || kind === 'floating' ? 'guilda' : this.faction),
      body: body.id, pos: body.pos.clone().addScaledVector(dir, body.radius + alt), seed: mix(this.seed, 991, this.stations.length),
    };
    this.stations.push(st);
    return st;
  }
  addEvents(r) {
    const kinds = ['derelict', 'distress', 'ambush', 'ion_storm', 'debris', 'convoy', 'checkpoint'];
    const n = r.int(2, 5);
    for (let i = 0; i < n; i++) {
      const b = r.pick(this.bodies);
      const dir = new THREE.Vector3(r.range(-1, 1), r.range(-0.3, 0.3), r.range(-1, 1)).normalize();
      this.pois.push({ id: `${this.id}:poi${i}`, kind: r.pick(kinds), pos: b.pos.clone().addScaledVector(dir, b.radius * r.range(2.5, 6)), seed: mix(this.seed, 313, i), near: b.id });
    }
  }
  body(id) { return this.bodies.find((b) => b.id === id); }
  station(id) { return this.stations.find((s) => s.id === id); }
  /** Corpo cuja esfera de influência contém o ponto (o mais próximo). */
  dominantBody(world) {
    let best = null, bd = Infinity;
    for (const b of this.bodies) { const d = world.distanceTo(b.pos); if (d < b.soi && d - b.radius < bd) { bd = d - b.radius; best = b; } }
    return best;
  }
  /** Direção (normalizada) do ponto para a estrela. */
  sunDir(world, out = new THREE.Vector3()) { return out.copy(this.star.pos).sub(world).normalize(); }
}

// ─── sistemas especiais da campanha ──────────────────────────────────────
const SPECIAL = {
  // Abertura: colônia Aurora, território da Hegemonia. Batalha + ordem de bombardeio.
  halden(sys, r) {
    const aurora = makeBody(sys, r, 'planet', 'ocean', 0, new THREE.Vector3(9.2e6, 3e5, -2.1e6));
    aurora.name = 'Aurora'; aurora.colony = true; aurora.radius = 36e3; aurora.clouds = 0.6;
    sys.bodies.push(aurora);
    const gg = makeBody(sys, r, 'gas_giant', 'gas', 1, new THREE.Vector3(-1.4e7, -6e5, 1.1e7));
    gg.name = 'Halden Magnus'; sys.bodies.push(gg);
    sys.addMoon(r, aurora, 0, 'dead').name = 'Aurora a';
    sys.addStation(r, aurora, 'military', 'Bastião Halden', 'hegemonia');
    sys.pois.push({ id: 'halden:battle', kind: 'opening_battle', pos: aurora.pos.clone().add(new THREE.Vector3(-aurora.radius * 2.4, aurora.radius * 0.5, aurora.radius * 1.2)), seed: 1, near: aurora.id });
  },
  // Fenda de Órion — sistema da fatia vertical: 3 pousáveis + gasoso + lua morta + estação + cinturão.
  kessa(sys, r) {
    const add = (kind, type, idx, pos, name, extra = {}) => { const b = makeBody(sys, r, kind, type, idx, pos); b.name = name; Object.assign(b, extra); sys.bodies.push(b); return b; };
    const veridia = add('planet', 'lush', 0, new THREE.Vector3(1.05e7, 2e5, 4.0e6), 'Verídia', { radius: 38e3, clouds: 0.55, ruins: true });
    add('planet', 'desert', 1, new THREE.Vector3(-6.2e6, -1.5e5, 7.6e6), 'Ashar', { radius: 32e3, clouds: 0.25 });
    const niv = add('planet', 'ice', 2, new THREE.Vector3(-1.9e7, 6e5, -1.2e7), 'Nivália', { radius: 30e3, clouds: 0.6 });
    const tharsos = add('gas_giant', 'gas', 3, new THREE.Vector3(2.6e7, -1.2e6, -2.2e7), 'Tharsos', { radius: 420e3, rings: true });
    const ossuary = sys.addMoon(r, tharsos, 0, 'dead'); ossuary.name = 'Ossário'; ossuary.ruins = true; ossuary.radius = 18e3;
    sys.addMoon(r, niv, 0, 'volcanic').name = 'Brasa';
    sys.addStation(r, veridia, 'trade', 'Estação Meridiana', 'guilda');
    sys.addStation(r, tharsos, 'floating', 'Plataforma Tharsos', 'guilda');
    sys.belts.push({ id: 'kessa:belt0', name: 'Cinturão da Fenda', center: new THREE.Vector3(), radiusInner: 1.45e7, radiusOuter: 1.62e7, thickness: 8e4, density: 0.9, seed: 4242 });
    // base rebelde escondida no cinturão
    const a = 2.1;
    sys.stations.push({ id: 'kessa:rebel', kind: 'rebel', name: 'Refúgio Cinza', faction: 'frente', body: null, pos: new THREE.Vector3(Math.cos(a) * 1.53e7, 2e4, Math.sin(a) * 1.53e7), seed: 777, hidden: true });
    sys.addEvents(r);
    sys.pois.push({ id: 'kessa:arrival', kind: 'arrival', pos: veridia.pos.clone().add(new THREE.Vector3(-1.6e5, 4e4, -2.2e5)), seed: 2, near: veridia.id });
  },
};

// ─── galáxia ─────────────────────────────────────────────────────────────
export class Galaxy {
  constructor(seed = 2387) {
    this.seed = seed;
    const r = new Rng(seed);
    this.systems = [];
    const N = 420;
    const add = (o) => { this.systems.push(o); return o; };
    // especiais primeiro (índices fixos)
    add({ id: 'halden', name: 'Halden', seed: 101, pos: { x: -120, y: 2, z: 40 }, starType: 'yellow', faction: 'hegemonia', security: 0.95, region: 'Núcleo Hegemônico', nebula: null });
    add({ id: 'kessa', name: 'Kessa', seed: 202, pos: { x: 160, y: -4, z: -60 }, starType: 'yellow', faction: 'frente', security: 0.35, region: 'Fenda de Órion', nebula: { color: [0.55, 0.25, 0.75], color2: [0.15, 0.55, 0.8], density: 0.8 } });
    const types = ['red_dwarf', 'red_dwarf', 'red_dwarf', 'yellow', 'yellow', 'white', 'blue_giant', 'binary', 'binary', 'black_hole'];
    for (let i = 0; i < N; i++) {
      const arm = i % 3, t = r.next();
      const ang = arm * (Math.PI * 2 / 3) + t * 4.5 + r.gauss() * 0.25;
      const rad = 60 + t * 520 + r.gauss() * 25;
      const pos = { x: Math.cos(ang) * rad, y: r.gauss() * 12, z: Math.sin(ang) * rad };
      const fenda = Math.hypot(pos.x - 160, pos.z + 60) < 140;
      const core = Math.hypot(pos.x + 120, pos.z - 40) < 160;
      const name = makeName(r.fork(i));
      add({
        id: `s${i}`, name, seed: mix(seed, i), pos, starType: r.pick(types),
        faction: core ? 'hegemonia' : fenda ? r.pick(['frente', 'frente', 'corsarios', 'guilda']) : r.pick(['hegemonia', 'guilda', 'corsarios', 'frente', 'nenhuma']),
        security: core ? r.range(0.7, 1) : r.range(0, 0.7),
        region: fenda ? 'Fenda de Órion' : core ? 'Núcleo Hegemônico' : 'Fronteira Exterior',
        nebula: fenda || r.chance(0.15) ? { color: [r.range(0.3, 0.9), r.range(0.1, 0.5), r.range(0.4, 1)], color2: [r.range(0.05, 0.4), r.range(0.3, 0.7), r.range(0.5, 1)], density: r.range(0.3, 1) } : null,
      });
    }
    this.cache = new Map();
  }
  entry(id) { return this.systems.find((s) => s.id === id); }
  /** Sistema estelar completo (gerado sob demanda e cacheado). */
  system(id) {
    if (!this.cache.has(id)) this.cache.set(id, new StarSystem(this.entry(id), this.seed));
    return this.cache.get(id);
  }
  distance(a, b) { const A = this.entry(a).pos, B = this.entry(b).pos; return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z); }
  neighbors(id, rangeLy) { return this.systems.filter((s) => s.id !== id && this.distance(id, s.id) <= rangeLy); }
}
