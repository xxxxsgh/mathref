/**
 * Materiais do sistema ship.
 *
 * `createPanelMaterial` — MeshStandardMaterial (PBR do three, sombras, IBL,
 * CSM do render) com:
 *   • cor por vértice (pintura de cada peça) e atributo aSurf
 *     (metalness, roughness, desgaste, painéis) por vértice;
 *   • detalhe TRIPLANAR no espaço do objeto: sulcos de painéis, rebites,
 *     grelhas (normal map), sujeira nos sulcos, lascas na pintura que
 *     revelam metal nu (metalness 1, rugosidade baixa).
 * Uma única chamada de desenho para o casco inteiro.
 */
import * as THREE from 'three';

const VERT_PARS = /* glsl */ `
attribute vec4 aSurf;
varying vec4 vSurf;
varying vec3 vObjPos;
varying vec3 vObjNrm;
`;
const VERT_MAIN = /* glsl */ `
vSurf = aSurf;
vObjPos = position;
vObjNrm = normal;
`;

const FRAG_PARS = /* glsl */ `
uniform sampler2D tPanel;
uniform sampler2D tPanelN;
uniform float uPanelScale;
uniform float uGrime;
uniform float uWear;
uniform float uNormalStr;
uniform vec3 uBare;
uniform float uHeat;
uniform vec3 uHeatDir;
uniform vec3 uCutMin;
uniform vec3 uCutMax;
uniform mat3 normalMatrix;
varying vec4 vSurf;
varying vec3 vObjPos;
varying vec3 vObjNrm;
vec3 triW(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / (w.x + w.y + w.z + 1e-5);
}
vec4 triSample(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}
`;

/**
 * @param {object} o  { detail, normal (texturas), scale (repetições por m), grime, wear, normalStrength, envIntensity }
 */
export function createPanelMaterial(o = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    envMapIntensity: o.envIntensity ?? 1,
  });
  const uniforms = {
    tPanel: { value: o.detail },
    tPanelN: { value: o.normal },
    uPanelScale: { value: o.scale ?? 0.42 },
    uGrime: { value: o.grime ?? 1 },
    uWear: { value: o.wear ?? 1 },
    uNormalStr: { value: o.normalStrength ?? 1 },
    uBare: { value: new THREE.Color(0.56, 0.57, 0.6) },
    // calor de reentrada: direção do vento relativo no espaço do objeto
    uHeat: { value: 0 },
    uHeatDir: { value: new THREE.Vector3(0, 0, -1) },
    // recorte (cockpit visto de dentro): fragmentos dentro da caixa somem
    uCutMin: { value: o.cutBox ? o.cutBox[0].clone() : new THREE.Vector3(1e9, 1e9, 1e9) },
    uCutMax: { value: o.cutBox ? o.cutBox[1].clone() : new THREE.Vector3(-1e9, -1e9, -1e9) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        if (all(greaterThan(vObjPos, uCutMin)) && all(lessThan(vObjPos, uCutMax))) discard;
        vec3 tP = vObjPos * uPanelScale;
        vec3 tN = normalize(vObjNrm);
        vec3 tW = triW(tN);
        vec4 pd = triSample(tPanel, tP, tW);
        float panelAmt = vSurf.w;
        // sulcos escurecem (oclusão fina) e a sujeira se acumula neles
        float grooveAO = mix(1.0, smoothstep(0.05, 0.42, pd.r) * 0.55 + 0.45, panelAmt);
        float grime = pd.g * uGrime * panelAmt;
        float chip = smoothstep(0.35, 0.65, pd.b * uWear * vSurf.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, uBare, chip);
        diffuseColor.rgb *= grooveAO * (1.0 - 0.5 * grime);
        // poeira clara e queimado nas superfícies voltadas para trás/baixo
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.72, 0.66), clamp(-tN.y, 0.0, 1.0) * 0.4 * panelAmt);
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        if (uHeat > 0.001) {
          float facingWind = clamp(dot(tN, uHeatDir), 0.0, 1.0);
          float hz = pow(facingWind, 2.0) * uHeat;
          // bordas de ataque incandescem: branco-amarelo → laranja
          vec3 hc = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.4), hz);
          totalEmissiveRadiance += hc * hz * 3.0 * (0.7 + 0.6 * pd.g);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `float roughnessFactor = clamp(vSurf.y * (0.75 + 0.5 * pd.a) + grime * 0.25, 0.04, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.32, chip);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `float metalnessFactor = mix(vSurf.x * (1.0 - grime * 0.6), 1.0, chip);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `{
          vec3 on = tN * faceDirection;
          vec3 nx = texture2D(tPanelN, tP.zy).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(tPanelN, tP.xz).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(tPanelN, tP.xy).xyz * 2.0 - 1.0;
          float k = uNormalStr * panelAmt;
          nx.xy *= k; ny.xy *= k; nz.xy *= k;
          // whiteout blend (normais em espaço do objeto)
          nx = vec3(nx.xy + on.zy, abs(nx.z) * on.x);
          ny = vec3(ny.xy + on.xz, abs(ny.z) * on.y);
          nz = vec3(nz.xy + on.xy, abs(nz.z) * on.z);
          vec3 objN = normalize(nx.zyx * tW.x + ny.xzy * tW.y + nz.xyz * tW.z);
          normal = normalize(normalMatrix * objN);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'exo-ship-panel';
  m.userData.cut = !!o.cutBox;
  return m;
}

/** Vidro do canopi: escuro, reflexivo, levemente translúcido. */
export function createGlassMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x0a1722,
    metalness: 0.95,
    roughness: 0.06,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 1.6,
  });
}

/** Emissivo por vértice (luzes de navegação, faixas, anéis dos bocais). Cor > 1 → bloom. */
export function createEmissiveMaterial(gain = 6) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  m.color.setScalar(gain);
  return m;
}
