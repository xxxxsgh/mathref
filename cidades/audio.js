// Som todo sintetizado: tanpura de fundo, zumbido da cidade, pássaros,
// grilos, chuva, buzina dos táxis, apito do trem e o "tin-tin" do bonde.
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.night = 0; this.rain = 0; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = i % 2 ? b * 3.5 : w; }
    this.noise = noise;

    // zumbido da cidade (ruído grave)
    this.hum = this._loop(noise, 'lowpass', 260, 0.05);
    // chuva (ruído agudo)
    this.rainG = this._loop(noise, 'highpass', 1800, 0);

    this._tanpura();
    this._ambience();
  }
  _loop(buf, type, f, vol) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start();
    return g;
  }
  _pluck(f, t, vol = 0.05, dur = 3.2) {
    const ctx = this.ctx, o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(2400, t); fl.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.1);
  }
  _tanpura() {
    const notes = [98, 130.8, 130.8, 65.4];
    let i = 0;
    const tick = () => {
      if (!this.ctx) return;
      if (this.on && this.ctx.state === 'running') this._pluck(notes[i % 4], this.ctx.currentTime + 0.05, 0.035);
      i++; setTimeout(tick, 1150);
    };
    tick();
  }
  _ambience() {
    const tick = () => {
      if (!this.ctx) return;
      if (this.on && this.ctx.state === 'running') {
        const t = this.ctx.currentTime;
        if (this.night > 0.5) { if (Math.random() < 0.8) this._cricket(t); }
        else if (this.rain < 0.5 && Math.random() < 0.5) this._bird(t);
      }
      setTimeout(tick, 600 + Math.random() * 1400);
    };
    tick();
  }
  _bird(t) {
    const ctx = this.ctx, n = 2 + Math.floor(Math.random() * 3), base = 2200 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.13;
      o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * 1.5, s + 0.08);
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.02, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
      o.connect(g); g.connect(this.master); o.start(s); o.stop(s + 0.12);
    }
  }
  _cricket(t) {
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.07;
      o.frequency.value = 4400;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.012, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.05);
      o.connect(g); g.connect(this.master); o.start(s); o.stop(s + 0.06);
    }
  }
  // efeitos com volume pela distância (0..1)
  honk(v) {
    if (!this.ready(v)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, s] of [[440, 0], [554, 0], [440, 0.22], [554, 0.22]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + s); g.gain.exponentialRampToValueAtTime(0.03 * v, t + s + 0.01); g.gain.setValueAtTime(0.03 * v, t + s + 0.14); g.gain.exponentialRampToValueAtTime(0.0001, t + s + 0.18);
      o.connect(g); g.connect(this.master); o.start(t + s); o.stop(t + s + 0.2);
    }
  }
  horn(v) {
    if (!this.ready(v)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const f of [311, 392, 466]) {
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 1400;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045 * v, t + 0.08); g.gain.setValueAtTime(0.045 * v, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(fl); fl.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.6);
    }
  }
  bell(v) {
    if (!this.ready(v)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const s of [0, 0.28]) for (const [f, a] of [[1320, 1], [2640, 0.4], [3960, 0.2]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + s); g.gain.exponentialRampToValueAtTime(0.06 * v * a, t + s + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + s + 0.9);
      o.connect(g); g.connect(this.master); o.start(t + s); o.stop(t + s + 1);
    }
  }
  ready(v) { return this.ctx && this.on && v > 0.02 && this.ctx.state === 'running'; }
  update(night, rain) {
    this.night = night; this.rain = rain;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainG.gain.setTargetAtTime(rain * 0.12, t, 0.5);
    this.hum.gain.setTargetAtTime(0.05 * (1 - night * 0.5), t, 1);
  }
  toggle() {
    this.on = !this.on;
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.1);
    return this.on;
  }
}
