import * as THREE from 'three';
import { mulberry32 } from '../core/Rng.js';

/**
 * Texturas procedurais da arena, desenhadas em canvas uma única vez.
 * Sem arquivos de imagem: o jogo inteiro roda sem assets externos.
 */

/** @param {number} size @param {(ctx: CanvasRenderingContext2D, s: number) => void} draw */
function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, s, rng, count, alpha, light = false) {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rng() * alpha})`;
    const r = rng() * 2 + 0.5;
    ctx.fillRect(rng() * s, rng() * s, r, r);
  }
}

/** Piso: placas de concreto 2 m com juntas e manchas. */
export function floorTexture() {
  return canvasTexture(512, (ctx, s) => {
    const rng = mulberry32(11);
    ctx.fillStyle = '#6b7077';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const g = 100 + Math.floor(rng() * 14);
        ctx.fillStyle = `rgb(${g},${g + 4},${g + 9})`;
        ctx.fillRect(i * (s / 2) + 2, j * (s / 2) + 2, s / 2 - 4, s / 2 - 4);
      }
    }
    speckle(ctx, s, rng, 5000, 0.18);
    speckle(ctx, s, rng, 2500, 0.08, true);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `rgba(30,30,30,${0.04 + rng() * 0.05})`;
      ctx.beginPath();
      ctx.arc(rng() * s, rng() * s, 10 + rng() * 50, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(20,22,26,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
  });
}

/** Parede: painéis verticais com faixa de rodapé. */
export function wallTexture(base = '#b9bec4', stripe = '#2b3036') {
  return canvasTexture(512, (ctx, s) => {
    const rng = mulberry32(23);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rng, 4000, 0.1);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= s; x += s / 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
    ctx.fillStyle = stripe;
    ctx.fillRect(0, s - 40, s, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, s - 44, s, 4);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(40,30,20,${rng() * 0.12})`;
      ctx.fillRect(rng() * s, s - 60 - rng() * 120, 2 + rng() * 3, 30 + rng() * 80);
    }
  });
}

/** Caixote metálico com chevrons. */
export function crateTexture(color = '#c96a2c') {
  return canvasTexture(256, (ctx, s) => {
    const rng = mulberry32(37);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rng, 1500, 0.15);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, s - 10, s - 10);
    ctx.lineWidth = 3;
    for (let y = 30; y < s - 20; y += 22) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(s - 18, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(10, 10, s - 20, 4);
  });
}

/** Faixa de perigo amarela/preta para bordas e plataforma. */
export function hazardTexture() {
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#1b1d20';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e4b322';
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 - s, s);
      ctx.lineTo(i - s, s);
      ctx.fill();
    }
  });
}

/** Marca de impacto de bala (sem repetição). */
export function bulletHoleTexture() {
  return canvasTexture(
    64,
    (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(0.18, 'rgba(10,10,10,0.9)');
      g.addColorStop(0.35, 'rgba(40,40,40,0.5)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** Clarão circular suave (flash de cano, faíscas). */
export function glowTexture() {
  return canvasTexture(
    64,
    (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(0.25, 'rgba(255,210,120,0.85)');
      g.addColorStop(0.6, 'rgba(255,120,40,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** Estrela de 4 pontas para o flash do cano visto de frente. */
export function flashStarTexture() {
  return canvasTexture(
    128,
    (ctx, s) => {
      ctx.translate(s / 2, s / 2);
      for (let k = 0; k < 2; k++) {
        ctx.rotate((Math.PI / 4) * k);
        const g = ctx.createLinearGradient(-s / 2, 0, s / 2, 0);
        g.addColorStop(0, 'rgba(255,170,60,0)');
        g.addColorStop(0.5, 'rgba(255,240,200,1)');
        g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, s / 2, s / (k ? 14 : 9), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const r = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 4);
      r.addColorStop(0, 'rgba(255,255,230,1)');
      r.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = r;
      ctx.fillRect(-s / 2, -s / 2, s, s);
    },
    false,
  );
}
