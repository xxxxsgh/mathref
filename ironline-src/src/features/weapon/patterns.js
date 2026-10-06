/**
 * Sistema de padrões de skin — lógica PURA (sem three, sem DOM; testada em
 * weapon.test.mjs).
 *
 *  - `PATTERNS`: os 12 ids do contrato v3.
 *  - `renderPattern(id, paleta, seed, N)`: pinta o padrão numa imagem RGBA
 *    N×N TILEÁVEL (sRGB nos canais RGB; alfa = máscara emissiva, usada pela
 *    "brasa"). Tudo é ruído periódico semeado, então o mesmo (padrão, paleta,
 *    seed) sempre dá os mesmos bytes — em qualquer máquina.
 *  - `skinParams(skin)`: parâmetros derivados da seed (rotação, deslocamento,
 *    escala, posição do degradê, ângulo dominante dos arranhões, seed
 *    "notável"). É o que faz duas cópias da mesma skin serem diferentes.
 *  - `wearProfile(w)`: o float de desgaste (0..1) → intensidades de cada
 *    efeito (perda de tinta na quina, manchas descascadas, arranhões, sujeira).
 *
 * Adaptado (não copiado) do PatternSystem/Wear do NULLPOINT: aqui o padrão
 * é gerado na CPU (bytes determinísticos, testáveis) e amostrado em
 * triplanar no shader da arma (materials.js), com o desgaste por quina.
 */

export const PATTERNS = ['solid', 'camo', 'digital', 'tiger', 'fade', 'damascus', 'marble', 'hex', 'carbon', 'ember', 'oxide', 'splatter'];

/** Tamanho de um ladrilho do padrão sobre a arma (m) — escala "física". */
export const PATTERN_TILE = {
  solid: 0.3, camo: 0.24, digital: 0.26, tiger: 0.3, fade: 1, damascus: 0.16, marble: 0.3,
  hex: 0.11, carbon: 0.07, ember: 0.2, oxide: 0.22, splatter: 0.32,
};

/** Seeds "notáveis" (variações raras, só estéticas). */
const SPECIAL = { fade: [0, 77, 412, 999], marble: [13, 661], damascus: [100, 505], ember: [66, 707], tiger: [321] };

