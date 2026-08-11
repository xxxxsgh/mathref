/**
 * Painel de telemetria (F3).
 *
 * Não é um clone do painel de debug do jogo de nave: além de FPS e draw
 * calls, ele mostra o que só faz sentido num drone — o empuxo de cada motor
 * e o quanto o mixer está saturando. Quando o drone "não obedece" numa curva
 * agressiva, a explicação está sempre ali: dois motores em 1,00 e dois em
 * 0,00, ou seja, não sobrou autoridade nenhuma para o comando.
 *
 * Os textos são atualizados a 8 Hz e não a 60. A 60 Hz os números piscam
 * demais para serem lidos, e escrever no DOM 60 vezes por segundo é
 * exatamente o custo que um painel de performance não deveria introduzir.
 */
export class Telemetry {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.visible = false;
    root.hidden = true;

    const rows = [
      ['fps', 'FPS'], ['ms', 'frame ms'], ['calls', 'draw calls'],
      ['tris', 'triângulos'], ['dpr', 'pixel ratio'], ['parts', 'partículas'],
      ['motors', 'motores'], ['thrust', 'empuxo'], ['tilt', 'inclinação'],
      ['agl', 'altura'], ['amps', 'corrente'],
    ];
    root.innerHTML = rows.map(([k, label]) =>
      `<div class="debug-panel__row"><span>${label}</span><span id="tlm-${k}">—</span></div>`,
    ).join('');

    this.el = {};
    for (const [k] of rows) this.el[k] = root.querySelector(`#tlm-${k}`);

    this._frames = 0;
    this._accum = 0;
    this._timer = 0;
    this._fps = 0;
  }

  toggle() {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
  }

  update(frameMs, renderer, quad, particles, dt) {
    this._frames++;
    this._accum += frameMs;
    this._timer += dt;
    if (!this.visible || this._timer < 0.125) return;

    this._fps = this._frames / (this._accum / 1000);
    const info = renderer.info;
    const m = quad.motorThrust;
    const thrust = (m[0] + m[1] + m[2] + m[3]) / 4;

    this.el.fps.textContent = this._fps.toFixed(0);
    this.el.ms.textContent = (this._accum / this._frames).toFixed(1);
    this.el.calls.textContent = String(info.render.calls);
    this.el.tris.textContent = info.render.triangles.toLocaleString('pt-BR');
    this.el.dpr.textContent = renderer.getPixelRatio().toFixed(2);
    this.el.parts.textContent = String(particles);
    this.el.motors.textContent = m.map((v) => v.toFixed(2)).join(' ');
    this.el.thrust.textContent = `${(thrust * 100).toFixed(0)}%`;
    this.el.tilt.textContent = `${(quad.tiltAngle * 180 / Math.PI).toFixed(0)}°`;
    this.el.agl.textContent = `${quad.altitudeAGL.toFixed(1)} m`;
    this.el.amps.textContent = `${quad.current.toFixed(0)} A`;

    this._frames = 0;
    this._accum = 0;
    this._timer = 0;
  }
}
