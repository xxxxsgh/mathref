/**
 * Utilitários das passadas de tela cheia do `render`: alvos, materiais e
 * um quad compartilhado.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { QUAD_VERT } from './glsl.js';

export function makeTarget(w, h, { type = THREE.HalfFloatType, format = THREE.RGBAFormat, filter = THREE.LinearFilter, depth = false, mips = false, name = 'exo.rt' } = {}) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type,
    format,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: depth,
    stencilBuffer: false,
    minFilter: mips ? THREE.LinearMipmapLinearFilter : filter,
    magFilter: filter,
    generateMipmaps: mips,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  t.texture.name = name;
  return t;
}

export function fsMaterial(fragmentShader, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: QUAD_VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    glslVersion: extra.glsl3 ? THREE.GLSL3 : null,
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'glsl3')),
  });
}

/** Quad único: draw(renderer, material, target). */
export class Blitter {
  constructor(renderer) {
    this.renderer = renderer;
    this.quad = new FullScreenQuad(null);
  }
  draw(material, target) {
    const r = this.renderer;
    // sem limpar: passadas com mistura (AO, cópias) somam sobre o destino
    const prev = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(target);
    this.quad.material = material;
    this.quad.render(r);
    r.autoClear = prev;
  }
  dispose() {
    this.quad.dispose();
  }
}

export function resizeTarget(t, w, h) {
  w = Math.max(1, w | 0);
  h = Math.max(1, h | 0);
  if (t.width !== w || t.height !== h) t.setSize(w, h);
}

/** Cópia simples de textura (com ganho opcional). */
export const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform float uGain;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uGain, 1.0); }`;
