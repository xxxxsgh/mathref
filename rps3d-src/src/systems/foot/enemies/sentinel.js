// Sentinela dos Vigilantes: máquina antiga dos Arquitetos que flutua sobre as
// ruínas. Núcleo de obsidiana com veios azuis, anéis orbitais em arco que
// giram, quatro pétalas que se abrem para disparar um raio carregado e um
// "olho" de lente. Animado por código (flutuar, girar, abrir, morrer).
import * as THREE from 'three/webgpu';
import { Kit, pal, kitMaterial } from './kit.js';

const OBS = pal('#14161c', 0.6, 0.18, 0, 0.05);
const OBS2 = pal('#1e2230', 0.7, 0.24, 0, 0.08);
const STONE = pal('#3a3c44', 0.2, 0.55, 0, 0.3);
const GLOW = pal('#7fd0ff', 0, 0.2, 1, 0);
const GLOW2 = pal('#c8ecff', 0, 0.2, 1, 0);

export function buildSentinel({ lite = false, size = 1 } = {}) {
  const K = new Kit();
  // núcleo facetado
  K.geo('core', OBS, new THREE.IcosahedronGeometry(0.42 * size, 1), [0, 0, 0], null, [1, 1.15, 1]);
  K.geo('core', OBS2, new THREE.OctahedronGeometry(0.5 * size, 0), [0, 0, 0], [0.3, 0.6, 0], [0.7, 0.95, 0.7]);
  // veios luminosos (anéis finos em vários planos)
  for (let i = 0; i < 3; i++) K.torus('core', GLOW, 0.43 * size, 0.008 * size, [0, 0, 0], [i * 1.05, i * 0.7, 0], 32);
  // olho
  K.cyl('core', OBS2, 0.17 * size, 0.2 * size, 0.12 * size, [0, 0, -0.4 * size], [Math.PI / 2, 0, 0], 16);
  K.sphere('core', GLOW2, 0.1 * size, [0, 0, -0.46 * size], [1, 1, 0.6], 14);
  K.torus('core', GLOW, 0.15 * size, 0.012 * size, [0, 0, -0.47 * size], [0, 0, 0], 24);
  // anéis orbitais (3 arcos)
  for (let i = 0; i < 3; i++) {
    const seg = 'ring' + i;
    const R = (0.78 + i * 0.16) * size;
    K.geo(seg, STONE, new THREE.TorusGeometry(R, 0.035 * size, 6, 40, Math.PI * 1.3), [0, 0, 0], null);
    K.geo(seg, GLOW, new THREE.TorusGeometry(R, 0.012 * size, 4, 40, Math.PI * 1.3), [0, 0, 0.03 * size], null);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI * 1.3 / 3; K.box(seg, OBS2, 0.09 * size, 0.09 * size, 0.09 * size, [Math.cos(a) * R, Math.sin(a) * R, 0], [0, 0, a + 0.785], 0.01); }
  }
  // pétalas (abrem para frente)
  for (let k = 0; k < 4; k++) {
    const seg = 'petal' + k;
    K.geo(seg, OBS, new THREE.ConeGeometry(0.14 * size, 0.7 * size, 4, 1), [0, 0.35 * size, 0], null, [1, 1, 0.4]);
    K.box(seg, GLOW, 0.02 * size, 0.5 * size, 0.02 * size, [0, 0.33 * size, 0.04 * size], null);
  }
  const mat = kitMaterial({ lite, scale: 6 });
  const bones = K.build(mat, { shadows: !lite });
  const root = new THREE.Group(); root.name = 'sentinela';
  const body = new THREE.Group(); root.add(body);
  body.add(bones.core);
  const rings = [];
  for (let i = 0; i < 3; i++) { const g = new THREE.Group(); g.add(bones['ring' + i]); body.add(g); rings.push(g); }
  const petals = [];
  for (let k = 0; k < 4; k++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = k * Math.PI / 2 + Math.PI / 4;
    const hinge = new THREE.Group(); hinge.position.y = 0.35 * size; pivot.add(hinge); hinge.add(bones['petal' + k]);
    bones['petal' + k].position.y = -0.05 * size;
    body.add(pivot); petals.push(hinge);
  }
  const eye = new THREE.Object3D(); eye.position.set(0, 0, -0.5 * size); body.add(eye);
  const light = new THREE.PointLight(0x7fd0ff, 0, 14, 2); light.position.set(0, 0, -0.6 * size); body.add(light);
  return { root, body, rings, petals, eye, light, mat, size };
}

/** Anima a sentinela: s = { t, open 0..1, charge 0..1, dead 0..1, spin } */
export function poseSentinel(rig, s) {
  const t = s.t;
  rig.body.position.y = Math.sin(t * 1.3) * 0.08 * (1 - s.dead);
  rig.rings.forEach((r, i) => {
    r.rotation.set(t * (0.4 + i * 0.23) * (1 - s.dead * 0.9) + i, t * (0.31 - i * 0.17) + i * 2.1, t * 0.5 * (i % 2 ? -1 : 1));
  });
  const open = s.open;
  rig.petals.forEach((p, k) => { p.rotation.x = -0.15 - open * 0.9 + Math.sin(t * 3 + k) * 0.03; });
  rig.light.intensity = (2 + s.charge * 40) * (1 - s.dead);
  rig.mat.userData.U.glow.value = (0.6 + s.charge * 2.5 + Math.sin(t * 6) * 0.1) * (1 - s.dead * 0.97);
}
