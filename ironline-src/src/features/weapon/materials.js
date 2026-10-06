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

// Painéis da luva (atributo `glove` = [couro, costura] por vértice):
// tecido com trama em relevo forte × couro sintético de grão fino e liso;
// costuras pespontadas (pontos de ~2,5 mm em relevo, linha um tom mais clara)
const GLOVE_GLSL = /* glsl */ `
    float gLea = clamp(vGlove.x, 0.0, 1.0);
    float gSeam = smoothstep(0.25, 0.75, vGlove.y);
    // couro: grão fino (poros) em vez da trama
    float grain = wTri(tDetail, vWObj * uScale * 0.37, bw).g;
    wH = mix(wH, grain * 0.35 + wD.b * 0.15, gLea);
    // pesponto: traços ao longo da costura (coordenada = soma dos eixos locais)
    float ph = fract((vWObj.x * 0.6 + vWObj.y * 0.3 + vWObj.z) * 400.0);
    gStitch = gSeam * smoothstep(0.15, 0.3, ph) * smoothstep(0.85, 0.7, ph);
    wH += gStitch * 1.4 - gSeam * 0.5;
    diffuseColor.rgb *= 1.0 + gStitch * 0.9;
    diffuseColor.rgb *= mix(1.0, 0.92 + 0.12 * wD.b, gLea);
`;

/**
 * Camada de PINTURA da skin (dentro do detalhe "hard", antes do desgaste):
 *  - cor do padrão (textura tileável de patterns.js) amostrada em TRIPLANAR no
 *    espaço do objeto, girada/deslocada/escalada pela seed; modo 1 = degradê
 *    ao longo do comprimento (−Z) com um leve viés vertical;
 *  - perda de tinta pelo float: quinas (curvatura de tela) descascam primeiro,
 *    depois manchas grandes e arranhões; `uSkinZone` = quanto a peça gasta
 *    além da base (punho/carregador/gatilho > corpo);
 *  - onde a tinta saiu na QUINA aparece metal vivo (wMask); nas manchas
 *    aparece o acabamento de fábrica por baixo (a cor anterior);
 *  - acabamento (metalness/roughness) próprio onde há tinta; alfa do padrão =
 *    emissivo (brasa).
 */
const SKIN_GLSL = /* glsl */ `
    if (uSkinOn > 0.5) {
      vec3 sp = vWObj;
      float cr = cos(uSkinXf.w), sr = sin(uSkinXf.w);
      sp.xy = mat2(cr, sr, -sr, cr) * sp.xy;
      sp.yz = mat2(cr, -sr, sr, cr) * sp.yz;
      sp = sp * uSkinScale + uSkinXf.xyz;
      vec4 sc;
      if (uSkinMode < 0.5) {
        sc = texture(tSkin, sp.yz) * bw.x + texture(tSkin, sp.xz) * bw.y + texture(tSkin, sp.xy) * bw.z;
      } else {
        float f = (uSkinFade.x - vWObj.z) / max(uSkinFade.y, 1e-4) + vWObj.y * 0.9 / max(uSkinFade.y, 1e-4);
        f = clamp(f * 0.85 + uSkinFade.z + (wD.r - 0.5) * 0.04, 0.0, 1.0);
        sc = texture(tSkin, vec2(f, 0.5));
      }
      float wnoise = wD.b * 0.6 + wD.r * 0.4;
      float sEdge = edge * smoothstep(0.78, 0.3, wnoise - uSkinWear.x * 0.5) * clamp(uSkinWear.x * 1.7, 0.0, 1.0);
      float sBlot = smoothstep(0.86 - uSkinWear.y * 0.36, 0.9 - uSkinWear.y * 0.34, wD.b) * clamp(uSkinWear.y * 2.0, 0.0, 1.0);
      float sScr = wD.g * wD.g * uSkinWear.z * smoothstep(0.3, 0.8, wD.b + 0.15);
      float sLoss = clamp(max(max(sEdge, sBlot), sScr * 1.1) * uSkinZone, 0.0, 1.0);
      sPaint = 1.0 - sLoss;
      vec3 paint = sc.rgb * mix(1.0, 0.72 + 0.56 * wD.b, uSkinWear.w * 0.45);
      diffuseColor.rgb = mix(diffuseColor.rgb, paint, sPaint);
      sEmis = sc.rgb * sc.a * uSkinFin.z * sPaint;
      // metal vivo só onde a tinta saiu na quina / no arranhão
      wMask = clamp(max(sEdge * uSkinZone, sScr * 0.9) * (1.0 - sBlot * 0.7), 0.0, 1.0);
    }`;

