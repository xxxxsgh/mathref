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
import { cyl, cylBetween, cylinder, cable, rebar, decal, sphere, torus } from './shapes.js';

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
export const sandbagGeo = () =>
  cached('sandbag', () => {
    const g = new THREE.SphereGeometry(1, 9, 6);
    const P = g.attributes.position;
    const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      P.setXYZ(i, sp(x, 0.5) * 0.3, sp(y, 0.8) * 0.08 * (1 - 0.3 * x * x), sp(z, 0.55) * 0.17);
    }
    const j = jitterGeometry(g, 0.016, 5);
    // AO de contato: base e pontas mais escuras
    const Pj = j.attributes.position;
    const col = new Float32Array(Pj.count * 3);
    for (let i = 0; i < Pj.count; i++) {
      const k = 0.55 + 0.45 * Math.min(1, Math.max(0, (Pj.getY(i) + 0.06) / 0.12)) * (1 - 0.35 * Math.pow(Math.abs(Pj.getX(i)) / 0.3, 4));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    j.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // UV em metros (para o tecido)
    const U = j.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * 1.6, U.getY(i) * 0.6);
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

// ─── carros ────────────────────────────────────────────────────────────
const SEDAN = [
  [-2.25, 0.32], [2.2, 0.32], [2.3, 0.55], [2.28, 0.78], [1.95, 0.88], [1.3, 0.96], [0.72, 1.4],
  [-0.48, 1.42], [-0.98, 0.98], [-2.05, 0.9], [-2.28, 0.72],
];
const HATCH = [
  [2.05, 0.6], [1.98, 1.0], [1.75, 1.42], [-0.55, 1.45], [-1.05, 1.0], [-1.7, 0.9], [-2.02, 0.78],
  [-2.05, 0.55], [-1.95, 0.32], [2.0, 0.32],
];
function profileGeo(key, pts, width) {
  return cached(key, () => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -width / 2);
    g.computeVertexNormals();
    return g;
  });
}

const CAR_TINTS = [[0.85, 0.85, 0.82], [0.62, 0.64, 0.66], [0.75, 0.68, 0.55], [0.18, 0.24, 0.36], [0.55, 0.15, 0.12], [0.22, 0.22, 0.22], [0.35, 0.42, 0.3]];

/**
 * Carro. opts: { burnt, kind: 'sedan'|'hatch', tint, yaw, tilt (capotado/roda faltando) }
 */
