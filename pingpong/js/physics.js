// Física da bola: gravidade, arrasto, efeito Magnus, quique com atrito que
// troca velocidade e rotação, colisão com a rede. Também o "solver" que
// encontra a velocidade inicial para uma bola cair num ponto-alvo.
import { TY, L, W, NH, NET_OVER, R, G, DRAG, MAGNUS, SPIN_DECAY, E_TABLE, MU_TABLE, E_FLOOR, clamp } from './const.js';

export function makeBall() {
  return { x: 0, y: TY + 0.3, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
}
export const copyBall = (b, o = {}) => Object.assign(o, b);

/**
 * Integra um passo. `ev` recebe: bounce (lado 0/1), bx/bz, net, netCord, floor.
 */
export function stepBall(b, dt, ev, collide = true) {
  const sp = Math.hypot(b.vx, b.vy, b.vz);
  // Magnus: ω × v
  const mx = b.wy * b.vz - b.wz * b.vy;
  const my = b.wz * b.vx - b.wx * b.vz;
  const mz = b.wx * b.vy - b.wy * b.vx;
  const ax = -DRAG * sp * b.vx + MAGNUS * mx;
  const ay = -G - DRAG * sp * b.vy + MAGNUS * my;
  const az = -DRAG * sp * b.vz + MAGNUS * mz;
  b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
  const pz = b.z;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  const k = Math.exp(-SPIN_DECAY * dt);
  b.wx *= k; b.wy *= k; b.wz *= k;

  // Rede (plano z = 0)
  if (ev && (pz > 0) !== (b.z > 0) && Math.abs(b.x) < W + NET_OVER && b.y - R < TY + NH && b.y + R > TY) {
    const top = TY + NH;
    if (b.y > top - R * 0.9) {
      // Bola pega na fita: sobe e perde velocidade, pode passar ou voltar
      ev.netCord = true;
      b.vy = Math.abs(b.vy) * 0.4 + 0.6 + Math.random() * 0.5;
      b.vz *= 0.35 + Math.random() * 0.25;
      if (Math.random() < 0.45) { b.vz *= -1; b.z = pz; }
      b.vx *= 0.7;
      b.y = top + R;
    } else {
      ev.net = true;
      b.z = pz > 0 ? R * 1.05 : -R * 1.05;
      b.vz *= -0.18; b.vx *= 0.5; b.vy *= 0.3;
      b.wx *= 0.3; b.wy *= 0.3; b.wz *= 0.3;
    }
  }

  if (!collide) return;
  // Mesa
  if (b.vy < 0 && b.y - R <= TY && b.y - R > TY - 0.08 && Math.abs(b.x) <= W && Math.abs(b.z) <= L) {
    b.y = TY + R;
    bounce(b, E_TABLE, MU_TABLE);
    if (ev) { ev.bounce = b.z > 0 ? 0 : 1; ev.bx = b.x; ev.bz = b.z; ev.bspeed = Math.hypot(b.vx, b.vz); }
  }
  // Chão
  if (b.y - R <= 0 && b.vy < 0) {
    b.y = R;
    bounce(b, E_FLOOR, 0.35);
    b.vx *= 0.92; b.vz *= 0.92;
    if (ev) { ev.floor = true; ev.fvy = b.vy; }
  }
}

// Quique com atrito (esfera oca, I = 2/3 m R²)
function bounce(b, e, mu) {
  const vyIn = -b.vy;
  b.vy = vyIn * e;
  // velocidade do ponto de contato = v + ω × (0,-R,0)
  const ux = b.vx + R * b.wz;
  const uz = b.vz - R * b.wx;
  const u = Math.hypot(ux, uz);
  if (u < 1e-6) return;
  const dvMag = Math.min(0.4 * u, mu * (1 + e) * vyIn);
  const dvx = -ux / u * dvMag, dvz = -uz / u * dvMag;
  b.vx += dvx; b.vz += dvz;
  const f = 3 / (2 * R);
  b.wx += f * -dvz;
  b.wz += f * dvx;
}

/**
 * Simula até a bola cruzar (descendo) o plano do tampo. Ignora mesa e rede.
 * Retorna {x, z, t, netY} onde netY é a altura ao passar em z=0 (ou null).
 */
const _s = makeBall();
export function flyToTable(b0, maxT = 3, dt = 1 / 240) {
  const b = copyBall(b0, _s);
  let t = 0, netY = null, pz = b.z;
  const plane = TY + R;
  while (t < maxT) {
    stepBall(b, dt, null, false);
    t += dt;
    if ((pz > 0) !== (b.z > 0) && netY === null) netY = b.y;
    pz = b.z;
    if (b.vy < 0 && b.y <= plane) return { x: b.x, z: b.z, t, netY };
    if (b.y < 0) break;
  }
  return { x: b.x, z: b.z, t, netY, fail: true };
}

/**
 * Encontra velocidade inicial para, saindo de `from` com rotação `spin`,
 * cair em (tx, tz) com velocidade horizontal ~`speed`. Garante folga na rede
 * (reduz a velocidade até passar). Retorna {vx,vy,vz} e info.
 */
export function solveShot(from, spin, tx, tz, speed, netMargin = 0.03) {
  const b = makeBall();
  let aimX = tx, aimZ = tz;
  let s = speed;
  let best = null;
  for (let attempt = 0; attempt < 14; attempt++) {
    for (let it = 0; it < 3; it++) {
      const dx = aimX - from.x, dz = aimZ - from.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      const hx = dx / d, hz = dz / d;
      const want = Math.hypot(tz - from.z, tx - from.x);
      // Bisseção no vy para acertar a distância
      let lo = -7, hi = 9, res = null;
      for (let k = 0; k < 22; k++) {
        const vy = (lo + hi) / 2;
        Object.assign(b, from, { vx: hx * s, vy, vz: hz * s, wx: spin.wx, wy: spin.wy, wz: spin.wz });
        res = flyToTable(b);
        const got = Math.hypot(res.x - from.x, res.z - from.z);
        if (res.fail || got > want) hi = vy; else lo = vy;
      }
      const vy = (lo + hi) / 2;
      best = { vx: hx * s, vy, vz: hz * s, res };
      // Corrige desvio lateral/longitudinal (curva do sidespin)
      aimX += (tx - res.x) * 0.9;
      aimZ += (tz - res.z) * 0.5;
    }
    const r = best.res;
    const crossesNet = (from.z > 0) !== (tz > 0);
    if (!crossesNet) return best;
    if (r.netY !== null && r.netY > TY + NH + R + netMargin && !r.fail) return best;
    s *= 0.92;
    if (s < 1.5) break;
  }
  return best;
}

/**
 * Saque: 1º quique no próprio lado, 2º no lado adversário (tx,tz).
 * Varre a posição do 1º quique e a velocidade; escolhe o que cai mais perto
 * do alvo passando a rede com folga.
 */
export function solveServe(from, spin, tx, tz, sideSign) {
  const b = makeBall(), ev = {};
  let best = null, bestErr = 1e9;
  for (const zf of [0.95, 0.8, 0.65, 0.5]) {
    const z1 = sideSign * zf * L;
    const f = (from.z - z1) / (from.z - tz);
    const x1 = from.x + (tx - from.x) * f;
    const dx = x1 - from.x, dz = z1 - from.z, d = Math.hypot(dx, dz);
    const hx = dx / d, hz = dz / d;
    for (let s = 2.4; s <= 9; s += 0.3) {
      let lo = -8, hi = 3, res;
      for (let k = 0; k < 16; k++) {
        const vy = (lo + hi) / 2;
        Object.assign(b, from, { vx: hx * s, vy, vz: hz * s, wx: spin.wx, wy: spin.wy, wz: spin.wz });
        res = flyToTable(b, 1.2, 1 / 120);
        const got = Math.hypot(res.x - from.x, res.z - from.z);
        if (res.fail || got > d) hi = vy; else lo = vy;
      }
      const vy = (lo + hi) / 2;
      const v0 = { vx: hx * s, vy, vz: hz * s };
      Object.assign(b, from, v0, { wx: spin.wx, wy: spin.wy, wz: spin.wz });
      let n = 0, netOk = true, landed = null, first = null, minClear = 9;
      for (let i = 0; i < 400 && n < 2; i++) {
        ev.bounce = null; ev.net = ev.netCord = ev.floor = false;
        const pz = b.z;
        stepBall(b, 1 / 180, ev);
        if ((pz > 0) !== (b.z > 0)) minClear = b.y - (TY + NH + R);
        if (ev.net || ev.netCord) { netOk = false; break; }
        if (ev.floor) break;
        if (ev.bounce !== null) { n++; if (n === 1) first = ev.bounce; if (n === 2) landed = { x: ev.bx, z: ev.bz, side: ev.bounce }; }
      }
      if (!netOk || !landed || minClear < 0.02) continue;
      if (first !== (sideSign > 0 ? 0 : 1) || landed.side === first) continue;
      // penaliza saques muito altos (fáceis)
      const err = Math.hypot(landed.x - tx, landed.z - tz) + Math.max(0, minClear - 0.12) * 0.8 + Math.max(0, s - 6.2) * 0.05;
      if (err < bestErr) { bestErr = err; best = v0; }
    }
    if (bestErr < 0.06) break;
  }
  if (best) return best;
  // plano B: saque simples sem efeito para o centro
  if (spin.wx || spin.wy || spin.wz) return solveServe(from, { wx: 0, wy: 0, wz: 0 }, 0, -sideSign * 0.8, sideSign);
  return { vx: -from.x * 0.8, vy: -1.2, vz: -sideSign * 5 };
}

/**
 * Prevê a trajetória completa a partir do estado atual (com quiques), até
 * `maxT`. Chama cb(b, t, ev) a cada passo; se cb retornar true, para.
 */
const _p = makeBall();
export function forecast(b0, maxT, cb) {
  const b = copyBall(b0, _p);
  const dt = 1 / 240, ev = {};
  for (let t = 0; t < maxT; t += dt) {
    ev.bounce = null; ev.net = ev.netCord = ev.floor = false;
    stepBall(b, dt, ev);
    if (cb(b, t + dt, ev)) return b;
  }
  return null;
}

// Componente de topspin relativo à direção de voo (+ topspin, − backspin)
export function topspinOf(b) {
  const h = Math.hypot(b.vx, b.vz) || 1;
  // eixo de topspin = up × dir = (-dz, 0, dx)/h ... up×(dx,0,dz) = (dz,0,-dx)
  return (b.wx * (b.vz / h) - b.wz * (b.vx / h));
}
// sidespin (rotação no eixo y)
export const sidespinOf = b => b.wy;

// Constrói vetor de rotação dado topspin (rad/s) e sidespin para uma direção
export function spinVector(dirX, dirZ, top, side) {
  const h = Math.hypot(dirX, dirZ) || 1;
  const dx = dirX / h, dz = dirZ / h;
  // topspin axis = up × dir = (dz, 0, -dx)
  return { wx: dz * top, wy: side, wz: -dx * top };
}

export const clampSpeed = v => clamp(v, 0, 40);
