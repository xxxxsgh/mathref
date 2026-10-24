// Testes das regras físicas do adendo (seções A–H). `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { BallState, GEO, makeBall, makeBallEnv, solveLob, stepBall } from '../src/sim/ball.js';
import { FixedStep } from '../src/loop.js';
import { makePlayer, movePlayer } from '../src/sim/players.js';
import { Match } from '../src/sim/match.js';
import { TEAMS } from '../src/sim/teams.js';
import { usesWeakFoot } from '../src/sim/actions.js';

const DT = CONFIG.sim.dt;
const env = makeBallEnv({ rng: () => 0.5 });
const calm = makeBallEnv({ rng: () => 0.5 });

function run(b, seconds, e = env, events = []) {
  for (let t = 0; t < seconds; t += DT) stepBall(b, DT, e, events);
  return events;
}

test('A. medidas em escala real', () => {
  assert.equal(CONFIG.court.length, 40);
  assert.equal(CONFIG.court.width, 20);
  assert.equal(GEO.gw * 2, 3);
  assert.equal(GEO.gh, 2);
  assert.equal(CONFIG.ball.radius, 0.1);
  assert.equal(CONFIG.player.radius, 0.35);
});

test('B. passo fixo: no máximo 5 passos por quadro e alpha em [0,1)', () => {
  let n = 0;
  const loop = new FixedStep(1 / 120, 5, () => n++);
  loop.frame(0);
  const r = loop.frame(0.2); // quadro de 200 ms
  assert.equal(r.steps, 5);
  assert.ok(r.alpha >= 0 && r.alpha < 1);
  n = 0;
  loop.frame(0.2 + 1 / 30); // 30 fps → 4 passos
  assert.equal(n, 4);
});

test('C4. bola soltada de 2 m quica ~0,5 m', () => {
  const b = makeBall();
  b.pos.y = 2;
  b.state = BallState.AEREA;
  let apex = 0, bounced = false, prevVy = 0;
  for (let t = 0; t < 3; t += DT) {
    const ev = [];
    stepBall(b, DT, calm, ev);
    if (ev.some((e) => e.type === 'bounce')) bounced = true;
    if (bounced && prevVy > 0 && b.vel.y <= 0) {
      apex = b.pos.y;
      break;
    }
    prevVy = b.vel.y;
  }
  assert.ok(apex > 0.44 && apex < 0.56, `quique: ${apex.toFixed(3)} m`);
});

test('C4. sem quiques infinitos: vira RASTEIRA', () => {
  const b = makeBall();
  b.pos.y = 1;
  b.state = BallState.AEREA;
  run(b, 3);
  assert.equal(b.state, BallState.RASTEIRA);
  assert.equal(b.vel.y, 0);
});

test('C4. quique perde ~15% da velocidade horizontal', () => {
  const b = makeBall();
  b.pos.y = 0.5;
  b.vel.x = 4;
  b.state = BallState.AEREA;
  const ev = [];
  let before = 0;
  for (let t = 0; t < 2; t += DT) {
    const vx = b.vel.x;
    stepBall(b, DT, calm, ev);
    if (ev.length) {
      before = vx;
      break;
    }
  }
  const ratio = b.vel.x / before;
  assert.ok(ratio > 0.83 && ratio < 0.87, `razão ${ratio}`);
});

test('C2. rasteira desacelera ~1,8 m/s² na madeira e para', () => {
  const b = makeBall();
  b.vel.x = 4;
  run(b, 5);
  assert.equal(b.vel.x, 0);
  const d = b.pos.x;
  const ideal = (4 * 4) / (2 * 1.8);
  assert.ok(d < ideal && d > ideal * 0.88, `parou em ${d.toFixed(2)} m (sem arrasto: ${ideal.toFixed(2)})`);
});

test('C2. poça segura muito mais a bola', () => {
  const b = makeBall();
  b.vel.x = 4;
  run(b, 5, makeBallEnv({ floor: 'poca' }));
  assert.ok(b.pos.x < 1.5, `${b.pos.x}`);
});

test('C3. efeito curva no máximo ~1 m em 15 m (forte ou fraco)', () => {
  for (const speed of [16, 22, 30]) {
    const b = makeBall();
    b.pos.y = 0.6;
    b.vel = { x: speed, y: 2.2, z: 0 };
    b.spin = 1;
    b.state = BallState.AEREA;
    while (b.pos.x < 15) stepBall(b, DT, calm, null);
    assert.ok(b.pos.z > 0.5 && b.pos.z <= 1.05, `v=${speed}: curva ${b.pos.z.toFixed(2)} m`);
  }
});

test('C3. arrasto: chute forte perde um pouco no caminho', () => {
  const b = makeBall();
  b.pos.y = 1;
  b.vel = { x: 30, y: 1.5, z: 0 };
  b.state = BallState.AEREA;
  while (b.pos.x < 15) stepBall(b, DT, calm, null);
  const v = Math.hypot(b.vel.x, b.vel.z);
  assert.ok(v < 29 && v > 22, `${v.toFixed(1)} m/s após 15 m`);
});

