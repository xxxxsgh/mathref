/**
 * CUBESPHERE — mapeamento face do cubo ↔ direção da esfera (puro).
 *
 * Projeção EQUIANGULAR: (u, v) ∈ [-1, 1]² numa face vira
 *   dir = normalize(N + U·tan(u·π/4) + V·tan(v·π/4))
 * — células de área quase igual (bem melhor que a normalização ingênua) e
 * inversa fechada (atan). Para cada face, U × V = N (triângulos (i,j),
 * (i+1,j), (i,j+1) ficam anti-horários vistos de fora).
 *
 * Nó da quadtree: (face, nível L, x, y) cobre u ∈ [-1 + 2x/2^L, -1 + 2(x+1)/2^L]
 * (idem v com y).
 */
export const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

const Q = Math.PI / 4;

/** (face, u, v) → direção unitária em out (array ou Vector3-like com x,y,z). Devolve out. */
export function faceDir(face, u, v, out) {
  const F = FACES[face];
  const a = Math.tan(u * Q), b = Math.tan(v * Q);
  const x = F.n[0] + F.u[0] * a + F.v[0] * b;
  const y = F.n[1] + F.u[1] * a + F.v[1] * b;
  const z = F.n[2] + F.u[2] * a + F.v[2] * b;
  const k = 1 / Math.sqrt(x * x + y * y + z * z);
  out[0] = x * k;
  out[1] = y * k;
  out[2] = z * k;
  return out;
}

/** Direção (não precisa ser unitária) → [face, u, v]. */
export function dirFace(x, y, z, out = [0, 0, 0]) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f;
  if (ax >= ay && ax >= az) f = x > 0 ? 0 : 1;
  else if (ay >= az) f = y > 0 ? 2 : 3;
  else f = z > 0 ? 4 : 5;
  const F = FACES[f];
  const dn = x * F.n[0] + y * F.n[1] + z * F.n[2];
  const du = x * F.u[0] + y * F.u[1] + z * F.u[2];
  const dv = x * F.v[0] + y * F.v[1] + z * F.v[2];
  out[0] = f;
  out[1] = Math.atan(du / dn) / Q;
  out[2] = Math.atan(dv / dn) / Q;
  return out;
}

/** Comprimento de arco (m) da aresta de um nó de nível L num planeta de raio R. */
export function nodeArc(R, L) {
  return (R * Math.PI * 0.5) / (1 << L);
}

/** Chave estável de um nó. */
export const nodeKey = (f, L, x, y) => `${f}/${L}/${x}/${y}`;
