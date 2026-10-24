// ═══════════════════════════════════════════════════════════════════════════
// D. Movimento dos jogadores: peso, inércia, curvas, fôlego e colisões.
//
// Cada jogador recebe uma `intent` (do humano ou da IA): direção desejada,
// intensidade (0..1), corrida (sprint) e proteger. Este módulo transforma a
// intenção em movimento respeitando aceleração, frenagem e as regras de
// curva (até 45° mantém, 45°–120° perde 30%, acima disso meia-volta).
// ═══════════════════════════════════════════════════════════════════════════
import { CONFIG } from '../config.js';
import { DEG, angDiff, att, clamp, lerp } from './math.js';

const P = CONFIG.player;
const S = P.stamina;

let nextId = 1;

export function makePlayer(def, team, onCourt) {
  return {
    id: nextId++,
    team,
    def,
    num: def.num,
    name: def.name,
    role: def.role,
    isGK: def.role === 'GOL',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    prev: { x: 0, z: 0, facing: 0 },
    facing: 0,
    heading: 0,
    speed: 0,
    stamina: 100,
    onCourt,
    sentOff: false,
    yellow: 0,
    // estado de ação/animação
    state: 'normal', // normal | halfturn | tackle | slide | ground | offbalance | feint | kick | dive | hold
    stateT: 0,
    stateDir: 0, // direção da ação (rad)
    actionData: null,
    kickT: 0, // animação da perna de chute
    kickImmune: 0, // após chutar, a bola não bate no próprio corpo
    touchCd: 0,
    runPhase: 0,
    shield: false,
    sprinting: false,
    reactDelay: 0, // finta: marcador reage atrasado
    frozenIntent: null,
    intent: { dx: 0, dz: 0, mag: 0, sprint: false, shield: false, face: null },
    charge: null, // {kind, t} barra de força
  };
}

export function resetPlayerId() {
  nextId = 1;
}

/** Velocidades máximas (m/s) do jogador agora. */
export function maxSpeeds(p, hasBall, slippery) {
  const v = att(p.def.vel);
  let run = lerp(P.run[0], P.run[1], v);
  let sprint = lerp(P.sprint[0], P.sprint[1], v);
  if (hasBall) {
    const k = p.def.artista ? P.withBallArtist : P.withBall;
    run *= k;
    sprint *= k;
  }
  if (p.stamina < S.tiredBelow) {
    run *= S.tiredSpeed;
    sprint *= S.tiredSpeed;
  }
  if (p.shield) {
    run *= CONFIG.dribble.shieldSpeed;
    sprint = run;
  }
  if (p.isGK) {
    run *= 0.92;
    sprint *= 0.92;
  }
  void slippery;
  return { walk: P.walk, run, sprint };
}

/**
 * Avança o movimento de um jogador por `dt`.
 * `ctx`: { slippery(x,z) → bool, hasBall: bool }
 */
