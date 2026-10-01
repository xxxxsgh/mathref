/**
 * Biblioteca de materiais do mundo.
 *
 * MeshStandardMaterial (PBR completo em high/ultra; Lambert nas superfícies
 * ásperas em low/medium) com mapas procedurais (textures.js) e um patch de
 * shader em ESPAÇO DE MUNDO (onBeforeCompile):
 *  - quebra de repetição: segunda amostra deslocada misturada por ruído de
 *    baixa frequência (albedo, normal e ORM juntos) — some o "carimbo";
 *  - variação macro de baixa frequência;
 *  - sujeira/umidade subindo do chão nas paredes (altura variável por ruído);
 *  - escorridos verticais em manchas (não colunas repetidas);
 *  - poeira assentada nas faces voltadas para cima;
 *  - W_ROAD: camadas de estrada (trilhas de pneu, sarjeta, remendos,
 *    rachaduras seladas, couro de jacaré, buracos com poça, manchas úmidas);
 *  - W_FLOOR: piso interno por ladrilho (tom, peças faltando, quebradas,
 *    poeira nos rodapés, caminho gasto).
 * Tudo em coordenadas de mundo: peças vizinhas mescladas continuam coerentes.
 *
 * Cor de vértice multiplica o albedo (tinta de cada prédio, AO de contato
 * assado) — uma só malha mesclada por material cobre o mapa inteiro.
 */
import * as THREE from 'three';
import * as T from './textures.js';
import { fbm } from './noise.js';

/** Textura de ruído 256² compartilhada pelo patch (R = fbm, G = streaks, B = fbm médio). */
function weatherTexture() {
  const N = 256;
  const a = fbm(N, 901, { period: 4, octaves: 5 });
  const b = fbm(N, 902, { period: 24, octaves: 3, stretchY: 0.08 });
  const c = fbm(N, 903, { period: 16, octaves: 4 });
  const e = fbm(N, 904, { period: 8, octaves: 5 });
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = a[i] * 255;
    d[i * 4 + 1] = b[i] * 255;
    d[i * 4 + 2] = c[i] * 255;
    d[i * 4 + 3] = e[i] * 255;
  }
  const t = new THREE.DataTexture(d, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function roadTexture(N) {
  const t = new THREE.DataTexture(T.genRoadDetail(N), N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const W = { tex: null, road: null };

/**
 * Volumes de oclusão ambiente ("GI falso"): dentro de cada caixa a luz
 * INDIRETA (hemisfério/envmap) é multiplicada por k — interiores ficam
 * escuros e a luz direta do sol entrando pelos vãos domina, como num
 * motor com GI. Uniforms compartilhados por todos os materiais do mundo.
 */
export const OCC = {
  uOccMin: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(1e5, 1e5, 1e5)) },
  uOccMax: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(-1e5, -1e5, -1e5)) },
  uOccK: { value: [1, 1, 1, 1] },
};
export function setOcclusionVolumes(list) {
  for (let i = 0; i < 4; i++) {
    const v = list[i];
    if (v) {
      OCC.uOccMin.value[i].set(...v.min);
      OCC.uOccMax.value[i].set(...v.max);
      OCC.uOccK.value[i] = v.k;
    } else {
      OCC.uOccMin.value[i].set(1e5, 1e5, 1e5);
      OCC.uOccMax.value[i].set(-1e5, -1e5, -1e5);
      OCC.uOccK.value[i] = 1;
    }
  }
}

/** Layout da estrada/sala para os shaders W_ROAD / W_FLOOR (mundo). */
export const LAYOUT = {
  uCross: { value: new THREE.Vector2(-62.5, -55.5) }, // faixa z da transversal
  uRoom: { value: new THREE.Vector4(9.8, -13.7, 23.2, 1.7) }, // x0,z0,x1,z1 do interior
  uTime: { value: 0 },
};

