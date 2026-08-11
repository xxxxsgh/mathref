import { DCFG } from '../config.js';
import { clamp, moveTowards, radialDeadzone, deadzone1 } from '../../core/MathUtils.js';

/**
 * Input do drone: teclado, gamepad e touch escrevendo no mesmo estado.
 *
 * @typedef {Object} StickState
 * @property {number} throttle  0..1  — ABSOLUTO, sem mola de retorno
 * @property {number} roll      -1..1  positivo = rola para a direita
 * @property {number} pitch     -1..1  positivo = nariz para CIMA (puxar)
 * @property {number} yaw       -1..1  positivo = nariz para a direita
 * @property {string} source    'keyboard' | 'gamepad' | 'touch'
 *
 * ═══ O ACELERADOR NÃO TEM MOLA ═══
 *
 * É a diferença mais importante entre pilotar um drone e pilotar qualquer
 * outra coisa num videogame. Num rádio, o manche do acelerador fica ONDE
 * VOCÊ DEIXOU — não volta ao centro, não volta a zero. Soltar o controle
 * não faz o drone pairar: faz ele continuar fazendo o que estava fazendo.
 *
 * Reproduzir isso é desconfortável no começo e é o jogo. Um acelerador com
 * mola transformaria o modelo de voo inteiro em outra coisa: pairar
 * deixaria de ser uma habilidade (encontrar e manter o ponto de equilíbrio)
 * e viraria o estado padrão.
 *
 * Os outros três eixos TÊM mola, exatamente como no rádio.
 *
 * ═══ AS TRÊS FONTES SOMAM ═══
 *
 * Como no jogo de nave: cada fonte soma sua contribuição e o total é
 * clampado no fim, em vez de "a última que mexeu vence". Isso permite
 * misturar teclado e gamepad sem que um cancele o outro — e faz o touch ser
 * cidadão de primeira classe, não remendo.
 *
 * Teclado, gamepad e touch vivem no mesmo arquivo (e não em três, como no
 * jogo de nave) porque juntos dão 200 linhas: separá-los aqui seria estrutura
 * sem conteúdo.
 */
export class DroneInput {
  /** @param {HTMLCanvasElement} canvas @param {{isMobile:boolean}} opts */
  constructor(canvas, { isMobile }) {
    /** @type {StickState} */
    this.state = {
      throttle: 0, roll: 0, pitch: 0, yaw: 0,
      source: isMobile ? 'touch' : 'keyboard',
    };

    /** Ações de borda: verdadeiras só no frame em que foram acionadas.
     *  Quem consome é responsável por não deixá-las passar. */
    this.actions = {
      arm: false, mode: false, camera: false, rth: false,
      reset: false, restart: false, debug: false, pause: false,
    };

    this.keyboard = new KeyboardSource();
    this.gamepad = DCFG.input.gamepad.enabled ? new GamepadSource() : null;
    const useTouch = DCFG.input.touch.enabled === true
      || (DCFG.input.touch.enabled === 'auto' && isMobile);
    this.touch = useTouch ? new TouchSource(this.state) : null;
    this.hasTouch = !!this.touch;
  }

  update(dt) {
    const s = this.state;
    s.roll = 0; s.pitch = 0; s.yaw = 0;
    for (const k in this.actions) this.actions[k] = false;

    this.keyboard.apply(s, this.actions, dt);
    this.gamepad?.apply(s, this.actions, dt);
    this.touch?.apply(s, dt);

    s.roll = clamp(s.roll, -1, 1);
    s.pitch = clamp(s.pitch, -1, 1);
    s.yaw = clamp(s.yaw, -1, 1);
    s.throttle = clamp(s.throttle, 0, 1);
  }

  /** Zera os manches — usado ao desarmar e ao renascer. Sem isto, o drone
   *  nasce com o acelerador de antes do acidente e sobe sozinho. */
  neutralize() {
    this.state.throttle = 0;
    this.state.roll = this.state.pitch = this.state.yaw = 0;
    this.keyboard.axes.roll = this.keyboard.axes.pitch = this.keyboard.axes.yaw = 0;
    this.touch?.reset();
  }

