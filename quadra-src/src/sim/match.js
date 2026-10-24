// ═══════════════════════════════════════════════════════════════════════════
// A partida: junta bola, jogadores, IA e humano, e aplica as regras
// (saídas, gol, faltas, vantagem, cartões, cobranças, cronômetro e
// substituições). Tudo roda no mesmo passo fixo (seção B).
//
// Não depende de three nem do DOM: roda igual no navegador e no Node.
// ═══════════════════════════════════════════════════════════════════════════
import { CONFIG, VENUES } from '../config.js';
import { BallState, GEO, makeBall, makeBallEnv, predictBall, stepBall } from './ball.js';
import { DEG, att, clamp, lerp, makeRng, pointSeg } from './math.js';
import { canTouch, collidePlayers, footPoint, makePlayer, movePlayer, resetPlayerId, setState } from './players.js';
import { doPass, doShoot, dribbleStep, slideContact, trap } from './actions.js';
import {
  applyAi,
  assignSlots,
  inArea,
  keeperShapes,
  keeperThrow,
  keeperUpdate,
  makeAiState,
  makeKeeperState,
  shapeTarget,
  teamThink,
} from './ai.js';
import { STARTERS } from './teams.js';
import { HumanController } from './human.js';

const BR = CONFIG.ball.radius;
const MT = CONFIG.match;
const DF = CONFIG.defense;

export class Match {
  /**
   * opts: { home, away (definições de time), venue ('ginasio'|'coberta'|'rua'),
   *         human (0, 1 ou −1 para IA × IA), assist ('assistido'|'manual'),
   *         halfMinutes, seed }
   */
  constructor(opts) {
    this.opts = opts;
    this.rng = makeRng(opts.seed ?? (Date.now() & 0xffffffff));
    this.venueKey = opts.venue || 'ginasio';
    this.venue = VENUES[this.venueKey];
    this.halfLen = (opts.halfMinutes ?? MT.halfMinutes) * 60;
    this.human = opts.human ?? 0;
    this.assist = opts.assist || 'assistido';
    this.time = 0;
    this.stepN = 0;
    this.events = [];
    this.ball = makeBall();
    this.owner = null;
    this.pass = null;
    this.lastTouch = null;
    this.lastTouchTeam = -1;
    this.lastShot = null;
    this.penaltyKick = false;
    this.advantage = null;
    this.pendingCards = [];
    this.half = 1;
    this.clock = 0;
    this.phase = 'restart';
    this.phaseT = 0;
    this.restart = null;
    this.message = null;
    this.debug = false;
    this.cooldowns = new Map();

    // pisos: poças na quadra de rua
    this.puddles = [];
    for (let i = 0; i < this.venue.puddles; i++) {
      this.puddles.push({ x: this.rng.range(-12, 12), z: this.rng.range(-7, 7), r: this.rng.range(1.1, 1.8) });
    }
    this.wind = { x: 0, z: 0 };
    if (this.venue.wind) this.rollWind();
    this.env = makeBallEnv({
      floorAt: (x, z) => (this.inPuddle(x, z) ? 'poca' : this.venue.floor),
      wind: this.wind,
      rng: this.rng,
    });

    resetPlayerId();
    this.teams = [opts.home, opts.away].map((def, i) => ({
      def,
      index: i,
      dir: i === 0 ? 1 : -1, // 1º tempo: mandante ataca para +x
      score: 0,
      fouls: 0, // acumuladas no tempo
      shots: 0,
      onTarget: 0,
      possession: 0,
      cards: 0,
      shortUntil: null, // expulsão: joga com um a menos até…
      autoSub: true,
    }));
    this.players = [];
    for (const t of this.teams) {
      t.def.roster.forEach((pd, k) => {
        const p = makePlayer(pd, t.index, k < STARTERS);
        p.ai = makeAiState();
        if (p.isGK) p.keeper = makeKeeperState();
        this.players.push(p);
      });
    }
    // reserva do goleiro fica no banco como goleiro
    for (const t of this.teams) assignSlots(this, t.index);
    this.pred = predictBall(this.ball, this.env, 0.1);
    this.controller = this.human >= 0 ? new HumanController(this, this.human) : null;
    this.setupRestart('kickoff', 0, { x: 0, z: 0 });
  }

  // ── consultas usadas por ações e IA ─────────────────────────────────────
  attackDir(team) {
    return this.teams[team].dir;
  }
  ownGoalX(team) {
    return -this.teams[team].dir * GEO.halfL;
  }
  assistFor(team) {
    return team === this.human ? this.assist : 'assistido';
  }
  keeperOf(team) {
    return this.players.find((p) => p.team === team && p.isGK && p.onCourt) || null;
  }
  crowdPressure(team) {
    // a torcida é do mandante (time 0): pressiona o visitante
    const c = this.venue.crowd;
    return team === 1 ? c * 0.75 : c * 0.12;
  }
  isHumanControlled(p) {
    return !!this.controller && this.controller.cp === p;
  }
  inPuddle(x, z) {
    for (const q of this.puddles) if (Math.hypot(x - q.x, z - q.z) < q.r) return true;
    return false;
  }
  slippery(x, z) {
    return (this.venue.sweat2nd && this.half === 2) || this.inPuddle(x, z);
  }
  rollWind() {
    const s = this.rng.sign() * CONFIG.ball.windAccelMax * this.rng.range(0.45, 1);
    this.wind.x = s * 0.15;
    this.wind.z = s;
  }
  onCourt(team) {
    return this.players.filter((p) => p.team === team && p.onCourt);
  }

