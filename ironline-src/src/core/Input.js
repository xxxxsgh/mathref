/**
 * Entrada: teclado, mouse (com pointer lock), roda, e mapeamento de ações.
 *
 *   input.down('KeyW')         tecla física pressionada agora
 *   input.action('fire')       ação mapeada pressionada agora
 *   input.pressed('jump')      ação que COMEÇOU neste passo fixo
 *   input.released('ads')      ação que TERMINOU neste passo fixo
 *   input.look                 { x, y } delta de mouse acumulado (px) — consumido pelo player
 *   input.locked               pointer lock ativo (no toque: "captura virtual", ver abaixo)
 *   input.enabled              false bloqueia tudo (menu, modo screenshot)
 *   input.axis                 { x, y, active } eixo analógico de movimento (-1..1;
 *                              y > 0 = frente) — preenchido pelo joystick de toque
 *
 * Toque (celular/tablet): `touchMode` liga quando o aparelho só tem ponteiro
 * grosso ((pointer: coarse) sem (any-pointer: fine)), ao primeiro toque na
 * tela, ou com `?touch=1` (`?touch=0` desliga). Não existe pointer lock no
 * toque: `requestLock()` vira uma captura VIRTUAL (locked = true e
 * 'input:lock' true no bus) e `exitLock()` a solta ('input:lock' false) —
 * assim a HUD continua abrindo a pausa ao "perder o lock" sem saber se o
 * jogador usa mouse ou dedo. Os controles de toque (feature `touch`)
 * escrevem nas MESMAS ações (simulate), no delta de mira (addTouchLook) e
 * no eixo analógico.
 *
 * `pressed/released` são calculados por passo fixo: o loop chama
 * input.endStep() depois de cada update.
 */
export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  prone: ['KeyZ'],
  reload: ['KeyR'],
  interact: ['KeyF'],
  melee: ['KeyV'],
  grenade: ['KeyG'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  leanLeft: ['KeyQ'],
  leanRight: ['KeyE'],
  scoreboard: ['Tab'],
  pause: ['Escape', 'KeyP'],
  fire: ['Mouse0'],
  ads: ['Mouse2'],
};

/** Mira por toque: rad por px arrastado com sensibilidade 1 e mouse no padrão. */
export const TOUCH_RAD_PER_PX = 0.0028;
/** Sensibilidade de mouse de referência (6,0 nas configurações). */
const REF_SENS = 0.0022;

/** O aparelho só tem ponteiro grosso (celular/tablet)? Sem DOM → false. */
export function prefersTouch(win = globalThis.window) {
  try {
    const mm = (q) => !!win?.matchMedia?.(q).matches;
    return mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
  } catch {
    return false;
  }
}

