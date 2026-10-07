/**
 * Testes da lógica pura da feature `weapon` (loadout, espoleta/quique da
 * granada, dano de explosão). Importado por tools/unit.test.mjs (npm test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Collision } from '../../core/Collision.js';
import { Loadout, WEAPON_DEFS, EQUIP_DEFS } from './loadout.js';
import { makeGrenade, stepGrenade, blastDamage, throwVelocity, NADE } from './grenade-sim.js';

const DT = 1 / 60;

test('weapon/loadout: troca guarda → swap → saque e preserva o carregador', () => {
  const lo = new Loadout(WEAPON_DEFS);
  assert.equal(lo.def.id, 'kr9');
  lo.current.ammo = 11;
  assert.equal(lo.request(0), false, 'pedir a arma atual não faz nada');
  assert.equal(lo.request(1), true);
  assert.equal(lo.phase, 'holster');
  let swapAt = -1, readyAt = -1;
  for (let i = 0; i < 120; i++) {
    const ev = lo.step(DT);
    if (ev === 'swap') swapAt = i;
    if (ev === 'ready') readyAt = i;
  }
  assert.ok(swapAt > 0 && readyAt > swapAt, 'swap antes de ready');
  assert.ok(Math.abs((swapAt + 1) * DT - WEAPON_DEFS[0].holster) < 2 * DT, 'guarda dura o tempo da arma antiga');
  assert.ok(Math.abs((readyAt - swapAt) * DT - WEAPON_DEFS[1].draw) < 2 * DT, 'saque dura o tempo da nova');
  assert.equal(lo.def.id, 'p11');
  assert.equal(lo.current.ammo, WEAPON_DEFS[1].magSize);
  // volta: o fuzil manteve os 11 cartuchos
  lo.request(0);
  for (let i = 0; i < 120; i++) lo.step(DT);
  assert.equal(lo.def.id, 'kr9');
  assert.equal(lo.current.ammo, 11);
});

test('weapon/loadout: desistir no meio da guarda volta a sacar a mesma; ciclo e recarga', () => {
  const lo = new Loadout(WEAPON_DEFS);
  lo.request(1);
  lo.step(0.1);
  assert.equal(lo.request(0), true);
  assert.equal(lo.phase, 'draw');
  assert.equal(lo.index, 0);
  for (let i = 0; i < 60; i++) lo.step(DT);
  assert.equal(lo.phase, 'ready');
  // ciclo (roda do mouse) dá a volta
  assert.equal(lo.cycle(-1), true);
  assert.equal(lo.pending, 1);
  // recarga: só o que falta, limitado pela reserva
  const w = lo.weapons[1];
  w.ammo = 3;
  w.reserve = 5;
  assert.equal(lo.reloadAmount(w), 5);
  assert.equal(lo.applyReload(w), 5);
  assert.equal(w.ammo, 8);
  assert.equal(w.reserve, 0);
  assert.equal(lo.canReload(w), false);
  // equipamento
  assert.equal(lo.grenades, EQUIP_DEFS.frag.count);
  for (let i = 0; i < EQUIP_DEFS.frag.count; i++) assert.equal(lo.useEquipment('frag'), true);
  assert.equal(lo.useEquipment('frag'), false);
  lo.refill();
  assert.equal(lo.grenades, EQUIP_DEFS.frag.count);
  assert.equal(w.ammo, w.def.magSize);
});

test('weapon/loadout: setGrenades/setTacticals fixam a contagem (inteiro ≥ 0) e travam o uso em 0', () => {
  const lo = new Loadout(WEAPON_DEFS);
  assert.equal(lo.setTacticals(0), 0);
  assert.equal(lo.tacticals, 0);
  assert.equal(lo.useEquipment('flash'), false, 'tática travada não é usada');
  assert.equal(lo.grenades, EQUIP_DEFS.frag.count, 'mexer na tática não afeta a frag');
  assert.equal(lo.setTacticals(3.7), 3);
  assert.equal(lo.setTacticals(-2), 0);
  assert.equal(lo.setTacticals(2), 2);
  assert.equal(lo.useEquipment('flash'), true);
  assert.equal(lo.tacticals, 1);
  assert.equal(lo.setGrenades(1), 1);
  assert.equal(lo.useEquipment('frag'), true);
  assert.equal(lo.useEquipment('frag'), false);
  lo.refill();
  assert.equal(lo.tacticals, EQUIP_DEFS.flash.count);
});

/** Chão em y = 0 e uma parede em z = −6 num mundo de colisão real. */
function world() {
  const c = new Collision();
  c.addBox(new Vector3(-50, -1, -50), new Vector3(50, 0, 50), { material: 'concrete' });
  c.addBox(new Vector3(-50, 0, -7), new Vector3(50, 4, -6), { material: 'brick' });
  const ray = (o, d, max) => {
    const h = c.raycast(new Vector3(o.x, o.y, o.z), new Vector3(d.x, d.y, d.z), max);
    return h ? { distance: h.distance, normal: h.normal } : null;
  };
  return { c, ray };
}

