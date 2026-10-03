/**
 * Primitivas de modelagem "hard surface" para a arma.
 *
 * Convenção da arma: X = direita, Y = cima, frente = −Z. O eixo do cano está
 * em y = 0. Perfis laterais são desenhados em (u, v) = (distância para a
 * frente, altura) e extrudados na largura (X), com chanfro.
 *
 * `Kit` acumula geometrias por material e funde tudo no fim (uma draw call
 * por material por peça móvel), com normais "vincadas": chanfros ficam
 * lisos (o shader de desgaste lê a curvatura deles) e quinas vivas, vivas.
 */
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const KEEP = ['position', 'normal', 'uv'];

function clean(g) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!KEEP.includes(k)) out.deleteAttribute(k);
  if (!out.attributes.uv) {
    const n = out.attributes.position.count;
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  out.morphAttributes = {};
  out.clearGroups();
  return out;
}

export class Kit {
  constructor() {
    this.parts = new Map();
  }
  /** Adiciona geometria (já posicionada, ou com matriz opcional). */
  add(mat, g, m) {
    if (m) g.applyMatrix4(m);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }
  /** Funde por material e devolve um Group com uma malha por material. */
  build(M, name = 'kit', { shadows = true } = {}) {
    const grp = new THREE.Group();
    grp.name = name;
    for (const [mat, list] of this.parts) {
      const geo = mergeGeometries(list.map(clean), false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[mat] || mat);
      mesh.name = `${name}:${mat}`;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.frustumCulled = false;
      grp.add(mesh);
    }
    return grp;
  }
}

/** Normais vincadas: suaviza ângulos < crease (chanfros) e mantém quinas. */
export function crease(g, angle = 0.62) {
  const ni = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ni.attributes)) if (!KEEP.includes(k)) ni.deleteAttribute(k);
  return toCreasedNormals(ni, angle);
}

/** Converte lista [[u,v],…] (ou Shape) num THREE.Shape. */
export function shapeOf(pts, holes = []) {
  const s = pts instanceof THREE.Shape ? pts : new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(h instanceof THREE.Path ? h : new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}

/** Retângulo arredondado como lista de pontos (para Shape/Path). */
export function roundRect(x0, y0, x1, y1, r, seg = 4) {
  const pts = [];
  const c = [
    [x1 - r, y0 + r, -Math.PI / 2],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, Math.PI / 2],
    [x0 + r, y0 + r, Math.PI],
  ];
  for (const [cx, cy, a0] of c) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/**
 * Perfil lateral (u = frente, v = cima) extrudado na largura `w` (eixo X),
 * centrado em x = cx. Chanfro `b` (m) nas duas faces.
 */
export function side(pts, w, { b = 0.0012, seg = 2, holes = [], cx = 0, curve = 12 } = {}) {
  const shape = shapeOf(pts, holes);
  const bt = Math.min(b, w * 0.3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, w - 2 * bt),
    bevelEnabled: bt > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelSegments: seg,
    curveSegments: curve,
  });
  g.rotateY(Math.PI / 2); // shape x → −Z, extrusão → +X
  g.translate(cx - w / 2 + bt, 0, 0);
  return crease(g);
}

/**
 * Seção transversal (x, y) extrudada ao longo de −Z, de z0 até z0 − len.
 */
export function section(pts, z0, len, { b = 0.001, seg = 2, holes = [], curve = 12 } = {}) {
  const shape = shapeOf(pts, holes);
  const bt = Math.min(b, len * 0.3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, len - 2 * bt),
    bevelEnabled: bt > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelSegments: seg,
    curveSegments: curve,
  });
  // extrusão em +Z a partir de 0 → queremos de z0 indo para −Z
  g.scale(1, 1, -1);
  g.translate(0, 0, z0 - bt);
  // scale negativo inverte o winding: corrige trocando a ordem dos índices
  flipWinding(g);
  return crease(g);
}

/** Perfil visto de cima (u = frente, x) extrudado na altura, centrado em y = cy. */
export function top(pts, h, { b = 0.001, seg = 2, holes = [], cy = 0 } = {}) {
  const shape = shapeOf(pts, holes);
  const bt = Math.min(b, h * 0.3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, h - 2 * bt),
    bevelEnabled: bt > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelSegments: seg,
    curveSegments: 10,
  });
  // shape (x=u, y=x) ; extrusão em z → altura
  // rotação: shape x → −Z, shape y → X, extrusão → Y
  const m = new THREE.Matrix4().set(
    0, 1, 0, 0,
    0, 0, 1, cy - h / 2 + bt,
    -1, 0, 0, 0,
    0, 0, 0, 1,
  );
  g.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(g);
  return crease(g);
}

function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
  } else {
    const p = g.attributes.position;
    const flip = (attr) => {
      if (!attr) return;
      const s = attr.itemSize, arr = attr.array;
      for (let i = 0; i < attr.count; i += 3) {
        for (let k = 0; k < s; k++) {
          const t = arr[(i + 1) * s + k];
          arr[(i + 1) * s + k] = arr[(i + 2) * s + k];
          arr[(i + 2) * s + k] = t;
        }
      }
      attr.needsUpdate = true;
    };
    flip(p);
    flip(g.attributes.normal);
    flip(g.attributes.uv);
  }
  g.computeVertexNormals();
}

/** Caixa arredondada centrada em (x, y, z). */
export function rbox(w, h, d, r, x = 0, y = 0, z = 0, seg = 2) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5));
  g.translate(x, y, z);
  return crease(g, 0.9);
}

/** Cilindro ao longo de Z: de z0 até z1, raio r (r1 opcional para cone). */
export function cylZ(r, z0, z1, { x = 0, y = 0, seg = 24, r1 = r, open = false, start = 0, len = Math.PI * 2 } = {}) {
  const L = Math.abs(z1 - z0);
  const g = new THREE.CylinderGeometry(r1, r, L, seg, 1, open, start, len);
  g.rotateX(-Math.PI / 2); // eixo Y → −Z: topo (r1) vai para −Z
  g.translate(x, y, (z0 + z1) / 2);
  if (z1 > z0) g.rotateZ(0); // r1 sempre na ponta mais negativa
  return crease(g, 0.7);
}

/** Cilindro ao longo de X (pinos, parafusos laterais). */
export function cylX(r, len, x, y, z, seg = 16) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return crease(g, 0.7);
}

/** Cilindro ao longo de Y. */
export function cylY(r, len, x, y, z, seg = 16, r1 = r) {
  const g = new THREE.CylinderGeometry(r1, r, len, seg);
  g.translate(x, y, z);
  return crease(g, 0.7);
}

/** Toro (anéis, olhal de bandoleira). */
export function torus(R, r, x, y, z, rx = 0, ry = 0, rz = 0, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(R, r, 8, 24, arc);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export const M4 = () => new THREE.Matrix4();
export { mergeGeometries, mergeVertices };
