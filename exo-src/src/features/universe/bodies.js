/**
 * CORPOS CELESTES vistos de longe: planetas vizinhos, gigantes gasosos,
 * luas, anéis e halos de atmosfera — malhas flutuantes com compressão de
 * distância (ctx.space.registerFloating(..., { compress: true })) e
 * shaders procedurais (nada de textura de arquivo).
 *
 *   planeta rochoso  continentes (fbm com domínio deformado), oceano com
 *                    reflexo especular do sol, montanhas (ridged), calotas,
 *                    nuvens em duas camadas, relevo por derivadas de tela,
 *                    sombra dos anéis, espalhamento na borda
 *   gigante gasoso   faixas por latitude com turbulência deformada,
 *                    tempestade oval, escurecimento de limbo
 *   lua              crateras em 3 escalas, mares escuros
 *   anel             faixas finas com divisões, lado iluminado × translúcido,
 *                    sombra do planeta
 *   halo             casca aditiva: brilho da atmosfera fora do disco, com
 *                    espalhamento frontal contra o sol
 *
 * O planeta ATUAL não é desenhado aqui (é do sistema `planet` + `sky`).
 */
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const SUN_E = 3.4;

/** Aparência por bioma: cores lineares [fundo do mar, raso, baixada, planalto, picos/gelo], nuvem, atmosfera, tipo, mar, nuvens. */
export const LOOK = {
  lush: { c: [[0.01, 0.035, 0.09], [0.03, 0.14, 0.2], [0.07, 0.2, 0.05], [0.2, 0.26, 0.08], [0.55, 0.5, 0.42]], cloud: [1, 1, 1], atm: [0.32, 0.55, 1.0], type: 0, sea: 0.02, clouds: 0.55 },
  ocean: { c: [[0.005, 0.03, 0.1], [0.02, 0.16, 0.26], [0.2, 0.22, 0.1], [0.3, 0.27, 0.15], [0.7, 0.7, 0.68]], cloud: [1, 1, 1], atm: [0.3, 0.55, 1.0], type: 0, sea: 0.22, clouds: 0.6 },
  frozen: { c: [[0.12, 0.2, 0.3], [0.32, 0.45, 0.55], [0.55, 0.62, 0.7], [0.75, 0.8, 0.86], [0.92, 0.95, 1.0]], cloud: [0.9, 0.95, 1], atm: [0.55, 0.75, 1.0], type: 3, sea: -1, clouds: 0.35 },
  toxic: { c: [[0.06, 0.08, 0.02], [0.14, 0.18, 0.03], [0.26, 0.32, 0.05], [0.45, 0.46, 0.1], [0.6, 0.62, 0.25]], cloud: [0.8, 0.9, 0.45], atm: [0.55, 0.85, 0.2], type: 0, sea: -0.12, clouds: 0.62 },
  scorched: { c: [[0.12, 0.03, 0.01], [0.3, 0.08, 0.02], [0.42, 0.15, 0.05], [0.55, 0.27, 0.1], [0.62, 0.45, 0.3]], cloud: [0.9, 0.75, 0.6], atm: [1.0, 0.55, 0.25], type: 4, sea: -1, clouds: 0.25 },
  exotic: { c: [[0.04, 0.02, 0.1], [0.1, 0.25, 0.3], [0.32, 0.08, 0.36], [0.12, 0.42, 0.4], [0.75, 0.55, 0.8]], cloud: [1, 0.85, 1], atm: [0.85, 0.45, 1.0], type: 0, sea: 0.0, clouds: 0.4 },
  radioactive: { c: [[0.06, 0.06, 0.02], [0.2, 0.22, 0.05], [0.42, 0.42, 0.1], [0.55, 0.36, 0.08], [0.7, 0.65, 0.3]], cloud: [0.95, 0.95, 0.7], atm: [0.9, 0.85, 0.3], type: 0, sea: -0.2, clouds: 0.3 },
  barren: { c: [[0.12, 0.11, 0.1], [0.2, 0.19, 0.17], [0.3, 0.28, 0.25], [0.4, 0.38, 0.35], [0.55, 0.53, 0.5]], cloud: [1, 1, 1], atm: [0.6, 0.6, 0.6], type: 2, sea: -1, clouds: 0 },
  gas: { c: [[0.55, 0.38, 0.24], [0.8, 0.66, 0.48], [0.42, 0.25, 0.18], [0.9, 0.84, 0.7], [0.62, 0.48, 0.42]], cloud: [1, 1, 1], atm: [0.7, 0.75, 1.0], type: 1, sea: -1, clouds: 0 },
};
/** Paletas alternativas de gigantes gasosos (escolhidas pela seed). */
const GAS_PALETTES = [
  [[0.55, 0.38, 0.24], [0.8, 0.66, 0.48], [0.42, 0.25, 0.18], [0.9, 0.84, 0.7], [0.62, 0.48, 0.42]],
  [[0.2, 0.32, 0.55], [0.5, 0.66, 0.85], [0.12, 0.2, 0.42], [0.78, 0.86, 0.95], [0.32, 0.5, 0.7]],
  [[0.5, 0.22, 0.36], [0.85, 0.55, 0.62], [0.32, 0.12, 0.3], [0.95, 0.8, 0.78], [0.62, 0.32, 0.5]],
  [[0.3, 0.45, 0.2], [0.62, 0.75, 0.35], [0.18, 0.3, 0.14], [0.85, 0.9, 0.6], [0.4, 0.55, 0.3]],
  [[0.6, 0.5, 0.35], [0.88, 0.8, 0.62], [0.4, 0.36, 0.3], [0.95, 0.92, 0.85], [0.7, 0.6, 0.48]],
];

