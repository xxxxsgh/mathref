/**
 * Fonte vetorial própria do HUD ("IRON MONO"): traço único, cantos
 * chanfrados, condensada — no espírito das fontes DIN/estêncil de interfaces
 * militares, mas desenhada aqui, à mão, em coordenadas de grade.
 *
 * Cada glifo é um caminho SVG simplificado (só M/L/H/V/Z, absolutos) numa
 * caixa de altura 10 (topo y=0, linha de base y=10). O mesmo desenho serve
 * para SVG (DOM) e Canvas 2D (bússola, minimapa), então a tipografia é
 * idêntica em toda a interface e não depende das fontes do sistema.
 */

// [largura, caminho]
const G = {
  '0': [6, 'M1.6,0 H4.4 L6,1.6 V8.4 L4.4,10 H1.6 L0,8.4 V1.6 Z'],
  '1': [6, 'M1.2,2.4 L3.8,0 V10'],
  '2': [6, 'M0,1.6 L1.6,0 H4.4 L6,1.6 V3.9 L0,10 H6'],
  '3': [6, 'M0.2,0 H5.8 L2.6,4.2 H4.4 L6,5.8 V8.4 L4.4,10 H1.6 L0,8.4'],
  '4': [6, 'M4.5,10 V0 L0,7.1 H6'],
  '5': [6, 'M5.8,0 H0.7 L0.4,4.6 H4.4 L6,6.2 V8.4 L4.4,10 H1.6 L0,8.4'],
  '6': [6, 'M4.4,0 L0,6.2 V8.4 L1.6,10 H4.4 L6,8.4 V6.2 L4.4,4.6 H1.15'],
  '7': [6, 'M0,0 H6 V1.2 L2.2,10'],
  '8': [6, 'M1.4,0 H4.6 L5.6,1 V3.6 L4.6,4.6 H1.4 L0.4,3.6 V1 Z M1.4,4.6 L0,6 V8.4 L1.6,10 H4.4 L6,8.4 V6 L4.6,4.6'],
  '9': [6, 'M1.6,10 L6,3.8 V1.6 L4.4,0 H1.6 L0,1.6 V3.8 L1.6,5.4 H4.85'],
  A: [6, 'M0,10 V2 L2,0 H4 L6,2 V10 M0,5.8 H6'],
  B: [6, 'M0,10 V0 H4.2 L5.6,1.4 V3.4 L4.4,4.6 H0 M4.4,4.6 L6,6.2 V8.6 L4.6,10 H0'],
  C: [6, 'M6,1.6 L4.4,0 H1.6 L0,1.6 V8.4 L1.6,10 H4.4 L6,8.4'],
  D: [6, 'M0,0 H4 L6,2 V8 L4,10 H0 Z'],
  E: [5.6, 'M5.6,0 H0 V10 H5.6 M0,4.8 H4.4'],
  F: [5.6, 'M5.6,0 H0 V10 M0,4.8 H4.4'],
  G: [6, 'M6,1.6 L4.4,0 H1.6 L0,1.6 V8.4 L1.6,10 H4.4 L6,8.4 V5.4 H3.4'],
  H: [6, 'M0,0 V10 M6,0 V10 M0,4.8 H6'],
  I: [1.2, 'M0.6,0 V10'],
  J: [5.6, 'M5.6,0 V8.4 L4,10 H1.6 L0,8.4 V7.2'],
  K: [6, 'M0,0 V10 M5.8,0 L0,6.2 M2.3,3.8 L6,10'],
  L: [5.4, 'M0,0 V10 H5.4'],
  M: [7.4, 'M0,10 V0 L3.7,6.2 L7.4,0 V10'],
  N: [6, 'M0,10 V0 L6,10 V0'],
  O: [6, 'M1.6,0 H4.4 L6,1.6 V8.4 L4.4,10 H1.6 L0,8.4 V1.6 Z'],
  P: [6, 'M0,10 V0 H4.4 L6,1.6 V4.2 L4.4,5.8 H0'],
  Q: [6, 'M1.6,0 H4.4 L6,1.6 V8.4 L4.4,10 H1.6 L0,8.4 V1.6 Z M3.6,7.6 L6.2,10.4'],
  R: [6, 'M0,10 V0 H4.4 L6,1.6 V4.2 L4.4,5.8 H0 M3.4,5.8 L6,10'],
  S: [6, 'M6,1.4 L4.6,0 H1.4 L0,1.4 V3.6 L1.2,4.8 H4.8 L6,6 V8.6 L4.6,10 H1.4 L0,8.6'],
  T: [6.2, 'M0,0 H6.2 M3.1,0 V10'],
  U: [6, 'M0,0 V8.4 L1.6,10 H4.4 L6,8.4 V0'],
  V: [6.4, 'M0,0 L3.2,10 L6.4,0'],
  W: [8, 'M0,0 L1.9,10 L4,2.4 L6.1,10 L8,0'],
  X: [6, 'M0,0 L6,10 M6,0 L0,10'],
  Y: [6.2, 'M0,0 L3.1,5.2 L6.2,0 M3.1,5.2 V10'],
  Z: [6, 'M0,0 H6 L0,10 H6'],
  ' ': [3.2, ''],
  '.': [1, 'M0.5,9.6 V10'],
  ',': [1.4, 'M1,9.4 L0.3,11.4'],
  ':': [1, 'M0.5,2.6 V3 M0.5,9.6 V10'],
  '/': [4, 'M0,10.4 L4,-0.4'],
  '-': [3.8, 'M0,5.4 H3.8'],
  '+': [5.2, 'M0,5.2 H5.2 M2.6,2.6 V7.8'],
  '%': [7.6, 'M0.6,10 L7,0 M0,0 H2.4 V3 H0 Z M5.2,7 H7.6 V10 H5.2 Z'],
  '!': [1, 'M0.5,0 V6.8 M0.5,9.6 V10'],
  '?': [5.6, 'M0,1.4 L1.4,0 H4.2 L5.6,1.4 V3.4 L2.8,5.6 V7 M2.8,9.6 V10'],
  "'": [1, 'M0.5,0 V2.6'],
  '°': [2.6, 'M0,0 H2.2 V2.2 H0 Z'],
  '#': [6.4, 'M2,0 L1.2,10 M5.2,0 L4.4,10 M0,3.4 H6.4 M0,6.6 H6.4'],
  '×': [4.4, 'M0,2.8 L4.4,7.2 M4.4,2.8 L0,7.2'],
  '(': [2.4, 'M2.4,-0.4 L0.6,1.6 V8.4 L2.4,10.4'],
  ')': [2.4, 'M0,-0.4 L1.8,1.6 V8.4 L0,10.4'],
  '[': [2.2, 'M2.2,-0.4 H0 V10.4 H2.2'],
  ']': [2.2, 'M0,-0.4 H2.2 V10.4 H0'],
  '|': [1, 'M0.5,-0.6 V10.6'],
  '<': [4.4, 'M4.4,1.4 L0,5 L4.4,8.6'],
  '>': [4.4, 'M0,1.4 L4.4,5 L0,8.6'],
  '_': [6, 'M0,10.4 H6'],
  '&': [6.6, 'M6.6,10 L1,3.4 V1.2 L2.2,0 H4 L5.2,1.2 V2.8 L0,6.6 V8.8 L1.2,10 H3.8 L6.4,6.6'],
  '•': [2.4, 'M0.4,4.4 H2 V6 H0.4 Z'],
  '·': [1.4, 'M0.7,5 V5.4'],
  '—': [7, 'M0,5.4 H7'],
};

