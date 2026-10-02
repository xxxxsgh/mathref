/**
 * Borrão de velocidade nas bordas da tela (sprint tático, slide, mergulho).
 *
 * Camada DOM sob o HUD com `backdrop-filter: blur()` e máscara radial: o
 * centro fica nítido (onde se mira) e as bordas — onde o fluxo óptico é
 * maior — borram, mais um leve escurecimento. Complementa o motion blur do
 * compositor (que depende do movimento da câmera entre frames) e funciona
 * também em capturas estáticas. Custo zero quando parado (display: none).
 */
export class SpeedFx {
  constructor(ctx) {
    this.ctx = ctx;
    this.k = 0;
    const el = (this.el = document.createElement('div'));
    el.className = 'mv-speedfx';
    const mask = 'radial-gradient(ellipse 62% 58% at 50% 54%, transparent 0%, transparent 52%, rgba(0,0,0,0.55) 74%, #000 100%)';
    Object.assign(el.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '0',
      webkitMaskImage: mask,
      maskImage: mask,
    });
    const vig = (this.vig = document.createElement('div'));
    Object.assign(vig.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '0',
      background: 'radial-gradient(ellipse 75% 70% at 50% 52%, rgba(0,0,0,0) 55%, rgba(8,7,6,0.55) 100%)',
    });
    const ui = ctx.ui;
    if (ui) {
      ui.insertBefore(vig, ui.firstChild);
      ui.insertBefore(el, ui.firstChild);
    }
  }

  /** k ∈ [0,1]: intensidade alvo. */
  update(dt, target) {
    const rate = target > this.k ? 5 : 7;
    this.k += (target - this.k) * (1 - Math.exp(-rate * dt));
    if (this.k < 0.02) {
      if (this.el.style.display !== 'none') this.el.style.display = this.vig.style.display = 'none';
      return;
    }
    const px = (this.k * 3.2).toFixed(2);
    const f = `blur(${px}px)`;
    this.el.style.display = this.vig.style.display = 'block';
    if (this.el.style.backdropFilter !== f) {
      this.el.style.backdropFilter = f;
      this.el.style.webkitBackdropFilter = f;
    }
    this.vig.style.opacity = (this.k * 0.75).toFixed(3);
  }

  dispose() {
    this.el.remove();
    this.vig.remove();
  }
}
