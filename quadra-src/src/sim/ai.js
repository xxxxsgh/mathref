// ═══════════════════════════════════════════════════════════════════════════
// IA dos times e do goleiro (seção I).
//
// A IA "pensa" a ~10 Hz (decide alvo, corrida, passe, chute, desarme) e a
// cada passo só converte o alvo em intenção de movimento. Usa as mesmas
// ações do jogador humano (actions.js): erra passe, perde dividida, cansa.
// ═══════════════════════════════════════════════════════════════════════════
import { CONFIG } from '../config.js';
import { BallState, GEO, predictBall, rollSpeedFor, solveLob } from './ball.js';
import { DEG, angDiff, att, clamp, lerp } from './math.js';
import { maxSpeeds, setState } from './players.js';
import {
  doPass,
  doShoot,
  doSlide,
  doTackle,
  feint,
  freeness,
  laneClearance,
  nearestOpponent,
  pickPassTarget,
} from './actions.js';

const K = CONFIG.keeper;
const BR = CONFIG.ball.radius;

// ── utilidades ────────────────────────────────────────────────────────────

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Leva o jogador até `target` (arrive: desacelera perto). */
export function steer(p, target, sprint = false, face = null, slowRadius = 1.2) {
  const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) {
    p.intent.dx = 0;
    p.intent.dz = 0;
    p.intent.mag = 0;
  } else {
    p.intent.dx = dx / d;
    p.intent.dz = dz / d;
    p.intent.mag = d < slowRadius ? clamp(d / slowRadius, 0.25, 1) : 1;
  }
  p.intent.sprint = sprint && d > 3;
  p.intent.face = face;
}

/** Ponto e tempo em que `p` alcança a bola prevista. */
export function intercept(p, pred, sprint = true) {
  const v = maxSpeeds(p, false, false)[sprint ? 'sprint' : 'run'];
  for (const s of pred) {
    if (s.y > 1.4) continue;
    const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z) - 0.45;
    // tempo de reação + aceleração (~0,3 s)
    if (d <= v * Math.max(0, s.t - 0.25)) return { x: s.x, z: s.z, t: s.t };
  }
  const last = pred[pred.length - 1];
  const d = Math.hypot(last.x - p.pos.x, last.z - p.pos.z);
  return { x: last.x, z: last.z, t: last.t + d / v };
}

function toWorld(team, M, u, w) {
  return { x: u * M.attackDir(team), z: w };
}

// ── posições de referência (losango 1-2-1) ────────────────────────────────

const SLOT_BY_ROLE = { FIXO: 0, ALA: 1, PIVO: 3 };

export function assignSlots(M, team) {
  const field = M.players.filter((p) => p.team === team && p.onCourt && !p.isGK);
  const slots = [0, 1, 2, 3].slice(0, Math.max(1, field.length));
  if (field.length === 3) slots.splice(0, 4, 0, 1, 2);
  const taken = new Set();
  // primeiro pelo papel, depois por quem sobrou
  const order = [...field].sort((a, b) => (SLOT_BY_ROLE[a.role] ?? 1) - (SLOT_BY_ROLE[b.role] ?? 1));
  for (const p of order) {
    let pref = SLOT_BY_ROLE[p.role] ?? 1;
    if (pref === 1 && taken.has(1)) pref = 2;
    let s = slots.includes(pref) && !taken.has(pref) ? pref : slots.find((x) => !taken.has(x));
    taken.add(s);
    p.slot = s;
  }
}

