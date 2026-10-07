/**
 * Lógica pura do inventário (sem DOM, testada em inventory.test.mjs):
 * RNG semeado, sorteio de caixa, faixa da roleta, contrato de troca,
 * valor de sucata, recompensa diária, curva do passe, créditos por
 * partida, maestria e coleção.
 */
import { RARITIES, RARITY, DEFS, CASES, casePool, nextRarity, rarityRank, wearTier, SEED_MAX, DAILY, BP_TIERS, BP_REWARDS, MASTERY_TIERS, masteryDef, KEY_PRICE } from './catalog.js';

// ─── RNG ───────────────────────────────────────────────────────────────
/** mulberry32: [0,1) determinístico a partir da semente. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = (s) => [...String(s)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// ─── chances ───────────────────────────────────────────────────────────
/** Tabela de chances publicada de uma caixa: [{ rarity, p, items }]. Soma 1. */
export function oddsTable(c) {
  return RARITIES.map((r) => ({ rarity: r.id, p: c.odds[r.id] || 0, items: casePool(c, r.id).length })).filter((x) => x.p > 0 && x.items > 0);
}
/** Raridade sorteada por u ∈ [0,1) (pela ordem da tabela). */
export function pickRarity(c, u) {
  const t = oddsTable(c);
  const sum = t.reduce((a, x) => a + x.p, 0);
  let acc = 0;
  for (const x of t) {
    acc += x.p / sum;
    if (u < acc) return x.rarity;
  }
  return t[t.length - 1].rarity;
}

/** Instancia um item de uma definição (desgaste dentro da faixa da skin, semente de padrão). */
export function makeItem(defId, rng, extra = {}) {
  const d = DEFS[defId];
  if (!d) throw new Error('item desconhecido: ' + defId);
  const out = { def: defId };
  if (d.type === 'skin' || d.type === 'knife') {
    const [a, b] = d.wear || [0, 1];
    out.wear = +(a + (b - a) * rng()).toFixed(7);
    out.seed = Math.floor(rng() * (SEED_MAX + 1));
    // contador de abates ("REGISTRO") em ~10% das skins de caixa
    if (d.case && rng() < 0.1) out.counter = 0;
  }
  return Object.assign(out, extra);
}

/** Sorteio de uma abertura de caixa. Determinístico pela semente. */
export function rollCase(c, seed) {
  const rng = mulberry32(seed >>> 0);
  const rarity = pickRarity(c, rng());
  const pool = casePool(c, rarity);
  const def = pool[Math.floor(rng() * pool.length)];
  return makeItem(def, rng, { src: 'case:' + c.id });
}

/**
 * Faixa da roleta: `n` defs onde a posição `winAt` é o prêmio. Os demais são
 * sorteados pelas MESMAS chances publicadas (sem "quase ganhou" fabricado).
 */
export function reelStrip(c, winnerDef, seed, n = 60, winAt = 50) {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === winAt) { out.push(winnerDef); continue; }
    const pool = casePool(c, pickRarity(c, rng()));
    out.push(pool[Math.floor(rng() * pool.length)]);
  }
  return out;
}

/**
 * Curva de desaceleração da roleta (0..1 → 0..1): quíntica de saída — rápida
 * no início, arrasta-se no fim (é o que dá a tensão dos últimos itens).
 */
export const reelEase = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4.2);