  dispose() {
    this.keyboard.dispose();
    this.touch?.dispose();
  }
}

/**
 * Teclado.
 *
 * ═══ O PROBLEMA DE PILOTAR UM DRONE COM TECLADO ═══
 *
 * Um manche é analógico e uma tecla é 0 ou 1. Ligar a tecla direto no eixo dá
 * um drone que só conhece "parado" e "fim de curso" — impossível de pilotar
 * em acro, porque qualquer toque manda 620°/s.
 *
 * A ponte é uma RAMPA: a tecla move o eixo virtual em direção ao fim de
 * curso a uma taxa constante, e o eixo volta ao centro quando ela solta. A
 * subida é mais lenta que a volta (`keyRampUp` < `keyRampDown`) porque
 * comandar precisa de precisão e parar precisa de imediatismo.
 *
 * Não é tão bom quanto um rádio — nada é —, mas é jogável, e é o que
 * transforma "não dá para jogar sem controle" em "dá, e vale a pena arrumar
 * um controle".
 */
class KeyboardSource {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    /** Eixos virtuais com rampa. */
    this.axes = { roll: 0, pitch: 0, yaw: 0 };

    this._onDown = (e) => {
      // Setas rolam a página e Espaço também; F3 abre a busca no Firefox.
      if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'F3') {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    };
    this._onUp = (e) => this.keys.delete(e.code);
    // Sem isto, alt-tab no meio de uma curva deixa a tecla "grudada" e o
    // drone gira para sempre.
    this._onBlur = () => this.keys.clear();

    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
  }

  _any(codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }
  _hit(codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; }

  apply(s, actions, dt) {
    const K = DCFG.input.keyboard;
    const I = DCFG.input;
    let used = false;

    const dir = (neg, pos) => (this._any(pos) ? 1 : 0) - (this._any(neg) ? 1 : 0);
    const targets = {
      roll: dir(K.rollLeft, K.rollRight),
      pitch: dir(K.pitchFwd, K.pitchBack),   // ↓ = puxar = nariz para cima
      yaw: dir(K.yawLeft, K.yawRight),
    };

    for (const axis of ['roll', 'pitch', 'yaw']) {
      const t = targets[axis];
      if (t !== 0) used = true;
      const rate = (t === 0 ? I.keyRampDown : I.keyRampUp) * dt;
      this.axes[axis] = moveTowards(this.axes[axis], t, rate);
      s[axis] += this.axes[axis];
    }

    const th = dir(K.throttleDown, K.throttleUp);
    if (th !== 0) {
      s.throttle += th * I.throttleRate * dt;
      used = true;
    }

    if (this._hit(K.arm)) actions.arm = true;
    if (this._hit(K.mode)) actions.mode = true;
    if (this._hit(K.camera)) actions.camera = true;
    if (this._hit(K.rth)) actions.rth = true;
    if (this._hit(K.reset)) actions.reset = true;
    if (this._hit(K.restart)) actions.restart = true;
    if (this._hit(K.debug)) actions.debug = true;
    if (this._hit(K.pause)) actions.pause = true;

    if (used) s.source = 'keyboard';
    this.pressed.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
  }
}

/**
 * Gamepad.
 *
 * ═══ POR QUE O GAMEPAD É O CONTROLE CERTO AQUI ═══
 *
 * Um gamepad tem dois analógicos de dois eixos — que é EXATAMENTE a
 * topologia de um rádio de drone. O mapeamento é direto e não é uma
 * adaptação: analógico esquerdo = acelerador e guinada, direito = arfagem e
 * rolagem. É o "modo 2", o padrão de fábrica de qualquer rádio ocidental.
 *
 * A única diferença é a mola do acelerador, que o gamepad tem e o rádio não.
 * Como o eixo é ABSOLUTO (a posição do analógico vira o valor do acelerador
 * diretamente), soltar o analógico corta o acelerador — o que é fisicamente
 * o mesmo que um rádio com o manche em baixo. Continua sendo o melhor
 * controle disponível num navegador.
 */
