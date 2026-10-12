// Utilitários de desenho 2D da HUD (canvas): camadas com DPR, texto com
// espaçamento, filetes com brilho, cantos de colchete, arcos segmentados.
// Tudo pensado para parecer projeção holográfica: traço fino nítido + halo
// suave (shadowBlur) só onde importa, alfa baixo nos elementos secundários.
import { PAL } from './style.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Canvas em tela cheia com DPR controlado (redimensiona sozinho). */
export class Layer {
  constructor(parent, { dprCap = 2, className = 'layer', z = 0 } = {}) {
    this.cv = document.createElement('canvas');
    this.cv.className = className;
    this.cv.style.zIndex = z;
    parent.appendChild(this.cv);
    this.g = this.cv.getContext('2d');
    this.dprCap = dprCap;
    this.W = 0; this.H = 0; this.dpr = 1;
    this.hasSpacing = 'letterSpacing' in this.g;
  }
  fit() {
    const dpr = Math.min(devicePixelRatio || 1, this.dprCap);
    const W = innerWidth, H = innerHeight;
    if (W !== this.W || H !== this.H || dpr !== this.dpr) {
      this.W = W; this.H = H; this.dpr = dpr;
      this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    return g;
  }
  clear() { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.cv.width, this.cv.height); }
  set visible(v) { this.cv.style.display = v ? 'block' : 'none'; }
}

export function font(size, weight = 600, display = false) {
  return `${weight} ${size}px ${display ? PAL.fontD : PAL.font}`;
}

/** Texto com espaçamento entre letras (usa letterSpacing nativo quando existe). */
export function text(g, str, x, y, { size = 11, weight = 600, color = PAL.c, align = 'left', base = 'alphabetic', track = 0, display = false, alpha = 1 } = {}) {
  str = String(str);
  g.font = font(size, weight, display);
  g.fillStyle = color;
  g.textBaseline = base;
  const ga = g.globalAlpha; if (alpha !== 1) g.globalAlpha = ga * alpha;
  const sp = track * size;
  if (!sp) { g.textAlign = align; g.fillText(str, x, y); }
  else if ('letterSpacing' in g) {
    g.letterSpacing = `${sp}px`;
    g.textAlign = align;
    // o espaçamento nativo também entra depois da última letra: compensa
    const dx = align === 'center' ? sp / 2 : align === 'right' ? sp : 0;
    g.fillText(str, x + dx, y);
    g.letterSpacing = '0px';
  } else {
    let w = 0; for (const ch of str) w += g.measureText(ch).width + sp; w -= sp;
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left';
    for (const ch of str) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; }
  }
  if (alpha !== 1) g.globalAlpha = ga;
}
export function textWidth(g, str, size, weight = 600, track = 0, display = false) {
  g.font = font(size, weight, display);
  return g.measureText(String(str)).width + track * size * Math.max(0, String(str).length - 1);
}

export function glow(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur; }
export function noGlow(g) { g.shadowBlur = 0; g.shadowColor = 'transparent'; }

/** Colchetes de canto (caixa de alvo). s = meia largura, h = meia altura, k = comprimento do canto. */
export function brackets(g, x, y, s, h, k) {
  g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    g.moveTo(x + sx * s, y + sy * (h - k));
    g.lineTo(x + sx * s, y + sy * h);
    g.lineTo(x + sx * (s - k), y + sy * h);
  }
  g.stroke();
}

/** Losango. */
export function diamond(g, x, y, r, fill = false) {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
  if (fill) g.fill(); else g.stroke();
}
export function hexagon(g, x, y, r, fill = false, rot = 0) {
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath();
  if (fill) g.fill(); else g.stroke();
}
export function circle(g, x, y, r, fill = false) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) g.fill(); else g.stroke(); }
export function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
export function chevron(g, x, y, r, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u, v) => [x + c * u - s * v, y + s * u + c * v];
  g.beginPath();
  const a = P(-r * 0.6, -r * 0.8), b = P(r * 0.5, 0), d = P(-r * 0.6, r * 0.8);
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]);
  g.stroke();
}
export function triangle(g, x, y, r, ang, fill = true) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u, v) => [x + c * u - s * v, y + s * u + c * v];
  const a = P(r, 0), b = P(-r * 0.7, -r * 0.7), d = P(-r * 0.7, r * 0.7);
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]); g.closePath();
  if (fill) g.fill(); else g.stroke();
}

