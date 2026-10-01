/**
 * Triângulo de tela cheia + utilitários de passes de pós.
 * Todos os passes usam RawShaderMaterial GLSL3 — controle total da saída
 * (sem tone mapping/conversão automática do three).
 */
import * as THREE from 'three';

export const RAW_VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const _geo = new THREE.BufferGeometry();
_geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const _cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export class FsQuad {
  constructor(material) {
    this.mesh = new THREE.Mesh(_geo, material);
    this.mesh.frustumCulled = false;
  }
  get material() {
    return this.mesh.material;
  }
  set material(m) {
    this.mesh.material = m;
  }
  render(renderer, target, clear = false) {
    renderer.setRenderTarget(target);
    if (clear) renderer.clear();
    renderer.render(this.mesh, _cam);
  }
  dispose() {
    this.mesh.material.dispose();
  }
}

/** RawShaderMaterial de pós com defaults sensatos. */
export function postMaterial(name, fragmentShader, uniforms = {}, defines = {}) {
  return new THREE.RawShaderMaterial({
    name: `ironline-${name}`,
    glslVersion: THREE.GLSL3,
    uniforms,
    defines,
    vertexShader: RAW_VERT,
    fragmentShader: `precision highp float;\nprecision highp sampler2D;\nprecision highp sampler2DShadow;\n${fragmentShader}`,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
}

/** Alvo de render 2D sem depth. */
export function makeTarget(w, h, { type = THREE.HalfFloatType, filter = THREE.LinearFilter, format = THREE.RGBAFormat } = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type,
    format,
    minFilter: filter,
    magFilter: filter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}
