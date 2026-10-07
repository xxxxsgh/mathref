/**
 * Feature `touch` — controles de toque para celular/tablet.
 *
 *   metade esquerda  → joystick flutuante (nasce onde o polegar encosta;
 *                      empurrar até o fim para a frente = sprint)
 *   resto da tela    → arrastar = mirar (sensibilidade própria)
 *   ATIRAR (grande)  → segurar atira; arrastar sobre ele também mira
 *   ATIRAR (esq.)    → tiro com o polegar do joystick livre
 *   botões           → ADS (alterna), recarregar, pular, agachar/slide
 *                      (toque; segurar = deitar, como o C), granada, corpo a
 *                      corpo, trocar arma, placar, pausa
 *
 * Não existe pointer lock no toque: o núcleo (core/Input.js) faz uma
 * captura VIRTUAL — DEPLOY/RESUME chamam `input.requestLock()` como no
 * desktop e a camada aparece; PAUSA chama `input.exitLock()` e a HUD abre a
 * pausa pelo mesmo evento 'input:lock' de sempre. Tudo o que os botões
 * fazem passa por `input.simulate(ação)`, `input.addTouchLook` e
 * `input.setAxis`, então nenhuma outra feature sabe que o comando veio do
 * dedo.
 *
 * Serviço `ctx.services.touch`:
 *   active (get)                 modo toque ligado
 *   visible (get)                camada de controles à vista
 *   sensitivity (get) / setSensitivity(0.3..3)   mira por arrasto (persistida)
 *   setScale(0.7..1.4)           tamanho dos botões (persistido)
 *   setFullscreen(bool)          tela cheia automática ao entrar na partida
 *   enterFullscreen()            tela cheia + trava em paisagem (se der)
 */
import { TOUCH_CSS, ICONS } from './style.js';
import { joyState } from './joy.js';

const KEY = 'ironline.touch.v1';
const DEFAULTS = { sensitivity: 1, scale: 1, fullscreen: true };
const JOY_RADIUS = 58;

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* ponteiro já sumiu (ou evento sintético) */
  }
}

