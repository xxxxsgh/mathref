import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Painel de debug (F3 ou crase).
 *
 * Mostra FPS, frame time, draw calls, triângulos e contagem de entidades — os
 * números que de fato dizem POR QUE o jogo está lento:
 *
 *  - draw calls altos  → falta instancing ou merge de geometria
 *  - triângulos altos  → falta LOD
 *  - frame time alto com os dois baixos → o gargalo é fill rate (resolução,
 *    overdraw de transparências) ou CPU (lógica de jogo, GC)
 *
 * Deliberadamente NÃO usamos `stats.js`: última publicação em 2016 e ele não
 * reporta draw calls. `renderer.info` já traz tudo, e é a fonte de verdade —
 * conta o que foi de fato desenhado, depois do frustum culling.
 *
 * O gráfico de frame time é o elemento mais útil do painel: a média esconde
 * stutter, e stutter é o que estraga a sensação de voo. Um pico isolado de
 * 40ms num gráfico de 120 amostras salta aos olhos; na média some.
 */
export class DebugPanel {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.visible = CONFIG.debug.startVisible;
    root.hidden = !this.visible;

    const rows = [
      ['fps', 'FPS'],
      ['ms', 'frame'],
      ['ms99', 'pior 1%'],
      ['SEP', ''],
      ['calls', 'draw calls'],
      ['tris', 'triângulos'],
      ['progs', 'shaders'],
      ['geos', 'geometrias'],
      ['texs', 'texturas'],
      ['SEP2', ''],
      ['entities', 'entidades'],
      ['tier', 'qualidade'],
      ['dpr', 'pixel ratio'],
      ['res', 'resolução'],
    ];

    let html = '<div class="debug-panel__title">DEBUG · F3</div>';
    for (const [key, label] of rows) {
      if (key.startsWith('SEP')) { html += '<div class="debug-panel__sep"></div>'; continue; }
      html += `<div class="debug-panel__row"><span>${label}</span><span id="dbg-${key}">—</span></div>`;
    }
    html += `<canvas class="debug-panel__graph" id="dbg-graph" width="${CONFIG.debug.graphSamples}" height="34"></canvas>`;
    root.innerHTML = html;

    this.el = {};
    for (const [key] of rows) {
      if (key.startsWith('SEP')) continue;
      this.el[key] = root.querySelector(`#dbg-${key}`);
    }

    this.canvas = root.querySelector('#dbg-graph');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.style.width = '100%';

    /** @type {number[]} janela circular de frame times */
    this.samples = new Array(CONFIG.debug.graphSamples).fill(16.7);
    this.cursor = 0;

    this._accum = 0;
    this._frames = 0;
    this._fps = 0;
    // Atualiza os textos a 8Hz. A 60Hz os números piscam demais pra ler, e
    // escrever no DOM 60x/s pra nada é justamente o tipo de custo que um
    // painel de performance não deveria introduzir.
    this._textTimer = 0;
    this._sizeTmp = new THREE.Vector2();
  }

  toggle() {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
  }

  /**
   * @param {number} dtMs frame time em ms
   * @param {import('../core/Renderer.js').Renderer} renderer
   * @param {import('../core/Quality.js').Quality} quality
   * @param {number} entityCount
   */
  update(dtMs, renderer, quality, entityCount) {
    this.samples[this.cursor] = dtMs;
    this.cursor = (this.cursor + 1) % this.samples.length;

    this._accum += dtMs;
    this._frames++;
    this._textTimer += dtMs;

    // Mesmo escondido continuamos amostrando: assim, ao abrir o painel, o
    // gráfico já mostra o histórico em vez de começar do zero.
    if (!this.visible) {
      if (this._textTimer >= 125) { this._flushFps(); }
      return;
    }
    if (this._textTimer < 125) return;
    this._flushFps();

    const info = renderer.info;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const avg = this._accumAvg;

    this._set('fps', Math.round(this._fps), this._fps < 30 ? 'bad' : this._fps < 50 ? 'warn' : '');
    this._set('ms', avg.toFixed(1), avg > 22 ? 'bad' : avg > 17.5 ? 'warn' : '');
    this._set('ms99', p99.toFixed(1), p99 > 33 ? 'bad' : p99 > 22 ? 'warn' : '');
    this._set('calls', info.render.calls, info.render.calls > 220 ? 'warn' : '');
    this._set('tris', formatNumber(info.render.triangles));
    this._set('progs', info.programs?.length ?? 0);
    this._set('geos', info.memory.geometries);
    this._set('texs', info.memory.textures);
    this._set('entities', entityCount);
    this._set('tier', `${quality.tier.name}${quality.auto ? '' : ' (fixo)'}`);
    this._set('dpr', renderer.gl.getPixelRatio().toFixed(2));

    // `getDrawingBufferSize` escreve num Vector2 de verdade (chama `.set()`),
    // não aceita um objeto simples com width/height.
    const size = renderer.gl.getDrawingBufferSize(this._sizeTmp);
    this._set('res', `${size.x}×${size.y}`);

    this._drawGraph();
  }

  _flushFps() {
    this._accumAvg = this._accum / Math.max(1, this._frames);
    this._fps = 1000 / this._accumAvg;
    this._accum = 0;
    this._frames = 0;
    this._textTimer = 0;
  }

  _set(key, value, cls = '') {
    const el = this.el[key];
    if (!el) return;
    const str = String(value);
    if (el.textContent !== str) el.textContent = str;
    el.className = cls ? `is-${cls}` : '';
  }

  _drawGraph() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Escala fixa em 33.3ms (=30fps). Escala automática esconderia justamente
    // a informação que importa: se o frame está dentro ou fora do orçamento.
    const scale = h / 33.3;

    // Linhas de referência: 60fps (16.7ms) e 30fps (33.3ms).
    ctx.strokeStyle = 'rgba(125,255,168,0.28)';
    ctx.beginPath();
    ctx.moveTo(0, h - 16.7 * scale);
    ctx.lineTo(w, h - 16.7 * scale);
    ctx.stroke();

    for (let i = 0; i < w; i++) {
      const s = this.samples[(this.cursor + i) % this.samples.length];
      const barH = Math.min(h, s * scale);
      ctx.fillStyle = s > 33.3 ? '#ff6b5e' : s > 17.5 ? '#ffb454' : 'rgba(125,232,255,0.75)';
      ctx.fillRect(i, h - barH, 1, barH);
    }
  }
}

function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
