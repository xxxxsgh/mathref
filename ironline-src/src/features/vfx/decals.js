/**
 * Marcas de tiro / sangue / queimado: UM InstancedMesh (ring buffer).
 *
 * Material PBR (MeshStandardMaterial) com atlas de albedo + atlas de normais
 * — as marcas recebem sol, sombra e IBL como o resto do mundo, e o relevo da
 * cratera aparece com a luz rasante. Cada instância escolhe o tile do atlas,
 * o fade e a rugosidade (sangue molhado brilha, concreto não) por atributo.
 * Tiros rasantes alongam a marca na direção do projétil.
 */
import * as THREE from 'three';
import { DT } from './atlas.js';

const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Decals {
  constructor({ capacity = 384, albedo, normal, rng, surface = null }) {
    this.capacity = capacity;
    this.surface = surface;
    this._hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0 };
    this.rng = rng;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aDecal = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aDecal.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDecal', this.aDecal);
    const mat = new THREE.MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      normalScale: new THREE.Vector2(1.6, 1.6),
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      envMapIntensity: 0.8,
    });
    mat.name = 'vfx-decals';
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aDecal;\nvarying vec4 vDecal;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          vDecal = aDecal;
          vec2 dUv = (vec2(mod(aDecal.x, 4.0), 3.0 - floor(aDecal.x / 4.0)) + uv) * 0.25;
          #ifdef USE_MAP
          vMapUv = dUv;
          #endif
          #ifdef USE_NORMALMAP
          vNormalMapUv = dUv;
          #endif`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vDecal;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.a *= vDecal.y;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = vDecal.z;');
    };
    mat.customProgramCacheKey = () => 'vfx-decals';
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.name = 'vfx-decals';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    this.mesh.userData.noSkyOcclusion = true;
    this.head = 0;
    // fade-in rápido (as marcas "aparecem" em 2 frames, não piscam)
    this.fading = [];
  }

  /**
   * kind: chave de DT (concrete, metal, blood…). size em metros.
   * dir (opcional): direção do projétil — alonga em tiros rasantes.
   */
  add(point, normal, kind, size, dir = null, { roughness = null, alpha = 1 } = {}) {
    const tiles = DT[kind] || DT.concrete;
    const rng = this.rng;
    const tile = tiles[(rng.next() * tiles.length) | 0];
    _n.copy(normal).normalize();
    // assenta na malha VISÍVEL (o colisor AABB pode estar a cm da fachada)
    if (this.surface) {
      _t.copy(dir || _n).normalize();
      if (!dir) _t.negate();
      _p.copy(point).addScaledVector(_t, -0.35);
      const h = this.surface.raycast(_p, _t, 0.7, this._hit);
      if (h && h.normal.dot(_n) > 0.5) {
        point = h.point;
        _n.copy(h.normal);
      }
    }
    let stretch = 1;
    if (dir) {
      const c = Math.abs(_n.dot(dir));
      _t.copy(dir).addScaledVector(_n, -_n.dot(dir));
      if (_t.lengthSq() > 1e-6 && c < 0.85) {
        _t.normalize();
        stretch = Math.min(2.2, 1 / Math.max(c, 0.45));
      } else _t.set(0, 0, 0);
    } else _t.set(0, 0, 0);
    if (_t.lengthSq() < 0.5) {
      // eixo aleatório no plano
      _t.set(1, 0, 0);
      if (Math.abs(_n.x) > 0.9) _t.set(0, 1, 0);
      _t.addScaledVector(_n, -_n.dot(_t)).normalize();
      const a = rng.next() * Math.PI * 2;
      _b.crossVectors(_n, _t);
      _t.multiplyScalar(Math.cos(a)).addScaledVector(_b, Math.sin(a)).normalize();
    }
    _b.crossVectors(_n, _t).normalize();
    const s = size * (0.85 + rng.next() * 0.3);
    // madeira: a fibra (eixo y do tile) segue a vertical do mundo
    if (kind === 'wood' && Math.abs(_n.y) < 0.7) {
      _b.set(0, 1, 0).addScaledVector(_n, -_n.y).normalize();
      _t.crossVectors(_b, _n).normalize();
      stretch = 1;
    }
    _p.copy(point).addScaledVector(_n, 0.004);
    _m.makeBasis(_t.multiplyScalar(s * stretch), _b.multiplyScalar(s), _n);
    _m.setPosition(_p);
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    const rough = roughness ?? (kind === 'blood' || kind === 'bloodSpray' ? 0.25 : kind === 'glass' ? 0.15 : kind === 'metal' ? 0.45 : 0.9);
    const d = this.aDecal.array;
    d[i * 4] = tile;
    d[i * 4 + 1] = 0;
    d[i * 4 + 2] = rough;
    d[i * 4 + 3] = 0;
    this.aDecal.needsUpdate = true;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.fading.push({ i, a: 0, target: alpha });
  }

  update(dt) {
    if (!this.fading.length) return;
    const d = this.aDecal.array;
    for (let k = this.fading.length - 1; k >= 0; k--) {
      const f = this.fading[k];
      f.a = Math.min(f.target, f.a + dt * 30);
      d[f.i * 4 + 1] = f.a;
      if (f.a >= f.target) this.fading.splice(k, 1);
    }
    this.aDecal.needsUpdate = true;
  }
}
