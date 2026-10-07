/**
 * Arte 2D dos itens do inventário (Canvas 2D, tudo procedural):
 * - silhuetas de perfil de cada arma-base e de cada modelo de faca;
 * - os 12 padrões de skin do contrato (solid, camo, digital, tiger, fade,
 *   damascus, marble, hex, carbon, ember, oxide, splatter) variando pela
 *   semente do padrão, com arranhões/lascas pelo desgaste;
 * - miniaturas dos itens (silhueta preenchida com o padrão + volume), arte
 *   das caixas, chaveiros e adesivos.
 * As mesmas silhuetas viram geometria extrudada no visualizador 3D quando a
 * feature weapon ainda não publica `buildPreview` (ver viewer.js).
 */
import { RIFLE_PATH, RIFLE_CUTS } from './icons.js';
import { drawText } from './font.js';

// ─── silhuetas (perfil, cano para a direita; só M/L/H/V/Z) ─────────────
export const SIL = {
  kr9: RIFLE_PATH + ' ' + RIFLE_CUTS,
  p11: 'M2,4 H56 L58,6 V14 H33 V21 H25 L22,15 L19,36 H8 L11.5,16 L6,14 H2 Z M28,15 H31 V18.5 H28.5 Z',
  smg: 'M0,12 L4,10 H18 L20,8 H70 L72,10 H84 V12 H92 V16 H84 V18 H62 L58,22 H52 L54,38 H45 L42,22 H35 L31,31 H24 L27,18 H16 L8,22 H2 Z M6,13 H15 V16 H6 Z',
  shotgun: 'M0,14 L6,10 H30 L34,8 H70 V10 H128 V14 H104 V20 H72 V18 H46 L42,22 H38 L34,32 H26 L30,20 H22 L8,24 H0 Z M76,15 H100 V17 H76 Z',
  sniper: 'M0,16 L4,12 H30 L36,14 H64 V12 H138 V15 H64 V20 H58 L54,24 H50 L46,34 H38 L42,22 H34 L22,26 H10 L4,24 H0 Z M40,10 H46 V7 H38 L36,4 H78 L76,7 H66 V10 H72 V12 H40 Z',
  lmg: 'M0,14 L6,10 H26 L30,6 H74 V10 H112 V14 H118 V17 H112 V19 H74 V22 H67 V33 H44 V22 H40 L36,26 H32 L28,36 H20 L24,22 H14 L6,24 H0 Z M80,13 H108 V15 H80 Z',
  dmr: 'M0,14 L5,10 H40 V7 L43,4 H70 L72,6 V10 H120 V13 H126 V17 H120 V16 H76 V20 H61 V31 H53 V20 H46 L42,24 H38 L34,34 H26 L30,20 H22 L8,24 H0 Z',
  // facas (cabo à esquerda, lâmina à direita)
  tk7: 'M0,9 L2,7 H38 V4 H42 V9 H88 L100,12 L88,15 H42 V20 H38 V17 H2 L0,15 Z',
  garra: 'M0,10 L4,6 H30 L40,8 L58,6 L74,8 L86,14 L92,22 L82,18 L70,14 L56,14 L42,16 H30 H4 L0,14 Z M-8,8 L-2,6 L-2,16 L-8,14 Z',
  borboleta: 'M0,8 H44 V6 H48 V8 H90 L100,11 L92,14 H48 V16 H44 V14 H0 Z M0,15.4 H44 V18.6 H0 Z',
  cacadora: 'M0,8 L3,6 H36 V2 H40 V8 H78 L96,4 L100,8 L92,16 H40 V22 H36 V16 H3 L0,14 Z',
  baioneta: 'M0,9 L2,7 H34 V3 H38 V8 H94 L100,10 L94,14 H38 V19 H34 V15 H2 L0,13 Z',
};

