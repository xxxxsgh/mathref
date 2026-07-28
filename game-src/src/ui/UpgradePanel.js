import { UPGRADES } from '../systems/Progression.js';

/**
 * Painel de upgrades, aberto ao atracar numa estação.
 *
 * Feito em DOM: é um menu, não um objeto de jogo. Renderizar isso em 3D
 * custaria caro e seria pior de ler em qualquer resolução.
 *
 * Duas decisões de usabilidade:
 *
 *  • O jogo PAUSA enquanto o painel está aberto. Deixar a simulação rodando
 *    significaria levar tiro escolhendo upgrade, o que é hostil sem ser
 *    interessante.
 *  • O painel é navegável por teclado, gamepad e toque. No iPad ele é a única
 *    tela de texto do jogo, então precisa ter alvos grandes o suficiente para
 *    o polegar.
 */
export class UpgradePanel {
  /**
   * @param {HTMLElement} root
   * @param {import('../systems/Progression.js').Progression} progression
   */
  constructor(root, progression) {
    this.root = root;
    this.progression = progression;
    this.open = false;
    this.onClose = null;

    root.className = 'upgrades';
    root.hidden = true;

    this._onKey = (e) => {
      if (!this.open) return;
      if (e.code === 'Escape' || e.code === 'Enter') {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this._onKey);
  }

  show(stationName, creditsGained) {
    this.open = true;
    this.root.hidden = false;
    this._render(stationName, creditsGained);
    // Reflow forçado antes de adicionar a classe de animação: sem isso o
    // navegador agrupa as duas mudanças e a transição não roda.
    void this.root.offsetWidth;
    this.root.classList.add('is-open');
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('is-open');
    // Espera a transição terminar antes de esconder de fato.
    setTimeout(() => { if (!this.open) this.root.hidden = true; }, 260);
    this.onClose?.();
  }

  _render(stationName, creditsGained) {
    const p = this.progression;
    const rows = Object.entries(UPGRADES).map(([key, def]) => {
      const level = p.levels[key];
      const max = def.levels.length - 1;
      const cost = p.nextCost(key);
      const affordable = p.canAfford(key);
      const pips = Array.from({ length: max }, (_, i) =>
        `<span class="upg__pip ${i < level ? 'is-on' : ''}"></span>`).join('');

      const button = cost === null
        ? '<span class="upg__max">MÁXIMO</span>'
        : `<button class="upg__buy ${affordable ? '' : 'is-poor'}" data-key="${key}" ${affordable ? '' : 'disabled'}>
             ${cost} ⬢
           </button>`;

      return `
        <div class="upg__row">
          <div class="upg__info">
            <div class="upg__name">${def.name}</div>
            <div class="upg__desc">${def.description}</div>
            <div class="upg__pips">${pips}</div>
          </div>
          ${button}
        </div>`;
    }).join('');

    this.root.innerHTML = `
      <div class="upg__panel">
        <div class="upg__header">
          <div>
            <div class="upg__station">${stationName}</div>
            <div class="upg__sub">Serviços de manutenção</div>
          </div>
          <div class="upg__wallet">
            <div class="upg__credits">${p.credits} ⬢</div>
            <div class="upg__sub">créditos</div>
          </div>
        </div>
        ${creditsGained > 0
          ? `<div class="upg__gain">+${creditsGained} ⬢ de minério entregue</div>`
          : '<div class="upg__gain upg__gain--empty">Nenhum minério a bordo</div>'}
        <div class="upg__list">${rows}</div>
        <button class="upg__close" id="upg-close">DESATRACAR &nbsp;<kbd>Esc</kbd></button>
      </div>`;

    for (const btn of this.root.querySelectorAll('.upg__buy')) {
      btn.addEventListener('click', () => {
        if (this.progression.buy(btn.dataset.key)) {
          this.onPurchase?.();
          // Redesenha para atualizar créditos, pips e o que ficou acessível.
          this._render(stationName, 0);
        }
      });
    }
    this.root.querySelector('#upg-close')?.addEventListener('click', () => this.close());
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
  }
}