const PARS = /* glsl */ `
varying vec3 vWW;
varying vec3 vWN;
uniform sampler2D uWeather;
uniform vec4 uWParams;
uniform vec2 uWBase;
uniform vec3 uOccMin[4];
uniform vec3 uOccMax[4];
uniform float uOccK[4];
float wGrime = 0.0; float wDust = 0.0; float wWet = 0.0; float wRough = 0.0; float wRoughSet = -1.0;
vec3 wBump = vec3(0.0);
vec2 tbOff = vec2(0.0); float tbW = 0.0;
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 tbTex(sampler2D t, vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec4 a = textureGrad(t, uv, dx, dy);
  if (tbW < 0.003) return a;
  vec4 b = textureGrad(t, uv + tbOff, dx, dy);
  if (tbW > 0.997) return b;
  return mix(a, b, tbW);
}
// bump em espaço de mundo a partir de uma altura escalar (Mikkelsen)
vec3 wBumpN(vec3 N, float H) {
  vec3 dpx = dFdx(vWW), dpy = dFdy(vWW);
  float hx = dFdx(H), hy = dFdy(H);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * N - g);
}
`;

const ROAD_PARS = /* glsl */ `
uniform sampler2D uRoad;
uniform vec2 uCross;
`;
const FLOOR_PARS = /* glsl */ `
uniform vec4 uRoom;
`;

/* Camadas de estrada: roda depois de color_fragment (diffuseColor pronto). */
const ROAD_FRAG = /* glsl */ `
{
  vec2 p = vWW.xz;
  bool cr = p.y > uCross.x && p.y < uCross.y && abs(p.x) > 5.0;
  float lat = cr ? (p.y - 0.5 * (uCross.x + uCross.y)) : p.x;
  float lon = cr ? p.x : p.y;
  vec2 q = vec2(lat, lon);
  vec4 nA = texture2D(uWeather, p * 0.019);
  vec4 nB = texture2D(uWeather, p * 0.071 + 0.3);
  float H = 0.0;
  float al = abs(lat);
  // trilhas de pneu: asfalto polido e mais escuro nas faixas de rodagem
  float lane = abs(al - 3.0);
  float trk = exp(-pow((lane - 0.78) / 0.34, 2.0)) * (0.55 + 0.45 * nB.r) * (1.0 - smoothstep(4.8, 5.4, al));
  diffuseColor.rgb *= 1.0 - 0.2 * trk;
  wRough -= 0.14 * trk;
  // eixo central mais claro (pó) entre as trilhas
  float mid = exp(-pow(lane / 0.45, 2.0)) * 0.6 + exp(-pow(al / 0.9, 2.0)) * 0.5;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.14, 1.08), mid * nA.b);
  // sarjeta: areia/terra acumulada + linha úmida junto ao meio-fio
  float gut = smoothstep(4.7, 5.85, al) * (0.55 + 0.6 * nB.b);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.32, 0.26) * (0.8 + 0.4 * nB.a), clamp(gut, 0.0, 0.85));
  wRough += 0.1 * gut;
  float gwet = smoothstep(5.62, 5.86, al) * smoothstep(0.35, 0.6, nA.a);
  // remendos retangulares (asfalto novo, mais escuro, borda selada)
  vec2 cs = vec2(3.2, 4.6);
  vec2 cid = floor(q / cs);
  float hp = wHash(cid + 17.0);
  if (hp > 0.72 && al < 5.6) {
    vec2 lc = fract(q / cs);
    vec2 a0 = vec2(wHash(cid + 3.1), wHash(cid + 5.7)) * 0.35;
    vec2 a1 = 1.0 - vec2(wHash(cid + 7.3), wHash(cid + 9.9)) * 0.35;
    vec2 dd = min(lc - a0, a1 - lc) * cs;
    float ins = min(dd.x, dd.y);
    if (ins > 0.0) {
      float k = hp > 0.86 ? 0.62 : 0.78;
      diffuseColor.rgb *= k;
      wRough -= 0.06;
      float seam = 1.0 - smoothstep(0.0, 0.06, ins);
      diffuseColor.rgb *= 1.0 - 0.45 * seam;
      wRough -= 0.3 * seam;
      H -= 0.004 * seam;
    }
  }
  // rachaduras (abertas), selante de piche e couro de jacaré
  vec2 ru = p / 12.0;
  vec4 rd = texture2D(uRoad, ru);
  vec4 rd2 = texture2D(uRoad, ru * 0.73 + vec2(0.31, 0.57));
  float zone = smoothstep(0.62, 0.78, rd.a) * (1.0 - gut);
  float gtr = texture2D(uRoad, p / 2.6).b * zone;
  float opn = max(rd.r, rd2.r * 0.8) * (1.0 - gut * 0.6);
  float seal = rd2.g * (1.0 - gut);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.033, 0.03), seal * 0.85);
  wRough -= 0.4 * seal;
  diffuseColor.rgb *= 1.0 - 0.7 * max(opn, gtr * 0.85);
  H -= 0.006 * max(opn, gtr) - 0.0015 * seal;
  // buracos (com água no fundo)
  vec2 ps = vec2(5.0, 7.5);
  vec2 pid = floor(q / ps);
  float hh = wHash(pid + 41.0);
  float pot = 0.0;
  if (hh > 0.8 && al < 5.0) {
    vec2 c = (pid + 0.25 + 0.5 * vec2(wHash(pid + 1.3), wHash(pid + 2.9))) * ps;
    float rad = 0.25 + 0.45 * wHash(pid + 4.4);
    float dist = length((q - c) * vec2(1.0, 0.8)) / rad + (nB.g - 0.5) * 0.6;
    pot = 1.0 - smoothstep(0.75, 1.0, dist);
    float rim = smoothstep(0.7, 1.0, dist) * (1.0 - smoothstep(1.0, 1.35, dist));
    diffuseColor.rgb *= 1.0 - 0.45 * pot;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.28, 0.25), rim * 0.35);
    H -= 0.05 * pot;
    wWet = max(wWet, smoothstep(0.35, 0.05, dist) * 0.95);
  }
  // manchas úmidas / poças rasas em depressões
  float damp = smoothstep(0.66, 0.74, nA.r) * smoothstep(0.4, 0.7, nB.g);
  wWet = max(wWet, max(damp * 0.85, gwet * 0.7));
  wBump += vec3(H);
}
`;

