// Entrada unificada: teclado + mouse + gamepad + toque (virtual).
//
// Sistemas leem AÇÕES, nunca teclas:
//   input.axis('moveY')        → [-1,1]  (frente/trás a pé; acelerador na nave)
//   input.down('fire')         → segurando agora
//   input.pressed('interact')  → apertou neste passo fixo (borda de subida)
//   input.look                 → {x,y} delta acumulado do mouse/stick desde o último frame (px-equivalentes)
//
// Os controles de toque (HUD) chamam input.setVirtual(acao, valor) e
// input.addLook(dx, dy). Gamepad é lido a cada frame.

export const BINDINGS = {
  // eixos: [teclaNegativa, teclaPositiva]
  axes: {
    moveX: ['KeyA', 'KeyD'],
    moveY: ['KeyS', 'KeyW'],
    vertical: ['ControlLeft', 'Space'], // nave: descer/subir (strafe vertical). A pé: Space = pulo/jetpack (ver botões)
    roll: ['KeyQ', 'KeyE'],
  },
  buttons: {
    fire: ['Mouse0'],
    fire2: ['Mouse2'],
    boost: ['ShiftLeft'],
    sprint: ['ShiftLeft'],
    jump: ['Space'],
    crouch: ['KeyC'],
    interact: ['KeyF'],
    reload: ['KeyR'],
    scan: ['KeyV'],
    tool: ['KeyT'], // multiferramenta: alterna modo (scanner/mineração/hack)
    flashlight: ['KeyL'],
    grenade: ['KeyG'],
    weaponNext: ['WheelDown', 'Digit2'],
    weaponPrev: ['WheelUp', 'Digit1'],
    target: ['KeyX'], // nave: travar alvo à frente
    missile: ['Mouse1', 'KeyZ'],
    flare: ['KeyH'],
    chaff: ['KeyJ'],
    decouple: ['KeyN'],
    quantum: ['KeyB'], // viagem quântica para o destino marcado
    jump_hyper: ['KeyK'], // salto entre sistemas
    land: ['KeyU'], // trem de pouso / pedido de pouso
    exitSeat: ['KeyY'], // levantar da cadeira / sair da nave
    powerShield: ['ArrowLeft'],
    powerEngine: ['ArrowUp'],
    powerWeapons: ['ArrowRight'],
    powerReset: ['ArrowDown'],
    map: ['KeyM'],
    missions: ['KeyO'],
    inventory: ['Tab'],
    menu: ['Escape'],
    zoom: ['Mouse2'],
    photo: ['F9'],
  },
};

