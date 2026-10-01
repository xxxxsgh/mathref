import { h } from '../dom.js';
import { itemCard } from '../components.js';
import { skinById } from '../../skins/SkinCatalog.js';
import { hashString } from '../../core/Rng.js';

/**
 * Mercado offline: listagens com float e seed VISÍVEIS antes da compra.
 * Fragmentos só se ganham jogando; não existe dinheiro real nem sorteio.
 * @param {import('../UIManager.js').UIManager} ui
 */
export function MarketScreen(ui) {
  const g = ui.game;
  const inv = g.inventory;
  const grid = h('div', { class: 'grid' });
  const shards = h('div', { class: 'shards num' });
  const timer = h('span', { style: { color: 'var(--muted)', fontSize: '13px' } });
  function render(force = false) {
    const list = inv.market(force);
    shards.textContent = `${inv.shards} fragmentos`;
    const mins = Math.max(0, Math.ceil((g.save.data.marketRefreshAt - Date.now()) / 60000));
    timer.textContent = `Novas listagens em ~${mins} min`;
    grid.replaceChildren(
      ...(list.length
        ? list.map((l) => {
            const price = inv.listingPrice(l);
            const can = inv.shards >= price;
            const btn = h('button', {
              class: `btn ${can ? 'primary' : ''}`,
              style: { width: '100%', marginTop: '10px' },
              disabled: can ? undefined : 'true',
              onclick: (e) => {
                e.stopPropagation();
                const it = inv.buyListing(l.listingId);
                if (it) {
                  g.audio.ui('buy');
                  ui.toast(`Comprado: ${it.id}`);
                } else g.audio.ui('deny');
                render();
              },
            }, `Comprar — ${price}`);
            const skin = skinById(l.skinId);
            const preview = { ...l, weaponType: skin.weaponType, rarity: skin.rarity, wearSeed: hashString(l.listingId) };
            return itemCard(preview, g.thumbs, { footer: btn, onClick: () => ui.openViewer([preview]) });
          })
        : [h('div', { class: 'empty' }, 'Tudo vendido. Volte mais tarde.')]),
    );
  }
  render();
  return h('div', { class: 'screen screen-dark' }, [
    ui.topbar('Mercado', [timer, shards]),
    h('div', { class: 'content' }, [
      h('p', { style: { color: 'var(--muted)', marginTop: 0, fontSize: '13px' } }, 'Economia fictícia e offline. Cada listagem mostra float e pattern seed exatos — você vê o que compra. Ganhe fragmentos jogando e vendendo itens.'),
      grid,
    ]),
  ]);
}
