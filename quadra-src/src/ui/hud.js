// HUD e telas (menu, pausa, fim de jogo) em DOM simples.
import { TEAMS } from '../sim/teams.js';
import { VENUES, CONFIG } from '../config.js';

const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};

const LS_KEY = 'quadraviva.opts';
function loadOpts() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveOpts(o) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch {
    /* navegação privada */
  }
}

export class Hud {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.screen = null;
    this.game = h('div', 'game');
    this.game.style.display = 'none';
    root.appendChild(this.game);
    this.buildGame();
    this.touch = matchMedia('(pointer: coarse)').matches;
    if (this.touch) document.body.classList.add('touch-on');
    window.addEventListener(
      'touchstart',
      () => {
        if (!this.touch) {
          this.touch = true;
          document.body.classList.add('touch-on');
        }
      },
      { passive: true },
    );
    this.clockTaps = [];
  }

  buildGame() {
    const g = this.game;
    this.sb = h('div', 'scoreboard');
    this.sbHome = h('div', 'team');
    this.sbScore = h('div', 'score');
    this.sbAway = h('div', 'team');
    this.sbClock = h('div', 'clock');
    this.sb.append(this.sbHome, this.sbScore, this.sbAway, this.sbClock);
    g.appendChild(this.sb);
    // toque escondido: 5 toques no relógio ligam o modo de teste
    this.sbClock.addEventListener('pointerdown', () => {
      const now = performance.now();
      this.clockTaps = this.clockTaps.filter((t) => now - t < 2000);
      this.clockTaps.push(now);
      if (this.clockTaps.length >= 5) {
        this.clockTaps = [];
        this.onDebug?.();
      }
    });
    this.foulsEl = h('div', 'fouls');
    g.appendChild(this.foulsEl);
    this.windEl = h('div', 'wind');
    g.appendChild(this.windEl);
    this.pauseBtn = h('button', 'pausebtn', '❚❚');
    this.pauseBtn.setAttribute('aria-label', 'Pausar');
    this.pauseBtn.addEventListener('click', () => this.onPause?.());
    g.appendChild(this.pauseBtn);
    this.banner = h('div', 'banner');
    g.appendChild(this.banner);
    this.countdown = h('div', 'countdown');
    g.appendChild(this.countdown);
    this.adv = h('div', 'advsign', '➜ VANTAGEM');
    g.appendChild(this.adv);
    this.ctrl = h('div', 'ctrlinfo');
    g.appendChild(this.ctrl);
    this.debugEl = h('div', 'debug');
    g.appendChild(this.debugEl);
    g.appendChild(h('div', 'rotate', 'Gire o celular para jogar na horizontal ↻'));

    // controles de toque
    const pad = h('div', 'touchpad');
    const zone = h('div', 'stickzone');
    const stick = h('div', 'stick');
    stick.style.display = 'none';
    const knob = h('i');
    stick.appendChild(knob);
    pad.append(zone, stick);
    const bwrap = h('div', 'buttons');
    const B = (name, cls, label, right, bottom) => {
      const b = h('button', `btn ${cls}`, label);
      b.style.right = `${right}px`;
      b.style.bottom = `${bottom}px`;
      bwrap.appendChild(b);
      return b;
    };
    this.btns = {
      shoot: B('shoot', 'big', 'CHUTE', 0, 62),
      pass: B('pass', 'big', 'PASSE', 88, 0),
      dribble: B('dribble', 'mid', 'DRIBLE', 96, 92),
      sprint: B('sprint', 'mid', 'CORRER', 172, 6),
      through: B('through', 'small', 'PROF.', 182, 82),
      lob: B('lob', 'small', 'ALTO', 160, 140),
      toe: B('toe', 'small', 'BICO', 4, 152),
      shotType: B('shotType', 'pill', 'CHUTE: NORMAL', 60, 172),
    };
    pad.appendChild(bwrap);
    g.appendChild(pad);
    this.input.bindTouch(zone, stick, knob, this.btns);
  }

  show(on) {
    this.game.style.display = on ? 'block' : 'none';
    document.body.classList.toggle('playing', on);
  }

  clearScreen() {
    if (this.screen) this.screen.remove();
    this.screen = null;
  }

  // ── menu principal ──────────────────────────────────────────────────────
  menu(onStart) {
    this.clearScreen();
    this.show(false);
    const o = Object.assign({ home: 0, away: 1, venue: 'ginasio', assist: 'assistido', half: CONFIG.match.halfMinutes }, loadOpts());
    const s = h('div', 'screen');
    const c = h('div', 'card');
    c.appendChild(h('h1', 'title', 'QUADRA <span>VIVA</span>'));
    c.appendChild(h('p', 'subtitle', 'Futsal arcade com física de verdade: bola pesada, passe rasteiro, chute de bico.'));
    const seg = (label, items, key, fmt) => {
      const f = h('div', 'field');
      f.appendChild(h('label', null, label));
      const row = h('div', 'seg');
      const btns = items.map(([val, text]) => {
        const b = h('button', null, text);
        b.addEventListener('click', () => {
          o[key] = val;
          btns.forEach((x) => x.classList.toggle('on', x === b));
          if (key === 'home' && o.away === val) {
            o.away = (val + 1) % TEAMS.length;
            awayRow.refresh();
          }
          if (key === 'away' && o.home === val) {
            o.home = (val + 1) % TEAMS.length;
            homeRow.refresh();
          }
        });
        b.classList.toggle('on', o[key] === val);
        if (fmt) fmt(b, val);
        row.appendChild(b);
        return b;
      });
      row.refresh = () => btns.forEach((b, i) => b.classList.toggle('on', items[i][0] === o[key]));
      f.appendChild(row);
      c.appendChild(f);
      return row;
    };
    const teamItems = TEAMS.map((t, i) => [i, t.name]);
    const sw = (b, i) => {
      const x = h('span', 'sw');
      x.style.background = TEAMS[i].colors.shirt;
      b.prepend(x);
    };
    const homeRow = seg('Seu time', teamItems, 'home', sw);
    const awayRow = seg('Adversário', teamItems, 'away', sw);
    seg('Quadra', Object.entries(VENUES).map(([k, v]) => [k, v.name]), 'venue');
    seg('Assistência', [['assistido', 'Assistido'], ['manual', 'Manual']], 'assist');
    seg('Tempo (cronometrado)', [[2, '2 min'], [3, '3 min'], [5, '5 min'], [10, '10 min']], 'half');
    const go = h('button', 'primary', 'JOGAR');
    go.addEventListener('click', () => {
      saveOpts(o);
      onStart({ ...o });
    });
    c.appendChild(go);
    const demo = h('button', 'secondary', 'Assistir IA × IA');
    demo.addEventListener('click', () => onStart({ ...o, human: -1 }));
    c.appendChild(demo);
    c.appendChild(
      h(
        'div',
        'help',
        `<b>Teclado:</b> <kbd>WASD</kbd>/setas move · <kbd>Shift</kbd> corre · <kbd>J</kbd> passe (segure = mais forte) · <kbd>I</kbd> em profundidade · <kbd>U</kbd> alto · <kbd>K</kbd> chute (segure para carregar; com <kbd>Q</kbd> colocado, com <kbd>E</kbd> cavadinha) · <kbd>O</kbd> bico · <kbd>L</kbd> toque = finta/sola, segure = proteger.<br>
        <b>Sem a bola:</b> <kbd>J</kbd> troca de jogador · <kbd>K</kbd> desarme · <kbd>O</kbd> carrinho · <kbd>L</kbd> pressão dupla · <kbd>G</kbd> controla o goleiro · <kbd>T</kbd> substituição.<br>
        <kbd>C</kbd> câmera · <kbd>Esc</kbd> pausa · <kbd>F3</kbd> modo de teste (no celular: 5 toques no relógio).`,
      ),
    );
    s.appendChild(c);
    this.root.appendChild(s);
    this.screen = s;
  }

  pause(onResume, onRestart, onMenu, onDebug, debugOn) {
    this.clearScreen();
    const s = h('div', 'screen dim');
    const c = h('div', 'card');
    c.appendChild(h('h2', 'title', 'PAUSA'));
    const b1 = h('button', 'primary', 'CONTINUAR');
    b1.addEventListener('click', onResume);
    const b2 = h('button', 'secondary', debugOn ? 'Desligar modo de teste' : 'Ligar modo de teste');
    b2.addEventListener('click', () => {
      onDebug();
      onResume();
    });
    const b3 = h('button', 'secondary', 'Reiniciar partida');
    b3.addEventListener('click', onRestart);
    const b4 = h('button', 'secondary', 'Menu principal');
    b4.addEventListener('click', onMenu);
    c.append(b1, b2, b3, b4);
    s.appendChild(c);
    this.root.appendChild(s);
    this.screen = s;
  }

  end(match, onAgain, onMenu) {
    this.clearScreen();
    const [a, b] = match.teams;
    const s = h('div', 'screen dim');
    const c = h('div', 'card');
    c.appendChild(h('h2', 'title', 'FIM DE JOGO'));
    c.appendChild(h('div', 'final', `${a.def.short} ${a.score} × ${b.score} ${b.def.short}`));
    const tot = a.possession + b.possession || 1;
    const rows = [
      ['Chutes', a.shots, b.shots],
      ['No gol', a.onTarget, b.onTarget],
      ['Posse', `${Math.round((a.possession / tot) * 100)}%`, `${Math.round((b.possession / tot) * 100)}%`],
      ['Faltas (2º tempo)', a.fouls, b.fouls],
      ['Cartões', a.cards, b.cards],
    ];
    const t = h('table', 'stats');
    for (const [l, x, y] of rows) t.appendChild(h('tr', null, `<td>${x}</td><td class="l">${l}</td><td>${y}</td>`));
    c.appendChild(t);
    const b1 = h('button', 'primary', 'JOGAR DE NOVO');
    b1.addEventListener('click', onAgain);
    const b2 = h('button', 'secondary', 'Menu principal');
    b2.addEventListener('click', onMenu);
    c.append(b1, b2);
    s.appendChild(c);
    this.root.appendChild(s);
    this.screen = s;
  }

  // ── por quadro ──────────────────────────────────────────────────────────
  update(M, ctrl, debugText) {
    const [a, b] = M.teams;
    const sw = (t) => `<span class="swatch" style="background:${t.def.colors.shirt}"></span>${t.def.short}`;
    this.setHTML(this.sbHome, sw(a));
    this.setHTML(this.sbAway, sw(b));
    this.setText(this.sbScore, `${a.score} – ${b.score}`);
    const rem = Math.max(0, M.halfLen - M.clock);
    const mm = Math.floor(rem / 60), ss = Math.floor(rem % 60);
    this.setText(this.sbClock, `${M.half}º ${mm}:${String(ss).padStart(2, '0')}`);
    const dots = (t) => {
      let s = '';
      for (let i = 1; i <= 5; i++) s += `<i class="dot ${t.fouls >= i ? (t.fouls > 5 ? 'over' : 'on') : ''}"></i>`;
      return `${t.def.short} <span class="dots">${s}</span>${t.fouls > 5 ? ` ${t.fouls}` : ''}`;
    };
    this.setHTML(this.foulsEl, `<span>${dots(a)}</span><span>${dots(b)}</span>`);

    // vento (só quadra de rua)
    if (M.venue.wind) {
      this.windEl.style.display = 'flex';
      const ang = Math.atan2(M.wind.z, M.wind.x);
      // tela: x para a direita, z para baixo
      this.setHTML(this.windEl, `Vento <span class="arrow" style="transform:rotate(${(ang * 180) / Math.PI}deg)">➜</span> ${Math.round(Math.hypot(M.wind.x, M.wind.z) * 10)}`);
    } else this.windEl.style.display = 'none';

    const msg = M.message;
    if (msg) {
      this.setText(this.banner, msg.text);
      this.banner.className = `banner on ${msg.kind || ''}`;
    } else this.banner.className = 'banner';

    // cobrança do humano: contagem dos 4 s
    const r = M.restart;
    if (M.phase === 'restart' && r && r.team === M.human && Number.isFinite(r.limit)) {
      this.countdown.style.display = 'block';
      this.setText(this.countdown, `${labelOf(r.type)} — ${Math.max(0, r.limit - r.t).toFixed(1)} s`);
    } else if (M.phase === 'restart' && r && r.team === M.human) {
      this.countdown.style.display = 'block';
      this.setText(this.countdown, `${labelOf(r.type)} — passe (J) ou chute (K)`);
    } else if (ctrl && ctrl.cp && ctrl.cp.isGK && ctrl.cp.state === 'hold' && M.phase === 'play') {
      this.countdown.style.display = 'block';
      this.setText(this.countdown, `Reposição — J curta, K longa — ${Math.max(0, CONFIG.keeper.holdLimit - ctrl.cp.keeper.holdT).toFixed(1)} s`);
    } else this.countdown.style.display = 'none';

    this.adv.style.display = M.advantage ? 'block' : 'none';

    if (ctrl && ctrl.cp) {
      const p = ctrl.cp;
      this.ctrl.style.display = 'block';
      const tired = p.stamina < CONFIG.player.stamina.tiredBelow;
      this.setHTML(this.ctrl, `<b>${p.num}</b> ${p.name} <span style="color:var(--muted)">${p.role}${ctrl.gkManual ? ' (manual)' : ''}</span><div class="bar"><i class="${tired ? 'tired' : ''}" style="width:${p.stamina.toFixed(0)}%"></i></div>`);
      // botões contextuais
      const att = ctrl.attackContext();
      this.setText(this.btns.pass, att ? 'PASSE' : 'TROCAR');
      this.setText(this.btns.shoot, att ? 'CHUTE' : 'DESARME');
      this.setText(this.btns.dribble, att ? 'DRIBLE' : 'PRESSÃO');
      this.setText(this.btns.toe, att ? 'BICO' : 'CARRINHO');
      this.setText(this.btns.shotType, `CHUTE: ${this.input.shotType.toUpperCase()}`);
    } else this.ctrl.style.display = 'none';

    if (debugText) {
      this.debugEl.style.display = 'block';
      this.setText(this.debugEl, debugText);
    } else this.debugEl.style.display = 'none';
  }

  setText(el, t) {
    if (el._t !== t) {
      el._t = t;
      el.textContent = t;
    }
  }
  setHTML(el, t) {
    if (el._h !== t) {
      el._h = t;
      el.innerHTML = t;
    }
  }
}

function labelOf(type) {
  return { kickoff: 'Saída', lateral: 'Lateral', escanteio: 'Escanteio', meta: 'Tiro de meta', falta: 'Falta', penalti: 'Pênalti', livre10: 'Tiro livre de 10 m' }[type] || type;
}
