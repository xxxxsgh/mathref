// Áudio 100% sintetizado: caixinha de música procedural + efeitos.
const PENTA = [0, 2, 4, 7, 9];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const THEMES = {
  menu: { root: 62, tempo: 66, prog: [0, 5, 3, 4], pad: 0.05, density: 0.7 },
  desert: { root: 57, tempo: 60, prog: [0, 3, 5, 4], pad: 0.06, density: 0.55 },
  cisco: { root: 64, tempo: 76, prog: [0, 5, 3, 4], pad: 0.05, density: 0.8 },
  flight: { root: 67, tempo: 92, prog: [0, 4, 5, 3], pad: 0.05, density: 0.95 },
  clock: { root: 60, tempo: 70, prog: [0, 4, 0, 5], pad: 0.06, density: 0.6 },
  bells: { root: 65, tempo: 84, prog: [0, 3, 4, 0], pad: 0.04, density: 0.8 },
  sad: { root: 55, tempo: 54, prog: [5, 3, 0, 4], pad: 0.07, density: 0.4 },
  business: { root: 62, tempo: 100, prog: [0, 0, 4, 4], pad: 0.04, density: 0.9 },
  lamp: { root: 66, tempo: 110, prog: [0, 3, 4, 5], pad: 0.04, density: 0.85 },
  geo: { root: 59, tempo: 64, prog: [0, 5, 3, 4], pad: 0.06, density: 0.5 },
  earth: { root: 60, tempo: 68, prog: [0, 5, 3, 4], pad: 0.06, density: 0.6 },
  fox: { root: 64, tempo: 72, prog: [3, 4, 0, 5], pad: 0.06, density: 0.7 },
  night: { root: 57, tempo: 56, prog: [0, 5, 3, 4], pad: 0.08, density: 0.45 },
  end: { root: 62, tempo: 58, prog: [0, 3, 5, 4], pad: 0.08, density: 0.5 },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('ilo-mute') === '1'; } catch { /* sem storage */ }
    this.theme = null;
    this.step = 0;
    this.nextT = 0;
    this.seed = 1;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    // reverb com impulso gerado
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain).connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.verb);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.verb);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('ilo-mute', this.muted ? '1' : '0'); } catch { /* ok */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  tone(freq, t, dur, { type = 'sine', vol = 0.15, attack = 0.005, bus, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  noise(t, dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', sweep = 0 } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ─── música ───
  play(name) {
    const th = THEMES[name];
    if (!th || this.theme === th) return;
    this.theme = th;
    this.step = 0;
    this.seed = name.length * 97 + 13;
    if (this.ctx) this.nextT = this.ctx.currentTime + 0.3;
  }

  rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  schedule() {
    const ctx = this.ctx, th = this.theme;
    if (!ctx || !th || ctx.state !== 'running') return;
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.05;
    const beat = 60 / th.tempo / 2; // colcheias
    while (this.nextT < ctx.currentTime + 0.4) {
      const t = this.nextT, s = this.step;
      const bar = Math.floor(s / 8) % th.prog.length;
      const chordDeg = th.prog[bar];
      const chordRoot = th.root + [0, 2, 4, 5, 7, 9, 11][chordDeg % 7] - 12;
      if (s % 8 === 0) {
        // pad suave com dois osciladores
        for (const iv of [0, 7, 12]) {
          this.tone(mtof(chordRoot + iv), t, beat * 8.5, { type: 'sine', vol: th.pad, attack: 0.6, bus: this.musicBus, detune: iv ? 4 : -3 });
        }
        this.tone(mtof(chordRoot - 12), t, beat * 6, { type: 'triangle', vol: th.pad * 1.1, attack: 0.05, bus: this.musicBus });
      }
      // caixinha de música: arpejo pentatônico com respiros
      if (this.rand() < th.density * (s % 2 === 0 ? 1 : 0.55)) {
        const deg = PENTA[Math.floor(this.rand() * 5)];
        const oct = this.rand() < 0.3 ? 24 : 12;
        const f = mtof(th.root + deg + oct);
        this.tone(f, t, 1.4, { type: 'sine', vol: 0.06, bus: this.musicBus });
        this.tone(f * 2.01, t, 0.5, { type: 'sine', vol: 0.018, bus: this.musicBus });
      }
      this.nextT += beat;
      this.step++;
    }
  }

  // ─── efeitos ───
  sfx(name, arg = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    switch (name) {
      case 'blip': this.tone(700 + arg * 60 + Math.random() * 40, t, 0.05, { vol: 0.025, type: 'triangle' }); break;
      case 'chime': [0, 4, 7, 12].forEach((iv, i) => this.tone(mtof(76 + iv), t + i * 0.07, 1.2, { vol: 0.07 })); break;
      case 'done': [0, 7, 12, 16, 19].forEach((iv, i) => this.tone(mtof(72 + iv), t + i * 0.09, 1.6, { vol: 0.07, type: 'triangle' })); break;
      case 'star': this.tone(mtof(84 + PENTA[Math.floor(Math.random() * 5)] + (arg % 2) * 12), t, 0.8, { vol: 0.07 }); break;
      case 'pluck': this.noise(t, 0.12, { vol: 0.25, freq: 900, q: 2 }); this.tone(220, t, 0.25, { vol: 0.12, type: 'triangle' }); this.tone(330, t + 0.08, 0.3, { vol: 0.08 }); break;
      case 'clap': this.noise(t, 0.09, { vol: 0.45, freq: 1500, q: 0.8 }); this.noise(t + 0.02, 0.12, { vol: 0.3, freq: 2400, q: 0.8 }); break;
      case 'whoosh': this.noise(t, 1.2, { vol: 0.18, freq: 300, q: 0.7, sweep: 2500 }); break;
      case 'fail': this.tone(330, t, 0.25, { vol: 0.08, type: 'triangle' }); this.tone(262, t + 0.15, 0.4, { vol: 0.08, type: 'triangle' }); break;
      case 'water': for (let i = 0; i < 8; i++) this.tone(900 + Math.random() * 900, t + i * 0.06, 0.08, { vol: 0.03 }); break;
      case 'puff': this.noise(t, 0.4, { vol: 0.2, freq: 400, q: 0.5, sweep: 150 }); break;
      case 'jump': this.tone(420, t, 0.15, { vol: 0.04, type: 'triangle' }); break;
      case 'creak': for (let i = 0; i < 6; i++) this.noise(t + i * 0.18, 0.12, { vol: 0.12, freq: 500 + i * 40, q: 8 }); break;
      case 'laugh': for (let i = 0; i < 14; i++) this.tone(mtof(84 + PENTA[i % 5] + (i % 3) * 12), t + i * 0.08 + Math.random() * 0.05, 1.5, { vol: 0.045 }); break;
      case 'echo': [0, 0.45, 0.9, 1.35].forEach((d, i) => this.tone(mtof(69 + (i % 2) * 5), t + d, 0.35, { vol: 0.07 / (i + 1), type: 'triangle' })); break;
      case 'lamp': this.tone(mtof(79), t, 0.6, { vol: 0.07 }); this.noise(t, 0.2, { vol: 0.08, freq: 3000, q: 1 }); break;
      case 'page': this.noise(t, 0.25, { vol: 0.12, freq: 2500, q: 0.6 }); break;
    }
  }
}