test('C6. chute a 32 m/s no meio do gol é gol (sem atravessar)', () => {
  const b = makeBall();
  b.pos = { x: 15, y: 0.6, z: 0 };
  b.vel = { x: 32, y: 1.5, z: 0 };
  b.state = BallState.AEREA;
  const ev = run(b, 0.5);
  assert.ok(ev.some((e) => e.type === 'goal' && e.side === 1));
  assert.ok(ev.some((e) => e.type === 'net'), 'rede segura');
  assert.ok(Math.abs(b.pos.x) <= GEO.halfL + GEO.depth, 'bola fica no gol');
});

test('C6. só é gol com a bola inteira além da linha', () => {
  const b = makeBall();
  b.pos = { x: GEO.halfL - 0.05, y: 0.1, z: 0 };
  b.vel = { x: 0.6, y: 0, z: 0 };
  const ev = [];
  for (let i = 0; i < 20; i++) stepBall(b, DT, env, ev);
  assert.ok(b.pos.x > GEO.halfL && b.pos.x < GEO.halfL + 0.1);
  assert.equal(ev.filter((e) => e.type === 'goal').length, 0, 'meio da bola na linha não vale');
});

test('C5. trave: chute a 32 m/s bate e volta (cilindro, restituição 0,6)', () => {
  const b = makeBall();
  const pz = GEO.gw + GEO.pr;
  b.pos = { x: 14, y: 1, z: pz };
  b.vel = { x: 32, y: 0.3, z: 0 };
  b.state = BallState.AEREA;
  const ev = run(b, 0.4);
  const post = ev.find((e) => e.type === 'post');
  assert.ok(post, 'bateu na trave');
  assert.ok(!ev.some((e) => e.type === 'goal'), 'não atravessou');
});

test('C5. travessão', () => {
  const b = makeBall();
  b.pos = { x: 15, y: GEO.gh + GEO.pr + 0.2, z: 0 }; // cai ~0,2 m até o gol
  b.vel = { x: 25, y: 0, z: 0 };
  b.state = BallState.AEREA;
  const ev = run(b, 0.3);
  assert.ok(ev.some((e) => e.type === 'post' && e.kind === 'travessao'));
});

test('C6. bola pela lateral sai só inteira', () => {
  const b = makeBall();
  b.pos = { x: 0, y: 0.1, z: 9 };
  b.vel = { x: 0, y: 0, z: 6 };
  const ev = run(b, 0.5);
  const out = ev.find((e) => e.type === 'out_side');
  assert.ok(out);
});

test('C5. paredes: a bola nunca atravessa', () => {
  const b = makeBall();
  b.pos = { x: 0, y: 0.1, z: 0 };
  b.vel = { x: 0, y: 0, z: 30 };
  b.inPlay = false;
  run(b, 2);
  assert.ok(Math.abs(b.pos.z) <= GEO.wallZ);
});

test('F4. passe alto cai perto do alvo (corrige arrasto)', () => {
  const from = { x: 0, y: 0.1, z: 0 };
  const to = { x: 14, z: 5 };
  const v = solveLob(from, to, 1.2, env);
  const b = makeBall();
  b.pos = { ...from };
  b.vel = { ...v };
  b.state = BallState.AEREA;
  b.inPlay = false;
  let prevY = b.pos.y;
  for (let t = 0; t < 3; t += DT) {
    stepBall(b, DT, calm, null);
    if (b.pos.y < prevY && b.pos.y <= 0.101) break;
    prevY = b.pos.y;
  }
  const err = Math.hypot(b.pos.x - to.x, b.pos.z - to.z);
  assert.ok(err < 0.4, `erro de queda ${err.toFixed(2)} m`);
});

function testPlayer(vel = 70) {
  const p = makePlayer({ num: 1, name: 't', role: 'ALA', vel, dri: 50, pas: 50, fin: 50, mar: 50, ref: 10, fri: 50, pe: 'D' }, 0, true);
  return p;
}
const ctx = { slippery: () => false, hasBall: false };

test('D2. aceleração do parado à corrida em ~0,6 s', () => {
  const p = testPlayer();
  p.intent = { dx: 1, dz: 0, mag: 1, sprint: false };
  let t = 0;
  const top = 5.5 + 1.5 * ((70 - 1) / 98);
  while (p.speed < top - 0.01 && t < 2) {
    movePlayer(p, DT, ctx);
    t += DT;
  }
  assert.ok(t > 0.5 && t < 0.7, `${t.toFixed(2)} s`);
});

