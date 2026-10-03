/**
 * DSP puro em JavaScript (sem WebAudio) para SINTETIZAR os buffers do jogo.
 * Roda igual no navegador e no Node (as ferramentas de inspeção em
 * /scratchpad renderizam WAV + espectrograma a partir daqui).
 *
 * Convenções: amostras Float32Array, tempo em segundos, `sr` = taxa.
 */

/** PRNG determinístico (mulberry32). */
export function rngOf(seed) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    bi: () => next() * 2 - 1,
    gauss: () => {
      const u = Math.max(1e-9, next()), v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
  };
}

export const buf = (sr, sec) => new Float32Array(Math.max(1, Math.ceil(sr * sec)));

export function white(n, rng) {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = rng.next() * 2 - 1;
  return o;
}
/** Ruído marrom (integrado, com vazamento) — base de vento e ronco. */
export function brown(n, rng) {
  const o = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = y * 0.996 + (rng.next() * 2 - 1) * 0.06;
    o[i] = y;
  }
  return normalize(o, 0.9);
}
/** Ruído rosa (Voss–McCartney simplificado, filtro de Paul Kellet). */
export function pink(n, rng) {
  const o = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    o[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return o;
}

// ─── biquad (RBJ) ─────────────────────────────────────────────────────────
function coefs(type, f, q, sr, gainDb = 0) {
  const w = (2 * Math.PI * Math.min(f, sr * 0.49)) / sr;
  const cs = Math.cos(w), sn = Math.sin(w);
  const alpha = sn / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp':
      b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'hp':
      b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'bp': // ganho de pico 0 dB
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
      break;
    case 'peak':
      b0 = 1 + alpha * A; b1 = -2 * cs; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cs; a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cs + s); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - s);
      a0 = A + 1 + (A - 1) * cs + s; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cs + s); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - s);
      a0 = A + 1 - (A - 1) * cs + s; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - s;
      break;
    }
    default:
      throw new Error('biquad: tipo ' + type);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Filtra `x` NO LUGAR. type: lp hp bp peak lowshelf highshelf. */
export function biquad(x, sr, type, f, q = 0.707, gainDb = 0) {
  const [b0, b1, b2, a1, a2] = coefs(type, f, q, sr, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}
/** Biquad com frequência variável no tempo: fAt(t) em Hz (coefs a cada 32 amostras). */
export function biquadSweep(x, sr, type, fAt, q = 0.707) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let c = null;
  for (let i = 0; i < x.length; i++) {
    if ((i & 31) === 0) c = coefs(type, Math.max(20, fAt(i / sr)), q, sr);
    const v = x[i];
    const y = c[0] * v + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}
/** Passa-baixa de 1 polo (suave, barato). */
export function onepole(x, sr, f) {
  const a = Math.exp((-2 * Math.PI * f) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) x[i] = y = x[i] * (1 - a) + y * a;
  return x;
}

// ─── envelopes e operações ───────────────────────────────────────────────
/** Multiplica por env(t). */
export function shape(x, sr, env) {
  for (let i = 0; i < x.length; i++) x[i] *= env(i / sr);
  return x;
}
/** Ataque linear `a` s + decaimento exponencial com constante `tau` s. */
export const ad = (a, tau) => (t) => (t < a ? t / a : Math.exp(-(t - a) / tau));
/** Soma `src` em `dst` a partir de `at` segundos com ganho g. */
export function mix(dst, src, sr, at = 0, g = 1) {
  const o = Math.round(at * sr);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[i + o] += src[i] * g;
  return dst;
}
export function gain(x, g) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}
export function peakOf(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  return m;
}
export function normalize(x, to = 0.95) {
  const m = peakOf(x);
  return m > 0 ? gain(x, to / m) : x;
}
/** Saturação suave (tanh normalizada). */
export function saturate(x, drive = 2) {
  const k = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}
/** Fades lineares nas pontas (evita cliques). */
export function fade(x, sr, fin = 0.001, fout = 0.01) {
  const a = Math.round(fin * sr), b = Math.round(fout * sr);
  for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b;
  return x;
}
/** Fade-out automático no fim do buffer (nada termina "cortado"). */
export function tailFade(x, sr) {
  const n = Math.min(Math.round(0.03 * sr), Math.floor(x.length * 0.3));
  for (let i = 0; i < n; i++) x[x.length - 1 - i] *= (i / n) * (i / n);
  return x;
}
export function copy(x) {
  return new Float32Array(x);
}
/** Atraso fracionário simples (inteiro em amostras). */
export function delayed(x, sr, sec) {
  const o = new Float32Array(x.length);
  const d = Math.round(sec * sr);
  for (let i = d; i < x.length; i++) o[i] = x[i - d];
  return o;
}