export function shapeTarget(M, p, attacking) {
  const dir = M.attackDir(p.team);
  const b = M.ball.pos;
  const bu = b.x * dir, bw = b.z;
  const j = p.ai.jitter;
  let u, w;
  if (attacking) {
    switch (p.slot) {
      case 0: u = clamp(bu - 7, -14, 7); w = bw * 0.35; break;
      case 1: u = clamp(bu + 1.5, -10, 15); w = -6.3 + bw * 0.25; break;
      case 2: u = clamp(bu + 1.5, -10, 15); w = 6.3 + bw * 0.25; break;
      default: u = clamp(bu + 8, -2, 16.5); w = bw * 0.3;
    }
    u += j.u;
    w += j.w;
  } else {
    switch (p.slot) {
      case 0: u = clamp(bu - 6, -16, 3); w = bw * 0.5; break;
      case 1: u = clamp(bu - 3, -14.5, 8); w = -4.2 + bw * 0.35; break;
      case 2: u = clamp(bu - 3, -14.5, 8); w = 4.2 + bw * 0.35; break;
      default: u = clamp(bu - 0.5, -9, 12); w = bw * 0.4;
    }
    u += j.u * 0.4;
    w += j.w * 0.4;
  }
  return toWorld(p.team, M, clamp(u, -18.5, 18.5), clamp(w, -9.3, 9.3));
}

// ── IA de campo ───────────────────────────────────────────────────────────

export function makeAiState() {
  return { think: 0, jitter: { u: 0, w: 0 }, jitterT: 0, decideT: 0, tackleCd: 0, mode: 'shape', target: null, sprint: false, face: null, press: false };
}

