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
export function solveClamp(hand, gunRoot, { phi = 3.75, z = -0.43, fwd = 0.38, lift = 0.0, gap = 0.0007, thumbUp = 0.0115, over = false, thumbX = -0.026, roll = 0 } = {}) {
  const n = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
  const t = new THREE.Vector3(-Math.sin(phi), Math.cos(phi), 0);
  // over: dedos sobem e passam por cima (dorso para fora/câmera, punho embaixo)
  if (over) t.negate();
  const F = t.clone().multiplyScalar(Math.cos(fwd)).add(new THREE.Vector3(0, 0, -Math.sin(fwd))).normalize();
  const D = n.clone();
  D.addScaledVector(F, -D.dot(F)).normalize();
  // roll: gira o dorso em volta do eixo dos dedos, virando-o para trás
  // (para a câmera) — a mão deixa de ser vista "de quina"
  if (roll) {
    const q = new THREE.Quaternion().setFromAxisAngle(F, roll);
    const D1 = D.clone().applyQuaternion(q);
    const D2 = D.clone().applyQuaternion(q.invert());
    D.copy(D1.z > D2.z ? D1 : D2);
  }
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

  const fit = fitHand(hand, gunRoot, {
    sdf: guardSdf,
    gap,
    // pega por cima: o polegar desce pelo flanco esquerdo apontando para a
    // frente (visível da câmera), não sobe para junto do indicador
    thumb: { target: new THREE.Vector3(thumbX, thumbUp, z - 0.05), maxY: over ? null : 0.018, ...(over ? { lim: [[-1.4, 1.4], [-1.2, 1.4], [-1.4, 1.4], [-0.1, 0.9], [-0.1, 0.9]], ceilY: 0.012 } : {}) },
  });
  return { pos, quat, pose: fit.pose, cost: fit.cost };
}

/**
 * Encaixe genérico de dedos/polegar contra um SDF (espaço da arma), com a
 * mão JÁ posicionada (hand.root filho da arma). Usado pela pega do
 * guarda-mão, pelas mãos na pistola, na faca e na granada.
 *   sdf(p)    distância (m) do ponto p (Vector3, espaço da arma) à superfície
 *   fingers   dedos resolvidos (os demais copiam `base`)
 *   base      pose de partida/fixa (ex.: indicador no gatilho)
 *   thumb     { target: Vector3, maxY?, ceilY?, weight?, mcpTarget?, lim? } ou null
 *             (polegar de `base`); ceilY = teto em Y para falanges do polegar
 *   spread    abertura natural dos dedos
 */
