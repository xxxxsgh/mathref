// Entrada unificada: teclado (com remapeamento), toque (joystick + 4 botões)
// e gamepads. Cada dispositivo vira um "controle" com o mesmo formato:
//   move {x, y}  — y positivo = para cima na tela
//   down[a] / pressed[a] / released[a] / held[a] (segundos)
// Ações: pass, shoot, dribble, switch, sprint, mod, chapeu, elastico, pisada, keeper, pause
import { clamp } from './util.js';

const ACTIONS = ['pass', 'shoot', 'dribble', 'switch', 'sprint', 'mod', 'chapeu', 'elastico', 'pisada', 'keeper', 'pause'];

class Controller {
  constructor(id, type, label) {
    this.id = id; this.type = type; this.label = label;
    this.move = { x: 0, y: 0 };
    this.down = {}; this.prev = {}; this.pressed = {}; this.released = {}; this.held = {}; this.lastHeld = {};
    for (const a of ACTIONS) { this.down[a] = false; this.prev[a] = false; this.held[a] = 0; this.lastHeld[a] = 0; }
    this.raw = {};
    this.lastUsed = 0;
  }
  update(dt) {
    for (const a of ACTIONS) {
      const d = !!this.raw[a];
      this.pressed[a] = d && !this.prev[a];
      this.released[a] = !d && this.prev[a];
      if (this.released[a]) this.lastHeld[a] = this.held[a];
      this.held[a] = d ? this.held[a] + dt : 0;
      this.down[a] = d;
      this.prev[a] = d;
      if (d) this.lastUsed = performance.now();
    }
    if (this.move.x || this.move.y) this.lastUsed = performance.now();
  }
  consume(a) { this.pressed[a] = false; this.released[a] = false; }
}

