/**
 * Testes da feature enemies (lógica pura): sorteio de classes, escudo
 * (frente/raio × caixa), escolha do socorrista, arremesso, explosão em
 * cadeia dos barris e condição da execução.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { pickRole, ROLES, frontal, rayObb, pickReviveTarget, lobVelocity } from './roles.js';
import { blastDamage, chainOrder } from './props.js';
import { canExecute } from './execution.js';

const seq = (...v) => {
  let i = 0;
  return () => v[i++ % v.length];
};

test('classes: sem especiais antes da onda 3; força e limite de 2 atiradores/escudeiros', () => {
  assert.equal(pickRole(1, seq(0)), null);
  assert.equal(pickRole(2, seq(0)), null);
  assert.equal(pickRole(3, seq(0)), 'rusher');
  assert.equal(pickRole(3, seq(0.99)), null, 'maioria continua fuzileiro');
  assert.equal(pickRole(0, seq(0.5), { force: 'medic' }), 'medic');
  assert.ok(ROLES[pickRole(0, seq(0.99), { force: 'all' })], "'all' sempre sorteia uma classe");
  // com 2 atiradores vivos o sorteio pula o atirador
  const r = pickRole(5, seq(0.17), { counts: { sniper: 2 } });
  assert.notEqual(r, 'sniper');
});

test('escudo: frente por ângulo e raio × caixa orientada', () => {
  const pos = { x: 0, z: 0 };
  assert.ok(frontal(pos, 0, { x: 0, z: 5 }));
  assert.ok(!frontal(pos, 0, { x: 0, z: -5 }));
  assert.ok(frontal(pos, Math.PI / 2, { x: 5, z: 0.5 }));
  const inv = new Matrix4().makeTranslation(0, 1, 2).invert();
  const half = new Vector3(0.3, 0.5, 0.05);
  const t = rayObb(new Vector3(0, 1, 10), new Vector3(0, 0, -1), inv, half);
  assert.ok(Math.abs(t - 7.95) < 1e-6);
  assert.equal(rayObb(new Vector3(1, 1, 10), new Vector3(0, 0, -1), inv, half), -1);
  assert.equal(rayObb(new Vector3(0, 1, 10), new Vector3(0, 0, -1), inv, half, 5), -1, 'além do alcance');
});

test('socorrista: corpo mais perto válido (janela, alcance, reclamado, chefe, revividas)', () => {
  const me = { x: 0, z: 0 };
  const c = [
    { id: 1, x: 5, z: 0, deadT: 20 },
    { id: 2, x: 9, z: 0, deadT: 3 },
    { id: 3, x: 3, z: 0, deadT: 3, claimed: true },
    { id: 4, x: 2, z: 0, deadT: 3, boss: true },
    { id: 5, x: 1, z: 0, deadT: 3, revives: 2 },
    { id: 6, x: 40, z: 0, deadT: 1 },
    { id: 7, x: 7, z: 0, deadT: 2 },
  ];
  assert.equal(pickReviveTarget(me, c).id, 7);
  assert.equal(pickReviveTarget(me, [c[0], c[5]]), null);
});

test('arremesso em parábola chega ao alvo', () => {
  const a = { x: 0, y: 1.5, z: 0 }, b = { x: 12, y: 0, z: -5 };
  const v = lobVelocity(a, b);
  const t = v.t;
  const x = a.x + v.x * t, y = a.y + v.y * t - 0.5 * 9.8 * t * t, z = a.z + v.z * t;
  assert.ok(Math.abs(x - b.x) < 1e-9 && Math.abs(y - b.y) < 1e-9 && Math.abs(z - b.z) < 1e-9);
  assert.ok(v.y > 0, 'sobe antes de cair');
});

test('barris: dano cai até zero no raio; cadeia alcança vizinhos uma vez', () => {
  assert.equal(blastDamage(0, 5, 100), 100);
  assert.equal(blastDamage(5, 5, 100), 0);
  assert.ok(blastDamage(2, 5, 100) > blastDamage(3, 5, 100));
  const props = [{ x: 0, z: 0, r: 5 }, { x: 3, z: 0, r: 5 }, { x: 6, z: 0, r: 5 }, { x: 20, z: 0, r: 5 }];
  const o = chainOrder(props, 0);
  assert.deepEqual(o.map((x) => x.i), [0, 1, 2]);
  assert.ok(o[2].t > o[1].t);
});

test('execução: só por trás, perto, desatento, não chefe', () => {
  const mk = (o = {}) => ({ alive: true, boss: false, exec: null, yaw: 0, group: { position: { x: 0, y: 0, z: 0 } }, brain: { canSee: false, state: 'idle', lostFor: 0 }, ...o });
  assert.ok(canExecute(mk(), { x: 0, y: 0, z: -1.2 }) > 0, 'atrás (ele olha para +Z)');
  assert.equal(canExecute(mk(), { x: 0, y: 0, z: 1.2 }), -1, 'de frente');
  assert.equal(canExecute(mk(), { x: 0, y: 0, z: -3 }), -1, 'longe');
  assert.equal(canExecute(mk({ boss: true }), { x: 0, y: 0, z: -1 }), -1);
  assert.equal(canExecute(mk({ brain: { canSee: true, state: 'combat' } }), { x: 0, y: 0, z: -1 }), -1);
  assert.ok(canExecute(mk({ brain: { canSee: false, state: 'combat', lostFor: 4 } }), { x: 0, y: 0, z: -1 }) > 0);
});
