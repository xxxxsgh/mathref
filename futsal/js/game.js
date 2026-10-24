// Partida de futsal: entidades, ações (passe, chute, drible, desarme...),
// regras oficiais (laterais com o pé, tiro de meta com a mão, 4 segundos,
// faltas acumuladas, cartões, pênaltis) e máquina de estados.
import { Ball, COURT, inArea, sampleBallPath } from './physics.js';
import { TeamAI, DIFF, gkSaveCheck } from './ai.js';
import { clamp, lerp, len2, dist2, angDiff, turnTowards, rand, chance, pick, distPointSeg } from './util.js';
import { colorDist, pickKits } from './data.js';

const { HL, HW, BALL_R: R, GOAL_W } = COURT;
const G = 9.81;
const GK_KITS = [
  { shirt: '#a3e635', shirt2: '#14532d', pattern: 'liso', shorts: '#14532d', socks: '#a3e635' },
  { shirt: '#f472b6', shirt2: '#500724', pattern: 'liso', shorts: '#500724', socks: '#f472b6' },
  { shirt: '#fb923c', shirt2: '#431407', pattern: 'liso', shorts: '#111827', socks: '#fb923c' },
  { shirt: '#22d3ee', shirt2: '#083344', pattern: 'liso', shorts: '#083344', socks: '#22d3ee' },
  { shirt: '#111827', shirt2: '#facc15', pattern: 'liso', shorts: '#111827', socks: '#111827' },
];

export const RESTART_NAMES = {
  kickoff: 'SAÍDA DE BOLA', lateral: 'TIRO LATERAL', escanteio: 'ESCANTEIO', meta: 'TIRO DE META',
  livre: 'TIRO LIVRE', livre6: 'TIRO LIVRE SEM BARREIRA', indireto: 'TIRO LIVRE INDIRETO', penalti: 'PÊNALTI',
};

function newStats() {
  return { goals: 0, shots: 0, onTarget: 0, fouls: 0, yellows: 0, reds: 0, poss: 0, passes: 0, passOk: 0, saves: 0 };
}

export class Match {
  // cfg: { home, away, homeKit, awayKit, gym, halfLen, difficulty, humans: [{team, ctrl}],
  //        knockout, extraTime, mode, penaltiesOnly }
  constructor(cfg, settings) {
    this.cfg = cfg;
    this.settings = settings;
    this.ball = new Ball();
    this.listeners = [];
    this.time = 0;
    this.halfLen = cfg.halfLen;
    this.half = 1;
    this.clock = cfg.halfLen;
    this.state = 'intro';
    this.stateT = 0;
    this.paused = false;
    this.ballPath = [];
    this.pathT = 0;
    this.replayBuf = [];
    this.replayT = 0;
    this.goalsLog = [];
    this.cards = [];
    this.restart = null;
    this.pendingPass = null;
    this.lastShot = null;
    this.gkTimer = [0, 0];
    this.slowmo = 1;

    const [hk, ak] = pickKits(cfg.home, cfg.away, cfg.homeKit || 0, cfg.awayKit || 0);
    this.teams = [cfg.home, cfg.away].map((data, idx) => ({
      idx, data, kit: idx === 0 ? hk : ak, dir: idx === 0 ? 1 : -1,
      formation: data.tactic?.formation || '3-1', marking: data.tactic?.marking || 'zona', press: data.tactic?.press || 'normal',
      keeperOut: false, callPress: false,
      score: 0, fouls: 0, stats: newStats(),
      bench: [], short: 0, sentOff: new Set(), yellow: new Set(),
      human: false,
    }));
    this.pickGkKits();

    // 5 por time em quadra; o resto vai para o banco.
    this.players = [];
    for (const t of this.teams) {
      const lineup = (t.data.tactic?.lineup || [0, 1, 2, 3, 4]).map((i) => t.data.players[i]).filter(Boolean);
      const squad = t.data.players;
      let starters = lineup.length === 5 ? lineup : [squad.find((p) => p.role === 'GK'), ...squad.filter((p) => p.role !== 'GK').slice(0, 4)];
      // garante goleiro no slot 0
      const gkIdx = starters.findIndex((p) => p.role === 'GK');
      if (gkIdx > 0) [starters[0], starters[gkIdx]] = [starters[gkIdx], starters[0]];
      t.bench = squad.filter((p) => !starters.includes(p));
      starters.forEach((d, slot) => this.players.push(this.makeEntity(t, d, slot)));
    }

    this.humans = (cfg.humans || []).map((h, k) => ({ ...h, k, player: -1, switchCD: 0, buffer: null, lastDribbleTap: -9, aimAngle: 0 }));
    for (const h of this.humans) this.teams[h.team].human = true;
    this.ai = this.teams.map((t) => {
      let d = cfg.difficulty || 'normal';
      if (t.human) d = ['facil', 'normal'].includes(d) ? 'normal' : d; // companheiros nunca "Fácil"
      return new TeamAI(this, t, DIFF[d] || DIFF.normal);
    });
  }

  pickGkKits() {
    const shirts = this.teams.map((t) => t.data.kits[t.kit].shirt);
    const used = [];
    for (const t of this.teams) {
      let best = null, bestD = -1;
      for (const k of [t.data.gkKit, ...GK_KITS]) {
        if (!k) continue;
        const d = Math.min(...shirts.map((s) => colorDist(s, k.shirt)), ...used.map((u) => colorDist(u, k.shirt)));
        if (d > bestD) { bestD = d; best = k; }
      }
      t.gkKitUse = best;
      used.push(best.shirt);
    }
  }

  makeEntity(team, data, slot) {
    return {
      i: this.players.length, team: team.idx, data, slot, isGK: slot === 0,
      x: 0, z: 0, vx: 0, vz: 0, facing: team.dir > 0 ? 0 : Math.PI, speed: 0,
      onCourt: true, stamina: 1, anim: 'run', animT: 0, state: 'free', stateT: 0,
      touchCD: 0, human: -1, want: { x: 0, z: 0, sprint: false }, guard: 0, knockT: 0.6,
      fallDir: 1, diveSide: 1, diveHigh: false, diveDX: 0, diveDZ: 0, aiT: Math.random(), shield: false,
      minutes: 0, goals: 0, rating: 6,
    };
  }