/** Pensa para todos os jogadores de linha controlados pela IA. */
export function teamThink(M, team, dt) {
  const ball = M.ball;
  const owner = M.owner;
  const players = M.players.filter((p) => p.team === team && p.onCourt && !p.isGK && !p.sentOff);
  const opp = M.players.filter((p) => p.team !== team && p.onCourt && !p.sentOff);
  const ours = owner && owner.team === team;
  const theirs = owner && owner.team !== team;
  const passToUs = M.pass && M.pass.team === team && !owner;
  const pred = M.pred;

  // quem vai na bola: o que chega primeiro
  let chaser = null;
  if (!ours) {
    let bt = Infinity;
    for (const p of players) {
      if (p.state === 'ground') continue;
      const ic = intercept(p, pred);
      const bonus = passToUs && M.pass.to === p ? -0.6 : 0;
      if (ic.t + bonus < bt) {
        bt = ic.t + bonus;
        chaser = p;
        chaser.ai.ic = ic;
      }
    }
  }
  // marcação individual para os outros (quando o adversário tem a bola)
  const marks = new Map();
  if (theirs || (!ours && !passToUs)) {
    const threats = opp
      .filter((o) => !o.isGK && o !== owner)
      .sort((a, b) => Math.abs(a.pos.x - M.ownGoalX(team)) - Math.abs(b.pos.x - M.ownGoalX(team)));
    const free = players.filter((p) => p !== chaser && !(M.isHumanControlled(p)));
    for (const t of threats) {
      let best = null, bd = Infinity;
      for (const p of free) {
        if ([...marks.values()].includes(p)) continue;
        const d = dist(p.pos, t.pos);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best && bd < 12) marks.set(t, best);
    }
  }
  const markOf = new Map([...marks.entries()].map(([t, p]) => [p, t]));

  for (const p of players) {
    p.ai.tackleCd = Math.max(0, p.ai.tackleCd - dt);
    p.ai.jitterT -= dt;
    if (p.ai.jitterT <= 0) {
      p.ai.jitterT = M.rng.range(2, 4);
      p.ai.jitter.u = M.rng.range(-2, 2.2);
      p.ai.jitter.w = M.rng.range(-1.8, 1.8);
      // de vez em quando o pivô ou um ala ataca o espaço
      if (p.slot !== 0 && M.rng() < 0.25) p.ai.jitter.u += 4;
    }
    if (M.isHumanControlled(p)) continue;
    p.shield = false;

    if (p === owner) {
      carrierThink(M, p, dt);
      continue;
    }
    if (passToUs && M.pass.to === p) {
      const ic = intercept(p, pred);
      p.ai.mode = 'receive';
      p.ai.target = { x: ic.x, z: ic.z };
      p.ai.sprint = ic.t > 0.6;
      p.ai.face = Math.atan2(ball.pos.z - p.pos.z, ball.pos.x - p.pos.x);
      continue;
    }
    if (p === chaser) {
      const ic = p.ai.ic || intercept(p, pred);
      p.ai.mode = 'chase';
      if (theirs) {
        // pressiona o dono: vai para o lado do gol dele e encosta
        const g = { x: M.ownGoalX(team), z: 0 };
        const gd = dist(owner.pos, g) || 1;
        const ux = (g.x - owner.pos.x) / gd, uz = (g.z - owner.pos.z) / gd;
        // atrás do dono (ele entre mim e o gol)? contorna pelo lado em vez
        // de atravessar as costas dele (empurrão = falta)
        const rel = (p.pos.x - owner.pos.x) * ux + (p.pos.z - owner.pos.z) * uz;
        if (rel < 0.2) {
          const side = Math.sign((p.pos.x - owner.pos.x) * -uz + (p.pos.z - owner.pos.z) * ux) || 1;
          p.ai.target = { x: owner.pos.x - uz * side * 1.0 + ux * 0.3, z: owner.pos.z + ux * side * 1.0 + uz * 0.3 };
        } else {
          p.ai.target = { x: owner.pos.x + ux * 0.9, z: owner.pos.z + uz * 0.9 };
        }
        p.ai.sprint = dist(p.pos, owner.pos) > 2.5;
        p.ai.face = Math.atan2(ball.pos.z - p.pos.z, ball.pos.x - p.pos.x);
        tryTackle(M, p);
      } else {
        p.ai.target = { x: ic.x, z: ic.z };
        p.ai.sprint = true;
        p.ai.face = null;
      }
      continue;
    }
    // pressão dupla pedida pelo humano
    if (p.ai.press && theirs) {
      p.ai.mode = 'press';
      p.ai.target = { x: owner.pos.x, z: owner.pos.z };
      p.ai.sprint = true;
      p.ai.face = null;
      tryTackle(M, p);
      continue;
    }
    const mark = markOf.get(p);
    if (mark) {
      const gx = M.ownGoalX(team);
      const dx = gx - mark.pos.x, dz = -mark.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      p.ai.mode = 'mark';
      p.ai.target = { x: mark.pos.x + (dx / d) * 1.6, z: mark.pos.z + (dz / d) * 1.6 };
      p.ai.sprint = dist(p.pos, p.ai.target) > 4;
      p.ai.face = Math.atan2(ball.pos.z - p.pos.z, ball.pos.x - p.pos.x);
      continue;
    }
    p.ai.mode = 'shape';
    p.ai.target = shapeTarget(M, p, ours || passToUs);
    p.ai.sprint = dist(p.pos, p.ai.target) > 7;
    p.ai.face = Math.atan2(ball.pos.z - p.pos.z, ball.pos.x - p.pos.x);
  }
}

function tryTackle(M, p) {
  if (p.ai.tackleCd > 0 || p.state !== 'normal') return;
  const owner = M.owner;
  if (!owner || owner.team === p.team) return;
  const b = M.ball.pos;
  const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z);
  const off = Math.abs(angDiff(p.facing, Math.atan2(b.z - p.pos.z, b.x - p.pos.x)));
  if (d < 1.15 && off < 40 * DEG) {
    if (M.rng() < 0.25 + 0.35 * att(p.def.mar)) {
      doTackle(M, p);
      p.ai.tackleCd = 0.9;
    } else p.ai.tackleCd = 0.3;
  } else if (d > 1.6 && d < 2.4 && off < 20 * DEG && M.rng() < 0.006) {
    // carrinho é arriscado: a IA quase não usa
    doSlide(M, p);
    p.ai.tackleCd = 2;
  }
}

