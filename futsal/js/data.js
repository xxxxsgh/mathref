// Conteúdo do jogo: 16 times fictícios, elencos gerados, escudos e uniformes
// desenhados em pixel art, e os 5 ginásios.
import { rng, hashStr, clamp, shuffle } from './util.js';

const FIRST = ['Dudu', 'Caio', 'Rafa', 'Léo', 'Tiago', 'Biel', 'Netinho', 'Juca', 'Vini', 'Breno', 'Davi', 'Igor',
  'Kauã', 'Luan', 'Murilo', 'Nando', 'Otávio', 'Pedrinho', 'Renan', 'Samuca', 'Téo', 'Valdo', 'Wesley', 'Yuri',
  'Zeca', 'Arthur', 'Bento', 'Cadu', 'Edu', 'Fabinho', 'Guto', 'Hugo', 'Ian', 'Joca', 'Kiko', 'Lipe', 'Maicon',
  'Nico', 'Paulinho', 'Quico', 'Rodrigo', 'Serginho', 'Toninho', 'Uiliam', 'Vitão', 'Xande', 'Alemão', 'Baiano',
  'Careca', 'Dinho', 'Ériton', 'Fumaça', 'Gigante', 'Henrique', 'Japa', 'Magrão', 'Neguinho', 'Pipoca', 'Russo', 'Tatu'];
const LAST = ['Andrade', 'Barros', 'Campos', 'Duarte', 'Esteves', 'Farias', 'Gusmão', 'Holanda', 'Lacerda', 'Macedo',
  'Nogueira', 'Pacheco', 'Queiroz', 'Rezende', 'Sampaio', 'Tavares', 'Valente', 'Xavier', 'Bezerra', 'Cordeiro',
  'Dantas', 'Feitosa', 'Guedes', 'Leal', 'Moura', 'Neves', 'Prado', 'Rangel', 'Siqueira', 'Teles', 'Vasconcelos', 'Aguiar'];

