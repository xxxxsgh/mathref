import * as THREE from 'three';
import { FINISHES } from './SkinCatalog.js';
import { WEAR_ZONES } from './Wear.js';
import { patternParams, wearNoiseOffset } from './PatternSystem.js';

/**
 * Material de skin: MeshStandardMaterial + shader procedural injetado.
 *
 * Por pixel, o shader:
 *   1. projeta a posição no espaço DA ARMA (não da peça), para o padrão
 *      atravessar as peças sem emenda;
 *   2. gera o padrão da skin (circuito, camuflagem, hexágonos…) já girado,
 *      deslocado e escalado pelo pattern seed;
 *   3. calcula o desgaste:
 *        wearIntensity = baseWear(float)
 *                      + ruído(seed único do item)
 *                      + surfaceWearMask(região de contato, quinas, gradiente)
 *      e com ele decide desbotamento, arranhões, perda de tinta (metal nu
 *      aparecendo), primer nas bordas da tinta e sujeira;
 *   4. troca metalness/roughness onde a tinta saiu — o metal nu brilha de
 *      verdade sob o mapa de ambiente.
 *
 * Todas as instâncias compartilham UM programa (customProgramCacheKey);
 * só os uniforms mudam por peça.
 */

const PATTERN_IDS = { solid: 0, circuit: 1, camo: 2, hex: 3, stripes: 4, digital: 5, fade: 6, pulse: 7, rupture: 8, tiger: 9 };

/**
 * Descrição de uma peça do modelo para o desgaste.
 * @typedef {Object} PartWear
 * @property {keyof typeof WEAR_ZONES} zone
 * @property {'base'|'accent'} [layer]
 * @property {0|1|2} [edgeMode]  0 nenhum, 1 caixa, 2 cilindro (eixo Y local)
 * @property {[number, number, number]} [half] meia-extensão da geometria
 * @property {number} [edgeWidth] largura da faixa de quina (m)
 * @property {[number, number, number]} [maskDir] gradiente de desgaste extra (espaço local)
 * @property {number} [maskBias]
 */

/**
 * @typedef {Object} SkinInstance
 * @property {import('./SkinCatalog.js').SkinDef} skin
 * @property {number} floatValue
 * @property {number} patternSeed
 * @property {number} wearSeed
 */