export function car(W, x, z, yaw, opts = {}) {
  const { B, rng } = W;
  const kind = opts.kind || (rng.chance(0.5) ? 'sedan' : 'hatch');
  const burnt = !!opts.burnt;
  const tint = burnt ? [0.16, 0.12, 0.1] : opts.tint || rng.pick(CAR_TINTS);
  const lift = burnt ? -0.14 : 0;
  const roll = opts.roll || 0;
  const pitch = opts.pitch || 0;
  const CM = mat4([x, lift, z], [pitch, yaw, roll]);
  const L = (pos, rot = [0, 0, 0], sc = [1, 1, 1]) => CM.clone().multiply(mat4(pos, rot, sc));
  const pts = kind === 'sedan' ? SEDAN : HATCH;
  const len = kind === 'sedan' ? 4.5 : 4.0;
  const body = profileGeo('car_' + kind, pts, 1.62);
  B.add(body, burnt ? 'metal' : 'carpaint', CM, { color: tint, ao: [lift + 0.3, lift + 0.8, 0.55] });
  // vidros (lateral: perfil interno extrudado um pouco mais largo)
  const gl = kind === 'sedan'
    ? [[-0.88, 0.99], [-0.44, 1.36], [0.68, 1.35], [1.2, 0.99]]
    : [[-0.98, 1.02], [-0.52, 1.39], [1.7, 1.37], [1.85, 1.02]];
  const winGeo = cached('carwin_' + kind, () => {
    const sh = new THREE.Shape(gl.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: false });
    g.translate(0, 0, -0.9);
    return g;
  });
  if (!burnt) B.add(winGeo, 'glass', CM, { color: [1, 1, 1] });
  else B.add(winGeo, 'black', CM, { color: [1, 1, 1] });
  // para-brisa e vidro traseiro (quads finos sobre a inclinação)
  const slope = (a, b, inset = 0.03) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    return L([mx + nx * inset, my + ny * inset, 0], [0, 0, ang], [l * 0.92, 0.02, 1.5]);
  };
  const ws = kind === 'sedan' ? slope(pts[8], pts[7], 0.04) : slope(pts[4], pts[3], 0.04);
  const rs = kind === 'sedan' ? slope(pts[6], pts[5], 0.04) : slope(pts[2], pts[1], 0.04);
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  B.add(UNIT, burnt ? 'black' : 'glass', ws, { color: [1, 1, 1] });
  B.add(UNIT, burnt ? 'black' : 'glass', rs, { color: [1, 1, 1] });
  // para-choques, faróis, lanternas, retrovisores, maçanetas
  const hx = len / 2;
  const fx = kind === 'sedan' ? -2.28 : -2.06, bx = kind === 'sedan' ? 2.31 : 2.06;
  B.add(UNIT, 'plastic', L([fx - 0.02, 0.45, 0], [0, 0, 0], [0.14, 0.2, 1.78]), { color: burnt ? [0.2, 0.18, 0.16] : [0.9, 0.9, 0.9] });
  B.add(UNIT, 'plastic', L([bx + 0.02, 0.45, 0], [0, 0, 0], [0.14, 0.2, 1.78]), { color: burnt ? [0.2, 0.18, 0.16] : [0.9, 0.9, 0.9] });
  if (!burnt) {
    for (const s of [-1, 1]) {
      B.add(UNIT, 'glass', L([fx + 0.03, 0.72, s * 0.62], [0, 0, 0], [0.08, 0.13, 0.38]), { color: [3, 3, 2.8] });
      B.add(UNIT, 'plastic', L([bx - 0.01, 0.72, s * 0.66], [0, 0, 0], [0.08, 0.14, 0.32]), { color: [2.2, 0.3, 0.25] });
      B.add(UNIT, 'plastic', L([kind === 'sedan' ? -0.85 : -0.95, 1.0, s * 0.93], [0, 0, 0], [0.16, 0.1, 0.12]), { color: [0.6, 0.6, 0.6] });
    }
    // placa
    B.add(UNIT, 'metal', L([fx - 0.1, 0.45, 0], [0, 0, 0], [0.02, 0.12, 0.5]), { color: [0.95, 0.95, 0.9] });
  }
  // rodas
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wx = sx * (hx - 0.82), wz = sz * 0.78;
      if (!burnt) {
        B.add(cyl(16), 'rubber', L([wx, 0.33, wz], [Math.PI / 2, 0, 0], [0.33, 0.23, 0.33]), { color: [1, 1, 1] });
        B.add(cyl(10), 'chrome', L([wx, 0.33, wz + sz * 0.02], [Math.PI / 2, 0, 0], [0.17, 0.235, 0.17]), { color: [0.42, 0.42, 0.4] });
      } else {
        B.add(cyl(10), 'metal', L([wx, 0.36, wz], [Math.PI / 2, 0, 0], [0.21, 0.18, 0.21]), { color: [0.25, 0.15, 0.1] });
      }
      // caixa de roda escura
      B.add(UNIT, 'black', L([wx, 0.55, wz * 1.0], [0, 0, 0], [0.82, 0.38, 0.12]), { color: [1, 1, 1] });
    }
  }
  if (burnt) {
    // fuligem/cinza no chão em volta
    decal(B, 'stains', [x, 0.025, z], 'py', [len + 2.5, 4], [0.5, 0.5, 1, 1], -yaw);
    W.rubbleSpots.push({ p: [x, 0, z], r: 2.2, n: 8, small: true });
  } else {
    decal(B, 'stains', [x + rng.range(-0.5, 0.5), 0.022, z], 'py', [2, 2], [0, 0.5, 0.5, 1], rng.range(0, 6));
  }
  // colisor (AABB do carro rotacionado)
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(len, 1.4, 1.8)).applyMatrix4(CM);
  B.collider(box.min.toArray(), box.max.toArray(), 'carpaint', { surface: 'metal' });
}

// ─── barreiras ─────────────────────────────────────────────────────────
const jerseyGeo = (len) =>
  cached('jersey' + len, () => {
    const p = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.1, 0.33], [0.075, 0.81], [-0.075, 0.81], [-0.1, 0.33], [-0.3, 0.08]];
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.map(([a, b]) => new THREE.Vector2(a, b))), { depth: len, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    g.translate(0, 0, -len / 2);
    return g;
  });
