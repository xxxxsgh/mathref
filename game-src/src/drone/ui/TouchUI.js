import { DCFG } from '../config.js';

/**
 * Camada visual dos manches touch.
 *
 * O estado vive em `core/DroneInput.js`; aqui só existe o desenho e os
 * botões. A separação é a mesma do jogo de nave, e pelo mesmo motivo: o jogo
 * tem que rodar igual com esta camada escondida (gravação de vídeo,
 * captura de tela).
 *
 * Detalhe crítico no iOS: os botões usam `pointerdown`/`pointerup` e NÃO
 * `click`. O `click` no Safari móvel herda ~300 ms de atraso do
 * double-tap-to-zoom — num botão de armar, isso é a diferença entre decolar
 * e cair.
 */
export class TouchUI {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/DroneInput.js').DroneInput} input
   * @param {(action: string) => void} onAction
   */
  constructor(root, input, onAction) {
    this.root = root;
    this.source = input.touch;

    root.innerHTML = `
      <div class="tstick" id="tleft"><div class="tstick__knob" id="tleftk"></div>
        <div class="tstick__label">ACEL / GIRO</div></div>
      <div class="tstick" id="tright"><div class="tstick__knob" id="trightk"></div>
        <div class="tstick__label">INCL / ROLA</div></div>
      <div class="tbtn tbtn--arm"  data-touch-ui data-act="arm">ARMAR</div>
      <div class="tbtn tbtn--mode" data-touch-ui data-act="mode">MODO</div>
      <div class="tbtn tbtn--cam"  data-touch-ui data-act="camera">VISTA</div>
      <div class="tbtn tbtn--rth"  data-touch-ui data-act="rth">RTH</div>
      <div class="tbtn tbtn--pause" data-touch-ui data-act="pause">❚❚</div>
    `;
    root.classList.add('is-active');
    root.setAttribute('aria-hidden', 'false');

    this.left = root.querySelector('#tleft');
    this.leftKnob = root.querySelector('#tleftk');
    this.right = root.querySelector('#tright');
    this.rightKnob = root.querySelector('#trightk');
    this.armBtn = root.querySelector('.tbtn--arm');

    for (const btn of root.querySelectorAll('[data-act]')) {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('is-down');
        onAction(act);
      };
      const up = (e) => { e.preventDefault(); btn.classList.remove('is-down'); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      // `pointercancel` dispara quando o navegador rouba o gesto; sem tratar,
      // o botão fica preso no estado apertado.
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }

    this._visible = [false, false];
  }

  /** @param {import('../physics/Quad.js').Quad} quad */
  update(quad) {
    const r = DCFG.input.touch.stickRadius * 0.62;
    const pairs = [
      [this.source.left, this.left, this.leftKnob, 0],
      [this.source.right, this.right, this.rightKnob, 1],
    ];
    for (const [src, el, knob, i] of pairs) {
      // O manche esquerdo continua visível depois de solto: ele mostra ONDE
      // O ACELERADOR FICOU, que é informação, não resíduo de interface.
      const show = src.active || (i === 0 && this.source.leftEngaged);
      if (show !== this._visible[i]) {
        el.classList.toggle('is-active', show);
        this._visible[i] = show;
      }
      if (!show) continue;
      el.style.transform = `translate(${src.ox}px, ${src.oy}px)`;
      knob.style.transform = `translate(${src.x * r}px, ${src.y * r}px)`;
    }

    this.armBtn.textContent = quad.armed ? 'DESARMAR' : 'ARMAR';
    this.armBtn.classList.toggle('is-armed', quad.armed);
  }
}