const GLSL_COMMON = /* glsl */ `
uniform float uFloat;
uniform vec3 uSeedOff;
uniform int uPattern;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uPatRot;
uniform vec2 uPatOff;
uniform float uPatScale;
uniform float uGrad;
uniform float uHue;
uniform float uGlow;
uniform int uLayer;
uniform float uPaintMetal;
uniform float uPaintRough;
uniform float uZone;
uniform int uEdgeMode;
uniform vec3 uHalf;
uniform float uEdgeW;
uniform vec3 uMaskDir;
uniform float uMaskBias;
uniform vec3 uDecal;
uniform float uScratchAng;
uniform float uWearOn;
varying vec3 vObjPos;
varying vec3 vWPos;
varying vec3 vWNormal;

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float h13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vn2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), f.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), f.x), f.y); }
float vn3(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f);
  float a = mix(mix(h13(i), h13(i+vec3(1,0,0)), f.x), mix(h13(i+vec3(0,1,0)), h13(i+vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(h13(i+vec3(0,0,1)), h13(i+vec3(1,0,1)), f.x), mix(h13(i+vec3(0,1,1)), h13(i+vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn3(p); p = p * 2.01 + 11.7; a *= 0.5; } return s / 0.9375; }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Voronoi: x = F1, y = F2
vec2 voro(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y)); vec2 o = h22(i + g); float d = length(g + o - f);
    if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; } }
  return vec2(d1, d2); }

// Padrão → rgb + máscara de brilho (a)
vec4 skinPattern(vec2 uv, vec3 wp){
  vec3 A = uColA, B = uColB, C = uColC;
  if (uLayer == 1){ vec3 t = A; A = B * 0.85; B = t; }
  vec2 p = rot2(uPatRot) * uv * uPatScale + uPatOff;
  if (uPattern == 1){ // circuit
    vec2 g = p * 7.0; vec2 id = floor(g); vec2 f = fract(g);
    float r1 = h12(id + 3.1), r2 = h12(id + 7.7), r3 = h12(id + 1.3);
    float w = 0.07;
    float lh = step(0.35, r1) * (1.0 - smoothstep(w, w + 0.03, abs(f.y - 0.5)));
    float lv = step(0.55, r2) * (1.0 - smoothstep(w, w + 0.03, abs(f.x - 0.5)));
    float pad = step(0.72, r3) * (1.0 - smoothstep(0.14, 0.18, length(f - 0.5)));
    float trace = max(max(lh, lv), pad);
    vec3 bg = A * (0.85 + 0.3 * fbm2(p * 3.0));
    vec3 col = mix(bg, B, trace);
    col = mix(col, C, pad);
    return vec4(col, trace * 0.6 + pad);
  } else if (uPattern == 2){ // camo
    vec2 q = p * 2.2 + vec2(fbm2(p * 1.3), fbm2(p * 1.3 + 5.2)) * 1.4;
    float v = fbm2(q);
    vec3 col = A;
    col = mix(col, B, smoothstep(0.46 + uHue * 0.04, 0.49 + uHue * 0.04, v));
    col = mix(col, C, smoothstep(0.6, 0.63, v));
    return vec4(col, 0.0);
  } else if (uPattern == 3){ // hex
    vec2 g = p * 6.0;
    vec2 r = vec2(1.0, 1.7320508); vec2 hh = r * 0.5;
    vec2 a = mod(g, r) - hh; vec2 b = mod(g - hh, r) - hh;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = g - gv;
    vec2 ap = abs(gv); float edge = max(dot(ap, normalize(vec2(1.0, 1.7320508))), ap.x);
    float border = smoothstep(0.42, 0.47, edge);
    float rid = h12(floor(id * 10.0));
    vec3 cell = rid > 0.62 + uHue * 0.08 ? B : A * (0.8 + 0.4 * rid);
    vec3 col = mix(cell, C, border);
    return vec4(col, border * 0.8 + step(0.9, rid) * 0.5);
  } else if (uPattern == 4){ // stripes
    float w = fbm2(p * 1.4);
    float v = sin((p.x + w * 1.6) * 7.0);
    vec3 col = mix(A, B, smoothstep(0.35, 0.45, v));
    float hl = 1.0 - smoothstep(0.0, 0.06, abs(v - 0.9));
    col = mix(col, C, hl);
    return vec4(col, hl);
  } else if (uPattern == 5){ // digital
    vec2 q = floor(p * 14.0) / 14.0;
    float v = fbm2(q * 2.5);
    float v2 = vn2(floor(p * 28.0));
    vec3 col = A;
    col = mix(col, B, step(0.48 + uHue * 0.04, v));
    col = mix(col, C, step(0.63, v) * step(0.35, v2));
    return vec4(col, 0.0);
  } else if (uPattern == 6){ // fade (ao longo do comprimento da arma)
    float t = clamp((-wp.z) * 2.4 + 0.15 + (uGrad - 0.5) * 0.9, 0.0, 1.0);
    vec3 col = t < 0.5 ? mix(A, B, smoothstep(0.0, 0.5, t)) : mix(B, C, smoothstep(0.5, 1.0, t));
    return vec4(col, smoothstep(0.7, 1.0, t));
  } else if (uPattern == 7){ // pulse (domain warp)
    vec2 q = vec2(fbm2(p * 1.6), fbm2(p * 1.6 + 4.7));
    float r = fbm2(p * 1.6 + q * 3.0 + uHue);
    vec3 col = mix(A, B, smoothstep(0.45, 0.8, r));
    float vein = 1.0 - smoothstep(0.0, 0.025, abs(r - 0.58));
    col = mix(col, C, vein);
    return vec4(col, vein + smoothstep(0.7, 0.9, r) * 0.4);
  } else if (uPattern == 8){ // rupture (fissuras de voronoi)
    vec2 v = voro(p * 3.2 + vec2(fbm2(p * 2.0)) * 0.6);
    float crack = 1.0 - smoothstep(0.0, 0.07, v.y - v.x);
    float core = 1.0 - smoothstep(0.0, 0.025, v.y - v.x);
    vec3 col = A * (0.7 + 0.6 * fbm2(p * 4.0));
    col = mix(col, B, crack);
    col = mix(col, C, core);
    return vec4(col, crack * 0.8 + core);
  } else if (uPattern == 9){ // tiger
    float w = fbm2(p * vec2(1.0, 2.5));
    float v = sin((p.x * 1.2 + w * 2.2) * 6.0 + p.y * 0.7);
    float taper = smoothstep(0.15, 0.85, fbm2(p * 0.8 + 3.3));
    float stripe = smoothstep(0.55 - taper * 0.25, 0.62 - taper * 0.25, v);
    vec3 col = mix(A, B, smoothstep(0.3, 0.7, fbm2(p * 0.7)) * 0.55);
    col = mix(col, C, stripe);
    return vec4(col, 0.0);
  }
  // solid: tom base com leve degradê e um friso fino na posição do seed
  float t = clamp((-wp.z) * 1.8 + 0.5, 0.0, 1.0);
  vec3 col = mix(A, A * 0.82 + B * 0.18, t);
  float band = 1.0 - smoothstep(0.004, 0.007, abs(wp.y - (uGrad - 0.5) * 0.04));
  col = mix(col, C, band * 0.6);
  return vec4(col, 0.0);
}

float scratchLayer(vec2 uv, float ang, float density, float seed){
  vec2 r = rot2(ang) * uv;
  float n = vn2(vec2(r.x * 4.0, r.y * 160.0) + seed);
  float line = 1.0 - smoothstep(0.0, 0.035, abs(n - 0.5));
  float seg = smoothstep(1.0 - density, 1.0 - density + 0.12, vn2(r * vec2(9.0, 30.0) + seed * 1.7));
  return line * seg;
}
`;

