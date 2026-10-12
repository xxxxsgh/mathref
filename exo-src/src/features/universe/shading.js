/**
 * ILUMINAÇÃO PRÓPRIA dos objetos do universo (asteroides, estação).
 *
 * Os corpos e objetos do espaço usam ShaderMaterial com as MESMAS luzes do
 * céu (sky.suns: até 2 sóis) passadas como uniformes compartilhadas, em vez
 * das luzes do three: são independentes das sombras em cascata do `render`
 * (pensadas para o chão — longe do planeta elas não cobrem nada) e mais
 * baratas no espaço. Modelo: Lambert com "wrap" leve + especular
 * normalizado (Blinn-Phong ≈ GGX), ambiente do céu estelar, borda.
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

/** Uniformes de luz compartilhadas (atualizadas uma vez por frame pelo universe). */
export const LIGHTS = {
  uSunDir: { value: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)] },
  uSunCol: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uAmb: { value: new THREE.Vector3(0.012, 0.015, 0.022) },
};

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 color;
varying vec3 vCol;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vLocal;
varying vec2 vUv2;
varying float vScale;
void main() {
  mat4 m = modelMatrix;
  vec3 col = vec3(1.0);
  #ifdef USE_VCOLOR
  col = color;
  #endif
  #ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  #endif
  #ifdef USE_INSTANCING_COLOR
  col *= instanceColor;
  #endif
  vCol = col;
  vLocal = position;
  vUv2 = uv;
  vScale = length(m[0].xyz);
  vec4 wp = m * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];
uniform vec3 uAmb;
uniform vec3 uColor;
uniform float uRough;
uniform float uMetal;
uniform float uBump;
uniform vec3 uEmis;
#ifdef USE_MAP
uniform sampler2D uMap;
uniform vec2 uMapRepeat;
#endif
#ifdef USE_EMISMAP
uniform sampler2D uEmisMap;
uniform vec2 uEmisRepeat;
#endif
varying vec3 vCol;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vLocal;
varying vec2 vUv2;
varying float vScale;
${NOISE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  if (dot(N, V) < 0.0 && !gl_FrontFacing) N = -N;
  vec3 albedo = uColor * vCol;
  #ifdef USE_MAP
  albedo *= texture2D(uMap, vUv2 * uMapRepeat).rgb;
  #endif
  #ifdef USE_ROCK
  {
    vec3 rp = vLocal * 5.0;
    float m1 = snoise(vLocal * 1.7 + 11.0);
    float m2 = snoise(vLocal * 11.0 - 3.0);
    float strata = 0.5 + 0.5 * sin(dot(vLocal, vec3(7.0, 13.0, 3.0)) + m1 * 4.0);
    albedo *= 0.84 + 0.18 * m1 + 0.08 * m2 + 0.08 * strata;
    // relevo fino por derivadas de tela (amplitude em fração do tamanho)
    float bh = snoise(rp) * 0.5 + abs(snoise(rp * 2.9)) * 0.3 + snoise(rp * 8.3) * 0.08;
    vec3 dpx = dFdx(vWorldPos), dpy = dFdy(vWorldPos);
    float hx = dFdx(bh), hy = dFdy(bh);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
    float det = dot(dpx, r1);
    vec3 gr = sign(det) * (hx * r1 + hy * r2);
    N = normalize(abs(det) * N - gr * vScale * uBump);
  }
  #endif
  float rough = uRough;
  float a = rough * rough;
  float shin = 2.0 / max(1e-3, a * a) - 2.0;
  vec3 F0 = mix(vec3(0.04), albedo, uMetal);
  vec3 diffC = albedo * (1.0 - uMetal);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-8) continue;
    vec3 L = uSunDir[i];
    float NL = dot(N, L);
    float diff = max(0.0, NL * 0.92 + 0.08) * smoothstep(-0.08, 0.1, NL);
    vec3 H = normalize(L + V);
    float NH = max(dot(N, H), 0.0);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    float spec = (shin + 8.0) / 25.13 * pow(NH, shin) * max(NL, 0.0);
    col += (diffC / 3.14159 * diff + F * spec * 0.25) * E;
  }
  // ambiente: céu estelar + leve "luz de preenchimento" de baixo
  float hemi = 0.65 + 0.35 * N.y;
  col += diffC * uAmb * hemi;
  // borda (atmosfera/poeira iluminada) para separar do fundo
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += albedo * uAmb * rim * 3.0;
  vec3 em = uEmis;
  #ifdef USE_EMISMAP
  em *= texture2D(uEmisMap, vUv2 * uEmisRepeat).rgb;
  #endif
  col += em;
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Material com a iluminação do universo.
 * opts: { color, rough, metal, bump, rock, instanced, vertexColors, map, mapRepeat, emissive, emissiveMap, emissiveRepeat }
 */
export function spaceMaterial(opts = {}) {
  const defines = {};
  if (opts.vertexColors) defines.USE_VCOLOR = '';
  if (opts.rock) defines.USE_ROCK = '';
  if (opts.map) defines.USE_MAP = '';
  if (opts.emissiveMap) defines.USE_EMISMAP = '';
  const c = new THREE.Color(opts.color ?? 0xffffff);
  const e = new THREE.Color(opts.emissive ?? 0x000000);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    uniforms: {
      ...LIGHTS,
      uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
      uRough: { value: opts.rough ?? 0.85 },
      uMetal: { value: opts.metal ?? 0 },
      uBump: { value: opts.bump ?? 0.09 },
      uEmis: { value: new THREE.Vector3(e.r, e.g, e.b).multiplyScalar(opts.emissiveIntensity ?? 1) },
      uMap: { value: opts.map || null },
      uMapRepeat: { value: new THREE.Vector2(...(opts.mapRepeat || [1, 1])) },
      uEmisMap: { value: opts.emissiveMap || null },
      uEmisRepeat: { value: new THREE.Vector2(...(opts.emissiveRepeat || [1, 1])) },
    },
    side: opts.side ?? THREE.FrontSide,
  });
  return mat;
}

const _c = new THREE.Vector3();
/** Atualiza as luzes compartilhadas a partir do `sky` e das estrelas do sistema. */
export function updateLights(ctx, stars, ambientK = 1) {
  const sky = ctx.services.sky;
  const suns = sky?.suns || [];
  for (let i = 0; i < 2; i++) {
    const st = stars[i];
    const dir = suns[i]?.direction || (i === 0 ? sky?.sunDirection : null);
    if (st && dir) {
      LIGHTS.uSunDir.value[i].copy(dir).normalize();
      const E = 3.4 * (st.intensity ?? 1);
      LIGHTS.uSunCol.value[i].set(st.color[0] * E, st.color[1] * E, st.color[2] * E);
    } else LIGHTS.uSunCol.value[i].set(0, 0, 0);
  }
  // ambiente tingido pela estrela principal (muito fraco)
  const s0 = stars[0]?.color || [1, 1, 1];
  _c.set(0.5 + 0.5 * s0[0], 0.55 + 0.5 * s0[1], 0.75 + 0.5 * s0[2]).multiplyScalar(0.016 * ambientK);
  LIGHTS.uAmb.value.copy(_c);
}
