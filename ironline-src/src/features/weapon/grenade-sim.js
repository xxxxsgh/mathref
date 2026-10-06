/**
 * Física da granada — lógica PURA (objetos {x,y,z}; sem three), testada em
 * weapon.test.mjs.
 *
 *  - Integração semi-implícita com gravidade e arrasto leve.
 *  - Varredura contínua: a cada passo um raio do centro ao destino (+ raio
 *    da granada) contra o mundo de colisão — não atravessa paredes finas.
 *  - Quique: reflete a componente normal com restituição, atrito na
 *    tangencial; em chão quase plano e devagar, rola e para.
 *  - Espoleta: conta desde o "cozinhar" (pino puxado); a granada lançada
 *    herda o tempo que restava.
 *
 * raycast(origin, dir, maxDist) → { distance, normal: {x,y,z} } | null
 */

export const NADE = {
  radius: 0.035,
  gravity: 9.81,
  drag: 0.08, // 1/s (arrasto aerodinâmico leve)
  restitution: 0.38,
  friction: 0.62, // fração da velocidade tangencial que sobra num quique
  rollFriction: 2.6, // desaceleração rolando (m/s²)
  restSpeed: 0.35,
};

/** Cria o estado de uma granada lançada. fuse = segundos restantes. */
export function makeGrenade(pos, vel, fuse, opts = {}) {
  return {
    p: { x: pos.x, y: pos.y, z: pos.z },
    v: { x: vel.x, y: vel.y, z: vel.z },
    fuse,
    t: 0,
    bounces: 0,
    rest: false,
    grounded: false,
    lastImpact: 0, // velocidade normal do último quique (som/vfx)
    ...opts,
  };
}

/**
 * Avança um passo. Devolve 'explode' quando a espoleta zera, 'bounce' no
 * passo de um quique forte, ou null.
 */
export function stepGrenade(g, dt, raycast, P = NADE) {
  g.t += dt;
  g.fuse -= dt;
  if (g.fuse <= 0) return 'explode';
  if (g.rest) return null;
  const v = g.v;
  // gravidade + arrasto
  v.y -= P.gravity * dt;
  const k = Math.max(0, 1 - P.drag * dt);
  v.x *= k; v.y *= k; v.z *= k;
  // rolando: atrito de rolamento no plano
  if (g.grounded) {
    const sp = Math.hypot(v.x, v.z);
    const dec = P.rollFriction * dt;
    const f = sp > dec ? (sp - dec) / sp : 0;
    v.x *= f; v.z *= f;
  }
  let remaining = dt;
  let event = null;
  g.grounded = false;
  // até 3 sub-colisões por passo (canto: chão + parede)
  for (let it = 0; it < 3 && remaining > 1e-6; it++) {
    const mx = v.x * remaining, my = v.y * remaining, mz = v.z * remaining;
    const len = Math.hypot(mx, my, mz);
    if (len < 1e-7) break;
    const dir = { x: mx / len, y: my / len, z: mz / len };
    const hit = raycast(g.p, dir, len + P.radius);
    if (!hit) {
      g.p.x += mx; g.p.y += my; g.p.z += mz;
      break;
    }
    // avança até encostar (centro a um raio da superfície)
    const travel = Math.max(0, hit.distance - P.radius);
    const frac = travel / len;
    g.p.x += dir.x * travel; g.p.y += dir.y * travel; g.p.z += dir.z * travel;
    remaining *= 1 - frac;
    const n = hit.normal;
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    if (vn < 0) {
      // reflete a normal (restituição) e freia a tangencial (atrito)
      const tx = v.x - vn * n.x, ty = v.y - vn * n.y, tz = v.z - vn * n.z;
      const e = -vn < 1.2 ? 0 : P.restitution; // impacto fraco: não quica
      v.x = tx * P.friction - vn * e * n.x;
      v.y = ty * P.friction - vn * e * n.y;
      v.z = tz * P.friction - vn * e * n.z;
      if (-vn > 1.5) {
        g.bounces++;
        g.lastImpact = -vn;
        event = 'bounce';
      }
    }
    if (n.y > 0.6) g.grounded = true;
    // empurra um fio para fora (evita ficar presa na superfície)
    g.p.x += n.x * 1e-4; g.p.y += n.y * 1e-4; g.p.z += n.z * 1e-4;
  }
  if (g.grounded && Math.hypot(v.x, v.y, v.z) < P.restSpeed) {
    v.x = v.y = v.z = 0;
    g.rest = true;
  }
  return event;
}

/**
 * Dano de explosão com queda pela distância: máximo no centro, zero na
 * borda do raio (curva (1 − d/r)^k — o miolo é letal, a borda só fere).
 */
export function blastDamage(dist, radius, maxDamage, k = 1.35) {
  if (dist >= radius) return 0;
  return maxDamage * Math.pow(1 - Math.max(0, dist) / radius, k);
}

/**
 * Velocidade inicial do arremesso: direção da mira inclinada para cima
 * (arco), mais a velocidade do jogador. aim e up normalizados.
 */
export function throwVelocity(aim, speed, playerVel = { x: 0, y: 0, z: 0 }, loft = 0.22) {
  const vx = aim.x, vy = aim.y + loft, vz = aim.z;
  const l = Math.hypot(vx, vy, vz) || 1;
  return {
    x: (vx / l) * speed + playerVel.x * 0.8,
    y: (vy / l) * speed + Math.max(0, playerVel.y) * 0.5,
    z: (vz / l) * speed + playerVel.z * 0.8,
  };
}

/**
 * Devolução de granada (IA): escolhe a granada de fragmentação viva mais
 * próxima de `pos` (alcance `maxDist`, plano XZ + altura) com espoleta
 * restante ≥ `minFuse` e que ainda não foi devolvida. Devolve o índice ou −1.
 */
export function pickGrenade(list, pos, { maxDist = 2.6, minFuse = 0.35 } = {}) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.kind && g.kind !== 'frag') continue;
    if (g.thrownBack) continue;
    if (g.fuse < minFuse) continue; // fuse = segundos RESTANTES
    const d = Math.hypot(g.p.x - pos.x, (g.p.y - pos.y) * 0.5, g.p.z - pos.z);
    if (d <= maxDist && d < bd) (bd = d), (best = i);
  }
  return best;
}

/**
 * Velocidade de um arremesso em arco de `from` até `to` (gravidade g):
 * tempo de voo proporcional à distância (0,45–1,3 s), sem arrasto.
 */
export function lobVelocity(from, to, g = NADE.gravity ?? 9.81) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const h = Math.hypot(dx, dz);
  const T = Math.min(1.3, Math.max(0.45, h / 12));
  return { x: dx / T, y: (dy + 0.5 * g * T * T) / T, z: dz / T, T };
}