/** PRNG mulberry32. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Hash FNV-1a de string → uint32. */
export function hashString(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}
/** '#rrggbb' | '#rgb' | 0xrrggbb → [r, g, b] em 0..1 (sRGB). */
export function parseHex(h) {
  if (typeof h === 'number') return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  let s = String(h || '#808080').trim().replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const v = parseInt(s.slice(0, 6), 16);
  if (!Number.isFinite(v)) return [0.5, 0.5, 0.5];
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** Parâmetros derivados da seed (determinísticos por skin + seed). */
export function skinParams(skin = {}) {
  const pattern = PATTERNS.includes(skin.pattern) ? skin.pattern : 'solid';
  const seed = Math.max(0, Math.round(Number(skin.seed) || 0));
  const r = mulberry32(hashString(skin.id || pattern) ^ Math.imul(seed + 1, 2654435761));
  const special = (SPECIAL[pattern] || []).includes(seed);
  return {
    pattern,
    seed,
    rotation: (r() - 0.5) * Math.PI * 0.9,
    offset: [r() * 10, r() * 10, r() * 10],
    scale: 0.85 + r() * 0.45,
    gradient: special ? 0.95 : r(),
    scratchAngle: r() * Math.PI,
    hue: r() * 2 - 1,
    special,
  };
}

/**
 * Desgaste (float 0..1) → intensidades. Monótono em w: quanto maior o float,
 * mais tinta sai das quinas, mais manchas descascadas, mais arranhões.
 */
export function wearProfile(w) {
  const x = clamp01(Number(w) || 0);
  return {
    edge: smooth(0.0, 0.5, x) * 0.85 + x * 0.15, // tinta saindo das quinas
    blotch: smooth(0.2, 1.0, x), // manchas grandes descascadas
    scratch: 0.08 + x * 0.92, // arranhões finos
    grime: 0.15 + x * 0.6, // sujeira acumulada
  };
}

// ─── ruído periódico (tileável) ──────────────────────────────────────────
function hash2(ix, iy, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fadeT = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** Value noise em (x, y) (unidades de rede) com período P (inteiro). */
function vnoise(x, y, P, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fadeT(x - ix), fy = fadeT(y - iy);
  const x0 = ((ix % P) + P) % P, y0 = ((iy % P) + P) % P;
  const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** fBm periódico em u,v ∈ [0,1): período base P, oitavas que dobram. */
function fbm(u, v, P, oct, s, gain = 0.5) {
  let sum = 0, amp = 1, tot = 0, p = P;
  for (let o = 0; o < oct; o++) {
    sum += vnoise(u * p, v * p, p, s + o * 101) * amp;
    tot += amp;
    amp *= gain;
    p *= 2;
  }
  return sum / tot;
}
/** Voronoi periódico (G×G células): { f1, f2, id }. */
function voronoi(u, v, G, s) {
  const x = u * G, y = v * G;
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const wx = ((cx % G) + G) % G, wy = ((cy % G) + G) % G;
      const px = cx + hash2(wx, wy, s), py = cy + hash2(wx, wy, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(wx, wy, s + 13);
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, id };
}

/** Paleta com pelo menos 4 cores (deriva tons se vier curta). */
function palette4(pal) {
  const p = (Array.isArray(pal) && pal.length ? pal : ['#5a5f64']).map(parseHex);
  while (p.length < 4) {
    const k = p.length;
    const base = p[k % p.length];
    p.push(k === 1 ? mulc(base, 0.6) : k === 2 ? mixc(base, [1, 1, 1], 0.35) : mulc(p[0], 0.35));
  }
  return p;
}

/** Degradê pelas cores da paleta (t ∈ 0..1). */
function ramp(P, t, n = Math.min(P.length, 3)) {
  const x = clamp01(t) * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  return mixc(P[i], P[i + 1], smooth(0, 1, x - i));
}

/**
 * Pinta o padrão: devolve { data: Uint8ClampedArray(N·N·4), N, mode, emissive }.
 * mode 0 = triplanar (ladrilho); mode 1 = degradê ao longo do comprimento
 * (a linha 0 da imagem é a rampa: o shader amostra x = posição na arma).
 */
export function renderPattern(pattern, pal, seed = 0, N = 256) {
  const id = PATTERNS.includes(pattern) ? pattern : 'solid';
  const P = palette4(pal);
  const s = (hashString(id) ^ Math.imul((seed | 0) + 17, 2654435761)) >>> 0;
  const data = new Uint8ClampedArray(N * N * 4);
  const r = mulberry32(s);
  // respingos: lista de manchas (centro, raio, cor) sorteada uma vez
  const splats = [];
  if (id === 'splatter') {
    for (let k = 0; k < 34; k++) {
      const big = r() < 0.35;
      const rad = big ? 0.05 + r() * 0.07 : 0.012 + r() * 0.03;
      const cx = r(), cy = r(), ci = 1 + Math.floor(r() * 3);
      splats.push({ cx, cy, rad, ci, k: r() * 100 });
      // gotas satélites ao redor das grandes
      const nd = big ? 6 + Math.floor(r() * 8) : 2;
      for (let d = 0; d < nd; d++) {
        const a = r() * Math.PI * 2, dist = rad * (1.2 + r() * 1.8);
        splats.push({ cx: cx + Math.cos(a) * dist, cy: cy + Math.sin(a) * dist, rad: rad * (0.06 + r() * 0.14), ci, k: r() * 100 });
      }
    }
  }
  let emissive = false;
  for (let y = 0; y < N; y++) {
    const v = y / N;
    for (let x = 0; x < N; x++) {
      const u = x / N;
      let c = P[0];
      let e = 0;
      switch (id) {
        case 'solid': {
          const n = fbm(u, v, 6, 4, s);
          c = mulc(P[0], 0.95 + n * 0.1);
          break;
        }
        case 'camo': {
          const n1 = fbm(u, v, 3, 5, s), n2 = fbm(u, v, 4, 5, s + 1), n3 = fbm(u, v, 5, 4, s + 2);
          c = P[0];
          c = mixc(c, P[1], smooth(0.53, 0.55, n1));
          c = mixc(c, P[2], smooth(0.58, 0.6, n2));
          c = mixc(c, P[3], smooth(0.64, 0.66, n3) * (1 - smooth(0.6, 0.62, n2)));
          c = mulc(c, 0.96 + fbm(u, v, 32, 2, s + 3) * 0.08);
          break;
        }
        case 'digital': {
          const G = 72;
          const qu = (Math.floor(u * G) + 0.5) / G, qv = (Math.floor(v * G) + 0.5) / G;
          const n1 = fbm(qu, qv, 3, 4, s), n2 = fbm(qu, qv, 4, 4, s + 1), n3 = fbm(qu, qv, 6, 3, s + 2);
          c = P[0];
          if (n1 > 0.53) c = P[1];
          if (n2 > 0.58) c = P[2];
          if (n3 > 0.64 && n2 <= 0.6) c = P[3];
          // pixels soltos (bordas "pixeladas")
          const h = hash2(Math.floor(u * G), Math.floor(v * G), s + 9);
          if (h > 0.985) c = P[1 + Math.floor(h * 1000) % 3];
          break;
        }
        case 'tiger': {
          const w = fbm(u, v, 3, 4, s);
          const st = Math.sin(2 * Math.PI * (u * 5 + v + (w - 0.5) * 1.4));
          const thick = 0.25 + (fbm(u, v, 4, 3, s + 1) - 0.5) * 0.9;
          const band = smooth(thick, thick + 0.06, st) * smooth(0.25, 0.4, fbm(u, v, 2, 3, s + 2) + 0.2);
          const base = mixc(P[0], P[2], smooth(0.4, 0.8, fbm(u, v, 2, 4, s + 3)) * 0.6);
          c = mixc(base, P[1], band);
          break;
        }
        case 'fade': {
          // rampa ao longo de u (o shader lê a posição na arma)
          c = ramp(P, u);
          break;
        }
        case 'damascus': {
          const n = fbm(u, v, 3, 5, s);
          const t = v * 7 + (n - 0.5) * 2.2 + Math.sin(2 * Math.PI * (u * 2 + n * 0.3)) * 0.35;
          const band = 0.5 + 0.5 * Math.sin(2 * Math.PI * t);
          const sharp = Math.pow(band, 2.2);
          c = mixc(P[1], P[0], smooth(0.15, 0.85, sharp));
          c = mixc(c, P[2], smooth(0.9, 0.99, band) * 0.7);
          c = mulc(c, 0.94 + fbm(u, v, 48, 2, s + 4) * 0.12);
          break;
        }
        case 'marble': {
          const n = fbm(u, v, 3, 6, s);
          const t1 = Math.sin(2 * Math.PI * (u * 2 + v + n * 1.7));
          const t2 = Math.sin(2 * Math.PI * (u + v * 3 + fbm(u, v, 4, 5, s + 1) * 2.1));
          const vein = Math.pow(1 - Math.abs(t1), 10) + 0.5 * Math.pow(1 - Math.abs(t2), 18);
          const base = mixc(P[0], mixc(P[0], P[2], 0.25), smooth(0.3, 0.8, fbm(u, v, 2, 4, s + 2)));
          c = mixc(base, P[1], clamp01(vein));
          c = mixc(c, P[2], clamp01(Math.pow(1 - Math.abs(t1), 40)) * 0.6);
          break;
        }
        case 'hex': {
          // grade hexagonal periódica (8 colunas × 10 linhas; levemente achatada)
          const C = 8, R = 10;
          const gx = u * C, gy = v * R;
          let best = 9, second = 9, cid = 0;
          const row0 = Math.floor(gy);
          for (let j = -1; j <= 2; j++) {
            const row = row0 + j;
            const off = (((row % 2) + 2) % 2) * 0.5;
            const col0 = Math.floor(gx - off);
            for (let i = -1; i <= 2; i++) {
              const col = col0 + i;
              const cx = col + off + 0.5, cy = row + 0.5;
              const dx = (gx - cx) * 1.0, dy = (gy - cy) * 1.15;
              const d = Math.hypot(dx, dy);
              if (d < best) {
                second = best;
                best = d;
                cid = hash2(((col % C) + C) % C, ((row % R) + R) % R, s);
              } else if (d < second) second = d;
            }
          }
          const edge = second - best; // ~0 na borda
          const line = 1 - smooth(0.04, 0.09, edge);
          const cell = cid < 0.7 ? P[0] : cid < 0.9 ? P[1] : mixc(P[0], P[1], 0.5);
          c = mixc(mulc(cell, 0.88 + 0.24 * smooth(0.0, 0.5, edge)), P[2], line);
          break;
        }
        case 'carbon': {
          const T = 20;
          const fu = u * T, fv = v * T;
          const cu = Math.floor(fu), cv = Math.floor(fv);
          const over = ((cu + cv) % 4 + 4) % 4 < 2;
          const tu = fu - cu, tv = fv - cv;
          const across = over ? tv : tu;
          const along = over ? fu : fv;
          const sh = Math.pow(Math.sin(Math.PI * across), 0.6);
          const fib = vnoise(along * 6, across * 40, 6 * T, s) * 0.25;
          const k = clamp01(sh * 0.85 + fib + (over ? 0.08 : 0));
          c = mixc(P[0], P[1], k * 0.55);
          c = mixc(c, P[2], smooth(0.85, 1.0, k) * 0.25);
          break;
        }
        case 'ember': {
          const vo = voronoi(u, v, 7, s);
          const crack = 1 - smooth(0.02, 0.12, vo.f2 - vo.f1);
          const warm = fbm(u, v, 4, 4, s + 1);
          const glow = crack * smooth(0.25, 0.65, warm);
          const base = mulc(P[0], 0.75 + 0.5 * fbm(u, v, 8, 4, s + 2));
          c = mixc(base, ramp([P[1], P[2], P[2]], warm, 2), glow);
          // brasas acesas sob a casca (manchas fracas)
          const spot = smooth(0.7, 0.85, fbm(u, v, 5, 3, s + 3)) * 0.35;
          c = mixc(c, P[1], spot * (1 - glow));
          e = clamp01(glow * 1.2 + spot * 0.5);
          if (e > 0.01) emissive = true;
          break;
        }
        case 'oxide': {
          const n1 = fbm(u, v, 4, 6, s), n2 = fbm(u, v, 8, 4, s + 1);
          const run = fbm(u, v * 0.25 + u * 0, 6, 3, s + 2); // escorridos verticais
          c = mixc(P[1], P[0], smooth(0.3, 0.7, n1));
          c = mixc(c, P[2], smooth(0.55, 0.75, n2) * 0.8);
          c = mixc(c, mulc(P[1], 0.7), smooth(0.6, 0.8, run) * 0.4);
          // pites escuros
          const pit = vnoise(u * 96, v * 96, 96, s + 3);
          c = mulc(c, pit > 0.86 ? 0.6 : 0.95 + pit * 0.08);
          if (P[3]) c = mixc(c, P[3], smooth(0.78, 0.9, n1) * 0.4);
          break;
        }
        case 'splatter': {
          c = mulc(P[0], 0.96 + fbm(u, v, 8, 3, s) * 0.08);
          for (const sp of splats) {
            // distância periódica (imagem mínima) → tileável
            let dx = u - sp.cx, dy = v - sp.cy;
            dx -= Math.round(dx);
            dy -= Math.round(dy);
            const d = Math.hypot(dx, dy);
            if (d > sp.rad * 1.6) continue;
            const a = Math.atan2(dy, dx);
            const wob = 1 + 0.22 * Math.sin(a * 5 + sp.k) + 0.12 * Math.sin(a * 11 + sp.k * 2);
            const m = 1 - smooth(sp.rad * wob * 0.92, sp.rad * wob, d);
            if (m > 0) c = mixc(c, P[sp.ci], m);
          }
          break;
        }
      }
      const i = (y * N + x) * 4;
      data[i] = clamp01(c[0]) * 255;
      data[i + 1] = clamp01(c[1]) * 255;
      data[i + 2] = clamp01(c[2]) * 255;
      data[i + 3] = e * 255;
    }
  }
  return { data, N, mode: id === 'fade' ? 1 : 0, emissive, pattern: id };
}