class GamepadSource {
  constructor() { this.index = -1; }

  _pad() {
    const pads = navigator.getGamepads?.() ?? [];
    if (this.index >= 0 && pads[this.index]?.connected) return pads[this.index];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]?.connected) { this.index = i; return pads[i]; }
    }
    this.index = -1;
    return null;
  }

  apply(s, actions) {
    const pad = this._pad();
    if (!pad) return;
    const G = DCFG.input.gamepad;
    const ax = pad.axes;
    let used = false;

    // Deadzone RADIAL por analógico, não por eixo. Deadzone por eixo cria uma
    // cruz morta no centro e faz as diagonais saltarem — num manche de drone
    // isso aparece como o drone "recusando" comandos suaves em diagonal.
    const [yaw, thrRaw] = radialDeadzone(
      ax[G.yawAxis] ?? 0, ax[G.throttleAxis] ?? 0, G.deadzone,
    );
    const [roll, pitchRaw] = radialDeadzone(
      ax[G.rollAxis] ?? 0, ax[G.pitchAxis] ?? 0, G.deadzone,
    );

    // O acelerador é ABSOLUTO: a posição do analógico É o valor, sem rampa.
    // O eixo Y vem invertido em todo gamepad (para cima é negativo).
    const thr = (G.invertThrottle ? -thrRaw : thrRaw);
    const throttle = clamp((thr + 1) / 2, 0, 1);
    // Só assume o acelerador quando o analógico saiu do centro alguma vez:
    // senão, um gamepad conectado e parado zeraria o acelerador do teclado.
    if (Math.abs(thrRaw) > G.deadzone || this._engaged) {
      this._engaged = true;
      s.throttle = throttle;
      used = true;
    }

    if (yaw) { s.yaw += yaw; used = true; }
    if (roll) { s.roll += roll; used = true; }
    const pitch = G.invertPitch ? -pitchRaw : pitchRaw;
    if (pitch) { s.pitch += pitch; used = true; }

    // Gatilhos analógicos também servem de acelerador em controles cujo
    // analógico esquerdo o jogador prefere usar só para guinada.
    const rt = deadzone1(pad.buttons[7]?.value ?? 0, 0.06);
    if (rt > 0) { s.throttle = Math.max(s.throttle, rt); used = true; }

    this._edge(pad, G.armButton, 'arm', actions);
    this._edge(pad, G.modeButton, 'mode', actions);
    this._edge(pad, G.cameraButton, 'camera', actions);
    this._edge(pad, G.rthButton, 'rth', actions);

    if (used) s.source = 'gamepad';
  }

  /** Detecta a borda de subida de um botão. A API de gamepad não tem
   *  eventos: só o estado atual, lido por polling. */
  _edge(pad, index, action, actions) {
    this._prev ??= {};
    const down = !!pad.buttons[index]?.pressed;
    if (down && !this._prev[index]) actions[action] = true;
    this._prev[index] = down;
  }
}

/**
 * Touch: dois manches virtuais.
 *
 * ═══ POR QUE DOIS MANCHES E NÃO BOTÕES ═══
 *
 * O esquema do jogo de nave (manche à esquerda, arrasto de acelerador à
 * direita, botões) não serve aqui: um drone precisa dos QUATRO eixos ao
 * mesmo tempo, o tempo todo. Sair de uma curva exige acelerador + rolagem +
 * arfagem simultâneos; com botões, isso é impossível.
 *
 * Dois manches flutuantes — nascem onde o polegar encosta — reproduzem a
 * topologia do rádio. E o esquerdo é PEGAJOSO no eixo vertical: ao soltar, o
 * acelerador fica onde estava, como o manche sem mola de um rádio de
 * verdade. Sem isso, tirar o dedo para tocar em qualquer outra coisa
 * derrubaria o drone.
 */
