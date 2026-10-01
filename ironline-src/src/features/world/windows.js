/**
 * Janelas com INTERIOR MAPPING: cada vão recebe um quad cujo shader traça
 * um raio dentro de um cômodo virtual (caixa) — paredes, piso, teto,
 * papel de parede, rodapé/barra, móveis (caixas com paralaxe correta),
 * cortinas e luz caindo com a profundidade. Por cima, vidro de verdade:
 * MeshStandardMaterial com Fresnel, reflexo do ambiente (IBL), sol
 * especular, sombras e sujeira (rugosidade/albedo da textura `grime`).
 *
 * Um único draw call para todas as janelas do mapa. Tipos (aWin2.x):
 *   0 vidro (apartamento) · 1 sem vidro (quebrada) · 2 queimada
 *   3 vitrine de loja (vidro) · 4 loja aberta (sem vidro)
 */
import * as THREE from 'three';

const _n = new THREE.Vector3();
const _t = new THREE.Vector3();

export class WindowBatch {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.wuv = [];
    this.win = [];
    this.win2 = [];
    this.tan = [];
    this.count = 0;
  }

  /**
   * Quad de janela. o = canto inferior esquerdo (mundo, visto de fora),
   * tu = eixo u (unitário, horizontal), n = normal para fora, w×h = tamanho.
   * room: { depth, sill, margin, top, seed, kind }
   */
  add(o, tu, n, w, h, room) {
    const p = (u, v) => [o[0] + tu[0] * u, o[1] + v, o[2] + tu[2] * u];
    const c = [p(0, 0), p(w, 0), p(w, h), p(0, h)];
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...c[k]);
      this.nor.push(n[0], 0, n[2]);
      this.tan.push(tu[0], 0, tu[2]);
      this.wuv.push(uv[k][0], uv[k][1]);
      // UV métrica (sujeira do vidro na densidade da textura)
      this.uv.push(uv[k][0] * w + o[0] * 0.37 + o[2] * 0.61, uv[k][1] * h + o[1] * 0.5);
      this.win.push(w, h, room.depth, room.seed);
      this.win2.push(room.kind || 0, room.sill ?? 0.9, room.margin ?? 1.0, room.top ?? 0.6);
    }
    this.count++;
  }

  build(root, { grime, quality }) {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aWinUv', new THREE.Float32BufferAttribute(this.wuv, 2));
    g.setAttribute('aWin', new THREE.Float32BufferAttribute(this.win, 4));
    g.setAttribute('aWin2', new THREE.Float32BufferAttribute(this.win2, 4));
    g.setAttribute('aWinT', new THREE.Float32BufferAttribute(this.tan, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mat = windowMaterial(grime, quality);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'world:windows';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    return mesh;
  }
}

/** Uniforms globais (intensidade da luz interna, hora do dia). */
export const WINDOW_U = {
  uInLight: { value: new THREE.Color(0.2, 0.185, 0.165) },
  uInWarm: { value: new THREE.Color(2.4, 1.6, 0.85) },
};

const INTERIOR_GLSL = /* glsl */ `
varying vec2 vWinUv;
varying vec4 vWin;
varying vec4 vWin2;
varying vec3 vWinT;
varying vec3 vWinW;
varying vec3 vWinN;
uniform vec3 uInLight;
uniform vec3 uInWarm;
float h1(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
// interseção raio × caixa: entrada (x) e saída (y)
vec2 boxT(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 ia = (bmin - ro) / rd, ib = (bmax - ro) / rd;
  vec3 tmin = min(ia, ib), tmax = max(ia, ib);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}
vec3 palette(float k) {
  if (k < 0.18) return vec3(0.62, 0.68, 0.62);   // verde-água
  if (k < 0.34) return vec3(0.78, 0.7, 0.55);    // bege
  if (k < 0.5) return vec3(0.6, 0.64, 0.74);     // azul gasto
  if (k < 0.64) return vec3(0.82, 0.78, 0.72);   // branco sujo
  if (k < 0.78) return vec3(0.72, 0.56, 0.46);   // rosado
  if (k < 0.9) return vec3(0.7, 0.66, 0.5);      // amarelado
  return vec3(0.5, 0.42, 0.36);                  // marrom
}
vec3 roomShade() {
  float W = vWin.x, H = vWin.y, D = vWin.z, sd = vWin.w;
  float kind = vWin2.x, sill = vWin2.y, m = vWin2.z, top = vWin2.w;
  vec3 N = normalize(vWinN), Tu = normalize(vWinT);
  vec3 V = normalize(vWinW - cameraPosition);
  vec3 rd = vec3(dot(V, Tu), V.y, -dot(V, N));
  rd.z = max(rd.z, 0.002);
  if (abs(rd.x) < 1e-4) rd.x = 1e-4;
  if (abs(rd.y) < 1e-4) rd.y = 1e-4;
  vec3 ro = vec3(vWinUv.x * W, vWinUv.y * H, 0.0);
  vec3 bmin = vec3(-m, -sill, 0.0), bmax = vec3(W + m, H + top, D);
  vec3 tF = max((bmin - ro) / rd, (bmax - ro) / rd);
  float t = min(min(tF.x, tF.y), tF.z);
  vec3 hp = ro + rd * t;
  bool shop = kind > 2.5;
  // cores do cômodo
  float k1 = h1(sd), k2 = h1(sd + 3.1), k3 = h1(sd + 7.7), k4 = h1(sd + 11.3);
  vec3 wallC = palette(k1);
  vec3 dadoC = mix(wallC * 0.7, palette(fract(k1 + 0.37)), 0.5);
  vec3 floorC = k2 < 0.5 ? vec3(0.32, 0.22, 0.15) : vec3(0.42, 0.4, 0.36);
  vec3 ceilC = vec3(0.8, 0.78, 0.74);
  if (shop) { wallC = vec3(0.7, 0.7, 0.68); floorC = vec3(0.42, 0.42, 0.4); }
  vec3 col;
  float yF = hp.y + sill; // altura acima do piso
  float ao = 1.0;
  if (t == tF.z) {
    // parede do fundo: papel de parede listrado ou pintura + barra + quadro/porta
    vec2 c = vec2(hp.x, yF);
    col = wallC;
    if (k3 > 0.55) col *= 0.9 + 0.1 * step(0.5, fract(c.x * 4.0 + k3 * 9.0));
    if (yF < 1.1 && k4 > 0.4) col = dadoC;
    if (shop) {
      // prateleiras com mercadoria
      float sh = fract(yF / 0.45);
      float shelf = step(0.88, sh);
      float item = h1(floor(c.x / 0.18) + floor(yF / 0.45) * 17.0 + sd);
      vec3 ic = palette(item) * (0.6 + 0.6 * h1(item * 9.0));
      col = mix(item > 0.35 && yF < 2.2 && yF > 0.3 ? ic * 0.8 : wallC * 0.7, vec3(0.4, 0.38, 0.35), shelf);
    } else {
      // porta interna ou quadro
      float dx = abs(c.x - (W * (0.2 + 0.6 * k2)));
      if (k4 < 0.5 && dx < 0.42 && yF < 2.05) col = vec3(0.3, 0.22, 0.16) * (0.85 + 0.15 * step(0.5, fract(yF * 2.0)));
      else if (dx < 0.3 && abs(yF - 1.6) < 0.22 && k3 < 0.5) col = vec3(0.35, 0.4, 0.42);
    }
    vec2 ed = min(hp.xy - bmin.xy, bmax.xy - hp.xy);
    ao = 0.55 + 0.45 * smoothstep(0.0, 0.5, min(ed.x, ed.y));
  } else if (t == tF.x) {
    col = wallC * 0.88;
    if (yF < 1.1 && k4 > 0.4) col = dadoC * 0.88;
    float ez = min(hp.z, D - hp.z);
    float ey = min(hp.y - bmin.y, bmax.y - hp.y);
    ao = 0.55 + 0.45 * smoothstep(0.0, 0.45, min(ez * 1.5, ey));
  } else {
    bool fl = rd.y < 0.0;
    if (fl) {
      col = floorC;
      if (k2 < 0.5) col *= 0.85 + 0.15 * step(0.5, fract(hp.x * 6.0)); // tacos
      else col *= 0.9 + 0.1 * step(0.5, fract(hp.x * 3.0) + fract(hp.z * 3.0) - 0.5);
      // tapete
      if (abs(hp.x - W * 0.5) < W * 0.35 && abs(hp.z - D * 0.55) < D * 0.25 && k3 > 0.35) col = vec3(0.45, 0.16, 0.12);
    } else {
      col = ceilC;
      float lamp = length(vec2(hp.x - W * 0.5, hp.z - D * 0.5));
      col *= 1.0 - 0.25 * smoothstep(0.08, 0.1, lamp) + 0.0;
    }
    vec2 ed = vec2(min(hp.x - bmin.x, bmax.x - hp.x), min(hp.z, D - hp.z));
    ao = 0.55 + 0.45 * smoothstep(0.0, 0.5, min(ed.x, ed.y));
  }
  // móveis: armário no fundo e sofá/mesa no meio (caixas reais, paralaxe correta)
  float tHit = t;
  if (!shop && kind < 1.5 + 0.6) {
    float cx0 = -m + (W + 2.0 * m) * (0.05 + 0.5 * k3);
    vec3 a0 = vec3(cx0, -sill, D - 0.5), a1 = vec3(cx0 + 0.9 + 0.5 * k2, -sill + 1.7 + 0.4 * k4, D);
    vec2 b = boxT(ro, rd, a0, a1);
    if (b.x > 0.0 && b.x < b.y && b.x < tHit) {
      tHit = b.x;
      vec3 q = ro + rd * b.x;
      vec3 fc = k4 > 0.5 ? vec3(0.3, 0.2, 0.13) : vec3(0.5, 0.48, 0.44);
      float side = abs(q.z - a0.z) < 0.01 ? 1.0 : 0.7;
      col = fc * side * (0.85 + 0.15 * step(0.5, fract((q.y + sill) * 1.6)));
      ao = 0.8;
    }
    float sx0 = -m + (W + 2.0 * m) * (0.3 * k4 + 0.1);
    vec3 s0 = vec3(sx0, -sill, D * 0.45), s1 = vec3(sx0 + 1.6, -sill + 0.75, D * 0.45 + 0.8);
    b = boxT(ro, rd, s0, s1);
    if (k1 > 0.3 && b.x > 0.0 && b.x < b.y && b.x < tHit) {
      tHit = b.x;
      vec3 q = ro + rd * b.x;
      vec3 fc = palette(fract(k2 * 3.7)) * 0.55;
      col = fc * (q.y + sill > 0.72 ? 1.15 : 0.85);
      ao = 0.75;
      hp = q;
    }
  }
  // luz do dia entrando pela janela: cai com a profundidade
  float depthK = 0.28 + 0.72 * exp(-hp.z * 0.55);
  vec3 L = uInLight * depthK * ao;
  // poucas janelas com luz acesa (quente)
  if (h1(sd + 21.7) > 0.95 && kind < 0.5) L += uInWarm * 0.35 * (0.6 + 0.4 * exp(-length(hp - vec3(W * 0.5, H + top, D * 0.5)) * 0.5));
  if (shop) L *= 0.7;
  vec3 res = col * L;
  // queimada: tudo carbonizado, fuligem mais densa no alto
  if (kind > 1.5 && kind < 2.5) res = mix(res * 0.12, vec3(0.006), smoothstep(-0.3, 1.5, hp.y));
  // cortinas (atrás do vidro, plano z = 0.05)
  if (!shop && kind < 0.5) {
    float cl = (h1(sd + 5.5) > 0.4 ? 0.12 + 0.3 * h1(sd + 6.1) : 0.0);
    float crr = (h1(sd + 8.2) > 0.5 ? 0.1 + 0.3 * h1(sd + 9.4) : 0.0);
    vec3 cp = ro + rd * (0.05 / rd.z);
    float u = cp.x / W;
    if ((u < cl || u > 1.0 - crr) && cp.y > -0.1 && cp.y < H + 0.1) {
      float fold = 0.75 + 0.25 * sin(cp.x * 38.0 + sd);
      vec3 cc = palette(fract(k3 * 5.3)) * vec3(1.0, 0.95, 0.85);
      res = cc * uInLight * 1.9 * fold;
    }
  }
  return res;
}
`;

function windowMaterial(grime, quality) {
  const fullPBR = quality.level === 'high' || quality.level === 'ultra';
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grime.map,
    roughnessMap: grime.orm,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 1.25,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, WINDOW_U);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aWinUv; attribute vec4 aWin; attribute vec4 aWin2; attribute vec3 aWinT;
        varying vec2 vWinUv; varying vec4 vWin; varying vec4 vWin2; varying vec3 vWinT; varying vec3 vWinW; varying vec3 vWinN;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWinUv = aWinUv; vWin = aWin; vWin2 = aWin2; vWinT = aWinT;
        vWinW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWinN = normalize(mat3(modelMatrix) * objectNormal);`
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${INTERIOR_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // sujeira do vidro: albedo de poeira; o vidro limpo tem albedo ~0
        float wDirt = clamp((diffuseColor.r - 0.04) * 4.0, 0.0, 1.0);
        float glassK = (vWin2.x < 0.5 || (vWin2.x > 2.5 && vWin2.x < 3.5)) ? 1.0 : 0.0;
        diffuseColor.rgb *= glassK;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(1.0, clamp(roughnessFactor * 0.9, 0.03, 1.0), glassK);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Vv = normalize(vWinW - cameraPosition);
          float ndv = clamp(dot(-Vv, normalize(vWinN)), 0.0, 1.0);
          float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
          vec3 inside = roomShade();
          totalEmissiveRadiance += inside * mix(1.0, (1.0 - F) * (1.0 - wDirt * 0.55) * 0.92, glassK);
        }`
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.directSpecular *= glassK;
        reflectedLight.indirectSpecular *= glassK;`
      );
  };
  mat.customProgramCacheKey = () => 'ironline-windows1' + (fullPBR ? 'p' : 'l');
  return mat;
}

/** Ajudante: vetor u/normal de uma face do Builder de prédios. */
export function faceVectors(F) {
  _n.set(F.n[0], 0, F.n[1]);
  _t.set(F.u[0], 0, F.u[1]);
  return { n: [_n.x, 0, _n.z], tu: [_t.x, 0, _t.z] };
}
