import { h } from '../dom.js';
import { DIFFICULTY } from '../../bots/BotController.js';

/**
 * Configurações em abas. Tudo aplica na hora e é salvo.
 * @param {import('../UIManager.js').UIManager} ui
 * @param {{ inMatch?: boolean, onBack?: () => void }} [o]
 */
export function SettingsScreen(ui, o = {}) {
  const g = ui.game;
  const s = g.settings;
  let tab = ui.settingsTab || 'controls';
  const body = h('div');
  const tabsEl = h('div', { class: 'tabs' });
  const TABS = [
    ['controls', 'Controles'],
    ['video', 'Vídeo'],
    ['audio', 'Áudio'],
    ['crosshair', 'Mira'],
    ['game', 'Jogo'],
    ['data', 'Dados'],
  ];

  const range = (key, label, min, max, step, fmt = (v) => v) => {
    const val = h('div', { class: 'val' }, String(fmt(s.data[key])));
    const input = h('input', { type: 'range', min, max, step, value: s.data[key] });
    input.addEventListener('input', () => {
      s.set(key, Number(input.value));
      val.textContent = String(fmt(s.data[key]));
    });
    return h('div', { class: 'setting' }, [h('div', { class: 'lbl' }, label), input, val]);
  };
  const toggle = (key, label) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!s.data[key];
    input.addEventListener('change', () => s.set(key, input.checked));
    return h('div', { class: 'setting' }, [h('div', { class: 'lbl' }, label), h('div', {}, input), h('div')]);
  };
  const choice = (key, label, list) => {
    const wrap = h('div', { class: 'seg' });
    const render = () => wrap.replaceChildren(...list.map(([v, l]) => h('button', { class: `chip${s.data[key] === v ? ' on' : ''}`, onclick: () => { s.set(key, v); render(); } }, l)));
    render();
    return h('div', { class: 'setting' }, [h('div', { class: 'lbl' }, label), wrap, h('div')]);
  };

  function crosshairPreview() {
    const box = h('div', { class: 'xh-preview' });
    const draw = () => {
      const d = s.data;
      box.replaceChildren();
      const c = d.crosshairColor;
      const mk = (x, y, w, hh) => h('i', { style: { position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, width: `${w}px`, height: `${hh}px`, background: c, boxShadow: '0 0 0 1px rgba(0,0,0,.55)' } });
      const g2 = d.crosshairGap;
      const l = d.crosshairSize;
      const t = d.crosshairThickness;
      box.append(mk(-t / 2, -g2 - l, t, l), mk(-t / 2, g2, t, l), mk(-g2 - l, -t / 2, l, t), mk(g2, -t / 2, l, t));
      if (d.crosshairDot) box.append(mk(-t / 2, -t / 2, t, t));
    };
    draw();
    s.onChange(draw);
    return box;
  }

  function render() {
    tabsEl.replaceChildren(...TABS.map(([id, l]) => h('button', { class: `chip${tab === id ? ' on' : ''}`, onclick: () => { tab = id; ui.settingsTab = id; render(); } }, l)));
    let rows = [];
    if (tab === 'controls') {
      rows = [
        range('sensitivity', 'Sensibilidade do mouse', 0.2, 8, 0.05, (v) => v.toFixed(2)),
        toggle('invertY', 'Inverter eixo Y'),
        range('fov', 'Campo de visão (FOV)', 60, 100, 1, (v) => `${v}°`),
        range('viewmodelFov', 'FOV da arma', 50, 75, 1, (v) => `${v}°`),
      ];
    } else if (tab === 'video') {
      rows = [
        choice('quality', 'Qualidade gráfica', [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']]),
        range('renderScale', 'Resolução de renderização', 0.5, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
        toggle('fullscreen', 'Tela cheia'),
        toggle('showFps', 'Mostrar FPS'),
        h('p', { style: { color: 'var(--muted)', fontSize: '12px' } }, 'Baixa: sem sombras e efeitos reduzidos. Alta: sombras 2048 e antisserrilhado. A resolução escala a imagem interna (útil em GPUs modestas).'),
      ];
    } else if (tab === 'audio') {
      const pct = (v) => `${Math.round(v * 100)}%`;
      rows = [range('masterVolume', 'Volume geral', 0, 1, 0.01, pct), range('musicVolume', 'Música', 0, 1, 0.01, pct), range('sfxVolume', 'Efeitos', 0, 1, 0.01, pct)];
    } else if (tab === 'crosshair') {
      const color = h('input', { type: 'color', value: s.data.crosshairColor });
      color.addEventListener('input', () => s.set('crosshairColor', color.value));
      rows = [
        crosshairPreview(),
        h('div', { class: 'setting' }, [h('div', { class: 'lbl' }, 'Cor'), color, h('div')]),
        range('crosshairSize', 'Comprimento', 2, 20, 1),
        range('crosshairGap', 'Espaço central', 0, 14, 1),
        range('crosshairThickness', 'Espessura', 1, 5, 1),
        toggle('crosshairDot', 'Ponto central'),
        toggle('crosshairDynamic', 'Abre com a dispersão'),
      ];
    } else if (tab === 'game') {
      rows = [
        choice('difficulty', 'Dificuldade padrão', Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label])),
        range('teamSize', 'Jogadores por time', 1, 5, 1, (v) => `${v}v${v}`),
      ];
    } else if (tab === 'data') {
      const file = h('input', { type: 'file', accept: 'application/json', class: 'hidden' });
      file.addEventListener('change', async () => {
        const f = file.files?.[0];
        if (!f) return;
        try {
          g.save.importJSON(await f.text());
          ui.toast('Save importado — recarregando…');
          setTimeout(() => location.reload(), 600);
        } catch (e) {
          ui.toast(`Falhou: ${/** @type {Error} */ (e).message}`);
        }
      });
      let confirm = false;
      const reset = h('button', { class: 'btn danger' }, 'Apagar tudo');
      reset.addEventListener('click', () => {
        if (!confirm) {
          confirm = true;
          reset.textContent = 'Clique de novo para confirmar';
          return;
        }
        g.save.reset();
        location.reload();
      });
      rows = [
        h('p', { style: { color: 'var(--muted)', fontSize: '13px', maxWidth: '640px' } }, 'O save fica no armazenamento local do navegador (JSON): inventário, itens equipados, float e seed de cada item, configurações e progressão.'),
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, [
          h('button', {
            class: 'btn',
            onclick: () => {
              const blob = new Blob([g.save.exportJSON()], { type: 'application/json' });
              const a = h('a', { href: URL.createObjectURL(blob), download: 'nullpoint-save.json' });
              a.click();
              URL.revokeObjectURL(a.href);
            },
          }, 'Exportar save'),
          h('button', { class: 'btn', onclick: () => file.click() }, 'Importar save'),
          h('button', { class: 'btn', onclick: () => { s.reset(); render(); ui.toast('Configurações restauradas'); } }, 'Restaurar configurações'),
          reset,
          file,
        ]),
      ];
    }
    body.replaceChildren(...rows);
  }
  render();
  return h('div', { class: `screen ${o.inMatch ? 'screen-dark' : 'screen-dark'}` }, [
    ui.topbar('Configurações', [], o.onBack),
    h('div', { class: 'content' }, [tabsEl, body]),
  ]);
}
