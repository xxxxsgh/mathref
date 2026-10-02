/**
 * Objetos de cena: carros (intactos e carcaças queimadas), barreiras
 * (jersey, T-wall, HESCO), sacos de areia e arame farpado, entulho, postes
 * com fiação, luminárias, árvores e palmeiras, caixotes, tambores, pneus,
 * caçambas, antenas parabólicas, mato e lixo.
 *
 * Peças repetidas em grande número (sacos, pedras, tijolos, folhas, mato)
 * vão para o Instancer (InstancedMesh por geometria); o resto é mesclado
 * pelo Builder.
 */
import * as THREE from 'three';
import { mat4, jitterGeometry, cached } from './geo.js';
import { cyl, cylBetween, cylinder, cable, rebar, decal, sphere, torus, contact } from './shapes.js';
import * as RB from './rubble.js';

// ─── instanciamento ────────────────────────────────────────────────────
export class Instancer {
  constructor() {
    this.sets = new Map();
  }
  /** Registra uma instância de `geoKey` (geometria) com material `mat`. */
  add(geoKey, geo, mat, matrix, color = [1, 1, 1], opts = {}) {
    const key = `${geoKey}|${mat}|${opts.shadow === false ? 0 : 1}`;
    let s = this.sets.get(key);
    if (!s) {
      s = { geo: withColor(geo), mat, mats: [], cols: [], shadow: opts.shadow !== false };
      this.sets.set(key, s);
    }
    s.mats.push(matrix.clone());
    s.cols.push(color);
  }
  build(root, mats) {
    const out = [];
    for (const [key, s] of this.sets) {
      const m = new THREE.InstancedMesh(s.geo, mats[s.mat], s.mats.length);
      m.name = `inst:${key}`;
      const c = new THREE.Color();
      s.mats.forEach((M, i) => {
        m.setMatrixAt(i, M);
        m.setColorAt(i, c.setRGB(...s.cols[i]));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      m.castShadow = s.shadow;
      m.receiveShadow = true;
      root.add(m);
      out.push(m);
    }
    return out;
  }
}

function withColor(geo) {
  if (!geo.attributes.color) {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return geo;
}

// ─── geometrias base ───────────────────────────────────────────────────
/** Saco de areia: superquádrica achatada (travesseiro) com amassados. */
export const sandbagGeo = (v = 0) =>
  cached('sandbag' + v, () => {
    // travesseiro de polipropileno: corpo achatado, cantos amarrados ("orelhas"),
    // costura longitudinal e afundamento no meio (peso da areia)
    const g = new THREE.SphereGeometry(1, 20, 12);
    const P = g.attributes.position;
    const sp = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
    const r = (k) => Math.sin(k * 91.7 + v * 13.1) * 0.5 + 0.5;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const ax = Math.abs(x);
      let X = sp(x, 0.38) * 0.3, Y = sp(y, 0.72) * 0.075, Z = sp(z, 0.42) * 0.165;
      // pontas afinam (amarrado) e sobem um pouco
      const end = Math.pow(ax, 6);
      Y *= 1 - 0.55 * end;
      Z *= 1 - 0.35 * end;
      X *= 1 + 0.06 * end * (1 - Math.abs(z));
      // barriga: assenta embaixo, abaula em cima
      if (y > 0) Y *= 1 + 0.18 * (1 - ax * ax) * (0.8 + 0.4 * r(i % 37));
      else Y *= 0.7;
      // costura no topo
      if (y > 0.6 && Math.abs(z) < 0.08) Y -= 0.006;
      P.setXYZ(i, X, Y, Z);
    }
    const j = jitterGeometry(g, 0.008, 5 + v * 3);
    const Pj = j.attributes.position;
    const col = new Float32Array(Pj.count * 3);
    for (let i = 0; i < Pj.count; i++) {
      const k = 0.5 + 0.5 * Math.min(1, Math.max(0, (Pj.getY(i) + 0.05) / 0.12)) * (1 - 0.3 * Math.pow(Math.abs(Pj.getX(i)) / 0.3, 4));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    j.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const U = j.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 1.6 + v * 0.31, U.getY(i) * 0.6 + v * 0.17);
    j.computeVertexNormals();
    return j;
  });

export const rockGeo = (v) =>
  cached('rock' + v, () => {
    const g = v % 2 ? new THREE.IcosahedronGeometry(1, 0) : new THREE.DodecahedronGeometry(1, 0);
    g.scale(1, 0.55 + (v % 3) * 0.15, 0.8);
    const j = jitterGeometry(g.toNonIndexed(), 0.5, 11 + v * 7);
    return j;
  });

const brickGeo = () => cached('brickbox', () => new THREE.BoxGeometry(0.24, 0.075, 0.12));
const leafGeo = () => cached('leafquad', () => new THREE.PlaneGeometry(1, 1));
const grassGeo = () =>
  cached('grasstuft', () => {
    const a = new THREE.PlaneGeometry(1, 1);
    a.translate(0, 0.5, 0);
    const b = a.clone().rotateY(Math.PI / 2);
    const c = a.clone().rotateY(Math.PI / 4);
    const g = mergeSimple([a, b, c]);
    // normais "para cima" para iluminar como volume, não como cartão
    const N = g.attributes.normal;
    for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, 1, 0);
    return g;
  });

function mergeSimple(geos) {
  const pos = [], nor = [], uv = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// ─── carros ── (cars.js)
export { car } from './cars.js';

// ─── barreiras ── (barriers.js)
export { jersey, twalls, hesco } from './barriers.js';

/**
 * Muro de sacos de areia ao longo de uma polilinha [[x,z],…], `rows` fiadas.
 */
export function sandbagWall(W, pts, rows = 4, opts = {}) {
  const { I, rng, B } = W;
  const bagL = 0.58, bagH = 0.13;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / bagL));
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 0.5 : 0;
      for (let i = 0; i < n + (r % 2 ? 0 : 1) - (r % 2 ? 0 : 1); i++) {
        const t = (i + 0.5 + off * (i < n - 1 ? 1 : 0)) / n;
        if (t > 1) continue;
        const x = ax + (bx - ax) * t + rng.range(-0.02, 0.02), z = az + (bz - az) * t + rng.range(-0.02, 0.02);
        const y = r * bagH + 0.075 + (opts.y || 0);
        // duas fileiras lado a lado (largura do muro ~0.7 m)
        for (const side of [-0.17, 0.17]) {
          if (r === rows - 1 && side > 0 && opts.single) continue;
          const px = x + Math.cos(yaw) * side, pz = z - Math.sin(yaw) * side;
          const M = mat4([px + rng.range(-0.03, 0.03), y + rng.range(-0.015, 0.01), pz + rng.range(-0.03, 0.03)], [rng.range(-0.09, 0.09), yaw + Math.PI / 2 + rng.range(-0.16, 0.16), rng.range(-0.09, 0.09)], [rng.range(0.88, 1.08), rng.range(0.85, 1.15), rng.range(0.9, 1.1)]);
          const v = rng.range(0.72, 1.12);
          const g = rng.chance(0.25) ? 0.9 : 1; // alguns sacos mais esverdeados/novos
          const sv = rng.int(0, 3);
          I.add('sandbag' + sv, sandbagGeo(sv), 'fabric', M, [v * g, v * rng.range(0.94, 1), v * rng.range(0.82, 1) * g]);
        }
      }
    }
    const h = rows * bagH + 0.05;
    contact(B, (ax + bx) / 2, opts.y || 0, (az + bz) / 2, 1.25, len + 0.7, yaw, 2);
    const c = new THREE.Vector3((ax + bx) / 2, h / 2 + (opts.y || 0), (az + bz) / 2);
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.7, h, len + 0.3)).applyMatrix4(mat4(c.toArray(), [0, yaw, 0]));
    B.collider(box.min.toArray(), box.max.toArray(), 'fabric', { surface: 'dirt' });
  }
}

