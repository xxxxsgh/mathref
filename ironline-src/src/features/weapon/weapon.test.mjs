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
