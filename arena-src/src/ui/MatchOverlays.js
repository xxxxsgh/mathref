import { h } from './dom.js';
import { WEAPONS, EQUIPMENT } from '../weapons/WeaponData.js';
import { TEAM_NAMES, TEAM_CSS } from '../combat/Combatant.js';

/**
 * Sobreposições durante a partida: pausa, loja, placar e resultado.
 */

/** @param {import('./UIManager.js').UIManager} ui */
export function PauseMenu(ui) {
  const g = ui.game;
  return h('div', { class: 'overlay' }, h('div', { class: 'modal' }, [
    h('h2', {}, 'Pausa'),
    h('div', { class: 'pause-list' }, [
      h('button', { class: 'btn primary', onclick: () => ui.resumeMatch() }, 'Continuar'),
      h('button', { class: 'btn', onclick: () => ui.showMatchSettings() }, 'Configurações'),
      h('button', { class: 'btn', onclick: () => g.startMatch(g.match.opts) }, 'Reiniciar partida'),
      h('button', { class: 'btn danger', onclick: () => g.endMatch() }, 'Sair da partida'),
    ]),
    h('p', { style: { color: 'var(--muted)', fontSize: '12px', marginBottom: 0 } }, 'O jogo continua rodando — os bots não esperam.'),
  ]));
}

const BUY_LIST = [
  ['Pistolas', ['pistol', 'heavy']],
  ['Primárias', ['smg', 'rifle', 'dmr']],
  ['Equipamento', ['vest', 'vestHelmet']],
];

/** @param {import('./UIManager.js').UIManager} ui */
export function BuyMenu(ui) {
  const g = ui.game;
  const m = g.match;
  const p = m.player;
  const money = h('div', { style: { color: '#9dffc9', fontWeight: 800, fontSize: '18px' } });
  const body = h('div');
  const keyOf = {};
  let n = 1;
  for (const [, ids] of BUY_LIST) for (const id of ids) keyOf[id] = n++;
  function render() {
    money.textContent = m.mode === 'practice' ? 'Treino: tudo grátis' : `$${p.money}`;
    body.replaceChildren(
      ...BUY_LIST.map(([title, ids]) =>
        h('div', { style: { marginBottom: '14px' } }, [
          h('div', { style: { fontSize: '11px', letterSpacing: '.14em', color: 'var(--muted)', margin: '6px 0' } }, title.toUpperCase()),
          h('div', { class: 'buy-grid' }, ids.map((id) => {
            const w = WEAPONS[id];
            const e = EQUIPMENT[id];
            const price = e ? e.price : w.price;
            const owned = w ? p.weapons[w.slot === 'primary' ? 'primary' : 'secondary']?.def.id === id : (id === 'vest' ? p.armor >= 100 : p.armor >= 100 && p.helmet);
            const afford = m.mode === 'practice' || p.money >= price;
            const desc = w ? `${w.damage} dano • ${Math.round(60 / w.interval)} RPM • ${w.mag} balas` : id === 'vest' ? 'Reduz dano no tronco' : 'Protege também a cabeça';
            return h('button', {
              class: 'buy-item',
              disabled: owned || !afford ? 'true' : undefined,
              onclick: () => buy(id),
            }, [h('span', { class: 'k' }, String(keyOf[id])), h('div', { class: 'n' }, w ? w.name : e.name), h('div', { class: 'p' }, owned ? 'EQUIPADO' : `$${price}`), h('div', { class: 'd' }, desc)]);
          })),
        ]),
      ),
    );
  }
  function buy(id) {
    const err = m.purchase(p, id);
    if (err) {
      g.audio.ui('deny');
      ui.toast(err);
    } else g.audio.ui('buy');
    render();
  }
  const keys = (e) => {
    const k = Number(e.key);
    const id = Object.keys(keyOf).find((x) => keyOf[x] === k);
    if (id) buy(id);
  };
  window.addEventListener('keydown', keys);
  render();
  const el = h('div', { class: 'overlay' }, h('div', { class: 'modal', style: { minWidth: 'min(720px, 94vw)' } }, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [h('h2', { style: { margin: 0 } }, 'Loja'), money]),
    h('p', { style: { color: 'var(--muted)', fontSize: '12px' } }, 'Número compra • B ou Esc fecha. Skins equipadas no inventário aparecem automaticamente.'),
    body,
  ]));
  /** @type {any} */ (el).cleanup = () => window.removeEventListener('keydown', keys);
  /** @type {any} */ (el).refresh = render;
  return el;
}

