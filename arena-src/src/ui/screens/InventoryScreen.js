import { h } from '../dom.js';
import { itemCard, itemDetails } from '../components.js';
import { WEAPON_TYPES, skinById } from '../../skins/SkinCatalog.js';
import { RARITIES, rarityRank } from '../../skins/Rarity.js';

/**
 * Inventário: grade de cards com filtros, painel lateral com detalhes e
 * ações (equipar, inspecionar, comparar, vender).
 * @param {import('../UIManager.js').UIManager} ui
 */
export function InventoryScreen(ui) {
  const g = ui.game;
  const inv = g.inventory;
  const st = ui.invState || (ui.invState = { type: 'all', rarity: 'all', sort: 'rarity', selected: null, compare: null, confirmSell: false });
  const grid = h('div', { class: 'grid' });
  const side = h('div', { class: 'side' });
  const shards = h('div', { class: 'shards num' });
  const count = h('span', { style: { color: 'var(--muted)', fontSize: '13px' } });

  const chips = (key, list) => {
    const wrap = h('div', { class: 'filters', style: { marginBottom: '0' } });
    const render = () =>
      wrap.replaceChildren(...list.map(([v, l]) => h('button', { class: `chip${st[key] === v ? ' on' : ''}`, onclick: () => { st[key] = v; render(); renderGrid(); } }, l)));
    render();
    return wrap;
  };

  function filtered() {
    const list = inv.items.filter((i) => (st.type === 'all' || i.weaponType === st.type) && (st.rarity === 'all' || i.rarity === st.rarity));
    const by = {
      rarity: (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.floatValue - b.floatValue,
      float: (a, b) => a.floatValue - b.floatValue,
      newest: (a, b) => b.acquiredAt - a.acquiredAt || b.id.localeCompare(a.id),
      name: (a, b) => skinById(a.skinId).name.localeCompare(skinById(b.skinId).name),
    }[st.sort];
    return list.sort(by);
  }

  function renderGrid() {
    const list = filtered();
    count.textContent = `${list.length} de ${inv.items.length} itens`;
    shards.textContent = `${inv.shards} fragmentos`;
    grid.replaceChildren(
      ...(list.length
        ? list.map((it) =>
            itemCard(it, g.thumbs, {
              selected: st.selected === it.id,
              compare: st.compare === it.id,
              onClick: () => {
                g.audio.ui('click');
                if (st.picking && st.selected !== it.id) {
                  st.compare = it.id;
                  st.picking = false;
                } else {
                  st.selected = it.id;
                  st.confirmSell = false;
                }
                renderGrid();
              },
            }),
          )
        : [h('div', { class: 'empty' }, 'Nenhum item com esses filtros.')]),
    );
    renderSide();
  }

  function renderSide() {
    const it = st.selected ? inv.get(st.selected) : null;
    if (!it) {
      side.replaceChildren(h('div', { class: 'empty' }, 'Selecione um item para ver detalhes, equipar, comparar ou vender.'));
      return;
    }
    const cmp = st.compare ? inv.get(st.compare) : null;
    const actions = h('div', { class: 'actions' }, [
      it.equipped
        ? h('button', { class: 'btn', onclick: () => { inv.unequip(it.id); g.audio.ui('click'); renderGrid(); } }, 'Desequipar')
        : h('button', { class: 'btn primary', onclick: () => { inv.equip(it.id); g.audio.ui('equip'); renderGrid(); } }, 'Equipar'),
      h('button', { class: 'btn', onclick: () => ui.openViewer([it]) }, 'Inspecionar'),
      h('button', { class: 'btn', onclick: () => { st.picking = true; st.compare = null; ui.toast('Escolha outro item na grade para comparar'); renderGrid(); } }, st.picking ? 'Escolhendo…' : 'Comparar'),
      st.confirmSell
        ? h('button', { class: 'btn danger', onclick: () => { const v = inv.sell(it.id); g.audio.ui('buy'); ui.toast(`Vendido por ${v} fragmentos`); st.selected = null; st.confirmSell = false; if (st.compare === it.id) st.compare = null; renderGrid(); } }, `Confirmar (+${inv.sellValue(it)})`)
        : h('button', { class: 'btn danger', onclick: () => { st.confirmSell = true; renderSide(); } }, `Vender (${inv.sellValue(it)})`),
    ]);
    const parts = [itemDetails(it), h('div', { class: 'kv' }, [h('dt', {}, 'Valor de mercado'), h('dd', {}, `${inv.value(it)} fragmentos`)]), actions];
    if (cmp) {
      parts.push(
        h('h4', { style: { margin: '20px 0 0', letterSpacing: '.1em' } }, 'COMPARAÇÃO'),
        h('table', { class: 'compare-table' }, inv.compare(it, cmp).map(([k, a, b]) => h('tr', {}, [h('td', {}, k), h('td', {}, a), h('td', {}, b)]))),
        h('div', { class: 'actions' }, [
          h('button', { class: 'btn wide primary', onclick: () => ui.openViewer([it, cmp]) }, 'Comparar no visualizador 3D'),
          h('button', { class: 'btn wide', onclick: () => { st.compare = null; renderGrid(); } }, 'Limpar comparação'),
        ]),
      );
    }
    side.replaceChildren(...parts);
  }

  const el = h('div', { class: 'screen screen-dark' }, [
    ui.topbar('Inventário', [shards]),
    h('div', { class: 'content' }, [
      h('div', { class: 'inv-layout' }, [
        h('div', {}, [
          h('div', { class: 'filters' }, [
            chips('type', [['all', 'Todas'], ...Object.entries(WEAPON_TYPES).map(([k, v]) => [k, v.label])]),
          ]),
          h('div', { class: 'filters' }, [
            chips('rarity', [['all', 'Todas raridades'], ...RARITIES.map((r) => [r.id, r.name])]),
            h('select', { onchange: (e) => { st.sort = e.target.value; renderGrid(); } }, [
              ['rarity', 'Ordenar: raridade'], ['float', 'Ordenar: float'], ['newest', 'Ordenar: mais novos'], ['name', 'Ordenar: nome'],
            ].map(([v, l]) => { const o = h('option', { value: v }, l); if (st.sort === v) o.setAttribute('selected', ''); return o; })),
            count,
          ]),
          grid,
        ]),
        side,
      ]),
    ]),
  ]);
  renderGrid();
  return el;
}