export function fitHand(hand, gunRoot, { sdf, gap = 0.0007, fingers = [0, 1, 2, 3], base = null, thumb = null, spread = [0.1, 0.03, -0.04, -0.12], minFlex = [0.05, 0.1, 0.1], maxFlex = [1.45, 1.75, 1.75], indexTarget = null } = {}) {
  gunRoot.updateMatrixWorld(true);
  _inv.copy(gunRoot.matrixWorld).invert();
  const pose = clonePose(base || POSES.guard);
  if (!base) pose.spread = spread.slice();
  for (const i of fingers) pose.f[i] = [0, 0, 0];
  if (thumb) pose.t = [0.3, 0.2, 0.2, 0.1, 0.1];
  hand.apply(pose);

  // ─ dedos: flexiona cada falange até encostar ─
  const pt = new THREE.Vector3();
  const segClear = (joint, L, r) => {
    let m = Infinity;
    for (const k of [0.3, 0.55, 0.8, 1.0]) {
      toGun(joint, pt.set(0, 0, -L * k), _inv, _p);
      m = Math.min(m, sdf(_p) - r);
    }
    return m;
  };
  // raios efetivos das falanges (o dedo afina da base à ponta, ver arms.js)
  const RK = [1.0, 0.9, 0.8];
  // flexiona as falanges seguintes (a partir de `from`) até encostarem
  const curl = (i, from) => {
    const f = FINGERS[i];
    const joints = hand.fingers[i];
    for (let sgi = from; sgi < 3; sgi++) {
      const r = f.r * RK[sgi];
      const L = f.L[sgi];
      let a = minFlex[sgi];
      const max = maxFlex[sgi];
      for (; a <= max; a += 0.02) {
        pose.f[i][sgi] = a;
        hand.apply(pose);
        if (segClear(joints[sgi], L, r) <= gap) break;
      }
      if (a > max) pose.f[i][sgi] = max;
      // recua meio passo se atravessou
      if (segClear(joints[sgi], L, r) < 0) {
        pose.f[i][sgi] = Math.max(0, pose.f[i][sgi] - 0.02);
        hand.apply(pose);
      }
    }
  };
  for (const i of fingers) {
    const f = FINGERS[i];
    const joints = hand.fingers[i];
    // 1º: guloso (a proximal flexiona até encostar)
    curl(i, 0);
    const aC = pose.f[i][0];
    // 2º: dedos de verdade envolvem com a junta do meio (PIP) — a proximal
    // pode "flutuar" um pouco para a média/distal abraçarem o perfil, em vez
    // de o dedo deitar reto e duro por cima. Pontuação: contato da média e da
    // distal, PIP ≥ ~0,7·MCP, sem atravessar
    let best = Infinity, bf = pose.f[i].slice();
    for (let a = aC; a >= Math.max(minFlex[0], aC - 0.7) - 1e-6; a -= 0.1) {
      pose.f[i] = [a, 0, 0];
      hand.apply(pose);
      curl(i, 1);
      const [, b, c] = pose.f[i];
      let sc = 0;
      for (let k = 0; k < 3; k++) {
        const cl = segClear(joints[k], f.L[k], f.r * RK[k]);
        if (cl < 0) sc += cl * cl * 4e5;
        else sc += Math.max(0, cl - gap) ** 2 * (k === 0 ? 400 : 3000);
      }
      if (b < 0.7 * a) sc += (0.7 * a - b) ** 2 * 0.6;
      if (c > b + 0.2) sc += (c - b - 0.2) ** 2 * 0.4;
      if (sc < best) (best = sc), (bf = pose.f[i].slice());
    }
    pose.f[i] = bf;
    hand.apply(pose);
  }
  // ─ indicador no gatilho: busca a flexão que põe a polpa distal no alvo ─
  if (indexTarget) {
    const j = hand.fingers[0];
    const L2 = FINGERS[0].L[2];
    let bestI = Infinity, bi = pose.f[0].slice(), bs = pose.spread[0];
    for (let a = 0; a <= 1.5; a += 0.05) {
      for (let b = 0.2; b <= 1.7; b += 0.05) {
        for (const c of [0.2, 0.35, 0.5, 0.65]) {
          for (const sp of [-0.15, -0.05, 0.05, 0.15]) {
            pose.f[0] = [a, b, c];
            pose.spread[0] = sp;
            hand.apply(pose);
            toGun(j[2], pt.set(0, -0.004, -L2 * 0.62), _inv, _p);
            let cst = _p.distanceToSquared(indexTarget);
            // o dedo não atravessa a arma (exceto a polpa no gatilho)
            toGun(j[1], pt.set(0, 0, -FINGERS[0].L[1] * 0.5), _inv, _p);
            const d1 = sdf(_p) - FINGERS[0].r * 0.9;
            if (d1 < 0) cst += d1 * d1 * 40;
            if (cst < bestI) (bestI = cst), (bi = [a, b, c]), (bs = sp);
          }
        }
      }
    }
    pose.f[0] = bi;
    pose.spread[0] = bs;
  }
  if (!thumb) {
    hand.apply(pose);
    return { pose, cost: 0 };
  }

  // ─ polegar: descida de coordenadas ─
  const th = hand.thumb;
  const TL = THUMB.L;
  const TR = [(THUMB.rad[0] + THUMB.rad[1]) * 0.45, THUMB.rad[1], THUMB.rad[2]];
  const target = thumb.target;
  const wT = thumb.weight ?? 20;
  // espaço local da mão (espelhado): y > 0 = dorso. O polegar NUNCA cruza
  // para o dorso (anatomia: ele opõe pela palma/lateral radial)
  const mInv = new THREE.Matrix4();
  const hl = new THREE.Vector3();
  const cost = () => {
    hand.apply(pose);
    let c2 = 0;
    hand.mirror.updateMatrixWorld(true);
    mInv.copy(hand.mirror.matrixWorld).invert();
    for (let k = 0; k < 3; k++) {
      for (const q of [0.5, 1.0]) {
        th[k].updateMatrixWorld(true);
        hl.set(0, 0, -TL[k] * q).applyMatrix4(th[k].matrixWorld).applyMatrix4(mInv);
        if (hl.y > 0.0) c2 += (hl.y * 1000) ** 2 * 0.05;
      }
    }
    for (let k = 0; k < 3; k++) {
      for (const q of [0.35, 0.7, 1.0]) {
        toGun(th[k], pt.set(0, 0, -TL[k] * q), _inv, _p);
        const d = sdf(_p) - TR[k];
        if (d < 0) c2 += d * d * 4e4; // atravessou: muito caro
        // teto: o polegar fica abaixo do ferrolho (não cruza por trás dele)
        if (thumb.ceilY != null && k > 0 && _p.y > thumb.ceilY) c2 += (_p.y - thumb.ceilY) ** 2 * 3e3;
        else if (k > 0) c2 += d * d * 250; // médio/distal encostados
      }
    }
    // ponta do polegar no alvo
    toGun(th[2], pt.set(0, 0, -TL[2]), _inv, _p);
    c2 += _p.distanceToSquared(target) * wT;
    // ponto de passagem da junta MCP do polegar (ex.: membrana sobre o dorso do punho)
    if (thumb.mcpTarget) {
      toGun(th[1], pt.set(0, 0, 0), _inv, _p);
      c2 += _p.distanceToSquared(thumb.mcpTarget) * (thumb.mcpWeight ?? 30);
    }
    if (thumb.maxY != null && _p.y > thumb.maxY) c2 += (_p.y - thumb.maxY) ** 2 * 400;
    return c2;
  };
  const lim = thumb.lim || [[-0.4, 1.4], [-0.25, 1.4], [-0.9, 1.2], [-0.1, 0.9], [-0.1, 0.9]];
  // busca grossa em grade (evita mínimos locais), depois refino por descida
  // de coordenadas a partir dos MELHORES candidatos (não só do primeiro)
  const cands = [];
  for (let yw = lim[0][0]; yw <= lim[0][1]; yw += 0.2) {
    for (let pc = lim[1][0]; pc <= lim[1][1]; pc += 0.2) {
      for (let rl = lim[2][0]; rl <= lim[2][1]; rl += 0.26) {
        for (const fl of [0.15, 0.55]) {
          pose.t[0] = yw; pose.t[1] = pc; pose.t[2] = rl; pose.t[3] = fl; pose.t[4] = fl * 0.8;
          cands.push([cost(), pose.t.slice()]);
        }
      }
    }
  }
  cands.sort((p1, p2) => p1[0] - p2[0]);
  let best = Infinity, bt = pose.t.slice();
  for (const [c0, t0] of cands.slice(0, 6)) {
    pose.t = t0.slice();
    let cb = c0;
    for (let step = 0.12; step > 0.004; step *= 0.6) {
      let improved = true;
      for (let it = 0; it < 30 && improved; it++) {
        improved = false;
        for (let k = 0; k < 5; k++) {
          for (const sg of [1, -1]) {
            const old = pose.t[k];
            pose.t[k] = Math.min(lim[k][1], Math.max(lim[k][0], old + sg * step));
            const c2 = cost();
            if (c2 < cb - 1e-12) {
              cb = c2;
              improved = true;
            } else pose.t[k] = old;
          }
        }
      }
    }
    if (cb < best) (best = cb), (bt = pose.t.slice());
  }
  pose.t = bt;
  hand.apply(pose);
  return { pose, cost: best };
}

// ─── SDFs úteis (3D) ─────────────────────────────────────────────────────
/** Caixa arredondada 3D centrada em c (Vector3-like), meia-extensão h, raio r. */
export function sdBox3(p, c, h, r) {
  const qx = Math.abs(p.x - c.x) - h.x + r, qy = Math.abs(p.y - c.y) - h.y + r, qz = Math.abs(p.z - c.z) - h.z + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
/** Cápsula de a até b com raio r (elipse: escala sx em X). */
export function sdCapsule(p, a, b, r) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const pax = p.x - a.x, pay = p.y - a.y, paz = p.z - a.z;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