/** Polígonos [[x,y]…] de um caminho M/L/H/V/Z. */
export function parsePath(d) {
  const out = [];
  let cur = null, x = 0, y = 0, cmd = 'M';
  const tok = d.match(/[MLHVZ]|-?\d*\.?\d+/g) || [];
  let i = 0;
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[MLHVZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') { x = num(); y = num(); cur = [[x, y]]; out.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { x = num(); y = num(); cur.push([x, y]); }
    else if (cmd === 'H') { x = num(); cur.push([x, y]); }
    else if (cmd === 'V') { y = num(); cur.push([x, y]); }
    else if (cmd === 'Z') { /* fecha */ }
  }
  return out;
}
export function bbox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
const SILBOX = {};
export const silBox = (k) => (SILBOX[k] ||= bbox(parsePath(SIL[k] || SIL.kr9)));

// ─── RNG ───────────────────────────────────────────────────────────────
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hashStr = (s) => [...String(s)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const mix = (h1, h2, t) => {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const c = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

// ─── padrões ───────────────────────────────────────────────────────────
/**
 * Pinta o padrão da skin no retângulo (0,0,w,h). `spec` = { id, pattern,
 * palette, seed, wear }. `k` = escala do detalhe (px por unidade).
 */
export function drawPattern(g, w, h, spec, k = 1) {
  const P = spec.palette?.length ? spec.palette : ['#5d6266', '#3a3e42', '#8a8f94'];
  const p0 = P[0], p1 = P[1] || P[0], p2 = P[2] || P[1] || P[0];
  const R = rng(hashStr(spec.id || spec.pattern) ^ Math.imul((spec.seed | 0) + 1, 2654435761));
  g.save();
  g.fillStyle = p0;
  g.fillRect(0, 0, w, h);
  const pat = spec.pattern || 'solid';
  const blob = (cx, cy, r, n = 9) => {
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, rr = r * (0.55 + R() * 0.6);
      const x = cx + Math.cos(a) * rr * 1.5, y = cy + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
  };
  if (pat === 'solid') {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, mix(p0, p2, 0.35));
    gr.addColorStop(0.55, p0);
    gr.addColorStop(1, p1);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.08;
    g.fillStyle = p2;
    for (let i = 0; i < h; i += 2 * k) g.fillRect(0, i, w, 0.6 * k * R());
  } else if (pat === 'camo') {
    for (const [c, n] of [[p1, 16], [p2, 13], [mix(p0, '#000000', 0.25), 9]]) {
      g.fillStyle = c;
      for (let i = 0; i < n * (w / 220); i++) blob(R() * w, R() * h, (10 + R() * 18) * k);
    }
  } else if (pat === 'digital') {
    const s = 5 * k, cw = Math.ceil(w / s), ch = Math.ceil(h / s);
    const coarse = Array.from({ length: Math.ceil(cw / 4) + 2 }, () => Array.from({ length: Math.ceil(ch / 4) + 2 }, () => R()));
    for (let x = 0; x < cw; x++) for (let y = 0; y < ch; y++) {
      const v = coarse[(x >> 2)][(y >> 2)] * 0.7 + R() * 0.3;
      if (v < 0.38) continue;
      g.fillStyle = v > 0.72 ? p2 : p1;
      g.fillRect(x * s, y * s, s + 0.5, s + 0.5);
    }
  } else if (pat === 'tiger') {
    const n = Math.round(w / (14 * k)) + 3, ang = -0.5 + R() * 0.3;
    for (let i = 0; i < n; i++) {
      const x0 = (i / n) * w * 1.3 - w * 0.15 + R() * 8 * k;
      const th = (3 + R() * 6) * k;
      g.fillStyle = i % 4 === 3 ? p2 : p1;
      g.beginPath();
      const segs = 8;
      for (let j = 0; j <= segs; j++) {
        const y = (j / segs) * h, x = x0 + y * ang + Math.sin(j * 1.3 + i) * 5 * k;
        j ? g.lineTo(x - th * (0.4 + 0.6 * Math.sin((j / segs) * Math.PI)), y) : g.moveTo(x, y);
      }
      for (let j = segs; j >= 0; j--) {
        const y = (j / segs) * h, x = x0 + y * ang + Math.sin(j * 1.3 + i) * 5 * k;
        g.lineTo(x + th * (0.4 + 0.6 * Math.sin((j / segs) * Math.PI)), y);
      }
      g.fill();
    }
  } else if (pat === 'fade') {
    const off = (R() - 0.5) * 0.3;
    const gr = g.createLinearGradient(0, h * (0.2 + off), w, h * (0.8 - off));
    gr.addColorStop(0, p0);
    gr.addColorStop(0.5 + off, p1);
    gr.addColorStop(1, p2);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const sh = g.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(255,255,255,.18)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, w, h);
  } else if (pat === 'damascus') {
    const f1 = 0.02 + R() * 0.02, f2 = 0.05 + R() * 0.03, ph = R() * 6;
    for (let y = -20 * k; y < h + 20 * k; y += 2.6 * k) {
      g.strokeStyle = Math.round(y / (2.6 * k)) % 3 === 0 ? p2 : Math.round(y / (2.6 * k)) % 3 === 1 ? p1 : mix(p0, p1, 0.5);
      g.lineWidth = 1.3 * k;
      g.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const yy = y + Math.sin(x * f1 / k + ph) * 9 * k + Math.sin(x * f2 / k + y * 0.05) * 4 * k;
        x ? g.lineTo(x, yy) : g.moveTo(x, yy);
      }
      g.stroke();
    }
  } else if (pat === 'marble') {
    for (const [c, n, lw, a] of [[p1, 26, 2.2, 0.55], [p2, 18, 1, 0.8]]) {
      g.strokeStyle = c;
      g.globalAlpha = a;
      for (let i = 0; i < n * (w / 220); i++) {
        let x = R() * w, y = R() * h, d = R() * 6;
        g.lineWidth = lw * k * (0.4 + R());
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 14; j++) { d += (R() - 0.5) * 1.2; x += Math.cos(d) * 7 * k; y += Math.sin(d) * 4 * k; g.lineTo(x, y); }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  } else if (pat === 'hex') {
    const r = 7 * k, hw = r * Math.sqrt(3);
    g.lineWidth = 1.4 * k;
    for (let row = -1; row * r * 1.5 < h + r; row++) {
      for (let col = -1; col * hw < w + hw; col++) {
        const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * r * 1.5;
        g.beginPath();
        for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); }
        g.closePath();
        const v = R();
        if (v < 0.16) { g.fillStyle = p1; g.fill(); }
        else if (v < 0.22) { g.fillStyle = p2; g.fill(); }
        g.strokeStyle = hexA(p1.length === 7 ? p1 : '#888888', 0.75);
        g.stroke();
      }
    }
  } else if (pat === 'carbon') {
    const s = 4 * k;
    for (let x = 0; x < w; x += s) for (let y = 0; y < h; y += s) {
      const odd = ((x / s) + (y / s)) % 2 < 1;
      const gr = odd ? g.createLinearGradient(x, y, x + s, y) : g.createLinearGradient(x, y, x, y + s);
      gr.addColorStop(0, p1);
      gr.addColorStop(0.5, p2);
      gr.addColorStop(1, p1);
      g.fillStyle = gr;
      g.fillRect(x, y, s - 0.4, s - 0.4);
    }
  } else if (pat === 'ember') {
    const glow = (c, lw, blur, n) => {
      g.strokeStyle = c;
      g.lineWidth = lw * k;
      g.shadowColor = c;
      g.shadowBlur = blur * k;
      const RR = rng(hashStr(spec.id) ^ ((spec.seed | 0) * 7 + 3));
      for (let i = 0; i < n * (w / 220); i++) {
        let x = RR() * w, y = RR() * h;
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 7; j++) { x += (RR() - 0.5) * 22 * k; y += (RR() - 0.5) * 14 * k; g.lineTo(x, y); }
        g.stroke();
      }
    };
    glow(p1, 2.4, 8, 22);
    glow(p2, 0.9, 3, 22);
    g.shadowBlur = 0;
  } else if (pat === 'oxide') {
    for (let i = 0; i < 40 * (w / 220); i++) {
      const x = R() * w, y = R() * h, r = (4 + R() * 22) * k;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = R() < 0.6 ? p1 : p2;
      gr.addColorStop(0, hexA(c, 0.85));
      gr.addColorStop(1, hexA(c, 0));
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.fillStyle = hexA(p2, 0.6);
    for (let i = 0; i < 300 * (w / 220); i++) g.fillRect(R() * w, R() * h, k, k);
  } else if (pat === 'splatter') {
    for (const [c, n] of [[p1, 12], [p2, 9]]) {
      g.fillStyle = c;
      for (let i = 0; i < n * (w / 220); i++) {
        const x = R() * w, y = R() * h, r = (2 + R() * 7) * k;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        for (let j = 0; j < 7; j++) {
          const a = R() * Math.PI * 2, d = r * (1.2 + R() * 2.4);
          g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.1 + R() * 0.25), 0, Math.PI * 2); g.fill();
        }
      }
    }
  }
  // desgaste: arranhões claros + lascas de metal nu
  const wear = Math.max(0, Math.min(1, Number(spec.wear) || 0));
  if (wear > 0.02) {
    const WR = rng((spec.seed | 0) * 131 + 7);
    g.globalAlpha = Math.min(0.75, 0.25 + wear);
    g.strokeStyle = '#d6d9dc';
    g.lineWidth = 0.6 * k;
    for (let i = 0; i < wear * 140 * (w / 220); i++) {
      const x = WR() * w, y = WR() * h, a = WR() * Math.PI, l = (3 + WR() * 12) * k;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    if (wear > 0.3) {
      g.fillStyle = '#8b9096';
      for (let i = 0; i < (wear - 0.3) * 40 * (w / 220); i++) blobW(g, WR, WR() * w, WR() * h, (2 + WR() * 6) * k);
    }
    g.globalAlpha = 1;
  }
  g.restore();
}
function blobW(g, R, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i <= 7; i++) { const a = (i / 7) * Math.PI * 2, rr = r * (0.5 + R() * 0.7); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath();
  g.fill();
}

