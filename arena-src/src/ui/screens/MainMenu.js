import { h } from '../dom.js';
import { itemCard } from '../components.js';
import { WEAPON_TYPES } from '../../skins/SkinCatalog.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function MainMenu(ui) {
  const g = ui.game;
  const prog = g.save.data.progression;
  const item = (label, sub, fn) =>
    h('button', { class: 'menu-item', onclick: () => { g.audio.ui('click'); fn(); }, onmouseenter: () => g.audio.ui('hover') }, [label, h('small', {}, sub)]);
  const kd = prog.deaths ? (prog.kills / prog.deaths).toFixed(2) : prog.kills.toFixed(2);
  const equipped = ['knife', 'rifle', 'pistol']
    .map((t) => g.inventory.equippedFor(t))
    .filter(Boolean)
    .map((it) => {
      const c = itemCard(it, g.thumbs, { onClick: () => ui.openViewer([it]) });
      c.style.width = '200px';
      return c;
    });
  return h('div', { class: 'screen screen-scrim main-menu' }, [
    h('div', { class: 'profile' }, [
      h('div', { class: 'lvl' }, `NÍVEL ${prog.level}`),
      h('div', { class: 'xpbar' }, h('div', { style: { width: `${(prog.xp / (prog.level * 1000)) * 100}%` } })),
      h('div', { class: 'shards num' }, `${prog.shards} fragmentos`),
      h('div', { class: 'stats num' }, [
        h('div', {}, [h('b', {}, String(prog.matches)), 'partidas']),
        h('div', {}, [h('b', {}, String(prog.wins)), 'vitórias']),
        h('div', {}, [h('b', {}, kd), 'K/D']),
      ]),
    ]),
    h('h1', { class: 'logo' }, ['NULL', h('span', {}, 'POINT')]),
    h('div', { class: 'tagline' }, 'Arena tática • protótipo'),
    h('nav', { class: 'menu-list' }, [
      item('JOGAR', 'competitivo ou treino', () => ui.show('play')),
      item('INVENTÁRIO', `${g.inventory.items.length} itens`, () => ui.show('inventory')),
      item('LOADOUT', 'skins equipadas', () => ui.show('loadout')),
      item('INSPECIONAR', 'visualizador 3D', () => {
        const knife = g.inventory.equippedFor('knife') || g.inventory.items[0];
        if (knife) ui.openViewer([knife]);
      }),
      item('MERCADO', 'economia offline', () => ui.show('market')),
      item('CONFIGURAÇÕES', '', () => ui.show('settings')),
      item('SAIR', '', () => ui.show('quit')),
    ]),
    h('div', { class: 'equipped-strip' }, equipped),
    h('div', { class: 'version' }, `RELAY-7 • ${Object.keys(WEAPON_TYPES).length} armas • v0.1`),
  ]);
}

/** @param {import('../UIManager.js').UIManager} ui */
export function QuitScreen(ui) {
  const g = ui.game;
  g.save.flush();
  return h('div', { class: 'screen screen-dark', style: { alignItems: 'center', justifyContent: 'center', textAlign: 'center' } }, [
    h('h1', { class: 'logo' }, ['NULL', h('span', {}, 'POINT')]),
    h('p', { style: { color: 'var(--muted)', margin: '18px 0 26px' } }, 'Progresso salvo localmente. Até a próxima.'),
    h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } }, [
      h('button', { class: 'btn', onclick: () => ui.show('main') }, 'Voltar ao menu'),
      h('a', { class: 'btn primary', href: '../', style: { textDecoration: 'none' } }, 'Ir para o hub'),
      h('button', { class: 'btn', onclick: () => { window.close(); } }, 'Fechar aba'),
    ]),
  ]);
}
