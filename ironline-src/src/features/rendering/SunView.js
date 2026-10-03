/**
 * Vistas ortográficas a partir do sol, usadas pelo compositor:
 *
 *  - RSM ("reflective shadow map", Dachsbacher & Stamminger 2005): a cena é
 *    renderizada DO PONTO DE VISTA DO SOL com os materiais reais. Tudo o que o
 *    sol enxerga está iluminado por ele, então cada texel é uma pequena fonte
 *    de luz secundária (VPL) com a radiância já calculada pelo three — cor do
 *    albedo × sol. O passe de GI (shaders.js → GI_FRAG) junta esses VPLs e dá
 *    o rebatimento quente do sol: o chão ensolarado sob a janela acende o teto
 *    e as paredes, o asfalto ilumina as fachadas na sombra.
 *  - Sombra distante ("cascata" larga): só depth, cobrindo centenas de metros,
 *    re-renderizada quando a câmera anda bastante. O compositor a aplica onde
 *    a sombra principal (curta, nítida, do three) não alcança.
 *
 * Ambas as vistas encaixam o centro na grade de texels no espaço da luz
 * (sem tremor ao andar) e escondem o que não deve aparecer (céu, poeira,
 * partículas, transparentes).
 */
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _o = new THREE.Vector3();
const _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class SunView {
  /**
   * @param {object} o { size, radius, color (bool: RSM com cor), forward (fração do raio à frente da câmera) }
   */
  constructor({ size = 256, radius = 30, color = false, forward = 0.3, depthRange = 400 } = {}) {
    this.size = size;
    this.radius = radius;
    this.forward = forward;
    this.depthRange = depthRange;
    this.color = color;
    const depthTexture = new THREE.DepthTexture(size, size, THREE.FloatType);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: color ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      depthTexture,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.rt.texture.colorSpace = THREE.NoColorSpace;
    this.camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 1, depthRange);
    this.override = color ? null : new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.center = new THREE.Vector3(1e9, 0, 0);
    this.lastDir = new THREE.Vector3(0, -2, 0);
    this.age = 1e9;
    this.valid = false;
    /** mundo → (uv, depth) do mapa */
    this.matrix = new THREE.Matrix4();
    /** NDC do mapa → mundo */
    this.inverse = new THREE.Matrix4();
  }

  /** Tamanho do texel em metros. */
  get texel() {
    return (2 * this.radius) / this.size;
  }

  /**
   * Re-renderiza se a câmera andou `moveFrac × raio`, se o sol girou ou se
   * passou `maxAge` chamadas. Retorna true se renderizou.
   */
  update(renderer, scene, camera, sunDir, { moveFrac = 0.12, maxAge = 30, force = false, hide = [] } = {}) {
    this.age++;
    camera.getWorldPosition(_p);
    camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    const want = _o.copy(_p).addScaledVector(_fwd, this.radius * this.forward);
    const moved = Math.hypot(want.x - this.center.x, want.z - this.center.z);
    const turned = this.lastDir.angleTo(sunDir) > 0.002;
    if (!force && this.valid && !turned && moved < this.radius * moveFrac && this.age < maxAge) return false;

    // centro encaixado na grade de texels no espaço da luz
    _m.lookAt(_o.set(0, 0, 0), _fwd.copy(sunDir).negate(), Math.abs(sunDir.y) > 0.99 ? _p.set(0, 0, 1) : _up);
    _mi.copy(_m).invert();
    const c = want.clone().applyMatrix4(_mi);
    const t = this.texel;
    c.x = Math.round(c.x / t) * t;
    c.y = Math.round(c.y / t) * t;
    c.applyMatrix4(_m);
    this.center.copy(c);

    const cam = this.camera;
    const dist = this.depthRange * 0.5;
    cam.position.copy(c).addScaledVector(sunDir, dist);
    cam.up.copy(Math.abs(sunDir.y) > 0.99 ? _p.set(0, 0, 1) : _up);
    cam.lookAt(c);
    cam.left = -this.radius;
    cam.right = this.radius;
    cam.top = this.radius;
    cam.bottom = -this.radius;
    cam.near = 1;
    cam.far = this.depthRange;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAuto = renderer.shadowMap.autoUpdate;
    const prevClear = renderer.getClearColor(_clr);
    const prevAlpha = renderer.getClearAlpha();
    scene.overrideMaterial = this.override;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    const hidden = [];
    for (const o of hide) if (o && o.visible) (o.visible = false), hidden.push(o);
    scene.traverse((o) => {
      if (o.visible && (o.isPoints || o.isSprite || o.isLine || o.userData?.noSunView || (o.material && o.material.transparent && !o.material.alphaTest))) {
        hidden.push(o);
        o.visible = false;
      }
    });
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    for (const o of hidden) o.visible = true;
    renderer.setClearColor(prevClear, prevAlpha);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    renderer.shadowMap.autoUpdate = prevAuto;

    _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.matrix.multiplyMatrices(_bias, _vp);
    this.inverse.copy(_vp).invert();
    this.lastDir.copy(sunDir);
    this.age = 0;
    this.valid = true;
    return true;
  }

  dispose() {
    this.rt.depthTexture.dispose();
    this.rt.dispose();
    this.override?.dispose();
  }
}

const _vp = new THREE.Matrix4();
const _clr = new THREE.Color();
