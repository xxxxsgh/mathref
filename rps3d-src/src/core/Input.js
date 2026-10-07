// Entrada unificada: teclado + mouse, gamepad (mapeamento "standard") e toque
// (via controles virtuais criados pela HUD com setVirtual/addLook).
//
// Ações são nomes ('primary', 'boost', 'interact'...). Cada ação tem teclas,
// botões de mouse e botões de gamepad. Eixos analógicos: moveX, moveY, lookX,
// lookY, lift (sobe/desce), roll.
//
// Bordas (pressed/released) valem até o fim do próximo PASSO FIXO — leia-as
// em update(), não em frame().

export const DEFAULT_BINDINGS = {
  // movimento / voo
  forward: { keys: ['KeyW'] },
  back: { keys: ['KeyS'] },
  left: { keys: ['KeyA'] },
  right: { keys: ['KeyD'] },
  up: { keys: ['Space'], pad: [0] },              // pular / jetpack / subir
  down: { keys: ['ControlLeft', 'KeyC'], pad: [1] }, // agachar / descer
  rollLeft: { keys: ['KeyQ'], pad: [4] },
  rollRight: { keys: ['KeyE'], pad: [5] },
  boost: { keys: ['ShiftLeft', 'ShiftRight'], pad: [10] }, // boost / correr
  // combate
  primary: { mouse: [0], pad: [7] },
  secondary: { mouse: [2], pad: [6] },            // míssil / mirar
  reload: { keys: ['KeyR'], pad: [2] },
  grenade: { keys: ['KeyG'] },
  countermeasure: { keys: ['KeyX'], pad: [13] },
  target: { keys: ['KeyT'], pad: [11] },
  // sistemas da nave
  decouple: { keys: ['KeyV'], pad: [14] },
  quantum: { keys: ['KeyJ'], pad: [12] },
  gear: { keys: ['KeyN'], pad: [15] },
  power1: { keys: ['Digit1'] }, power2: { keys: ['Digit2'] }, power3: { keys: ['Digit3'] }, power4: { keys: ['Digit4'] }, power5: { keys: ['Digit5'] },
  // interação / ferramentas
  interact: { keys: ['KeyF'], pad: [3] },
  scan: { keys: ['KeyZ'] },
  tool: { keys: ['KeyH'] },
  light: { keys: ['KeyL'] },
  freelook: { keys: ['AltLeft'] },
  map: { keys: ['KeyM'], pad: [8] },
  inventory: { keys: ['Tab', 'KeyI'] },
  journal: { keys: ['KeyO'] },
  pause: { keys: ['Escape', 'KeyP'], pad: [9] },
  confirm: { keys: ['Enter'], pad: [0] },
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.keys = new Set();
    this.mouse = new Set();
    this.padButtons = [];
    this.padAxes = [0, 0, 0, 0];
    this.virtual = new Map();       // ação → 0..1 (toque)
    this.virtualAxes = new Map();   // eixo → -1..1 (toque)
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.prevDown = new Set();
    this.lookAcc = { x: 0, y: 0 };
    this.wheel = 0;
    this.sensitivity = 0.0022;      // rad por pixel de mouse
    this.padLookRate = 2.6;         // rad/s com o stick no máximo
    this.invertY = false;
    this.locked = false;
    this.device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'kbm';
    this.enabled = true;            // false = UI modal aberta (jogo ignora)
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      this.keys.add(e.code); this.device = 'kbm';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.clear(); });
    canvas.addEventListener('mousedown', (e) => { this.mouse.add(e.button); this.device = 'kbm'; });
    addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookAcc.x += e.movementX * this.sensitivity;
      this.lookAcc.y += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener('touchstart', () => { this.device = 'touch'; }, { passive: true });
  }

  requestLock() {
    if (this.touch && this.device === 'touch') return;
    try { const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true }); p?.catch?.(() => this.canvas.requestPointerLock?.()); } catch {}
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  bind(action, binding) { this.bindings[action] = binding; }

  /** Valor analógico 0..1 da ação. */
  value(action) {
    if (!this.enabled) return 0;
    const b = this.bindings[action];
    let v = this.virtual.get(action) || 0;
    if (!b) return v;
    if (b.keys) for (const k of b.keys) if (this.keys.has(k)) v = 1;
    if (b.mouse) for (const m of b.mouse) if (this.mouse.has(m)) v = 1;
    if (b.pad) for (const p of b.pad) v = Math.max(v, this.padButtons[p] || 0);
    return v;
  }
  down(action) { return this.value(action) > 0.35; }
  pressed(action) { return this.enabled && this.pressedSet.has(action); }
  released(action) { return this.releasedSet.has(action); }

  /** Eixos: moveX (A/D), moveY (W/S, + = frente), lift (Space/C), roll (Q/E), lookX, lookY (stick). */
  axis(name) {
    if (!this.enabled) return 0;
    const va = this.virtualAxes.get(name) || 0;
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    let v = 0;
    switch (name) {
      case 'moveX': v = this.value('right') - this.value('left') + dz(this.padAxes[0]); break;
      case 'moveY': v = this.value('forward') - this.value('back') - dz(this.padAxes[1]); break;
      case 'lift': v = this.value('up') - this.value('down'); break;
      case 'roll': v = this.value('rollRight') - this.value('rollLeft'); break;
      case 'lookX': v = dz(this.padAxes[2]); break;
      case 'lookY': v = dz(this.padAxes[3]); break;
    }
    return Math.max(-1, Math.min(1, v + va));
  }

  /** Delta de olhar acumulado (rad) desde a última chamada — mouse + stick + toque. */
  takeLook() {
    const r = { x: this.lookAcc.x, y: this.lookAcc.y };
    this.lookAcc.x = 0; this.lookAcc.y = 0;
    if (!this.enabled) { r.x = 0; r.y = 0; }
    return r;
  }
  addLook(dx, dy) { this.lookAcc.x += dx; this.lookAcc.y += dy; }
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  setVirtual(action, v) { if (v) this.virtual.set(action, v); else this.virtual.delete(action); }
  setVirtualAxis(name, v) { if (v) this.virtualAxes.set(name, v); else this.virtualAxes.delete(name); }

  /** Chamado pelo núcleo uma vez por frame, antes dos passos. */
  poll(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (gp) {
      this.padButtons = gp.buttons.map((b) => b.value);
      this.padAxes = [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0];
      if (this.padButtons.some((v) => v > 0.5) || this.padAxes.some((a) => Math.abs(a) > 0.3)) this.device = 'gamepad';
      const lx = this.axis('lookX'), ly = this.axis('lookY');
      this.lookAcc.x += lx * Math.abs(lx) * this.padLookRate * dt;
      this.lookAcc.y += ly * Math.abs(ly) * this.padLookRate * dt * (this.invertY ? -1 : 1);
    } else { this.padButtons = []; this.padAxes = [0, 0, 0, 0]; }
    for (const a of Object.keys(this.bindings)) {
      const d = this.down(a);
      if (d && !this.prevDown.has(a)) { this.pressedSet.add(a); this.prevDown.add(a); }
      else if (!d && this.prevDown.has(a)) { this.releasedSet.add(a); this.prevDown.delete(a); }
    }
    for (const a of this.virtual.keys()) if (!this.bindings[a] && !this.prevDown.has(a)) { this.pressedSet.add(a); this.prevDown.add(a); }
  }
  /** Chamado pelo núcleo depois de cada passo fixo. */
  endStep() { this.pressedSet.clear(); this.releasedSet.clear(); }

  /** Vibração do gamepad (se suportado). */
  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    const gp = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
    gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch?.(() => {});
  }
}
