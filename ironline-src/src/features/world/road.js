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

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Altura (canvas cinza) → DataTexture normal. */
function heightNormal(c, strength) {
  const w = c.width, h = c.height;
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

/**
 * Cratera de morteiro no asfalto: placas levantadas em anel (inclinadas
 * para fora), terra revolvida no centro, queimado e respingos radiais.
 */
export function crater(W, x, z, r = 1.2) {
  const { B, I, rng } = W;
  decal(B, 'scorch', [x, 0.015, z], 'py', [r * 5, r * 5], [0, 0, 1, 1], rng.range(0, 6));
  decal(B, 'stains', [x, 0.017, z], 'py', [r * 2.4, r * 2.4], [0.5, 0.5, 1, 1], rng.range(0, 6), [0.55, 0.52, 0.5]);
  // centro: terra/cascalho revolvido (disco irregular baixo)
  const n = 18;
  const pos = [];
  const pt = (a, rr, yy) => [x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr];
  const jag = Array.from({ length: n }, () => rng.range(0.75, 1.0));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const r0 = r * 0.72 * jag[i], r1 = r * 0.72 * jag[(i + 1) % n];
    pos.push(...pt(0, 0, 0.035), ...pt(a1, r1, 0.02), ...pt(a0, r0, 0.02));
    pos.push(...pt(a0, r0, 0.02), ...pt(a1, r1, 0.02), ...pt(a1, r1 * 1.12, -0.01));
    pos.push(...pt(a0, r0, 0.02), ...pt(a1, r1 * 1.12, -0.01), ...pt(a0, r0 * 1.12, -0.01));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  B.add(g, 'rubbleD', null, { color: [0.55, 0.5, 0.45] });
  // anel de placas de asfalto levantadas
  const m = Math.round(r * 9);
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const d = r * rng.range(0.75, 1.05);
    const s = rng.range(0.25, 0.5);
    const M = mat4([x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d], [0, -a, rng.range(0.25, 0.6)], [s, 0.6, s * 0.8]);
    // inclina para fora: rotação em torno do eixo tangente (via Euler YXZ com yaw = -a)
    I.add('rslab' + (i % 4), slabGeo(i % 4), 'asphalt', M, [0.8, 0.8, 0.8]);
  }
  // respingos de pedras em volta
  for (let i = 0; i < Math.round(r * 16); i++) {
    const a = rng.range(0, Math.PI * 2), d = r * rng.range(1.0, 2.6);
    const s = rng.range(0.03, 0.09);
    const v = rng.int(0, 7);
    I.add('rchunk' + v, chunkGeo(v), 'rubbleC', mat4([x + Math.cos(a) * d, s * 0.25, z + Math.sin(a) * d], [rng.range(0, 6), rng.range(0, 6), 0], s), [0.45, 0.43, 0.4], { shadow: false });
  }
}
