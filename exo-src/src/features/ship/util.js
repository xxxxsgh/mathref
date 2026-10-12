/**
 * Utilitários de geometria do sistema ship: RNG, "pintura" de peças com
 * atributos (cor + superfície) e fusão de muitas peças numa só malha
 * (uma chamada de desenho por material).
 *
 * Atributos padronizados de cada peça:
 *   position, normal           (sem índice — tudo não indexado na fusão)
 *   color   vec3               cor de base LINEAR
 *   aSurf   vec4               (metalness, roughness, desgaste, painéis)
 */
import * as THREE from 'three';

export function mulberry32(a) {
  a >>>= 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cor linear a partir de hex sRGB. */
export function lin(hex) {
  return new THREE.Color(hex);
}

/**
 * Prepara uma geometria para fusão: não indexada, com normal, color e aSurf.
 * surf = [metal, rough, wear, panel]
 */
export function paint(geo, color, surf = [0.3, 0.5, 1, 1], matrix = null) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (matrix) {
    g.applyMatrix4(matrix);
    // espelhamento (determinante < 0) inverte a ordem dos triângulos
    if (matrix.determinant() < 0) {
      for (const name of ['position', 'normal']) {
        const a = g.attributes[name].array;
        for (let t = 0; t < a.length; t += 9) {
          for (let k = 0; k < 3; k++) {
            const tmp = a[t + 3 + k];
            a[t + 3 + k] = a[t + 6 + k];
            a[t + 6 + k] = tmp;
          }
        }
      }
    }
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const s = new Float32Array(n * 4);
  const col = color.isColor ? color : new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    c[i * 3] = col.r;
    c[i * 3 + 1] = col.g;
    c[i * 3 + 2] = col.b;
    s[i * 4] = surf[0];
    s[i * 4 + 1] = surf[1];
    s[i * 4 + 2] = surf[2];
    s[i * 4 + 3] = surf[3];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aSurf', new THREE.BufferAttribute(s, 4));
  return g;
}

/** Funde geometrias pintadas (mesmos atributos) numa só. */
export function mergePainted(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'color', 'aSurf'];
  const sizes = [3, 3, 3, 4];
  names.forEach((name, k) => {
    const arr = new Float32Array(total * sizes[k]);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name];
      if (a) arr.set(a.array, o);
      o += g.attributes.position.count * sizes[k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, sizes[k]));
  });
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** Matriz de composição rápida. rot = [rx, ry, rz] (rad), scl = número ou [x,y,z]. */
export function mat(pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'));
  const s = Array.isArray(scl) ? new THREE.Vector3(...scl) : new THREE.Vector3(scl, scl, scl);
  return m.compose(new THREE.Vector3(...pos), q, s);
}

/** Matriz que alinha +Y a uma normal, em uma posição. */
export function matOnSurface(pos, normal, spin = 0, scl = 1) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  const s = Array.isArray(scl) ? new THREE.Vector3(...scl) : new THREE.Vector3(scl, scl, scl);
  return new THREE.Matrix4().compose(pos.clone(), q, s);
}

/** Catmull-Rom escalar em uma lista de chaves [{t, v}] (t crescente). */
export function spline(keys, t) {
  if (t <= keys[0].t) return keys[0].v;
  const n = keys.length;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  let i = 0;
  while (i < n - 2 && keys[i + 1].t < t) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(n - 1, i + 2)];
  const u = (t - k1.t) / (k2.t - k1.t);
  // tangentes de Catmull-Rom não uniformes simplificadas
  const m1 = ((k2.v - k0.v) / (k2.t - k0.t || 1)) * (k2.t - k1.t);
  const m2 = ((k3.v - k1.v) / (k3.t - k1.t || 1)) * (k2.t - k1.t);
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1.v + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2.v + (u3 - u2) * m2;
}

/**
 * LOFT de seções superelípticas ao longo de Z.
 * prof(z) → { w (meia-largura), h (meia-altura superior), hb (meia-altura inferior), y (centro), n (expoente) }
 * Retorna { geo, sample(z, ang) → {p, n} } — sample dá ponto/normal na superfície (greebles).
 */