/** Canvas quadrado do padrão (textura do visualizador 3D de reserva). */
export function patternCanvas(spec, n = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  drawPattern(cv.getContext('2d'), n, n, spec, n / 220);
  return cv;
}

// ─── miniaturas ────────────────────────────────────────────────────────
const _thumbs = new Map();
/** Superamostragem das miniaturas/arte (2 no desktop, 1 em celular/lite). */
let ART_S = 2;
export const setArtDetail = (k) => { ART_S = k; };
/**
 * Miniatura de um item (data URL PNG, fundo transparente). `def` vem do
 * catálogo; `it` traz wear/seed. Cache por definição + semente + faixa.
 */
export function itemThumb(def, it = {}, w = 240, h = 132) {
  if (!def) return '';
  const wearK = Math.round((it.wear ?? 0) * 10);
  const key = [def.id, it.seed ?? 0, wearK, w, h].join('|');
  if (_thumbs.has(key)) return _thumbs.get(key);
  const cv = document.createElement('canvas');
  const S = ART_S;
  cv.width = w * S; cv.height = h * S;
  const g = cv.getContext('2d');
  g.scale(S, S);
  if (def.type === 'skin' || def.type === 'knife') drawGun(g, def, it, w, h);
  else if (def.type === 'charm') drawCharm(g, def, w / 2, h / 2 + 4, Math.min(w, h) * 0.36);
  else if (def.type === 'sticker') drawSticker(g, def, w / 2, h / 2, Math.min(w, h) * 0.38);
  const url = cv.toDataURL('image/png');
  if (_thumbs.size > 600) _thumbs.clear();
  _thumbs.set(key, url);
  return url;
}