const COMMON_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vCenter;
varying float vRad;
void main() {
  vObjN = normalize(position);
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vRad = length(modelMatrix[0].xyz);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const RING_FUNC = /* glsl */ `
uniform vec4 uRing;   // inner, outer (raios do planeta), ativo, opacidade
uniform vec3 uRingN;  // normal do plano dos anéis (mundo)
uniform vec3 uRingCol;
uniform float uRingSeed;
float ringDensity(float r) {
  float t = (r - uRing.x) / max(1e-3, uRing.y - uRing.x);
  if (t < 0.0 || t > 1.0) return 0.0;
  float s = uRingSeed;
  float d = 0.55 + 0.25 * snoise(vec3(r * 9.0, s, 0.5)) + 0.18 * snoise(vec3(r * 31.0, s, 2.1)) + 0.1 * snoise(vec3(r * 97.0, s, 4.7));
  // divisões (lacunas)
  d *= 1.0 - 0.92 * smoothstep(0.035, 0.0, abs(t - 0.62 - 0.05 * sin(s))) ;
  d *= 1.0 - 0.7 * smoothstep(0.02, 0.0, abs(t - 0.86));
  d *= smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t);
  d *= 0.75 + 0.5 * t;
  d *= 0.72 + 0.28 * snoise(vec3(r * 260.0, s, 7.3)) + 0.12 * snoise(vec3(r * 820.0, s, 1.1));
  return clamp(d, 0.0, 1.0) * uRing.w;
}`;

const PLANET_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform int uType;          // 0 rochoso, 1 gasoso, 2 lua/estéril, 3 gelo, 4 lava
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform float uSea;
uniform float uSeed;
uniform float uCloud;
uniform vec3 uCloudCol;
uniform vec4 uAtm;          // cor + força
uniform vec3 uAxis;         // eixo de rotação (mundo)
uniform float uSpin;
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];    // já multiplicada pela iluminância
uniform float uTime;
uniform float uDetail;      // 0..1 (oitavas extras quando grande na tela)
uniform vec3 uFillDir;      // direção ao planeta atual (luz refletida por ele)
uniform vec3 uFillCol;
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vCenter;
varying float vRad;
${NOISE_GLSL}
${RING_FUNC}

