import { CONFIG } from '../config.js';

/**
 * Camada visual dos controles touch.
 *
 * O estado de input vive em `core/input/TouchSource.js`; aqui só há o
 * feedback visual e os botões. Separado assim porque o jogo tem que rodar
 * igual se essa UI for escondida (modo screenshot, gravação de vídeo).
 *
 * Detalhe crítico do iOS: os botões usam `pointerdown`/`pointerup`, e NÃO
 * `click`. `click` no Safari móvel tem ~300ms de atraso herdado do
 * double-tap-to-zoom, o que num botão de boost é a diferença entre desviar e
 * levar o tiro.
 */
export class TouchUI {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/input/TouchSource.js').TouchSource} source
   * @param {() => void} onToggleDebug
   */
  constructor(root, source, onToggleDebug) {
    this.root = root;
    this.source = source;

    root.innerHTML = `
      <div class="touch-stick" id="tstick"><div class="touch-stick__knob" id="tknob"></div></div>
      <div class="touch-throttle"><div class="touch-throttle__fill" id="tthrottle"></div></div>
      <div class="touch-btn touch-btn--fire"   data-touch-ui data-act="fire">FOGO</div>
      <div class="touch-btn touch-btn--boost"  data-touch-ui data-act="boost">BOOST</div>
      <div class="touch-btn touch-btn--brake"  data-touch-ui data-act="brake">FREIO</div>
      <div class="touch-btn touch-btn--rollL"  data-touch-ui data-act="barrelL">↺</div>
      <div class="touch-btn touch-btn--rollR"  data-touch-ui data-act="barrelR">↻</div>
      <div class="touch-btn touch-btn--debug"  data-touch-ui data-act="debug">DBG</div>
    `;
    root.classList.add('is-active');
    root.setAttribute('aria-hidden', 'false');

    this.stick = root.querySelector('#tstick');
    this.knob = root.querySelector('#tknob');
    this.throttleFill = root.querySelector('#tthrottle');

    for (const btn of root.querySelectorAll('[data-act]')) {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('is-down');
        if (act === 'debug') { onToggleDebug(); return; }
        source.setButton(act, true);
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('is-down');
        if (act === 'debug') return;
        source.setButton(act, false);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      // `pointercancel` dispara quando o navegador rouba o gesto (ex.: o
      // usuário arrasta o dedo pra fora). Sem tratar, o botão fica "preso".
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }

    this._stickVisible = false;
  }

  /** @param {import('../core/Input.js').ControlState} state */
  update(state) {
    const s = this.source.stick;
    if (s.active !== this._stickVisible) {
      this.stick.classList.toggle('is-active', s.active);
      this._stickVisible = s.active;
    }
    if (s.active) {
      this.stick.style.transform = `translate(${s.originX}px, ${s.originY}px)`;
      const r = CONFIG.input.touch.stickRadius * 0.62;
      this.knob.style.transform = `translate(${s.x * r}px, ${s.y * r}px)`;
    }
    this.throttleFill.style.transform = `scaleY(${state.throttle})`;
  }
}
