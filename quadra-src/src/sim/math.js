// Utilitários pequenos de vetor/ângulo. A simulação usa objetos {x, y, z}
// simples para rodar no Node (testes) sem depender do three.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;

export function len2(x, z) {
  return Math.hypot(x, z);
}

/** Ângulo (rad) de um vetor no plano xz, 0 = +x, cresce para +z. */
export function heading(x, z) {
  return Math.atan2(z, x);
}

/** Diferença angular em (−π, π]. */
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Atributo 1–99 → 0..1. */
export const att = (v) => clamp((v - 1) / 98, 0, 1);

/** Distância de um ponto P a um segmento AB (3D), devolve {d, t, cx, cy, cz}. */
export function pointSeg(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  return { d: Math.hypot(px - cx, py - cy, pz - cz), t, cx, cy, cz };
}

/** RNG semeado (mulberry32): partidas reproduzíveis nos testes. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  // Normal truncada em ±2,5σ (Box-Muller).
  rng.gauss = () => {
    const u = Math.max(1e-9, rng()), v = rng();
    return clamp(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v), -2.5, 2.5);
  };
  // Ponto uniforme dentro do disco unitário.
  rng.disk = () => {
    const r = Math.sqrt(rng()), t = rng() * 2 * Math.PI;
    return [r * Math.cos(t), r * Math.sin(t)];
  };
  return rng;
}