  emit(e) {
    e.t = this.time;
    this.events.push(e);
    if ((e.type === 'kick' || e.type === 'throw') && this.phase === 'restart') this.beginPlay();
    if (e.type === 'shot') {
      const t = this.teams[e.player.team];
      t.shots++;
    }
  }

  say(text, time = 1.8, kind = 'info') {
    this.message = { text, t: time, kind };
    this.emit({ type: 'message', text, kind });
  }

  setOwner(p) {
    if (this.owner === p) return;
    this.owner = p;
    if (p) {
      if (this.pass && this.pass.to !== p) this.emit({ type: 'intercept', player: p });
      this.pass = null;
      if (this.penaltyKick) this.penaltyKick = false;
    }
  }

  touch(p, controlled = false) {
    void controlled;
    this.lastTouch = p;
    this.lastTouchTeam = p.team;
    if (this.pass && p !== this.pass.from) this.pass = null;
    if (this.penaltyKick && this.lastShot && p !== this.lastShot.player && !p.isGK) this.penaltyKick = false;
  }

  // ── passo fixo ──────────────────────────────────────────────────────────
  step(dt, input) {
    this.time += dt;
    this.stepN++;
    if (this.message) {
      this.message.t -= dt;
      if (this.message.t <= 0) this.message = null;
    }
    if (this.phase === 'end') return;
    if (this.phase === 'halftime') {
      this.phaseT -= dt;
      this.benchRecover(dt * 4);
      if (this.phaseT <= 0) this.startSecondHalf();
      return;
    }

    if (this.stepN % 6 === 0) this.pred = predictBall(this.ball, this.env, 3, 1 / 30);

    // IA a ~10 Hz, cada time num passo diferente
    for (const t of this.teams) {
      if (this.stepN % 12 === t.index * 6) teamThink(this, t.index, 12 * dt);
    }
    // humano
    if (this.controller) this.controller.update(dt, input);
    for (const p of this.players) {
      if (!p.onCourt) continue;
      if (p.isGK) {
        const human = this.isHumanControlled(p);
        keeperUpdate(this, p, dt, human);
        continue;
      }
      if (!this.isHumanControlled(p)) applyAi(this, p);
    }
    this.restartConstraints();
    this.steerOwnerToBall();

    for (const p of this.players) {
      if (!p.onCourt) continue;
      movePlayer(p, dt, { slippery: (x, z) => this.slippery(x, z), hasBall: this.owner === p });
      if (p.state === 'slide') slideContact(this, p);
    }
    const pe = collidePlayers(this.players.filter((p) => p.onCourt), this.ball.pos, this.owner, this.rng, this.time, this.cooldowns);
    for (const e of pe) {
      if (e.type === 'push' && this.phase === 'play') this.foul(e.attacker, e.victim, { kind: 'push', speed: e.speed });
      else if (e.type === 'shoulder') this.emit(e);
    }
    this.keepRestartDistance();

    // bola
    const prev = { ...this.ball.pos };
    const evs = [];
    if (this.phase === 'restart') this.holdRestartBall();
    else stepBall(this.ball, dt, this.env, evs);
    this.ballInteractions(prev);
    for (const e of evs) this.ballEvent(e);

    // regras e relógio
    this.updateAdvantage(dt);
    this.updatePhase(dt);
    this.housekeeping(dt);
  }

  // ── bola × jogadores ────────────────────────────────────────────────────
  ballInteractions(prev) {
    const b = this.ball;
    if (this.phase === 'restart') return;

    // goleiro segurando
    const holder = this.players.find((p) => p.isGK && p.state === 'hold' && p.onCourt);
    if (holder) {
      b.pos.x = holder.pos.x + Math.cos(holder.facing) * 0.28;
      b.pos.z = holder.pos.z + Math.sin(holder.facing) * 0.28;
      b.pos.y = 1.05;
      b.vel.x = b.vel.y = b.vel.z = 0;
      b.state = BallState.DOMINADA;
      return;
    }

    // I. defesas do goleiro (mãos só dentro da própria área)
    for (const gk of this.players) {
      if (!gk.isGK || !gk.onCourt || gk.kickImmune > 0) continue;
      const side = Math.sign(this.ownGoalX(gk.team));
      if (!inArea(gk.pos.x, gk.pos.z, side)) continue;
      // recuo de companheiro: goleiro não pega com a mão
      if (this.lastTouchTeam === gk.team && this.lastTouch !== gk && gk.state !== 'dive') continue;
      if (this.owner && this.owner.team !== gk.team && Math.hypot(b.vel.x, b.vel.z) < 9) {
        // bola dominada por atacante: goleiro abafa se ela escapar do pé
        const f = footPoint(this.owner);
        if (Math.hypot(b.pos.x - f.x, b.pos.z - f.z) < 0.5) continue;
      }
      if (this.keeperContact(gk, prev)) return;
    }

    const owner = this.owner;
    if (owner) {
      if (!owner.onCourt || owner.state === 'ground' || Math.hypot(b.pos.x - owner.pos.x, b.pos.z - owner.pos.z) > CONFIG.dribble.loseDistance) {
        this.setOwner(null);
      } else if (canTouch(owner) && owner.state !== 'kick') {
        const wantDir = owner.intent.mag > 0.15 ? Math.atan2(owner.intent.dz, owner.intent.dx) : null;
        const ctrl = this.controller;
        if (ctrl && ctrl.cp === owner && ctrl.tryPendingWithBall()) return;
        dribbleStep(this, owner, wantDir);
      }
    }

    // domínio de bola solta (ou roubada entre toques)
    const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (p === this.owner || !canTouch(p) || p.state === 'slide' || p.state === 'dive' || p.state === 'kick') continue;
      if (this.owner && this.owner.team === p.team) continue;
      if (p.isGK && p.state === 'hold') continue;
      const f = footPoint(p, 0.3);
      const low = b.pos.y < 0.4;
      const chest = b.pos.y < 1.35 && b.vel.y <= 0.5;
      if (!low && !chest) continue;
      const d = Math.hypot(b.pos.x - f.x, b.pos.z - f.z);
      const reach = low ? CONFIG.dribble.reach + 0.1 : 0.42;
      if (d > reach) continue;
      if (this.owner) {
        // só rouba quando a bola está solta entre dois toques
        const of = footPoint(this.owner);
        if (Math.hypot(b.pos.x - of.x, b.pos.z - of.z) < 0.55) continue;
      }
      const rel = Math.hypot(b.vel.x - p.vel.x, b.vel.z - p.vel.z);
      if (rel > 21) continue; // chute forte: só bloqueia com o corpo
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) {
      const ctrl = this.controller;
      if (ctrl && ctrl.cp === best && ctrl.tryFirstTime()) return;
      const wantDir = best.intent.mag > 0.15 ? Math.atan2(best.intent.dz, best.intent.dx) : null;
      if (this.owner) this.emit({ type: 'steal', player: best, from: this.owner });
      trap(this, best, wantDir);
      return;
    }

