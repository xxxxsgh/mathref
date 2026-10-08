/**
 * Geradores pseudoaleatórios determinísticos e a HIERARQUIA DE SEED do universo.
 *
 *   xmur3(str)   → função hash que devolve uint32 a cada chamada (mistura de string)
 *   sfc32(a,b,c,d) → gerador () => [0,1) de 128 bits de estado (rápido, bom período)
 *   mulberry32(seed) → gerador simples de 32 bits (compatível com o IRONLINE)
 *
 * Hierarquia (ctx.seed):
 *   const seed = createSeed(1337);
 *   const r = seed.derive('galaxy', 0, 'system', 12, 'planet', 3);
 *   r.next(); r.range(2, 5); r.int(0, 9); r.pick(arr); r.normal();
 *   const sub = r.derive('region', 4, 7);       // filho: caminho concatenado
 *   seed.hash('galaxy', 0, 'system', 12)        // uint32 estável do caminho
 *
 * O MESMO caminho com a MESMA seed raiz dá SEMPRE a mesma sequência,
 * independentemente da ordem em que outros caminhos foram derivados — é isso
 * que garante "mesma seed = mesmo universo" entre sistemas e entre sessões.
 * O caminho é serializado como `raiz/seg1/seg2/...`; números entram em base 10
 * (inteiros) ou com toPrecision(17) (fracionários).
 */

/** Hash de string → gerador de uint32 (xmur3, domínio público). */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** Small Fast Counter (sfc32, domínio público). Retorna () => [0,1). */
export function sfc32(a, b, c, d) {
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const f = function () {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // descarta as primeiras saídas (estado inicial ainda pouco misturado)
  for (let i = 0; i < 12; i++) f();
  return f;
}

/** PRNG mulberry32. Retorna () => [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a de 32 bits. */
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Serializa um segmento de caminho de forma estável. */
function seg(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toPrecision(17);
  return String(v);
}

/** Envolve um gerador base () => [0,1) com utilitários. */
export function wrapRng(next, extra = {}) {
  let spare = null;
  const r = {
    next,
    /** [a, b) */
    range: (a, b) => a + (b - a) * next(),
    /** inteiro em [a, b] (inclusivo) */
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** escolha ponderada: weighted([['G', 3], ['K', 2]]) */
    weighted(pairs) {
      let total = 0;
      for (const p of pairs) total += p[1];
      let x = next() * total;
      for (const p of pairs) if ((x -= p[1]) < 0) return p[0];
      return pairs[pairs.length - 1][0];
    },
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    /** normal padrão (Box–Muller) */
    normal(mean = 0, sd = 1) {
      if (spare != null) {
        const s = spare;
        spare = null;
        return mean + sd * s;
      }
      let u = 0;
      while (u <= 1e-12) u = next();
      const v = next();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return mean + sd * m * Math.cos(2 * Math.PI * v);
    },
    /** uint32 */
    u32: () => Math.floor(next() * 4294967296) >>> 0,
    /** vetor unitário uniforme na esfera → [x, y, z] */
    unitVector() {
      const z = 2 * next() - 1;
      const a = 2 * Math.PI * next();
      const s = Math.sqrt(1 - z * z);
      return [s * Math.cos(a), z, s * Math.sin(a)];
    },
    /** embaralha no lugar */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    ...extra,
  };
  return r;
}

/** RNG simples por seed numérica (compatibilidade: ctx.rng). */
export function makeRng(seed = 1) {
  const r = wrapRng(mulberry32(seed), {
    seed,
    fork: (salt) => makeRng((seed ^ hashString(String(salt))) >>> 0),
  });
  return r;
}

/** RNG sfc32 semeado por uma string-caminho. */
export function rngFromKey(key) {
  const h = xmur3(key);
  const r = wrapRng(sfc32(h(), h(), h(), h()), {
    key,
    /** Filho: mesmo caminho + segmentos. */
    derive: (...path) => rngFromKey(key + '/' + path.map(seg).join('/')),
    /** uint32 estável do caminho filho (sem consumir este gerador) */
    hash: (...path) => xmur3(key + '/' + path.map(seg).join('/'))(),
  });
  return r;
}

/**
 * Seed raiz do universo (ctx.seed).
 * @param {number|string} root
 */
export function createSeed(root = 1337) {
  const base = seg(typeof root === 'number' ? root >>> 0 : root);
  return {
    root,
    key: base,
    /** Rng do caminho. */
    derive: (...path) => rngFromKey(path.length ? base + '/' + path.map(seg).join('/') : base),
    /** uint32 estável do caminho. */
    hash: (...path) => xmur3(path.length ? base + '/' + path.map(seg).join('/') : base)(),
    /** número [0,1) estável do caminho (sem estado). */
    value: (...path) => xmur3(base + '/' + path.map(seg).join('/'))() / 4294967296,
  };
}