// Times 100% fictícios. kit: shirt/shirt2 + padrão, shorts, socks.
const TEAM_DEFS = [
  ['Trovão FS', 'TRO', 82, ['#1d4ed8', '#facc15'], 'shield', 'chevron', ['#1d4ed8', '#facc15', 'liso', '#1e3a8a', '#facc15'], ['#f8fafc', '#1d4ed8', 'faixa', '#f8fafc', '#1d4ed8']],
  ['Maré Alta EC', 'MAR', 74, ['#38bdf8', '#ffffff'], 'circle', 'waves', ['#38bdf8', '#ffffff', 'aros', '#ffffff', '#38bdf8'], ['#0f172a', '#38bdf8', 'liso', '#0f172a', '#0f172a']],
  ['Ipê Roxo FS', 'IPE', 70, ['#7e22ce', '#fde047'], 'shield', 'half', ['#7e22ce', '#fde047', 'listras', '#3b0764', '#7e22ce'], ['#fde047', '#7e22ce', 'liso', '#7e22ce', '#fde047']],
  ['Leões do Cerrado', 'LEO', 79, ['#f97316', '#111827'], 'shield', 'stripe', ['#f97316', '#111827', 'meio', '#111827', '#f97316'], ['#ffffff', '#f97316', 'liso', '#ffffff', '#ffffff']],
  ['Carcará FS', 'CAR', 66, ['#78350f', '#f5f5f4'], 'diamond', 'chevron', ['#f5f5f4', '#78350f', 'faixa', '#78350f', '#f5f5f4'], ['#78350f', '#f5f5f4', 'liso', '#44403c', '#78350f']],
  ['Furacão do Agreste', 'FUR', 85, ['#dc2626', '#0a0a0a'], 'shield', 'stripe', ['#dc2626', '#0a0a0a', 'listras', '#0a0a0a', '#dc2626'], ['#fafafa', '#dc2626', 'liso', '#fafafa', '#fafafa']],
  ['Capivaras FC', 'CAP', 62, ['#15803d', '#a16207'], 'circle', 'half', ['#15803d', '#a16207', 'liso', '#a16207', '#15803d'], ['#fef3c7', '#15803d', 'aros', '#15803d', '#fef3c7']],
  ['Jangada EC', 'JAN', 72, ['#ffffff', '#1e3a8a'], 'shield', 'waves', ['#ffffff', '#1e3a8a', 'faixa', '#1e3a8a', '#ffffff'], ['#1e3a8a', '#ffffff', 'liso', '#1e3a8a', '#1e3a8a']],
  ['Raio Verde FS', 'RAI', 77, ['#22c55e', '#ffffff'], 'diamond', 'bolt', ['#22c55e', '#ffffff', 'listras', '#ffffff', '#22c55e'], ['#052e16', '#22c55e', 'liso', '#052e16', '#22c55e']],
  ['Tucanos da Serra', 'TUC', 68, ['#0a0a0a', '#fb923c'], 'circle', 'stripe', ['#0a0a0a', '#fb923c', 'meio', '#0a0a0a', '#fb923c'], ['#fb923c', '#0a0a0a', 'liso', '#fb923c', '#0a0a0a']],
  ['Pororoca FS', 'POR', 73, ['#0e7490', '#84cc16'], 'shield', 'waves', ['#0e7490', '#84cc16', 'aros', '#0e7490', '#84cc16'], ['#ecfccb', '#0e7490', 'liso', '#ecfccb', '#0e7490']],
  ['Mandacaru EC', 'MAN', 64, ['#166534', '#eab308'], 'diamond', 'half', ['#eab308', '#166534', 'faixa', '#166534', '#166534'], ['#166534', '#eab308', 'liso', '#14532d', '#eab308']],
  ['Cometa FS', 'COM', 80, ['#cbd5e1', '#e11d48'], 'circle', 'bolt', ['#cbd5e1', '#e11d48', 'faixa', '#e11d48', '#cbd5e1'], ['#e11d48', '#cbd5e1', 'liso', '#881337', '#e11d48']],
  ['Pirarucu FC', 'PIR', 69, ['#b91c1c', '#16a34a'], 'shield', 'chevron', ['#b91c1c', '#16a34a', 'listras', '#16a34a', '#b91c1c'], ['#f0fdf4', '#b91c1c', 'liso', '#f0fdf4', '#16a34a']],
  ['Vento Sul FS', 'VEN', 75, ['#64748b', '#2563eb'], 'diamond', 'stripe', ['#475569', '#93c5fd', 'meio', '#1e293b', '#475569'], ['#dbeafe', '#2563eb', 'liso', '#2563eb', '#dbeafe']],
  ['Lobo-Guará FS', 'LOB', 71, ['#c2410c', '#451a03'], 'shield', 'half', ['#c2410c', '#451a03', 'liso', '#451a03', '#c2410c'], ['#fff7ed', '#c2410c', 'listras', '#fff7ed', '#c2410c']],
];

// Posições: GK goleiro, FIX fixo, ALA, PIV pivô.
const SQUAD_ROLES = ['GK', 'FIX', 'ALA', 'ALA', 'PIV', 'GK', 'FIX', 'ALA', 'ALA', 'PIV'];
const ROLE_BIAS = {
  GK: { vel: -8, pas: -10, fin: -25, dri: -20, mar: -5, fol: 0 },
  FIX: { vel: -3, pas: 4, fin: -6, dri: -4, mar: 10, fol: 3 },
  ALA: { vel: 6, pas: 2, fin: 0, dri: 6, mar: -2, fol: 5 },
  PIV: { vel: 0, pas: -2, fin: 9, dri: 3, mar: -8, fol: -2 },
};

export function makePlayer(r, role, rating, number) {
  const b = ROLE_BIAS[role];
  const a = (bias) => clamp(Math.round(rating + bias + (r() - 0.5) * 16), 25, 99);
  const p = {
    id: Math.floor(r() * 1e9).toString(36),
    name: FIRST[Math.floor(r() * FIRST.length)] + (r() < 0.35 ? ' ' + LAST[Math.floor(r() * LAST.length)] : ''),
    number, role, age: 18 + Math.floor(r() * 17),
    skin: Math.floor(r() * 4), hair: Math.floor(r() * 5),
    vel: a(b.vel), pas: a(b.pas), fin: a(b.fin), dri: a(b.dri), mar: a(b.mar), fol: a(b.fol),
  };
  if (role === 'GK') {
    p.ref = a(6); p.pos = a(4); p.rep = a(0);
  } else {
    p.ref = a(-30); p.pos = a(-30); p.rep = a(-30);
  }
  return p;
}

