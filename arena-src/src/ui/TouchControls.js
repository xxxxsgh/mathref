import { h } from './dom.js';

/**
 * Controles de toque para celular/tablet.
 *
 *   metade esquerda  → joystick flutuante (nasce onde o polegar encosta);
 *                      empurrar até o fim para frente = correr
 *   metade direita   → arrastar = mirar
 *   botão ATIRAR     → segurar atira; arrastar sobre ele também mira
 *                      (dá para atirar e corrigir a mira com o mesmo dedo)
 *   demais botões    → pular, agachar (alterna), recarregar, mira/golpe
 *                      pesado, trocar arma, inspecionar, loja, placar, pausa
 *
 * Não existe pointer lock no toque: os controles escrevem direto no Input
 * (teclas, botões, delta de mira e eixo analógico), então o resto do jogo
 * não sabe se o comando veio de teclado/mouse ou da tela.
 */

/** Graus de giro por pixel arrastado com sensibilidade 1. */
const DEG_PER_PX = 0.16;
const JOY_RADIUS = 56;

/** setPointerCapture lança se o ponteiro já sumiu — não é erro de jogo. */
function capture(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* ponteiro inexistente (ex.: evento sintético) */
  }
}

export class TouchControls {
  /**
   * @param {HTMLElement} root
   * @param {any} game
   */
  constructor(root, game) {
    this.game = game;
    this.input = game.input;
    /** @type {Map<number, { kind: 'joy'|'look'|'fire', x: number, y: number, ox?: number, oy?: number }>} */
    this.pointers = new Map();
    this.crouchToggled = false;

    this.el = h('div', { class: 'touch-layer hidden' });
    this.joyBase = h('div', { class: 'joy-base' });
    this.joyKnob = h('div', { class: 'joy-knob' });
    this.joyBase.appendChild(this.joyKnob);
    this.el.appendChild(this.joyBase);

    const btn = (cls, label, title) => {
      const b = h('div', { class: `tbtn ${cls}`, title }, label);
      this.el.appendChild(b);
      return b;
    };
    this.fireBtn = btn('t-fire', '', 'Atirar');
    this.fireLeft = btn('t-fire-l', '', 'Atirar');
    this.jumpBtn = btn('t-jump', '⤒', 'Pular');
    this.crouchBtn = btn('t-crouch', '⤓', 'Agachar');
    this.reloadBtn = btn('t-reload', 'R', 'Recarregar');
    this.altBtn = btn('t-alt', '◎', 'Mira / golpe pesado');
    this.swapBtn = btn('t-util t-swap', '⇄', 'Trocar arma');
    this.inspectBtn = btn('t-util t-inspect', 'F', 'Inspecionar');
    this.buyBtn = btn('t-util t-buy', '$', 'Loja');
    this.scoreBtn = btn('t-util t-score', '☰', 'Placar');
    this.pauseBtn = btn('t-util t-pause', 'II', 'Pausa');
    this.portrait = h('div', { class: 'rotate-hint hidden' }, ['⟳', h('span', {}, 'Gire o aparelho para jogar na horizontal')]);
    root.append(this.el, this.portrait);

    this.bindSurface();
    this.bindButtons();
    this.applyScale(game.settings.data.touchButtonScale);
  }

  /** @param {number} s */
  applyScale(s) {
    this.el.style.setProperty('--ts', String(s));
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
    if (!v) this.releaseAll();
  }

  /** Aviso de orientação: só em partida, no toque e em retrato. */
  updateOrientationHint(inMatch) {
    const portrait = window.innerHeight > window.innerWidth;
    this.portrait.classList.toggle('hidden', !(inMatch && this.input.touchMode && portrait));
  }

  releaseAll() {
    this.pointers.clear();
    const inp = this.input;
    inp.axisX = inp.axisY = 0;
    inp.axisActive = false;
    inp.buttons[0] = false;
    this.joyBase.style.display = 'none';
    if (this.crouchToggled) {
      this.crouchToggled = false;
      this.crouchBtn.classList.remove('on');
    }
    for (const b of this.el.querySelectorAll('.tbtn.down')) b.classList.remove('down');
  }

