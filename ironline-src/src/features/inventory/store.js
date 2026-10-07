/**
 * Persistência do inventário: localStorage 'ironline.inventory' (versionado,
 * sempre em try/catch — navegação privada/cota cheia não quebram o jogo).
 */
import { CARDS, EMBLEMS, DEFS } from './catalog.js';

export const KEY = 'ironline.inventory';
export const VERSION = 1;

export function defaults() {
  return {
    v: VERSION,
    credits: 500,
    keys: 1,
    nextUid: 1,
    items: [],
    equip: { skins: {}, knife: null, charms: {}, stickers: {}, card: CARDS[0].id, emblem: EMBLEMS[0].id, primary: null, secondary: null },
    daily: { last: null, streak: 0 },
    bp: { xp: 0, claimed: [] },
    mastery: { kills: {} },
    cards: CARDS.filter((c) => c.def).map((c) => c.id),
    emblems: EMBLEMS.filter((e) => e.def).map((e) => e.id),
    stats: { opened: 0, traded: 0, scrapped: 0, earned: 0 },
  };
}

/** Saneia/migra um estado lido (campos ausentes, itens de defs removidas). */
export function migrate(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const s = { ...d, ...raw, v: VERSION };
  s.equip = { ...d.equip, ...(raw.equip || {}) };
  for (const k of ['skins', 'charms', 'stickers']) s.equip[k] = { ...(raw.equip?.[k] || {}) };
  s.daily = { ...d.daily, ...(raw.daily || {}) };
  s.bp = { ...d.bp, ...(raw.bp || {}) };
  s.mastery = { kills: { ...(raw.mastery?.kills || {}) } };
  s.stats = { ...d.stats, ...(raw.stats || {}) };
  s.items = (Array.isArray(raw.items) ? raw.items : []).filter((it) => it && DEFS[it.def] && Number.isFinite(it.uid));
  s.cards = [...new Set([...(d.cards), ...(raw.cards || [])])];
  s.emblems = [...new Set([...(d.emblems), ...(raw.emblems || [])])];
  s.credits = Math.max(0, Math.floor(Number(s.credits) || 0));
  s.keys = Math.max(0, Math.floor(Number(s.keys) || 0));
  s.nextUid = Math.max(s.nextUid || 1, ...s.items.map((it) => it.uid + 1));
  // equipados que não existem mais
  const uids = new Set(s.items.map((it) => it.uid));
  for (const k of ['skins', 'charms']) for (const [b, u] of Object.entries(s.equip[k])) if (!uids.has(u)) delete s.equip[k][b];
  for (const [b, list] of Object.entries(s.equip.stickers)) s.equip.stickers[b] = (list || []).filter((u) => uids.has(u)).slice(0, 4);
  if (s.equip.knife != null && !uids.has(s.equip.knife)) s.equip.knife = null;
  return s;
}

export function load() {
  try {
    const txt = globalThis.localStorage?.getItem(KEY);
    return migrate(txt ? JSON.parse(txt) : null);
  } catch {
    return defaults();
  }
}
export function save(state) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
