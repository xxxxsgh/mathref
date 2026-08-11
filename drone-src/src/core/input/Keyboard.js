/**
 * Teclado — layout Mode 2, o mesmo dos rádios de FPV:
 *   mão esquerda = acelerador + guinada, mão direita = pitch + roll.
 *
 * WASD fica com o acelerador porque é a mão que o jogador de PC já apoia ali;
 * as setas fazem o papel do stick direito.
 */
const AXIS_KEYS = {
  throttleUp: ['KeyW'],
  throttleDown: ['KeyS'],
  yawLeft: ['KeyA'],
  yawRight: ['KeyD'],
  pitchForward: ['ArrowUp'],
  pitchBack: ['ArrowDown'],
  rollLeft: ['ArrowLeft'],
  rollRight: ['ArrowRight'],
};

const ACTION_KEYS = {
  toggleMode: ['KeyM'],
  restart: ['KeyR'],
  thirdPerson: ['KeyC'],
  pause: ['Escape'],
  map: ['Tab'],
  hangar: ['KeyH'],
  missions: ['KeyJ'],
  photo: ['KeyP'],
  action: ['KeyE', 'Space'], // pegar/soltar carga, fotografar, interagir
  debug: ['F3', 'Backquote'],
  tuner: ['KeyG'],
  nextCircuit: ['BracketRight'],
  prevCircuit: ['BracketLeft'],
};

export class KeyboardSource {
  constructor(target = window) {
    this.down = new Set();
    this.actions = new Set();
    this.active = false;

    this._onDown = (e) => {
      // Nunca sequestrar atalhos do navegador (Cmd/Ctrl+R, Cmd+T…).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) {
        // Segurar a tecla não deve repetir uma AÇÃO (só os eixos usam o estado
        // contínuo), então o repeat é engolido aqui.
        if (this._isAxisKey(e.code)) e.preventDefault();
        return;
      }
      this.down.add(e.code);
      this.active = true;
      for (const [action, codes] of Object.entries(ACTION_KEYS)) {
        if (codes.includes(e.code)) this.actions.add(action);
      }
      // Tab move o foco e Espaço rola a página — os dois no meio de um voo.
      if (this._isAxisKey(e.code) || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    };

    this._onUp = (e) => this.down.delete(e.code);

    // Ao perder o foco as teclas "grudam" pressionadas. Limpar evita o drone
    // sair voando sozinho quando o jogador troca de aba.
    this._onBlur = () => this.down.clear();

    target.addEventListener('keydown', this._onDown, { passive: false });
    target.addEventListener('keyup', this._onUp);
    target.addEventListener('blur', this._onBlur);
    this._target = target;
  }

  _isAxisKey(code) {
    for (const codes of Object.values(AXIS_KEYS)) if (codes.includes(code)) return true;
    return false;
  }

  _held(name) {
    return AXIS_KEYS[name].some((code) => this.down.has(code));
  }

  /** Escreve nos eixos do estado compartilhado. Não aplica expo — isso é do Input. */
  sample(state, dt) {
    const yaw = (this._held('yawRight') ? 1 : 0) - (this._held('yawLeft') ? 1 : 0);
    const pitch = (this._held('pitchForward') ? 1 : 0) - (this._held('pitchBack') ? 1 : 0);
    const roll = (this._held('rollRight') ? 1 : 0) - (this._held('rollLeft') ? 1 : 0);

    if (yaw) state.yaw = yaw;
    if (pitch) state.pitch = pitch;
    if (roll) state.roll = roll;

    // O acelerador de teclado é integrado e SEGURA o valor, como o stick com
    // catraca de um rádio de verdade. Só o stick analógico volta pro hover.
    const up = this._held('throttleUp');
    const down = this._held('throttleDown');
    if (up || down) {
      state.throttle += (up ? 1 : -1) * state.keyboardThrottleRate * dt;
      state.throttleHeld = true;
    }

    for (const action of this.actions) state.actions.add(action);
    this.actions.clear();
  }

  dispose() {
    this._target.removeEventListener('keydown', this._onDown);
    this._target.removeEventListener('keyup', this._onUp);
    this._target.removeEventListener('blur', this._onBlur);
  }
}
