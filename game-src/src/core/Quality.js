import { CONFIG } from '../config.js';

/**
 * Qualidade adaptativa.
 *
 * Antecipado da Fase 6 por um motivo concreto: um iPad segura 60fps por 3–5
 * minutos e depois cai por temperatura (thermal throttling). Se cada sistema
 * não nascer lendo um "tier" de qualidade, adicionar isso depois obriga a
 * reescrever como todo mundo publica configuração.
 *
 * O algoritmo é intencionalmente conservador:
 *  - avalia o frame time MEDIANO de uma janela de N frames (mediana, não média:
 *    um único frame de 200ms por causa de GC não deve derrubar a qualidade);
 *  - precisa de várias avaliações ruins SEGUIDAS pra descer (histerese);
 *  - precisa de MUITAS avaliações folgadas pra subir, e só sobe um número
 *    limitado de vezes — senão, com throttling térmico, ele oscilaria pra
 *    sempre entre dois tiers, o que é pior que ficar no tier baixo.
 */
export class Quality {
  /** @param {{ isMobile: boolean }} opts */
  constructor({ isMobile }) {
    this.isMobile = isMobile;
    this.tiers = CONFIG.quality.tiers;
    this.index = isMobile
      ? CONFIG.quality.startTierMobile
      : CONFIG.quality.startTierDesktop;

    this.targetMs = isMobile
      ? CONFIG.quality.targetFrameMsMobile
      : CONFIG.quality.targetFrameMsDesktop;

    /** @type {number[]} */
    this._samples = [];
    this._badStreak = 0;
    this._goodStreak = 0;
    this._upgrades = 0;
    this.auto = true;

    /** @type {Array<(tier: any) => void>} */
    this._listeners = [];
    this.lastMedianMs = 0;
  }

  get tier() {
    return this.tiers[this.index];
  }

  /** Sistemas se inscrevem pra reagir a mudança de tier.
   *  Chama imediatamente com o tier atual, pra o assinante não precisar
   *  duplicar a lógica de inicialização. */
  onChange(fn) {
    this._listeners.push(fn);
    fn(this.tier);
    return () => {
      const i = this._listeners.indexOf(fn);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }

  _emit() {
    for (const fn of this._listeners) fn(this.tier);
  }

  /** Força um tier (usado pelo painel de tuning). Desliga o modo automático. */
  setTier(index, { manual = true } = {}) {
    const clamped = Math.max(0, Math.min(this.tiers.length - 1, index));
    if (clamped === this.index) return;
    this.index = clamped;
    if (manual) this.auto = false;
    this._samples.length = 0;
    this._badStreak = 0;
    this._goodStreak = 0;
    this._emit();
  }

  /** @param {number} frameMs tempo do frame anterior, em ms */
  sample(frameMs) {
    if (!this.auto) return;
    // Frames absurdos (aba em background, breakpoint no debugger) poluem a
    // amostra. Descartar acima de 250ms evita degradar por engano.
    if (frameMs > 250) return;

    this._samples.push(frameMs);
    if (this._samples.length < CONFIG.quality.sampleWindow) return;

    const sorted = this._samples.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.lastMedianMs = median;
    this._samples.length = 0;

    if (median > this.targetMs) {
      this._badStreak++;
      this._goodStreak = 0;
      if (this._badStreak >= CONFIG.quality.downgradeStreak) {
        this._badStreak = 0;
        if (this.index < this.tiers.length - 1) {
          this.index++;
          this._emit();
        }
      }
    } else if (median < this.targetMs * CONFIG.quality.upgradeHeadroom) {
      this._goodStreak++;
      this._badStreak = 0;
      if (
        this._goodStreak >= CONFIG.quality.upgradeStreak &&
        this._upgrades < CONFIG.quality.maxUpgrades &&
        this.index > 0
      ) {
        this._goodStreak = 0;
        this._upgrades++;
        this.index--;
        this._emit();
      }
    } else {
      // Zona confortável: zera as duas contagens pra não acumular ruído.
      this._badStreak = 0;
      this._goodStreak = 0;
    }
  }
}

/** Heurística de dispositivo. Não existe detecção confiável de "é mobile";
 *  o que importa aqui é só o chute INICIAL de tier — o sistema adaptativo
 *  corrige em poucos segundos se o chute estiver errado. */
export function detectMobile() {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touch = navigator.maxTouchPoints > 0;
  // iPadOS 13+ se declara como Mac no user agent. `maxTouchPoints > 1` é o
  // truque padrão pra distinguir um iPad de um Mac com tela sensível ao toque
  // (que não existe).
  const iPadAsMac =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iPadAsMac || (coarse && touch);
}
