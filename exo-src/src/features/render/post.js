/**
 * PASSADAS DE PÓS-PROCESSAMENTO do sistema `render` (todas de tela cheia).
 *
 *   TAAPass        antisserrilhado temporal: câmera com jitter (Halton 2,3),
 *                  reprojeção pela profundidade (a origem de render anda em
 *                  double: o deslocamento da câmera entre frames entra na
 *                  matriz anterior), recorte da história na caixa de cor da
 *                  vizinhança 3×3 (YCoCg) e peso pela luminância.
 *   MotionBlurPass borrão de movimento SÓ da câmera (mesma reprojeção):
 *                  intensidade ∝ velocidade — some a pé, forte na nave rápida.
 *   ExposurePass   exposição automática: log-luminância média (com peso no
 *                  centro) por mipmaps na GPU → alvo 1×1 que se adapta
 *                  suavemente (pingue-pongue). Nenhuma leitura na CPU.
 *   BloomPass      bloom físico multinível (Jimenez 2014): pré-filtro com
 *                  joelho suave + média de Karis (anti-vaga-lume), 6 níveis
 *                  de redução de 13 amostras e subida com tenda 3×3. O
 *                  brilho SELETIVO (objetos registrados) entra no pré-filtro
 *                  sem limiar, oclusão testada contra a profundidade do mundo.
 *   GodRaysPass    raios crepusculares em espaço de tela: máscara do céu
 *                  perto do sol (ocluída por terreno/rochas/nuvens porque só
 *                  o céu visível entra), 3 passadas de borrão radial em
 *                  1/4 de resolução.
 *   CompositePass  HDR → LDR: bloom + raios, aberração cromática nas
 *                  bordas, vinheta, exposição, ACES, gradação sutil, sRGB.
 *   FinalPass      LDR → tela: FXAA (quando não há TAA) ou nitidez leve
 *                  (com TAA), grão de filme e dithering.
 */
import * as THREE from 'three';
import { DEPTH_GLSL, depthUniforms, HASH_GLSL, LUMA_GLSL } from './glsl.js';
import { makeTarget, fsMaterial, resizeTarget, COPY_FRAG } from './util.js';

// ─── reprojeção compartilhada (TAA / borrão de movimento) ─────────────────
const REPROJ_GLSL = /* glsl */ `
${DEPTH_GLSL}
uniform sampler2D tDepth;
uniform vec2 uTan;          // tan(fov/2)·aspect, tan(fov/2) (sem jitter)
uniform mat4 uCamRot;       // câmera → espaço de render (só rotação)
uniform mat4 uPrevVP;       // projeção·visão do frame anterior
uniform vec3 uDeltaO;       // origem atual − origem anterior (m)
// uv do mesmo ponto do mundo no frame anterior (xy) e se é céu (z)
vec3 exoReproject(vec2 uv) {
  float z = exoViewZ(texture2D(tDepth, uv).r);
  vec3 vdir = vec3((uv * 2.0 - 1.0) * uTan, -1.0);
  vec4 clip;
  float sky = 0.0;
  if (z > 1e11) {
    vec3 d = (uCamRot * vec4(vdir, 0.0)).xyz;
    clip = uPrevVP * vec4(d, 0.0);
    sky = 1.0;
  } else {
    vec3 p = (uCamRot * vec4(vdir * z, 1.0)).xyz;
    clip = uPrevVP * vec4(p + uDeltaO, 1.0);
  }
  if (clip.w <= 0.0) return vec3(-1.0, -1.0, sky);
  return vec3(clip.xy / clip.w * 0.5 + 0.5, sky);
}
`;

function reprojUniforms(ctx) {
  return {
    ...depthUniforms(ctx),
    tDepth: { value: null },
    uTan: { value: new THREE.Vector2(1, 1) },
    uCamRot: { value: new THREE.Matrix4() },
    uPrevVP: { value: new THREE.Matrix4() },
    uDeltaO: { value: new THREE.Vector3() },
  };
}

