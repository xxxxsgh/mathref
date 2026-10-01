// Árvores "fofas" e arbustos.
//
// A copa é um punhado de esferas fundidas cujas normais apontam para FORA DO
// CENTRO DA COPA (normais esféricas): com o toon suave, a árvore inteira acende
// como uma única bolha macia, em vez de um monte de bolinhas.
// Tudo instanciado: um InstancedMesh por variante (tronco e copa).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../render/toon.js';
import { rng, noise2, smoothstep } from '../core/math.js';
import { FOREST, LAKE, SPAWN, CLEARINGS, PATHS } from './layout.js';
import { distToSegment } from '../core/math.js';

function canopyGeometry(blobs, seed, detail = 1) {
  const parts = [];
  const center = new THREE.Vector3();
  let wsum = 0;
  for (const [x, y, z, r] of blobs) { center.x += x * r; center.y += y * r; center.z += z * r; wsum += r; }
  center.divideScalar(wsum);
  let s = seed;
  for (const [x, y, z, r] of blobs) {
    // Detalhe 1 basta: as normais esféricas escondem as facetas.
    const g = new THREE.IcosahedronGeometry(r, detail);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.09 * noise2(v.x * 1.3 + s, v.y * 1.3 + v.z * 0.9 - s);
      p.setXYZ(i, v.x * k + x, v.y * k + y, v.z * k + z);
    }
    s += 7.3;
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  // Normais esféricas em relação ao centro da copa + cor mais escura embaixo.
  const p = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const box = new THREE.Box3().setFromBufferAttribute(p);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.fromBufferAttribute(nor, i);
    const sph = v.clone().sub(center).normalize();
    n.lerp(sph, 0.85).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
    const h = (v.y - box.min.y) / (box.max.y - box.min.y);
    const k = 0.62 + 0.5 * smoothstep(0, 1, h);
    col.set([k, k * 1.0, k * 0.95], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function trunkGeometry(height, r0, r1, lean) {
  const parts = [];
  const t = new THREE.CylinderGeometry(r1, r0, height, 7, 4, false);
  t.translate(0, height / 2, 0);
  const p = t.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = y / height;
    p.setX(i, p.getX(i) + lean * k * k);
  }
  parts.push(t);
  // Dois galhos subindo para a copa.
  for (const [a, h, l] of [[0.6, 0.55, 1.6], [3.4, 0.68, 1.3]]) {
    const b = new THREE.CylinderGeometry(r1 * 0.45, r1 * 0.7, l, 5);
    b.translate(0, l / 2, 0);
    b.rotateZ(-0.9);
    b.rotateY(a);
    b.translate(lean * h * h, height * h, 0);
    parts.push(b);
  }
  const g = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)));
  return g;
}

const VARIANTS = [
  {
    name: 'redonda',
    trunk: [4.2, 0.4, 0.24, 0.3],
    blobs: [[0, 5.4, 0, 2.6], [1.7, 4.9, 0.6, 1.9], [-1.6, 5.0, -0.4, 2.0], [0.3, 6.9, -0.5, 1.9], [-0.4, 4.6, 1.6, 1.7], [0.6, 4.7, -1.7, 1.6]],
  },
  {
    name: 'alta',
    trunk: [6.0, 0.36, 0.2, -0.25],
    blobs: [[0, 5.2, 0, 2.2], [0.2, 7.2, 0.2, 1.9], [-0.1, 8.9, -0.1, 1.4], [1.3, 5.6, 0.5, 1.4], [-1.2, 6.1, -0.6, 1.4]],
  },
  {
    name: 'larga',
    trunk: [3.4, 0.5, 0.3, 0.2],
    blobs: [[0, 4.6, 0, 2.4], [2.4, 4.2, 0.2, 2.0], [-2.3, 4.3, 0.4, 2.0], [0.2, 4.4, 2.2, 1.8], [-0.2, 4.3, -2.2, 1.8], [0.4, 5.9, 0.1, 2.0]],
  },
];

const CANOPY_TINTS = ['#5f9a32', '#74a83a', '#4f8a3a', '#86a63a', '#6a9a2e', '#5a8f44'].map((c) => new THREE.Color(c));
const AUTUMN = ['#c9a43a', '#d38b3a', '#b9b03e'].map((c) => new THREE.Color(c));

