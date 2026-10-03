/**
 * Barreiras militares: jersey (perfil New Jersey chanfrado com furos de
 * drenagem e alças), T-wall (muro em T de 3.6 m com alças de içamento,
 * juntas de forma e lascas), HESCO (geotêxtil estufado dentro de tela
 * soldada de verdade — malha com alpha) e concertina (espiral de arame
 * farpado com farpas).
 */
import * as THREE from 'three';
import { cached, mat4 } from './geo.js';
import { cylBetween, decal, torus, contact } from './shapes.js';
import { graffitiRect, bulletRect } from './decals.js';

const UNIT = () => cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));

// ─── jersey ────────────────────────────────────────────────────────────
const jerseyGeo = (len) =>
  cached('jersey2_' + len, () => {
    // perfil New Jersey (meia-seção espelhada), com arredondamentos
    const half = [[0.305, 0], [0.305, 0.075], [0.29, 0.09], [0.115, 0.33], [0.1, 0.36], [0.08, 0.79], [0.06, 0.81]];
    const p = [...half.map(([a, b]) => [a, b]), ...half.slice().reverse().map(([a, b]) => [-a, b])];
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.map(([a, b]) => new THREE.Vector2(a, b))), { depth: len - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.012, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(len - 0.06) / 2);
    g.computeVertexNormals();
    return g;
  });

export function jersey(W, x, z, yaw, opts = {}) {
  const { B, rng } = W;
  const len = 3;
  const M = mat4([x, 0, z], [0, yaw, opts.tilt || 0]);
  const L = (p, sc, r = [0, 0, 0]) => M.clone().multiply(mat4(p, r, sc));
  const t = opts.tint || rng.pick([[0.8, 0.78, 0.74], [0.74, 0.72, 0.68], [0.86, 0.82, 0.74]]);
  B.add(jerseyGeo(len), 'concrete', M, { color: t, ao: [0, 0.35, 0.55], uvRand: true });
  // furos de drenagem/encaixe na base (atravessam) e alças no topo
  for (const k of [-0.9, 0.9]) B.add(UNIT(), 'black', L([0, 0.06, k], [0.62, 0.09, 0.32]), { color: [1, 1, 1] });
  for (const k of [-0.75, 0.75]) B.add(torus(0.18, 8), 'metal', L([0, 0.81, k], [0.06, 0.06, 0.06], [0, Math.PI / 2, 0]), { color: [0.32, 0.2, 0.14] });
  // faixas refletivas desbotadas / pichação / lascas
  const side = rng.sign();
  const n = new THREE.Vector3(side, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(M));
  const face = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 'px' : 'nx') : (n.z > 0 ? 'pz' : 'nz');
  const axisAligned = Math.abs(Math.abs(n.x) - 1) < 0.08 || Math.abs(Math.abs(n.z) - 1) < 0.08;
  if (axisAligned && rng.chance(0.6)) {
    const c = new THREE.Vector3(side * 0.104, 0.58, rng.range(-0.6, 0.6)).applyMatrix4(M);
    decal(B, 'graffiti', [c.x, c.y, c.z], face, [1.2, 0.6], graffitiRect(rng.int(0, 15)), rng.range(-0.1, 0.1));
  }
  if (axisAligned) {
    const c = new THREE.Vector3(side * 0.112, 0.36, rng.range(-1, 1)).applyMatrix4(M);
    decal(B, 'chips', [c.x, c.y, c.z], face, [0.6, 0.35], [0.5, 0.5, 1, 1], rng.range(0, 6));
    // escorridos de ferrugem descendo das alças
    for (const k of [-0.75, 0.75]) {
      if (rng.chance(0.3)) continue;
      const cs = new THREE.Vector3(side * 0.09, 0.55, k + rng.range(-0.05, 0.05)).applyMatrix4(M);
      decal(B, 'streaks', [cs.x, cs.y, cs.z], face, [rng.range(0.25, 0.45), 0.55], [0, 0, 1, 1], 0, [0.75, 0.55, 0.4]);
    }
  }
  decal(B, 'stains', [x, 0.02 + rng.range(0, 0.002), z], 'py', [1.6, 3.6], [0, 0.5, 0.5, 1], -yaw, [0.9, 0.85, 0.8]);
  contact(B, x, 0, z, 1.0, len + 0.35, yaw, 2);
  // ponta quebrada (estilhaço/impacto): vergalhões expostos e lasca grande
  if (opts.broken ?? rng.chance(0.4)) {
    const end = rng.sign() * (len / 2 - 0.02);
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Vector3(rng.range(-0.12, 0.12), rng.range(0.15, 0.7), end).applyMatrix4(M);
      const d = new THREE.Vector3(rng.range(-0.4, 0.4), rng.range(-0.3, 0.5), Math.sign(end)).applyMatrix4(new THREE.Matrix4().extractRotation(M));
      cylBetween(B, p.toArray(), [p.x + d.x * 0.25, p.y + d.y * 0.25, p.z + d.z * 0.25], 0.007, 'metal', { seg: 4, color: [0.42, 0.26, 0.17] });
    }
    // bloco arrancado da quina superior (caco de concreto caído ao lado)
    const c = new THREE.Vector3(rng.range(-0.25, 0.25), 0.06, end * 1.12).applyMatrix4(M);
    B.obox(c.toArray(), [0.22, 0.12, 0.3], [rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(-0.4, 0.4)], 'concrete', { color: t.map((v) => v * 0.9) });
  }
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0.6, 0.81, len)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'concrete');
}