/**
 * Cria o material de uma peça.
 * @param {SkinInstance} inst
 * @param {PartWear} part
 */
export function createSkinMaterial(inst, part) {
  const { skin, floatValue, patternSeed, wearSeed } = inst;
  const layer = part.layer || 'base';
  const fin = FINISHES[layer === 'accent' ? skin.accentMaterial : skin.baseMaterial];
  const pp = patternParams(skin.id, skin.pattern, patternSeed);
  const off = wearNoiseOffset(wearSeed);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: fin.metal, roughness: fin.rough });
  const uniforms = {
    uFloat: { value: floatValue },
    uSeedOff: { value: new THREE.Vector3(...off) },
    uPattern: { value: PATTERN_IDS[skin.pattern] ?? 0 },
    uColA: { value: new THREE.Color(skin.base) },
    uColB: { value: new THREE.Color(skin.accent) },
    uColC: { value: new THREE.Color(skin.detail) },
    uPatRot: { value: pp.rotation },
    uPatOff: { value: new THREE.Vector2(pp.offsetX, pp.offsetY) },
    uPatScale: { value: pp.scale },
    uGrad: { value: pp.gradient },
    uHue: { value: pp.hueShift },
    uGlow: { value: skin.glow },
    uLayer: { value: layer === 'accent' ? 1 : 0 },
    uPaintMetal: { value: fin.metal },
    uPaintRough: { value: fin.rough },
    uZone: { value: WEAR_ZONES[part.zone] ?? 0.2 },
    uEdgeMode: { value: part.edgeMode || 0 },
    uHalf: { value: new THREE.Vector3(...(part.half || [1, 1, 1])) },
    uEdgeW: { value: part.edgeWidth ?? 0.006 },
    uMaskDir: { value: new THREE.Vector3(...(part.maskDir || [0, 0, 0])) },
    uMaskBias: { value: part.maskBias ?? 0 },
    uDecal: { value: new THREE.Vector3(pp.decalX, pp.decalY, layer === 'base' ? pp.decalSize : 0) },
    uScratchAng: { value: pp.scratchAngle },
    uWearOn: { value: 1 },
    uPartMatrix: { value: new THREE.Matrix4() },
  };
  mat.userData.skinUniforms = uniforms;
  mat.customProgramCacheKey = () => 'np-skin-v1';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat4 uPartMatrix;
