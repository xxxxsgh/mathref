import { CONFIG } from '../config.js';
import { clamp, smoothstep } from '../core/MathUtils.js';

/**
 * Alcance de rádio.
 *
 * O objetivo é tensão, não parede. Um limite duro ("você não pode ir além
 * daqui") é uma regra; o sinal apodrecendo aos poucos é uma DECISÃO — dá pra
 * ir mais longe, sabendo que a imagem vai piorar e o controle vai ficar
 * intermitente, e que voltar fica mais difícil quanto mais se avança.
 *
 * Por isso a degradação é progressiva e sempre reversível: voltar 50 m devolve
 * o sinal. O jogador nunca perde o drone por ter cruzado uma linha invisível,
 * só por ter insistido depois de ver a imagem picotando.
 */
export class Radio {
  constructor(homePosition) {
    this.home = homePosition.clone();
    /** 1 = imagem limpa e controle total; 0 = sinal perdido. */
    this.signal = 1;
    /** Repetidores descobertos ampliam a cobertura (a antena da Fase 3). */
    this.repeaters = [];
    this.range = CONFIG.RADIO.range;
    this.enabled = true;
  }

  setHome(position) {
    this.home.copy(position);
  }

  /** Distância à fonte de sinal mais próxima (base ou repetidor). */
  _distanceToNearestSource(position) {
    let best = position.distanceTo(this.home) / this.range;
    for (const repeater of this.repeaters) {
      // Cada fonte é normalizada pelo próprio alcance, então um repetidor
      // fraco perto vale menos que a base longe — como deve ser.
      best = Math.min(best, position.distanceTo(repeater.position) / repeater.range);
    }
    return best;
  }

  update(dt, position) {
    if (!this.enabled) {
      this.signal = 1;
      return this.signal;
    }
    const R = CONFIG.RADIO;
    const normalized = this._distanceToNearestSource(position);

    // Perfeito até `fadeStart`, morrendo até o limite. Fora disso, zero.
    const target = 1 - smoothstep(R.fadeStart, 1, normalized);

    // Suavizado no tempo: sem isso, uma rajada que empurra o drone 2 m faz o
    // sinal piscar, e piscar parece bug em vez de alcance.
    this.signal = clamp(this.signal + (target - this.signal) * Math.min(1, dt * 2.5), 0, 1);
    return this.signal;
  }

  get degraded() {
    return this.signal < CONFIG.RADIO.warnSignal;
  }

  get critical() {
    return this.signal < CONFIG.RADIO.lostSignal;
  }

  /**
   * Aplica a perda de sinal aos comandos.
   *
   * Perder controle não é receber comando aleatório — é o comando parar de
   * chegar. Por isso os eixos são ATENUADOS e às vezes congelam, em vez de
   * receberem ruído: o drone continua obedecendo ao último comando que chegou,
   * que é o que um link ruim de verdade faz.
   */
  applyTo(axes, time) {
    if (this.signal >= CONFIG.RADIO.warnSignal) return axes;

    const quality = this.signal / CONFIG.RADIO.warnSignal;
    // Recortes intermitentes: quanto pior o sinal, mais tempo em queda.
    const dropout = Math.sin(time * 11.3) * 0.5 + Math.sin(time * 4.7 + 1.1) * 0.5;
    const lost = dropout > quality * 1.6 - 0.35;

    const attenuation = lost ? 0 : 0.35 + quality * 0.65;
    axes.pitch *= attenuation;
    axes.roll *= attenuation;
    axes.yaw *= attenuation;
    // O acelerador vai pro ponto de pairar em vez de zerar: um link ruim que
    // desliga os motores mataria o drone toda vez, e isso é injusto.
    const hover = 1 / CONFIG.DRONE.thrustToWeight;
    axes.throttle = hover + (axes.throttle - hover) * attenuation;
    return axes;
  }
}