  kitFor(p) {
    const t = this.teams[p.team];
    return p.isGK ? t.gkKitUse : t.data.kits[t.kit];
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

  team(p) { return this.teams[p.team]; }
  opp(p) { return this.teams[1 - p.team]; }
  courtPlayers(teamIdx) { return this.players.filter((p) => p.team === teamIdx && p.onCourt); }
  gk(teamIdx) { return this.players.find((p) => p.team === teamIdx && p.isGK && p.onCourt); }
  goalX(teamIdx) { return this.teams[teamIdx].dir * HL; }      // gol que o time ATACA
  ownGoalX(teamIdx) { return -this.teams[teamIdx].dir * HL; }  // gol que o time DEFENDE
  holderTeam() { const o = this.ball.owner || this.ball.holder; return o ? o.team : -1; }
  possTeam() { const o = this.ball.owner || this.ball.holder; return o ? o.team : (this.ball.lastTouch ? this.ball.lastTouch.team : -1); }

  attr(p, k) { return (p.data[k] || 50) / 99; }
  maxSpeed(p) {
    const base = 4.7 + this.attr(p, 'vel') * 2.5;
    const st = 0.78 + 0.22 * p.stamina;
    const ai = p.human < 0 ? this.ai[p.team].d.speedMul : 1;
    return base * st * ai;
  }

  // ─── Fluxo da partida ────────────────────────────────────────────────────
  start() {
    if (this.cfg.penaltiesOnly) { this.startShootout(); return; }
    this.setupKickoff(0);
    this.emit('start');
  }

  setState(s) { this.state = s; this.stateT = 0; }

  placeFormation() {
    for (const p of this.players) {
      if (!p.onCourt) continue;
      const t = this.team(p);
      const spots = [[-0.93, 0], [-0.5, 0], [-0.28, -0.55], [-0.28, 0.55], [-0.15, 0]];
      const [u, v] = spots[p.slot];
      p.x = t.dir * u * HL; p.z = v * HW;
      p.vx = p.vz = 0; p.speed = 0; p.state = 'free'; p.anim = p.isGK ? 'ready' : 'run';
      p.facing = t.dir > 0 ? 0 : Math.PI;
    }
  }

  setupKickoff(teamIdx) {
    this.ball.reset(0, 0);
    this.placeFormation();
    const t = this.teams[teamIdx];
    const kicker = this.courtPlayers(teamIdx).find((p) => p.slot === 4) || this.courtPlayers(teamIdx).find((p) => !p.isGK);
    kicker.x = -t.dir * 0.35; kicker.z = 0;
    const mate = this.courtPlayers(teamIdx).find((p) => p.slot === 3 && p !== kicker);
    if (mate) { mate.x = -t.dir * 1.5; mate.z = 2.5; }
    this.restart = { type: 'kickoff', team: teamIdx, x: 0, z: 0, taker: kicker, t: 0, count: false, indirect: false };
    this.ball.lastTouch = null;
    this.giveHumanControl(teamIdx, kicker);
    this.setState('restart');
  }

  // ─── Loop ────────────────────────────────────────────────────────────────
  update(dt, controllers, cam) {
    if (this.paused) return;
    dt *= this.slowmo;
    this.time += dt;
    this.stateT += dt;
    const st = this.state;

    if (st === 'intro') { if (this.stateT > 0.1) this.start(); return; }
    if (st === 'halftime' || st === 'fulltime' || st === 'replay') return;

    this.pathT -= dt;
    if (this.pathT <= 0) { sampleBallPath(this.ball, this.ballPath); this.pathT = 0.1; }

    this.updateHumans(dt, controllers, cam);
    for (const ai of this.ai) ai.update(dt);
    this.updatePlayers(dt);
    this.updateBall(dt);
    this.updateRules(dt);
    this.record(dt);
  }

  // ─── Jogadores humanos ───────────────────────────────────────────────────
  giveHumanControl(teamIdx, player) {
    const hs = this.humans.filter((h) => h.team === teamIdx);
    if (!hs.length || !player) return;
    if (hs.some((h) => h.player === player.i)) return;
    // quem estava mais perto assume
    let best = hs[0], bd = Infinity;
    for (const h of hs) {
      const cur = this.players[h.player];
      const d = cur ? dist2(cur.x, cur.z, player.x, player.z) : 0;
      if (d < bd) { bd = d; best = h; }
    }
    this.setHuman(best, player);
  }

  setHuman(h, p) {
    const prev = this.players[h.player];
    if (prev) prev.human = -1;
    h.player = p ? p.i : -1;
    if (p) p.human = h.k;
    h.switchCD = 0.35;
  }

  bestSwitchTarget(h) {
    const b = this.ball;
    const taken = new Set(this.humans.filter((o) => o !== h).map((o) => o.player));
    let best = null, bs = Infinity;
    for (const p of this.courtPlayers(h.team)) {
      if (taken.has(p.i) || p.i === h.player) continue;
      if (p.isGK && !this.team(p).keeperOut && !(b.holder === p || b.owner === p)) continue;
      const t = this.team(p);
      // prioriza quem está entre a bola e o próprio gol
      const goalSide = (b.x - p.x) * t.dir > 0 ? 0 : 2;
      const s = dist2(p.x, p.z, b.x, b.z) + goalSide;
      if (s < bs) { bs = s; best = p; }
    }
    return best;
  }

  updateHumans(dt, controllers, cam) {
    for (const h of this.humans) {
      const c = controllers[h.k];
      h.switchCD -= dt;
      if (!c) continue;
      if (h.player < 0 || !this.players[h.player].onCourt) {
        const p = this.bestSwitchTarget(h) || this.courtPlayers(h.team)[1];
        if (p) this.setHuman(h, p);
        else continue;
      }
      let p = this.players[h.player];
      const b = this.ball;
      if (p.isGK && !this.team(p).keeperOut && this.state === 'play' && b.holder !== p && b.owner !== p) {
        const np = this.bestSwitchTarget(h);
        if (np) { this.setHuman(h, np); p = np; }
      }
      // câmera → mundo
      const basis = cam ? cam.inputBasis() : { rx: 1, rz: 0, fx: 0, fz: -1 };
      const mx = basis.rx * c.move.x + basis.fx * c.move.y;
      const mz = basis.rz * c.move.x + basis.fz * c.move.y;
      const mag = Math.min(1, len2(mx, mz));
      h.stick = { x: mx, z: mz, mag };

      if (c.pressed.keeper) this.toggleKeeperOut(h.team);

      // cobranças: só mira e chuta/passa
      if (this.state === 'restart') { this.humanRestart(h, p, c, dt); continue; }
      if (this.state !== 'play') { p.want.x = 0; p.want.z = 0; continue; }

      const hasBall = b.owner === p;
      const holding = b.holder === p;
      const sprintHeld = c.down.sprint || (c.down.dribble && c.held.dribble > 0.18 && mag > 0.2);
      p.want.x = mx; p.want.z = mz;
      p.want.sprint = sprintHeld;
      p.shield = hasBall && c.down.dribble && mag < 0.2;

      if (holding) { this.humanGKHold(h, p, c); continue; }

      if (hasBall) {
        if (c.released.pass) {
          const kind = c.down.mod ? 'through' : c.lastHeld.pass >= 0.28 ? 'lob' : 'ground';
          this.passFromStick(p, h, kind);
        } else if (c.released.shoot) {
          const power = clamp(c.lastHeld.shoot / 0.9, 0, 1);
          let kind = 'normal';
          if (c.down.mod) kind = power < 0.3 ? 'chip' : 'curl';
          else if (c.lastHeld.shoot < 0.12) kind = 'toe';
          this.doShot(p, { kind, power: kind === 'toe' ? 0.75 : power, aimZ: this.stickAimZ(p, h) });
        } else if (c.pressed.chapeu) this.doSkill(p, 'chapeu');
        else if (c.pressed.elastico) this.doSkill(p, 'elastico', h.stick);
        else if (c.pressed.pisada) this.doSkill(p, 'pisada', h.stick);
        else if (c.released.dribble && c.lastHeld.dribble < 0.2) {
          const fdot = mag > 0.3 ? (Math.cos(p.facing) * mx + Math.sin(p.facing) * mz) / mag : 0;
          if (this.time - h.lastDribbleTap < 0.32) this.doSkill(p, 'chapeu');
          else if (mag < 0.3) this.doSkill(p, 'pisada', h.stick);
          else if (fdot < -0.5) this.doSkill(p, 'elastico', h.stick);
          else this.doSkill(p, 'finta', h.stick);
          h.lastDribbleTap = this.time;
        }
        h.chargeShoot = c.down.shoot ? clamp(c.held.shoot / 0.9, 0, 1) : 0;
        continue;
      }
      h.chargeShoot = 0;

      // sem a bola
      const ballClose = b.free && dist2(p.x, p.z, b.x, b.z) < 1.3 && b.y < 1.2;
      if (ballClose && (c.pressed.shoot || c.pressed.pass)) {
        // de primeira
        if (c.pressed.shoot) this.doShot(p, { kind: 'normal', power: 0.7, aimZ: this.stickAimZ(p, h), firstTime: true });
        else this.passFromStick(p, h, c.down.mod ? 'through' : 'ground', true);
        continue;
      }
      if (c.pressed.pass || c.pressed.shoot) h.buffer = { type: c.pressed.pass ? 'pass' : 'shoot', t: this.time, mod: c.down.mod };
      const carrier = b.owner && b.owner.team !== p.team ? b.owner : null;
      if (c.pressed.switch) {
        if (carrier && dist2(p.x, p.z, carrier.x, carrier.z) < 1.9) this.doTackle(p);
        else { const t = this.bestSwitchTarget(h); if (t) this.setHuman(h, t); }
      }
      if (c.pressed.pass && (!b.owner || b.owner.team !== p.team) && !ballClose) {
        const t = this.bestSwitchTarget(h); if (t) this.setHuman(h, t);
      }
      if (c.pressed.shoot && !ballClose && !p.isGK) this.doSlide(p);
      this.team(p).callPress = c.down.switch && c.held.switch > 0.35;

      // troca automática
      if (this.settings.autoSwitch && h.switchCD <= 0 && (!b.owner || b.owner.team !== p.team)) {
        const t = this.bestSwitchTarget(h);
        if (t) {
          const dCur = dist2(p.x, p.z, b.x, b.z), dNew = dist2(t.x, t.z, b.x, b.z);
          if (dCur > 5 && dNew < dCur - 3) { this.setHuman(h, t); h.switchCD = 1.0; }
        }
      }
    }
  }

  stickAimZ(p, h) {
    const t = this.team(p);
    const lateral = h.stick.mag > 0.3 ? h.stick.z / h.stick.mag : 0;
    if (Math.abs(lateral) > 0.35) return clamp(lateral * 1.25, -1.25, 1.25);
    // sem direção: canto oposto ao goleiro
    const gk = this.gk(1 - p.team);
    const gz = gk ? gk.z : 0;
    return gz > 0.1 ? -1.0 : gz < -0.1 ? 1.0 : pick([-1, 1]) * 1.0;
  }

  passFromStick(p, h, kind, firstTime = false) {
    const dir = h.stick.mag > 0.25 ? Math.atan2(h.stick.z, h.stick.x) : p.facing;
    const target = this.choosePassTarget(p, dir);
    this.doPass(p, { kind, target, dir, firstTime });
    if (target && target.team === p.team) this.giveHumanControl(p.team, target);
  }

  humanGKHold(h, p, c) {
    // goleiro com a bola na mão: move-se dentro da área e repõe com a mão
    const dir = h.stick.mag > 0.25 ? Math.atan2(h.stick.z, h.stick.x) : p.facing;
    if (c.released.pass || c.released.shoot) {
      const target = this.choosePassTarget(p, dir);
      this.doThrow(p, target, c.released.shoot || (target && dist2(p.x, p.z, target.x, target.z) > 16), dir);
      if (target) this.giveHumanControl(p.team, target);
    }
  }

  humanRestart(h, p, c, dt) {
    const r = this.restart;
    p.want.x = 0; p.want.z = 0;
    if (!r || r.taker !== p || r.t < 0.5) return;
    if (h.stick.mag > 0.3) r.aim = Math.atan2(h.stick.z, h.stick.x);
    if (r.aim == null) r.aim = r.defaultAim ?? p.facing;
    p.facing = r.aim;
    h.chargeShoot = c.down.shoot ? clamp(c.held.shoot / 0.9, 0, 1) : 0;
    if (r.type === 'meta') {
      if (c.released.pass || c.released.shoot) {
        const target = this.choosePassTarget(p, r.aim);
        this.takeRestart(() => this.doThrow(p, target, c.released.shoot, r.aim));
        if (target) this.giveHumanControl(p.team, target);
      }
      return;
    }
    const shotOnly = r.type === 'penalti' || r.type === 'livre6';
    if (c.released.pass && shotOnly) {
      const goalDir = Math.atan2(0 - p.z, this.goalX(p.team) - p.x);
      const aimZ = clamp((angDiff(goalDir, r.aim)) * 4, -1.25, 1.25);
      this.takeRestart(() => this.doShot(p, { kind: 'curl', power: 0.45, aimZ, setPiece: true }));
    } else if (c.released.pass && !shotOnly) {
      const kind = c.down.mod ? 'through' : c.lastHeld.pass >= 0.28 ? 'lob' : 'ground';
      const target = this.choosePassTarget(p, r.aim);
      this.takeRestart(() => this.doPass(p, { kind, target, dir: r.aim }));
      if (target) this.giveHumanControl(p.team, target);
    } else if (c.released.shoot && r.type !== 'kickoff') {
      const power = clamp(c.lastHeld.shoot / 0.9, 0, 1);
      const kind = c.down.mod ? (power < 0.3 ? 'chip' : 'curl') : 'normal';
      const goalDir = Math.atan2(0 - p.z, this.goalX(p.team) - p.x);
      const aimZ = clamp((angDiff(goalDir, r.aim)) * 4, -1.25, 1.25);
      this.takeRestart(() => this.doShot(p, { kind, power, aimZ, setPiece: true }));
    } else if (c.released.shoot && r.type === 'kickoff') {
      const target = this.choosePassTarget(p, r.aim);
      this.takeRestart(() => this.doPass(p, { kind: 'ground', target, dir: r.aim }));
    }
  }

  toggleKeeperOut(teamIdx) {
    const t = this.teams[teamIdx];
    t.keeperOut = !t.keeperOut;
    this.emit('keeperOut', { team: teamIdx, on: t.keeperOut });
  }

  // ─── Ações ───────────────────────────────────────────────────────────────
  choosePassTarget(p, dir) {
    let best = null, bs = Infinity;
    for (const m of this.courtPlayers(p.team)) {
      if (m === p) continue;
      const dx = m.x - p.x, dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) continue;
      const a = Math.abs(angDiff(dir, Math.atan2(dz, dx)));
      if (a > 1.1) continue;
      const s = a * 9 + d * 0.18 + (m.isGK && !this.team(m).keeperOut ? 3 : 0);
      if (s < bs) { bs = s; best = m; }
    }
    return best;
  }

