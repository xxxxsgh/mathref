// Adversários, conquistas, save/progressão.
import { PADDLES, BALLS } from './props.js';
import { TABLE_COLORS } from './arena.js';

export const OPPONENTS = [
  {
    id: 'juca', name: 'Tio Juca', flag: '🇧🇷', style: 'Iniciante', desc: 'Joga no clube do bairro aos domingos. Bolas altas e muita simpatia.',
    look: { shirt: 0x16a34a, accent: 0xfacc15, shorts: 0x1e3a8a, skin: 0xc68642, hair: 0x9ca3af, hairStyle: 'buzz', beard: true, scale: 0.98, number: 60 },
    ai: { move: 1.9, react: 0.3, readErr: 0.075, reach: 0.5, consistency: 1.15, power: [4.2, 6.2], top: [10, 70], back: 0.15, aggression: 0.15, placement: 0.2, smash: 0.25, depth: 0.45, spinRead: 0.5 },
    reward: 120, xp: 60, games: 2,
  },
  {
    id: 'bia', name: 'Bia Paredão', flag: '🇧🇷', style: 'Bloqueadora', desc: 'Colada na mesa, devolve tudo. Paciência é a arma dela.',
    look: { shirt: 0xec4899, accent: 0xffffff, shorts: 0x111827, skin: 0xf1c27d, hair: 0x3b1f0f, hairStyle: 'ponytail', band: 0xffffff, scale: 0.94, number: 8 },
    ai: { move: 2.6, react: 0.17, readErr: 0.05, reach: 0.52, consistency: 0.85, power: [5.2, 7.6], top: [20, 80], back: 0.1, aggression: 0.25, placement: 0.55, smash: 0.4, depth: 0.25, spinRead: 0.65 },
    reward: 180, xp: 90, games: 2,
  },
  {
    id: 'kenji', name: 'Kenji Sato', flag: '🇯🇵', style: 'Topspin', desc: 'Faz a bola mergulhar com topspin pesado. Cuidado com bolas que "pulam".',
    look: { shirt: 0x1d4ed8, accent: 0xef4444, shorts: 0x0f172a, skin: 0xf1c27d, hair: 0x0a0a0a, hairStyle: 'spiky', scale: 1, number: 21 },
    ai: { move: 3.0, react: 0.14, readErr: 0.04, reach: 0.55, consistency: 0.75, power: [6.5, 10], top: [120, 230], back: 0.05, aggression: 0.6, placement: 0.65, smash: 0.6, depth: 0.55, spinRead: 0.7 },
    reward: 260, xp: 130, games: 2,
  },
  {
    id: 'olga', name: 'Dona Olga', flag: '🇷🇺', style: 'Defensora', desc: 'Joga longe da mesa cortando tudo com backspin. Bola que "morre" na rede.',
    look: { shirt: 0x7c3aed, accent: 0xfbbf24, shorts: 0x1f2937, skin: 0xffdbac, hair: 0xd6d3d1, hairStyle: 'bun', glasses: true, scale: 0.95, number: 67 },
    ai: { move: 3.1, react: 0.14, readErr: 0.035, reach: 0.58, consistency: 0.65, power: [4.8, 7], top: [30, 90], back: 0.85, aggression: 0.2, placement: 0.7, smash: 0.5, depth: 1.25, spinRead: 0.85 },
    reward: 340, xp: 170, games: 2,
  },
  {
    id: 'rafa', name: 'Rafa Relâmpago', flag: '🇧🇷', style: 'Atacante', desc: 'Pancada atrás de pancada. Se a bola subir, é smash.',
    look: { shirt: 0xfacc15, accent: 0x16a34a, shorts: 0x14532d, skin: 0x8d5524, hair: 0x0a0a0a, hairStyle: 'afro', band: 0x16a34a, scale: 1.03, number: 10 },
    ai: { move: 3.5, react: 0.11, readErr: 0.03, reach: 0.58, consistency: 0.6, power: [7.5, 12], top: [90, 200], back: 0.08, aggression: 0.85, placement: 0.75, smash: 0.9, depth: 0.6, spinRead: 0.8 },
    reward: 450, xp: 220, games: 2,
  },
  {
    id: 'wang', name: 'Mestre Wang', flag: '🇨🇳', style: 'Lenda', desc: 'Campeão mundial aposentado. Lê cada efeito e coloca a bola onde quer.',
    look: { shirt: 0xdc2626, accent: 0xfbbf24, shorts: 0x7f1d1d, skin: 0xf1c27d, hair: 0x111111, hairStyle: 'short', scale: 1, number: 1 },
    ai: { move: 4.1, react: 0.08, readErr: 0.018, reach: 0.6, consistency: 0.42, power: [7, 12.5], top: [120, 260], back: 0.3, aggression: 0.7, placement: 0.92, smash: 0.95, depth: 0.7, spinRead: 0.95 },
    reward: 800, xp: 400, games: 3,
  },
];

