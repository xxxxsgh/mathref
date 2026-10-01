// Utilidades matemáticas e ruído procedural determinístico.
// Tudo que é "aleatório" no mundo sai daqui com semente fixa, para que a ilha
// seja sempre a mesma (e os screenshots comparáveis entre etapas).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Fator de suavização exponencial independente de framerate. */
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
/** Diferença angular no intervalo [-PI, PI]. */
export const angleDelta = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** PRNG pequeno e rápido (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruído de gradiente 2D (Perlin clássico) com tabela embaralhada por semente.
const PERM = new Uint8Array(512);
const GRAD = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];
(function seedPerm(seed) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})(1337);

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Ruído de Perlin 2D em ~[-1, 1]. */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const g00 = GRAD[PERM[X + PERM[Y]] & 7];
  const g10 = GRAD[PERM[X + 1 + PERM[Y]] & 7];
  const g01 = GRAD[PERM[X + PERM[Y + 1]] & 7];
  const g11 = GRAD[PERM[X + 1 + PERM[Y + 1]] & 7];
  const n00 = g00[0] * xf + g00[1] * yf;
  const n10 = g10[0] * (xf - 1) + g10[1] * yf;
  const n01 = g01[0] * xf + g01[1] * (yf - 1);
  const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);
  const u = fade(xf), v = fade(yf);
  return 1.414 * lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

/** fBm: soma de oitavas de ruído. */
export function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    n += a;
    a *= gain;
    f *= lac;
  }
  return s / n;
}

/** Ruído "ridged" (cristas) em [0, 1]. */
export function ridged(x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(noise2(x * f, y * f));
    s += a * v * v;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

/** Distância de um ponto a um segmento 2D. */
export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  const cx = ax + dx * t - px, cz = az + dz * t - pz;
  return Math.sqrt(cx * cx + cz * cz);
}

/** Código GLSL compartilhado de ruído (hash + value noise). */
export const GLSL_NOISE = /* glsl */ `
float vHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(vHash12(i), vHash12(i+vec2(1,0)), u.x), mix(vHash12(i+vec2(0,1)), vHash12(i+vec2(1,1)), u.x), u.y);
}
`;
