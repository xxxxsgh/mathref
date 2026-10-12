// Utilidades matemáticas do sistema `foot` (sem dependência de outros sistemas).
import * as THREE from 'three/webgpu';

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export const D2R = Math.PI / 180;
export const TAU = Math.PI * 2;

/** Amortecimento exponencial independente de dt. */
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };

/** Mola crítica/subamortecida 1D: estado {x, v}. */
export function spring(s, target, k, d, dt) {
  const a = (target - s.x) * k - s.v * d;
  s.v += a * dt; s.x += s.v * dt;
  return s.x;
}

/** Vetor qualquer perpendicular a n. */
export function anyPerp(n, out = new THREE.Vector3()) {
  return Math.abs(n.y) < 0.9 ? out.set(0, 1, 0).cross(n).normalize() : out.set(1, 0, 0).cross(n).normalize();
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** Quaternion de uma base com frente `fwd` (−Z) e cima `up` (+Y). */
export function quatFromFwdUp(fwd, up, out = new THREE.Quaternion()) {
  _z.copy(fwd).normalize().negate();
  _x.crossVectors(up, _z);
  if (_x.lengthSq() < 1e-10) anyPerp(_z, _x);
  _x.normalize();
  _y.crossVectors(_z, _x);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/** Projeta v no plano de normal n (unitária). */
export function projPlane(v, n, out = v) { return out.copy(v).addScaledVector(n, -v.dot(n)); }

/** Gerador determinístico simples (mulberry32). */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (a0, b0) => a0 + (b0 - a0) * f();
  f.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

/** Hash de string → inteiro. */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