/** Decisão do dono da bola (IA). */
function carrierThink(M, p, dt) {
  const b = M.ball.pos;
  const dir = M.attackDir(p.team);
  const goal = { x: dir * GEO.halfL, z: 0 };
  const gd = dist(b, goal);
  const opp = nearestOpponent(M, p);
  const pressure = opp ? dist(opp.pos, p.pos) : 9;
  p.ai.mode = 'carry';
  p.ai.decideT -= dt;
  const ready = p.ai.decideT <= 0 && dist(b, p.pos) < 1.0 && b.y < 0.4 && p.state === 'normal';

  // conduz para o gol desviando do marcador
  let tx = goal.x - p.pos.x, tz = goal.z * 0 - p.pos.z * 0.35;
  if (opp && pressure < 4) {
    const ax = p.pos.x - opp.pos.x, az = p.pos.z - opp.pos.z;
    const ad = Math.hypot(ax, az) || 1;
    tx += (ax / ad) * (4 - pressure) * 3;
    tz += (az / ad) * (4 - pressure) * 3;
  }
  const tl = Math.hypot(tx, tz) || 1;
  p.ai.target = { x: p.pos.x + (tx / tl) * 3, z: clamp(p.pos.z + (tz / tl) * 3, -9, 9) };
  p.ai.sprint = pressure > 2.5 && pressure < 6 && p.stamina > 40;
  p.ai.face = null;
  if (!ready) return;
  p.ai.decideT = lerp(0.45, 0.22, att(p.def.pas)) + M.rng() * 0.15;

  // chutar?
  if (gd < 14) {
    let lane = 0;
    for (const z of [-1.1, 0, 1.1]) lane = Math.max(lane, laneClearance(M, p.team, b.x, b.z, goal.x, z));
    const angleOk = Math.abs(b.z) < Math.abs(goal.x - b.x) * 1.4 + 1;
    let want = ((14 - gd) / 14) * (0.55 + 0.45 * att(p.def.fin)) * (lane > 0.6 ? 1 : 0.25);
    if (gd < 6.5) want += 0.5;
    if (angleOk && M.rng() < want * 0.75) {
      const gk = M.keeperOf(1 - p.team);
      const kinds = ['normal', 'normal', 'normal', 'placed'];
      let kind = kinds[Math.floor(M.rng() * kinds.length)];
      if (gd < 7 && pressure < 1.4) kind = 'toe';
      if (gk && Math.abs(gk.pos.x - dir * GEO.halfL) > 3.5 && gd > 8 && M.rng() < 0.5) kind = 'chip';
      const aimSide = gk ? (gk.pos.z > 0 ? -1 : 1) : M.rng.sign();
      const shotDir = Math.atan2(aimSide * 0.8, dir); // lado mais aberto
      doShoot(M, p, { kind, power: lerp(0.7, 1, M.rng()), over: 0, dir: shotDir });
      return;
    }
  }
  // passar?
  const target = pickPassTarget(M, p, null);
  if (target) {
    const lane = laneClearance(M, p.team, b.x, b.z, target.pos.x, target.pos.z);
    const fwd = (target.pos.x - p.pos.x) * dir;
    const free = freeness(M, target);
    let want = 0.12 + (pressure < 1.8 ? 0.55 : 0) + (fwd > 3 && free > 2.5 ? 0.25 : 0) - (gd < 9 ? 0.2 : 0);
    if (lane < 0.8) want -= 0.5;
    if (M.rng() < want) {
      const tv = Math.hypot(target.vel.x, target.vel.z);
      const runningFwd = (target.vel.x * dir) > 3 && free > 2;
      const d = dist(target.pos, b);
      let kind = runningFwd && M.rng() < 0.55 ? 'through' : 'ground';
      if (lane < 1.0 && d > 9 && M.rng() < 0.6) kind = 'lob';
      const decel = CONFIG.ball.rollDecel[M.env.floorAt(b.x, b.z)];
      const ideal = rollSpeedFor(d + (kind === 'through' ? 3 : 0), CONFIG.pass.arriveSpeed, decel);
      const power = clamp((ideal - CONFIG.pass.minSpeed) / (CONFIG.pass.maxSpeed - CONFIG.pass.minSpeed), 0, 1);
      doPass(M, p, { kind, power, target, dir: null });
      void tv;
      return;
    }
  }
  // finta quando o marcador encosta
  if (opp && pressure < 2.2 && M.rng() < 0.18 * att(p.def.dri) + 0.04) {
    const side = M.rng.sign();
    const nd = Math.atan2(p.ai.target.z - p.pos.z, p.ai.target.x - p.pos.x) + side * 50 * DEG;
    feint(M, p, nd);
    p.ai.target = { x: p.pos.x + Math.cos(nd) * 3, z: clamp(p.pos.z + Math.sin(nd) * 3, -9, 9) };
  } else if (opp && pressure < 1.2 && M.rng() < 0.3) {
    // proteger a bola um instante
    p.shield = true;
  }
}