function buildTeam(def, i) {
  const [name, short, rating, crestCols, shape, pattern, k1, k2] = def;
  const r = rng(hashStr(name));
  const used = new Set();
  const players = SQUAD_ROLES.map((role, j) => {
    let n;
    if (role === 'GK') n = j === 0 ? 1 : 12;
    else do { n = 2 + Math.floor(r() * 18); } while (used.has(n) || n === 12);
    used.add(n);
    const pl = makePlayer(r, role, rating - (j >= 5 ? 5 : 0), n);
    return pl;
  });
  // Evita nomes repetidos dentro do mesmo elenco.
  const names = new Set();
  for (const p of players) {
    while (names.has(p.name)) p.name = FIRST[Math.floor(r() * FIRST.length)] + ' ' + LAST[Math.floor(r() * LAST.length)];
    names.add(p.name);
  }
  const kit = (k) => ({ shirt: k[0], shirt2: k[1], pattern: k[2], shorts: k[3], socks: k[4] });
  return {
    id: 't' + i, name, short, rating,
    crest: { shape, pattern, c1: crestCols[0], c2: crestCols[1] },
    kits: [kit(k1), kit(k2)],
    gkKit: { shirt: '#a3e635', shirt2: '#14532d', pattern: 'liso', shorts: '#14532d', socks: '#a3e635' },
    players,
    tactic: { formation: '3-1', marking: 'zona', press: 'normal', lineup: [0, 1, 2, 3, 4] },
  };
}

export function defaultTeams() {
  return TEAM_DEFS.map(buildTeam);
}

export function teamOverall(team) {
  const ps = team.players.filter((p) => p.role !== 'GK');
  const avg = (k) => ps.reduce((s, p) => s + p[k], 0) / ps.length;
  return Math.round((avg('vel') + avg('pas') + avg('fin') + avg('dri') + avg('mar') + avg('fol')) / 6);
}

export function playerOverall(p) {
  if (p.role === 'GK') return Math.round((p.ref * 2 + p.pos * 2 + p.rep + p.vel * 0.5) / 5.5);
  return Math.round((p.vel + p.pas + p.fin + p.dri + p.mar + p.fol) / 6);
}

export const ROLE_NAMES = { GK: 'GOL', FIX: 'FIX', ALA: 'ALA', PIV: 'PIV' };

// ─── Ginásios ───────────────────────────────────────────────────────────────
export const GYMS = [
  { id: 'madeira', name: 'Ginásio Clássico', floor: 'wood', floorA: '#c8894a', floorB: '#b5763c', lines: '#f5f5f4',
    area: '#a85d2a', wall: '#3f2a1d', stands: '#5b3b2a', roof: '#1c1410', light: 0xfff1d6, crowd: 0.8, sky: '#140d09' },
  { id: 'moderno', name: 'Arena Emborrachada', floor: 'rubber', floorA: '#2563eb', floorB: '#1d4ed8', lines: '#ffffff',
    area: '#f97316', wall: '#1e293b', stands: '#334155', roof: '#0f172a', light: 0xe0f2fe, crowd: 0.9, sky: '#0b1120' },
  { id: 'bairro', name: 'Quadra do Bairro', floor: 'concrete', floorA: '#4d7c5a', floorB: '#45704f', lines: '#fef9c3',
    area: '#3f6648', wall: '#6b7280', stands: '#57534e', roof: '#292524', light: 0xfff7d6, crowd: 0.35, sky: '#1c1917' },
  { id: 'final', name: 'Arena da Final', floor: 'wood', floorA: '#9a5b2e', floorB: '#8a4f26', lines: '#fde047',
    area: '#1e3a8a', wall: '#111827', stands: '#1f2937', roof: '#030712', light: 0xffffff, crowd: 1.0, sky: '#030712' },
  { id: 'rua', name: 'Quadra de Rua', floor: 'asphalt', floorA: '#3f3f46', floorB: '#36363c', lines: '#f8fafc',
    area: '#7f1d1d', wall: '#78716c', stands: '#44403c', roof: null, light: 0xffe4b5, crowd: 0.25, sky: '#1e1b4b' },
];