    // C5. bola batendo no corpo: perde 60% e desvia; mão de jogador de linha
    if (sp < 1) return;
    for (const p of this.players) {
      if (!p.onCourt || p === this.owner || p.kickImmune > 0) continue;
      if (p.isGK && inArea(p.pos.x, p.pos.z, Math.sign(this.ownGoalX(p.team)))) continue; // já tratado
      const top = p.state === 'ground' || p.state === 'slide' ? 0.45 : CONFIG.player.height;
      const r = p.state === 'ground' || p.state === 'slide' ? 0.45 : 0.3;
      const q = pointSeg(b.pos.x, b.pos.y, b.pos.z, p.pos.x, 0.1, p.pos.z, p.pos.x, top, p.pos.z);
      if (q.d > r + BR) continue;
      const nx = (b.pos.x - q.cx) / (q.d || 1), ny = (b.pos.y - q.cy) / (q.d || 1), nz = (b.pos.z - q.cz) / (q.d || 1);
      const vn = (b.vel.x - p.vel.x) * nx + b.vel.y * ny + (b.vel.z - p.vel.z) * nz;
      if (vn >= 0) continue;
      b.pos.x = q.cx + nx * (r + BR + 0.01);
      b.pos.y = Math.max(BR, q.cy + ny * (r + BR + 0.01));
      b.pos.z = q.cz + nz * (r + BR + 0.01);
      // reflete a componente normal e corta 60% da velocidade
      b.vel.x -= 1.4 * vn * nx;
      b.vel.y -= 1.4 * vn * ny;
      b.vel.z -= 1.4 * vn * nz;
      const k = CONFIG.ball.bodyKeep;
      b.vel.x *= k;
      b.vel.y *= k;
      b.vel.z *= k;
      b.spin = 0;
      b.touchDecel = false;
      if (b.vel.y !== 0 || b.pos.y > BR + 1e-3) b.state = BallState.AEREA;
      this.touch(p);
      p.kickImmune = 0.12;
      this.emit({ type: 'block', player: p, speed: sp });
      const [h0, h1] = CONFIG.ball.handBand;
      if (b.pos.y > h0 && b.pos.y < h1 && !p.isGK && this.phase === 'play' && this.rng() < CONFIG.ball.handChance) {
        this.handBall(p);
      }
      return;
    }
  }

  /**
   * Condução: entre toques o dono corrige o passo para o pé encontrar a
   * bola (sem isso, uma curva fechada deixaria a bola de lado e ele
   * passaria reto). Só puxa se a bola está mais ou menos para onde ele vai.
   */
  steerOwnerToBall() {
    const p = this.owner, b = this.ball;
    if (!p || p.isGK || p.state !== 'normal' || p.shield || b.pos.y > 0.4 || this.phase !== 'play') return;
    const it = p.intent;
    if (it.mag < 0.15) return;
    const tx = b.pos.x - p.pos.x, tz = b.pos.z - p.pos.z;
    const td = Math.hypot(tx, tz);
    if (td < 0.2 || td > 3) return;
    const cos = (tx * it.dx + tz * it.dz) / td;
    if (cos < -0.2) return; // quer ir para longe da bola: deixa
    // alvo: um pouco atrás da bola, na direção pedida, para o pé chegar nela
    const ax = b.pos.x - it.dx * CONFIG.dribble.footOffset - p.pos.x;
    const az = b.pos.z - it.dz * CONFIG.dribble.footOffset - p.pos.z;
    const ad = Math.hypot(ax, az) || 1;
    const w = 1.6;
    const nx = it.dx + (ax / ad) * w, nz = it.dz + (az / ad) * w;
    const n = Math.hypot(nx, nz) || 1;
    it.dx = nx / n;
    it.dz = nz / n;
  }

  /** Contato bola × goleiro (com verificação no caminho do passo). */
  keeperContact(gk, prev) {
    const b = this.ball;
    const shapes = keeperShapes(gk);
    for (const s of shapes) {
      for (const f of [0.33, 0.66, 1]) {
        const x = prev.x + (b.pos.x - prev.x) * f, y = prev.y + (b.pos.y - prev.y) * f, z = prev.z + (b.pos.z - prev.z) * f;
        const q = pointSeg(x, y, z, s.ax, s.ay, s.az, s.bx, s.by, s.bz);
        if (q.d < s.r + BR) {
          b.pos.x = x;
          b.pos.y = Math.max(BR, y);
          b.pos.z = z;
          this.save(gk, s.stretch && Math.abs(z - gk.pos.z) > 0.5);
          return true;
        }
      }
    }
    return false;
  }

  /** Resultado da defesa: segurar, espalmar para o lado ou rebote (pior). */
  save(gk, stretch) {
    const b = this.ball;
    const s = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    const ref = att(gk.def.ref);
    const thr = lerp(CONFIG.keeper.catchSpeed[0], CONFIG.keeper.catchSpeed[1], ref);
    const shot = this.lastShot && this.time - this.lastShot.t < 2 && this.lastShot.team !== gk.team;
    if (s < 3.5 && !shot) {
      this.keeperHold(gk);
      return;
    }
    let pCatch = s < thr ? (stretch ? 0.45 : 0.9) : stretch ? 0.05 : 0.25 * ref;
    const fieldDir = -Math.sign(this.ownGoalX(gk.team));
    let kind;
    if (this.rng() < pCatch) {
      kind = 'segurou';
      this.keeperHold(gk);
    } else {
      const pParry = clamp(0.35 + 0.5 * ref - Math.max(0, s - 22) * 0.02, 0.15, 0.9);
      if (this.rng() < pParry) {
        kind = 'espalmou';
        const zs = Math.sign(b.pos.z - gk.pos.z) || this.rng.sign();
        const v = s * 0.35;
        const dx = fieldDir * 0.3, dz = zs * 1, dy = 0.35;
        const n = Math.hypot(dx, dy, dz);
        b.vel.x = (dx / n) * v;
        b.vel.y = (dy / n) * v;
        b.vel.z = (dz / n) * v;
      } else {
        kind = 'rebote';
        const v = s * 0.3;
        const a = (this.rng() * 2 - 1) * 0.7;
        b.vel.x = fieldDir * Math.cos(a) * v;
        b.vel.z = Math.sin(a) * v;
        b.vel.y = 0.8;
      }
      b.spin = 0;
      b.state = BallState.AEREA;
      b.touchDecel = false;
      this.setOwner(null);
      this.touch(gk);
      gk.kickImmune = 0.35;
    }
    if (shot) this.teams[this.lastShot.team].onTarget++;
    this.emit({ type: 'save', player: gk, kind, speed: s });
  }

  keeperHold(gk) {
    const b = this.ball;
    setState(gk, 'hold', 999);
    gk.keeper.holdT = 0;
    gk.keeper.throwAt = this.rng.range(1.0, 2.0);
    gk.keeper.dive = null;
    b.vel.x = b.vel.y = b.vel.z = 0;
    b.spin = 0;
    this.setOwner(gk);
    this.touch(gk);
    b.state = BallState.DOMINADA;
    // I: o humano só controla o goleiro se trocou para ele manualmente
    if (this.controller && gk.team === this.human && this.controller.gkManual) this.controller.takeKeeper(gk);
  }

  // ── eventos da bola: gol, saída, trave, rede ────────────────────────────
  ballEvent(e) {
    this.emit(e);
    if (this.phase !== 'play') return;
    if (e.type === 'goal') {
      const scorer = this.teams.find((t) => t.dir === e.side);
      this.goal(scorer.index, e);
    } else if (e.type === 'out_side') {
      const team = 1 - Math.max(0, this.lastTouchTeam);
      this.stoppage('lateral', team, { x: clamp(e.x, -GEO.halfL + 0.3, GEO.halfL - 0.3), z: e.side * GEO.halfW }, 'Lateral');
    } else if (e.type === 'out_end') {
      const defending = this.teams.find((t) => t.dir === -e.side).index;
      const zs = Math.sign(e.z) || 1;
      if (this.lastTouchTeam === defending) {
        this.stoppage('escanteio', 1 - defending, { x: e.side * GEO.halfL, z: zs * GEO.halfW }, 'Escanteio');
      } else {
        this.stoppage('meta', defending, { x: e.side * (GEO.halfL - 1.5), z: 0 }, 'Tiro de meta');
      }
    }
  }

  goal(teamIndex, e) {
    const t = this.teams[teamIndex];
    t.score++;
    const scorer = this.lastTouch;
    const own = scorer && scorer.team !== teamIndex;
    if (this.lastShot && this.lastShot.team === teamIndex && this.time - this.lastShot.t < 3) t.onTarget++;
    this.phase = 'goal';
    this.phaseT = MT.goalPause;
    this.ball.inPlay = false;
    this.advantage = null;
    this.setOwner(null);
    this.pass = null;
    const conceded = 1 - teamIndex;
    // expulsão: quem sofre o gol volta a ter 5
    if (this.teams[conceded].shortUntil != null) this.endShortHanded(conceded);
    this.emit({ type: 'goalScored', team: teamIndex, scorer, own, x: e.x, z: e.z });
    this.say(own ? `GOL CONTRA! ${t.def.short}` : `GOOOL! ${scorer ? scorer.name : t.def.short}`, 2.4, 'goal');
    this.next = { type: 'kickoff', team: conceded, spot: { x: 0, z: 0 } };
  }

  /** Bola parada: apita, pausa curta e prepara a cobrança. */
  stoppage(type, team, spot, label) {
    this.phase = 'dead';
    this.phaseT = MT.deadBallPause;
    this.ball.inPlay = false;
    this.advantage = null;
    this.setOwner(null);
    this.pass = null;
    this.next = { type, team, spot };
    this.emit({ type: 'whistle', kind: type });
    if (label) this.say(label, 1.2);
    this.applyPendingCards();
  }

  // ── H3. faltas, vantagem e cartões ──────────────────────────────────────
  foul(offender, victim, info) {
    if (this.phase !== 'play') return;
    if (this.advantage) return; // já há uma falta em vantagem
    const dirAtt = this.attackDir(victim.team);
    // direção do contato: por trás é pior
    const ax = victim.pos.x - offender.pos.x, az = victim.pos.z - offender.pos.z;
    const ad = Math.hypot(ax, az) || 1;
    const back = Math.cos(victim.facing) * (ax / ad) + Math.sin(victim.facing) * (az / ad);
    const dirTerm = back > 0.5 ? 0.45 : back > -0.3 ? 0.2 : 0;
    // chance clara de gol: perto do gol, indo para ele, sem defensor no caminho
    const gx = dirAtt * GEO.halfL;
    const gd = Math.hypot(gx - victim.pos.x, victim.pos.z);
    let clear = 0;
    if (gd < 13) {
      let cover = 0;
      for (const o of this.players) {
        if (!o.onCourt || o.team === victim.team || o === offender || o.isGK) continue;
        if ((o.pos.x - victim.pos.x) * dirAtt > 0 && Math.abs(o.pos.z - victim.pos.z) < 4) cover++;
      }
      if (cover === 0) clear = 0.55;
    }
    let sev = (info.speed / 8) * 0.5 + dirTerm + clear + (info.kind === 'slide' ? 0.35 : 0) + this.rng() * 0.3;
    if (info.kind === 'push') sev -= 0.25;
    const thr = DF.severity;
    if (sev < thr.foul) {
      this.emit({ type: 'contact', offender, victim });
      return;
    }
    const card = sev >= thr.red ? 'vermelho' : sev >= thr.yellow ? 'amarelo' : null;
    const spot = { x: clamp(victim.pos.x, -GEO.halfL + 0.5, GEO.halfL - 0.5), z: clamp(victim.pos.z, -GEO.halfW + 0.3, GEO.halfW - 0.3) };
    const rec = { offender, victim, card, spot, sev };
    this.teams[offender.team].fouls++;
    this.emit({ type: 'foul', offender, victim, card, sev, kind: info.kind });
    // lei da vantagem: mantém a posse e o ataque é promissor
    const keeps = (this.owner && this.owner.team === victim.team) || (!this.owner && this.lastTouchTeam === victim.team && this.pass && this.pass.team === victim.team);
    const promising = victim.pos.x * dirAtt > -2;
    if (keeps && promising && !card?.startsWith('v')) {
      this.advantage = { team: victim.team, t: DF.advantageTime, rec };
      if (card) this.pendingCards.push(rec);
      this.emit({ type: 'advantage', team: victim.team });
      this.say('Vantagem!', 1.4, 'advantage');
      return;
    }
    this.whistleFoul(rec);
  }

  whistleFoul(rec) {
    const { offender, card, spot } = rec;
    const defendingSide = Math.sign(this.ownGoalX(offender.team));
    const team = 1 - offender.team;
    let type = 'falta', at = spot, label = 'Falta';
    if (inArea(spot.x, spot.z, defendingSide)) {
      type = 'penalti';
      at = { x: defendingSide * (GEO.halfL - CONFIG.court.penaltySpot), z: 0 };
      label = 'Pênalti!';
    } else if (this.teams[offender.team].fouls > DF.accumulatedLimit) {
      type = 'livre10';
      at = { x: defendingSide * (GEO.halfL - CONFIG.court.tenMeterSpot), z: 0 };
      label = `${this.teams[offender.team].fouls}ª falta: tiro livre sem barreira`;
    }
    if (card) this.pendingCards.push(rec);
    this.stoppage(type, team, at, null);
    this.say(card ? `${label} — cartão ${card}` : label, 1.8, card ? 'card' : 'info');
  }

  handBall(p) {
    this.emit({ type: 'hand', player: p });
    const rec = { offender: p, victim: null, card: null, spot: { x: clamp(p.pos.x, -19.5, 19.5), z: clamp(p.pos.z, -9.7, 9.7) }, sev: 0.3 };
    this.teams[p.team].fouls++;
    this.say('Mão!', 1.2);
    this.whistleFoul(rec);
  }

  updateAdvantage(dt) {
    const a = this.advantage;
    if (!a || this.phase !== 'play') return;
    a.t -= dt;
    if (this.owner && this.owner.team !== a.team) {
      // perdeu a posse logo: volta e marca a falta
      this.advantage = null;
      this.pendingCards = this.pendingCards.filter((r) => r !== a.rec);
      this.whistleFoul(a.rec);
      return;
    }
    if (a.t <= 0) {
      this.advantage = null;
      this.emit({ type: 'advantage_end', team: a.team });
    }
  }

  applyPendingCards() {
    for (const r of this.pendingCards) {
      const p = r.offender;
      if (r.card === 'amarelo') {
        p.yellow++;
        this.emit({ type: 'card', player: p, color: p.yellow >= 2 ? 'vermelho' : 'amarelo' });
        if (p.yellow >= 2) this.sendOff(p);
      } else if (r.card === 'vermelho') {
        this.emit({ type: 'card', player: p, color: 'vermelho' });
        this.sendOff(p);
      }
      this.teams[p.team].cards++;
    }
    this.pendingCards = [];
  }

  sendOff(p) {
    if (p.sentOff) return;
    p.sentOff = true;
    p.onCourt = false;
    if (this.owner === p) this.setOwner(null);
    const t = this.teams[p.team];
    t.shortUntil = this.clock + DF.redCardMinutes * 60;
    this.say(`Expulso: ${p.name}`, 2, 'card');
    if (p.isGK) {
      // um reserva de linha vira goleiro: o goleiro reserva entra no lugar
      const sub = this.players.find((q) => q.team === p.team && !q.onCourt && !q.sentOff && q.isGK);
      const out = this.players.find((q) => q.team === p.team && q.onCourt && !q.isGK);
      if (sub && out) {
        out.onCourt = false;
        sub.onCourt = true;
        sub.pos = { ...p.pos };
        sub.prev = { x: p.pos.x, z: p.pos.z, facing: 0 };
      }
    }
    assignSlots(this, p.team);
    if (this.controller && this.controller.cp === p) this.controller.autoSwitch(true);
  }

  endShortHanded(team) {
    const t = this.teams[team];
    t.shortUntil = null;
    const sub = this.freshestBench(team, null);
    if (sub && this.onCourt(team).length < 5) {
      sub.onCourt = true;
      this.placeAtSubZone(sub);
      assignSlots(this, team);
      this.emit({ type: 'sub', in: sub, out: null, team });
    }
  }

  // ── substituições (D3: banco recupera rápido) ───────────────────────────
  benchRecover(dt) {
    for (const p of this.players) {
      if (!p.onCourt && !p.sentOff) p.stamina = Math.min(100, p.stamina + CONFIG.player.stamina.benchRecover * dt);
    }
  }

  freshestBench(team, role) {
    let best = null;
    for (const p of this.players) {
      if (p.team !== team || p.onCourt || p.sentOff || p.isGK) continue;
      const score = p.stamina + (role && p.role === role ? 15 : 0);
      if (!best || score > best.score) best = { p, score };
    }
    return best ? best.p : null;
  }

  /** Troca o mais cansado pelo reserva mais descansado. */
  substitute(team, out = null) {
    const field = this.players.filter((p) => p.team === team && p.onCourt && !p.isGK);
    if (!out) out = field.reduce((a, b) => (b.stamina < a.stamina ? b : a), field[0]);
    if (!out) return false;
    const inn = this.freshestBench(team, out.role);
    if (!inn || inn.stamina < out.stamina + 10) return false;
    if (this.owner === out) this.setOwner(null);
    out.onCourt = false;
    inn.onCourt = true;
    inn.state = 'normal';
    inn.yellow = inn.yellow || 0;
    if (this.phase === 'play') this.placeAtSubZone(inn);
    else {
      inn.pos = { ...out.pos };
      inn.facing = out.facing;
    }
    inn.vel = { x: 0, z: 0 };
    inn.speed = 0;
    inn.prev = { x: inn.pos.x, z: inn.pos.z, facing: inn.facing };
    inn.ai = makeAiState();
    assignSlots(this, team);
    if (this.controller && this.controller.cp === out) this.controller.cp = inn;
    this.emit({ type: 'sub', in: inn, out, team });
    this.say(`Substituição ${this.teams[team].def.short}: sai ${out.name}, entra ${inn.name}`, 1.8);
    return true;
  }

  placeAtSubZone(p) {
    const side = Math.sign(this.ownGoalX(p.team));
    p.pos = { x: side * (CONFIG.court.subZoneX - 1.2), z: -GEO.halfW - 0.2 };
    p.facing = Math.PI / 2;
    p.vel = { x: 0, z: 0 };
    p.speed = 0;
    p.prev = { x: p.pos.x, z: p.pos.z, facing: p.facing };
  }

  autoSubs() {
    for (const t of this.teams) {
      if (t.index === this.human && !t.autoSub) continue;
      for (let i = 0; i < 2; i++) {
        const tired = this.players.find((p) => p.team === t.index && p.onCourt && !p.isGK && p.stamina < 40);
        if (!tired || !this.substitute(t.index, tired)) break;
      }
    }
  }

  // ── cobranças ───────────────────────────────────────────────────────────
  setupRestart(type, team, spot) {
    const b = this.ball;
    const dir = this.attackDir(team);
    this.applyPendingCards();
    if (type !== 'kickoff') this.autoSubs();
    b.pos = { x: spot.x, y: BR, z: spot.z };
    b.vel = { x: 0, y: 0, z: 0 };
    b.spin = 0;
    b.state = BallState.MORTA;
    b.inPlay = false;
    b.touchDecel = false;
    this.setOwner(null);
    this.pass = null;
    this.advantage = null;
    this.penaltyKick = type === 'penalti' || type === 'livre10';

    const mine = this.players.filter((p) => p.team === team && p.onCourt);
    let field = mine.filter((p) => !p.isGK);
    if (!field.length) field = mine;
    let taker;
    if (type === 'meta') taker = mine.find((p) => p.isGK) || field[0];
    else if (type === 'penalti' || type === 'livre10' || (type === 'falta' && Math.abs(spot.x - dir * GEO.halfL) < 13)) {
      taker = field.reduce((a, p) => (p.def.fin > a.def.fin ? p : a), field[0]);
    } else {
      taker = field.reduce((a, p) => (Math.hypot(p.pos.x - spot.x, p.pos.z - spot.z) < Math.hypot(a.pos.x - spot.x, a.pos.z - spot.z) ? p : a), field[0]);
    }
    // para onde o cobrador olha
    let face;
    if (type === 'lateral') face = Math.atan2(-Math.sign(spot.z) * 6, dir * 4);
    else if (type === 'escanteio') face = Math.atan2(-spot.z * 0.6, -spot.x * 0.35);
    else if (type === 'meta') face = Math.atan2(0, dir);
    else if (type === 'kickoff') face = Math.atan2(1, -dir * 0.3);
    else face = Math.atan2(-spot.z, dir * GEO.halfL - spot.x);

    // todos se reposicionam (corte rápido, como na TV)
    for (const p of this.players) {
      if (!p.onCourt) continue;
      p.state = 'normal';
      p.stateT = 0;
      p.speed = 0;
      p.vel = { x: 0, z: 0 };
      p.shield = false;
      p.charge = null;
      p.kickImmune = 0;
      if (p.keeper) {
        p.keeper.dive = null;
        p.keeper.read = null;
      }
      const pd = this.attackDir(p.team);
      let pos;
      if (p === taker) {
        if (type === 'meta') pos = { x: spot.x, z: spot.z };
        else pos = { x: spot.x - Math.cos(face) * 0.55, z: spot.z - Math.sin(face) * 0.55 };
      } else if (p.isGK) {
        pos = { x: this.ownGoalX(p.team) - pd * 0.6, z: 0 };
      } else if (type === 'kickoff') {
        pos = shapeTarget(this, p, p.team === team);
        pos.x = pd > 0 ? Math.min(pos.x, -1) : Math.max(pos.x, 1);
        if (p.team === team && p.slot === 3) pos = { x: -pd * 0.4, z: 1.5 }; // parceiro da saída
      } else if (type === 'penalti' || type === 'livre10') {
        // todos atrás da bola, a 5 m
        const k = this.players.filter((q) => q.onCourt && !q.isGK && q !== taker).indexOf(p);
        pos = { x: spot.x - dir * (CONFIG.match.restartDistance + 1 + (k % 2) * 1.2), z: -6 + k * 1.8 };
      } else {
        pos = shapeTarget(this, p, p.team === team);
      }
      p.pos = { x: clamp(pos.x, -GEO.halfL + 0.4, GEO.halfL - 0.4), z: clamp(pos.z, -GEO.halfW + 0.4, GEO.halfW - 0.4) };
      if (p === taker && (type === 'lateral' || type === 'escanteio')) p.pos = { x: pos.x, z: pos.z };
      p.facing = p === taker ? face : Math.atan2(spot.z - p.pos.z, spot.x - p.pos.x);
      p.prev = { x: p.pos.x, z: p.pos.z, facing: p.facing };
      p.ai.target = null;
    }
    if (type === 'penalti' || type === 'livre10') {
      // goleiro escolhe um lado antes da cobrança (e às vezes acerta)
      const gk = this.keeperOf(1 - team);
      if (gk) gk.keeper.guess = this.rng.sign();
    }
    if (type === 'meta' && taker.isGK) {
      setState(taker, 'hold', 999);
      taker.keeper.holdT = 0;
      taker.keeper.throwAt = this.rng.range(0.8, 1.6);
      this.owner = taker;
    }
    this.restart = {
      type,
      team,
      taker,
      spot: { ...spot },
      t: 0,
      limit: type === 'kickoff' || type === 'penalti' ? Infinity : MT.restartLimit,
      aiAt: this.rng.range(MT.aiRestartDelay[0], MT.aiRestartDelay[1]) + (type === 'penalti' ? 0.6 : 0),
    };
    this.phase = 'restart';
    this.keepRestartDistance();
    for (const p of this.players) p.prev = { x: p.pos.x, z: p.pos.z, facing: p.facing };
    this.emit({ type: 'snap' });
    this.emit({ type: 'restart', kind: type, team });
    if (this.controller) this.controller.onRestart(this.restart);
  }

  /** Mantém o cobrador parado e o adversário longe da bola. */
  restartConstraints() {
    if (this.phase !== 'restart' || !this.restart) return;
    const tk = this.restart.taker;
    if (tk.isGK && this.restart.type === 'meta') return;
    tk.intent.mag = 0;
    tk.intent.sprint = false;
  }

  keepRestartDistance() {
    if (this.phase !== 'restart' || !this.restart) return;
    const r = this.restart;
    const s = r.spot;
    const minD = r.type === 'kickoff' ? 3 : MT.restartDistance;
    for (const p of this.players) {
      if (!p.onCourt || p.team === r.team || p.isGK) continue;
      const dx = p.pos.x - s.x, dz = p.pos.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < minD) {
        const a = d > 0.01 ? Math.atan2(dz, dx) : Math.atan2(0, -this.attackDir(r.team));
        p.pos.x = s.x + Math.cos(a) * minD;
        p.pos.z = s.z + Math.sin(a) * minD;
      }
      if (r.type === 'kickoff') {
        const pd = this.attackDir(p.team);
        if (p.pos.x * pd > -0.3) p.pos.x = -pd * 0.3;
      }
    }
  }

  holdRestartBall() {
    const r = this.restart;
    const b = this.ball;
    if (r && r.type === 'meta' && r.taker.isGK) {
      const g = r.taker;
      b.pos = { x: g.pos.x + Math.cos(g.facing) * 0.28, y: 1.05, z: g.pos.z + Math.sin(g.facing) * 0.28 };
    }
    b.vel = { x: 0, y: 0, z: 0 };
  }

  beginPlay() {
    this.phase = 'play';
    this.ball.inPlay = true;
    if (this.ball.state === BallState.MORTA) this.ball.state = this.ball.pos.y > BR + 1e-3 ? BallState.AEREA : BallState.RASTEIRA;
    this.restart = null;
    this.emit({ type: 'play' });
  }

  aiRestart(dt) {
    const r = this.restart;
    r.t += dt;
    const tk = r.taker;
    const humanTakes = this.controller && r.team === this.human && this.controller.cp === tk;
    if (r.t > r.limit) {
      // estourou os 4 segundos: bola para o adversário
      this.say('4 segundos!', 1.4);
      const at = { ...r.spot };
      const type = r.type === 'lateral' ? 'lateral' : 'falta';
      if (type === 'falta' && inArea(at.x, at.z, Math.sign(this.ownGoalX(1 - r.team)))) at.x -= this.attackDir(1 - r.team) * 7;
      this.setupRestart(type, 1 - r.team, at);
      return;
    }
    if (humanTakes || r.t < r.aiAt) return;
    const dir = this.attackDir(r.team);
    if (r.type === 'meta' && tk.isGK) {
      keeperThrow(this, tk, this.rng() < 0.35, null);
      return;
    }
    const gd = Math.hypot(dir * GEO.halfL - r.spot.x, r.spot.z);
    if (r.type === 'penalti' || r.type === 'livre10' || (r.type === 'falta' && gd < 11 && this.rng() < 0.7)) {
      const side = this.rng.sign();
      const kinds = ['normal', 'normal', 'placed', 'toe'];
      doShoot(this, tk, { kind: kinds[Math.floor(this.rng() * 4)], power: this.rng.range(0.75, 1), dir: Math.atan2(side * 0.8, dir) });
      return;
    }
    doPass(this, tk, { kind: r.type === 'escanteio' && this.rng() < 0.3 ? 'lob' : 'ground', power: 0.35, dir: null });
  }

  // ── fases e relógio ─────────────────────────────────────────────────────
  updatePhase(dt) {
    switch (this.phase) {
      case 'restart':
        this.aiRestart(dt);
        break;
      case 'dead':
      case 'goal':
        this.phaseT -= dt;
        if (this.phaseT <= 0) {
          const n = this.next;
          this.next = null;
          this.setupRestart(n.type, n.team, n.spot);
        }
        break;
      case 'play': {
        // cronometrado: só corre com a bola em jogo
        this.clock += dt;
        for (const t of this.teams) if (t.shortUntil != null && this.clock >= t.shortUntil) this.endShortHanded(t.index);
        if (this.clock >= this.halfLen) this.endHalf();
        break;
      }
    }
  }

  endHalf() {
    this.emit({ type: 'whistle', kind: 'end' });
    this.applyPendingCards();
    if (this.half === 1) {
      this.phase = 'halftime';
      this.phaseT = 3.5;
      this.say('Fim do 1º tempo', 3, 'info');
    } else {
      this.phase = 'end';
      this.say('Fim de jogo', 99, 'info');
      this.emit({ type: 'end' });
    }
  }

  startSecondHalf() {
    this.half = 2;
    this.clock = 0;
    for (const t of this.teams) {
      t.dir *= -1;
      t.fouls = 0; // faltas acumuladas zeram no 2º tempo
      if (t.shortUntil != null) t.shortUntil = Math.max(0, t.shortUntil - this.halfLen);
    }
    if (this.venue.wind) this.rollWind();
    if (this.venue.sweat2nd) this.say('2º tempo: piso escorregadio', 2.2, 'info');
    this.autoSubs();
    this.setupRestart('kickoff', 1, { x: 0, z: 0 });
  }

  housekeeping(dt) {
    const b = this.ball;
    if (this.phase === 'play' || this.phase === 'dead') {
      if (this.owner) this.teams[this.owner.team].possession += dt;
    }
    if (this.owner && !this.owner.isGK) {
      const d = Math.hypot(b.pos.x - this.owner.pos.x, b.pos.z - this.owner.pos.z);
      if (b.pos.y < 0.3 && d < 2.2 && this.phase === 'play') b.state = BallState.DOMINADA;
      else if (b.state === BallState.DOMINADA) b.state = b.pos.y > BR + 1e-3 ? BallState.AEREA : BallState.RASTEIRA;
    } else if (!this.owner && b.state === BallState.DOMINADA) {
      b.state = b.pos.y > BR + 1e-3 ? BallState.AEREA : BallState.RASTEIRA;
    }
    if (this.phase === 'restart' || this.phase === 'dead' || this.phase === 'goal') {
      if (this.phase === 'restart') b.state = BallState.MORTA;
    }
    // goleiro segurando: limite de 4 s, e a IA repõe antes
    for (const gk of this.players) {
      if (!gk.isGK || gk.state !== 'hold' || this.phase !== 'play') continue;
      const human = this.isHumanControlled(gk);
      if (!human && gk.keeper.holdT > gk.keeper.throwAt) keeperThrow(this, gk, this.rng() < 0.4, null);
      else if (gk.keeper.holdT > CONFIG.keeper.holdLimit) {
        gk.state = 'normal';
        const side = Math.sign(this.ownGoalX(gk.team));
        this.say('Goleiro: 4 segundos!', 1.4);
        this.stoppage('falta', 1 - gk.team, { x: side * (GEO.halfL - 7), z: clamp(gk.pos.z, -5, 5) }, null);
      }
    }
    // goleiro não sai da quadra segurando a bola
    for (const gk of this.players) {
      if (gk.isGK && gk.state === 'hold') gk.pos.x = clamp(gk.pos.x, -GEO.halfL + 0.4, GEO.halfL - 0.4);
    }
    this.benchRecover(dt);
    if (this.pass) this.pass.t += dt;
    if (this.pass && this.pass.t > 4) this.pass = null;
  }
}
