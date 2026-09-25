// Gravação e reprodução (câmera lenta) da jogada.
const MAX_FRAMES = 720;

export class Replay {
  constructor() { this.frames = []; this.pending = []; this.playing = false; this.clock = 0; this.i = 0; }
  start() { this.frames.length = 0; this.pending.length = 0; this.playing = false; }
  event(type, v) { if (!this.playing) this.pending.push([type, v]); }
  record(g, dt) {
    if (this.playing) return;
    const b = g.ball, p = g.player, c = g.cpu;
    const last = this.frames[this.frames.length - 1];
    this.frames.push({
      t: (last ? last.t : 0) + dt,
      b: [b.x, b.y, b.z, b.wx, b.wy, b.wz, b.vx, b.vy, b.vz],
      p: [p.pad.x, p.pad.y, p.pad.z], c: [c.pad.x, c.pad.y, c.pad.z],
      pb: [p.body.x, p.body.z, p.bodyVel.x, p.bodyVel.z], cb: [c.body.x, c.body.z, c.bodyVel.x, c.bodyVel.z],
      pf: p.follow ? [p.follow.kind, p.follow.t] : null, cf: c.follow ? [c.follow.kind, c.follow.t] : null,
      ph: p.forehand, ch: c.forehand, pt: p.ttc, ct: c.ttc,
      ev: this.pending.length ? this.pending.splice(0) : null,
    });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }
  play() {
    this.playing = true;
    // começa no máximo 7 s antes do fim
    const end = this.frames.length ? this.frames[this.frames.length - 1].t : 0;
    this.i = 0;
    while (this.i < this.frames.length - 1 && end - this.frames[this.i].t > 7) this.i++;
    this.clock = this.frames.length ? this.frames[this.i].t : 0;
  }
  step(dt) {
    if (!this.playing || this.i >= this.frames.length - 1) return null;
    this.clock += dt;
    const evs = [];
    while (this.i < this.frames.length - 1 && this.frames[this.i + 1].t <= this.clock) {
      this.i++;
      if (this.frames[this.i].ev) evs.push(...this.frames[this.i].ev);
    }
    const a = this.frames[this.i], b = this.frames[Math.min(this.i + 1, this.frames.length - 1)];
    const k = b.t > a.t ? Math.min(1, (this.clock - a.t) / (b.t - a.t)) : 0;
    const L = (x, y) => x.map((v, j) => v + (y[j] - v) * k);
    return { ...a, b: L(a.b, b.b), p: L(a.p, b.p), c: L(a.c, b.c), pb: L(a.pb, b.pb), cb: L(a.cb, b.cb), ev: evs };
  }
  stop() { this.playing = false; this.frames.length = 0; }
}
