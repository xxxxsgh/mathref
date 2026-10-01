/**
 * Áudio 100% sintetizado (Web Audio) — nenhum arquivo de som.
 *
 * Barramentos: master → { sfx, music }. Sons no mundo recebem posição:
 * atenuação por distância + pan estéreo relativo ao ouvinte (yaw da câmera).
 * Ruído branco é gerado uma vez e reaproveitado por todos os efeitos.
 */
export class AudioManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.volumes = { master: 0.8, music: 0.35, sfx: 0.9 };
    this.musicNodes = null;
    this.lastFootstep = 0;
  }

  /** Cria o contexto no primeiro gesto do usuário (exigência dos navegadores). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    // compressor no master: tiros em sequência não estouram
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  /** @param {{ masterVolume: number, musicVolume: number, sfxVolume: number }} s */
  setVolumes(s) {
    this.volumes = { master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume };
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.2);
  }

  setListener(x, y, z, yaw) {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  /**
   * Nó de saída com volume/pan para uma posição (ou 2D se pos = null).
   * @param {{x:number,y:number,z:number}|null} pos
   * @param {number} gain
   * @param {number} [maxDist]
   */
  out(pos, gain, maxDist = 60) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const g = ctx.createGain();
    let vol = gain;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dz = pos.z - this.listener.z;
      const dist = Math.hypot(dx, pos.y - this.listener.y, dz);
      vol *= Math.max(0, 1 - dist / maxDist) ** 1.6 / (1 + dist * 0.04);
      // direita do ouvinte = (cos yaw, -sin yaw) no plano XZ (yaw 0 olha -Z)
      const rx = Math.cos(this.listener.yaw);
      const rz = -Math.sin(this.listener.yaw);
      pan = dist > 0.5 ? Math.max(-1, Math.min(1, ((dx * rx + dz * rz) / dist) * 0.85)) : 0;
    }
    g.gain.value = vol;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfx);
    } else g.connect(this.sfx);
    return { node: g, vol };
  }

  /** Ruído filtrado com envelope. */
  noiseBurst(dest, t, dur, type, freq, q, peak, attack = 0.002) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
    return f;
  }

  /** Oscilador com glide de frequência e envelope. */
  tone(dest, t, dur, type, f0, f1, peak, attack = 0.002) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * Disparo. Cada arma tem um "corpo" (grave), "estalo" (ruído agudo) e
   * "cauda" (reverberação falsa por ruído passa-baixa longo).
   * @param {string} kind
   * @param {{x:number,y:number,z:number}|null} pos
   */
  shot(kind, pos = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const P = {
      rifle: { body: 95, crack: 2600, tail: 0.32, gain: 0.55, dur: 0.12 },
      smg: { body: 130, crack: 3400, tail: 0.22, gain: 0.42, dur: 0.08 },
      dmr: { body: 70, crack: 2000, tail: 0.6, gain: 0.75, dur: 0.18 },
      pistol: { body: 150, crack: 3000, tail: 0.25, gain: 0.45, dur: 0.09 },
      heavy: { body: 75, crack: 1800, tail: 0.5, gain: 0.7, dur: 0.16 },
    }[kind] || { body: 100, crack: 2500, tail: 0.3, gain: 0.5, dur: 0.1 };
    const { node, vol } = this.out(pos, P.gain, 90);
    if (vol < 0.002) return;
    this.noiseBurst(node, t, P.dur, 'bandpass', P.crack, 0.8, 1.0, 0.001);
    this.noiseBurst(node, t, P.dur * 1.6, 'lowpass', 900, 0.7, 0.8, 0.001);
    this.tone(node, t, P.dur * 1.4, 'sine', P.body * 1.8, P.body * 0.6, 0.9, 0.001);
    this.noiseBurst(node, t + 0.02, P.tail, 'lowpass', pos ? 500 : 700, 0.5, 0.18, 0.02);
  }

  knifeSwish(heavy = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node } = this.out(null, heavy ? 0.4 : 0.3);
    const f = this.noiseBurst(node, t, heavy ? 0.28 : 0.18, 'bandpass', 1200, 1.5, 0.7, 0.03);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.15);
  }

  /** Impacto de faca: metal/carne genérica (não gráfico). */
  knifeHit(pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node } = this.out(pos, 0.6, 30);
    this.noiseBurst(node, t, 0.12, 'lowpass', 600, 1, 0.9);
    this.tone(node, t, 0.08, 'triangle', 220, 90, 0.4);
  }

  /** @param {'concrete'|'metal'|'wood'|string} surface @param {{x:number,y:number,z:number}} pos */
  impact(surface, pos) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node, vol } = this.out(pos, 0.25, 35);
    if (vol < 0.003) return;
    if (surface === 'metal') {
      this.tone(node, t, 0.18, 'triangle', 2400 + Math.random() * 800, 1800, 0.35);
      this.noiseBurst(node, t, 0.05, 'highpass', 4000, 0.7, 0.5);
    } else {
      this.noiseBurst(node, t, 0.07, 'bandpass', 1400 + Math.random() * 600, 1.1, 0.7);
    }
  }

  hitmarker(headshot) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node } = this.out(null, headshot ? 0.32 : 0.18);
    if (headshot) {
      this.tone(node, t, 0.22, 'sine', 1900, 1750, 0.8);
      this.tone(node, t, 0.22, 'sine', 2850, 2700, 0.35);
    } else this.tone(node, t, 0.05, 'square', 1500, 1300, 0.35);
  }

  killConfirm() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node } = this.out(null, 0.25);
    this.tone(node, t, 0.09, 'triangle', 880, 880, 0.6);
    this.tone(node, t + 0.08, 0.16, 'triangle', 1320, 1320, 0.6);
  }

  /** Dano recebido: baque grave. */
  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node } = this.out(null, 0.35);
    this.tone(node, t, 0.18, 'sine', 140, 60, 0.9);
    this.noiseBurst(node, t, 0.1, 'lowpass', 500, 0.7, 0.5);
  }

  /** @param {string} surface @param {{x:number,y:number,z:number}|null} pos @param {number} loud */
  footstep(surface, pos, loud = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node, vol } = this.out(pos, 0.16 * loud, 28);
    if (vol < 0.002) return;
    if (surface === 'metal') {
      this.noiseBurst(node, t, 0.09, 'bandpass', 2200, 2.5, 0.8);
      this.tone(node, t, 0.12, 'triangle', 420 + Math.random() * 60, 380, 0.25);
    } else {
      this.noiseBurst(node, t, 0.07, 'bandpass', 700 + Math.random() * 300, 1.2, 0.9);
      this.noiseBurst(node, t + 0.012, 0.05, 'highpass', 3000, 0.7, 0.25);
    }
  }

  land(surface) {
    this.footstep(surface, null, 2.2);
  }

  /** Mecânica de arma: 'magOut' | 'magIn' | 'bolt' | 'dry' | 'draw' | 'inspect' | 'zoom' */
  mech(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node } = this.out(null, 0.3);
    switch (kind) {
      case 'magOut':
        this.noiseBurst(node, t, 0.06, 'bandpass', 2500, 3, 0.8);
        this.tone(node, t, 0.05, 'square', 900, 600, 0.15);
        break;
      case 'magIn':
        this.noiseBurst(node, t, 0.05, 'bandpass', 1800, 2, 1.0);
        this.tone(node, t + 0.02, 0.06, 'square', 500, 300, 0.25);
        break;
      case 'bolt':
        this.noiseBurst(node, t, 0.08, 'bandpass', 3200, 4, 0.9);
        this.noiseBurst(node, t + 0.11, 0.06, 'bandpass', 2600, 4, 1.0);
        break;
      case 'dry':
        this.tone(node, t, 0.03, 'square', 2200, 1800, 0.3);
        break;
      case 'draw':
        this.noiseBurst(node, t, 0.18, 'bandpass', 900, 0.9, 0.35, 0.04);
        this.noiseBurst(node, t + 0.12, 0.05, 'bandpass', 2800, 3, 0.5);
        break;
      case 'inspect':
        this.noiseBurst(node, t, 0.22, 'bandpass', 1600, 1.4, 0.25, 0.06);
        break;
      case 'flip': {
        const f = this.noiseBurst(node, t, 0.2, 'bandpass', 900, 2, 0.35, 0.03);
        f.frequency.exponentialRampToValueAtTime(3000, t + 0.18);
        break;
      }
      case 'zoom':
        this.tone(node, t, 0.05, 'square', 1200, 1600, 0.12);
        break;
    }
  }

  /** Sinais de interface e de round. */
  ui(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { node } = this.out(null, 0.22);
    switch (kind) {
      case 'click':
        this.tone(node, t, 0.04, 'triangle', 900, 700, 0.4);
        break;
      case 'hover':
        this.tone(node, t, 0.03, 'sine', 1400, 1300, 0.12);
        break;
      case 'buy':
        this.tone(node, t, 0.08, 'triangle', 660, 660, 0.5);
        this.tone(node, t + 0.07, 0.12, 'triangle', 990, 990, 0.5);
        break;
      case 'deny':
        this.tone(node, t, 0.14, 'square', 180, 150, 0.3);
        break;
      case 'roundStart':
        for (let i = 0; i < 3; i++) this.tone(node, t + i * 0.16, 0.09, 'sine', i === 2 ? 1320 : 880, i === 2 ? 1320 : 880, 0.5);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(node, t + i * 0.1, 0.35, 'triangle', f, f, 0.45));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(node, t + i * 0.14, 0.4, 'triangle', f, f * 0.98, 0.45));
        break;
      case 'capture':
        this.tone(node, t, 0.12, 'sine', 600, 900, 0.35);
        break;
      case 'tick':
        this.tone(node, t, 0.04, 'sine', 1000, 1000, 0.25);
        break;
      case 'equip':
        this.noiseBurst(node, t, 0.2, 'bandpass', 2400, 2, 0.4, 0.02);
        this.tone(node, t + 0.05, 0.25, 'sine', 1700, 2400, 0.25);
        break;
      case 'rare':
        [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(node, t + i * 0.07, 0.5, 'sine', f, f, 0.3));
        break;
    }
  }

  /**
   * Trilha generativa: pad de dois osciladores desafinados, filtro lento e
   * troca de acorde a cada 6 s. `intensity` 0 = menu, 1 = partida.
   */
  startMusic(intensity = 0) {
    if (!this.ctx || this.musicNodes) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(intensity ? 0.12 : 0.2, ctx.currentTime + 3);
    filter.connect(g);
    g.connect(this.music);
    const chords = [
      [110, 164.8, 220, 261.6],
      [98, 146.8, 196, 246.9],
      [87.3, 130.8, 174.6, 220],
      [103.8, 155.6, 207.7, 246.9],
    ];
    const oscs = [];
    for (let i = 0; i < 4; i++) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = det;
        o.frequency.value = chords[0][i];
        const og = ctx.createGain();
        og.gain.value = 0.05;
        o.connect(og);
        og.connect(filter);
        o.start();
        oscs.push({ o, i });
      }
    }
    let ci = 0;
    const timer = setInterval(() => {
      ci = (ci + 1) % chords.length;
      const t = ctx.currentTime;
      for (const { o, i } of oscs) o.frequency.setTargetAtTime(chords[ci][i], t, 0.8);
    }, 6000);
    this.musicNodes = { oscs, lfo, g, timer };
  }

  stopMusic() {
    if (!this.ctx || !this.musicNodes) return;
    const { oscs, lfo, g, timer } = this.musicNodes;
    clearInterval(timer);
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.4);
    for (const { o } of oscs) o.stop(t + 2);
    lfo.stop(t + 2);
    this.musicNodes = null;
  }
}
