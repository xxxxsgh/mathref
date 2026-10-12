/**
 * MATERIAIS DA FLORA — MeshStandardMaterial (PBR do three: luzes, sombras
 * em cascata do render, envMap/IBL do céu) estendido por onBeforeCompile.
 *
 * Vértice (também no material de sombra, para a sombra balançar junto):
 *   - VENTO: balanço do conjunto por ângulo (peso ∝ altura², rigidez por
 *     espécie), rajadas que viajam pelo mundo (ondas na grama), tremor das
 *     folhas ao longo da normal.
 *   - FADE por distância (encolhe a instância até a base) e RAREAMENTO por
 *     posto (rank) da instância — a grama fica rala aos poucos, sem anel.
 * Fragmento:
 *   - textura-array (albedo/recorte + normal/espessura/emissivo) por camada
 *   - alpha-test + alpha-to-coverage, com correção de alfa por mip
 *   - normal tangente por derivadas de tela; normais "suaves" não invertem
 *     na face de trás (copa e grama iluminadas como volume)
 *   - TRANSLUCIDEZ (subsuperfície barata): luz do sol atravessando a folha
 *     quando se olha contra o sol + termo envolvente, pela espessura
 *   - emissão pela máscara da camada (pintas de fungo, núcleo de cristal)
 *   - cristal: brilho de Fresnel e núcleo luminoso
 */
import * as THREE from 'three';

/** Uniforms compartilhados por TODOS os materiais da flora (atualizados 1×/frame). */
export function createSharedUniforms() {
  return {
    tFAlb: { value: null },
    tFNrm: { value: null },
    uTexSize: { value: 512 },
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector3(1, 0, 0) },
    uWindStr: { value: 0.6 },
    uAnchorMod: { value: new THREE.Vector3() },
    uSunDirV: { value: new THREE.Vector3(0, 1, 0) },
    uSunRad: { value: new THREE.Vector3(3, 3, 3) },
    uEmitScale: { value: 1 },
  };
}

const VERT_PARS = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aMat;
attribute vec4 aWind;
attribute vec4 aInst;
uniform float uTime;
uniform vec3 uWindDir;
uniform float uWindStr;
uniform vec3 uAnchorMod;
uniform vec4 uFade;   // fadeIni, fadeFim, rareIni, rareFim
uniform float uThinMin;
uniform float uStiff;
varying vec2 vFUv;
varying vec4 vFMat;
varying float vFSoft;
varying float vFInst;
`;

/** Bloco do vértice: define `transformed` com vento e fade (substitui begin_vertex). */
const VERT_BODY = /* glsl */ `
vec3 transformed = vec3( position );
vFUv = aUv;
vFMat = aMat;
vFSoft = aWind.w;
vFInst = aInst.y;
#ifdef USE_INSTANCING
  vec3 iPos = instanceMatrix[3].xyz;
  mat3 iRot = mat3(instanceMatrix);
#else
  vec3 iPos = vec3(0.0);
  mat3 iRot = mat3(1.0);
#endif
float iScale = max(1e-4, length(iRot[1]));
vec3 rp = (modelMatrix * vec4(iPos, 1.0)).xyz; // câmera na origem de render
float fDist = length(rp);
float keep = 1.0;
if (uFade.y > 0.0) keep *= 1.0 - smoothstep(uFade.x, uFade.y, fDist);
if (uFade.w > 0.0) {
  float k = mix(1.0, uThinMin, smoothstep(uFade.z, uFade.w, fDist));
  keep *= 1.0 - smoothstep(k - 0.06, k, aInst.x);
}
transformed *= keep;
// vento: direção no espaço local da instância
vec3 wl = transpose(iRot) * uWindDir;
wl.y = 0.0;
float wlen = length(wl);
wl = wlen > 1e-5 ? wl / wlen : vec3(1.0, 0.0, 0.0);
vec3 wp = iPos + uAnchorMod;
float ph = dot(wp, uWindDir) * 0.11 - uTime * 1.7;
float gust = 0.5 + 0.5 * sin(ph) * (0.6 + 0.4 * sin(ph * 0.31 + dot(wp.xz, vec2(0.013, 0.021))));
float ang = uWindStr * uStiff * (0.08 + 0.32 * gust + 0.05 * sin(uTime * 2.3 + aInst.y * 6.283));
float sw = aWind.x * ang;
transformed += wl * (sw * transformed.y);
transformed.y -= 0.5 * sw * sw * transformed.y;
// tremor das folhas
float fl = aWind.y * uWindStr * (0.25 + gust) * sin(uTime * 9.0 + aWind.z + aInst.y * 31.0 + dot(wp, vec3(0.7)));
transformed += normal * (fl * 0.035 / iScale);
`;

const FRAG_PARS = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray tFAlb;
uniform sampler2DArray tFNrm;
uniform float uTexSize;
uniform vec3 uSunDirV;
uniform vec3 uSunRad;
uniform float uEmitScale;
uniform float uTransl;
varying vec2 vFUv;
varying vec4 vFMat;
varying float vFSoft;
varying float vFInst;
vec4 gFN;
`;