export function jersey(W, x, z, yaw, opts = {}) {
  const { B, rng } = W;
  const len = 3;
  const M = mat4([x, 0, z], [0, yaw, opts.tilt || 0]);
  const t = opts.tint || (rng.chance(0.25) ? [0.85, 0.8, 0.7] : [0.78, 0.76, 0.72]);
  B.add(jerseyGeo(len), 'concrete', M, { color: t, ao: [0, 0.4, 0.6] });
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0.6, 0.81, len)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'concrete');
  // faixas pintadas (refletivas desbotadas)
  if (opts.striped) {
    for (const s of [-1, 1]) {
      const c = new THREE.Vector3(s * 0.085, 0.6, 0).applyMatrix4(M);
      void c;
    }
  }
}

const twallGeo = () =>
  cached('twall', () => {
    const p = [[-0.6, 0], [0.6, 0], [0.6, 0.45], [0.12, 0.55], [0.1, 3.6], [-0.1, 3.6], [-0.12, 0.55], [-0.6, 0.45]];
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(p.map(([a, b]) => new THREE.Vector2(a, b))), { depth: 1.5, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
    g.translate(0, 0, -0.75);
    return g;
  });
/** Linha de T-walls (muro de concreto de 3.6 m). */
export function twalls(W, x, z, yaw, count, opts = {}) {
  const { B, rng } = W;
  const dir = [Math.sin(yaw), Math.cos(yaw)];
  for (let i = 0; i < count; i++) {
    if (opts.gap === i) continue;
    const px = x + dir[0] * i * 1.52, pz = z + dir[1] * i * 1.52;
    const M = mat4([px, 0, pz], [0, yaw + rng.range(-0.015, 0.015), 0]);
    B.add(twallGeo(), 'concrete', M, { color: [0.8, 0.78, 0.74], ao: [0, 0.7, 0.55] });
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1.8, 0), new THREE.Vector3(0.6, 3.6, 1.5)).applyMatrix4(M);
    B.collider(box.min.toArray(), box.max.toArray(), 'concrete');
    if (rng.chance(0.3)) {
      const n = new THREE.Vector3(1, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(M));
      void n;
    }
  }
}

/** Gabião HESCO: cesto de tela + geotêxtil cheio de terra. */
export function hesco(W, x, z, yaw, count, opts = {}) {
  const { B } = W;
  const s = 1.05, h = opts.h || 1.35;
  const dir = [Math.sin(yaw), Math.cos(yaw)];
  for (let i = 0; i < count; i++) {
    const cx = x + dir[0] * i * s, cz = z + dir[1] * i * s;
    const M = mat4([cx, 0, cz], [0, yaw, 0]);
    const L = (p, sc) => M.clone().multiply(mat4(p, [0, 0, 0], sc));
    const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
    // geotêxtil levemente estufado
    B.add(UNIT, 'fabric', L([0, h / 2, 0], [s - 0.04, h, s - 0.04]), { color: [0.78, 0.72, 0.55], ao: [0, 0.5, 0.6] });
    B.add(UNIT, 'dirt', L([0, h + 0.01, 0], [s - 0.1, 0.04, s - 0.1]), { color: [1, 0.95, 0.9] });
    // tela (barras nas arestas e grade)
    for (const a of [-1, 1]) for (const b of [-1, 1]) B.add(UNIT, 'metal', L([a * s / 2, h / 2, b * s / 2], [0.025, h, 0.025]), { color: [0.45, 0.45, 0.43] });
    for (let k = 1; k <= 4; k++) {
      const y = (k / 4) * h - 0.02;
      for (const a of [-1, 1]) {
        B.add(UNIT, 'metal', L([a * (s / 2 + 0.005), y, 0], [0.012, 0.012, s]), { color: [0.45, 0.45, 0.43] });
        B.add(UNIT, 'metal', L([0, y, a * (s / 2 + 0.005)], [s, 0.012, 0.012]), { color: [0.45, 0.45, 0.43] });
      }
    }
    for (let k = 1; k < 5; k++) {
      const t = -s / 2 + (k / 5) * s;
      for (const a of [-1, 1]) {
        B.add(UNIT, 'metal', L([a * (s / 2 + 0.005), h / 2, t], [0.012, h, 0.012]), { color: [0.45, 0.45, 0.43] });
        B.add(UNIT, 'metal', L([t, h / 2, a * (s / 2 + 0.005)], [0.012, h, 0.012]), { color: [0.45, 0.45, 0.43] });
      }
    }
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, h / 2, 0), new THREE.Vector3(s, h, s)).applyMatrix4(M);
    B.collider(box.min.toArray(), box.max.toArray(), 'fabric', { surface: 'dirt' });
  }
}

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
        const y = r * bagH + 0.075;
        // duas fileiras lado a lado (largura do muro ~0.7 m)
        for (const side of [-0.17, 0.17]) {
          if (r === rows - 1 && side > 0 && opts.single) continue;
          const px = x + Math.cos(yaw) * side, pz = z - Math.sin(yaw) * side;
          const M = mat4([px + rng.range(-0.03, 0.03), y + rng.range(-0.015, 0.01), pz + rng.range(-0.03, 0.03)], [rng.range(-0.09, 0.09), yaw + Math.PI / 2 + rng.range(-0.16, 0.16), rng.range(-0.09, 0.09)], [rng.range(0.88, 1.08), rng.range(0.85, 1.15), rng.range(0.9, 1.1)]);
          const v = rng.range(0.72, 1.12);
          const g = rng.chance(0.25) ? 0.9 : 1; // alguns sacos mais esverdeados/novos
          I.add('sandbag', sandbagGeo(), 'fabric', M, [v * g, v * rng.range(0.94, 1), v * rng.range(0.82, 1) * g]);
        }
      }
    }
    const h = rows * bagH + 0.05;
    const c = new THREE.Vector3((ax + bx) / 2, h / 2, (az + bz) / 2);
    const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.7, h, len + 0.3)).applyMatrix4(mat4(c.toArray(), [0, yaw, 0]));
    B.collider(box.min.toArray(), box.max.toArray(), 'fabric', { surface: 'dirt' });
  }
}

