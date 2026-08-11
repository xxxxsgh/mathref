import { DCFG } from '../config.js';
import { clamp } from '../../core/MathUtils.js';

/**
 * Áudio do drone: quatro motores sintetizados, um por motor de verdade.
 *
 * ═══ POR QUE QUATRO OSCILADORES E NÃO UM SAMPLE ═══
 *
 * O som de um quadricóptero não é um zumbido. É o BATIMENTO entre quatro
 * motores que giram em velocidades quase iguais, mas não iguais. Quando duas
 * frequências próximas somam, a amplitude pulsa na diferença entre elas —
 * é isso que produz o "warble" característico, e é isso que faz um quad
 * manobrando soar diferente de um quad pairando, sem que nada além da
 * mixagem dos motores mude.
 *
 * Um sample gravado congela essa relação. Com quatro osciladores lendo os
 * quatro empuxos reais, a curva ganha a frequência certa de graça: numa
 * rolagem, os motores de um lado sobem e os do outro descem, e o batimento
 * acelera. Ninguém programou isso. Cai da física.
 *
 * ═══ AS OUTRAS DUAS CAMADAS ═══
 *
 *   • Vento — ruído rosa filtrado, com frequência de corte proporcional à
 *     velocidade do ar. É o que dá sensação de velocidade quando o
 *     acelerador está baixo num mergulho, momento em que os motores calam.
 *   • Sinal de vídeo — um chiado que entra com a distância, o mesmo que
 *     aparece na imagem. O piloto ouve que está longe antes de ler o OSD.
 *
 * Tudo sintetizado: zero bytes de download, e o timbre é código.
 *
 * ═══ iOS ═══
 *
 * O AudioContext nasce suspenso e só destrava dentro de um gesto do usuário.
 * É por isso que existe a tela inicial com botão.
 */
export class DroneAudio {
  constructor() {
    this.enabled = true;
    this.unlocked = false;
    this.ctx = null;
    this._motors = [];
    this._muted = false;
  }

