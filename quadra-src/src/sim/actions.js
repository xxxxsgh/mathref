// ═══════════════════════════════════════════════════════════════════════════
// E–H. Ações com a bola e de defesa: condução, domínio, drible, passe,
// chute, desarme e carrinho. Usadas igualmente pelo humano e pela IA.
//
// `M` é o objeto da partida (match.js): ball, players, env, rng, emit(),
// attackDir(team), assistFor(team), crowdPressure(team), owner…
// ═══════════════════════════════════════════════════════════════════════════
import { CONFIG } from '../config.js';
import { BallState, GEO, rollSpeedFor, solveLob } from './ball.js';
import { DEG, angDiff, att, clamp, lerp, pointSeg } from './math.js';
import { footPoint, maxSpeeds, setState } from './players.js';

const D = CONFIG.dribble;
const PS = CONFIG.pass;
const SH = CONFIG.shot;
const DF = CONFIG.defense;
const BR = CONFIG.ball.radius;

const dirOf = (a) => ({ x: Math.cos(a), z: Math.sin(a) });

function kickBall(M, p, vx, vy, vz, spin = 0, kind = 'pass') {
  const b = M.ball;
  b.vel.x = vx;
  b.vel.y = vy;
  b.vel.z = vz;
  if (vy > 0 && b.pos.y < BR + 0.02) b.pos.y = BR + 0.005;
  b.spin = spin;
  b.touchDecel = false;
  b.state = vy > 0 ? BallState.AEREA : BallState.RASTEIRA;
  M.setOwner(null);
  M.touch(p);
  p.kickImmune = 0.28;
  p.kickT = 0.3;
  p.charge = null;
  M.emit({ type: 'kick', kind, player: p, speed: Math.hypot(vx, vy, vz) });
}

/** Lado da perna usada: chutar cruzando para o lado da perna ruim. */
export function usesWeakFoot(p, kickAngle) {
  const rel = angDiff(p.facing, kickAngle); // > 0: para a esquerda (z+ de quem olha +x)
  // destro (D) chutando bem para a esquerda do corpo usa a perna esquerda
  if (p.def.pe === 'D') return rel > 40 * DEG;
  return rel < -40 * DEG;
}

function markerClose(M, p, dist) {
  for (const o of M.players) {
    if (o.onCourt && o.team !== p.team && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < dist) return true;
  }
  return false;
}

// ── E1. Condução ──────────────────────────────────────────────────────────

/** Comprimento do toque (m): mais rápido = mais longo; Drible alto = mais curto. */
export function touchLength(p) {
  const sp = maxSpeeds(p, true, false).sprint;
  const k = clamp(p.speed / sp, 0, 1);
  return clamp(lerp(D.touchMin, D.touchMax, k) * lerp(1.15, 0.72, att(p.def.dri)), D.touchMin, D.touchMax);
}

/**
 * O dono da bola encosta nela: empurra à frente (correndo) ou a segura no
 * pé (parado). Chamado a cada passo para o dono.
 */