test('D2. virar 90° perde 30%; meia-volta quase para', () => {
  const p = testPlayer();
  p.intent = { dx: 1, dz: 0, mag: 1, sprint: false };
  for (let i = 0; i < 120; i++) movePlayer(p, DT, ctx);
  const v0 = p.speed;
  p.intent = { dx: 0, dz: 1, mag: 1, sprint: false };
  movePlayer(p, DT, ctx);
  assert.ok(Math.abs(p.speed / v0 - 0.7) < 0.05, `90°: ${(p.speed / v0).toFixed(2)}`);
  for (let i = 0; i < 120; i++) movePlayer(p, DT, ctx);
  p.intent = { dx: 0, dz: -1, mag: 1, sprint: false };
  movePlayer(p, DT, ctx);
  assert.equal(p.state, 'halfturn');
  assert.ok(p.speed < 1, `meia-volta: ${p.speed.toFixed(2)}`);
});

test('D2. virar até 45° mantém a velocidade', () => {
  const p = testPlayer();
  p.intent = { dx: 1, dz: 0, mag: 1, sprint: false };
  for (let i = 0; i < 120; i++) movePlayer(p, DT, ctx);
  const v0 = p.speed;
  const a = (40 * Math.PI) / 180;
  p.intent = { dx: Math.cos(a), dz: Math.sin(a), mag: 1, sprint: false };
  for (let i = 0; i < 30; i++) movePlayer(p, DT, ctx);
  assert.ok(p.speed >= v0 - 0.01);
});

test('D2. frenagem ~0,4 s e 40% mais longa no piso escorregadio', () => {
  const brakeTime = (slip) => {
    const p = testPlayer();
    p.intent = { dx: 1, dz: 0, mag: 1, sprint: true };
    for (let i = 0; i < 240; i++) movePlayer(p, DT, ctx);
    p.intent = { dx: 1, dz: 0, mag: 0, sprint: false };
    let t = 0;
    while (p.speed > 0 && t < 3) {
      movePlayer(p, DT, { slippery: () => slip, hasBall: false });
      t += DT;
    }
    return t;
  };
  const dry = brakeTime(false), wet = brakeTime(true);
  assert.ok(dry > 0.33 && dry < 0.45, `seco ${dry.toFixed(2)}`);
  assert.ok(Math.abs(wet / dry - 1.4) < 0.06, `molhado/seco ${(wet / dry).toFixed(2)}`);
});

test('D3. fôlego: arrancada gasta ~8/s, parado recupera ~4/s', () => {
  const p = testPlayer();
  p.intent = { dx: 1, dz: 0, mag: 1, sprint: true };
  for (let i = 0; i < 120; i++) movePlayer(p, DT, ctx);
  assert.ok(Math.abs(100 - p.stamina - 8) < 0.2, `${p.stamina}`);
  p.intent = { dx: 1, dz: 0, mag: 0, sprint: false };
  const s0 = p.stamina;
  for (let i = 0; i < 120; i++) movePlayer(p, DT, ctx);
  assert.ok(Math.abs(p.stamina - s0 - 4) < 0.2);
});

test('D1. com a bola: 85% (Artista: 90%)', async () => {
  const { maxSpeeds } = await import('../src/sim/players.js');
  const p = testPlayer();
  const a = maxSpeeds(p, false, false).run, b = maxSpeeds(p, true, false).run;
  assert.ok(Math.abs(b / a - 0.85) < 1e-9);
  p.def.artista = true;
  assert.ok(Math.abs(maxSpeeds(p, true, false).run / a - 0.9) < 1e-9);
});

test('F5. perna ruim: destro cruzando para a esquerda', () => {
  const p = testPlayer();
  p.facing = 0;
  assert.equal(usesWeakFoot(p, (60 * Math.PI) / 180), true);
  assert.equal(usesWeakFoot(p, (-60 * Math.PI) / 180), false);
});

test('partida IA × IA completa sem NaN, com gols, saídas e cobranças', () => {
  const m = new Match({ home: TEAMS[0], away: TEAMS[1], human: -1, halfMinutes: 1.5, seed: 42 });
  const seen = new Set();
  let steps = 0;
  while (m.phase !== 'end' && steps < 120 * 60 * 12) {
    m.step(DT, null);
    steps++;
    for (const e of m.events) seen.add(e.type);
    m.events.length = 0;
    assert.ok(Number.isFinite(m.ball.pos.x + m.ball.pos.y + m.ball.pos.z));
  }
  assert.equal(m.phase, 'end');
  for (const t of ['kick', 'pass', 'trap', 'restart', 'play']) assert.ok(seen.has(t), `evento ${t}`);
});

test('partida com humano (só toca passe de vez em quando) termina', () => {
  const m = new Match({ home: TEAMS[0], away: TEAMS[2], human: 0, halfMinutes: 0.5, seed: 3, venue: 'rua' });
  let steps = 0;
  const input = { mx: 0.6, my: 0.2, held: {}, pressN: { pass: 0 } };
  while (m.phase !== 'end' && steps < 120 * 60 * 6) {
    // segura o passe por 0,1 s a cada 2 s
    const k = steps % 240;
    if (k === 0) input.pressN.pass++;
    input.held.pass = k < 12;
    m.step(DT, input);
    steps++;
    m.events.length = 0;
  }
  assert.equal(m.phase, 'end');
});