let _blank = null;
/** Textura 1×1 branca (skin desligada). */
function blankSkin() {
  if (!_blank) {
    _blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1, THREE.RGBAFormat);
    _blank.needsUpdate = true;
  }
  return _blank;
}
/** Uniforms de oclusão isolados e zerados (prévias fora da viewmodel). */
function isolatedOcc() {
  return {
    uOccA: { value: Array.from({ length: OCC_MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uOccB: { value: Array.from({ length: OCC_MAX }, () => new THREE.Vector3()) },
    uOccN: { value: 0 },
    uOccK: { value: 1 },
    uIblSat: { value: 0.8 },
  };
}

/**
 * Clona um material com detalhe (parâmetros PBR + opções do detalhe). As
 * texturas de detalhe são cacheadas, então o clone é barato. `extra` soma
 * opções (ex.: { noOcc: true } para prévias, { zone } para o desgaste).
 */
export function cloneDetail(mat, extra = {}) {
  const ud = mat.userData;
  mat.userData = {};
  const c = mat.clone();
  mat.userData = ud;
  c.userData = {};
  if (!ud.detailOpts) return c;
  return withDetail(c, { ...ud.detailOpts, ...extra });
}

/**
 * Aplica o detalhe procedural a um material padrão/físico.
 * opts.kind: 'hard' | 'fabric' | 'camo'
 */
export function withDetail(mat, opts = {}) {
  const kind = opts.kind || 'hard';
  const panels = !!opts.panels;
  // oclusão de contato: as cápsulas valem só na viewmodel; prévias (inventário)
  // usam uniforms próprios zerados (senão as mãos "sombreariam" a prévia)
  const occ = opts.noOcc ? isolatedOcc() : OCC;
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
    // ─ camada de pintura (skin) — ver skin.js; desligada por padrão ─
    tSkin: { value: blankSkin() },
    uSkinOn: { value: 0 },
    uSkinMode: { value: 0 },
    uSkinScale: { value: 4 },
    uSkinXf: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSkinFade: { value: new THREE.Vector3(0, 1, 0) },
    uSkinWear: { value: new THREE.Vector4(0, 0, 0.1, 0.1) },
    uSkinFin: { value: new THREE.Vector3(0.3, 0.5, 0) },
    uSkinZone: { value: opts.zone ?? 1 },
    ...occ,
  };
  mat.userData.detail = u;
  mat.userData.detailOpts = { ...opts };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWObj;\nvarying vec3 vWObjN;' + (panels ? '\nattribute vec2 glove;\nvarying vec2 vGlove;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWObj = position;\nvWObjN = normal;' + (panels ? '\nvGlove = glove;' : ''));
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
uniform sampler2D tSkin;
uniform float uSkinOn, uSkinMode, uSkinScale, uSkinZone;
uniform vec4 uSkinXf, uSkinWear;
uniform vec3 uSkinFade, uSkinFin;
float sPaint = 0.0;
vec3 sEmis = vec3(0.0);
${panels ? 'varying vec2 vGlove;' : ''}
float wMask = 0.0;
float wH = 0.0;
float gStitch = 0.0;
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
    ${SKIN_GLSL}
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
    ${panels ? GLOVE_GLSL : ''}
  }`;
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', pars)
      .replace('#include <map_fragment>', '#include <map_fragment>' + detail)
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
  // pintura da skin: acabamento próprio (metalizado/fosco/brilhante) onde há tinta
  if (uSkinOn > 0.5) {
    metalnessFactor = mix(metalnessFactor, uSkinFin.x, sPaint);
    roughnessFactor = mix(roughnessFactor, uSkinFin.y, sPaint);
  }
  roughnessFactor = clamp(roughnessFactor + (wStreak - 0.5) * uStreak + (wD.r - 0.5) * uRoughVar + wD.b * uGrime * 0.12 - wMask * ${kind === 'hard' ? '0.16' : '-0.1'}, 0.05, 1.0);
  ${panels ? '// couro sintético: mais liso e acetinado que o tecido\n  roughnessFactor = clamp(roughnessFactor - vGlove.x * 0.3 + gStitch * 0.15, 0.05, 1.0);' : ''}
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
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>' + OCC_GLSL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += sEmis;');
  };
  mat.customProgramCacheKey = () => 'wdetail3-' + kind + (panels ? '-panels' : '');
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
    receiver: std({ color: 0x3b3b3a, roughness: 0.46, metalness: 0.4 }, { wear: 0.95, wearColor: 0x8e8c87, wearBoost: 1.0, wearMetal: 1.0, scratch: 0.38, grime: 0.36, roughVar: 0.32, dust: 0.2, smudge: 0.6, streak: 0.22, edge: [60, 260] }),
    // guarda-mão / coronha: cerakote "tungstênio" (cerâmica fosca, um tom
    // acima do anodizado — separa as peças pelo valor e pela rugosidade)
    tan: std({ color: 0x625849, roughness: 0.7, metalness: 0.03 }, { wear: 0.9, wearColor: 0x84817a, wearMetal: 0.85, scratch: 0.3, grime: 0.4, dust: 0.28, roughVar: 0.2, bump: 0.5, smudge: 0.3, edge: [70, 300] }),
    // polímero com textura de pegada (punho, carregador, empunhadura)
    polymer: std({ color: 0x2d2c2a, roughness: 0.78, metalness: 0.0 }, { wear: 0.45, wearColor: 0x343331, wearMetal: 0.0, scratch: 0.25, grime: 0.3, roughVar: 0.25, bump: 1.1, smudge: 0.7, scale: 9 }),
    // trilhos Picatinny: mesmo anodizado, desgaste em ruído de alta frequência
    // (cada dente gasta diferente) e mais contido — nada de "zebra" branca
    rail: std({ color: 0x383837, roughness: 0.46, metalness: 0.4 }, { wear: 0.85, wearColor: 0x76746f, wearMetal: 1.0, scratch: 0.35, grime: 0.45, scale: 19, smudge: 0.3, edge: [140, 520] }),
    // aço fosfatizado (cano, pinos, parafusos)
    steel: std({ color: 0x353534, roughness: 0.4, metalness: 0.85 }, { wear: 0.85, wearColor: 0x9a9893, wearMetal: 1.0, scratch: 0.4, grime: 0.35, streak: 0.18, edge: [70, 300] }),
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
    new THREE.MeshPhysicalMaterial({ color: 0x272624, roughness: 0.82, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x45433d) }),
    { kind: 'fabric', scale: 140, wear: 0.4, wearColor: 0x5f5b52, grime: 0.6, bump: 0.6 },
  );
  // luva anatômica (arms.js): albedo dos painéis vem das cores de vértice
  // (tecido coyote no dorso, couro sintético na palma/pontas, TPU nos nós)
  M.gloveV = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0, sheen: 0.4, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x4d473d) }),
    { kind: 'fabric', scale: 150, wear: 0.35, wearColor: 0x6a6253, grime: 0.5, bump: 0.55, panels: true },
  );
  M.gloveLeather = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x23201d, roughness: 0.62, metalness: 0, sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x3a3028) }),
    { kind: 'fabric', scale: 18, wear: 0.5, wearColor: 0x5e5244, grime: 0.6, bump: 0.5 },
  );
  // protetor de nós: TPU moldado cinza-escuro (contraste com o tecido coyote —
  // é o que faz a mão "ler" como mão a 1080p)
  M.knuckle = std({ color: 0x1b1b1a, roughness: 0.6, metalness: 0.0 }, { wear: 0.5, wearColor: 0x55524c, wearMetal: 0.0, scratch: 0.4, grime: 0.3, bump: 0.7 });
  M.sleeve = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0xa9a8a0, roughness: 0.9, metalness: 0, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x4a4638) }),
    { kind: 'camo', scale: 150, camoScale: 6, wear: 0.25, wearColor: 0x8a8370, grime: 0.55, bump: 0.8 },
  );
  M.strap = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x3a372f, roughness: 0.8, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x5a564a) }),
    { kind: 'fabric', scale: 90, wear: 0.3, grime: 0.4, bump: 1.2 },
  );
  // ─── pistola P-11 ───────────────────────────────────────────────────
  // ferrolho de aço nitretado (preto-grafite, acetinado; quinas gastas claras)
  M.slide = std({ color: 0x2b2b2a, roughness: 0.4, metalness: 0.7 }, { wear: 0.95, wearColor: 0x9c9a95, wearBoost: 1, wearMetal: 1, scratch: 0.45, grime: 0.32, roughVar: 0.28, dust: 0.15, smudge: 0.65, streak: 0.25, edge: [60, 260] });
  // armação de polímero cor terra (FDE), fosca com textura fina
  M.frame = std({ color: 0x5b5042, roughness: 0.74, metalness: 0.0 }, { wear: 0.45, wearColor: 0x756b5b, wearMetal: 0.0, scratch: 0.25, grime: 0.42, roughVar: 0.22, bump: 0.9, smudge: 0.7, scale: 9, dust: 0.2 });
  // pontilhado do punho: mesmo polímero, relevo forte e mais áspero
  M.stipple = std({ color: 0x544a3d, roughness: 0.88, metalness: 0.0 }, { wear: 0.3, wearColor: 0x6e6555, wearMetal: 0.0, scratch: 0.1, grime: 0.5, roughVar: 0.3, bump: 3.2, scale: 38, dust: 0.25 });
  // pontos das miras (tinta clara fotoluminescente) e anel laranja da dianteira
  M.dot = new THREE.MeshStandardMaterial({ color: 0xd9d8cc, roughness: 0.45, emissive: new THREE.Color(0.05, 0.06, 0.045) });
  M.sightRing = new THREE.MeshStandardMaterial({ color: 0xe0601a, roughness: 0.4, emissive: new THREE.Color(0.12, 0.03, 0.0) });
  // ─── faca e granadas ────────────────────────────────────────────────
  // lâmina com revestimento escuro (DLC) e fio afiado (aço vivo escovado)
  M.blade = std({ color: 0x262626, roughness: 0.38, metalness: 0.8 }, { wear: 0.9, wearColor: 0xa4a29c, wearMetal: 1, scratch: 0.6, grime: 0.25, streak: 0.4, edge: [50, 220] });
  M.edge = std({ color: 0xb4b4b0, roughness: 0.22, metalness: 1.0 }, { wear: 0.1, scratch: 0.5, grime: 0.15, streak: 0.6 });
  // granada: tinta verde-oliva semibrilho sobre aço; faixa amarela
  M.nade = std({ color: 0x3f4430, roughness: 0.55, metalness: 0.15 }, { wear: 0.85, wearColor: 0x8a877d, wearMetal: 0.9, scratch: 0.5, grime: 0.45, dust: 0.2, edge: [40, 200] });
  M.nadeMetal = std({ color: 0x4a4c45, roughness: 0.45, metalness: 0.6 }, { wear: 0.7, wearColor: 0x9a978f, scratch: 0.5, grime: 0.4 });
  M.band = std({ color: 0xb08a1c, roughness: 0.5, metalness: 0.05 }, { wear: 0.6, wearColor: 0x8a877d, wearMetal: 0.8, scratch: 0.5, grime: 0.4 });
  // ─── armas novas (v3) ───────────────────────────────────────────────
  // corpo de luneta/ótica: alumínio anodizado preto fosco, um pouco mais liso
  M.scope = std({ color: 0x1e1f20, roughness: 0.42, metalness: 0.45 }, { wear: 0.7, wearColor: 0x8c8a85, wearMetal: 1.0, scratch: 0.3, grime: 0.25, roughVar: 0.2, smudge: 0.5, edge: [70, 300] });
  // base/anéis de luneta (anodizado cinza-grafite)
  M.mount = std({ color: 0x343537, roughness: 0.45, metalness: 0.5 }, { wear: 0.9, wearColor: 0x9a9893, wearMetal: 1.0, scratch: 0.4, grime: 0.3, edge: [60, 260] });
  // supressor: cerakote grafite com azulado de calor perto da boca (via grime)
  M.suppressor = std({ color: 0x2e2f30, roughness: 0.62, metalness: 0.3 }, { wear: 0.7, wearColor: 0x8a8780, wearMetal: 0.9, scratch: 0.3, grime: 0.55, dust: 0.15, bump: 0.6, edge: [60, 260] });
  // aço inox acetinado (lâminas claras, pinos de faca)
  M.satin = std({ color: 0x9c9d9b, roughness: 0.3, metalness: 1.0 }, { wear: 0.35, wearColor: 0xc9c9c5, wearMetal: 1, scratch: 0.75, grime: 0.12, streak: 0.55, edge: [50, 220] });
  // madeira (cabo do kukri/cutelo; telha do BR-12 não usa): nogueira oleada
  M.wood = std({ color: 0x4b2d1b, roughness: 0.55, metalness: 0 }, { wear: 0.5, wearColor: 0x7a5534, wearMetal: 0, scratch: 0.25, grime: 0.5, bump: 0.7, streak: 0.8, roughVar: 0.3, scale: 6 });
  // G10 texturizado (cabos de faca)
  M.g10 = std({ color: 0x23272a, roughness: 0.74, metalness: 0 }, { wear: 0.45, wearColor: 0x4a4f53, wearMetal: 0, scratch: 0.2, grime: 0.35, bump: 1.8, scale: 34, roughVar: 0.3 });
  // micarta de linho (cabo da baioneta/tanto): fibra marrom-oliva
  M.micarta = std({ color: 0x3e3a2a, roughness: 0.68, metalness: 0 }, { wear: 0.5, wearColor: 0x6a6450, wearMetal: 0, scratch: 0.2, grime: 0.45, bump: 1.1, scale: 20, streak: 0.35 });
  // alumínio anodizado (cabos da balisong)
  M.alu = std({ color: 0x5c6166, roughness: 0.36, metalness: 1.0 }, { wear: 0.7, wearColor: 0xc0c3c5, wearMetal: 1, scratch: 0.55, grime: 0.18, streak: 0.35, edge: [60, 240] });
  // cartucho 12: casca de plástico vermelho-escuro (base de latão usa M.brass)
  M.hull = std({ color: 0x7a1712, roughness: 0.48, metalness: 0 }, { wear: 0.4, wearColor: 0x9a4a40, wearMetal: 0, scratch: 0.3, grime: 0.3, bump: 0.4 });
  // fita (elos de aço) da HM-60
  M.link = std({ color: 0x2c2c2a, roughness: 0.5, metalness: 0.85 }, { wear: 0.9, wearColor: 0x8a8780, scratch: 0.5, grime: 0.5, edge: [40, 200] });
  // bolsa/caixa de munição em cordura
  M.pouch = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x3b3a2c, roughness: 0.86, metalness: 0, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x5a5642) }),
    { kind: 'fabric', scale: 110, wear: 0.35, wearColor: 0x6b6650, grime: 0.55, bump: 1.0 },
  );
  return M;
}