// Gamepad padrão (layout "standard" do W3C).
const PAD_BUTTONS = {
  fire: [7], // RT
  fire2: [6], // LT
  zoom: [6],
  boost: [10], // L3
  sprint: [10],
  jump: [0], // A
  interact: [2], // X
  reload: [2],
  crouch: [1], // B
  scan: [3], // Y
  missile: [5], // RB
  target: [4], // LB
  flare: [12], // D-pad cima
  decouple: [11], // R3
  quantum: [15],
  map: [8], // Select
  menu: [9], // Start
  weaponNext: [5],
  weaponPrev: [4],
  exitSeat: [13],
  grenade: [14],
};

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.prev = new Set();
    this.edge = new Set(); // acumulado entre passos fixos
    this.virtual = new Map(); // ação → valor (toque)
    this.look = { x: 0, y: 0 };
    this.lookSensitivity = 1;
    this.invertY = false;
    this.pointerLocked = false;
    this.usingTouch = matchMedia('(pointer: coarse)').matches;
    this.usingPad = false;
    this.padAxes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, vertical: 0, roll: 0 };
    this.padButtons = new Set();
    this.enabled = true;

    const press = (code) => {
      if (!this.keys.has(code)) this.edge.add(code);
      this.keys.add(code);
    };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F9'].includes(e.code)) e.preventDefault();
      press(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousedown', (e) => {
      press('Mouse' + e.button);
      this.usingTouch = false;
    });
    addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.addLook(e.movementX, e.movementY);
    });
    el.addEventListener(
      'wheel',
      (e) => {
        const c = e.deltaY > 0 ? 'WheelDown' : 'WheelUp';
        this.edge.add(c);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === el;
    });
    addEventListener('touchstart', () => (this.usingTouch = true), { passive: true });
    addEventListener('gamepadconnected', () => (this.usingPad = true));
  }

  /** Pede pointer lock (só desktop; chamado num gesto do usuário). */
  lock() {
    if (this.usingTouch || this.pointerLocked) return;
    try {
      const p = this.el.requestPointerLock?.({ unadjustedMovement: true });
      p?.catch?.(() => this.el.requestPointerLock?.());
    } catch {
      /* Safari antigo */
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  addLook(dx, dy) {
    this.look.x += dx * this.lookSensitivity;
    this.look.y += dy * this.lookSensitivity * (this.invertY ? -1 : 1);
  }
  /** Consome o delta de mira acumulado (chamar uma vez por frame pelo controlador ativo). */
  takeLook() {
    const l = { x: this.look.x + this.padAxes.lookX * 18, y: this.look.y + this.padAxes.lookY * 18 * (this.invertY ? -1 : 1) };
    this.look.x = this.look.y = 0;
    return l;
  }

  setVirtual(action, value) {
    if (!value) this.virtual.delete(action);
    else {
      if (!this.virtual.get(action)) this.edge.add('V:' + action);
      this.virtual.set(action, value);
    }
  }

  axis(name) {
    if (!this.enabled) return 0;
    let v = 0;
    const b = BINDINGS.axes[name];
    if (b) {
      if (this.keys.has(b[0])) v -= 1;
      if (this.keys.has(b[1])) v += 1;
    }
    v += this.padAxes[name] || 0;
    v += this.virtual.get(name) || 0;
    return Math.max(-1, Math.min(1, v));
  }

  down(action) {
    if (!this.enabled) return false;
    const b = BINDINGS.buttons[action];
    if (b) for (const k of b) if (this.keys.has(k)) return true;
    const pb = PAD_BUTTONS[action];
    if (pb) for (const i of pb) if (this.padButtons.has(i)) return true;
    return !!this.virtual.get(action);
  }

  pressed(action) {
    if (!this.enabled) return false;
    const b = BINDINGS.buttons[action];
    if (b) for (const k of b) if (this.edge.has(k)) return true;
    const pb = PAD_BUTTONS[action];
    if (pb) for (const i of pb) if (this.edge.has('P' + i)) return true;
    return this.edge.has('V:' + action);
  }

  /** Chamado pelo núcleo a cada frame antes dos sistemas. */
  pollGamepad() {
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) return;
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const a = gp.axes;
    this.padAxes.moveX = dz(a[0] || 0);
    this.padAxes.moveY = -dz(a[1] || 0);
    this.padAxes.lookX = dz(a[2] || 0);
    this.padAxes.lookY = dz(a[3] || 0);
    const now = new Set();
    gp.buttons.forEach((b, i) => {
      if (b.pressed) now.add(i);
    });
    for (const i of now) if (!this.padButtons.has(i)) this.edge.add('P' + i);
    this.padButtons = now;
    // gatilhos analógicos também viram "vertical" na nave (RT sobe / LT desce não — reservados p/ tiro)
    this.padAxes.roll = (gp.buttons[15]?.value || 0) - (gp.buttons[14]?.value || 0);
    if (now.size || a.some((v) => Math.abs(v) > 0.3)) {
      this.usingPad = true;
      this.usingTouch = false;
    }
  }

  /** Chamado pelo núcleo depois de cada passo fixo: limpa as bordas. */
  endStep() {
    this.edge.clear();
  }

  /** Vibração (gamepad); silencioso se não houver. */
  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    const gp = [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected);
    gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}