const SWAY = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float vtTime;\nuniform vec2 vtWind;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float ph = ip.x * 0.13 + ip.z * 0.17;
        float k = max(transformed.y - 2.5, 0.0) * 0.05;
        vec2 wd = normalize(vtWind);
        float s = sin(vtTime * 1.4 + ph) * 0.6 + sin(vtTime * 2.3 + ph * 1.7) * 0.3;
        transformed.xz += wd * (0.35 + s) * k;
      }`,
    );
};

export class Trees {
  constructor(scene, terrain, colliders) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'trees';
    scene.add(this.group);

    const trunkMat = toonMaterial({ key: 'trunk', color: '#6e4c3c', rim: 0.4 });
    const canopyMat = toonMaterial({ key: 'canopy', vertexColors: true, rim: 0.55, patch: SWAY });

    // Posições.
    const spots = [];
    const r = rng(42);
    const taken = new Map();
    const free = (x, z, d) => {
      const k = (ix, iz) => ix + ',' + iz;
      const ix = Math.floor(x / d), iz = Math.floor(z / d);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const l = taken.get(k(ix + a, iz + b));
        if (l) for (const [px, pz] of l) if (Math.hypot(px - x, pz - z) < d) return false;
      }
      const key = k(ix, iz);
      if (!taken.has(key)) taken.set(key, []);
      taken.get(key).push([x, z]);
      return true;
    };
    const ok = (x, z) => {
      const h = terrain.heightAt(x, z);
      if (h < 3.4) return false;
      if (terrain.normalAt(x, z).y < 0.82) return false;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.3) return false;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 16) return false;
      for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < c.r + 5) return false;
      for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) {
        if (distToSegment(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]) < 4) return false;
      }
      return true;
    };
    // Floresta.
    for (let i = 0; i < 4000 && spots.length < 330; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * FOREST.r * 1.25;
      const x = FOREST.x + Math.cos(a) * d, z = FOREST.z + Math.sin(a) * d;
      if (terrain.forestAt(x, z) < 0.35 + r() * 0.4) continue;
      if (!ok(x, z) || !free(x, z, 5.2)) continue;
      spots.push({ x, z, kind: r() < 0.45 ? 1 : r() < 0.6 ? 0 : 2, s: 0.85 + r() * 0.5 });
    }
    // Árvores soltas em grupinhos pelo campo.
    for (let i = 0; i < 3000 && spots.length < 430; i++) {
      const x = (r() - 0.5) * 860, z = (r() - 0.5) * 860;
      const cluster = noise2(x * 0.012 + 9, z * 0.012 - 4);
      if (cluster < 0.25) continue;
      if (!ok(x, z) || !free(x, z, 7)) continue;
      spots.push({ x, z, kind: r() < 0.5 ? 0 : 2, s: 0.8 + r() * 0.55 });
    }
    // Uma árvore de destaque perto do spawn, para dar escala ao primeiro quadro.
    spots.push({ x: SPAWN.x - 24, z: SPAWN.z - 30, kind: 0, s: 1.35, tint: 4 });

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    // Instâncias agrupadas em células de 220 m: o frustum culling (da câmera
    // e da caixa de sombra) descarta as células fora de vista.
    const CELLW = 220;
    const cellOf = (s) => Math.floor(s.x / CELLW) + ',' + Math.floor(s.z / CELLW);
    VARIANTS.forEach((v, vi) => {
      const all = spots.filter((s) => s.kind === vi);
      if (!all.length) return;
      const tg = trunkGeometry(...v.trunk);
      const cg = canopyGeometry(v.blobs, vi * 13 + 1);
      const cells = new Map();
      for (const s of all) {
        const k = cellOf(s);
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(s);
      }
      for (const list of cells.values()) {
        const trunks = new THREE.InstancedMesh(tg, trunkMat, list.length);
        const canopies = new THREE.InstancedMesh(cg, canopyMat, list.length);
        list.forEach((s, i) => {
          const y = terrain.heightAt(s.x, s.z) - 0.25;
          q.setFromAxisAngle(up, r() * Math.PI * 2);
          sc.set(s.s * (0.9 + r() * 0.2), s.s * (0.9 + r() * 0.25), s.s * (0.9 + r() * 0.2));
          m4.compose(pv.set(s.x, y, s.z), q, sc);
          trunks.setMatrixAt(i, m4);
          canopies.setMatrixAt(i, m4);
          const autumn = terrain.patchAt(s.x, s.z) > 0.78 && r() < 0.5;
          const c = (autumn ? AUTUMN[Math.floor(r() * AUTUMN.length)] : CANOPY_TINTS[s.tint ?? Math.floor(r() * CANOPY_TINTS.length)]).clone();
          c.offsetHSL(0, 0, (r() - 0.5) * 0.06);
          canopies.setColorAt(i, c);
          colliders.addCylinder(s.x, s.z, 0.45 * s.s, y, y + 4.5 * s.s, 'wood');
          // Copa: só a câmera colide (não entra na folhagem).
          colliders.addCylinder(s.x, s.z, 2.0 * s.s, y + 3.4 * s.s, y + 7.2 * s.s, 'leaf', true);
        });
        for (const m of [trunks, canopies]) {
          m.castShadow = true;
          m.receiveShadow = true;
          m.computeBoundingSphere();
          this.group.add(m);
        }
      }
    });
    this.count = spots.length;

    this._bushes(terrain, r);
  }

  _bushes(terrain, r) {
    const g = canopyGeometry([[0, 0.55, 0, 0.8], [0.6, 0.45, 0.2, 0.6], [-0.55, 0.42, -0.1, 0.62], [0.1, 0.85, -0.2, 0.55]], 99);
    const mat = toonMaterial({ key: 'bush', vertexColors: true, rim: 0.5 });
    const list = [];
    for (let i = 0; i < 6000 && list.length < 380; i++) {
      const x = (r() - 0.5) * 880, z = (r() - 0.5) * 880;
      const h = terrain.heightAt(x, z);
      if (h < 3.2 || terrain.normalAt(x, z).y < 0.85) continue;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.12) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) continue;
      let blocked = false;
      for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < c.r + 1) blocked = true;
      if (blocked) continue;
      const f = terrain.forestAt(x, z);
      if (r() > 0.25 + f * 0.75) continue;
      list.push([x, h, z]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const cells = new Map();
    for (const it of list) {
      const k = Math.floor(it[0] / 220) + ',' + Math.floor(it[2] / 220);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(it);
    }
    for (const cl of cells.values()) {
      const im = new THREE.InstancedMesh(g, mat, cl.length);
      cl.forEach(([x, h, z], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
        const k = 0.7 + r() * 0.9;
        s.set(k, k * (0.8 + r() * 0.4), k);
        m4.compose(p.set(x, h - 0.15, z), q, s);
        im.setMatrixAt(i, m4);
        im.setColorAt(i, CANOPY_TINTS[Math.floor(r() * CANOPY_TINTS.length)].clone().offsetHSL(0, 0.05, 0.02));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }
}

export { canopyGeometry, trunkGeometry, CANOPY_TINTS };