/** Converte o caminho de um glifo em polilinhas [[x,y]…] (com flag `closed`). */
function parse(d) {
  const out = [];
  let cur = null, x = 0, y = 0;
  const tok = d.match(/[MLHVZ]|-?\d*\.?\d+/g) || [];
  let i = 0, cmd = 'M';
  const num = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[MLHVZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'M') {
      x = num(); y = num();
      cur = [[x, y]];
      out.push(cur);
      cmd = 'L';
    } else if (cmd === 'L') { x = num(); y = num(); cur.push([x, y]); }
    else if (cmd === 'H') { x = num(); cur.push([x, y]); }
    else if (cmd === 'V') { y = num(); cur.push([x, y]); }
    else if (cmd === 'Z') { cur.closed = true; }
  }
  return out;
}

const GLYPHS = {};
for (const [k, [w, d]] of Object.entries(G)) GLYPHS[k] = { w, lines: parse(d) };

/*
 * Face PESADA ("IRON HEAVY") para números e valores: o mesmo esqueleto,
 * alargado (counters abertos para o traço grosso não entupir) e com alguns
 * glifos redesenhados — '%' de estêncil, 'M'/'W' mais abertos, '1' sem
 * bandeira longa. É desenhada com traço ~2× mais grosso (ver svgText).
 */
const HX = 1.18;
const HEAVY_OVR = {
  '%': [9.2, 'M1.8,10 L7.4,0 M0.6,0.8 H1.8 V2.2 H0.6 Z M7.4,7.8 H8.6 V9.2 H7.4 Z'],
  M: [8.8, 'M0,10 V0 L4.4,5.6 L8.8,0 V10'],
  W: [9.6, 'M0,0 L2.2,10 L4.8,3.2 L7.4,10 L9.6,0'],
  '1': [5.2, 'M0.6,2.2 L3.4,0 V10'],
  '.': [1.4, 'M0.7,9.2 V10'],
  ':': [1.4, 'M0.7,2.4 V3.2 M0.7,9.2 V10'],
  '/': [4.6, 'M0,10.4 L4.6,-0.4'],
  '×': [5.4, 'M0.4,2.6 L5,7.4 M5,2.6 L0.4,7.4'],
};
const HEAVY = {};
for (const [k, g] of Object.entries(GLYPHS)) {
  if (HEAVY_OVR[k]) continue;
  const wide = g.w >= 4;
  const sx = wide ? HX : 1;
  HEAVY[k] = { w: g.w * sx, lines: g.lines.map((l) => Object.assign(l.map(([x, y]) => [x * sx, y]), { closed: l.closed })) };
}
for (const [k, [w, d]] of Object.entries(HEAVY_OVR)) HEAVY[k] = { w, lines: parse(d) };

