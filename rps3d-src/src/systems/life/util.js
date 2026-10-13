// Utilidades do sistema `life` (sem dependência de outros sistemas).
import * as THREE from 'three/webgpu';

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;

export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; };
/** Ângulo envolvido em (−π, π]. */
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));

/** Hash de string → uint32 (FNV-1a). */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Mistura de inteiros → uint32. */
export function hmix(a, b = 0, c = 0) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (c + 0x27d4eb2f), 0x165667b1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

/** PRNG mulberry32 como função, com ajudantes. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (a0, b0) => a0 + (b0 - a0) * f();
  f.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.weighted = (items, w) => { let s = 0; for (const x of items) s += w(x); let r = f() * s; for (const x of items) { r -= w(x); if (r <= 0) return x; } return items[items.length - 1]; };
  return f;
}

/** Vetor perpendicular qualquer. */
export function anyPerp(n, out = new THREE.Vector3()) {
  return Math.abs(n.y) < 0.9 ? out.set(0, 1, 0).cross(n).normalize() : out.set(1, 0, 0).cross(n).normalize();
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** Quaternion de base com frente +Z = fwd e cima +Y = up (convenção das criaturas). */
export function basisZY(fwd, up, out = new THREE.Quaternion()) {
  _y.copy(up).normalize();
  _x.crossVectors(_y, fwd);
  if (_x.lengthSq() < 1e-10) anyPerp(_y, _x);
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
/** Quaternion com −Z = fwd e +Y = up (convenção de câmera). */
export function lookQuat(fwd, up, out = new THREE.Quaternion()) {
  _m.lookAt(new THREE.Vector3(), fwd, up);
  return out.setFromRotationMatrix(_m);
}

/** Converte hex/cor para array linear [r,g,b]. */
export function lin(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
/** Cor com deslocamento HSL. */
export function shade(hex, dh = 0, ds = 0, dl = 0) { const c = new THREE.Color(hex); c.offsetHSL(dh, ds, dl); return c; }
