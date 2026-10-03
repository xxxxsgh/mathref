/**
 * Oclusão de céu ("sondas de luz" baratas): um mapa de altura visto de cima
 * (depth ortográfico) ao redor da câmera. No compositor, um ponto com
 * geometria acima dele está "coberto" — dentro de prédios, sob marquises —
 * e perde parte da luz ambiente (IBL + hemisfério), a menos que o sol o
 * ilumine diretamente. Amostras em disco suavizam a transição perto de
 * portas e janelas (luz que "entra" alguns metros).
 *
 * Re-renderizado só quando a câmera anda alguns metros (ou a cada N frames
 * para pegar objetos que se movem).
 */
import * as THREE from 'three';

export class SkyOcclusion {
  constructor(size = 512, extent = 110) {
    this.size = size;
    this.extent = extent; // lado do quadrado coberto (m)
    this.height = 260;
    const depthTexture = new THREE.DepthTexture(size, size, THREE.FloatType);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, depthTexture, type: THREE.UnsignedByteType });
    const h = extent / 2;
    this.camera = new THREE.OrthographicCamera(-h, h, h, -h, 1, this.height + 60);
    this.camera.up.set(0, 0, -1);
    this.override = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    this.center = new THREE.Vector3(1e9, 0, 0);
    this.age = 0;
    this.valid = false;
    /** Matriz mundo → uv/depth do mapa (para o shader). */
    this.matrix = new THREE.Matrix4();
  }

  update(renderer, scene, camera, force = false) {
    const p = camera.getWorldPosition(_p);
    this.age++;
    const moved = Math.hypot(p.x - this.center.x, p.z - this.center.z);
    if (!force && this.valid && moved < this.extent * 0.15 && this.age < 30) return false;
    const texel = this.extent / this.size;
    this.center.set(Math.round(p.x / texel) * texel, 0, Math.round(p.z / texel) * texel);
    const cam = this.camera;
    cam.position.set(this.center.x, p.y + this.height, this.center.z);
    cam.lookAt(this.center.x, p.y - 100, this.center.z);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevShadow = renderer.shadowMap.autoUpdate;
    scene.overrideMaterial = this.override;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    // esconde o que não deve ocluir o céu (viewmodel não está nesta cena)
    const hidden = [];
    scene.traverse((o) => {
      if (o.visible && (o.isPoints || o.isSprite || o.isLine || o.userData?.noSkyOcclusion || (o.material && o.material.transparent))) {
        hidden.push(o);
        o.visible = false;
      }
    });
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, cam);
    for (const o of hidden) o.visible = true;
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    renderer.shadowMap.autoUpdate = prevShadow;

    _bias.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiplyMatrices(_bias, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    this.age = 0;
    this.valid = true;
    return true;
  }

  dispose() {
    this.rt.depthTexture.dispose();
    this.rt.dispose();
    this.override.dispose();
  }
}

const _p = new THREE.Vector3();
const _bias = new THREE.Matrix4();