// ─── geradores ───────────────────────────────────────────────────────────
/** Ruído filtrado com envelope (atalho muito usado). */
export function burst(sr, sec, rng, { type = 'bp', f = 1000, q = 0.8, env = ad(0.0005, 0.01), color = 'white', g = 1 } = {}) {
  const n = Math.ceil(sr * sec);
  const x = color === 'pink' ? pink(n, rng) : color === 'brown' ? brown(n, rng) : white(n, rng);
  if (type) {
    if (Array.isArray(type)) for (const [t, ff, qq] of type) biquad(x, sr, t, ff, qq ?? 0.707);
    else biquad(x, sr, type, f, q);
  }
  shape(x, sr, env);
  tailFade(x, sr);
  return g !== 1 ? gain(x, g) : x;
}
/**
 * Banco modal: soma de senoides amortecidas (metal, madeira, vidro).
 * modes: [{ f, tau, a, ph? }]. `at` = início em segundos.
 */
export function modal(sr, sec, modes, { at = 0, attack = 0.0003 } = {}) {
  const x = buf(sr, sec);
  const i0 = Math.round(at * sr);
  for (const m of modes) {
    const w = (2 * Math.PI * m.f) / sr;
    const dec = Math.exp(-1 / (m.tau * sr));
    let amp = m.a;
    const ph = m.ph ?? 0;
    const atk = Math.max(1, Math.round(attack * sr));
    for (let i = i0, k = 0; i < x.length; i++, k++) {
      x[i] += Math.sin(w * k + ph) * amp * (k < atk ? k / atk : 1);
      amp *= dec;
      if (amp < 1e-5) break;
    }
  }
  return tailFade(x, sr);
}
/** Senoide com frequência variável fAt(t) e amplitude envAt(t). */
export function sweep(sr, sec, fAt, envAt, { phase = 0 } = {}) {
  const x = buf(sr, sec);
  let ph = phase;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr;
    ph += (2 * Math.PI * fAt(t)) / sr;
    x[i] = Math.sin(ph) * envAt(t);
  }
  return tailFade(x, sr);
}
/**
 * Grãos: muitos micro-estalos filtrados espalhados no tempo (cascalho,
 * detritos, vidro). density(t) ∈ [0,1] modula a probabilidade.
 */
export function grains(sr, sec, rng, { count = 40, span = [0, 0.1], fLo = 1500, fHi = 6000, len = [0.0005, 0.003], amp = [0.2, 1], decayOver = 0.0, q = 1.2 } = {}) {
  const x = buf(sr, sec);
  for (let k = 0; k < count; k++) {
    const u = rng.next();
    const t = span[0] + (span[1] - span[0]) * (decayOver > 0 ? Math.pow(u, 1 + decayOver) : u);
    const L = rng.range(len[0], len[1]);
    const n = Math.ceil(L * sr);
    const f = rng.range(fLo, fHi);
    const g = rng.range(amp[0], amp[1]) * (decayOver > 0 ? 1 - 0.7 * ((t - span[0]) / (span[1] - span[0] + 1e-9)) : 1);
    // grão = senoide amortecida + pitada de ruído (mais "pedrinha" que "bip")
    const w = (2 * Math.PI * f) / sr;
    const i0 = Math.round(t * sr);
    const ph = rng.next() * 6.28;
    for (let i = 0; i < n && i0 + i < x.length; i++) {
      const e = Math.exp(-i / (n * 0.3));
      x[i0 + i] += (Math.sin(w * i + ph) * 0.6 + (rng.next() * 2 - 1) * 0.4) * e * g;
    }
  }
  if (q > 0) biquad(x, sr, 'hp', fLo * 0.6, 0.7);
  return x;
}
/** Onda N (estalo supersônico): subida instantânea, rampa até -A, retorno. */
export function nwave(sr, durSec, amp = 1) {
  const n = Math.max(3, Math.round(durSec * sr));
  const x = new Float32Array(n + 4);
  for (let i = 0; i <= n; i++) x[i + 1] = amp * (1 - (2 * i) / n);
  return x;
}

/** Duas trilhas parcialmente descorrelacionadas a partir de um gerador mono. */
export function stereoOf(make, width = 0.3) {
  const a = make(0), b = make(1), c = make(2);
  const L = new Float32Array(a.length), R = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    L[i] = a[i] * (1 - width) + b[i] * width;
    R[i] = a[i] * (1 - width) + c[i] * width;
  }
  return [L, R];
}
