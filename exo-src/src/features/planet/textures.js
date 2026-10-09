/**
 * TEXTURAS PROCEDURAIS de detalhe do terreno (puro — gerado no worker).
 *
 * Camadas (ladrilháveis, ruído periódico):
 *   0 rocha   — fraturas (Voronoi F2−F1), lascas, grão; altura alta nas lascas
 *   1 solo    — "grama"/cobertura vista de perto: tufos, fibras, manchas
 *   2 areia   — ondulações (vento) + grão
 *   3 neve    — montes suaves, sulcos de vento, cristais
 *
 * Para cada camada saem DUAS imagens RGBA8:
 *   albedo: RGB = detalhe (luminância ~0,5 — o shader multiplica pela cor do
 *           bioma ×2), A = altura (blend por altura entre camadas)
 *   normal: RG = normal tangente (0..1), B = rugosidade, A = cavidade/oclusão
 * E uma textura MACRO (RGBA): ruído de baixa frequência em 4 canais para
 * variação anti-repetição.
 */
import { pfbm2, pnoise2, pvoronoi2, clamp, smoothstep } from './noise.js';

export const LAYERS = ['rock', 'ground', 'sand', 'snow'];

function heightToNormal(H, S, strength, out, rough, cav) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xl = (x - 1 + S) % S, xr = (x + 1) % S, yd = (y - 1 + S) % S, yu = (y + 1) % S;
      const dx = (H[y * S + xr] - H[y * S + xl]) * strength;
      const dy = (H[yu * S + x] - H[yd * S + x]) * strength;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (y * S + x) * 4;
      out[o] = clamp((-dx * l * 0.5 + 0.5) * 255, 0, 255);
      out[o + 1] = clamp((-dy * l * 0.5 + 0.5) * 255, 0, 255);
      out[o + 2] = clamp(rough[y * S + x] * 255, 0, 255);
      // cavidade: altura menor que a vizinhança
      const avg = (H[y * S + xr] + H[y * S + xl] + H[yu * S + x] + H[yd * S + x]) * 0.25;
      out[o + 3] = clamp((1 - Math.max(0, avg - H[y * S + x]) * cav) * 255, 0, 255);
    }
  }
}

