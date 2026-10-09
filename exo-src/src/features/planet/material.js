/**
 * MATERIAL DO TERRENO — MeshStandardMaterial (PBR do three: luzes, sombras,
 * neblina e envMap de quem estiver na cena) com o shader estendido por
 * onBeforeCompile:
 *
 *   vértice  geomorphing (posição → posição na malha do pai pela distância),
 *            normal + oclusão empacotadas (normalAO), dados do bioma (tdata)
 *   fragmento
 *     - TRIPLANAR em coordenadas de mundo periódicas (câmera mod 4096 m
 *       calculada em double na CPU → sem perda de precisão a 100+ km)
 *     - 4 camadas (rocha, solo/vegetação, areia, neve) com pesos por
 *       inclinação / altitude / umidade / estratos + BLEND POR ALTURA
 *       (texturas carregam altura no alfa → transições recortadas)
 *     - cor do BIOMA (paleta) × detalhe; faixas de estratos na rocha seguindo
 *       a altitude (não os eixos do mundo); variação regional A↔B, regiões secas
 *     - MACRO-variação anti-repetição (textura macro em 2 escalas + 2ª escala
 *       do detalhe) e fade do detalhe com a distância
 *     - detail-normal (whiteout triplanar) sobre a normal da malha
 *     - oclusão = cavidade da malha × cavidade da textura (só luz indireta)
 *     - leito submerso tingido pela cor da água e escurecido pela profundidade
 */
import * as THREE from 'three';

export const TEX_PERIOD = 4096;

const VERT_PARS = /* glsl */ `
attribute vec4 normalAO;
attribute vec4 morph;
uniform vec3 uCenter;
attribute vec4 tdata;
uniform float uMorphStart;
uniform float uMorphEnd;
varying vec3 vWPos;
varying vec3 vWNor;
varying vec4 vData;
varying float vAO;
varying float vSk;
`;

const FRAG_PARS = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray tAlb;
uniform sampler2DArray tNrm;
uniform sampler2D tMacro;
uniform vec3 uCenter;
uniform float uR;
uniform float uSea;
uniform float uHasSea;
uniform vec3 uCamMod;
uniform vec3 uGrass, uGrass2, uDry, uRock, uRock2, uSand, uSnow, uSeabed, uWater;
uniform float uSnowLine, uRockSlope, uSandAmt, uStrata, uFrozen, uDetail;
varying vec3 vWPos;
varying vec3 vWNor;
varying vec4 vData;
varying float vAO;
varying float vSk;

