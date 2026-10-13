// Genomas de espécies (fauna e flora) por corpo celeste. Tudo determinístico
// pela seed do corpo + bioma: o mesmo planeta tem sempre os mesmos bichos,
// com nomes, cores, proporções e comportamento próprios.
//
// Fauna — plano corporal: 'quad' (4 pernas), 'hexa' (6), 'biped' (2, corpo
// horizontal com cauda de equilíbrio), 'flyer' (asas membranosas), 'worm'
// (verme gigante do deserto), 'marine' (nadador visto da costa).
// Papel: 'grazer' (bando pastando, foge), 'critter' (pequeno, arisco),
// 'predator' (caça), 'territorial' (ataca quem invade), 'flyer', 'worm', 'marine'.
import { rng, hashStr, hmix } from './util.js';

// ─── nomes ──────────────────────────────────────────────────────────────
const SYL1 = ['ve', 'tha', 'ka', 'mo', 'ri', 'sa', 'lu', 'dra', 'ne', 'ox', 'qua', 'zi', 'pe', 'or', 'ul', 'ga', 'fe', 'ty', 'bra', 'xa', 'cu', 'ilo', 'me', 'shi'];
const SYL2 = ['ru', 'la', 'do', 'mi', 'ne', 'vo', 'ta', 'ri', 'go', 'ssa', 'lo', 'ze', 'qui', 'ba', 'nu'];
const SUF_F = ['onte', 'ídeo', 'ádon', 'ura', 'élio', 'anto', 'ópode', 'ássio', 'ino', 'ema'];
const SUF_L = ['us', 'ia', 'odon', 'ops', 'ix', 'ella', 'ura', 'ion', 'ax'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function word(r, suf) { return r.pick(SYL1) + (r.chance(0.6) ? r.pick(SYL2) : '') + r.pick(suf); }

const TRAIT_ADJ = {
  horns: ['galhudo', 'chifrudo', 'cornífero'], stripes: ['listrado', 'raiado'], spots: ['pintado', 'malhado'], rosettes: ['rosetado'],
  bands: ['anelado', 'cintado'], glow: ['luminoso', 'lanterna', 'cintilante'], armor: ['couraçado', 'blindado'], fur: ['peludo', 'lanoso'],
  crest: ['cristado', 'de-crista'], wings: ['planador', 'alado', 'véu'], long: ['pescoçudo', 'esguio'], big: ['colosso', 'grande'], small: ['miúdo', 'saltitante'],
};

function faunaName(r, g, body) {
  const traits = [];
  if (g.head?.horns?.count) traits.push('horns');
  if (g.skin.pattern !== 'none') traits.push(g.skin.pattern);
  if (g.skin.glow > 0.3) traits.push('glow');
  if (g.skin.armor) traits.push('armor');
  if (g.skin.fur) traits.push('fur');
  if (g.head?.crest) traits.push('crest');
  if (g.wings) traits.push('wings');
  if (g.neck?.len > g.L * 0.7) traits.push('long');
  if (g.L > 6) traits.push('big');
  if (g.L < 0.8) traits.push('small');
  const base = cap(word(r, SUF_F));
  const adj = traits.length ? r.pick(TRAIT_ADJ[r.pick(traits)]) : '';
  const name = adj ? `${base}-${adj}` : base;
  const latin = `${cap(word(r, SUF_L))} ${(body.name || 'x').normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()}${r.pick(['ensis', 'ica', 'ae', 'iana'])}`;
  return { name, latin };
}

// ─── paletas por bioma (pele) ────────────────────────────────────────────
const SKIN = {
  lush: [
    { base: '#c79a5a', belly: '#efe0bc', pat: '#2f5c58', accent: '#f0f4e6', glow: '#5ff3ff', eye: '#ffd66a' },
    { base: '#7d8f4a', belly: '#d9dcb0', pat: '#3b2c1e', accent: '#e8e2c8', glow: '#a6ff6a', eye: '#ff9b3a' },
    { base: '#4d7f86', belly: '#d4e6dc', pat: '#173a40', accent: '#f6e9b8', glow: '#7af8ff', eye: '#ffe27a' },
    { base: '#8a5a7c', belly: '#ecd2d8', pat: '#2e1a30', accent: '#ffe0f0', glow: '#ff7ae8', eye: '#c8ff7a' },
  ],
  desert: [
    { base: '#b8743e', belly: '#ecd1a3', pat: '#4a2412', accent: '#f6e2c0', glow: '#ffb04a', eye: '#ffef8a' },
    { base: '#8f6a48', belly: '#d8c098', pat: '#2c1a10', accent: '#e8d0a8', glow: '#ff7a3a', eye: '#a0ff6a' },
    { base: '#c9a06a', belly: '#f4e4c4', pat: '#7a3a1c', accent: '#fff2d6', glow: '#ffd06a', eye: '#ff5a3a' },
  ],
  ice: [
    { base: '#e2e6ea', belly: '#ffffff', pat: '#6f8aa4', accent: '#ffffff', glow: '#8fe8ff', eye: '#3ad0ff' },
    { base: '#8a7e74', belly: '#dcd4ca', pat: '#3e3630', accent: '#f2ece4', glow: '#9ae6ff', eye: '#ffd27a' },
    { base: '#5f7690', belly: '#d8e4ee', pat: '#203040', accent: '#e8f4ff', glow: '#7ad8ff', eye: '#ff8a5a' },
  ],
  toxic: [
    { base: '#5a3a6a', belly: '#c8b4d0', pat: '#1e1024', accent: '#e4ff8a', glow: '#c8ff3a', eye: '#ff4ad0' },
    { base: '#4b5a2a', belly: '#c4d098', pat: '#1a2010', accent: '#f0d0ff', glow: '#ff6af0', eye: '#d6ff4a' },
  ],
  volcanic: [
    { base: '#2a2422', belly: '#5a4a40', pat: '#0e0a08', accent: '#ff9a4a', glow: '#ff6a1a', eye: '#ffd04a' },
    { base: '#4a3428', belly: '#8a6a50', pat: '#1a100a', accent: '#ffc070', glow: '#ff8a2a', eye: '#ff3a1a' },
  ],
  ocean: [
    { base: '#3a6a8a', belly: '#dce8ee', pat: '#12283a', accent: '#f4fbff', glow: '#7affe0', eye: '#ffe07a' },
    { base: '#5a8a7a', belly: '#e4eee4', pat: '#1a3a30', accent: '#ffffff', glow: '#9affd0', eye: '#ffb04a' },
  ],
  dead: [
    { base: '#6a6460', belly: '#a8a29a', pat: '#2a2826', accent: '#c8d8e0', glow: '#6fd0ff', eye: '#6fd0ff' },
  ],
};

// ─── papéis por bioma (peso, plano) ─────────────────────────────────────
const ROSTER = {
  lush: [['grazer', 'quad'], ['grazer', 'hexa'], ['critter', 'hexa'], ['predator', 'biped'], ['territorial', 'quad'], ['flyer', 'flyer'], ['marine', 'marine']],
  desert: [['worm', 'worm'], ['grazer', 'hexa'], ['territorial', 'biped'], ['critter', 'quad'], ['flyer', 'flyer']],
  ice: [['grazer', 'quad'], ['territorial', 'hexa'], ['critter', 'biped'], ['flyer', 'flyer'], ['predator', 'quad']],
  toxic: [['grazer', 'hexa'], ['predator', 'quad'], ['flyer', 'flyer'], ['critter', 'hexa'], ['territorial', 'biped']],
  volcanic: [['grazer', 'hexa'], ['territorial', 'quad'], ['flyer', 'flyer']],
  ocean: [['marine', 'marine'], ['grazer', 'quad'], ['flyer', 'flyer'], ['critter', 'hexa']],
  dead: [['critter', 'hexa']],
};

function faunaGenome(body, idx, role, plan, r) {
  const biome = body.type;
  const pal = r.pick(SKIN[biome] || SKIN.lush);
  const g = { kind: 'fauna', id: `${body.id}:fauna${idx}`, bodyId: body.id, biome, role, plan, seed: hmix(body.seed, 4441, idx) };
  const cold = biome === 'ice';
  // escala base por papel
  const S = {
    grazer: r.range(1.9, 2.8), critter: r.range(0.45, 0.75), predator: r.range(1.3, 1.9), territorial: r.range(2.3, 3.3),
    flyer: r.range(1.3, 2.2), worm: r.range(46, 62), marine: r.range(10, 16),
  }[role];
  g.L = S;                                    // comprimento do tronco (pelve → peito)
  g.girth = S * ({ grazer: 0.3, critter: 0.32, predator: 0.24, territorial: 0.38, flyer: 0.16, worm: 0.045, marine: 0.17 }[role]) * r.range(0.9, 1.12);
  g.H = { quad: S * r.range(0.62, 0.8), hexa: S * r.range(0.42, 0.55), biped: S * r.range(0.85, 1.05), flyer: 0, worm: 0, marine: 0 }[plan];
  if (role === 'territorial' && plan === 'quad') g.H = S * r.range(0.5, 0.6);
  g.hump = plan === 'quad' ? r.range(0.0, 0.35) : r.range(0, 0.15);
  g.spineArch = r.range(-0.05, 0.12);
  // pescoço e cabeça
  const longNeck = role === 'grazer' && plan === 'quad' && r.chance(0.75);
  g.neck = {
    len: plan === 'worm' || plan === 'marine' ? 0 : longNeck ? S * r.range(0.8, 1.15) : S * r.range(0.22, 0.4),
    raise: longNeck ? r.range(0.75, 1.05) : plan === 'biped' ? r.range(0.25, 0.5) : plan === 'flyer' ? 0.1 : r.range(0.2, 0.5),
    girth: g.girth * (longNeck ? 0.36 : 0.62),
    segs: longNeck ? 3 : 2,
  };
  const hl = plan === 'worm' ? g.girth * 2.2 : plan === 'marine' ? g.girth * 2.4 : S * ({ grazer: 0.34, critter: 0.42, predator: 0.42, territorial: 0.36, flyer: 0.32 }[role] ?? 0.35);
  g.head = {
    len: hl * r.range(0.9, 1.15), w: hl * r.range(0.42, 0.56), h: hl * r.range(0.42, 0.55),
    snout: r.range(0.35, 0.75), jaw: role === 'predator' || role === 'territorial' ? 1 : r.chance(0.5) ? 0.6 : 0,
    eyes: plan === 'hexa' ? (r.chance(0.5) ? 4 : 2) : role === 'predator' && r.chance(0.4) ? 4 : 2,
    eyeSize: r.range(0.08, 0.13),
    horns: null, crest: r.chance(role === 'predator' ? 0.6 : 0.35) ? r.range(0.3, 0.8) : 0,
    frill: role === 'territorial' && r.chance(0.6) ? r.range(0.5, 1) : 0,
    tusks: role === 'territorial' && r.chance(0.5),
    antennae: plan === 'hexa' && r.chance(0.6),
  };
  if (role === 'territorial' || (role === 'grazer' && r.chance(0.55))) {
    g.head.horns = { kind: r.pick(['curl', 'spike', 'branch', 'swept']), count: r.pick([2, 2, 4]), len: hl * r.range(0.5, 1.1), curve: r.range(0.4, 1.2) };
  }
  // cauda
  g.tail = {
    len: plan === 'biped' ? S * r.range(1.0, 1.4) : plan === 'flyer' ? S * r.range(1.0, 1.8) : role === 'territorial' ? S * r.range(0.5, 0.8) : S * r.range(0.25, 0.7),
    girth: g.girth * (plan === 'biped' ? 0.62 : 0.45), segs: plan === 'flyer' ? 6 : 5,
    droop: plan === 'biped' ? 0.05 : r.range(0.25, 0.7), club: role === 'territorial' && r.chance(0.6), fin: plan === 'flyer' || (biome === 'ocean' && r.chance(0.5)),
  };
  if (plan === 'hexa') g.tail.len = S * r.range(0.1, 0.3);
  // pernas
  g.legs = {
    pairs: { quad: 2, hexa: 3, biped: 1, flyer: 0, worm: 0, marine: 0 }[plan],
    len: g.H * 1.04, thick: g.girth * ({ quad: 0.34, hexa: 0.22, biped: 0.4 }[plan] ?? 0.3) * r.range(0.85, 1.2),
    knee: plan === 'hexa' ? 'spider' : plan === 'biped' ? 'bird' : 'mammal',
    foot: plan === 'hexa' ? 'claw' : role === 'grazer' ? r.pick(['hoof', 'pad']) : r.pick(['claw', 'pad']),
    spread: plan === 'hexa' ? r.range(0.9, 1.3) : 0.6,
  };
  if (plan === 'hexa') { g.legs.len = g.H * 1.55; }
  // asas
  g.wings = plan === 'flyer' ? { span: S * r.range(2.4, 3.4), chord: S * r.range(0.55, 0.85), fingers: r.int(2, 4) } : null;
  // pele
  const pattern = r.pick(cold ? ['bands', 'spots', 'none'] : ['stripes', 'spots', 'rosettes', 'bands', 'stripes']);
  g.skin = {
    base: pal.base, belly: pal.belly, pat: pal.pat, accent: pal.accent, glow: pal.glow, eye: pal.eye,
    pattern, patScale: r.range(0.8, 1.6), glowAmt: biome === 'toxic' ? r.range(0.6, 1) : r.chance(0.55) ? r.range(0.35, 1) : 0,
    rough: r.range(0.45, 0.75), armor: role === 'territorial' || (plan === 'hexa' && r.chance(0.6)) || biome === 'volcanic',
    fur: cold && plan !== 'hexa', sheen: cold ? 0.8 : r.range(0, 0.3),
  };
  g.skin.glow = g.skin.glowAmt;
  // comportamento
  const B = {
    grazer: { herd: [5, 9], walk: 1.3, run: 7.5, temper: 'timid', aggro: 0 },
    critter: { herd: [3, 7], walk: 1.0, run: 6.5, temper: 'timid', aggro: 0 },
    predator: { herd: [1, 2], walk: 1.8, run: 10.5, temper: 'predator', aggro: 0.8 },
    territorial: { herd: [1, 3], walk: 1.1, run: 7.5, temper: 'territorial', aggro: 0.6 },
    flyer: { herd: [4, 8], walk: 9, run: 16, temper: 'timid', aggro: 0 },
    worm: { herd: [1, 1], walk: 8, run: 18, temper: 'territorial', aggro: 1 },
    marine: { herd: [1, 3], walk: 4, run: 8, temper: 'calm', aggro: 0 },
  }[role];
  g.behavior = { ...B, herd: [B.herd[0], B.herd[1]] };
  const k = Math.sqrt(g.L / 2);
  g.behavior.walk *= plan === 'flyer' ? 1 : k; g.behavior.run *= plan === 'flyer' ? 1 : Math.min(1.4, k);
  g.hp = { grazer: 120, critter: 25, predator: 140, territorial: 260, flyer: 40, worm: 4000, marine: 800 }[role] * (g.L / S);
  g.damage = { predator: 14, territorial: 22, worm: 60 }[role] || 0;
  g.value = { grazer: 160, critter: 90, predator: 320, territorial: 380, flyer: 240, worm: 1200, marine: 650 }[role] + Math.round(r.range(0, 80));
  Object.assign(g, faunaName(r, g, body));
  g.originalName = g.name;
  g.desc = describeFauna(g);
  return g;
}

function describeFauna(g) {
  const plan = { quad: 'Quadrúpede', hexa: 'Hexápode', biped: 'Bípede', flyer: 'Voador', worm: 'Verme escavador', marine: 'Nadador' }[g.plan];
  const role = { grazer: 'herbívoro de bando, foge ao menor sinal de perigo', critter: 'pequeno e arisco, vive em grupos', predator: 'predador ativo — caça sozinho ou em dupla', territorial: 'territorial: investe contra quem invade seu espaço', flyer: 'plana em bandos sobre o relevo', worm: 'gigante subterrâneo; emerge atraído por vibrações', marine: 'vive na água rasa e vem à tona perto da costa' }[g.role];
  const size = g.plan === 'worm' ? `~${Math.round(g.L)} m de comprimento` : g.plan === 'flyer' ? `envergadura de ${(g.wings.span).toFixed(1)} m` : `altura de ${(g.H + (g.neck.len * Math.sin(g.neck.raise)) + g.head.h).toFixed(1)} m`;
  const extra = [];
  if (g.skin.glow > 0.3) extra.push('marcas bioluminescentes');
  if (g.skin.armor) extra.push('placas dérmicas');
  if (g.skin.fur) extra.push('pelagem densa');
  if (g.head.horns) extra.push('chifres');
  return `${plan}, ${role}. ${cap(size)}${extra.length ? '; ' + extra.join(', ') : ''}.`;
}

// ─── flora ───────────────────────────────────────────────────────────────
// arquétipos: tier 'tree' | 'shrub' | 'ground' (capim/fungos miúdos) | 'rock'
export const FLORA_ARCH = {
  parasol: { tier: 'tree', name: ['Parasol', 'Guarda-sol'], hazard: null },
  bulbtree: { tier: 'tree', name: ['Bojo', 'Barrigudo'], hazard: null },
  fanpalm: { tier: 'tree', name: ['Leque', 'Palmeque'], hazard: null },
  fern: { tier: 'shrub', name: ['Samambela', 'Fronde'], hazard: null },
  tubebloom: { tier: 'shrub', name: ['Tubilume', 'Flauta'], hazard: null },
  orbshrub: { tier: 'shrub', name: ['Lanterna', 'Orbe'], hazard: null },
  bloom: { tier: 'shrub', name: ['Corola', 'Bocarra'], hazard: null },
  boompod: { tier: 'shrub', name: ['Estoura-vagem', 'Bombarda'], hazard: 'explode' },
  grass: { tier: 'ground', name: ['Capim', 'Relva'], hazard: null },
  rock: { tier: 'rock', name: ['Rocha'], hazard: null },
  pillar: { tier: 'tree', name: ['Coluna', 'Candelabro'], hazard: null },
  barrel: { tier: 'shrub', name: ['Barrica', 'Pote'], hazard: null },
  brush: { tier: 'shrub', name: ['Rasteira', 'Galharia'], hazard: null },
  spitter: { tier: 'shrub', name: ['Cuspideira', 'Ácida'], hazard: 'poison' },
  crystaltree: { tier: 'tree', name: ['Cristalina', 'Prisma'], hazard: null },
  frostpine: { tier: 'tree', name: ['Pinho-gelo', 'Agulheira'], hazard: null },
  icebulb: { tier: 'shrub', name: ['Bulbo-gelo', 'Gotalume'], hazard: null },
  capfungus: { tier: 'tree', name: ['Chapéu', 'Umbela'], hazard: null },
  shroomcluster: { tier: 'shrub', name: ['Lumicogumelo', 'Candeia'], hazard: null },
  sporepuff: { tier: 'shrub', name: ['Esporeira', 'Bufa'], hazard: 'poison' },
  tendril: { tier: 'shrub', name: ['Gavinha', 'Tentáculo'], hazard: null },
  ashtree: { tier: 'tree', name: ['Cinzeiro', 'Carvoeira'], hazard: null },
  emberbloom: { tier: 'shrub', name: ['Brasilume', 'Tição'], hazard: 'explode' },
  coral: { tier: 'shrub', name: ['Coral', 'Leque-de-areia'], hazard: null },
  crystal: { tier: 'rock', name: ['Drusa', 'Geodo'], hazard: null },
};

const FLORA_SET = {
  lush: [['parasol', 1.0], ['bulbtree', 0.55], ['fanpalm', 0.6], ['fern', 1.4], ['tubebloom', 0.5], ['orbshrub', 0.45], ['bloom', 0.35], ['boompod', 0.12], ['grass', 1], ['rock', 0.35]],
  desert: [['pillar', 0.5], ['barrel', 0.5], ['brush', 0.9], ['spitter', 0.15], ['grass', 0.25], ['rock', 0.8]],
  ice: [['frostpine', 0.8], ['crystaltree', 0.55], ['icebulb', 0.5], ['fern', 0.4], ['rock', 0.6], ['crystal', 0.3]],
  toxic: [['capfungus', 1.0], ['tendril', 0.7], ['shroomcluster', 1.4], ['sporepuff', 0.25], ['grass', 0.6], ['rock', 0.3]],
  volcanic: [['ashtree', 0.6], ['emberbloom', 0.3], ['brush', 0.4], ['rock', 0.9]],
  ocean: [['fanpalm', 1.0], ['coral', 0.8], ['fern', 0.8], ['bloom', 0.3], ['grass', 0.8], ['rock', 0.4]],
  dead: [['crystal', 0.5], ['rock', 0.8]],
};

const FLORA_PAL = {
  lush: { trunk: ['#4a3426', '#5a3e2e', '#3c3a30'], leaf: ['#2f8a6a', '#3f9a4a', '#1f7a7a', '#5aa03a'], leaf2: ['#a8d050', '#4ac0a0', '#8ae0c0'], accent: ['#e0508a', '#f0a030', '#a060f0'], glow: ['#5ff3ff', '#b6ff6a', '#ff7ae0'] },
  desert: { trunk: ['#7a5a3a', '#5a4a3a'], leaf: ['#6a8a4a', '#7a7a3a', '#5a7a5a'], leaf2: ['#a0a060', '#c0b070'], accent: ['#ff5a3a', '#ffd040', '#ff8ac0'], glow: ['#ffb04a', '#ff6a3a'] },
  ice: { trunk: ['#3a3e4a', '#4a4a56'], leaf: ['#3a6a7a', '#4a7a8a', '#2a5a6a'], leaf2: ['#a0d0e0', '#c0e8f0'], accent: ['#9ae6ff', '#c0a0ff'], glow: ['#7ae0ff', '#a0f0ff'] },
  toxic: { trunk: ['#4a3a4a', '#3a3040'], leaf: ['#6a3a8a', '#5a8a2a', '#8a3a6a'], leaf2: ['#c0e040', '#e080ff'], accent: ['#d6f04a', '#ff6ad0'], glow: ['#c8ff3a', '#ff5ae0', '#5afff0'] },
  volcanic: { trunk: ['#1a1414', '#2a2020'], leaf: ['#3a2a22', '#4a3a2a'], leaf2: ['#6a4a3a'], accent: ['#ff6a1a', '#ffb040'], glow: ['#ff6a1a', '#ff9a3a'] },
  ocean: { trunk: ['#5a4a38', '#6a5640'], leaf: ['#2a8a6a', '#3d9f4a', '#4aa080'], leaf2: ['#a0e070', '#60d0b0'], accent: ['#ff7a5a', '#ffd060'], glow: ['#7affd8', '#ffe07a'] },
  dead: { trunk: ['#3a3836'], leaf: ['#4a4642'], leaf2: ['#77706a'], accent: ['#6fd0ff'], glow: ['#6fd0ff'] },
};

function floraGenome(body, idx, arch, weight, r) {
  const biome = body.type;
  const P = FLORA_PAL[biome] || FLORA_PAL.lush;
  const A = FLORA_ARCH[arch];
  const g = {
    kind: 'flora', id: `${body.id}:flora${idx}`, bodyId: body.id, biome, arch, tier: A.tier, hazard: A.hazard,
    seed: hmix(body.seed, 7717, idx), weight,
    colors: { trunk: r.pick(P.trunk), leaf: r.pick(P.leaf), leaf2: r.pick(P.leaf2), accent: r.pick(P.accent), glow: r.pick(P.glow), rock: (body.palette && body.palette[2]) || '#77706a', rock2: (body.palette && body.palette[1]) || '#4a4642' },
    scale: [0.8, 1.25],
  };
  if (A.tier === 'tree') g.scale = [0.75, 1.35];
  if (A.tier === 'ground') g.scale = [0.7, 1.4];
  if (arch === 'rock') g.scale = [0.4, 2.2];
  const base = cap(r.pick(A.name));
  const sfx = cap(word(r, ['ia', 'ena', 'ina', 'ora', 'ela', 'ira']));
  g.name = A.tier === 'rock' ? `${base} ${sfx.toLowerCase()}` : `${base}-${sfx.toLowerCase()}`;
  g.latin = `${cap(word(r, SUF_L))} ${word(r, ['ifolia', 'ensis', 'iflora', 'oides', 'ata'])}`;
  g.originalName = g.name;
  g.desc = {
    tree: 'Forma arbórea dominante da paisagem.', shrub: 'Arbusto de sub-bosque.', ground: 'Cobertura rasteira.', rock: 'Formação mineral.',
  }[A.tier] + (A.hazard === 'explode' ? ' PERIGO: vagens pressurizadas explodem ao contato ou disparo.' : A.hazard === 'poison' ? ' PERIGO: libera esporos/ácido tóxico quando perturbada.' : '') + (/glow|lume|lant/i.test(g.name) ? ' Bioluminescente à noite.' : '');
  g.value = { tree: 60, shrub: 45, ground: 15, rock: 10 }[A.tier] + (A.hazard ? 80 : 0) + Math.round(r.range(0, 30));
  g.scannable = A.tier !== 'rock' && A.tier !== 'ground';
  return g;
}

const CACHE = new Map();

/** Espécies de um corpo: { fauna: [...], flora: [...] }. */
export function speciesFor(body) {
  if (!body) return { fauna: [], flora: [] };
  if (CACHE.has(body.id)) return CACHE.get(body.id);
  const r = rng(hmix(body.seed >>> 0, hashStr('life')));
  const out = { fauna: [], flora: [] };
  const biome = body.type;
  if (body.landable && biome !== 'gas') {
    const roster = ROSTER[biome] || ROSTER.lush;
    let i = 0;
    for (const [role, plan] of roster) {
      if (role === 'marine' && !(body.seaLevel > 0.2)) continue;
      out.fauna.push(faunaGenome(body, i++, role, plan, r));
    }
    // corpos com pouca fauna perdem espécies (mantém pelo menos 1)
    const keep = Math.max(1, Math.round(out.fauna.length * Math.min(1, (body.fauna ?? 0.7) + 0.35)));
    out.fauna = out.fauna.slice(0, keep);
    const fs = FLORA_SET[biome] || FLORA_SET.lush;
    fs.forEach(([arch, w], k) => out.flora.push(floraGenome(body, k, arch, w * Math.min(1.2, (body.flora ?? 0.7) + 0.4), r)));
  }
  CACHE.set(body.id, out);
  return out;
}

/** Espécie (fauna ou flora) pelo id. */
export function speciesById(system, id) {
  if (!system) return null;
  const bodyId = id.split(':fauna')[0].split(':flora')[0];
  const b = system.body?.(bodyId);
  if (!b) return null;
  const s = speciesFor(b);
  return s.fauna.find((x) => x.id === id) || s.flora.find((x) => x.id === id) || null;
}
