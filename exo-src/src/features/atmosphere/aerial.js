/**
 * PERSPECTIVA AÉREA — passada 'afterWorld' de tela cheia.
 *
 * Para cada pixel do mundo (depth ≠ céu) calcula a luz espalhada L e a
 * transmitância T entre a câmera e a superfície e aplica cor = cor·T + L.
 *   - câmera DENTRO da atmosfera e superfície até `apMax`: lê os froxels
 *     (32 fatias com distribuição quadrática, interpolação entre fatias);
 *   - além disso, ou com a câmera FORA (órbita): integra por pixel com as
 *     LUTs (o mesmo modelo — a emenda entre os dois é misturada).
 *
 * Como o depth do alvo HDR não pode ser lido enquanto está preso ao
 * framebuffer de destino (laço de realimentação no WebGL2), o cálculo vai
 * para um alvo próprio (MRT: L e T) e a composição são dois desenhos com
 * mistura: dst·T (multiplicativa) e dst + L (aditiva). Nenhum dos dois lê
 * o depth.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ATMO_UNIFORMS_GLSL, ATMO_FUNCS_GLSL, ATMO_LUT_FUNCS_GLSL } from './glsl.js';
import { AP_RES, AP_SLICES } from './luts.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
layout(location = 0) out highp vec4 oL;
layout(location = 1) out highp vec4 oT;
${ATMO_UNIFORMS_GLSL}
${ATMO_FUNCS_GLSL}
${ATMO_LUT_FUNCS_GLSL}
uniform sampler2D uDepth;
uniform sampler2D uAPL;
uniform sampler2D uAPT;
uniform float uDepthMode;   // 0 reversed, 1 log, 2 padrão
uniform float uNear;
uniform float uFar;
uniform vec3 uC00;
uniform vec3 uC10;
uniform vec3 uC01;
uniform vec3 uC11;
uniform vec3 uCamPos;
uniform float uAPMax;
uniform float uInside;
uniform int uSteps;
varying vec2 vUv;

vec2 apUV(vec2 uv, float slice) {
  uv = clamp(uv, 0.5 / ${AP_RES}.0, 1.0 - 0.5 / ${AP_RES}.0);
  return vec2((slice + uv.x) / ${AP_SLICES}.0, uv.y);
}

void main() {
  float d = texture2D(uDepth, vUv).r;
  float viewZ;
  if (uDepthMode < 0.5) {
    if (d <= 0.0) { oL = vec4(0.0); oT = vec4(1.0); return; }
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    viewZ = dd / (d + c);
  } else if (uDepthMode < 1.5) {
    if (d >= 1.0) { oL = vec4(0.0); oT = vec4(1.0); return; }
    viewZ = exp2(d * log2(uFar + 1.0)) - 1.0;
  } else {
    if (d >= 1.0) { oL = vec4(0.0); oT = vec4(1.0); return; }
    float ndc = d * 2.0 - 1.0;
    viewZ = 2.0 * uNear * uFar / ((uFar + uNear) - ndc * (uFar - uNear));
  }
  vec3 ray = mix(mix(uC00, uC10, vUv.x), mix(uC01, uC11, vUv.x), vUv.y);
  vec3 P = ray * (viewZ * 0.001);
  float dist = length(P);
  vec3 rd = P / max(dist, 1e-9);
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  float wF = 0.0;
  if (uInside > 0.5) {
    wF = 1.0 - smoothstep(0.82, 0.97, dist / uAPMax);
  }
  if (wF > 0.0) {
    float sF = sqrt(dist / uAPMax) * ${AP_SLICES}.0 - 1.0;
    vec3 L0 = vec3(0.0), T0 = vec3(1.0), L1, T1;
    float s0 = floor(sF);
    float f = sF - s0;
    if (s0 >= 0.0) {
      vec2 a = apUV(vUv, min(s0, ${AP_SLICES - 1}.0));
      L0 = texture2D(uAPL, a).rgb;
      T0 = texture2D(uAPT, a).rgb;
    }
    vec2 b = apUV(vUv, clamp(s0 + 1.0, 0.0, ${AP_SLICES - 1}.0));
    L1 = texture2D(uAPL, b).rgb;
    T1 = texture2D(uAPT, b).rgb;
    if (s0 < 0.0) f = clamp(sF + 1.0, 0.0, 1.0);
    L = mix(L0, L1, f);
    T = mix(T0, T1, f);
  }
  if (wF < 1.0) {
    vec3 Lr, Tr;
    atmoIntegrate(uCamPos, rd, dist, uSteps, Lr, Tr);
    L = mix(Lr, L, wF);
    T = mix(Tr, T, wF);
  }
  oL = vec4(L, 1.0);
  oT = vec4(T, 1.0);
}`;

const COPY_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }`;

export class AerialPass {
  constructor(ctx, sharedUniforms, luts) {
    this.ctx = ctx;
    this.luts = luts;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      count: 2,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    this.u = {
      ...sharedUniforms,
      uDepth: { value: null },
      uAPL: { value: luts.ap.textures[0] },
      uAPT: { value: luts.ap.textures[1] },
      uDepthMode: { value: ctx.depthMode === 'reversed' ? 0 : ctx.depthMode === 'log' ? 1 : 2 },
      uNear: { value: ctx.camera.near },
      uFar: { value: ctx.camera.far },
      uC00: luts.apU.uC00,
      uC10: luts.apU.uC10,
      uC01: luts.apU.uC01,
      uC11: luts.apU.uC11,
      uCamPos: luts.apU.uCamPos,
      uAPMax: luts.apU.uAPMax,
      uInside: { value: 1 },
      uSteps: { value: 12 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
    });
    const blendMat = (tex, mul) =>
      new THREE.ShaderMaterial({
        uniforms: { uTex: { value: tex } },
        vertexShader: VERT,
        fragmentShader: COPY_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: mul ? THREE.ZeroFactor : THREE.OneFactor,
        blendDst: mul ? THREE.SrcColorFactor : THREE.OneFactor,
        blendEquationAlpha: THREE.AddEquation,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      });
    this.mMul = blendMat(this.target.textures[1], true);
    this.mAdd = blendMat(this.target.textures[0], false);
    this.quad = new FullScreenQuad(this.mat);
    this.enabled = true;
  }

  /** Executado pelo pipeline no estágio afterWorld. */
  render(target) {
    if (!this.enabled || !target?.depthTexture) return;
    const r = this.ctx.renderer;
    const w = target.width;
    const h = target.height;
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.u.uDepth.value = target.depthTexture;
    const prevT = r.getRenderTarget();
    const prevClear = r.autoClear;
    r.autoClear = false;
    // froxels (camera deste frame)
    if (this.u.uInside.value > 0.5) this.luts.renderAerial();
    this.quad.material = this.mat;
    r.setRenderTarget(this.target);
    this.quad.render(r);
    r.setRenderTarget(target);
    this.quad.material = this.mMul;
    this.quad.render(r);
    this.quad.material = this.mAdd;
    this.quad.render(r);
    r.setRenderTarget(prevT);
    r.autoClear = prevClear;
  }

  dispose() {
    this.target.dispose();
    this.mat.dispose();
    this.mMul.dispose();
    this.mAdd.dispose();
    this.quad.dispose();
  }
}
