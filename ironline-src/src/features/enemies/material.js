/**
 * Material único do soldado (1 draw call por soldado + sombra).
 *
 * Cada vértice carrega:
 *   color  — cor base (linear)
 *   aSurf  — x rugosidade, y metalicidade, z quanto de camuflagem, w CLASSE
 *            de superfície:
 *              < -0.5      arma (polímero/metal, sem sujeira de campo)
 *              0.00–0.40   duro (polímero, plástico, metal do equipamento)
 *              0.40–0.65   couro/borracha/pele (granulado fino)
 *              0.65–0.78   cordura lisa (trama grossa, brilho leve)
 *              0.78–0.90   cordura com MOLLE (fileiras de fita costurada)
 *              ≥ 0.95      tecido de uniforme (ripstop + rugas + camuflagem)
 *   aAO    — oclusão ambiente assada (voxels) no modelo de repouso
 *
 * O fragment shader amostra as texturas em triplanar no espaço de REPOUSO
 * (atributo `position`, antes do skinning) — a estampa fica grudada no corpo
 * — e compõe: camuflagem com granulado de impressão, trama ripstop, rugas,
 * fitas MOLLE com costuras de reforço (bartacks), desgaste de borda da
 * cordura, sujeira de campo (forte nas botas/barras), e bump por derivadas.
 *
 * Luz: nada de "auto-iluminação". Só dois termos físicos extras e fracos:
 *   - contraluz do sol (rim) — tecido com fibras soltas espalha a luz rasante
 *     e separa a silhueta do fundo; atenuado pela AO assada;
 *   - rebatimento do chão (luz que sobe do asfalto ensolarado) em superfícies
 *     voltadas para baixo — o rosto sob a aba do capacete não vira um buraco.
 * A direção/cor do sol vem de `services.world.sun` (ver `updateSoldierLighting`).
 */
import * as THREE from 'three';
import { camoTexture, detailTexture } from './textures.js';

let shared = null;
function textures() {
  if (!shared) shared = { camo: camoTexture(512), detail: detailTexture(512) };
  return shared;
}

/** uniforms de luz compartilhados por todas as variantes */
const LIGHT = {
  uSunV: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, // direção PARA o sol, espaço de vista
  uSunCol: { value: new THREE.Color(3, 2.8, 2.5) },
  uUpV: { value: new THREE.Vector3(0, 1, 0) },
  uBounce: { value: new THREE.Color(0.16, 0.13, 0.1) },
};

/** paletas de camuflagem (sRGB) — 4 tons: fundo + 3 manchas */
export const CAMO = {
  // verde/marrom multi-terreno (contraste moderado, como tecido real)
  woodland: ['#5d5b43', '#434830', '#6b5b41', '#27251d'],
  // árido multi-terreno (areia, oliva, claro e "galhos" escuros)
  arid: ['#8b7b5e', '#6b6747', '#a28f6f', '#463a2a'],
  // urbano cinza-oliva
  urban: ['#585a52', '#3e403a', '#6c6d66', '#252621'],
};