/** Silhueta preenchida pelo padrão, com volume e contorno. */
function drawGun(g, def, it, w, h) {
  const k = def.base in SIL ? def.base : 'kr9';
  const b = silBox(k);
  const pad = 0.08;
  const sc = Math.min((w * (1 - pad * 2)) / b.w, (h * (1 - pad * 2)) / b.h);
  const ox = (w - b.w * sc) / 2 - b.x0 * sc, oy = (h - b.h * sc) / 2 - b.y0 * sc;
  const path = new Path2D(SIL[k]);
  g.save();
  // sombra de contato
  g.save();
  g.translate(ox, oy + 3);
  g.scale(sc, sc);
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.filter = 'blur(3px)';
  g.fill(path, 'evenodd');
  g.restore();
  g.translate(ox, oy);
  g.scale(sc, sc);
  g.save();
  g.clip(path, 'evenodd');
  g.scale(1 / sc, 1 / sc);
  g.translate(-ox, -oy);
  drawPattern(g, w, h, { id: def.id, pattern: def.pattern, palette: def.palette, seed: it.seed ?? 0, wear: it.wear ?? 0 }, 0.9);
  // volume: luz por cima, sombra embaixo, brilho especular pelo acabamento
  const gl = g.createLinearGradient(0, oy + b.y0 * sc, 0, oy + b.y1 * sc);
  const met = def.finish?.metalness ?? 0.4;
  gl.addColorStop(0, `rgba(255,255,255,${0.16 + met * 0.22})`);
  gl.addColorStop(0.35, 'rgba(255,255,255,0)');
  gl.addColorStop(0.7, 'rgba(0,0,0,.08)');
  gl.addColorStop(1, 'rgba(0,0,0,.42)');
  g.fillStyle = gl;
  g.fillRect(0, 0, w, h);
  g.restore();
  g.lineWidth = 0.9 / sc * 1.2;
  g.strokeStyle = 'rgba(0,0,0,.65)';
  g.stroke(path);
  g.lineWidth = 0.6 / sc;
  g.strokeStyle = 'rgba(255,255,255,.12)';
  g.stroke(path);
  g.restore();
}

