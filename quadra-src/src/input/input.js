// ═══════════════════════════════════════════════════════════════════════════
// Entrada: teclado, toque (joystick virtual + botões) e controle (gamepad).
// Monta o "retrato" que o HumanController lê a cada passo:
//   { mx, my, held: {...}, pressN: {...}, shotType }
// `pressN` conta toques: um toque mais curto que um passo de física não se
// perde (o controlador compara contadores, não estados).
// ═══════════════════════════════════════════════════════════════════════════

const KEYS = {
  KeyJ: 'pass',
  Space: 'pass',
  KeyK: 'shoot',
  KeyL: 'dribble',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyI: 'through',
  KeyU: 'lob',
  KeyO: 'toe',
  KeyQ: 'placed',
  KeyE: 'chip',
  KeyG: 'gk',
  KeyT: 'sub',
};
const MOVE = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const PAD = { 0: 'pass', 1: 'shoot', 2: 'through', 3: 'lob', 4: 'dribble', 5: 'sprint', 7: 'toe', 6: 'placed', 13: 'chip', 8: 'gk', 11: 'sub' };

export class Input {
  constructor() {
    this.keys = new Set();
    this.held = {};
    this.pressN = {};
    this.stick = { x: 0, y: 0 };
    this.touchHeld = {};
    this.padHeld = {};
    this.shotType = 'normal';
    this.onSystem = null; // pausa, depuração, câmera
    this.enabled = true;
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchHeld = {};
      this.stick.x = this.stick.y = 0;
    });
  }

  press(name) {
    this.pressN[name] = (this.pressN[name] || 0) + 1;
  }

  key(e, down) {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (down && !e.repeat) this.onSystem?.('pause');
      return;
    }
    if (e.code === 'F3' || e.code === 'Backquote') {
      if (down && !e.repeat) this.onSystem?.('debug');
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyC') {
      if (down && !e.repeat) this.onSystem?.('camera');
      return;
    }
    const name = KEYS[e.code];
    if (name || MOVE[e.code]) e.preventDefault();
    if (down) {
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (name) this.press(name);
    } else this.keys.delete(e.code);
  }

  /** Liga os controles de toque aos elementos da HUD. */
  bindTouch(zone, stickEl, knobEl, buttons) {
    let id = null, ox = 0, oy = 0;
    const R = 52;
    const move = (x, y) => {
      let dx = x - ox, dy = y - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx *= R / d;
        dy *= R / d;
      }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stick.x = dx / R;
      this.stick.y = -dy / R;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      zone.setPointerCapture(id);
      ox = e.clientX;
      oy = e.clientY;
      stickEl.style.display = 'block';
      stickEl.style.left = `${ox}px`;
      stickEl.style.top = `${oy}px`;
      move(ox, oy);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) move(e.clientX, e.clientY);
    });
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick.x = this.stick.y = 0;
      knobEl.style.transform = '';
      stickEl.style.display = 'none';
    };
    zone.addEventListener('pointerup', up);
    zone.addEventListener('pointercancel', up);

    for (const [name, el] of Object.entries(buttons)) {
      const down = (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('down');
        if (name === 'shotType') {
          const order = ['normal', 'colocado', 'cavadinha'];
          this.shotType = order[(order.indexOf(this.shotType) + 1) % order.length];
          return;
        }
        this.touchHeld[name] = true;
        this.press(name);
      };
      const release = (e) => {
        e.preventDefault();
        el.classList.remove('down');
        this.touchHeld[name] = false;
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    }
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    for (const [i, name] of Object.entries(PAD)) {
      const b = gp.buttons[i];
      const on = !!(b && (b.pressed || b.value > 0.5));
      if (on && !this.padHeld[name]) this.press(name);
      this.padHeld[name] = on;
    }
    if (gp.buttons[9]?.pressed && !this.padStart) this.onSystem?.('pause');
    this.padStart = !!gp.buttons[9]?.pressed;
    const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    return Math.hypot(x, y) > 0.2 ? { x, y: -y } : null;
  }

  /** Retrato atual para o controlador. */
  snapshot() {
    let mx = 0, my = 0;
    for (const code of this.keys) {
      const m = MOVE[code];
      if (m) {
        mx += m[0];
        my += m[1];
      }
    }
    const kb = Math.hypot(mx, my);
    if (kb > 0) {
      mx /= kb;
      my /= kb;
    }
    const pad = this.pollPad();
    if (pad) {
      mx = pad.x;
      my = pad.y;
    }
    if (this.stick.x || this.stick.y) {
      mx = this.stick.x;
      my = this.stick.y;
    }
    const held = {};
    for (const code of this.keys) if (KEYS[code]) held[KEYS[code]] = true;
    for (const [k, v] of Object.entries(this.touchHeld)) if (v) held[k] = true;
    for (const [k, v] of Object.entries(this.padHeld)) if (v) held[k] = true;
    if (!this.enabled) return { mx: 0, my: 0, held: {}, pressN: { ...this.pressN }, shotType: this.shotType };
    return { mx, my, held, pressN: { ...this.pressN }, shotType: this.shotType };
  }
}
