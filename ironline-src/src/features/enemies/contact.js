/**
 * Sombras de contato dos soldados (oclusão de chão).
 *
 * O shadow map do sol é suave e "descola" do pé; a AO de tela não pega bem
 * objetos finos. Aqui cada soldado ganha manchas escuras projetadas no chão,
 * num único InstancedMesh (1 draw call para todos):
 *   vivo  → uma elipse por pé (alinhada ao pé, some quando ele levanta) e
 *           uma mancha larga e fraca sob o corpo (oclusão do céu);
 *   morto → manchas ao longo do corpo (quadril, peito, cabeça, joelhos,
 *           pés, mãos) na altura do chão sob cada parte, mais forte quanto
 *           mais perto do chão — o corpo "assenta" no asfalto.
 * A cor é multiplicativa (escurece o que estiver embaixo, sem cor própria).
 */
import * as THREE from 'three';
import { B } from './rig.js';

const MAX = 256;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class ContactShadows {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // multiplicativo: dst * (1 - a·força)
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute float aStrength;
        varying vec2 vUv;
        varying float vK;
        void main() {
          vUv = uv * 2.0 - 1.0;
          vK = aStrength;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vK;
        void main() {
          float r2 = dot(vUv, vUv);
          if (r2 > 1.0) discard;
          // queda suave (gaussiana truncada): núcleo escuro, borda sem corte
          float a = exp(-r2 * 3.2) - exp(-3.2);
          gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(a * vK, 0.0, 0.9));
        }`,
    });
    this.strength = new Float32Array(MAX);
    geo.setAttribute('aStrength', new THREE.InstancedBufferAttribute(this.strength, 1));
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.name = 'enemy-contact-shadows';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.userData.noSkyOcclusion = true;
    scene.add(this.mesh);
    this.n = 0;
  }

  _push(x, y, z, sx, sz, yaw, k) {
    if (this.n >= MAX || k <= 0.01) return;
    _q.setFromAxisAngle(UP, yaw);
    _m.compose(_p.set(x, y + 0.012, z), _q, _s.set(sx, 1, sz));
    this.mesh.setMatrixAt(this.n, _m);
    this.strength[this.n] = k;
    this.n++;
  }

  /** Reconstrói as manchas de todos os soldados (por frame). */
  update(list) {
    this.n = 0;
    for (const e of list) {
      e.group.updateMatrixWorld();
      if (e.ragdoll) this._corpse(e);
      else this._alive(e);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aStrength.needsUpdate = true;
  }

  _alive(e) {
    const g = e.group.position;
    const gy = g.y;
    // sob o corpo: larga e fraca (o soldado bloqueia o céu)
    const crouch = e.anim.p.crouch;
    this._push(g.x, gy, g.z, 1.0 + crouch * 0.3, 1.0 + crouch * 0.3, e.yaw, 0.32 + crouch * 0.12);
    for (const side of ['L', 'R']) {
      const fb = B['foot.' + side];
      e.joint(fb, _v);
      // ponta do pé: direção do pé no mundo
      _w.set(0, 0, 1).applyQuaternion(e.anim.Qm[fb]).applyQuaternion(e.group.quaternion);
      const yaw = Math.atan2(_w.x, _w.z);
      const lift = Math.max(0, _v.y - gy - 0.095);
      const k = 0.75 * Math.max(0, 1 - lift / 0.12);
      const cx = _v.x + _w.x * 0.07, cz = _v.z + _w.z * 0.07;
      this._push(cx, gy, cz, 0.2 + lift, 0.42 + lift, yaw, k);
    }
  }

  _corpse(e) {
    const rd = e.ragdoll;
    const x = rd.x, ground = rd.ground;
    // [partícula, raio, força]
    for (const [i, r, k] of CORPSE) {
      const p = x[i];
      const gy = ground[i] > -1e8 ? ground[i] : e.group.position.y;
      const h = Math.max(0, p.y - gy);
      const f = k * Math.max(0, 1 - h / 0.45);
      this._push(p.x, gy, p.z, r * 2 + h, r * 2 + h, 0, f);
    }
  }
}

// partículas do ragdoll (ver ragdoll.js P): pelve, peito, cabeça, joelhos, tornozelos, punhos
const CORPSE = [
  [0, 0.34, 0.6],
  [1, 0.3, 0.5],
  [2, 0.34, 0.6],
  [4, 0.2, 0.55],
  [14, 0.18, 0.45],
  [18, 0.18, 0.45],
  [15, 0.15, 0.5],
  [19, 0.15, 0.5],
  [7, 0.12, 0.4],
  [11, 0.12, 0.4],
];
