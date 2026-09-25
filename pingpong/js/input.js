// Entrada: ponteiro (mouse/toque) com velocidade suavizada em unidades
// normalizadas de tela (−1..1), toques/cliques e teclado.
export class Input {
  constructor(el) {
    this.el = el;
    this.nx = 0; this.ny = -0.3;         // posição normalizada (y para cima)
    this.hist = [];                       // [t, nx, ny]
    this.down = false;
    this.pressed = false;                 // borda de descida (consumida)
    this.keys = new Set();
    this.moved = 0;                       // distância acumulada (tutorial)
    this.touch = false;
    this.aspect = 1;
    const mv = e => {
      const r = el.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      this.moved += Math.hypot(nx - this.nx, ny - this.ny);
      this.nx = nx; this.ny = ny;
      this.hist.push([performance.now(), nx, ny]);
      if (this.hist.length > 40) this.hist.shift();
    };
    el.addEventListener('pointermove', mv, { passive: true });
    el.addEventListener('pointerdown', e => {
      this.touch = e.pointerType === 'touch';
      mv(e); this.down = true; this.pressed = true;
      try { el.setPointerCapture(e.pointerId); } catch {}
    });
    const up = () => { this.down = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (e.code === 'Space') { this.pressed = true; e.preventDefault(); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    // teclado: setas movem o "ponteiro" (acessibilidade)
    this.kbVel = { x: 0, y: 0 };
  }
  consumePress() { const p = this.pressed; this.pressed = false; return p; }

  update(dt) {
    const k = this.keys;
    const ax = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const ay = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    if (ax || ay) {
      this.nx = Math.max(-1, Math.min(1, this.nx + ax * dt * 1.6));
      this.ny = Math.max(-1, Math.min(1, this.ny + ay * dt * 1.6));
      this.hist.push([performance.now(), this.nx, this.ny]);
      if (this.hist.length > 40) this.hist.shift();
    }
  }

  /** velocidade média nos últimos `win` ms (unidades normalizadas/s, y ajustado pelo aspecto) */
  velocity(win = 90) {
    const now = performance.now();
    const h = this.hist;
    let i = h.length - 1;
    if (i < 1) return { x: 0, y: 0 };
    while (i > 0 && now - h[i - 1][0] <= win) i--;
    const a = h[i], b = h[h.length - 1];
    const dt = Math.max(16, now - a[0]) / 1000;
    if (now - b[0] > 120) return { x: 0, y: 0 };
    // corrige para que movimento em pixels equivalha em x e y
    return { x: (b[1] - a[1]) / dt * this.aspect, y: (b[2] - a[2]) / dt };
  }
}
