// ═══════════════════════════════════════════════════════════════════════════
// C. Física da bola.
//
// A integração é uma função pura sobre um objeto simples ({pos, vel, spin…})
// para que a IA e o goleiro possam prever trajetórias clonando o estado e
// rodando o mesmo código, e para os testes rodarem no Node.
//
// Colisões com corpos de jogadores ficam em match.js (dependem de regras:
// dono da bola, receptor, mão). Aqui: piso, ar, traves, rede e paredes, e a
// detecção contínua de linha (gol / saída) entre um subpasso e o seguinte.
// ═══════════════════════════════════════════════════════════════════════════
import { CONFIG } from '../config.js';
import { DEG, clamp, pointSeg } from './math.js';

export const BallState = Object.freeze({
  RASTEIRA: 'RASTEIRA',
  AEREA: 'AEREA',
  DOMINADA: 'DOMINADA',
  MORTA: 'MORTA',
});

const B = CONFIG.ball;
const C = CONFIG.court;

/** Geometria derivada da quadra (traves, rede, paredes). */
export function courtGeometry(court = C, ballR = B.radius) {
  const halfL = court.length / 2;
  const halfW = court.width / 2;
  const pr = court.postDiameter / 2;
  const gw = court.goalWidth / 2;
  const posts = [];
  for (const s of [-1, 1]) {
    const gx = s * (halfL + pr); // face da frente da trave sobre a linha
    // traves (verticais) e travessão (horizontal), como cilindros
    posts.push({ side: s, ax: gx, ay: 0, az: -(gw + pr), bx: gx, by: court.goalHeight + 2 * pr, bz: -(gw + pr), r: pr, kind: 'trave' });
    posts.push({ side: s, ax: gx, ay: 0, az: gw + pr, bx: gx, by: court.goalHeight + 2 * pr, bz: gw + pr, r: pr, kind: 'trave' });
    posts.push({ side: s, ax: gx, ay: court.goalHeight + pr, az: -(gw + pr), bx: gx, by: court.goalHeight + pr, bz: gw + pr, r: pr, kind: 'travessao' });
  }
  return {
    halfL,
    halfW,
    pr,
    gw,
    gh: court.goalHeight,
    depth: court.goalDepth,
    posts,
    wallX: halfL + court.wallGap,
    wallZ: halfW + court.wallGap,
    ballR,
  };
}

export const GEO = courtGeometry();