  /** Chamado DENTRO do gesto de "Iniciar" — não há outra oportunidade no iOS. */
  async unlock() {
    if (this.unlocked) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { this.enabled = false; return; }
      this.ctx = new Ctor();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this._build();
      this.unlocked = true;
    } catch (e) {
      console.warn('[audio] não foi possível destravar:', e?.name ?? e);
      this.enabled = false;
    }
  }

  _build() {
    const ctx = this.ctx;
    const A = DCFG.audio;

    this.master = ctx.createGain();
    this.master.gain.value = A.masterVolume;

    // Compressor no fim da cadeia: quatro osciladores mais ruído somam
    // amplitude e estouram em distorção digital nos picos. O compressor
    // segura sem que a gente tenha que gerenciar prioridade de voz.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 9;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── Motores ────────────────────────────────────────────────────────
    for (let i = 0; i < 4; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.comp);

      // Passa-banda em vez de passa-baixa: uma hélice tem um pico de
      // ressonância na frequência de passagem de pá, não um espectro que
      // desce suavemente. O Q alto é o que dá o "apito" do quad.
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 400;
      filter.Q.value = 1.6;
      filter.connect(gain);

      // Serra + quadrada uma oitava acima: a serra dá o corpo, a quadrada
      // dá o brilho metálico. Só serra soa como abelha.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = A.motorHzIdle;
      osc.connect(filter);
      osc.start();

      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = A.motorHzIdle * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      osc2.connect(g2).connect(filter);
      osc2.start();

      this._motors.push({ osc, osc2, gain, filter, detune: A.motorDetune[i] });
    }

    // ── Vento ──────────────────────────────────────────────────────────
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.comp);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 300;
    this.windFilter.Q.value = 0.7;
    this.windFilter.connect(this.windGain);
    this._noiseSource(this.windFilter);

    // ── Chiado do link de vídeo ────────────────────────────────────────
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    this.staticGain.connect(this.comp);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    hp.connect(this.staticGain);
    this._noiseSource(hp);
  }

  /** Fonte de ruído branco em laço. Um buffer de 2 s gerado uma vez: regerar
   *  ruído por frame alocaria centenas de KB por segundo. */
  _noiseSource(dest) {
    const ctx = this.ctx;
    if (!this._noiseBuffer) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    src.connect(dest);
    src.start();
    return src;
  }

  /**
   * @param {import('../physics/Quad.js').Quad} quad
   * @param {number} signalLoss 0..1 — o mesmo valor usado pelo chuvisco
   * @param {number} distance metros até o piloto (só na vista de solo)
   */
  update(quad, signalLoss, listenerDistance, dt) {
    if (!this.unlocked || !this.enabled || this._muted) return;
    const A = DCFG.audio;
    const now = this.ctx.currentTime;
    // `setTargetAtTime` e não atribuição direta: mudar um parâmetro de áudio
    // em degrau produz um clique audível. A constante de tempo curta (~15 ms)
    // é rápida o bastante para acompanhar o acelerador e suave o bastante
    // para não estalar.
    const T = 0.015;

    for (let i = 0; i < 4; i++) {
      const m = this._motors[i];
      const t = quad.motorThrust[i];
      // Frequência ∝ raiz do empuxo: empuxo cresce com o quadrado da
      // rotação, então a rotação (e o tom) cresce com a raiz do empuxo.
      // Sem isso o tom sobe linear e soa como um motor elétrico de brinquedo.
      const hz = (A.motorHzIdle + (A.motorHzFull - A.motorHzIdle) * Math.sqrt(t))
        * m.detune;
      m.osc.frequency.setTargetAtTime(hz, now, T);
      m.osc2.frequency.setTargetAtTime(hz * 2, now, T);
      m.filter.frequency.setTargetAtTime(hz * 2.1, now, T);

      // Volume por motor. Divide por 4 porque quatro fontes somam.
      let g = quad.armed ? (0.05 + t * 0.28) / 4 : 0;
      // Distância só importa na vista de solo — em FPV o "ouvido" está no
      // drone. É a mesma escolha de um filme: o som acompanha a câmera.
      if (listenerDistance > 0) g *= 1 / (1 + (listenerDistance / 26) ** 1.5);
      m.gain.gain.setTargetAtTime(g, now, 0.04);
    }

    // Vento: corte e volume seguem a velocidade do ar.
    const v = clamp(quad.speed / A.windSpeedRef, 0, 1.6);
    this.windFilter.frequency.setTargetAtTime(280 + v * 1500, now, 0.08);
    this.windGain.gain.setTargetAtTime(v * v * A.windGain * 0.22, now, 0.08);

    this.staticGain.gain.setTargetAtTime(signalLoss * signalLoss * 0.10, now, 0.15);
  }

  /** Bipe curto. Serve para gate cruzado, volta completa e armar/desarmar —
   *  a frequência distingue os casos sem precisar de três sons. */
  beep(freq = 880, duration = 0.09, volume = 0.25) {
    if (!this.unlocked || !this.enabled || this._muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    const g = ctx.createGain();
    // Envelope exponencial: um corte seco em zero produz um "click" no fim
    // da nota, que é o artefato mais comum de áudio sintetizado à mão.
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(this.comp);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Sequência de armar (sobe) ou desarmar (desce), como o do controlador. */
  armTone(armed) {
    if (armed) { this.beep(660, 0.07, 0.2); setTimeout(() => this.beep(990, 0.1, 0.2), 70); }
    else { this.beep(760, 0.07, 0.18); setTimeout(() => this.beep(440, 0.12, 0.18), 70); }
  }

  crash() {
    if (!this.unlocked || !this.enabled || this._muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, now);
    f.frequency.exponentialRampToValueAtTime(160, now + 0.45);
    src.connect(f).connect(g).connect(this.comp);
    src.start(now);
    src.stop(now + 0.6);
    // Silencia os motores na hora: hélice quebrada não zumbe.
    for (const m of this._motors) m.gain.gain.setTargetAtTime(0, now, 0.02);
  }

  setMuted(m) {
    this._muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(
        m ? 0 : DCFG.audio.masterVolume, this.ctx.currentTime, 0.05,
      );
    }
  }

  dispose() {
    if (!this.ctx) return;
    for (const m of this._motors) { try { m.osc.stop(); m.osc2.stop(); } catch { /* já parado */ } }
    this.ctx.close?.();
  }
}
