import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Áudio inteiro sintetizado em Web Audio. Zero samples, zero bytes baixados.
 *
 * O motor é o som principal do jogo e ganhou o tempo que merece. Ele NÃO é um
 * loop com pitch shift: são quatro harmônicas somadas, cada uma com seu ganho,
 * mais uma camada de ruído filtrado que representa o ar batendo nas hélices.
 * É por isso que acelerar soa como esforço e não como um botão de volume — as
 * harmônicas altas entram antes das baixas, exatamente como num motor de verdade.
 *
 * De olhos fechados o jogador precisa saber três coisas: se está acelerando (tom
 * e brilho do motor), se tem parede perto (eco curto que aparece) e se a bateria
 * está acabando (bipe que ninguém confunde com outra coisa).
 */
export class AudioSystem {
  constructor(save) {
    this.save = save;
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this._musicLayer = null;
    this._alertClock = 0;
    this._lastAlert = 0;
  }

  /**
   * O AudioContext nasce suspenso e só destrava com gesto do usuário — regra
   * de todos os navegadores. Por isso a construção inteira acontece no primeiro
   * toque/tecla, não na abertura da página.
   */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ready;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;

    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return false;
    }

    this._buildGraph();
    this.ready = true;
    return true;
  }

  _buildGraph() {
    const ctx = this.ctx;
    const volume = this.save.options.volume;

    // ── Barramentos ────────────────────────────────────────────────────
    this.master = ctx.createGain();
    this.master.gain.value = volume.master;
    // Compressor no fim: sem ele, motor + vento + música + alerta somados
    // estouram e o resultado é distorção suja, não intensidade.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.master.connect(this.limiter).connect(ctx.destination);

    this.buses = {};
    for (const name of ['engine', 'wind', 'sfx', 'music']) {
      const gain = ctx.createGain();
      gain.gain.value = volume[name];
      gain.connect(this.master);
      this.buses[name] = gain;
    }

    this._buildEngine();
    this._buildWind();
    this._buildProximity();
    this._buildMusic();
  }

  // ── Motor ─────────────────────────────────────────────────────────────
  _buildEngine() {
    const ctx = this.ctx;
    this.engine = { partials: [], gain: ctx.createGain() };
    this.engine.gain.gain.value = 0;

    // Filtro passa-baixa aberto pelo RPM: em marcha lenta o motor é abafado e
    // em cima ele fica áspero. Só o pitch subindo soa a brinquedo.
    this.engine.filter = ctx.createBiquadFilter();
    this.engine.filter.type = 'lowpass';
    this.engine.filter.frequency.value = 600;
    this.engine.filter.Q.value = 0.7;
    this.engine.gain.connect(this.engine.filter).connect(this.buses.engine);

    for (let i = 0; i < CONFIG.AUDIO.engineHarmonics; i++) {
      const osc = ctx.createOscillator();
      // Dente de serra nas graves e quadrada nas agudas: a mistura evita o
      // timbre de órgão que sai de senoides puras empilhadas.
      osc.type = i === 0 ? 'sawtooth' : i % 2 ? 'square' : 'sawtooth';
      const gain = ctx.createGain();
      // Harmônicas mais altas entram mais fracas, senão vira serra elétrica.
      gain.gain.value = 0.5 / (i + 1) ** 1.35;
      osc.connect(gain).connect(this.engine.gain);
      osc.start();
      this.engine.partials.push({ osc, gain, ratio: i + 1 });
    }

    // Ruído das hélices cortando o ar, ligado ao esforço.
    this.engine.noise = ctx.createBufferSource();
    this.engine.noise.buffer = this._noiseBuffer(2);
    this.engine.noise.loop = true;
    this.engine.noiseFilter = ctx.createBiquadFilter();
    this.engine.noiseFilter.type = 'bandpass';
    this.engine.noiseFilter.frequency.value = 1800;
    this.engine.noiseFilter.Q.value = 0.8;
    this.engine.noiseGain = ctx.createGain();
    this.engine.noiseGain.gain.value = 0;
    this.engine.noise
      .connect(this.engine.noiseFilter)
      .connect(this.engine.noiseGain)
      .connect(this.buses.engine);
    this.engine.noise.start();
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ── Vento ─────────────────────────────────────────────────────────────
  _buildWind() {
    const ctx = this.ctx;
    this.wind = { source: ctx.createBufferSource(), filter: ctx.createBiquadFilter(), gain: ctx.createGain() };
    this.wind.source.buffer = this._noiseBuffer(3);
    this.wind.source.loop = true;
    this.wind.filter.type = 'bandpass';
    this.wind.filter.frequency.value = 500;
    this.wind.filter.Q.value = 0.55;
    this.wind.gain.gain.value = 0;
    this.wind.source.connect(this.wind.filter).connect(this.wind.gain).connect(this.buses.wind);
    this.wind.source.start();
  }

  /**
   * "Parede perto muda o som": um delay curto realimentado que só aparece
   * quando há geometria próxima. É reverb de fenda barato — e o efeito de
   * passar rente a um container é imediatamente reconhecível.
   */
  _buildProximity() {
    const ctx = this.ctx;
    this.proximity = { delay: ctx.createDelay(0.2), feedback: ctx.createGain(), wet: ctx.createGain() };
    this.proximity.delay.delayTime.value = 0.035;
    this.proximity.feedback.gain.value = 0.35;
    this.proximity.wet.gain.value = 0;

    this.engine.filter.connect(this.proximity.delay);
    this.proximity.delay.connect(this.proximity.feedback).connect(this.proximity.delay);
    this.proximity.delay.connect(this.proximity.wet).connect(this.buses.engine);
  }

  // ── Música por contexto ───────────────────────────────────────────────
  _buildMusic() {
    const ctx = this.ctx;
    this.music = { gain: ctx.createGain(), voices: [] };
    this.music.gain.gain.value = 0;
    this.music.gain.connect(this.buses.music);

    // Um acorde suspenso em drone (trocadilho não intencional): três vozes que
    // entram e saem por contexto. Melodia atrapalharia — o jogador precisa
    // ouvir o motor.
    for (const freq of [55, 82.41, 110, 164.81]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.music.gain);
      osc.start();
      this.music.voices.push({ osc, gain, base: freq });
    }
  }

  /**
   * Camada de música por contexto. Trocar é mexer no ganho de cada voz, não
   * dar play noutra faixa — assim a transição nunca corta.
   */
  setMusic(layer) {
    if (!this.ready || layer === this._musicLayer) return;
    this._musicLayer = layer;
    const t = this.ctx.currentTime;
    const targets = {
      exploracao: [0.16, 0.1, 0.05, 0],
      corrida: [0.2, 0.16, 0.12, 0.08],
      tensa: [0.22, 0, 0.14, 0.05],
      critico: [0.26, 0.12, 0, 0.16],
      nenhuma: [0, 0, 0, 0],
    };
    const target = targets[layer] ?? targets.nenhuma;
    this.music.gain.gain.setTargetAtTime(1, t, 0.4);
    this.music.voices.forEach((voice, i) => {
      voice.gain.gain.setTargetAtTime(target[i] ?? 0, t, 1.2);
      // A camada tensa desafina de propósito: dissonância pequena é lida como
      // "algo está errado" sem precisar de nenhum aviso na tela.
      voice.osc.frequency.setTargetAtTime(
        voice.base * (layer === 'tensa' ? 1.03 : 1),
        t,
        1.5,
      );
    });
  }

  // ── Loop ──────────────────────────────────────────────────────────────
  /**
   * @param {object} state  rpm, airSpeed, throttle, proximity (0..1), bateria…
   */
  update(dt, state) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const A = CONFIG.AUDIO;
    const t = this.ctx.currentTime;
    const smooth = 0.04;

    // Motor: frequência por RPM, com o Doppler somado como desvio relativo.
    const rpm = clamp(state.rpm, 0, 1);
    const doppler = 1 - clamp(state.approachSpeed / 340, -0.4, 0.4) * A.dopplerFactor;
    const fundamental = (A.engineHzIdle + (A.engineHzMax - A.engineHzIdle) * rpm) * doppler;

    for (const partial of this.engine.partials) {
      partial.osc.frequency.setTargetAtTime(fundamental * partial.ratio, t, smooth);
    }
    this.engine.gain.gain.setTargetAtTime(state.silent ? 0 : 0.12 + rpm * 0.5, t, smooth);
    this.engine.filter.frequency.setTargetAtTime(500 + rpm * 5200, t, smooth);
    this.engine.noiseGain.gain.setTargetAtTime(state.silent ? 0 : rpm * 0.14, t, smooth);
    this.engine.noiseFilter.frequency.setTargetAtTime(900 + rpm * 3600, t, smooth);

    // Vento pela velocidade DO AR, não pela velocidade no solo: parado com
    // vento forte na cara também assobia.
    const air = clamp(state.airSpeed / A.windSpeedRef, 0, 1.4);
    this.wind.gain.gain.setTargetAtTime(air * 0.34, t, 0.12);
    this.wind.filter.frequency.setTargetAtTime(320 + air * 1500, t, 0.12);

    this.proximity.wet.gain.setTargetAtTime(clamp(state.proximity, 0, 1) * 0.5, t, 0.08);

    this._updateAlert(dt, state);
  }

  /**
   * Alerta de bateria: dois bipes curtos que aceleram conforme piora.
   *
   * Reconhecível sem olhar a tela porque o RITMO carrega a informação, não o
   * timbre. Perto do fim ele fica quase contínuo, e isso é sentido como
   * urgência mesmo por quem não sabe o que o som significa.
   */
  _updateAlert(dt, state) {
    if (!state.batteryWarning || state.silent) return;
    const interval = state.batteryCritical ? 0.42 : 1.25;
    this._alertClock += dt;
    if (this._alertClock < interval) return;
    this._alertClock = 0;
    this.beep(state.batteryCritical ? 880 : 660, 0.09, 0.22);
  }

  // ── SFX ───────────────────────────────────────────────────────────────
  /** Bipe curto e seco. Base de quase todo efeito de UI do jogo. */
  beep(frequency, duration = 0.08, volume = 0.3, type = 'square') {
    if (!this.ready || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    // Envelope percussivo: ataque instantâneo e queda exponencial. Sem isso o
    // bipe estala no começo e no fim.
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.buses.sfx);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** Efeitos nomeados — quem chama não precisa saber de frequência nenhuma. */
  play(name) {
    if (!this.ready) return;
    switch (name) {
      case 'gate':
        this.beep(1320, 0.09, 0.3);
        break;
      case 'gatePerfect':
        // Duas notas subindo: "melhor que o normal" sem precisar de texto.
        this.beep(1320, 0.07, 0.28);
        setTimeout(() => this.beep(1760, 0.1, 0.32), 55);
        break;
      case 'scrape':
        this.beep(160, 0.14, 0.3, 'sawtooth');
        break;
      case 'checkpoint':
        this.beep(990, 0.08, 0.26);
        break;
      case 'crash':
        this.beep(90, 0.32, 0.42, 'sawtooth');
        break;
      case 'finish':
        [660, 880, 1320].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 0.3), i * 90));
        break;
      case 'signalLost':
        // Desce em vez de subir: queda é lida como perda universalmente.
        this.beep(520, 0.1, 0.24, 'sawtooth');
        setTimeout(() => this.beep(300, 0.16, 0.24, 'sawtooth'), 90);
        break;
      case 'reward':
        [880, 1180].forEach((f, i) => setTimeout(() => this.beep(f, 0.12, 0.26), i * 80));
        break;
      case 'ui':
        this.beep(740, 0.05, 0.16);
        break;
      default:
        break;
    }
  }

  setVolume(bus, value) {
    this.save.options.volume[bus] = value;
    this.save.write();
    if (!this.ready) return;
    const node = bus === 'master' ? this.master : this.buses[bus];
    node?.gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ready && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ready && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
