import { h } from './dom.js';
import { skinById, WEAPON_TYPES } from '../skins/SkinCatalog.js';
import { rarityById } from '../skins/Rarity.js';
import { WEAR_TIERS, wearTier, formatFloat } from '../skins/Wear.js';
import { patternParams } from '../skins/PatternSystem.js';

/**
 * Componentes reutilizados entre telas: card de item e barra de float.
 */

/**
 * Barra de float com as 5 faixas de condição e um marcador.
 * @param {number} f
 */
export function floatBar(f) {
  const bar = h('div', { class: 'floatbar', title: `Float ${formatFloat(f)}` });
  for (const t of WEAR_TIERS) bar.append(h('i', { style: { width: `${(t.max - t.min) * 100}%`, background: t.color, opacity: 0.55 } }));
  bar.append(h('div', { class: 'mark', style: { left: `calc(${f * 100}% - 1px)` } }));
  return bar;
}

/**
 * Card de item: miniatura 3D, arma, skin, raridade, condição, float.
 * @param {any} item  item do inventário OU listagem do mercado
 * @param {import('../inspect/Thumbnails.js').Thumbnails} thumbs
 * @param {{ onClick?: () => void, selected?: boolean, compare?: boolean, footer?: Node }} [o]
 */
export function itemCard(item, thumbs, o = {}) {
  const skin = skinById(item.skinId);
  const r = rarityById(skin.rarity);
  const tier = wearTier(item.floatValue);
  const pp = patternParams(skin.id, skin.pattern, item.patternSeed);
  const img = h('div', { class: 'ph' });
  const thumb = h('div', { class: 'thumb' }, img);
  const key = item.id || item.listingId;
  thumbs.request(key, { ...item, weaponType: skin.weaponType }, (url) => {
    const im = h('img', { src: url, alt: skin.name, draggable: 'false' });
    thumb.replaceChildren(im);
  });
  const card = h(
    'div',
    {
      class: `card r-${r.id}${o.selected ? ' selected' : ''}${o.compare ? ' compare' : ''}`,
      style: { '--rc': r.color, '--glow': r.glow },
      onclick: o.onClick,
    },
    [
      item.equipped ? h('div', { class: 'badge' }, 'EQUIPADO') : null,
      pp.special ? h('div', { class: 'seedbadge', title: 'Pattern seed especial' }, `★ ${item.patternSeed}`) : null,
      thumb,
      h('div', { class: 'rbar' }),
      h('div', { class: 'info' }, [
        h('div', { class: 'weapon' }, WEAPON_TYPES[skin.weaponType].model),
        h('div', { class: 'skin' }, skin.name),
        h('div', { class: 'row' }, [h('span', { class: 'rarity' }, r.name), h('span', {}, tier.name)]),
        h('div', { class: 'row num' }, [h('span', {}, 'Float'), h('span', {}, item.floatValue.toFixed(6))]),
        floatBar(item.floatValue),
        o.footer || null,
      ]),
    ],
  );
  card.style.setProperty('--rc', r.color);
  card.style.setProperty('--glow', r.glow);
  return card;
}

/**
 * Painel de detalhes (usado no inventário e no visualizador).
 * @param {any} item
 */
export function itemDetails(item) {
  const skin = skinById(item.skinId);
  const r = rarityById(skin.rarity);
  const tier = wearTier(item.floatValue);
  const pp = patternParams(skin.id, skin.pattern, item.patternSeed);
  const wrap = h('div', { style: { '--rc': r.color } });
  wrap.style.setProperty('--rc', r.color);
  wrap.append(
    h('span', { class: 'rarity-tag' }, r.name),
    h('h3', {}, skin.name),
    h('div', { class: 'sub' }, `${WEAPON_TYPES[skin.weaponType].model} • ${WEAPON_TYPES[skin.weaponType].label}`),
    h('dl', { class: 'kv' }, [
      h('dt', {}, 'Condição'), h('dd', { style: { color: tier.color } }, `${tier.name}`),
      h('dt', {}, 'Float'), h('dd', { class: 'num' }, formatFloat(item.floatValue)),
      h('dt', {}, 'Pattern seed'), h('dd', { class: 'num' }, `${item.patternSeed}${pp.special ? ' ★ especial' : ''}`),
      h('dt', {}, 'Padrão'), h('dd', {}, skin.pattern),
      h('dt', {}, 'Acabamento'), h('dd', {}, `${skin.baseMaterial} / ${skin.accentMaterial}`),
      item.id ? h('dt', {}, 'ID') : null, item.id ? h('dd', { class: 'num' }, item.id) : null,
    ]),
    floatBar(item.floatValue),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', margin: '4px 0 14px' } }, [h('span', {}, '0.00 FN'), h('span', {}, '1.00 BS')]),
    h('p', { class: 'desc' }, skin.description),
  );
  return wrap;
}
