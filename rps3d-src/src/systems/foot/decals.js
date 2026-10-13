// Marcas de impacto (queimaduras de plasma) no cenário: quads instanciados
// alinhados à normal, no referencial do âncora (acompanham o planeta que
// gira). Centro incandescente que esfria em ~2 s; a marca some em ~40 s.
import * as THREE from 'three/webgpu';
import { attribute, vec3, float, uv, smoothstep, length, exp, mix, uniform } from 'three/tsl';
import { A } from './projectiles.js';
import { vnoise2 } from './tsl.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1);

export class Decals {
  constructor(ctx, cap = 64) {
    this.ctx = ctx; this.cap = cap;
    this.items = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); // nascimento, cor r,g,b
    this.aInfo.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('dInfo', this.aInfo);
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.uNow = uniform(0);
    const I = attribute('dInfo', 'vec4');
    const age = this.uNow.sub(I.x);
    const p = uv().sub(0.5).mul(2);
    const r = length(p);
    const n = vnoise2(p.mul(4.0).add(I.x.mul(13.0)));
    const burn = smoothstep(1.0, 0.25, r.add(n.mul(0.35)));
    const core = smoothstep(0.45, 0.0, r.add(n.mul(0.15)));
    const fade = smoothstep(40.0, 30.0, age);
    mat.colorNode = vec3(0.02, 0.018, 0.016);
    mat.opacityNode = burn.mul(0.85).mul(fade);
    mat.roughnessNode = float(0.95);
    mat.metalnessNode = float(0);
    const hot = exp(age.mul(-1.6));
    mat.emissiveNode = mix(vec3(1.0, 0.35, 0.08), vec3(I.y, I.z, I.w), 0.4).mul(core.mul(hot).mul(6.0));
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'foot.marcas';
    ctx.scene.add(this.mesh);
    this.now = 0;
  }
  add(anchor, local, normalL, color = [0.4, 0.8, 1.0], size = 0.35) {
    const it = { anchor, local: local.clone(), normal: normalL.clone().normalize(), color, size: size * (0.8 + Math.random() * 0.5), rot: Math.random() * Math.PI * 2, t0: this.tNow ?? 0 };
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push(it);
  }
  frame(dt) {
    this.tNow = (this.tNow ?? 0) + dt;
    this.uNow.value = this.tNow;
    const ctx = this.ctx, t = ctx.time.world, origin = ctx.world.origin;
    let n = 0;
    const arr = this.aInfo.array;
    for (let i = this.items.length - 1; i >= 0; i--) if (this.tNow - this.items[i].t0 > 40) this.items.splice(i, 1);
    for (const it of this.items) {
      A.toWorld(it.anchor, it.local, _p, t).sub(origin);
      if (_p.lengthSq() > 250 * 250) continue;
      A.dirToWorld(it.anchor, it.normal, _n, t);
      _p.addScaledVector(_n, 0.02);
      _q.setFromUnitVectors(_Z, _n);
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(_Z, it.rot));
      _m.compose(_p, _q, _s.setScalar(it.size));
      this.mesh.setMatrixAt(n, _m);
      arr[n * 4] = it.t0;
      arr[n * 4 + 1] = it.color[0]; arr[n * 4 + 2] = it.color[1]; arr[n * 4 + 3] = it.color[2];
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aInfo.needsUpdate = true;
  }
  clear() { this.items.length = 0; this.mesh.count = 0; }
}
