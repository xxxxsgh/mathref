/**
 * Testes da lógica pura da feature hud (progressão e modos). Importado por
 * `tools/unit.test.mjs` (node --test, sem DOM).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, xpForLevel, needFor, MAX_LEVEL, unlockTable, isUnlocked, newUnlocks, nextUnlock, sanitizeLoadout, matchXP, CAMOS, XP } from './progression.js';
import { MODES, buildMode, zoneState, zoneStep, zoneResult, pickZone, hardpointWave, inZone, isBossWave, spiral } from './modes.js';

test('progressão: curva de XP coerente com levelOf', () => {
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 2500 });
  assert.equal(levelOf(2499).level, 1);
  assert.equal(levelOf(2500).level, 2);
  assert.equal(levelOf(2500).need, needFor(2));
  for (const lv of [2, 5, 10, 30, MAX_LEVEL]) {
    const xp = xpForLevel(lv);
    assert.equal(levelOf(xp).level, lv, `nível ${lv}`);
    assert.equal(levelOf(xp).into, 0);
    assert.equal(levelOf(xp - 1).level, lv - 1);
  }
  // teto
  assert.equal(levelOf(1e9).level, MAX_LEVEL);
  // XP inválido não quebra
  assert.equal(levelOf(-50).level, 1);
  assert.equal(levelOf(NaN).level, 1);
  // cada nível pede mais que o anterior
  for (let l = 2; l < 20; l++) assert.ok(needFor(l + 1) > needFor(l));
});

test('progressão: desbloqueios por nível', () => {
  const weapons = [{ id: 'kr9', name: 'KR-9' }, { id: 'p11', name: 'P-11' }, { id: 'x', name: 'X-1' }];
  const T = unlockTable(weapons);
  // fuzil e pistola já vêm no loadout
  assert.ok(T.filter((u) => u.kind === 'weapon' && u.level === 1).length === 2);
  assert.ok(T.find((u) => u.key === 'weapon:x').level > 1);
  // ordenada por nível
  for (let i = 1; i < T.length; i++) assert.ok(T[i].level >= T[i - 1].level);
  // atordoante exige nível
  const flash = T.find((u) => u.key === 'equipment:flash');
  assert.ok(!isUnlocked(flash, flash.level - 1) && isUnlocked(flash, flash.level));
  // subir de nível libera exatamente o intervalo (antes, depois]
  const got = newUnlocks(T, 1, 4).map((u) => u.key);
  assert.ok(got.includes('equipment:flash'));
  assert.ok(got.includes('camo:woodland') && got.includes('camo:digital'));
  assert.ok(!got.includes('camo:tiger'));
  assert.equal(newUnlocks(T, 4, 4).length, 0);
  assert.equal(nextUnlock(T, 1).level, 2);
  // camuflagens: a de fábrica é livre, as outras sobem
  assert.equal(CAMOS[0].level, 1);
  assert.ok(CAMOS.every((c, i) => !i || c.level > CAMOS[i - 1].level));
});

test('progressão: loadout inválido volta ao padrão e XP de fim de partida', () => {
  const s = sanitizeLoadout({ optic: 2, muzzle: 2, grip: 2, tactical: 1 }, 'gilded', 1);
  assert.equal(s.loadout.optic, 0);
  assert.equal(s.loadout.muzzle, 0);
  assert.equal(s.loadout.tactical, 0);
  assert.equal(s.camo, 'none');
  const ok = sanitizeLoadout({ optic: 1, grip: 1 }, 'woodland', 5);
  assert.equal(ok.loadout.optic, 1);
  assert.equal(ok.camo, 'woodland');
  const w = matchXP({ kills: 10, headshots: 3, medalXP: 200, objectiveXP: 500, win: true });
  assert.equal(w.total, 10 * XP.kill + 3 * XP.head + 200 + 500 + XP.win);
  assert.equal(matchXP({ earned: 1000, win: false }).total, 1000 + XP.loss);
});

test('modos: overrides de URL e ondas', () => {
  const p = new URLSearchParams('waves=2,3&mt=120&wi=1&hold=30&lives=2');
  const h = buildMode('hardpoint', p, 'FOUNDRY 9');
  assert.deepEqual(h.waves, [2, 3]);
  assert.equal(h.time, 120);
  assert.equal(h.intermission, 1);
  assert.equal(h.holdGoal, 30);
  assert.equal(h.map, 'FOUNDRY 9');
  assert.equal(h.target, 5);
  // a base não é alterada
  assert.equal(MODES.hardpoint.holdGoal, 90);
  // ondas além da lista crescem devagar
  assert.equal(hardpointWave(h, 1), 2);
  assert.equal(hardpointWave(h, 2), 3);
  assert.equal(hardpointWave(h, 4), 4);
  assert.ok(hardpointWave(h, 10) > hardpointWave(h, 3));
  const s = buildMode('survival', p);
  assert.equal(s.lives, 2);
  assert.ok(isBossWave(s, 2) && !isBossWave(s, 1));
  assert.equal(buildMode('nada', null).id, 'waves');
});

test('hardpoint: captura, contestação, perda e posse', () => {
  const cfg = { ...MODES.hardpoint, captureTime: 5, enemyCaptureTime: 10, holdGoal: 20 };
  const s = zoneState();
  const run = (sec, inp) => {
    let ev = { captured: false, lost: false, taken: false };
    for (let i = 0; i < Math.round(sec * 60); i++) {
      const e = zoneStep(s, { ...inp, dt: 1 / 60 }, cfg);
      ev = { captured: ev.captured || e.captured, lost: ev.lost || e.lost, taken: ev.taken || e.taken };
    }
    return ev;
  };
  // jogador sozinho: ~5 s para tomar a zona neutra
  run(4.9, { inside: true });
  assert.equal(s.owner, null);
  assert.equal(s.status, 'capturing');
  const e1 = run(0.2, { inside: true });
  assert.ok(e1.captured);
  assert.equal(s.owner, 'us');
  // contestada: cap e posse congelam
  const h0 = s.hold, c0 = s.cap;
  run(3, { inside: true, foes: 2 });
  assert.equal(s.status, 'contested');
  assert.equal(s.hold, h0);
  assert.equal(s.cap, c0);
  // segurando: a posse pontua mesmo fora do anel se ninguém contesta
  run(4, {});
  assert.ok(s.hold > h0 + 3.9);
  // um hostil sozinho: perde a posse ao cruzar 0 (10 s), toma em mais 10 s
  const e2 = run(10.1, { foes: 1 });
  assert.ok(e2.lost);
  assert.equal(s.owner, null);
  const e3 = run(10.1, { foes: 1 });
  assert.ok(e3.taken);
  assert.equal(s.owner, 'them');
  assert.equal(zoneResult(s, cfg), 'loss');
  // mais hostis tomam mais rápido
  const a = zoneState(), b = zoneState();
  zoneStep(a, { foes: 1, dt: 1 }, cfg);
  zoneStep(b, { foes: 4, dt: 1 }, cfg);
  assert.ok(b.cap < a.cap);
  // vitória pela posse acumulada
  const w = zoneState();
  w.owner = 'us';
  w.cap = 1;
  for (let i = 0; i < 20 * 60 + 2; i++) zoneStep(w, { dt: 1 / 60 }, cfg);
  assert.equal(zoneResult(w, cfg), 'win');
  // captura parcial abandonada volta para 0
  const p = zoneState();
  zoneStep(p, { inside: true, dt: 2 }, cfg);
  assert.ok(p.cap > 0.3);
  for (let i = 0; i < 600; i++) zoneStep(p, { dt: 1 / 60 }, cfg);
  assert.ok(p.cap < 0.3 && p.cap >= 0);
});

test('hardpoint: zona entre o jogador e os hostis, dentro dos limites', () => {
  const spawn = { position: [0, 0, 20] };
  const foes = [{ position: [0, 0, -40] }, { position: [4, 0, -60] }];
  const z = pickZone(spawn, foes, { min: { x: -20, z: -100 }, max: { x: 20, z: 50 } }, 0.5);
  assert.ok(z.z < 20 && z.z > -50);
  assert.ok(Math.abs(z.x - 1) < 1e-9);
  // preso à margem do limite
  const c = pickZone({ position: [30, 0, 0] }, [], { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } });
  assert.equal(c.x, 4);
  assert.ok(inZone({ x: 0, y: 0, z: 0, radius: 4 }, 3, 0, 2));
  assert.ok(!inZone({ x: 0, y: 0, z: 0, radius: 4 }, 3, 0, 3));
  assert.ok(!inZone({ x: 0, y: 0, z: 0, radius: 4 }, 0, 4.5, 0)); // passarela acima não conta
  assert.equal(spiral(0, 0, 1, 2).length, 1 + 8 + 16);
});