  pressure(p) {
    let m = 9;
    for (const o of this.courtPlayers(1 - p.team)) m = Math.min(m, dist2(o.x, o.z, p.x, p.z));
    return clamp(1 - (m - 0.8) / 2.5, 0, 1);
  }

  release(p) {
    const b = this.ball;
    if (b.owner === p) b.owner = null;
    if (b.holder === p) b.holder = null;
    b.lastTouch = p;
    p.touchCD = 0.3;
  }

  aiErr(p) { return p.human >= 0 ? 0 : this.ai[p.team].d.err; }

  doPass(p, { kind = 'ground', target = null, dir = p.facing, firstTime = false }) {
    const b = this.ball;
    if (!firstTime && b.owner !== p && b.holder !== p) return false;
    const t = this.team(p);
    let tx, tz;
    if (target) {
      const d0 = dist2(p.x, p.z, target.x, target.z);
      const lead = Math.min(1.2, d0 / 13);
      tx = target.x + target.vx * lead * 0.8;
      tz = target.z + target.vz * lead * 0.8;
      if (kind === 'through') {
        const ad = t.dir;
        tx = target.x + ad * 4.5 + target.vx * 0.4;
        tz = target.z * 0.85 + target.vz * 0.4;
        this.ai[p.team].orderRun(target, tx, tz);
      }
    } else {
      const d = kind === 'lob' ? 12 : 9;
      tx = p.x + Math.cos(dir) * d; tz = p.z + Math.sin(dir) * d;
    }
    tx = clamp(tx, -HL + 0.5, HL - 0.5); tz = clamp(tz, -HW + 0.6, HW - 0.6);
    const dx = tx - b.x, dz = tz - b.z;
    const d = Math.max(1, Math.hypot(dx, dz));
    const press = this.pressure(p);
    const sigma = (1 - this.attr(p, 'pas')) * 0.11 + press * 0.04 + this.aiErr(p) * 0.6 + (firstTime ? 0.04 : 0);
    const ang = Math.atan2(dz, dx) + (Math.random() + Math.random() - 1) * sigma;
    let vx, vy, vz;
    if (kind === 'lob') {
      const vh = clamp(5.5 + d * 0.42, 7, 15);
      const T = d / vh * 0.92;
      vy = G * T / 2 + 0.3;
      vx = Math.cos(ang) * vh; vz = Math.sin(ang) * vh;
    } else {
      const a = 2.4;
      const v0 = clamp(Math.sqrt(6 * 6 + 2 * a * d) * (1 + (Math.random() - 0.5) * sigma), 8, 20);
      vx = Math.cos(ang) * v0; vz = Math.sin(ang) * v0;
      vy = d > 14 ? 1.2 : 0.2;
    }
    this.release(p);
    b.kick(vx, vy, vz, 0);
    b.y = Math.max(b.y, R);
    this.pendingPass = target ? { from: p, to: target, t: this.time } : null;
    p.state = 'pass'; p.stateT = 0.22; p.anim = 'pass'; p.animT = 0;
    p.facing = ang;
    t.stats.passes++;
    this.emit('kick', { power: Math.hypot(vx, vz) / 25, kind: 'pass' });
    return true;
  }

  doShot(p, { kind = 'normal', power = 0.7, aimZ = 0, firstTime = false, setPiece = false }) {
    const b = this.ball;
    if (!firstTime && b.owner !== p && b.holder !== p) return false;
    const t = this.team(p);
    const gx = this.goalX(p.team);
    const dx = gx - b.x;
    const fin = this.attr(p, 'fin');
    const press = firstTime ? 0.4 : this.pressure(p);
    const dist = Math.hypot(dx, aimZ - b.z);
    const moving = p.speed > 5 ? 0.18 : p.speed > 3 ? 0.08 : 0;
    let sZ = (0.18 + (1 - fin) * 0.9 + press * 0.4 + moving + this.aiErr(p) * 2.2) * clamp(dist / 11, 0.45, 1.9);
    let sY = 0.06 + (1 - fin) * 0.35 + press * 0.15 + moving * 0.6 + this.aiErr(p) * 0.8;
    let speed, aimY, spin = 0;
    switch (kind) {
      case 'curl': speed = (14 + power * 9) * (0.85 + 0.15 * fin); aimY = 0.6 + power * 0.6; sZ *= 0.6; sY *= 0.7; break;
      case 'chip': speed = clamp(dist * 0.7, 6, 12); aimY = 1.75; sZ *= 0.8; break;
      case 'toe': speed = 18 + fin * 5; aimY = 0.35; sZ *= 1.4; sY *= 1.2; break;
      default: speed = (12 + power * 16) * (0.75 + 0.25 * fin); aimY = 0.25 + power * 1.05 + (power > 0.9 ? (power - 0.9) * 9 : 0);
    }
    const tz = clamp(aimZ + (Math.random() + Math.random() - 1) * sZ, -3, 3);
    const ty = Math.max(0.12, aimY + (Math.random() + Math.random() - 1) * sY);
    const tdx = gx - b.x, tdz = tz - b.z;
    const d = Math.hypot(tdx, tdz);
    let ang = Math.atan2(tdz, tdx);
    if (kind === 'curl') {
      const delta = 0.13 * Math.sign(tz - b.z || 1) * -1;
      ang += delta;
      spin = -2 * delta * speed / Math.max(4, d) * 1.1;
    }
    const tt = d / speed * 1.06;
    let vy = (ty + 0.15 - b.y) / tt + 0.5 * G * tt;
    if (kind === 'normal' && power < 0.35) vy = Math.min(vy, 1.2);
    this.release(p);
    b.kick(Math.cos(ang) * speed, Math.max(0, vy), Math.sin(ang) * speed, spin);
    p.state = 'kick'; p.stateT = 0.32; p.anim = 'kick'; p.animT = 0;
    p.facing = ang;
    this.pendingPass = null;
    t.stats.shots++;
    sampleBallPath(b, this.ballPath);
    let onTarget = false;
    for (const s of this.ballPath) {
      if (Math.abs(s.x) >= HL) { onTarget = Math.abs(s.z) < GOAL_W / 2 && s.y < 2; break; }
    }
    if (onTarget) t.stats.onTarget++;
    const penalty = setPiece && !!this.restart && (this.restart.type === 'penalti' || this.restart.type === 'livre6');
    this.lastShot = { team: p.team, by: p, t: this.time, onTarget, setPiece, penalty, aimZ: tz };
    this.emit('kick', { power: speed / 28, kind: 'shot' });
    this.emit('shot', { team: p.team, onTarget, dist });
    return true;
  }