class TouchSource {
  /** @param {StickState} state */
  constructor(state) {
    this.state = state;
    this.left = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.right = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    /** O manche esquerdo só assume o acelerador depois de tocado uma vez.
     *  Antes disso o drone fica com acelerador zero em vez de meio curso. */
    this.leftEngaged = false;

    const start = (e) => {
      for (const t of e.changedTouches) {
        // Toque sobre um botão da UI é tratado lá.
        if (t.target instanceof Element && t.target.closest('[data-touch-ui]')) continue;
        const side = t.clientX < window.innerWidth * 0.5 ? this.left : this.right;
        if (side.active) continue;
        side.active = true;
        side.id = t.identifier;
        side.ox = t.clientX;
        side.oy = t.clientY;
        side.x = 0;
        side.y = 0;
        // O manche esquerdo nasce ONDE O ACELERADOR JÁ ESTÁ: a origem do
        // toque é deslocada para que o valor atual corresponda à posição do
        // dedo. Sem isso, encostar o dedo saltaria o acelerador para o
        // centro e o drone despencaria.
        if (side === this.left) this.leftEngaged = true;
        if (side === this.left && DCFG.input.touch.stickyThrottle) {
          const r = DCFG.input.touch.stickRadius;
          side.oy = t.clientY + (this.state.throttle * 2 - 1) * r;
          side.y = -(this.state.throttle * 2 - 1);
        }
      }
      if (e.cancelable) e.preventDefault();
    };

    const move = (e) => {
      const r = DCFG.input.touch.stickRadius;
      for (const t of e.changedTouches) {
        const side = t.identifier === this.left.id ? this.left
          : t.identifier === this.right.id ? this.right : null;
        if (!side) continue;
        let dx = (t.clientX - side.ox) / r;
        let dy = (t.clientY - side.oy) / r;
        const mag = Math.hypot(dx, dy);
        if (mag > 1) { dx /= mag; dy /= mag; }
        side.x = dx;
        side.y = dy;
      }
      if (e.cancelable) e.preventDefault();
    };

    const end = (e) => {
      for (const t of e.changedTouches) {
        for (const side of [this.left, this.right]) {
          if (t.identifier !== side.id) continue;
          side.active = false;
          side.id = -1;
          side.x = 0;
          // O eixo vertical do manche esquerdo NÃO volta ao centro: é o
          // acelerador sem mola. Os outros três voltam.
          if (side !== this.left || !DCFG.input.touch.stickyThrottle) side.y = 0;
        }
      }
    };

    // `passive: false` é obrigatório: sem isso o Safari ignora o
    // preventDefault e o arrasto vira scroll da página.
    const opts = { passive: false };
    window.addEventListener('touchstart', start, opts);
    window.addEventListener('touchmove', move, opts);
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    this._handlers = { start, move, end };
  }

  reset() {
    this.leftEngaged = false;
    this.left.y = 1;   // manche embaixo = acelerador zero
    this.left.x = this.right.x = this.right.y = 0;
  }

  apply(s, dt) {
    const T = DCFG.input.touch;
    let used = false;

    if (this.leftEngaged) {
      const [x] = radialDeadzone(this.left.x, 0, T.deadzone);
      // Y da tela cresce para BAIXO; o acelerador cresce para cima.
      s.throttle = clamp((-this.left.y + 1) / 2, 0, 1);
      if (x) s.yaw += x;
      if (this.left.active) used = true;
    }

    if (this.right.active) {
      const [x, y] = radialDeadzone(this.right.x, this.right.y, T.deadzone);
      if (x) s.roll += x;
      if (y) s.pitch += -y;   // arrastar para cima = nariz para cima
      used = true;
    }

    if (used) s.source = 'touch';
  }

  dispose() {
    window.removeEventListener('touchstart', this._handlers.start);
    window.removeEventListener('touchmove', this._handlers.move);
    window.removeEventListener('touchend', this._handlers.end);
    window.removeEventListener('touchcancel', this._handlers.end);
  }
}
