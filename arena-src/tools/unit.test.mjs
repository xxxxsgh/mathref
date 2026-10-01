/**
 * Testes unitários dos módulos puros (sem Three/DOM):  npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wearTier, WEAR_TIERS } from '../src/skins/Wear.js';
import { patternParams, wearNoiseOffset } from '../src/skins/PatternSystem.js';
import { computeDamage, isBackstab } from '../src/combat/DamageSystem.js';
import { WEAPONS } from '../src/weapons/WeaponData.js';
import { RoundManager, RULES } from '../src/match/RoundManager.js';
import { InventorySystem } from '../src/inventory/InventorySystem.js';
import { defaultSave } from '../src/core/Save.js';
import { SKINS, skinById } from '../src/skins/SkinCatalog.js';
import { RARITIES } from '../src/skins/Rarity.js';
import { prepareClip, sampleClip, zeroPose, Animator } from '../src/weapons/Animator.js';
import { KNIFE_INSPECTS, pickKnifeInspect } from '../src/weapons/Animations.js';
import { mulberry32 } from '../src/core/Rng.js';

test('faixas de desgaste seguem a tabela pedida', () => {
  assert.equal(wearTier(0).name, 'Factory New');
  assert.equal(wearTier(0.0699).name, 'Factory New');
  assert.equal(wearTier(0.07).name, 'Minimal Wear');
  assert.equal(wearTier(0.149).name, 'Minimal Wear');
  assert.equal(wearTier(0.15).name, 'Field-Tested');
  assert.equal(wearTier(0.38).name, 'Well-Worn');
  assert.equal(wearTier(0.45).name, 'Battle-Scarred');
  assert.equal(wearTier(1).name, 'Battle-Scarred');
  assert.equal(WEAR_TIERS.length, 5);
});

test('pattern seed é determinístico e muda a aparência', () => {
  const a = patternParams('knife_crimson_circuit', 'circuit', 321);
  const b = patternParams('knife_crimson_circuit', 'circuit', 321);
  const c = patternParams('knife_crimson_circuit', 'circuit', 322);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.special, '321 é seed especial do padrão circuit');
  assert.ok(patternParams('x', 'solid', 5000).rotation === patternParams('x', 'solid', 1000).rotation, 'seed limitado a 0..1000');
});

test('seed de desgaste diferente → ruído diferente', () => {
  assert.notDeepEqual(wearNoiseOffset(1), wearNoiseOffset(2));
  assert.deepEqual(wearNoiseOffset(7), wearNoiseOffset(7));
});

test('dano: headshot, colete, capacete, pernas e queda por distância', () => {
  const r = WEAPONS.rifle;
  const naked = { armor: 0, helmet: false };
  const armored = { armor: 100, helmet: true };
  assert.equal(computeDamage(r, 0, 'chest', naked).health, 34);
  assert.equal(computeDamage(r, 0, 'head', naked).health, 136);
  assert.ok(computeDamage(r, 0, 'chest', armored).health < 34);
  assert.ok(computeDamage(r, 0, 'chest', armored).armor > 0);
  assert.equal(computeDamage(r, 0, 'legs', armored).armor, 0, 'colete não cobre pernas');
  assert.equal(computeDamage(r, 0, 'head', { armor: 100, helmet: false }).health, 136, 'sem capacete, cabeça leva tudo');
  assert.ok(computeDamage(r, 40, 'chest', naked).health < computeDamage(r, 5, 'chest', naked).health, 'queda com a distância');
  // DMR com capacete ainda mata com headshot
  assert.ok(computeDamage(WEAPONS.dmr, 20, 'head', armored).health >= 100);
});

test('skin/float/raridade não entram no dano', () => {
  const t = { armor: 0, helmet: false };
  const plain = computeDamage(WEAPONS.rifle, 10, 'chest', t).health;
  // WeaponData não referencia nada de skin
  for (const w of Object.values(WEAPONS)) {
    for (const k of Object.keys(w)) assert.ok(!/skin|float|rarity|seed/i.test(k), `campo suspeito ${k}`);
  }
  assert.equal(plain, computeDamage(WEAPONS.rifle, 10, 'chest', t).health);
});

test('backstab: atacante atrás do alvo', () => {
  assert.equal(isBackstab(0, 0), true);
  assert.equal(isBackstab(Math.PI, 0), false);
});

function actor(team, x, z, alive = true, health = 100) {
  return { team, alive, health, body: { pos: { x, z } } };
}

test('round: compra → valendo → eliminação → placar', () => {
  const R = new RoundManager({ x: 0, z: 0, radius: 3 });
  R.startRound();
  assert.equal(R.phase, 'buy');
  R.update(RULES.buyTime + 0.01, [actor(0, -30, 0), actor(1, 30, 0)]);
  assert.equal(R.phase, 'live');
  R.update(0.1, [actor(0, -30, 0), actor(1, 30, 0, false)]);
  assert.equal(R.phase, 'end');
  assert.deepEqual(R.score, [1, 0]);
  assert.equal(R.lastResult?.reason, 'Eliminação');
});

test('round: captura do Uplink, contestação e reversão', () => {
  const R = new RoundManager({ x: 0, z: 0, radius: 3 }, { captureTime: 4 });
  R.startRound();
  R.update(RULES.buyTime + 0.01, []);
  const inside0 = actor(0, 0, 0);
  const inside1 = actor(1, 1, 0);
  const out1 = actor(1, 20, 0);
  for (let i = 0; i < 20; i++) R.update(0.1, [inside0, out1]);
  assert.ok(R.capture.progress > 0.4 && R.capture.owner === 0);
  const p = R.capture.progress;
  R.update(0.5, [inside0, inside1]);
  assert.equal(R.capture.contested, true);
  assert.equal(R.capture.progress, p, 'contestado congela');
  for (let i = 0; i < 40 && R.phase === 'live'; i++) R.update(0.1, [inside0, out1]);
  assert.equal(R.phase, 'end');
  assert.equal(R.lastResult?.reason, 'Uplink capturado');
});

test('partida: primeiro a 7 vence (melhor de 13)', () => {
  const R = new RoundManager({ x: 0, z: 0, radius: 3 }, { endTime: 0.01 });
  R.startRound();
  let guard = 0;
  while (R.phase !== 'over' && guard++ < 1000) {
    if (R.phase === 'buy') R.update(RULES.buyTime + 0.01, []);
    else if (R.phase === 'live') R.update(0.1, [actor(0, -30, 0), actor(1, 30, 0, false)]);
    else R.update(0.02, []);
  }
  assert.equal(R.phase, 'over');
  assert.deepEqual(R.score, [7, 0]);
  assert.ok(R.events.some((e) => e.type === 'matchEnd' && e.winner === 0));
});

test('economia: vitória paga mais; derrotas seguidas aumentam o bônus', () => {
  const R = new RoundManager({ x: 0, z: 0, radius: 3 });
  R.lossStreak = [0, 1];
  const l1 = R.roundIncome(1, 0, false);
  R.lossStreak = [0, 3];
  const l3 = R.roundIncome(1, 0, false);
  assert.ok(R.roundIncome(0, 0, false) > l1);
  assert.ok(l3 > l1);
  assert.ok(R.roundIncome(0, 0, true) > R.roundIncome(0, 0, false), 'bônus de captura');
});

function fakeSave() {
  return { data: defaultSave(), markDirty() {} };
}

test('inventário: IDs únicos, equipar 1 por tipo, vender, mercado sem surpresa', () => {
  const inv = new InventorySystem(/** @type {any} */ (fakeSave()));
  const ids = inv.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^ITEM-\d{7}$/);
  const it = inv.add(inv.createItem('rifle_cyberstorm'));
  inv.equip(it.id);
  assert.equal(inv.items.filter((i) => i.weaponType === 'rifle' && i.equipped).length, 1);
  assert.equal(inv.equippedFor('rifle')?.id, it.id);
  const [fmin, fmax] = skinById('rifle_cyberstorm').floatRange;
  assert.ok(it.floatValue >= fmin && it.floatValue <= fmax);
  assert.ok(it.patternSeed >= 0 && it.patternSeed <= 1000);
  const shards = inv.shards;
  const v = inv.sell(it.id);
  assert.equal(inv.shards, shards + v);
  assert.equal(inv.get(it.id), null);
  // mercado: o que se vê é o que se compra
  inv.save.data.progression.shards = 1e6;
  const l = inv.market(true)[0];
  const bought = inv.buyListing(l.listingId);
  assert.ok(bought);
  assert.equal(bought.floatValue, l.floatValue);
  assert.equal(bought.patternSeed, l.patternSeed);
});

