// Nuvens fofas e as três ilhas flutuantes.
//
// Nuvens: aglomerados de esferas com normais esféricas (igual às copas), base
// lavanda e topo branco — com o rim quente, as bordas ficam douradas no fim
// de tarde. Derivam devagar com o vento, num anel ao redor da ilha.
//
// Ilhas flutuantes: rocha em cone invertido facetada, tampa de grama, árvores,
// pedras penduradas e uma coluna em ruínas na maior. Ainda sem acesso.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../render/toon.js';
import { rng, noise2, smoothstep } from '../core/math.js';
import { SKY_ISLANDS } from './layout.js';
import { paintStone, stoneMaterial, STONE_COLORS, rockGeometry } from './stone.js';
import { canopyGeometry, trunkGeometry, CANOPY_TINTS } from './trees.js';
import { GRASS_COLORS, grassTipColor } from './terrain.js';

function cloudGeometry(seed) {
  const r = rng(seed);
  const parts = [];
  const n = 7 + Math.floor(r() * 6);
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 60, z = (r() - 0.5) * 26;
    const rad = 9 + r() * 10 * (1 - Math.abs(x) / 40);
    blobs.push([x, rad * 0.35 + r() * 4, z, rad]);
  }
  const center = new THREE.Vector3();
  for (const [x, y, z, rad] of blobs) {
    const g = new THREE.IcosahedronGeometry(rad, 2);
    g.translate(x, y, z);
    parts.push(g);
    center.add(new THREE.Vector3(x, y, z));
  }
  center.divideScalar(blobs.length);
  center.y -= 6;
  const g = mergeGeometries(parts);
  const p = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  const box = new THREE.Box3().setFromBufferAttribute(p);
  const bottom = new THREE.Color('#b9b0dc'), top = new THREE.Color('#ffffff'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Base achatada (nuvem de bom tempo).
    if (v.y < box.min.y + 6) v.y = box.min.y + 6 + (v.y - box.min.y - 6) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
    nn.fromBufferAttribute(nor, i).lerp(v.clone().sub(center).normalize(), 0.75).normalize();
    nor.setXYZ(i, nn.x, nn.y, nn.z);
    const h = (v.y - box.min.y) / (box.max.y - box.min.y);
    c.copy(bottom).lerp(top, smoothstep(0.05, 0.7, h));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Clouds {
  constructor(scene) {
    const r = rng(5);
    const geos = [1, 2, 3, 4].map((s) => cloudGeometry(s * 31));
    this.mat = toonMaterial({ key: 'cloud', vertexColors: true, rim: 1.6, emissive: new THREE.Color('#2a2440') });
    this.items = [];
    this.meshes = geos.map((g) => {
      const im = new THREE.InstancedMesh(g, this.mat, 9);
      im.frustumCulled = false;
      im.userData.noAO = true;
      scene.add(im);
      return im;
    });
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 36; i++) {
      const k = i % 4;
      const a = r() * Math.PI * 2;
      const d = 380 + r() * 1300;
      this.items.push({
        mesh: this.meshes[k], idx: counts[k]++,
        x: Math.cos(a) * d, z: Math.sin(a) * d,
        y: 190 + r() * 170 + d * 0.04,
        s: 1.1 + r() * 1.6, rot: r() * 6.28,
      });
    }
    for (const im of this.meshes) im.count = counts[this.meshes.indexOf(im)];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.update(0, new THREE.Vector2(1, 0));
  }

  update(dt, wind) {
    const up = new THREE.Vector3(0, 1, 0);
    for (const c of this.items) {
      c.x += wind.x * dt * 2.2;
      c.z += wind.y * dt * 2.2;
      // Dá a volta num quadrado de 3.6 km centrado na ilha.
      if (c.x > 1800) c.x -= 3600; if (c.x < -1800) c.x += 3600;
      if (c.z > 1800) c.z -= 3600; if (c.z < -1800) c.z += 3600;
      this._q.setFromAxisAngle(up, c.rot);
      this._s.set(c.s, c.s * 0.8, c.s);
      this._m.compose(this._p.set(c.x, c.y, c.z), this._q, this._s);
      c.mesh.setMatrixAt(c.idx, this._m);
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
}

export class SkyIslands {
  constructor(scene) {
    this.groups = [];
    const grassMat = toonMaterial({ key: 'skygrass', vertexColors: true, rim: 0.8 });
    const canopyMat = toonMaterial({ key: 'skycanopy', vertexColors: true, rim: 1.0 });
    const trunkMat = toonMaterial({ key: 'skytrunk', color: '#6e4c3c' });

    for (const I of SKY_ISLANDS) {
      const r = rng(I.seed);
      const g = new THREE.Group();
      g.position.set(I.x, I.y, I.z);
      g.name = 'skyisland';

      // Rocha: torno em cone invertido + ruído, facetada.
      const prof = [];
      const steps = 9;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rad = I.r * (1 - Math.pow(t, 1.35)) * (1 + 0.08 * Math.sin(t * 9));
        prof.push(new THREE.Vector2(Math.max(rad, 0.01), -t * I.r * 1.25));
      }
      let rock = new THREE.LatheGeometry(prof, 14);
      rock = rock.toNonIndexed();
      const p = rock.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + 0.22 * noise2(x * 0.06 + I.seed, z * 0.06 + y * 0.05);
        p.setXYZ(i, x * k, y * (1 + 0.1 * noise2(x * 0.05, z * 0.05)), z * k);
      }
      paintStone(rock, { base: STONE_COLORS.rockCool, alt: STONE_COLORS.rock, moss: 0.3, mossAmount: 0.6, seed: I.seed });
      const rm = new THREE.Mesh(rock, stoneMaterial());
      rm.castShadow = false;
      g.add(rm);

      // Tampa de grama levemente abaulada, com borda caindo sobre a rocha.
      const cap = new THREE.CircleGeometry(I.r * 1.04, 40, 0, Math.PI * 2);
      cap.rotateX(-Math.PI / 2);
      const cp = cap.attributes.position;
      const ccol = new Float32Array(cp.count * 3);
      const tip = new THREE.Color(), c = new THREE.Color();
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), z = cp.getZ(i);
        const d = Math.hypot(x, z) / I.r;
        const y = (1 - d * d) * I.r * 0.12 + noise2(x * 0.08 + I.seed, z * 0.08) * 1.4 - smoothstep(0.85, 1.04, d) * 2.5;
        cp.setY(i, y);
        grassTipColor(0.5 + 0.5 * noise2(x * 0.05, z * 0.05 + I.seed), tip);
        c.copy(GRASS_COLORS.root).lerp(tip, 0.65);
        ccol.set([c.r, c.g, c.b], i * 3);
      }
      cap.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
      cap.computeVertexNormals();
      g.add(new THREE.Mesh(cap, grassMat));

      // Árvores.
      const nTrees = Math.round(I.r / 8);
      const cg = canopyGeometry([[0, 5.4, 0, 2.6], [1.7, 4.9, 0.6, 1.9], [-1.6, 5.0, -0.4, 2.0], [0.3, 6.9, -0.5, 1.9]], I.seed);
      const tg = trunkGeometry(4.2, 0.4, 0.24, 0.3);
      const canopies = new THREE.InstancedMesh(cg, canopyMat, nTrees);
      const trunks = new THREE.InstancedMesh(tg, trunkMat, nTrees);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
      for (let i = 0; i < nTrees; i++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * I.r * 0.75;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const y = (1 - (d / I.r) ** 2) * I.r * 0.12 - 0.5;
        const k = 1 + r() * 0.8;
        m4.compose(pv.set(x, y, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6), s.set(k, k, k));
        canopies.setMatrixAt(i, m4);
        trunks.setMatrixAt(i, m4);
        canopies.setColorAt(i, CANOPY_TINTS[Math.floor(r() * CANOPY_TINTS.length)]);
      }
      g.add(canopies, trunks);

      // Pedras penduradas embaixo.
      const hang = [];
      for (let i = 0; i < 5; i++) {
        const geo = rockGeometry(I.seed + i, 1);
        const k = I.r * (0.06 + r() * 0.07);
        geo.scale(k, k * 1.6, k);
        const a = r() * 6.28, d = I.r * (0.35 + r() * 0.5);
        geo.translate(Math.cos(a) * d, -I.r * (0.55 + r() * 0.5) * (1 - d / I.r), Math.sin(a) * d);
        hang.push(paintStone(geo, { base: STONE_COLORS.rockCool, alt: STONE_COLORS.rock, moss: 0.5, seed: i }));
      }
      g.add(new THREE.Mesh(mergeGeometries(hang), stoneMaterial()));

      // Coluna solitária na ilha maior: o mistério.
      if (I === SKY_ISLANDS[0]) {
        const col = new THREE.CylinderGeometry(1.4, 1.6, 16, 12).toNonIndexed();
        col.translate(I.r * 0.2, 8 + I.r * 0.1, -I.r * 0.15);
        paintStone(col, { base: STONE_COLORS.ruin, alt: STONE_COLORS.ruinDark, moss: 0.6 });
        g.add(new THREE.Mesh(col, stoneMaterial()));
      }

      g.traverse((o) => { if (o.isMesh) { o.userData.noAO = true; o.receiveShadow = false; } });
      g.userData.baseY = I.y;
      g.userData.phase = I.seed;
      scene.add(g);
      this.groups.push(g);
    }
  }

  update(time) {
    for (const g of this.groups) {
      g.position.y = g.userData.baseY + Math.sin(time * 0.15 + g.userData.phase) * 2.0;
      g.rotation.y = Math.sin(time * 0.03 + g.userData.phase) * 0.05;
    }
  }
}