export { concertina } from './barriers.js';

// ─── entulho ───────────────────────────────────────────────────────────
// Implementação em camadas em rubble.js; aqui só a assinatura antiga.
export function rubblePile(W, x, z, r, h, opts = {}) {
  RB.rubblePile(W, x, z, r, h, { ...opts, density: opts.n ? Math.min(1.6, opts.n / Math.max(1, r * r * 5)) : 1 });
}
export function scatterBricks(W, x, z, r, n, opts = {}) {
  RB.scatterDebris(W, x, z, r, n, opts);
}

// ─── postes, cabos, luminárias ── (infra.js)
export { utilityPole, streetLamp, cableBundle, awning } from './infra.js';

// ─── vegetação ── (vegetation.js)
export { tree, palm, grassTufts } from './vegetation.js';

// ─── miudezas ──────────────────────────────────────────────────────────
export function crate(W, x, z, yaw, s = 1, opts = {}) {
  const { B } = W;
  const y = opts.y || 0;
  const w = 0.95 * s, h = 0.5 * s, d = 0.55 * s;
  const M = mat4([x, y + h / 2, z], [0, yaw, opts.tilt || 0]);
  const L = (p, sc, r = [0, 0, 0]) => M.clone().multiply(mat4(p, r, sc));
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  const tint = opts.tint ? opts.tint.map((c) => Math.min(1, c * 1.6)) : [1, 1, 1];
  // corpo com textura própria (UV por face: estêncil legível)
  B.add(UNIT, 'crate', L([0, 0, 0], [w, h, d]), { worldUV: false, color: tint, ao: [y, y + h * 0.5, 0.75] });
  // sarrafos de reforço nas pontas e cantoneiras metálicas
  for (const k of [-1, 1]) {
    B.add(UNIT, 'crate', L([k * (w / 2 - 0.035 * s), 0, 0], [0.07 * s, h + 0.02, d + 0.03]), { worldUV: false, uvScale: 0.25, color: tint.map((c) => c * 0.85) });
    for (const j of [-1, 1]) B.add(UNIT, 'metal', L([k * (w / 2 + 0.005), j * (h / 2 - 0.02 * s), 0], [0.012, 0.05 * s, d + 0.035]), { color: [0.3, 0.3, 0.28] });
  }
  // alças de corda
  for (const k of [-1, 1]) B.add(torus(0.18, 10), 'fabric', L([k * (w / 2 + 0.03), h * 0.15, 0], [0.06 * s, 0.06 * s, 0.06 * s], [0, Math.PI / 2, 0]), { color: [0.6, 0.55, 0.42] });
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(w, h, d)).applyMatrix4(M);
  if (opts.collide !== false) B.collider(box.min.toArray(), box.max.toArray(), 'wood');
  if (!opts.stacked && y < 0.3) contact(B, x, y, z, w + 0.35, d + 0.35, yaw, 2);
}

