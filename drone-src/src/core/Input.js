import { CONFIG } from '../config.js';
import { clamp, expo, deadzone } from './MathUtils.js';
import { KeyboardSource } from './input/Keyboard.js';
import { GamepadSource } from './input/Gamepad.js';
import { TouchSource } from './input/Touch.js';

/**
 * Junta teclado, gamepad e toque num único estado de comando.
 *
 * As três fontes escrevem no mesmo objeto e a última a falar vence — o que na
 * prática significa "a que o jogador acabou de mexer". Isso deixa alternar
 * entre teclado e gamepad no meio da sessão sem nenhum menu de seleção.
 */
export class Input {
  constructor(uiContainer, options = {}) {
    this.keyboard = new KeyboardSource();
    this.gamepad = new GamepadSource();
    this.touch = new TouchSource(uiContainer);

    /** Preferências do jogador (menu de opções, Fase 8). */
    this.options = {
      invertPitch: false,
      invertRoll: false,
      expoScale: 1,
      ...options,
    };

    /** Estado final, lido pelo modelo de voo. */
    this.axes = { throttle: this.hoverThrottle(), pitch: 0, roll: 0, yaw: 0 };
    /** Ações já em forma de borda: verdadeiras só no frame em que aconteceram. */
    this.pressed = new Set();

    this._rawThrottle = this.hoverThrottle();
    this.lastDevice = 'keyboard';
  }

  /** Acelerador que equilibra o peso — o centro do stick analógico. */
  hoverThrottle() {
    return 1 / CONFIG.DRONE.thrustToWeight;
  }

  update(dt) {
    const state = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: this._rawThrottle,
      throttleAxis: 0,
      throttleFromStick: false,
      throttleHeld: false,
      keyboardThrottleRate: CONFIG.DRONE.throttle.keyboardRate,
      actions: new Set(),
    };

    // Ordem importa pouco porque cada fonte só escreve quando está sendo usada,
    // mas o gamepad vem depois do teclado de propósito: com os dois plugados, o
    // stick analógico é o comando mais preciso e deve ganhar.
    this.keyboard.sample(state, dt);
    this.touch.sample(state, dt);
    this.gamepad.sample(state, dt);

    if (state.throttleFromStick) {
      // Stick centrado = pairar. Pra cima vai até 100%, pra baixo até 0 — as
      // duas metades têm alcance diferente e por isso são mapeadas separadas.
      const hover = this.hoverThrottle();
      const a = state.throttleAxis;
      this._rawThrottle = a >= 0 ? hover + a * (1 - hover) : hover * (1 + a);
      this.lastDevice = this.touch.active && !this.gamepad.active ? 'touch' : 'gamepad';
    } else {
      this._rawThrottle = clamp(state.throttle, 0, 1);
      if (state.throttleHeld) this.lastDevice = 'keyboard';
    }

    const e = CONFIG.DRONE.expo;
    const dz = CONFIG.DRONE.deadzone;
    const scale = this.options.expoScale;
    const shape = (v, amount) => expo(deadzone(clamp(v, -1, 1), dz), clamp(amount * scale, 0, 1));

    this.axes.throttle = clamp(this._rawThrottle, 0, 1);
    this.axes.pitch = shape(state.pitch, e.pitch) * (this.options.invertPitch ? -1 : 1);
    this.axes.roll = shape(state.roll, e.roll) * (this.options.invertRoll ? -1 : 1);
    this.axes.yaw = shape(state.yaw, e.yaw);

    this.pressed = state.actions;
    return this.axes;
  }

  /** Verdadeiro só no frame em que a ação foi disparada. */
  took(action) {
    return this.pressed.has(action);
  }

  /** Injeta uma ação como se tivesse vindo do jogador (botões da UI em DOM). */
  fire(action) {
    this.pressed.add(action);
  }

  /** Zera os comandos — usado no respawn, na pausa e no menu. */
  neutralize() {
    this._rawThrottle = this.hoverThrottle();
    this.axes.throttle = this._rawThrottle;
    this.axes.pitch = this.axes.roll = this.axes.yaw = 0;
  }
}