  doThrow(p, target, long, dir) {
    const b = this.ball;
    if (b.holder !== p) return false;
    const rep = this.attr(p, 'rep');
    let tx, tz;
    if (target) { tx = target.x + target.vx * 0.5; tz = target.z + target.vz * 0.5; }
    else { tx = p.x + Math.cos(dir) * 12; tz = p.z + Math.sin(dir) * 12; }
    const dx = tx - p.x, dz = tz - p.z, d = Math.max(2, Math.hypot(dx, dz));
    const sigma = (1 - rep) * 0.12 + this.aiErr(p) * 0.5;
    const ang = Math.atan2(dz, dx) + (Math.random() - 0.5) * sigma * 2;
    let vh, vy;
    if (long || d > 18) { vh = clamp(7 + d * 0.38, 9, 17); const T = d / vh * 0.9; vy = G * T / 2; }
    else { vh = clamp(Math.sqrt(36 + 5 * d), 8.5, 16); vy = 0.8; }
    this.release(p);
    b.x = p.x + Math.cos(ang) * 0.5; b.z = p.z + Math.sin(ang) * 0.5; b.y = 1.2;
    b.kick(Math.cos(ang) * vh, vy, Math.sin(ang) * vh);
    p.state = 'throw'; p.stateT = 0.35; p.anim = 'throw'; p.animT = 0; p.facing = ang;
    this.pendingPass = target ? { from: p, to: target, t: this.time } : null;
    this.emit('kick', { power: 0.3, kind: 'throw' });
    return true;
  }

  doTackle(p) {
    if (p.state !== 'free') return;
    p.state = 'tackle'; p.stateT = 0.32; p.anim = 'tackle'; p.animT = 0; p.tackleDone = false;
    const c = this.ball.owner;
    if (c && c.team !== p.team) p.facing = Math.atan2(this.ball.z - p.z, this.ball.x - p.x);
    // bote com um passo à frente
    p.vx = Math.cos(p.facing) * 4.5; p.vz = Math.sin(p.facing) * 4.5;
  }

  doSlide(p) {
    if (p.state !== 'free' || p.isGK) return;
    p.state = 'slide'; p.stateT = 0.65; p.anim = 'slide'; p.animT = 0; p.slideHit = false;
    const sp = Math.max(6.5, p.speed + 1.5);
    p.vx = Math.cos(p.facing) * sp; p.vz = Math.sin(p.facing) * sp;
    p.stamina = Math.max(0, p.stamina - 0.04);
    this.emit('slide', { x: p.x, z: p.z });
  }

  doSkill(p, kind, stick) {
    const b = this.ball;
    if (b.owner !== p || p.state !== 'free' || this.time < (p.skillReady || 0)) return;
    const dri = this.attr(p, 'dri');
    // repetir o drible em sequência deixa de enganar o marcador
    const spam = this.time - (p.lastSkill || -9) < 1.6;
    p.lastSkill = this.time;
    p.skillReady = this.time + 0.55;
    p.state = 'skill'; p.stateT = 0.32; p.anim = 'skill'; p.animT = 0;
    p.guard = spam ? 0 : 0.35 + dri * 0.25;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    if (kind === 'chapeu') {
      // bola por cima do marcador
      this.release(p);
      p.touchCD = 0.05;
      b.kick(fx * (p.speed * 0.6 + 3.2), 4.3, fz * (p.speed * 0.6 + 3.2));
      b.lastTouch = p;
      if (!spam) p.guard = 0.6;
      this.emit('skill', { kind: 'Chapéu' });
    } else if (kind === 'elastico') {
      // corte lateral rápido mantendo a bola
      const side = stick && stick.mag > 0.3 ? Math.sign(-fz * stick.x + fx * stick.z) || 1 : (Math.random() < 0.5 ? -1 : 1);
      const nx = -fz * side, nz = fx * side;
      p.vx = nx * 6 + fx * 2; p.vz = nz * 6 + fz * 2;
      p.facing = Math.atan2(p.vz, p.vx);
      this.emit('skill', { kind: 'Elástico' });
    } else if (kind === 'pisada') {
      // pisa na bola e muda de direção (para trás ou para o lado do direcional)
      const nd = stick && stick.mag > 0.3 ? Math.atan2(stick.z, stick.x) : p.facing + Math.PI;
      p.facing = nd; p.vx *= 0.2; p.vz *= 0.2;
      if (!spam) p.guard = 0.4 + dri * 0.2;
      this.emit('skill', { kind: 'Pisada' });
    } else {
      // finta: arrancada curta para o lado
      const nd = stick && stick.mag > 0.3 ? Math.atan2(stick.z, stick.x) : p.facing;
      const side = Math.sign(angDiff(p.facing, nd)) || (Math.random() < 0.5 ? -1 : 1);
      const a = p.facing + side * 0.75;
      p.vx = Math.cos(a) * (p.speed + 2.2); p.vz = Math.sin(a) * (p.speed + 2.2);
      p.facing = a;
      if (!spam) p.guard = 0.25 + dri * 0.3;
    }
  }