// ─── contrato de troca ─────────────────────────────────────────────────
export const TRADE_N = 10;
/** Motivo de recusa ou null se os 10 itens formam um contrato válido. */
export function tradeUpError(items) {
  if (!Array.isArray(items) || items.length !== TRADE_N) return `PRECISA DE ${TRADE_N} ITENS`;
  const defs = items.map((it) => DEFS[it?.def]);
  if (defs.some((d) => !d || d.type !== 'skin' || !d.case)) return 'SÓ SKINS DE CAIXA';
  const r = defs[0].rarity;
  if (defs.some((d) => d.rarity !== r)) return 'TODOS DA MESMA RARIDADE';
  const nx = nextRarity(r);
  if (!nx || nx === 'especial') return 'RARIDADE MÁXIMA PARA CONTRATO';
  return null;
}
/** Resultados possíveis com probabilidade: [{ def, p }] (soma 1). */
export function tradeUpOdds(items) {
  if (tradeUpError(items)) return [];
  const nx = nextRarity(DEFS[items[0].def].rarity);
  const byCase = {};
  for (const it of items) byCase[DEFS[it.def].case] = (byCase[DEFS[it.def].case] || 0) + 1;
  const out = new Map();
  let tot = 0;
  for (const [cid, k] of Object.entries(byCase)) {
    const c = CASES.find((x) => x.id === cid);
    const pool = c ? casePool(c, nx) : [];
    if (!pool.length) continue;
    for (const d of pool) out.set(d, (out.get(d) || 0) + k / pool.length);
    tot += k;
  }
  return [...out].map(([def, w]) => ({ def, p: w / tot })).sort((a, b) => b.p - a.p);
}
/** Executa o contrato: { item } ou { error }. Desgaste = média normalizada na faixa do resultado. */
export function tradeUp(items, seed) {
  const err = tradeUpError(items);
  if (err) return { error: err };
  const odds = tradeUpOdds(items);
  const rng = mulberry32(seed >>> 0);
  const u = rng();
  let acc = 0, def = odds[odds.length - 1].def;
  for (const o of odds) { acc += o.p; if (u < acc) { def = o.def; break; } }
  const avg = items.reduce((a, it) => a + (Number(it.wear) || 0), 0) / items.length;
  const [a, b] = DEFS[def].wear;
  const item = makeItem(def, rng, { src: 'trade' });
  item.wear = +(a + (b - a) * Math.min(1, Math.max(0, avg))).toFixed(7);
  return { item };
}

// ─── sucata ────────────────────────────────────────────────────────────
/** Créditos ao sucatear: base da raridade × condição × bônus do contador. */
export function scrapValue(it) {
  const d = DEFS[it?.def];
  if (!d) return 0;
  let v = RARITY[d.rarity]?.scrap ?? 5;
  if (d.type === 'skin' || d.type === 'knife') v *= wearTier(it.wear).scrap;
  if (it.counter != null) v *= 1.5;
  if (d.mastery) v *= 0.5;
  return Math.max(1, Math.round(v));
}
/**
 * Duplicatas a sucatear: para cada definição, mantém a melhor cópia (equipada
 * > menor desgaste) e devolve os uids das outras que não estão equipadas.
 */
export function duplicateUids(items, equipped = new Set()) {
  const by = new Map();
  for (const it of items) {
    if (!by.has(it.def)) by.set(it.def, []);
    by.get(it.def).push(it);
  }
  const out = [];
  for (const list of by.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (equipped.has(b.uid) - equipped.has(a.uid)) || ((a.wear ?? 0) - (b.wear ?? 0)) || (a.uid - b.uid));
    for (const it of list.slice(1)) if (!equipped.has(it.uid)) out.push(it.uid);
  }
  return out;
}

// ─── recompensa diária ─────────────────────────────────────────────────
/** Chave de data LOCAL 'AAAA-MM-DD'. */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Dias inteiros entre duas chaves locais (b − a). */
export function dayDiff(a, b) {
  const p = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}
/**
 * Estado do diário hoje: { canClaim, streak (após resgatar), day (0..6 no ciclo), reward }.
 * `daily` = { last: 'AAAA-MM-DD'|null, streak }.
 */
export function dailyStatus(daily, today) {
  const last = daily?.last || null;
  const gap = last ? dayDiff(last, today) : Infinity;
  if (gap === 0) {
    const s = Math.max(1, daily.streak || 1);
    return { canClaim: false, streak: s, day: (s - 1) % DAILY.length, reward: DAILY[(s - 1) % DAILY.length], claimedToday: true };
  }
  const streak = gap === 1 ? (daily.streak || 0) + 1 : 1;
  return { canClaim: true, streak, day: (streak - 1) % DAILY.length, reward: DAILY[(streak - 1) % DAILY.length], broken: gap > 1 && !!last };
}
/** Resgata: novo estado do diário + recompensa (ou null se já resgatou hoje). */
export function claimDaily(daily, today) {
  const s = dailyStatus(daily, today);
  if (!s.canClaim) return { daily, reward: null };
  return { daily: { last: today, streak: s.streak }, reward: s.reward, day: s.day };
}