export function makeBall() {
  return {
    pos: { x: 0, y: B.radius, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    spin: 0, // giro lateral (Magnus), −1..1; positivo curva para a esquerda do trajeto
    state: BallState.RASTEIRA,
    touchDecel: false, // condução: entre toques desacelera mais (ver config)
    inPlay: true, // regras param de olhar linhas quando false
  };
}

export function cloneBall(b) {
  return {
    pos: { ...b.pos },
    vel: { ...b.vel },
    spin: b.spin,
    state: b.state,
    touchDecel: b.touchDecel,
    inPlay: b.inPlay,
  };
}

/**
 * Ambiente da bola: piso por ponto, vento e rng (variação dos rebotes).
 * `floorAt(x, z)` devolve a chave de rollDecel ('madeira', 'poca'…).
 */
export function makeBallEnv({ floor = 'madeira', floorAt = null, wind = { x: 0, z: 0 }, rng = Math.random } = {}) {
  return { floorAt: floorAt || (() => floor), wind, rng };
}

/**
 * Avança a bola `dt` segundos, em subpassos que nunca andam mais que
 * `maxSubstepTravel` (verificação contínua: chute a 32 m/s não atravessa
 * trave de 8 cm nem a linha do gol). Eventos vão para `events`.
 */
export function stepBall(b, dt, env, events = null) {
  if (b.state === BallState.MORTA && b.vel.x === 0 && b.vel.y === 0 && b.vel.z === 0) return;
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  const n = clamp(Math.ceil((speed * dt) / B.maxSubstepTravel), 1, 16);
  const h = dt / n;
  for (let i = 0; i < n; i++) substep(b, h, env, events);
}

function substep(b, h, env, events) {
  const r = B.radius;
  const p = b.pos, v = b.vel;
  const px = p.x, py = p.y, pz = p.z;
  const onGround = p.y <= r + 1e-4 && Math.abs(v.y) < 1e-6;

  if (onGround) {
    // ── C2. rasteira: atrito de rolamento + arrasto ──
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0) {
      const key = env.floorAt(p.x, p.z);
      const decel = (b.touchDecel ? Math.max(CONFIG.dribble.touchDecel, B.rollDecel[key]) : B.rollDecel[key]) + B.dragK * hs * hs;
      const ns = hs - decel * h;
      if (ns <= B.stopSpeed) {
        v.x = 0;
        v.z = 0;
        b.touchDecel = false;
      } else {
        v.x *= ns / hs;
        v.z *= ns / hs;
      }
    }
    v.y = 0;
    p.y = r;
  } else {
    // ── C3. aérea: gravidade, arrasto quadrático, Magnus e vento ──
    const sp = Math.hypot(v.x, v.y, v.z);
    const hs = Math.hypot(v.x, v.z);
    let ax = -B.dragK * sp * v.x;
    let ay = -B.gravity - B.dragK * sp * v.y;
    let az = -B.dragK * sp * v.z;
    if (b.spin !== 0 && hs > 0.5) {
      const m = B.magnusK * b.spin * hs * hs;
      // perpendicular à esquerda do trajeto horizontal
      ax += (-v.z / hs) * m;
      az += (v.x / hs) * m;
    }
    ax += env.wind.x;
    az += env.wind.z;
    v.x += ax * h;
    v.y += ay * h;
    v.z += az * h;
  }
  b.spin *= Math.exp(-B.spinDecay * h);

  p.x += v.x * h;
  p.y += v.y * h;
  p.z += v.z * h;

  // ── C4. quique ──
  if (p.y < r) {
    p.y = r;
    if (v.y < 0) {
      const out = -v.y * B.restitution;
      if (out < B.toRollingVy) {
        v.y = 0;
      } else {
        v.y = out;
        v.x *= 1 - B.bounceHorizLoss;
        v.z *= 1 - B.bounceHorizLoss;
        b.spin *= 0.5;
        events?.push({ type: 'bounce', x: p.x, z: p.z, vy: -out / B.restitution });
      }
    }
  }

  // ── C5. traves e travessão (cilindros) ──
  for (const post of GEO.posts) {
    const q = pointSeg(p.x, p.y, p.z, post.ax, post.ay, post.az, post.bx, post.by, post.bz);
    const minD = r + post.r;
    if (q.d < minD && q.d > 1e-6) {
      const nx = (p.x - q.cx) / q.d, ny = (p.y - q.cy) / q.d, nz = (p.z - q.cz) / q.d;
      const vn = v.x * nx + v.y * ny + v.z * nz;
      p.x = q.cx + nx * minD;
      p.y = q.cy + ny * minD;
      p.z = q.cz + nz * minD;
      if (vn < 0) {
        const j = (1 + B.postRestitution) * vn;
        v.x -= j * nx;
        v.y -= j * ny;
        v.z -= j * nz;
        // variação de ±3° no plano para o rebote não ficar previsível demais
        const a = (env.rng() * 2 - 1) * B.postJitterDeg * DEG;
        const c = Math.cos(a), s = Math.sin(a);
        const vx = v.x * c - v.z * s;
        v.z = v.x * s + v.z * c;
        v.x = vx;
        b.spin *= 0.3;
        events?.push({ type: 'post', kind: post.kind, side: post.side, speed: -vn, x: p.x, y: p.y, z: p.z });
      }
    }
  }

  // ── C5. rede: dentro do gol (ou batendo por fora) absorve 90% ──
  netCollide(b, px, py, pz, events);

  // ── paredes do ginásio: a bola nunca atravessa ──
  if (Math.abs(p.x) > GEO.wallX - r) {
    p.x = Math.sign(p.x) * (GEO.wallX - r);
    if (v.x * Math.sign(p.x) > 0) v.x *= -B.wallRestitution;
  }
  if (Math.abs(p.z) > GEO.wallZ - r) {
    p.z = Math.sign(p.z) * (GEO.wallZ - r);
    if (v.z * Math.sign(p.z) > 0) v.z *= -B.wallRestitution;
  }

  // estado físico (DOMINADA e MORTA são decididos pelas regras)
  if (b.state === BallState.RASTEIRA || b.state === BallState.AEREA) {
    b.state = p.y > r + 1e-4 || v.y !== 0 ? BallState.AEREA : BallState.RASTEIRA;
  }

  // ── C6. linhas: gol e saída, com a bola passando INTEIRA ──
  if (b.inPlay && events) lineCrossing(b, px, py, pz, events);
}

function netCollide(b, px, py, pz, events) {
  const r = B.radius, p = b.pos, v = b.vel;
  const side = Math.sign(p.x);
  const ax = Math.abs(p.x), apx = Math.abs(px);
  const front = GEO.halfL + 2 * GEO.pr; // atrás das traves
  const back = GEO.halfL + GEO.depth;
  const sideZ = GEO.gw + 2 * GEO.pr;
  const roof = GEO.gh + 2 * GEO.pr;
  if (ax < GEO.halfL || ax > back + r) return;
  const wasInside = apx > GEO.halfL - r && Math.abs(pz) < sideZ && py < roof;
  let hit = false;
  if (wasInside) {
    // por dentro: fundo, laterais e teto da rede seguram a bola
    if (ax > back - r) {
      p.x = side * (back - r);
      hit = true;
    }
    if (ax > front && Math.abs(p.z) > sideZ - r) {
      p.z = Math.sign(p.z) * (sideZ - r);
      hit = true;
    }
    if (ax > front && p.y > roof - r) {
      p.y = roof - r;
      hit = true;
    }
  } else if (ax > front - r) {
    // por fora: rede lateral, teto e fundo
    const inZ = Math.abs(p.z) < sideZ + r;
    const inY = p.y < roof + r;
    if (inZ && inY) {
      if (Math.abs(pz) >= sideZ + r - 1e-6) p.z = Math.sign(p.z) * (sideZ + r);
      else if (py >= roof + r - 1e-6) p.y = roof + r;
      else if (apx >= back + r - 1e-6) p.x = side * (back + r);
      else return;
      hit = true;
    }
  }
  if (hit) {
    const speed = Math.hypot(v.x, v.y, v.z);
    v.x *= B.netKeep;
    v.y *= B.netKeep;
    v.z *= B.netKeep;
    b.spin = 0;
    if (speed > 1) events?.push({ type: 'net', side, speed, x: p.x, y: p.y, z: p.z });
  }
}

