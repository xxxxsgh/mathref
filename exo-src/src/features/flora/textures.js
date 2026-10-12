/**
 * TEXTURAS PROCEDURAIS DA FLORA — desenhadas em Canvas 2D no init (nada de
 * arquivos). Duas DataArrayTexture com as MESMAS camadas:
 *
 *   tAlb  rgb = albedo em tons de cinza levemente tingidos (a cor de verdade
 *               vem da paleta do bioma por vértice/instância), a = recorte
 *   tNrm  rg  = normal tangente (xy), b = espessura (translucidez),
 *         a   = máscara emissiva
 *
 * As cartas de folha usam alpha-test + alpha-to-coverage (MSAA do pipeline),
 * com correção de alfa por mip no shader (sem "folhagem que some" de longe).
 * A normal sai da luminância (nervuras e fibras em relevo) por Sobel.
 */
import * as THREE from 'three';
import { mulberry32 } from '../../core/Rng.js';

/** Índices de camada (compartilhados com os geradores). */
export const L = {
  BLADE: 0, // lâmina de grama (fibras longitudinais)
  BROAD: 1, // folha larga ovalada com nervuras
  FROND: 2, // fronde (folíolos diagonais) — palmeiras
  FERN: 3, // samambaia pinada
  FRILL: 4, // folha alienígena de borda franzida
  PETAL: 5, // cabeça de flor (pétalas radiais)
  CLUSTER: 6, // cacho de folhinhas (preenchimento de copa)
  BARK: 7, // casca (repete)
  CAP: 8, // topo do chapéu de fungo (costelas + pintas emissivas)
  GILL: 9, // lamelas sob o chapéu
  CRYSTAL: 10, // cristal (estrias + núcleo emissivo)
  ROCK: 11, // rocha (repete)
  SPIKE: 12, // folha espinhosa fina
  STEM: 13, // caule liso fibroso (repete)
  NEEDLE: 14, // ramo de agulhas
  BULB: 15, // bulbo translúcido com veios emissivos
};
export const LAYER_COUNT = 16;

// ─── utilidades de desenho ────────────────────────────────────────────
function fillNoise(g, S, rnd, alpha, scale = 1) {
  for (let i = 0; i < 2600 * scale; i++) {
    const x = rnd() * S, y = rnd() * S, r = 0.5 + rnd() * 2.2;
    const v = Math.floor(rnd() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(x, y, r, r);
  }
}

/** Contorno de folha simétrica ao longo do eixo vertical (base embaixo). */
function leafPath(g, S, widthFn, serr = 0, rnd = Math.random, steps = 64) {
  const cx = S / 2, top = S * 0.02, bot = S * 0.98;
  g.beginPath();
  g.moveTo(cx, bot);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let w = widthFn(t) * S * 0.48;
    if (serr) w *= 1 - serr * (0.5 + 0.5 * Math.sin(t * 90 + rnd() * 0.6)) * Math.min(1, t * 4);
    pts.push([w, bot - (bot - top) * t]);
  }
  for (const [w, y] of pts) g.lineTo(cx + w, y);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx - pts[i][0], pts[i][1]);
  g.closePath();
}

function veins(g, S, n, ang, width, light, rnd, curve = 0.15, len = 0.42) {
  const cx = S / 2;
  g.strokeStyle = light;
  g.lineCap = 'round';
  // nervura central
  g.lineWidth = width * 2.2;
  g.beginPath();
  g.moveTo(cx, S * 0.98);
  g.lineTo(cx, S * 0.04);
  g.stroke();
  g.lineWidth = width;
  for (let i = 0; i < n; i++) {
    const t = 0.08 + (i / n) * 0.84;
    const y = S * 0.98 - (S * 0.94) * t;
    for (const s of [-1, 1]) {
      const l = S * len * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (0.8 + rnd() * 0.3);
      g.beginPath();
      g.moveTo(cx, y);
      g.quadraticCurveTo(cx + s * l * 0.5, y - l * ang * 0.5, cx + s * l, y - l * ang - l * curve);
      g.stroke();
    }
  }
}