// ─── passe de campanha ─────────────────────────────────────────────────
/** XP para sair do nível t (1..30) para o t+1. */
export const bpNeed = (t) => 1500 + 150 * t;
/** Nível atual do passe a partir do XP: { tier (0..30), into, need, done }. */
export function bpLevel(xp) {
  let x = Math.max(0, Number(xp) || 0);
  let t = 0;
  while (t < BP_TIERS && x >= bpNeed(t + 1)) { x -= bpNeed(t + 1); t++; }
  return { tier: t, into: t >= BP_TIERS ? 0 : x, need: t >= BP_TIERS ? 0 : bpNeed(t + 1), done: t >= BP_TIERS };
}
export const bpTotal = () => Array.from({ length: BP_TIERS }, (_, i) => bpNeed(i + 1)).reduce((a, b) => a + b, 0);
/** Níveis alcançados e ainda não resgatados. */
export const bpClaimable = (xp, claimed = []) => Array.from({ length: bpLevel(xp).tier }, (_, i) => i + 1).filter((t) => !claimed.includes(t));
export const bpReward = (t) => BP_REWARDS[t - 1] || null;

// ─── créditos por partida ──────────────────────────────────────────────
export const CREDITS = { kill: 5, headshot: 3, capture: 25, wave: 10, boss: 120, medal: 4, win: 150, loss: 40, perMinute: 6 };
/**
 * Créditos ganhos numa partida: { total, lines: [[rótulo, valor]] }.
 * Entrada = estatísticas da partida (a hud emite em 'match:end').
 */
export function matchCredits({ kills = 0, headshots = 0, captures = 0, waves = 0, bossKilled = false, medals = 0, win = false, playTime = 0 } = {}) {
  const C = CREDITS;
  const lines = [];
  const add = (k, v) => { v = Math.max(0, Math.round(v)); if (v) lines.push([k, v]); };
  add('ABATES', kills * C.kill);
  add('HEADSHOTS', headshots * C.headshot);
  add('OBJETIVOS', captures * C.capture + waves * C.wave + (bossKilled ? C.boss : 0));
  add('MEDALHAS', medals * C.medal);
  add('TEMPO', Math.min(20, playTime / 60) * C.perMinute);
  add(win ? 'VITÓRIA' : 'PARTICIPAÇÃO', win ? C.win : C.loss);
  return { total: lines.reduce((a, [, v]) => a + v, 0), lines };
}

// ─── maestria ──────────────────────────────────────────────────────────
/** Progresso de maestria de uma arma: { done:[tierIds], next, into, need }. */
export function masteryProgress(kills = 0) {
  const done = MASTERY_TIERS.filter((t) => kills >= t.kills).map((t) => t.id);
  const next = MASTERY_TIERS.find((t) => kills < t.kills) || null;
  const prev = [...MASTERY_TIERS].reverse().find((t) => kills >= t.kills);
  return { done, next, into: kills - (prev?.kills || 0), need: next ? next.kills - (prev?.kills || 0) : 0 };
}
/** Defs de maestria recém-alcançadas ao passar de `before` para `after` abates. */
export const masteryUnlocks = (base, before, after) => MASTERY_TIERS.filter((t) => before < t.kills && after >= t.kills).map((t) => masteryDef(base, t.id)?.id).filter(Boolean);

// ─── coleção ───────────────────────────────────────────────────────────
/** Completude por caixa: [{ case, owned, total, pct, ownedSet }] + total geral. */
export function collection(items) {
  const have = new Set(items.map((it) => it.def));
  const per = CASES.map((c) => {
    const all = [...c.skins, ...c.knives];
    const owned = all.filter((d) => have.has(d)).length;
    return { case: c.id, owned, total: all.length, pct: owned / all.length };
  });
  const owned = per.reduce((a, x) => a + x.owned, 0), total = per.reduce((a, x) => a + x.total, 0);
  return { per, owned, total, pct: total ? owned / total : 0 };
}

/** Custo de abrir: 1 chave OU créditos (ambos só ganhos jogando). */
export function openCost(state, c, pay) {
  if (pay === 'key') return (state.keys || 0) >= 1 ? { keys: 1 } : null;
  const price = c.price || KEY_PRICE;
  return (state.credits || 0) >= price ? { credits: price } : null;
}

/** Ordenações do inventário. */
export const SORTS = {
  recent: (a, b) => (b.t || 0) - (a.t || 0) || b.uid - a.uid,
  rarity: (a, b) => rarityRank(DEFS[b.def]?.rarity) - rarityRank(DEFS[a.def]?.rarity) || (a.wear ?? 0) - (b.wear ?? 0),
  name: (a, b) => String(DEFS[a.def]?.name).localeCompare(String(DEFS[b.def]?.name), 'pt-BR'),
  wear: (a, b) => (a.wear ?? 9) - (b.wear ?? 9),
};
