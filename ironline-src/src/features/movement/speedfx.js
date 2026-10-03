/**
 * Borrão de velocidade nas bordas da tela (sprint tático, slide, mergulho).
 *
 * Três camadas DOM sob o HUD com `backdrop-filter: blur()` e máscaras
 * radiais concêntricas: o raio de nitidez diminui e o borrão cresce em
 * direção às bordas — aproxima o perfil do motion blur de uma câmera
 * avançando (fluxo óptico ∝ distância ao centro), sem riscos/"speed lines"
 * de desenho animado. Mais um escurecimento leve de borda (o olho foca o
 * centro). Complementa o motion blur do compositor (que depende do movimento
 * da câmera entre frames) e funciona também em capturas estáticas. Custo
 * zero quando parado (display: none).
 */
const LAYERS = [
  // [raio interno da máscara (%), raio externo (%), borrão máx. (px)]
  [40, 70, 1.6],
  [55, 88, 3.4],
  [70, 105, 5.5],
];

export class SpeedFx {
  constructor(ctx) {
    this.ctx = ctx;
    this.k = 0;
    this.layers = [];
    const ui = ctx.ui;
    for (const [a, b, px] of LAYERS) {
      const el = document.createElement('div');
      el.className = 'mv-speedfx';
      const mask = `radial-gradient(ellipse 62% 64% at 50% 60%, transparent ${a}%, #000 ${b}%)`;
      Object.assign(el.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        display: 'none',
        zIndex: '0',
        webkitMaskImage: mask,
        maskImage: mask,
      });
      this.layers.push({ el, px, f: '' });
    }
    const vig = (this.vig = document.createElement('div'));
    Object.assign(vig.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '0',
      background: 'radial-gradient(ellipse 78% 72% at 50% 52%, rgba(0,0,0,0) 58%, rgba(10,9,8,0.42) 100%)',
    });
    if (ui) {
      ui.insertBefore(vig, ui.firstChild);
      for (let i = this.layers.length - 1; i >= 0; i--) ui.insertBefore(this.layers[i].el, ui.firstChild);
    }
  }

  /** k ∈ [0,1]: intensidade alvo. */
  update(dt, target) {
    const rate = target > this.k ? 5 : 7;
    this.k += (target - this.k) * (1 - Math.exp(-rate * dt));
    const on = this.k >= 0.02;
    const disp = on ? 'block' : 'none';
    if (this.vig.style.display !== disp) {
      this.vig.style.display = disp;
      for (const L of this.layers) L.el.style.display = disp;
    }
    if (!on) return;
    for (const L of this.layers) {
      const f = `blur(${(this.k * L.px).toFixed(2)}px)`;
      if (L.f !== f) {
        L.f = f;
        L.el.style.backdropFilter = f;
        L.el.style.webkitBackdropFilter = f;
      }
    }
    this.vig.style.opacity = (this.k * 0.7).toFixed(3);
  }

  dispose() {
    for (const L of this.layers) L.el.remove();
    this.vig.remove();
  }
}