/** Lata de munição metálica (verde-oliva, alça e tampa com nervura). */
export function ammoCan(W, x, y, z, yaw) {
  const { B } = W;
  const M = mat4([x, y + 0.095, z], [0, yaw, 0]);
  const L = (p, sc) => M.clone().multiply(mat4(p, [0, 0, 0], sc));
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  B.add(UNIT, 'metal', L([0, 0, 0], [0.29, 0.19, 0.15]), { color: [0.32, 0.36, 0.24], uvRand: true });
  B.add(UNIT, 'metal', L([0, 0.1, 0], [0.3, 0.02, 0.16]), { color: [0.28, 0.32, 0.21] });
  B.add(UNIT, 'metal', L([0, 0.12, 0], [0.12, 0.012, 0.025]), { color: [0.25, 0.26, 0.22] });
}

/** Radiador de ferro fundido: elementos de dupla coluna + tubos. */
export function radiator(W, a, b, y, depthDir, opts = {}) {
  const { B } = W;
  const n = opts.n || 9;
  const h = opts.h || 0.6;
  const tint = opts.tint || [0.84, 0.82, 0.76];
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    for (const s of [-0.035, 0.035]) {
      const px = x + depthDir[0] * s, pz = z + depthDir[1] * s;
      cylBetween(B, [px, y + 0.08, pz], [px, y + h - 0.05, pz], 0.024, 'metal', { seg: 8, color: tint });
    }
    B.add(cached('rad_cap', () => new THREE.SphereGeometry(1, 8, 6)), 'metal', mat4([x, y + h - 0.05, z], [0, 0, 0], [0.03, 0.03, 0.06]), { color: tint });
  }
  cylBetween(B, [a[0], y + h - 0.06, a[1]], [b[0], y + h - 0.06, b[1]], 0.018, 'metal', { seg: 8, color: tint });
  cylBetween(B, [a[0], y + 0.1, a[1]], [b[0], y + 0.1, b[1]], 0.018, 'metal', { seg: 8, color: tint });
  // pés/tubos até o piso
  cylBetween(B, [a[0], y + 0.1, a[1]], [a[0], y - 0.15, a[1]], 0.012, 'metal', { seg: 6, color: [0.45, 0.42, 0.38] });
}

