import { CONFIG } from '../../config.js';
import { radialDeadzone, applyExpo, clamp } from '../MathUtils.js';

/**
 * Touch (iPad / celular).
 *
 * Duas decisões que definem se o jogo é bom ou apenas jogável no iPad:
 *
 * 1. MANCHE FLUTUANTE. O joystick nasce onde o dedo encosta na metade esquerda
 *    da tela, em vez de ficar fixo num canto. Num tablet você não olha pro
 *    polegar; se o manche é fixo, você passa o jogo inteiro procurando ele.
 *
 * 2. `touch-action: none` no CSS + `preventDefault`. Sem isso o Safari
 *    interpreta o arrasto como scroll/zoom e o controle simplesmente não
 *    funciona. É o erro nº1 de jogo web em iPad.
 *
 * A UI visual dos controles vive em ui/TouchUI.js. Aqui só há estado de input.
 */
export class TouchSource {
  constructor() {
    /** Manche esquerdo: pitch/yaw. */
    this.stick = { active: false, id: -1, originX: 0, originY: 0, x: 0, y: 0 };
    /** Slider direito de acelerador (arrasto vertical na área do acelerador). */
    this.throttleDrag = { active: false, id: -1, startY: 0, startValue: 0 };
    /** Botões virtuais: preenchidos pelo TouchUI via `setButton`. */
    this.buttons = { boost: false, brake: false, rollL: false, rollR: false };
    /** Borda de subida dos botões de manobra. */
    this.pendingBarrel = 0;

    this._onStart = (e) => {
      for (const t of e.changedTouches) {
        // Toque que começa sobre um elemento de UI (botão) é tratado lá.
        if (t.target instanceof Element && t.target.closest('[data-touch-ui]')) continue;

        const leftHalf = t.clientX < window.innerWidth * 0.5;
        if (leftHalf && !this.stick.active) {
          this.stick.active = true;
          this.stick.id = t.identifier;
          this.stick.originX = t.clientX;
          this.stick.originY = t.clientY;
          this.stick.x = 0;
          this.stick.y = 0;
        } else if (!leftHalf && !this.throttleDrag.active) {
          this.throttleDrag.active = true;
          this.throttleDrag.id = t.identifier;
          this.throttleDrag.startY = t.clientY;
          this.throttleDrag.startValue = this._throttleRef;
        }
      }
      if (e.cancelable) e.preventDefault();
    };

    this._onMove = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick.active && t.identifier === this.stick.id) {
          const r = CONFIG.input.touch.stickRadius;
          let dx = (t.clientX - this.stick.originX) / r;
          let dy = (t.clientY - this.stick.originY) / r;
          const mag = Math.hypot(dx, dy);
          if (mag > 1) { dx /= mag; dy /= mag; }
          this.stick.x = dx;
          this.stick.y = dy;
        } else if (this.throttleDrag.active && t.identifier === this.throttleDrag.id) {
          // Arrastar pra CIMA aumenta: daí o sinal negativo.
          const delta = -(t.clientY - this.throttleDrag.startY) / 180;
          this._throttleTarget = clamp(this.throttleDrag.startValue + delta, 0, 1);
        }
      }
      if (e.cancelable) e.preventDefault();
    };

    this._onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick.active = false;
          this.stick.id = -1;
          this.stick.x = 0;
          this.stick.y = 0;
        }
        if (t.identifier === this.throttleDrag.id) {
          this.throttleDrag.active = false;
          this.throttleDrag.id = -1;
        }
      }
    };

    this._throttleRef = CONFIG.flight.throttleInitial;
    this._throttleTarget = null;

    // `passive: false` é obrigatório: sem isso o navegador ignora o
    // preventDefault e o gesto vira scroll.
    const opts = { passive: false };
    window.addEventListener('touchstart', this._onStart, opts);
    window.addEventListener('touchmove', this._onMove, opts);
    window.addEventListener('touchend', this._onEnd);
    window.addEventListener('touchcancel', this._onEnd);
  }

  /** Chamado pelo TouchUI quando um botão virtual muda de estado. */
  setButton(name, down) {
    if (name === 'barrelL') { if (down) this.pendingBarrel = -1; return; }
    if (name === 'barrelR') { if (down) this.pendingBarrel = 1; return; }
    this.buttons[name] = down;
  }

  /** @param {import('../Input.js').ControlState} s */
  apply(s, dt) {
    const T = CONFIG.input.touch;
    let active = false;

    if (this.stick.active) {
      const [dx, dy] = radialDeadzone(this.stick.x, this.stick.y, T.stickDeadzone);
      if (dx || dy) {
        active = true;
        s.yaw += applyExpo(dx, T.expo);
        // Arrastar pra cima na tela = puxar o manche = nariz sobe.
        s.pitch += applyExpo(-dy, T.expo);
      }
    }

    if (this._throttleTarget !== null) {
      s.throttle = this._throttleTarget;
      active = true;
    }
    // Guarda o acelerador atual pra que o próximo arrasto comece daqui em vez
    // de saltar (o arrasto é relativo, não absoluto).
    this._throttleRef = s.throttle;

    if (this.buttons.boost) { s.boost = true; active = true; }
    if (this.buttons.brake) { s.brake = true; active = true; }
    if (this.buttons.rollL) { s.roll -= 1; active = true; }
    if (this.buttons.rollR) { s.roll += 1; active = true; }

    if (this.pendingBarrel !== 0) {
      s.barrelRoll = this.pendingBarrel;
      this.pendingBarrel = 0;
      active = true;
    }

    if (active) s.source = 'touch';
  }

  dispose() {
    window.removeEventListener('touchstart', this._onStart);
    window.removeEventListener('touchmove', this._onMove);
    window.removeEventListener('touchend', this._onEnd);
    window.removeEventListener('touchcancel', this._onEnd);
  }
}
