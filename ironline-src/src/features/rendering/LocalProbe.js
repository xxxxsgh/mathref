/**
 * Sonda de reflexo local para a viewmodel: um cubemap HDR da cena real
 * capturado na posição do jogador (ruas, fachadas, interior), filtrado em
 * PMREM e usado como `vm.scene.environment`. A arma passa a refletir o que
 * está à volta — asfalto, prédios, a sala escura — em vez de um céu genérico,
 * e o difuso do IBL escurece sozinho em interiores.
 *
 * Custo: 6 vistas de 128² da cena (sem atualizar shadow map) + PMREM, só
 * quando o jogador anda ~1,5 m ou a cada ~3 s.
 *
 * Saneamento: o cubemap é HalfFloat (máx. 65504). O disco do sol, fogo e
 * clarões HDR podem estourar para Inf (ou um material gerar NaN) — e o
 * PMREM espalha isso (Inf·0 = NaN) pelo mapa INTEIRO: toda a viewmodel
 * sombreada com IBL vira NaN → silhueta preta no compositor. Antes do PMREM
 * cada face passa por um shader que troca NaN/Inf por 0 e limita a
 * radiância (um sol de 4·10⁴ já satura qualquer reflexo).
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
    // passe de saneamento (cubo → cubo) — ver comentário no topo
    this.cleanRT = new THREE.WebGLCubeRenderTarget(size, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.cleanRT.texture.colorSpace = THREE.NoColorSpace;
    this.cleanMat = new THREE.ShaderMaterial({
      name: 'ironline-probe-sanitize',
      uniforms: { tCube: { value: this.cubeRT.texture }, uMax: { value: 40000 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform samplerCube tCube;
        uniform float uMax;
        varying vec3 vDir;
        void main() {
          vec3 c = textureCube(tCube, normalize(vDir)).rgb;
          // NaN falha em qualquer comparação; Inf passa do limite
          bool bad = !(c.r == c.r && c.g == c.g && c.b == c.b) || any(isnan(c)) || any(isinf(c));
          c = bad ? vec3(0.0) : clamp(c, vec3(0.0), vec3(uMax));
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.cleanScene = new THREE.Scene();
    this.cleanScene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), this.cleanMat));
    this.cleanCam = new THREE.CubeCamera(0.1, 100, this.cleanRT);
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
    this.cleanCam.update(r, this.cleanScene);
    r.shadowMap.autoUpdate = prevAuto;
    this.envRT = this.pmrem.fromCubemap(this.cleanRT.texture, this.envRT);
    this.envRT.texture.name = 'ironline-local-probe';
    r.setRenderTarget(prevTarget);
    this.texture = this.envRT.texture;
    this.age = 0;
    return true;
  }

  dispose() {
    this.cubeRT.dispose();
    this.cleanRT.dispose();
    this.cleanMat.dispose();
    this.cleanScene.children[0]?.geometry.dispose();
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}

const _p = new THREE.Vector3();
