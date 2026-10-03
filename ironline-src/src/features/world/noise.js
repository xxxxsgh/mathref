/**
 * Ruído procedural TILEÁVEL (período inteiro) para gerar texturas PBR na CPU.
 *
 * Tudo trabalha sobre campos Float32Array N×N (linha y = v crescente). As
 * funções são deterministas: o mapa é idêntico em toda execução (não usamos
 * Math.random — ele é semeado de outro jeito no modo shot).
 */

/** PRNG mulberry32 — rápido e com boa distribuição. */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rng com helpers, usado pelo layout e geradores. */
export function makeRng(seed) {
  const r = mulberry(seed);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    sign: () => (r() < 0.5 ? -1 : 1),
  };
}

const quint = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Uma oitava de value noise tileável: grade de período px × py, amostrada
 * em N×N. Retorna valores em [0,1]. `sx/sy` esticam (streaks verticais etc.).
 */
export function valueOctave(N, px, py, r, out = new Float32Array(N * N), amp = 1) {
  const lat = new Float32Array(px * py);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const tx = new Float32Array(N), ix0 = new Int32Array(N), ix1 = new Int32Array(N);
  for (let x = 0; x < N; x++) {
    const f = (x * px) / N;
    const i = Math.floor(f);
    ix0[x] = i % px;
    ix1[x] = (i + 1) % px;
    tx[x] = quint(f - i);
  }
  for (let y = 0; y < N; y++) {
    const f = (y * py) / N;
    const j = Math.floor(f);
    const ty = quint(f - j);
    const r0 = (j % py) * px, r1 = ((j + 1) % py) * px;
    const row = y * N;
    for (let x = 0; x < N; x++) {
      const a = lat[r0 + ix0[x]], b = lat[r0 + ix1[x]];
      const c = lat[r1 + ix0[x]], d = lat[r1 + ix1[x]];
      const t = tx[x];
      const top = a + (b - a) * t, bot = c + (d - c) * t;
      out[row + x] += (top + (bot - top) * ty) * amp;
    }
  }
  return out;
}

/**
 * fBm tileável normalizado em [0,1].
 * opts: { period (oitava base), octaves, gain, lac, stretchY (período y = period*stretchY) }
 */
export function fbm(N, seed, { period = 4, octaves = 5, gain = 0.5, stretchY = 1 } = {}) {
  const r = mulberry(seed);
  const out = new Float32Array(N * N);
  let amp = 1, sum = 0, p = period;
  for (let o = 0; o < octaves && p <= N; o++) {
    valueOctave(N, p, Math.max(1, Math.round(p * stretchY)), r, out, amp);
    sum += amp;
    amp *= gain;
    p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return contrast(out);
}

/** Reestica um campo para ocupar [0,1] (fBm tende a se concentrar no meio). */
export function contrast(f) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * k;
  return f;
}

/** Ruído branco por pixel em [0,1]. */
export function white(N, seed) {
  const r = mulberry(seed);
  const out = new Float32Array(N * N);
  for (let i = 0; i < out.length; i++) out[i] = r();
  return out;
}

/**
 * Worley tileável: `cells` células por lado. Retorna { f1, f2, id } onde
 * f1/f2 estão em unidades de célula e id é um hash [0,1) da célula vencedora.
 */
export function worley(N, cells, seed, { jitter = 1, cellsY = cells } = {}) {
  const r = mulberry(seed);
  const pts = new Float32Array(cells * cellsY * 3);
  for (let i = 0; i < cells * cellsY; i++) {
    pts[i * 3] = 0.5 + (r() - 0.5) * jitter;
    pts[i * 3 + 1] = 0.5 + (r() - 0.5) * jitter;
    pts[i * 3 + 2] = r();
  }
  const f1 = new Float32Array(N * N), f2 = new Float32Array(N * N), id = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = (y * cellsY) / N;
    const cy = Math.floor(fy);
    for (let x = 0; x < N; x++) {
      const fx = (x * cells) / N;
      const cx = Math.floor(fx);
      let d1 = 9, d2 = 9, best = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy;
        const wy = ((gy % cellsY) + cellsY) % cellsY;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const wx = ((gx % cells) + cells) % cells;
          const k = (wy * cells + wx) * 3;
          const dx = gx + pts[k] - fx, dy = gy + pts[k + 1] - fy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = pts[k + 2];
          } else if (d < d2) d2 = d;
        }
      }
      const i = y * N + x;
      f1[i] = d1;
      f2[i] = d2;
      id[i] = best;
    }
  }
  return { f1, f2, id };
}

/**
 * Rede de rachaduras: bordas de Worley (f2-f1 pequeno) mascaradas por fBm,
 * com largura variável. Retorna campo [0,1] (1 = dentro da rachadura).
 */
export function cracks(N, seed, { cells = 6, width = 0.025, coverage = 0.5, maskPeriod = 3, warp = 0.06 } = {}) {
  const w = worley(N, cells, seed);
  const m = fbm(N, seed + 7, { period: maskPeriod, octaves: 4 });
  const wob = fbm(N, seed + 13, { period: 16, octaves: 3 });
  // domínio distorcido: as bordas de Worley viram linhas orgânicas, não polígonos
  const wx = fbm(N, seed + 17, { period: 8, octaves: 4 });
  const wy = fbm(N, seed + 19, { period: 8, octaves: 4 });
  const out = new Float32Array(N * N);
  const K = warp * N;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const sx = (((x + Math.round((wx[i] - 0.5) * K)) % N) + N) % N;
      const sy = (((y + Math.round((wy[i] - 0.5) * K)) % N) + N) % N;
      const j = sy * N + sx;
      const e = w.f2[j] - w.f1[j];
      const ww = width * (0.3 + wob[i] * 1.2);
      const c = 1 - smooth(0, ww, e);
      const mask = smooth(1 - coverage, 1 - coverage + 0.1, m[i]);
      out[i] = c * mask;
    }
  }
  return out;
}

export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Desfoque box separável com wrap (para suavizar altura antes da normal). */
export function blur(f, N, radius = 1) {
  if (radius <= 0) return f;
  const tmp = new Float32Array(N * N);
  const out = new Float32Array(N * N);
  const k = 1 / (radius * 2 + 1);
  for (let y = 0; y < N; y++) {
    const row = y * N;
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let d = -radius; d <= radius; d++) s += f[row + ((x + d + N) % N)];
      tmp[row + x] = s * k;
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let d = -radius; d <= radius; d++) s += tmp[((y + d + N) % N) * N + x];
      out[y * N + x] = s * k;
    }
  }
  return out;
}

/** Altura → normal tangente (RGBA8, OpenGL: +Y = +v). `strength` em "pixels". */
export function heightToNormal(h, N, strength = 2) {
  const out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    const ym = ((y - 1 + N) % N) * N, yp = ((y + 1) % N) * N, row = y * N;
    for (let x = 0; x < N; x++) {
      const xm = (x - 1 + N) % N, xp = (x + 1) % N;
      const dx = (h[row + xp] - h[row + xm]) * strength;
      const dy = (h[yp + x] - h[ym + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (row + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Oclusão de cavidade a partir da altura (altura local vs. média borrada). */
export function cavity(h, N, radius = 4, strength = 3) {
  const b = blur(blur(h, N, radius), N, radius);
  const out = new Float32Array(N * N);
  for (let i = 0; i < out.length; i++) out[i] = clamp01(1 + (h[i] - b[i]) * strength);
  return out;
}
