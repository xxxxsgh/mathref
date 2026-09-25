// Previsão da trajetória (com quiques) para IA, auto-posicionamento e HUD.
import { stepBall, copyBall, makeBall } from './physics.js';
import { TY, L } from './const.js';

const DT = 1 / 240, EVERY = 2, MAX = 2.6;
export class Trajectory {
  constructor() {
    this.n = 0;
    this.x = new Float32Array(800); this.y = new Float32Array(800); this.z = new Float32Array(800);
    this.t = new Float32Array(800);
    this.bounces = [];   // {i, side, x, z}
    this.netHit = false;
    this.b = makeBall();
  }
  compute(ball) {
    const b = copyBall(ball, this.b), ev = {};
    this.n = 0; this.bounces.length = 0; this.netHit = false;
    let t = 0, k = 0;
    while (t < MAX && this.n < 800) {
      ev.bounce = null; ev.net = ev.netCord = ev.floor = false;
      stepBall(b, DT, ev);
      t += DT; k++;
      if (ev.bounce !== null) this.bounces.push({ i: this.n, side: ev.bounce, x: ev.bx, z: ev.bz, t });
      if (ev.net) this.netHit = true;
      if (k % EVERY === 0 || ev.bounce !== null) {
        this.x[this.n] = b.x; this.y[this.n] = b.y; this.z[this.n] = b.z; this.t[this.n] = t; this.n++;
      }
      if (ev.floor || b.y < TY - 0.5) break;
    }
    return this;
  }
  // índice do n-ésimo quique no lado `side` (0 = primeiro)
  bounceOn(side, nth = 0) {
    let c = 0;
    for (const bb of this.bounces) if (bb.side === side) { if (c === nth) return bb; c++; }
    return null;
  }
  /**
   * Janela de rebatida para `side` (receptor) após o quique legal (`legalIdx`).
   * Retorna amostras úteis: cruzamento com plano z0, pico, último ponto.
   */
  window(side, fromIdx, z0) {
    const sgn = side === 0 ? 1 : -1;
    let cross = null, peak = null, last = null;
    let endIdx = this.n - 1;
    // termina no próximo quique ou quando cai abaixo da mesa
    for (const bb of this.bounces) if (bb.i > fromIdx) { endIdx = Math.min(endIdx, bb.i - 1); break; }
    for (let i = fromIdx + 1; i <= endIdx; i++) {
      if (this.y[i] < TY - 0.12) { endIdx = i; break; }
      if (!peak || this.y[i] > this.y[peak]) peak = i;
      if (cross === null && sgn * this.z[i] >= sgn * z0) cross = i;
      last = i;
    }
    return { cross, peak, last, end: endIdx };
  }
  at(i) { return { x: this.x[i], y: this.y[i], z: this.z[i], t: this.t[i] }; }
}