export function movePlayer(p, dt, ctx) {
  p.prev.x = p.pos.x;
  p.prev.z = p.pos.z;
  p.prev.facing = p.facing;
  if (!p.onCourt) return;

  p.kickT = Math.max(0, p.kickT - dt);
  p.kickImmune = Math.max(0, p.kickImmune - dt);
  p.touchCd = Math.max(0, p.touchCd - dt);
  p.reactDelay = Math.max(0, p.reactDelay - dt);

  const slip = ctx.slippery(p.pos.x, p.pos.z);
  const sp = maxSpeeds(p, ctx.hasBall, slip);
  const accel = sp.run / P.accelTime;
  const brake = (sp.sprint / P.brakeTime) / (slip ? P.slipperyBrake : 1);

  // estados que controlam o corpo sozinhos
  if (p.state !== 'normal' && p.state !== 'feint') {
    p.stateT -= dt;
    switch (p.state) {
      case 'slide': {
        // carrinho: desliza na direção da ação, perdendo velocidade
        const sv = Math.max(0, p.speed - (CONFIG.defense.slideSpeed / CONFIG.defense.slideTime) * 0.6 * dt);
        p.speed = sv;
        p.vel.x = Math.cos(p.stateDir) * sv;
        p.vel.z = Math.sin(p.stateDir) * sv;
        if (p.stateT <= 0) setState(p, 'ground', CONFIG.defense.slideGround);
        break;
      }
      case 'dive': {
        // o deslocamento do mergulho é aplicado pelo goleiro (ai.js)
        if (p.stateT <= 0) setState(p, 'ground', CONFIG.keeper.diveGround);
        break;
      }
      case 'ground':
        p.speed = Math.max(0, p.speed - brake * 1.5 * dt);
        scaleVel(p);
        if (p.stateT <= 0) setState(p, 'normal', 0);
        break;
      case 'halfturn': {
        // meia-volta: gira o corpo no lugar e só depois sai
        p.speed = Math.max(0, p.speed - brake * dt);
        scaleVel(p);
        const d = angDiff(p.facing, p.stateDir);
        p.facing += clamp(d, -Math.PI * 4 * dt, Math.PI * 4 * dt);
        if (p.stateT <= 0) {
          p.facing = p.stateDir;
          setState(p, 'normal', 0);
        }
        break;
      }
      case 'tackle':
      case 'kick':
        p.speed = Math.max(0, p.speed - brake * 0.6 * dt);
        scaleVel(p);
        if (p.stateT <= 0) setState(p, 'normal', 0);
        break;
      case 'offbalance':
        p.speed = Math.max(0, p.speed - brake * 0.4 * dt);
        scaleVel(p);
        if (p.stateT <= 0) setState(p, 'normal', 0);
        break;
      case 'hold':
        p.speed = Math.max(0, p.speed - brake * dt);
        scaleVel(p);
        break;
      default:
        if (p.stateT <= 0) setState(p, 'normal', 0);
    }
    integrate(p, dt);
    staminaTick(p, dt, 'idle');
    return;
  }
  if (p.state === 'feint') {
    p.stateT -= dt;
    if (p.stateT <= 0) setState(p, 'normal', 0);
  }

  // finta sofrida: o marcador continua com a intenção antiga por um instante
  const it = p.reactDelay > 0 && p.frozenIntent ? p.frozenIntent : p.intent;
  if (p.reactDelay <= 0) p.frozenIntent = null;

  const mag = clamp(it.mag, 0, 1);
  let target = 0;
  let mode = 'idle';
  if (mag > 0.05) {
    if (it.sprint && p.stamina > 1 && !p.shield) {
      target = sp.sprint;
      mode = 'sprint';
    } else if (mag < 0.45) {
      target = P.walk * (mag / 0.45);
      mode = 'walk';
    } else {
      target = lerp(P.walk, sp.run, (mag - 0.45) / 0.55);
      mode = target > P.walk + 0.5 ? 'run' : 'walk';
    }
  }
  p.sprinting = mode === 'sprint';

  if (target > 0) {
    const want = Math.atan2(it.dz, it.dx);
    const cur = p.speed > 0.8 ? Math.atan2(p.vel.z, p.vel.x) : p.facing;
    const turn = Math.abs(angDiff(cur, want)) / DEG;
    if (p.speed > 1.2 && turn > P.turnSlowDeg && p.state !== 'feint') {
      // meia-volta: para quase totalmente e gira o corpo
      p.speed *= P.halfTurnKeep;
      setState(p, 'halfturn', P.halfTurnTime);
      p.stateDir = want;
      scaleVel(p);
      integrate(p, dt);
      return;
    }
    if (p.speed > 1.2 && turn > P.turnKeepDeg && p.state !== 'feint') {
      p.speed *= 1 - P.turnSlowLoss;
      p.heading = want;
    } else {
      // dentro dos 45°: alinha rápido, mantendo a velocidade
      const d = angDiff(cur, want);
      const rate = p.state === 'feint' ? P.turnRate * 3 : P.turnRate;
      p.heading = cur + clamp(d, -rate * dt, rate * dt);
      if (p.speed <= 1.2) p.heading = want;
    }
    if (p.speed < target) p.speed = Math.min(target, p.speed + accel * dt);
    else p.speed = Math.max(target, p.speed - brake * dt);
    p.vel.x = Math.cos(p.heading) * p.speed;
    p.vel.z = Math.sin(p.heading) * p.speed;
    // o corpo olha para onde corre, ou para `face` (proteger, goleiro)
    const faceTo = it.face != null ? it.face : p.heading;
    p.facing += clamp(angDiff(p.facing, faceTo), -P.turnRate * 1.5 * dt, P.turnRate * 1.5 * dt);
  } else {
    // frenagem (com leve derrapagem no visual)
    p.speed = Math.max(0, p.speed - brake * dt);
    scaleVel(p);
    if (it.face != null) p.facing += clamp(angDiff(p.facing, it.face), -P.turnRate * dt, P.turnRate * dt);
  }
  integrate(p, dt);
  staminaTick(p, dt, mode);
}

function scaleVel(p) {
  const v = Math.hypot(p.vel.x, p.vel.z);
  if (v > 1e-6) {
    p.vel.x *= p.speed / v;
    p.vel.z *= p.speed / v;
  } else {
    p.vel.x = 0;
    p.vel.z = 0;
  }
}

function integrate(p, dt) {
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  // jogadores ficam dentro do ginásio (podem pisar fora da linha)
  p.pos.x = clamp(p.pos.x, -21.5, 21.5);
  p.pos.z = clamp(p.pos.z, -11.5, 11.5);
  p.runPhase += p.speed * dt * 1.6;
}