/** Concertina (arame farpado em espiral) ao longo de um segmento. */
export function concertina(W, a, b, r = 0.42) {
  const { B } = W;
  const A = new THREE.Vector3(a[0], r, a[1]), Bv = new THREE.Vector3(b[0], r, b[1]);
  const d = new THREE.Vector3().subVectors(Bv, A);
  const len = d.length();
  d.normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x);
  const up = new THREE.Vector3(0, 1, 0);
  const pts = [];
  const turns = Math.round(len / 0.22);
  for (let i = 0; i <= turns * 10; i++) {
    const t = i / (turns * 10);
    const ang = t * turns * Math.PI * 2;
    const rr = r * (0.9 + 0.1 * Math.sin(ang * 0.37));
    pts.push(A.clone().addScaledVector(d, t * len).addScaledVector(side, Math.cos(ang) * rr).addScaledVector(up, Math.sin(ang) * rr * 0.95));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length, 0.006, 3, false);
  B.add(g, 'chrome', null, { worldUV: false, color: [0.55, 0.55, 0.55] });
  // estacas
  for (let t = 0; t <= len; t += 3) {
    const p = A.clone().addScaledVector(d, t);
    cylBetween(B, [p.x, 0, p.z], [p.x, 1.0, p.z], 0.02, 'metal', { color: [0.25, 0.22, 0.2] });
  }
}

// ─── entulho ───────────────────────────────────────────────────────────
/**
 * Monte de entulho: monte de terra (malha deformada) + blocos de concreto
 * instanciados + tijolos + vergalhões. Colisor em degraus subíveis.
 */