export function dribbleStep(M, p, wantDir) {
  const b = M.ball;
  if (b.pos.y > 0.35) return false;
  const f = p.shield ? shieldFoot(M, p) : footPoint(p);
  const dist = Math.hypot(b.pos.x - f.x, b.pos.z - f.z);
  if (dist > D.reach || p.touchCd > 0) return false;
  if (p.shield) {
    // proteger: corpo entre o marcador e a bola, bola colada à sola
    b.pos.x += (f.x - b.pos.x) * 0.35;
    b.pos.z += (f.z - b.pos.z) * 0.35;
    b.vel.x = p.vel.x;
    b.vel.z = p.vel.z;
    b.touchDecel = true;
    M.touch(p, true);
    return true;
  }
  const moving = p.speed > 0.8 || (wantDir && p.intent.mag > 0.2);
  if (!moving) {
    // parado: pisa na bola
    b.pos.x += (f.x - b.pos.x) * 0.25;
    b.pos.z += (f.z - b.pos.z) * 0.25;
    b.vel.x = p.vel.x;
    b.vel.z = p.vel.z;
    b.touchDecel = true;
    M.touch(p, true);
    return true;
  }
  const a = wantDir != null ? wantDir : Math.atan2(p.vel.z, p.vel.x);
  const u = dirOf(a);
  const L = touchLength(p);
  // folga Δ sobre a velocidade do jogador: a bola se afasta até L do pé e
  // volta (desaceleração de condução constante: separação máxima = Δ² / 2a,
  // descontando o quanto ela já está à frente do pé agora)
  const ahead = Math.max(0, (b.pos.x - f.x) * u.x + (b.pos.z - f.z) * u.z);
  const delta = Math.sqrt(2 * D.touchDecel * Math.max(0.15, L - ahead));
  const along = Math.max(0, p.vel.x * u.x + p.vel.z * u.z);
  // erro pequeno no toque: Drible baixo espalha mais
  const err = M.rng.gauss() * lerp(7, 1.5, att(p.def.dri)) * DEG;
  const c = Math.cos(err), s = Math.sin(err);
  const ux = u.x * c - u.z * s, uz = u.x * s + u.z * c;
  b.vel.x = ux * (along + delta);
  b.vel.z = uz * (along + delta);
  b.vel.y = 0;
  b.touchDecel = true;
  p.touchCd = D.touchCooldown;
  p.kickT = Math.max(p.kickT, 0.12);
  M.touch(p, true);
  M.emit({ type: 'touch', player: p });
  return true;
}

function shieldFoot(M, p) {
  // pé do lado oposto ao marcador mais próximo
  const m = nearestOpponent(M, p);
  let a = p.facing;
  if (m) a = Math.atan2(p.pos.z - m.pos.z, p.pos.x - m.pos.x);
  return { x: p.pos.x + Math.cos(a) * 0.45, z: p.pos.z + Math.sin(a) * 0.45 };
}