export function staminaTick(p, dt, mode) {
  if (mode === 'sprint') p.stamina -= S.sprintCost * dt;
  else if (mode === 'run') p.stamina -= S.runCost * dt;
  else p.stamina += S.recover * dt;
  p.stamina = clamp(p.stamina, 0, 100);
}

export function setState(p, state, t) {
  p.state = state;
  p.stateT = t;
}

export function isBusy(p) {
  return p.state !== 'normal';
}

/** O jogador pode tocar a bola agora? */
export function canTouch(p) {
  return p.onCourt && p.kickImmune <= 0 && p.state !== 'ground' && p.state !== 'offbalance' && p.state !== 'halfturn';
}

export function footPoint(p, ahead = CONFIG.dribble.footOffset) {
  return { x: p.pos.x + Math.cos(p.facing) * ahead, z: p.pos.z + Math.sin(p.facing) * ahead };
}

/**
 * D4. Colisões entre jogadores: não se atravessam; disputa de ombro;
 * empurrão por trás. Devolve eventos {type:'shoulder'|'push', ...}.
 */
export function collidePlayers(players, ballPos, owner, rng, now, cooldowns) {
  const out = [];
  const r2 = P.radius * 2;
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (!a.onCourt) continue;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (!b.onCourt) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      // disputa de ombro: lado a lado correndo atrás da bola
      if (a.team !== b.team && d < P.shoulder.range && a.speed > P.shoulder.minSpeed && b.speed > P.shoulder.minSpeed) {
        const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if ((cooldowns.get(key) ?? -1) < now) {
          const ua = { x: a.vel.x / a.speed, z: a.vel.z / a.speed };
          const ub = { x: b.vel.x / b.speed, z: b.vel.z / b.speed };
          const parallel = ua.x * ub.x + ua.z * ub.z > 0.6;
          const nearBall = Math.hypot(ballPos.x - a.pos.x, ballPos.z - a.pos.z) < 4;
          const sideBySide = Math.abs((dx * ua.x + dz * ua.z) / (d || 1)) < 0.6;
          if (parallel && nearBall && sideBySide && a.state === 'normal' && b.state === 'normal') {
            cooldowns.set(key, now + P.shoulder.cooldown);
            const fa = att(a.def.mar) * 0.6 + (a.speed / 8.5) * 0.4 + rng() * 0.15 + (owner === a ? 0.05 : 0);
            const fb = att(b.def.mar) * 0.6 + (b.speed / 8.5) * 0.4 + rng() * 0.15 + (owner === b ? 0.05 : 0);
            const loser = fa >= fb ? b : a;
            loser.speed *= P.offBalanceSpeed;
            setState(loser, 'offbalance', P.shoulder.offBalance);
            out.push({ type: 'shoulder', winner: loser === a ? b : a, loser });
          }
        }
      }
      if (d < r2 && d > 1e-6) {
        const nx = dx / d, nz = dz / d;
        // empurrão por trás: quem vem rápido nas costas de quem tem/disputa a bola
        for (const [att_, vic, sgn] of [[a, b, 1], [b, a, -1]]) {
          if (att_.team === vic.team) continue;
          const rel = (att_.vel.x - vic.vel.x) * nx * sgn + (att_.vel.z - vic.vel.z) * nz * sgn;
          const back = Math.cos(vic.facing) * nx * sgn + Math.sin(vic.facing) * nz * sgn;
          const vicNearBall = owner === vic || Math.hypot(ballPos.x - vic.pos.x, ballPos.z - vic.pos.z) < 1.6;
          if (rel > P.pushFoulRelSpeed && back > 0.5 && vicNearBall && vic.state !== 'ground') {
            out.push({ type: 'push', attacker: att_, victim: vic, speed: rel });
          }
        }
        // separa (o mais rápido "ganha" menos espaço que o parado)
        const pen = r2 - d;
        const wa = a.isGK && a.state === 'dive' ? 0.2 : 0.5;
        a.pos.x -= nx * pen * wa;
        a.pos.z -= nz * pen * wa;
        b.pos.x += nx * pen * (1 - wa);
        b.pos.z += nz * pen * (1 - wa);
        // tira a componente de velocidade que empurra um no outro
        const van = a.vel.x * nx + a.vel.z * nz;
        if (van > 0) {
          a.vel.x -= van * nx * 0.8;
          a.vel.z -= van * nz * 0.8;
          a.speed = Math.hypot(a.vel.x, a.vel.z);
        }
        const vbn = b.vel.x * nx + b.vel.z * nz;
        if (vbn < 0) {
          b.vel.x -= vbn * nx * 0.8;
          b.vel.z -= vbn * nz * 0.8;
          b.speed = Math.hypot(b.vel.x, b.vel.z);
        }
      }
    }
  }
  return out;
}
