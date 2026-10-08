/**
 * LUTs da atmosfera (Hillaire 2020), renderizadas na GPU:
 *
 *   transmitância   256×64   — muda só com os parâmetros (troca de planeta)
 *   multiespalhamento 32×32  — idem (Ψ_ms por unidade de iluminância, com
 *                              albedo do solo; soma infinita de ordens via 1/(1−f_ms))
 *   sky-view        256×128  — por frame, com a câmera DENTRO da atmosfera
 *   perspectiva aérea 32³    — por frame, froxels no frustum da câmera,
 *                              atlas 1024×32 com 2 alvos (luz espalhada, transmitância)
 *
 * Todas em HalfFloat linear. As uniformes da atmosfera são objetos
 * COMPARTILHADOS (mesmas referências em todos os materiais).
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ATMO_UNIFORMS_GLSL, ATMO_FUNCS_GLSL, ATMO_LUT_FUNCS_GLSL, SKYVIEW_MAP_GLSL } from './glsl.js';

export const AP_SLICES = 32;
/** fator de massa de ar extra nos caminhos rasantes (ver TRANS_FRAG e params.transmittanceJS) */
export const AIRMASS_BOOST = '2.0';
export const AP_RES = 32;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const TRANS_FRAG = /* glsl */ `
${ATMO_UNIFORMS_GLSL}
${ATMO_FUNCS_GLSL}
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(256.0, 64.0);
  float xMu = clamp((uv.x - 0.5 / 256.0) / (1.0 - 1.0 / 256.0), 0.0, 1.0);
  float xR = clamp((uv.y - 0.5 / 64.0) / (1.0 - 1.0 / 64.0), 0.0, 1.0);
  float H = sqrt(max(0.0, uRt * uRt - uRb * uRb));
  float rho = H * xR;
  float r = sqrt(rho * rho + uRb * uRb);
  float dMin = uRt - r;
  float dMax = rho + H;
  float d = dMin + xMu * (dMax - dMin);
  float mu = d <= 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float t1 = atmoSphere(ro, rd, uRt).y;
  const int N = 48;
  float dt = max(0.0, t1) / float(N);
  vec3 tau = vec3(0.0);
  vec3 tauM = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 P = ro + rd * ((float(i) + 0.5) * dt);
    float h = length(P) - uRb;
    AtmoMedium m = atmoMedium(h);
    vec3 em = uMieExt * exp(-max(h, 0.0) / uMieH);
    tau += (m.ext - em) * dt;
    tauM += em * dt;
  }
  // compensação de massa de ar: planetas de 60–200 km têm caminhos rasantes
  // ~5× mais curtos que a Terra (√(2RH)), e o pôr do sol quase não avermelha.
  // Engrossa só os caminhos rasantes (luz do sol baixo); a vista não muda.
  // (só gás: Rayleigh + absorção; a névoa Mie fica física)
  tau = tau * (1.0 + ${AIRMASS_BOOST} * pow(1.0 - abs(mu), 4.0)) + tauM;
  gl_FragColor = vec4(exp(-tau), 1.0);
}`;