  /** Área livre da tela: joystick (esquerda) ou mira (direita). */
  bindSurface() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (e.target !== el) return;
      e.preventDefault();
      capture(el, e.pointerId);
      const left = e.clientX < window.innerWidth * 0.42;
      if (left && ![...this.pointers.values()].some((p) => p.kind === 'joy')) {
        this.pointers.set(e.pointerId, { kind: 'joy', x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
        this.joyBase.style.display = 'block';
        this.joyBase.style.left = `${e.clientX}px`;
        this.joyBase.style.top = `${e.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
        this.input.axisActive = true;
      } else {
        this.pointers.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
      }
    });
    el.addEventListener('pointermove', (e) => this.move(e));
    const end = (e) => this.end(e);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** @param {PointerEvent} e */
  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'joy') {
      let dx = e.clientX - /** @type {number} */ (p.ox);
      let dy = e.clientY - /** @type {number} */ (p.oy);
      const r = JOY_RADIUS * this.scale();
      const d = Math.hypot(dx, dy);
      if (d > r) {
        // joystick "segue" o dedo quando passa do raio
        p.ox = e.clientX - (dx / d) * r;
        p.oy = e.clientY - (dy / d) * r;
        this.joyBase.style.left = `${p.ox}px`;
        this.joyBase.style.top = `${p.oy}px`;
        dx = (dx / d) * r;
        dy = (dy / d) * r;
      }
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const nx = dx / r;
      const ny = dy / r;
      const dead = 0.12;
      const m = Math.hypot(nx, ny);
      const k = m < dead ? 0 : (m - dead) / (1 - dead) / m;
      this.input.axisX = nx * k;
      this.input.axisY = ny * k;
      return;
    }
    // mira (área livre ou dedo no botão de tiro)
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const s = this.game.settings.data;
    const factor = (DEG_PER_PX * s.touchSensitivity) / (s.sensitivity * 0.022);
    this.input.mouseDX += dx * factor;
    this.input.mouseDY += dy * factor;
  }

  /** @param {PointerEvent} e */
  end(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.kind === 'joy') {
      this.joyBase.style.display = 'none';
      this.input.axisX = this.input.axisY = 0;
      this.input.axisActive = false;
    } else if (p.kind === 'fire') {
      if (![...this.pointers.values()].some((q) => q.kind === 'fire')) this.input.buttons[0] = false;
    }
  }

  scale() {
    return this.game.settings.data.touchButtonScale;
  }

  bindButtons() {
    const inp = this.input;
    /**
     * @param {HTMLElement} b
     * @param {(e: PointerEvent) => void} down
     * @param {(() => void)} [up]
     */
    const on = (b, down, up) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        capture(b, e.pointerId);
        b.classList.add('down');
        down(e);
      });
      const release = (e) => {
        b.classList.remove('down');
        up?.();
        this.end(e);
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      b.addEventListener('pointermove', (e) => this.move(e));
    };
    /** tecla momentânea: aperta no toque, solta ao levantar o dedo */
    const key = (b, code) =>
      on(
        b,
        () => {
          inp.keys.add(code);
          inp.justPressed.add(code);
        },
        () => inp.keys.delete(code),
      );

    for (const fb of [this.fireBtn, this.fireLeft]) {
      on(fb, (e) => {
        inp.buttons[0] = true;
        inp.buttonsPressed[0] = true;
        // o dedo no tiro também mira ao arrastar
        this.pointers.set(e.pointerId, { kind: 'fire', x: e.clientX, y: e.clientY });
      });
    }
    key(this.jumpBtn, 'Space');
    key(this.reloadBtn, 'KeyR');
    key(this.inspectBtn, 'KeyF');
    on(this.crouchBtn, () => {
      this.crouchToggled = !this.crouchToggled;
      this.crouchBtn.classList.toggle('on', this.crouchToggled);
      if (this.crouchToggled) inp.keys.add('KeyC');
      else inp.keys.delete('KeyC');
    });
    on(this.altBtn, () => {
      inp.buttons[2] = true;
      inp.buttonsPressed[2] = true;
    }, () => (inp.buttons[2] = false));
    on(this.swapBtn, () => (inp.wheel += 1));
    on(this.buyBtn, () => this.game.ui.toggleBuyMenu());
    on(this.scoreBtn, () => {
      if (this.game.ui.scoreboard) this.game.ui.hideScoreboard();
      else this.game.ui.showScoreboard();
    });
    on(this.pauseBtn, () => inp.unlock());
  }

  /** Agachar alternado precisa sobreviver ao endFrame (que só limpa bordas). */
  update() {
    if (this.crouchToggled) this.input.keys.add('KeyC');
  }
}
