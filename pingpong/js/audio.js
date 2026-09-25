// Áudio 100% sintetizado: batidas, quiques, torcida (ambiente, aplausos,
// vibração), música de menu e locução do placar via speechSynthesis.
import { clamp, rnd } from './const.js';

export class Audio {
  constructor(settings) {
    this.st = settings;
    this.ctx = null;
    this.master = null;
    this.musicOn = false;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.crowdBus = c.createGain(); this.crowdBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    // reverb curto (sala) por convolução com ruído decaindo
    const len = c.sampleRate * 1.2, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb = c.createConvolver(); this.verb.buffer = ir;
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.18;
    this.sfxBus.connect(this.verb); this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // buffer de ruído reutilizável
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.applyVolumes();
    this.startCrowd();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const s = this.st;
    this.master.gain.value = s.sound ? s.volume : 0;
    this.sfxBus.gain.value = 1;
    this.crowdBus.gain.value = s.crowd ? 0.9 : 0;
    this.musicBus.gain.value = s.music ? 0.32 : 0;
  }

  // ─── primitivas ───
  noise(dur, { type = 'bandpass', freq = 2000, q = 1, vol = 0.3, attack = 0.001, bus = this.sfxBus, when = 0, pan = 0 } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = rnd(0.9, 1.1);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
    src.connect(f).connect(g); node.connect(bus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, when = 0, bus = this.sfxBus, attack = 0.002 } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  // ─── efeitos do jogo ───
  paddle(power, pan = 0, spinny = false) {
    if (!this.ctx) return;
    const p = clamp(power, 0, 1);
    // estalo seco da borracha + corpo da madeira
    this.noise(0.035 + p * 0.02, { freq: 2600 + p * 1400, q: 1.4, vol: 0.5 + p * 0.4, pan });
    this.tone(900 + p * 500, 0.05, { type: 'triangle', vol: 0.22 + p * 0.1, slide: 0.55 });
    this.tone(260, 0.06, { type: 'sine', vol: 0.18 * (1 - p * 0.5), slide: 0.7 });
    if (spinny) this.noise(0.06, { type: 'highpass', freq: 5000, vol: 0.12, attack: 0.01, pan });
    if (p > 0.85) this.noise(0.12, { type: 'lowpass', freq: 900, vol: 0.25 });
  }
  table(speed, pan = 0) {
    if (!this.ctx) return;
    const v = clamp(speed / 12, 0.15, 1);
    this.tone(1650 + rnd(-60, 60), 0.045, { type: 'sine', vol: 0.3 * v + 0.05, slide: 0.72 });
    this.noise(0.03, { freq: 3800, q: 2, vol: 0.28 * v, pan });
    this.tone(420, 0.07, { vol: 0.08 * v, slide: 0.6 });
  }
  net(cord) {
    if (!this.ctx) return;
    this.noise(cord ? 0.09 : 0.18, { type: 'lowpass', freq: cord ? 1800 : 700, vol: cord ? 0.35 : 0.3 });
    this.tone(cord ? 520 : 160, 0.1, { type: 'square', vol: 0.05, slide: 0.6 });
  }
  floor(vy) {
    if (!this.ctx) return;
    const v = clamp(Math.abs(vy) / 5, 0.05, 1);
    this.tone(1100, 0.05, { vol: 0.14 * v, slide: 0.6 });
    this.noise(0.03, { freq: 2500, vol: 0.12 * v });
  }
  whoosh(power) {
    if (!this.ctx || power < 0.35) return;
    this.noise(0.18, { type: 'bandpass', freq: 600 + power * 900, q: 0.8, vol: 0.07 * power, attack: 0.08 });
  }
  step() { if (this.ctx) this.noise(0.04, { type: 'bandpass', freq: 900, q: 3, vol: 0.05 }); }
  ui(kind = 'click') {
    if (!this.ctx) return;
    if (kind === 'click') this.tone(880, 0.05, { type: 'triangle', vol: 0.12, slide: 1.2 });
    else if (kind === 'back') this.tone(520, 0.06, { type: 'triangle', vol: 0.1, slide: 0.8 });
    else if (kind === 'buy') [784, 988, 1319].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.06, when: i * 0.06 }));
    else if (kind === 'error') this.tone(180, 0.15, { type: 'square', vol: 0.08 });
    else if (kind === 'coin') [1319, 1760].forEach((f, i) => this.tone(f, 0.1, { type: 'square', vol: 0.05, when: i * 0.07 }));
  }
  perfect() { if (this.ctx) { this.tone(1568, 0.12, { vol: 0.1 }); this.tone(2093, 0.18, { vol: 0.08, when: 0.05 }); } }
  target() { if (this.ctx) [880, 1175, 1568, 2093].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.05, when: i * 0.045 })); }
  jingle(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.12, when: i * 0.11, bus: this.musicBus }));
  }
  levelUp() { if (this.ctx) [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.12, when: i * 0.08 })); }

  // ─── torcida ───
  startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.035;
    src.connect(f).connect(g).connect(this.crowdBus); src.start();
    this.murmur = g;
    // modulação lenta (vozes)
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.35; lg.gain.value = 0.012; lfo.connect(lg).connect(g.gain); lfo.start();
  }
  crowdTension(x) { // 0..1 — rally longo, murmúrio sobe
    if (!this.ctx) return;
    this.murmur.gain.setTargetAtTime(0.03 + x * 0.05, this.ctx.currentTime, 0.5);
  }
  applause(intensity = 1, dur = 2.2) {
    if (!this.ctx) return;
    const n = Math.floor(90 * intensity);
    for (let i = 0; i < n; i++) {
      const when = Math.random() * dur * (0.4 + Math.random() * 0.6);
      this.noise(0.03, { freq: rnd(1200, 3500), q: rnd(1, 3), vol: rnd(0.03, 0.08) * intensity * (1 - when / dur * 0.7), when, bus: this.crowdBus, pan: rnd(-0.9, 0.9) });
    }
  }
  cheer(intensity = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * intensity, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1300, t + 0.4); f.frequency.linearRampToValueAtTime(900, t + 2);
    src.connect(f).connect(g).connect(this.crowdBus); src.start(t); src.stop(t + 2.5);
    this.applause(intensity, 2.4);
  }
  groan() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(380, t + 1);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.14, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    src.connect(f).connect(g).connect(this.crowdBus); src.start(t); src.stop(t + 1.4);
  }

  // ─── locutor ───
  say(text) {
    if (!this.st.voice || !this.st.sound || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR'; u.rate = 1.05; u.volume = Math.min(1, this.st.volume * 1.2);
      const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('pt'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {}
  }

  // ─── música de menu (sequenciador simples) ───
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const c = this.ctx, bpm = 104, beat = 60 / bpm;
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
    let step = 0, next = c.currentTime + 0.1;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const tick = () => {
      if (!this.musicOn) return;
      while (next < c.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % 4, s8 = step % 8, ch = prog[bar];
        const when = next - c.currentTime;
        // baixo
        if (s8 % 2 === 0) this.tone(mtof(ch[0] - 24), beat * 0.9, { type: 'triangle', vol: 0.16, when, bus: this.musicBus });
        // arpejo
        const n = ch[[0, 1, 2, 1, 0, 2, 1, 2][s8]] + (s8 >= 4 ? 12 : 0);
        this.tone(mtof(n), beat * 0.45, { type: 'square', vol: 0.028, when, bus: this.musicBus, attack: 0.005 });
        // bateria
        if (s8 % 4 === 0) this.tone(110, 0.18, { vol: 0.3, slide: 0.35, when, bus: this.musicBus });
        if (s8 % 4 === 2) this.noise(0.12, { type: 'highpass', freq: 1800, vol: 0.12, when, bus: this.musicBus });
        this.noise(0.03, { type: 'highpass', freq: 7000, vol: 0.04, when, bus: this.musicBus });
        // pad
        if (s8 === 0) ch.forEach(m => this.tone(mtof(m), beat * 3.8, { type: 'sawtooth', vol: 0.012, when, bus: this.musicBus, attack: 0.3 }));
        next += beat / 2; step++;
      }
      this.musicTimer = setTimeout(tick, 60);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }
}