const fallback = GLYPHS['?'];
const glyph = (ch, heavy) => (heavy && (HEAVY[ch] || HEAVY[ch.toUpperCase()])) || GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || fallback;

/** Largura em unidades (altura de caixa = 10) com espaçamento `tracking`. */
export function measure(str, tracking = 1.7, heavy = false) {
  let w = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) w += glyph(s[i], heavy).w + (i < s.length - 1 ? tracking : 0);
  return w;
}

/** Caminho SVG (string) do texto em unidades, a partir de x0. */
export function pathFor(str, tracking = 1.7, x0 = 0, heavy = false) {
  let x = x0, d = '';
  for (const ch of String(str)) {
    const g = glyph(ch, heavy);
    for (const l of g.lines) {
      d += `M${r(l[0][0] + x)},${r(l[0][1])}`;
      for (let j = 1; j < l.length; j++) d += `L${r(l[j][0] + x)},${r(l[j][1])}`;
      if (l.closed) d += 'Z';
    }
    x += g.w + tracking;
  }
  return d;
}
const r = (v) => Math.round(v * 100) / 100;

/**
 * Texto como <svg> inline. `size` = altura das maiúsculas em px.
 * weight: espessura do traço em unidades da grade (1 ≈ regular, 1.5 ≈ bold).
 */
export function svgText(str, { size = 14, weight = 1.05, tracking = 1.7, cls = '', fill = 'currentColor', heavy = false } = {}) {
  const s = String(str).toUpperCase();
  // piso de legibilidade: nada menor que 11 px de caixa-alta e traço de
  // pelo menos ~1,45 px (traços de 1 px cintilam/serrilham em 1080p)
  if (size < 11) size = 11;
  if (heavy) weight = Math.min(2.6, Math.max(weight * 1.55, 2.05));
  weight = Math.max(weight, 14.5 / size);
  // respiro mínimo entre glifos: o traço "quadrado" avança weight/2 de cada lado
  tracking = Math.max(tracking, weight + (heavy ? 1.1 : 0.7));
  const pad = weight; // margem para o traço não ser cortado
  const w = measure(s, tracking, heavy);
  const vw = w + pad * 2, vh = 10 + pad * 2;
  const k = size / 10;
  return `<svg class="ft ${cls}" width="${r(vw * k)}" height="${r(vh * k)}" viewBox="${-pad} ${-pad} ${r(vw)} ${r(vh)}" aria-label="${esc(s)}"><path d="${pathFor(s, tracking, 0, heavy)}" fill="none" stroke="${fill}" stroke-width="${weight}" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="3"/></svg>`;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Desenha texto num Canvas 2D. align: 'left' | 'center' | 'right'.
 * (x, y) = ponto da linha de base do lado do alinhamento… na verdade o TOPO
 * das maiúsculas: mais prático para HUD.
 */
export function drawText(g, str, x, y, { size = 12, weight = 1.05, tracking = 1.7, align = 'left', color = '#fff', heavy = false } = {}) {
  const s = String(str).toUpperCase();
  if (heavy) weight = Math.min(2.6, Math.max(weight * 1.55, 2.05));
  tracking = Math.max(tracking, weight + (heavy ? 1.1 : 0.7));
  const k = size / 10;
  const w = measure(s, tracking, heavy) * k;
  let x0 = x;
  if (align === 'center') x0 -= w / 2;
  else if (align === 'right') x0 -= w;
  g.save();
  g.translate(x0, y);
  g.scale(k, k);
  g.lineWidth = weight;
  g.lineCap = 'square';
  g.lineJoin = 'miter';
  g.miterLimit = 3;
  g.strokeStyle = color;
  g.beginPath();
  let cx = 0;
  for (const ch of s) {
    const gl = glyph(ch, heavy);
    for (const l of gl.lines) {
      g.moveTo(l[0][0] + cx, l[0][1]);
      for (let j = 1; j < l.length; j++) g.lineTo(l[j][0] + cx, l[j][1]);
      if (l.closed) g.closePath();
    }
    cx += gl.w + tracking;
  }
  g.stroke();
  g.restore();
  return w;
}
