// Modelo procedural do míssil (corpo torneado, ogiva de sensor, aletas em X,
// faixa de identificação e bocal). Geometrias e materiais compartilhados.
import * as THREE from 'three/webgpu';
import { color, float, positionLocal, smoothstep, abs, mix, vec3, sin } from 'three/tsl';

let shared = null;

function build() {
  // perfil (r, z) do corpo — ogiva em −Z (frente)
  const prof = [[0, -1.55], [0.05, -1.5], [0.11, -1.36], [0.15, -1.15], [0.17, -0.9], [0.17, 1.05], [0.15, 1.2], [0.12, 1.28], [0.1, 1.3]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 18);
  lathe.rotateX(Math.PI / 2); // eixo Y do torno → Z
  lathe.computeVertexNormals();
  const fins = [];
  for (let k = 0; k < 4; k++) {
    const f = new THREE.BoxGeometry(0.02, 0.32, 0.5);
    f.translate(0, 0.3, 0.85);
    f.rotateZ(Math.PI / 4 + (k * Math.PI) / 2);
    fins.push(f);
    const c = new THREE.BoxGeometry(0.015, 0.14, 0.22);
    c.translate(0, 0.2, -0.55);
    c.rotateZ(Math.PI / 4 + (k * Math.PI) / 2);
    fins.push(c);
  }
  const nozzle = new THREE.CylinderGeometry(0.09, 0.12, 0.18, 14, 1, true);
  nozzle.rotateX(Math.PI / 2); nozzle.translate(0, 0, 1.38);
  const body = new THREE.MeshStandardNodeMaterial({ metalness: 0.55, roughness: 0.38 });
  // faixas: ogiva escura de sensor, corpo claro, faixa amarela de ogiva explosiva
  const z = positionLocal.z;
  const sensor = smoothstep(-1.12, -1.2, z);
  const band = smoothstep(0.04, 0.0, abs(z.add(0.62)).sub(0.07));
  const band2 = smoothstep(0.03, 0.0, abs(z.sub(0.55)).sub(0.03));
  body.colorNode = mix(mix(mix(color(0x9aa1a8), color(0xd8a531), band), color(0x30343a), band2), color(0x1a1d22), sensor);
  body.roughnessNode = mix(float(0.42), float(0.12), sensor);
  body.metalnessNode = mix(float(0.5), float(0.2), sensor);
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.45 });
  const hot = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  hot.colorNode = vec3(6.0, 2.4, 0.7).mul(sin(positionLocal.z.mul(40.0)).mul(0.1).add(0.9));
  const finGeo = mergeSimple(fins);
  shared = { lathe, finGeo, nozzle, body, dark, hot };
  return shared;
}

function mergeSimple(list) {
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const idx = [];
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), q = g.getAttribute('normal');
    pos.set(p.array, o * 3); nrm.set(q.array, o * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + o);
    o += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

/** Grupo do míssil (frente em −Z, ~3,1 m). scale: torpedos são maiores. */
export function makeMissileMesh(scale = 1) {
  const S = shared || build();
  const g = new THREE.Group();
  const b = new THREE.Mesh(S.lathe, S.body); b.castShadow = false;
  const f = new THREE.Mesh(S.finGeo, S.dark);
  const n = new THREE.Mesh(S.nozzle, S.hot);
  g.add(b, f, n);
  g.scale.setScalar(scale);
  g.name = 'combat.missile';
  return g;
}