export function nearestOpponent(M, p) {
  let best = null, bd = Infinity;
  for (const o of M.players) {
    if (!o.onCourt || o.team === p.team) continue;
    const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

// ── E2. Domínio (primeiro toque) ──────────────────────────────────────────

/** Qualidade do domínio 0..1 (chance de domínio bom). */
export function trapQuality(M, p) {
  const b = M.ball;
  const rvx = b.vel.x - p.vel.x, rvz = b.vel.z - p.vel.z;
  const rel = Math.hypot(rvx, rvz);
  let q = 0.42 + 0.55 * att(p.def.dri);
  q -= Math.max(0, rel - 6) * 0.03; // bola rápida
  q -= (p.speed / 8) * 0.12; // correndo
  if (rel > 0.5) {
    // ângulo do corpo: bola chegando pelas costas é pior
    const inc = Math.atan2(-rvz, -rvx); // de onde a bola vem
    const off = Math.abs(angDiff(p.facing, inc)) / Math.PI; // 0 = de frente
    q -= off * 0.22;
  }
  if (b.pos.y > 0.35) q -= 0.18; // bola no peito/coxa
  if (p.stamina < CONFIG.player.stamina.tiredBelow) q -= 0.08;
  return clamp(q, 0.08, 0.97);
}

/** Domínio: bom (para até 0,5 m, opcionalmente direcionado) ou ruim (escapa 1,5–3 m). */
export function trap(M, p, wantDir) {
  const b = M.ball;
  const q = trapQuality(M, p);
  const good = M.rng() < q;
  const inc = Math.atan2(b.vel.z, b.vel.x);
  b.pos.y = BR;
  b.vel.y = 0;
  b.spin = 0;
  if (good) {
    M.setOwner(p);
    M.touch(p, true);
    if (wantDir != null && p.intent.mag > 0.3) {
      // dominar já direcionando para um lado
      const u = dirOf(wantDir);
      const sp = Math.max(1.5, p.speed * 0.6) + Math.sqrt(2 * D.touchDecel * 0.6);
      b.vel.x = u.x * sp;
      b.vel.z = u.z * sp;
    } else {
      const k = D.trapGood * M.rng();
      const sp = Math.sqrt(2 * D.touchDecel * k);
      b.vel.x = p.vel.x + Math.cos(inc) * sp;
      b.vel.z = p.vel.z + Math.sin(inc) * sp;
    }
    b.touchDecel = true;
    b.state = BallState.DOMINADA;
    p.touchCd = 0.18;
    M.emit({ type: 'trap', player: p, good: true, q });
  } else {
    const d = lerp(D.trapBad[0], D.trapBad[1], M.rng());
    const a = inc + M.rng.gauss() * 40 * DEG;
    const decel = CONFIG.ball.rollDecel[M.env.floorAt(b.pos.x, b.pos.z)];
    const sp = rollSpeedFor(d, 0, decel);
    b.vel.x = Math.cos(a) * sp;
    b.vel.z = Math.sin(a) * sp;
    b.touchDecel = false;
    b.state = BallState.RASTEIRA;
    M.setOwner(null);
    M.touch(p);
    p.kickImmune = 0.2;
    M.emit({ type: 'trap', player: p, good: false, q });
  }
}

// ── E3. Ações de drible ───────────────────────────────────────────────────

/** Finta corporal: muda de direção rápido sem tocar; marcadores atrasam. */
export function feint(M, p, newDir) {
  setState(p, 'feint', D.feintTime);
  p.stateDir = newDir;
  for (const o of M.players) {
    if (!o.onCourt || o.team === p.team || o.isGK) continue;
    if (Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > D.feintRadius) continue;
    o.reactDelay = D.feintDelayMax * (1 - att(o.def.mar));
    // o marcador "compra" a finta: segue para o lado antigo
    const old = p.facing;
    o.frozenIntent = { dx: Math.cos(old), dz: Math.sin(old), mag: 0.8, sprint: false, shield: false, face: null };
  }
  M.emit({ type: 'feint', player: p });
}

/** Puxada de sola: para a bola com a sola e gira para trás. */
export function solePull(M, p) {
  const b = M.ball;
  const back = p.facing + Math.PI;
  const f = footPoint(p, 0.3);
  b.pos.x = f.x;
  b.pos.z = f.z;
  b.pos.y = BR;
  b.vel.x = Math.cos(back) * D.solePullSpeed;
  b.vel.z = Math.sin(back) * D.solePullSpeed;
  b.vel.y = 0;
  b.touchDecel = true;
  p.speed *= 0.25;
  setState(p, 'halfturn', 0.2);
  p.stateDir = back;
  p.touchCd = 0.12;
  M.touch(p, true);
  M.emit({ type: 'sole', player: p });
}

// ── F. Passe ──────────────────────────────────────────────────────────────

/** Quão livre está um companheiro (m até o adversário mais próximo, máx 6). */
export function freeness(M, mate) {
  let d = 6;
  for (const o of M.players) {
    if (!o.onCourt || o.team === mate.team) continue;
    d = Math.min(d, Math.hypot(o.pos.x - mate.pos.x, o.pos.z - mate.pos.z));
  }
  return d;
}

/** Menor distância de um adversário à linha do passe. */
export function laneClearance(M, team, ax, az, bx, bz) {
  let d = 6;
  for (const o of M.players) {
    if (!o.onCourt || o.team === team) continue;
    const q = pointSeg(o.pos.x, 0, o.pos.z, ax, 0, az, bx, 0, bz);
    if (q.t > 0.05 && q.t < 0.97) d = Math.min(d, q.d);
  }
  return d;
}

/**
 * F1. Escolhe o alvo do passe. Com direção: cone de 40°, priorizando o mais
 * livre e mais perto da linha apontada. Sem direção: o mais bem posicionado
 * à frente.
 */
export function pickPassTarget(M, p, dirAngle) {
  const dirA = M.attackDir(p.team);
  let best = null, bs = -Infinity;
  for (const m of M.players) {
    if (m === p || !m.onCourt || m.team !== p.team || m.sentOff) continue;
    const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) continue;
    const free = freeness(M, m);
    const lane = laneClearance(M, p.team, p.pos.x, p.pos.z, m.pos.x, m.pos.z);
    let s;
    if (dirAngle != null) {
      const off = Math.abs(angDiff(dirAngle, Math.atan2(dz, dx)));
      if (off > (PS.coneDeg / 2) * DEG) continue;
      s = free * 0.5 + Math.min(lane, 3) * 0.4 - (off / DEG) * 0.12 - d * 0.03;
    } else {
      const fwd = dx * dirA;
      s = fwd * 0.12 + free * 0.45 + Math.min(lane, 3) * 0.5 - Math.max(0, d - 14) * 0.15 - (m.isGK ? 2.5 : 0);
    }
    if (s > bs) {
      bs = s;
      best = m;
    }
  }
  return best;
}

/** Ponto de encontro para passe em profundidade (F3). */
export function leadPoint(M, from, mate, speed, extra) {
  let t = Math.hypot(mate.pos.x - from.x, mate.pos.z - from.z) / Math.max(4, speed * 0.75);
  let px = mate.pos.x, pz = mate.pos.z;
  const mv = Math.hypot(mate.vel.x, mate.vel.z);
  const dirA = M.attackDir(mate.team);
  // direção da corrida (ou para o gol, se parado)
  const ux = mv > 1 ? mate.vel.x / mv : dirA, uz = mv > 1 ? mate.vel.z / mv : 0;
  const run = Math.max(mv, 5);
  for (let i = 0; i < 3; i++) {
    px = mate.pos.x + ux * (run * t + extra);
    pz = mate.pos.z + uz * (run * t + extra);
    t = Math.hypot(px - from.x, pz - from.z) / Math.max(4, speed * 0.75);
  }
  return { x: clamp(px, -GEO.halfL + 1, GEO.halfL - 1), z: clamp(pz, -GEO.halfW + 0.8, GEO.halfW - 0.8) };
}

/** F5. Desvio do passe (graus, desvio-padrão). */
export function passErrorDeg(M, p, kickAngle, firstTime) {
  let e = PS.errorBaseDeg * (1 - att(p.def.pas)) + 1;
  if (p.stamina < CONFIG.player.stamina.tiredBelow) e += PS.errorTired;
  if (firstTime) e += PS.errorFirstTime;
  if (Math.abs(angDiff(p.facing, kickAngle)) > 90 * DEG) e += PS.errorBodyTurned;
  if (markerClose(M, p, PS.markedDist)) e += PS.errorMarked;
  if (usesWeakFoot(p, kickAngle)) e *= PS.weakFootMult;
  return e;
}

/**
 * Executa um passe.
 * opts: { kind: 'ground'|'through'|'lob', power 0..1, dir (rad|null), target (jogador|null), firstTime }
 */
export function doPass(M, p, opts) {
  const b = M.ball;
  const assist = M.assistFor(p.team) === 'assistido';
  const kind = opts.kind || 'ground';
  let target = opts.target ?? null;
  let aim = null;
  if (!target && (assist || opts.dir == null)) target = pickPassTarget(M, p, opts.dir);
  const decel = CONFIG.ball.rollDecel[M.env.floorAt(b.pos.x, b.pos.z)];
  let speed = lerp(PS.minSpeed, PS.maxSpeed, clamp(opts.power ?? 0.3, 0, 1));
  if (target) {
    if (kind === 'through') aim = leadPoint(M, b.pos, target, speed, PS.throughLead);
    else if (kind === 'lob') aim = leadPoint(M, b.pos, target, 12, 0.5);
    else {
      // passe normal: leve antecipação do movimento do companheiro
      const t0 = Math.hypot(target.pos.x - b.pos.x, target.pos.z - b.pos.z) / Math.max(5, speed);
      aim = { x: target.pos.x + target.vel.x * t0 * 0.7, z: target.pos.z + target.vel.z * t0 * 0.7 };
    }
  }
  let ang;
  if (aim) ang = Math.atan2(aim.z - b.pos.z, aim.x - b.pos.x);
  else ang = opts.dir != null ? opts.dir : p.facing;
  const dist = aim ? Math.hypot(aim.x - b.pos.x, aim.z - b.pos.z) : 12;

  if (assist && aim && kind !== 'lob') {
    // F2. passe calculado para chegar, mas a força do jogador manda
    const ideal = clamp(rollSpeedFor(dist, PS.arriveSpeed, decel), PS.minSpeed * 0.7, PS.maxSpeed);
    speed = lerp(speed, ideal, PS.assistBlend);
  }
  const errSd = passErrorDeg(M, p, ang, !!opts.firstTime) * (kind === 'lob' ? 1.2 : 1);
  const a = ang + M.rng.gauss() * errSd * DEG;
  const weak = usesWeakFoot(p, ang);
  M.pass = { from: p, to: target, team: p.team, kind, t: 0, aim };
  if (kind === 'lob') {
    const tgt = aim || { x: b.pos.x + Math.cos(a) * dist, z: b.pos.z + Math.sin(a) * dist };
    const d2 = Math.hypot(tgt.x - b.pos.x, tgt.z - b.pos.z);
    const flight = lerp(PS.lobFlight[0], PS.lobFlight[1], clamp(d2 / 25, 0, 1)) * lerp(1.15, 0.9, clamp(opts.power ?? 0.5, 0, 1));
    const v = solveLob({ x: b.pos.x, y: BR, z: b.pos.z }, { x: b.pos.x + Math.cos(a) * d2, z: b.pos.z + Math.sin(a) * d2 }, flight, M.env);
    kickBall(M, p, v.x, v.y, v.z, 0, 'lob');
  } else {
    kickBall(M, p, Math.cos(a) * speed, 0, Math.sin(a) * speed, 0, kind === 'through' ? 'through' : 'pass');
  }
  setState(p, 'kick', 0.18);
  M.emit({ type: 'pass', player: p, target, kind, weak, errSd });
}

// ── G. Chute ──────────────────────────────────────────────────────────────

/** G5. Raio do cone de erro (graus). */
export function shotErrorDeg(M, p, kind, over, kickAngle) {
  let e = SH.errorBaseDeg * (1 - att(p.def.fin)) + 1.2;
  e += SH.errorOverDeg * clamp(over / SH.overchargeMax, 0, 1);
  if (p.stamina < CONFIG.player.stamina.tiredBelow) e += SH.errorTiredDeg;
  if (p.state === 'halfturn' || p.state === 'offbalance' || Math.abs(angDiff(p.facing, kickAngle)) > 100 * DEG) e += SH.errorUnbalancedDeg;
  if (markerClose(M, p, PS.markedDist)) e += SH.errorPressureDeg;
  e += SH.errorCrowdDeg * M.crowdPressure(p.team) * (1 - att(p.def.fri));
  if (usesWeakFoot(p, kickAngle)) e *= SH.weakFootMult;
  if (kind === 'toe') e *= SH.toeErrorMult;
  if (kind === 'placed') e *= SH.placedErrorMult;
  return e;
}

/**
 * Mira do chute (G2): ponto alvo na linha do gol adversário.
 * Assistido: joystick escolhe o canto; sem direção, centro puxando para o
 * canto mais aberto. Manual: direção exata do joystick.
 */
export function shotAim(M, p, dir) {
  const s = M.attackDir(p.team);
  const gx = s * GEO.halfL;
  const b = M.ball;
  if (M.assistFor(p.team) === 'manual' && dir != null) {
    // projeta a direção do joystick até a linha de fundo
    const cx = Math.cos(dir), cz = Math.sin(dir);
    if (cx * s > 0.05) {
      const t = (gx - b.pos.x) / cx;
      return { x: gx, z: b.pos.z + cz * t, manual: true };
    }
    return { x: b.pos.x + cx * 15, z: b.pos.z + cz * 15, manual: true };
  }
  let z;
  if (dir != null) {
    // componente lateral do joystick (em relação ao ataque) escolhe o canto
    const lat = Math.sin(dir); // z do joystick
    z = clamp(lat * 1.6, -1, 1) * SH.aimZ;
    if (Math.abs(lat) < 0.25) z = 0;
  } else {
    const gk = M.keeperOf(1 - p.team);
    const open = gk ? (gk.pos.z > 0 ? -1 : 1) : M.rng.sign();
    z = open * SH.aimZ * 0.6;
  }
  return { x: gx, z };
}

/**
 * Executa um chute.
 * opts: { kind: 'normal'|'placed'|'chip'|'toe', power 0..1, over (s), dir }
 */
export function doShoot(M, p, opts) {
  const b = M.ball;
  const kind = opts.kind || 'normal';
  const aim = shotAim(M, p, opts.dir);
  const fin = att(p.def.fin);
  const vmax = lerp(SH.maxSpeed[0], SH.maxSpeed[1], fin);
  let power = clamp(opts.power ?? 1, 0, 1);
  let speed;
  if (kind === 'toe') speed = vmax * SH.toeSpeed;
  else if (kind === 'chip') speed = lerp(SH.chipSpeed[0], SH.chipSpeed[1], power);
  else speed = lerp(SH.minSpeed, vmax, power) * (kind === 'placed' ? SH.placedSpeed : 1);
  if (p.stamina < CONFIG.player.stamina.tiredBelow) speed *= 0.92;

  const dx = aim.x - b.pos.x, dz = aim.z - b.pos.z;
  const dist = Math.max(1, Math.hypot(dx, dz));
  let ang = Math.atan2(dz, dx);
  let spin = 0;
  if (kind === 'placed' && !aim.manual) {
    // efeito curvando para dentro: mira por fora e deixa o giro trazer
    // `into`: para que lado (em z) a bola deve curvar — para o centro do gol
    const into = aim.z === 0 ? M.rng.sign() : -Math.sign(aim.z);
    // giro positivo curva para a esquerda do trajeto; indo para +x, a
    // esquerda é +z; indo para −x, é −z
    spin = into * (Math.sign(Math.cos(ang)) || 1);
    const curve = 0.5 * CONFIG.ball.magnusK * dist * dist * 0.75;
    ang = Math.atan2(aim.z - into * curve - b.pos.z, dx);
  }
  const err = shotErrorDeg(M, p, kind, opts.over ?? 0, ang);
  const [ex, ey] = M.rng.disk();
  ang += ex * err * DEG;
  let vx, vy, vz;
  if (kind === 'chip') {
    // cavadinha: alta e lenta, caindo sob o travessão
    const flight = dist / speed;
    const tgtY = 1.4 + ey * err * 0.05;
    const v = solveLob({ x: b.pos.x, y: Math.max(b.pos.y, BR), z: b.pos.z }, { x: b.pos.x + Math.cos(ang) * dist, z: b.pos.z + Math.sin(ang) * dist }, Math.max(0.7, flight * 1.25), M.env, tgtY);
    vx = v.x;
    vy = v.y;
    vz = v.z;
  } else {
    // altura de chegada: rasteiro com pouca força, meia altura com muita
    const t = dist / speed;
    let h = kind === 'toe' ? 0.5 : lerp(0.12, 1.3, power * power);
    if (kind === 'placed') h = 0.7;
    h += ey * err * DEG * dist; // erro vertical dentro do cone
    h = Math.max(BR, h);
    vy = (h - Math.max(b.pos.y, BR) + 0.5 * CONFIG.ball.gravity * t * t) / t;
    if (h <= 0.2 && power < 0.35) vy = 0; // rasteiro
    vx = Math.cos(ang) * speed;
    vz = Math.sin(ang) * speed;
  }
  kickBall(M, p, vx, vy, vz, spin, 'shot');
  setState(p, 'kick', kind === 'toe' ? 0.12 : 0.25);
  M.lastShot = { player: p, team: p.team, t: M.time, kind, err, speed: Math.hypot(vx, vy, vz) };
  M.emit({ type: 'shot', player: p, kind, err, speed: Math.hypot(vx, vy, vz) });
}

// ── H. Defesa ─────────────────────────────────────────────────────────────

/**
 * H1. Desarme em pé. Alcance de 1 m à frente; se a linha do pé até a bola
 * passa pela perna do atacante antes da bola, é falta.
 * Devolve 'clean' | 'foul' | 'miss'.
 */
export function doTackle(M, p) {
  if (p.state !== 'normal') return 'busy';
  setState(p, 'tackle', DF.tackleTime);
  p.stateDir = p.facing;
  p.kickT = 0.3;
  const b = M.ball;
  if (b.pos.y > 0.6) return 'miss';
  const base = footPoint(p, 0.3);
  // imprecisão: Marcação baixa erra o ponto
  const jit = (1 - att(p.def.mar)) * 0.35;
  const bx = b.pos.x + M.rng.gauss() * jit, bz = b.pos.z + M.rng.gauss() * jit;
  const dist = Math.hypot(bx - p.pos.x, bz - p.pos.z);
  const off = Math.abs(angDiff(p.facing, Math.atan2(bz - p.pos.z, bx - p.pos.x)));
  M.emit({ type: 'tackle', player: p });
  if (dist > DF.tackleReach + 0.35 || off > (DF.tackleConeDeg / 2) * DEG) return 'miss';
  const owner = M.owner;
  if (owner && owner.team !== p.team) {
    // a perna do atacante fica entre o corpo e a bola
    const lx = owner.pos.x + (b.pos.x - owner.pos.x) * 0.35;
    const lz = owner.pos.z + (b.pos.z - owner.pos.z) * 0.35;
    const qLeg = pointSeg(lx, 0, lz, base.x, 0, base.z, bx, 0, bz);
    const tBall = 1;
    if (qLeg.d < DF.legRadius && qLeg.t < tBall * 0.92) {
      M.foul(p, owner, { kind: 'tackle', speed: p.speed });
      return 'foul';
    }
    let win = 0.55 + 0.35 * att(p.def.mar) - 0.3 * att(owner.def.dri);
    if (owner.shield) win *= CONFIG.dribble.shieldTackleMult;
    if (M.rng() > win) {
      M.emit({ type: 'tackle_fail', player: p, owner });
      return 'miss';
    }
  }
  // desarme limpo: fica com a bola ou cutuca para longe
  if (M.rng() < 0.35 + 0.4 * att(p.def.mar)) {
    M.setOwner(p);
    M.touch(p, true);
    b.vel.x = p.vel.x * 0.5;
    b.vel.z = p.vel.z * 0.5;
    b.touchDecel = true;
  } else {
    const a = p.facing + M.rng.gauss() * 30 * DEG;
    b.vel.x = Math.cos(a) * 3.5;
    b.vel.z = Math.sin(a) * 3.5;
    b.vel.y = 0;
    b.touchDecel = false;
    M.setOwner(null);
    M.touch(p);
  }
  if (owner && owner !== p) owner.touchCd = 0.4;
  M.emit({ type: 'tackle_win', player: p, owner });
  return 'clean';
}

/** H2. Carrinho: alcance de 2,5 m; deixa o defensor no chão por 1 s. */
export function doSlide(M, p) {
  if (p.state !== 'normal') return false;
  setState(p, 'slide', DF.slideTime);
  p.stateDir = p.facing;
  p.speed = Math.max(p.speed, DF.slideSpeed);
  p.actionData = { touchedBall: false, fouled: false };
  M.emit({ type: 'slide', player: p });
  return true;
}

/** Resolve o contato do carrinho a cada passo. */
export function slideContact(M, p) {
  const d = p.actionData;
  if (!d || p.state !== 'slide') return;
  const b = M.ball;
  const f = footPoint(p, 0.65);
  if (!d.touchedBall && b.pos.y < 0.5 && Math.hypot(b.pos.x - f.x, b.pos.z - f.z) < 0.42) {
    d.touchedBall = true;
    const a = p.stateDir + M.rng.gauss() * 25 * DEG;
    const s = 4 + M.rng() * 3;
    b.vel.x = Math.cos(a) * s;
    b.vel.z = Math.sin(a) * s;
    b.vel.y = 0;
    b.touchDecel = false;
    M.setOwner(null);
    M.touch(p);
    M.emit({ type: 'tackle_win', player: p });
  }
  if (d.fouled) return;
  for (const o of M.players) {
    if (!o.onCourt || o.team === p.team || o.state === 'ground') continue;
    if (Math.hypot(o.pos.x - f.x, o.pos.z - f.z) < 0.55) {
      if (!d.touchedBall) {
        d.fouled = true;
        M.foul(p, o, { kind: 'slide', speed: p.speed });
      } else {
        // tocou na bola antes: o atacante cai, sem falta
        o.speed *= 0.3;
        setState(o, 'ground', 0.6);
      }
      return;
    }
  }
}
