/**
 * Quadro de missões — o "hangar" onde se escolhe o trabalho.
 *
 * É uma lista, não um mapa cheio de ícones: o jogador precisa comparar
 * dificuldade, pagamento e o que a missão pede em uma passada de olho, e
 * comparar é o que uma lista faz melhor que qualquer coisa espalhada na tela.
 */
export class MissionBoard {
  constructor(container, missions, save, onPick) {
    this.missions = missions;
    this.save = save;
    this.onPick = onPick;
    this.open = false;

    this.root = document.createElement('div');
    this.root.id = 'board';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="panel">
        <header>
          <h2>QUADRO DE MISSÕES</h2>
          <span class="credits" data-el="credits"></span>
        </header>
        <ul data-el="list"></ul>
        <footer>J fecha · clique ou número para aceitar · R reinicia a missão</footer>
      </div>`;
    container.appendChild(this.root);

    this.listEl = this.root.querySelector('[data-el="list"]');
    this.creditsEl = this.root.querySelector('[data-el="credits"]');

    this.listEl.addEventListener('click', (e) => {
      const item = e.target.closest('li[data-id]');
      if (!item) return;
      this.onPick(item.dataset.id);
      this.toggle(false);
    });
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
    return this.open;
  }

  /** Aceita a missão pelo número da tecla (1–5). */
  pickByIndex(index) {
    const list = this.missions.list;
    if (index < 0 || index >= list.length) return false;
    this.onPick(list[index].id);
    this.toggle(false);
    return true;
  }

  render() {
    this.creditsEl.textContent = `${this.save.progress.credits} cr`;
    this.listEl.innerHTML = this.missions.list
      .map(
        (mission, i) => `
        <li data-id="${mission.id}" class="${mission.done ? 'done' : ''}">
          <span class="key">${i + 1}</span>
          <span class="body">
            <b>${mission.title}</b>
            <i>${mission.brief}</i>
          </span>
          <span class="meta">
            <span class="diff">${'●'.repeat(mission.difficulty)}${'○'.repeat(3 - mission.difficulty)}</span>
            <span class="pay">${mission.done ? Math.round(mission.reward * 0.3) : mission.reward} cr</span>
          </span>
        </li>`,
      )
      .join('');
  }
}
