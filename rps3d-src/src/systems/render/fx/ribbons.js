// Trilhas em fita (motores, mísseis): pontos amostrados do objeto seguido,
// guardados no referencial do "anchor" do fx (que acompanha a origem
// flutuante automaticamente). A fita é reconstruída voltada para a câmera
// a cada frame no CPU (poucas dezenas de pontos) e sombreada em TSL:
// núcleo quente → cor do motor → cauda que esfria/dissipa com ruído.

import * as THREE from 'three/webgpu';
import { maskVelocity } from '../mrtMask.js';
import { Fn, vec2, vec3, vec4, float, uv, uniform, attribute, varying, exp, pow, clamp, smoothstep, sin, mix, mrt } from 'three/tsl';
import { vnoise2 } from '../tsl-lib.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Vector3();

export class Ribbon {
  constructor(fx, object3d, o = {}) {
    this.fx = fx;
    this.obj = object3d;
    this.kind = o.kind || 'engine';
    this.max = o.points ?? 64;
    this.length = o.length ?? 40;
    this.width = o.width ?? 1;
    this.life = o.life ?? (this.kind === 'missile' ? 1.6 : 0.6);
    this.offset = (o.offset || new THREE.Vector3()).clone();
    this.pts = []; // {p: Vector3 (anchor-local), t}
    this.alive = true;
    this.following = true;
    this.intensity = uniform(o.intensity ?? 1);
    this.color = uniform(new THREE.Color(o.color ?? (this.kind === 'missile' ? 0xff8a3a : 0x6ab8ff)));
    const n = this.max;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.ta = new Float32Array(n * 2 * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('ta', new THREE.BufferAttribute(this.ta, 2).setUsage(THREE.DynamicDrawUsage));
    const uvs = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) {
      uvs[i * 4] = 0;
      uvs[i * 4 + 1] = i / (n - 1);
      uvs[i * 4 + 2] = 1;
      uvs[i * 4 + 3] = i / (n - 1);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geometry = geo;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.toneMapped = false;
    const ta = varying(attribute('ta', 'vec2'));
    const S = { time: fx.time };
    const missile = this.kind === 'missile';
    mat.colorNode = Fn(() => {
      const x = uv().x.sub(0.5).mul(2.0);
      const u = ta.x; // 0 = cabeça, 1 = cauda
      const age = ta.y; // 0..1
      const across = exp(x.mul(x).mul(missile ? -5.0 : -3.5));
      const coreW = exp(x.mul(x).mul(-30.0));
      const n = vnoise2(vec2(u.mul(18.0).sub(S.time.mul(7.0)), x.mul(2.0)));
      const fade = pow(clamp(float(1).sub(u), 0, 1), missile ? 1.4 : 2.2).mul(pow(clamp(float(1).sub(age), 0, 1), 1.5));
      const head = smoothstep(0.0, 0.03, u);
      const hot = mix(vec3(1.0, 0.95, 0.9), this.color, smoothstep(0.0, 0.35, u));
      const c = hot.mul(coreW.mul(3.0)).add(this.color.mul(across).mul(n.mul(0.5).add(0.6)));
      return vec4(c.mul(fade).mul(head).mul(this.intensity).mul(missile ? 6.0 : 4.0), 1);
    })();
    maskVelocity(mat);
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 23;
    this.mesh.name = 'fx-trilha';
    fx.anchor.add(this.mesh);
    this._acc = 0;
  }

  update(dt, time, camLocal) {
    const anchor = this.fx.anchor;
    // amostra o objeto seguido
    if (this.following && this.obj && this.obj.parent) {
      this.obj.updateWorldMatrix(true, false);
      _a.copy(this.offset).applyMatrix4(this.obj.matrixWorld);
      anchor.worldToLocal(_a);
      const last = this.pts[0];
      if (!last || last.p.distanceToSquared(_a) > 0.0004 * this.width * this.width) {
        const step = this.length / (this.max - 1);
        if (!last || last.p.distanceTo(_a) >= step || this.pts.length < 2) this.pts.unshift({ p: _a.clone(), t: time });
        else last.p.copy(_a), (last.t = time);
      }
    } else if (this.following) {
      this.following = false;
    }
    // remove velhos / excesso
    while (this.pts.length > this.max) this.pts.pop();
    while (this.pts.length && time - this.pts[this.pts.length - 1].t > this.life) this.pts.pop();
    if (!this.following && this.pts.length < 2) {
      this.alive = false;
      return;
    }
    // reconstrói a fita
    const n = this.pts.length;
    let along = 0;
    const total = Math.max(1e-3, this.pts.reduce((acc, q, i) => (i ? acc + q.p.distanceTo(this.pts[i - 1].p) : 0), 0));
    for (let i = 0; i < n; i++) {
      const p = this.pts[i].p;
      const pa = this.pts[Math.max(0, i - 1)].p;
      const pb = this.pts[Math.min(n - 1, i + 1)].p;
      _t.subVectors(pa, pb);
      if (_t.lengthSq() < 1e-10) _t.set(0, 0, 1);
      _c.subVectors(camLocal, p);
      _s.crossVectors(_t, _c).normalize();
      if (i) along += p.distanceTo(this.pts[i - 1].p);
      const u = along / total;
      const age = Math.min(1, (time - this.pts[i].t) / this.life);
      // largura: abre um pouco atrás do bocal e afina na cauda
      const w = this.width * (0.55 + 0.9 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5)) * (1 + age * (this.kind === 'missile' ? 1.5 : 0.4));
      const k = i * 6;
      this.pos[k] = p.x - _s.x * w;
      this.pos[k + 1] = p.y - _s.y * w;
      this.pos[k + 2] = p.z - _s.z * w;
      this.pos[k + 3] = p.x + _s.x * w;
      this.pos[k + 4] = p.y + _s.y * w;
      this.pos[k + 5] = p.z + _s.z * w;
      const j = i * 4;
      this.ta[j] = u;
      this.ta[j + 1] = age;
      this.ta[j + 2] = u;
      this.ta[j + 3] = age;
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.ta.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  translate(dx, dy, dz) {
    for (const q of this.pts) q.p.set(q.p.x + dx, q.p.y + dy, q.p.z + dz);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