/* Piso interno por ladrilho de 0.25 m (complementa genTiles). */
const FLOOR_FRAG = /* glsl */ `
{
  vec2 p = vWW.xz;
  vec2 cell = floor(p / 0.25);
  vec2 lc = fract(p / 0.25);
  float h = wHash(cell);
  vec4 nA = texture2D(uWeather, p * 0.09);
  vec4 nB = texture2D(uWeather, p * 0.31 + 0.5);
  // tom por ladrilho
  diffuseColor.rgb *= 0.88 + 0.22 * wHash(cell + 7.0);
  float e = min(min(lc.x, 1.0 - lc.x), min(lc.y, 1.0 - lc.y)) * 0.25;
  // ladrilhos faltando (agrupados por ruído): contrapiso de cimento
  float miss = step(0.86 - 0.5 * smoothstep(0.6, 0.85, nA.r), h);
  if (miss > 0.5) {
    float lip = 1.0 - smoothstep(0.0, 0.03, e);
    diffuseColor.rgb = vec3(0.4, 0.38, 0.34) * (0.75 + 0.4 * nB.r) * (1.0 - 0.45 * lip);
    wRoughSet = 0.97;
    wBump -= vec3(0.012 * (1.0 - lip));
  }
  // poeira acumulada nos rodapés + véu geral + caminho gasto (porta → sala)
  float dw = min(min(p.x - uRoom.x, uRoom.z - p.x), min(p.y - uRoom.y, uRoom.w - p.y));
  float wallDust = 1.0 - smoothstep(0.05, 0.75 + 0.5 * nA.b, dw);
  vec2 a = vec2(uRoom.x, -4.0), b = vec2(17.0, -5.5);
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float path = 1.0 - smoothstep(0.5, 1.6, length(pa - ba * t) + (nA.a - 0.5) * 0.8);
  float dust = clamp(wallDust * 0.9 + smoothstep(0.45, 0.85, nA.g * 0.6 + nB.b * 0.6) * 0.55 - path * 0.6, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.47, 0.42) * (0.85 + 0.3 * nB.r), dust * 0.85);
  wRough += dust * 0.5 - path * 0.15;
}
`;

