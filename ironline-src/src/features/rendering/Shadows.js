/**
 * Sombra do sol ajustada à câmera ("tightly fitted"): o frustum ortográfico
 * do sol acompanha o jogador, deslocado para a frente da visão, com o centro
 * alinhado à grade de texels (sem "shimmer" ao andar/girar). Bias e
 * normalBias escalam com o tamanho do texel.
 *
 * A DIREÇÃO do sol continua sendo da feature world (lida a cada frame de
 * sun.position − sun.target.position); só reposicionamos o par mantendo-a.
 */
import * as THREE from 'three';

const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _center = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _origin = new THREE.Vector3();

export class ShadowFitter {
  constructor() {
    this.radius = 50;
    this.mapSize = 2048;
    this.distance = 140;
    this.softness = 2.0;
    this.lastDir = new THREE.Vector3(0, 1, 0);
  }

  configure(quality) {
    const lvl = quality.level;
    // Cascata próxima curta e densa (≈1,9 cm/texel em high): bordas nítidas
    // perto do jogador. O que passa do raio fica com a cascata larga do
    // compositor (SunView), aplicada em pós.
    this.radius = { low: 30, medium: 34, high: 38, ultra: 46 }[lvl] ?? 38;
    const base = quality.shadowMapSize || 2048;
    this.mapSize = { low: base, medium: Math.max(base, 2048), high: Math.max(base, 4096), ultra: Math.max(base, 4096) }[lvl] ?? base;
    this.softness = { low: 1.2, medium: 1.3, high: 1.1, ultra: 1.2 }[lvl] ?? 1.2;
  }

  /** Direção (para o sol) atual, sem alterar nada. */
  readDirection(sun, out) {
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    const a = _p.setFromMatrixPosition(sun.matrixWorld);
    const b = _origin.setFromMatrixPosition(sun.target.matrixWorld);
    out.subVectors(a, b);
    if (out.lengthSq() < 1e-8) out.copy(this.lastDir);
    return out.normalize();
  }

  update(sun, camera, dirToSun) {
    if (!sun.castShadow) return;
    const shadow = sun.shadow;
    if (shadow.mapSize.x !== this.mapSize) {
      shadow.mapSize.setScalar(this.mapSize);
      shadow.map?.dispose();
      shadow.map = null;
    }
    this.lastDir.copy(dirToSun);
    const R = this.radius;
    camera.getWorldDirection(_fwd);
    _fwd.y *= 0.3;
    _fwd.normalize();
    _center.copy(camera.getWorldPosition(_p)).addScaledVector(_fwd, R * 0.5);

    // snap do centro à grade de texels no espaço da luz
    _m.lookAt(_origin.set(0, 0, 0), _dir.copy(dirToSun).negate(), Math.abs(dirToSun.y) > 0.99 ? _fwd : _up);
    _mi.copy(_m).invert();
    _center.applyMatrix4(_mi);
    const texel = (2 * R) / this.mapSize;
    _center.x = Math.round(_center.x / texel) * texel;
    _center.y = Math.round(_center.y / texel) * texel;
    _center.applyMatrix4(_m);

    const parent = sun.parent;
    const tgt = sun.target;
    const wpSun = _p.copy(_center).addScaledVector(dirToSun, this.distance);
    if (parent) parent.updateMatrixWorld(), sun.position.copy(parent.worldToLocal(wpSun));
    else sun.position.copy(wpSun);
    const wpT = _dir.copy(_center);
    if (tgt.parent) tgt.position.copy(tgt.parent.worldToLocal(wpT));
    else tgt.position.copy(wpT);
    sun.updateMatrixWorld();
    tgt.updateMatrixWorld();

    const cam = shadow.camera;
    if (cam.right !== R || cam.far !== this.distance + 120) {
      cam.left = -R;
      cam.right = R;
      cam.top = R;
      cam.bottom = -R;
      cam.near = 1;
      cam.far = this.distance + 120;
      cam.updateProjectionMatrix();
    }
    shadow.radius = this.softness;
    shadow.bias = -0.00015;
    shadow.normalBias = texel * 1.4;
    shadow.blurSamples = 8;
  }
}