/** Arco segmentado (gauge): de a0 a a1, preenche fração f com n segmentos. */
export function segArc(g, x, y, r, a0, a1, f, { n = 24, gap = 0.012, w = 4, on = PAL.c, off = 'rgba(166,236,255,0.14)', glowOn = 0 } = {}) {
  const span = (a1 - a0) / n;
  g.lineWidth = w; g.lineCap = 'butt';
  const lit = Math.round(clamp(f, 0, 1) * n);
  for (let i = 0; i < n; i++) {
    const s = a0 + i * span + gap, e = a0 + (i + 1) * span - gap;
    const isOn = i < lit;
    g.strokeStyle = isOn ? (typeof on === 'function' ? on(i / n) : on) : off;
    if (isOn && glowOn) glow(g, g.strokeStyle, glowOn); else noGlow(g);
    g.beginPath(); g.arc(x, y, r, Math.min(s, e), Math.max(s, e), false); g.stroke();
  }
  noGlow(g);
}

/** Barra horizontal segmentada. */
export function segBar(g, x, y, w, h, f, { n = 20, gap = 2, on = PAL.c, off = 'rgba(166,236,255,0.13)', glowOn = 0, fromRight = false } = {}) {
  const sw = (w - gap * (n - 1)) / n;
  const lit = clamp(f, 0, 1) * n;
  for (let i = 0; i < n; i++) {
    const k = fromRight ? n - 1 - i : i;
    const fr = clamp(lit - i, 0, 1);
    const px = x + k * (sw + gap);
    g.fillStyle = off; g.fillRect(px, y, sw, h);
    if (fr > 0) {
      g.fillStyle = typeof on === 'function' ? on(i / n) : on;
      if (glowOn) glow(g, g.fillStyle, glowOn);
      g.globalAlpha *= fr < 1 ? 0.35 + fr * 0.65 : 1;
      g.fillRect(px, y, sw, h);
      g.globalAlpha = 1;
      noGlow(g);
    }
  }
}

/** Painel de fundo com cantos chanfrados (para blocos de dados no canvas). */
export function plate(g, x, y, w, h, { cut = 10, fill = 'rgba(5,12,21,0.42)', stroke = 'rgba(166,236,255,0.16)', accent = null } = {}) {
  g.beginPath();
  g.moveTo(x + cut, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - cut); g.lineTo(x + w - cut, y + h); g.lineTo(x, y + h); g.lineTo(x, y + cut); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  if (accent) { g.fillStyle = accent; g.fillRect(x + cut, y - 1, 26, 2); }
}

/** Gradiente vertical de fade para "vidro" (usado em painéis do canvas). */
export function fadePlate(g, x, y, w, h, dir = 1, a = 0.5) {
  const gr = dir > 0 ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(x + w, 0, x, 0);
  gr.addColorStop(0, `rgba(5,12,21,${a})`); gr.addColorStop(0.7, `rgba(5,12,21,${a * 0.6})`); gr.addColorStop(1, 'rgba(5,12,21,0)');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}

