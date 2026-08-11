/**
 * Gamepad em Mode 2 (o padrão de FPV):
 *   stick esquerdo  → acelerador (Y) + guinada (X)
 *   stick direito   → pitch (Y) + roll (X)
 *
 * O acelerador do stick analógico volta pro ponto de pairar quando solto — um
 * rádio de verdade tem catraca e fica onde está, mas num controle que
 * auto-centraliza isso significaria o drone despencar toda vez que a mão sai.
 */
const BUTTON_ACTIONS = {
  0: 'action', // A / ✕
  1: 'restart', // B / ○
  2: 'thirdPerson', // X / □
  3: 'toggleMode', // Y / △
  8: 'map', // Select
  9: 'pause', // Start
};

export class GamepadSource {
  constructor() {
    this.active = false;
    this._prevButtons = new Map();
  }

  _pad() {
    const pads = navigator.getGamepads?.() || [];
    for (const pad of pads) if (pad?.connected) return pad;
    return null;
  }

  sample(state) {
    const pad = this._pad();
    if (!pad) {
      this.active = false;
      return;
    }

    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;

    // O eixo Y do gamepad é invertido (para cima = negativo) nos dois sticks.
    const throttleAxis = -ly;
    const anyStick = Math.max(Math.abs(lx), Math.abs(ly), Math.abs(rx), Math.abs(ry));
    if (anyStick > 0.12) this.active = true;

    if (this.active) {
      state.yaw = lx;
      state.roll = rx;
      state.pitch = -ry; // stick pra frente (negativo) = nariz pra baixo
      state.throttleAxis = throttleAxis;
      state.throttleFromStick = true;
    }

    for (const [index, action] of Object.entries(BUTTON_ACTIONS)) {
      const pressed = pad.buttons[index]?.pressed ?? false;
      if (pressed && !this._prevButtons.get(index)) {
        state.actions.add(action);
        this.active = true;
      }
      this._prevButtons.set(index, pressed);
    }
  }
}
