import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Áudio: Web Audio puro, sem biblioteca e sem arquivos.
 *
 * ═══ POR QUE SINTETIZAR EM VEZ DE CARREGAR SAMPLES ═══
 *
 * Um pacote decente de efeitos de nave são alguns megabytes. Isso é mais que
 * o bundle inteiro do jogo, e no iOS o cache do service worker é limitado e
 * evictado agressivamente — ou seja, o download aconteceria de novo.
 *
 * Todo som aqui é gerado por osciladores e ruído em tempo real. Custo de
 * download: zero. E como o timbre é código, um tiro pode variar de altura a
 * cada disparo sem precisar de dez variações gravadas.
 *
 * ═══ ÁUDIO POSICIONAL ═══
 *
 * `THREE.PositionalAudio` acopla um `PannerNode` à matriz de transformação de
 * um objeto da cena, e o `AudioListener` à câmera. Sem isso teríamos que
 * sincronizar posição e orientação na mão todo frame — que é exatamente o que
 * a Howler exigiria.
 *
 * ═══ iOS ═══
 *
 * O `AudioContext` nasce suspenso e só destrava dentro de um gesto do
 * usuário. É por isso que o jogo tem uma tela inicial com botão: ela existe
 * tanto por isso quanto pelo Pointer Lock.
 */
export class AudioSystem {
  /** @param {THREE.PerspectiveCamera} camera */
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.enabled = true;
    this.unlocked = false;

    // Cadeia mestra: tudo passa por aqui, então mudo/volume são um nó só.
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.audio.masterVolume;
    this.master.connect(this.listener.getInput());