// ─── chaveiros ─────────────────────────────────────────────────────────
export function drawCharm(g, def, cx, cy, r) {
  const c = def.color || '#e2b45a';
  g.save();
  // corrente
  g.strokeStyle = '#b9c0c6';
  g.lineWidth = 2;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx, cy - r - 12 + i * 7, 3, 4.4, 0, 0, Math.PI * 2); g.stroke(); }
  const gr = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.25, c);
  gr.addColorStop(1, mix(c, '#000000', 0.55));
  g.fillStyle = gr;
  g.strokeStyle = 'rgba(0,0,0,.6)';
  g.lineWidth = 1.5;
  g.shadowColor = 'rgba(0,0,0,.5)';
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  const P = new Path2D(charmPath(def.shape, cx, cy, r));
  g.fill(P, 'evenodd');
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.stroke(P);
  g.restore();
}
export function charmPath(shape, cx, cy, r) {
  const pts = (arr) => arr.map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * r).toFixed(1)},${(cy + y * r).toFixed(1)}`).join(' ') + ' Z';
  const circ = (x, y, rr) => `M${cx + (x + rr) * r},${cy + y * r} A${rr * r},${rr * r} 0 1,0 ${cx + (x - rr) * r},${cy + y * r} A${rr * r},${rr * r} 0 1,0 ${cx + (x + rr) * r},${cy + y * r} Z`;
  switch (shape) {
    case 'skull': return pts([[-0.8, -0.3], [-0.6, -0.85], [0, -1], [0.6, -0.85], [0.8, -0.3], [0.6, 0.35], [0.4, 0.4], [0.4, 0.85], [-0.4, 0.85], [-0.4, 0.4], [-0.6, 0.35]]) + ' ' + circ(-0.33, -0.15, 0.2) + ' ' + circ(0.33, -0.15, 0.2);
    case 'dice': return pts([[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) + ' ' + circ(-0.4, -0.4, 0.13) + ' ' + circ(0, 0, 0.13) + ' ' + circ(0.4, 0.4, 0.13);
    case 'star': return pts(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.42 : 1; return [Math.cos(a) * rr, Math.sin(a) * rr]; }));
    case 'bullet': return pts([[-0.28, 1], [-0.28, -0.25], [-0.18, -0.7], [0, -1], [0.18, -0.7], [0.28, -0.25], [0.28, 1]]);
    case 'diamond': return pts([[0, -1], [0.75, -0.3], [0, 1], [-0.75, -0.3]]) + ' ' + pts([[-0.4, -0.3], [0.4, -0.3], [0, 0.55]]);
    case 'cube': return pts([[0, -1], [0.85, -0.5], [0.85, 0.5], [0, 1], [-0.85, 0.5], [-0.85, -0.5]]) + ' ' + pts([[0, 0], [0.85, -0.5], [0, -1], [-0.85, -0.5]]);
    case 'ring': return circ(0, 0, 0.9) + ' ' + circ(0, 0, 0.55);
    case 'tag': default: return pts([[-0.6, -0.9], [0.6, -0.9], [0.6, 0.6], [0, 1], [-0.6, 0.6]]) + ' ' + circ(0, -0.6, 0.12);
  }
}

// ─── adesivos ──────────────────────────────────────────────────────────
const GLYPH = {
  star: 'M0,-1 L0.24,-0.33 L0.95,-0.31 L0.39,0.13 L0.59,0.81 L0,0.4 L-0.59,0.81 L-0.39,0.13 L-0.95,-0.31 L-0.24,-0.33 Z',
  skull: 'M-0.7,-0.2 L-0.55,-0.75 L0,-0.9 L0.55,-0.75 L0.7,-0.2 L0.5,0.3 L0.35,0.35 L0.35,0.8 L-0.35,0.8 L-0.35,0.35 L-0.5,0.3 Z M-0.45,-0.25 L-0.1,-0.25 L-0.15,0.05 L-0.45,0.05 Z M0.45,-0.25 L0.1,-0.25 L0.15,0.05 L0.45,0.05 Z',
  bolt: 'M0.15,-1 L-0.55,0.15 L-0.05,0.15 L-0.2,1 L0.55,-0.2 L0.05,-0.2 Z',
  target: 'M-0.9,0 L-0.6,0 M0.6,0 L0.9,0 M0,-0.9 L0,-0.6 M0,0.6 L0,0.9',
  wolf: 'M-0.8,-0.9 L-0.35,-0.35 L0.35,-0.35 L0.8,-0.9 L0.7,0.1 L0,0.9 L-0.7,0.1 Z M-0.4,0 L-0.15,0.1 L-0.4,0.15 Z M0.4,0 L0.15,0.1 L0.4,0.15 Z',
  crown: 'M-0.9,0.6 L-0.9,-0.5 L-0.45,0 L0,-0.8 L0.45,0 L0.9,-0.5 L0.9,0.6 Z',
  flame: 'M0,-1 L0.45,-0.35 L0.35,-0.6 L0.75,0 L0.6,0.65 L0,1 L-0.6,0.65 L-0.75,0 L-0.4,-0.4 L-0.3,-0.1 Z',
  wave: 'M-0.95,0.2 L-0.6,-0.35 L-0.25,0.2 L0.1,-0.35 L0.45,0.2 L0.8,-0.35 L0.95,-0.1 L0.95,0.6 L-0.95,0.6 Z',
  eye: 'M-0.95,0 L-0.45,-0.5 L0.45,-0.5 L0.95,0 L0.45,0.5 L-0.45,0.5 Z M-0.25,0 L0,-0.25 L0.25,0 L0,0.25 Z',
  wing: 'M-0.9,0.5 L-0.2,-0.8 L0.9,-0.9 L0.4,-0.5 L0.85,-0.45 L0.3,-0.1 L0.7,0 L0,0.3 L0.3,0.4 Z',
  heart: 'M0,0.9 L-0.85,-0.05 L-0.85,-0.55 L-0.5,-0.85 L0,-0.5 L0.5,-0.85 L0.85,-0.55 L0.85,-0.05 Z',
  hex: 'M0,-0.95 L0.82,-0.48 L0.82,0.48 L0,0.95 L-0.82,0.48 L-0.82,-0.48 Z M0,-0.5 L0.43,-0.25 L0.43,0.25 L0,0.5 L-0.43,0.25 L-0.43,-0.25 Z',
};
export function drawSticker(g, def, cx, cy, r) {
  const c = def.color || '#e2b45a';
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.08);
  // recorte branco (die-cut) + fundo escuro
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.fillStyle = '#eef0ec';
  roundRect(g, -r * 1.05, -r * 1.05, r * 2.1, r * 2.1, r * 0.35); g.fill();
  g.shadowBlur = 0; g.shadowOffsetY = 0;
  const bg = g.createLinearGradient(0, -r, 0, r);
  bg.addColorStop(0, '#20252b'); bg.addColorStop(1, '#0d1013');
  g.fillStyle = bg;
  roundRect(g, -r * 0.92, -r * 0.92, r * 1.84, r * 1.84, r * 0.28); g.fill();
  g.scale(r * 0.72, r * 0.72);
  const P = new Path2D(GLYPH[def.glyph] || GLYPH.star);
  if (def.glyph === 'target') {
    g.strokeStyle = c; g.lineWidth = 0.14;
    g.beginPath(); g.arc(0, 0, 0.62, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 0.18, 0, Math.PI * 2); g.fillStyle = c; g.fill();
    g.stroke(P);
  } else {
    const gr = g.createLinearGradient(-1, -1, 1, 1);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, c); gr.addColorStop(1, mix(c, '#000000', 0.4));
    g.fillStyle = gr;
    g.fill(P, 'evenodd');
  }
  // brilho holográfico
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

// ─── arte das caixas ───────────────────────────────────────────────────
const _cases = new Map();
/**
 * Maleta militar em 3/4 (frente, tampa, travas, nervuras, alça), faixa e
 * número da caixa na cor do tema, brilho de chão. Data URL (cache).
 */
export function caseArt(c, w = 520, h = 340) {
  const key = c.id + w + 'x' + h;
  if (_cases.has(key)) return _cases.get(key);
  const cv = document.createElement('canvas');
  const S = ART_S;
  cv.width = w * S; cv.height = h * S;
  const g = cv.getContext('2d');
  g.scale(S, S);
  const R = rng(hashStr(c.id));
  // fundo: degradê do tema + luz de chão
  const bg = g.createRadialGradient(w * 0.5, h * 0.62, 10, w * 0.5, h * 0.6, w * 0.7);
  bg.addColorStop(0, hexA(c.color, 0.42));
  bg.addColorStop(0.45, hexA(c.color2, 0.55));
  bg.addColorStop(1, 'rgba(6,8,10,1)');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // raios de luz
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.22 + (R() - 0.5) * 0.1;
    g.fillStyle = hexA(c.color, 0.05);
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.95);
    g.lineTo(w * 0.5 + Math.cos(a - 0.05) * w, h * 0.95 + Math.sin(a - 0.05) * w);
    g.lineTo(w * 0.5 + Math.cos(a + 0.05) * w, h * 0.95 + Math.sin(a + 0.05) * w);
    g.fill();
  }
  g.restore();
  // maleta
  const cx = w * 0.53, by = h * 0.88, CW = w * 0.5, CH = h * 0.32, D = h * 0.13, sk = w * 0.055;
  const x0 = cx - CW / 2, y0 = by - CH;
  // sombra
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.beginPath(); g.ellipse(cx + sk * 0.4, by + 6, CW * 0.62, 12, 0, 0, Math.PI * 2); g.fill();
  // tampa (topo)
  const top = g.createLinearGradient(0, y0 - D, 0, y0);
  top.addColorStop(0, '#5a6066'); top.addColorStop(1, '#2c3136');
  g.fillStyle = top;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + sk, y0 - D); g.lineTo(x0 + CW + sk, y0 - D); g.lineTo(x0 + CW, y0); g.closePath(); g.fill();
  // lateral
  g.fillStyle = '#1a1d21';
  g.beginPath(); g.moveTo(x0 + CW, y0); g.lineTo(x0 + CW + sk, y0 - D); g.lineTo(x0 + CW + sk, by - D); g.lineTo(x0 + CW, by); g.closePath(); g.fill();
  // frente
  const fr = g.createLinearGradient(0, y0, 0, by);
  fr.addColorStop(0, '#3e444a'); fr.addColorStop(0.5, '#2a2f34'); fr.addColorStop(1, '#16191c');
  g.fillStyle = fr;
  g.fillRect(x0, y0, CW, CH);
  // textura de pó (padrão da caixa) na frente
  g.save();
  g.beginPath(); g.rect(x0, y0, CW, CH); g.clip();
  g.globalAlpha = 0.18;
  drawPattern(g, w, h, { id: c.id, pattern: c.id === 'mare' ? 'damascus' : c.id === 'cinzas' ? 'ember' : 'hex', palette: [c.color2, c.color, '#000000'], seed: 7, wear: 0 }, 1.3);
  g.restore();
  // nervuras horizontais
  g.strokeStyle = 'rgba(255,255,255,.07)';
  g.lineWidth = 2;
  for (const t of [0.22, 0.78]) { g.beginPath(); g.moveTo(x0, y0 + CH * t); g.lineTo(x0 + CW, y0 + CH * t); g.stroke(); }
  // faixa do tema
  g.fillStyle = c.color;
  g.fillRect(x0, y0 + CH * 0.42, CW, CH * 0.14);
  g.fillStyle = 'rgba(0,0,0,.35)';
  for (let x = x0; x < x0 + CW; x += 16) { g.beginPath(); g.moveTo(x, y0 + CH * 0.56); g.lineTo(x + 8, y0 + CH * 0.42); g.lineTo(x + 14, y0 + CH * 0.42); g.lineTo(x + 6, y0 + CH * 0.56); g.fill(); }
  // travas
  for (const t of [0.18, 0.82]) {
    const lx = x0 + CW * t - 14;
    g.fillStyle = '#9aa1a8';
    g.fillRect(lx, y0 - 4, 28, 26);
    g.fillStyle = '#4a5056';
    g.fillRect(lx + 4, y0 + 2, 20, 14);
  }
  // alça
  g.strokeStyle = '#1c1f22';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(cx - 38 + sk / 2, y0 - D / 2); g.lineTo(cx - 30 + sk / 2, y0 - D / 2 - 16); g.lineTo(cx + 30 + sk / 2, y0 - D / 2 - 16); g.lineTo(cx + 38 + sk / 2, y0 - D / 2); g.stroke();
  // número e nome estampados
  drawText(g, String(c.n).padStart(2, '0'), x0 + 16, y0 + CH * 0.66, { size: 22, weight: 2.2, color: hexA(c.color, 0.95), heavy: true });
  drawText(g, c.name, x0 + 64, y0 + CH * 0.7, { size: 12, weight: 1.6, color: 'rgba(242,244,239,.85)', tracking: 2.2 });
  // contorno de luz
  g.strokeStyle = hexA(c.color, 0.5);
  g.lineWidth = 1.5;
  g.strokeRect(x0 + 0.5, y0 + 0.5, CW - 1, CH - 1);
  const url = cv.toDataURL('image/png');
  _cases.set(key, url);
  return url;
}

// ─── ícones de moeda ───────────────────────────────────────────────────
/** Créditos: moeda chanfrada com "C". */
export const creditSVG = (s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20"><path d="M6,1 H14 L19,6 V14 L14,19 H6 L1,14 V6 Z" fill="#e2b45a" stroke="#6a4a12" stroke-width="1.2"/><path d="M13,7 L11.5,5.5 H8 L6,7.5 V12.5 L8,14.5 H11.5 L13,13" fill="none" stroke="#3a2808" stroke-width="2"/></svg>`;
/** Chave: dentada, metal claro. */
export const keySVG = (s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20"><circle cx="6" cy="10" r="4.4" fill="none" stroke="#cfd6dc" stroke-width="2.4"/><path d="M10,10 H19 V13 H17 V11.6 H15.5 V13.5 H13.5 V11.6 H10 Z" fill="#cfd6dc"/></svg>`;