vec3 axisFrame(vec3 n) {
  vec3 ax = normalize(uAxis);
  vec3 t1 = normalize(cross(ax, abs(ax.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)));
  vec3 t2 = cross(ax, t1);
  vec3 q = vec3(dot(n, t1), dot(n, ax), dot(n, t2));
  float c = cos(uSpin), s = sin(uSpin);
  return vec3(c * q.x - s * q.z, q.y, s * q.x + c * q.z);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vWorldN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 q = axisFrame(normalize(vObjN));
  float lat = q.y;
  vec3 p = q + vec3(uSeed, uSeed * 0.37, -uSeed * 0.61);
  int oct = 4 + int(uDetail * 3.0);
  vec3 albedo;
  float h = 0.0;
  float water = 0.0;
  float cloud = 0.0;
  float emiss = 0.0;
  float rough = 1.0;
  if (uType == 1) {
    // ── gigante gasoso: jatos zonais, turbulência fluindo na longitude ──
    vec3 wq = vec3(q.x * 2.0, lat * 18.0, q.z * 2.0) + vec3(0.0, 0.0, uSeed);
    float t1 = fbm(wq, 3);
    vec3 wq2 = vec3(q.x * 5.0 + t1 * 1.4, lat * 46.0 + t1 * 2.2, q.z * 5.0 - t1);
    float w2 = fbm(wq2, oct);
    float band = lat * 8.5 + t1 * 0.55 + w2 * 0.22;
    float b1 = 0.5 + 0.5 * sin(band * 3.1416);
    float b2 = 0.5 + 0.5 * sin(band * 7.2 + 1.7);
    float b3 = 0.5 + 0.5 * sin(band * 16.0 + 0.4 + w2 * 2.0);
    albedo = mix(uC0, uC1, smoothstep(0.1, 0.9, b1));
    albedo = mix(albedo, uC3, smoothstep(0.5, 0.95, b2) * 0.75);
    albedo = mix(albedo, uC2, smoothstep(0.55, 1.0, b3) * 0.6);
    // faixas finas escuras e claras
    float lane = smoothstep(0.92, 1.0, 0.5 + 0.5 * sin(band * 29.0 + w2 * 4.0));
    albedo = mix(albedo, uC2 * 0.6, lane * 0.55);
    float bright = smoothstep(0.9, 1.0, 0.5 + 0.5 * sin(band * 11.0 - 0.7 + t1 * 3.0));
    albedo = mix(albedo, uC3 * 1.15, bright * 0.5);
    // redemoinhos nas bordas das faixas (cisalhamento)
    float shear = abs(cos(band * 3.1416));
    float eddy = snoise(vec3(q.x * 9.0, lat * 70.0, q.z * 9.0) + w2 * 3.0);
    albedo *= 1.0 + 0.16 * eddy * shear;
    float stk = snoise(vec3(q.x * 12.0 + w2 * 2.0, lat * 150.0, q.z * 12.0));
    albedo *= 0.9 + 0.14 * stk;
    float turb = t1;
    // tempestade oval
    float lon = atan(q.z, q.x);
    float sl = 0.32 * sin(uSeed * 3.7);
    vec2 sd = vec2(mod(lon - uSeed * 1.9 + 3.14159, 6.28318) - 3.14159, (lat - sl) * 3.2);
    float r = length(sd * vec2(1.0, 1.6));
    float ang = atan(sd.y, sd.x) + 6.0 * exp(-r * 5.0);
    float swirl = 0.5 + 0.5 * sin(ang * 3.0 + r * 30.0 + w2 * 3.0);
    float storm = smoothstep(0.32, 0.0, r);
    albedo = mix(albedo, mix(uC4, uC3, swirl), storm * 0.85);
    // polos mais escuros
    albedo *= 1.0 - 0.35 * smoothstep(0.75, 0.98, abs(lat));
    h = w2 * 0.15;
  } else if (uType == 2) {
    // ── lua / mundo estéril: crateras e mares ──
    float base = fbm(p * 2.2, oct);
    vec2 c1 = craters(p * 4.0);
    vec2 c2 = craters(p * 11.0 + 7.0);
    vec2 c3 = craters(p * 29.0 + 3.0);
    float mare = smoothstep(0.05, 0.3, fbm(p * 1.1 + 4.0, 4));
    h = base * 0.5 + c1.x * 0.6 + c2.x * 0.3 + c3.x * 0.15 * uDetail;
    albedo = mix(uC2, uC3, smoothstep(-0.4, 0.5, base));
    albedo = mix(albedo, uC0, mare * 0.65);
    albedo *= 0.85 + 0.3 * c1.y * step(0.0, -c1.x);
    // raios claros das crateras jovens
    albedo = mix(albedo, uC4, smoothstep(0.1, 0.5, c1.x) * 0.5);
  } else {
    // ── rochoso / gelo / lava ──
    vec3 wq = p * 1.3;
    vec3 warp = vec3(fbm(wq + 3.1, 3), fbm(wq - 1.7, 3), fbm(wq + 8.3, 3));
    float cont = fbm(p * 1.05 + warp * 0.55, oct);
    float mtn = ridged(p * 4.0 + warp, oct - 1);
    h = cont + mtn * 0.22 * smoothstep(uSea, uSea + 0.15, cont);
    float land = uSea < -0.9 ? 1.0 : smoothstep(uSea, uSea + 0.012, cont);
    water = 1.0 - land;
    vec3 sea = mix(uC0, uC1, smoothstep(uSea - 0.28, uSea, cont));
    float hl = smoothstep(uSea, uSea + 0.4, h);
    float dry = smoothstep(0.1, 0.55, fbm(p * 2.6 - warp, 4)) * (1.0 - smoothstep(0.55, 0.8, abs(lat)));
    vec3 ground = mix(uC2, uC3, clamp(hl * 1.2 + dry * 0.5, 0.0, 1.0));
    ground = mix(ground, uC4, smoothstep(0.55, 0.85, mtn * hl * 1.3));
    if (uType == 3) {
      float crack = smoothstep(0.92, 0.99, ridged(p * 9.0 + warp * 2.0, 3));
      ground = mix(ground, uC0, crack * 0.8);
    }
    if (uType == 4) {
      float crack = smoothstep(0.88, 0.99, ridged(p * 7.0 + warp * 2.0, 4));
      emiss = crack * (1.0 - hl);
      ground = mix(ground, uC0, crack * 0.6);
    }
    // calotas polares
    float cap = smoothstep(0.78, 0.86, abs(lat) + 0.12 * fbm(p * 5.0, 3));
    ground = mix(ground, vec3(0.85, 0.9, 0.95), cap * (uType == 4 ? 0.0 : 1.0));
    sea = mix(sea, vec3(0.75, 0.82, 0.9), cap);
    water *= 1.0 - cap;
    albedo = mix(ground, sea, water);
    rough = mix(1.0, 0.15, water);
    // nuvens: duas camadas deformadas, ciclones
    if (uCloud > 0.0) {
      vec3 cq = q * 2.3 + vec3(uSeed * 1.3, 0.0, uTime * 0.004);
      vec3 cw = vec3(fbm(cq * 1.4, 3), fbm(cq * 1.4 + 5.2, 3), 0.0);
      float cl = fbm(cq + cw * 0.9 + vec3(0.0, lat * 2.0, 0.0), oct);
      float cl2 = fbm(vec3(q.x * 4.0, lat * 18.0, q.z * 4.0) + cw * 2.0 + uSeed, 3);
      cl = cl * 0.75 + cl2 * 0.25;
      cloud = smoothstep(0.42 - uCloud * 0.55, 0.62 - uCloud * 0.35, cl * 0.5 + 0.5);
      cloud *= 1.0 - 0.5 * smoothstep(0.85, 0.98, abs(lat));
    }
  }

  // relevo por derivadas de tela (bump)
  vec3 dpdx = dFdx(vWorldPos);
  vec3 dpdy = dFdy(vWorldPos);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpdy, N);
  vec3 r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  float R = vRad;
  float bumpK = (uType == 1 ? 0.004 : 0.03) * R * (1.0 - water) * (1.0 - cloud * 0.8);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  vec3 Nb = normalize(abs(det) * N - grad * bumpK);

  vec3 center = vCenter;
  vec3 col = vec3(0.0);
  float NV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NV, 2.6);
  for (int i = 0; i < 2; i++) {
    vec3 L = uSunDir[i];
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-6) continue;
    float NL = dot(N, L);
    float NLb = dot(Nb, L);
    float term = smoothstep(-0.06, 0.18, NL);
    float diff = max(0.0, NLb * 0.85 + 0.15 * NL) * term;
    // sombra dos anéis sobre o planeta
    float rs = 1.0;
    if (uRing.z > 0.5) {
      float dn = dot(L, uRingN);
      if (abs(dn) > 1e-3) {
        float tt = dot(center - vWorldPos, uRingN) / dn;
        if (tt > 0.0) {
          float rr = length(vWorldPos + L * tt - center) / R;
          rs = 1.0 - 0.85 * ringDensity(rr);
        }
      }
    }
    vec3 surf = albedo * diff * rs;
    // reflexo especular do oceano
    vec3 H = normalize(L + V);
    float sp = pow(max(dot(N, H), 0.0), 160.0) * 3.0 + pow(max(dot(N, H), 0.0), 18.0) * 0.08;
    surf += water * sp * term * rs * (1.0 - cloud) * vec3(1.0, 0.95, 0.85);
    // nuvens (com sombra própria suave)
    vec3 cl = uCloudCol * max(0.0, NL * 0.9 + 0.1) * term * rs;
    surf = mix(surf * (1.0 - 0.35 * cloud), cl, cloud);
    // atmosfera sobre o disco: névoa na borda iluminada + avermelhado no terminador
    float lit = smoothstep(-0.25, 0.45, NL);
    vec3 atm = uAtm.rgb * uAtm.a;
    vec3 haze = atm * (fres * 1.6 + 0.08) * lit;
    vec3 warm = vec3(1.0, 0.45, 0.2) * smoothstep(0.25, 0.0, abs(NL - 0.02)) * fres * 0.6 * uAtm.a;
    surf = mix(surf, haze * 0.8, clamp(fres * uAtm.a * 0.9, 0.0, 0.9)) + haze * 0.35 + warm;
    if (uType == 1) surf *= 0.55 + 0.45 * pow(NV, 0.35);
    col += surf * E / 3.14159;
  }
  // luz refletida pelo planeta atual no lado noturno (planetshine)
  col += albedo * uFillCol * max(0.0, dot(N, uFillDir)) / 3.14159;
  // brilho noturno (lava) e ambiente estelar mínimo
  col += emiss * vec3(1.0, 0.32, 0.06) * 0.6;
  col += albedo * 0.0025;
  gl_FragColor = vec4(col, 1.0);
}`;

const HALO_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec4 uAtm;
uniform float uThick;
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];
varying vec3 vObjN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vCenter;
varying float vRad;
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
void main() {
  #include <logdepthbuf_fragment>
  vec3 c = vCenter;
  float Rs = vRad;
  float R = Rs / (1.0 + uThick);
  vec3 dir = normalize(vWorldPos - cameraPosition);
  float tc = dot(c - cameraPosition, dir);
  vec3 closest = cameraPosition + dir * tc;
  float b = length(closest - c);
  float hgt = (b - R) / (R * uThick);
  float g = hgt >= 0.0 ? exp(-hgt * 3.2) * smoothstep(1.0, 0.75, hgt) : exp(hgt * 40.0) * 0.6;
  vec3 sn = normalize(closest - c);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-6) continue;
    vec3 L = uSunDir[i];
    float lit = smoothstep(-0.38, 0.32, dot(sn, L));
    float mu = dot(dir, L);
    float ph = 0.6 + 6.0 * hg(mu, 0.72);
    col += uAtm.rgb * E * lit * ph * g;
  }
  gl_FragColor = vec4(col * uAtm.a * 0.55, 1.0);
}`;

