import { h } from '../dom.js';
import { itemDetails } from '../components.js';
import { rarityById } from '../../skins/Rarity.js';

/**
 * Camada de interface do visualizador 3D: área de arrastar (órbita/zoom),
 * painel(is) de informação e barra de ferramentas. O HUD do jogo fica
 * escondido enquanto isto está aberto.
 * @param {import('../UIManager.js').UIManager} ui
 * @param {any[]} items  1 item, ou 2 para comparar
 * @param {() => void} onClose
 */
export function ViewerScreen(ui, items, onClose) {
  const g = ui.game;
  const v = g.viewer;
  const grab = h('div', { class: 'grab', title: 'Arraste para girar • roda para zoom' });
  v.bind(grab);
  const list = g.inventory.items;
  const single = items.length === 1 && items[0].id && list.some((i) => i.id === items[0].id);
  let idx = single ? list.findIndex((i) => i.id === items[0].id) : -1;
  const panels = h('div');
  const counter = h('span', { style: { color: 'var(--muted)', fontSize: '13px' } });

  function load(arr) {
    v.open(arr, rarityById(arr[0].rarity).color);
    panels.replaceChildren(
      ...arr.map((it, i) => {
        const p = h('div', { class: `vpanel${arr.length > 1 && i === 0 ? ' left' : ''}` }, itemDetails(it));
        if (arr.length > 1) p.prepend(h('div', { style: { fontSize: '11px', color: 'var(--muted)', letterSpacing: '.14em', marginBottom: '6px' } }, i === 0 ? 'ITEM SUPERIOR' : 'ITEM INFERIOR'));
        return p;
      }),
    );
    counter.textContent = idx >= 0 ? `${idx + 1} / ${list.length}` : '';
  }
  const step = (d) => {
    if (idx < 0 || !list.length) return;
    idx = (idx + d + list.length) % list.length;
    load([list[idx]]);
    g.audio.ui('click');
  };
  const wearBtn = h('button', { class: 'btn' }, 'Desgaste: ligado');
  wearBtn.addEventListener('click', () => {
    v.setWear(!v.wearOn);
    wearBtn.textContent = `Desgaste: ${v.wearOn ? 'ligado' : 'desligado'}`;
  });
  const rotBtn = h('button', { class: 'btn' }, 'Giro automático: sim');
  rotBtn.addEventListener('click', () => {
    v.autoRotate = !v.autoRotate;
    rotBtn.textContent = `Giro automático: ${v.autoRotate ? 'sim' : 'não'}`;
  });
  const keys = (e) => {
    if (e.code === 'ArrowRight') step(1);
    else if (e.code === 'ArrowLeft') step(-1);
    else if (e.code === 'Escape') close();
  };
  const close = () => {
    window.removeEventListener('keydown', keys);
    onClose();
  };
  window.addEventListener('keydown', keys);

  load(items);
  return h('div', { class: 'screen viewer' }, [
    grab,
    h('div', { class: 'vtop' }, [
      h('button', { class: 'back', onclick: close }, '← Voltar'),
      single ? h('button', { class: 'btn', onclick: () => step(-1) }, '‹') : null,
      single ? h('button', { class: 'btn', onclick: () => step(1) }, '›') : null,
      counter,
    ]),
    panels,
    h('div', { class: 'vbar' }, [
      h('button', { class: 'btn', onclick: () => v.resetView() }, 'Centralizar'),
      wearBtn,
      rotBtn,
      h('button', { class: 'btn', onclick: () => { v.tDist = Math.max(v.minDist, v.tDist * 0.7); } }, 'Zoom +'),
      h('button', { class: 'btn', onclick: () => { v.tDist = Math.min(v.maxDist, v.tDist * 1.3); } }, 'Zoom −'),
    ]),
    h('div', { class: 'vhint' }, 'Arraste: girar • Roda: zoom • ←/→: próximo item • Esc: sair'),
  ]);
}
