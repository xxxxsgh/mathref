/**
 * Contador de desempenho opcional (canto inferior direito): FPS, tempo de
 * frame (média / p90 do último ½ s), draw calls, triângulos, resolução
 * interna, qualidade (preset · degrau · camada) e escala do governador —
 * para o jogador reportar números.
 *
 * Liga com `?fps=show` (ou `?perf=1`), F7, ou `ctx.perf.show(true)` (a hud
 * pode pôr um interruptor nas configurações). A escolha fica salva em
 * localStorage 'ironline.perf'. Custo desprezível quando oculto.
 */
const KEY = 'ironline.perf';

export class PerfOverlay {
  constructor(ctx, { initial = false } = {}) {
    this.ctx = ctx;
    this.el = null;
    this.dts = [];
    this.acc = 0;
    let saved = false;
    try {
      saved = localStorage.getItem(KEY) === '1';
    } catch {
      /* armazenamento bloqueado */
    }
    this.visible = false;
    if (initial || saved) this.show(true, false);
    addEventListener('keydown', (e) => {
      if (e.code === 'F7') {
        e.preventDefault();
        this.show(!this.visible);
      }
    });
  }

  /** Mostra/oculta (persist: salva a escolha). */
  show(on = true, persist = true) {
    this.visible = !!on;
    if (this.visible && !this.el) {
      const el = document.createElement('div');
      el.id = 'perf-overlay';
      el.style.cssText = 'position:fixed;bottom:40px;right:6px;z-index:9;pointer-events:none;font:600 11px/1.35 ui-monospace,Menlo,Consolas,monospace;'
        + 'color:#e8ffe0;background:rgba(0,0,0,.55);padding:5px 8px;border-radius:3px;white-space:pre;text-shadow:0 1px 0 #000';
      document.body.appendChild(el);
      this.el = el;
    }
    if (this.el) this.el.style.display = this.visible ? 'block' : 'none';
    if (persist) {
      try {
        localStorage.setItem(KEY, this.visible ? '1' : '0');
      } catch {
        /* ignora */
      }
    }
    this.ctx.bus?.emit('perf:overlay', this.visible);
    return this.visible;
  }

  /** Chamado a cada frame com o dt real (s). */
  sample(dt) {
    if (!this.visible || !(dt > 0)) return;
    this.dts.push(dt * 1000);
    this.acc += dt;
    if (this.acc < 0.5) return;
    const s = this.dts.slice().sort((a, b) => a - b);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const p90 = s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
    this.dts.length = 0;
    this.acc = 0;
    const { renderer, quality, governor } = this.ctx;
    const info = renderer.info.render;
    const c = renderer.domElement;
    const q = quality;
    const tris = info.triangles >= 1e6 ? `${(info.triangles / 1e6).toFixed(2)}M` : `${Math.round(info.triangles / 1e3)}k`;
    this.el.textContent = `${(1000 / mean).toFixed(0)} fps  ${mean.toFixed(1)} ms  p90 ${p90.toFixed(1)}\n`
      + `${info.calls} draws  ${tris} tris\n`
      + `${c.width}×${c.height}  esc ${(governor?.scale ?? 1).toFixed(2)}×${(q.renderScale ?? 1).toFixed(2)}\n`
      + `${q.mode === 'auto' ? `auto ${q.rung}` : q.level} · ${q.tier || 'desktop'}`;
  }
}