  // ─── Física dos jogadores ────────────────────────────────────────────────
  updatePlayers(dt) {
    const b = this.ball;
    for (const p of this.players) {
      if (!p.onCourt) continue;
      p.animT += dt;
      p.touchCD = Math.max(0, p.touchCD - dt);
      p.guard = Math.max(0, p.guard - dt);
      if (p.state !== 'free') {
        p.stateT -= dt;
        if (p.state === 'tackle' && !p.tackleDone && p.stateT < 0.2) { p.tackleDone = true; this.resolveTackle(p); }
        if (p.state === 'slide') this.resolveSlide(p, dt);
        if (p.stateT <= 0) {
          if (p.state === 'slide') { p.state = 'getup'; p.stateT = 0.4; p.anim = 'fall'; p.fallDir = -1; p.animT = 0.35; }
          else if (p.state === 'fall') { p.state = 'getup'; p.stateT = 0.35; }
          else if (p.state === 'dive') { p.state = 'getup'; p.stateT = 0.45; p.anim = 'dive'; }
          else { p.state = 'free'; p.anim = p.isGK && !this.team(p).keeperOut ? 'ready' : 'run'; }
        }
      }
      const moving = p.state === 'free' || p.state === 'pass' || p.state === 'kick' || p.state === 'skill' || p.state === 'throw';
      if (p.state === 'free') {
        if (b.holder === p) p.anim = 'hold';
        else if (this.state === 'goal') p.anim = this.goalTeam === p.team ? 'celebrate' : 'sad';
        else if (p.shield && b.owner === p) p.anim = 'shield';
        else p.anim = p.isGK && !this.team(p).keeperOut && b.owner !== p ? 'ready' : 'run';
      }

      if (moving) {
        let wx = p.want.x, wz = p.want.z;
        const wm = Math.hypot(wx, wz);
        if (wm > 1) { wx /= wm; wz /= wm; }
        const canSprint = p.want.sprint && p.stamina > 0.05 && wm > 0.3;
        let max = this.maxSpeed(p) * (canSprint ? 1.22 : 0.86);
        if (b.owner === p) max *= p.shield ? 0.45 : 0.92;
        if (b.holder === p) max *= 0.6;
        if (p.state === 'kick' || p.state === 'pass' || p.state === 'throw') max *= 0.4;
        if (this.state === 'restart' && this.restart?.taker === p) max = 0;
        const tvx = wx * max, tvz = wz * max;
        const acc = (p.state === 'skill' ? 4 : wm > 0.1 ? 16 : 22) * dt;
        const dvx = tvx - p.vx, dvz = tvz - p.vz;
        const dl = Math.hypot(dvx, dvz);
        if (dl > acc) { p.vx += (dvx / dl) * acc; p.vz += (dvz / dl) * acc; } else { p.vx = tvx; p.vz = tvz; }
        // fôlego
        const fol = this.attr(p, 'fol');
        if (canSprint && p.speed > 4) p.stamina = Math.max(0, p.stamina - dt * (0.05 - fol * 0.025));
        else p.stamina = Math.min(1, p.stamina + dt * (0.012 + fol * 0.01) * (p.speed < 2 ? 2 : 1));
        // direção
        if (wm > 0.15 && p.state !== 'skill') {
          const target = Math.atan2(wz, wx);
          const rate = (b.owner === p ? 7 : 11) * dt;
          p.facing = turnTowards(p.facing, target, rate);
        }
      } else if (p.state === 'slide') {
        const k = Math.exp(-2.2 * dt);
        p.vx *= k; p.vz *= k;
        if (Math.random() < 0.5) this.emit('dust', { x: p.x, z: p.z });
      } else if (p.state === 'dive') {
        p.vx = p.diveDX; p.vz = p.diveDZ;
        p.diveDX *= Math.exp(-3 * dt); p.diveDZ *= Math.exp(-3 * dt);
      } else {
        p.vx *= Math.exp(-8 * dt); p.vz *= Math.exp(-8 * dt);
      }
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.speed = Math.hypot(p.vx, p.vz);
      p.x = clamp(p.x, -HL - 1.5, HL + 1.5);
      p.z = clamp(p.z, -HW - 1.6, HW + 1.6);
      // goleiro com a bola na mão não sai da área
      if (b.holder === p && !inArea(p.x, p.z, -this.team(p).dir, -0.3)) {
        const gx = this.ownGoalX(p.team);
        const dx = p.x - gx, dz = p.z;
        const d = Math.hypot(dx, dz) || 1;
        const lim = 5.6;
        if (d > lim) { p.x = gx + dx / d * lim; p.z = dz / d * lim; }
      }
      if (p.isGK) {
        // goleiro não entra no gol
        if (Math.abs(p.x) > HL - 0.2 && Math.abs(p.z) < GOAL_W / 2 + 0.3) p.x = Math.sign(p.x) * (HL - 0.2);
      }
    }
    // separação entre jogadores
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (!a.onCourt) continue;
      for (let j = i + 1; j < ps.length; j++) {
        const c = ps[j];
        if (!c.onCourt) continue;
        const dx = c.x - a.x, dz = c.z - a.z;
        const d2 = dx * dx + dz * dz;
        const min = 0.62;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * push; a.z -= nz * push; c.x += nx * push; c.z += nz * push;
        }
      }
    }
    // minutos jogados
    if (this.state === 'play') for (const p of ps) if (p.onCourt) p.minutes += dt;
  }

  resolveTackle(p) {
    const b = this.ball;
    const c = b.owner;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    const bx = b.x - p.x, bz = b.z - p.z;
    const bd = Math.hypot(bx, bz);
    if (b.free && bd < 1.3 && b.y < 0.6) {
      b.kick(fx * 4 + b.vx * 0.2, 0.3, fz * 4 + b.vz * 0.2);
      b.lastTouch = p;
      return;
    }
    if (!c || c.team === p.team || bd > 1.45) return;
    if ((fx * bx + fz * bz) / (bd || 1) < 0.35) return; // fora do cone
    const behind = Math.cos(c.facing) * (p.x - c.x) + Math.sin(c.facing) * (p.z - c.z) < -0.3;
    const mar = this.attr(p, 'mar'), dri = this.attr(c, 'dri');
    let pWin = 0.42 + (mar - dri) * 0.7 - (c.guard > 0 ? 0.45 : 0) - (c.shield ? 0.18 : 0);
    if (p.human < 0) pWin += this.ai[p.team].d.tackle - 0.45;
    let pFoul = behind ? 0.4 : 0.05 + (1 - mar) * 0.1;
    if (c.guard > 0) pFoul += 0.1;
    const r = Math.random();
    if (r < pFoul) { this.foul(p, c, 'tackle'); return; }
    if (Math.random() < pWin) {
      this.release(c);
      c.touchCD = 0.5;
      b.kick(fx * 3.5 + (Math.random() - 0.5), 0, fz * 3.5 + (Math.random() - 0.5));
      b.lastTouch = p;
      p.touchCD = 0;
      this.emit('tackle', { ok: true });
    } else {
      p.state = 'getup'; p.stateT = 0.35;
      this.emit('tackle', { ok: false });
    }
  }

  resolveSlide(p) {
    if (p.slideHit) return;
    const b = this.ball;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    const footX = p.x + fx * 0.7, footZ = p.z + fz * 0.7;
    const owner = b.owner;
    const ballHit = dist2(footX, footZ, b.x, b.z) < 0.85 && b.y < 0.6 && !b.holder;
    if (ballHit) {
      p.slideHit = true;
      if (owner && owner.team !== p.team) {
        const behind = Math.cos(owner.facing) * (p.x - owner.x) + Math.sin(owner.facing) * (p.z - owner.z) < -0.4;
        const mar = this.attr(p, 'mar');
        const clean = behind ? 0.15 : 0.45 + mar * 0.35 - (owner.guard > 0 ? 0.25 : 0);
        if (Math.random() > clean) { this.foul(p, owner, behind ? 'slideBehind' : 'slide'); return; }
        this.release(owner);
        owner.touchCD = 0.6;
        if (Math.random() < 0.4) { owner.state = 'fall'; owner.stateT = 0.6; owner.anim = 'fall'; owner.animT = 0; owner.fallDir = 1; }
      }
      if (!b.holder) {
        b.kick(fx * 6 + (Math.random() - 0.5) * 2, 0.4, fz * 6 + (Math.random() - 0.5) * 2);
        b.lastTouch = p;
        this.emit('tackle', { ok: true });
      }
      return;
    }
    // atingiu o adversário sem tocar na bola
    for (const o of this.courtPlayers(1 - p.team)) {
      if (o.state === 'fall') continue;
      if (dist2(footX, footZ, o.x, o.z) < 0.6) {
        p.slideHit = true;
        const hadBall = b.owner === o || (b.lastTouch === o && this.time - (o.lastTouchT || 0) < 0.6) || dist2(o.x, o.z, b.x, b.z) < 2.5;
        if (hadBall) this.foul(p, o, 'slideMiss');
        else { o.state = 'fall'; o.stateT = 0.5; o.anim = 'fall'; o.animT = 0; this.foul(p, o, 'slideMiss'); }
        return;
      }
    }
  }

  // ─── Bola ────────────────────────────────────────────────────────────────
  updateBall(dt) {
    const b = this.ball;
    const live = this.state === 'play' || this.state === 'shootoutWait';
    if (b.owner) {
      const p = b.owner;
      if (p.state === 'fall' || p.state === 'getup' || !p.onCourt) { this.release(p); }
      else {
        const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
        const lead = (p.shield ? 0.34 : 0.42) + Math.min(1, p.speed / 7) * 0.22;
        const tx = p.x + fx * lead, tz = p.z + fz * lead;
        const k = Math.min(1, dt * 14);
        b.x += (tx - b.x) * k; b.z += (tz - b.z) * k; b.y = R;
        b.vx = p.vx; b.vz = p.vz; b.vy = 0;
        p.lastTouchT = this.time;
        // condução com toque longo em arrancada
        if (p.want.sprint && p.speed > 5.6 && live) {
          p.knockT -= dt;
          if (p.knockT <= 0) {
            const dri = this.attr(p, 'dri');
            p.knockT = 0.45 + dri * 0.5;
            const v = p.speed + 2.4 - dri * 0.8;
            this.release(p);
            p.touchCD = 0.14;
            b.kick(fx * v, 0, fz * v);
            this.emit('touch', {});
          }
        } else p.knockT = Math.max(p.knockT, 0.3);
        if (live && (Math.abs(b.x) > HL + R || Math.abs(b.z) > HW + R)) {
          // conduziu a bola para fora
          this.release(p);
        } else if (live && b.owner === p && p.guard <= 0) {
          // marcador com o corpo na frente da bola: a bola espirra
          let blocker = null;
          for (const o of this.courtPlayers(1 - p.team)) {
            if (o.state !== 'free' && o.state !== 'tackle') continue;
            if (dist2(o.x, o.z, b.x, b.z) < 0.36 && p.speed > 1.5) { blocker = o; break; }
          }
          p.blockT = blocker ? (p.blockT || 0) + dt : 0;
          if (blocker && p.blockT > 0.1 + this.attr(p, 'dri') * 0.12) {
            p.blockT = 0;
            this.release(p);
            p.touchCD = 0.35;
            b.kick(p.vx * 0.25 + (Math.random() - 0.5) * 3, 0.2, p.vz * 0.25 + (Math.random() - 0.5) * 3);
            b.lastTouch = blocker;
            this.emit('touch', {});
          }
        }
      }
    } else if (b.holder) {
      const p = b.holder;
      b.x = p.x + Math.cos(p.facing) * 0.35; b.z = p.z + Math.sin(p.facing) * 0.35; b.y = 1.05;
      b.vx = b.vy = b.vz = 0;
    }

    if (b.free) {
      const events = [];
      const sub = b.speed > 15 ? 3 : 1;
      for (let i = 0; i < sub; i++) b.step(dt / sub, events, live);
      for (const e of events) this.ballEvent(e);
      if (live && b.free && !b.inGoal) {
        for (let k = 0; k < 2; k++) { const gk = this.gk(k); if (gk) gkSaveCheck(this, gk); }
        if (b.free) this.tryPossession();
      }
    } else if (live && (Math.abs(b.x) > HL + R || Math.abs(b.z) > HW + R)) {
      const ev = [];
      b.step(0, ev, live);
    }
  }

  tryPossession() {
    const b = this.ball;
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (!p.onCourt || p.touchCD > 0) continue;
      if (!(p.state === 'free' || p.state === 'skill')) continue;
      const inOwnArea = p.isGK && inArea(p.x, p.z, -this.team(p).dir) && inArea(b.x, b.z, -this.team(p).dir, 0.3);
      const maxY = inOwnArea ? 2.2 : 0.8;
      if (b.y > maxY) continue;
      const d = dist2(p.x, p.z, b.x, b.z);
      const reach = (inOwnArea ? 0.85 : 0.62) + (b.speed < 3 ? 0.15 : 0);
      if (d > reach) continue;
      let s = d;
      if (this.pendingPass && this.pendingPass.to === p) s -= 0.3;
      if (s < bd) { bd = s; best = p; }
    }
    if (!best) return;
    const p = best;
    const rv = Math.hypot(b.vx - p.vx, b.vz - p.vz) + Math.abs(b.vy) * 0.5;
    const gkHands = p.isGK && inArea(p.x, p.z, -this.team(p).dir) && !(b.lastTouch && b.lastTouch.team === p.team && b.lastTouch !== p);
    const limit = gkHands ? 24 : 9 + this.attr(p, 'dri') * 8;
    if (rv > limit) {
      // domínio falhou: a bola espirra
      b.vx = b.vx * 0.3 + (Math.random() - 0.5) * 4; b.vz = b.vz * 0.3 + (Math.random() - 0.5) * 4; b.vy = Math.abs(b.vy) * 0.3 + 0.5;
      b.lastTouch = p;
      p.touchCD = 0.3;
      this.emit('touch', {});
      return;
    }
    this.gainBall(p, gkHands);
  }

  gainBall(p, hands) {
    const b = this.ball;
    const prevTeam = b.lastTouch ? b.lastTouch.team : -1;
    if (hands) { b.holder = p; b.owner = null; } else { b.owner = p; b.holder = null; }
    b.vx = b.vy = b.vz = 0; b.spin = 0; b.trail = 0;
    if (this.pendingPass) {
      const pp = this.pendingPass;
      if (pp.from.team === p.team && pp.from !== p) this.teams[p.team].stats.passOk++;
      this.pendingPass = null;
    }
    if (this.lastShot && this.lastShot.team !== p.team && p.isGK && this.time - this.lastShot.t < 2) {
      this.teams[p.team].stats.saves++;
      this.emit('save', { team: p.team, catch: hands });
      this.lastShot = null;
    }
    b.lastTouch = p;
    p.knockT = 0.5;
    if (prevTeam !== p.team) this.emit('possession', { team: p.team });
    // controle humano segue a bola
    this.giveHumanControl(p.team, p);
    // ação guardada (apertou passe/chute antes de dominar)
    const h = this.humans.find((x) => x.player === p.i);
    if (h && h.buffer && this.time - h.buffer.t < 0.3 && !hands) {
      const bf = h.buffer; h.buffer = null;
      if (bf.type === 'pass') this.passFromStick(p, h, bf.mod ? 'through' : 'ground', false);
      else this.doShot(p, { kind: 'normal', power: 0.7, aimZ: this.stickAimZ(p, h) });
    }
    this.emit('touch', {});
  }

  ballEvent(e) {
    if (e.type === 'bounce' || e.type === 'post' || e.type === 'net') this.emit(e.type, e);
    if (this.state !== 'play') return;
    if (e.type === 'post' && this.lastShot && this.time - this.lastShot.t < 2) this.emit('postShot', {});
    if (e.type === 'goal') this.goalScored(e.side);
    if (e.type === 'out') this.ballOut(e);
  }

  // ─── Regras ──────────────────────────────────────────────────────────────
  goalScored(side) {
    const scorer = this.teams.find((t) => t.dir === side).idx;
    const b = this.ball;
    // gol direto de cobrança indireta (lateral, tiro de meta, indireto) não vale
    if (this.restartTouch && this.restartTouch.indirect && this.restartTouch.only) {
      this.awardRestart('meta', 1 - scorer, -side * HL, 0, 'Gol direto não vale');
      return;
    }
    const last = b.lastTouch;
    const own = last && last.team !== scorer;
    this.teams[scorer].score++;
    this.teams[scorer].stats.goals++;
    if (last && !own) last.goals++;
    this.goalTeam = scorer;
    const conceding = 1 - scorer;
    const minute = this.half <= 2 ? (this.half - 1) * this.halfLen + (this.halfLen - this.clock) : 2 * this.halfLen + (this.half - 3) * this.halfLen * 0.25 + (this.halfLen * 0.25 - this.clock);
    this.goalsLog.push({ team: scorer, name: last ? last.data.name : '?', own, minute, half: this.half });
    // time com expulso volta a ter 5 ao sofrer gol
    if (this.teams[conceding].short > 0) this.endShort(conceding);
    this.setState('goal');
    this.emit('goal', { team: scorer, scorer: last, own, side });
  }

  ballOut(e) {
    const b = this.ball;
    const last = b.lastTouch;
    const lastTeam = last ? last.team : 0;
    b.owner = null; b.holder = null;
    if (e.where === 'side') {
      this.awardRestart('lateral', 1 - lastTeam, e.x, e.z);
    } else {
      // linha de fundo: defensor tocou por último → escanteio; atacante → tiro de meta
      const defending = this.teams.find((t) => -t.dir === e.side).idx;
      if (lastTeam === defending) this.awardRestart('escanteio', 1 - defending, e.side * HL, Math.sign(e.z || 1) * HW);
      else this.awardRestart('meta', defending, e.side * HL, 0);
    }
  }

  // Interrompe o jogo e agenda a cobrança.
  awardRestart(type, teamIdx, x, z, note) {
    this.pendingRestart = { type, team: teamIdx, x, z, note };
    this.setState('dead');
    this.emit('whistle', { type, team: teamIdx, note });
  }

  foul(off, vic, kind) {
    if (this.state !== 'play') return;
    const t = this.team(off);
    t.fouls++;
    t.stats.fouls++;
    vic.state = 'fall'; vic.stateT = 0.9; vic.anim = 'fall'; vic.animT = 0;
    vic.fallDir = Math.cos(vic.facing) * (vic.x - off.x) + Math.sin(vic.facing) * (vic.z - off.z) > 0 ? 1 : -1;
    // cartões
    const ownGoal = this.ownGoalX(off.team);
    const dGoal = dist2(vic.x, vic.z, ownGoal, 0);
    const lastMan = this.courtPlayers(off.team).filter((p) => !p.isGK && p !== off && (p.x - vic.x) * -t.dir > 0 && Math.abs(p.x) <= HL).length === 0;
    const dogso = lastMan && dGoal < 13 && vic.team !== off.team && (this.ball.owner === vic || dist2(vic.x, vic.z, this.ball.x, this.ball.z) < 2);
    let card = null;
    const reckless = kind === 'slideBehind' ? 0.6 : kind === 'slideMiss' ? 0.35 : kind === 'slide' ? 0.15 : kind === 'tackle' ? 0.06 : 0.04;
    if (dogso && Math.random() < 0.6) card = 'red';
    else if (Math.random() < reckless) card = 'yellow';
    if (card === 'yellow' && t.yellow.has(off.data.id)) card = 'red2';
    const inPenArea = inArea(vic.x, vic.z, -t.dir);
    let type = 'livre', x = vic.x, z = vic.z;
    if (inPenArea) { type = 'penalti'; x = ownGoal + t.dir * COURT.PEN; z = 0; }
    else if (t.fouls >= 6) {
      type = 'livre6';
      const d10 = Math.abs(ownGoal + t.dir * COURT.PEN2 - ownGoal);
      if (dGoal > d10) { x = ownGoal + t.dir * COURT.PEN2; z = 0; }
    }
    x = clamp(x, -HL + 0.3, HL - 0.3); z = clamp(z, -HW + 0.3, HW - 0.3);
    this.emit('foul', { team: off.team, fouls: t.fouls, off, vic, type });
    this.awardRestart(type, vic.team, x, z);
    if (card) this.giveCard(off, card);
  }

  giveCard(p, card) {
    const t = this.team(p);
    if (card === 'yellow') {
      t.yellow.add(p.data.id); t.stats.yellows++;
      this.cards.push({ team: p.team, name: p.data.name, card: 'yellow' });
      this.emit('card', { team: p.team, p, card: 'yellow' });
      return;
    }
    if (card === 'red2') { t.stats.yellows++; }
    t.stats.reds++;
    this.cards.push({ team: p.team, name: p.data.name, card: 'red' });
    this.emit('card', { team: p.team, p, card: 'red' });
    t.sentOff.add(p.data.id);
    this.sendOff(p);
  }

  sendOff(p) {
    const t = this.team(p);
    if (this.ball.owner === p || this.ball.holder === p) this.release(p);
    if (p.isGK) {
      // goleiro reserva entra no lugar de um jogador de linha
      const benchGK = t.bench.find((d) => d.role === 'GK' && !t.sentOff.has(d.id));
      const field = this.courtPlayers(p.team).filter((q) => !q.isGK).sort((a, c) => a.stamina - c.stamina)[0];
      if (benchGK) {
        t.bench.splice(t.bench.indexOf(benchGK), 1);
        t.bench.push(p.data);
        p.data = benchGK;
        this.emit('swap', { i: p.i });
        if (field) { field.onCourt = false; field.offFor = 'short'; t.offEntity = field; }
      } else if (field) {
        // sem goleiro reserva: um jogador de linha vai para o gol
        t.bench.push(p.data);
        p.data = field.data;
        field.onCourt = false; field.offFor = 'short'; t.offEntity = field;
        this.emit('swap', { i: p.i });
      }
    } else {
      p.onCourt = false; p.offFor = 'short';
      t.bench.push(p.data); // fica registrado como fora; não pode voltar
      t.offEntity = p;
    }
    t.short = Math.max(30, this.halfLen * 0.1);
    for (const h of this.humans) if (h.player === p.i) h.player = -1;
  }

  endShort(teamIdx) {
    const t = this.teams[teamIdx];
    t.short = 0;
    const e = t.offEntity;
    if (!e) return;
    t.offEntity = null;
    // entra um jogador do banco que não foi expulso
    const cand = t.bench.filter((d) => d.role !== 'GK' && !t.sentOff.has(d.id));
    const inPlayer = cand.sort((a, c) => (c.vel + c.fin) - (a.vel + a.fin))[0];
    if (inPlayer) {
      if (!t.sentOff.has(e.data.id)) t.bench.push(e.data);
      t.bench.splice(t.bench.indexOf(inPlayer), 1);
      e.data = inPlayer;
    }
    e.onCourt = true; e.offFor = null;
    e.x = 0; e.z = HW + 0.8; e.vx = e.vz = 0; e.stamina = 1; e.state = 'free';
    this.emit('swap', { i: e.i });
    this.emit('teamFull', { team: teamIdx });
  }

  // Substituição (volante, ilimitada): troca o jogador em quadra por um do banco.
  substitute(teamIdx, entityIdx, benchIdx) {
    const t = this.teams[teamIdx];
    const e = this.players[entityIdx];
    const inD = t.bench[benchIdx];
    if (!e || !inD || t.sentOff.has(inD.id) || !e.onCourt) return false;
    if (e.isGK !== (inD.role === 'GK') && e.isGK) { /* permite linha no gol */ }
    if (this.ball.owner === e || this.ball.holder === e) return false;
    t.bench[benchIdx] = e.data;
    e.data = inD;
    e.stamina = 1;
    this.emit('swap', { i: e.i });
    return true;
  }

  // CPU troca quem está cansado por alguém do banco da mesma função.
  cpuSubs(teamIdx, threshold) {
    const t = this.teams[teamIdx];
    if (t.human) return;
    for (const e of this.courtPlayers(teamIdx)) {
      if (e.isGK || e.stamina >= threshold || this.ball.owner === e || this.ball.holder === e) continue;
      let bi = t.bench.findIndex((d) => d.role === e.data.role && !t.sentOff.has(d.id));
      if (bi < 0) bi = t.bench.findIndex((d) => d.role !== 'GK' && !t.sentOff.has(d.id));
      if (bi >= 0) this.substitute(teamIdx, e.i, bi);
    }
  }

  updateRules(dt) {
    const st = this.state;
    const b = this.ball;
    for (const t of this.teams) {
      if (t.short > 0 && st === 'play') { t.short -= dt; if (t.short <= 0) this.endShort(t.idx); }
    }
    if (st === 'play') {
      this.clock -= dt;
      const pt = this.possTeam();
      if (pt >= 0) this.teams[pt].stats.poss += dt;
      // 4 segundos do goleiro com a bola na própria metade
      for (let k = 0; k < 2; k++) {
        const gk = this.gk(k);
        const t = this.teams[k];
        const has = gk && (b.owner === gk || b.holder === gk) && (gk.x * t.dir < 0);
        this.gkTimer[k] = has ? this.gkTimer[k] + dt : 0;
        if (this.gkTimer[k] > 4) {
          this.gkTimer[k] = 0;
          let x = gk.x, z = gk.z;
          if (inArea(x, z, -t.dir)) { x = this.ownGoalX(k) + t.dir * 6.2; z = clamp(z, -3, 3); }
          this.awardRestart('indireto', 1 - k, x, z, '4 segundos do goleiro');
          this.emit('fourSec', { team: k });
        }
      }
      if (this.restartTouch) {
        const lt = b.lastTouch;
        if (lt && lt !== this.restartTouch.taker) this.restartTouch.only = false;
        if (this.time - this.restartTouch.t > 6) this.restartTouch = null;
      }
      // excitação da torcida: bola perto do gol
      const dGoal = Math.min(dist2(b.x, b.z, HL, 0), dist2(b.x, b.z, -HL, 0));
      if (dGoal < 9 && (b.owner || b.speed > 8)) this.emit('danger', { level: 1 - dGoal / 9 });
      if (this.clock <= 0) { this.clock = 0; this.endPeriod(); }
      return;
    }
    if (st === 'dead') {
      if (this.stateT > 1.1) this.setupRestart(this.pendingRestart);
      return;
    }
    if (st === 'restart') {
      const r = this.restart;
      r.t += dt;
      this.enforceDistances(r);
      if (r.t > 0.6) r.count = r.type !== 'kickoff' && r.type !== 'penalti';
      if (r.count) {
        r.clock = (r.clock || 0) + dt;
        if (r.clock > 4) this.fourSecondViolation(r);
      }
      return;
    }
    if (st === 'goal') {
      if (this.stateT > 2.6) {
        if (this.settings.replays && this.replayBuf.length > 30 && !this.shootout) { this.setState('replay'); this.emit('replay'); }
        else this.afterGoal();
      }
      return;
    }
    if (st === 'shootoutWait') this.updateShootout(dt);
    if (st === 'shootoutPause' && this.stateT > 1.3) this.prepareShootoutKick();
  }

  afterGoal() {
    if (this.shootout) return;
    if (this.clock <= 0) { this.endPeriod(); return; }
    this.setupKickoff(1 - this.goalTeam);
    this.emit('kickoff');
  }

  fourSecondViolation(r) {
    this.emit('fourSec', { team: r.team });
    const other = 1 - r.team;
    if (r.type === 'lateral') this.awardRestart('lateral', other, r.x, r.z, '4 segundos');
    else if (r.type === 'escanteio') this.awardRestart('meta', other, r.x, 0, '4 segundos');
    else if (r.type === 'meta') {
      const t = this.teams[r.team];
      this.awardRestart('indireto', other, this.ownGoalX(r.team) + t.dir * 6.2, 0, '4 segundos');
    } else this.awardRestart('indireto', other, r.x, r.z, '4 segundos');
    this.state = 'dead';
  }

  setupRestart(pr) {
    for (const t of this.teams) this.cpuSubs(t.idx, 0.4);
    const b = this.ball;
    const t = this.teams[pr.team];
    const opp = this.teams[1 - pr.team];
    b.reset(pr.x, pr.z);
    for (const p of this.players) { if (p.state !== 'free' && p.state !== 'fall') { p.state = 'free'; } p.vx *= 0.2; p.vz *= 0.2; }
    let taker;
    const cands = this.courtPlayers(pr.team).filter((p) => !p.isGK || t.keeperOut);
    const nearest = (list, x, z) => list.reduce((a, c) => (!a || dist2(c.x, c.z, x, z) < dist2(a.x, a.z, x, z) ? c : a), null);
    const ox = pr.x, oz = pr.z;
    const tgx = this.goalX(pr.team);
    let defaultAim = Math.atan2(0 - oz, tgx - ox);
    if (pr.type === 'meta') {
      taker = this.gk(pr.team) || nearest(cands, ox, oz);
      const gx = this.ownGoalX(pr.team);
      taker.x = gx + t.dir * 1.5; taker.z = 0;
      b.holder = taker; b.owner = null;
      defaultAim = t.dir > 0 ? 0 : Math.PI;
    } else if (pr.type === 'penalti' || pr.type === 'livre6') {
      taker = cands.slice().sort((a, c) => c.data.fin - a.data.fin)[0];
      taker.x = ox - t.dir * 0.6; taker.z = oz;
      this.layoutPenalty(pr, taker);
    } else {
      taker = nearest(cands, ox, oz);
      // posiciona atrás da bola, olhando para dentro da quadra
      const inX = pr.type === 'escanteio' ? -Math.sign(ox) : 0;
      const inZ = pr.type === 'lateral' || pr.type === 'escanteio' ? -Math.sign(oz) : 0;
      if (pr.type === 'lateral' || pr.type === 'escanteio') {
        taker.x = ox - inX * 0.5; taker.z = oz - inZ * 0.5;
        defaultAim = Math.atan2(inZ * 1 + (pr.type === 'escanteio' ? 0.4 * -Math.sign(oz) : 0), inX + (pr.type === 'lateral' ? t.dir * 0.8 : 0));
      } else {
        taker.x = ox - Math.cos(defaultAim) * 0.6; taker.z = oz - Math.sin(defaultAim) * 0.6;
      }
      if (pr.type === 'livre' && dist2(ox, oz, tgx, 0) < 15) this.buildWall(pr, opp);
    }
    taker.facing = defaultAim; taker.vx = taker.vz = 0; taker.state = 'free';
    const indirect = pr.type === 'lateral' || pr.type === 'meta' || pr.type === 'indireto';
    this.restart = { ...pr, taker, t: 0, count: false, clock: 0, aim: null, defaultAim, indirect };
    this.giveHumanControl(pr.team, taker);
    for (const h of this.humans) if (h.player === taker.i) h.aimAngle = defaultAim;
    this.setState('restart');
    this.emit('restart', { type: pr.type, team: pr.team });
  }

  layoutPenalty(pr, taker) {
    const t = this.teams[pr.team];
    const tgx = this.goalX(pr.team);
    const gk = this.gk(1 - pr.team);
    if (gk) { gk.x = tgx - t.dir * 0.3; gk.z = 0; gk.facing = t.dir > 0 ? Math.PI : 0; gk.vx = gk.vz = 0; }
    const lineX = pr.x - t.dir * 5.5;
    let k = 0;
    for (const p of this.players) {
      if (!p.onCourt || p === taker || p === gk) continue;
      if (p.isGK && !this.teams[p.team].keeperOut) { p.x = this.ownGoalX(p.team) + this.teams[p.team].dir * 1.2; p.z = 0; p.vx = p.vz = 0; continue; }
      p.x = lineX - t.dir * (k % 2) * 1.2; p.z = -6 + (k++) * 1.6; p.vx = p.vz = 0;
    }
  }

  buildWall(pr, opp) {
    const tgx = -opp.dir * HL;
    const dx = tgx - pr.x, dz = 0 - pr.z, d = Math.hypot(dx, dz);
    const nx = dx / d, nz = dz / d;
    const wallers = this.courtPlayers(opp.idx).filter((p) => !p.isGK).sort((a, c) => dist2(a.x, a.z, pr.x, pr.z) - dist2(c.x, c.z, pr.x, pr.z)).slice(0, d < 10 ? 3 : 2);
    wallers.forEach((p, k) => {
      const off = (k - (wallers.length - 1) / 2) * 0.62;
      p.x = pr.x + nx * 5 - nz * off; p.z = pr.z + nz * 5 + nx * off;
      p.facing = Math.atan2(-nz, -nx); p.vx = p.vz = 0;
      p.wallT = 3;
    });
  }

  enforceDistances(r) {
    const minD = r.type === 'kickoff' ? COURT.CENTER_R : 5;
    for (const p of this.players) {
      if (!p.onCourt || p === r.taker) continue;
      if (r.type === 'kickoff') {
        // cada time na sua metade
        const t = this.team(p);
        if (p.x * t.dir > -0.3) p.x = -t.dir * 0.3;
        if (p.team !== r.team && Math.hypot(p.x, p.z) < minD) { const a = Math.atan2(p.z, p.x); p.x = Math.cos(a) * minD; p.z = Math.sin(a) * minD; }
        continue;
      }
      if (r.type === 'meta' && p.team !== r.team) {
        // adversários fora da área
        const gx = this.ownGoalX(r.team);
        const dx = p.x - gx, dz = p.z - clamp(p.z, -1.58, 1.58);
        const d = Math.hypot(dx, dz);
        if (d < 6.3) { p.x = gx + (dx / (d || 1)) * 6.3; }
        continue;
      }
      if (p.team === r.team && r.type !== 'penalti' && r.type !== 'livre6') continue;
      if (r.type === 'penalti' || r.type === 'livre6') {
        if (p.isGK && p.team !== r.team) continue;
        const t = this.teams[r.team];
        if ((p.x - r.x) * t.dir > -0.5) p.x = r.x - t.dir * 0.5;
      }
      const d = dist2(p.x, p.z, r.x, r.z);
      if (d < minD && !(p.wallT > 0 && d > 4.8)) {
        const a = Math.atan2(p.z - r.z, p.x - r.x);
        p.x = r.x + Math.cos(a) * minD; p.z = r.z + Math.sin(a) * minD;
      }
    }
  }

  // Executa a cobrança (chamado pela IA ou pelo humano).
  takeRestart(fn) {
    if (this.state !== 'restart') return;
    const r = this.restart;
    this.setState(r.shootout ? 'shootoutWait' : 'play');
    if (r.shootout) this.shootout.t = 0;
    // a bola está parada na marca: o cobrador bate dali mesmo
    const b = this.ball;
    if (!b.holder) { b.owner = r.taker; b.x = r.x; b.z = r.z; b.y = R; }
    fn();
    if (b.owner === r.taker) this.release(r.taker); // cobrança cancelada: bola segue livre
    this.restartTouch = { taker: r.taker, indirect: r.indirect, only: true, t: this.time };
    for (const p of this.players) p.wallT = 0;
    this.restart = null;
    this.emit('restartTaken', { type: r.type });
  }

  endPeriod() {
    const b = this.ball;
    b.owner = null; b.holder = null;
    if (this.shootout) return;
    this.emit('periodEnd', { half: this.half });
    const tied = this.teams[0].score === this.teams[1].score;
    if (this.half === 1 || this.half === 3) { this.setState('halftime'); return; }
    if (this.half === 2 && tied && this.cfg.knockout) {
      if (this.cfg.extraTime) { this.setState('halftime'); this.nextIsExtra = true; return; }
      this.startShootout();
      return;
    }
    if (this.half === 4 && tied && this.cfg.knockout) { this.startShootout(); return; }
    this.setState('fulltime');
    this.emit('fulltime');
  }

  // Chamado pela interface quando o jogador continua do intervalo.
  nextPeriod() {
    this.half++;
    this.clock = this.half >= 3 ? Math.max(60, this.halfLen * 0.25) : this.halfLen;
    for (const t of this.teams) { t.dir *= -1; if (this.half === 2 || this.half === 3) t.fouls = 0; t.keeperOut = false; }
    for (const p of this.players) p.stamina = Math.min(1, p.stamina + 0.35);
    for (const t of this.teams) this.cpuSubs(t.idx, 0.75);
    const kick = (this.half % 2 === 0) ? 1 : 0;
    this.setupKickoff(kick);
    this.emit('kickoff');
  }

  // ─── Disputa de pênaltis ─────────────────────────────────────────────────
  startShootout() {
    const b = this.ball;
    b.reset(0, 0);
    const order = this.teams.map((t) => {
      const ps = this.courtPlayers(t.idx);
      return [...ps.filter((p) => !p.isGK).sort((a, c) => c.data.fin - a.data.fin), ...ps.filter((p) => p.isGK)];
    });
    this.shootout = { kicks: [[], []], order, turn: 0, round: 0, phase: 'setup', t: 0, done: false };
    // todos cobram no mesmo gol (+x)
    for (const t of this.teams) t.dir = 1;
    this.emit('shootoutStart');
    this.setState('shootoutWait');
    this.prepareShootoutKick();
  }

  prepareShootoutKick() {
    const so = this.shootout;
    const k = so.turn;
    const list = so.order[k];
    const taker = list[so.kicks[k].length % list.length];
    for (const t of this.teams) t.dir = t.idx === k ? 1 : -1;
    const x = HL - COURT.PEN;
    this.ball.reset(x, 0);
    // demais jogadores no meio da quadra
    let n = 0;
    for (const p of this.players) {
      if (!p.onCourt) continue;
      p.state = 'free'; p.vx = p.vz = 0; p.anim = 'run';
      p.x = -2 + (n % 5) * 0.9; p.z = -3 + Math.floor(n / 5) * 6 + (n % 2) * 0.3; p.facing = 0;
      n++;
    }
    const gk = this.gk(1 - k);
    if (gk) { gk.x = HL - 0.3; gk.z = 0; gk.facing = Math.PI; gk.anim = 'ready'; }
    taker.x = x - 0.7; taker.z = 0; taker.facing = 0;
    this.restart = { type: 'penalti', team: k, x, z: 0, taker, t: 0, count: false, clock: 0, aim: null, defaultAim: 0, indirect: false, shootout: true };
    so.phase = 'aim'; so.t = 0; so.kicked = false;
    this.giveHumanControl(k, taker);
    if (gk) this.giveHumanControl(1 - k, gk);
    this.setState('restart');
    this.emit('shootoutKick', { team: k, taker });
  }

  updateShootout(dt) {
    const so = this.shootout;
    const b = this.ball;
    so.t += dt;
    let result = null;
    if (b.inGoal) result = true;
    else if (so.t > 3.2 || (b.free && b.speed < 0.3 && so.t > 1.2) || Math.abs(b.x) > HL + 0.3 || Math.abs(b.z) > HW || b.holder) result = b.inGoal ? true : false;
    if (result === null) return;
    if (so.t < 1.6 && result) return; // deixa a bola balançar a rede
    const k = so.turn;
    so.kicks[k].push(result);
    if (result) { this.goalTeam = k; this.emit('goal', { team: k, shootout: true, side: 1 }); }
    else this.emit('penMiss', { team: k });
    // decidido?
    const [a, c] = so.kicks;
    const ga = a.filter(Boolean).length, gc = c.filter(Boolean).length;
    const ra = Math.max(0, 5 - a.length), rc = Math.max(0, 5 - c.length);
    let done = false;
    if (a.length <= 5 && c.length <= 5) { if (ga + ra < gc || gc + rc < ga) done = true; }
    if (a.length >= 5 && a.length === c.length && ga !== gc) done = true;
    if (done) {
      so.done = true;
      so.winner = ga > gc ? 0 : 1;
      this.setState('fulltime');
      this.emit('fulltime', { shootout: true });
      return;
    }
    so.turn = 1 - k;
    this.setState('shootoutPause');
  }

  // ─── Replay ──────────────────────────────────────────────────────────────
  record(dt) {
    this.replayT += dt;
    if (this.replayT < 1 / 30) return;
    this.replayT = 0;
    if (this.state !== 'play' && this.state !== 'goal') return;
    if (this.state === 'goal' && this.stateT > 1.6) return;
    const f = {
      p: this.players.map((p) => ({ x: p.x, z: p.z, facing: p.facing, speed: p.speed, anim: p.anim, animT: p.animT, fallDir: p.fallDir, diveSide: p.diveSide, diveHigh: p.diveHigh, onCourt: p.onCourt })),
      b: { x: this.ball.x, y: this.ball.y, z: this.ball.z, trail: this.ball.trail },
    };
    this.replayBuf.push(f);
    if (this.replayBuf.length > 270) this.replayBuf.shift();
  }

  // Resultado final para os modos de campeonato.
  result() {
    const so = this.shootout;
    return {
      home: this.teams[0].score, away: this.teams[1].score,
      pens: so && so.done ? [so.kicks[0].filter(Boolean).length, so.kicks[1].filter(Boolean).length] : null,
      winner: so && so.done ? so.winner : this.teams[0].score > this.teams[1].score ? 0 : this.teams[1].score > this.teams[0].score ? 1 : -1,
      stats: this.teams.map((t) => t.stats),
      goals: this.goalsLog,
      players: this.players.map((p) => ({ id: p.data.id, team: p.team, minutes: p.minutes, goals: p.goals })),
    };
  }
}
