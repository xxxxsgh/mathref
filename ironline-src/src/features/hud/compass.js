/**
 * Bússola de faixa (topo da tela): marcas a cada 5°, números a cada 15°,
 * pontos cardeais/colaterais em destaque, rumo atual sob o centro e pings
 * vermelhos de inimigos que dispararam recentemente.
 *
 * Convenção: rumo 0 = norte = -Z do mundo; 90 = leste = +X.
 */
import { drawText } from './font.js';

const W = 700, H = 70;
const SPAN = 80; // graus visíveis para cada lado
const CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

export const headingOf = (yaw) => (((-yaw * 180) / Math.PI) % 360 + 360) % 360;
export const bearing = (dx, dz) => (((Math.atan2(dx, -dz) * 180) / Math.PI) % 360 + 360) % 360;
const wrap = (a) => ((a + 540) % 360) - 180;

export class Compass {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'compass sh';
    this.cv = document.createElement('canvas');
    this.el.appendChild(this.cv);
    parent.appendChild(this.el);
    this.g = this.cv.getContext('2d');
    this.k = 0;
    this.last = '';
  }
  resize(k) {
    this.k = k;
    this.cv.width = Math.round(W * k);
    this.cv.height = Math.round(H * k);
    this.last = '';
  }
  /** pings: [{ bearing, a (0..1) }]; markers: [{ bearing, color, shape }] */
  draw(heading, pings = []) {
    const key = heading.toFixed(1) + '|' + pings.map((p) => p.bearing.toFixed(0) + p.a.toFixed(2)).join(',');
    if (key === this.last) return;
    this.last = key;
    const g = this.g, k = this.k;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, W, H);
    const ppd = W / 2 / SPAN;
    const cx = W / 2;
    const fade = (x) => {
      const t = Math.abs(x - cx) / (W / 2);
      return Math.max(0, Math.min(1, (1 - t) / 0.28));
    };
    // sombra suave atrás das marcas (legibilidade sobre céu claro)
    const sg = g.createLinearGradient(0, 0, W, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(0.2, 'rgba(0,0,0,.3)');
    sg.addColorStop(0.8, 'rgba(0,0,0,.3)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.fillRect(0, 2, W, 38);

    const start = Math.ceil((heading - SPAN) / 5) * 5;
    for (let d = start; d <= heading + SPAN; d += 5) {
      const deg = ((d % 360) + 360) % 360;
      const x = cx + (d - heading) * ppd;
      const a = fade(x);
      if (a <= 0) continue;
      const major = deg % 15 === 0;
      const card = CARD[deg];
      g.globalAlpha = a * (major ? 0.95 : 0.55);
      g.fillStyle = '#f2f4ef';
      const th = card ? 10 : major ? 7 : 4;
      g.fillRect(Math.round(x) - 1, 34 - th, 2, th);
      g.globalAlpha = a;
      if (card) {
        drawText(g, card, x, 7, { size: card.length === 1 ? 15 : 12, weight: card.length === 1 ? 1.75 : 1.5, align: 'center', color: deg === 0 ? '#ffb22e' : '#f2f4ef' });
      } else if (major) {
        g.globalAlpha = a * 0.6;
        drawText(g, String(deg), x, 10, { size: 11, weight: 1.4, tracking: 1.4, align: 'center', color: '#f2f4ef' });
      }
    }
    // linha de base
    g.globalAlpha = 1;
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(242,244,239,0)');
    lg.addColorStop(0.25, 'rgba(242,244,239,.45)');
    lg.addColorStop(0.75, 'rgba(242,244,239,.45)');
    lg.addColorStop(1, 'rgba(242,244,239,0)');
    g.fillStyle = lg;
    g.fillRect(0, 34, W, 1);

    // pings de inimigos
    for (const p of pings) {
      const off = wrap(p.bearing - heading);
      if (Math.abs(off) > SPAN) continue;
      const x = cx + off * ppd;
      g.globalAlpha = Math.min(1, p.a * 1.4) * fade(x);
      g.fillStyle = '#ff3d33';
      g.beginPath();
      g.moveTo(x, 26);
      g.lineTo(x + 5.5, 33);
      g.lineTo(x, 40);
      g.lineTo(x - 5.5, 33);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    // marcador central + rumo
    g.fillStyle = '#ffb22e';
    g.beginPath();
    g.moveTo(cx - 6, 39);
    g.lineTo(cx + 6, 39);
    g.lineTo(cx, 45);
    g.closePath();
    g.fill();
    const hd = String(Math.round(heading) % 360).padStart(3, '0');
    g.fillStyle = 'rgba(8,10,12,.78)';
    g.fillRect(cx - 24, 47, 48, 21);
    g.fillStyle = 'rgba(255,178,46,.9)';
    g.fillRect(cx - 24, 47, 48, 1.5);
    drawText(g, hd, cx, 52, { size: 12, weight: 1.4, tracking: 1.4, align: 'center', color: '#f2f4ef', heavy: true });
  }
}