export function rubblePile(W, x, z, r, h, opts = {}) {
  const { B, I, rng } = W;
  const g = cached('mound', () => {
    const m = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    return m;
  });
  const mound = jitterGeometry(g.toNonIndexed(), 0.25, rng.int(1, 9999));
  B.add(mound, 'dirt', mat4([x, -0.05, z], [0, rng.range(0, 6), 0], [r, h, r * rng.range(0.7, 1)]), { color: [0.9, 0.86, 0.8] });
  const n = opts.n || Math.round(r * r * 6);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const yy = h * Math.sqrt(Math.max(0, 1 - (d / r) ** 2)) - 0.05;
    const s = rng.range(0.12, 0.45) * (1.3 - d / r);
    const v = rng.int(0, 3);
    const tint = rng.chance(0.25) ? (opts.tint || [0.9, 0.82, 0.7]) : [0.78, 0.76, 0.72];
    I.add('rock' + v, rockGeo(v), opts.mat || 'concrete', mat4([x + Math.cos(a) * d, yy, z + Math.sin(a) * d], [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)], [s, s, s]), tint, { shadow: false });
  }
  scatterBricks(W, x, z, r * 1.3, Math.round(r * 8));
  for (let i = 0; i < Math.round(r * 2); i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(0, r * 0.7);
    rebar(B, [x + Math.cos(a) * d, h * 0.6, z + Math.sin(a) * d], [rng.range(-1, 1), rng.range(0.2, 1), rng.range(-1, 1)], rng.range(0.6, 1.6), rng);
  }
  // pedaço de laje com vergalhão
  if (r > 1.5) {
    B.obox([x + rng.range(-0.5, 0.5), h * 0.6, z + rng.range(-0.5, 0.5)], [rng.range(1.2, 2), 0.18, rng.range(0.8, 1.4)], [rng.range(-0.5, 0.5), rng.range(0, 6), rng.range(-0.5, 0.5)], 'concrete', { color: [0.75, 0.73, 0.7] });
  }
  // colisor em degraus (≤ 0.4 m cada) — dá para subir o monte
  if (opts.collide !== false) {
    const steps = Math.max(1, Math.ceil(h / 0.4));
    for (let k = 0; k < steps; k++) {
      const y1 = Math.min(h, (k + 1) * 0.4);
      const rr = r * Math.sqrt(Math.max(0.05, 1 - (y1 / h) ** 2)) * 0.85;
      B.collider([x - rr, 0, z - rr], [x + rr, y1 * 0.9, z + rr], 'dirt');
    }
  }
}

/** Tijolos soltos e pedrinhas espalhados. */
export function scatterBricks(W, x, z, r, n, opts = {}) {
  const { I, rng } = W;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const y = opts.y || 0;
    if (rng.chance(0.5)) {
      const red = rng.chance(0.6);
      I.add('brick', brickGeo(), 'plaster', mat4([x + Math.cos(a) * d, y + 0.035, z + Math.sin(a) * d], [rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(-0.3, 0.3)], [rng.range(0.5, 1), 1, 1]), red ? [0.42, 0.27, 0.22] : [0.48, 0.46, 0.43], { shadow: false });
    } else {
      const s = rng.range(0.04, 0.12);
      const v = rng.int(0, 3);
      I.add('rock' + v, rockGeo(v), 'concrete', mat4([x + Math.cos(a) * d, y + s * 0.3, z + Math.sin(a) * d], [rng.range(0, 6), rng.range(0, 6), 0], [s, s, s]), [0.8, 0.78, 0.74], { shadow: false });
    }
  }
}

// ─── postes, cabos, luminárias ─────────────────────────────────────────
/** Poste de concreto com cruzeta e isoladores. Retorna pontos de fixação dos fios. */
export function utilityPole(W, x, z, yaw = 0, opts = {}) {
  const { B, rng } = W;
  const h = opts.h || 8.5;
  B.add(cyl(8), 'concrete', mat4([x, h / 2, z], [rng.range(-0.02, 0.02), 0, rng.range(-0.02, 0.02)], [0.13, h, 0.13]), { color: [0.75, 0.73, 0.7], ao: [0, 1.2, 0.6] });
  const dir = [Math.cos(yaw), -Math.sin(yaw)];
  const ya = h - 0.6;
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  B.add(UNIT, 'wood', mat4([x, ya, z], [0, yaw, 0], [1.8, 0.1, 0.1]), { color: [0.5, 0.45, 0.4] });
  const pts = [];
  for (const s of [-0.75, 0, 0.75]) {
    const px = x + dir[0] * s, pz = z + dir[1] * s;
    B.add(cyl(6), 'plastic', mat4([px, ya + 0.12, pz], [0, 0, 0], [0.04, 0.14, 0.04]), { color: [0.7, 0.55, 0.4] });
    pts.push([px, ya + 0.18, pz]);
  }
  if (opts.transformer) {
    cylinder(B, x + 0.3, h - 2.4, z, 0.28, 0.8, 'metal', { seg: 12, color: [0.55, 0.58, 0.55] });
  }
  B.collider([x - 0.15, 0, z - 0.15], [x + 0.15, h, z + 0.15], 'concrete');
  return pts;
}

