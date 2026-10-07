/**
 * Junta as malhas FILHAS DIRETAS de um nó por material (uma malha por
 * material), aplicando a transformação local de cada uma — os modelos
 * procedurais (torreta, drone, UAV) nascem com dezenas de peças, mas cada
 * parte rígida vira 1–4 draw calls. Grupos, sprites e Object3D (pivôs que
 * animam, boca do cano) ficam intactos.
 *
 * Retorna Map<material, Mesh> com as malhas resultantes.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeChildren(node, { castShadow = true, receiveShadow = true } = {}) {
  const byMat = new Map();
  for (const c of [...node.children]) {
    if (!c.isMesh || c.isSkinnedMesh || c.children.length) continue;
    const list = byMat.get(c.material) || [];
    list.push(c);
    byMat.set(c.material, list);
  }
  const out = new Map();
  for (const [mat, list] of byMat) {
    if (list.length === 1) {
      out.set(mat, list[0]);
      continue;
    }
    const geos = list.map((m) => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      // atributos comuns (algumas primitivas não têm uv)
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) {
      out.set(mat, list[0]);
      continue;
    }
    for (const m of list) {
      node.remove(m);
      m.geometry.dispose();
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    node.add(mesh);
    out.set(mat, mesh);
  }
  return out;
}

/** mergeChildren em cada nó da lista. */
export function mergeAll(nodes, opts) {
  for (const n of nodes) mergeChildren(n, opts);
}
