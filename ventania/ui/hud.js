// HUD mínimo: bússola no topo, legenda de controles (H), FPS (F3), relógio
// discreto quando o tempo está acelerado, e menus (início / pausa com
// qualidade, volume e sensibilidade).

import { LANDMARKS } from '../world/layout.js';
import { QUALITY } from '../render/quality.js';

const CARDINALS = [
  ['N', 0], ['NE', 45], ['L', 90], ['SE', 135], ['S', 180], ['SO', 225], ['O', 270], ['NO', 315],
];

export class Hud {
  constructor(settings) {
    this.settings = settings;
    this.el = document.getElementById('hud');
    this.compass = document.getElementById('compass-strip');
    this.controls = document.getElementById('controls');
    this.fpsEl = document.getElementById('fps');
    this.clockEl = document.getElementById('clock');
    this.toastEl = document.getElementById('toast');
    this.showFps = false;
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this._buildCompass();
    this.setControlsVisible(settings.showControls);
  }

  _buildCompass() {
    // Uma faixa com 0..360 graus repetida 3 vezes (para rolar sem emenda).
    const strip = this.compass;
    strip.innerHTML = '';
    this.pxPerDeg = 2.4;
    for (let rep = -1; rep <= 1; rep++) {
      for (let d = 0; d < 360; d += 15) {
        const x = (d + rep * 360) * this.pxPerDeg;
        const card = CARDINALS.find((c) => c[1] === d);
        const el = document.createElement('div');
        el.className = card ? (card[0].length === 1 ? 'tick card main' : 'tick card') : 'tick';
        el.style.left = x + 'px';
        if (card) el.textContent = card[0];
        strip.appendChild(el);
      }
    }
    this.markers = LANDMARKS.map((l) => {
      const el = document.createElement('div');
      el.className = 'marker';
      el.textContent = l.icon;
      el.title = l.name;
      document.getElementById('compass').appendChild(el);
      return { ...l, el };
    });
  }

  /** heading: ângulo da direção da câmera (atan2(x, z) do vetor frente). */
  update(dt, heading, playerPos, clock, fast) {
    // Converte para graus de bússola: norte = -Z, leste = +X.
    const deg = ((180 - (heading * 180) / Math.PI) % 360 + 360) % 360;
    const w = this.compass.parentElement.clientWidth;
    this.compass.style.transform = `translateX(${w / 2 - deg * this.pxPerDeg}px)`;
    for (const m of this.markers) {
      const dx = m.x - playerPos.x, dz = m.z - playerPos.z;
      const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      let rel = bearing - deg;
      rel = ((rel + 540) % 360) - 180;
      const x = w / 2 + rel * this.pxPerDeg;
      const vis = Math.abs(rel) < (w / 2 / this.pxPerDeg) - 6;
      m.el.style.opacity = vis ? 1 : 0;
      m.el.style.transform = `translateX(${x}px)`;
    }

    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
      if (this.showFps && this.stats) {
        const s = this.stats();
        this.fpsEl.textContent = `${this.fps.toFixed(0)} fps · ${(1000 / this.fps).toFixed(1)} ms\n${s}`;
      }
    }
    this.clockEl.textContent = fast ? `⏩ ${clock}` : clock;
    this.clockEl.classList.toggle('show', fast);
  }

  toggleFps() {
    this.showFps = !this.showFps;
    this.fpsEl.classList.toggle('show', this.showFps);
  }

  setControlsVisible(v) {
    this.settings.showControls = v;
    this.controls.classList.toggle('hide', !v);
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('show'), 1600);
  }
}

/** Menus de início e pausa. */
export class Menu {
  constructor(settings, { onPlay, onQuality, onVolume, onSensitivity, onInvert }) {
    this.root = document.getElementById('menu');
    this.title = document.getElementById('menu-title');
    this.playBtn = document.getElementById('play');
    this.settings = settings;
    const qWrap = document.getElementById('quality');
    qWrap.innerHTML = '';
    for (const [k, q] of Object.entries(QUALITY)) {
      const b = document.createElement('button');
      b.textContent = q.label;
      b.dataset.q = k;
      b.onclick = (e) => {
        e.stopPropagation();
        onQuality(k);
        this.refresh();
      };
      qWrap.appendChild(b);
    }
    const vol = document.getElementById('volume');
    vol.value = settings.volume;
    vol.oninput = () => onVolume(parseFloat(vol.value));
    const sens = document.getElementById('sensitivity');
    sens.value = settings.sensitivity;
    sens.oninput = () => onSensitivity(parseFloat(sens.value));
    const inv = document.getElementById('invert');
    inv.checked = settings.invertY;
    inv.onchange = () => onInvert(inv.checked);
    this.playBtn.onclick = (e) => {
      e.stopPropagation();
      onPlay();
    };
    this.refresh();
  }

  refresh() {
    for (const b of document.querySelectorAll('#quality button')) {
      b.classList.toggle('active', b.dataset.q === this.settings.quality);
    }
  }

  show(paused) {
    this.root.classList.remove('hide');
    this.root.classList.toggle('paused', paused);
    this.playBtn.textContent = paused ? 'Continuar' : 'Começar';
  }

  hide() {
    this.root.classList.add('hide');
  }
}
