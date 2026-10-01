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
    uEdge: { value: new THREE.Vector2(...(opts.edge ?? [220, 700])) },
    uScratch: { value: opts.scratch ?? 0.6 },
    uGrime: { value: opts.grime ?? 0.35 },
    uRoughVar: { value: opts.roughVar ?? 0.18 },
    uBump: { value: opts.bump ?? (kind === 'hard' ? 0.3 : 0.6) },
    uDust: { value: opts.dust ?? 0.12 },
    uDustColor: { value: new THREE.Color(opts.dustColor ?? 0x6e665a) },
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
uniform float uScale, uCamoScale, uWear, uWearMetal, uScratch, uGrime, uRoughVar, uBump, uDust;
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
    float wear = edge * smoothstep(0.62, 0.35, wearN - edge * 0.25) * uWear;
    float scratch = wD.g * wD.g * uScratch * smoothstep(0.35, 0.8, wD.b + 0.1) * 0.6;
    wMask = clamp(max(wear, scratch * 0.85), 0.0, 1.0);
    diffuseColor.rgb *= mix(1.0, 0.7 + 0.6 * wD.b, uGrime);
    float up = smoothstep(0.55, 0.95, oN.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor, up * uDust * (0.4 + 0.6 * wD.a));
    diffuseColor.rgb = mix(diffuseColor.rgb, uWearColor, wMask);
    wH = wD.r * 0.2 - wD.g * 0.6;
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
  roughnessFactor = clamp(roughnessFactor + (wD.r - 0.5) * uRoughVar + wD.b * uGrime * 0.12 - wMask * ${kind === 'hard' ? '0.3' : '-0.1'}, 0.05, 1.0);
  ${kind === 'hard' ? 'metalnessFactor = mix(metalnessFactor, uWearMetal, wMask);' : ''}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
  normal = wPerturb(-vViewPosition, normal, vec2(dFdx(wH), dFdy(wH)) * uBump, faceDirection);`,
      );
  };
  mat.customProgramCacheKey = () => 'wdetail-' + kind;
  return mat;
}

/** Biblioteca de materiais compartilhados da arma e dos braços. */
export function makeMaterials() {
  const std = (p, d) => withDetail(new THREE.MeshStandardMaterial(p), d);
  const M = {
    // receptor de alumínio anodizado tipo III, preto acinzentado
    receiver: std({ color: 0x3b3c3f, roughness: 0.42, metalness: 0.5 }, { wear: 0.9, wearColor: 0x9a978f, scratch: 0.55, grime: 0.3 }),
    // guarda-mão / coronha em cerakote "coyote" (cerâmica fosca)
    tan: std({ color: 0x7c6a52, roughness: 0.58, metalness: 0.08 }, { wear: 0.7, wearColor: 0x8d877c, wearMetal: 0.75, scratch: 0.45, grime: 0.4, dust: 0.3 }),
    // polímero (punho, carregador, coronha)
    polymer: std({ color: 0x302f2d, roughness: 0.62, metalness: 0.0 }, { wear: 0.35, wearColor: 0x3a3936, wearMetal: 0.0, scratch: 0.3, grime: 0.3, roughVar: 0.22, bump: 0.8 }),
    // aço fosfatizado (cano, ferrolho, pinos)
    steel: std({ color: 0x4a4a4c, roughness: 0.36, metalness: 0.9 }, { wear: 1.0, wearColor: 0xb4b2ac, wearMetal: 1.0, scratch: 0.7, grime: 0.35 }),
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
    new THREE.MeshPhysicalMaterial({ color: 0x48463f, roughness: 0.82, metalness: 0, sheen: 0.35, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x3a3a34) }),
    { kind: 'fabric', scale: 70, wear: 0.4, wearColor: 0x6c6a62, grime: 0.5, bump: 1.4 },
  );
  M.gloveLeather = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x4e4134, roughness: 0.6, metalness: 0, sheen: 0.2, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x3a3028) }),
    { kind: 'fabric', scale: 18, wear: 0.5, wearColor: 0x5e5244, grime: 0.6, bump: 0.5 },
  );
  M.knuckle = std({ color: 0x32332f, roughness: 0.5, metalness: 0.0 }, { wear: 0.5, wearColor: 0x4a4a46, wearMetal: 0.0, scratch: 0.4, grime: 0.3, bump: 0.7 });
  M.sleeve = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x4a4638) }),
    { kind: 'camo', scale: 45, camoScale: 2.4, wear: 0.25, wearColor: 0x9a927c, grime: 0.55, bump: 1.6 },
  );
  M.strap = withDetail(
    new THREE.MeshPhysicalMaterial({ color: 0x3b3a30, roughness: 0.8, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x605e50) }),
    { kind: 'fabric', scale: 90, wear: 0.3, grime: 0.4, bump: 1.2 },
  );
  return M;
}