/** Converte o alvo da IA em intenção (todo passo). */
export function applyAi(M, p) {
  if (!p.ai.target) {
    p.intent.mag = 0;
    return;
  }
  if (M.owner === p && p.ai.mode === 'carry') {
    // o dono conduz: direção do alvo, sem desacelerar perto dele
    const dx = p.ai.target.x - p.pos.x, dz = p.ai.target.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    p.intent.dx = dx / d;
    p.intent.dz = dz / d;
    p.intent.mag = 1;
    p.intent.sprint = p.ai.sprint;
    p.intent.face = null;
    p.intent.shield = p.shield;
    return;
  }
  steer(p, p.ai.target, p.ai.sprint, p.ai.face);
}

// ── I. Goleiro ────────────────────────────────────────────────────────────

/** O ponto está dentro da área do goleiro do lado `side` (±1)? */
export function inArea(x, z, side) {
  const lx = side * GEO.halfL;
  const u = (lx - x) * side; // distância da linha para dentro da quadra
  if (u < -0.3) return false;
  const r = CONFIG.court.areaRadius;
  if (Math.abs(z) <= GEO.gw) return u <= r;
  const pz = Math.sign(z) * GEO.gw;
  return Math.hypot(u, z - pz) <= r;
}

export function makeKeeperState() {
  return { read: null, reactT: 0, dive: null, rush: false, holdT: 0, throwAt: 0, guess: null };
}