// ─── T-wall ────────────────────────────────────────────────────────────
const twallGeo = () =>
  cached('twall2', () => {
    const half = [[0.62, 0], [0.62, 0.38], [0.58, 0.45], [0.16, 0.56], [0.12, 0.62], [0.1, 3.52], [0.07, 3.6]];
    const p = [...half, ...half.slice().reverse().map(([a, b]) => [-a, b])];
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.map(([a, b]) => new THREE.Vector2(a, b))), { depth: 1.5 - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.012, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(1.5 - 0.04) / 2);
    g.computeVertexNormals();
    return g;
  });

/** Linha de T-walls (muro de concreto de 3.6 m). opts: { gap, stencil } */
export function twalls(W, x, z, yaw, count, opts = {}) {
  const { B, rng } = W;
  const dir = [Math.sin(yaw), Math.cos(yaw)];
  for (let i = 0; i < count; i++) {
    if (opts.gap === i) continue;
    const px = x + dir[0] * i * 1.56 + rng.range(-0.05, 0.05), pz = z + dir[1] * i * 1.56 + rng.range(-0.05, 0.05);
    const M = mat4([px, 0, pz], [0, yaw + rng.range(-0.045, 0.045), rng.range(-0.008, 0.008)]);
    const L = (p, sc, r = [0, 0, 0]) => M.clone().multiply(mat4(p, r, sc));
    const t = rng.pick([[0.8, 0.78, 0.74], [0.76, 0.74, 0.7], [0.84, 0.8, 0.74]]);
    B.add(twallGeo(), 'concrete', M, { color: t, ao: [0, 0.8, 0.5], uvRand: true });
    // alças de içamento no topo (vergalhão dobrado)
    for (const k of [-0.42, 0.42]) B.add(torus(0.12, 10), 'metal', L([0, 3.63, k], [0.09, 0.09, 0.09], [0, Math.PI / 2, 0]), { color: [0.33, 0.22, 0.15] });
    // lascas nas arestas e marcas de tiro nas faces; escorrido de ferrugem das alças
    const M3 = new THREE.Matrix4().extractRotation(M);
    {
      const c = new THREE.Vector3(0.09, 2.6, rng.range(-0.45, 0.45)).applyMatrix4(M);
      const n = new THREE.Vector3(1, 0, 0).applyMatrix4(M3);
      const face = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 'px' : 'nx') : (n.z > 0 ? 'pz' : 'nz');
      decal(B, 'streaks', [c.x, c.y, c.z], face, [rng.range(0.5, 0.9), 2.0]);
      const c2 = new THREE.Vector3(-0.09, 2.6, rng.range(-0.45, 0.45)).applyMatrix4(M);
      decal(B, 'streaks', [c2.x, c2.y, c2.z], { px: 'nx', nx: 'px', pz: 'nz', nz: 'pz' }[face], [rng.range(0.5, 0.9), 2.0]);
    }
    for (const side of [-1, 1]) {
      const n = new THREE.Vector3(side, 0, 0).applyMatrix4(M3);
      const face = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 'px' : 'nx') : (n.z > 0 ? 'pz' : 'nz');
      const c = new THREE.Vector3(side * 0.093, rng.range(1.2, 3.0), rng.range(-0.5, 0.5)).applyMatrix4(M);
      if (rng.chance(0.5)) decal(B, 'bullets', [c.x, c.y, c.z], face, [rng.range(0.6, 1.2), rng.range(0.6, 1.2)], bulletRect(rng.int(0, 3)), rng.range(0, 6));
      if (rng.chance(0.4)) {
        const c2 = new THREE.Vector3(side * 0.096, rng.range(0.8, 2.8), rng.chance(0.5) ? 0.66 : -0.66).applyMatrix4(M);
        decal(B, 'chips', [c2.x, c2.y, c2.z], face, [0.5, 0.7], [0, 0.5, 0.5, 1], rng.range(0, 6));
      }
      if (opts.stencil && side === opts.stencil && rng.chance(0.55)) {
        const c3 = new THREE.Vector3(side * 0.095, rng.range(1.4, 2.2), 0).applyMatrix4(M);
        decal(B, 'graffiti', [c3.x, c3.y, c3.z], face, [1.4, 0.7], graffitiRect(rng.pick([2, 6, 10, 14, 4, 11])), rng.range(-0.06, 0.06));
      }
    }
    // quina do topo arrancada por impacto: vergalhões dobrados aparecendo
    if (rng.chance(0.35)) {
      const zz = rng.sign() * 0.7;
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Vector3(rng.range(-0.06, 0.06), 3.35 + k * 0.08, zz).applyMatrix4(M);
        const d = new THREE.Vector3(rng.range(-0.3, 0.3), rng.range(0.2, 0.8), Math.sign(zz) * rng.range(0.4, 1)).applyMatrix4(M3).normalize();
        cylBetween(B, p.toArray(), [p.x + d.x * 0.3, p.y + d.y * 0.3, p.z + d.z * 0.3], 0.008, 'metal', { seg: 4, color: [0.42, 0.26, 0.17] });
      }
      for (const side of [-1, 1]) {
        const n = new THREE.Vector3(side, 0, 0).applyMatrix4(M3);
        const face = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? 'px' : 'nx') : (n.z > 0 ? 'pz' : 'nz');
        const c = new THREE.Vector3(side * 0.075, 3.4, zz * 0.85).applyMatrix4(M);
        decal(B, 'chips', [c.x, c.y, c.z], face, [0.5, 0.6], [0, 0, 0.5, 0.5], rng.range(0, 6));
      }
    }
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1.8, 0), new THREE.Vector3(0.6, 3.6, 1.5)).applyMatrix4(M);
    B.collider(box.min.toArray(), box.max.toArray(), 'concrete');
  }
  decal(B, 'stains', [x + dir[0] * count * 0.76, 0.021, z + dir[1] * count * 0.76], 'py', [2.4, count * 1.6 + 1], [0, 0.5, 0.5, 1], -yaw, [0.9, 0.85, 0.8]);
  contact(B, x + dir[0] * (count - 1) * 0.78, 0, z + dir[1] * (count - 1) * 0.78, 1.8, count * 1.56 + 0.5, yaw, 2);
}

