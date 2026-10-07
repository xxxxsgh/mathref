// Destroços instanciados (lascas de casco incandescentes que esfriam).
// Mesma ideia das partículas: trajetória e giro analíticos no vertex shader,
// CPU só escreve no nascimento. Sombreamento PBR de verdade (recebem a luz
// da estrela e das luzes de explosão) com emissivo de corpo negro.

import * as THREE from 'three/webgpu';
import { maskVelocity } from '../mrtMask.js';
import { rand } from './rng.js';
import { vec3, vec4, float, instancedBufferAttribute, positionLocal, varying, exp, max, clamp, step, cos, sin, cross, dot, normalize, pow, mix, mrt } from 'three/tsl';
import { blackbody, vnoise3, hash13 } from '../tsl-lib.js';

function shardGeometry() {
  // icosaedro deformado → lasca irregular (sombreamento chapado)
  const g = new THREE.IcosahedronGeometry(1, 0); // já é não indexada
  const pos = g.attributes.position;
  const map = new Map();
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, 0.55 + rnd() * 0.7);
    const k = map.get(key);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.45, pos.getZ(i) * k * 1.3);
  }
  g.computeVertexNormals();
  return g;
}

export class DebrisPool {
  constructor(shared, capacity) {
    this.shared = shared;
    this.capacity = capacity;
    this.cursor = 0;
    this.dirty = false;
    const base = shardGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('normal', base.attributes.normal);
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    // d0: pos, t0 | d1: vel, vida | d2: eixo, giro | d3: tamanho, arrasto, semente, calor
    this.attrs = [mk(), mk(), mk(), mk()];
    for (let i = 0; i < capacity; i++) {
      this.attrs[0].array[i * 4 + 3] = -1e6;
      this.attrs[1].array[i * 4 + 3] = 1;
      this.attrs[2].array[i * 4 + 1] = 1;
    }
    this.attrs.forEach((a, i) => geo.setAttribute('d' + i, a));
    geo.instanceCount = capacity;
    this.geometry = geo;

    const [D0, D1, D2, D3] = this.attrs.map((a) => instancedBufferAttribute(a));
    const S = shared;
    const mat = new THREE.MeshStandardNodeMaterial({ flatShading: true });
    mat.name = 'fx-destrocos';
    const age = S.time.sub(D0.w);
    const life = D1.w;
    const t = age.div(life);
    const alive = step(0.0, t).mul(step(t, 1.0));
    const ageC = clamp(age, 0, life);
    const drag = max(D3.y, 0.001);
    const travel = float(1).sub(exp(drag.negate().mul(ageC))).div(drag);
    const center = D0.xyz.add(D1.xyz.mul(travel));
    // escala não uniforme por semente (placas, varetas, lascas)
    const sd = D3.z;
    const sc = vec3(hash13(vec3(sd, 1, 2)).mul(0.9).add(0.5), hash13(vec3(sd, 3, 4)).mul(0.9).add(0.4), hash13(vec3(sd, 5, 6)).mul(0.9).add(0.5));
    const shrink = clamp(float(1).sub(t).mul(8), 0, 1); // some no fim
    const lp = positionLocal.mul(sc).mul(D3.x).mul(alive).mul(shrink);
    // rotação de Rodrigues em torno do eixo
    const k = normalize(D2.xyz);
    const ang = D2.w.mul(ageC).add(sd.mul(6.28));
    const c = cos(ang);
    const s = sin(ang);
    const rotated = lp.mul(c).add(cross(k, lp).mul(s)).add(k.mul(dot(k, lp)).mul(float(1).sub(c)));
    mat.positionNode = center.add(rotated);

    const vT = varying(t);
    const vHeat = varying(D3.w);
    const vSeed = varying(sd);
    const vLocal = varying(positionLocal);
    const n = vnoise3(vLocal.mul(3.0).add(vSeed.mul(11.0)));
    mat.colorNode = mix(vec3(0.16, 0.16, 0.17), vec3(0.42, 0.42, 0.44), n);
    mat.metalnessNode = float(0.75);
    mat.roughnessNode = n.mul(0.3).add(0.4);
    // incandescência: esfria em ~40% da vida; bordas/veios mais quentes
    const cool = pow(clamp(float(1).sub(vT.mul(3.5)), 0, 1), 2.0);
    const temp = cool.mul(vHeat).mul(n.mul(0.6).add(0.55));
    mat.emissiveNode = blackbody(clamp(temp, 0, 1)).mul(0.8);
    maskVelocity(mat);
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.name = 'fx-destrocos';
  }

  emit(p, v, o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const k = i * 4;
    const [d0, d1, d2, d3] = this.attrs.map((a) => a.array);
    d0[k] = p.x;
    d0[k + 1] = p.y;
    d0[k + 2] = p.z;
    d0[k + 3] = o.t0;
    d1[k] = v.x;
    d1[k + 1] = v.y;
    d1[k + 2] = v.z;
    d1[k + 3] = o.life;
    d2[k] = rand() - 0.5;
    d2[k + 1] = rand() - 0.5;
    d2[k + 2] = rand() - 0.5;
    d2[k + 3] = o.spin ?? 3;
    d3[k] = o.size;
    d3[k + 1] = o.drag ?? 0.3;
    d3[k + 2] = rand() * 100;
    d3[k + 3] = o.heat ?? 1;
    this.dirty = true;
  }

  /** Posição analítica (CPU) — para agendar rastros de fumaça. */
  static at(p, v, drag, age, out) {
    const d = Math.max(drag, 0.001);
    const tr = (1 - Math.exp(-d * age)) / d;
    return out.set(p.x + v.x * tr, p.y + v.y * tr, p.z + v.z * tr);
  }

  flush() {
    if (!this.dirty) return;
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.needsUpdate = true;
    }
    this.dirty = false;
  }

  translate(dx, dy, dz) {
    const a = this.attrs[0].array;
    for (let i = 0; i < this.capacity; i++) {
      a[i * 4] += dx;
      a[i * 4 + 1] += dy;
      a[i * 4 + 2] += dz;
    }
    this.dirty = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