/** Estado de câmera do frame anterior (para reprojeção). */
export class CameraHistory {
  constructor(ctx) {
    this.ctx = ctx;
    this.prevVP = new THREE.Matrix4();
    this.curVP = new THREE.Matrix4();
    this.prevO = new ctx.WorldPos();
    this.curO = new ctx.WorldPos();
    this.delta = new THREE.Vector3();
    this.valid = false;
    this.jump = true;
    this._m = new THREE.Matrix4();
    this.speed = 0; // m/s da câmera
    this.angSpeed = 0; // rad/s
    this._q = new THREE.Quaternion();
    this._qPrev = new THREE.Quaternion();
  }
  /** Chamada uma vez por frame ANTES do jitter (matrizes limpas). */
  update(dt) {
    const cam = this.ctx.camera;
    const O = this.ctx.space.origin;
    this.prevVP.copy(this.curVP);
    this.prevO.copy(this.curO);
    this._qPrev.copy(this._q);
    cam.updateMatrixWorld();
    this._m.copy(cam.matrixWorld).invert();
    this.curVP.multiplyMatrices(cam.projectionMatrix, this._m);
    this.curO.copy(O);
    this._q.copy(cam.quaternion);
    // em double: diferença de origens
    this.delta.set(O.x - this.prevO.x, O.y - this.prevO.y, O.z - this.prevO.z);
    const d = this.delta.length();
    const ang = this.valid ? this._q.angleTo(this._qPrev) : 0;
    const t = Math.max(dt, 1e-3);
    this.speed = this.valid ? d / t : 0;
    this.angSpeed = ang / t;
    // salto (teleporte, recentro) invalida a história
    this.jump = !this.valid || d > 2000 || ang > 0.6;
    this.valid = true;
  }
  fill(u) {
    const cam = this.ctx.camera;
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    u.uTan.value.set(tanY * cam.aspect, tanY);
    u.uCamRot.value.makeRotationFromQuaternion(cam.quaternion);
    u.uPrevVP.value.copy(this.prevVP);
    u.uDeltaO.value.copy(this.delta);
  }
}

// ─── TAA ──────────────────────────────────────────────────────────────────
const TAA_FRAG = /* glsl */ `
${REPROJ_GLSL}
${LUMA_GLSL}
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform vec2 uTexel;
uniform float uBlend;
uniform float uReset;
varying vec2 vUv;
vec3 toY(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
// compressão reversível (tons altos não dominam a média)
vec3 tmap(vec3 c) { return c / (1.0 + exoLuma(c)); }
vec3 itmap(vec3 c) { return c / max(1.0 - exoLuma(c), 1e-4); }
void main() {
  vec3 c = tmap(max(texture2D(tCur, vUv).rgb, 0.0));
  if (uReset > 0.5) { gl_FragColor = vec4(itmap(c), 1.0); return; }
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  vec3 mn = vec3(1e9), mx = vec3(-1e9);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec3 s = toY(tmap(max(texture2D(tCur, vUv + vec2(float(x), float(y)) * uTexel).rgb, 0.0)));
      m1 += s; m2 += s * s;
      mn = min(mn, s); mx = max(mx, s);
    }
  }
  // caixa pela variância (mais justa que min/max: menos fantasma)
  vec3 mu = m1 / 9.0;
  vec3 sd = sqrt(max(m2 / 9.0 - mu * mu, 0.0));
  vec3 bmn = max(mn, mu - 1.25 * sd), bmx = min(mx, mu + 1.25 * sd);
  vec3 rp = exoReproject(vUv);
  vec2 puv = rp.xy;
  if (puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) { gl_FragColor = vec4(itmap(c), 1.0); return; }
  vec3 h = toY(tmap(max(texture2D(tHist, puv).rgb, 0.0)));
  // recorte ao longo do segmento até o centro da caixa
  vec3 cc = 0.5 * (bmx + bmn), ext = 0.5 * (bmx - bmn) + 1e-4;
  vec3 v = h - cc;
  vec3 a = abs(v / ext);
  float ma = max(a.x, max(a.y, a.z));
  if (ma > 1.0) h = cc + v / ma;
  // mais peso no atual quando a câmera se move muito (menos borrão)
  float motion = length((puv - vUv) / uTexel);
  float w = clamp(uBlend + motion * 0.01, uBlend, 0.5);
  vec3 r = mix(fromY(h), c, w);
  gl_FragColor = vec4(itmap(r), 1.0);
}`;