// ─── HESCO ─────────────────────────────────────────────────────────────
/** Geotêxtil estufado: caixa subdividida com barriga entre as quinas. */
const hescoBagGeo = (s, h) =>
  cached('hescobag' + s + h, () => {
    const g = new THREE.BoxGeometry(s, h, s, 8, 8, 8);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), zz = P.getZ(i);
      const ux = (2 * x) / s, uy = (2 * y) / h, uz = (2 * zz) / s;
      const bulge = 0.045 * (1 - uy * uy * 0.8);
      // estufa no meio de cada face lateral (zero nas quinas, presas pela tela)
      if (Math.abs(ux) > 0.999) x += Math.sign(ux) * bulge * (1 - uz * uz);
      if (Math.abs(uz) > 0.999) zz += Math.sign(uz) * bulge * (1 - ux * ux);
      // topo afunda um pouco no meio (terra assentada)
      if (uy > 0.999) y -= 0.05 * (1 - ux * ux) * (1 - uz * uz);
      P.setXYZ(i, x, y, zz);
    }
    g.computeVertexNormals();
    return g;
  });

export function hesco(W, x, z, yaw, count, opts = {}) {
  const { B, rng } = W;
  const s = 1.06, h = opts.h || 1.37;
  const dir = [Math.sin(yaw), Math.cos(yaw)];
  for (let i = 0; i < count; i++) {
    const cx = x + dir[0] * i * s, cz = z + dir[1] * i * s;
    const M = mat4([cx, 0, cz], [0, yaw + rng.range(-0.02, 0.02), 0]);
    const L = (p, sc, r = [0, 0, 0]) => M.clone().multiply(mat4(p, r, sc));
    const fab = rng.pick([[0.74, 0.71, 0.62], [0.7, 0.68, 0.6], [0.78, 0.74, 0.64]]);
    B.add(hescoBagGeo(s - 0.04, h), 'fabric', L([0, h / 2, 0], [1, 1, 1]), { color: fab, ao: [0, 0.5, 0.6] });
    // terra no topo (montinho) e escorrida
    B.add(cached('hescodirt', () => new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2)), 'rubbleD', L([0, h - 0.06, 0], [s * 0.46, 0.1, s * 0.46]), { color: [0.95, 0.88, 0.78] });
    // tela soldada: painéis com alpha (malha real) + arames grossos nas quinas
    for (const side of [-1, 1]) {
      B.add(UNIT(), 'mesh', L([side * (s / 2 + 0.012), h / 2, 0], [0.004, h, s]), { color: [0.62, 0.62, 0.6] });
      B.add(UNIT(), 'mesh', L([0, h / 2, side * (s / 2 + 0.012)], [s, h, 0.004]), { color: [0.62, 0.62, 0.6] });
    }
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const p0 = new THREE.Vector3(a * (s / 2 + 0.012), 0, b * (s / 2 + 0.012)).applyMatrix4(M);
      cylBetween(B, [p0.x, 0, p0.z], [p0.x, h + 0.02, p0.z], 0.008, 'metal', { seg: 5, color: [0.55, 0.55, 0.52] });
    }
    // aro superior
    for (const side of [-1, 1]) {
      B.add(UNIT(), 'metal', L([side * (s / 2 + 0.012), h + 0.01, 0], [0.012, 0.012, s + 0.02]), { color: [0.55, 0.55, 0.52] });
      B.add(UNIT(), 'metal', L([0, h + 0.01, side * (s / 2 + 0.012)], [s + 0.02, 0.012, 0.012]), { color: [0.55, 0.55, 0.52] });
    }
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, h / 2, 0), new THREE.Vector3(s, h, s)).applyMatrix4(M);
    B.collider(box.min.toArray(), box.max.toArray(), 'fabric', { surface: 'dirt' });
  }
  decal(B, 'stains', [x + dir[0] * count * 0.5, 0.021, z + dir[1] * count * 0.5], 'py', [2.6, count * 1.1 + 1.2], [0, 0.5, 0.5, 1], -yaw, [1.05, 0.95, 0.85]);
  contact(B, x + dir[0] * (count - 1) * s * 0.5, 0, z + dir[1] * (count - 1) * s * 0.5, s + 0.5, count * s + 0.4, yaw, 2);
}