// ─── camadas ──────────────────────────────────────────────────────────
const DRAW = {
  [L.BLADE](g, S, rnd) {
    g.fillStyle = '#c8c8c8';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 140; i++) {
      const x = rnd() * S, v = 150 + rnd() * 105;
      g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(x, 0, 1 + rnd() * 3, S);
    }
    // nervura central clara + bordas mais escuras
    const gr = g.createLinearGradient(0, 0, S, 0);
    gr.addColorStop(0, 'rgba(40,40,40,0.55)');
    gr.addColorStop(0.2, 'rgba(0,0,0,0)');
    gr.addColorStop(0.47, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    gr.addColorStop(0.53, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.8, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(40,40,40,0.55)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  },
  [L.BROAD](g, S, rnd) {
    leafPath(g, S, (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) * 0.98, 0, rnd);
    const gr = g.createLinearGradient(0, S, 0, 0);
    gr.addColorStop(0, '#9a9a9a');
    gr.addColorStop(0.5, '#c4c4c4');
    gr.addColorStop(1, '#d8d8d8');
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.clip();
    fillNoise(g, S, rnd, 0.08);
    // borda levemente mais escura
    g.lineWidth = S * 0.03;
    g.strokeStyle = 'rgba(60,60,60,0.35)';
    g.stroke();
    veins(g, S, 11, 0.55, S * 0.006, 'rgba(255,255,255,0.55)', rnd, 0.12, 0.45);
    g.restore();
  },
  [L.FROND](g, S, rnd) {
    const cx = S / 2;
    g.strokeStyle = '#bdbdbd';
    g.lineCap = 'round';
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = 0.05 + (i / n) * 0.9;
      const y = S * 0.98 - S * 0.94 * t;
      const l = S * 0.46 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95));
      for (const s of [-1, 1]) {
        const v = 170 + rnd() * 60;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath();
        g.moveTo(cx, y);
        g.quadraticCurveTo(cx + s * l * 0.5, y - l * 0.45, cx + s * l, y - l * 0.6);
        g.quadraticCurveTo(cx + s * l * 0.45, y - l * 0.2, cx, y + S * 0.018);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx, y);
        g.quadraticCurveTo(cx + s * l * 0.5, y - l * 0.35, cx + s * l * 0.95, y - l * 0.58);
        g.stroke();
      }
    }
    g.strokeStyle = '#e0e0e0';
    g.lineWidth = S * 0.014;
    g.beginPath();
    g.moveTo(cx, S);
    g.lineTo(cx, S * 0.03);
    g.stroke();
  },
  [L.FERN](g, S, rnd) {
    const cx = S / 2;
    const n = 18;
    for (let i = 0; i < n; i++) {
      const t = 0.06 + (i / n) * 0.9;
      const y = S * 0.98 - S * 0.93 * t;
      const l = S * 0.44 * Math.sin(Math.PI * Math.min(1, 0.2 + t)) * (1 - t * 0.3);
      for (const s of [-1, 1]) {
        // pina com lóbulos
        const k = 6;
        for (let j = 0; j < k; j++) {
          const u = (j + 0.5) / k;
          const px = cx + s * l * u, py = y - l * 0.35 * u;
          const r = S * 0.022 * (1 - u * 0.6);
          const v = 165 + rnd() * 70;
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.beginPath();
          g.ellipse(px, py, r * 1.2, r, -s * 0.5, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = 'rgba(230,230,230,0.9)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx + s * l, y - l * 0.35);
        g.stroke();
      }
    }
    g.strokeStyle = '#d0d0d0';
    g.lineWidth = S * 0.012;
    g.beginPath();
    g.moveTo(cx, S);
    g.lineTo(cx, S * 0.03);
    g.stroke();
  },
  [L.FRILL](g, S, rnd) {
    leafPath(g, S, (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.7), 0.22, rnd, 160);
    const gr = g.createRadialGradient(S / 2, S, S * 0.05, S / 2, S * 0.5, S * 0.7);
    gr.addColorStop(0, '#707070');
    gr.addColorStop(0.6, '#b8b8b8');
    gr.addColorStop(1, '#f0f0f0');
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.clip();
    fillNoise(g, S, rnd, 0.06);
    // borda clara (franja que brilha contra o sol)
    g.lineWidth = S * 0.05;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.stroke();
    veins(g, S, 8, 0.9, S * 0.009, 'rgba(255,255,255,0.7)', rnd, 0.25, 0.5);
    g.restore();
  },
  [L.PETAL](g, S, rnd) {
    const cx = S / 2, cy = S / 2;
    const n = 9;
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < n; i++) {
        const a = ((i + k * 0.5) / n) * Math.PI * 2;
        const r = S * (k ? 0.3 : 0.47);
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        const gr = g.createLinearGradient(0, 0, 0, -r);
        gr.addColorStop(0, '#606060');
        gr.addColorStop(0.35, '#d8d8d8');
        gr.addColorStop(1, '#ffffff');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(r * 0.32, -r * 0.3, r * 0.26, -r * 0.9, 0, -r);
        g.bezierCurveTo(-r * 0.26, -r * 0.9, -r * 0.32, -r * 0.3, 0, 0);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -r * 0.9);
        g.stroke();
        g.restore();
      }
    }
    // miolo
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.09);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#888888');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, S * 0.09, 0, Math.PI * 2);
    g.fill();
  },
  [L.CLUSTER](g, S, rnd) {
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * S * 0.36;
      const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
      const v = 140 + rnd() * 110;
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2 + (rnd() - 0.5));
      g.fillStyle = `rgb(${v},${v},${v})`;
      const w = S * (0.04 + rnd() * 0.03), h = w * 2.2;
      g.beginPath();
      g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, -h);
      g.stroke();
      g.restore();
    }
  },
  [L.BARK](g, S, rnd) {
    g.fillStyle = '#8a8a8a';
    g.fillRect(0, 0, S, S);
    fillNoise(g, S, rnd, 0.18, 2);
    // fissuras verticais onduladas (repetem em x e y)
    for (let i = 0; i < 26; i++) {
      const x0 = rnd() * S, w = 1.5 + rnd() * 5, ph = rnd() * 6.28, amp = 3 + rnd() * 9;
      g.strokeStyle = `rgba(20,20,20,${0.35 + rnd() * 0.4})`;
      g.lineWidth = w;
      for (const off of [-S, 0, S]) {
        g.beginPath();
        for (let y = 0; y <= S; y += 8) {
          const x = x0 + off + Math.sin((y / S) * Math.PI * 4 + ph) * amp;
          if (y === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.08})`;
      g.fillRect(rnd() * S, rnd() * S, 4 + rnd() * 20, 2 + rnd() * 4);
    }
  },
  [L.CAP](g, S, rnd) {
    g.fillStyle = '#b4b4b4';
    g.fillRect(0, 0, S, S);
    fillNoise(g, S, rnd, 0.1);
    // costelas radiais: o chapéu usa u = ângulo, v = raio → listras verticais
    for (let i = 0; i < 48; i++) {
      const x = (i / 48) * S;
      g.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.15})`;
      g.fillRect(x, 0, S / 96, S);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x + S / 96, 0, S / 140, S);
    }
    // anéis concêntricos
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.08})`;
      g.fillRect(0, (i / 9) * S + rnd() * 10, S, 3 + rnd() * 6);
    }
  },
  [L.GILL](g, S, rnd) {
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 128; i++) {
      const x = (i / 128) * S;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)';
      g.fillRect(x, 0, S / 256, S);
    }
  },
  [L.CRYSTAL](g, S, rnd) {
    const gr = g.createLinearGradient(0, 0, S, 0);
    gr.addColorStop(0, '#9a9a9a');
    gr.addColorStop(0.5, '#ececec');
    gr.addColorStop(1, '#9a9a9a');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.25})`;
      g.fillRect(rnd() * S, 0, 1 + rnd() * 3, S);
    }
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.3})`;
      g.lineWidth = 1;
      g.beginPath();
      const x = rnd() * S, y = rnd() * S;
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 160);
      g.stroke();
    }
  },
  [L.ROCK](g, S, rnd) {
    g.fillStyle = '#8c8c8c';
    g.fillRect(0, 0, S, S);
    fillNoise(g, S, rnd, 0.25, 4);
    for (let i = 0; i < 80; i++) {
      const v = rnd() > 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${0.04 + rnd() * 0.07})`;
      g.beginPath();
      g.arc(rnd() * S, rnd() * S, 6 + rnd() * 40, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(30,30,30,${0.2 + rnd() * 0.3})`;
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      let x = rnd() * S, y = rnd() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 70;
        y += (rnd() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  [L.SPIKE](g, S, rnd) {
    leafPath(g, S, (t) => Math.pow(1 - t, 0.9) * Math.min(1, t * 8) * 0.55, 0, rnd);
    const gr = g.createLinearGradient(0, S, 0, 0);
    gr.addColorStop(0, '#808080');
    gr.addColorStop(1, '#e8e8e8');
    g.fillStyle = gr;
    g.fill();
    g.save();
    g.clip();
    for (let i = 0; i < 10; i++) {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, (i / 10) * S, S, S * 0.018);
    }
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = S * 0.012;
    g.beginPath();
    g.moveTo(S / 2, S);
    g.lineTo(S / 2, 0);
    g.stroke();
    g.restore();
  },
  [L.STEM](g, S, rnd) {
    g.fillStyle = '#b0b0b0';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const v = 120 + rnd() * 135;
      g.fillStyle = `rgba(${v},${v},${v},0.3)`;
      g.fillRect(rnd() * S, 0, 1 + rnd() * 4, S);
    }
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.1})`;
      g.fillRect(0, rnd() * S, S, 2 + rnd() * 8);
    }
  },
  [L.NEEDLE](g, S, rnd) {
    const cx = S / 2;
    g.strokeStyle = '#cfcfcf';
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const t = 0.05 + (i / 70) * 0.9;
      const y = S * 0.98 - S * 0.94 * t;
      const l = S * 0.4 * (1 - t * 0.6);
      const v = 160 + rnd() * 90;
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = 2.2;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx + s * l, y - l * 0.55);
        g.stroke();
      }
    }
    g.strokeStyle = '#999';
    g.lineWidth = S * 0.015;
    g.beginPath();
    g.moveTo(cx, S);
    g.lineTo(cx, 0);
    g.stroke();
  },
  [L.BULB](g, S, rnd) {
    g.fillStyle = '#c8c8c8';
    g.fillRect(0, 0, S, S);
    fillNoise(g, S, rnd, 0.08);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 2 + rnd() * 3;
      g.beginPath();
      let x = (i / 14) * S;
      g.moveTo(x, S);
      for (let y = S; y >= 0; y -= 16) {
        x += (rnd() - 0.5) * 10;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
};

/** Máscara emissiva por camada (canal a de tNrm). */
const EMISSIVE = {
  [L.CAP](g, S, rnd) {
    // pintas luminosas
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S, y = S * (0.15 + rnd() * 0.7), r = 6 + rnd() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  },
  [L.GILL](g, S) {
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(255,255,255,0.05)');
    gr.addColorStop(1, 'rgba(255,255,255,0.7)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  },
  [L.CRYSTAL](g, S) {
    const gr = g.createLinearGradient(0, 0, S, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.15)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0.15)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  },
  [L.PETAL](g, S) {
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.4)');
    gr.addColorStop(1, 'rgba(255,255,255,0.1)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  },
  [L.BULB](g, S, rnd) {
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      let x = (i / 14) * S;
      g.moveTo(x, S);
      for (let y = S; y >= 0; y -= 16) {
        x += (rnd() - 0.5) * 10;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
};

/** Espessura (translucidez) por camada: 0 opaco, 1 folha fina. */
const THICK = {
  [L.BLADE]: 0.9, [L.BROAD]: 0.85, [L.FROND]: 0.9, [L.FERN]: 0.9, [L.FRILL]: 1.0, [L.PETAL]: 1.0,
  [L.CLUSTER]: 0.8, [L.BARK]: 0, [L.CAP]: 0.25, [L.GILL]: 0.6, [L.CRYSTAL]: 0.7, [L.ROCK]: 0,
  [L.SPIKE]: 0.6, [L.STEM]: 0.15, [L.NEEDLE]: 0.6, [L.BULB]: 0.9,
};
/** Camadas que repetem (sem recorte). */
const TILED = new Set([L.BLADE, L.BARK, L.CAP, L.GILL, L.CRYSTAL, L.ROCK, L.STEM, L.BULB]);

function makeCanvas(S) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
  return c;
}

/**
 * Gera as duas texturas-array. `size` 512 (alta) ou 256.
 * @returns {{ tAlb: THREE.DataArrayTexture, tNrm: THREE.DataArrayTexture, size: number }}
 */
export function buildFloraTextures(size = 512, anisotropy = 4) {
  const S = size;
  const alb = new Uint8Array(S * S * 4 * LAYER_COUNT);
  const nrm = new Uint8Array(S * S * 4 * LAYER_COUNT);
  const c = makeCanvas(S);
  const g = c.getContext('2d', { willReadFrequently: true });
  const lum = new Float32Array(S * S);
  for (let layer = 0; layer < LAYER_COUNT; layer++) {
    const rnd = mulberry32(1000 + layer * 77);
    g.clearRect(0, 0, S, S);
    g.save();
    DRAW[layer]?.(g, S, rnd);
    g.restore();
    const img = g.getImageData(0, 0, S, S).data;
    const tiled = TILED.has(layer);
    // dilata a cor para os texels transparentes (sem franja escura nos mips)
    const base = layer * S * S * 4;
    for (let i = 0; i < S * S; i++) {
      const a = img[i * 4 + 3];
      const l = (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]) / 765;
      lum[i] = a > 8 ? l : -1;
      alb[base + i * 4] = img[i * 4];
      alb[base + i * 4 + 1] = img[i * 4 + 1];
      alb[base + i * 4 + 2] = img[i * 4 + 2];
      alb[base + i * 4 + 3] = tiled ? 255 : a;
    }
    if (!tiled) {
      // preenche rgb dos texels vazios com a média da folha (evita borda preta no mip)
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < S * S; i++) {
        if (img[i * 4 + 3] > 128) {
          sr += img[i * 4];
          sg += img[i * 4 + 1];
          sb += img[i * 4 + 2];
          n++;
        }
      }
      if (n) {
        sr /= n; sg /= n; sb /= n;
        for (let i = 0; i < S * S; i++) {
          if (img[i * 4 + 3] < 16) {
            alb[base + i * 4] = sr;
            alb[base + i * 4 + 1] = sg;
            alb[base + i * 4 + 2] = sb;
          }
        }
      }
    }
    // emissivo
    g.clearRect(0, 0, S, S);
    let emi = null;
    if (EMISSIVE[layer]) {
      g.save();
      EMISSIVE[layer](g, S, mulberry32(5000 + layer));
      g.restore();
      emi = g.getImageData(0, 0, S, S).data;
    }
    // normal por Sobel da luminância (repete nas bordas para as camadas que repetem)
    const thick = THICK[layer] ?? 0;
    const k = tiled ? 2.2 : 3.0;
    const at = (x, y) => {
      if (tiled) {
        x = (x + S) % S;
        y = (y + S) % S;
      } else {
        x = Math.max(0, Math.min(S - 1, x));
        y = Math.max(0, Math.min(S - 1, y));
      }
      const v = lum[y * S + x];
      return v < 0 ? 0.35 : v;
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * k;
        const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * k;
        let nx = -dx, ny = dy, nz = 1;
        const il = 1 / Math.hypot(nx, ny, nz);
        nx *= il;
        ny *= il;
        const i = y * S + x;
        const o = base + i * 4;
        nrm[o] = Math.round((nx * 0.5 + 0.5) * 255);
        nrm[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        // espessura: nervuras (claras) um pouco mais grossas
        const l = lum[i] < 0 ? 0.5 : lum[i];
        nrm[o + 2] = Math.round(Math.max(0, Math.min(1, thick * (1.15 - l * 0.4))) * 255);
        nrm[o + 3] = emi ? emi[i * 4 + 3] : 0;
      }
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataArrayTexture(data, S, S, LAYER_COUNT);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = anisotropy;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { tAlb: mk(alb, true), tNrm: mk(nrm, false), size: S };
}
