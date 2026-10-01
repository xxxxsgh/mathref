// Ajudantes de pedra: geometria facetada com musgo nas faces de cima, e o
// material compartilhado (toon, sombreamento flat, cores por vértice).

import * as THREE from 'three';
import { toonMaterial } from '../render/toon.js';
import { noise2 } from '../core/math.js';

export const STONE_COLORS = {
  ruin: new THREE.Color('#c8b89c'),
  ruinDark: new THREE.Color('#a8968a'),
  rock: new THREE.Color('#a49486'),
  rockCool: new THREE.Color('#8f86a0'),
  moss: new THREE.Color('#6f8f3a'),
  mossLight: new THREE.Color('#93ad48'),
};

let _mat = null;
export function stoneMaterial() {
  // Facetado: as geometrias são não-indexadas com normais por face.
  if (!_mat) _mat = toonMaterial({ key: 'stone', vertexColors: true, rim: 0.55 });
  return _mat;
}

/**
 * Pinta cada triângulo: pedra, com musgo onde a face aponta para cima.
 * A geometria precisa ser não-indexada. `worldMatrix` é usado para decidir o
 * "para cima" no mundo (a peça pode estar girada).
 */
export function paintStone(geo, { base, alt, moss = 0.55, mossAmount = 1, worldMatrix, seed = 0 } = {}) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), ctr = new THREE.Vector3(), ab = new THREE.Vector3();
  const nm = worldMatrix ? new THREE.Matrix3().getNormalMatrix(worldMatrix) : null;
  const tmp = new THREE.Color(), cc = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ctr.copy(a).add(b).add(c).divideScalar(3);
    n.subVectors(c, b).cross(ab.subVectors(a, b)).normalize();
    if (nm) n.applyMatrix3(nm).normalize();
    if (worldMatrix) ctr.applyMatrix4(worldMatrix);
    const v = noise2(ctr.x * 0.7 + seed, ctr.z * 0.7 - seed) * 0.5 + 0.5;
    cc.copy(base).lerp(alt || base, v);
    // Variação leve por face (aspecto "pintado à mão").
    cc.multiplyScalar(0.92 + 0.16 * fractHash(i + seed * 101));
    const up = n.y;
    const mossK = mossAmount * smooth(moss - 0.12, moss + 0.12, up + (v - 0.5) * 0.35);
    tmp.copy(STONE_COLORS.moss).lerp(STONE_COLORS.mossLight, v);
    cc.lerp(tmp, mossK);
    for (let k = 0; k < 3; k++) col.set([cc.r, cc.g, cc.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function fractHash(i) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Pedra low-poly irregular (icosaedro deformado), não-indexada. */
export function rockGeometry(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  // Deforma por posição (vértices duplicados recebem o mesmo deslocamento).
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + 0.28 * noise2(v.x * 1.7 + seed * 3.1, v.z * 1.7 + v.y * 1.3 - seed);
    v.multiplyScalar(k);
    // Base achatada para assentar no chão.
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return g.index ? g.toNonIndexed() : g;
}
