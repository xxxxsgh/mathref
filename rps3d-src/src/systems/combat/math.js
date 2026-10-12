// Utilidades geométricas do combate (sem dependências de outros sistemas).
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Quaternion com −Z apontando para `fwd` e +Y próximo de `up`. */
export function lookQuat(fwd, up = V(0, 1, 0), out = new THREE.Quaternion()) {
  _a.copy(fwd).normalize();
  _b.copy(up);
  if (Math.abs(_a.dot(_b.normalize())) > 0.999) _b.set(_a.y > 0.9 ? 1 : 0, _a.y > 0.9 ? 0 : 1, 0);
  _m.lookAt(V(0, 0, 0), _a, _b);
  return out.setFromRotationMatrix(_m);
}

/**
 * Tempo de interceptação de um projétil de velocidade `speed` saindo de
 * `from` (com a velocidade do atirador `shooterVel`) contra um alvo em `pos`
 * com velocidade `vel`. Retorna t (s) ou -1.
 */
export function interceptTime(from, shooterVel, pos, vel, speed) {
  const rx = pos.x - from.x, ry = pos.y - from.y, rz = pos.z - from.z;
  const vx = vel.x - (shooterVel ? shooterVel.x : 0), vy = vel.y - (shooterVel ? shooterVel.y : 0), vz = vel.z - (shooterVel ? shooterVel.z : 0);
  const a = vx * vx + vy * vy + vz * vz - speed * speed;
  const b = 2 * (rx * vx + ry * vy + rz * vz);
  const c = rx * rx + ry * ry + rz * rz;
  if (Math.abs(a) < 1e-6) { const t = -c / b; return t > 0 ? t : -1; }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : -1;
}

/** Ponto de antecipação (mundo). Se não houver solução, devolve a posição do alvo. */
export function leadPoint(from, shooterVel, pos, vel, speed, out = new THREE.Vector3()) {
  const t = interceptTime(from, shooterVel, pos, vel, speed);
  out.copy(pos);
  if (t > 0) {
    out.addScaledVector(vel, t);
    if (shooterVel) out.addScaledVector(shooterVel, -t);
  }
  return out;
}

/**
 * Segmento p0→p1 contra esfera (c, r). Retorna a fração 0..1 do primeiro
 * contato ou -1.
 */
export function segSphere(p0, p1, c, r) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const fx = p0.x - c.x, fy = p0.y - c.y, fz = p0.z - c.z;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const cc = fx * fx + fy * fy + fz * fz - r * r;
  if (cc <= 0) return 0;
  if (a < 1e-12) return -1;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** Segmento (já no espaço local de uma caixa centrada em c com meia-extensão h) — slab test. */
export function segBox(p0, p1, c, h) {
  let tmin = 0, tmax = 1;
  for (const k of ['x', 'y', 'z']) {
    const o = p0[k] - c[k], d = p1[k] - p0[k];
    if (Math.abs(d) < 1e-9) { if (o < -h[k] || o > h[k]) return -1; continue; }
    let t1 = (-h[k] - o) / d, t2 = (h[k] - o) / d;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Distância mínima entre o ponto c e o segmento p0→p1 (ao quadrado). */
export function pointSegDist2(c, p0, p1) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 0 ? ((c.x - p0.x) * dx + (c.y - p0.y) * dy + (c.z - p0.z) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = p0.x + dx * t - c.x, y = p0.y + dy * t - c.y, z = p0.z + dz * t - c.z;
  return x * x + y * y + z * z;
}

/** Vetor aleatório num cone ao redor de `dir` (ângulo máx. `ang`). rnd() → 0..1. */
export function coneJitter(dir, ang, rnd, out = new THREE.Vector3()) {
  if (ang <= 0) return out.copy(dir);
  const u = rnd() * 2 * Math.PI, r = ang * Math.sqrt(rnd());
  const t1 = Math.abs(dir.y) < 0.9 ? _a.set(0, 1, 0) : _a.set(1, 0, 0);
  const e1 = _b.crossVectors(dir, t1).normalize();
  const e2 = t1.crossVectors(dir, e1).normalize();
  return out.copy(dir).addScaledVector(e1, Math.cos(u) * r).addScaledVector(e2, Math.sin(u) * r).normalize();
}
