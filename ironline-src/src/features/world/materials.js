/**
 * Biblioteca de materiais do mundo.
 *
 * Todos são MeshStandardMaterial com mapas procedurais (textures.js) e um
 * patch de shader de INTEMPERISMO em espaço de mundo (onBeforeCompile):
 *  - variação macro de baixa frequência (quebra a repetição do tile);
 *  - sujeira/umidade subindo do chão nas paredes (altura variável por ruído);
 *  - escorridos verticais de chuva;
 *  - poeira assentada nas faces voltadas para cima.
 * Tudo em coordenadas de mundo, então peças vizinhas mescladas continuam
 * coerentes e nada depende de UV.
 *
 * Cor de vértice multiplica o albedo (tinta de cada prédio, AO falso de
 * contato) — uma só malha mesclada por material cobre o mapa inteiro.
 */
import * as THREE from 'three';
import * as T from './textures.js';
import { fbm } from './noise.js';

/** Textura de ruído 256² compartilhada pelo patch (R = fbm, G = streaks). */
function weatherTexture() {
  const N = 256;
  const a = fbm(N, 901, { period: 4, octaves: 5 });
  const b = fbm(N, 902, { period: 24, octaves: 3, stretchY: 0.08 });
  const c = fbm(N, 903, { period: 16, octaves: 4 });
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = a[i] * 255;
    d[i * 4 + 1] = b[i] * 255;
    d[i * 4 + 2] = c[i] * 255;
    d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const W = { tex: null };

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

/**
 * Aplica o patch de intemperismo. opts: { macro, ground, streaks, dust,
 * baseY, protectRust } — intensidades 0..1.
 */
export function weather(mat, opts = {}) {
  const o = { macro: 0.6, ground: 0.7, streaks: 0.6, dust: 0.3, baseY: 0, protectRust: 0, ...opts };
  const uniforms = {
    uWeather: { value: W.tex },
    uWParams: { value: new THREE.Vector4(o.macro, o.ground, o.streaks, o.dust) },
    uWBase: { value: new THREE.Vector2(o.baseY, o.protectRust) },
    ...OCC,
  };
  mat.userData.weather = uniforms;
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
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWW;\nvarying vec3 vWN;\nuniform sampler2D uWeather;\nuniform vec4 uWParams;\nuniform vec2 uWBase;\nuniform vec3 uOccMin[4];\nuniform vec3 uOccMax[4];\nuniform float uOccK[4];\nfloat wGrime = 0.0; float wDust = 0.0;')
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
          // sujeira do chão
          float gh = vWW.y - uWBase.x;
          wGrime = (1.0 - smoothstep(0.0, 0.35 + 1.5 * m2.b, gh)) * wall * uWParams.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.44, 0.37), wGrime);
          // escorridos
          float st = texture2D(uWeather, vec2((vWW.x + vWW.z) * 0.23, vWW.y * 0.035)).g;
          diffuseColor.rgb *= 1.0 - smoothstep(0.5, 0.85, st) * uWParams.z * wall * 0.4;
          // poeira nas faces de cima
          wDust = smoothstep(0.55, 0.95, wn.y) * uWParams.w * (0.45 + 0.55 * m1.r);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.5, 0.42) * (0.85 + 0.3 * m1.b), wDust);
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.97, clamp(wGrime * 0.6 + wDust, 0.0, 1.0));`
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
  };
  // chave de cache distinta por combinação de flags (as intensidades são uniforms)
  mat.customProgramCacheKey = () => 'ironline-weather';
  return mat;
}

/** Cria todos os materiais. `q` = ctx.quality. Retorna { mats, tex }. */
export function createMaterials(q, renderer) {
  W.tex = weatherTexture();
  const N = q.textureSize >= 1024 ? 1024 : 512;
  const Ns = N >= 1024 ? 512 : 256;
  // Anisotropia custa caro no SwiftShader/GPUs fracas: alta só no chão (visto
  // em ângulo rasante), baixa nas paredes.
  const maxA = renderer.capabilities.getMaxAnisotropy?.() || 8;
  const anG = Math.min(q.anisotropy || 4, 4, maxA);
  const an = Math.min(q.anisotropy || 2, 2, maxA);
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

  // Superfícies ásperas e dielétricas (reboco, concreto, tijolo, asfalto…)
  // usam Lambert: o especular GGX quase não aparece com rugosidade ~0.9 e
  // custa ~40% do frame no SwiftShader. Metal/vidro/pintura de carro seguem
  // PBR completo. Em `ultra` tudo é PBR.
  const fullPBR = q.level === 'ultra';
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
    plaster: std(sets.plaster, {}, { ground: 0.85, streaks: 0.8, dust: 0.25 }, true),
    plasterIn: std(sets.plaster, {}, { ground: 0.4, streaks: 0, dust: 0.2, macro: 0.4 }, true),
    concrete: std(sets.concrete, {}, { ground: 0.7, streaks: 0.7, dust: 0.45 }, true),
    brick: std(sets.brick, {}, { ground: 0.6, streaks: 0.5, dust: 0.2 }, true),
    asphalt: std(sets.asphalt, {}, { ground: 0, streaks: 0, dust: 0.12, macro: 0.8 }, true),
    pavers: std(sets.pavers, {}, { ground: 0, streaks: 0, dust: 0.25, macro: 0.8 }, true),
    metal: std(sets.metal, {}, { ground: 0.5, streaks: 0.4, dust: 0.3, protectRust: 1 }),
    carpaint: std(sets.car, { roughness: 0.6 }, { ground: 0.7, streaks: 0.2, dust: 0.6, protectRust: 1 }),
    corrugated: std(sets.corrugated, {}, { ground: 0.5, streaks: 0.3, dust: 0.2, protectRust: 1 }),
    wood: std(sets.wood, {}, { ground: 0.5, streaks: 0.3, dust: 0.3 }, true),
    tiles: std(sets.tiles, {}, { ground: 0, streaks: 0, dust: 0.35, macro: 1.0 }, true),
    dirt: std(sets.dirt, {}, { ground: 0, streaks: 0, dust: 0, macro: 0.7 }, true),
    fabric: std(sets.fabric, {}, { ground: 0.6, streaks: 0, dust: 0.35 }, true),
    far: std(sets.far, {}, { ground: 0.3, streaks: 0.5, dust: 0, macro: 0.5 }, true),
    // vidro: escuro e liso, reflexo vem do envmap; sujeira por rugosidade
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
  return { mats, sets, genMs };
}

/** Superfície de impacto/passos (convenção do CONTRACT) por material de render. */
export const SURFACE = {
  plaster: 'concrete', plasterIn: 'concrete', concrete: 'concrete', brick: 'brick', asphalt: 'asphalt',
  pavers: 'concrete', metal: 'metal', carpaint: 'metal', corrugated: 'metal', wood: 'wood', tiles: 'concrete',
  dirt: 'dirt', fabric: 'dirt', far: 'concrete', glass: 'glass', room: 'concrete', rubber: 'rubber',
  plastic: 'plastic', black: 'metal', cable: 'metal', chrome: 'metal', light: 'glass',
};

