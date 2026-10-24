// Testes de regras e simulação do Pixel Futsal (Node, sem navegador).
// Uso: node futsal/tools/test.mjs
// Math.random é semeado para os resultados serem reproduzíveis.
import { rng } from '../js/util.js';
const seeded = rng(20261023);
Math.random = seeded;

const { defaultTeams, teamOverall } = await import('../js/data.js');
const { Ball, COURT, inArea } = await import('../js/physics.js');
const { Match } = await import('../js/game.js');
const C = await import('../js/career.js');
const { Controller } = await import('../js/input.js').catch(() => ({ Controller: null }));

let pass = 0, fail = 0;
function check(name, cond, info = '') {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FALHA', name, info); }
}
const S = { autoSwitch: true, replays: false };
const T = defaultTeams();

function run(m, maxT = 1500, tick) {
  let t = 0;
  while (t < maxT) {
    m.update(1 / 60, [], null); t += 1 / 60;
    if (tick) tick(m, t);
    if (m.state === 'halftime') m.nextPeriod();
    if (m.state === 'fulltime') return t;
  }
  return -1;
}
function toPlay(m) { let k = 0; while (m.state !== 'play' && k++ < 2000) m.update(1 / 60, [], null); }

console.log('Dados');
check('16 times', T.length === 16);
check('10 jogadores por time', T.every((t) => t.players.length === 10));
check('números únicos', T.every((t) => new Set(t.players.map((p) => p.number)).size === 10));
check('2 goleiros por time', T.every((t) => t.players.filter((p) => p.role === 'GK').length === 2));
check('atributos 1–99', T.every((t) => t.players.every((p) => ['vel', 'pas', 'fin', 'dri', 'mar', 'fol'].every((k) => p[k] >= 1 && p[k] <= 99))));

console.log('Física');
{
  const b = new Ball(); b.kick(8, 0, 0); const ev = [];
  for (let i = 0; i < 60 * 10; i++) b.step(1 / 60, ev, false);
  check('bola rolando para', b.speed === 0 && b.x > 5 && b.x < 20, `x=${b.x.toFixed(2)}`);
  const g = new Ball(); g.reset(15, 0); g.kick(20, 1, 0); const e2 = [];
  for (let i = 0; i < 120; i++) g.step(1 / 60, e2, true);
  check('chute no meio do gol vira gol', e2.some((e) => e.type === 'goal' && e.side === 1));
  check('rede segura a bola', Math.abs(g.x) <= COURT.HL + COURT.GOAL_D);
  const p = new Ball(); p.reset(15, 1.5); p.kick(20, 0.5, 0); const e3 = [];
  for (let i = 0; i < 60; i++) p.step(1 / 60, e3, true);
  check('bola na trave quica', e3.some((e) => e.type === 'post'));
  const o = new Ball(); o.reset(0, 9); o.kick(0, 0, 6); const e4 = [];
  for (let i = 0; i < 60; i++) o.step(1 / 60, e4, true);
  check('saída pela lateral', e4.some((e) => e.type === 'out' && e.where === 'side'));
  check('área de 6 m', inArea(-16, 0, -1) && inArea(-19, 6.5, -1) && !inArea(-12, 0, -1) && !inArea(-19, 8, -1));
}

console.log('Partidas completas CPU x CPU');
for (const diff of ['facil', 'normal', 'dificil', 'craque']) {
  const m = new Match({ home: T[0], away: T[5], halfLen: 120, difficulty: diff, humans: [] }, S);
  let stuck = 0, maxStuck = 0, nan = false, lx = 0, lz = 0;
  const t = run(m, 1500, (mm) => {
    const b = mm.ball;
    if (!Number.isFinite(b.x + b.z + b.y)) nan = true;
    if (mm.state === 'play' && b.free) { stuck = Math.hypot(b.x - lx, b.z - lz) < 0.02 ? stuck + 1 / 60 : 0; maxStuck = Math.max(maxStuck, stuck); }
    lx = b.x; lz = b.z;
  });
  check(`${diff}: termina`, t > 0, `t=${t}`);
  check(`${diff}: sem NaN`, !nan);
  check(`${diff}: bola nunca presa > 3 s`, maxStuck < 3, `max=${maxStuck.toFixed(1)}`);
  check(`${diff}: placar = gols registrados`, m.teams[0].score + m.teams[1].score === m.goalsLog.length);
  check(`${diff}: houve chutes`, m.teams[0].stats.shots + m.teams[1].stats.shots > 4);
}