export function barrel(W, x, z, opts = {}) {
  const { B, rng } = W;
  const tint = opts.tint || rng.pick([[0.2, 0.3, 0.55], [0.6, 0.15, 0.1], [0.3, 0.4, 0.25], [0.15, 0.15, 0.15]]);
  const dark = tint.map((c) => c * 0.75);
  // tambor de 200 L: corpo + 2 aros de rolagem + bordas (frisos) nas tampas
  const y0 = opts.y || 0;
  const M = opts.fallen ? mat4([x, y0 + 0.29, z], [Math.PI / 2, rng.range(0, 6), 0]) : mat4([x, y0 + 0.44, z], [0, rng.range(0, 6), 0]);
  contact(B, x, y0, z, opts.fallen ? 1.2 : 0.95, opts.fallen ? 1.2 : 0.95, 0, 2);
  B.add(cyl(20), 'metal', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [0.285, 0.86, 0.285])), { color: tint, uvRand: true, ao: opts.fallen ? null : [0, 0.3, 0.6] });
  for (const y of [-0.14, 0.14]) B.add(torus(0.05, 20), 'metal', M.clone().multiply(mat4([0, y, 0], [Math.PI / 2, 0, 0], [0.29, 0.29, 0.29])), { color: dark });
  for (const y of [-0.43, 0.43]) B.add(torus(0.06, 20), 'metal', M.clone().multiply(mat4([0, y, 0], [Math.PI / 2, 0, 0], [0.283, 0.283, 0.283])), { color: dark });
  // tampão
  B.add(cyl(8), 'metal', M.clone().multiply(mat4([0.13, 0.435, 0.05], [0, 0, 0], [0.03, 0.02, 0.03])), { color: [0.3, 0.3, 0.3] });
  if (opts.fallen) B.collider([x - 0.45, y0, z - 0.45], [x + 0.45, y0 + 0.58, z + 0.45], 'metal');
  else B.collider([x - 0.3, y0, z - 0.3], [x + 0.3, y0 + 0.88, z + 0.3], 'metal');
}

export function tire(W, x, z, opts = {}) {
  const { B, rng } = W;
  const flat = opts.flat ?? rng.chance(0.6);
  const y0 = opts.y || 0;
  const M = flat ? mat4([x, y0 + 0.11, z], [Math.PI / 2 + (opts.tilt || 0), 0, 0], [0.3, 0.3, 0.4]) : mat4([x, y0 + 0.33, z], [rng.range(-0.2, 0.2), rng.range(0, 6), 0], [0.3, 0.3, 0.45]);
  B.add(torus(0.42, 16), 'rubber', M, { color: [1, 1, 1] });
  if (flat) contact(B, x, opts.y || 0, z, 0.95, 0.95, 0, 1);
}

export function dumpster(W, x, z, yaw) {
  const { B } = W;
  const M = mat4([x, 0, z], [0, yaw, 0]);
  const L = (p, sc, r = [0, 0, 0]) => M.clone().multiply(mat4(p, r, sc));
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  B.add(UNIT, 'metal', L([0, 0.75, 0], [1.9, 1.1, 1.1]), { color: [0.28, 0.4, 0.3], ao: [0, 0.6, 0.6] });
  B.add(UNIT, 'plastic', L([0, 1.38, -0.2], [1.95, 0.06, 0.9], [-0.35, 0, 0]), { color: [0.25, 0.25, 0.25] });
  for (const s of [-0.8, 0.8]) for (const t of [-0.45, 0.45]) B.add(cyl(8), 'rubber', L([s, 0.1, t], [0.1, 0.06, 0.1], [Math.PI / 2, 0, 0]), { color: [1, 1, 1] });
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.7, 0), new THREE.Vector3(1.9, 1.4, 1.1)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  contact(B, x, 0, z, 2.6, 1.8, yaw, 2);
  // lixo transbordando em volta
  W.trashSpots.push([x, z, 1.8]);
}

export function pallet(W, x, z, yaw, y = 0) {
  const { B } = W;
  const M = mat4([x, y, z], [0, yaw, 0]);
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < 5; i++) B.add(UNIT, 'wood', M.clone().multiply(mat4([-0.5 + i * 0.25, 0.13, 0], [0, 0, 0], [0.1, 0.02, 1.2])), { color: [0.85, 0.75, 0.6] });
  for (const k of [-0.5, 0, 0.5]) B.add(UNIT, 'wood', M.clone().multiply(mat4([0, 0.06, k], [0, 0, 0], [1.1, 0.1, 0.1])), { color: [0.75, 0.65, 0.5] });
}

/** Antena parabólica (registrada pelos prédios). */
export function dish(W, p, n) {
  const { B } = W;
  const g = cached('dish', () => {
    const s = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, 0.55);
    s.rotateX(Math.PI / 2);
    return s;
  });
  const yaw = Math.atan2(n[0], n[1]);
  B.add(g, 'metal', mat4(p, [0.35, yaw + Math.PI, 0], [0.45, 0.45, 0.45]), { color: [0.9, 0.9, 0.88] });
  cylBetween(B, p, [p[0] + n[0] * 0.4, p[1] - 0.1, p[2] + n[1] * 0.4], 0.015, 'metal', { color: [0.5, 0.5, 0.5] });
}