test('duas cópias da mesma skin/float/seed têm seed de desgaste diferente', () => {
  const inv = new InventorySystem(/** @type {any} */ (fakeSave()));
  const a = inv.createItem('knife_neon_rupture', { floatValue: 0.2, patternSeed: 10 });
  const b = inv.createItem('knife_neon_rupture', { floatValue: 0.2, patternSeed: 10 });
  assert.notEqual(a.wearSeed, b.wearSeed);
});

test('catálogo: nomes pedidos existem e raridades são válidas', () => {
  const names = SKINS.map((s) => s.name);
  for (const n of ['Crimson Circuit', 'Obsidian Pulse', 'Neon Rupture', 'Arctic Signal', 'Rust Protocol', 'Solar Grid', 'Cyberstorm', 'Urban Static', 'Void Runner']) {
    assert.ok(names.includes(n), n);
  }
  const rar = new Set(RARITIES.map((r) => r.id));
  for (const s of SKINS) assert.ok(rar.has(s.rarity), s.id);
  assert.equal(RARITIES.length, 6);
});

test('animador: interpolação com easing e crossfade sem salto', () => {
  const clip = prepareClip({ name: 't', keys: [{ t: 1, rp: [1, 0, 0], e: 'linear' }] });
  const out = zeroPose();
  sampleClip(clip, 0.5, out);
  assert.ok(Math.abs(out.rp[0] - 0.5) < 1e-9);
  const a = new Animator();
  a.play(clip, { blend: 0 });
  a.update(0.5);
  const before = a.pose.rp[0];
  const other = prepareClip({ name: 'o', keys: [{ t: 1, rp: [-1, 0, 0] }] });
  a.play(other, { blend: 0.2 });
  a.update(0.001);
  assert.ok(Math.abs(a.pose.rp[0] - before) < 0.05, 'crossfade parte da pose atual');
});

test('inspeção da faca: termina na pose de descanso e a rara é rara', () => {
  for (const v of KNIFE_INSPECTS) {
    const end = v.clip.keys[v.clip.keys.length - 1];
    for (const c of ['rp', 'ip']) for (const x of end[c]) assert.ok(Math.abs(x) < 1e-9, `${v.id} ${c}`);
    for (const c of ['rr', 'ir']) {
      for (const x of end[c]) {
        const r = Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
        assert.ok(r < 1e-6, `${v.id} ${c} termina em múltiplo de 2π (${x})`);
      }
    }
  }
  const rng = mulberry32(42);
  let rare = 0;
  let last = '';
  for (let i = 0; i < 5000; i++) {
    const v = pickKnifeInspect(rng, last);
    if (v.rare) rare++;
    last = v.id;
  }
  const pct = rare / 5000;
  assert.ok(pct > 0.02 && pct < 0.08, `rara em ${(pct * 100).toFixed(1)}%`);
});
