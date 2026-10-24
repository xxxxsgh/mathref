// Competições: campeonato de pontos corridos, copa mata-mata e carreira de
// técnico (temporadas, evolução de atributos, contratações simples).
import { teamOverall, playerOverall, makePlayer } from './data.js';
import { shuffle, rng, clamp, deepClone } from './util.js';

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

// Simulação rápida de partidas entre times da CPU.
export function simMatch(a, b, knockout = false) {
  const ra = teamOverall(a), rb = teamOverall(b);
  const la = 2.9 * Math.pow(ra / rb, 2.2), lb = 2.9 * Math.pow(rb / ra, 2.2);
  const home = poisson(la), away = poisson(lb);
  let pens = null;
  if (knockout && home === away) {
    let p1 = 0, p2 = 0;
    for (let i = 0; i < 5; i++) { if (Math.random() < 0.75) p1++; if (Math.random() < 0.75) p2++; }
    while (p1 === p2) { if (Math.random() < 0.75) p1++; if (Math.random() < 0.72) p2++; }
    pens = [p1, p2];
  }
  return { home, away, pens };
}

// Tabela de rodízio (método do círculo).
export function roundRobin(ids, double = false) {
  const list = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const h = list[i], a = list[n - 1 - i];
      if (h !== null && a !== null) games.push(r % 2 ? { h: a, a: h, res: null } : { h, a, res: null });
    }
    rounds.push(games);
    list.splice(1, 0, list.pop());
  }
  if (double) rounds.push(...rounds.map((g) => g.map((x) => ({ h: x.a, a: x.h, res: null }))));
  return rounds;
}

export function newLeague(teamIds, userTeam, double = false) {
  return { type: 'league', teams: teamIds, rounds: roundRobin(shuffle([...teamIds]), double), round: 0, userTeam, done: false };
}

export function leagueTable(lg) {
  const rows = new Map(lg.teams.map((id) => [id, { id, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0 }]));
  for (const r of lg.rounds) for (const g of r) {
    if (!g.res) continue;
    const h = rows.get(g.h), a = rows.get(g.a);
    h.j++; a.j++; h.gp += g.res.home; h.gc += g.res.away; a.gp += g.res.away; a.gc += g.res.home;
    if (g.res.home > g.res.away) { h.v++; a.d++; h.p += 3; }
    else if (g.res.home < g.res.away) { a.v++; h.d++; a.p += 3; }
    else { h.e++; a.e++; h.p++; a.p++; }
  }
  return [...rows.values()].sort((x, y) => y.p - x.p || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp);
}

export function userGame(comp) {
  const games = comp.type === 'cup' ? comp.rounds[comp.round] : comp.rounds[comp.round];
  return games ? games.find((g) => (g.h === comp.userTeam || g.a === comp.userTeam) && !g.res) : null;
}

// Simula todos os jogos da rodada atual exceto o do usuário.
export function simRound(comp, teamsById, knockout = false) {
  const games = comp.rounds[comp.round] || [];
  for (const g of games) {
    if (g.res) continue;
    if (g.h === comp.userTeam || g.a === comp.userTeam) continue;
    g.res = simMatch(teamsById[g.h], teamsById[g.a], knockout);
  }
}

export function advanceLeague(lg) {
  if (lg.rounds[lg.round].every((g) => g.res)) lg.round++;
  if (lg.round >= lg.rounds.length) lg.done = true;
}

// ─── Copa ───────────────────────────────────────────────────────────────────
export function newCup(teamIds, userTeam) {
  const ids = shuffle([...teamIds]);
  const first = [];
  for (let i = 0; i < ids.length; i += 2) first.push({ h: ids[i], a: ids[i + 1], res: null });
  return { type: 'cup', teams: teamIds, rounds: [first], round: 0, userTeam, done: false, champion: null, eliminated: false };
}

export function cupWinner(g) {
  if (!g.res) return null;
  if (g.res.home !== g.res.away) return g.res.home > g.res.away ? g.h : g.a;
  return g.res.pens[0] > g.res.pens[1] ? g.h : g.a;
}

export function advanceCup(cup) {
  const games = cup.rounds[cup.round];
  if (!games.every((g) => g.res)) return;
  const winners = games.map(cupWinner);
  if (!winners.includes(cup.userTeam)) cup.eliminated = true;
  if (winners.length === 1) { cup.done = true; cup.champion = winners[0]; return; }
  const next = [];
  for (let i = 0; i < winners.length; i += 2) next.push({ h: winners[i], a: winners[i + 1], res: null });
  cup.rounds.push(next);
  cup.round++;
}

export function cupRoundName(n) {
  return { 16: 'Oitavas de final', 8: 'Quartas de final', 4: 'Semifinal', 2: 'Final' }[n] || 'Rodada';
}

// ─── Carreira ───────────────────────────────────────────────────────────────
export function playerValue(p) {
  const ov = playerOverall(p);
  const ageF = p.age < 22 ? 1.3 : p.age < 28 ? 1.1 : p.age < 32 ? 0.8 : 0.5;
  return Math.round(Math.pow(Math.max(1, ov - 40), 2) * 1.6 * ageF) * 1000;
}

export function newCareer(allTeams, userTeamId) {
  // 8 times: o do usuário + 7 aleatórios
  const others = shuffle(allTeams.filter((t) => t.id !== userTeamId)).slice(0, 7);
  const user = allTeams.find((t) => t.id === userTeamId);
  const teams = [user, ...others].map(deepClone);
  const budget = Math.round((100 - teamOverall(user)) * 12000 + 250000);
  return {
    type: 'career', season: 1, userTeam: userTeamId, teams, budget,
    league: newLeague(teams.map((t) => t.id), userTeamId, true),
    history: [], news: ['Bem-vindo, professor! A diretoria espera uma boa campanha.'],
  };
}

