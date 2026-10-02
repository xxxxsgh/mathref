/**
 * Materiais PBR da viewmodel com detalhe procedural injetado no shader padrão
 * do three (onBeforeCompile) — continuam recebendo IBL, sombras e luzes.
 *
 * Detalhe "hard surface" (metal anodizado, aço fosfatizado, polímero):
 *  - amostragem TRIPLANAR no espaço do objeto (sem depender de UV);
 *  - DESGASTE DE QUINA: a curvatura é estimada na tela por
 *    |fwidth(normal)| / |fwidth(posição)| — chanfros pequenos (raio de 1–2 mm)
 *    têm curvatura alta e ganham metal exposto, mais claro e polido;
 *  - arranhões finos (canal G) com relevo, manchas de óleo/sujeira (B),
 *    variação de rugosidade (R) e poeira assentada nas faces de cima (A).
 *
 * Detalhe "tecido" (luvas, mangas): trama de cordura com relevo forte,
 * fiapos, abrasão clara e brilho de fibra (sheen do MeshPhysicalMaterial).
 */
import * as THREE from 'three';
import { grimeTexture, fabricTexture, camoTexture } from './textures.js';

// ─── oclusão de contato analítica (compartilhada por todos os materiais) ──
// Cápsulas (a, b, raio) no espaço de VISÃO da câmera da viewmodel, atualizadas
// a cada frame pela feature: palmas, guarda-mão, empunhaduras, base da ótica,
// carregador… Cada fragmento soma a oclusão de esfera de Quílez
// (r²/d² · max(n·l, 0)) contra o ponto mais próximo de cada cápsula: a mão
// escurece o guarda-mão onde encosta, a ótica sombreia o trilho, os dedos
// ficam escuros entre si e no contato com o polímero. Superfícies do próprio
// ocluidor têm n·l < 0 e não se escurecem.
export const OCC_MAX = 12;
export const OCC = {
  uOccA: { value: Array.from({ length: OCC_MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uOccB: { value: Array.from({ length: OCC_MAX }, () => new THREE.Vector3()) },
  uOccN: { value: 0 },
  uOccK: { value: 1 },
  // saturação da luz indireta (IBL do céu): o céu azul tingia a arma inteira
  // de azul-acinzentado; a arma fica neutra e o sol/rebatimento dão a cor
  uIblSat: { value: 0.45 },
};
const OCC_GLSL = /* glsl */ `
  {
    vec3 oP = -vViewPosition;
    vec3 oNrm = normalize(normal);
    float occ = 1.0;
    for (int i = 0; i < ${OCC_MAX}; i++) {
      if (i >= uOccN) break;
      vec3 a = uOccA[i].xyz;
      float r = uOccA[i].w;
      vec3 ab = uOccB[i] - a;
      float t = clamp(dot(oP - a, ab) / max(dot(ab, ab), 1e-10), 0.0, 1.0);
      vec3 L = a + ab * t - oP;
      float d = max(length(L), 1e-5);
      float o = clamp(dot(oNrm, L / d), 0.0, 1.0) * (r * r) / (d * d);
      occ *= 1.0 - clamp(o, 0.0, 0.92);
    }
    occ = mix(1.0, occ, uOccK);
    vec3 lw = vec3(0.2126, 0.7152, 0.0722);
    reflectedLight.indirectDiffuse = mix(vec3(dot(reflectedLight.indirectDiffuse, lw)), reflectedLight.indirectDiffuse, uIblSat);
    reflectedLight.indirectSpecular = mix(vec3(dot(reflectedLight.indirectSpecular, lw)), reflectedLight.indirectSpecular, mix(uIblSat, 1.0, 0.35));
    reflectedLight.indirectDiffuse *= occ;
    reflectedLight.indirectSpecular *= mix(1.0, occ, 0.85);
    reflectedLight.directDiffuse *= mix(1.0, occ, 0.4);
    reflectedLight.directSpecular *= mix(1.0, occ, 0.5);
  }`;

const PERTURB = /* glsl */ `
vec3 wPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos));
  vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
vec4 wTri(sampler2D t, vec3 p, vec3 bw) {
  return texture(t, p.yz) * bw.x + texture(t, p.xz) * bw.y + texture(t, p.xy) * bw.z;
}
`;

/**
 * Aplica o detalhe procedural a um material padrão/físico.
 * opts.kind: 'hard' | 'fabric' | 'camo'
 */
export function withDetail(mat, opts = {}) {
  const kind = opts.kind || 'hard';
  const u = {
    tDetail: { value: kind === 'hard' ? grimeTexture() : fabricTexture() },
    tCamo: { value: kind === 'camo' ? camoTexture() : null },
    uScale: { value: opts.scale ?? (kind === 'hard' ? 5.5 : 55) },
    uCamoScale: { value: opts.camoScale ?? 2.2 },
    uWear: { value: opts.wear ?? 0.8 },
    uWearColor: { value: new THREE.Color(opts.wearColor ?? 0x8a8780) },
    uWearMetal: { value: opts.wearMetal ?? 0.9 },
    uEdge: { value: new THREE.Vector2(...(opts.edge ?? [90, 340])) },
    uScratch: { value: opts.scratch ?? 0.6 },
    uGrime: { value: opts.grime ?? 0.35 },
    uRoughVar: { value: opts.roughVar ?? 0.18 },
    uBump: { value: opts.bump ?? (kind === 'hard' ? 0.3 : 0.6) },
    uDust: { value: opts.dust ?? 0.12 },
    uSmudge: { value: opts.smudge ?? 0.0 },
    uDustColor: { value: new THREE.Color(opts.dustColor ?? 0x6e665a) },
    uStreak: { value: opts.streak ?? 0 },
    uWearBoost: { value: opts.wearBoost ?? 1 },
    ...OCC,
  };
  mat.userData.detail = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWObj;\nvarying vec3 vWObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWObj = position;\nvWObjN = normal;');
    const pars = `#include <common>
varying vec3 vWObj;
varying vec3 vWObjN;
uniform sampler2D tDetail;
uniform sampler2D tCamo;
uniform float uScale, uCamoScale, uWear, uWearMetal, uScratch, uGrime, uRoughVar, uBump, uDust, uSmudge, uStreak, uWearBoost;
uniform vec4 uOccA[${OCC_MAX}];
uniform vec3 uOccB[${OCC_MAX}];
uniform int uOccN;
uniform float uOccK;
uniform float uIblSat;
float wStreak = 0.5;
uniform vec3 uWearColor, uDustColor;
uniform vec2 uEdge;
float wMask = 0.0;
float wH = 0.0;
vec4 wD = vec4(0.5);
${PERTURB}`;
    let detail;
    if (kind === 'hard') {
      detail = /* glsl */ `
  {
    vec3 oN = normalize(vWObjN);
    vec3 bw = pow(abs(oN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    wD = wTri(tDetail, vWObj * uScale, bw);
    vec3 nV = normalize(vNormal);
    float curv = length(fwidth(nV)) / max(length(fwidth(vViewPosition)), 1e-6);
    float edge = smoothstep(uEdge.x, uEdge.y, curv);
    float wearN = wD.b * 0.65 + wD.r * 0.35;
    float wear = edge * smoothstep(0.66, 0.3, wearN - edge * 0.3) * uWear;
    // usinagem: estrias finas ao longo do cano (−Z) — o brilho "anisotrópico"
    // do alumínio fresado/anodizado (rugosidade varia em linhas paralelas)
    wStreak = texture(tDetail, vec2(vWObj.z * 1.3, (vWObj.y + vWObj.x * 0.7) * 95.0)).r;
    float scratch = wD.g * wD.g * uScratch * smoothstep(0.35, 0.8, wD.b + 0.1) * 0.6;
    wMask = clamp(max(wear, scratch * 0.85), 0.0, 1.0);
    diffuseColor.rgb *= mix(1.0, 0.7 + 0.6 * wD.b, uGrime);
    float up = smoothstep(0.55, 0.95, oN.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor, up * uDust * (0.4 + 0.6 * wD.a));
    diffuseColor.rgb = mix(diffuseColor.rgb, uWearColor * uWearBoost, wMask);
    wH = wD.r * 0.2 - wD.g * 0.6 + (wStreak - 0.5) * uStreak * 0.25;
  }`;
    } else {
      detail = /* glsl */ `
  {
    vec3 oN = normalize(vWObjN);
    vec3 bw = pow(abs(oN), vec3(3.0)); bw /= (bw.x + bw.y + bw.z);
    wD = wTri(tDetail, vWObj * uScale, bw);
    ${kind === 'camo' ? 'diffuseColor.rgb *= wTri(tCamo, vWObj * uCamoScale, bw).rgb;' : ''}
    diffuseColor.rgb *= mix(1.0, 0.82 + 0.36 * wD.b, uGrime) * (0.86 + 0.28 * wD.r);
    // abrasão: fibras claras gastas
    wMask = wD.a * uWear;
    diffuseColor.rgb = mix(diffuseColor.rgb, uWearColor, wMask * 0.35);
    wH = wD.r + wD.g * 0.25;
  }`;
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', pars)
      .replace('#include <map_fragment>', '#include <map_fragment>' + detail)
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + (wStreak - 0.5) * uStreak + (wD.r - 0.5) * uRoughVar + wD.b * uGrime * 0.12 - wMask * ${kind === 'hard' ? '0.3' : '-0.1'}, 0.05, 1.0);
  // digitais/óleo: manchas grandes mais lisas (brilho irregular no anodizado)
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, uSmudge * smoothstep(0.55, 0.8, wD.b) * (1.0 - wMask));
  // AA especular geométrico (Kaplanyan/Tokuyoshi): variância da normal na
  // tela alarga o lóbulo — quinas finas e dentes de trilho não cintilam
  {
    vec3 gN = normalize(vNormal);
    vec3 dnx = dFdx(gN), dny = dFdy(gN);
    float kv = min(0.18, 0.25 * (dot(dnx, dnx) + dot(dny, dny)));
    roughnessFactor = sqrt(clamp(roughnessFactor * roughnessFactor + kv, 0.0, 1.0));
  }
  ${kind === 'hard' ? 'metalnessFactor = mix(metalnessFactor, uWearMetal, wMask);' : ''}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  normal = wPerturb(-vViewPosition, normal, vec2(dFdx(wH), dFdy(wH)) * uBump, faceDirection);`,
      )
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + OCC_GLSL);
  };
  mat.customProgramCacheKey = () => 'wdetail2-' + kind;
  return mat;
}

/** Biblioteca de materiais compartilhados da arma e dos braços. */
export function makeMaterials() {
  const std = (p, d) => withDetail(new THREE.MeshStandardMaterial(p), d);
  const M = {
    // receptor de alumínio anodizado tipo III, preto acinzentado
    // (anodizado = camada de óxido tingida: responde como dielétrico escuro,
    // quase neutro; só a quina gasta mostra o alumínio claro por baixo)
    // receptor de alumínio 7075 anodizado tipo III (preto fosco-acetinado):
    // camada de óxido tingida → responde quase como dielétrico escuro, com
    // estrias de usinagem ao longo do cano; a quina gasta mostra o alumínio
    // claro e polido por baixo
    receiver: std({ color: 0x353535, roughness: 0.34, metalness: 0.4 }, { wear: 1.15, wearColor: 0xb9b7b1, wearBoost: 1.1, wearMetal: 1.0, scratch: 0.5, grime: 0.28, smudge: 0.55, streak: 0.22, edge: [70, 300] }),
    // guarda-mão / coronha: cerakote "tungstênio" (cerâmica fosca, um tom
    // acima do anodizado — separa as peças pelo valor e pela rugosidade)
    tan: std({ color: 0x54514b, roughness: 0.72, metalness: 0.05 }, { wear: 1.0, wearColor: 0x9c9890, wearMetal: 0.9, scratch: 0.45, grime: 0.4, dust: 0.28, roughVar: 0.2, bump: 0.5, smudge: 0.3, edge: [70, 300] }),
    // polímero com textura de pegada (punho, carregador, empunhadura)
    polymer: std({ color: 0x262625, roughness: 0.78, metalness: 0.0 }, { wear: 0.45, wearColor: 0x343331, wearMetal: 0.0, scratch: 0.25, grime: 0.3, roughVar: 0.25, bump: 1.1, smudge: 0.7, scale: 9 }),
    // trilhos Picatinny: mesmo anodizado, desgaste em ruído de alta frequência
    // (cada dente gasta diferente) e mais contido — nada de "zebra" branca
    rail: std({ color: 0x323232, roughness: 0.4, metalness: 0.4 }, { wear: 0.75, wearColor: 0x8f8d88, wearMetal: 1.0, scratch: 0.35, grime: 0.45, scale: 19, smudge: 0.3, edge: [140, 520] }),
    // aço fosfatizado (cano, pinos, parafusos)
    steel: std({ color: 0x383837, roughness: 0.34, metalness: 0.9 }, { wear: 1.1, wearColor: 0xc2c0ba, wearMetal: 1.0, scratch: 0.7, grime: 0.35, streak: 0.18, edge: [70, 300] }),
    // aço escurecido em brasa (freio de boca)
    burnt: std({ color: 0x252220, roughness: 0.5, metalness: 0.85 }, { wear: 0.7, wearColor: 0x9a8f80, scratch: 0.3, grime: 0.6 }),
    // alumínio vivo / cromado (interior do ferrolho, parafusos)
    bright: std({ color: 0x8c8c8c, roughness: 0.28, metalness: 1.0 }, { wear: 0.2, scratch: 0.4, grime: 0.25 }),
    // latão de cartucho
    brass: std({ color: 0xc89a4a, roughness: 0.28, metalness: 1.0 }, { wear: 0.3, wearColor: 0xe0c080, scratch: 0.35, grime: 0.25, dust: 0 }),
    // ponta de cobre do projétil
    copper: std({ color: 0xb06a42, roughness: 0.3, metalness: 1.0 }, { wear: 0.2, scratch: 0.2, grime: 0.2, dust: 0 }),
    // borracha (soleira, tampa de bateria)
    rubber: std({ color: 0x141414, roughness: 0.88, metalness: 0.0 }, { wear: 0.1, scratch: 0.1, grime: 0.25, roughVar: 0.1, bump: 1.2 }),
    // interior escuro (cavidades, janelas, slots) — quase preto, sem detalhe
    cavity: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9, metalness: 0.0 }),
  };
  // luva: tecido sintético escuro + palma de couro
  M.glove = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x6e5c47, roughness: 0.78, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x6a5a46) }),
    { kind: 'fabric', scale: 110, wear: 0.4, wearColor: 0x95856d, grime: 0.6, bump: 0.7 },
  );
  M.gloveLeather = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x4e4134, roughness: 0.6, metalness: 0, sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x3a3028) }),
    { kind: 'fabric', scale: 18, wear: 0.5, wearColor: 0x5e5244, grime: 0.6, bump: 0.5 },
  );
  // protetor de nós: TPU moldado cinza-escuro (contraste com o tecido coyote —
  // é o que faz a mão "ler" como mão a 1080p)
  M.knuckle = std({ color: 0x2a2826, roughness: 0.55, metalness: 0.0 }, { wear: 0.5, wearColor: 0x55524c, wearMetal: 0.0, scratch: 0.4, grime: 0.3, bump: 0.7 });
  M.sleeve = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x4a4638) }),
    { kind: 'camo', scale: 60, camoScale: 10, wear: 0.25, wearColor: 0x9a927c, grime: 0.55, bump: 1.6 },
  );
  M.strap = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x4f4334, roughness: 0.8, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x6a5c48) }),
    { kind: 'fabric', scale: 90, wear: 0.3, grime: 0.4, bump: 1.2 },
  );
  return M;
}