// ─── Desenho: escudo e uniforme em pixel art ───────────────────────────────
const SHAPES = ['shield', 'circle', 'diamond'];
const PATTERNS = ['chevron', 'stripe', 'half', 'waves', 'bolt'];
export const CREST_SHAPES = SHAPES;
export const CREST_PATTERNS = PATTERNS;
export const KIT_PATTERNS = ['liso', 'listras', 'faixa', 'meio', 'aros'];

function inShape(shape, x, y, s) {
  const cx = s / 2 - 0.5, nx = (x - cx) / (s / 2), ny = (y - (s / 2 - 0.5)) / (s / 2);
  if (shape === 'circle') return nx * nx + ny * ny <= 0.92;
  if (shape === 'diamond') return Math.abs(nx) + Math.abs(ny) <= 0.98;
  // escudo
  if (ny < -0.15) return Math.abs(nx) <= 0.86 && ny >= -0.88;
  return Math.abs(nx) <= 0.86 * (1 - ((ny + 0.15) / 1.08) ** 2) && ny <= 0.94;
}

// Fonte 3x5 para as iniciais do escudo.
const GLYPH = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
};

export function drawCrest(team, size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const { shape, pattern, c1, c2 } = team.crest;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inShape(shape, x, y, size)) continue;
      const edge = !inShape(shape, x - 1, y, size) || !inShape(shape, x + 1, y, size) || !inShape(shape, x, y - 1, size) || !inShape(shape, x, y + 1, size);
      let col = c1;
      const u = x / size, v = y / size;
      if (pattern === 'stripe') col = Math.floor(u * 7) % 2 ? c2 : c1;
      else if (pattern === 'half') col = u < 0.5 ? c1 : c2;
      else if (pattern === 'chevron') col = Math.abs(v - 0.55 - Math.abs(u - 0.5) * 0.9) < 0.12 ? c2 : c1;
      else if (pattern === 'waves') col = Math.sin(u * 12 + v * 2) * 0.1 + 0.62 < v && v < 0.8 ? c2 : c1;
      else if (pattern === 'bolt') col = Math.abs((u - 0.5) - (v < 0.5 ? (0.5 - v) * 0.4 : (v - 0.5) * -0.4)) < 0.08 ? c2 : c1;
      g.fillStyle = edge ? '#0b0b0f' : col;
      g.fillRect(x, y, 1, 1);
    }
  }
  // Iniciais centralizadas sobre uma faixa
  const txt = (team.short || 'FC').toUpperCase().slice(0, 3);
  const scale = size >= 32 ? 2 : 1;
  const w = txt.length * 4 * scale - scale;
  const ox = Math.round(size / 2 - w / 2), oy = Math.round(size * 0.36);
  g.fillStyle = 'rgba(10,10,15,0.75)';
  g.fillRect(ox - scale, oy - scale, w + scale * 2, 5 * scale + scale * 2);
  g.fillStyle = '#ffffff';
  [...txt].forEach((ch, i) => {
    const gl = GLYPH[ch];
    if (!gl) return;
    for (let k = 0; k < 15; k++) if (gl[k] === '1') g.fillRect(ox + i * 4 * scale + (k % 3) * scale, oy + Math.floor(k / 3) * scale, scale, scale);
  });
  return c;
}