function lineCrossing(b, px, py, pz, events) {
  const r = B.radius, p = b.pos;
  const gl = GEO.halfL + r; // centro além da linha + raio = bola inteira fora
  for (const s of [-1, 1]) {
    const a = s * px, c = s * p.x;
    if (a <= gl && c > gl) {
      const t = (gl - a) / (c - a);
      const z = pz + (p.z - pz) * t;
      const y = py + (p.y - py) * t;
      const goal = Math.abs(z) < GEO.gw && y < GEO.gh;
      events.push({ type: goal ? 'goal' : 'out_end', side: s, x: s * gl, y, z });
      b.inPlay = false;
      return;
    }
  }
  const sl = GEO.halfW + r;
  for (const s of [-1, 1]) {
    const a = s * pz, c = s * p.z;
    if (a <= sl && c > sl) {
      const t = (sl - a) / (c - a);
      events.push({ type: 'out_side', side: s, x: px + (p.x - px) * t, z: s * GEO.halfW });
      b.inPlay = false;
      return;
    }
  }
}

/**
 * Prevê a trajetória (sem regras): devolve amostras {t, x, y, z, vx, vz}.
 * Usado pela IA (onde a bola vai parar) e pelo goleiro (onde cruza o gol).
 */
export function predictBall(b, env, tMax = 2, dt = 1 / 60) {
  const c = cloneBall(b);
  c.inPlay = false;
  if (c.state === BallState.DOMINADA || c.state === BallState.MORTA) c.state = c.pos.y > B.radius + 1e-4 ? BallState.AEREA : BallState.RASTEIRA;
  const out = [{ t: 0, x: c.pos.x, y: c.pos.y, z: c.pos.z, vx: c.vel.x, vz: c.vel.z }];
  const quiet = { floorAt: env.floorAt, wind: env.wind, rng: () => 0.5 };
  for (let t = dt; t <= tMax + 1e-9; t += dt) {
    stepBall(c, dt, quiet, null);
    out.push({ t, x: c.pos.x, y: c.pos.y, z: c.pos.z, vx: c.vel.x, vz: c.vel.z });
    if (c.vel.x === 0 && c.vel.z === 0 && c.vel.y === 0) break;
  }
  return out;
}

/** Velocidade inicial de rolamento para chegar a `dist` com `arrive` m/s. */
export function rollSpeedFor(dist, arrive, decel) {
  return Math.sqrt(arrive * arrive + 2 * decel * dist);
}

/**
 * Lança a bola de `from` para cair em `to` (no piso ou à altura `toY`) em
 * aproximadamente `flight` s. Corrige o arrasto com algumas iterações de
 * secante rodando a mesma física. Devolve {x, y, z} da velocidade.
 */
export function solveLob(from, to, flight, env, toY = B.radius) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const dist = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / dist, uz = dz / dist;
  let hs = dist / flight;
  const vy = (toY - from.y + 0.5 * B.gravity * flight * flight) / flight;
  const quiet = { floorAt: env.floorAt, wind: { x: 0, z: 0 }, rng: () => 0.5 };
  for (let it = 0; it < 4; it++) {
    const c = makeBall();
    c.inPlay = false;
    c.pos = { ...from };
    c.vel = { x: ux * hs, y: vy, z: uz * hs };
    c.state = BallState.AEREA;
    let reached = 0;
    let prevY = c.pos.y;
    for (let t = 0; t < 4; t += 1 / 120) {
      stepBall(c, 1 / 120, quiet, null);
      const descending = c.pos.y < prevY;
      prevY = c.pos.y;
      if (descending && c.pos.y <= toY + 1e-3) break;
    }
    reached = (c.pos.x - from.x) * ux + (c.pos.z - from.z) * uz;
    if (reached <= 0.01) break;
    const k = dist / reached;
    hs *= k;
    if (Math.abs(k - 1) < 0.01) break;
  }
  return { x: ux * hs, y: vy, z: uz * hs };
}