/**
 * Aplica o patch de intemperismo. opts: { macro, ground, streaks, dust,
 * baseY, protectRust, tb (quebra de repetição), road, floor } — 0..1.
 */
export function weather(mat, opts = {}) {
  const o = { macro: 0.6, ground: 0.7, streaks: 0.6, dust: 0.3, baseY: 0, protectRust: 0, tb: false, road: false, floor: false, ...opts };
  const uniforms = {
    uWeather: { value: W.tex },
    uWParams: { value: new THREE.Vector4(o.macro, o.ground, o.streaks, o.dust) },
    uWBase: { value: new THREE.Vector2(o.baseY, o.protectRust) },
    ...OCC,
  };
  if (o.road) Object.assign(uniforms, { uRoad: { value: W.road }, uCross: LAYOUT.uCross });
  if (o.floor) Object.assign(uniforms, { uRoom: LAYOUT.uRoom });
  mat.userData.weather = uniforms;
  const tb = !!o.tb && !!mat.map;
  const defs = (tb ? '#define W_TB\n' : '') + (o.road ? '#define W_ROAD\n' : '') + (o.floor ? '#define W_FLOOR\n' : '');
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWW;\nvarying vec3 vWN;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 wwp = vec4(transformed, 1.0);
          vec3 wwn = objectNormal;
          #ifdef USE_INSTANCING
            wwp = instanceMatrix * wwp;
            wwn = mat3(instanceMatrix) * wwn;
          #endif
          wwp = modelMatrix * wwp;
          vWW = wwp.xyz;
          vWN = normalize(mat3(modelMatrix) * wwn);
        }`
      );
    let fs = sh.fragmentShader
      .replace('#include <common>', `${defs}#include <common>\n${PARS}${o.road ? ROAD_PARS : ''}${o.floor ? FLOOR_PARS : ''}`)
      .replace(
        '#include <map_fragment>',
        `#ifdef W_TB
        {
          vec4 tn = texture2D(uWeather, (vWW.xz + vec2(vWW.y * 0.8, -vWW.y * 0.6)) * 0.021 + 0.17);
          tbW = smoothstep(0.44, 0.56, tn.a);
          tbOff = vec2(0.37, 0.61) + floor(tn.r * 3.0) * vec2(0.23, 0.41);
        }
        #endif
        #ifdef USE_MAP
          #ifdef W_TB
            vec4 sampledDiffuseColor = tbTex(map, vMapUv);
          #else
            vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          #endif
          diffuseColor *= sampledDiffuseColor;
        #endif`
      )
      .replace(
        '#include <color_fragment>',
        `#if defined( USE_COLOR ) && defined( USE_MAP )
          // tinta só sobre a pintura: ferrugem/tijolo exposto (avermelhado) não é tingido
          float rustK = uWBase.y * smoothstep(0.06, 0.2, sampledDiffuseColor.r - sampledDiffuseColor.b);
          diffuseColor.rgb *= mix(vColor.rgb, vec3(1.0), rustK);
        #elif defined( USE_COLOR )
          diffuseColor.rgb *= vColor.rgb;
        #endif
        {
          vec3 wn = normalize(vWN);
          float wall = 1.0 - abs(wn.y);
          vec4 m1 = texture2D(uWeather, vWW.xz * 0.021 + vec2(vWW.y * 0.017, vWW.y * 0.013));
          vec4 m2 = texture2D(uWeather, vec2(vWW.x + vWW.z, vWW.y * 0.6) * 0.09);
          // macro
          diffuseColor.rgb *= mix(1.0, 0.8 + 0.4 * m1.r, uWParams.x);
          diffuseColor.rgb *= mix(1.0, 0.9 + 0.2 * m1.b, uWParams.x);
          // sujeira do chão (respingo de chuva + umidade capilar)
          float gh = vWW.y - uWBase.x;
          wGrime = (1.0 - smoothstep(0.0, 0.3 + 1.4 * m2.b, gh)) * wall * uWParams.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.46, 0.39), wGrime);
          // escorridos: só em manchas (máscara macro), período longo e duas escalas
          float u = vWW.x + vWW.z;
          float st = texture2D(uWeather, vec2(u * 0.083, vWW.y * 0.021)).g;
          float st2 = texture2D(uWeather, vec2(u * 0.191 + 0.4, vWW.y * 0.033 + 0.2)).g;
          float stM = smoothstep(0.45, 0.75, texture2D(uWeather, vec2(u * 0.017, 0.31)).a);
          float s = max(smoothstep(0.55, 0.85, st), smoothstep(0.6, 0.9, st2) * 0.7) * stM;
          diffuseColor.rgb *= 1.0 - s * uWParams.z * wall * 0.38;
          // poeira nas faces de cima
          wDust = smoothstep(0.55, 0.95, wn.y) * uWParams.w * (0.45 + 0.55 * m1.r);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.5, 0.42) * (0.85 + 0.3 * m1.b), wDust);
        }
        #ifdef W_ROAD
        ${ROAD_FRAG}
        #endif
        #ifdef W_FLOOR
        ${FLOOR_FRAG}
        #endif
        // molhado escurece (absorção)
        diffuseColor.rgb *= 1.0 - 0.5 * wWet;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          #ifdef W_TB
            vec4 texelRoughness = tbTex(roughnessMap, vRoughnessMapUv);
          #else
            vec4 texelRoughness = texture2D(roughnessMap, vRoughnessMapUv);
          #endif
          roughnessFactor *= texelRoughness.g;
        #endif
        roughnessFactor = mix(roughnessFactor, 0.97, clamp(wGrime * 0.6 + wDust, 0.0, 1.0));
        roughnessFactor = clamp(roughnessFactor + wRough, 0.04, 1.0);
        if (wRoughSet >= 0.0) roughnessFactor = wRoughSet;
        roughnessFactor = mix(roughnessFactor, 0.05, wWet);`
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `float metalnessFactor = metalness;
        #ifdef USE_METALNESSMAP
          #ifdef W_TB
            vec4 texelMetalness = tbTex(metalnessMap, vMetalnessMapUv);
          #else
            vec4 texelMetalness = texture2D(metalnessMap, vMetalnessMapUv);
          #endif
          metalnessFactor *= texelMetalness.b;
        #endif`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_TANGENTSPACE
          #ifdef W_TB
            vec3 mapN = tbTex(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          #else
            vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          #endif
          mapN.xy *= normalScale * (1.0 - 0.85 * wWet);
          normal = normalize(tbn * mapN);
        #endif
        #if defined( W_ROAD ) || defined( W_FLOOR )
        {
          vec3 wn0 = normalize(vWN);
          vec3 bn = wBumpN(wn0, wBump.x);
          normal = normalize(normal + (viewMatrix * vec4(bn - wn0, 0.0)).xyz);
        }
        #endif`
      )
      .replace(
        '#include <aomap_fragment>',
        `#ifdef USE_AOMAP
          #ifdef W_TB
            float ambientOcclusion = (tbTex(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
          #else
            float ambientOcclusion = (texture2D(aoMap, vAoMapUv).r - 1.0) * aoMapIntensity + 1.0;
          #endif
          reflectedLight.indirectDiffuse *= ambientOcclusion;
          #if defined( USE_ENVMAP ) && defined( STANDARD )
            float dotNV = saturate(dot(geometryNormal, geometryViewDir));
            reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.roughness);
          #endif
        #endif`
      )
      .replace(
        '#include <lights_fragment_end>',
        `{
          float wOcc = 1.0;
          for (int i = 0; i < 4; i++) {
            vec3 a = vWW - uOccMin[i];
            vec3 b = uOccMax[i] - vWW;
            float d = min(min(min(a.x, b.x), min(a.y, b.y)), min(a.z, b.z));
            wOcc = min(wOcc, mix(1.0, uOccK[i], smoothstep(0.0, 0.3, d)));
          }
          irradiance *= wOcc;
          #if defined( RE_IndirectSpecular )
            radiance *= wOcc;
            iblIrradiance *= wOcc;
          #endif
        }
        #include <lights_fragment_end>`
      );
    sh.fragmentShader = fs;
  };
  // chave de cache distinta por combinação de flags (as intensidades são uniforms)
  mat.customProgramCacheKey = () => 'ironline-weather3' + defs.replace(/\s+/g, '');
  return mat;
}

