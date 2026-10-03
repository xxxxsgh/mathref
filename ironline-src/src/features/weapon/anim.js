/**
 * Utilitários de animação procedural da viewmodel: molas, curvas de
 * suavização e trilhas de keyframes.
 *
 * Tudo é avaliado por tempo absoluto (trilhas) ou integrado com dt (molas),
 * então o resultado no modo screenshot (dt fixo de 1/60 s) é determinístico.
 */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const ease = {
  linear: (t) => t,
  inOut: (t) => t * t * (3 - 2 * t),
  inOut5: (t) => t * t * t * (t * (t * 6 - 15) + 10),
  out: (t) => 1 - (1 - t) * (1 - t),
  out3: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t,
  in3: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
};

/**
 * Mola amortecida de 2ª ordem (escalar). freq em Hz, zeta = amortecimento
 * (1 = crítico). `impulse(v)` soma velocidade — é assim que o recuo entra.
 */
export class Spring {
  constructor(freq = 8, zeta = 0.7, value = 0) {
    this.x = value;
    this.v = 0;
    this.target = value;
    this.set(freq, zeta);
  }
  set(freq, zeta) {
    this.w = 2 * Math.PI * freq;
    this.z = zeta;
    return this;
  }
  impulse(v) {
    this.v += v;
  }
  update(dt) {
    // sub-passos para estabilidade com dt variável (máx. 1/120 s)
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.w * this.w * (this.target - this.x) - 2 * this.z * this.w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset(v = 0) {
    this.x = this.target = v;
    this.v = 0;
  }
}

/**
 * Trilha de keyframes multicanal: keys = [{ t, v: [...], e?: 'inOut' }].
 * A curva `e` da key DESTINO define a suavização do trecho que chega nela.
 * Fora do intervalo, segura o primeiro/último valor.
 */
export class Track {
  constructor(keys, defEase = 'inOut') {
    this.keys = keys;
    this.defEase = defEase;
    this.n = keys[0].v.length;
    this.duration = keys[keys.length - 1].t;
  }
  eval(t, out = new Array(this.n)) {
    const k = this.keys;
    if (t <= k[0].t) return copy(k[0].v, out);
    if (t >= k[k.length - 1].t) return copy(k[k.length - 1].v, out);
    let i = 1;
    while (k[i].t < t) i++;
    const a = k[i - 1], b = k[i];
    const f = (ease[b.e || this.defEase] || ease.inOut)((t - a.t) / Math.max(1e-6, b.t - a.t));
    for (let j = 0; j < this.n; j++) out[j] = a.v[j] + (b.v[j] - a.v[j]) * f;
    return out;
  }
}
function copy(src, out) {
  for (let i = 0; i < src.length; i++) out[i] = src[i];
  return out;
}

/** Ruído 1D suave e barato (soma de senos incomensuráveis) em [-1, 1]. */
export function wobble(t, seed = 0) {
  return (
    Math.sin(t * 1.0 + seed * 1.7) * 0.5 +
    Math.sin(t * 2.31 + seed * 3.1) * 0.3 +
    Math.sin(t * 4.67 + seed * 5.3) * 0.2
  );
}
