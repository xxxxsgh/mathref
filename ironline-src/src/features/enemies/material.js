/**
 * Material único do soldado (1 draw call por soldado + sombra).
 *
 * Cada vértice carrega:
 *   color  — cor base (linear)
 *   aSurf  — x rugosidade, y metalicidade, z quanto de camuflagem, w tipo de
 *            superfície (0 liso/polímero, 0.5 couro/borracha, 1 tecido)
 *   aAO    — oclusão ambiente assada (voxels) no modelo de repouso
 *
 * O fragment shader amostra as texturas em triplanar no espaço de repouso
 * (atributo `position`, antes do skinning), compõe a camuflagem, sujeira de
 * campo (mais forte perto do chão: botas e barras da calça), rugas de tecido
 * e trama via bump por derivadas de tela.
 */
import * as THREE from 'three';
import { camoTexture, detailTexture } from './textures.js';

let shared = null;
function textures() {
  if (!shared) shared = { camo: camoTexture(256), detail: detailTexture(256) };
  return shared;
}

/** paletas de camuflagem (sRGB) — 4 tons: fundo + 3 manchas */
export const CAMO = {
  // verde/marrom multi-terreno
  woodland: ['#55573f', '#3b3e2c', '#6b5e45', '#24251e'],
  // árido (areia/caqui)
  arid: ['#8f8068', '#6f6450', '#a39275', '#4a4236'],
  // urbano cinza-oliva
  urban: ['#55574f', '#3e403b', '#6c6d66', '#262723'],
};

export function createSoldierMaterial({ camo = CAMO.woodland, dust = '#8a7a63' } = {}) {
  const tex = textures();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  const col = (h) => new THREE.Color(h);
  const uniforms = {
    uCamoTex: { value: tex.camo },
    uDetailTex: { value: tex.detail },
    uCamo0: { value: col(camo[0]) },
    uCamo1: { value: col(camo[1]) },
    uCamo2: { value: col(camo[2]) },
    uCamo3: { value: col(camo[3]) },
    uDust: { value: col(dust) },
    uWet: { value: 0 },
    uFill: { value: new THREE.Color(0.34, 0.35, 0.37) },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aSurf;
attribute float aAO;
varying vec4 vSurf;
varying float vAO;
varying vec3 vRest;
varying vec3 vRestN;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRest = position;
vRestN = normal;
vSurf = aSurf;
vAO = aAO;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uCamoTex;
uniform sampler2D uDetailTex;
uniform vec3 uCamo0, uCamo1, uCamo2, uCamo3, uDust, uFill;
varying vec4 vSurf;
varying float vAO;
varying vec3 vRest;
varying vec3 vRestN;
vec3 triW() {
  vec3 w = pow(abs(normalize(vRestN)), vec3(4.0));
  return w / (w.x + w.y + w.z + 1e-5);
}
vec4 tri(sampler2D t, float s, vec3 w) {
  vec3 p = vRest * s;
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}
// gradiente de superfície (Mikkelsen) — altura em METROS, independe da distância
vec3 bumpN(vec3 pos, vec3 N, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  if (abs(det) < 1e-12) return N;
  vec3 g = (hx * r1 + hy * r2) / det;
  return normalize(N - g);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 tw = triW();
vec4 cm = tri(uCamoTex, 3.3, tw);
vec4 dtl = tri(uDetailTex, 2.4, tw);      // rugas (G) e manchas (A)
vec4 dtf = tri(uDetailTex, 18.0, tw);     // trama (R) e granulado (B)
float isGun = step(vSurf.w, -0.5);
float fabric = max(vSurf.w, 0.0);
float camoAmt = vSurf.z;
vec3 camo = uCamo0;
camo = mix(camo, uCamo1, cm.r);
camo = mix(camo, uCamo2, cm.g);
camo = mix(camo, uCamo3, cm.b);
diffuseColor.rgb = mix(diffuseColor.rgb, camo * diffuseColor.rgb, camoAmt);
// variação de tingimento/desbotamento do tecido
float fade = (dtl.a - 0.5) * 0.18 * step(0.75, fabric);
diffuseColor.rgb *= 1.0 + fade;
// desbotado pelo sol em superfícies voltadas para cima
diffuseColor.rgb *= 1.0 + 0.08 * clamp(normalize(vRestN).y, 0.0, 1.0) * fabric;
// trama escurece levemente os sulcos
diffuseColor.rgb *= mix(1.0, 0.9 + 0.12 * dtf.r, fabric);
// poeira/terra: forte nas botas e barras, manchas no resto
float low = 1.0 - smoothstep(0.05, 0.75, vRest.y);
float dirt = clamp(low * (0.45 + 0.7 * dtl.a) + (dtl.a - 0.68) * 0.6, 0.0, 1.0) * (1.0 - vSurf.y * 0.7);
dirt *= mix(0.3, 1.0, fabric) * (1.0 - isGun * 0.85);
diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (0.8 + 0.3 * dtl.a), dirt * 0.5);
diffuseColor.rgb *= mix(1.0, vAO, 0.35) * 1.3;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = clamp(vSurf.x + (dtf.b - 0.5) * 0.12 + dirt * 0.25, 0.04, 1.0);`,
      )
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = vSurf.y * (1.0 - dirt * 0.6);`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // alturas em metros: dobras de tecido (~5 mm), trama (~0.1 mm), granulado
  float isFab = smoothstep(0.6, 1.0, fabric);
  float isLeather = 1.0 - abs(fabric - 0.5) * 2.0;
  float h = isFab * (dtl.g * 0.0055 + dtf.r * 0.00012)
          + isLeather * dtf.b * 0.0004
          + (1.0 - isFab) * (1.0 - isLeather) * dtf.b * 0.00008;
  normal = bumpN(-vViewPosition, normal, h);
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  // "fuzz" de tecido: borda clara contra o céu (lê bem contra a luz)
  float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.0) * smoothstep(0.5, 1.0, fabric) * 0.5;
  outgoingLight += rim * reflectedLight.indirectDiffuse;
  // luz de preenchimento de personagem (alinhada à câmera, fraca): mantém
  // a leitura de silhueta/volume em interiores e contra o sol
  outgoingLight += diffuseColor.rgb * uFill * (0.3 + 0.7 * nv) * vAO;
}
#include <opaque_fragment>`,
      )
      .replace(
        '#include <aomap_fragment>',
        `{
  float ao = vAO;
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.indirectSpecular *= ao * ao;
  reflectedLight.directDiffuse *= mix(1.0, ao, 0.35);
  reflectedLight.directSpecular *= ao;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'ironline-soldier-v3';
  return mat;
}