/** Atualiza direção/cor do sol nos uniforms (uma vez por frame). */
const _d = new THREE.Vector3();
export function updateSoldierLighting(ctx) {
  const cam = ctx.camera;
  const sun = ctx.services.world?.sun;
  if (sun?.isDirectionalLight) {
    _d.copy(sun.position);
    if (sun.target) _d.sub(sun.target.position);
    if (_d.lengthSq() < 1e-8) _d.set(0.3, 0.8, 0.5);
    _d.normalize();
    LIGHT.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity);
    // rebatimento: ~asfalto (albedo ~0.12) iluminado pelo sol, cosseno médio
    const k = 0.12 * Math.max(0, _d.y) / Math.PI;
    LIGHT.uBounce.value.copy(sun.color).multiplyScalar(sun.intensity * k).multiply(_warm);
  } else _d.set(0.3, 0.8, 0.5).normalize();
  LIGHT.uSunV.value.copy(_d).transformDirection(cam.matrixWorldInverse);
  LIGHT.uUpV.value.set(0, 1, 0).transformDirection(cam.matrixWorldInverse);
}
const _warm = new THREE.Color(1.0, 0.9, 0.78);

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
    ...LIGHT,
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
uniform vec3 uCamo0, uCamo1, uCamo2, uCamo3, uDust;
uniform vec3 uSunV, uSunCol, uUpV, uBounce;
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
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 tw = triW();
vec3 nR = normalize(vRestN);
vec4 cm = tri(uCamoTex, 3.1, tw);
vec4 dtl = tri(uDetailTex, 2.4, tw);      // rugas (G) e manchas (A)
vec4 dtf = tri(uDetailTex, 15.0, tw);     // trama ripstop (R) e granulado (B)
vec4 dtc = tri(uDetailTex, 7.0, tw);      // trama grossa da cordura (R)
float w = vSurf.w;
float isGun = step(w, -0.5);
float isCloth = step(0.95, w);
float isCord = step(0.65, w) * (1.0 - step(0.9, w));
float isMolle = isCord * step(0.78, w);
float isLeather = step(0.4, w) * (1.0 - step(0.65, w));
float isHard = (1.0 - isGun) * (1.0 - isCloth) * (1.0 - isCord) * (1.0 - isLeather);
float camoAmt = vSurf.z;
// camuflagem: manchas + granulado de impressão (pixels de tinta nas bordas)
float pg = (dtf.b - 0.5) * 0.35;
vec3 camo = uCamo0;
camo = mix(camo, uCamo1, clamp(cm.r + pg * cm.r * (1.0 - cm.r) * 4.0, 0.0, 1.0));
camo = mix(camo, uCamo2, clamp(cm.g + pg * cm.g * (1.0 - cm.g) * 4.0, 0.0, 1.0));
camo = mix(camo, uCamo3, cm.b);
diffuseColor.rgb = mix(diffuseColor.rgb, camo * diffuseColor.rgb, camoAmt);
// tecido: tingimento irregular, desbotado pelo sol no alto, trama ripstop
float fade = (dtl.a - 0.5) * 0.2;
diffuseColor.rgb *= 1.0 + fade * (isCloth + isCord * 0.6);
diffuseColor.rgb *= 1.0 + 0.1 * clamp(nR.y, 0.0, 1.0) * (isCloth + isCord);
diffuseColor.rgb *= mix(1.0, 0.82 + 0.26 * dtf.r, isCloth);
// cordura: trama grossa visível e leve variação de lote
diffuseColor.rgb *= mix(1.0, 0.86 + 0.22 * dtc.r, isCord);
// MOLLE: fitas de 25 mm a cada 38 mm, costuradas a cada 38 mm (bartacks)
float mol = 0.0, sewn = 0.0;
{
  float vert = 1.0 - smoothstep(0.55, 0.8, abs(nR.y));
  float my = fract(vRest.y / 0.0381 + 0.13);
  float band = smoothstep(0.0, 0.06, my) * (1.0 - smoothstep(0.6, 0.68, my));
  float u = abs(nR.z) > abs(nR.x) ? vRest.x : vRest.z;
  float cu = abs(fract(u / 0.0381) - 0.5);
  sewn = (1.0 - smoothstep(0.035, 0.07, cu)) * band;
  mol = band * vert * isMolle;
  sewn *= vert * isMolle;
  // sombra no vão entre as fitas, fita um pouco mais escura que o painel
  diffuseColor.rgb *= mix(1.0, 0.72, vert * isMolle * (1.0 - band));
  diffuseColor.rgb *= 1.0 - 0.06 * mol - 0.3 * sewn;
}
// desgaste: cordura e borracha clareiam/acinzentam em manchas
float wear = smoothstep(0.62, 0.9, dtl.a + (dtc.b - 0.5) * 0.4) * (isCord + isLeather * 0.6);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + 0.015, wear * 0.5);
// couro/borracha: vincos escurecidos
diffuseColor.rgb *= mix(1.0, 0.85 + 0.3 * dtl.g, isLeather * 0.5);
// poeira/terra: forte nas botas e barras, manchas no resto
float low = 1.0 - smoothstep(0.05, 0.7, vRest.y);
float dirt = clamp(low * (0.45 + 0.7 * dtl.a) + (dtl.a - 0.66) * 0.7, 0.0, 1.0) * (1.0 - vSurf.y * 0.7);
dirt *= mix(0.25, 1.0, isCloth + isCord) * (1.0 - isGun * 0.85);
diffuseColor.rgb = mix(diffuseColor.rgb, uDust * (0.75 + 0.35 * dtl.a), dirt * 0.45);
diffuseColor.rgb *= mix(1.0, vAO, 0.4);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = clamp(vSurf.x + (dtf.b - 0.5) * 0.14 + dirt * 0.22 - wear * 0.08 - isCord * 0.06 * dtc.r, 0.04, 1.0);`,
      )
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = vSurf.y * (1.0 - dirt * 0.6);`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // alturas em metros: dobras de tecido (~6 mm), trama, granulados, MOLLE
  float h = isCloth * (dtl.g * 0.006 + dtf.r * 0.00016)
          + isCord * (dtc.r * 0.00035 + dtl.g * 0.0015 + mol * 0.0016 - sewn * 0.001)
          + isLeather * (dtf.b * 0.00045 + dtl.g * 0.0009)
          + isHard * dtf.b * 0.00008;
  normal = bumpN(-vViewPosition, normal, h);
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 Vv = normalize(vViewPosition);
  float nv = clamp(dot(normal, Vv), 0.0, 1.0);
  float fuzz = isCloth + isCord * 0.6 + isLeather * 0.25;
  // contraluz do sol: forte quando o sol está atrás do soldado
  float back = clamp(dot(-Vv, uSunV) * 0.55 + 0.45, 0.0, 1.0);
  float wrapL = clamp(dot(normal, uSunV) + 0.25, 0.0, 1.0);
  float rim = pow(1.0 - nv, 3.5) * wrapL * back;
  outgoingLight += rim * uSunCol * diffuseColor.rgb * (0.025 + 0.07 * fuzz) * vAO;
  // fibras soltas do tecido sob luz ambiente (borda clara contra o céu)
  outgoingLight += pow(1.0 - nv, 3.0) * fuzz * 0.18 * reflectedLight.indirectDiffuse;
  // rebatimento quente do chão em superfícies voltadas para baixo
  float down = clamp(-dot(normal, uUpV) * 0.7 + 0.3, 0.0, 1.0);
  outgoingLight += diffuseColor.rgb * uBounce * down * vAO;
}
#include <opaque_fragment>`,
      )
      .replace(
        '#include <aomap_fragment>',
        `{
  float ao = vAO;
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.indirectSpecular *= ao * ao;
  reflectedLight.directDiffuse *= mix(1.0, ao, 0.3);
  reflectedLight.directSpecular *= ao;
}`,
      );
  };
  mat.customProgramCacheKey = () => 'ironline-soldier-v4';
  return mat;
}