/** Goleiro da IA (ou reflexo automático do goleiro humano), todo passo. */
export function keeperUpdate(M, gk, dt, humanPositioning) {
  const side = M.ownGoalX(gk.team) > 0 ? 1 : -1;
  const gx = side * GEO.halfL;
  const k = gk.keeper;
  const b = M.ball;

  if (gk.state === 'dive' && k.dive) {
    // mergulho: o corpo vai até o ponto escolhido
    const dv = k.dive;
    dv.t += dt;
    const e = clamp(dv.t / K.diveTime, 0, 1);
    // impulsão: sai rápido, mas não teleporta (suave nas pontas)
    const ease = e * e * (3 - 2 * e);
    const z = dv.z0 + (dv.z1 - dv.z0) * ease;
    gk.vel.x = 0;
    gk.vel.z = (z - gk.pos.z) / dt;
    gk.speed = Math.abs(gk.vel.z);
    return;
  }
  if (gk.state === 'ground') {
    k.dive = null;
    return;
  }
  if (gk.state === 'hold') {
    k.holdT += dt;
    gk.intent.mag = 0;
    return;
  }

  // ── leitura do chute ──
  const towardGoal = b.vel.x * side;
  const opponentKick = M.lastTouchTeam !== gk.team || (M.lastShot && M.lastShot.team !== gk.team && M.time - M.lastShot.t < 1.5);
  if (!M.owner && towardGoal > 6 && opponentKick && !k.read) {
    k.read = { t: lerp(K.reaction[0], K.reaction[1], att(gk.def.ref)) };
    if (M.penaltyKick && k.guess != null) {
      // pênalti: o goleiro já tinha escolhido um lado; se acertou, sai antes
      const tt = Math.abs(gx - b.pos.x) / Math.max(1, Math.abs(b.vel.x));
      const zSide = Math.sign(b.pos.z + b.vel.z * tt - gk.pos.z) || 1;
      k.read.t *= zSide === k.guess ? 0.35 : 1.15;
      k.guess = null;
    }
  }
  if (k.read) {
    k.read.t -= dt;
    if (towardGoal < 2 || M.owner) {
      k.read = null;
    } else if (k.read.t <= 0) {
      k.read = null;
      decideSave(M, gk, side);
      if (gk.state === 'dive') return;
    }
  }
  if (humanPositioning) return;

  // ── saída do gol ──
  if (!M.owner || M.owner.team !== gk.team) {
    const pred = M.pred;
    let best = null;
    for (const s of pred) {
      if (s.y > 2.2) continue;
      if (!inArea(s.x, s.z, side) && Math.abs(s.x - gx) > 8) continue;
      const tg = Math.max(0, Math.hypot(s.x - gk.pos.x, s.z - gk.pos.z) - 0.6) / 6 + 0.15;
      if (tg <= s.t) {
        best = { s, tg };
        break;
      }
    }
    if (best && !M.owner && inArea(best.s.x, best.s.z, side)) {
      // chega antes do atacante?
      let att_ = Infinity;
      for (const o of M.players) {
        if (!o.onCourt || o.team === gk.team) continue;
        att_ = Math.min(att_, Math.max(0, Math.hypot(best.s.x - o.pos.x, best.s.z - o.pos.z) - 0.5) / 7.5);
      }
      if (best.tg < att_ - 0.1 || (best.s.vx === 0 && best.s.vz === 0)) {
        steer(gk, { x: best.s.x, z: best.s.z }, true, null, 0.6);
        k.rush = true;
        return;
      }
    }
  }
  k.rush = false;

  // ── posicionamento: linha bola–centro do gol, adiantando com a bola ──
  const bd = Math.hypot(b.pos.x - gx, b.pos.z);
  const adv = 0.6 + (K.advanceMax - 0.6) * (1 - clamp((bd - 4) / 16, 0, 1));
  let tx = gx + ((b.pos.x - gx) / (bd || 1)) * Math.min(adv, bd * 0.6);
  let tz = (b.pos.z / (bd || 1)) * Math.min(adv, bd * 0.6);
  if (M.owner && M.owner.team === gk.team) {
    tx = gx - side * 2.5;
    tz = 0;
  }
  tz = clamp(tz, -GEO.gw - 0.3, GEO.gw + 0.3);
  steer(gk, { x: tx, z: tz }, false, Math.atan2(b.pos.z - gk.pos.z, b.pos.x - gk.pos.x), 0.8);
}

/** Decide defesa em pé, passo lateral ou mergulho, pela trajetória prevista. */
function decideSave(M, gk, side) {
  const pred = predictBall(M.ball, M.env, 1.5, 1 / 120);
  const plane = gk.pos.x;
  let cross = null;
  for (let i = 1; i < pred.length; i++) {
    const a = pred[i - 1], c = pred[i];
    if ((a.x - plane) * side < 0 && (c.x - plane) * side >= 0) {
      const t = (plane - a.x) / (c.x - a.x || 1e-6);
      cross = { z: a.z + (c.z - a.z) * t, y: a.y + (c.y - a.y) * t, t: a.t + (c.t - a.t) * t };
      break;
    }
  }
  if (!cross) return;
  // leitura imperfeita: Reflexo baixo erra mais o ponto (e o goleiro não sabe
  // o efeito que a bola ainda vai fazer)
  cross.z += M.rng.gauss() * (CONFIG.keeper.readError[0] + CONFIG.keeper.readError[1] * (1 - att(gk.def.ref)));
  // a bola vai para o gol (ou perto)? se não, deixa passar
  if (Math.abs(cross.z) > GEO.gw + 1.2 || cross.y > GEO.gh + 0.6) return;
  const dz = cross.z - gk.pos.z;
  if (Math.abs(dz) < K.standReach && cross.y < 2.1) {
    steer(gk, { x: gk.pos.x, z: cross.z }, false, null, 0.3);
    return;
  }
  const reach = Math.min(Math.abs(dz) - 0.45, K.diveReach);
  setState(gk, 'dive', K.diveTime);
  gk.stateDir = Math.sign(dz);
  gk.keeper.dive = { z0: gk.pos.z, z1: gk.pos.z + Math.sign(dz) * Math.max(0.2, reach), y: clamp(cross.y, 0.2, 2.1), t: 0, dir: Math.sign(dz) };
  M.emit({ type: 'dive', player: gk });
}