varying vec3 vObjPos;
varying vec3 vWPos;
varying vec3 vWNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vObjPos = position;
vWPos = (uPartMatrix * vec4(position, 1.0)).xyz;
vWNormal = normalize(mat3(uPartMatrix) * normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
// ── projeção no espaço da arma: escolhe o plano pela normal dominante ──
vec3 an = abs(vWNormal);
vec2 suv = an.x >= an.y && an.x >= an.z ? vWPos.zy : (an.y >= an.z ? vWPos.zx : vWPos.xy);
vec4 pat = skinPattern(suv * 6.0, vWPos);
vec3 paint = pat.rgb;

// decalque (losango) definido pelo pattern seed, só nas laterais
if (uDecal.z > 0.0 && an.x > 0.8){
  vec2 dq = abs(vWPos.zy - vec2(-uDecal.x, uDecal.y)) / uDecal.z;
  float dm = 1.0 - smoothstep(0.92, 1.0, dq.x + dq.y);
  float dr = 1.0 - smoothstep(0.55, 0.62, dq.x + dq.y);
  paint = mix(paint, uColC, dm);
  paint = mix(paint, uColB, dr * dm);
}

// ── máscara de superfície: região + quinas + gradiente ──
float edgeF = 0.0;
if (uEdgeMode == 1){
  vec3 q = abs(vObjPos) / max(uHalf, vec3(1e-4));
  vec3 e0 = 1.0 - clamp(vec3(uEdgeW) / max(uHalf, vec3(1e-4)), 0.0, 0.95);
  vec3 nearF = smoothstep(e0, vec3(1.0), q);
  edgeF = clamp(nearF.x + nearF.y + nearF.z - 1.0, 0.0, 1.0);
} else if (uEdgeMode == 2){
  float rr = length(vObjPos.xz) / max(uHalf.x, 1e-4);
  float yy = abs(vObjPos.y) / max(uHalf.y, 1e-4);
  float nr = smoothstep(1.0 - uEdgeW / uHalf.x, 1.0, rr);
  float ny = smoothstep(1.0 - uEdgeW / uHalf.y, 1.0, yy);
  edgeF = clamp(nr * ny * 1.6, 0.0, 1.0);
}
float gradM = clamp(dot(vObjPos, uMaskDir) + uMaskBias, 0.0, 1.0);
float surfaceWearMask = max(uZone, edgeF * 1.25) + gradM * 0.55;

// ── intensidade de desgaste ──
float nW = fbm3(vWPos * 34.0 + uSeedOff);
float nBig = fbm3(vWPos * 9.0 + uSeedOff * 1.3);
float baseWear = pow(uFloat, 0.8);
float wearIntensity = baseWear * (0.25 + 0.95 * surfaceWearMask) + (nW * 0.6 + nBig * 0.4 - 0.5) * (0.36 + 0.8 * uFloat);
wearIntensity *= uWearOn;

float loss = smoothstep(0.55, 0.62, wearIntensity);
float primer = smoothstep(0.44, 0.55, wearIntensity) * (1.0 - loss);

// arranhões: densidade e alcance crescem com o float; mais nas áreas de contato
float sDen = clamp(uFloat * 1.1 + surfaceWearMask * uFloat * 0.5, 0.0, 0.75);
float sc = max(scratchLayer(suv * 9.0, uScratchAng, sDen, uSeedOff.x),
               scratchLayer(suv * 9.0, uScratchAng + 1.1, sDen * 0.7, uSeedOff.y));
sc *= smoothstep(0.035, 0.2, uFloat) * uWearOn;

// desbotamento: dessatura e clareia levemente
float luma = dot(paint, vec3(0.299, 0.587, 0.114));
float fade = clamp(uFloat * (0.3 + 0.35 * surfaceWearMask), 0.0, 0.55) * uWearOn;
paint = mix(paint, vec3(luma) * 1.04 + 0.025, fade);

// sujeira acumulada nas reentrâncias do ruído (só desgastes altos)
float grime = smoothstep(0.55, 0.8, fbm3(vWPos * 14.0 + uSeedOff.zxy)) * smoothstep(0.3, 0.9, uFloat) * uWearOn;
paint = mix(paint, paint * vec3(0.52, 0.47, 0.42), grime * 0.65);
paint = mix(paint, vec3(0.16, 0.16, 0.17), primer * 0.5);

// metal nu: aço com variação, oxidando nos desgastes mais altos
vec3 bare = mix(vec3(0.56, 0.57, 0.59), vec3(0.36, 0.34, 0.32), nBig * uFloat * 0.8);
// arranhão leve = tinta riscada (clareia); forte = chega ao metal
float scuff = sc * (0.3 + 0.6 * uFloat) * (0.55 + 0.45 * clamp(surfaceWearMask, 0.0, 1.0));
paint = mix(paint, paint * 1.25 + 0.06, sc * (1.0 - uFloat) * 0.35);
float metalMix = clamp(loss + scuff, 0.0, 1.0);
diffuseColor.rgb = mix(paint, bare, metalMix);
float skinRough = mix(uPaintRough + uFloat * 0.22 + grime * 0.2, 0.26 + nW * 0.18, metalMix);
float skinMetal = mix(uPaintMetal, 1.0, metalMix);
vec3 skinEmissive = paint * pat.a * uGlow * (1.0 - metalMix) * (1.0 - uFloat * 0.6);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(skinRough, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = skinMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += skinEmissive;');
  };
  return mat;
}

/**
 * Atualiza a matriz peça→arma de todas as peças com skin de um modelo.
 * Chamar depois de montar a hierarquia (e não a cada frame: a hierarquia
 * interna da arma é rígida, só a raiz se move).
 * @param {THREE.Object3D} root
 */
export function bakePartMatrices(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((o) => {
    const m = /** @type {any} */ (o).material;
    if (m && m.userData && m.userData.skinUniforms) {
      m.userData.skinUniforms.uPartMatrix.value.multiplyMatrices(inv, o.matrixWorld);
    }
  });
}
