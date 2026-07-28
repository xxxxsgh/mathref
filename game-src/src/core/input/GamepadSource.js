import { CONFIG } from '../../config.js';
import { radialDeadzone, applyExpo, deadzone1 } from '../MathUtils.js';

/**
 * Gamepad API.
 *
 * Detalhe que pega muita gente: `navigator.getGamepads()` retorna um SNAPSHOT
 * novo a cada chamada, não um objeto vivo. Guardar a referência entre frames
 * congela os valores. Por isso relemos a lista todo update.
 *
 * O navegador também só expõe o gamepad depois do primeiro input nele (medida
 * anti-fingerprinting), então "não detectou" normalmente só significa "aperta
 * um botão".
 */
export class GamepadSource {
  constructor() {
    this.index = -1;
    this.connected = false;
    this._prevButtons = [];

    this._onConnect = (e) => {
      this.index = e.gamepad.index;
      this.connected = true;
    };
    this._onDisconnect = (e) => {
      if (e.gamepad.index === this.index) {
        this.index = -1;
        this.connected = false;
      }
    };
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
  }

  _read() {
    const pads = navigator.getGamepads?.() ?? [];
    if (this.index >= 0 && pads[this.index]) return pads[this.index];
    // Fallback: primeiro gamepad conectado com mapping padrão.
    for (const p of pads) {
      if (p && p.connected) {
        this.index = p.index;
        this.connected = true;
        return p;
      }
    }
    this.connected = false;
    return null;
  }

  /** Botão apertado NESTE frame (borda de subida), pra ações como barrel roll. */
  _justPressed(pad, i) {
    const now = pad.buttons[i]?.pressed ?? false;
    const was = this._prevButtons[i] ?? false;
    return now && !was;
  }

  /** @param {import('../Input.js').ControlState} s */
  apply(s, dt) {
    const pad = this._read();
    if (!pad) return;
    const G = CONFIG.input.gamepad;

    const rawYaw = pad.axes[G.axisYaw] ?? 0;
    const rawPitch = pad.axes[G.axisPitch] ?? 0;

    // Deadzone radial no PAR de eixos, não em cada eixo separado. Deadzone por
    // eixo cria uma cruz morta no centro do analógico e faz as diagonais
    // "pularem" quando você sai dela.
    const [dx, dy] = radialDeadzone(rawYaw, rawPitch, G.deadzone);

    let active = false;
    if (dx || dy) {
      active = true;
      s.yaw += applyExpo(dx, G.expo);
      // Eixo Y do gamepad é invertido em relação ao nosso pitch: no padrão,
      // empurrar o analógico pra frente dá valor NEGATIVO, e empurrar pra
      // frente deve baixar o nariz.
      s.pitch += applyExpo(-dy, G.expo);
    }

    // Roll nos ombros. `.value` em vez de `.pressed` porque em muitos controles
    // L1/R1 são analógicos e dá pra rolar devagar.
    const rl = pad.buttons[G.axisRollNeg]?.value ?? 0;
    const rr = pad.buttons[G.axisRollPos]?.value ?? 0;
    if (rl || rr) { active = true; s.roll += rr - rl; }

    const fire = deadzone1(pad.buttons[G.buttonFire]?.value ?? 0, 0.2);
    if (fire > 0.3) { s.fire = true; active = true; }

    const boost = deadzone1(pad.buttons[G.buttonBoost]?.value ?? 0, 0.2);
    const brake = deadzone1(pad.buttons[G.buttonBrake]?.value ?? 0, 0.2);
    if (boost > 0.35) { s.boost = true; active = true; }
    if (brake > 0.35) { s.brake = true; active = true; }

    const up = pad.buttons[G.buttonThrottleUp]?.pressed ? 1 : 0;
    const down = pad.buttons[G.buttonThrottleDown]?.pressed ? 1 : 0;
    if (up || down) {
      s.throttle += (up - down) * CONFIG.flight.throttleRate * dt;
      active = true;
    }

    if (this._justPressed(pad, G.buttonBarrelLeft)) { s.barrelRoll = -1; active = true; }
    else if (this._justPressed(pad, G.buttonBarrelRight)) { s.barrelRoll = 1; active = true; }

    if (active) s.source = 'gamepad';

    this._prevButtons = pad.buttons.map((b) => b.pressed);
  }

  dispose() {
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
  }
}