/** Volumes de defesa do goleiro (para colisão com a bola). */
export function keeperShapes(gk) {
  const x = gk.pos.x, z = gk.pos.z;
  if (gk.state === 'dive' && gk.keeper.dive) {
    const dv = gk.keeper.dive;
    const e = clamp(dv.t / K.diveTime, 0, 1);
    const yh = lerp(1.2, dv.y, e);
    // os braços se esticam ao longo do mergulho (não chegam esticados)
    const arm = lerp(0.3, 0.75, e);
    return [
      { ax: x, ay: Math.max(0.25, yh * 0.6), az: z - dv.dir * 0.35, bx: x, by: yh, bz: z + dv.dir * arm, r: 0.2, stretch: true },
    ];
  }
  if (gk.state === 'ground') return [{ ax: x, ay: 0.2, az: z - 0.8, bx: x, by: 0.2, bz: z + 0.8, r: 0.25 }];
  return [{ ax: x, ay: 0.15, az: z, bx: x, by: 1.95, bz: z, r: CONFIG.keeper.standReach * 0.55 }];
}

/** Reposição com a mão: curta (rolando) ou longa (arremesso). */
export function keeperThrow(M, gk, long, dir) {
  const b = M.ball;
  let target = pickPassTarget(M, gk, dir);
  if (!target) target = M.players.find((p) => p.team === gk.team && p.onCourt && !p.isGK);
  if (!target) return;
  const from = { x: gk.pos.x + Math.cos(gk.facing) * 0.5, y: long ? 1.6 : BR, z: gk.pos.z + Math.sin(gk.facing) * 0.5 };
  b.pos = { ...from };
  const d = Math.hypot(target.pos.x - from.x, target.pos.z - from.z);
  gk.state = 'normal';
  gk.keeper.holdT = 0;
  M.setOwner(null);
  if (long) {
    const flight = clamp(d / K.throwLong, 0.7, 1.5);
    const tp = { x: target.pos.x + target.vel.x * flight * 0.8, z: target.pos.z + target.vel.z * flight * 0.8 };
    const v = solveLob(from, tp, flight, M.env);
    b.vel = { ...v };
    b.state = BallState.AEREA;
  } else {
    const decel = CONFIG.ball.rollDecel[M.env.floorAt(from.x, from.z)];
    const sp = clamp(rollSpeedFor(d, 3.5, decel), 4, K.throwShort * 1.4);
    const a = Math.atan2(target.pos.z - from.z, target.pos.x - from.x) + M.rng.gauss() * 2 * DEG;
    b.vel = { x: Math.cos(a) * sp, y: 0, z: Math.sin(a) * sp };
    b.state = BallState.RASTEIRA;
  }
  b.touchDecel = false;
  b.spin = 0;
  M.touch(gk);
  gk.kickImmune = 0.4;
  M.pass = { from: gk, to: target, team: gk.team, kind: long ? 'lob' : 'ground', t: 0 };
  M.emit({ type: 'throw', player: gk, long });
}
