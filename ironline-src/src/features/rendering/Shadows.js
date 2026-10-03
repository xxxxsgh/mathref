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

  /** Reposiciona a sombra; retorna true se o frustum do sol mudou (precisa re-renderizar). */
  update(sun, camera, dirToSun) {
    if (!sun.castShadow) return false;
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
    const changed = !this.lastCenter || this.lastCenter.distanceToSquared(_center) > 1e-8 || this.lastDirKey.angleTo(dirToSun) > 1e-5;
    if (changed) {
      (this.lastCenter ||= new THREE.Vector3()).copy(_center);
      (this.lastDirKey ||= new THREE.Vector3()).copy(dirToSun);
    }
    shadow.radius = this.softness;
    shadow.bias = -0.00015;
    shadow.normalBias = texel * 1.4;
    shadow.blurSamples = 8;
    return changed;
  }
}

/**
 * Cópia "crua" (depth sem comparação) do shadow map do sol, renderizada com
 * a MESMA câmera de sombra do three. O mapa do three é sampler2DShadow
 * (comparação em hardware) e não deixa ler a profundidade do bloqueador —
 * que é o que o PCSS precisa. Este mapa (menor) serve só à busca de
 * bloqueadores; a filtragem final continua no mapa do three (resolução
 * cheia, comparação em hardware) → penumbra que endurece no contato.
 */
export class RawShadow {
  constructor(size = 2048) {
    this.size = size;
    const dt = new THREE.DepthTexture(size, size, THREE.FloatType);
    dt.format = THREE.DepthFormat;
    dt.minFilter = dt.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, depthBuffer: true, depthTexture: dt, generateMipmaps: false });
    this.override = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.valid = false;
    this.hidden = [];
  }

  /** Renderiza a profundidade vista pela câmera de sombra atual do sol. */
  render(renderer, scene, sun, hide = []) {
    const shadow = sun.shadow;
    shadow.updateMatrices(sun); // mesma matriz que o passe de sombra do three usará
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAuto = renderer.shadowMap.autoUpdate;
    const prevNeeds = renderer.shadowMap.needsUpdate;
    scene.overrideMaterial = this.override;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    const hidden = this.hidden;
    hidden.length = 0;
    for (const o of hide) if (o && o.visible) (o.visible = false), hidden.push(o);
    scene.traverseVisible((o) => {
      if (o.isPoints || o.isSprite || o.isLine || o.userData?.noSunView || (o.isMesh && !o.castShadow) || (o.material && o.material.transparent && !o.material.alphaTest)) {
        if (o.isMesh || o.isPoints || o.isSprite || o.isLine) hidden.push(o), (o.visible = false);
      }
    });
    renderer.setRenderTarget(this.rt);
    renderer.clear(false, true, false);
    renderer.render(scene, shadow.camera);
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    renderer.shadowMap.autoUpdate = prevAuto;
    renderer.shadowMap.needsUpdate = prevNeeds;
    this.valid = true;
  }

  dispose() {
    this.rt.depthTexture.dispose();
    this.rt.dispose();
    this.override.dispose();
  }
}
