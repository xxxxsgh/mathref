/**
 * Resolvedor de pega: encaixa a mão de apoio no guarda-mão (pega "C-clamp")
 * contra a geometria REAL da arma, uma vez só, no init.
 *
 *  - O guarda-mão é descrito por um SDF (caixa arredondada do corpo ∪ trilho
 *    superior) na seção XY, válido no trecho z do guarda-mão.
 *  - A palma é apoiada tangente à superfície num ângulo φ em volta do eixo
 *    do cano (dorso para fora), com os dedos atravessando por baixo e
 *    inclinados para a frente.
 *  - Cada falange (proximal → média → distal) desce flexionando até ENCOSTAR
 *    (sdf − raio ≈ folga): os dedos abraçam o perfil sem interpenetrar.
 *  - O polegar faz o oposto: busca por descida de coordenadas em
 *    (yaw, pitch, roll, mcp, ip) para deitar sobre o lado esquerdo/topo
 *    apontando para a frente ("thumb over"), encostado mas sem atravessar.
 *
 * Tudo no espaço da arma (R.root): X direita, Y cima, frente −Z.
 */
import * as THREE from 'three';
import { FINGERS, THUMB, clonePose, POSES } from './arms.js';

/** SDF de caixa arredondada 2D (centro c, meia-extensão h, raio r). */
function sdRound(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - hx + r;
  const qy = Math.abs(py - cy) - hy + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** SDF do guarda-mão (corpo + trilho), espaço da arma. */
export function guardSdf(p, z0 = -0.236, z1 = -0.585) {
  const body = sdRound(p.x, p.y, 0, -0.0078, 0.0218, 0.0243, 0.0085);
  const rail = sdRound(p.x, p.y, 0, 0.0205, 0.0108, 0.0042, 0.0012);
  let d = Math.min(body, rail);
  // fora do comprimento do guarda-mão: distância cresce (tampa)
  const dz = Math.max(p.z - z0, z1 - p.z, 0);
  if (dz > 0) d = Math.hypot(Math.max(d, 0), dz);
  return d;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _p = new THREE.Vector3();

/** Ponto local de um objeto → espaço da arma. */
function toGun(obj, local, inv, out) {
  obj.updateMatrixWorld(true);
  _m.multiplyMatrices(inv, obj.matrixWorld);
  return out.copy(local).applyMatrix4(_m);
}

/**
 * Coloca a mão (left = espelhada) e resolve a pose. Devolve
 * { pos, quat, pose } no espaço da arma.
 *   phi   ângulo (rad) da normal da palma em volta do eixo do cano (0 = +X)
 *   z     posição ao longo do cano (centro da palma)
 *   fwd   inclinação dos dedos para a frente (rad)
 *   gap   folga de contato (m)
 */
export function solveClamp(hand, gunRoot, { phi = 3.75, z = -0.43, fwd = 0.38, lift = 0.0, gap = 0.0007, thumbUp = 0.0115 } = {}) {
  const n = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
  const t = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
  const F = t.clone().multiplyScalar(Math.cos(fwd)).add(new THREE.Vector3(0, 0, -Math.sin(fwd))).normalize();
  const D = n.clone();
  D.addScaledVector(F, -D.dot(F)).normalize();
  // ponto da superfície na direção n (marcha a partir do centro)
  const c = new THREE.Vector3(0, -0.0078, z);
  const s = new THREE.Vector3();
  let lo = 0, hi = 0.08;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    s.copy(c).addScaledVector(n, mid);
    if (guardSdf(s) < 0) lo = mid;
    else hi = mid;
  }
  s.copy(c).addScaledVector(n, hi);
  // palma: centro local (0, −0.0195, −0.05) apoiado na superfície
  const zAx = F.clone().negate();
  const xAx = new THREE.Vector3().crossVectors(D, zAx);
  const basis = new THREE.Matrix4().makeBasis(xAx, D, zAx);
  const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
  const pos = s.clone().addScaledVector(D, 0.0195 + gap + lift).addScaledVector(F, -0.05);

  const root = hand.root;
  root.position.copy(pos);
  root.quaternion.copy(quat);
  gunRoot.updateMatrixWorld(true);
  _inv.copy(gunRoot.matrixWorld).invert();

  const pose = clonePose(POSES.guard);
  // dedos: espalhamento natural (indicador um pouco para a frente)
  pose.spread = [0.1, 0.03, -0.04, -0.12];
  for (let i = 0; i < 4; i++) pose.f[i] = [0, 0, 0];
  pose.t = [0.3, 0.2, 0.2, 0.1, 0.1];
  hand.apply(pose);

  // ─ dedos: flexiona cada falange até encostar ─
  const pt = new THREE.Vector3();
  const segClear = (joint, L, r) => {
    let m = Infinity;
    for (const k of [0.3, 0.55, 0.8, 1.0]) {
      toGun(joint, pt.set(0, 0, -L * k), _inv, _p);
      m = Math.min(m, guardSdf(_p) - r);
    }
    return m;
  };
  for (let i = 0; i < 4; i++) {
    const f = FINGERS[i];
    const joints = hand.fingers[i];
    for (let sgi = 0; sgi < 3; sgi++) {
      const r = f.r * (1 - sgi * 0.07) * 0.98;
      const L = f.L[sgi];
      let a = sgi === 0 ? 0.05 : 0.1;
      const max = sgi === 0 ? 1.45 : 1.75;
      for (; a <= max; a += 0.02) {
        pose.f[i][sgi] = a;
        hand.apply(pose);
        if (segClear(joints[sgi], L, r) <= gap) break;
      }
      // recua meio passo se atravessou
      if (segClear(joints[sgi], L, r) < 0) {
        pose.f[i][sgi] = Math.max(0, a - 0.02);
        hand.apply(pose);
      }
    }
  }

  // ─ polegar: descida de coordenadas ─
  const th = hand.thumb;
  const TL = THUMB.L;
  const TR = [0.0135, 0.0108, 0.0098];
  const target = new THREE.Vector3();
  const cost = () => {
    hand.apply(pose);
    let c2 = 0;
    for (let k = 0; k < 3; k++) {
      for (const q of [0.35, 0.7, 1.0]) {
        toGun(th[k], pt.set(0, 0, -TL[k] * q), _inv, _p);
        const d = guardSdf(_p) - TR[k];
        if (d < 0) c2 += d * d * 4e4; // atravessou: muito caro
        else if (k > 0) c2 += d * d * 250; // médio/distal encostados
      }
    }
    // ponta: sobre o flanco esquerdo-alto, à frente da palma
    toGun(th[2], pt.set(0, 0, -TL[2]), _inv, _p);
    target.set(-0.025, thumbUp, z - 0.06);
    c2 += _p.distanceToSquared(target) * 20;
    if (_p.y > 0.018) c2 += (_p.y - 0.018) ** 2 * 400;
    return c2;
  };
  const lim = [[-0.8, 1.6], [-1.0, 1.4], [-1.2, 1.4], [-0.1, 0.9], [-0.1, 0.9]];
  // busca grossa em grade (evita mínimos locais), depois refino
  let best = Infinity, bt = pose.t.slice();
  for (let yw = lim[0][0]; yw <= lim[0][1]; yw += 0.2) {
    for (let pc = lim[1][0]; pc <= lim[1][1]; pc += 0.2) {
      for (let rl = lim[2][0]; rl <= lim[2][1]; rl += 0.26) {
        pose.t[0] = yw; pose.t[1] = pc; pose.t[2] = rl; pose.t[3] = 0.15; pose.t[4] = 0.15;
        const c2 = cost();
        if (c2 < best) (best = c2), (bt = pose.t.slice());
      }
    }
  }
  pose.t = bt;
  for (let step = 0.12; step > 0.004; step *= 0.6) {
    let improved = true;
    for (let it = 0; it < 30 && improved; it++) {
      improved = false;
      for (let k = 0; k < 5; k++) {
        for (const sg of [1, -1]) {
          const old = pose.t[k];
          pose.t[k] = Math.min(lim[k][1], Math.max(lim[k][0], old + sg * step));
          const c2 = cost();
          if (c2 < best - 1e-12) {
            best = c2;
            improved = true;
          } else pose.t[k] = old;
        }
      }
    }
  }
  hand.apply(pose);
  return { pos, quat, pose, cost: best };
}
