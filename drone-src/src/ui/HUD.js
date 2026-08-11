import { clamp } from '../core/MathUtils.js';

/**
 * HUD mínima: bateria, altura, velocidade e modo de voo.
 *
 * Deliberadamente pobre. O critério da Fase 1 é sentir velocidade e altura SEM
 * olhar pro HUD — se os números precisarem crescer pra pilotagem funcionar, o
 * problema está no voo e no cenário, não aqui. Estes quatro campos existem pra
 * confirmar o que o jogador já deveria estar sentindo.
 *
 * Tudo é DOM: texto nítido em qualquer DPI, e zero draw call a mais.
 */
export class HUD {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="hud-mode"><span class="tag" data-el="mode">ANGLE</span></div>

      <div id="hud-center">
        <div class="reticle"></div>
        <div class="banner" data-el="banner"></div>
      </div>

      <div id="hud-bottom">
        <div class="gauge">
          <span class="label">BATERIA</span>
          <div class="bar"><i data-el="battery-fill"></i></div>
          <span class="value" data-el="battery">100%</span>
        </div>
        <div class="gauge center">
          <span class="value big" data-el="speed">0</span>
          <span class="label">km/h</span>
        </div>
        <div class="gauge right">
          <span class="value big" data-el="altitude">0</span>
          <span class="label">m AGL</span>
        </div>
      </div>`;
    container.appendChild(this.root);

    this.els = {};
    for (const el of this.root.querySelectorAll('[data-el]')) {
      this.els[el.dataset.el] = el;
    }

    this._bannerTimer = 0;
    this._lastBattery = -1;
    this._lastMode = '';
  }

  /**
   * @param {object} state
   * @param {number} state.speedKmh  velocidade HORIZONTAL — é a que informa
   *   progresso; a total incluiria a queda e ficaria alta parado no ar.
   */
  update(state, dt) {
    const { speedKmh, altitude, batteryPercent, mode, batteryCritical, batteryWarning } = state;

    this.els.speed.textContent = Math.round(speedKmh);
    // Perto do chão o decimal importa (rasar a 0,4 m é diferente de 1,2 m);
    // alto, não — e o número pulando distrai.
    this.els.altitude.textContent = altitude < 10 ? altitude.toFixed(1) : Math.round(altitude);

    const percent = Math.round(batteryPercent);
    if (percent !== this._lastBattery) {
      this._lastBattery = percent;
      this.els.battery.textContent = `${percent}%`;
      this.els['battery-fill'].style.width = `${clamp(batteryPercent, 0, 100)}%`;
      this.els['battery-fill'].className = batteryCritical
        ? 'critical'
        : batteryWarning
          ? 'warn'
          : '';
    }

    if (mode !== this._lastMode) {
      this._lastMode = mode;
      this.els.mode.textContent = mode;
      this.els.mode.className = `tag ${mode === 'ACRO' ? 'acro' : ''}`;
    }

    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) this.els.banner.classList.remove('on');
    }
  }

  /** Mensagem grande e curta no centro. Some sozinha. */
  banner(text, seconds = 1.6, kind = '') {
    this.els.banner.textContent = text;
    this.els.banner.className = `banner on ${kind}`;
    this._bannerTimer = seconds;
  }

  setVisible(visible) {
    this.root.classList.toggle('hidden', !visible);
  }
}

/** Converte m/s pra km/h — a unidade que o jogador tem intuição. */
export const toKmh = (metersPerSecond) => metersPerSecond * 3.6;
