import { CONFIG } from '../config.js';
import { clamp, smoothstep } from '../core/MathUtils.js';

/**
 * Bateria. Já existe na Fase 1 porque a HUD mostra, mas o papel dela é da
 * Fase 2 pra frente: o consumo cresce mais que linearmente com o acelerador,
 * então cravar o dedo custa caro e a linha eficiente vence a linha rápida.
 *
 * O expoente é o que transforma isso em decisão. Com consumo linear, acelerar
 * 100% do tempo gastaria o mesmo que 50% pelo dobro do tempo e não haveria
 * escolha nenhuma a fazer.
 */
export class Battery {
  constructor() {
    this.capacity = CONFIG.BATTERY.capacity;
    this.charge = this.capacity;
    /** Consumo instantâneo (%/s) — a HUD desenha isso como agulha. */
    this.drainRate = 0;
    this.enabled = true;
  }

  get percent() {
    return (this.charge / this.capacity) * 100;
  }

  get empty() {
    return this.charge <= 0;
  }

  get warning() {
    return this.percent <= CONFIG.BATTERY.warnPercent;
  }

  get critical() {
    return this.percent <= CONFIG.BATTERY.criticalPercent;
  }

  /**
   * Empuxo disponível, 0..1. Perto do fim a bateria não morre de uma vez: cai
   * a tensão e o drone fica pesado, o que dá ao jogador uns segundos pra achar
   * onde pousar em vez de simplesmente apagar no ar.
   */
  get thrustScale() {
    const B = CONFIG.BATTERY;
    if (this.percent >= B.brownoutPercent) return 1;
    return 1 - B.brownoutThrustLoss * (1 - smoothstep(0, B.brownoutPercent, this.percent));
  }

  setCapacity(capacity) {
    const ratio = this.capacity > 0 ? this.charge / this.capacity : 1;
    this.capacity = capacity;
    this.charge = capacity * ratio;
  }

  refill() {
    this.charge = this.capacity;
  }

  /** @param {number} payloadKg carga extra sendo transportada (Fase 4) */
  update(dt, throttle, payloadKg = 0) {
    if (!this.enabled) {
      this.drainRate = 0;
      return;
    }
    const B = CONFIG.BATTERY;
    const t = clamp(throttle, 0, 1);
    this.drainRate =
      B.idleDrain + B.throttleDrain * Math.pow(t, B.throttleExponent) + payloadKg * B.payloadDrainPerKg;
    this.charge = clamp(this.charge - this.drainRate * dt, 0, this.capacity);
  }

  /** Recarga em base/ponto de recarga (Fase 3). */
  recharge(dt, ratePerSecond = 22) {
    this.charge = clamp(this.charge + ratePerSecond * dt, 0, this.capacity);
  }
}