const P2_KEYS = {
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  pass: ['Numpad1', 'KeyN'], shoot: ['Numpad2', 'KeyM'], dribble: ['Numpad3', 'Comma'], switch: ['Numpad5', 'Period'],
  sprint: ['ShiftRight', 'Numpad0'], chapeu: ['Numpad4'], elastico: ['Numpad6'], pisada: ['Numpad8'], keeper: ['Numpad9'], pause: ['Backspace'],
};

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.keys = new Set();
    this.kb = new Controller('kb', 'keyboard', 'Teclado');
    this.kb2 = new Controller('kb2', 'keyboard2', 'Teclado (setas)');
    this.touch = new Controller('touch', 'touch', 'Toque');
    this.pads = [];
    this.splitKeyboard = false; // true quando dois jogadores dividem o teclado
    this.touchActive = false;
    this.listeners = [];
    this.remapCallback = null;
    this.menuNav = null;
    this.padPrev = {};

    window.addEventListener('keydown', (e) => {
      if (this.remapCallback) { e.preventDefault(); const cb = this.remapCallback; this.remapCallback = null; cb(e.code); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.initTouch();
  }

  // ─── Toque ────────────────────────────────────────────────────────────────
  initTouch() {
    const root = document.getElementById('touch');
    this.touchRoot = root;
    this.joyBase = root.querySelector('.joy-base');
    this.joyKnob = root.querySelector('.joy-knob');
    this.btns = [...root.querySelectorAll('.tbtn')];
    this.joyId = null; this.joyOrigin = { x: 0, y: 0 };
    const btnPtr = new Map();

    const zone = root.querySelector('.joy-zone');
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.placeJoy(e.clientX, e.clientY);
      this.setTouchActive(true);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      const r = this.joyRadius();
      let dx = e.clientX - this.joyOrigin.x, dy = e.clientY - this.joyOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > r) { dx *= r / d; dy *= r / d; }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, d / r);
      const mag = m < 0.15 ? 0 : (m - 0.15) / 0.85;
      const dl = Math.hypot(dx, dy) || 1;
      this.touch.move.x = (dx / dl) * mag;
      this.touch.move.y = (-dy / dl) * mag;
    });
    const endJoy = (e) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.touch.move.x = 0; this.touch.move.y = 0;
      this.joyKnob.style.transform = '';
      this.layoutTouch();
    };
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);

    for (const b of this.btns) {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        btnPtr.set(e.pointerId, act);
        this.touch.raw[act] = true;
        b.classList.add('on');
        this.setTouchActive(true);
        if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* ignora */ }
      });
      const up = (e) => {
        if (btnPtr.get(e.pointerId) !== act) return;
        btnPtr.delete(e.pointerId);
        this.touch.raw[act] = false;
        b.classList.remove('on');
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
    root.querySelector('.tpause').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.touch.raw.pause = true;
      setTimeout(() => (this.touch.raw.pause = false), 120);
    });
    window.addEventListener('touchstart', () => this.setTouchActive(true), { passive: true });
    // Bloqueia zoom por gesto/duplo toque no iOS.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layoutTouch());
    this.layoutTouch();
  }

  setTouchActive(v) {
    if (this.touchActive === v) return;
    this.touchActive = v;
    document.body.classList.toggle('touch-on', v);
    this.layoutTouch();
  }

  joyRadius() { return 52 * this.settings.touch.size; }

  placeJoy(x, y) {
    const s = 130 * this.settings.touch.size;
    this.joyBase.style.left = `${x - s / 2}px`;
    this.joyBase.style.top = `${y - s / 2}px`;
  }

  layoutTouch() {
    if (!this.touchRoot) return;
    const t = this.settings.touch;
    const W = window.innerWidth, H = window.innerHeight;
    const s = 130 * t.size;
    this.touchRoot.style.setProperty('--tsize', t.size);
    this.touchRoot.style.setProperty('--topa', t.opacity);
    this.joyBase.style.width = this.joyBase.style.height = `${s}px`;
    if (this.joyId === null) this.placeJoy(W * t.joyX, H * t.joyY);
    const cluster = this.touchRoot.querySelector('.tbtns');
    const cs = 210 * t.size;
    cluster.style.width = cluster.style.height = `${cs}px`;
    cluster.style.left = `${clamp(W * t.btnX - cs / 2, 0, W - cs)}px`;
    cluster.style.top = `${clamp(H * t.btnY - cs / 2, 0, H - cs)}px`;
  }

  // ─── Gamepads ─────────────────────────────────────────────────────────────
  pollPads() {
    let list = [];
    try { list = navigator.getGamepads ? [...navigator.getGamepads()] : []; } catch { list = []; }
    for (const gp of list) {
      if (!gp || !gp.connected) continue;
      let c = this.pads.find((p) => p.padIndex === gp.index);
      if (!c) {
        c = new Controller('pad' + gp.index, 'gamepad', 'Controle ' + (gp.index + 1));
        c.padIndex = gp.index;
        this.pads.push(c);
      }
      c.connected = true;
      const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      let x = gp.axes[0] || 0, y = -(gp.axes[1] || 0);
      const m = Math.hypot(x, y);
      if (m < 0.2) { x = 0; y = 0; } else { const k = Math.min(1, (m - 0.2) / 0.75) / m; x *= k; y *= k; }
      if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = 1; if (b(13)) y = -1;
      c.move.x = x; c.move.y = y;
      const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
      c.raw.pass = b(0) || b(3);
      c.raw.mod = b(6) || b(3);
      c.raw.shoot = b(2);
      c.raw.switch = b(1);
      c.raw.dribble = b(4);
      c.raw.sprint = b(5) || b(7);
      c.raw.pause = b(9);
      c.raw.keeper = b(8);
      c.raw.chapeu = ry < -0.7;
      c.raw.pisada = ry > 0.7;
      c.raw.elastico = Math.abs(rx) > 0.7;
      c.rawMenu = { up: y > 0.6, down: y < -0.6, left: x < -0.6, right: x > 0.6, ok: b(0), back: b(1) };
    }
    for (const c of this.pads) if (!list.some((g) => g && g.index === c.padIndex && g.connected)) c.connected = false;
  }

  // ─── Atualização por quadro ───────────────────────────────────────────────
  update(dt) {
    const k = this.settings.keys;
    const has = (code) => (Array.isArray(code) ? code.some((c) => this.keys.has(c)) : this.keys.has(code));
    const arrows = !this.splitKeyboard;
    let x = (has(k.right) || (arrows && has('ArrowRight')) ? 1 : 0) - (has(k.left) || (arrows && has('ArrowLeft')) ? 1 : 0);
    let y = (has(k.up) || (arrows && has('ArrowUp')) ? 1 : 0) - (has(k.down) || (arrows && has('ArrowDown')) ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    this.kb.move.x = x; this.kb.move.y = y;
    for (const a of ['pass', 'shoot', 'dribble', 'switch', 'sprint', 'chapeu', 'elastico', 'pisada', 'keeper', 'pause']) {
      this.kb.raw[a] = has(k[a]) || (a === 'pause' && has('KeyP'));
    }
    this.kb.raw.mod = this.kb.raw.dribble;

    const p = P2_KEYS;
    let x2 = (has(p.right) ? 1 : 0) - (has(p.left) ? 1 : 0);
    let y2 = (has(p.up) ? 1 : 0) - (has(p.down) ? 1 : 0);
    if (x2 && y2) { x2 *= Math.SQRT1_2; y2 *= Math.SQRT1_2; }
    this.kb2.move.x = x2; this.kb2.move.y = y2;
    for (const a of ['pass', 'shoot', 'dribble', 'switch', 'sprint', 'chapeu', 'elastico', 'pisada', 'keeper', 'pause']) this.kb2.raw[a] = has(p[a]);
    this.kb2.raw.mod = this.kb2.raw.dribble;

    this.touch.raw.mod = this.touch.raw.dribble;
    this.touch.raw.sprint = false;

    this.pollPads();
    this.kb.update(dt); this.kb2.update(dt); this.touch.update(dt);
    for (const c of this.pads) c.update(dt);
    this.updateMenuNav();
  }

  // Navegação dos menus pelo gamepad (setas = foco, A = confirmar, B = voltar).
  updateMenuNav() {
    for (const c of this.pads) {
      if (!c.rawMenu) continue;
      const prev = this.padPrev[c.id] || {};
      for (const key of Object.keys(c.rawMenu)) {
        if (c.rawMenu[key] && !prev[key] && this.menuNav) this.menuNav(key);
      }
      this.padPrev[c.id] = { ...c.rawMenu };
    }
  }

  // Todos os controles disponíveis (para a tela de seleção do multiplayer).
  devices() {
    const list = [this.kb];
    if (this.splitKeyboard) list.push(this.kb2);
    if (this.touchActive) list.push(this.touch);
    for (const c of this.pads) if (c.connected) list.push(c);
    return list;
  }

  // Controle "principal" para o jogo solo: une teclado, toque e gamepad 1.
  primary() {
    if (!this._merged) this._merged = new Controller('main', 'merged', 'Jogador 1');
    const m = this._merged;
    const srcs = [this.kb, this.touch, ...this.pads.filter((p) => p.connected)];
    let best = null;
    for (const s of srcs) if (Math.abs(s.move.x) + Math.abs(s.move.y) > 0.01 && (!best || s.lastUsed > best.lastUsed)) best = s;
    m.move.x = best ? best.move.x : 0; m.move.y = best ? best.move.y : 0;
    for (const a of ACTIONS) {
      m.down[a] = srcs.some((s) => s.down[a]);
      m.pressed[a] = srcs.some((s) => s.pressed[a]);
      m.released[a] = srcs.some((s) => s.released[a]);
      m.held[a] = Math.max(...srcs.map((s) => s.held[a]));
      m.lastHeld[a] = Math.max(...srcs.map((s) => (s.released[a] ? s.lastHeld[a] : 0)));
    }
    return m;
  }

  anyPressed() {
    const all = [this.kb, this.kb2, this.touch, ...this.pads];
    return all.some((c) => c.pressed.pass || c.pressed.shoot || c.pressed.switch || c.pressed.pause || c.pressed.dribble);
  }

  showTouch(v) { this.touchRoot.classList.toggle('show', v); }
}

export { Controller };
