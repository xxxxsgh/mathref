// Interface: todas as telas (menus, seleção de times, pausa, substituições,
// tática, pós-jogo, configurações, campeonato, copa, carreira e editor) e o HUD.
import { drawCrest, drawKitPreview, teamOverall, playerOverall, GYMS, ROLE_NAMES, CREST_SHAPES, CREST_PATTERNS, KIT_PATTERNS, makePlayer } from './data.js';
import { FORMATION_NAMES } from './ai.js';
import { RESTART_NAMES } from './game.js';
import { leagueTable, userGame, cupRoundName, playerValue, fixLineup } from './career.js';
import { DEFAULT_KEYS } from './save.js';
import { fmtClock, clamp, rng, deepClone } from './util.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DIFFS = [['facil', 'Fácil'], ['normal', 'Normal'], ['dificil', 'Difícil'], ['craque', 'Craque']];
const DURATIONS = [2, 4, 6, 10];
const QUALS = [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']];
const KEY_LABELS = {
  up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita', pass: 'Passe', shoot: 'Chute', dribble: 'Drible / Arrancada',
  switch: 'Troca / Desarme', sprint: 'Arrancada', chapeu: 'Chapéu', elastico: 'Elástico', pisada: 'Pisada', keeper: 'Goleiro-linha', pause: 'Pausa',
};
const keyName = (c) => (c || '').replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift Esq.').replace('ShiftRight', 'Shift Dir.').replace('Arrow', 'Seta ').replace('Escape', 'Esc').replace('Space', 'Espaço');

function stepper(id, label, value) {
  return `<div class="opt"><label>${label}</label><div class="stepper">
    <button class="arrow" data-a="${id}" data-d="-1" aria-label="anterior">◀</button>
    <span class="val">${value}</span>
    <button class="arrow" data-a="${id}" data-d="1" aria-label="próximo">▶</button></div></div>`;
}
const cyc = (i, d, n) => (i + d + n) % n;

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('screens');
    this.cur = null;
    this.timers = [];
    this.hud = {
      root: document.getElementById('hud'),
      clock: document.querySelector('.sb-clock'), half: document.querySelector('.sb-half'),
      names: document.querySelectorAll('.sb-name'), scores: document.querySelectorAll('.sb-score'), crests: document.querySelectorAll('.sb-crest'),
      fouls: [document.querySelector('.sb-fouls-home'), document.querySelector('.sb-fouls-away')],
      pb: [document.getElementById('playerbox'), document.getElementById('playerbox2')],
      power: document.getElementById('power'), foursec: document.getElementById('foursec'),
      banner: document.getElementById('banner'), toast: document.getElementById('toast'), replay: document.getElementById('replaytag'),
      fps: document.getElementById('fps'), shootout: document.getElementById('shootout'),
    };
    this.bannerT = 0; this.toastT = 0;
    app.input.menuNav = (k) => this.nav(k);
    window.addEventListener('keydown', (e) => {
      if (!this.cur || app.input.remapCallback) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { if (this.cur.querySelector('.btn,.arrow')) { e.preventDefault(); this.nav(e.code === 'ArrowDown' ? 'down' : 'right'); } }
      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { if (this.cur.querySelector('.btn,.arrow')) { e.preventDefault(); this.nav(e.code === 'ArrowUp' ? 'up' : 'left'); } }
      if (e.code === 'Escape' && !app.match) this.nav('back');
    });
  }

  // ─── infraestrutura ──────────────────────────────────────────────────────
  show(html, onAction, cls = '') {
    this.close();
    const el = document.createElement('div');
    el.className = 'screen ' + cls;
    el.innerHTML = html;
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-a]');
      if (!t || !el.contains(t)) return;
      this.app.audio.play('click');
      onAction(t.dataset.a, t, e);
    });
    el.addEventListener('change', (e) => {
      const t = e.target.closest('[data-c]');
      if (t) onAction(t.dataset.c, t, e);
    });
    el.addEventListener('input', (e) => {
      const t = e.target.closest('[data-i]');
      if (t) onAction(t.dataset.i, t, e);
    });
    this.root.appendChild(el);
    this.cur = el;
    this.fillCanvases(el);
    const first = el.querySelector('.btn.primary, .btn');
    if (first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
    return el;
  }

  close() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.cur) this.cur.remove();
    this.cur = null;
  }

  fillCanvases(el) {
    el.querySelectorAll('canvas[data-crest]').forEach((c) => {
      const team = this.app.teamById(c.dataset.crest) || this.tmpTeam;
      if (!team) return;
      const src = drawCrest(team, 32);
      c.width = 32; c.height = 32;
      c.getContext('2d').drawImage(src, 0, 0);
    });
    el.querySelectorAll('canvas[data-kit]').forEach((c) => {
      const [id, k] = c.dataset.kit.split(':');
      const team = this.app.teamById(id) || this.tmpTeam;
      if (!team) return;
      const src = drawKitPreview(team.kits[+k], 4);
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
    });
  }

  nav(k) {
    if (!this.cur) return;
    const items = [...this.cur.querySelectorAll('.btn, .arrow, input, select, .li')].filter((x) => x.offsetParent !== null && !x.disabled);
    if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    if (k === 'ok') { if (i >= 0) items[i].click(); return; }
    if (k === 'back') { const b = this.cur.querySelector('[data-back]'); if (b) b.click(); return; }
    if (k === 'down' || k === 'right') i = i < 0 ? 0 : Math.min(items.length - 1, i + 1);
    else i = i < 0 ? 0 : Math.max(0, i - 1);
    items[i].focus();
    items[i].scrollIntoView({ block: 'nearest' });
  }

  // ─── Título e menu ───────────────────────────────────────────────────────
  title() {
    const el = this.show(`<div class="title-logo">PIXEL<br>FUTSAL</div>
      <div class="muted">Futsal 3D em pixel art</div>
      <div class="title-sub">TOQUE OU APERTE ENTER PARA COMEÇAR</div>
      <div class="spacer"></div><div class="tiny muted">v1.0 · times e jogadores fictícios</div>`, () => {}, 'clear');
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      window.removeEventListener('keydown', key);
      this.app.audio.unlock();
      this.app.audio.startMusic();
      this.app.audio.play('select');
      this.mainMenu();
    };
    const key = (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); go(); } };
    el.addEventListener('pointerup', go, { once: true });
    window.addEventListener('keydown', key);
    this.timers.push(setInterval(() => { if (this.app.input.anyPressed()) go(); }, 100));
  }

  mainMenu() {
    const a = this.app;
    a.showMenuBackground();
    this.show(`<h1>PIXEL FUTSAL</h1><div class="menu">
      <button class="btn primary" data-a="friendly">AMISTOSO RÁPIDO</button>
      <button class="btn" data-a="league">Campeonato<span class="desc">Pontos corridos com 8 times</span></button>
      <button class="btn" data-a="cup">Copa<span class="desc">Mata-mata com 8 ou 16 times</span></button>
      <button class="btn" data-a="career">Carreira de técnico<span class="desc">Temporadas, elenco, táticas e mercado</span></button>
      <button class="btn" data-a="mp">Multijogador local<span class="desc">1x1 ou 2x2 no mesmo aparelho</span></button>
      <button class="btn" data-a="pens">Disputa de pênaltis</button>
      <button class="btn" data-a="editor">Editor de times</button>
      <button class="btn" data-a="settings">Configurações</button>
      <button class="btn" data-a="help">Como jogar</button>
      ${a.installPrompt ? '<button class="btn" data-a="install">Instalar o jogo</button>' : ''}
    </div>`, (act) => {
      if (act === 'friendly') this.matchSetup('friendly');
      if (act === 'mp') this.matchSetup('mp');
      if (act === 'pens') this.matchSetup('pens');
      if (act === 'league') a.openLeague();
      if (act === 'cup') a.openCup();
      if (act === 'career') a.openCareer();
      if (act === 'editor') this.editorList();
      if (act === 'settings') this.settings(() => this.mainMenu());
      if (act === 'help') this.help(() => this.mainMenu());
      if (act === 'install') a.install();
    });
  }

  help(back) {
    this.show(`<h1>COMO JOGAR</h1>
      <div class="panel"><h2>Toque</h2>
      <p>Joystick à esquerda. <b>PASSE</b>: toque = rasteiro, segurar = pelo alto, com DRIBLE segurado = em profundidade.
      <b>CHUTE</b>: segure para dar força; toque rápido = bico; com DRIBLE segurado = colocado (ou cavadinha se for fraco).
      <b>DRIBLE</b>: segurar = arrancada (gasta fôlego); toque = finta; parado = pisada; para trás = elástico; dois toques = chapéu.
      <b>TROCA</b>: sem bola troca de jogador ou dá o bote se o adversário estiver perto; segurar = pressionar com um companheiro.
      Sem bola, <b>CHUTE</b> = carrinho e <b>PASSE</b> = trocar de jogador.</p></div>
      <div class="panel"><h2>Teclado</h2>
      <p>WASD / setas: mover · J: passe · K: chute · L: drible/arrancada · I: troca/desarme · Shift: arrancada ·
      Q: chapéu · E: elástico · R: pisada · G: goleiro-linha · Esc/P: pausa. Tudo remapeável nas configurações.</p></div>
      <div class="panel"><h2>Controle (Xbox / PlayStation)</h2>
      <p>Analógico/direcional: mover · A/✕: passe · X/□: chute · B/○: troca/desarme · Y/△: passe em profundidade ·
      LB/L1: drible · RB/RT: arrancada · LT: modificador (colocado/cavadinha) · analógico direito: chapéu/elástico/pisada · Start: pausa.</p></div>
      <div class="panel"><h2>Regras</h2>
      <p>5 contra 5, substituições ilimitadas. Lateral com o pé, tiro de meta com a mão, 4 segundos para cobranças e para o goleiro na própria metade.
      A partir da 6ª falta acumulada no tempo, tiro livre direto sem barreira da marca dos 10 m. Pênalti na marca dos 6 m.
      Expulso deixa o time com um a menos por 2 minutos ou até sofrer gol. Sem impedimento.</p></div>
      <div class="menu"><button class="btn primary" data-a="back" data-back>VOLTAR</button></div>`, () => back(), 'dim');
  }

  // ─── Configuração da partida ─────────────────────────────────────────────
  matchSetup(mode, preset) {
    const a = this.app, s = a.settings;
    const st = this.setupState = preset || {
      mode, home: 0, away: 5, homeKit: 0, awayKit: 0, gym: s.gym, duration: s.duration, difficulty: s.difficulty, userSide: 0, mp: '1x1',
      assign: {},
    };
    const T = a.teams;
    const render = () => {
      const h = T[st.home], w = T[st.away];
      const card = (t, k, side) => `<div class="teamcard">
        <div class="row"><button class="arrow" data-a="team" data-side="${side}" data-d="-1">◀</button>
        <canvas class="crest" data-crest="${t.id}"></canvas>
        <button class="arrow" data-a="team" data-side="${side}" data-d="1">▶</button></div>
        <div class="tname">${esc(t.name)}</div>
        <div class="ovr">Geral ${teamOverall(t)}</div>
        <canvas data-kit="${t.id}:${k}" style="width:48px;height:80px"></canvas>
        <button class="btn small" data-a="kit" data-side="${side}">Uniforme ${k + 1}</button>
        ${mode === 'friendly' || mode === 'pens' ? `<button class="btn small ${st.userSide === side ? 'primary' : ''}" data-a="side" data-side="${side}">${st.userSide === side ? '★ VOCÊ' : 'CPU'}</button>` : ''}
      </div>`;
      let mp = '';
      if (mode === 'mp') {
        const devs = a.input.devices();
        mp = `<div class="panel"><h2>Controles</h2>
          ${stepper('mpmode', 'Modo', st.mp === '1x1' ? '1 x 1' : st.mp === '2x2' ? '2 x 2' : '2 x CPU')}
          <div class="opt"><label>Dividir teclado (J2 nas setas + N M , .)</label><button class="btn small" data-a="split">${a.input.splitKeyboard ? 'SIM' : 'NÃO'}</button></div>
          ${devs.map((d) => {
            const v = st.assign[d.id] ?? -1;
            return `<div class="opt"><label>${esc(d.label)}</label><div class="stepper">
              <button class="arrow" data-a="dev" data-id="${d.id}" data-d="-1">◀</button>
              <span class="val">${v === 0 ? esc(h.short) + ' (casa)' : v === 1 ? esc(w.short) + ' (fora)' : '—'}</span>
              <button class="arrow" data-a="dev" data-id="${d.id}" data-d="1">▶</button></div></div>`;
          }).join('')}
          <p class="tiny muted">Conecte controles e aperte qualquer botão para aparecerem aqui. ${st.mp === '1x1' ? 'Um jogador em cada time.' : st.mp === '2x2' ? 'Dois jogadores em cada time.' : 'Dois jogadores juntos contra a CPU.'}</p></div>`;
      }
      const el = this.show(`<h1>${mode === 'mp' ? 'MULTIJOGADOR LOCAL' : mode === 'pens' ? 'DISPUTA DE PÊNALTIS' : 'AMISTOSO RÁPIDO'}</h1>
        <div class="versus">${card(h, st.homeKit, 0)}<div class="vs">X</div>${card(w, st.awayKit, 1)}</div>
        <div class="panel">
          ${stepper('gym', 'Ginásio', esc(GYMS[st.gym].name))}
          ${mode !== 'pens' ? stepper('dur', 'Duração (por tempo)', `${st.duration} min`) : ''}
          ${mode !== 'mp' || st.mp === '2xcpu' ? stepper('diff', 'Dificuldade', DIFFS.find((d) => d[0] === st.difficulty)[1]) : ''}
        </div>${mp}
        <div class="menu"><button class="btn primary" data-a="play">JOGAR</button><button class="btn" data-a="back" data-back>Voltar</button></div>`, (act, t) => {
        const d = +t.dataset.d || 0;
        if (act === 'team') { const k = t.dataset.side === '0' ? 'home' : 'away'; st[k] = cyc(st[k], d, T.length); if (st.home === st.away) st[k] = cyc(st[k], d, T.length); }
        if (act === 'kit') { const k = t.dataset.side === '0' ? 'homeKit' : 'awayKit'; st[k] = 1 - st[k]; }
        if (act === 'side') st.userSide = +t.dataset.side;
        if (act === 'gym') st.gym = cyc(st.gym, d, GYMS.length);
        if (act === 'dur') st.duration = DURATIONS[cyc(DURATIONS.indexOf(st.duration), d, DURATIONS.length)];
        if (act === 'diff') st.difficulty = DIFFS[cyc(DIFFS.findIndex((x) => x[0] === st.difficulty), d, 4)][0];
        if (act === 'mpmode') { const ms = ['1x1', '2x2', '2xcpu']; st.mp = ms[cyc(ms.indexOf(st.mp), d, 3)]; }
        if (act === 'split') a.input.splitKeyboard = !a.input.splitKeyboard;
        if (act === 'dev') { const id = t.dataset.id; const v = st.assign[id] ?? -1; st.assign[id] = [-1, 0, 1][cyc([-1, 0, 1].indexOf(v), d, 3)]; }
        if (act === 'back') { this.mainMenu(); return; }
        if (act === 'play') { this.launchSetup(st); return; }
        render();
      });
      el.scrollTop = this.lastScroll || 0;
      el.addEventListener('scroll', () => (this.lastScroll = el.scrollTop));
    };
    this.lastScroll = 0;
    render();
    if (mode === 'mp') {
      let n = a.input.devices().length;
      this.timers.push(setInterval(() => { const m = a.input.devices().length; if (m !== n) { n = m; render(); } }, 700));
    }
  }

  launchSetup(st) {
    const a = this.app, T = a.teams;
    a.settings.gym = st.gym; a.settings.duration = st.duration; a.settings.difficulty = st.difficulty;
    a.saveSettings();
    let humans = [], devices = [];
    if (st.mode === 'mp') {
      const devs = a.input.devices();
      for (const d of devs) {
        const v = st.assign[d.id];
        if (v === 0 || v === 1) { humans.push({ team: v }); devices.push(d); }
      }
      if (!humans.length) { this.toast('Escolha um time para pelo menos um controle.'); return; }
    } else {
      humans = [{ team: st.userSide }];
      devices = null;
    }
    a.startMatch({
      home: T[st.home], away: T[st.away], homeKit: st.homeKit, awayKit: st.awayKit, gym: st.gym,
      halfLen: st.duration * 60, difficulty: st.difficulty, humans, penaltiesOnly: st.mode === 'pens', knockout: st.mode === 'pens',
    }, { mode: st.mode, devices, onEnd: () => this.matchSetup(st.mode, st) });
  }

  // ─── Pausa ───────────────────────────────────────────────────────────────
  pause() {
    const a = this.app, m = a.match;
    const team = a.humanTeam();
    this.show(`<h1>PAUSA</h1><div class="bigscore">${esc(m.teams[0].data.short)} ${m.teams[0].score} x ${m.teams[1].score} ${esc(m.teams[1].data.short)}</div>
      <div class="menu">
        <button class="btn primary" data-a="resume">CONTINUAR</button>
        ${team >= 0 && !m.shootout ? '<button class="btn" data-a="subs">Substituições</button><button class="btn" data-a="tactic">Tática</button>' : ''}
        <button class="btn" data-a="cam">Câmera: ${a.rig.mode === 'tv' ? 'Transmissão (TV)' : 'Atrás do jogador'}</button>
        <button class="btn" data-a="settings">Configurações</button>
        <button class="btn danger" data-a="quit">Sair da partida</button>
      </div>`, (act) => {
      if (act === 'resume') a.resume();
      if (act === 'subs') this.subs(team);
      if (act === 'tactic') this.tactic(team);
      if (act === 'cam') { a.rig.mode = a.rig.mode === 'tv' ? 'behind' : 'tv'; a.settings.camera = a.rig.mode; a.saveSettings(); this.pause(); }
      if (act === 'settings') this.settings(() => this.pause());
      if (act === 'quit') this.confirm('Sair da partida? O resultado não será salvo.', () => a.quitMatch(), () => this.pause());
    }, 'dim');
  }

  confirm(msg, yes, no) {
    this.show(`<h1>CONFIRMAR</h1><div class="panel"><p>${esc(msg)}</p></div><div class="menu">
      <button class="btn primary" data-a="y">SIM</button><button class="btn" data-a="n" data-back>NÃO</button></div>`, (act) => (act === 'y' ? yes() : no()), 'dim');
  }

  subs(teamIdx) {
    const a = this.app, m = a.match, t = m.teams[teamIdx];
    let selOn = -1, selBench = -1;
    const render = () => {
      const on = m.players.filter((p) => p.team === teamIdx);
      this.show(`<h1>SUBSTITUIÇÕES</h1><p class="muted tiny">Ilimitadas e volantes. Escolha quem sai e quem entra.</p>
        <div class="panel"><h2>Em quadra</h2><div class="list">${on.map((p) => `<div class="li ${selOn === p.i ? 'sel' : ''}" data-a="on" data-i="${p.i}">
          <span class="rk">${p.data.number}</span><span>${esc(p.data.name)}</span><span class="pill ${p.isGK ? 'gk' : ''}">${p.isGK ? 'GOL' : ROLE_NAMES[p.data.role]}</span>
          <span class="spacer"></span><small>${p.onCourt ? 'Fôlego ' + Math.round(p.stamina * 100) + '%' : 'FORA'}</small></div>`).join('')}</div></div>
        <div class="panel"><h2>Banco</h2><div class="list">${t.bench.map((d, i) => `<div class="li ${selBench === i ? 'sel' : ''}" data-a="bench" data-i="${i}">
          <span class="rk">${d.number}</span><span>${esc(d.name)}</span><span class="pill ${d.role === 'GK' ? 'gk' : ''}">${ROLE_NAMES[d.role]}</span>
          <span class="spacer"></span><small>${t.sentOff.has(d.id) ? 'EXPULSO' : 'Geral ' + playerOverall(d)}</small></div>`).join('')}</div></div>
        <div class="menu"><button class="btn primary" data-a="swap" ${selOn < 0 || selBench < 0 ? 'disabled' : ''}>TROCAR</button>
        <button class="btn" data-a="back" data-back>Voltar</button></div>`, (act, el) => {
        if (act === 'on') selOn = +el.dataset.i;
        if (act === 'bench') selBench = +el.dataset.i;
        if (act === 'swap') {
          if (!m.substitute(teamIdx, selOn, selBench)) this.toast('Troca não permitida agora.');
          selOn = selBench = -1;
        }
        if (act === 'back') { this.pause(); return; }
        render();
      }, 'dim');
    };
    render();
  }

  tactic(teamIdx) {
    const a = this.app, m = a.match, t = m.teams[teamIdx];
    const MARK = [['zona', 'Por zona'], ['individual', 'Individual']];
    const PRESS = [['recuo', 'Recuo'], ['normal', 'Normal'], ['alta', 'Pressão alta']];
    const render = () => this.show(`<h1>TÁTICA</h1><div class="panel">
      ${stepper('form', 'Formação', t.formation)}
      ${stepper('mark', 'Marcação', MARK.find((x) => x[0] === t.marking)[1])}
      ${stepper('press', 'Postura', PRESS.find((x) => x[0] === t.press)[1])}
      <div class="opt"><label>Goleiro-linha</label><button class="btn small" data-a="gk">${t.keeperOut ? 'LIGADO' : 'DESLIGADO'}</button></div>
      <p class="tiny muted">3-1 e 1-2-1 (losango): fixo, dois alas e pivô. 2-2: equilíbrio. 4-0: rodízio sem pivô fixo.</p></div>
      <div class="menu"><button class="btn primary" data-a="back" data-back>VOLTAR</button></div>`, (act, el) => {
      const d = +el.dataset.d || 0;
      if (act === 'form') t.formation = FORMATION_NAMES[cyc(FORMATION_NAMES.indexOf(t.formation), d, FORMATION_NAMES.length)];
      if (act === 'mark') t.marking = MARK[cyc(MARK.findIndex((x) => x[0] === t.marking), d, 2)][0];
      if (act === 'press') t.press = PRESS[cyc(PRESS.findIndex((x) => x[0] === t.press), d, 3)][0];
      if (act === 'gk') m.toggleKeeperOut(teamIdx);
      if (act === 'back') { this.pause(); return; }
      render();
    }, 'dim');
    render();
  }

  // ─── Intervalo e pós-jogo ────────────────────────────────────────────────
  statsHTML(m) {
    const [A, B] = m.teams.map((t) => t.stats);
    const totalPoss = (A.poss + B.poss) || 1;
    const row = (lab, a, b, fmt = (x) => x) => {
      const tot = (a + b) || 1;
      return `<div class="stats-row"><div class="lab">${lab}</div><b>${fmt(a)}</b><div class="bar"><i style="width:${(a / tot) * 100}%"></i><i style="width:${(b / tot) * 100}%"></i></div><b style="text-align:right">${fmt(b)}</b></div>`;
    };
    return `<div class="panel">
      ${row('Posse de bola', Math.round(A.poss / totalPoss * 100), Math.round(B.poss / totalPoss * 100), (x) => x + '%')}
      ${row('Chutes', A.shots, B.shots)}${row('Chutes no gol', A.onTarget, B.onTarget)}
      ${row('Passes certos', A.passOk, B.passOk)}${row('Defesas', A.saves, B.saves)}
      ${row('Faltas', A.fouls, B.fouls)}${row('Cartões amarelos', A.yellows, B.yellows)}${row('Cartões vermelhos', A.reds, B.reds)}
    </div>`;
  }

  goalsHTML(m) {
    if (!m.goalsLog.length) return '';
    return `<div class="panel tiny">${m.goalsLog.map((g) => `<div>${g.team === 0 ? '◀' : '▶'} ${esc(m.teams[g.team].data.short)} — ${esc(g.name)}${g.own ? ' (contra)' : ''} · ${fmtClock(g.minute)}</div>`).join('')}</div>`;
  }

  halftime() {
    const a = this.app, m = a.match;
    const extra = m.nextIsExtra || m.half >= 3;
    const label = m.nextIsExtra ? 'PRORROGAÇÃO' : m.half === 1 ? '2º TEMPO' : m.half === 3 ? '2º TEMPO DA PRORROGAÇÃO' : 'CONTINUAR';
    this.show(`<h1>${m.half === 1 ? 'INTERVALO' : extra ? 'PRORROGAÇÃO' : 'FIM DO TEMPO'}</h1>
      <div class="bigscore">${esc(m.teams[0].data.short)} ${m.teams[0].score} x ${m.teams[1].score} ${esc(m.teams[1].data.short)}</div>
      ${this.goalsHTML(m)}${this.statsHTML(m)}
      <div class="menu"><button class="btn primary" data-a="go">${label}</button>
      ${a.humanTeam() >= 0 ? '<button class="btn" data-a="subs">Substituições</button>' : ''}</div>`, (act) => {
      if (act === 'go') { m.nextIsExtra = false; a.nextPeriod(); }
      if (act === 'subs') { this.subsHalftime(); }
    }, 'dim');
  }

  subsHalftime() {
    // reaproveita a tela de substituições e volta ao intervalo
    const prevPause = this.pause.bind(this);
    this.pause = () => { this.pause = prevPause; this.halftime(); };
    this.subs(this.app.humanTeam());
  }

  postMatch(onContinue) {
    const m = this.app.match;
    const so = m.shootout;
    this.show(`<h1>FIM DE JOGO</h1>
      <div class="row"><canvas class="crest" data-crest="${m.teams[0].data.id}" style="width:48px;height:48px;image-rendering:pixelated"></canvas>
      <div class="bigscore">${m.teams[0].score} x ${m.teams[1].score}</div>
      <canvas class="crest" data-crest="${m.teams[1].data.id}" style="width:48px;height:48px;image-rendering:pixelated"></canvas></div>
      <div class="muted">${esc(m.teams[0].data.name)} x ${esc(m.teams[1].data.name)}</div>
      ${so && so.done ? `<div class="panel" style="text-align:center">Pênaltis: ${so.kicks[0].filter(Boolean).length} x ${so.kicks[1].filter(Boolean).length} — vence ${esc(m.teams[so.winner].data.name)}</div>` : ''}
      ${this.goalsHTML(m)}${m.cfg.penaltiesOnly ? '' : this.statsHTML(m)}
      <div class="menu"><button class="btn primary" data-a="ok">CONTINUAR</button></div>`, () => onContinue(), 'dim');
  }

  // ─── Configurações ───────────────────────────────────────────────────────
  settings(back) {
    const a = this.app, s = a.settings;
    const render = () => {
      const el = this.show(`<h1>CONFIGURAÇÕES</h1>
        <div class="panel"><h2>Áudio</h2>
          <div class="opt"><label>Música</label><input type="range" min="0" max="1" step="0.05" value="${s.vol.music}" data-i="vol" data-k="music"></div>
          <div class="opt"><label>Efeitos</label><input type="range" min="0" max="1" step="0.05" value="${s.vol.sfx}" data-i="vol" data-k="sfx"></div>
          <div class="opt"><label>Narração</label><input type="range" min="0" max="1" step="0.05" value="${s.vol.voice}" data-i="vol" data-k="voice"></div>
        </div>
        <div class="panel"><h2>Vídeo</h2>
          ${stepper('qual', 'Qualidade', QUALS.find((q) => q[0] === s.quality)[1])}
          <div class="opt"><label>Mostrar FPS</label><button class="btn small" data-a="fps">${s.showFps ? 'SIM' : 'NÃO'}</button></div>
        </div>
        <div class="panel"><h2>Jogo</h2>
          ${stepper('cam', 'Câmera padrão', s.camera === 'tv' ? 'Transmissão' : 'Atrás do jogador')}
          <div class="opt"><label>Troca automática de jogador</label><button class="btn small" data-a="auto">${s.autoSwitch ? 'SIM' : 'NÃO'}</button></div>
          <div class="opt"><label>Replay automático do gol</label><button class="btn small" data-a="rep">${s.replays ? 'SIM' : 'NÃO'}</button></div>
        </div>
        <div class="panel"><h2>Controles de toque</h2>
          <div class="opt"><label>Tamanho</label><input type="range" min="0.7" max="1.5" step="0.05" value="${s.touch.size}" data-i="tsize"></div>
          <div class="opt"><label>Opacidade</label><input type="range" min="0.15" max="0.9" step="0.05" value="${s.touch.opacity}" data-i="topa"></div>
          <div class="opt"><label>Posição dos controles</label><button class="btn small" data-a="layout">AJUSTAR</button></div>
        </div>
        <div class="panel"><h2>Teclado</h2>
          ${Object.keys(DEFAULT_KEYS).map((k) => `<div class="opt"><label>${KEY_LABELS[k]}</label><button class="btn small" data-a="remap" data-k="${k}">${esc(keyName(s.keys[k]))}</button></div>`).join('')}
          <div class="row" style="margin-top:8px"><button class="btn small" data-a="keysReset">Restaurar padrão</button></div>
        </div>
        <div class="panel tiny muted">Saves: ${a.storageOk() ? 'armazenamento local ativo.' : 'armazenamento indisponível — o progresso vale só nesta sessão.'}</div>
        <div class="menu"><button class="btn primary" data-a="back" data-back>VOLTAR</button></div>`, (act, el) => {
        const d = +el.dataset.d || 0;
        if (act === 'vol') { s.vol[el.dataset.k] = +el.value; a.audio.applyVolumes(); a.saveSettings(); return; }
        if (act === 'tsize') { s.touch.size = +el.value; a.input.layoutTouch(); a.saveSettings(); return; }
        if (act === 'topa') { s.touch.opacity = +el.value; a.input.layoutTouch(); a.saveSettings(); return; }
        if (act === 'qual') { s.quality = QUALS[cyc(QUALS.findIndex((q) => q[0] === s.quality), d, 3)][0]; a.renderer.setQuality(s.quality); }
        if (act === 'fps') s.showFps = !s.showFps;
        if (act === 'cam') { s.camera = s.camera === 'tv' ? 'behind' : 'tv'; a.rig.mode = s.camera; }
        if (act === 'auto') s.autoSwitch = !s.autoSwitch;
        if (act === 'rep') s.replays = !s.replays;
        if (act === 'layout') { this.touchLayout(() => this.settings(back)); return; }
        if (act === 'remap') {
          el.textContent = 'Aperte uma tecla…';
          a.input.remapCallback = (code) => {
            if (code !== 'Escape' || el.dataset.k === 'pause') s.keys[el.dataset.k] = code;
            a.saveSettings(); render();
          };
          return;
        }
        if (act === 'keysReset') s.keys = { ...DEFAULT_KEYS };
        if (act === 'back') { a.saveSettings(); back(); return; }
        a.saveSettings();
        render();
      }, 'dim');
      el.scrollTop = this.setScroll || 0;
      el.addEventListener('scroll', () => (this.setScroll = el.scrollTop));
    };
    this.setScroll = 0;
    render();
  }

  touchLayout(back) {
    const a = this.app, s = a.settings.touch;
    this.close();
    const el = document.createElement('div');
    el.className = 'layout-edit';
    const W = () => window.innerWidth, H = () => window.innerHeight;
    el.innerHTML = `<div class="bar"><button class="btn small" data-a="reset">Padrão</button><button class="btn small primary" data-a="ok">PRONTO</button></div>
      <div class="handle" data-h="joy">JOYSTICK<br>arraste</div><div class="handle" data-h="btn">BOTÕES<br>arraste</div>`;
    this.root.appendChild(el);
    this.cur = el;
    const place = () => {
      const j = el.querySelector('[data-h=joy]'), b = el.querySelector('[data-h=btn]');
      const js = 130 * s.size, bs = 210 * s.size;
      Object.assign(j.style, { width: js + 'px', height: js + 'px', left: W() * s.joyX - js / 2 + 'px', top: H() * s.joyY - js / 2 + 'px' });
      Object.assign(b.style, { width: bs + 'px', height: bs + 'px', left: W() * s.btnX - bs / 2 + 'px', top: H() * s.btnY - bs / 2 + 'px' });
    };
    place();
    el.querySelectorAll('.handle').forEach((h) => {
      h.addEventListener('pointerdown', (e) => {
        h.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const x = clamp(ev.clientX / W(), 0.05, 0.95), y = clamp(ev.clientY / H(), 0.15, 0.95);
          if (h.dataset.h === 'joy') { s.joyX = x; s.joyY = y; } else { s.btnX = x; s.btnY = y; }
          place();
        };
        const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
      });
    });
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-a]');
      if (!t) return;
      if (t.dataset.a === 'reset') { Object.assign(s, { joyX: 0.14, joyY: 0.72, btnX: 0.86, btnY: 0.7 }); place(); }
      if (t.dataset.a === 'ok') { a.saveSettings(); a.input.layoutTouch(); back(); }
    });
  }

  // ─── Campeonato ──────────────────────────────────────────────────────────
  tableHTML(rows, userId, teamsById) {
    return `<table class="tbl"><tr><th>#</th><th class="l">Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr>
      ${rows.map((r, i) => `<tr class="${r.id === userId ? 'me' : ''}"><td>${i + 1}</td><td class="l">${esc(teamsById[r.id].name)}</td><td><b>${r.p}</b></td><td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.gp - r.gc}</td></tr>`).join('')}</table>`;
  }

  gamesHTML(games, teamsById, userId) {
    return games.map((g) => `<div class="li ${g.h === userId || g.a === userId ? 'sel' : ''}"><span style="flex:1;text-align:right">${esc(teamsById[g.h].name)}</span>
      <b style="min-width:70px;text-align:center">${g.res ? `${g.res.home} x ${g.res.away}${g.res.pens ? ` <small>(${g.res.pens[0]}-${g.res.pens[1]})</small>` : ''}` : 'x'}</b>
      <span style="flex:1">${esc(teamsById[g.a].name)}</span></div>`).join('');
  }

  pickTeam(title, onPick, back, extra = '') {
    const T = this.app.teams;
    this.show(`<h1>${title}</h1>${extra}<p class="muted">Escolha o seu time</p><div class="list" style="max-width:520px">
      ${T.map((t, i) => `<div class="li" data-a="pick" data-i="${i}"><canvas data-crest="${t.id}" style="width:28px;height:28px;image-rendering:pixelated"></canvas>
      <span>${esc(t.name)}</span><span class="spacer"></span><small>Geral ${teamOverall(t)}</small></div>`).join('')}</div>
      <div class="menu"><button class="btn" data-a="back" data-back>Voltar</button></div>`, (act, el) => {
      if (act === 'pick') onPick(T[+el.dataset.i]);
      if (act === 'back') back();
    });
  }

  leagueHub(lg, teamsById, actions) {
    const ug = userGame(lg);
    const rows = leagueTable(lg);
    const round = lg.rounds[Math.min(lg.round, lg.rounds.length - 1)];
    const champion = lg.done ? teamsById[rows[0].id] : null;
    this.show(`<h1>CAMPEONATO</h1>
      ${lg.done ? `<div class="panel" style="text-align:center"><h2>🏆 CAMPEÃO: ${esc(champion.name)}</h2>Você terminou em ${rows.findIndex((r) => r.id === lg.userTeam) + 1}º lugar.</div>` :
      `<div class="panel"><h2>Rodada ${lg.round + 1} de ${lg.rounds.length}</h2>${this.gamesHTML(round, teamsById, lg.userTeam)}</div>`}
      <div class="panel">${this.tableHTML(rows, lg.userTeam, teamsById)}</div>
      <div class="menu">
        ${!lg.done && ug ? '<button class="btn primary" data-a="play">JOGAR PARTIDA</button><button class="btn" data-a="sim">Simular minha partida</button>' : ''}
        ${lg.done ? '<button class="btn primary" data-a="new">Novo campeonato</button>' : '<button class="btn" data-a="abandon">Abandonar campeonato</button>'}
        <button class="btn" data-a="back" data-back>Menu principal</button></div>`, (act) => actions(act));
  }

  cupOptions(next, back) {
    let size = 8, extra = true;
    const render = () => this.show(`<h1>NOVA COPA</h1><div class="panel">
      ${stepper('size', 'Times', String(size))}
      <div class="opt"><label>Prorrogação antes dos pênaltis</label><button class="btn small" data-a="xt">${extra ? 'SIM' : 'NÃO'}</button></div></div>
      <div class="menu"><button class="btn primary" data-a="ok">ESCOLHER TIME</button><button class="btn" data-a="back" data-back>Voltar</button></div>`, (act) => {
      if (act === 'size') size = size === 8 ? 16 : 8;
      if (act === 'xt') extra = !extra;
      if (act === 'ok') { next(size, extra); return; }
      if (act === 'back') { back(); return; }
      render();
    });
    render();
  }

  cupHub(cup, teamsById, actions) {
    const games = cup.rounds[cup.round];
    const ug = userGame(cup);
    this.show(`<h1>COPA</h1>
      ${cup.done ? `<div class="panel" style="text-align:center"><h2>🏆 CAMPEÃO: ${esc(teamsById[cup.champion].name)}</h2></div>` : ''}
      ${cup.eliminated && !cup.done ? '<div class="panel" style="text-align:center">Seu time foi eliminado.</div>' : ''}
      ${cup.rounds.map((r, i) => `<div class="panel"><h2>${cupRoundName(r.length * 2)}</h2>${this.gamesHTML(r, teamsById, cup.userTeam)}</div>`).join('')}
      <div class="menu">
        ${!cup.done && ug ? '<button class="btn primary" data-a="play">JOGAR PARTIDA</button><button class="btn" data-a="sim">Simular minha partida</button>' : ''}
        ${!cup.done && !ug ? '<button class="btn primary" data-a="simall">Simular rodada</button>' : ''}
        ${cup.done || cup.eliminated ? '<button class="btn" data-a="new">Nova copa</button>' : '<button class="btn" data-a="abandon">Abandonar copa</button>'}
        <button class="btn" data-a="back" data-back>Menu principal</button></div>`, (act) => actions(act));
  }

  // ─── Carreira ────────────────────────────────────────────────────────────
  careerHub(car, actions, tab = 'home') {
    const teamsById = Object.fromEntries(car.teams.map((t) => [t.id, t]));
    const me = teamsById[car.userTeam];
    this.tmpTeam = null;
    const lg = car.league;
    const rows = leagueTable(lg);
    const ug = userGame(lg);
    const tabs = [['home', 'Início'], ['table', 'Tabela'], ['squad', 'Escalação'], ['tactic', 'Tática'], ['market', 'Mercado'], ['hist', 'Histórico']];
    let body = '';
    if (tab === 'home') {
      const round = lg.rounds[Math.min(lg.round, lg.rounds.length - 1)];
      const opp = ug ? teamsById[ug.h === car.userTeam ? ug.a : ug.h] : null;
      body = `<div class="panel"><h2>${esc(me.name)} · Temporada ${car.season}</h2>
        <div>Posição: <b>${rows.findIndex((r) => r.id === car.userTeam) + 1}º</b> · Verba: <b>R$ ${(car.budget / 1000).toFixed(0)} mil</b></div>
        ${opp ? `<div style="margin-top:6px">Próximo jogo (rodada ${lg.round + 1}/${lg.rounds.length}): <b>${ug.h === car.userTeam ? 'em casa' : 'fora'}</b> contra <b>${esc(opp.name)}</b> (geral ${teamOverall(opp)})</div>` : ''}
        ${lg.done ? '<div style="margin-top:6px"><b>Temporada encerrada!</b></div>' : ''}</div>
        <div class="panel tiny">${car.news.slice(0, 6).map((n) => `<div>• ${esc(n)}</div>`).join('')}</div>
        ${!lg.done ? `<div class="panel"><h2>Rodada ${lg.round + 1}</h2>${this.gamesHTML(round, teamsById, car.userTeam)}</div>` : ''}`;
    } else if (tab === 'table') {
      body = `<div class="panel">${this.tableHTML(rows, car.userTeam, teamsById)}</div>`;
    } else if (tab === 'squad') {
      fixLineup(me);
      const lu = me.tactic.lineup;
      body = `<div class="panel"><p class="tiny muted">Toque em um titular e depois em um reserva para trocar. O primeiro titular é o goleiro.</p>
        <div class="list">${me.players.map((p, i) => {
          const pos = lu.indexOf(i);
          return `<div class="li ${this.squadSel === i ? 'sel' : ''}" data-a="sq" data-i="${i}"><span class="rk">${pos >= 0 ? (pos === 0 ? 'GOL' : 'T' + pos) : ''}</span>
          <span>${p.number} ${esc(p.name)}</span><span class="pill ${p.role === 'GK' ? 'gk' : ''}">${ROLE_NAMES[p.role]}</span><span class="spacer"></span>
          <small>${p.age} anos · Geral ${playerOverall(p)} · ${p.role === 'GK' ? `REF ${p.ref} POS ${p.pos} REP ${p.rep}` : `VEL ${p.vel} PAS ${p.pas} FIN ${p.fin} DRI ${p.dri} MAR ${p.mar} FOL ${p.fol}`}</small></div>`;
        }).join('')}</div></div>`;
    } else if (tab === 'tactic') {
      const tc = me.tactic;
      body = `<div class="panel">${stepper('form', 'Formação', tc.formation)}
        ${stepper('mark', 'Marcação', tc.marking === 'zona' ? 'Por zona' : 'Individual')}
        ${stepper('press', 'Postura', { recuo: 'Recuo', normal: 'Normal', alta: 'Pressão alta' }[tc.press])}</div>`;
    } else if (tab === 'market') {
      const others = car.teams.filter((t) => t.id !== car.userTeam);
      body = `<div class="panel"><h2>Vender</h2><div class="list">${me.players.map((p) => `<div class="li"><span>${esc(p.name)}</span><span class="pill">${ROLE_NAMES[p.role]}</span><span class="spacer"></span>
          <small>Geral ${playerOverall(p)} · R$ ${(playerValue(p) * 0.8 / 1000).toFixed(0)} mil</small><button class="btn small" data-a="sell" data-id="${p.id}">Vender</button></div>`).join('')}</div></div>
        <div class="panel"><h2>Comprar · verba R$ ${(car.budget / 1000).toFixed(0)} mil</h2><div class="list">${others.flatMap((t) => t.players.map((p) => ({ t, p })))
          .sort((x, y) => playerOverall(y.p) - playerOverall(x.p)).slice(0, 40)
          .map(({ t, p }) => `<div class="li"><span>${esc(p.name)} <small>${esc(t.short)}</small></span><span class="pill">${ROLE_NAMES[p.role]}</span><span class="spacer"></span>
          <small>${p.age}a · Geral ${playerOverall(p)} · R$ ${(playerValue(p) / 1000).toFixed(0)} mil</small><button class="btn small" data-a="buy" data-t="${t.id}" data-id="${p.id}">Comprar</button></div>`).join('')}</div></div>`;
    } else if (tab === 'hist') {
      body = `<div class="panel">${car.history.length ? `<table class="tbl"><tr><th>Temp.</th><th>Posição</th><th>Pontos</th><th class="l">Campeão</th></tr>
        ${car.history.map((h) => `<tr><td>${h.season}</td><td>${h.pos}º</td><td>${h.pts}</td><td class="l">${esc(h.champion)}</td></tr>`).join('')}</table>` : '<p class="muted">Nenhuma temporada concluída ainda.</p>'}</div>`;
    }
    const el = this.show(`<h1>CARREIRA</h1><div class="tabs">${tabs.map(([k, l]) => `<button class="btn ${k === tab ? 'on' : ''}" data-a="tab" data-t="${k}">${l}</button>`).join('')}</div>
      ${body}
      <div class="menu">
        ${!lg.done && ug ? '<button class="btn primary" data-a="play">JOGAR PRÓXIMA PARTIDA</button><button class="btn" data-a="sim">Simular partida</button>' : ''}
        ${lg.done ? '<button class="btn primary" data-a="endSeason">INICIAR PRÓXIMA TEMPORADA</button>' : ''}
        <button class="btn" data-a="back" data-back>Menu principal</button>
        <button class="btn danger" data-a="abandon">Encerrar carreira</button></div>`, (act, el2) => {
      if (act === 'tab') { this.squadSel = -1; this.careerHub(car, actions, el2.dataset.t); return; }
      if (act === 'sq') {
        const i = +el2.dataset.i;
        if (this.squadSel == null || this.squadSel < 0) { this.squadSel = i; }
        else {
          const lu = me.tactic.lineup, a = this.squadSel;
          const pa = lu.indexOf(a), pb = lu.indexOf(i);
          if (pa >= 0 && pb < 0) lu[pa] = i; else if (pb >= 0 && pa < 0) lu[pb] = a; else if (pa >= 0 && pb >= 0) { lu[pa] = i; lu[pb] = a; }
          this.squadSel = -1;
          actions('save');
        }
        this.careerHub(car, actions, 'squad');
        return;
      }
      if (act === 'form' || act === 'mark' || act === 'press') {
        const d = +el2.dataset.d, tc = me.tactic;
        if (act === 'form') tc.formation = FORMATION_NAMES[cyc(FORMATION_NAMES.indexOf(tc.formation), d, FORMATION_NAMES.length)];
        if (act === 'mark') tc.marking = tc.marking === 'zona' ? 'individual' : 'zona';
        if (act === 'press') { const P = ['recuo', 'normal', 'alta']; tc.press = P[cyc(P.indexOf(tc.press), d, 3)]; }
        actions('save');
        this.careerHub(car, actions, 'tactic');
        return;
      }
      if (act === 'buy' || act === 'sell') { actions(act, el2.dataset); this.careerHub(car, actions, 'market'); return; }
      actions(act);
    });
    return el;
  }

  // ─── Editor de times ─────────────────────────────────────────────────────
  editorList() {
    const a = this.app, T = a.teams;
    this.show(`<h1>EDITOR DE TIMES</h1><div class="list" style="max-width:520px">
      ${T.map((t, i) => `<div class="li" data-a="edit" data-i="${i}"><canvas data-crest="${t.id}" style="width:28px;height:28px;image-rendering:pixelated"></canvas>
      <span>${esc(t.name)}</span><span class="spacer"></span><small>Geral ${teamOverall(t)}</small></div>`).join('')}</div>
      <div class="menu">
        <button class="btn" data-a="export">Exportar todos (JSON)</button>
        <button class="btn" data-a="import">Importar time(s) de arquivo JSON</button>
        <button class="btn danger" data-a="reset">Restaurar times originais</button>
        <button class="btn" data-a="back" data-back>Voltar</button></div>
      <input type="file" accept="application/json,.json" id="importFile" hidden>`, (act, el) => {
      if (act === 'edit') this.editorTeam(+el.dataset.i);
      if (act === 'export') a.exportTeams(T, 'pixel-futsal-times.json');
      if (act === 'import') {
        const f = document.getElementById('importFile');
        f.onchange = async () => { const msg = await a.importTeams(f.files[0]); this.toast(msg); this.editorList(); };
        f.click();
      }
      if (act === 'reset') this.confirm('Restaurar os 16 times originais? Suas edições serão perdidas.', async () => { await a.resetTeams(); this.editorList(); }, () => this.editorList());
      if (act === 'back') this.mainMenu();
    });
  }

  editorTeam(idx) {
    const a = this.app;
    const t = deepClone(a.teams[idx]);
    this.tmpTeam = t;
    const kitEd = (k, n) => `<div class="opt"><label>Uniforme ${n + 1}</label><div class="row">
      <input type="color" value="${k.shirt}" data-c="kit" data-n="${n}" data-k="shirt" title="Camisa">
      <input type="color" value="${k.shirt2}" data-c="kit" data-n="${n}" data-k="shirt2" title="Detalhe">
      <input type="color" value="${k.shorts}" data-c="kit" data-n="${n}" data-k="shorts" title="Calção">
      <input type="color" value="${k.socks}" data-c="kit" data-n="${n}" data-k="socks" title="Meião">
      <select data-c="kit" data-n="${n}" data-k="pattern">${KIT_PATTERNS.map((p) => `<option ${p === k.pattern ? 'selected' : ''}>${p}</option>`).join('')}</select>
      <canvas data-kit="${t.id}:${n}" style="width:30px;height:50px"></canvas></div></div>`;
    const render = () => {
      const el = this.show(`<h1>EDITAR TIME</h1>
        <div class="panel">
          <div class="opt"><label>Nome</label><input type="text" maxlength="24" value="${esc(t.name)}" data-c="name"></div>
          <div class="opt"><label>Sigla (3 letras)</label><input type="text" maxlength="3" value="${esc(t.short)}" data-c="short" style="width:70px;text-transform:uppercase"></div>
          <div class="opt"><label>Escudo</label><div class="row">
            <select data-c="crest" data-k="shape">${CREST_SHAPES.map((p) => `<option ${p === t.crest.shape ? 'selected' : ''}>${p}</option>`).join('')}</select>
            <select data-c="crest" data-k="pattern">${CREST_PATTERNS.map((p) => `<option ${p === t.crest.pattern ? 'selected' : ''}>${p}</option>`).join('')}</select>
            <input type="color" value="${t.crest.c1}" data-c="crest" data-k="c1"><input type="color" value="${t.crest.c2}" data-c="crest" data-k="c2">
            <canvas data-crest="${t.id}" style="width:48px;height:48px;image-rendering:pixelated"></canvas></div></div>
          ${kitEd(t.kits[0], 0)}${kitEd(t.kits[1], 1)}
        </div>
        <div class="panel"><h2>Elenco</h2><div style="overflow-x:auto"><table class="tbl"><tr><th>Nº</th><th class="l">Nome</th><th>Pos</th><th>Idade</th><th>VEL</th><th>PAS</th><th>FIN</th><th>DRI</th><th>MAR</th><th>FOL</th><th>REF</th><th>POS</th><th>REP</th></tr>
          ${t.players.map((p, i) => `<tr><td><input type="number" min="1" max="99" value="${p.number}" data-c="pl" data-i="${i}" data-k="number"></td>
            <td class="l"><input type="text" maxlength="18" value="${esc(p.name)}" data-c="pl" data-i="${i}" data-k="name" style="width:120px"></td>
            <td><select data-c="pl" data-i="${i}" data-k="role">${['GK', 'FIX', 'ALA', 'PIV'].map((r) => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${ROLE_NAMES[r]}</option>`).join('')}</select></td>
            <td><input type="number" min="15" max="45" value="${p.age}" data-c="pl" data-i="${i}" data-k="age"></td>
            ${['vel', 'pas', 'fin', 'dri', 'mar', 'fol', 'ref', 'pos', 'rep'].map((k) => `<td><input type="number" min="1" max="99" value="${p[k]}" data-c="pl" data-i="${i}" data-k="${k}"></td>`).join('')}</tr>`).join('')}
        </table></div>
        <div class="row" style="margin-top:8px"><button class="btn small" data-a="addp" ${t.players.length >= 14 ? 'disabled' : ''}>+ Jogador</button><button class="btn small" data-a="delp" ${t.players.length <= 8 ? 'disabled' : ''}>− Último jogador</button></div></div>
        <div class="menu"><button class="btn primary" data-a="save">SALVAR</button><button class="btn" data-a="export">Exportar este time (JSON)</button><button class="btn" data-a="back" data-back>Cancelar</button></div>`, (act, el2) => {
        if (act === 'name') t.name = el2.value.trim().slice(0, 24) || t.name;
        if (act === 'short') t.short = el2.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || t.short;
        if (act === 'crest') { t.crest[el2.dataset.k] = el2.value; this.fillCanvases(this.cur); return; }
        if (act === 'kit') { t.kits[+el2.dataset.n][el2.dataset.k] = el2.value; this.fillCanvases(this.cur); return; }
        if (act === 'pl') {
          const p = t.players[+el2.dataset.i], k = el2.dataset.k;
          if (k === 'name') p.name = el2.value.trim().slice(0, 18) || p.name;
          else if (k === 'role') p.role = el2.value;
          else p[k] = clamp(Math.round(+el2.value || 1), k === 'age' ? 15 : 1, k === 'age' ? 45 : 99);
          return;
        }
        if (act === 'addp') { t.players.push(makePlayer(rng(Date.now()), 'ALA', teamOverall(t), 20 + t.players.length)); render(); }
        if (act === 'delp') { t.players.pop(); fixLineup(t); render(); }
        if (act === 'save') {
          if (!t.players.some((p) => p.role === 'GK')) { this.toast('O time precisa de pelo menos um goleiro.'); return; }
          fixLineup(t);
          a.teams[idx] = t; a.saveTeams(); this.toast('Time salvo!'); this.editorList();
        }
        if (act === 'export') a.exportTeams([t], `${t.short.toLowerCase()}.json`);
        if (act === 'back') this.editorList();
      }, 'dim');
      el.scrollTop = this.edScroll || 0;
      el.addEventListener('scroll', () => (this.edScroll = el.scrollTop));
    };
    this.edScroll = 0;
    render();
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────
  hudSetup(m) {
    const h = this.hud;
    h.root.classList.remove('hidden');
    m.teams.forEach((t, i) => {
      h.names[i].textContent = t.data.short;
      const c = h.crests[i];
      const src = drawCrest(t.data, 32);
      c.width = 32; c.height = 32;
      c.getContext('2d').drawImage(src, 0, 0);
    });
    h.shootout.classList.add('hidden');
    h.banner.classList.add('hidden');
    h.replay.classList.add('hidden');
  }

  hudHide() { this.hud.root.classList.add('hidden'); }

  hudUpdate(m, dt, fps) {
    const h = this.hud;
    m.teams.forEach((t, i) => {
      h.scores[i].textContent = t.score;
      const f = Math.min(t.fouls, 5);
      let html = '';
      for (let k = 0; k < 5; k++) html += `<i class="${k < f ? (t.fouls >= 5 ? 'hot' : 'on') : ''}"></i>`;
      if (t.fouls > 5) html += `<span>+${t.fouls - 5}</span>`;
      if (t.short > 0) html += `<span class="short">−1 ${fmtClock(t.short)}</span>`;
      if (t.keeperOut) html += `<span class="short">GL</span>`;
      h.fouls[i].innerHTML = html;
    });
    h.clock.textContent = m.shootout ? '— —' : fmtClock(m.clock);
    h.half.textContent = m.shootout ? 'PÊNALTIS' : m.half <= 2 ? `${m.half}º TEMPO` : `PRORR. ${m.half - 2}º`;
    // jogadores controlados
    m.humans.slice(0, 2).forEach((hu, k) => {
      const box = h.pb[k];
      const p = m.players[hu.player];
      box.classList.toggle('hidden', !p);
      if (!p) return;
      box.querySelector('.pb-num').textContent = p.data.number;
      box.querySelector('.pb-name').textContent = p.data.name;
      box.querySelector('.pb-stam i').style.width = `${Math.round(p.stamina * 100)}%`;
    });
    if (m.humans.length < 2) h.pb[1].classList.add('hidden');
    if (!m.humans.length) h.pb[0].classList.add('hidden');
    // força do chute
    const charge = Math.max(0, ...m.humans.map((x) => x.chargeShoot || 0));
    h.power.classList.toggle('hidden', charge <= 0.02);
    if (charge > 0.02) h.power.querySelector('i').style.width = `${charge * 100}%`;
    // 4 segundos
    const r = m.restart;
    const show4 = m.state === 'restart' && r && r.count;
    h.foursec.classList.toggle('hidden', !show4);
    if (show4) h.foursec.textContent = String(Math.max(1, 4 - Math.floor(r.clock)));
    const gkCount = Math.max(m.gkTimer[0], m.gkTimer[1]);
    if (m.state === 'play' && gkCount > 1) { h.foursec.classList.remove('hidden'); h.foursec.textContent = String(Math.max(1, 4 - Math.floor(gkCount))); }
    // pênaltis
    if (m.shootout) {
      h.shootout.classList.remove('hidden');
      const so = m.shootout;
      h.shootout.innerHTML = so.kicks.map((ks, i) => {
        const n = Math.max(5, ks.length, so.kicks[1 - i].length);
        let s = '';
        for (let k = 0; k < n; k++) s += `<i class="${ks[k] === true ? 'g' : ks[k] === false ? 'm' : ''}"></i>`;
        return `<div class="so-row"><b>${esc(m.teams[i].data.short)}</b>${s}</div>`;
      }).join('');
    }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) h.banner.classList.add('hidden'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) h.toast.classList.add('hidden'); }
    h.fps.classList.toggle('hidden', !this.app.settings.showFps);
    if (this.app.settings.showFps && fps) h.fps.textContent = `${fps} fps · ${this.app.renderer.lowW}×${this.app.renderer.lowH} · ${this.app.renderer.gl.info.render.calls} draws`;
  }

  banner(main, sub = '', dur = 1.8, cls = '') {
    const b = this.hud.banner;
    b.className = cls;
    b.querySelector('.bn-main').textContent = main;
    b.querySelector('.bn-sub').textContent = sub;
    this.bannerT = dur;
  }

  toast(msg, dur = 2.2) {
    const t = this.hud.toast;
    t.textContent = msg;
    t.classList.remove('hidden');
    this.toastT = dur;
    // fora da partida o HUD está oculto: usa um aviso temporário na tela
    if (this.hud.root.classList.contains('hidden') && this.cur) {
      const n = document.createElement('div');
      n.className = 'panel';
      n.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:auto;z-index:60;border-color:#facc15';
      n.textContent = msg;
      document.body.appendChild(n);
      setTimeout(() => n.remove(), dur * 1000);
    }
  }

  restartBanner(type, teamName, note) {
    this.banner(RESTART_NAMES[type] || '', note ? `${note} · ${teamName}` : teamName, 1.4, 'small');
  }
}
