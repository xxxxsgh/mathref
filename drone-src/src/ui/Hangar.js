import {
  CHASSIS,
  UPGRADES,
  computeSpec,
  describeSpec,
  ownedTier,
  equippedTier,
  nextTierPrice,
  buyUpgrade,
  buyChassis,
  setEquipped,
  saveBuild,
  loadBuild,
} from '../meta/Loadout.js';

/**
 * Hangar: compra, instala e compara.
 *
 * Cada linha mostra o número E uma frase em português do que muda no ar. O
 * número sozinho ("+18% de empuxo") não ensina ninguém a decidir; a frase
 * ("sai de qualquer buraco — se houver bateria") ensina.
 *
 * O botão de desequipar é o que faz o trade-off ser real: dá pra tirar a antena
 * antes de uma corrida porque o arrasto dela custa ponta.
 */
export class Hangar {
  constructor(container, save, onChange) {
    this.save = save;
    this.onChange = onChange;
    this.open = false;

    this.root = document.createElement('div');
    this.root.id = 'hangar';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="panel">
        <header>
          <h2>HANGAR</h2>
          <span class="credits" data-el="credits"></span>
        </header>
        <div class="stats" data-el="stats"></div>
        <div class="chassis" data-el="chassis"></div>
        <ul data-el="lines"></ul>
        <div class="builds" data-el="builds"></div>
        <footer>H fecha · comprar instala na hora · dá pra desinstalar sem perder o upgrade</footer>
      </div>`;
    container.appendChild(this.root);

    this.els = {};
    for (const el of this.root.querySelectorAll('[data-el]')) this.els[el.dataset.el] = el;

    this.root.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-act]');
      if (!button) return;
      const { act, id, tier } = button.dataset;

      if (act === 'buy') buyUpgrade(this.save, id);
      else if (act === 'equip') setEquipped(this.save, id, Number(tier));
      else if (act === 'chassis') buyChassis(this.save, id);
      else if (act === 'save-build') saveBuild(this.save, prompt('Nome do preset:') || 'preset');
      else if (act === 'load-build') loadBuild(this.save, id);

      this.onChange();
      this.render();
    });
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('hidden', !this.open);
    if (this.open) this.render();
    return this.open;
  }

  render() {
    const progress = this.save.progress;
    const stats = describeSpec(computeSpec(progress));

    this.els.credits.textContent = `${progress.credits} cr`;
    this.els.stats.innerHTML = [
      ['EMPUXO', `${stats.empuxo}:1`],
      ['PESO', `${stats.peso} kg`],
      ['GIRO', `${stats.giro}°/s`],
      ['BATERIA', `${stats.bateria}%`],
      ['CONSUMO', `${stats.consumo}%/s`],
      ['ALCANCE', `${stats.alcance} m`],
      ['VENTO', `×${stats.vento}`],
      ['ZOOM', `×${stats.zoom}`],
    ]
      .map(([label, value]) => `<span><i>${label}</i><b>${value}</b></span>`)
      .join('');

    this.els.chassis.innerHTML = CHASSIS.map((chassis) => {
      const unlocked = progress.unlockedChassis.includes(chassis.id);
      const active = progress.chassis === chassis.id;
      const label = active ? 'EM USO' : unlocked ? 'USAR' : `${chassis.price} cr`;
      const disabled = !unlocked && progress.credits < chassis.price;
      return `
        <div class="chassis-card ${active ? 'active' : ''}">
          <b>${chassis.name}</b>
          <i>${chassis.feel}</i>
          <button data-act="chassis" data-id="${chassis.id}" ${active || disabled ? 'disabled' : ''}>${label}</button>
        </div>`;
    }).join('');

    this.els.lines.innerHTML = UPGRADES.map((line) => {
      const owned = ownedTier(progress, line.id);
      const equipped = equippedTier(progress, line.id);
      const price = nextTierPrice(progress, line.id);
      const current = equipped > 0 ? line.tiers[equipped - 1].feel : 'Peça de fábrica.';

      const pips = line.tiers
        .map((_, i) => {
          const tier = i + 1;
          const state = tier <= equipped ? 'on' : tier <= owned ? 'owned' : 'off';
          return `<button class="pip ${state}" data-act="equip" data-id="${line.id}" data-tier="${
            tier === equipped ? tier - 1 : tier
          }" ${tier > owned ? 'disabled' : ''} title="${line.tiers[i].feel}"></button>`;
        })
        .join('');

      return `
        <li>
          <span class="body">
            <b>${line.name}</b> <em>${line.tradeoff}</em>
            <i>${current}</i>
          </span>
          <span class="pips">${pips}</span>
          <button data-act="buy" data-id="${line.id}" ${
            price == null || progress.credits < price ? 'disabled' : ''
          }>${price == null ? 'MÁX' : `${price} cr`}</button>
        </li>`;
    }).join('');

    const names = Object.keys(progress.builds ?? {});
    this.els.builds.innerHTML =
      `<button data-act="save-build">SALVAR BUILD</button>` +
      names.map((name) => `<button data-act="load-build" data-id="${name}">${name}</button>`).join('');
  }
}