export function streetLamp(W, x, z, side) {
  const { B } = W;
  const h = 7;
  cylBetween(B, [x, 0, z], [x, h, z], 0.07, 'metal', { seg: 8, color: [0.4, 0.42, 0.4], ao: [0, 1, 0.6] });
  cylBetween(B, [x, h, z], [x - side * 1.4, h + 0.35, z], 0.045, 'metal', { seg: 6, color: [0.4, 0.42, 0.4] });
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  B.add(UNIT, 'metal', mat4([x - side * 1.6, h + 0.3, z], [0, 0, 0], [0.6, 0.12, 0.25]), { color: [0.4, 0.42, 0.4] });
  B.add(UNIT, 'glass', mat4([x - side * 1.6, h + 0.235, z], [0, 0, 0], [0.5, 0.02, 0.2]), { color: [1.5, 1.5, 1.4] });
  B.collider([x - 0.1, 0, z - 0.1], [x + 0.1, h, z + 0.1], 'metal');
}

// ─── vegetação ─────────────────────────────────────────────────────────
/** Árvore de rua: tronco ramificado + aglomerados de folhas instanciados. */
export function tree(W, x, z, opts = {}) {
  const { B, I, rng } = W;
  const h = opts.h || rng.range(5, 7.5);
  const bark = [0.42, 0.38, 0.34];
  const tips = [];
  const grow = (p, dir, len, r, depth) => {
    const end = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
    cylBetween(B, p, end, r, 'wood', { seg: depth ? 5 : 8, color: bark });
    if (depth >= 3 || r < 0.02) {
      tips.push(end);
      return;
    }
    const n = depth === 0 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.5, 0.5);
      const up = rng.range(0.45, 0.8);
      const d = [Math.cos(a) * (1 - up) + dir[0] * 0.4, up + dir[1] * 0.3, Math.sin(a) * (1 - up) + dir[2] * 0.4];
      const l = Math.hypot(...d);
      grow(end, d.map((v) => v / l), len * rng.range(0.55, 0.75), r * 0.6, depth + 1);
    }
    if (depth > 0) tips.push(end);
  };
  grow([x, 0, z], [rng.range(-0.08, 0.08), 1, rng.range(-0.08, 0.08)], h * 0.45, 0.16, 0);
  const q = W.quality.foliage ?? 1;
  for (const t of tips) {
    const n = Math.max(1, Math.round(rng.int(3, 5) * q));
    for (let i = 0; i < n; i++) {
      const s = rng.range(1.1, 1.8);
      const M = mat4([t[0] + rng.range(-0.6, 0.6), t[1] + rng.range(-0.3, 0.5), t[2] + rng.range(-0.6, 0.6)], [rng.range(-1.2, 1.2), rng.range(0, 6.28), rng.range(-1.2, 1.2)], [s, s, s]);
      const v = rng.range(0.75, 1.1);
      I.add('leaf', leafGeo(), 'leaves', M, [v, v, v * 0.9]);
    }
  }
  B.collider([x - 0.2, 0, z - 0.2], [x + 0.2, h * 0.5, z + 0.2], 'wood');
}

/** Palmeira: tronco curvo anelado + frondes arqueadas. */
export function palm(W, x, z, opts = {}) {
  const { B, rng } = W;
  const h = opts.h || rng.range(7, 10);
  const lean = [rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)];
  let p = [x, 0, z];
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const q = [x + lean[0] * h * t * t, h * t, z + lean[1] * h * t * t];
    const r = 0.2 - t * 0.06;
    cylBetween(B, p, q, r, 'wood', { seg: 8, color: [0.55, 0.5, 0.42] });
    B.add(torus(0.35, 10), 'wood', mat4(q, [Math.PI / 2, 0, 0], [r * 1.05, r * 1.05, r * 1.05]), { color: [0.45, 0.4, 0.33] });
    p = q;
  }
  const top = p;
  const n = 12;
  const frond = cached('frond', () => {
    const g = new THREE.PlaneGeometry(1, 3.6, 1, 8);
    g.translate(0, 1.8, 0);
    g.rotateX(-Math.PI / 2); // deitada ao longo de -z… vamos dobrar
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const d = -P.getZ(i); // distância ao longo da fronde
      P.setY(i, P.getY(i) + 0.9 * d * (1 - d / 3) - 0.18 * d * d * 0.5);
      P.setX(i, P.getX(i) * (1.6 - d * 0.25));
    }
    g.computeVertexNormals();
    return g;
  });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const droop = rng.range(-0.1, 0.5);
    B.add(frond, 'palm', mat4(top, [droop, a, rng.range(-0.2, 0.2)], [1, 1, rng.range(0.85, 1.15)]), { worldUV: false, color: [1, 1, 1].map(() => rng.range(0.8, 1.05)) });
  }
  B.collider([x - 0.25, 0, z - 0.25], [x + 0.25, 3, z + 0.25], 'wood');
}

