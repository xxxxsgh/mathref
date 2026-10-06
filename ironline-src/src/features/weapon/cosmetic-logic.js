/**
 * Lógica PURA dos cosméticos (sem three; testada em weapon.test.mjs):
 *
 *  - Contador de abates: `formatKills(n)` (6 dígitos com zeros à esquerda,
 *    satura em 999999) e `KillCounters` (por arma/faca; `null` = sem
 *    contador; `add(id)` incrementa só se houver contador).
 *  - Chaveiro: `CharmSim` — corrente de 2 elos (Verlet) presa num ponto da
 *    arma; recebe a gravidade e a aceleração do ponto de fixação no espaço
 *    LOCAL da arma (forças inerciais: a arma acelera, o chaveiro fica para
 *    trás e balança). Amortecido, com limite de passo.
 */

export const KILL_DIGITS = 6;

export function formatKills(n, digits = KILL_DIGITS) {
  const max = 10 ** digits - 1;
  const v = Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
  return String(v).padStart(digits, '0');
}

export class KillCounters {
  constructor() {
    this.map = new Map();
  }
  /** n = número ou null (remove o contador). */
  set(id, n) {
    if (n == null || !Number.isFinite(Number(n))) this.map.delete(id);
    else this.map.set(id, Math.max(0, Math.floor(Number(n))));
    return this.get(id);
  }
  get(id) {
    return this.map.has(id) ? this.map.get(id) : null;
  }
  has(id) {
    return this.map.has(id);
  }
  /** Abate com a arma `id`: incrementa se ela tiver contador. Devolve o novo valor ou null. */
  add(id) {
    if (!this.map.has(id)) return null;
    const v = this.map.get(id) + 1;
    this.map.set(id, v);
    return v;
  }
}

/**
 * Corrente do chaveiro: pontos p0 (fixo no ponto de montagem = origem
 * local), p1, p2 (pingente). Comprimentos L1, L2 (m). Vetores [x,y,z].
 */
export class CharmSim {
  constructor({ L1 = 0.012, L2 = 0.016, damping = 2.2 } = {}) {
    this.L = [L1, L2];
    this.damp = damping;
    this.p = [[0, 0, 0], [0, -L1, 0], [0, -L1 - L2, 0]];
    this.q = this.p.map((v) => v.slice());
  }
  reset(g = [0, -1, 0]) {
    const m = Math.hypot(g[0], g[1], g[2]) || 1;
    const d = [g[0] / m, g[1] / m, g[2] / m];
    this.p = [[0, 0, 0], d.map((x) => x * this.L[0]), d.map((x) => x * (this.L[0] + this.L[1]))];
    this.q = this.p.map((v) => v.slice());
  }
  /**
   * gLocal: gravidade no espaço local (m/s²); aLocal: aceleração do ponto de
   * fixação no espaço local (m/s²). A força efetiva é g − a.
   */
  step(dt, gLocal, aLocal = [0, 0, 0]) {
    dt = Math.min(Math.max(dt, 0), 1 / 30);
    if (dt <= 0) return this.p;
    const f = [gLocal[0] - aLocal[0], gLocal[1] - aLocal[1], gLocal[2] - aLocal[2]];
    const k = Math.exp(-this.damp * dt);
    for (let i = 1; i < 3; i++) {
      const p = this.p[i], q = this.q[i];
      const nx = p[0] + (p[0] - q[0]) * k + f[0] * dt * dt;
      const ny = p[1] + (p[1] - q[1]) * k + f[1] * dt * dt;
      const nz = p[2] + (p[2] - q[2]) * k + f[2] * dt * dt;
      q[0] = p[0], q[1] = p[1], q[2] = p[2];
      p[0] = nx, p[1] = ny, p[2] = nz;
    }
    // restrições de comprimento (p0 fixo)
    for (let it = 0; it < 3; it++) {
      for (let s = 0; s < 2; s++) {
        const a = this.p[s], b = this.p[s + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const d = Math.hypot(dx, dy, dz) || 1e-9;
        const e = (d - this.L[s]) / d;
        if (s === 0) {
          b[0] -= dx * e, b[1] -= dy * e, b[2] -= dz * e;
        } else {
          a[0] += dx * e * 0.5, a[1] += dy * e * 0.5, a[2] += dz * e * 0.5;
          b[0] -= dx * e * 0.5, b[1] -= dy * e * 0.5, b[2] -= dz * e * 0.5;
        }
      }
      this.p[0] = [0, 0, 0];
    }
    return this.p;
  }
}
