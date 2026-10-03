/**
 * Entrada: teclado, mouse (com pointer lock), roda, e mapeamento de ações.
 *
 *   input.down('KeyW')         tecla física pressionada agora
 *   input.action('fire')       ação mapeada pressionada agora
 *   input.pressed('jump')      ação que COMEÇOU neste passo fixo
 *   input.released('ads')      ação que TERMINOU neste passo fixo
 *   input.look                 { x, y } delta de mouse acumulado (px) — consumido pelo player
 *   input.locked               pointer lock ativo
 *   input.enabled              false bloqueia tudo (menu, modo screenshot)
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
      if (!this.enabled) return;
      if (this.wantsLock && !this.locked && e.button === 0) {
        this.requestLock();
        return;
      }
      const c = 'Mouse' + e.button;
      if (!this.keys.has(c)) this.edgeDown.add(c);
      this.keys.add(c);
    };
    const mu = (e) => {
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
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.releaseAll();
      bus?.emit('input:lock', this.locked);
    };
    const blur = () => this.releaseAll();
    const ctx = (e) => e.preventDefault();
    this._h = [
      [window, 'keydown', kd], [window, 'keyup', ku], [window, 'mousedown', md], [window, 'mouseup', mu],
      [window, 'mousemove', mm], [window, 'wheel', wh, { passive: true }], [document, 'pointerlockchange', plc],
      [window, 'blur', blur], [window, 'contextmenu', ctx],
    ];
    for (const [t, ev, fn, o] of this._h) t.addEventListener(ev, fn, o);
  }
  requestLock() {
    try {
      const p = this.el.requestPointerLock?.();
      p?.catch?.(() => {});
    } catch {}
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  releaseAll() {
    for (const k of this.keys) this.edgeUp.add(k);
    this.keys.clear();
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
