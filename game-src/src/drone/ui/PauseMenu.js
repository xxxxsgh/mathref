import { formatTime } from '../race/Course.js';

/**
 * Menu de pausa.
 *
 * Além de pausar, ele é o único lugar onde o resumo do voo aparece — e é de
 * propósito: durante o voo o piloto não deve ter que ler nada além do OSD.
 * Estatística é coisa de depois de pousar.
 *
 * Pausar de verdade (parar o rAF) e não só cobrir a tela: um drone que
 * continua caindo atrás de um menu é a forma mais barata de perder uma
 * bateria inteira por engano.
 */
export class PauseMenu {
  /** @param {HTMLElement} root @param {import('../Engine.js').Engine} engine */
  constructor(root, engine) {
    this.root = root;
    this.engine = engine;
    this.open = false;
    root.hidden = true;

    root.innerHTML = `
      <div class="pause__panel">
        <div class="pause__title">PAUSADO</div>
        <div class="pause__row"><span>MELHOR VOLTA</span><span id="pz-best">--</span></div>
        <div class="pause__row"><span>VOLTAS</span><span id="pz-laps">0</span></div>
        <div class="pause__row"><span>GATES</span><span id="pz-gates">0</span></div>
        <div class="pause__row"><span>ACROBACIAS</span><span id="pz-tricks">0</span></div>
        <div class="pause__row"><span>BATERIA</span><span id="pz-batt">100%</span></div>
        <button class="pause__btn" id="pz-resume">CONTINUAR</button>
        <button class="pause__btn pause__btn--ghost" id="pz-newpack">BATERIA NOVA · R</button>
        <button class="pause__btn pause__btn--ghost" id="pz-silence">SILENCIAR</button>
      </div>
    `;

    this.el = {
      best: root.querySelector('#pz-best'),
      laps: root.querySelector('#pz-laps'),
      gates: root.querySelector('#pz-gates'),
      tricks: root.querySelector('#pz-tricks'),
      batt: root.querySelector('#pz-batt'),
    };

    root.querySelector('#pz-resume').addEventListener('click', () => this.toggle());
    root.querySelector('#pz-newpack').addEventListener('click', () => {
      this.engine.newBattery();
      this.toggle();
    });
    const silence = root.querySelector('#pz-silence');
    silence.addEventListener('click', () => {
      const muted = this.engine.toggleMute();
      silence.textContent = muted ? 'COM SOM' : 'SILENCIAR';
    });
  }

  toggle() {
    this.open = !this.open;
    this.root.hidden = !this.open;
    if (this.open) {
      this._refresh();
      this.engine.pause();
    } else {
      this.engine.resume();
    }
  }

  _refresh() {
    const e = this.engine;
    this.el.best.textContent = formatTime(e.course.bestLap);
    this.el.laps.textContent = String(e.course.lap);
    this.el.gates.textContent = String(e.gatesPassed);
    this.el.tricks.textContent = String(e.quad.rolls + e.quad.flips);
    this.el.batt.textContent = `${Math.round(e.quad.batteryPct * 100)}%`;
  }
}
