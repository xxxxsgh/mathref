// Medidas oficiais ITTF (metros) e constantes físicas.
export const TY = 0.76;          // altura do tampo
export const L = 1.37;           // meio comprimento da mesa
export const W = 0.7625;         // meia largura da mesa
export const NH = 0.1525;        // altura da rede
export const NET_OVER = 0.1525;  // rede sobra além da lateral
export const R = 0.02;           // raio da bola (40 mm)

export const G = 9.81;
export const DRAG = 0.1;         // arrasto quadrático  a = -k|v|v
export const MAGNUS = 0.0032;    // a = c (ω × v)
export const SPIN_DECAY = 0.25;  // 1/s
export const E_TABLE = 0.9;      // restituição vertical na mesa
export const MU_TABLE = 0.25;    // atrito bola/mesa
export const E_FLOOR = 0.55;

export const SIDE_PLAYER = 0;    // lado z > 0
export const SIDE_CPU = 1;       // lado z < 0

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const sideOf = z => (z >= 0 ? SIDE_PLAYER : SIDE_CPU);