test('weapon/granada: espoleta conta o tempo cozinhado e explode no passo certo', () => {
  const { ray } = world();
  const g = makeGrenade({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, 3.5 - 1.2);
  let t = 0, ev = null;
  while (!ev && t < 10) {
    ev = stepGrenade(g, DT, ray);
    if (ev === 'bounce') ev = null;
    t += DT;
  }
  assert.equal(ev, 'explode');
  assert.ok(Math.abs(t - 2.3) < 1.5 * DT, `explodiu em ${t.toFixed(3)} s`);
});

test('weapon/granada: quica no chão, perde energia, para e não atravessa parede', () => {
  const { ray } = world();
  // queda livre: quica (sobe de novo) e acaba em repouso no chão
  const g = makeGrenade({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 0 }, 99);
  let bounces = 0, maxAfter = 0, hitFloor = false;
  for (let i = 0; i < 600; i++) {
    if (stepGrenade(g, DT, ray) === 'bounce') bounces++;
    if (g.p.y < NADE.radius + 0.01) hitFloor = true;
    if (hitFloor && bounces >= 1) maxAfter = Math.max(maxAfter, g.p.y);
    assert.ok(g.p.y >= NADE.radius - 1e-3, 'não afunda no chão');
  }
  assert.ok(bounces >= 1, 'quicou');
  assert.ok(maxAfter < 3 * NADE.restitution * NADE.restitution + 0.2, 'quique mais baixo que a queda');
  assert.equal(g.rest, true, 'parou');
  // arremesso rápido contra a parede: fica do lado de cá
  const h = makeGrenade({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 2, z: -25 }, 99);
  for (let i = 0; i < 400; i++) stepGrenade(h, DT, ray);
  assert.ok(h.p.z > -6 + NADE.radius * 0.5, `ficou antes da parede (z=${h.p.z.toFixed(3)})`);
  assert.ok(h.bounces >= 1);
});

test('weapon/granada: dano cai com a distância e arremesso sobe em arco', () => {
  assert.equal(blastDamage(0, 7, 160), 160);
  assert.equal(blastDamage(7, 7, 160), 0);
  assert.equal(blastDamage(9, 7, 160), 0);
  const a = blastDamage(1, 7, 160), b = blastDamage(4, 7, 160);
  assert.ok(a > b && b > 0);
  const v = throwVelocity({ x: 0, y: 0, z: -1 }, 15, { x: 1, y: 0, z: 0 });
  assert.ok(v.y > 2, 'sobe');
  assert.ok(v.z < -14 && v.x > 0.5, 'segue a mira e herda a velocidade do jogador');
  assert.ok(Math.abs(Math.hypot(v.x - 0.8, v.y, v.z) - 15) < 1e-6);
});

// ─── v3: catálogo, faca na mão, chumbos, fôlego, contador, padrões, chaveiro ───
import { ALL_WEAPONS, KNIVES, knifeId, weaponDef } from './loadout.js';
import { pelletPattern, scopeSway, BreathHold, falloff } from './ballistics.js';
import { formatKills, KillCounters, CharmSim } from './cosmetic-logic.js';
import { PATTERNS, renderPattern, skinParams, wearProfile, parseHex } from './patterns.js';

test('weapon/loadout: catálogo de 7 armas, setSlot preserva munição e troca slots', () => {
  assert.equal(ALL_WEAPONS.length, 7);
  assert.deepEqual(ALL_WEAPONS.map((d) => d.kind), ['rifle', 'pistol', 'smg', 'shotgun', 'sniper', 'lmg', 'dmr']);
  assert.equal(new Set(ALL_WEAPONS.map((d) => d.id)).size, 7);
  const lo = new Loadout(WEAPON_DEFS);
  lo.current.ammo = 9;
  assert.equal(lo.setSlot(0, weaponDef('mx9')), true);
  assert.equal(lo.weapons[0].def.id, 'mx9');
  assert.equal(lo.weapons[0].ammo, 32);
  lo.weapons[0].ammo = 5;
  // volta o fuzil: recupera os 9 do cache
  lo.setSlot(0, weaponDef('kr9'));
  assert.equal(lo.weapons[0].ammo, 9);
  // a pistola como primária: os slots trocam de lugar
  lo.setSlot(0, weaponDef('p11'));
  assert.equal(lo.weapons[0].def.id, 'p11');
  assert.equal(lo.weapons[1].def.id, 'kr9');
  assert.equal(lo.weapons[1].ammo, 9);
  assert.equal(lo.setSlot(0, weaponDef('p11')), false);
});

test('weapon/loadout: faca na mão entra na troca mas não no ciclo da roda', () => {
  const lo = new Loadout(WEAPON_DEFS);
  assert.equal(lo.request(2), true);
  for (let i = 0; i < 120; i++) lo.step(DT);
  assert.equal(lo.knifeOut, true);
  assert.equal(lo.def.kind, 'knife');
  assert.equal(lo.canReload(), false);
  lo.cycle(1);
  assert.equal(lo.pending, 0, 'da faca, a roda volta para as armas');
  assert.equal(knifeId('garra'), 'karambit');
  assert.equal(knifeId('cleaver'), 'cleaver');
  assert.equal(knifeId('xyz'), null);
  assert.equal(KNIVES.length, 7);
  // recarga cartucho a cartucho (escopeta): max limita
  const sg = { def: weaponDef('br12'), ammo: 2, reserve: 10 };
  assert.equal(lo.applyReload(sg, 1), 1);
  assert.equal(sg.ammo, 3);
});

test('weapon/ballistics: chumbos dentro do cone, padrão centrado e determinístico', () => {
  const r = mulberryTest(7);
  const p = pelletPattern(9, 0.07, r);
  assert.equal(p.length, 9);
  let mx = 0, my = 0;
  for (const [x, y] of p) {
    assert.ok(Math.hypot(x, y) <= 0.07 + 1e-9, 'fora do cone');
    mx += x / 9;
    my += y / 9;
  }
  assert.ok(Math.hypot(mx, my) < 0.03, 'centro de massa perto do eixo');
  assert.deepEqual(pelletPattern(9, 0.07, mulberryTest(7)), p);
  assert.notDeepEqual(pelletPattern(9, 0.07, mulberryTest(8)), p);
  assert.equal(pelletPattern(1, 0.07, r).length, 1);
  assert.equal(falloff(5, { falloff: [6, 24, 0.2] }), 1);
  assert.ok(Math.abs(falloff(24, { falloff: [6, 24, 0.2] }) - 0.2) < 1e-9);
  assert.equal(falloff(50, { falloff: [40, 0.8] }), 0.8);
});

test('weapon/ballistics: balanço limitado e fôlego segura → cansa → recupera', () => {
  for (let t = 0; t < 30; t += 0.37) {
    const s = scopeSway(t, 0.01);
    assert.ok(Math.abs(s.x) <= 0.0092 && Math.abs(s.y) <= 0.0094);
  }
  const b = new BreathHold({ hold: 4, tired: 2, recover: 0.5 });
  let m = 1;
  for (let i = 0; i < 60; i++) m = b.update(DT, true);
  assert.equal(b.holding, true);
  assert.ok(m < 0.3, 'segurando: balanço baixo');
  for (let i = 0; i < 4 * 60; i++) m = b.update(DT, true);
  assert.equal(b.holding, false, 'fôlego acabou');
  assert.ok(b.tired > 0 && m > 1.3, 'cansado: balanço maior');
  assert.ok(b.events.includes('gasp'));
  // segurar de novo cansado não funciona
  b.update(DT, true);
  assert.equal(b.holding, false);
  for (let i = 0; i < 8 * 60; i++) m = b.update(DT, false);
  assert.ok(b.stamina > 0.99 && Math.abs(m - 1) < 0.02, 'recuperou');
});

test('weapon/cosmetics: contador de abates e chaveiro assenta na gravidade', () => {
  assert.equal(formatKills(42), '000042');
  assert.equal(formatKills(-3), '000000');
  assert.equal(formatKills(12345678), '999999');
  const k = new KillCounters();
  assert.equal(k.add('kr9'), null, 'sem contador não conta');
  k.set('kr9', 10);
  assert.equal(k.add('kr9'), 11);
  assert.equal(k.get('kr9'), 11);
  k.set('kr9', null);
  assert.equal(k.has('kr9'), false);
  const c = new CharmSim({ L1: 0.012, L2: 0.016 });
  c.reset([1, 0, 0]); // começa de lado
  for (let i = 0; i < 600; i++) c.step(DT, [0, -9.8, 0]);
  const tip = c.p[2];
  assert.ok(tip[1] < -0.026 && Math.abs(tip[0]) < 0.003, 'pendurado para baixo');
  // aceleração da arma para +X → chaveiro fica para trás (−X)
  for (let i = 0; i < 10; i++) c.step(DT, [0, -9.8, 0], [30, 0, 0]);
  assert.ok(c.p[2][0] < -0.004);
});

test('weapon/patterns: 12 padrões, bytes determinísticos por seed, seeds diferentes variam', () => {
  assert.equal(PATTERNS.length, 12);
  for (const id of ['solid', 'camo', 'digital', 'tiger', 'fade', 'damascus', 'marble', 'hex', 'carbon', 'ember', 'oxide', 'splatter']) assert.ok(PATTERNS.includes(id));
  const pal = ['#c8862e', '#1a1a1a', '#e9c27a'];
  for (const id of PATTERNS) {
    const a = renderPattern(id, pal, 7, 32);
    const b = renderPattern(id, pal, 7, 32);
    assert.equal(a.data.length, 32 * 32 * 4);
    assert.deepEqual(a.data, b.data, id + ' determinístico');
    if (id !== 'fade') assert.notDeepEqual(renderPattern(id, pal, 8, 32).data, a.data, id + ' varia com a seed');
  }
  assert.equal(renderPattern('fade', pal, 1, 16).mode, 1);
  assert.equal(renderPattern('ember', ['#1a0e08', '#ff6a1f', '#ffcf5a'], 1, 32).emissive, true);
  // tileável: bordas opostas parecidas (camo)
  const t = renderPattern('camo', pal, 3, 64).data;
  let diff = 0;
  for (let y = 0; y < 64; y++) diff += Math.abs(t[(y * 64) * 4] - t[(y * 64 + 63) * 4]);
  assert.ok(diff / 64 < 40);
  const p1 = skinParams({ id: 'x', pattern: 'tiger', seed: 5 }), p2 = skinParams({ id: 'x', pattern: 'tiger', seed: 5 }), p3 = skinParams({ id: 'x', pattern: 'tiger', seed: 6 });
  assert.deepEqual(p1, p2);
  assert.notEqual(p1.rotation, p3.rotation);
  const w0 = wearProfile(0), w1 = wearProfile(0.5), w2 = wearProfile(1);
  for (const k of ['edge', 'blotch', 'scratch', 'grime']) assert.ok(w0[k] <= w1[k] && w1[k] <= w2[k], 'desgaste monótono: ' + k);
  assert.deepEqual(parseHex('#ff8000').map((v) => Math.round(v * 255)), [255, 128, 0]);
});

function mulberryTest(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { pickGrenade, lobVelocity } from './grenade-sim.js';

test('weapon/granada: devolução escolhe a frag viva mais próxima, mantém a espoleta e acerta o alvo', () => {
  const at = (x, z, fuse, t, kind = 'frag') => makeGrenade(new Vector3(x, 0.05, z), new Vector3(), fuse, { kind, t });
  const list = [at(2.0, 0, 2.5, 1.0), at(0.8, 0, 2.5, 1.0, 'flash'), at(1.2, 0, 0.2, 3.3), at(1.5, 0, 1.5, 2.0), at(9, 0, 3.5, 0)];
  // flash ignorada, a de 0,2 s restantes ignorada, a de 9 m fora do alcance → índice 3 (1,5 m)
  assert.equal(pickGrenade(list, { x: 0, y: 0, z: 0 }), 3);
  list[3].thrownBack = true;
  assert.equal(pickGrenade(list, { x: 0, y: 0, z: 0 }), 0, 'já devolvida não volta de novo');
  assert.equal(pickGrenade([], { x: 0, y: 0, z: 0 }), -1);
  // arco: sem arrasto, chega ao alvo no tempo de voo
  const from = { x: 0, y: 1.3, z: 0 }, to = { x: 10, y: 0.2, z: -6 };
  const v = lobVelocity(from, to, 9.81);
  const T = v.T;
  assert.ok(T >= 0.45 && T <= 1.3);
  assert.ok(Math.abs(from.x + v.x * T - to.x) < 1e-9 && Math.abs(from.z + v.z * T - to.z) < 1e-9);
  assert.ok(Math.abs(from.y + v.y * T - 0.5 * 9.81 * T * T - to.y) < 1e-9);
  // espoleta restante preservada pela simulação (só t avança)
  const g = list[0];
  const left = g.fuse;
  g.v = { x: v.x, y: v.y, z: v.z };
  stepGrenade(g, DT, () => null);
  assert.ok(Math.abs(g.fuse - (left - DT)) < 1e-9, 'espoleta segue de onde estava');
});
