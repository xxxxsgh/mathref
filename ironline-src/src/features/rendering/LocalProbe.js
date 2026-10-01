/**
 * Sonda de reflexo local para a viewmodel: um cubemap HDR da cena real
 * capturado na posição do jogador (ruas, fachadas, interior), filtrado em
 * PMREM e usado como `vm.scene.environment`. A arma passa a refletir o que
 * está à volta — asfalto, prédios, a sala escura — em vez de um céu genérico,
 * e o difuso do IBL escurece sozinho em interiores.
 *
 * Custo: 6 vistas de 128² da cena (sem atualizar shadow map) + PMREM, só
 * quando o jogador anda ~1,5 m ou a cada ~3 s.
 */
import * as THREE from 'three';

export class LocalProbe {
  constructor(renderer, size = 128) {
    this.renderer = renderer;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.cubeRT.texture.colorSpace = THREE.NoColorSpace;
    this.cam = new THREE.CubeCamera(0.12, 650, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.pos = new THREE.Vector3(1e9, 0, 0);
    this.age = 1e9;
    this.texture = null;
  }

  update(scene, camera, { hide = [], moveDist = 1.5, maxAge = 180, force = false } = {}) {
    this.age++;
    const p = camera.getWorldPosition(_p);
    if (!force && this.texture && p.distanceTo(this.pos) < moveDist && this.age < maxAge) return false;
    const r = this.renderer;
    this.pos.copy(p);
    this.cam.position.copy(p);
    this.cam.updateMatrixWorld();
    const prevAuto = r.shadowMap.autoUpdate;
    const prevTarget = r.getRenderTarget();
    r.shadowMap.autoUpdate = false;
    const hidden = [];
    for (const o of hide) if (o && o.visible) (o.visible = false), hidden.push(o);
    this.cam.update(r, scene);
    for (const o of hidden) o.visible = true;
    r.shadowMap.autoUpdate = prevAuto;
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture, this.envRT);
    this.envRT.texture.name = 'ironline-local-probe';
    r.setRenderTarget(prevTarget);
    this.texture = this.envRT.texture;
    this.age = 0;
    return true;
  }

  dispose() {
    this.cubeRT.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}

const _p = new THREE.Vector3();
