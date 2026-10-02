/**
 * Arte procedural de perfil: "calling cards" (faixas ilustradas do
 * jogador) e emblemas metálicos. Tudo desenhado aqui (Canvas 2D / SVG) a
 * partir de uma semente — sem imagens externas.
 */
import { drawText } from './font.js';

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hash = (str) => [...String(str)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const THEMES = [
  // [céu alto, céu baixo, sol, montanhas, acento]
  ['#0d1a26', '#c9632a', '#ffd27a', '#120d10', '#ffb22e'], // alvorada de ferro
  ['#06121a', '#1d6f86', '#9ff3ff', '#06090c', '#4fe3ff'], // noite ártica
  ['#1a0606', '#9b1c12', '#ff9a5a', '#0c0606', '#ff5a3d'], // fogo
  ['#0b0f12', '#4b5a3a', '#e8f0b0', '#07090a', '#b6d86a'], // selva
];

/**
 * Calling card: paisagem estilizada (céu em degradê, sol com halo,
 * cordilheiras em camadas com névoa), silhuetas de helicóptero/torres,
 * estilhaços geométricos, varredura e título. Retorna data URL (PNG).
 */
export function callingCard(title = 'IRON DAWN', { seed = 1, theme = 0, w = 512, h = 128, sub = '' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const r = rng(seed + 11);
  const [c0, c1, sun, mtn, acc] = THEMES[theme % THEMES.length];
  // céu
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, c0);
  sky.addColorStop(0.78, c1);
  sky.addColorStop(1, mtn);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // sol + halo
  const sx = w * (0.62 + r() * 0.2), sy = h * 0.62;
  let gr = g.createRadialGradient(sx, sy, 0, sx, sy, h * 1.3);
  gr.addColorStop(0, sun);
  gr.addColorStop(0.08, sun + 'cc');
  gr.addColorStop(0.3, sun + '33');
  gr.addColorStop(1, sun + '00');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // raios
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.09;
  g.fillStyle = sun;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI + (i / 8) * Math.PI + (r() - 0.5) * 0.2;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + Math.cos(a - 0.04) * w, sy + Math.sin(a - 0.04) * w);
    g.lineTo(sx + Math.cos(a + 0.04) * w, sy + Math.sin(a + 0.04) * w);
    g.fill();
  }
  g.restore();
  // cordilheiras (3 camadas, a de trás mais clara pela névoa)
  for (let L = 0; L < 3; L++) {
    const base = h * (0.62 + L * 0.13);
    g.fillStyle = L === 2 ? mtn : `rgba(${L ? 20 : 40},${L ? 18 : 34},${L ? 22 : 40},${0.55 + L * 0.2})`;
    g.beginPath();
    g.moveTo(0, h);
    let y = base;
    for (let x = 0; x <= w; x += 8) {
      y += (r() - 0.5) * (14 - L * 3);
      y = Math.max(base - h * 0.22, Math.min(base + h * 0.05, y));
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.fill();
  }
  // silhuetas: helicóptero + antena
  g.fillStyle = '#05070a';
  const hx = w * (0.22 + r() * 0.15), hy = h * 0.3;
  g.beginPath();
  g.ellipse(hx, hy, 15, 5.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(hx + 8, hy - 2, 30, 3);
  g.fillRect(hx + 36, hy - 6, 3, 9);
  g.fillRect(hx - 26, hy - 9, 52, 1.6);
  g.fillRect(hx - 1, hy - 9, 2, 4);
  g.fillRect(hx - 10, hy + 6, 22, 1.5);
  const tx = w * 0.9;
  g.fillRect(tx, h * 0.35, 3, h * 0.5);
  g.fillRect(tx - 8, h * 0.45, 19, 2);
  // estilhaços geométricos de acento (diagonais)
  g.save();
  g.globalAlpha = 0.55;
  g.fillStyle = acc;
  for (let i = 0; i < 3; i++) {
    const x0 = w * (0.02 + i * 0.03);
    g.beginPath();
    g.moveTo(x0, 0); g.lineTo(x0 + 6, 0); g.lineTo(x0 + 6 - h * 0.5, h); g.lineTo(x0 - h * 0.5, h);
    g.fill();
  }
  g.restore();
  // varredura + vinheta
  g.fillStyle = 'rgba(0,0,0,.12)';
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  const vg = g.createLinearGradient(0, 0, w, 0);
  vg.addColorStop(0, 'rgba(0,0,0,.65)');
  vg.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  // título
  g.save();
  g.shadowColor = 'rgba(0,0,0,.8)';
  g.shadowBlur = 6;
  const ts = Math.min(h * 0.2, (w * 0.8) / Math.max(1, title.length * 0.86));
  if (title) drawText(g, title, h * 0.17, h * 0.3, { size: ts, weight: 1.8, tracking: 2.4, color: '#f6f3ea' });
  if (sub) drawText(g, sub, h * 0.175, h * 0.3 + ts * 1.55, { size: Math.min(h * 0.075, (w * 0.8) / Math.max(1, sub.length * 0.8)), weight: 1.7, tracking: 2.2, color: acc });
  g.restore();
  // moldura fina
  g.strokeStyle = 'rgba(255,255,255,.18)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
  return cv.toDataURL('image/png');
}

let _eid = 0;
/**
 * Emblema metálico (escudo chanfrado com símbolo) — variação por semente.
 * tone: 'gold' | 'steel' | 'red'.
 */
export function emblemSVG(seed = 0, s = 48, tone = 'steel') {
  const id = 'em' + _eid++;
  const sym = [
    // lobo estilizado (cabeça angular)
    'M20,44 L14,26 L18,14 L24,22 H40 L46,14 L50,26 L44,44 L32,52 Z M24,30 L29,33 L24,34 Z M40,30 L35,33 L40,34 Z',
    // caveira com asas
    'M32,16 C40,16 45,21 45,28 C45,32 43,35 40,36 V42 H24 V36 C21,35 19,32 19,28 C19,21 24,16 32,16 Z M25,27 L30,28 L29,32 L24,31 Z M39,27 L34,28 L35,32 L40,31 Z',
    // punhal + chevrons
    'M32,10 L36,20 V38 H40 V42 H34 V52 H30 V42 H24 V38 H28 V20 Z',
    // águia (asas em V)
    'M32,22 L38,30 L56,20 L48,34 L40,36 L36,48 H28 L24,36 L16,34 L8,20 L26,30 Z',
  ][hash(seed) % 4];
  const pal = { gold: ['#fff1b8', '#d89a26', '#6b3d06'], steel: ['#f4f7f9', '#8f9aa3', '#2f363c'], red: ['#ffd0c4', '#c8382a', '#4a0d07'] }[tone];
  return `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><defs>
    <linearGradient id="${id}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset=".45" stop-color="${pal[1]}"/><stop offset="1" stop-color="${pal[2]}"/></linearGradient>
    <radialGradient id="${id}b" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#2a3138"/><stop offset="1" stop-color="#0a0d10"/></radialGradient></defs>
    <path d="M32,2 L58,12 V34 C58,48 46,57 32,62 C18,57 6,48 6,34 V12 Z" fill="url(#${id})"/>
    <path d="M32,7 L53,15.5 V34 C53,45 44,52.5 32,57 C20,52.5 11,45 11,34 V15.5 Z" fill="url(#${id}b)"/>
    <path d="${sym}" fill="url(#${id})" fill-rule="evenodd"/>
  </svg>`;
}

export { hash };