const MS_FRAG = /* glsl */ `
${ATMO_UNIFORMS_GLSL}
${ATMO_FUNCS_GLSL}
uniform sampler2D uTransLUT;
vec3 atmoTransmittance(float r, float mu) {
  r = clamp(r, uRb, uRt);
  return texture2D(uTransLUT, atmoTransUV(r, mu)).rgb;
}
void main() {
  vec2 uv = (gl_FragCoord.xy / 32.0 - 0.5 / 32.0) / (31.0 / 32.0);
  uv = clamp(uv, 0.0, 1.0);
  float muS = uv.x * 2.0 - 1.0;
  float r = uRb + 0.002 + uv.y * (uRt - uRb - 0.004);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 sunDir = normalize(vec3(0.0, muS, sqrt(max(0.0, 1.0 - muS * muS))));
  const float ISO = 1.0 / (4.0 * PI);
  vec3 Lsum = vec3(0.0);
  vec3 Fsum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    for (int j = 0; j < 8; j++) {
      float th = 2.0 * PI * (float(i) + 0.5) / 8.0;
      float cp = 1.0 - 2.0 * (float(j) + 0.5) / 8.0;
      float sp = sqrt(max(0.0, 1.0 - cp * cp));
      vec3 rd = vec3(cos(th) * sp, cp, sin(th) * sp);
      vec2 ta = atmoSphere(ro, rd, uRt);
      float tg = atmoGround(ro, rd);
      float t1 = tg > 0.0 ? tg : max(0.0, ta.y);
      const int N = 20;
      float dt = t1 / float(N);
      vec3 T = vec3(1.0);
      vec3 L = vec3(0.0);
      vec3 F = vec3(0.0);
      for (int k = 0; k < N; k++) {
        vec3 P = ro + rd * ((float(k) + 0.5) * dt);
        float rr = length(P);
        AtmoMedium m = atmoMedium(rr - uRb);
        float mu = dot(P / rr, sunDir);
        vec3 Ts = atmoTransmittance(rr, mu) * atmoPlanetShadow(rr, mu);
        vec3 S = Ts * m.scat * ISO;
        vec3 st = exp(-m.ext * dt);
        vec3 ext = max(m.ext, vec3(1e-7));
        L += T * (S - S * st) / ext;
        F += T * (m.scat - m.scat * st) / ext;
        T *= st;
      }
      if (tg > 0.0) {
        vec3 Pg = ro + rd * tg;
        vec3 n = normalize(Pg);
        float mu = dot(n, sunDir);
        vec3 Ts = atmoTransmittance(uRb, mu) * atmoPlanetShadow(uRb + 0.001, mu);
        L += T * Ts * max(0.0, mu) * uGroundAlbedo / PI;
      }
      Lsum += L;
      Fsum += F;
    }
  }
  // integral sobre a esfera com fase isotrópica = média das 64 direções
  vec3 L2 = Lsum / 64.0;
  vec3 fms = Fsum / 64.0 * (4.0 * PI) * ISO;
  gl_FragColor = vec4(L2 / max(vec3(1e-4), 1.0 - fms), 1.0);
}`;

const SKYVIEW_FRAG = /* glsl */ `
${ATMO_UNIFORMS_GLSL}
${ATMO_FUNCS_GLSL}
${ATMO_LUT_FUNCS_GLSL}
${SKYVIEW_MAP_GLSL}
uniform vec3 uCamPos;
uniform vec3 uUp;
uniform vec3 uEast;
uniform vec3 uNorth;
uniform int uSteps;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(256.0, 128.0);
  float r = clamp(length(uCamPos), uRb + 0.001, uRt - 0.001);
  float v = clamp((uv.y - 0.5 / 128.0) / (127.0 / 128.0), 0.0, 1.0);
  float vH = sqrt(max(0.0, r * r - uRb * uRb));
  float beta = acos(clamp(vH / r, -1.0, 1.0));
  float ZH = PI - beta;
  float zen;
  if (v < 0.5) {
    float c = 1.0 - 2.0 * v;
    zen = ZH * (1.0 - c * c);
  } else {
    float c = 2.0 * v - 1.0;
    zen = ZH + beta * c * c;
  }
  float az = uv.x * 2.0 * PI;
  vec3 rd = uUp * cos(zen) + (uNorth * cos(az) + uEast * sin(az)) * sin(zen);
  vec3 L, T;
  atmoIntegrate(uUp * r, normalize(rd), 1e9, uSteps, L, T);
  gl_FragColor = vec4(L, 1.0);
}`;

