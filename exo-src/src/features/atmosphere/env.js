/**
 * IBL do céu: cubo pequeno (32 px/face) com o MESMO espalhamento do domo
 * (integração por pixel com as LUTs, chão com o albedo do bioma iluminado
 * pelos sóis) → PMREM → `sky.envMap`.
 *
 * Orçamento: regenera só quando a luz muda de verdade (sol andou > ~0,6°,
 * câmera mudou de altitude > 8%, troca de planeta) e no máximo a cada
 * `minFrames` frames. ~6 desenhos do cubo + ~20 do PMREM, fora do frame
 * de render.
 */
import * as THREE from 'three';
import { ATMO_UNIFORMS_GLSL, ATMO_FUNCS_GLSL, ATMO_LUT_FUNCS_GLSL } from './glsl.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
${ATMO_UNIFORMS_GLSL}
${ATMO_FUNCS_GLSL}
${ATMO_LUT_FUNCS_GLSL}
uniform vec3 uCamPos;
varying vec3 vDir;
void main() {
  vec3 rd = normalize(vDir);
  vec3 ro = uCamPos;
  vec3 L, T;
  atmoIntegrate(ro, rd, 1e9, 10, L, T);
  float tg = atmoGround(ro, rd);
  vec3 bg = vec3(0.0);
  if (tg > 0.0) {
    vec3 n = normalize(ro + rd * tg);
    vec3 E = vec3(0.0);
    for (int l = 0; l < 3; l++) {
      float mu = dot(n, uLightDir[l]);
      E += uLightE[l] * atmoSunTrans(uRb + 0.001, mu) * max(0.0, mu);
    }
    // luz do céu refletida pelo chão (aproximação: 25% da direta + piso)
    bg = uGroundAlbedo / PI * E * 1.25 + uGroundAlbedo * 0.02 * L;
  }
  // ganho de preenchimento: o céu ilumina as sombras com mais força (leitura
  // de jogo: sombras coloridas pelo céu em vez de quase pretas)
  gl_FragColor = vec4(min(L * 1.6 + T * bg, vec3(200.0)), 1.0);
}`;

export class EnvProbe {
  constructor(renderer, sharedUniforms, size = 32) {
    this.renderer = renderer;
    this.u = { ...sharedUniforms, uCamPos: { value: new THREE.Vector3(0, 121, 0) } };
    this.scene = new THREE.Scene();
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, depthBuffer: false });
    this.cubeRT.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.cam = new THREE.CubeCamera(0.1, 100, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.rt = null;
    this.texture = null;
    this.count = 0;
  }

  update(camPosKm) {
    this.u.uCamPos.value.copy(camPosKm);
    const r = this.renderer;
    const prevT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = true;
    this.cam.update(r, this.scene);
    const out = this.pmrem.fromCubemap(this.cubeRT.texture, this.rt);
    r.autoClear = prevAuto;
    r.setRenderTarget(prevT);
    this.rt = out;
    this.texture = out.texture;
    this.count++;
    return this.texture;
  }

  dispose() {
    this.cubeRT.dispose();
    this.rt?.dispose();
    this.pmrem.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}
