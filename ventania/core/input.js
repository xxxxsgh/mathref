// Teclado + mouse com pointer lock.
// Guarda estado contínuo (tecla segurada) e bordas (apertou neste frame).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set(); // bordas acumuladas até consumir
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (['Space', 'F3', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.enabled) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => {
      // Sem pointer lock (navegador recusou): arrastar com o botão esquerdo.
      if (!this.locked && !(e.buttons & 1)) return;
      // Alguns navegadores entregam um salto gigante logo ao travar o mouse.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true });
      // unadjustedMovement não existe em todo navegador: cai para o simples.
      p?.catch?.(() => this.canvas.requestPointerLock?.());
    } catch {
      this.canvas.requestPointerLock?.();
    }
  }

  isDown(code) { return this.down.has(code); }

  /** Consome a borda de "apertou". */
  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  /** Eixos de movimento (x = direita, y = frente). */
  axes() {
    let x = 0, y = 0;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y += 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    // Bordas não consumidas morrem no fim do frame.
    this.pressed.clear();
  }
}
