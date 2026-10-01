/**
 * Esqueleto do soldado + utilitários de pose.
 *
 * Convenções (espaço do MODELO = local do grupo do soldado):
 *   - pés na origem, +Y para cima, o soldado OLHA PARA +Z,
 *     a esquerda DELE é +X (a direita é -X).
 *   - Todos os ossos têm rotação de repouso IDENTIDADE (só translação).
 *     Assim a rotação de um osso no espaço do modelo é direta de calcular
 *     a partir de posições de juntas (IK e ragdoll usam o mesmo caminho).
 *   - Braços e pernas pendem em repouso (direção -Y); o cotovelo/joelho
 *     dobra no plano YZ (antebraço vai para +Z, canela para -Z).
 */
import * as THREE from 'three';

/** [nome, pai, posição de repouso no espaço do modelo] — pais antes dos filhos. */
export const BONE_DEFS = [
  ['root', -1, [0, 0, 0]],
  ['hips', 0, [0, 0.98, 0]],
  ['spine', 1, [0, 1.1, -0.005]],
  ['chest', 2, [0, 1.28, -0.01]],
  ['neck', 3, [0, 1.5, -0.015]],
  ['head', 4, [0, 1.6, 0.0]],
  ['upperArm.L', 3, [0.185, 1.445, -0.015]],
  ['foreArm.L', 6, [0.198, 1.155, -0.025]],
  ['hand.L', 7, [0.208, 0.895, -0.005]],
  ['upperArm.R', 3, [-0.185, 1.445, -0.015]],
  ['foreArm.R', 9, [-0.198, 1.155, -0.025]],
  ['hand.R', 10, [-0.208, 0.895, -0.005]],
  ['thigh.L', 1, [0.095, 0.94, 0]],
  ['shin.L', 12, [0.1, 0.515, 0.012]],
  ['foot.L', 13, [0.104, 0.095, -0.012]],
  ['thigh.R', 1, [-0.095, 0.94, 0]],
  ['shin.R', 15, [-0.1, 0.515, 0.012]],
  ['foot.R', 16, [-0.104, 0.095, -0.012]],
  ['weapon', 0, [0, 0, 0]],
];

export const B = Object.fromEntries(BONE_DEFS.map((d, i) => [d[0], i]));
export const NB = BONE_DEFS.length;
export const PARENT = BONE_DEFS.map((d) => d[1]);
export const REST = BONE_DEFS.map((d) => new THREE.Vector3(...d[2]));
/** offset de repouso em relação ao pai */
export const OFFSET = REST.map((p, i) => (PARENT[i] < 0 ? p.clone() : p.clone().sub(REST[PARENT[i]])));

export const LEN = {
  upperArm: REST[B['foreArm.L']].distanceTo(REST[B['upperArm.L']]),
  foreArm: REST[B['hand.L']].distanceTo(REST[B['foreArm.L']]),
  thigh: REST[B['shin.L']].distanceTo(REST[B['thigh.L']]),
  shin: REST[B['foot.L']].distanceTo(REST[B['shin.L']]),
};

/** Cria os ossos three (hierarquia) + Skeleton. Ossos raiz retornados em `roots`. */
export function createSkeleton() {
  const bones = BONE_DEFS.map(([name]) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  const roots = [];
  BONE_DEFS.forEach(([, parent], i) => {
    bones[i].position.copy(OFFSET[i]);
    if (parent < 0) roots.push(bones[i]);
    else bones[parent].add(bones[i]);
  });
  for (const r of roots) r.updateMatrixWorld(true);
  // inversas de bind = translação negativa da posição de repouso
  const inverses = REST.map((p) => new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
  const skeleton = new THREE.Skeleton(bones, inverses);
  return { bones, skeleton, roots };
}

// ─── matemática de quadros ──────────────────────────────────────────────
const _m0 = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Remove de v a componente ao longo de n (n normalizado) e normaliza. */
export function perp(v, n, out = new THREE.Vector3()) {
  out.copy(v).addScaledVector(n, -v.dot(n));
  const l = out.length();
  return l > 1e-6 ? out.divideScalar(l) : null;
}

/**
 * Quaternion que leva o par de repouso (d0, s0) para (d, s).
 * d e d0 são direções principais; s/s0 secundárias (serão ortogonalizadas).
 */
export function frameQuat(d, s, d0, s0, out = new THREE.Quaternion()) {
  const sn = perp(s, d, _a) || perp(_c.set(0, 0, 1), d, _a) || _a.set(1, 0, 0);
  _b.crossVectors(d, sn);
  _m1.makeBasis(d, sn, _b);
  const s0n = perp(s0, d0, _c);
  const t = _t.crossVectors(d0, s0n);
  _m0.makeBasis(d0, s0n, t).transpose();
  _m1.multiply(_m0);
  return out.setFromRotationMatrix(_m1);
}

/**
 * IK de dois ossos. Retorna a junta do meio em `out`.
 * a = raiz, t = alvo, l1/l2 comprimentos, pole = direção de dica para o meio.
 */
export function twoBoneIK(a, t, l1, l2, pole, out = new THREE.Vector3()) {
  const dir = _a.subVectors(t, a);
  let d = dir.length();
  if (d < 1e-5) dir.set(0, -1, 0), (d = 1e-5);
  dir.divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pd = perp(pole, dir, _b) || perp(_c.set(0, 0, 1), dir, _b) || _b.set(1, 0, 0);
  return out.copy(a).addScaledVector(dir, x).addScaledVector(pd, h);
}

/** Interseção raio × cápsula (segmento p0-p1, raio r). Retorna t ou -1. */
export function rayCapsule(o, d, p0, p1, r) {
  // Método: menor distância raio/segmento, depois resolve a esfera no ponto mais próximo.
  const ba = _a.subVectors(p1, p0);
  const oa = _b.subVectors(o, p0);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  const a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c;
  if (h >= 0 && a > 1e-9) {
    const t = (-b - Math.sqrt(h)) / a;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
    // calotas
    const oc = y <= 0 ? oa : _c.subVectors(o, p1);
    b = d.dot(oc);
    c = oc.dot(oc) - r * r;
    h = b * b - c;
    if (h > 0) {
      const t2 = -b - Math.sqrt(h);
      if (t2 >= 0) return t2;
    }
    return -1;
  }
  // raio paralelo ao segmento: testa as duas esferas
  let best = -1;
  for (const p of [p0, p1]) {
    const oc = _c.subVectors(o, p);
    const bb = d.dot(oc), cc = oc.dot(oc) - r * r, hh = bb * bb - cc;
    if (hh > 0) {
      const t = -bb - Math.sqrt(hh);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
  }
  return best;
}