    // Compressor no fim da cadeia. Numa explosão com dez sons simultâneos as
    // amplitudes somam e estouram em distorção digital; o compressor segura
    // os picos sem que a gente tenha que gerenciar prioridade de voz.
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;
    this.compressor.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = CONFIG.audio.sfxVolume;
    this.sfxBus.connect(this.compressor);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.compressor);

    this._noiseBuffer = null;
    this._engine = null;
    this._lastShot = 0;
    this._drone = null;
  }

  /** Chamado no gesto de "Iniciar". */
  async unlock() {
    if (this.unlocked) return;
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.unlocked = true;
      this._startEngine();
      this._startAmbience();
    } catch (e) {
      console.warn('[audio] não foi possível destravar:', e?.name ?? e);
      this.enabled = false;
    }
  }

  setMuted(muted) {
    this.master.gain.setTargetAtTime(
      muted ? 0 : CONFIG.audio.masterVolume, this.ctx.currentTime, 0.05,
    );
  }

  /** Buffer de ruído branco, gerado uma vez e reusado por todos os efeitos.
   *  Regerar ruído por disparo alocaria centenas de KB por segundo. */
  _noise() {
    if (this._noiseBuffer) return this._noiseBuffer;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    return buf;
  }

  // ───────────────────────────────────────────────────────────────────────
  /** Motor: dois osciladores em quinta + ruído filtrado, modulados pelo
   *  acelerador. Contínuos — nunca são recriados, só reajustados. */
  _startEngine() {
    if (this._engine) return;
    const ctx = this.ctx;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.sfxBus);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 3;
    filter.connect(gain);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 60;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    // Quinta justa (razão 3:2). Duas notas em intervalo consonante soam como
    // uma máquina; duas notas arbitrárias soam como um erro.
    osc2.frequency.value = 90;

    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.5;
    osc1.connect(oscGain); osc2.connect(oscGain);
    oscGain.connect(filter);

    const noise = ctx.createBufferSource();
    noise.buffer = this._noise();
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.22;
    noise.connect(noiseGain);
    noiseGain.connect(filter);

    osc1.start(); osc2.start(); noise.start();
    this._engine = { gain, filter, osc1, osc2, noiseGain };
  }

  /** Zumbido ambiente grave: preenche o silêncio do espaço. Sem ele o jogo
   *  parece que o áudio quebrou sempre que nada está acontecendo. */
  _startAmbience() {
    if (this._drone) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.musicBus);
    this.musicBus.gain.setTargetAtTime(CONFIG.audio.ambienceVolume, ctx.currentTime, 2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.connect(gain);

    // Três osciladores levemente desafinados entre si. O batimento entre
    // frequências próximas cria uma pulsação lenta que soa "viva" — é o
    // mesmo princípio de um coro.
    for (const f of [55, 55.3, 82.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
    }
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 3);
    this._drone = { gain, filter };
  }

  /** @param {number} throttle 0..1 @param {boolean} boost @param {number} dt */
  updateEngine(throttle, boost, dt) {
    if (!this._engine || !this.unlocked) return;
    const e = this._engine;
    const t = this.ctx.currentTime;
    const level = CONFIG.audio.engineVolume * (0.18 + throttle * 0.8 + (boost ? 0.5 : 0));
    // `setTargetAtTime` faz a transição no thread de áudio, sem cliques —
    // atribuir `.value` direto produz um degrau audível.
    e.gain.gain.setTargetAtTime(level, t, 0.08);
    const pitch = 52 + throttle * 46 + (boost ? 38 : 0);
    e.osc1.frequency.setTargetAtTime(pitch, t, 0.12);
    e.osc2.frequency.setTargetAtTime(pitch * 1.5, t, 0.12);
    e.filter.frequency.setTargetAtTime(320 + throttle * 900 + (boost ? 700 : 0), t, 0.1);
  }

  // ── Efeitos pontuais ────────────────────────────────────────────────────
  /** Envelope curto genérico. Todos os efeitos abaixo são variações disto. */
  _blip({ type = 'square', freq = 440, freqEnd = null, duration = 0.12, gain = 0.3,
          filterFreq = null, filterQ = 1, noise = false, delay = 0 }) {
    if (!this.unlocked || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    // Ataque de 6ms: instantâneo pro ouvido, mas não zero — subida
    // perfeitamente vertical produz um clique de descontinuidade.
    g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    let node;
    if (noise) {
      node = ctx.createBufferSource();
      node.buffer = this._noise();
      node.loop = true;
    } else {
      node = ctx.createOscillator();
      node.type = type;
      node.frequency.setValueAtTime(freq, t0);
      if (freqEnd !== null) {
        node.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
      }
    }

    let last = node;
    if (filterFreq !== null) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(filterFreq, t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, filterFreq * 0.15), t0 + duration);
      f.Q.value = filterQ;
      last.connect(f);
      last = f;
    }
    last.connect(g);
    g.connect(this.sfxBus);

    node.start(t0);
    node.stop(t0 + duration + 0.02);
    // Os nós são descartados sozinhos quando param; não há o que limpar.
  }

  shoot() {
    // Limita a taxa: com 17 tiros por segundo, cada um com seu envelope, o
    // resultado somado estoura o compressor e vira serra.
    const now = this.ctx.currentTime;
    if (now - this._lastShot < 0.045) return;
    this._lastShot = now;
    // Altura variando levemente por disparo: uma rajada de tiros idênticos
    // soa como um bug de áudio, não como uma arma.
    const base = 900 + (Math.random() - 0.5) * 160;
    this._blip({ type: 'sawtooth', freq: base, freqEnd: base * 0.25, duration: 0.1, gain: 0.16, filterFreq: 2600 });
  }

  enemyShoot() {
    this._blip({ type: 'square', freq: 380, freqEnd: 140, duration: 0.13, gain: 0.07, filterFreq: 1200 });
  }

  explosion(scale = 1) {
    this._blip({ noise: true, duration: 0.85 * scale, gain: 0.42, filterFreq: 900 * scale, filterQ: 1.4 });
    this._blip({ type: 'sine', freq: 130 * scale, freqEnd: 24, duration: 0.7 * scale, gain: 0.34 });
    this._blip({ noise: true, duration: 0.3, gain: 0.2, filterFreq: 4200, delay: 0.02 });
  }

  hitShield() {
    this._blip({ type: 'sine', freq: 1500, freqEnd: 700, duration: 0.16, gain: 0.2 });
    this._blip({ type: 'triangle', freq: 2400, freqEnd: 1200, duration: 0.09, gain: 0.1 });
  }

  hitHull() {
    this._blip({ noise: true, duration: 0.2, gain: 0.3, filterFreq: 1400 });
    this._blip({ type: 'square', freq: 190, freqEnd: 70, duration: 0.22, gain: 0.22 });
  }

  overheat() {
    this._blip({ type: 'sawtooth', freq: 220, freqEnd: 90, duration: 0.4, gain: 0.22, filterFreq: 900 });
  }

  boostStart() {
    this._blip({ type: 'sawtooth', freq: 90, freqEnd: 300, duration: 0.4, gain: 0.24, filterFreq: 1600 });
  }

  barrelRoll() {
    this._blip({ type: 'triangle', freq: 300, freqEnd: 900, duration: 0.28, gain: 0.16 });
  }

  /** Acorde ascendente: conclusão de missão, upgrade comprado. */
  chime(good = true) {
    const notes = good ? [523.25, 659.25, 783.99] : [392, 311.13];
    notes.forEach((f, i) => {
      this._blip({ type: 'triangle', freq: f, duration: 0.5, gain: 0.16, delay: i * 0.09 });
    });
  }

  dock() {
    this._blip({ type: 'sine', freq: 220, freqEnd: 440, duration: 0.5, gain: 0.2 });
    this._blip({ type: 'sine', freq: 330, duration: 0.6, gain: 0.14, delay: 0.12 });
  }

  /** Ruído de reentrada: contínuo enquanto houver calor. */
  updateReentry(intensity) {
    if (!this.unlocked) return;
    if (intensity < 0.05) {
      if (this._reentry) {
        this._reentry.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      }
      return;
    }
    if (!this._reentry) {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.sfxBus);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.8;
      filter.connect(gain);
      const src = ctx.createBufferSource();
      src.buffer = this._noise();
      src.loop = true;
      src.connect(filter);
      src.start();
      this._reentry = { gain, filter, src };
    }
    const t = this.ctx.currentTime;
    this._reentry.gain.gain.setTargetAtTime(intensity * 0.34, t, 0.15);
    this._reentry.filter.frequency.setTargetAtTime(400 + intensity * 1500, t, 0.2);
  }

  dispose() {
    try {
      this._engine?.osc1.stop();
      this._engine?.osc2.stop();
      this._reentry?.src.stop();
    } catch { /* já parados */ }
  }
}
