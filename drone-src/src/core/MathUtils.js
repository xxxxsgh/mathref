/**
 * Utilidades numéricas usadas em todo o jogo.
 * Tudo aqui é puro e sem dependência do Three, pra poder rodar num Web Worker.
 */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

/** Interpola e já limita em [0,1] — evita extrapolar fora das bordas. */
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp(invLerp(edge0, edge1, x), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Suavização exponencial independente de framerate.
 *
 * `lerp(a, b, 0.1)` por frame dá resultados diferentes a 30 e a 144 fps. Esta
 * versão converge no mesmo tempo real qualquer que seja o dt: `halfLife` é o
 * tempo (em segundos) para percorrer metade da distância que falta.
 */
export const damp = (a, b, halfLife, dt) => {
  if (halfLife <= 0) return b;
  return b + (a - b) * Math.pow(2, -dt / halfLife);
};

/**
 * Curva de expo dos sticks: mantém o centro suave e as pontas rápidas.
 * `e = 0` é linear; `e = 1` é cúbica pura.
 */
export const expo = (x, e) => {
  const s = clamp(x, -1, 1);
  return (1 - e) * s + e * s * s * s;
};

/** Zona morta radial, renormalizada pra não dar salto ao sair da zona. */
export const deadzone = (x, dz) => {
  const a = Math.abs(x);
  if (a <= dz) return 0;
  return Math.sign(x) * ((a - dz) / (1 - dz));
};

/** Média móvel barata pra métricas de frame (sem alocar array). */
export class RollingAverage {
  constructor(halfLife = 0.5) {
    this.halfLife = halfLife;
    this.value = 0;
    this._primed = false;
  }

  push(sample, dt) {
    if (!this._primed) {
      this.value = sample;
      this._primed = true;
      return this.value;
    }
    this.value = damp(this.value, sample, this.halfLife, dt);
    return this.value;
  }
}

/** Formata segundos como M:SS.mmm — usado no cronômetro e nos splits. */
export const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return '--:--.---';
  const sign = seconds < 0 ? '-' : '';
  const s = Math.abs(seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${sign}${m}:${rest.toFixed(3).padStart(6, '0')}`;
};

/** Formata uma diferença de tempo com sinal explícito (splits vs. ghost). */
export const formatDelta = (seconds) => {
  if (!Number.isFinite(seconds)) return '';
  const sign = seconds >= 0 ? '+' : '-';
  return `${sign}${Math.abs(seconds).toFixed(2)}`;
};
