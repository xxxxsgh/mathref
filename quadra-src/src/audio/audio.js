// Áudio 100% sintetizado (WebAudio): chute, trave, rede, quique, apito e
// torcida. Nada de arquivo de som — o jogo continua leve.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowd = null;
    this.excite = 0;
    this.muted = false;
  }

  /** Precisa de um gesto do usuário (botão Jogar). */
  start(crowdLevel = 1) {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise(2);
    // torcida: ruído filtrado em laço, volume pela empolgação
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    this.crowd = this.ctx.createGain();
    this.crowd.gain.value = 0;
    this.crowdBase = 0.05 * crowdLevel;
    src.connect(bp).connect(this.crowd).connect(this.master);
    src.start();
  }

  makeNoise(seconds) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  burst(freq, q, peak, dur, type = 'lowpass') {
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.004, peak, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  tone(freq, peak, dur, type = 'sine', glide = 0) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.003, peak, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(speed) {
    if (!this.ctx) return;
    const k = Math.min(1, speed / 30);
    this.tone(110, 0.25 + 0.4 * k, 0.12, 'sine', 0.45);
    this.burst(1800, 0.7, 0.08 + 0.25 * k, 0.05);
  }
  touch() {
    if (!this.ctx) return;
    this.tone(140, 0.08, 0.06, 'sine', 0.6);
  }
  bounce(v) {
    if (!this.ctx) return;
    this.tone(90, Math.min(0.3, v * 0.06), 0.09, 'sine', 0.5);
  }
  post() {
    if (!this.ctx) return;
    for (const [f, a] of [[620, 0.25], [1370, 0.16], [2210, 0.1], [3050, 0.06]]) this.tone(f, a, 0.9, 'sine', 0.995);
    this.excite = Math.max(this.excite, 0.6);
  }
  net() {
    if (!this.ctx) return;
    this.burst(2500, 0.5, 0.18, 0.35, 'bandpass');
  }
  whistle(long = false) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = long ? 0.9 : 0.35;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2900;
    const lfo = c.createOscillator();
    lfo.frequency.value = 38;
    const lg = c.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain();
    this.env(g, t, 0.01, 0.13, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }
  goal() {
    this.excite = 1.6;
  }
  save() {
    this.excite = Math.max(this.excite, 0.7);
  }

  frame(dt, tension) {
    if (!this.ctx || !this.crowd) return;
    this.excite = Math.max(0, this.excite - dt * 0.35);
    const target = this.crowdBase * (1 + 2.2 * tension + 6 * this.excite);
    this.crowd.gain.setTargetAtTime(Math.min(0.6, target), this.ctx.currentTime, 0.25);
  }
}
