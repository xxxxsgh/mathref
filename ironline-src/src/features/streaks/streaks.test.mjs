/**
 * Testes da feature streaks (lógica pura): contagem/reinício das
 * killstreaks, regras das medalhas, anel da killcam, alvo da torreta e
 * padrão do morteiro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StreakTracker, normalizeLoadout, STREAKS, MedalTracker, MEDALS, RingBuffer, lerpAngle, pickTurretTarget, turnToward, strikePattern } from './logic.js';

test('streaks: conjunto normalizado (válidos, sem repetir, por custo, ≤ 4, drone XOR kamikaze)', () => {
  assert.deepEqual(normalizeLoadout(['sentry', 'uav', 'uav', 'nada', 'airstrike']), ['uav', 'airstrike', 'sentry']);
  assert.deepEqual(normalizeLoadout(['drone', 'kamikaze', 'uav']), ['uav', 'drone']);
  assert.equal(normalizeLoadout(['uav', 'airstrike', 'sentry', 'drone', 'kamikaze']).length, 4);
  const t = new StreakTracker([]);
  assert.ok(t.loadout.length > 0, 'vazio cai no padrão');
});

test('streaks: ganha no limiar exato, uma vez por vida; morte zera a contagem e mantém os prontos', () => {
  const t = new StreakTracker(['uav', 'airstrike', 'sentry']);
  assert.deepEqual(t.kill(), []);
  assert.deepEqual(t.kill(), []);
  assert.deepEqual(t.kill(), ['uav']);
  assert.ok(t.has('uav'));
  assert.equal(t.next().id, 'airstrike');
  assert.equal(t.next().left, 2);
  t.kill();
  assert.deepEqual(t.kill(), ['airstrike']);
  t.death();
  assert.equal(t.count, 0);
  assert.ok(t.has('uav') && t.has('airstrike'), 'prontos sobrevivem à morte');
  // nova vida: ganha a UAV de novo (acumula)
  t.kill(); t.kill();
  assert.deepEqual(t.kill(), ['uav']);
  assert.equal(t.ready.filter((x) => x === 'uav').length, 2);
  assert.ok(t.use('uav'));
  assert.ok(t.use('uav'));
  assert.ok(!t.use('uav'));
  assert.equal(t.best, 5);
});

test('streaks: abates de killstreak não contam (salvo opção)', () => {
  const t = new StreakTracker(['uav']);
  t.kill({ byStreak: true });
  t.kill({ byStreak: true });
  assert.equal(t.count, 0);
  const u = new StreakTracker(['uav'], { streakKillsCount: true });
  u.kill({ byStreak: true });
  assert.equal(u.count, 1);
  const s = u.slots();
  assert.equal(s[0].id, 'uav');
  assert.equal(s[0].key, '3');
  assert.ok(Math.abs(s[0].progress - 1 / STREAKS.uav.kills) < 1e-9);
});

test('medalhas: ≥ 15 tipos e regras de multi/headshot/longshot/point blank', () => {
  assert.ok(Object.keys(MEDALS).length >= 15);
  const m = new MedalTracker();
  assert.deepEqual(m.kill({ t: 0, id: 1, part: 'head', dist: 10 }), ['first_blood', 'headshot']);
  assert.deepEqual(m.kill({ t: 1, id: 2, part: 'torso', dist: 40 }), ['double', 'longshot']);
  assert.deepEqual(m.kill({ t: 2, id: 3, part: 'torso', dist: 2 }), ['triple', 'point_blank']);
  assert.ok(m.kill({ t: 3, id: 4, part: 'torso', dist: 10 }).includes('fury'));
  // janela de multi expira
  assert.deepEqual(m.kill({ t: 20, id: 5, part: 'torso', dist: 10 }), ['streak_5']);
});

test('medalhas: colateral, faca/execução, granada/barril/streak, slide, buzzkill, flanco, last stand', () => {
  const m = new MedalTracker();
  m.kill({ t: 0, id: 1, dist: 10, shot: 7 });
  assert.ok(m.kill({ t: 0, id: 2, dist: 11, shot: 7 }).includes('collateral'));
  assert.ok(m.kill({ t: 10, id: 3, dist: 1, melee: true, weapon: 'knife' }).includes('knife_kill'));
  const ex = m.kill({ t: 20, id: 4, dist: 1, melee: true, execution: true });
  assert.ok(ex.includes('execution') && !ex.includes('knife_kill'));
  assert.ok(m.kill({ t: 30, id: 5, dist: 9, explosion: true, weapon: 'frag' }).includes('grenade_kill'));
  assert.ok(m.kill({ t: 40, id: 6, dist: 9, explosion: true, barrel: true }).includes('barrel_kill'));
  const st = m.kill({ t: 50, id: 7, dist: 60, explosion: true, streak: 'airstrike' });
  assert.ok(st.includes('airstrike_kill') && !st.includes('longshot') && !st.includes('grenade_kill'));
  assert.ok(m.kill({ t: 60, id: 8, dist: 6, streak: 'sentry' }).includes('sentry_kill'));
  assert.ok(m.kill({ t: 70, id: 9, dist: 6, sliding: true }).includes('slide_kill'));
  assert.ok(m.kill({ t: 80, id: 10, dist: 6, reviving: true }).includes('buzzkill'));
  assert.ok(m.kill({ t: 90, id: 11, dist: 6, role: 'shield' }).includes('shield_breaker'));
  assert.ok(m.kill({ t: 100, id: 12, dist: 6, health: 12, maxHealth: 100 }).includes('last_stand'));
});

test('medalhas: revenge, comeback, survivor e streaks reiniciam na morte', () => {
  const m = new MedalTracker();
  m.death({ killerId: 42 });
  m.death({ killerId: 42 });
  m.death({ killerId: 42 });
  const k = m.kill({ t: 0, id: 42, dist: 10 });
  assert.ok(k.includes('revenge') && k.includes('comeback'));
  assert.ok(!m.kill({ t: 10, id: 42, dist: 10 }).includes('revenge'), 'revenge só uma vez');
  assert.deepEqual(m.damage({ health: 10, maxHealth: 100 }), []);
  assert.deepEqual(m.damage({ health: 60, maxHealth: 100 }), []);
  assert.deepEqual(m.damage({ health: 100, maxHealth: 100 }), ['survivor']);
  for (let i = 0; i < 4; i++) m.kill({ t: 100 + i * 10, id: 100 + i, dist: 10 });
  m.death({});
  for (let i = 0; i < 4; i++) assert.ok(!m.kill({ t: 200 + i * 10, id: 200 + i, dist: 10 }).includes('streak_5'));
  assert.ok(m.kill({ t: 300, id: 300, dist: 10 }).includes('streak_5'));
});

test('anel: capacidade, ordem, amostragem interpolada', () => {
  const r = new RingBuffer(4);
  for (let i = 0; i < 6; i++) r.push({ t: i, v: i * 10 });
  assert.equal(r.size, 4);
  assert.equal(r.first.t, 2);
  assert.equal(r.last.t, 5);
  assert.deepEqual(r.toArray().map((f) => f.t), [2, 3, 4, 5]);
  const s = r.sample(3.25);
  assert.equal(s.a.t, 3);
  assert.equal(s.b.t, 4);
  assert.ok(Math.abs(s.k - 0.25) < 1e-9);
  assert.equal(r.sample(-1).a.t, 2);
  assert.equal(r.sample(99).a.t, 5);
  r.clear();
  assert.equal(r.sample(1), null);
  assert.ok(Math.abs(lerpAngle(3.1, -3.1, 0.5) - Math.PI) < 0.05, 'ângulo pelo caminho curto');
});

test('torreta: alcance, arco, visibilidade, histerese e giro limitado', () => {
  const tur = { x: 0, z: 0, yaw: 0, range: 40, arc: Math.PI / 2 };
  const c = [
    { id: 1, x: 0, z: 20, alive: true, visible: true },
    { id: 2, x: 0, z: 8, alive: true, visible: false },
    { id: 3, x: 0, z: -5, alive: true, visible: true }, // atrás (fora do arco)
    { id: 4, x: 0, z: 60, alive: true, visible: true }, // longe
    { id: 5, x: 3, z: 15, alive: false, visible: true },
  ];
  assert.equal(pickTurretTarget(tur, c).id, 1);
  const c2 = [...c, { id: 6, x: 1, z: 17, alive: true, visible: true }];
  assert.equal(pickTurretTarget(tur, c2).id, 6);
  assert.equal(pickTurretTarget(tur, c2, 1).id, 1, 'mantém o atual se a vantagem é pequena');
  assert.equal(pickTurretTarget({ ...tur, arc: null }, [{ id: 3, x: 0, z: -5, alive: true, visible: true }]).id, 3);
  assert.equal(pickTurretTarget(tur, []), null);
  const a = turnToward(0, Math.PI, 1, 0.5);
  assert.ok(Math.abs(Math.abs(a) - 0.5) < 1e-9);
  assert.equal(turnToward(0, 0.1, 10, 1), 0.1);
});

test('morteiro: n impactos dentro do raio com atrasos crescentes', () => {
  let s = 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const p = strikePattern({ x: 10, z: -5 }, 8, 7, r);
  assert.equal(p.length, 8);
  for (const q of p) assert.ok(Math.hypot(q.x - 10, q.z + 5) <= 7 + 1e-9);
  for (let i = 1; i < p.length; i++) assert.ok(p[i].delay > p[i - 1].delay + 0.2);
});