/** payload: { layer, size, seed } → { albedo: Uint8Array, normal: Uint8Array } */
export function buildLayer({ layer, size, seed }) {
  const S = size;
  const H = new Float32Array(S * S);
  const rough = new Float32Array(S * S);
  const alb = new Uint8Array(S * S * 4);
  const nrm = new Uint8Array(S * S * 4);
  const vo = [0, 0, 0], vo2 = [0, 0, 0];
  const s = seed | 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const i = y * S + x;
      let h = 0, r = 0.5, g = 0.5, b = 0.5, ro = 0.9;
      if (layer === 0) {
        // rocha: massa fBm + veios "ridged" + fraturas suaves em 2 escalas + grão
        const wx = 0.12 * pfbm2(u, v, 3, 3, s + 1), wy = 0.12 * pfbm2(u, v, 3, 3, s + 2);
        pvoronoi2(u + wx, v + wy, 4, s + 3, vo);
        const crack = smoothstep(0.0, 0.07, vo[1] - vo[0]);
        pvoronoi2(u + wx * 0.5, v + wy * 0.5, 11, s + 4, vo2);
        const chip = smoothstep(0.0, 0.06, vo2[1] - vo2[0]);
        const big = pfbm2(u + wx, v + wy, 2, 6, s + 5);
        const ridge = 1 - Math.abs(pfbm2(u + wx * 2, v, 5, 4, s + 8)) * 2.2;
        const fine = pfbm2(u, v, 24, 4, s + 6);
        const plate = ((vo[2] >>> 8) & 255) / 255 - 0.5;
        h = 0.5 + big * 0.5 + ridge * 0.14 + fine * 0.26 + (chip - 1) * 0.12 + (crack - 1) * 0.3 + plate * 0.1;
        const lum = 0.46 + big * 0.36 + ridge * 0.1 + fine * 0.26 + plate * 0.1 - (1 - crack) * 0.2 - (1 - chip) * 0.08;
        const warm = pfbm2(u, v, 2, 3, s + 7) * 0.14;
        r = lum * (1 + warm);
        g = lum;
        b = lum * (1 - warm * 0.8);
        ro = 0.8 + 0.15 * (1 - crack);
      } else if (layer === 1) {
        // solo/vegetação rasteira: tufos e fibras em várias escalas
        const clump = pfbm2(u, v, 6, 3, s + 11);
        const tuft = pfbm2(u, v, 24, 3, s + 12);
        const fib = pnoise2(u * 96, v * 24, 96, s + 13) * 0.5 + pnoise2(u * 40, v * 128, 128, s + 14) * 0.5;
        h = 0.5 + clump * 0.35 + tuft * 0.35 + fib * 0.25;
        const lum = 0.45 + clump * 0.18 + tuft * 0.2 + fib * 0.15;
        const hue = pfbm2(u, v, 4, 2, s + 15) * 0.18;
        r = lum * (1 + hue);
        g = lum * (1 + hue * 0.3);
        b = lum * (1 - hue * 0.5);
        ro = 0.95;
      } else if (layer === 2) {
        // areia: ondulações de vento (período inteiro → ladrilha) + grão
        const w = pfbm2(u, v, 3, 2, s + 21);
        const rip = Math.sin((u * 14 + v * 5 + w * 1.6) * Math.PI * 2);
        const grain = pfbm2(u, v, 64, 2, s + 22);
        const patch = pfbm2(u, v, 4, 3, s + 23);
        h = 0.5 + rip * 0.22 + grain * 0.12 + patch * 0.2;
        const lum = 0.5 + rip * 0.06 + grain * 0.12 + patch * 0.1;
        r = lum * 1.03;
        g = lum;
        b = lum * 0.95;
        ro = 0.88;
      } else {
        // neve: montes suaves, sulcos de vento, cristais
        const mound = pfbm2(u, v, 3, 4, s + 31);
        const sast = Math.sin((u * 8 - v * 3 + mound * 1.2) * Math.PI * 2) * 0.5 + 0.5;
        const sparkle = pfbm2(u, v, 64, 1, s + 32);
        h = 0.5 + mound * 0.4 + sast * 0.12;
        const lum = 0.86 + mound * 0.08 + sparkle * 0.04;
        r = lum * 0.97;
        g = lum * 0.99;
        b = lum;
        ro = 0.5 + 0.25 * (1 - sast);
      }
      H[i] = h;
      rough[i] = ro;
      const o = i * 4;
      alb[o] = clamp(r * 255, 0, 255);
      alb[o + 1] = clamp(g * 255, 0, 255);
      alb[o + 2] = clamp(b * 255, 0, 255);
      alb[o + 3] = clamp(h * 255, 0, 255);
    }
  }
  const strength = [5.0, 2.2, 1.6, 2.6][layer] * (S / 256);
  heightToNormal(H, S, strength, nrm, rough, [6, 3, 2, 1][layer]);
  return { albedo: alb, normal: nrm };
}

/** Macro: 4 canais de fBm ladrilhável (variação de cor/escala). */
export function buildMacro({ size, seed }) {
  const S = size;
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const o = (y * S + x) * 4;
      out[o] = clamp((0.5 + 0.6 * pfbm2(u, v, 4, 5, seed + 1)) * 255, 0, 255);
      out[o + 1] = clamp((0.5 + 0.6 * pfbm2(u, v, 8, 4, seed + 2)) * 255, 0, 255);
      out[o + 2] = clamp((0.5 + 0.6 * pfbm2(u, v, 3, 3, seed + 3)) * 255, 0, 255);
      out[o + 3] = clamp((0.5 + 0.6 * pfbm2(u, v, 16, 3, seed + 4)) * 255, 0, 255);
    }
  }
  return out;
}