console.log('Pênaltis e mata-mata');
{
  const m = new Match({ home: T[0], away: T[1], halfLen: 60, difficulty: 'normal', humans: [], penaltiesOnly: true, knockout: true }, S);
  run(m, 400);
  const so = m.shootout;
  check('disputa de pênaltis termina com vencedor', so && so.done && (so.winner === 0 || so.winner === 1));
  check('pelo menos 3 cobranças por time', so && so.kicks[0].length >= 3 && so.kicks[1].length >= 3);
  const k = new Match({ home: T[2], away: T[3], halfLen: 30, difficulty: 'normal', humans: [], knockout: true, extraTime: true }, S);
  const halves = [];
  k.on((ty, d) => { if (ty === 'periodEnd') halves.push(d.half); });
  run(k, 900, (mm) => { if (mm.state === 'play') { mm.teams[0].score = 0; mm.teams[1].score = 0; } });
  check('empate no mata-mata: prorrogação (4 períodos)', halves.join(',') === '1,2,3,4', halves.join(','));
  check('depois da prorrogação: pênaltis', k.result().pens !== null);
}

console.log('Regras');
{
  // expulsão
  const m = new Match({ home: T[0], away: T[1], halfLen: 120, difficulty: 'normal', humans: [] }, S);
  toPlay(m);
  m.giveCard(m.players[7], 'red');
  check('expulso: time fica com 4', m.courtPlayers(1).length === 4);
  run(m, 120, () => {});
  check('após 2 min (proporcional) volta a ter 5', m.courtPlayers(1).length === 5);
  // segundo amarelo
  const m2 = new Match({ home: T[0], away: T[1], halfLen: 120, difficulty: 'normal', humans: [] }, S);
  toPlay(m2);
  m2.giveCard(m2.players[6], 'yellow');
  m2.giveCard(m2.players[6], m2.teams[1].yellow.has(m2.players[6].data.id) ? 'red2' : 'yellow');
  check('segundo amarelo = vermelho', m2.teams[1].stats.reds === 1);
  // faltas acumuladas: 6ª falta = tiro livre sem barreira
  const m3 = new Match({ home: T[0], away: T[1], halfLen: 120, difficulty: 'normal', humans: [] }, S);
  toPlay(m3);
  m3.teams[1].fouls = 5;
  const vic = m3.players[3]; vic.x = 2; vic.z = 2;
  m3.foul(m3.players[6], vic, 'tackle');
  check('6ª falta: tiro livre sem barreira', m3.pendingRestart.type === 'livre6');
  check('cobrado da marca dos 10 m', Math.abs(Math.abs(m3.pendingRestart.x) - 10) < 0.01);
  // falta na área = pênalti
  const m4 = new Match({ home: T[0], away: T[1], halfLen: 120, difficulty: 'normal', humans: [] }, S);
  toPlay(m4);
  const v4 = m4.players[3]; v4.x = m4.goalX(0) - m4.teams[0].dir * 3; v4.z = 0.5;
  m4.foul(m4.players[6], v4, 'tackle');
  check('falta na área: pênalti na marca dos 6 m', m4.pendingRestart.type === 'penalti' && Math.abs(Math.abs(m4.pendingRestart.x) - 14) < 0.01);
  // lateral para o time que não tocou por último
  const m5 = new Match({ home: T[0], away: T[1], halfLen: 120, difficulty: 'normal', humans: [] }, S);
  toPlay(m5);
  m5.ball.owner = null; m5.ball.lastTouch = m5.players[2];
  m5.ballOut({ where: 'side', x: 3, z: 10 });
  check('lateral para o adversário de quem tocou por último', m5.pendingRestart.type === 'lateral' && m5.pendingRestart.team === 1);
  // linha de fundo: atacante tocou → tiro de meta; defensor → escanteio
  const atk = m5.players[2];
  m5.state = 'play'; m5.ball.lastTouch = atk;
  m5.ballOut({ where: 'end', side: m5.teams[0].dir, x: m5.goalX(0), z: 5 });
  check('fundo (atacante): tiro de meta', m5.pendingRestart.type === 'meta' && m5.pendingRestart.team === 1);
  m5.state = 'play'; m5.ball.lastTouch = m5.players[6];
  m5.ballOut({ where: 'end', side: m5.teams[0].dir, x: m5.goalX(0), z: 5 });
  check('fundo (defensor): escanteio', m5.pendingRestart.type === 'escanteio' && m5.pendingRestart.team === 0);
  // tiro de meta é com a mão do goleiro
  m5.setupRestart({ type: 'meta', team: 1, x: m5.ownGoalX(1), z: 0 });
  check('tiro de meta: goleiro com a bola na mão', m5.ball.holder && m5.ball.holder.isGK && m5.ball.holder.team === 1);
  // 4 segundos: cobrador humano parado perde a posse
  const m6 = new Match({ home: T[0], away: T[1], halfLen: 120, difficulty: 'normal', humans: [{ team: 0 }] }, S);
  if (Controller) {
    const c = new Controller('t', 't', 't');
    let k = 0; while (m6.state !== 'play' && k++ < 600) { c.raw.pass = k % 20 === 0; c.update(1 / 60); m6.update(1 / 60, [c], null); }
    m6.awardRestart('lateral', 0, 0, 10);
    c.raw.pass = false;
    const ev = [];
    m6.on((ty, d) => { if (ty === 'fourSec' || ty === 'whistle') ev.push(ty + ':' + (d.team ?? '')); });
    for (let i = 0; i < 60 * 7; i++) { c.update(1 / 60); m6.update(1 / 60, [c], null); }
    check('4 segundos no lateral: posse invertida', ev.includes('fourSec:0') && ev.includes('whistle:1'), ev.join(','));
  }
  // gol direto de lateral não vale
  const m7 = new Match({ home: T[0], away: T[1], halfLen: 120, difficulty: 'normal', humans: [] }, S);
  toPlay(m7);
  m7.restartTouch = { taker: m7.players[2], indirect: true, only: true, t: m7.time };
  m7.ball.lastTouch = m7.players[2];
  m7.goalScored(m7.teams[0].dir);
  check('gol direto de cobrança indireta não vale', m7.teams[0].score === 0 && m7.pendingRestart.type === 'meta');
  // substituição volante
  const m8 = new Match({ home: T[4], away: T[5], halfLen: 120, difficulty: 'normal', humans: [] }, S);
  const before = m8.players[2].data.id;
  check('substituição', m8.substitute(0, 2, 0) && m8.players[2].data.id !== before && m8.teams[0].bench.some((d) => d.id === before));
}

