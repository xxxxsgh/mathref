/**
 * Testes da lógica pura do inventário (node --test, sem DOM). Importado por
 * `tools/unit.test.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RARITIES, CASES, DEFS, WEAR_TIERS, wearTier, casePool, BP_TIERS, BP_REWARDS, DAILY, MASTERY_TIERS, nextRarity } from './catalog.js';
import {
  mulberry32, oddsTable, pickRarity, rollCase, reelStrip, reelEase, tradeUp, tradeUpOdds, tradeUpError, scrapValue, duplicateUids,
  dateKey, dayDiff, dailyStatus, claimDaily, bpNeed, bpLevel, bpTotal, bpClaimable, matchCredits, masteryProgress, masteryUnlocks, collection, openCost, makeItem,
} from './logic.js';
import { migrate, defaults } from './store.js';
import { demoState } from './index.js';

test('inventário: chances publicadas somam 100% e toda caixa tem faca', () => {
  assert.ok(Math.abs(RARITIES.reduce((a, r) => a + r.odds, 0) - 1) < 1e-9);
  assert.equal(CASES.length, 3);
  for (const c of CASES) {
    const t = oddsTable(c);
    assert.ok(Math.abs(t.reduce((a, x) => a + x.p, 0) - 1) < 1e-9, c.id);
    assert.ok(t.find((x) => x.rarity === 'especial').items >= 4, 'facas na caixa ' + c.id);
    for (const r of RARITIES) assert.ok(casePool(c, r.id).length > 0, `${c.id}/${r.id}`);
    for (const id of c.knives) assert.equal(DEFS[id].type, 'knife');
  }
});

test('inventário: sorteio semeado é determinístico e respeita as chances', () => {
  const c = CASES[0];
  assert.deepEqual(rollCase(c, 1234), rollCase(c, 1234));
  const n = 40000, count = {};
  for (let i = 0; i < n; i++) {
    const it = rollCase(c, i * 2654435761 + 17);
    const r = DEFS[it.def].rarity;
    count[r] = (count[r] || 0) + 1;
    const [a, b] = DEFS[it.def].wear;
    assert.ok(it.wear >= a && it.wear <= b, 'desgaste na faixa');
    assert.ok(it.seed >= 0 && it.seed <= 999 && Number.isInteger(it.seed));
  }
  for (const r of RARITIES) {
    const p = (count[r.id] || 0) / n;
    // tolerância ~4 desvios-padrão
    const tol = 4 * Math.sqrt((r.odds * (1 - r.odds)) / n) + 1e-3;
    assert.ok(Math.abs(p - r.odds) < tol, `${r.id}: ${p.toFixed(4)} vs ${r.odds}`);
  }
  // pickRarity cobre as bordas
  assert.equal(pickRarity(c, 0), 'comum');
  assert.equal(pickRarity(c, 0.99999), 'especial');
});

test('inventário: roleta tem o prêmio na posição certa e easing monotônico', () => {
  const c = CASES[1];
  const it = rollCase(c, 99);
  const s = reelStrip(c, it.def, 99, 60, 50);
  assert.equal(s.length, 60);
  assert.equal(s[50], it.def);
  assert.ok(s.every((d) => DEFS[d]?.case === c.id));
  assert.equal(reelEase(0), 0);
  assert.equal(reelEase(1), 1);
  let prev = -1;
  for (let t = 0; t <= 1; t += 0.01) { const v = reelEase(t); assert.ok(v >= prev); prev = v; }
});

test('inventário: desgaste por faixa', () => {
  assert.equal(wearTier(0).id, 'NF');
  assert.equal(wearTier(0.0699).id, 'NF');
  assert.equal(wearTier(0.07).id, 'PU');
  assert.equal(wearTier(0.2).id, 'TC');
  assert.equal(wearTier(0.4).id, 'DG');
  assert.equal(wearTier(1).id, 'MD');
  assert.equal(WEAR_TIERS[0].name, 'NOVA DE FÁBRICA');
});

test('inventário: contrato de troca (10 → 1 da raridade seguinte)', () => {
  const rng = mulberry32(5);
  const comuns = [...CASES[0].skins, ...CASES[1].skins].filter((d) => DEFS[d].rarity === 'comum');
  const items = Array.from({ length: 10 }, (_, i) => ({ ...makeItem(comuns[i % comuns.length], rng), uid: i + 1 }));
  assert.equal(tradeUpError(items), null);
  assert.ok(tradeUpError(items.slice(0, 9)));
  const odds = tradeUpOdds(items);
  assert.ok(Math.abs(odds.reduce((a, o) => a + o.p, 0) - 1) < 1e-9);
  assert.ok(odds.every((o) => DEFS[o.def].rarity === 'incomum'));
  assert.ok(odds.every((o) => ['ferro', 'mare'].includes(DEFS[o.def].case)), 'resultado vem das caixas de entrada');
  const r = tradeUp(items, 77);
  assert.equal(DEFS[r.item.def].rarity, nextRarity('comum'));
  assert.deepEqual(tradeUp(items, 77), r, 'determinístico');
  // misturar raridades é recusado; facas e lendários não entram
  const mixed = items.slice(0, 9).concat([{ def: CASES[0].skins.find((d) => DEFS[d].rarity === 'raro'), wear: 0.1, uid: 99 }]);
  assert.ok(tradeUpError(mixed));
  const leg = Array.from({ length: 10 }, (_, i) => ({ def: 'ferro-aurora', wear: 0.01, uid: i }));
  assert.ok(tradeUpError(leg));
  // desgaste do resultado = média normalizada na faixa
  const flat = items.map((it) => ({ ...it, wear: 0.5 }));
  const out = tradeUp(flat, 3).item;
  const [a, b] = DEFS[out.def].wear;
  assert.ok(Math.abs(out.wear - (a + (b - a) * 0.5)) < 1e-6);
});

test('inventário: sucata e duplicatas', () => {
  const a = { def: 'ferro-cinza', wear: 0.01 }, b = { def: 'ferro-cinza', wear: 0.9 };
  assert.ok(scrapValue(a) > scrapValue(b), 'nova vale mais que muito desgastada');
  assert.ok(scrapValue({ def: 'ferro-k-fio', wear: 0.02 }) > scrapValue({ def: 'ferro-aurora', wear: 0.02 }), 'faca vale mais');
  assert.ok(scrapValue({ ...b, counter: 3 }) > scrapValue(b), 'contador vale mais');
  const items = [
    { uid: 1, def: 'ferro-cinza', wear: 0.5 },
    { uid: 2, def: 'ferro-cinza', wear: 0.1 },
    { uid: 3, def: 'ferro-cinza', wear: 0.3 },
    { uid: 4, def: 'mare-ardosia', wear: 0.3 },
  ];
  assert.deepEqual(duplicateUids(items).sort(), [1, 3]);
  // a equipada é sempre mantida
  assert.deepEqual(duplicateUids(items, new Set([1])).sort(), [2, 3]);
});

test('inventário: recompensa diária com sequência em hora local', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dayDiff('2026-02-28', '2026-03-01'), 1);
  assert.equal(dayDiff('2025-12-31', '2026-01-01'), 1);
  let d = { last: null, streak: 0 };
  let r = claimDaily(d, '2026-03-01');
  assert.equal(r.daily.streak, 1);
  assert.deepEqual(r.reward, DAILY[0]);
  assert.equal(claimDaily(r.daily, '2026-03-01').reward, null, 'uma vez por dia');
  r = claimDaily(r.daily, '2026-03-02');
  assert.equal(r.daily.streak, 2);
  // pular um dia zera a sequência
  const s = dailyStatus(r.daily, '2026-03-04');
  assert.equal(s.streak, 1);
  assert.ok(s.broken);
  // ciclo de 7 dias
  let st = { last: '2026-04-01', streak: 7 };
  assert.equal(dailyStatus(st, '2026-04-02').day, 0);
});

test('inventário: curva do passe (só trilha gratuita)', () => {
  assert.equal(BP_REWARDS.length, BP_TIERS);
  assert.ok(BP_REWARDS[BP_TIERS - 1].knife, 'faca garantida no último nível');
  assert.ok(BP_REWARDS.every((r) => r && Object.keys(r).length), 'todo nível recompensa');
  assert.deepEqual(bpLevel(0), { tier: 0, into: 0, need: bpNeed(1), done: false });
  assert.equal(bpLevel(bpNeed(1)).tier, 1);
  assert.equal(bpLevel(bpNeed(1) - 1).tier, 0);
  assert.equal(bpLevel(bpTotal()).tier, BP_TIERS);
  assert.ok(bpLevel(bpTotal() * 3).done);
  for (let t = 1; t < BP_TIERS; t++) assert.ok(bpNeed(t + 1) > bpNeed(t));
  assert.deepEqual(bpClaimable(bpNeed(1) + bpNeed(2) + bpNeed(3), [2]), [1, 3]);
});

test('inventário: créditos por partida', () => {
  const w = matchCredits({ kills: 20, headshots: 5, captures: 2, waves: 5, win: true, medals: 3, playTime: 600 });
  const l = matchCredits({ kills: 20, headshots: 5, captures: 2, waves: 5, win: false, medals: 3, playTime: 600 });
  assert.ok(w.total > l.total);
  assert.equal(w.total, w.lines.reduce((a, [, v]) => a + v, 0));
  assert.ok(matchCredits({}).total > 0, 'participação sempre paga algo');
  assert.ok(w.total >= 300 && w.total <= 700, 'economia: ~1 caixa por partida boa (' + w.total + ')');
});

test('inventário: maestria e coleção', () => {
  assert.deepEqual(masteryProgress(0).done, []);
  assert.equal(masteryProgress(MASTERY_TIERS[0].kills).done.length, 1);
  assert.deepEqual(masteryUnlocks('kr9', 24, 25), ['m-kr9-bronze']);
  assert.deepEqual(masteryUnlocks('kr9', 25, 26), []);
  const col = collection([{ def: CASES[0].skins[0] }, { def: CASES[0].skins[0] }, { def: CASES[0].knives[0] }]);
  assert.equal(col.per[0].owned, 2);
  assert.ok(col.pct > 0 && col.pct < 1);
});

test('inventário: abrir só com chave ou créditos do jogo; persistência saneada', () => {
  const s = defaults();
  assert.ok(openCost({ ...s, keys: 1 }, CASES[0], 'key'));
  assert.equal(openCost({ ...s, keys: 0 }, CASES[0], 'key'), null);
  assert.equal(openCost({ ...s, credits: 10 }, CASES[0], 'credits'), null);
  assert.deepEqual(openCost({ ...s, credits: 1000 }, CASES[0], 'credits'), { credits: CASES[0].price });
  const m = migrate({ credits: '12', items: [{ uid: 3, def: 'ferro-cinza' }, { uid: 4, def: 'nao-existe' }], equip: { skins: { kr9: 9 } } });
  assert.equal(m.credits, 12);
  assert.equal(m.items.length, 1);
  assert.equal(m.nextUid, 4);
  assert.equal(m.equip.skins.kr9, undefined, 'equipado inexistente sai');
  assert.deepEqual(migrate('lixo'), defaults());
  const demo = demoState();
  assert.ok(demo.items.length > 40);
  assert.deepEqual(demoState().items.map((i) => i.def), demo.items.map((i) => i.def), 'demo determinística');
});