export function loft(z0, z1, prof, { segZ = 48, segA = 40, capStart = true, capEnd = true, angFrom = 0, angTo = Math.PI * 2 } = {}) {
  const pos = [];
  const ring = (z) => {
    const P = prof(z);
    const pts = [];
    for (let a = 0; a <= segA; a++) {
      const ang = angFrom + ((angTo - angFrom) * a) / segA;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const e = 2 / P.n;
      const x = Math.sign(c) * Math.pow(Math.abs(c), e) * P.w;
      const hh = s >= 0 ? P.h : P.hb;
      const y = Math.sign(s) * Math.pow(Math.abs(s), e) * hh + P.y;
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  };
  const rings = [];
  for (let i = 0; i <= segZ; i++) {
    // amostragem mais densa nas pontas (nariz/cauda)
    const t = i / segZ;
    const tt = 0.5 - 0.5 * Math.cos(t * Math.PI);
    rings.push(ring(z0 + (z1 - z0) * (0.35 * t + 0.65 * tt)));
  }
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < segZ; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    for (let a = 0; a < segA; a++) {
      tri(A[a], A[a + 1], B[a]);
      tri(A[a + 1], B[a + 1], B[a]);
    }
  }
  const cap = (R, flip) => {
    const c = new THREE.Vector3();
    for (const p of R) c.add(p);
    c.multiplyScalar(1 / R.length);
    for (let a = 0; a < segA; a++) (flip ? tri(c, R[a + 1], R[a]) : tri(c, R[a], R[a + 1]));
  };
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[segZ], false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // normais suaves: indexa por posição para suavizar e volta a desindexar
  const merged = smoothNormals(geo);
  const sample = (z, ang) => {
    const P = prof(z);
    const e = 2 / P.n;
    const f = (a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const hh = s >= 0 ? P.h : P.hb;
      return new THREE.Vector3(Math.sign(c) * Math.pow(Math.abs(c), e) * P.w, Math.sign(s) * Math.pow(Math.abs(s), e) * hh + P.y, z);
    };
    const p = f(ang);
    const ta = f(ang + 0.01).sub(f(ang - 0.01));
    const P2 = prof(z + 0.02);
    const P1 = prof(z - 0.02);
    const pz = new THREE.Vector3(0, 0, 0.04);
    // derivada em z aproximada pela variação da seção
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const dx = Math.sign(c) * Math.pow(Math.abs(c), e) * (P2.w - P1.w);
    const dy = Math.sign(s) * Math.pow(Math.abs(s), e) * ((s >= 0 ? P2.h - P1.h : P2.hb - P1.hb)) + (P2.y - P1.y);
    pz.x = dx;
    pz.y = dy;
    const n = new THREE.Vector3().crossVectors(pz, ta).normalize();
    // garante normal para fora
    const out = new THREE.Vector3(p.x, p.y - P.y, 0);
    if (n.dot(out) < 0) n.negate();
    return { p, n };
  };
  return { geo: merged, sample };
}

/** Normais suaves para uma geometria não indexada (soldando posições iguais). */
export function smoothNormals(geo, eps = 1e-4) {
  const p = geo.attributes.position.array;
  const n = p.length / 3;
  const map = new Map();
  const idx = new Uint32Array(n);
  const acc = [];
  const key = (i) => `${Math.round(p[i * 3] / eps)},${Math.round(p[i * 3 + 1] / eps)},${Math.round(p[i * 3 + 2] / eps)}`;
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let j = map.get(k);
    if (j === undefined) {
      j = acc.length / 3;
      map.set(k, j);
      acc.push(0, 0, 0);
    }
    idx[i] = j;
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const fn = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromArray(p, t * 3);
    b.fromArray(p, t * 3 + 3);
    c.fromArray(p, t * 3 + 6);
    fn.subVectors(c, b).cross(a.clone().sub(b));
    for (let k = 0; k < 3; k++) {
      const j = idx[t + k] * 3;
      acc[j] += fn.x;
      acc[j + 1] += fn.y;
      acc[j + 2] += fn.z;
    }
  }
  const nr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = idx[i] * 3;
    const l = Math.hypot(acc[j], acc[j + 1], acc[j + 2]) || 1;
    nr[i * 3] = acc[j] / l;
    nr[i * 3 + 1] = acc[j + 1] / l;
    nr[i * 3 + 2] = acc[j + 2] / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  return geo;
}

/** Caixa chanfrada (bordas pegam luz — leitura de "peça usinada"). */
export function bevelBox(w, h, d, r = 0.03, seg = 1) {
  const shape = new THREE.Shape();
  const x = w / 2 - r;
  const y = h / 2 - r;
  shape.moveTo(-x, -h / 2);
  shape.lineTo(x, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -y);
  shape.lineTo(w / 2, y);
  shape.quadraticCurveTo(w / 2, h / 2, x, h / 2);
  shape.lineTo(-x, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, y);
  shape.lineTo(-w / 2, -y);
  shape.quadraticCurveTo(-w / 2, -h / 2, -x, -h / 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: seg, curveSegments: 2 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

/** Placa extrudada a partir de um polígono 2D (x, y) com chanfro. */
export function plate(points, thick = 0.2, bevel = 0.04) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, thick - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(thick - 2 * bevel) / 2);
  return g;
}