const RING_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
varying vec3 vWorldPos;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const RING_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunDir[2];
uniform vec3 uSunCol[2];
uniform vec3 uCenter;
uniform float uR;
varying vec3 vLocal;
varying vec3 vWorldPos;
${NOISE_GLSL}
${RING_FUNC}
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
void main() {
  #include <logdepthbuf_fragment>
  float r = length(vLocal.xy);
  float a = ringDensity(r);
  if (a < 0.003) discard;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float tone = 0.8 + 0.35 * snoise(vec3(r * 55.0, uRingSeed, 9.0)) + 0.15 * snoise(vec3(r * 170.0, uRingSeed, 3.0));
  vec3 base = uRingCol * tone;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 E = uSunCol[i];
    if (dot(E, E) < 1e-6) continue;
    vec3 L = uSunDir[i];
    float sL = dot(L, uRingN);
    float sV = dot(V, uRingN);
    // sombra do planeta: raio do fragmento até o sol cruza a esfera?
    vec3 oc = vWorldPos - uCenter;
    float bq = dot(oc, L);
    float cq = dot(oc, oc) - uR * uR;
    float disc = bq * bq - cq;
    float shadow = (disc > 0.0 && -bq - sqrt(disc) > 0.0) ? 0.04 : 1.0;
    float lit = sL * sV > 0.0 ? (0.35 + 0.65 * abs(sL)) : (1.0 - a) * 1.6 * (0.3 + 3.0 * hg(dot(-V, L), 0.6));
    col += base * E * lit * shadow / 3.14159;
  }
  gl_FragColor = vec4(col * a, a);
}`;

function linColor(c) {
  return new THREE.Vector3(c[0], c[1], c[2]);
}

/** Gerencia as malhas dos corpos do sistema atual. */
export class BodyRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.name = 'universe:bodies';
    ctx.scene.add(this.root);
    this.geoHi = new THREE.SphereGeometry(1, 160, 96);
    this.geoLo = new THREE.SphereGeometry(1, 56, 36);
    this.items = [];
    this.sunDir = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0)];
    this.sunCol = [new THREE.Vector3(), new THREE.Vector3()];
    this.visible = true;
  }

  clear() {
    for (const it of this.items) {
      it.handle.remove();
      this.root.remove(it.mesh);
      it.mesh.traverse((o) => {
        o.material?.dispose?.();
        if (o.geometry && o.geometry !== this.geoHi && o.geometry !== this.geoLo) o.geometry.dispose();
      });
    }
    this.items = [];
  }

  /** Cria as malhas para o sistema (exceto o planeta atual). */
  build(sys) {
    this.clear();
    const cur = sys.planets[sys.currentPlanetIndex];
    for (const p of sys.planets) {
      if (p !== cur) this.add(p);
      for (const m of p.moons) this.add(m);
    }
    this.current = cur;
  }

  add(b) {
    const look = LOOK[b.biome] || LOOK.barren;
    const rng = mulberry(b.seed ?? 7);
    const jit = (c, k = 0.12) => c.map((v) => Math.max(0.004, v * (1 + (rng() - 0.5) * 2 * k)));
    let pal = look.c.map((c) => jit(c));
    if (b.biome === 'gas') pal = GAS_PALETTES[Math.floor(rng() * GAS_PALETTES.length)].map((c) => jit(c, 0.08));
    let type = look.type;
    if (b.kind === 'moon' && b.biome !== 'frozen') type = 2;
    const tilt = b.rings ? b.rings.tilt : (rng() - 0.5) * 0.6;
    const axis = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    const sunDir = this.sunDir;
    const sunCol = this.sunCol;
    const ringU = {
      uRing: { value: new THREE.Vector4(0, 0, 0, 0) },
      uRingN: { value: axis.clone() },
      uRingCol: { value: new THREE.Vector3(0.8, 0.7, 0.6) },
      uRingSeed: { value: 0 },
    };
    if (b.rings) {
      ringU.uRing.value.set(b.rings.inner / b.radius, b.rings.outer / b.radius, 1, 0.92);
      ringU.uRingCol.value.fromArray(b.rings.color);
      ringU.uRingSeed.value = b.rings.seed ?? 1;
    }
    const atm = b.atmosphere ? [...jit(look.atm, 0.1), b.biome === 'gas' ? 0.55 : 1.0] : [0, 0, 0, 0];
    const mat = new THREE.ShaderMaterial({
      vertexShader: COMMON_VERT,
      fragmentShader: PLANET_FRAG,
      uniforms: {
        uType: { value: type },
        uC0: { value: linColor(pal[0]) },
        uC1: { value: linColor(pal[1]) },
        uC2: { value: linColor(pal[2]) },
        uC3: { value: linColor(pal[3]) },
        uC4: { value: linColor(pal[4]) },
        uSea: { value: look.sea + (rng() - 0.5) * 0.12 },
        uSeed: { value: rng() * 50 },
        uCloud: { value: b.atmosphere ? look.clouds * (0.7 + 0.6 * rng()) : 0 },
        uCloudCol: { value: linColor(look.cloud) },
        uAtm: { value: new THREE.Vector4(...atm) },
        uAxis: { value: axis },
        uSpin: { value: rng() * 6.28 },
        uSunDir: { value: sunDir },
        uSunCol: { value: sunCol },
        uTime: { value: 0 },
        uDetail: { value: 0.5 },
        uFillDir: { value: new THREE.Vector3(0, 1, 0) },
        uFillCol: { value: new THREE.Vector3() },
        ...ringU,
      },
    });
    mat.extensions = { derivatives: true };
    const mesh = new THREE.Mesh(this.geoLo, mat);
    mesh.name = `body:${b.id}`;
    mesh.scale.setScalar(b.radius);
    mesh.frustumCulled = false;
    let halo = null;
    if (b.atmosphere) {
      const thick = b.biome === 'gas' ? 0.035 : 0.06;
      halo = new THREE.Mesh(
        this.geoLo,
        new THREE.ShaderMaterial({
          vertexShader: COMMON_VERT,
          fragmentShader: HALO_FRAG,
          uniforms: { uAtm: mat.uniforms.uAtm, uThick: { value: thick }, uSunDir: { value: sunDir }, uSunCol: { value: sunCol } },
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      );
      halo.scale.setScalar(1 + thick);
      halo.renderOrder = 2;
      halo.frustumCulled = false;
      mesh.add(halo);
    }
    let ring = null;
    if (b.rings) {
      const geo = new THREE.RingGeometry(b.rings.inner / b.radius, b.rings.outer / b.radius, 256, 1);
      const center = new THREE.Vector3();
      const ru = {
        ...ringU,
        uSunDir: { value: sunDir },
        uSunCol: { value: sunCol },
        uCenter: { value: center },
        uR: { value: 1 },
      };
      ring = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          uniforms: ru,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.CustomBlending,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
        }),
      );
      // RingGeometry fica no plano XY (normal +Z) → normal (0, cos t, sin t)
      ring.rotation.x = tilt - Math.PI / 2;
      ring.renderOrder = 3;
      ring.frustumCulled = false;
      mesh.add(ring);
    }
    this.root.add(mesh);
    const handle = this.ctx.space.registerFloating(mesh, b.position.clone(), { compress: true });
    this.items.push({ body: b, mesh, mat, halo, ring, handle });
  }

  /** Recopia as posições (depois de recentrar). */
  syncPositions() {
    for (const it of this.items) it.handle.worldPos.copy(it.body.position);
  }

  /** Por frame: luzes, LOD de geometria, visibilidade. */
  frame(ctx, sys, stars, visible) {
    const sky = ctx.services.sky;
    const suns = sky?.suns || [];
    for (let i = 0; i < 2; i++) {
      const st = stars[i];
      const dir = suns[i]?.direction || (i === 0 ? sky?.sunDirection : null);
      if (st && dir) {
        this.sunDir[i].copy(dir).normalize();
        const E = SUN_E * (st.intensity ?? 1);
        this.sunCol[i].set(st.color[0] * E, st.color[1] * E, st.color[2] * E);
      } else this.sunCol[i].set(0, 0, 0);
    }
    this.root.visible = visible;
    if (!visible) return;
    const H = ctx.pipeline.height || 720;
    const pxPerRad = H / ((ctx.camera.fov * Math.PI) / 180);
    const t = ctx.time.world;
    const cp = sys.planets[sys.currentPlanetIndex];
    const cur = cp ? { x: cp.position.x, y: cp.position.y, z: cp.position.z, r: cp.radius } : null;
    for (const it of this.items) {
      const m = it.mesh;
      const d = m.position.length();
      const ang = Math.asin(Math.min(1, m.scale.x / Math.max(d, 1e-3)));
      const px = ang * pxPerRad;
      const geo = px > 90 ? this.geoHi : this.geoLo;
      if (m.geometry !== geo) {
        m.geometry = geo;
        if (it.halo) it.halo.geometry = geo;
      }
      m.visible = px > 0.4;
      it.mat.uniforms.uDetail.value = Math.min(1, Math.max(0, (px - 40) / 300));
      // planetshine: o planeta atual (no centro do mundo) ilumina o lado noturno das luas próximas
      if (cur) {
        const fd = it.mat.uniforms.uFillDir.value;
        fd.set(cur.x - it.body.position.x, cur.y - it.body.position.y, cur.z - it.body.position.z);
        const dist = fd.length();
        fd.divideScalar(dist || 1);
        const sr = cur.r / Math.max(dist, cur.r);
        // fração iluminada do planeta vista do corpo × ângulo sólido
        const phase = 0.5 + 0.5 * -fd.dot(this.sunDir[0]);
        const k = 0.35 * phase * sr * sr * 4;
        it.mat.uniforms.uFillCol.value.copy(this.sunCol[0]).multiplyScalar(k);
      }
      it.mat.uniforms.uTime.value = t;
      if (it.ring) {
        it.ring.material.uniforms.uCenter.value.copy(m.position);
        it.ring.material.uniforms.uR.value = m.scale.x;
      }
      // a normal dos anéis em mundo é a mesma do eixo (corpo sem rotação)
    }
  }

  dispose() {
    this.clear();
    this.geoHi.dispose();
    this.geoLo.dispose();
    this.ctx.scene.remove(this.root);
  }
}

/** RNG mulberry32 local (aparência; não é conteúdo de jogo). */
export function mulberry(a) {
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