vec4 triA(float layer, vec3 p, vec3 bw, float s) {
  vec4 a = vec4(0.0);
  if (bw.x > 0.01) a += texture(tAlb, vec3(p.zy * s, layer)) * bw.x;
  if (bw.y > 0.01) a += texture(tAlb, vec3(p.xz * s, layer)) * bw.y;
  if (bw.z > 0.01) a += texture(tAlb, vec3(p.xy * s, layer)) * bw.z;
  return a;
}
// normais tangentes por projeção (acumuladas por camada)
void triN(float layer, vec3 p, vec3 bw, float s, float w, inout vec3 nX, inout vec3 nY, inout vec3 nZ, inout vec2 rc) {
  vec4 t;
  if (bw.x > 0.01) { t = texture(tNrm, vec3(p.zy * s, layer)); nX.xy += (t.xy * 2.0 - 1.0) * w; rc += t.zw * bw.x * w; }
  if (bw.y > 0.01) { t = texture(tNrm, vec3(p.xz * s, layer)); nY.xy += (t.xy * 2.0 - 1.0) * w; rc += t.zw * bw.y * w; }
  if (bw.z > 0.01) { t = texture(tNrm, vec3(p.xy * s, layer)); nZ.xy += (t.xy * 2.0 - 1.0) * w; rc += t.zw * bw.z * w; }
}
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float strataN(float a) { float i = floor(a); float f = fract(a); return mix(hash11(i), hash11(i + 1.0), smoothstep(0.3, 0.7, f)); }
float macroAt(vec3 p, vec3 bw, float s, int ch) {
  vec4 m = texture(tMacro, p.zy * s) * bw.x + texture(tMacro, p.xz * s) * bw.y + texture(tMacro, p.xy * s) * bw.z;
  return ch == 0 ? m.x : ch == 1 ? m.y : ch == 2 ? m.z : m.w;
}
`;

const COLOR_FRAG = /* glsl */ `
  vec3 tRel = vWPos - uCenter;
  float tRr = length(tRel);
  vec3 tUp = tRel / tRr;
  float tAlt = tRr - uR;
  vec3 tNg = normalize(vWNor);
  float tSlope = 1.0 - clamp(dot(tNg, tUp), 0.0, 1.0);
  vec3 tP = vWPos + uCamMod;
  float tDist = length(vWPos);
  // pesos triplanares: da normal da malha (detalhe) e do "up" (macro)
  vec3 tBw = pow(abs(tNg), vec3(5.0)); tBw /= (tBw.x + tBw.y + tBw.z);
  vec3 tBu = pow(abs(tUp), vec3(6.0)); tBu /= (tBu.x + tBu.y + tBu.z);
  // macro (contraste ampliado: o fBm fica perto de 0,5)
  float tM1 = clamp((macroAt(tP, tBu, 1.0 / 256.0, 0) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
  float tM2 = clamp((macroAt(tP, tBu, 1.0 / 2048.0, 2) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
  float tM3 = clamp((macroAt(tP, tBu, 1.0 / 64.0, 1) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
  float tMoist = vData.x, tEro = vData.y, tReg = vData.z, tStr = vData.w;
  // ── pesos das camadas
  float tRockW = smoothstep(uRockSlope - 0.07, uRockSlope + 0.07, tSlope + (tM1 - 0.5) * 0.16 + (1.0 - tEro) * 0.1 + tStr * 0.06);
  tRockW = max(tRockW, smoothstep(0.5, 0.95, tStr) * smoothstep(0.12, 0.3, tSlope));
  float tSnowW = smoothstep(uSnowLine - 120.0, uSnowLine + 120.0, tAlt + (tM2 - 0.5) * 500.0 + (tM1 - 0.5) * 120.0);
  tSnowW *= 1.0 - smoothstep(0.32 + uFrozen * 0.12, 0.5 + uFrozen * 0.12, tSlope + (tM3 - 0.5) * 0.1);
  float tBeach = uHasSea * (1.0 - smoothstep(uSea + 1.5, uSea + 9.0 + tM1 * 8.0, tAlt)) * (1.0 - smoothstep(0.15, 0.35, tSlope));
  float tSandW = max(tBeach, uSandAmt * smoothstep(0.55, 0.85, tEro + (tM2 - 0.5) * 0.6) * (1.0 - smoothstep(0.08, 0.25, tSlope)));
  float tGrassW = 1.0;
  // ── amostras (detalhe 4 m e 32 m; fade com a distância)
  float tDf = (1.0 - smoothstep(250.0, 1800.0, tDist)) * (1.0 - vSk);
  float tDf2 = 1.0 - smoothstep(6000.0, 30000.0, tDist);
  vec4 tA0 = vec4(0.5), tA1 = vec4(0.5), tA2 = vec4(0.5), tA3 = vec4(0.5);
  vec4 tB0 = vec4(0.5), tB1 = vec4(0.5);
  // escala grande (256 m): textura viva também a dezenas de km
  vec4 tC1 = triA(1.0, tP, tBw, 1.0 / 256.0);
  vec4 tC0 = mix(vec4(0.5), tC1, 0.7);
  if (tDf2 > 0.0) {
    tB0 = triA(0.0, tP, tBw, 1.0 / 32.0);
    tB1 = triA(1.0, tP, tBw, 1.0 / 32.0);
  }
  if (tDf > 0.0) {
    tA0 = triA(0.0, tP, tBw, 0.5);
    tA1 = triA(1.0, tP, tBw, 0.5);
    if (tSandW > 0.01) tA2 = triA(2.0, tP, tBw, 0.5);
    if (tSnowW > 0.01) tA3 = triA(3.0, tP, tBw, 0.5);
  }
  tA0 = mix(vec4(0.5), tA0, tDf); tA1 = mix(vec4(0.5), tA1, tDf);
  tA2 = mix(vec4(0.5), tA2, tDf); tA3 = mix(vec4(0.5), tA3, tDf);
  tB0 = mix(vec4(0.5), tB0, tDf2); tB1 = mix(vec4(0.5), tB1, tDf2);
  // detalhe combinado (duas escalas → sem repetição visível)
  vec3 tD0 = tA0.rgb * (tB0.rgb * 1.3 + 0.35) * (tC0.rgb * 1.1 + 0.45);
  vec3 tD1 = tA1.rgb * (tB1.rgb * 1.2 + 0.4) * (tC1.rgb * 0.9 + 0.55);
  float tH0 = tA0.a * 0.6 + tB0.a * 0.4, tH1 = tA1.a * 0.6 + tB1.a * 0.4;
  // blend por altura (ordem de prioridade: rocha > neve > areia > solo)
  float tWr = tRockW, tWs = tSnowW * (1.0 - tRockW * 0.8), tWa = tSandW * (1.0 - tRockW) * (1.0 - tSnowW);
  float tWg = max(0.0, 1.0 - tWr - tWs - tWa);
  float tHr = tWr + tH0 * 0.5, tHs = tWs + tA3.a * 0.35, tHa = tWa + tA2.a * 0.35, tHg = tWg + tH1 * 0.45;
  float tMx = max(max(tHr, tHs), max(tHa, tHg)) - 0.18;
  vec4 tBl = max(vec4(tHr, tHs, tHa, tHg) - tMx, 0.0) * vec4(step(0.001, tWr), step(0.001, tWs), step(0.001, tWa), step(0.001, tWg));
  tBl /= max(1e-4, tBl.x + tBl.y + tBl.z + tBl.w);
  // ── cores
  // ESTRATOS: camadas horizontais (seguem a altitude, não os eixos do mundo) de
  // espessura variável; a oitava fina some quando fica sub-pixel (sem moiré)
  float tAw = fwidth(tAlt) + 1e-4;
  float tWarpA = tAlt + (tM1 - 0.5) * 18.0 + (tM2 - 0.5) * 40.0;
  float tS1 = strataN(tWarpA / 16.0);
  float tS2 = strataN(tWarpA / 5.0 + 17.0) * (1.0 - smoothstep(1.5, 4.0, tAw));
  float tS3 = strataN(tWarpA / 1.6 + 41.0) * (1.0 - smoothstep(0.5, 1.4, tAw));
  float tBand = tS1 * 0.6 + tS2 * 0.3 + tS3 * 0.15;
  float tStrK = clamp(0.3 + tStr * uStrata, 0.0, 1.0);
  vec3 tRockC = mix(uRock, uRock2, clamp(mix(tM2 * 0.6 + 0.2, tBand, tStrK), 0.0, 1.0));
  tRockC *= (0.85 + 0.3 * tM3) * mix(1.0, 0.55 + 0.75 * tBand, tStrK);
  vec3 tGrassC = mix(uGrass, uGrass2, smoothstep(0.25, 0.75, tReg + (tM1 - 0.5) * 1.1 + (tM3 - 0.5) * 0.45));
  tGrassC = mix(tGrassC, uDry, smoothstep(0.5, 0.15, tMoist + (tM3 - 0.5) * 0.3) * 0.8);
  tGrassC *= 0.82 + 0.36 * tM3 + (tEro - 0.6) * 0.25;
  vec3 tSandC = uSand * (0.88 + 0.24 * tM1);
  vec3 tSnowC = uSnow * (0.8 + 0.08 * tM3) * mix(vec3(0.72, 0.82, 1.0), vec3(1.0), smoothstep(0.35, 0.85, vAO));
  vec3 tAlbC = tBl.x * tRockC * tD0 * 2.0 + tBl.y * tSnowC * tA3.rgb * 1.12 + tBl.z * tSandC * tA2.rgb * 2.0 + tBl.w * tGrassC * tD1 * 2.0;
  // leito submerso
  if (uHasSea > 0.5) {
    float tUw = smoothstep(uSea + 0.5, uSea - 3.0, tAlt);
    vec3 tBed = mix(uSeabed * (tD1 * 2.0), uWater, 0.35);
    tAlbC = mix(tAlbC, tBed * exp(min(0.0, tAlt - uSea) * 0.015), tUw);
  }
  diffuseColor.rgb = tAlbC;
#ifdef DEBUG_SKIRT
  if (vSk > 0.5) diffuseColor.rgb = vec3(1.0, 0.0, 0.0);
#endif
  float tRough = 0.0;
`;

const ROUGH_FRAG = /* glsl */ `
  float roughnessFactor = tRoughF;
`;

const NORMAL_FRAG = /* glsl */ `
  {
    // detail-normal: soma das camadas por projeção + whiteout
    vec3 nX = vec3(0.0), nY = vec3(0.0), nZ = vec3(0.0);
    vec2 rc = vec2(0.0);
    float tNs = uDetail * tDf;
    if (tDf > 0.0) {
      if (tBl.x > 0.01) triN(0.0, tP, tBw, 0.5, tBl.x, nX, nY, nZ, rc);
      if (tBl.w > 0.01) triN(1.0, tP, tBw, 0.5, tBl.w, nX, nY, nZ, rc);
      if (tBl.z > 0.01) triN(2.0, tP, tBw, 0.5, tBl.z, nX, nY, nZ, rc);
      if (tBl.y > 0.01) triN(3.0, tP, tBw, 0.5, tBl.y, nX, nY, nZ, rc);
    } else rc = vec2(0.9, 1.0);
    nX.xy *= tNs; nY.xy *= tNs; nZ.xy *= tNs;
    vec3 tnX = vec3(nX.xy + tNg.zy, tNg.x);
    vec3 tnY = vec3(nY.xy + tNg.xz, tNg.y);
    vec3 tnZ = vec3(nZ.xy + tNg.xy, tNg.z);
    vec3 tNw = normalize(tnX.zyx * tBw.x + tnY.xzy * tBw.y + tnZ.xyz * tBw.z);
    // relevo distante: bump de tela pela altura macro (256 m) e pela rocha (32 m)
    float tHb = ((tM1 - 0.5) * 9.0 + (tC1.a - 0.5) * 5.0 * (0.4 + tBl.x)) * smoothstep(80.0, 500.0, tDist);
    {
      vec3 dpx = dFdx(vWPos), dpy = dFdy(vWPos);
      float dhx = dFdx(tHb), dhy = dFdy(tHb);
      vec3 r1 = cross(dpy, tNw), r2 = cross(tNw, dpx);
      float det = dot(dpx, r1);
      vec3 gb = sign(det) * (dhx * r1 + dhy * r2);
      vec3 nb = normalize(abs(det) * tNw - gb);
      if (abs(det) > 1e-9 && vSk < 0.5) tNw = normalize(mix(tNw, nb, 0.85));
    }
    normal = normalize((viewMatrix * vec4(tNw, 0.0)).xyz);
    tCav = mix(1.0, rc.y, tDf);
    tRoughF = mix(0.92, rc.x, tDf);
    if (uHasSea > 0.5) tRoughF = mix(tRoughF, 0.35, smoothstep(uSea + 1.2, uSea + 0.2, tAlt));
  }
`;

const AO_FRAG = /* glsl */ `
  float ambientOcclusion = clamp(vAO * (0.55 + 0.45 * tCav), 0.0, 1.0);
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  reflectedLight.indirectSpecular *= ambientOcclusion;
  reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, 0.35);
`;

/** Uniforms compartilhados por todos os materiais de terreno. */
export function createTerrainUniforms() {
  const c = () => ({ value: new THREE.Color() });
  return {
    tAlb: { value: null },
    tNrm: { value: null },
    tMacro: { value: null },
    uCenter: { value: new THREE.Vector3() },
    uR: { value: 1 },
    uSea: { value: 0 },
    uHasSea: { value: 0 },
    uCamMod: { value: new THREE.Vector3() },
    uGrass: c(), uGrass2: c(), uDry: c(), uRock: c(), uRock2: c(), uSand: c(), uSnow: c(), uSeabed: c(), uWater: c(),
    uSnowLine: { value: 1e5 },
    uRockSlope: { value: 0.3 },
    uSandAmt: { value: 0 },
    uStrata: { value: 0.5 },
    uFrozen: { value: 0 },
    uDetail: { value: 1 },
  };
}

/** Material de terreno (um por nível de LOD: só os uniforms de morph mudam; o programa é compartilhado). */
export function createTerrainMaterial(U, { morphStart = 1e30, morphEnd = 2e30 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.name = 'planet:terrain';
  // sombra pelas faces de trás: elimina a acne nas encostas iluminadas de raspão
  mat.shadowSide = THREE.BackSide;
  const morph = { uMorphStart: { value: morphStart }, uMorphEnd: { value: morphEnd } };
  mat.userData.morph = morph;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, morph);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalAO.xyz;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\n  worldPosition.xyz += normalize(worldPosition.xyz - uCenter) * morph.w;\n#endif')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = position;
        {
          vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
          float mk = clamp((length(wp0) - uMorphStart) / (uMorphEnd - uMorphStart), 0.0, 1.0);
          transformed += morph.xyz * mk;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          // saia: sombreada (cor e sombra) como a borda de cima, não como o subsolo
          vec3 skUp = normalize(vWPos - uCenter);
          vWPos += skUp * morph.w;
          vSk = step(0.001, morph.w);
          vWNor = normalize(mat3(modelMatrix) * objectNormal);
          vData = tdata;
          vAO = normalAO.w;
        }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <color_fragment>', `${COLOR_FRAG}\nfloat tCav = 1.0; float tRoughF = 0.9;`)
      .replace('#include <roughnessmap_fragment>', '')
      .replace('#include <normal_fragment_maps>', NORMAL_FRAG)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>')
      .replace('#include <lights_physical_fragment>', `${ROUGH_FRAG}\n#include <lights_physical_fragment>`)
      .replace('#include <aomap_fragment>', AO_FRAG);
  };
  mat.customProgramCacheKey = () => 'exo-planet-terrain-1';
  return mat;
}

/** Aplica a configuração (paleta/estilo) do planeta aos uniforms. */
export function applyPalette(U, cfg) {
  const P = cfg.palette, S = cfg.style;
  U.uGrass.value.setRGB(...P.grass);
  U.uGrass2.value.setRGB(...P.grass2);
  U.uDry.value.setRGB(...P.dry);
  U.uRock.value.setRGB(...P.rock);
  U.uRock2.value.setRGB(...P.rock2);
  U.uSand.value.setRGB(...P.sand);
  U.uSnow.value.setRGB(...P.snow);
  U.uSeabed.value.setRGB(...P.seabed);
  U.uWater.value.setRGB(...P.water);
  U.uSnowLine.value = S.snowLine;
  U.uRockSlope.value = S.rockSlope;
  U.uSandAmt.value = S.sandAmount;
  U.uStrata.value = S.strata;
  U.uFrozen.value = cfg.biome === 'frozen' ? 1 : 0;
  U.uSea.value = cfg.seaLevel ?? 0;
  U.uHasSea.value = cfg.seaLevel == null ? 0 : 1;
  U.uR.value = cfg.radius;
}

/**
 * Material de profundidade (sombra) dos chunks: as saias sobem até a borda
 * (área zero) — senão elas projetam linhas de sombra nas fronteiras de LOD.
 */
export function createTerrainDepthMaterial(U) {
  const mat = new THREE.MeshDepthMaterial();
  mat.name = 'planet:terrain-depth';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCenter = U.uCenter;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 morph;\nuniform vec3 uCenter;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  { vec3 wq = (modelMatrix * vec4(position, 1.0)).xyz; transformed += normalize(wq - uCenter) * morph.w; }',
      );
  };
  mat.customProgramCacheKey = () => 'exo-planet-depth-1';
  return mat;
}