export function fmtDist(m) {
  if (!Number.isFinite(m)) return '—';
  if (m >= 1e9) return `${(m / 1e9).toFixed(2)} Gm`;
  if (m >= 1e6) return `${(m / 1e6).toFixed(m >= 1e7 ? 1 : 2)} Mm`;
  if (m >= 1e4) return `${(m / 1e3).toFixed(m >= 1e5 ? 0 : 1)} km`;
  if (m >= 1e3) return `${(m / 1e3).toFixed(2)} km`;
  return `${Math.round(m)} m`;
}
export function fmtTime(s) {
  if (!Number.isFinite(s) || s <= 0) return '—';
  if (s < 60) return `${Math.ceil(s)} s`;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  if (m < 60) return `${m}:${String(r).padStart(2, '0')}`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
export function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function rgbA(c, a) { return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`; }

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** **negrito** e *destaque* simples. */
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<em>$1</em>');

/** Ícones SVG (traço) para DOM. */
const P = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
export const ICONS = {
  info: P('M12 3l9 9-9 9-9-9z M12 8v5 M12 15.5v.5'),
  warn: P('M12 3l10 18H2z M12 9v5 M12 16.5v.5'),
  bad: P('M5 5l14 14 M19 5L5 19 M12 2v3 M12 19v3'),
  reward: P('M12 2l2.6 6.4L21 9l-5 4.4L17.5 21 12 17.3 6.5 21 8 13.4 3 9l6.4-.6z'),
  disc: P('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v10 M7 12h10'),
  radio: P('M4 10a8 8 0 0 1 16 0 M7 11a5 5 0 0 1 10 0 M12 12v9 M9 21h6'),
  pause: P('M8 5v14 M16 5v14'),
  map: P('M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15'),
  fire: P('M12 2v6 M12 16v6 M2 12h6 M16 12h6 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'),
  missile: P('M4 20l5-5 M14 4l6 6-9 9-6-6z M14 4h6v6 M7 13l4 4'),
  boost: P('M13 2L4 14h7l-1 8 9-12h-7z'),
  jump: P('M12 20V6 M6 12l6-6 6 6 M5 21h14'),
  down: P('M12 4v14 M6 12l6 6 6-6 M5 3h14'),
  reload: P('M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7'),
  hand: P('M8 13V5a1.5 1.5 0 0 1 3 0v6 M11 11V3.5a1.5 1.5 0 0 1 3 0V11 M14 11V5a1.5 1.5 0 0 1 3 0v7 M17 9a1.5 1.5 0 0 1 3 0v5a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3l-3-5a1.5 1.5 0 0 1 2.5-1.7L8 15'),
  scan: P('M3 8V3h5 M21 8V3h-5 M3 16v5h5 M21 16v5h-5 M7 12h10 M12 7v10'),
  target: P('M12 2v5 M12 17v5 M2 12h5 M17 12h5 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'),
  flare: P('M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M18 6l-2.5 2.5 M8.5 15.5L6 18 M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
  quantum: P('M12 2a10 10 0 1 0 10 10 M12 7a5 5 0 1 0 5 5 M12 12l9-9 M16 3h5v5'),
  gear: P('M6 4v9 M18 4v9 M4 17h4 M16 17h4 M6 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M18 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M6 8h12'),
  rollL: P('M4 12a8 8 0 0 1 14-5.3 M18 3v4h-4 M8 20l-4-8'),
  rollR: P('M20 12a8 8 0 0 0-14-5.3 M6 3v4h4 M16 20l4-8'),
  grenade: P('M12 8a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M10 8V5h4v3 M14 5l3-2'),
  light: P('M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z'),
  tool: P('M14 6l4-4 4 4-4 4 M18 6L8 16 M5 15l4 4-3 3-4-4z'),
  inv: P('M4 7h16v13H4z M9 7V4h6v3 M4 12h16'),
  close: P('M6 6l12 12 M18 6L6 18'),
  ship: P('M12 2l3 8 7 4-7 2-3 6-3-6-7-2 7-4z'),
  station: P('M12 2v20 M2 12h20 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'),
  planet: P('M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M2 14c4 2 16 0 20-6'),
  mission: P('M6 3h12v18l-6-4-6 4z M9 8h6 M9 11h6'),
  catalog: P('M4 4h7v16H4z M13 4h7v16h-7z M7 8h1 M16 8h1'),
  workshop: P('M3 21l7-7 M14 3a5 5 0 0 0-4 7l-7 7 4 4 7-7a5 5 0 0 0 7-4l-3 1-2-2 1-3z'),
  market: P('M4 9h16l-1 11H5z M8 9V6a4 4 0 0 1 8 0v3'),
  settings: P('M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19 12l2-1-1-3-2 .3-1.4-1.4.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L5.8 8.3 4 8 3 11l2 1v0l-2 1 1 3 2-.3 1.4 1.4-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.4-1.4 2 .3 1-3z'),
  save: P('M5 3h12l3 3v15H5z M8 3v6h8V3 M8 21v-7h8v7'),
  exit: P('M14 4h6v16h-6 M10 8l-4 4 4 4 M6 12h10'),
  ore: P('M12 2l8 6-3 12H7L4 8z M12 2v20 M4 8h16'),
  ammo: P('M8 4h3v16H8z M13 4h3v16h-3z M8 8h3 M13 8h3'),
  leaf: P('M5 19c0-9 6-14 15-14 0 9-5 15-14 15 M5 19l8-8'),
  creature: P('M5 14c0-4 3-7 7-7s7 3 7 7-3 4-7 4-7 0-7-4z M9 11h.5 M14.5 11h.5 M8 18l-1 3 M16 18l1 3'),
  ruin: P('M3 21h18 M5 21V10l7-6 7 6v11 M9 21v-6h6v6'),
};

/**
 * Projeção holográfica (canvas) de um ícone: base de projetor com anéis,
 * cone de luz, o glifo grande com brilho e linhas de varredura. Para os
 * painéis de detalhe (catálogo, inventário, oficina).
 */
export function holo(kind = 'info', color = '#a6ecff', w = 420, h = 260, seed = 1) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`; cv.style.maxWidth = '100%'; cv.style.display = 'block';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const cx = w / 2, by = h * 0.86;
  // cone de luz
  const cone = g.createLinearGradient(0, by, 0, h * 0.08);
  cone.addColorStop(0, hexA(color, 0.28)); cone.addColorStop(1, hexA(color, 0));
  g.fillStyle = cone;
  g.beginPath(); g.moveTo(cx - 34, by); g.lineTo(cx - w * 0.3, h * 0.08); g.lineTo(cx + w * 0.3, h * 0.08); g.lineTo(cx + 34, by); g.closePath(); g.fill();
  // anéis da base
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = hexA(color, 0.55 - i * 0.11); g.lineWidth = i ? 1 : 2;
    g.beginPath(); g.ellipse(cx, by, 46 + i * 26, 9 + i * 5, 0, 0, TAU); g.stroke();
  }
  const rg = g.createRadialGradient(cx, by, 0, cx, by, 60);
  rg.addColorStop(0, hexA(color, 0.6)); rg.addColorStop(1, hexA(color, 0));
  g.fillStyle = rg; g.beginPath(); g.ellipse(cx, by, 60, 12, 0, 0, TAU); g.fill();
  // glifo
  const d = (ICONS[kind] || ICONS.info).match(/d="([^"]+)"/)?.[1];
  if (d && typeof Path2D !== 'undefined') {
    const S = h * 0.028;
    g.save();
    g.translate(cx - 12 * S, h * 0.44 - 12 * S);
    g.scale(S, S);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = new Path2D(d);
    g.strokeStyle = hexA(color, 0.25); g.lineWidth = 3.2 / S * 2; g.stroke(path);
    glow(g, color, 18);
    g.strokeStyle = color; g.lineWidth = 1.6 / S * 1.4; g.stroke(path);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.5 / S * 1.4; g.stroke(path);
    g.restore();
  }
  noGlow(g);
  // varredura e partículas
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y, w, 1); }
  g.globalCompositeOperation = 'source-over';
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 40; i++) { g.fillStyle = hexA(color, 0.2 + rnd() * 0.5); g.fillRect(cx + (rnd() - 0.5) * w * 0.5, h * 0.12 + rnd() * h * 0.7, 1.5, 1.5); }
  return cv;
}