/** Cria todos os materiais. `q` = ctx.quality. Retorna { mats, tex }. */
export function createMaterials(q, renderer) {
  W.tex = weatherTexture();
  const N = q.textureSize >= 1024 ? 1024 : 512;
  const Ns = N >= 1024 ? 512 : 256;
  W.road = roadTexture(N);
  // Anisotropia: alta no chão (visto em ângulo rasante), moderada nas paredes.
  const maxA = renderer.capabilities.getMaxAnisotropy?.() || 8;
  const anG = Math.min(q.anisotropy || 4, 8, maxA);
  const an = Math.min(q.anisotropy || 2, 4, maxA);
  const t0 = performance.now();
  const sets = {
    plaster: T.makeSet(T.genPlaster, N, an),
    concrete: T.makeSet(T.genConcrete, N, an),
    brick: T.makeSet(T.genBrick, N, an),
    asphalt: T.makeSet(T.genAsphalt, N, anG),
    pavers: T.makeSet(T.genPavers, N, anG),
    metal: T.makeSet(T.genPaintedMetal, Ns, an),
    car: T.makeSet((n) => T.genPaintedMetal(n, 64, 0.9), Ns, an),
    corrugated: T.makeSet(T.genCorrugated, Ns, an),
    wood: T.makeSet(T.genWood, Ns, an),
    tiles: T.makeSet(T.genTiles, Ns, anG),
    dirt: T.makeSet(T.genDirt, Ns, anG),
    fabric: T.makeSet(T.genFabric, Ns, an),
    grime: T.makeSet(T.genGrime, 256, an),
    far: T.makeSet(T.genFarFacade, Ns, an),
  };
  const genMs = performance.now() - t0;

  // PBR completo (especular GGX, IBL) em high/ultra. Em low/medium as
  // superfícies ásperas usam Lambert (≈40% mais barato em GPUs fracas).
  const fullPBR = q.level === 'ultra' || q.level === 'high';
  const std = (set, extra = {}, w = {}, rough = false) => {
    let m;
    if (rough && !fullPBR) {
      const { roughness, metalness, envMapIntensity, ...rest } = extra;
      void roughness; void metalness; void envMapIntensity;
      m = new THREE.MeshLambertMaterial({
        map: set?.map || null,
        normalMap: set?.normalMap || null,
        aoMap: set?.orm || null,
        aoMapIntensity: 1,
        vertexColors: true,
        ...rest,
      });
    } else {
      m = new THREE.MeshStandardMaterial({
        map: set?.map || null,
        normalMap: set?.normalMap || null,
        roughnessMap: set?.orm || null,
        metalnessMap: set?.orm || null,
        aoMap: set?.orm || null,
        aoMapIntensity: 1,
        roughness: 1,
        metalness: set ? 1 : 0, // com metalnessMap, metalness multiplica o canal B
        vertexColors: true,
        ...extra,
      });
    }
    weather(m, w === false ? { macro: 0, ground: 0, streaks: 0, dust: 0 } : w);
    return m;
  };

  const mats = {
    plaster: std(sets.plaster, {}, { ground: 0.85, streaks: 0.8, dust: 0.25, tb: true }, true),
    plasterIn: std(sets.plaster, {}, { ground: 0.4, streaks: 0, dust: 0.2, macro: 0.4, tb: true }, true),
    concrete: std(sets.concrete, {}, { ground: 0.7, streaks: 0.7, dust: 0.45, tb: true }, true),
    brick: std(sets.brick, {}, { ground: 0.6, streaks: 0.5, dust: 0.2 }, true),
    asphalt: std(sets.asphalt, {}, { ground: 0, streaks: 0, dust: 0.1, macro: 0.7, tb: true, road: true }, true),
    pavers: std(sets.pavers, {}, { ground: 0, streaks: 0, dust: 0.25, macro: 0.8 }, true),
    metal: std(sets.metal, {}, { ground: 0.5, streaks: 0.4, dust: 0.3, protectRust: 1 }),
    carpaint: std(sets.car, { roughness: 0.55 }, { ground: 0.7, streaks: 0.2, dust: 0.6, protectRust: 1 }),
    corrugated: std(sets.corrugated, {}, { ground: 0.5, streaks: 0.3, dust: 0.2, protectRust: 1 }),
    wood: std(sets.wood, {}, { ground: 0.5, streaks: 0.3, dust: 0.3 }, true),
    tiles: std(sets.tiles, {}, { ground: 0, streaks: 0, dust: 0.2, macro: 0.5, floor: true }, true),
    dirt: std(sets.dirt, {}, { ground: 0, streaks: 0, dust: 0, macro: 0.7, tb: true }, true),
    fabric: std(sets.fabric, {}, { ground: 0.6, streaks: 0, dust: 0.35 }, true),
    far: std(sets.far, {}, { ground: 0.3, streaks: 0.5, dust: 0, macro: 0.5 }, true),
    // vidro: escuro e liso, reflexo do ambiente; sujeira por rugosidade
    glass: std(sets.grime, { metalness: 0, roughness: 1, envMapIntensity: 1.4, aoMap: null }, false),
    // fundo das janelas falsas: escuro, sem intemperismo
    room: std(sets.plaster, { color: 0x2a2724, aoMap: null }, false, true),
    rubber: std(null, { color: 0x1b1b1b, roughness: 0.92 }, { ground: 0, streaks: 0, dust: 0.5 }, true),
    plastic: std(null, { color: 0x2b2b2b, roughness: 0.6 }, { ground: 0.4, streaks: 0, dust: 0.4 }),
    black: std(null, { color: 0x0c0c0c, roughness: 0.8 }, false, true),
    cable: std(null, { color: 0x111111, roughness: 0.6 }, false, true),
    chrome: std(null, { color: 0x9a9a9a, roughness: 0.3, metalness: 1 }, { ground: 0, streaks: 0, dust: 0.3 }),
    light: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe6b0, emissiveIntensity: 2, vertexColors: true }),
  };
  mats.glass.color.setScalar(1);
  return { mats, sets, genMs, fullPBR };
}

/** Superfície de impacto/passos (convenção do CONTRACT) por material de render. */
export const SURFACE = {
  plaster: 'concrete', plasterIn: 'concrete', concrete: 'concrete', brick: 'brick', asphalt: 'asphalt',
  pavers: 'concrete', metal: 'metal', carpaint: 'metal', corrugated: 'metal', wood: 'wood', tiles: 'concrete',
  dirt: 'dirt', fabric: 'dirt', far: 'concrete', glass: 'glass', room: 'concrete', rubber: 'rubber',
  plastic: 'plastic', black: 'metal', cable: 'metal', chrome: 'metal', light: 'glass',
  window: 'glass', rubble: 'concrete', mesh: 'metal', manhole: 'metal', ceiling: 'concrete',
};
