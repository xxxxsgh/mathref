// Bolha de escudo: elipsoide justo ao casco, invisível em repouso. Cada
// impacto acende uma mancha hexagonal no ponto atingido com uma onda que se
// espalha pela superfície, e a bolha inteira pisca (borda fresnel) por um
// instante. Escudo baixo → cintila e fica avermelhado; colapso → estilhaça.
import * as THREE from 'three/webgpu';
import { Fn, uniform, uniformArray, normalLocal, positionLocal, positionView, normalView, vec3, vec4, float, abs, dot, normalize, pow, exp, smoothstep, fract, min, max, mix, Loop, int, acos, clamp } from 'three/tsl';
import { hash13 } from './tsl.js';

const MAXI = 4;
let _geo = null;

export class ShieldBubble {
  /** parent: grupo da nave; box: caixa local da nave (Box3). color: [r,g,b] HDR. */
  constructor(parent, box, color = [0.35, 0.65, 1.0]) {
    if (!_geo) _geo = new THREE.SphereGeometry(1, 40, 24);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    this.scale = size.multiplyScalar(0.62).addScalar(1.2);
    this.U = {
      hits: uniformArray(Array.from({ length: MAXI }, () => new THREE.Vector4(0, 0, 1, -100)), 'vec4'),
      now: uniform(0), flash: uniform(0), level: uniform(1), color: uniform(new THREE.Color(...color)), broken: uniform(0),
    };
    this.mat = makeMaterial(this.U);
    this.mesh = new THREE.Mesh(_geo, this.mat);
    this.mesh.scale.copy(this.scale);
    this.mesh.position.copy(c);
    this.mesh.renderOrder = 11;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'combat.shield';
    parent.add(this.mesh);
    this.idx = 0; this.t = 0; this.lastHit = -100;
    this.center = c;
  }
  /** Impacto num ponto LOCAL da nave. */
  hit(local, strength = 1) {
    const d = local.clone().sub(this.center).divide(this.scale).normalize();
    const v = this.U.hits.array ? this.U.hits.array[this.idx % MAXI] : this.U.hits.value[this.idx % MAXI];
    v.set(d.x, d.y, d.z, this.t);
    this.idx++;
    this.lastHit = this.t;
    this.U.flash.value = Math.min(1.6, this.U.flash.value + 0.35 + strength * 0.4);
    this.mesh.visible = true;
  }
  shatter() { this.U.broken.value = 1; this.U.flash.value = 2.2; this.lastHit = this.t; this.mesh.visible = true; }
  frame(dt, level) {
    this.t += dt;
    this.U.now.value = this.t;
    this.U.level.value = level;
    this.U.flash.value *= Math.exp(-dt * 3.2);
    if (this.U.broken.value > 0) this.U.broken.value = Math.max(0, this.U.broken.value - dt * 0.8);
    this.mesh.visible = this.t - this.lastHit < 1.6;
  }
  dispose() { this.mesh.removeFromParent(); this.mat.dispose(); }
}

function makeMaterial(U) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  mat.fog = false;
  mat.colorNode = Fn(() => {
    const n = normalize(normalLocal);
    const vn = normalize(normalView);
    const vd = normalize(positionView.negate());
    const fres = pow(float(1).sub(abs(dot(vn, vd))), 2.6);
    // grade hexagonal aproximada (três famílias de linhas a 60°) em coordenadas esféricas
    const p = normalize(positionLocal).mul(11.0);
    const a1 = abs(fract(p.x.add(p.z.mul(0.5))).sub(0.5));
    const a2 = abs(fract(p.z.mul(0.866).add(p.y.mul(0.5))).sub(0.5));
    const a3 = abs(fract(p.y.add(p.x.mul(-0.5)).add(p.z.mul(0.3))).sub(0.5));
    const cell = min(min(a1, a2), a3);
    const lines = smoothstep(0.07, 0.0, cell);
    const sparkle = hash13(p.mul(3.0).floor());
    const hitSum = float(0).toVar();
    const ringSum = float(0).toVar();
    Loop({ start: int(0), end: int(MAXI) }, ({ i }) => {
      const h = U.hits.element(i);
      const age = U.now.sub(h.w);
      const ang = acos(clamp(dot(n, h.xyz), -1, 1));
      const life = exp(age.mul(-3.0)).mul(smoothstep(0.0, 0.02, age));
      // mancha quente no ponto de impacto
      hitSum.addAssign(exp(ang.mul(ang).mul(-26.0)).mul(life).mul(2.2));
      // onda que corre pela bolha
      const front = age.mul(2.6);
      ringSum.addAssign(exp(abs(ang.sub(front)).mul(-18.0)).mul(life).mul(smoothstep(1.6, 0.2, ang)));
    });
    const low = float(1).sub(U.level);
    const tint = mix(U.color, vec3(1.0, 0.35, 0.18), smoothstep(0.55, 0.95, low));
    const body = fres.mul(U.flash.mul(0.55)).add(lines.mul(fres.mul(0.6).add(0.2)).mul(U.flash.mul(0.25)));
    const impact = hitSum.mul(lines.mul(0.7).add(0.45)).add(ringSum.mul(lines.mul(1.2).add(0.25)));
    const shards = U.broken.mul(lines).mul(smoothstep(0.55, 0.95, sparkle)).mul(3.0);
    const total = body.add(impact).add(shards);
    return vec4(tint.mul(total).mul(2.4), float(1));
  })();
  return mat;
}