console.log('Competições');
{
  const ids = T.slice(0, 8).map((t) => t.id);
  const byId = Object.fromEntries(T.map((t) => [t.id, t]));
  const lg = C.newLeague(ids, ids[0], false);
  check('pontos corridos: 7 rodadas', lg.rounds.length === 7 && lg.rounds.every((r) => r.length === 4));
  while (!lg.done) {
    const g = C.userGame(lg); if (g) g.res = C.simMatch(byId[g.h], byId[g.a]);
    C.simRound(lg, byId); C.advanceLeague(lg);
  }
  const tb = C.leagueTable(lg);
  check('tabela: todos com 7 jogos', tb.every((r) => r.j === 7));
  const cup = C.newCup(T.map((t) => t.id), T[0].id);
  while (!cup.done) {
    const g = C.userGame(cup); if (g) g.res = C.simMatch(byId[g.h], byId[g.a], true);
    C.simRound(cup, byId, true); C.advanceCup(cup);
  }
  check('copa de 16: 4 fases e campeão', cup.rounds.length === 4 && !!cup.champion);
  const car = C.newCareer(T, T[0].id);
  for (let s = 0; s < 3; s++) {
    while (!car.league.done) {
      const T2 = Object.fromEntries(car.teams.map((t) => [t.id, t]));
      const g = C.userGame(car.league); if (g) g.res = C.simMatch(T2[g.h], T2[g.a]);
      C.simRound(car.league, T2); C.advanceLeague(car.league);
    }
    C.endSeason(car);
  }
  check('carreira: 3 temporadas', car.season === 4 && car.history.length === 3);
  check('carreira: elencos válidos', car.teams.every((t) => t.players.length >= 8 && t.players.some((p) => p.role === 'GK')));
}

console.log(`\n${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
