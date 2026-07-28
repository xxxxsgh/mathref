import { CONFIG } from '../config.js';

/**
 * Menu de pausa (Esc / botão no touch).
 *
 * Além do óbvio, ele resolve dois problemas concretos:
 *
 *  • No desktop, sair do Pointer Lock com Esc já pausa implicitamente o
 *    controle do mouse. Sem um menu, o jogador fica com a nave girando
 *    sozinha e sem saber o que aconteceu.
 *  • No iPad, é o único lugar onde cabem opções (volume, qualidade, reset)
 *    sem poluir a HUD de jogo.
 */
export class PauseMenu {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/Engine.js').Engine} engine
   */
  constructor(root, engine) {
    this.root = root;
    this.engine = engine;
    this.open = false;
    root.className = 'pause';
    root.hidden = true;

    this._onKey = (e) => {
      if (e.code !== 'Escape') return;
      // Se o painel de upgrades estiver aberto, Esc pertence a ele.
      if (this.engine.upgrades.open) return;
      e.preventDefault();
      this.toggle();
    };
    window.addEventListener('keydown', this._onKey);
  }

  toggle() { this.open ? this.close() : this.show(); }

  show() {
    if (this.open) return;
    this.open = true;
    this.engine.pause();
    this.root.hidden = false;
    this._render();
    void this.root.offsetWidth;
    this.root.classList.add('is-open');
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('is-open');
    setTimeout(() => { if (!this.open) this.root.hidden = true; }, 240);
    this.engine.resume();
    this.engine.input.onUserStart();   // reobtém o Pointer Lock
  }

  _render() {
    const e = this.engine;
    const p = e.progression;
    const s = p.stats;
    const muted = e.audio.master.gain.value < 0.01;

    this.root.innerHTML = `
      <div class="pause__panel">
        <div class="pause__title">PAUSADO</div>
        <div class="pause__stats">
          <div><span>Abates</span><span>${s.kills}</span></div>
          <div><span>Mortes</span><span>${s.deaths}</span></div>
          <div><span>Minério extraído</span><span>${s.asteroidsMined}</span></div>
          <div><span>Planetas mapeados</span><span>${s.planetsVisited.length}</span></div>
          <div><span>Atracações</span><span>${s.stationsDocked}</span></div>
          <div><span>Créditos</span><span>${p.credits} ⬢</span></div>
        </div>
        <div class="pause__missao">${e.missions.statusText}</div>
        <div class="pause__row">
          <button class="pause__btn" id="pause-resume">CONTINUAR</button>
        </div>
        <div class="pause__row pause__row--split">
          <button class="pause__btn pause__btn--ghost" id="pause-audio">
            ${muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO'}
          </button>
          <button class="pause__btn pause__btn--ghost" id="pause-quality">
            QUALIDADE: ${e.quality.tier.name.toUpperCase()}
          </button>
        </div>
        <button class="pause__btn pause__btn--danger" id="pause-reset">APAGAR PROGRESSO</button>
        <div class="pause__hint">Esc para voltar ao jogo</div>
      </div>`;

    this.root.querySelector('#pause-resume').addEventListener('click', () => this.close());

    this.root.querySelector('#pause-audio').addEventListener('click', (ev) => {
      const nowMuted = e.audio.master.gain.value >= 0.01;
      e.audio.setMuted(nowMuted);
      ev.currentTarget.textContent = nowMuted ? 'SOM: DESLIGADO' : 'SOM: LIGADO';
    });

    this.root.querySelector('#pause-quality').addEventListener('click', (ev) => {
      // Ciclo manual pelos tiers; volta ao automático depois do último.
      const q = e.quality;
      if (!q.auto) {
        const next = q.index + 1;
        if (next >= CONFIG.quality.tiers.length) { q.auto = true; }
        else q.setTier(next);
      } else {
        q.setTier(0);
      }
      ev.currentTarget.textContent = q.auto
        ? 'QUALIDADE: AUTOMÁTICA'
        : `QUALIDADE: ${q.tier.name.toUpperCase()}`;
    });

    this.root.querySelector('#pause-reset').addEventListener('click', (ev) => {
      // Confirmação em duas etapas no próprio botão: apagar progresso por
      // engano é irreversível, e um `confirm()` nativo é bloqueado em
      // alguns contextos e feio em todos.
      if (ev.currentTarget.dataset.armed) {
        e.progression.reset();
        e._applyUpgrades();
        this._render();
        return;
      }
      ev.currentTarget.dataset.armed = '1';
      ev.currentTarget.textContent = 'CONFIRMAR — APAGAR TUDO';
    });
  }

  dispose() { window.removeEventListener('keydown', this._onKey); }
}
