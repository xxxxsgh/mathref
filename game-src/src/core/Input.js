import { CONFIG } from '../config.js';
import { clamp } from './MathUtils.js';
import { KeyboardMouseSource } from './input/KeyboardMouse.js';
import { GamepadSource } from './input/GamepadSource.js';
import { TouchSource } from './input/TouchSource.js';

/**
 * @typedef {Object} ControlState
 * @property {number} pitch    -1..1  (positivo = nariz pra cima)
 * @property {number} yaw      -1..1  (positivo = nariz pra direita)
 * @property {number} roll     -1..1  (positivo = gira horário visto de trás)
 * @property {number} throttle  0..1  (absoluto, não delta)
 * @property {number} strafeX  -1..1
 * @property {number} strafeY  -1..1
 * @property {boolean} fire
 * @property {boolean} boost
 * @property {boolean} brake
 * @property {number} barrelRoll  -1, 0 ou 1 — só no frame em que foi acionado
 * @property {number} aimX     -1..1  posição do retículo na tela
 * @property {number} aimY     -1..1
 * @property {boolean} aimActive  se o retículo deve ser desenhado
 * @property {string} source   'keyboard' | 'gamepad' | 'touch'
 */

/**
 * Agregador de input.
 *
 * Decisão de design: os três esquemas escrevem no MESMO estado normalizado, e
 * os eixos são SOMADOS e clampados em vez de "o último a mexer vence". Somar
 * permite misturar (teclado pro roll + mouse pra mira, ou gamepad + teclado),
 * que é como as pessoas de fato jogam. O campo `source` existe só pra HUD
 * decidir quais dicas de controle mostrar.
 *
 * Nenhum sistema de gameplay lê teclado, mouse ou gamepad diretamente. Todos
 * leem `ControlState`. É isso que faz o touch ser cidadão de primeira classe
 * em vez de remendo.
 */
export class Input {
  /** @param {HTMLCanvasElement} canvas @param {{ isMobile: boolean }} opts */
  constructor(canvas, { isMobile }) {
    /** @type {ControlState} */
    this.state = {
      pitch: 0, yaw: 0, roll: 0,
      throttle: CONFIG.flight.throttleInitial,
      strafeX: 0, strafeY: 0,
      fire: false, boost: false, brake: false,
      barrelRoll: 0,
      aimX: 0, aimY: 0, aimActive: false,
      source: isMobile ? 'touch' : 'keyboard',
    };

    /** Ações "de borda" (dispararam neste frame). Consumidas por quem escuta. */
    this.actions = {
      toggleDebug: false, toggleTuner: false, toggleAssist: false,
      /** Botão contextual de aproximar/pousar/decolar. Também setado pela HUD. */
      land: false,
    };

    const useTouch =
      CONFIG.input.touch.enabled === true ||
      (CONFIG.input.touch.enabled === 'auto' && isMobile);

    this.keyboardMouse = new KeyboardMouseSource(canvas);
    this.gamepad = CONFIG.input.gamepad.enabled ? new GamepadSource() : null;
    this.touch = useTouch ? new TouchSource() : null;

    this.hasTouch = !!this.touch;
  }

  /** @param {number} dt */
  update(dt) {
    const s = this.state;
    // Reinicia os eixos contínuos; cada fonte SOMA sua contribuição.
    s.pitch = 0; s.yaw = 0; s.roll = 0;
    s.strafeX = 0; s.strafeY = 0;
    s.fire = false; s.boost = false; s.brake = false;
    s.barrelRoll = 0;
    s.aimActive = false;
    this.actions.toggleDebug = false;
    this.actions.toggleTuner = false;
    this.actions.toggleAssist = false;
    // `land` NÃO é zerado aqui: o botão da HUD é um evento de clique, que
    // chega fora do frame de input. Zerá-lo aqui engoliria o clique metade
    // das vezes, dependendo de onde ele caísse em relação ao loop. Quem
    // consome (o Engine) é que limpa.

    this.keyboardMouse.apply(s, this.actions, dt);
    this.gamepad?.apply(s, this.actions, dt);
    this.touch?.apply(s, dt);

    // Clamp final. Somar antes e clampar depois (em vez de clampar cada fonte)
    // permite que duas fontes cooperem sem uma cancelar a outra.
    s.pitch = clamp(s.pitch, -1, 1);
    s.yaw = clamp(s.yaw, -1, 1);
    s.roll = clamp(s.roll, -1, 1);
    s.strafeX = clamp(s.strafeX, -1, 1);
    s.strafeY = clamp(s.strafeY, -1, 1);
    s.throttle = clamp(s.throttle, 0, 1);
  }

  /** Chamado no gesto de "Iniciar" — o único momento em que o navegador
   *  permite pedir Pointer Lock e destravar áudio. */
  onUserStart() {
    this.keyboardMouse.requestPointerLockIfEnabled();
  }

  dispose() {
    this.keyboardMouse.dispose();
    this.gamepad?.dispose();
    this.touch?.dispose();
  }
}
