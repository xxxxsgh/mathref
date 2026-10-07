// Feixes de laser/raios instanciados: quad cilíndrico voltado para a câmera
// entre dois pontos, com núcleo branco-quente, halo colorido, pontas
// arredondadas (cápsula), ondulação de energia correndo ao longo do feixe e
// fade/cintilação na vida. Avaliado no vertex/fragment, CPU só escreve.

import * as THREE from 'three/webgpu';
import { maskVelocity } from '../mrtMask.js';
import { Fn, vec2, vec3, vec4, float, uv, instancedBufferAttribute, positionLocal, varying, exp, max, min, clamp, step, length, cross, normalize, dot, pow, sin, abs, mix, mrt } from 'three/tsl';

export class BeamPool {
  constructor(shared, capacity = 128) {
    this.shared = shared;
    this.capacity = capacity;
    this.cursor = 0;
    this.dirty = false;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attrs = [mk(), mk(), mk()];
    for (let i = 0; i < capacity; i++) {
      this.attrs[0].array[i * 4 + 3] = -1e6;
      this.attrs[1].array[i * 4 + 3] = 1;
    }
    this.attrs.forEach((a, i) => geo.setAttribute('b' + i, a));
    geo.instanceCount = capacity;
    this.geometry = geo;
    const S = shared;
    const [B0, B1, B2] = this.attrs.map((a) => instancedBufferAttribute(a));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.toneMapped = false;
    const age = S.time.sub(B0.w);
    const t = age.div(B1.w);
    const alive = step(0.0, t).mul(step(t, 1.0));
    const a = B0.xyz;
    const b = B1.xyz;
    const dir = b.sub(a);
    const L = length(dir);
    const ax = dir.div(max(L, 1e-4));
    const w = B2.w.mul(alive);
    // comprimento estendido pelas pontas (cápsula)
    const along = positionLocal.y.add(0.5); // 0..1
    const s = along.mul(L.add(w.mul(2))).sub(w);
    const p = a.add(ax.mul(s));
    const toCam = normalize(S.camPos.sub(p));
    const side = normalize(cross(ax, toCam).add(vec3(0, 1e-5, 0)));
    mat.positionNode = p.add(side.mul(positionLocal.x.mul(w).mul(2.0)));
    const vS = varying(s);
    const vL = varying(L);
    const vW = varying(w);
    const vT = varying(t);
    const vCol = varying(B2.xyz);
    const vSeed = varying(B0.w);
    mat.colorNode = Fn(() => {
      const x = uv().x.sub(0.5).mul(2.0); // −1..1 através
      // distância à cápsula em unidades de largura
      const ds = max(max(vS.negate(), vS.sub(vL)), 0).div(max(vW, 1e-4));
      const d = length(vec2(x, ds));
      const core = exp(d.mul(d).mul(-40.0));
      const glow = exp(d.mul(-4.5)).mul(0.6);
      const wave = sin(vS.mul(0.8).sub(vT.mul(60.0)).add(vSeed.mul(10.0))).mul(0.15).add(0.85);
      const fade = pow(clamp(float(1).sub(vT), 0, 1), 1.5).mul(min(vT.mul(30.0), 1));
      const flick = sin(vT.mul(90.0).add(vSeed)).mul(0.1).add(0.9);
      const c = vec3(1.0).mul(core.mul(6.0)).add(vCol.mul(glow.add(core).mul(4.0)).mul(wave));
      return vec4(c.mul(fade).mul(flick), 1);
    })();
    maskVelocity(mat);
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.name = 'fx-feixes';
  }

  emit(from, to, o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const k = i * 4;
    const [b0, b1, b2] = this.attrs.map((x) => x.array);
    b0[k] = from.x;
    b0[k + 1] = from.y;
    b0[k + 2] = from.z;
    b0[k + 3] = o.t0;
    b1[k] = to.x;
    b1[k + 1] = to.y;
    b1[k + 2] = to.z;
    b1[k + 3] = o.life;
    b2[k] = o.r;
    b2[k + 1] = o.g;
    b2[k + 2] = o.b;
    b2[k + 3] = o.width;
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    for (const a of this.attrs) a.needsUpdate = true;
    this.dirty = false;
  }

  translate(dx, dy, dz) {
    const [b0, b1] = this.attrs.map((x) => x.array);
    for (let i = 0; i < this.capacity; i++) {
      b0[i * 4] += dx;
      b0[i * 4 + 1] += dy;
      b0[i * 4 + 2] += dz;
      b1[i * 4] += dx;
      b1[i * 4 + 1] += dy;
      b1[i * 4 + 2] += dz;
    }
    this.dirty = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