/** Tela soldada galvanizada (alpha) — células de 7.6 cm, para o HESCO. */
export function meshTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#cfcfc8';
  g.lineWidth = 9;
  for (let k = 0; k <= 4; k++) {
    const v = k * 32;
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, 128); g.stroke();
    g.beginPath(); g.moveTo(0, v); g.lineTo(128, v); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.3, 1 / 0.3);
  t.anisotropy = 4;
  return t;
}

// ─── concertina ────────────────────────────────────────────────────────
/** Concertina (espiral de arame farpado) ao longo de um segmento, com farpas. */
export function concertina(W, a, b, r = 0.45) {
  const { B, rng } = W;
  const A = new THREE.Vector3(a[0], r, a[1]), Bv = new THREE.Vector3(b[0], r, b[1]);
  const d = new THREE.Vector3().subVectors(Bv, A);
  const len = d.length();
  d.normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x);
  const up = new THREE.Vector3(0, 1, 0);
  const pts = [];
  const turns = Math.round(len / 0.2);
  const per = 14;
  for (let i = 0; i <= turns * per; i++) {
    const t = i / (turns * per);
    const ang = t * turns * Math.PI * 2;
    const rr = r * (0.88 + 0.12 * Math.sin(ang * 0.31 + 1.3)) * (0.97 + 0.06 * Math.sin(t * 40));
    // a bobina "senta" no chão: achata embaixo
    const yy = Math.sin(ang) * rr;
    pts.push(A.clone().addScaledVector(d, t * len + Math.cos(ang) * 0.04).addScaledVector(side, Math.cos(ang) * rr).addScaledVector(up, yy > 0 ? yy : yy * 0.85));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.0065, 4, false);
  B.add(g, 'chrome', null, { worldUV: false, color: [0.62, 0.62, 0.6] });
  // farpas (lâminas) a cada ~9 cm
  const bpos = [], bn = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pts.length - 1; i += 1) {
    if (i % 2) continue;
    const p = pts[i], q = pts[i + 1];
    tmp.subVectors(q, p).normalize();
    const n1 = new THREE.Vector3().crossVectors(tmp, up).normalize().multiplyScalar(0.022);
    const n2 = new THREE.Vector3().crossVectors(tmp, n1).normalize().multiplyScalar(0.022);
    for (const nn of [n1, n2]) {
      const a0 = p.clone().add(nn), a1 = p.clone().sub(nn), a2 = p.clone().addScaledVector(tmp, 0.012);
      bpos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, a2.x, a2.y, a2.z);
      const fn = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(a1, a0), new THREE.Vector3().subVectors(a2, a0)).normalize();
      for (let k = 0; k < 3; k++) bn.push(fn.x, fn.y, fn.z);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
  B.add(bg, 'chromeDS', null, { worldUV: false, color: [0.6, 0.6, 0.58] });
  // estacas em "Y" com amarrações
  for (let t = 0; t <= len + 0.01; t += 2.5) {
    const p = A.clone().addScaledVector(d, Math.min(t, len));
    cylBetween(B, [p.x, 0, p.z], [p.x + rng.range(-0.05, 0.05), 1.0, p.z + rng.range(-0.05, 0.05)], 0.018, 'metal', { seg: 6, color: [0.28, 0.24, 0.2] });
  }
}