function fmtTime(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** @param {import('./UIManager.js').UIManager} ui */
export function Scoreboard(ui) {
  const m = ui.game.match;
  const rows = [];
  for (const team of [0, 1]) {
    const members = m.combat.actors.filter((a) => a.team === team && !a.isTarget).sort((a, b) => b.stats.score - a.stats.score);
    rows.push(h('tr', { class: 'team-h' }, [h('td', { colspan: '7', style: { color: TEAM_CSS[team] } }, `${TEAM_NAMES[team]}  ${m.mode === 'competitive' ? m.round.score[team] : ''}`)]));
    for (const a of members) {
      rows.push(h('tr', { class: `${a === m.player ? 'me' : ''} ${a.alive ? '' : 'dead'}` }, [
        h('td', {}, a.name),
        h('td', {}, String(a.stats.kills)),
        h('td', {}, String(a.stats.deaths)),
        h('td', {}, String(a.stats.assists)),
        h('td', {}, String(a.stats.headshots)),
        h('td', {}, String(Math.round(a.stats.damage))),
        h('td', {}, team === m.player.team && m.mode === 'competitive' ? `$${a.money}` : '—'),
      ]));
    }
  }
  return h('div', { class: 'overlay', style: { background: 'rgba(5,7,9,.35)', pointerEvents: 'none' } }, h('div', { class: 'modal', style: { minWidth: 'min(640px, 94vw)' } }, [
    h('h2', {}, m.mode === 'competitive' ? `Placar — Round ${m.round.round} de até 13` : 'Placar — Treino'),
    h('div', { style: { color: 'var(--muted)', fontSize: '12px', marginTop: '-8px', marginBottom: '10px' } }, `Tempo de partida ${fmtTime(m.time)} • ${m.opts.teamSize}v${m.opts.teamSize} • bots ${m.opts.difficulty}`),
    h('table', { class: 'sb' }, [h('tr', {}, ['Jogador', 'K', 'D', 'A', 'HS', 'Dano', '$'].map((t) => h('th', {}, t))), ...rows]),
  ]));
}

/** @param {import('./UIManager.js').UIManager} ui */
export function MatchEnd(ui) {
  const g = ui.game;
  const m = g.match;
  const r = m.result;
  const p = m.player;
  return h('div', { class: 'overlay' }, h('div', { class: 'modal result', style: { textAlign: 'center', minWidth: 'min(520px, 94vw)' } }, [
    h('h1', { style: { color: r.won ? 'var(--accent)' : 'var(--danger)' } }, r.won ? 'VITÓRIA' : 'DERROTA'),
    h('div', { style: { fontSize: '28px', fontWeight: 900, margin: '8px 0 18px' } }, [
      h('span', { style: { color: TEAM_CSS[0] } }, String(r.score[0])), ' : ', h('span', { style: { color: TEAM_CSS[1] } }, String(r.score[1])),
    ]),
    h('div', { class: 'kv', style: { maxWidth: '320px', margin: '0 auto 18px' } }, [
      h('dt', {}, 'Abates / Mortes'), h('dd', {}, `${p.stats.kills} / ${p.stats.deaths}`),
      h('dt', {}, 'Headshots'), h('dd', {}, String(p.stats.headshots)),
      h('dt', {}, 'Dano causado'), h('dd', {}, String(Math.round(p.stats.damage))),
      h('dt', {}, 'Duração'), h('dd', {}, fmtTime(m.time)),
      h('dt', {}, 'Fragmentos'), h('dd', { style: { color: '#b8f3ff' } }, `+${r.shards}`),
      h('dt', {}, 'Experiência'), h('dd', {}, `+${r.xp} XP`),
    ]),
    h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } }, [
      h('button', { class: 'btn primary', onclick: () => g.startMatch(m.opts) }, 'Jogar de novo'),
      h('button', { class: 'btn', onclick: () => g.endMatch() }, 'Menu principal'),
    ]),
  ]));
}