export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'Primeira vitória', desc: 'Vença uma partida', coins: 100 },
  { id: 'career', name: 'Campeão', desc: 'Vença o Mestre Wang na carreira', coins: 1500 },
  { id: 'rally20', name: 'Ping… pong… ping…', desc: 'Faça um rally de 20 batidas', coins: 150 },
  { id: 'rally50', name: 'Maratonista', desc: 'Rally infinito com 50 batidas', coins: 400 },
  { id: 'combo10', name: 'Mão de seda', desc: 'Combo de 10 PERFEITOS', coins: 250 },
  { id: 'smash50', name: 'Martelo', desc: '50 smashes vencedores', coins: 300 },
  { id: 'perfect100', name: 'Precisão', desc: '100 batidas PERFEITAS', coins: 250 },
  { id: 'bagel', name: 'Pneu!', desc: 'Vença um game por 11 a 0', coins: 500 },
  { id: 'comeback', name: 'Virada', desc: 'Vença um game estando 5 pontos atrás', coins: 300 },
  { id: 'targets', name: 'Sniper', desc: '1500 pontos no desafio de alvos', coins: 300 },
  { id: 'shopper', name: 'Estilo', desc: 'Compre um item na loja', coins: 50 },
  { id: 'level10', name: 'Veterano', desc: 'Chegue ao nível 10', coins: 500 },
  { id: 'ace', name: 'Ace!', desc: 'Ganhe um ponto direto no saque', coins: 100 },
  { id: 'edge', name: 'Sortudo', desc: 'Ganhe um ponto com bola na fita', coins: 80 },
];

const KEY = 'viciante3d-v2';
const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT = () => ({
  v: 2, xp: 0, coins: 150,
  career: 0,                   // adversários vencidos
  stats: { wins: 0, losses: 0, points: 0, smashes: 0, perfects: 0, bestRally: 0, bestCombo: 0, rallyBest: 0, targetsBest: 0, smashBest: 0, played: 0 },
  owned: { paddle: ['classica'], ball: ['branca'], table: ['azul'] },
  equip: { paddle: 'classica', ball: 'branca', table: 'azul' },
  ach: {},
  daily: { last: '', streak: 0 },
  settings: { sound: true, volume: 0.8, music: true, crowd: true, voice: true, quality: 'alta', speed: 0.85, assist: 1, sens: 1, trail: true, shake: true, camera: 'padrao', replays: true, ghost: true },
  tutorial: false,
  name: 'Você',
});

export class Save {
  constructor() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
    const base = DEFAULT();
    this.d = d ? deepMerge(base, d) : base;
    if (!d && matchMedia('(pointer:coarse)').matches) this.d.settings.quality = 'media';
    this.listeners = [];
  }
  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch {} }
  get s() { return this.d.settings; }

  static xpFor(lvl) { return 80 + (lvl - 1) * 60; }
  levelInfo(xp = this.d.xp) {
    let lvl = 1, rest = xp;
    while (rest >= Save.xpFor(lvl)) { rest -= Save.xpFor(lvl); lvl++; }
    return { lvl, cur: rest, need: Save.xpFor(lvl) };
  }
  addXP(n) {
    const before = this.levelInfo().lvl;
    this.d.xp += Math.max(0, Math.round(n));
    const after = this.levelInfo().lvl;
    if (after >= 10) this.unlock('level10');
    this.persist();
    return after > before ? after : 0;
  }
  addCoins(n) { this.d.coins += Math.round(n); this.persist(); }

  unlock(id) {
    if (this.d.ach[id]) return null;
    const a = ACHIEVEMENTS.find(a => a.id === id);
    if (!a) return null;
    this.d.ach[id] = today();
    this.d.coins += a.coins;
    this.persist();
    this.listeners.forEach(f => f(a));
    return a;
  }
  onAchievement(f) { this.listeners.push(f); }

  // Recompensa diária com sequência
  claimDaily() {
    const t = today();
    if (this.d.daily.last === t) return null;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    this.d.daily.streak = this.d.daily.last === y ? Math.min(this.d.daily.streak + 1, 7) : 1;
    this.d.daily.last = t;
    const coins = [0, 50, 75, 100, 150, 200, 300, 500][this.d.daily.streak];
    this.d.coins += coins;
    this.persist();
    return { coins, streak: this.d.daily.streak };
  }

  catalog(kind) {
    if (kind === 'paddle') return PADDLES;
    if (kind === 'ball') return BALLS;
    return Object.entries(TABLE_COLORS).map(([id, t], i) => ({ id, name: t.name, price: [0, 250, 400, 700, 900][i], color: t.top }));
  }
  owns(kind, id) { return this.d.owned[kind].includes(id); }
  buy(kind, id) {
    const it = this.catalog(kind).find(x => x.id === id);
    if (!it || this.owns(kind, id)) return false;
    if (it.lvl && this.levelInfo().lvl < it.lvl) return false;
    if (this.d.coins < it.price) return false;
    this.d.coins -= it.price;
    this.d.owned[kind].push(id);
    this.d.equip[kind] = id;
    this.persist();
    this.unlock('shopper');
    return true;
  }
  equip(kind, id) { if (this.owns(kind, id)) { this.d.equip[kind] = id; this.persist(); } }
}

function deepMerge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]);
    else if (b[k] !== undefined) a[k] = b[k];
  }
  return a;
}