export class Input {
  constructor(element, bus) {
    this.el = element;
    this.bus = bus;
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.keys = new Set();
    this.prev = new Set();
    this.edgeDown = new Set();
    this.edgeUp = new Set();
    this.look = { x: 0, y: 0 };
    this.wheel = 0;
    this.sensitivity = 0.0022; // rad por px
    this.invertY = false;
    this.enabled = true;
    this.locked = false;
    this.wantsLock = true;
    // ── toque ──
    this.touchMode = false;
    this.touchForced = null; // true/false = fixado por ?touch= (sem troca automática)
    this.touchSensitivity = 1; // multiplicador da mira por arrasto (0,3..3)
    this.axis = { x: 0, y: 0, active: false };

    const kd = (e) => {
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.edgeDown.add(e.code);
      this.keys.add(e.code);
    };
    const ku = (e) => {
      this.keys.delete(e.code);
      this.edgeUp.add(e.code);
    };
    const md = (e) => {
      // no toque, mousedown são eventos de compatibilidade dos toques — ignora
      // (um mouse de verdade passa antes pelo pointerdown e desliga o toque)
      if (!this.enabled || this.touchMode) return;
      if (this.wantsLock && !this.locked && e.button === 0) {
        this.requestLock();
        return;
      }
      const c = 'Mouse' + e.button;
      if (!this.keys.has(c)) this.edgeDown.add(c);
      this.keys.add(c);
    };
    const mu = (e) => {
      if (this.touchMode) return;
      const c = 'Mouse' + e.button;
      this.keys.delete(c);
      this.edgeUp.add(c);
    };
    const mm = (e) => {
      if (!this.enabled || !this.locked) return;
      this.look.x += e.movementX || 0;
      this.look.y += e.movementY || 0;
    };
    const wh = (e) => {
      if (this.enabled) this.wheel += Math.sign(e.deltaY);
    };
    const plc = () => {
      // no toque a captura é virtual: o lock real (se existir) não manda
      if (this.touchMode) return;
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.releaseAll();
      bus?.emit('input:lock', this.locked);
    };
    const blur = () => this.releaseAll();
    const ctx = (e) => e.preventDefault();
    // troca automática mouse ↔ toque pelo tipo do ponteiro que encostou
    const pd = (e) => {
      if (this.touchForced != null) return;
      if (e.pointerType === 'touch' && !this.touchMode) this.setTouchMode(true);
      else if (e.pointerType === 'mouse' && this.touchMode) this.setTouchMode(false);
    };
    this._h = [
      [window, 'keydown', kd], [window, 'keyup', ku], [window, 'mousedown', md], [window, 'mouseup', mu],
      [window, 'mousemove', mm], [window, 'wheel', wh, { passive: true }], [document, 'pointerlockchange', plc],
      [window, 'blur', blur], [window, 'contextmenu', ctx], [window, 'pointerdown', pd, { capture: true, passive: true }],
    ];
    for (const [t, ev, fn, o] of this._h) t.addEventListener(ev, fn, o);
  }
  /**
   * Liga/desliga o modo toque. Ao ligar com um lock real ativo, ele é solto
   * mas a captura continua (virtual) — a partida não pausa à toa.
   */
  setTouchMode(on) {
    on = !!on;
    if (on === this.touchMode) return;
    const wasLocked = this.locked;
    this.touchMode = on;
    if (on) {
      if (document.pointerLockElement) document.exitPointerLock();
    } else if (wasLocked) {
      // sai da captura virtual: o próximo clique pede o lock real
      this.locked = false;
      this.releaseAll();
      this.bus?.emit('input:lock', false);
    }
    this.bus?.emit('input:touch', on);
  }
  /** Soma um arrasto de mira do toque (px de tela) ao delta de look. */
  addTouchLook(dx, dy) {
    if (!this.enabled) return;
    const k = (TOUCH_RAD_PER_PX / REF_SENS) * this.touchSensitivity;
    this.look.x += dx * k;
    this.look.y += dy * k;
  }
  /** Eixo analógico de movimento (joystick). x > 0 = direita, y > 0 = frente. */
  setAxis(x, y) {
    this.axis.x = Math.max(-1, Math.min(1, x || 0));
    this.axis.y = Math.max(-1, Math.min(1, y || 0));
    this.axis.active = !!(x || y);
  }
  requestLock() {
    if (this.touchMode) {
      if (!this.locked) {
        this.locked = true;
        this.bus?.emit('input:lock', true);
      }
      return;
    }
    try {
      const p = this.el.requestPointerLock?.();
      p?.catch?.(() => {});
    } catch {}
  }
  exitLock() {
    if (this.touchMode) {
      if (this.locked) {
        this.locked = false;
        this.releaseAll();
        this.bus?.emit('input:lock', false);
      }
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  releaseAll() {
    for (const k of this.keys) this.edgeUp.add(k);
    this.keys.clear();
    this.setAxis(0, 0);
  }
  down(code) {
    return this.keys.has(code);
  }
  action(name) {
    return (this.bindings[name] || []).some((c) => this.keys.has(c));
  }
  pressed(name) {
    return (this.bindings[name] || []).some((c) => this.edgeDown.has(c));
  }
  released(name) {
    return (this.bindings[name] || []).some((c) => this.edgeUp.has(c));
  }
  /** Lê e zera o delta de mouse (rad), já com sensibilidade. */
  consumeLook() {
    const s = this.sensitivity;
    const r = { yaw: -this.look.x * s, pitch: -this.look.y * s * (this.invertY ? -1 : 1) };
    this.look.x = this.look.y = 0;
    return r;
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
  /** Simula ações (bots de teste, modo screenshot): input.simulate('fire', true). */
  simulate(name, on) {
    const code = (this.bindings[name] || [name])[0];
    if (on) {
      if (!this.keys.has(code)) this.edgeDown.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
      this.edgeUp.add(code);
    }
  }
  endStep() {
    this.edgeDown.clear();
    this.edgeUp.clear();
  }
  dispose() {
    for (const [t, ev, fn] of this._h) t.removeEventListener(ev, fn);
  }
}