const ATTRS = ['vel', 'pas', 'fin', 'dri', 'mar', 'fol'];

// Fim de temporada: evolução por idade e minutos jogados, aposentadorias,
// promoção de jovens e nova tabela.
export function endSeason(car) {
  const table = leagueTable(car.league);
  const pos = table.findIndex((r) => r.id === car.userTeam) + 1;
  const champ = car.teams.find((t) => t.id === table[0].id);
  car.history.push({ season: car.season, pos, champion: champ.name, pts: table.find((r) => r.id === car.userTeam).p });
  const r = rng(car.season * 7919 + 13);
  const report = [];
  for (const t of car.teams) {
    t.players = t.players.map((p) => {
      p.age++;
      const played = (p.minutesSeason || 0) > 60 ? 1 : 0;
      let base = p.age <= 22 ? 2.5 : p.age <= 27 ? 1 : p.age <= 30 ? 0 : -2;
      base += played * 0.8;
      const keys = p.role === 'GK' ? ['ref', 'pos', 'rep', 'vel'] : ATTRS;
      for (const k of keys) p[k] = clamp(Math.round(p[k] + base + (r() - 0.5) * 4), 25, 99);
      p.minutesSeason = 0;
      if (p.age >= 36 && r() < 0.7) {
        const young = makePlayer(r, p.role, teamOverall(t) - 8, p.number);
        young.age = 17 + Math.floor(r() * 3);
        if (t.id === car.userTeam) report.push(`${p.name} se aposentou. A base promoveu ${young.name}.`);
        return young;
      }
      return p;
    });
  }
  car.budget += Math.round((9 - pos) * 40000 + 120000);
  car.season++;
  car.league = newLeague(car.teams.map((t) => t.id), car.userTeam, true);
  car.news = [`Temporada ${car.season - 1} encerrada: ${pos}º lugar. Campeão: ${champ.name}.`, `Verba para contratações: R$ ${(car.budget / 1000).toFixed(0)} mil.`, ...report];
  return { pos, champion: champ.name };
}

export function buyPlayer(car, fromTeamId, playerId) {
  const from = car.teams.find((t) => t.id === fromTeamId);
  const to = car.teams.find((t) => t.id === car.userTeam);
  const p = from.players.find((x) => x.id === playerId);
  if (!p) return 'Jogador não encontrado.';
  const price = playerValue(p);
  if (car.budget < price) return 'Verba insuficiente.';
  if (to.players.length >= 14) return 'Elenco cheio (máx. 14).';
  if (from.players.length <= 8) return 'O clube não quer vender (elenco curto).';
  if (p.role === 'GK' && from.players.filter((x) => x.role === 'GK').length <= 1) return 'O clube não vende seu único goleiro.';
  from.players.splice(from.players.indexOf(p), 1);
  const used = new Set(to.players.map((x) => x.number));
  while (used.has(p.number)) p.number = (p.number % 20) + 2;
  to.players.push(p);
  car.budget -= price;
  fixLineup(from);
  car.news.unshift(`Contratado: ${p.name} (${from.name}) por R$ ${(price / 1000).toFixed(0)} mil.`);
  return null;
}

export function sellPlayer(car, playerId) {
  const team = car.teams.find((t) => t.id === car.userTeam);
  const p = team.players.find((x) => x.id === playerId);
  if (!p) return 'Jogador não encontrado.';
  if (team.players.length <= 8) return 'Elenco mínimo de 8 jogadores.';
  if (p.role === 'GK' && team.players.filter((x) => x.role === 'GK').length <= 1) return 'Você precisa de pelo menos um goleiro.';
  const buyer = car.teams.filter((t) => t.id !== car.userTeam && t.players.length < 14).sort(() => Math.random() - 0.5)[0];
  if (!buyer) return 'Nenhum clube interessado.';
  const price = Math.round(playerValue(p) * 0.8);
  team.players.splice(team.players.indexOf(p), 1);
  buyer.players.push(p);
  car.budget += price;
  fixLineup(team);
  car.news.unshift(`Vendido: ${p.name} para o ${buyer.name} por R$ ${(price / 1000).toFixed(0)} mil.`);
  return null;
}

// Garante uma escalação válida (5 índices, goleiro no primeiro).
export function fixLineup(team) {
  const t = team.tactic || (team.tactic = { formation: '3-1', marking: 'zona', press: 'normal', lineup: [0, 1, 2, 3, 4] });
  const n = team.players.length;
  let lu = (t.lineup || []).filter((i) => i < n);
  lu = [...new Set(lu)];
  if (!lu.length || team.players[lu[0]]?.role !== 'GK') {
    const gk = team.players.findIndex((p) => p.role === 'GK');
    lu = [gk >= 0 ? gk : 0, ...lu.filter((i) => i !== gk)];
  }
  for (let i = 0; lu.length < 5 && i < n; i++) if (!lu.includes(i) && team.players[i].role !== 'GK') lu.push(i);
  for (let i = 0; lu.length < 5 && i < n; i++) if (!lu.includes(i)) lu.push(i);
  t.lineup = lu.slice(0, 5);
}

export function recordMinutes(car, result, teamsInMatch) {
  for (const pr of result.players) {
    for (const t of teamsInMatch) {
      const p = car.teams.find((x) => x.id === t.id)?.players.find((x) => x.id === pr.id);
      if (p) { p.minutesSeason = (p.minutesSeason || 0) + pr.minutes; p.goalsSeason = (p.goalsSeason || 0) + pr.goals; }
    }
  }
}
