/**
 * Sticks virtuais pro iPad. Não é fallback: no alvo principal do projeto este
 * é o esquema de controle primário.
 *
 * O stick nasce ONDE o dedo encostou, em vez de num lugar fixo na tela. Num
 * controle fixo o jogador precisa olhar pra baixo pra achar o stick; nascendo
 * sob o dedo, ele encosta em qualquer lugar da metade certa e já está pilotando.
 */
const STICK_RADIUS = 62; // px de deslocamento pra saturar o eixo

export class TouchSource {
  constructor(container) {
    this.active = false;
    this.enabled = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

    this.left = null; // { id, ox, oy, x, y }
    this.right = null;

    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.className = this.enabled ? '' : 'hidden';
    this.root.innerHTML = `
      <div class="stick" data-side="left"><i></i></div>
      <div class="stick" data-side="right"><i></i></div>
      <div id="touch-buttons">
        <button type="button" data-action="toggleMode">MODO</button>
        <button type="button" data-action="restart">RE</button>
        <button type="button" data-action="map">MAPA</button>
        <button type="button" data-action="pause">❚❚</button>
      </div>`;
    container.appendChild(this.root);

    this.els = {
      left: this.root.querySelector('[data-side="left"]'),
      right: this.root.querySelector('[data-side="right"]'),
    };

    this._pending = new Set();
    this.root.querySelectorAll('#touch-buttons button').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._pending.add(btn.dataset.action);
        this.active = true;
      });
    });

    if (this.enabled) this._bind();
  }

  _bind() {
    const onDown = (e) => {
      if (e.target.closest('#touch-buttons')) return;
      // Um dedo por metade da tela. O segundo toque na mesma metade é ignorado
      // em vez de sequestrar o stick que já está sendo usado.
      const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
      if (this[side]) return;
      this[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      this.active = true;
      this._draw(side);
      e.preventDefault();
    };

    const onMove = (e) => {
      for (const side of ['left', 'right']) {
        const s = this[side];
        if (!s || s.id !== e.pointerId) continue;
        s.x = Math.max(-1, Math.min(1, (e.clientX - s.ox) / STICK_RADIUS));
        s.y = Math.max(-1, Math.min(1, (e.clientY - s.oy) / STICK_RADIUS));
        this._draw(side);
        e.preventDefault();
      }
    };

    const onUp = (e) => {
      for (const side of ['left', 'right']) {
        if (this[side]?.id === e.pointerId) {
          this[side] = null;
          this.els[side].classList.remove('on');
        }
      }
    };

    const opts = { passive: false };
    this.root.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointermove', onMove, opts);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  _draw(side) {
    const s = this[side];
    const el = this.els[side];
    if (!s) return;
    el.classList.add('on');
    el.style.left = `${s.ox}px`;
    el.style.top = `${s.oy}px`;
    el.firstElementChild.style.transform = `translate(${s.x * STICK_RADIUS}px, ${s.y * STICK_RADIUS}px)`;
  }

  sample(state) {
    for (const action of this._pending) state.actions.add(action);
    this._pending.clear();
    if (!this.enabled) return;

    if (this.left) {
      state.yaw = this.left.x;
      state.throttleAxis = -this.left.y;
      state.throttleFromStick = true;
    }
    if (this.right) {
      state.roll = this.right.x;
      state.pitch = -this.right.y;
    }
  }
}