// Textura da camisa (16x16) para os modelos 3D.
export function drawKitTexture(kit, number) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let col = kit.shirt;
      if (kit.pattern === 'listras') col = Math.floor(x / 2) % 2 ? kit.shirt2 : kit.shirt;
      else if (kit.pattern === 'faixa') col = Math.abs(x - y) < 2 ? kit.shirt2 : kit.shirt;
      else if (kit.pattern === 'meio') col = x < 8 ? kit.shirt : kit.shirt2;
      else if (kit.pattern === 'aros') col = Math.floor(y / 3) % 2 ? kit.shirt2 : kit.shirt;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  // gola
  g.fillStyle = kit.shirt2;
  g.fillRect(5, 0, 6, 1);
  if (number != null) {
    g.fillStyle = kit.pattern === 'liso' ? kit.shirt2 : '#ffffff';
    const s = String(number);
    const dig = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };
    const w = s.length * 4 - 1, ox = Math.round(8 - w / 2);
    [...s].forEach((d, i) => {
      for (let k = 0; k < 15; k++) if (dig[d][k] === '1') g.fillRect(ox + i * 4 + (k % 3), 6 + Math.floor(k / 3), 1, 1);
    });
  }
  return c;
}

export const SKIN_TONES = ['#f1c7a3', '#d9a066', '#a8693f', '#6b4226'];
export const HAIR_COLS = ['#1c1917', '#4a2c17', '#a16207', '#e7e5e4', '#7c2d12'];

// Prévia do uniforme (bonequinho de frente) para as telas de seleção.
export function drawKitPreview(kit, scale = 3) {
  const W = 12, H = 20;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d');
  const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x * scale, y * scale, w * scale, h * scale); };
  px(4, 0, '#1c1917', 4, 1); px(4, 1, '#d9a066', 4, 3);
  for (let y = 4; y < 11; y++) for (let x = 2; x < 10; x++) {
    let col = kit.shirt;
    if (kit.pattern === 'listras') col = x % 2 ? kit.shirt2 : kit.shirt;
    else if (kit.pattern === 'faixa') col = Math.abs((x - 2) - (y - 4)) < 1.5 ? kit.shirt2 : kit.shirt;
    else if (kit.pattern === 'meio') col = x < 6 ? kit.shirt : kit.shirt2;
    else if (kit.pattern === 'aros') col = y % 2 ? kit.shirt2 : kit.shirt;
    px(x, y, col);
  }
  px(0, 4, kit.shirt, 2, 3); px(10, 4, kit.shirt, 2, 3); px(0, 7, '#d9a066', 2, 2); px(10, 7, '#d9a066', 2, 2);
  px(3, 11, kit.shorts, 6, 3);
  px(3, 14, '#d9a066', 2, 1); px(7, 14, '#d9a066', 2, 1);
  px(3, 15, kit.socks, 2, 3); px(7, 15, kit.socks, 2, 3);
  px(2, 18, '#f8fafc', 3, 1); px(7, 18, '#f8fafc', 3, 1);
  return c;
}

// Distância perceptual simples entre cores, para escolher o uniforme 2
// quando os dois times usariam camisas parecidas.
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function colorDist(a, b) {
  const [r1, g1, b1] = hexRgb(a), [r2, g2, b2] = hexRgb(b);
  return Math.sqrt((r1 - r2) ** 2 * 0.3 + (g1 - g2) ** 2 * 0.59 + (b1 - b2) ** 2 * 0.11);
}

export function pickKits(home, away, homeKit = 0, awayKit = 0) {
  const h = home.kits[homeKit];
  let a = awayKit;
  if (colorDist(h.shirt, away.kits[a].shirt) < 60) a = 1 - a;
  if (colorDist(h.shirt, away.kits[a].shirt) < 60) a = awayKit;
  return [homeKit, a];
}

export function randomTeamName(r = Math.random) {
  const A = ['Estrela', 'Fênix', 'Tubarões', 'Gaviões', 'Unidos', 'Atlético', 'Real', 'Sport', 'Esporte'];
  const B = ['do Litoral', 'da Colina', 'do Norte', 'da Vila Rosa', 'Celeste', 'Dourado', 'FS', 'EC', 'do Sertão'];
  return A[Math.floor(r() * A.length)] + ' ' + B[Math.floor(r() * B.length)];
}

export { shuffle };
