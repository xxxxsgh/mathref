/* ==========================================================================
   VECTRA ARENA — audio.js
   AudioManager: 100% procedural Web Audio sounds (no audio files).
   Every sound is synthesized from oscillators and filtered noise.
   ========================================================================== */

class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.musicNodes = null;
    this.lastStep = 0;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain();
    this.sfx = c.createGain();
    this.music = c.createGain();
    // gentle limiter so stacked gunshots never clip harshly
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.sfx.connect(this.comp);
    this.music.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(c.destination);

    // one shared second of white noise, reused by every noisy sound
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.ready = true;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.music.gain.setTargetAtTime(s.musicVolume * 0.5, t, 0.05);
  }

  // ---- low level helpers -------------------------------------------------

  /** Output node for a sound, optionally panned / attenuated. */
  _out(volume = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = volume;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    return g;
  }

  _noise(dest, t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 1, freqEnd = null, attack = 0.002 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.003 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- game sounds -------------------------------------------------------

  shoot(weaponId, volume = 1, pan = 0, distant = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(volume, pan);
    const lp = distant ? 1800 : 9000;
    if (weaponId === 'sniper') {
      this._noise(out, t, 0.55, { type: 'lowpass', freq: lp, freqEnd: 300, gain: 1.0 });
      this._tone(out, t, 0.35, { type: 'sine', freq: 120, freqEnd: 38, gain: 0.9 });
      this._noise(out, t + 0.05, 0.9, { type: 'bandpass', freq: 500, q: 0.6, gain: 0.18, attack: 0.05 }); // tail
    } else if (weaponId === 'pistol') {
      this._noise(out, t, 0.16, { type: 'bandpass', freq: distant ? 1200 : 2600, q: 0.8, gain: 0.8 });
      this._tone(out, t, 0.1, { type: 'triangle', freq: 260, freqEnd: 90, gain: 0.5 });
    } else { // assault rifle / bots
      this._noise(out, t, 0.2, { type: 'lowpass', freq: lp, freqEnd: 700, gain: 0.75 });
      this._tone(out, t, 0.12, { type: 'square', freq: 150, freqEnd: 55, gain: 0.28 });
    }
  }

  dryFire() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(this._out(0.4), t, 0.04, { type: 'square', freq: 1800, gain: 0.3 });
  }

  reload(duration = 2) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.7);
    const click = (at, f) => {
      this._noise(out, t + at, 0.05, { type: 'highpass', freq: f, gain: 0.6 });
      this._tone(out, t + at, 0.04, { type: 'square', freq: f / 3, gain: 0.15 });
    };
    click(0.15, 3200);                 // mag out
    click(duration * 0.55, 2400);      // mag in
    click(duration * 0.85, 4200);      // charging handle
  }

  switchWeapon() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise(this._out(0.4), t, 0.08, { type: 'highpass', freq: 2500, gain: 0.5 });
  }

  knifeSwing(heavy = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise(this._out(0.6), t, heavy ? 0.35 : 0.22, {
      type: 'bandpass', freq: 600, freqEnd: heavy ? 3000 : 4500, q: 2.5, gain: 0.7, attack: 0.04,
    });
  }

  knifeHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.7);
    this._noise(out, t, 0.12, { type: 'lowpass', freq: 900, gain: 0.9 });
    this._tone(out, t, 0.08, { type: 'sine', freq: 180, freqEnd: 60, gain: 0.6 });
  }

  /** Metallic ring — several inharmonic partials decaying at different rates. */
  knifeInspect(rare = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.35);
    const base = rare ? 1320 : 2100;
    [1, 2.76, 5.4, 8.93].forEach((m, i) => {
      this._tone(out, t, 0.9 - i * 0.15, { type: 'sine', freq: base * m, gain: 0.25 / (i + 1) });
    });
    this._noise(out, t, 0.25, { type: 'bandpass', freq: 300, freqEnd: 2000, q: 1.5, gain: 0.25, attack: 0.05 });
    if (rare) {
      this._tone(out, t + 0.1, 1.6, { type: 'triangle', freq: 220, freqEnd: 880, gain: 0.2, attack: 0.3 });
    }
  }

  footstep(volume = 0.25, pan = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(volume, pan);
    this._noise(out, t, 0.09, { type: 'lowpass', freq: 500 + Math.random() * 300, gain: 0.8 });
    this._noise(out, t, 0.05, { type: 'highpass', freq: 3500, gain: 0.12 });
  }

  land() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise(this._out(0.5), t, 0.18, { type: 'lowpass', freq: 400, gain: 0.9 });
  }

  hit(headshot = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.45);
    if (headshot) {
      this._tone(out, t, 0.35, { type: 'sine', freq: 1900, gain: 0.5 });
      this._tone(out, t, 0.25, { type: 'sine', freq: 2850, gain: 0.25 });
    } else {
      this._tone(out, t, 0.06, { type: 'square', freq: 1400, gain: 0.18 });
    }
  }

  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.6);
    this._noise(out, t, 0.15, { type: 'lowpass', freq: 700, gain: 0.8 });
    this._tone(out, t, 0.15, { type: 'sawtooth', freq: 140, freqEnd: 70, gain: 0.2 });
  }

  death() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.7);
    this._tone(out, t, 1.2, { type: 'sawtooth', freq: 300, freqEnd: 40, gain: 0.35 });
    this._noise(out, t, 0.8, { type: 'lowpass', freq: 1200, freqEnd: 100, gain: 0.5 });
  }

  kill() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.35);
    this._tone(out, t, 0.12, { type: 'triangle', freq: 880, gain: 0.4 });
    this._tone(out, t + 0.08, 0.2, { type: 'triangle', freq: 1320, gain: 0.4 });
  }

  ui(kind = 'click') {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.3);
    if (kind === 'hover') this._tone(out, t, 0.05, { type: 'sine', freq: 2200, gain: 0.12 });
    else if (kind === 'back') this._tone(out, t, 0.1, { type: 'triangle', freq: 660, freqEnd: 330, gain: 0.3 });
    else if (kind === 'equip') {
      this._tone(out, t, 0.1, { type: 'triangle', freq: 660, gain: 0.3 });
      this._tone(out, t + 0.07, 0.18, { type: 'triangle', freq: 990, gain: 0.3 });
    } else this._tone(out, t, 0.07, { type: 'triangle', freq: 1100, freqEnd: 1500, gain: 0.3 });
  }

  roundStart() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.5);
    [0, 0.12, 0.24].forEach((d, i) => this._tone(out, t + d, 0.25, { type: 'square', freq: 440 * (1 + i * 0.25), gain: 0.15 }));
  }

  roundEnd(win) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const out = this._out(0.5);
    const notes = win ? [523, 659, 784, 1046] : [392, 330, 262];
    notes.forEach((f, i) => this._tone(out, t + i * 0.14, 0.4, { type: 'triangle', freq: f, gain: 0.3 }));
  }

  // ---- ambient music: dark synth drone with a slow filter sweep ---------

  startMusic() {
    if (!this.ready || this.musicNodes) return;
    const c = this.ctx;
    const t = c.currentTime;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 4;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 3);
    filter.connect(g); g.connect(this.music);
    const oscs = [55, 55.4, 82.4, 110.3].map((f, i) => {
      const o = c.createOscillator();
      o.type = i < 2 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      o.connect(filter);
      o.start(t);
      return o;
    });
    lfo.start(t);
    // slow pulsing "heartbeat" sub
    const pulse = c.createOscillator();
    pulse.frequency.value = 41;
    const pg = c.createGain();
    pg.gain.value = 0;
    const plfo = c.createOscillator();
    plfo.type = 'square';
    plfo.frequency.value = 0.5;
    const plg = c.createGain();
    plg.gain.value = 0.08;
    plfo.connect(plg); plg.connect(pg.gain);
    pulse.connect(pg); pg.connect(this.music);
    pulse.start(t); plfo.start(t);
    this.musicNodes = { oscs: [...oscs, lfo, pulse, plfo], g };
  }

  stopMusic() {
    if (!this.musicNodes) return;
    const t = this.ctx.currentTime;
    this.musicNodes.g.gain.setTargetAtTime(0.0001, t, 0.5);
    const nodes = this.musicNodes.oscs;
    setTimeout(() => nodes.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }), 2500);
    this.musicNodes = null;
  }
}