export function grassTufts(W, x, z, r, n, opts = {}) {
  const { I, rng } = W;
  const q = W.quality.foliage ?? 1;
  const m = Math.round(n * q);
  for (let i = 0; i < m; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const px = x + (opts.dx !== undefined ? rng.range(-opts.dx, opts.dx) : Math.cos(a) * d);
    const pz = z + (opts.dz !== undefined ? rng.range(-opts.dz, opts.dz) : Math.sin(a) * d);
    const s = rng.range(0.25, 0.6);
    I.add('grass', grassGeo(), 'grass', mat4([px, opts.y || 0, pz], [0, rng.range(0, 6), 0], [s * 1.2, s, s * 1.2]), [rng.range(0.8, 1.1), rng.range(0.8, 1), rng.range(0.7, 0.9)], { shadow: false });
  }
}

// ─── miudezas ──────────────────────────────────────────────────────────
export function crate(W, x, z, yaw, s = 1, opts = {}) {
  const { B, rng } = W;
  const y = opts.y || 0;
  const tint = opts.tint || (rng.chance(0.5) ? [0.48, 0.52, 0.34] : [0.85, 0.75, 0.6]);
  const M = mat4([x, y + 0.3 * s, z], [0, yaw, 0], [1.0 * s, 0.6 * s, 0.6 * s]);
  const UNIT = cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
  B.add(UNIT, 'wood', M, { color: tint });
  // ripas de reforço
  for (const k of [-0.42, 0.42]) B.add(UNIT, 'wood', M.clone().multiply(mat4([k, 0, 0], [0, 0, 0], [0.08, 1.04, 1.04])), { color: tint.map((c) => c * 0.8) });
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'wood');
}

export function barrel(W, x, z, opts = {}) {
  const { B, rng } = W;
  const tint = opts.tint || rng.pick([[0.2, 0.3, 0.55], [0.6, 0.15, 0.1], [0.3, 0.4, 0.25], [0.15, 0.15, 0.15]]);
  if (opts.fallen) {
    const yaw = rng.range(0, 6);
    B.add(cyl(14), 'metal', mat4([x, 0.29, z], [Math.PI / 2, yaw, 0], [0.29, 0.88, 0.29]), { color: tint });
    B.collider([x - 0.45, 0, z - 0.45], [x + 0.45, 0.58, z + 0.45], 'metal');
    return;
  }
  cylinder(B, x, 0, z, 0.29, 0.88, 'metal', { seg: 14, color: tint, ao: [0, 0.3, 0.6] });
  for (const y of [0.29, 0.59]) B.add(torus(0.04, 14), 'metal', mat4([x, y, z], [Math.PI / 2, 0, 0], [0.295, 0.295, 0.295]), { color: tint.map((c) => c * 0.8) });
  B.collider([x - 0.3, 0, z - 0.3], [x + 0.3, 0.88, z + 0.3], 'metal');
}

export function tire(W, x, z, opts = {}) {
  const { B, rng } = W;
  const flat = opts.flat ?? rng.chance(0.6);
  const M = flat ? mat4([x, 0.11, z], [Math.PI / 2, 0, 0], [0.3, 0.3, 0.4]) : mat4([x, 0.33, z], [rng.range(-0.2, 0.2), rng.range(0, 6), 0], [0.3, 0.3, 0.45]);
  B.add(torus(0.42, 16), 'rubber', M, { color: [1, 1, 1] });
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

/** Lixo e papéis no chão (decalques do atlas 4×4). */
export function trash(W, x, z, r, n, y = 0.02) {
  const { B, rng } = W;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const q = rng.int(0, 15);
    const s = rng.range(0.25, 0.5);
    decal(B, 'trash', [x + Math.cos(a) * d, y + i * 0.0004, z + Math.sin(a) * d], 'py', [s, s], [(q % 4) / 4, Math.floor(q / 4) / 4, (q % 4 + 1) / 4, (Math.floor(q / 4) + 1) / 4], rng.range(0, 6));
  }
}

export { sphere, cable };