export class TAAPass {
  constructor(ctx, hist) {
    this.ctx = ctx;
    this.hist = hist;
    this.a = makeTarget(1, 1, { name: 'exo.taaA' });
    this.b = makeTarget(1, 1, { name: 'exo.taaB' });
    this.u = { ...reprojUniforms(ctx), tCur: { value: null }, tHist: { value: null }, uTexel: { value: new THREE.Vector2() }, uBlend: { value: 0.1 }, uReset: { value: 1 } };
    this.mat = fsMaterial(TAA_FRAG, this.u);
    this.index = 0;
    this.reset = true;
    this.jx = 0;
    this.jy = 0;
  }
  static halton(i, b) {
    let f = 1, r = 0;
    while (i > 0) {
      f /= b;
      r += f * (i % b);
      i = Math.floor(i / b);
    }
    return r;
  }
  /** Aplica jitter subpixel na projeção (restaura com unjitter). */
  jitter(cam, w, h) {
    this.index = (this.index % 8) + 1;
    this.jx = (TAAPass.halton(this.index, 2) - 0.5) * 2 / w;
    this.jy = (TAAPass.halton(this.index, 3) - 0.5) * 2 / h;
    const e = cam.projectionMatrix.elements;
    e[8] += this.jx;
    e[9] += this.jy;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  unjitter(cam) {
    const e = cam.projectionMatrix.elements;
    e[8] -= this.jx;
    e[9] -= this.jy;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  render(blit, src, depth) {
    const w = src.width, h = src.height;
    if (this.a.width !== w || this.a.height !== h) this.reset = true;
    resizeTarget(this.a, w, h);
    resizeTarget(this.b, w, h);
    const u = this.u;
    this.hist.fill(u);
    u.tDepth.value = depth;
    u.tCur.value = src.texture;
    u.tHist.value = this.a.texture;
    u.uTexel.value.set(1 / w, 1 / h);
    u.uReset.value = this.reset || this.hist.jump ? 1 : 0;
    // no modo shot a câmera é fixa: média longa (converge em ~20 frames)
    u.uBlend.value = this.ctx.shot ? 0.06 : 0.1;
    blit.draw(this.mat, this.b);
    const t = this.a;
    this.a = this.b;
    this.b = t;
    this.reset = false;
    return this.a;
  }
  dispose() {
    this.a.dispose();
    this.b.dispose();
    this.mat.dispose();
  }
}

// ─── borrão de movimento da câmera ────────────────────────────────────────
const MB_FRAG = /* glsl */ `
${REPROJ_GLSL}
${HASH_GLSL}
uniform sampler2D tSrc;
uniform float uScale;
uniform float uMaxPx;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 rp = exoReproject(vUv);
  vec2 v = (vUv - rp.xy) * uScale;
  float len = length(v / uTexel);
  if (rp.x < -0.5 || len < 0.75) { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); return; }
  v *= min(1.0, uMaxPx / len);
  float j = exoIGN(gl_FragCoord.xy) - 0.5;
  vec3 acc = vec3(0.0);
  const int N = 10;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + j) / float(N - 1) - 0.5;
    acc += texture2D(tSrc, vUv - v * t).rgb;
  }
  gl_FragColor = vec4(acc / float(N), 1.0);
}`;

export class MotionBlurPass {
  constructor(ctx, hist) {
    this.ctx = ctx;
    this.hist = hist;
    this.out = makeTarget(1, 1, { name: 'exo.mblur' });
    this.u = { ...reprojUniforms(ctx), tSrc: { value: null }, uScale: { value: 0 }, uMaxPx: { value: 40 }, uTexel: { value: new THREE.Vector2() } };
    this.mat = fsMaterial(MB_FRAG, this.u);
    this.amount = 0;
  }
  /** Quanto borrar (0..1) pela velocidade da câmera — forte só na nave rápida. */
  strength(dt) {
    const h = this.hist;
    const p = this.ctx.player;
    if (h.jump) return 0;
    const fast = p?.mode === 'walk' ? 0 : THREE.MathUtils.smoothstep(h.speed, 120, 1500);
    const turn = p?.mode === 'walk' ? 0 : THREE.MathUtils.smoothstep(h.angSpeed, 1.5, 6) * 0.4;
    const target = Math.max(fast, turn);
    // suavizado no tempo
    const k = 1 - Math.exp(-Math.max(dt, 0) * 6);
    this.amount += (target - this.amount) * (this.ctx.shot ? 1 : k);
    return this.amount;
  }
  render(blit, src, depth, amount, dt) {
    resizeTarget(this.out, src.width, src.height);
    const u = this.u;
    this.hist.fill(u);
    u.tDepth.value = depth;
    u.tSrc.value = src.texture;
    u.uTexel.value.set(1 / src.width, 1 / src.height);
    // ~1/60 s de obturador relativo ao dt do frame
    u.uScale.value = amount * Math.min(2, (1 / 60) / Math.max(dt, 1 / 240)) * 1.2;
    u.uMaxPx.value = 12 + 40 * amount;
    blit.draw(this.mat, this.out);
    return this.out;
  }
  dispose() {
    this.out.dispose();
    this.mat.dispose();
  }
}

// ─── exposição automática ─────────────────────────────────────────────────
const LUM_FRAG = /* glsl */ `
${LUMA_GLSL}
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + vec2(-0.25, -0.25) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(0.25, -0.25) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(-0.25, 0.25) * uTexel).rgb
         + texture2D(tSrc, vUv + vec2(0.25, 0.25) * uTexel).rgb;
  float l = exoLuma(max(c * 0.25, 0.0));
  // peso central (o que se olha conta mais) e menos o topo (céu)
  vec2 d = (vUv - vec2(0.5, 0.45)) * vec2(1.2, 1.6);
  float w = exp(-dot(d, d) * 2.5) + 0.15;
  gl_FragColor = vec4(log2(clamp(l, 1e-4, 6e4)) * w, w, 0.0, 1.0);
}`;

const ADAPT_FRAG = /* glsl */ `
uniform sampler2D tLum;
uniform sampler2D tPrev;
uniform float uLevel;
uniform float uRate;     // 0..1 (1 = instantâneo)
uniform float uKey;
uniform float uMin, uMax;
uniform float uComp;     // fração da adaptação (1 = total)
uniform float uBase;     // exposição base (pipeline.exposure)
uniform float uFirst;
varying vec2 vUv;
void main() {
  vec2 s = textureLod(tLum, vec2(0.5), uLevel).rg;
  float avg = exp2(s.r / max(s.g, 1e-5));
  // adaptação parcial: cenas claras continuam claras, escuras escuras
  float e = pow(uKey / max(avg, 1e-4), uComp);
  e = clamp(e, uMin, uMax) * uBase;
  float prev = texture2D(tPrev, vec2(0.5)).r;
  if (uFirst > 0.5 || !(prev > 0.0) || prev > 1e4) prev = e;
  // adapta em EV (log), não linear
  float r = exp2(mix(log2(prev), log2(e), uRate));
  gl_FragColor = vec4(r, avg, 0.0, 1.0);
}`;

export class ExposurePass {
  constructor(ctx) {
    this.ctx = ctx;
    this.lum = makeTarget(128, 128, { name: 'exo.lum', mips: true });
    this.a = makeTarget(1, 1, { name: 'exo.expA', filter: THREE.NearestFilter });
    this.b = makeTarget(1, 1, { name: 'exo.expB', filter: THREE.NearestFilter });
    this.uL = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } };
    this.mL = fsMaterial(LUM_FRAG, this.uL);
    this.uA = {
      tLum: { value: this.lum.texture },
      tPrev: { value: this.a.texture },
      uLevel: { value: 7 },
      uRate: { value: 1 },
      uKey: { value: 0.18 },
      uMin: { value: 0.25 },
      uMax: { value: 3.5 },
      uComp: { value: 0.72 },
      uBase: { value: 1 },
      uFirst: { value: 1 },
    };
    this.mA = fsMaterial(ADAPT_FRAG, this.uA);
    this.mFixed = fsMaterial('uniform float uE; void main(){ gl_FragColor = vec4(uE, 0.0, 0.0, 1.0); }', { uE: { value: 1 } });
    this.first = true;
    this.auto = true;
  }
  get texture() {
    return this.a.texture;
  }
  render(blit, src, base, dt) {
    if (!this.auto) {
      this.mFixed.uniforms.uE.value = base;
      blit.draw(this.mFixed, this.a);
      return this.a.texture;
    }
    this.uL.tSrc.value = src.texture;
    this.uL.uTexel.value.set(1 / 128, 1 / 128);
    blit.draw(this.mL, this.lum);
    const u = this.uA;
    u.tPrev.value = this.a.texture;
    u.uBase.value = base;
    // modo shot e 1º frame: instantâneo; jogo: ~1,2 s para adaptar
    u.uRate.value = this.first || this.ctx.shot ? 1 : 1 - Math.exp(-Math.max(dt, 0) * 1.6);
    u.uFirst.value = this.first ? 1 : 0;
    blit.draw(this.mA, this.b);
    const t = this.a;
    this.a = this.b;
    this.b = t;
    this.first = false;
    return this.a.texture;
  }
  dispose() {
    for (const t of [this.lum, this.a, this.b]) t.dispose();
    this.mL.dispose();
    this.mA.dispose();
    this.mFixed.dispose();
  }
}

