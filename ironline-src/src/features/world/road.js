/**
 * Detalhes de rua com geometria: tampas de bueiro de ferro fundido (relevo
 * em normal map, aro de concreto), grelhas de boca de lobo no meio-fio e
 * crateras de morteiro (borda de placas de asfalto levantadas, centro de
 * terra revolvida, queimado e respingos radiais).
 */
import * as THREE from 'three';
import { mulberry } from './noise.js';
import { cached, mat4 } from './geo.js';
import { decal } from './shapes.js';
import { slabGeo, chunkGeo } from './rubble.js';

// canvas na escala da camada do aparelho (decals.js → setCanvasScale)
import { canvas } from './decals.js';

/** Altura (canvas cinza) → DataTexture normal. */
function heightNormal(c, strength) {
  const w = c.width, h = c.height;
  strength *= c.__k || 1; // canvas reduzido pela camada do aparelho
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = ((h - 1 - y) * w + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(out, w, h);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Tampa de ferro fundido (atlas: esquerda = tampa redonda, direita = grelha). */
export function ironTextures(seed = 61) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 512);
  const [hc, hg] = canvas(1024, 512);
  hg.fillStyle = 'rgb(128,128,128)'; hg.fillRect(0, 0, 1024, 512);
  // ── tampa redonda ──
  const cx = 256, cy = 256;
  g.fillStyle = '#2b2925'; g.fillRect(0, 0, 512, 512);
  // anel externo
  g.strokeStyle = '#3a3630'; g.lineWidth = 22; g.beginPath(); g.arc(cx, cy, 236, 0, 7); g.stroke();
  hg.strokeStyle = 'rgb(200,200,200)'; hg.lineWidth = 20; hg.beginPath(); hg.arc(cx, cy, 236, 0, 7); hg.stroke();
  // grade de losangos em relevo
  g.save(); g.beginPath(); g.arc(cx, cy, 218, 0, 7); g.clip();
  hg.save(); hg.beginPath(); hg.arc(cx, cy, 218, 0, 7); hg.clip();
  for (let y = -10; y < 520; y += 28) {
    for (let x = -10; x < 520; x += 28) {
      const ox = x + ((y / 28) % 2 ? 14 : 0);
      g.fillStyle = `rgb(${58 + r() * 14},${54 + r() * 12},${48 + r() * 10})`;
      g.beginPath(); g.moveTo(ox, y - 9); g.lineTo(ox + 9, y); g.lineTo(ox, y + 9); g.lineTo(ox - 9, y); g.fill();
      hg.fillStyle = 'rgb(210,210,210)';
      hg.beginPath(); hg.moveTo(ox, y - 9); hg.lineTo(ox + 9, y); hg.lineTo(ox, y + 9); hg.lineTo(ox - 9, y); hg.fill();
    }
  }
  g.restore(); hg.restore();
  // faixa central com letras
  g.fillStyle = '#2b2925'; g.fillRect(cx - 150, cy - 34, 300, 68);
  hg.fillStyle = 'rgb(128,128,128)'; hg.fillRect(cx - 150, cy - 34, 300, 68);
  g.font = 'bold 44px "DejaVu Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#5a554c'; g.fillText('ВОДОКАНАЛ', cx, cy + 2);
  hg.font = 'bold 44px "DejaVu Sans", sans-serif'; hg.textAlign = 'center'; hg.textBaseline = 'middle';
  hg.fillStyle = 'rgb(205,205,205)'; hg.fillText('ВОДОКАНАЛ', cx, cy + 2);
  // ferrugem e polimento por pneus
  for (let k = 0; k < 90; k++) {
    const x = r() * 512, y = r() * 512, rr = 6 + r() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, `rgba(${r() < 0.6 ? '110,55,25' : '140,135,125'},${0.12 + r() * 0.2})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // ── grelha de boca de lobo ──
  g.fillStyle = '#1d1b18'; g.fillRect(512, 0, 512, 512);
  for (let x = 540; x < 1000; x += 40) {
    g.fillStyle = '#4a4640'; g.fillRect(x, 20, 22, 472);
    hg.fillStyle = 'rgb(220,220,220)'; hg.fillRect(x, 20, 22, 472);
  }
  g.fillStyle = '#4a4640'; g.fillRect(512, 0, 512, 20); g.fillRect(512, 492, 512, 20);
  hg.fillStyle = 'rgb(220,220,220)'; hg.fillRect(512, 0, 512, 20); hg.fillRect(512, 492, 512, 20);
  hg.fillStyle = 'rgb(20,20,20)';
  for (let x = 562; x < 1000; x += 40) hg.fillRect(x, 20, 18, 472);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return { map, normalMap: heightNormal(hc, 4) };
}

/** Tampa de bueiro redonda com aro de concreto. */
export function manhole(W, x, z, opts = {}) {
  const { B, rng } = W;
  const y = opts.y ?? 0;
  const disc = cached('manholeDisc', () => {
    const g = new THREE.CircleGeometry(0.34, 28);
    g.rotateX(-Math.PI / 2);
    const U = g.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 0.5, U.getY(i));
    return g;
  });
  const ring = cached('manholeRing', () => {
    const g = new THREE.RingGeometry(0.34, 0.47, 28, 1);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  B.add(disc, 'iron', mat4([x, y + 0.006, z], [0, rng.range(0, 6.28), 0]), { worldUV: false, color: [1, 1, 1] });
  B.add(ring, 'asphalt', mat4([x, y + 0.004, z]), { color: [0.5, 0.48, 0.45] });
  decal(B, 'stains', [x, y + 0.003, z], 'py', [1.4, 1.4], [0, 0, 0.5, 0.5], rng.range(0, 6), [0.8, 0.8, 0.8]);
}

/** Grelha de boca de lobo junto ao meio-fio (normal 'px'|'nx' = lado da calçada). */
export function drainGrate(W, x, z, side) {
  const { B } = W;
  const g = cached('grate', () => {
    const p = new THREE.PlaneGeometry(0.42, 0.9);
    p.rotateX(-Math.PI / 2);
    const U = p.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setXY(i, 0.5 + U.getX(i) * 0.5, U.getY(i));
    return p;
  });
  B.add(g, 'iron', mat4([x, 0.007, z]), { worldUV: false, color: [0.9, 0.9, 0.9] });
  // abertura escura no meio-fio
  B.box(side > 0 ? x + 0.2 : x - 0.24, 0.01, z - 0.4, side > 0 ? x + 0.24 : x - 0.2, 0.11, z + 0.4, 'black', { collide: false });
  decal(B, 'stains', [x - side * 0.3, 0.012, z], 'py', [1.2, 2.4], [0, 0, 0.5, 0.5], 0, [0.7, 0.7, 0.7]);
}

/** Contorno irregular da boca da cratera (determinístico pela semente). */
export function craterOutline([x, z, r, seed]) {
  const rr = mulberry(900 + seed * 31);
  const n = 22, out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = r * 0.78 * (0.82 + rr() * 0.3 + Math.sin(a * 3 + seed) * 0.06);
    out.push([x + Math.cos(a) * k, z + Math.sin(a) * k]);
  }
  return out;
}

/**
 * Cratera de morteiro no asfalto — com PROFUNDIDADE: o asfalto da fatia tem
 * um furo (layout.js) e aqui entra a bacia: borda com a camada de asfalto
 * (5 cm) em corte, base de brita e terra revolvida descendo até ~35 cm,
 * poça no fundo, placas de asfalto levantadas e tombadas em anel, queimado
 * radial e respingos de pedra.
 */
export function crater(W, c) {
  const { B, I, rng } = W;
  const [x, z, r] = c;
  const outline = craterOutline(c);
  const depth = 0.22 + r * 0.1;
  decal(B, 'scorch', [x, 0.015, z], 'py', [r * 5, r * 5], [0, 0, 1, 1], rng.range(0, 6));
  decal(B, 'stains', [x, 0.017, z], 'py', [r * 2.4, r * 2.4], [0.5, 0.5, 1, 1], rng.range(0, 6), [0.4, 0.38, 0.36]);
  // bacia: anéis do contorno (y = 0) até o fundo, perfil em "tigela" com ruído
  const rings = 7, n = outline.length;
  const P = (i, k) => {
    const t = k / rings;
    const [ox, oz] = outline[i % n];
    const rad = 1 - t;
    const nz = Math.sin(i * 1.7 + k * 2.3 + c[3]) * 0.03 + Math.sin(i * 4.1 - k * 1.3) * 0.02;
    const y = k === 0 ? 0.0 : k === 1 ? -0.06 : -depth * Math.pow(Math.sin((t * Math.PI) / 2), 0.8) + nz;
    const sc = k === 1 ? 0.97 : rad * (1 + nz);
    return [x + (ox - x) * sc, y, z + (oz - z) * sc];
  };
  const bowl = [], lip = [];
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < n; i++) {
      const a = P(i, k), b = P(i + 1, k), cc = P(i + 1, k + 1), d = P(i, k + 1);
      (k === 0 ? lip : bowl).push(...a, ...cc, ...b, ...a, ...d, ...cc);
    }
  }
  // bacia: terra revolvida marrom (umidade/sombra no fundo), sem anel claro;
  // a borda (corte do asfalto) no mesmo tom da pista, só um pouco queimada
  for (const [pos, mat, col] of [[bowl, 'rubbleD', (p) => { const t = Math.min(1, -p.y / depth); return [0.5 - t * 0.16, 0.43 - t * 0.14, 0.35 - t * 0.12]; }], [lip, 'asphalt', [0.72, 0.7, 0.67]]]) {
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    B.add(g, mat, null, { color: col, at: [x, z] });
  }
  // poça de água suja no fundo (espelha o céu)
  const pr = r * rng.range(0.22, 0.32);
  B.add(cached('puddleDisc', () => new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)), 'puddle', mat4([x + rng.range(-0.1, 0.1), -depth + 0.04, z + rng.range(-0.1, 0.1)], [0, rng.range(0, 6), 0], [pr * 1.3, 1, pr]), { color: [1, 1, 1] });
  // pedras no fundo e na encosta
  for (let i = 0; i < Math.round(r * 14); i++) {
    const a = rng.range(0, Math.PI * 2), d = r * 0.7 * Math.sqrt(rng.next());
    const t = d / (r * 0.78);
    const yy = -depth * Math.pow(Math.cos((t * Math.PI) / 2), 0.8);
    const s = rng.range(0.04, 0.12);
    const v = rng.int(0, 7);
    I.add('rchunk' + v, chunkGeo(v), 'rubbleC', mat4([x + Math.cos(a) * d, yy + s * 0.2, z + Math.sin(a) * d], [rng.range(0, 6), rng.range(0, 6), 0], s), rng.chance(0.4) ? [0.26, 0.24, 0.22] : [0.44, 0.4, 0.35], { shadow: false });
  }
  // anel de placas de asfalto levantadas, inclinadas para fora
  // duas voltas: placas grandes levantadas na boca + lascas menores tombadas
  // para fora (a explosão empurra o asfalto em "pétalas")
  const m = Math.round(r * 13);
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const outer = i % 3 === 2;
    const d = r * (outer ? rng.range(1.05, 1.5) : rng.range(0.74, 0.98));
    const s = outer ? rng.range(0.14, 0.3) : rng.range(0.28, 0.55);
    const tilt = outer ? rng.range(0.05, 0.3) : rng.range(0.35, 0.85);
    const M = mat4([x + Math.cos(a) * d, outer ? 0.012 : 0.04 + s * 0.08, z + Math.sin(a) * d], [rng.range(-0.1, 0.1), -a + rng.range(-0.3, 0.3), tilt], [s, 0.42, s * rng.range(0.6, 0.9)]);
    // placas cobertas do pó da explosão (não lâminas pretas): tom do asfalto velho
    // asfalto velho é escuro (albedo ~0,1–0,15): placas claras liam como papel
    I.add('aslab' + (i % 4), slabGeo(i % 4), 'rubbleA', M, outer ? [0.62, 0.6, 0.57] : [0.52, 0.5, 0.48]);
  }
  // respingos de pedras em volta
  for (let i = 0; i < Math.round(r * 16); i++) {
    const a = rng.range(0, Math.PI * 2), d = r * rng.range(1.0, 2.6);
    const s = rng.range(0.03, 0.09);
    const v = rng.int(0, 7);
    I.add('rchunk' + v, chunkGeo(v), 'rubbleC', mat4([x + Math.cos(a) * d, s * 0.25, z + Math.sin(a) * d], [rng.range(0, 6), rng.range(0, 6), 0], s), rng.chance(0.5) ? [0.3, 0.29, 0.28] : [0.46, 0.42, 0.37], { shadow: false });
  }
}
