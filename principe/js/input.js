// Teclado, mouse e toque (joystick virtual + botões).
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyE: 'act', Enter: 'act', NumpadEnter: 'act',
  ShiftLeft: 'slow', ShiftRight: 'slow', KeyZ: 'camL', KeyC: 'camR',
  Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
};

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.look = { dx: 0, dy: 0 };
    this.joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.advanceFns = [];
    this.touch = false;

    addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.down.add(k);
      this.pressed.add(k);
      if (k === 'act' || k === 'jump') this.emitAdvance();
    });
    addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) this.down.delete(k); });
    addEventListener('blur', () => this.down.clear());

    // arrastar para girar a câmera (mouse)
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag && e.pointerType === 'mouse') {
        this.look.dx += e.clientX - drag.x; this.look.dy += e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    this.setupTouch(canvas);
  }

  setupTouch(canvas) {
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    const lookT = { id: null, x: 0, y: 0 };
    const enable = () => { if (!this.touch) { this.touch = true; document.body.classList.add('touch'); } };
    // detecta já na largada, para o layout não mudar no meio do primeiro toque
    if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) enable();
    addEventListener('touchstart', enable, { passive: true });

    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && this.joy.id === null) {
          this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY;
          stick.style.left = (t.clientX - 62) + 'px'; stick.style.top = (t.clientY - 62) + 'px'; stick.style.bottom = 'auto';
        } else if (lookT.id === null) {
          lookT.id = t.identifier; lookT.x = t.clientX; lookT.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          let dx = (t.clientX - this.joy.ox) / 50, dy = (t.clientY - this.joy.oy) / 50;
          const m = Math.hypot(dx, dy);
          if (m > 1) { dx /= m; dy /= m; }
          this.joy.x = dx; this.joy.y = -dy;
          knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
        } else if (t.identifier === lookT.id) {
          this.look.dx += (t.clientX - lookT.x) * 1.3; this.look.dy += (t.clientY - lookT.y) * 1.3;
          lookT.x = t.clientX; lookT.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.id = null; this.joy.x = this.joy.y = 0; knob.style.transform = '';
          stick.style.left = ''; stick.style.top = ''; stick.style.bottom = '';
        }
        if (t.identifier === lookT.id) lookT.id = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    const btn = (id, key) => {
      const b = document.getElementById(id);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        this.down.add(key); this.pressed.add(key);
        this.emitAdvance();
      });
      const up = () => this.down.delete(key);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    };
    btn('bAct', 'act');
    btn('bJump', 'jump');
  }

  onAdvance(fn) { this.advanceFns.push(fn); }
  emitAdvance() { for (const f of this.advanceFns) f(); }

  isDown(k) { return this.down.has(k); }
  wasPressed(k) { return this.pressed.has(k); }
  clearPressed() { this.pressed.clear(); }

  /** Vetor de movimento {x, y, mag}: y>0 para frente. */
  move() {
    let x = 0, y = 0;
    if (this.down.has('left')) x -= 1;
    if (this.down.has('right')) x += 1;
    if (this.down.has('up')) y += 1;
    if (this.down.has('down')) y -= 1;
    let mag = Math.hypot(x, y);
    if (mag > 0) {
      x /= mag; y /= mag; mag = this.down.has('slow') ? 0.35 : 1;
    } else if (this.joy.id !== null) {
      x = this.joy.x; y = this.joy.y; mag = Math.hypot(x, y);
      if (mag < 0.12) { x = y = mag = 0; } else { x /= mag; y /= mag; mag = Math.min(1, (mag - 0.12) / 0.8); }
    }
    return { x, y, mag };
  }

  endFrame() { this.pressed.clear(); this.look.dx = 0; this.look.dy = 0; }
}
