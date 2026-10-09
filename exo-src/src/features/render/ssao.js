/**
 * SSAO (estilo SAO/GTAO simplificado) em MEIA resolução.
 *
 * Roda no estágio 'afterWorld' (ordem 1 — antes da água e da perspectiva
 * aérea, para não escurecer a neblina): lê o depth do mundo, reconstrói a
 * posição/normal em espaço de visão, integra 12 amostras numa espiral
 * (raio fixo em metros, projetado em pixels), desfoca com filtro bilateral
 * (respeita bordas de profundidade) e multiplica o HDR (mistura DstColor).
 */
import * as THREE from 'three';
import { DEPTH_GLSL, depthUniforms, HASH_GLSL, QUAD_VERT } from './glsl.js';
import { makeTarget, fsMaterial, resizeTarget } from './util.js';

const AO_FRAG = /* glsl */ `
${DEPTH_GLSL}
${HASH_GLSL}
uniform sampler2D tDepth;
uniform vec2 uTexel;      // 1/resolução do depth
uniform vec2 uTan;        // tan(fov/2)·aspect, tan(fov/2)
uniform float uProjScale; // pixels (meia-res) por metro a 1 m
uniform float uRadius;    // m
uniform float uIntensity;
uniform float uMaxDist;
uniform float uFrame;
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  float z = exoViewZ(texture2D(tDepth, uv).r);
  return vec3((uv * 2.0 - 1.0) * uTan * z, -z);
}

void main() {
  vec3 P = viewPos(vUv);
  float z = -P.z;
  if (z > uMaxDist) { gl_FragColor = vec4(1.0); return; }
  // normal pela menor diferença em cada eixo (sem halo nas bordas)
  vec3 px = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
  vec3 nx = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 py = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
  vec3 ny = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(px.z) < abs(nx.z) ? px : nx;
  vec3 dy = abs(py.z) < abs(ny.z) ? py : ny;
  vec3 N = normalize(cross(dx, dy));
  float rad = uRadius * (1.0 + z * 0.012);
  float rPx = rad * uProjScale / z;
  if (rPx < 1.0) { gl_FragColor = vec4(1.0); return; }
  rPx = min(rPx, 90.0);
  float ang = exoIGN(gl_FragCoord.xy + uFrame * 7.0) * 6.2831853;
  float occ = 0.0;
  const int S = 12;
  for (int i = 0; i < S; i++) {
    float a = (float(i) + 0.5) / float(S);
    float th = a * 6.2831853 * 3.0 + ang;
    vec2 off = vec2(cos(th), sin(th)) * a * rPx * uTexel;
    vec3 Q = viewPos(vUv + off);
    vec3 v = Q - P;
    float vv = dot(v, v);
    float vn = dot(v, N);
    float f = max(rad * rad - vv, 0.0) / (rad * rad);
    occ += f * max(vn - 0.02 * z * 0.01 - 0.01, 0.0) / (vv + 0.05 * rad * rad);
  }
  occ = occ * uIntensity * 2.0 / float(S);
  float fade = 1.0 - smoothstep(uMaxDist * 0.6, uMaxDist, z);
  float ao = clamp(1.0 - occ * fade, 0.0, 1.0);
  gl_FragColor = vec4(ao, z, 0.0, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tAO;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 c = texture2D(tAO, vUv).rg;
  float sum = c.r, w = 1.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      if (x == 0 && y == 0) continue;
      vec2 s = texture2D(tAO, vUv + vec2(float(x), float(y)) * uTexel).rg;
      float k = exp(-abs(s.g - c.g) / max(c.g * 0.04, 0.05)) * (1.0 - 0.12 * float(abs(x) + abs(y)));
      sum += s.r * k;
      w += k;
    }
  }
  float ao = sum / w;
  // aplicação: curva suave (preserva meios-tons)
  gl_FragColor = vec4(vec3(mix(1.0, ao, 0.9)), 1.0);
}`;

export class SSAOPass {
  constructor(ctx) {
    this.ctx = ctx;
    this.ao = makeTarget(1, 1, { name: 'exo.ao' });
    this.blur = makeTarget(1, 1, { name: 'exo.aoBlur' });
    this.uAO = {
      ...depthUniforms(ctx),
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uTan: { value: new THREE.Vector2(1, 1) },
      uProjScale: { value: 100 },
      uRadius: { value: 1.6 },
      uIntensity: { value: 1.2 },
      uMaxDist: { value: 450 },
      uFrame: { value: 0 },
    };
    this.mAO = fsMaterial(AO_FRAG, this.uAO);
    this.uBlur = { tAO: { value: this.ao.texture }, uTexel: { value: new THREE.Vector2() } };
    this.mBlur = fsMaterial(BLUR_FRAG, this.uBlur);
    this.mApply = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: this.blur.texture } },
      vertexShader: QUAD_VERT,
      fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }',
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
  }

  render(blit, target, cam) {
    const w = Math.max(1, target.width >> 1), h = Math.max(1, target.height >> 1);
    resizeTarget(this.ao, w, h);
    resizeTarget(this.blur, w, h);
    const u = this.uAO;
    u.tDepth.value = target.depthTexture;
    u.uTexel.value.set(1 / w, 1 / h);
    const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov * 0.5));
    u.uTan.value.set(tanY * cam.aspect, tanY);
    u.uProjScale.value = h / (2 * tanY);
    u.uFrame.value = this.ctx.shot ? 0 : this.ctx.time.frame % 64;
    blit.draw(this.mAO, this.ao);
    this.uBlur.uTexel.value.set(1 / w, 1 / h);
    blit.draw(this.mBlur, this.blur);
    blit.draw(this.mApply, target);
  }

  dispose() {
    this.ao.dispose();
    this.blur.dispose();
    this.mAO.dispose();
    this.mBlur.dispose();
    this.mApply.dispose();
  }
}
