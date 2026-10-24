// Roda partidas IA × IA no Node (sem render) e imprime um resumo.
//   node tools/sim.mjs [partidas] [minutosPorTempo] [venue]
import { Match } from '../src/sim/match.js';
import { TEAMS } from '../src/sim/teams.js';
import { CONFIG } from '../src/config.js';

const n = Number(process.argv[2] || 1);
const mins = Number(process.argv[3] || 3);
const venue = process.argv[4] || 'ginasio';
const totals = {};
for (let i = 0; i < n; i++) {
  const m = new Match({ home: TEAMS[0], away: TEAMS[1], venue, human: -1, halfMinutes: mins, seed: 1000 + i });
  const count = {};
  let steps = 0;
  while (m.phase !== 'end' && steps < 120 * 60 * 30) {
    m.step(CONFIG.sim.dt, null);
    steps++;
    for (const e of m.events) count[e.type] = (count[e.type] || 0) + 1;
    m.events.length = 0;
    const b = m.ball.pos;
    if (!Number.isFinite(b.x + b.y + b.z)) throw new Error('NaN na bola, passo ' + steps);
    for (const p of m.players) if (!Number.isFinite(p.pos.x + p.pos.z)) throw new Error('NaN em ' + p.name);
  }
  const [a, b] = m.teams;
  console.log(`#${i} ${a.def.short} ${a.score} x ${b.score} ${b.def.short}  tempo real sim ${(steps / 120 / 60).toFixed(1)} min  chutes ${a.shots}/${b.shots}  faltas ${a.fouls}/${b.fouls} posse ${(a.possession).toFixed(0)}s/${(b.possession).toFixed(0)}s`);
  for (const [k, v] of Object.entries(count)) totals[k] = (totals[k] || 0) + v;
}
console.log(totals);
