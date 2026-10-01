import { h } from '../dom.js';
import { DIFFICULTY } from '../../bots/BotController.js';

/** @param {import('../UIManager.js').UIManager} ui */
export function PlayScreen(ui) {
  const g = ui.game;
  const s = g.settings;
  let mode = ui.lastMode || 'competitive';
  const modes = [
    ['competitive', 'COMPETITIVO — UPLINK', 'Melhor de 13 rounds (primeiro a 7). Fase de compra, economia, captura do Uplink ou eliminação. Morreu, espera o próximo round.'],
    ['practice', 'TREINO LIVRE', 'Sem rounds: alvos de treino fixos e móveis, bots que renascem, loja liberada. Ideal para testar armas, recuo e a inspeção.'],
  ];
  const modeEls = modes.map(([id, title, desc]) =>
    h('div', { class: `mode${mode === id ? ' on' : ''}`, onclick: () => { mode = id; ui.lastMode = id; modeEls.forEach((el, i) => el.classList.toggle('on', modes[i][0] === id)); g.audio.ui('click'); } }, [h('h3', {}, title), h('p', {}, desc)]),
  );
  const seg = (key, values, label) => {
    const wrap = h('div', { class: 'seg' });
    const render = () =>
      wrap.replaceChildren(
        ...values.map(([v, l]) => h('button', { class: `chip${s.data[key] === v ? ' on' : ''}`, onclick: () => { s.set(key, v); render(); g.audio.ui('click'); } }, l)),
      );
    render();
    return h('div', { class: 'opt' }, [h('label', {}, label), wrap]);
  };
  return h('div', { class: 'screen screen-dark' }, [
    ui.topbar('Jogar'),
    h('div', { class: 'content' }, [
      h('div', { class: 'modes' }, modeEls),
      h('div', { class: 'opts' }, [
        seg('difficulty', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]), 'Dificuldade dos bots'),
        seg('teamSize', [[1, '1v1'], [2, '2v2'], [3, '3v3'], [4, '4v4'], [5, '5v5']], 'Tamanho dos times'),
      ]),
      h('div', { style: { marginTop: '22px' } }, h('button', { class: 'btn primary', style: { fontSize: '18px', padding: '14px 40px' }, onclick: () => g.startMatch({ mode, difficulty: s.data.difficulty, teamSize: s.data.teamSize }) }, 'INICIAR PARTIDA')),
      h('div', { class: 'controls-ref' }, [
        ['WASD', 'mover'], ['Shift', 'correr'], ['C / Ctrl', 'agachar'], ['Espaço', 'pular'], ['Mouse 1', 'atirar / golpe leve'],
        ['Mouse 2', 'golpe pesado (faca) / luneta (DMR)'], ['R', 'recarregar'], ['1 2 3', 'primária / secundária / faca'], ['Q', 'última arma'],
        ['Roda', 'trocar arma'], ['F', 'inspecionar (de novo cancela)'], ['B', 'loja'], ['Tab', 'placar'], ['Esc', 'pausa'],
      ].map(([k, d]) => h('div', {}, [h('kbd', {}, k), d]))),
    ]),
  ]);
}
