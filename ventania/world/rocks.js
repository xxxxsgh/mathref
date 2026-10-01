// Pedras low-poly facetadas com musgo no topo, instanciadas.
// Quatro formas-base; cada instância só gira em Y (o musgo continua em cima).

import * as THREE from 'three';
import { rng, noise2 } from '../core/math.js';
import { LAKE, SPAWN, CLEARINGS, HILL, RIDGE, KNOLL } from './layout.js';
import { rockGeometry, paintStone, stoneMaterial, STONE_COLORS } from './stone.js';

export class Rocks {
  constructor(scene, terrain, colliders) {
    const r = rng(77);
    const shapes = [0, 1, 2, 3].map((i) =>
      paintStone(rockGeometry(i * 5.7 + 1, 1), { base: STONE_COLORS.rock, alt: STONE_COLORS.rockCool, moss: 0.45, seed: i }),
    );
    const buckets = shapes.map(() => []);

    const place = (x, z, s, sy = s * (0.6 + r() * 0.35)) => {
      const h = terrain.heightAt(x, z);
      if (h < -1) return;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 10) return;
      for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < c.r) return;
      const k = Math.floor(r() * shapes.length);
      // Enterra um pouco conforme a inclinação, para não flutuar.
      const n = terrain.normalAt(x, z);
      const y = h - s * 0.25 - (1 - n.y) * s * 1.2;
      buckets[k].push({ x, y, z, s, sy, rot: r() * Math.PI * 2 });
      if (s > 0.7) colliders.addCylinder(x, z, s * 0.82, y - 2, y + sy * 0.92, 'rock');
    };

    // Grupos nos morros e barrancos.
    for (const f of [HILL, RIDGE, KNOLL]) {
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2, d = f.r * (0.25 + r() * 0.75);
        place(f.x + Math.cos(a) * d, f.z + Math.sin(a) * d, 0.8 + r() * 2.6);
      }
    }
    // Espalhadas onde o terreno é inclinado (rocha aparente).
    for (let i = 0; i < 4000 && buckets.flat().length < 320; i++) {
      const x = (r() - 0.5) * 920, z = (r() - 0.5) * 920;
      const h = terrain.heightAt(x, z);
      if (h < 1) continue;
      const slope = 1 - terrain.normalAt(x, z).y;
      const chance = slope > 0.25 ? 0.5 : 0.04 + (noise2(x * 0.02, z * 0.02) > 0.35 ? 0.2 : 0);
      if (r() > chance) continue;
      place(x, z, 0.35 + r() * r() * 2.2);
    }
    // Pedras de praia e da margem do lago.
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = 395 + r() * 70;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = terrain.heightAt(x, z);
      if (h > -0.8 && h < 2.4) place(x, z, 0.5 + r() * 1.8);
    }
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = LAKE.r * (0.95 + r() * 0.3);
      place(LAKE.x + Math.cos(a) * d, LAKE.z + Math.sin(a) * d, 0.5 + r() * 1.4);
    }
    // Pedras grandes de marco (dá para subir nelas e planar).
    for (const [x, z, s] of [[-60, 110, 3.6], [120, 150, 4.2], [-200, -60, 5.0], [260, -60, 4.0], [-30, -150, 3.4]]) {
      place(x, z, s, s * 0.85);
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    this.group = new THREE.Group();
    this.group.name = 'rocks';
    shapes.forEach((g, k) => {
      const list = buckets[k];
      if (!list.length) return;
      const im = new THREE.InstancedMesh(g, stoneMaterial(), list.length);
      list.forEach((o, i) => {
        q.setFromAxisAngle(up, o.rot);
        sc.set(o.s, o.sy, o.s * (0.85 + 0.3 * ((i * 0.618) % 1)));
        m4.compose(p.set(o.x, o.y, o.z), q, sc);
        im.setMatrixAt(i, m4);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    });
    scene.add(this.group);
  }
}
