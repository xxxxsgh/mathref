/**
 * Teclado + mouse com pointer lock.
 *
 * O estado é lido pelo jogo uma vez por frame: `down(code)` para teclas
 * seguradas e `pressed(code)` para bordas de subida (consumidas no fim do
 * frame por `endFrame`). O delta do mouse é acumulado entre frames para não
 * perder movimento quando o navegador entrega vários eventos por frame.
 */
export const BINDINGS = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  // Ctrl fica como alternativa, mas Ctrl+W fecha a aba no navegador — por
  // isso o padrão é C.
  crouch: ['KeyC', 'ControlLeft'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  reload: ['KeyR'],
  primary: ['Digit1'],
  secondary: ['Digit2'],
  knife: ['Digit3'],
  lastWeapon: ['KeyQ'],
  inspect: ['KeyF'],
  buy: ['KeyB'],
  scoreboard: ['Tab'],
};

export class Input {
  /** @param {HTMLElement} target elemento que recebe o pointer lock */
  constructor(target) {
    this.target = target;
    /** @type {Set<string>} */
    this.keys = new Set();
    /** @type {Set<string>} */
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    /** botões do mouse: 0 esquerdo, 2 direito */
    this.buttons = [false, false, false];
    this.buttonsPressed = [false, false, false];
    this.locked = false;
    /** quando false, eventos de jogo são ignorados (menus abertos) */
    this.enabled = true;
    /** @type {((locked: boolean) => void)[]} */
    this.lockListeners = [];

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.locked) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.fill(false);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons[e.button] = true;
      this.buttonsPressed[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons[e.button] = false;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    window.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) {
        this.buttons.fill(false);
        this.keys.clear();
      }
      for (const fn of this.lockListeners) fn(this.locked);
    });
  }

  lock() {
    if (this.locked) return;
    const p = this.target.requestPointerLock?.({ unadjustedMovement: true });
    // `unadjustedMovement` não existe em todo navegador; tenta sem ele.
    if (p && typeof p.catch === 'function') p.catch(() => this.target.requestPointerLock?.());
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** @param {keyof typeof BINDINGS} action */
  down(action) {
    for (const c of BINDINGS[action]) if (this.keys.has(c)) return true;
    return false;
  }

  /** @param {keyof typeof BINDINGS} action */
  pressed(action) {
    for (const c of BINDINGS[action]) if (this.justPressed.has(c)) return true;
    return false;
  }

  /** Lê e zera o delta do mouse acumulado. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.justPressed.clear();
    this.buttonsPressed[0] = this.buttonsPressed[1] = this.buttonsPressed[2] = false;
  }
}