const FRAG_MAP = /* glsl */ `
float fLayer = floor(vFMat.x + 0.5);
vec4 tA = texture(tFAlb, vec3(vFUv, fLayer));
gFN = texture(tFNrm, vec3(vFUv, fLayer));
{
  vec2 dx = dFdx(vFUv) * uTexSize, dy = dFdy(vFUv) * uTexSize;
  float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
  tA.a = tA.a * (1.0 + mip * 0.3);
}
diffuseColor *= tA;
`;

export function patchStandard(mat, shared, own) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, own);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vFMat.w;')
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        if (vFSoft > 0.01) { normal *= faceDirection; }
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          float fk = floor(vFMat.y + 0.5);
          vec3 tn = vec3(gFN.xy * 2.0 - 1.0, 1.0);
          tn.xy *= fk == 2.0 ? 0.35 : 1.0;
          vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
          vec2 st0 = dFdx(vFUv), st1 = dFdy(vFUv);
          vec3 N = normal;
          vec3 q1p = cross(q1, N), q0p = cross(N, q0);
          vec3 T = q1p * st0.x + q0p * st1.x;
          vec3 Bt = q1p * st0.y + q0p * st1.y;
          float det = max(dot(T, T), dot(Bt, Bt));
          float sc = det == 0.0 ? 0.0 : inversesqrt(det);
          normal = normalize(T * (tn.x * sc) + Bt * (tn.y * sc) + N);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `{
          float fk = floor(vFMat.y + 0.5);
          float em = gFN.a * vFMat.z;
          if (fk == 2.0) em += vFMat.z * 0.12;
          totalEmissiveRadiance += diffuseColor.rgb * em * uEmitScale;
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          float fk = floor(vFMat.y + 0.5);
          vec3 Vv = normalize(vViewPosition);
          if (fk >= 1.0) {
            float thick = gFN.b;
            float back = pow(clamp(dot(-Vv, uSunDirV), 0.0, 1.0), 4.0);
            float wrapL = clamp(dot(-normal, uSunDirV) * 0.5 + 0.5, 0.0, 1.0);
            float occ = clamp(dot(vColor.rgb, vec3(0.333)) * 4.0, 0.25, 1.0);
            vec3 tr = uSunRad * diffuseColor.rgb * thick * uTransl * (back * 2.2 + wrapL * 0.35) * occ;
            reflectedLight.directDiffuse += tr * RECIPROCAL_PI;
          }
          if (fk == 2.0) {
            float fr = pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 3.0);
            totalEmissiveRadiance += diffuseColor.rgb * fr * 0.6 * vFMat.z * uEmitScale;
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'exo-flora-std-1';
  return mat;
}

/** Material de profundidade (sombra) com o MESMO vento e recorte. */
export function makeDepthMaterial(shared, own) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, own);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${VERT_PARS}`).replace('#include <begin_vertex>', VERT_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nprecision highp sampler2DArray;\nuniform sampler2DArray tFAlb;\nvarying vec2 vFUv;\nvarying vec4 vFMat;\nvarying float vFSoft;\nvarying float vFInst;\n`)
      .replace('#include <map_fragment>', 'diffuseColor.a = texture(tFAlb, vec3(vFUv, floor(vFMat.x + 0.5))).a;');
  };
  m.customProgramCacheKey = () => 'exo-flora-depth-1';
  return m;
}

/**
 * Material de uma espécie/LOD. `opts`: { fade: [ini, fim], thin: [ini, fim, min], stiff, transl }
 */
export function makeFloraMaterial(shared, opts = {}) {
  const own = {
    uFade: { value: new THREE.Vector4(opts.fade?.[0] ?? 0, opts.fade?.[1] ?? 0, opts.thin?.[0] ?? 0, opts.thin?.[1] ?? 0) },
    uThinMin: { value: opts.thin?.[2] ?? 1 },
    uStiff: { value: opts.stiff ?? 1 },
    uTransl: { value: opts.transl ?? 1 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    emissive: 0x000000,
  });
  mat.alphaToCoverage = true;
  patchStandard(mat, shared, own);
  const depth = makeDepthMaterial(shared, own);
  return { mat, depth, own };
}