/** Saco de lixo plástico (instanciado): esfera amassada com nó em cima. */
const bagGeo = (v) =>
  cached('trashbag' + v, () => {
    // saco cheio: corpo assentado, vincos, nó pequeno em cima
    const g = new THREE.SphereGeometry(1, 18, 14);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const a = Math.atan2(z, x);
      const fold = 1 + 0.07 * Math.sin(a * 7 + y * 5 + v) + 0.05 * Math.sin(a * 13 - y * 9);
      const sag = y < 0 ? 0.62 : 1;
      const neck = y > 0.9 ? 0.45 : 1;
      P.setXYZ(i, x * fold * neck, y * sag, z * fold * neck);
    }
    const j = jitterGeometry(g, 0.06, 300 + v * 7);
    j.computeVertexNormals();
    return j;
  });

/**
 * Entulho doméstico: sacos de lixo, caixas de papelão, engradados de
 * plástico e cadeiras de plástico derrubadas, em aglomerado.
 */
export function clutter(W, x, z, r, n = 6, opts = {}) {
  const { B, I, rng } = W;
  const y = opts.y || 0;
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const k = rng.next();
    if (k < 0.45) {
      const s = rng.range(0.22, 0.34);
      const v = rng.int(0, 2);
      I.add('trashbag' + v, bagGeo(v), 'bag', mat4([px, y + s * 0.6, pz], [rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(-0.3, 0.3)], [s * 1.1, s, s]), rng.pick([[0.1, 0.1, 0.1], [0.12, 0.14, 0.12], [0.15, 0.2, 0.3], [0.5, 0.5, 0.48]]));
    } else if (k < 0.7) {
      // caixa de papelão (às vezes aberta/amassada)
      const w = rng.range(0.3, 0.6), h = rng.range(0.2, 0.45), dd = rng.range(0.25, 0.45);
      B.obox([px, y + h / 2, pz], [w, h, dd], [rng.range(-0.08, 0.08), rng.range(0, 6), rng.range(-0.1, 0.1)], 'wood', { color: [0.78, 0.6, 0.42], uvRand: true });
    } else if (k < 0.85) {
      // engradado de bebidas
      const col = rng.pick([[0.7, 0.12, 0.1], [0.12, 0.3, 0.6], [0.85, 0.7, 0.15], [0.2, 0.5, 0.25]]);
      const M = mat4([px, y + 0.15, pz], [rng.chance(0.3) ? Math.PI / 2 : 0, rng.range(0, 6), 0]);
      B.add(UNIT, 'plastic', M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [0.42, 0.3, 0.3])), { color: col });
      B.add(UNIT, 'black', M.clone().multiply(mat4([0, 0.02, 0], [0, 0, 0], [0.38, 0.28, 0.31])), { color: [1, 1, 1] });
    } else {
      // cadeira de plástico branca tombada
      const M = mat4([px, y + 0.22, pz], [Math.PI / 2 * (rng.chance(0.6) ? 1 : 0), rng.range(0, 6), 0]);
      const c = [0.86, 0.85, 0.8];
      B.add(UNIT, 'plastic', M.clone().multiply(mat4([0, 0.2, 0], [0, 0, 0], [0.44, 0.03, 0.42])), { color: c });
      B.add(UNIT, 'plastic', M.clone().multiply(mat4([0, 0.5, -0.2], [-0.15, 0, 0], [0.44, 0.5, 0.03])), { color: c });
      for (const sx of [-0.19, 0.19]) for (const sz of [-0.18, 0.18]) B.add(UNIT, 'plastic', M.clone().multiply(mat4([sx, -0.02, sz], [0, 0, 0], [0.035, 0.44, 0.035])), { color: c });
    }
  }
}

/** Lixo e papéis no chão (decalques do atlas 4×4). */
export function trash(W, x, z, r, n, y = 0.02) {
  const { B, rng } = W;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const q = rng.int(0, 15);
    const s = rng.range(0.25, 0.5);
    decal(B, 'trash', [x + Math.cos(a) * d, y + i * 0.0004, z + Math.sin(a) * d], 'py', [s, s], [(q % 4) / 4, Math.floor(q / 4) / 4, (q % 4 + 1) / 4, (Math.floor(q / 4) + 1) / 4], rng.range(0, 6), [0.72, 0.7, 0.66]);
  }
}

export { sphere, cable };
