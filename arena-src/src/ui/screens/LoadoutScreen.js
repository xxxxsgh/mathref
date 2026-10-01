import { h } from '../dom.js';
import { itemCard } from '../components.js';
import { WEAPON_TYPES } from '../../skins/SkinCatalog.js';
import { rarityRank } from '../../skins/Rarity.js';

/**
 * Loadout: uma linha por arma; escolher o card equipa, "Padrão" desequipa.
 * @param {import('../UIManager.js').UIManager} ui
 */
export function LoadoutScreen(ui) {
  const g = ui.game;
  const inv = g.inventory;
  const body = h('div', { class: 'content' });
  function render() {
    body.replaceChildren(
      h('p', { style: { color: 'var(--muted)', marginTop: 0, fontSize: '13px' } }, 'Skins são só visuais: dano, recuo e precisão não mudam com raridade, float ou seed.'),
      ...Object.entries(WEAPON_TYPES).map(([type, info]) => {
        const owned = inv.items.filter((i) => i.weaponType === type).sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity));
        const eq = inv.equippedFor(type);
        const stock = h('div', { class: `card stock${eq ? '' : ' selected'}`, onclick: () => { if (eq) inv.unequip(eq.id); g.audio.ui('click'); render(); } }, 'PADRÃO');
        return h('div', { class: 'lo-row' }, [
          h('div', {}, [h('h4', {}, info.label), h('div', { class: 'model' }, info.model), h('div', { class: 'model' }, eq ? `Equipado: ${eq.id}` : 'Acabamento de fábrica')]),
          h('div', { class: 'lo-scroll' }, [
            stock,
            ...owned.map((it) =>
              itemCard(it, g.thumbs, {
                selected: it.equipped,
                onClick: () => {
                  inv.equip(it.id);
                  g.audio.ui('equip');
                  render();
                },
              }),
            ),
          ]),
        ]);
      }),
    );
  }
  render();
  return h('div', { class: 'screen screen-dark' }, [ui.topbar('Loadout'), body]);
}
