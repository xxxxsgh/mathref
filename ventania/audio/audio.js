// Som 100% sintetizado com Web Audio: vento ambiente (com rajadas e assobio
// que cresce com a velocidade), mar perto da praia, passos que variam com o
// chão, pássaros de dia, grilos à noite, pulo, aterrissagem, planador, água.
// O AudioContext só nasce no primeiro clique (política dos navegadores).

const rand = (a, b) => a + Math.random() * (b - a);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.muted = false;
    this.birdTimer = 2;
    this.cricketTimer = 1;
    this.t = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // Buffers de ruído.
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }

    // Vento: ruído marrom + faixa assobiada.
    this.wind = this._loop(this.brown, 'lowpass', 420, 0.0);
    this.whistle = this._loop(this.white, 'bandpass', 900, 0.0, 6);
    // Mar.
    this.sea = this._loop(this.brown, 'lowpass', 650, 0.0);
  }

  _loop(buffer, type, freq, gain, q = 0.7) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rand(0.9, 1.1);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(0, rand(0, 1.5));
    return { src, f, g };
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.1);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    return this.muted;
  }

  /** Atualização contínua: vento, mar, pássaros, grilos. */
  update(dt, s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.t += dt;
    const now = this.ctx.currentTime;
    const gust = 0.55 + 0.3 * Math.sin(this.t * 0.31) + 0.15 * Math.sin(this.t * 1.13 + 2);
    const alt = Math.min(1, Math.max(0, (s.height - 20) / 80));
    const spd = Math.min(1, s.speed / 14);
    this.wind.g.gain.setTargetAtTime(0.16 * gust + 0.12 * alt + 0.25 * spd * (s.airborne ? 1 : 0.3), now, 0.3);
    this.wind.f.frequency.setTargetAtTime(300 + 260 * gust + 500 * spd, now, 0.3);
    this.whistle.g.gain.setTargetAtTime(0.012 * gust + 0.05 * spd * (s.gliding ? 1 : 0.2) + 0.02 * alt, now, 0.4);
    this.whistle.f.frequency.setTargetAtTime(700 + 600 * gust + 900 * spd, now, 0.4);
    const swell = 0.6 + 0.4 * Math.sin(this.t * 0.55);
    this.sea.g.gain.setTargetAtTime(0.28 * s.nearSea * swell, now, 0.5);

    // Pássaros de dia (mais à tarde e de manhã), grilos à noite.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = rand(1.2, 5) / Math.max(0.2, s.day);
      if (s.day > 0.25 && s.height < 120) this._bird();
    }
    this.cricketTimer -= dt;
    if (this.cricketTimer <= 0) {
      this.cricketTimer = rand(0.25, 0.9);
      if (s.night > 0.3) this._cricket(s.night);
    }
  }

  _pan(x) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = x;
    p.connect(this.master);
    // Desconecta depois que os osciladores (curtos) terminarem.
    setTimeout(() => p.disconnect(), 1500);
    return p;
  }

  _bird() {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const out = this._pan(rand(-0.9, 0.9));
    const species = Math.floor(rand(0, 3));
    const notes = species === 0 ? 3 + Math.floor(rand(0, 3)) : species === 1 ? 2 : 6;
    const base = species === 0 ? rand(2600, 3400) : species === 1 ? rand(1800, 2300) : rand(3800, 4600);
    const vol = rand(0.02, 0.05);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      const st = t0 + i * (species === 2 ? 0.07 : rand(0.12, 0.2));
      const dur = species === 2 ? 0.05 : rand(0.08, 0.16);
      const f0 = base * (species === 1 && i === 1 ? 0.8 : rand(0.95, 1.08));
      o.frequency.setValueAtTime(f0, st);
      o.frequency.exponentialRampToValueAtTime(f0 * (species === 0 ? 1.35 : 0.75), st + dur);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0005, st + dur);
      o.connect(g).connect(out);
      o.start(st);
      o.stop(st + dur + 0.02);
    }
  }

  _cricket(k) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01;
    const out = this._pan(rand(-1, 1));
    const f = rand(4200, 5200);
    const vol = 0.012 * k * rand(0.5, 1);
    const pulses = 3 + Math.floor(rand(0, 4));
    for (let i = 0; i < pulses; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const st = t0 + i * 0.045;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.006);
      g.gain.linearRampToValueAtTime(0, st + 0.03);
      o.connect(g).connect(out);
      o.start(st);
      o.stop(st + 0.04);
    }
  }

  /** Rajada de ruído filtrado com envelope (base de passos e impactos). */
  _burst({ type = 'bandpass', freq = 1000, q = 1, dur = 0.08, vol = 0.2, attack = 0.004, sweep = 1, buffer = 'white', rate = 1 }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer === 'white' ? this.white : this.brown;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, rand(0, 1.5));
    src.stop(t0 + dur + 0.05);
  }

  _thump(freq, vol, dur) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  footstep(surface, k = 0.6) {
    const v = 0.5 + 0.5 * k;
    switch (surface) {
      case 'grass':
        this._burst({ type: 'highpass', freq: rand(2200, 3200), q: 0.6, dur: rand(0.09, 0.13), vol: 0.07 * v, attack: 0.01 });
        this._burst({ type: 'bandpass', freq: 500, q: 1, dur: 0.05, vol: 0.05 * v, buffer: 'brown' });
        break;
      case 'sand':
        this._burst({ type: 'lowpass', freq: rand(1100, 1500), q: 0.5, dur: rand(0.14, 0.2), vol: 0.13 * v, attack: 0.015 });
        break;
      case 'dirt':
        this._burst({ type: 'bandpass', freq: rand(700, 1000), q: 0.8, dur: 0.1, vol: 0.12 * v });
        this._thump(90, 0.08 * v, 0.06);
        break;
      case 'stone':
      case 'rock':
        this._burst({ type: 'bandpass', freq: rand(1800, 2600), q: 3, dur: 0.05, vol: 0.12 * v, attack: 0.002 });
        this._thump(rand(110, 140), 0.12 * v, 0.07);
        break;
      case 'wood':
        this._thump(rand(180, 220), 0.12 * v, 0.08);
        break;
      case 'water':
        this._burst({ type: 'bandpass', freq: rand(900, 1300), q: 1.2, dur: 0.22, vol: 0.12 * v, sweep: 2.2, attack: 0.01 });
        break;
      default:
        this._burst({ type: 'bandpass', freq: 900, q: 1, dur: 0.08, vol: 0.1 * v });
    }
  }

  jump() {
    this._burst({ type: 'bandpass', freq: 500, q: 0.8, dur: 0.18, vol: 0.05, sweep: 2.5, attack: 0.03 });
  }

  land(surface, k) {
    this.footstep(surface, 1);
    if (k > 0.1) this._thump(70, 0.15 + 0.25 * k, 0.15 + 0.1 * k);
  }

  glider(open) {
    // Tecido estalando ao abrir; sopro suave ao fechar.
    if (open) {
      this._burst({ type: 'bandpass', freq: 1400, q: 1.5, dur: 0.12, vol: 0.12, attack: 0.002 });
      setTimeout(() => this._burst({ type: 'bandpass', freq: 900, q: 1.2, dur: 0.25, vol: 0.08, sweep: 0.6 }), 60);
    } else {
      this._burst({ type: 'bandpass', freq: 800, q: 1, dur: 0.2, vol: 0.06, sweep: 0.5 });
    }
  }

  splash(k) {
    this._burst({ type: 'lowpass', freq: 2200, q: 0.7, dur: 0.5 + 0.3 * k, vol: 0.15 + 0.2 * k, attack: 0.005, sweep: 0.4 });
  }
}