// ─── bloom ────────────────────────────────────────────────────────────────
const PREFILTER_FRAG = /* glsl */ `
${DEPTH_GLSL}
${LUMA_GLSL}
uniform sampler2D tSrc;
uniform sampler2D tExp;
uniform sampler2D tSel;
uniform sampler2D tSelDepth;
uniform sampler2D tDepth;
uniform float uSel;
uniform float uThreshold;
uniform float uKnee;
uniform vec2 uTexel;  // da fonte
varying vec2 vUv;
vec3 karis(vec3 c) { return c / (1.0 + exoLuma(c)); }
void main() {
  float e = texture2D(tExp, vec2(0.5)).r;
  // 4 amostras bilineares com média de Karis (vaga-lumes não explodem)
  vec3 a = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 b = texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 c = texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 d = texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  float wa = 1.0 / (1.0 + exoLuma(a * e)), wb = 1.0 / (1.0 + exoLuma(b * e));
  float wc = 1.0 / (1.0 + exoLuma(c * e)), wd = 1.0 / (1.0 + exoLuma(d * e));
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd) * e;
  col = min(max(col, 0.0), vec3(200.0));
  // joelho suave
  float br = max(col.r, max(col.g, col.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  rq = rq * rq / (4.0 * uKnee + 1e-4);
  float k = max(rq, br - uThreshold) / max(br, 1e-4);
  col *= k;
  if (uSel > 0.5) {
    float sd = texture2D(tSelDepth, vUv).r;
    float zs = exoViewZ(sd);
    float zw = exoViewZ(texture2D(tDepth, vUv).r);
    float vis = zs <= zw * 1.002 + 0.05 ? 1.0 : 0.0;
    col += max(texture2D(tSel, vUv).rgb, 0.0) * e * vis * 1.5;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  // 13 amostras (Jimenez 2014)
  vec3 a = s(vec2(-2.0, 2.0)), b = s(vec2(0.0, 2.0)), c = s(vec2(2.0, 2.0));
  vec3 d = s(vec2(-2.0, 0.0)), e = s(vec2(0.0, 0.0)), f = s(vec2(2.0, 0.0));
  vec3 g = s(vec2(-2.0, -2.0)), h = s(vec2(0.0, -2.0)), i = s(vec2(2.0, -2.0));
  vec3 j = s(vec2(-1.0, 1.0)), k = s(vec2(1.0, 1.0)), l = s(vec2(-1.0, -1.0)), m = s(vec2(1.0, -1.0));
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(r, 1.0);
}`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tLow;   // nível menor (já acumulado)
uniform sampler2D tHigh;  // nível atual (redução)
uniform vec2 uTexel;      // do nível menor
uniform float uRadius;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tLow, vUv + o * uTexel).rgb; }
void main() {
  vec3 t = s(vec2(0.0)) * 4.0
    + (s(vec2(-1.0, 0.0)) + s(vec2(1.0, 0.0)) + s(vec2(0.0, -1.0)) + s(vec2(0.0, 1.0))) * 2.0
    + s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0));
  t /= 16.0;
  gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + t * uRadius, 1.0);
}`;

export const BLOOM_LAYER = 11;

export class BloomPass {
  constructor(ctx) {
    this.ctx = ctx;
    this.levels = 6;
    this.down = [];
    this.up = [];
    for (let i = 0; i < this.levels; i++) {
      this.down.push(makeTarget(1, 1, { name: `exo.bloomD${i}` }));
      if (i < this.levels - 1) this.up.push(makeTarget(1, 1, { name: `exo.bloomU${i}` }));
    }
    const dt = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.sel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, depthTexture: dt, colorSpace: THREE.LinearSRGBColorSpace });
    this.sel.texture.name = 'exo.bloomSel';
    this.uP = {
      ...depthUniforms(ctx),
      tSrc: { value: null },
      tExp: { value: null },
      tSel: { value: this.sel.texture },
      tSelDepth: { value: dt },
      tDepth: { value: null },
      uSel: { value: 0 },
      uThreshold: { value: 1.0 },
      uKnee: { value: 0.6 },
      uTexel: { value: new THREE.Vector2() },
    };
    this.mP = fsMaterial(PREFILTER_FRAG, this.uP);
    this.uD = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } };
    this.mD = fsMaterial(DOWN_FRAG, this.uD);
    this.uU = { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.85 } };
    this.mU = fsMaterial(UP_FRAG, this.uU);
    this.strength = 0.32;
    this.selective = new Set();
  }
  register(obj) {
    if (!obj) return;
    this.selective.add(obj);
    obj.traverse?.((o) => o.layers.enable(BLOOM_LAYER));
  }
  unregister(obj) {
    if (!obj) return;
    this.selective.delete(obj);
    obj.traverse?.((o) => o.layers.disable(BLOOM_LAYER));
  }
  /** Desenha só os objetos seletivos (camada própria) em meia resolução. */
  renderSelective(w, h) {
    const ctx = this.ctx;
    let any = false;
    for (const o of this.selective) {
      if (o.parent && o.visible) {
        any = true;
        break;
      }
    }
    if (!any) return false;
    resizeTarget(this.sel, w, h);
    const r = ctx.renderer;
    const cam = ctx.camera;
    const mask = cam.layers.mask;
    const bg = ctx.scene.background;
    cam.layers.set(BLOOM_LAYER);
    ctx.scene.background = null;
    r.setRenderTarget(this.sel);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(ctx.scene, cam);
    cam.layers.mask = mask;
    ctx.scene.background = bg;
    return true;
  }
  render(blit, src, depth, expTex) {
    const W = Math.max(1, src.width >> 1), H = Math.max(1, src.height >> 1);
    let w = W, h = H;
    for (let i = 0; i < this.levels; i++) {
      resizeTarget(this.down[i], w, h);
      if (i < this.levels - 1) resizeTarget(this.up[i], w, h);
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    const hasSel = this.renderSelective(W, H);
    const p = this.uP;
    p.tSrc.value = src.texture;
    p.tExp.value = expTex;
    p.tDepth.value = depth;
    p.uSel.value = hasSel ? 1 : 0;
    p.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
    blit.draw(this.mP, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      const s = this.down[i - 1];
      this.uD.tSrc.value = s.texture;
      this.uD.uTexel.value.set(1 / s.width, 1 / s.height);
      blit.draw(this.mD, this.down[i]);
    }
    let low = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      this.uU.tLow.value = low.texture;
      this.uU.tHigh.value = this.down[i].texture;
      this.uU.uTexel.value.set(1 / low.width, 1 / low.height);
      blit.draw(this.mU, this.up[i]);
      low = this.up[i];
    }
    return this.up[0].texture;
  }
  dispose() {
    for (const t of [...this.down, ...this.up, this.sel]) t.dispose();
    this.mP.dispose();
    this.mD.dispose();
    this.mU.dispose();
  }
}

// ─── raios crepusculares ──────────────────────────────────────────────────
const RAYMASK_FRAG = /* glsl */ `
${DEPTH_GLSL}
${LUMA_GLSL}
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform sampler2D tExp;
uniform vec2 uSun;      // posição do sol na tela (uv)
uniform float uAspect;
uniform vec2 uTexel;    // da fonte
varying vec2 vUv;
void main() {
  // 4 amostras de profundidade: céu = 1 (borda suave)
  float sky = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i & 1) - 0.5, float(i >> 1) - 0.5) * 2.0 * uTexel;
    float z = exoViewZ(texture2D(tDepth, vUv + o).r);
    float s = z > 1e11 ? 1.0 : 0.0;
    sky += s;
    col += texture2D(tSrc, vUv + o).rgb * s;
  }
  sky *= 0.25;
  col *= 0.25;
  float e = texture2D(tExp, vec2(0.5)).r;
  vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
  float r = length(d);
  // brilho do céu (já tem a cor do sol e do halo) com queda radial
  float fall = exp(-r * 3.2) + 0.25 * exp(-r * 0.9);
  vec3 c = min(col * e, vec3(6.0)) * fall;
  gl_FragColor = vec4(c, sky);
}`;

const RADIAL_FRAG = /* glsl */ `
${HASH_GLSL}
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uStep;   // fração do caminho até o sol por passada
uniform float uDecay;
varying vec2 vUv;
void main() {
  vec2 dir = (uSun - vUv);
  float j = exoIGN(gl_FragCoord.xy);
  vec3 acc = vec3(0.0);
  float wsum = 0.0, w = 1.0;
  const int N = 20;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + j) / float(N) * uStep;
    vec2 uv = vUv + dir * t;
    acc += texture2D(tSrc, uv).rgb * w;
    wsum += w;
    w *= uDecay;
  }
  gl_FragColor = vec4(acc / wsum, 1.0);
}`;

export class GodRaysPass {
  constructor(ctx) {
    this.ctx = ctx;
    this.mask = makeTarget(1, 1, { name: 'exo.rayMask' });
    this.a = makeTarget(1, 1, { name: 'exo.raysA' });
    this.b = makeTarget(1, 1, { name: 'exo.raysB' });
    this.uM = {
      ...depthUniforms(ctx),
      tSrc: { value: null },
      tDepth: { value: null },
      tExp: { value: null },
      uSun: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
      uTexel: { value: new THREE.Vector2() },
    };
    this.mM = fsMaterial(RAYMASK_FRAG, this.uM);
    this.uR = { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uStep: { value: 1 }, uDecay: { value: 0.96 } };
    this.mR = fsMaterial(RADIAL_FRAG, this.uR);
    this.sunUv = new THREE.Vector2();
    this.intensity = 0;
    this._v = new THREE.Vector3();
    this.strength = 1;
  }
  /** Posição do sol na tela e intensidade (0 = não desenha). */
  prepare() {
    const ctx = this.ctx;
    const sky = ctx.services.sky;
    const dir = sky?.sunDirection;
    if (!dir) return 0;
    const cam = ctx.camera;
    const v = this._v.copy(dir).applyQuaternion(cam.quaternion.clone().invert());
    if (v.z > -0.05) return (this.intensity = 0);
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    const sx = (v.x / -v.z) / (tanY * cam.aspect);
    const sy = (v.y / -v.z) / tanY;
    this.sunUv.set(sx * 0.5 + 0.5, sy * 0.5 + 0.5);
    // fora da tela: some devagar até ~0,6 tela além da borda
    const off = Math.max(Math.abs(sx), Math.abs(sy));
    const onScreen = 1 - THREE.MathUtils.smoothstep(off, 1.0, 1.9);
    // sol acima do horizonte local
    const up = ctx.player?.up;
    const el = up ? dir.dot(up) : 0.3;
    const above = THREE.MathUtils.smoothstep(el, -0.06, 0.03);
    // mais forte com o sol baixo (caminho longo no ar) e com névoa densa
    const low = 0.55 + 0.45 * (1 - THREE.MathUtils.smoothstep(el, 0.05, 0.6));
    // fora da atmosfera não há meio para espalhar
    const atmo = sky?.atmosphere;
    const alt = ctx.player?.altitude ?? 0;
    const inAir = atmo ? 1 - THREE.MathUtils.smoothstep(alt, 8000, 40000) : 1;
    this.intensity = onScreen * above * low * inAir * this.strength;
    return this.intensity;
  }
  render(blit, src, depth, expTex) {
    const w = Math.max(1, src.width >> 2), h = Math.max(1, src.height >> 2);
    resizeTarget(this.mask, w, h);
    resizeTarget(this.a, w, h);
    resizeTarget(this.b, w, h);
    const m = this.uM;
    m.tSrc.value = src.texture;
    m.tDepth.value = depth;
    m.tExp.value = expTex;
    m.uSun.value.copy(this.sunUv);
    m.uAspect.value = src.width / src.height;
    m.uTexel.value.set(1 / src.width, 1 / src.height);
    blit.draw(this.mM, this.mask);
    const r = this.uR;
    r.uSun.value.copy(this.sunUv);
    // 3 passadas com passo decrescente (20³ = 8000 amostras efetivas)
    const steps = [[this.mask, this.a, 0.9, 0.97], [this.a, this.b, 0.33, 0.985], [this.b, this.a, 0.11, 1.0]];
    for (const [s, d, st, dc] of steps) {
      r.tSrc.value = s.texture;
      r.uStep.value = st;
      r.uDecay.value = dc;
      blit.draw(this.mR, d);
    }
    return this.a.texture;
  }
  dispose() {
    for (const t of [this.mask, this.a, this.b]) t.dispose();
    this.mM.dispose();
    this.mR.dispose();
  }
}

// ─── composição HDR → LDR ─────────────────────────────────────────────────
const COMPOSITE_FRAG = /* glsl */ `
${LUMA_GLSL}
${HASH_GLSL}
uniform sampler2D tSrc;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform sampler2D tExp;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRayColor;
uniform float uCA;
uniform float uVignette;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec2 uAspect;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = IN * (color / 0.6);
  color = RRTAndODTFit(color);
  return clamp(OUT * color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
void main() {
  float e = texture2D(tExp, vec2(0.5)).r;
  vec2 d = vUv - 0.5;
  float r2 = dot(d * uAspect, d * uAspect);
  // aberração cromática radial, só nas bordas (r² ∝ distância do centro)
  vec2 ca = d * r2 * uCA;
  vec3 col;
  col.r = texture2D(tSrc, vUv - ca).r;
  col.g = texture2D(tSrc, vUv).g;
  col.b = texture2D(tSrc, vUv + ca).b;
  col = max(col, 0.0) * e;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col += texture2D(tRays, vUv).rgb * uRayColor * uRays;
  // vinheta física (cos⁴ suave)
  float vig = 1.0 - uVignette * smoothstep(0.08, 0.75, r2);
  col *= vig;
  vec3 m = aces(col);
  // gradação sutil: contraste em torno do cinza médio, saturação, sombras frias
  float l = exoLuma(m);
  m = mix(vec3(l), m, uSaturation);
  m = max(m, 0.0);
  m = pow(m, vec3(uContrast)) * pow(0.18, 1.0 - uContrast);
  m += uLift * (1.0 - smoothstep(0.0, 0.25, l));
  gl_FragColor = vec4(toSRGB(clamp(m, 0.0, 1.0)), 1.0);
}`;

export class CompositePass {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = makeTarget(1, 1, { name: 'exo.ldr', type: THREE.UnsignedByteType });
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.u = {
      tSrc: { value: null },
      tBloom: { value: this.black },
      tRays: { value: this.black },
      tExp: { value: null },
      uBloom: { value: 0 },
      uRays: { value: 0 },
      uRayColor: { value: new THREE.Color(1, 0.9, 0.75) },
      uCA: { value: 0.006 },
      uVignette: { value: 0.32 },
      uSaturation: { value: 1.12 },
      uContrast: { value: 1.07 },
      uLift: { value: new THREE.Vector3(0.0, 0.002, 0.006) },
      uAspect: { value: new THREE.Vector2(1, 1) },
    };
    this.mat = fsMaterial(COMPOSITE_FRAG, this.u);
  }
  render(blit, src, { bloom, bloomStrength, rays, rayStrength, rayColor, exposure }) {
    resizeTarget(this.out, src.width, src.height);
    const u = this.u;
    u.tSrc.value = src.texture;
    u.tBloom.value = bloom || this.black;
    u.uBloom.value = bloom ? bloomStrength : 0;
    u.tRays.value = rays || this.black;
    u.uRays.value = rays ? rayStrength : 0;
    if (rayColor) u.uRayColor.value.copy(rayColor);
    u.tExp.value = exposure;
    const a = src.width / src.height;
    u.uAspect.value.set(a / Math.max(a, 1), 1 / Math.max(a, 1));
    blit.draw(this.mat, this.out);
    return this.out;
  }
  dispose() {
    this.out.dispose();
    this.mat.dispose();
    this.black.dispose();
  }
}

// ─── saída: FXAA / nitidez + grão ─────────────────────────────────────────
const FINAL_FRAG = /* glsl */ `
${HASH_GLSL}
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFXAA;
uniform float uSharpen;
uniform float uGrain;
uniform float uSeed;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 fxaa(vec2 uv) {
  vec3 rgbNW = texture2D(tSrc, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(tSrc, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(tSrc, uv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(tSrc, uv + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 rgbM = texture2D(tSrc, uv).rgb;
  float lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE), lM = lum(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
  vec3 A = 0.5 * (texture2D(tSrc, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 B = A * 0.5 + 0.25 * (texture2D(tSrc, uv - dir * 0.5).rgb + texture2D(tSrc, uv + dir * 0.5).rgb);
  float lB = lum(B);
  return (lB < lMin || lB > lMax) ? A : B;
}
void main() {
  vec3 c;
  if (uFXAA > 0.5) c = fxaa(vUv);
  else {
    c = texture2D(tSrc, vUv).rgb;
    if (uSharpen > 0.0) {
      // nitidez adaptativa leve (compensa a suavidade do TAA)
      vec3 n = texture2D(tSrc, vUv + vec2(0.0, uTexel.y)).rgb + texture2D(tSrc, vUv - vec2(0.0, uTexel.y)).rgb
             + texture2D(tSrc, vUv + vec2(uTexel.x, 0.0)).rgb + texture2D(tSrc, vUv - vec2(uTexel.x, 0.0)).rgb;
      vec3 mn = min(c, n * 0.25), mx = max(c, n * 0.25);
      vec3 hp = c - n * 0.25;
      float amt = uSharpen * (1.0 - clamp(length(hp) * 4.0, 0.0, 1.0));
      c = clamp(c + hp * amt, 0.0, 1.0);
    }
  }
  // grão de filme: mais visível nos meios-tons, quase nada no preto/branco
  float l = lum(c);
  float g = exoHash12(gl_FragCoord.xy + uSeed * 61.7) + exoHash12(gl_FragCoord.xy * 1.37 + uSeed * 17.3) - 1.0;
  c += g * uGrain * (0.35 + 0.65 * 4.0 * l * (1.0 - l));
  // dithering de 8 bits (sem bandas no céu)
  c += (exoIGN(gl_FragCoord.xy + uSeed) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export class FinalPass {
  constructor(ctx) {
    this.ctx = ctx;
    this.u = { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFXAA: { value: 1 }, uSharpen: { value: 0 }, uGrain: { value: 0.022 }, uSeed: { value: 0 } };
    this.mat = fsMaterial(FINAL_FRAG, this.u);
  }
  render(blit, src, { fxaa, sharpen, grain }) {
    const u = this.u;
    u.tSrc.value = src.texture;
    u.uTexel.value.set(1 / src.width, 1 / src.height);
    u.uFXAA.value = fxaa ? 1 : 0;
    u.uSharpen.value = sharpen;
    u.uGrain.value = grain;
    u.uSeed.value = this.ctx.shot ? 1 : (this.ctx.time.frame % 97) + 1;
    blit.draw(this.mat, null);
  }
  dispose() {
    this.mat.dispose();
  }
}

/** Cópia simples (TAA/borrão de volta para o alvo HDR). */
export class CopyPass {
  constructor() {
    this.u = { tSrc: { value: null }, uGain: { value: 1 } };
    this.mat = fsMaterial(COPY_FRAG, this.u);
  }
  render(blit, srcTex, dst) {
    this.u.tSrc.value = srcTex;
    blit.draw(this.mat, dst);
  }
  dispose() {
    this.mat.dispose();
  }
}
