// Clarão de cano: malha pequena (3 planos cruzados + disco frontal) presa ao
// objeto da arma por ~3 frames, com pétalas procedurais diferentes a cada
// disparo (semente/rotação). Pool reutilizável.

import * as THREE from 'three/webgpu';
import { maskVelocity } from '../mrtMask.js';
import { rand } from './rng.js';
import { Fn, vec2, vec3, vec4, float, uv, uniform, exp, abs, pow, atan, sin, clamp, smoothstep, length, mrt } from 'three/tsl';
import { vnoise2 } from '../tsl-lib.js';

export class MuzzlePool {
  constructor(fx, count = 12) {
    this.fx = fx;
    this.items = [];
    for (let i = 0; i < count; i++) this.items.push(this.make());
  }

  make() {
    const seed = uniform(rand() * 10);
    const fade = uniform(0);
    const color = uniform(new THREE.Color(1, 0.6, 0.25));
    const side = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    side.toneMapped = false;
    side.colorNode = Fn(() => {
      // plano lateral: chama alongada para a frente (+y do plano = −z da arma)
      const q = uv().sub(vec2(0.5, 0.0));
      const y = q.y; // 0 = boca, 1 = ponta
      const w = float(0.32).mul(pow(float(1).sub(y), 0.7)).mul(vnoise2(vec2(y.mul(6.0), seed)).mul(0.6).add(0.6));
      const m = exp(abs(q.x).div(w.add(0.01)).mul(-2.2).sub(y.mul(1.6)));
      const core = exp(q.x.mul(q.x).mul(-400.0)).mul(exp(y.mul(-5.0)));
      return vec4(color.mul(m.mul(5.0)).add(vec3(1, 0.95, 0.85).mul(core.mul(8.0))).mul(fade), 1);
    })();
    maskVelocity(side);
    const front = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    front.toneMapped = false;
    front.colorNode = Fn(() => {
      const q = uv().sub(0.5).mul(2.0);
      const r = length(q);
      const a = atan(q.y, q.x);
      const petals = pow(abs(sin(a.mul(2.5).add(seed))), 3.0).mul(0.5).add(0.5);
      const m = exp(r.div(petals.mul(0.55).add(0.1)).mul(-2.5));
      const core = exp(r.mul(r).mul(-60.0)).mul(3.0);
      return vec4(color.mul(m.mul(4.0)).add(vec3(1).mul(core)).mul(fade).mul(clamp(float(1).sub(r), 0, 1)), 1);
    })();
    maskVelocity(front);
    const g = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2); // estende para −z
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(planeGeo, side);
      m.rotation.z = (k * Math.PI) / 3;
      m.frustumCulled = false;
      g.add(m);
    }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), front);
    f.frustumCulled = false;
    g.add(f);
    g.visible = false;
    g.renderOrder = 24;
    g.userData = { seed, fade, color, age: 0, life: 0.06, busy: false };
    return g;
  }

  fire(object3d, { color = 0xffa040, scale = 1, offset = null, life = 0.055 } = {}) {
    let it = this.items.find((x) => !x.userData.busy) || this.items[0];
    const u = it.userData;
    u.busy = true;
    u.age = 0;
    u.life = life;
    u.seed.value = rand() * 100;
    u.color.value.set(color);
    it.visible = true;
    it.scale.setScalar(scale);
    it.rotation.set(0, 0, rand() * Math.PI);
    it.position.copy(offset || new THREE.Vector3());
    object3d.add(it);
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      const u = it.userData;
      if (!u.busy) continue;
      u.age += dt;
      const t = u.age / u.life;
      u.fade.value = Math.max(0, 1 - t) ** 1.5;
      it.scale.z = it.scale.x * (1 + t * 0.6);
      if (t >= 1) {
        u.busy = false;
        it.visible = false;
        it.removeFromParent();
      }
    }
  }
}