/** Froxels: cada fatia é um quadro 32×32 do atlas; dois alvos (MRT). */
const AP_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 oL;
layout(location = 1) out highp vec4 oT;
${ATMO_UNIFORMS_GLSL}
${ATMO_FUNCS_GLSL}
${ATMO_LUT_FUNCS_GLSL}
uniform vec3 uCamPos;
uniform vec3 uC00;
uniform vec3 uC10;
uniform vec3 uC01;
uniform vec3 uC11;
uniform float uAPMax;
void main() {
  float x = gl_FragCoord.x;
  float slice = floor(x / ${AP_RES}.0);
  vec2 uv = vec2(mod(x, ${AP_RES}.0), gl_FragCoord.y) / ${AP_RES}.0;
  vec3 ray = mix(mix(uC00, uC10, uv.x), mix(uC01, uC11, uv.x), uv.y);
  vec3 rd = normalize(ray);
  float s = (slice + 1.0) / ${AP_SLICES}.0;
  float dist = uAPMax * s * s;
  int N = 4 + int(slice);
  vec3 L, T;
  atmoIntegrate(uCamPos, rd, dist, N, L, T);
  oL = vec4(L, 1.0);
  oT = vec4(T, 1.0);
}`;

function lutTarget(w, h, opts = {}) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    ...opts,
  });
  return t;
}

/** Uniformes compartilhadas da atmosfera (valores atualizados por `setParams`). */
export function createAtmoUniforms() {
  return {
    uRb: { value: 120 },
    uRt: { value: 132 },
    uRayScat: { value: new THREE.Vector3() },
    uRayH: { value: 3 },
    uMieScat: { value: new THREE.Vector3() },
    uMieExt: { value: new THREE.Vector3() },
    uMieH: { value: 0.6 },
    uMieG: { value: 0.8 },
    uAbs: { value: new THREE.Vector3() },
    uAbsC: { value: 3 },
    uAbsW: { value: 2 },
    uGroundAlbedo: { value: new THREE.Vector3(0.12, 0.13, 0.1) },
    uLightDir: { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)] },
    uLightE: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uSkyGain: { value: 1 },
    uAirglow: { value: new THREE.Vector3() },
    uTransLUT: { value: null },
    uMSLUT: { value: null },
  };
}

export function applyParams(u, p) {
  u.uRb.value = p.Rb;
  u.uRt.value = p.Rt;
  u.uRayScat.value.fromArray(p.rayleigh);
  u.uRayH.value = p.Hr;
  u.uMieScat.value.fromArray(p.mieScat);
  u.uMieExt.value.fromArray(p.mieExt);
  u.uMieH.value = p.Hm;
  u.uMieG.value = p.mieG;
  u.uAbs.value.fromArray(p.absorb);
  u.uAbsC.value = p.absC;
  u.uAbsW.value = Math.max(1e-3, p.absW);
  u.uGroundAlbedo.value.fromArray(p.groundAlbedo);
  u.uSkyGain.value = p.skyGain;
  u.uAirglow.value.fromArray(p.airglow);
}

export class AtmosphereLUTs {
  constructor(renderer, uniforms) {
    this.renderer = renderer;
    this.u = uniforms;
    this.trans = lutTarget(256, 64);
    this.ms = lutTarget(32, 32);
    this.sky = lutTarget(256, 128, { wrapS: THREE.RepeatWrapping });
    this.ap = new THREE.WebGLRenderTarget(AP_RES * AP_SLICES, AP_RES, {
      count: 2,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    for (const t of this.ap.textures) {
      t.colorSpace = THREE.LinearSRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
    uniforms.uTransLUT.value = this.trans.texture;
    uniforms.uMSLUT.value = this.ms.texture;
    const mk = (frag, extra = {}, glsl3 = false) =>
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms, ...extra },
        vertexShader: VERT,
        fragmentShader: frag,
        depthTest: false,
        depthWrite: false,
        ...(glsl3 ? { glslVersion: THREE.GLSL3 } : {}),
      });
    this.skyU = {
      uCamPos: { value: new THREE.Vector3(0, 121, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uEast: { value: new THREE.Vector3(1, 0, 0) },
      uNorth: { value: new THREE.Vector3(0, 0, -1) },
      uSteps: { value: 30 },
    };
    this.apU = {
      uCamPos: this.skyU.uCamPos,
      uC00: { value: new THREE.Vector3() },
      uC10: { value: new THREE.Vector3() },
      uC01: { value: new THREE.Vector3() },
      uC11: { value: new THREE.Vector3() },
      uAPMax: { value: 100 },
    };
    this.mTrans = mk(TRANS_FRAG);
    this.mMS = mk(MS_FRAG);
    this.mSky = mk(SKYVIEW_FRAG, this.skyU);
    this.mAP = mk(AP_FRAG, this.apU, true);
    this.quad = new FullScreenQuad(this.mTrans);
  }

  _draw(mat, target) {
    const r = this.renderer;
    const prevT = r.getRenderTarget();
    const prevClear = r.autoClear;
    r.autoClear = false;
    this.quad.material = mat;
    r.setRenderTarget(target);
    this.quad.render(r);
    r.setRenderTarget(prevT);
    r.autoClear = prevClear;
  }

  /** Transmitância + multiespalhamento (troca de parâmetros). */
  renderStatic() {
    this._draw(this.mTrans, this.trans);
    this._draw(this.mMS, this.ms);
  }

  renderSkyView() {
    this._draw(this.mSky, this.sky);
  }

  renderAerial() {
    this._draw(this.mAP, this.ap);
  }

  dispose() {
    for (const t of [this.trans, this.ms, this.sky, this.ap]) t.dispose();
    for (const m of [this.mTrans, this.mMS, this.mSky, this.mAP]) m.dispose();
    this.quad.dispose();
  }
}
