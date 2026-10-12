// Atlas de letreiros (canvas → textura): néon do bar, placas pintadas do
// hangar, painéis de lojas, quadro de missões, telas de notícias. Cada
// entrada ocupa uma célula; `plane()` devolve um plano com UV na célula.
import * as THREE from 'three/webgpu';

const FONT = '"DejaVu Sans Condensed", "Arial Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif';

export class SignAtlas {
  constructor(cols = 4, rows = 16, cw = 512, ch = 128) {
    this.cols = cols; this.rows = rows; this.cw = cw; this.ch = ch;
    this.cv = document.createElement('canvas');
    this.cv.width = cols * cw; this.cv.height = rows * ch;
    this.g = this.cv.getContext('2d');
    this.g.clearRect(0, 0, this.cv.width, this.cv.height);
    this.next = 0;
    this.map = new Map();
    this.tex = null;
  }
  /** Reserva `span` células na mesma linha e desenha com draw(g, x, y, w, h). */
  add(name, draw, span = 1, rowsSpan = 1) {
    let c = this.next % this.cols, r = Math.floor(this.next / this.cols);
    if (c + span > this.cols) { r++; c = 0; }
    const x = c * this.cw, y = r * this.ch, w = span * this.cw, h = rowsSpan * this.ch;
    this.g.save(); this.g.beginPath(); this.g.rect(x, y, w, h); this.g.clip();
    draw(this.g, x, y, w, h);
    this.g.restore();
    this.map.set(name, { u0: x / this.cv.width, v0: 1 - (y + h) / this.cv.height, u1: (x + w) / this.cv.width, v1: 1 - y / this.cv.height, aspect: w / h });
    this.next = r * this.cols + c + span + (rowsSpan - 1) * this.cols;
    return this.map.get(name);
  }
  texture() {
    if (!this.tex) {
      this.tex = new THREE.CanvasTexture(this.cv);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.anisotropy = 8;
      this.tex.generateMipmaps = true;
      this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    }
    return this.tex;
  }
  /** Plano w×h (m) com a entrada `name`; normal +Z. */
  plane(name, w, h) {
    const e = this.map.get(name);
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, e.u0 + uv.getX(i) * (e.u1 - e.u0), e.v0 + uv.getY(i) * (e.v1 - e.v0));
    return g;
  }
}

// ─── desenhos ────────────────────────────────────────────────────────────
export function neonText(text, color, { px = 84, glow = 26, font = FONT, weight = 700, italic = false, tube = true } = {}) {
  return (g, x, y, w, h) => {
    g.font = `${italic ? 'italic ' : ''}${weight} ${px}px ${font}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = x + w / 2, cy = y + h / 2 + 2;
    g.shadowColor = color; g.shadowBlur = glow;
    g.strokeStyle = color; g.lineWidth = tube ? 7 : 3; g.lineJoin = 'round';
    g.strokeText(text, cx, cy);
    g.shadowBlur = glow * 0.5;
    g.strokeStyle = '#ffffff'; g.lineWidth = tube ? 2.2 : 1;
    g.strokeText(text, cx, cy);
  };
}

export function paintedText(text, { fg = '#e2a52a', bg = null, px = 90, weight = 800, stripes = false, align = 'center', font = FONT, stroke = null } = {}) {
  return (g, x, y, w, h) => {
    if (bg) { g.fillStyle = bg; g.fillRect(x + 4, y + 6, w - 8, h - 12); }
    if (stripes) {
      g.save(); g.beginPath(); g.rect(x + 4, y + 6, w - 8, h - 12); g.clip();
      g.fillStyle = '#121212';
      for (let i = -h; i < w; i += 52) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.lineTo(x + i + h + 26, y); g.lineTo(x + i + 26, y + h); g.fill(); }
      g.restore();
    }
    g.font = `${weight} ${px}px ${font}`;
    g.textAlign = align; g.textBaseline = 'middle';
    g.fillStyle = fg;
    const tx = align === 'center' ? x + w / 2 : x + 24;
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 6; g.strokeText(text, tx, y + h / 2 + 4); }
    g.fillText(text, tx, y + h / 2 + 4);
  };
}

/** Tela holográfica com cabeçalho e linhas (quadro de missões / notícias). */
export function screenPanel(title, lines, { accent = '#5fd0b8', bg = 'rgba(4,18,22,0.92)', px = 30 } = {}) {
  return (g, x, y, w, h) => {
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, 'rgba(95,208,184,0.10)'); grd.addColorStop(1, 'rgba(95,208,184,0.0)');
    g.fillStyle = grd; g.fillRect(x, y, w, h);
    g.strokeStyle = accent; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = accent; g.fillRect(x + 6, y + 6, w - 12, px * 1.7);
    g.font = `800 ${px * 1.05}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = '#04110f'; g.fillText(title, x + 20, y + 6 + px * 0.88);
    g.font = `600 ${px * 0.8}px ${FONT}`;
    let yy = y + px * 2.6 + 10;
    for (const ln of lines) {
      const [a, b, c] = Array.isArray(ln) ? ln : [ln];
      g.fillStyle = c || '#cfeee8';
      g.textAlign = 'left'; g.fillText(a, x + 22, yy);
      if (b) { g.textAlign = 'right'; g.fillStyle = '#f2d27a'; g.fillText(b, x + w - 22, yy); }
      g.strokeStyle = 'rgba(95,208,184,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + 18, yy + px * 0.62); g.lineTo(x + w - 18, yy + px * 0.62); g.stroke();
      yy += px * 1.25;
      if (yy > y + h - px) break;
    }
  };
}

/** Logotipo da Guilda (balança estilizada num hexágono). */
export function guildLogo(color = '#5fd0b8') {
  return (g, x, y, w, h) => {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.42;
    g.strokeStyle = color; g.lineWidth = r * 0.08; g.shadowColor = color; g.shadowBlur = 18;
    g.beginPath();
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.stroke();
    g.beginPath(); g.moveTo(cx, cy - r * 0.6); g.lineTo(cx, cy + r * 0.5); g.stroke();
    g.beginPath(); g.moveTo(cx - r * 0.55, cy - r * 0.3); g.lineTo(cx + r * 0.55, cy - r * 0.3); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * r * 0.55, cy + r * 0.05, r * 0.2, 0, Math.PI); g.stroke(); }
  };
}