export default {
  name: 'touch',
  order: 95, // depois da HUD: a camada fica por cima e lê o estado das telas

  init(ctx) {
    this.ctx = ctx;
    this.input = ctx.input;
    this.cfg = load();
    this.input.touchSensitivity = this.cfg.sensitivity;
    /** @type {Map<number, {kind:'joy'|'look'|'fire', x:number, y:number, ox?:number, oy?:number}>} */
    this.pointers = new Map();
    this.held = new Set(); // ações que ESTA feature mantém pressionadas
    this.adsOn = false;
    this.visible = false;
    this.swapSlot = 1;
    if (ctx.shot) {
      this.provideApi();
      return; // capturas determinísticas não mostram controles
    }

    const style = document.createElement('style');
    style.id = 'il-touch-css';
    style.textContent = TOUCH_CSS;
    document.head.appendChild(style);
    this.style = style;

    const el = (this.el = document.createElement('div'));
    el.id = 'il-touch';
    el.className = 'interactive off';
    el.innerHTML = `<div class="joy-base"><span class="sp">SPRINT</span><div class="joy-knob"></div></div>`;
    this.joyBase = el.querySelector('.joy-base');
    this.joyKnob = el.querySelector('.joy-knob');
    const btn = (cls, icon, label) => {
      const b = document.createElement('div');
      b.className = `tb ${cls}`;
      b.innerHTML = `${ICONS[icon]}${label ? `<b>${label}</b>` : ''}`;
      b.setAttribute('role', 'button');
      b.setAttribute('aria-label', label || icon);
      el.appendChild(b);
      return b;
    };
    this.b = {
      fire: btn('t-fire', 'fire', ''),
      fire2: btn('t-fire2', 'fire', ''),
      ads: btn('t-ads', 'ads', 'ADS'),
      reload: btn('t-reload', 'reload', 'RELOAD'),
      jump: btn('t-jump', 'jump', 'JUMP'),
      crouch: btn('t-crouch', 'crouch', 'CROUCH'),
      swap: btn('t-swap', 'swap', 'SWAP'),
      grenade: btn('t-gren', 'grenade', 'FRAG'),
      melee: btn('t-melee', 'melee', 'MELEE'),
      pause: btn('t-util t-pause', 'pause', 'PAUSE'),
      score: btn('t-util t-score', 'score', 'SCORE'),
    };
    // ações de movimento sem botão próprio: lidas de services.movement.touchHints
    // (prone = DIVE em sprint/slide, lean Q/E). Sem a feature movement, nada.
    const MOVE_BTN = { prone: ['t-prone', 'prone'], leanLeft: ['t-leanL', 'leanL'], leanRight: ['t-leanR', 'leanR'] };
    this.moveBtns = [];
    // killstreaks (até 4 vagas, só aparecem prontas), execução e designador
    this.stk = [0, 1, 2, 3].map((i) => {
      const b = btn(`t-stk t-stk${i}`, 'streak', '');
      b.classList.add('hide');
      return b;
    });
    this.fin = btn('t-fin hide', 'melee', 'EXECUTE');
    this.dConfirm = btn('t-dconf hide', 'fire', 'CONFIRM');
    this.dCancel = btn('t-dcancel hide', 'cancel', 'CANCEL');
    for (const h of ctx.service('movement')?.touchHints || []) {
      const m = MOVE_BTN[h.action];
      if (!m) continue;
      const b = btn(m[0], m[1], h.label === 'Q' ? 'LEAN' : h.label === 'E' ? 'LEAN' : h.label);
      b.setAttribute('aria-label', h.hint || h.action);
      this.moveBtns.push([b, h.action]);
    }
    ctx.ui.appendChild(el);

    // aviso de orientação (celular em retrato)
    const rot = (this.rotate = document.createElement('div'));
    rot.className = 'il-rotate off';
    rot.innerHTML = `${ICONS.rotate}<div>Rotate your device</div><small>IRONLINE plays in landscape</small>`;
    rot.addEventListener('pointerdown', () => this.enterFullscreen());
    document.body.appendChild(rot);

    this.applyScale(this.cfg.scale);
    this.bindSurface();
    this.bindButtons();
    this.offs = [
      ctx.bus.on('input:lock', (locked) => {
        // DEPLOY/RESUME num aparelho de toque: tela cheia (gesto do usuário em curso)
        if (locked && this.input.touchMode && this.cfg.fullscreen) this.enterFullscreen();
        if (!locked) this.releaseAll();
      }),
      ctx.bus.on('input:touch', (on) => this.onTouchMode(on)),
    ];
    this.onTouchMode(this.input.touchMode);
    this._rs = () => {
      this.updateRotate();
      this.applyScale();
    };
    addEventListener('resize', this._rs);
    this.provideApi();
  },

  provideApi() {
    const self = this;
    this.ctx.provide('touch', {
      get active() { return !!self.input.touchMode; },
      get visible() { return self.visible; },
      get sensitivity() { return self.cfg.sensitivity; },
      setSensitivity(v) {
        self.cfg.sensitivity = Math.max(0.2, Math.min(4, Number(v) || 1));
        self.input.touchSensitivity = self.cfg.sensitivity;
        save(self.cfg);
      },
      setScale(v) {
        self.cfg.scale = Math.max(0.6, Math.min(1.5, Number(v) || 1));
        self.applyScale(self.cfg.scale);
        save(self.cfg);
      },
      setFullscreen(v) {
        self.cfg.fullscreen = !!v;
        save(self.cfg);
      },
      enterFullscreen: () => self.enterFullscreen(),
    });
  },

  onTouchMode(on) {
    document.documentElement.classList.toggle('il-touch', !!on);
    if (!on) this.setVisible(false);
    this.updateRotate();
  },

  /**
   * Escala dos botões = preferência × tamanho da tela (celular pequeno ~1,
   * tablet até 1,3) e folgas da HUD na MESMA escala da prancheta dela
   * (min(w/1920, h/1080)) — os botões nunca cobrem munição/cartão.
   */
  applyScale(s = this.cfg.scale) {
    if (!this.el) return;
    const w = innerWidth, h = innerHeight;
    const dev = Math.max(0.85, Math.min(1.3, Math.min(w, h) / 400));
    const k = Math.min(w / 1920, h / 1080);
    this.ts = s * dev;
    this.el.style.setProperty('--ts', this.ts.toFixed(3));
    this.el.style.setProperty('--hb', `${Math.round(272 * k)}px`);
    this.el.style.setProperty('--hbl', `${Math.round(150 * k)}px`);
  },

  /** Tela cheia + trava em paisagem (Android). iOS ignora: fica o aviso. */
  enterFullscreen() {
    const d = document;
    const root = d.documentElement;
    try {
      if (!d.fullscreenElement && root.requestFullscreen) {
        root.requestFullscreen({ navigationUI: 'hide' })
          .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
          .catch(() => {});
      } else screen.orientation?.lock?.('landscape').catch(() => {});
    } catch {
      /* sem suporte */
    }
  },

  updateRotate() {
    if (!this.rotate) return;
    const portrait = innerHeight > innerWidth;
    const phone = Math.min(screen.width || innerWidth, screen.height || innerHeight) < 600;
    const show = !!(this.input.touchMode && portrait && phone);
    this.rotate.classList.toggle('off', !show);
    // girou para retrato no meio da partida: pausa (a HUD abre a pausa pelo
    // mesmo caminho de perder a captura)
    if (show && this.input.locked) this.input.exitLock();
  },

  setVisible(v) {
    if (this.visible === v || !this.el) return;
    this.visible = v;
    this.el.classList.toggle('off', !v);
    if (!v) this.releaseAll();
  },

  // ─── ações ────────────────────────────────────────────────────────
  hold(name, on) {
    if (on) {
      if (this.held.has(name)) return;
      this.held.add(name);
      this.input.simulate(name, true);
    } else if (this.held.has(name)) {
      this.held.delete(name);
      this.input.simulate(name, false);
    }
  },
  tap(name) {
    this.input.simulate(name, true);
    // solta no próximo quadro: a borda 'pressed' já foi registrada
    requestAnimationFrame(() => this.input.simulate(name, false));
  },
  setAds(on) {
    this.adsOn = on;
    this.hold('ads', on);
    this.b?.ads.classList.toggle('on', on);
  },

  releaseAll() {
    this.pointers.clear();
    for (const a of [...this.held]) this.hold(a, false);
    this.input.setAxis(0, 0);
    this.adsOn = false;
    if (this.b) {
      this.b.ads.classList.remove('on');
      for (const b of Object.values(this.b)) b.classList.remove('down');
    }
    this.joyIdle();
  },

  joyIdle() {
    if (!this.joyBase) return;
    this.joyBase.classList.remove('live', 'sprint');
    this.joyBase.style.left = this.joyBase.style.top = '';
    this.joyKnob.style.transform = 'translate(-50%, -50%)';
  },

  // ─── superfície: joystick (esquerda) e mira (resto) ─────────────────
  bindSurface() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (e.target !== el) return;
      e.preventDefault();
      capture(el, e.pointerId);
      const left = e.clientX < innerWidth * 0.42;
      if (left && ![...this.pointers.values()].some((p) => p.kind === 'joy')) {
        this.pointers.set(e.pointerId, { kind: 'joy', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
        this.joyBase.classList.add('live');
        this.joyBase.style.left = `${e.clientX}px`;
        this.joyBase.style.top = `${e.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
      } else this.pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => this.move(e));
    const end = (e) => this.end(e);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p || p.kind === 'fire2') return;
    e.preventDefault();
    if (p.kind === 'joy') {
      let dx = e.clientX - p.ox;
      let dy = e.clientY - p.oy;
      const r = JOY_RADIUS * (this.ts || 1);
      const d = Math.hypot(dx, dy);
      if (d > r) {
        // a base "segue" o dedo quando ele passa do raio
        p.ox = e.clientX - (dx / d) * r;
        p.oy = e.clientY - (dy / d) * r;
        this.joyBase.style.left = `${p.ox}px`;
        this.joyBase.style.top = `${p.oy}px`;
        dx = (dx / d) * r;
        dy = (dy / d) * r;
      }
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.applyJoy(dx / r, dy / r);
      return;
    }
    // mira: área livre ou dedo arrastando sobre o botão de tiro
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    // tablet do morteiro aberto: arrastar move o retículo em vez de mirar
    const des = this.ctx.service('streaks')?.designator;
    if (des?.open) des.move?.(dx * 0.08, dy * 0.08);
    else this.input.addTouchLook(dx, dy);
  },

  applyJoy(nx, ny) {
    const j = joyState(nx, ny);
    this.input.setAxis(j.x, j.y);
    this.hold('forward', j.forward);
    this.hold('back', j.back);
    this.hold('left', j.left);
    this.hold('right', j.right);
    // sprint: mira alternada atrapalharia (o movimento não corre em ADS)
    if (j.sprint && this.adsOn) this.setAds(false);
    this.hold('sprint', j.sprint);
    this.joyBase.classList.toggle('sprint', j.sprint);
  },

  end(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.kind === 'joy') {
      this.applyJoy(0, 0);
      this.joyIdle();
    } else if ((p.kind === 'fire' || p.kind === 'fire2') && ![...this.pointers.values()].some((q) => q.kind === 'fire' || q.kind === 'fire2')) {
      this.hold('fire', false);
    }
  },

  // ─── botões ──────────────────────────────────────────────────────
  bindButtons() {
    const on = (b, down, up) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        capture(b, e.pointerId);
        b.classList.add('down');
        down(e);
      });
      const release = (e) => {
        if (!b.classList.contains('down')) return;
        b.classList.remove('down');
        up?.(e);
        this.end(e);
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('pointermove', (e) => this.move(e));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    // momentâneas: segura enquanto o dedo está no botão (mesma semântica da tecla)
    const key = (b, action) => on(b, () => this.hold(action, true), () => this.hold(action, false));
    const B = this.b;
    for (const fb of [B.fire, B.fire2]) {
      on(fb, (e) => {
        this.hold('fire', true);
        // o dedo no tiro grande também mira ao arrastar; o da esquerda só atira
        this.pointers.set(e.pointerId, { kind: fb === B.fire ? 'fire' : 'fire2', x: e.clientX, y: e.clientY });
      });
    }
    on(B.ads, () => this.setAds(!this.adsOn));
    key(B.reload, 'reload');
    key(B.jump, 'jump');
    key(B.crouch, 'crouch'); // toque = agacha/levanta; em sprint = slide; segurar = deita
    key(B.grenade, 'grenade');
    key(B.melee, 'melee');
    for (const [b, action] of this.moveBtns || []) key(b, action); // segurar = lean / toque = deitar/dive
    const stk = () => this.ctx.service('streaks');
    this.stk.forEach((b, i) => on(b, () => stk()?.activate?.(i)));
    on(this.fin, () => stk()?.finisher?.execute?.());
    on(this.dConfirm, () => stk()?.designator?.confirm?.());
    on(this.dCancel, () => stk()?.designator?.cancel?.());
    on(B.swap, () => {
      const w = this.ctx.service('weapon');
      if (typeof w?.swap === 'function') w.swap();
      else {
        // alterna slot 2 ↔ 1 (mesmas ações das teclas 1/2)
        this.swapSlot = this.swapSlot === 1 ? 2 : 1;
        this.tap(`weapon${this.swapSlot}`);
      }
    });
    on(B.pause, () => this.input.exitLock());
    // placar: a HUD escuta o Tab do teclado direto — repassa o mesmo evento
    const tab = (type) => dispatchEvent(new KeyboardEvent(type, { code: 'Tab', key: 'Tab', bubbles: true }));
    on(B.score, () => tab('keydown'), () => tab('keyup'));
  },

  frame() {
    if (!this.el) return;
    const ctx = this.ctx;
    const inp = this.input;
    const scr = ctx.service('hud')?.screen ?? null;
    const show = !!(inp.touchMode && inp.locked && inp.enabled && (!scr || scr === 'scoreboard'));
    this.setVisible(show);
    if (!show) return;
    // algo de fora soltou as teclas (releaseAll do núcleo): ressincroniza
    if (this.adsOn && !inp.action('ads')) this.setAds(false);
    // o movimento larga o sprint ao mirar/atirar; o visual acompanha
    const w = ctx.service('weapon');
    this.b.reload.classList.toggle('on', !!w?.reloading);
    this.syncStreaks();
  },

  /** Killstreaks / execução / designador: lê services.streaks a cada quadro. */
  syncStreaks() {
    const st = this.ctx.service('streaks');
    const des = !!st?.designator?.open;
    this.el.classList.toggle('desig', des);
    this.dConfirm.classList.toggle('hide', !des);
    this.dCancel.classList.toggle('hide', !des);
    let slots = [];
    try {
      slots = (!des && st?.slots?.()) || [];
    } catch {}
    this.stk.forEach((b, i) => {
      const s = slots[i];
      const ready = !!(s && s.ready);
      b.classList.toggle('hide', !ready);
      if (ready && b.dataset.id !== s.id + s.ready) {
        b.dataset.id = s.id + s.ready;
        const short = String(s.name || s.id).split(' ').pop();
        b.innerHTML = `${ICONS.streak}<b>${short}${s.ready > 1 ? ' ×' + s.ready : ''}</b>`;
        b.setAttribute('aria-label', s.name || s.id);
      }
    });
    const fin = !des && !!st?.finisher?.target && !st.finisher.active;
    this.fin.classList.toggle('hide', !fin);
  },

  dispose() {
    this.releaseAll();
    this.offs?.forEach((f) => f());
    removeEventListener('resize', this._rs);
    this.el?.remove();
    this.rotate?.remove();
    this.style?.remove();
    document.documentElement.classList.remove('il-touch');
  },
};
