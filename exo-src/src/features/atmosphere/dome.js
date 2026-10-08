/**
 * DOMO DO CÉU — um único draw call desenha:
 *   - o espalhamento do céu: sky-view LUT (câmera dentro da atmosfera) ou
 *     integração por pixel com as LUTs de transmitância/multiespalhamento
 *     (câmera fora — limbo do planeta visto da órbita). A física é a mesma
 *     nos dois caminhos: a passagem entre eles é contínua;
 *   - o chão além da malha do planeta (fallback: nada fica preto);
 *   - disco(s) do(s) sol(es) com escurecimento de limbo + halo;
 *   - céu estrelado do sistema (estrelas procedurais com cor de temperatura,
 *     faixa galáctica com nebulosa colorida e poeira, cintilação);
 *   - luas e planetas do sistema em tamanho angular correto, com fase
 *     iluminada pelo(s) sol(es), limbo atmosférico e anéis;
 *   - aurora (cortinas) em planetas frios, à noite.
 * Tudo atrás do mundo (depthWrite false, renderOrder bem negativo) e
 * multiplicado pela transmitância da atmosfera na direção de visão.
 */
import * as THREE from 'three';
import { ATMO_UNIFORMS_GLSL, ATMO_FUNCS_GLSL, ATMO_LUT_FUNCS_GLSL, SKYVIEW_MAP_GLSL } from './glsl.js';

export const MAX_BODIES = 8;

const VERT = /* glsl */ `
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

export const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm3(vec3 p, int oct) {
  float a = 0.5;
  float s = 0.0;
  float n = 0.0;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    s += a * vnoise3(p);
    n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / n;
}
`;

const FRAG = /* glsl */ `
${ATMO_UNIFORMS_GLSL}
${ATMO_FUNCS_GLSL}
${ATMO_LUT_FUNCS_GLSL}
${SKYVIEW_MAP_GLSL}
${NOISE_GLSL}
uniform sampler2D uSkyView;
uniform vec3 uCamPos;      // câmera (km) relativa ao centro do planeta
uniform vec3 uUp;
uniform vec3 uEast;
uniform vec3 uNorth;
uniform float uInside;     // 1 = usa o sky-view LUT
uniform int uSteps;
uniform float uPixelAngle; // rad por pixel
uniform float uTime;
uniform mat3 uToInertial;  // mundo → referencial inercial (estrelas giram com o céu)
// sóis: direção = uLightDir[0..1]; E bruto (fora da atmosfera) e raio angular
uniform vec3 uStarE[2];
uniform float uStarAng[2];
uniform vec3 uStarTint[2];
// fundo estelar
uniform vec3 uGalN;        // normal do plano galáctico (inercial)
uniform vec3 uNebA;
uniform vec3 uNebB;
uniform vec3 uNebC;
uniform float uNebSeed;
uniform float uStarGain;
// aurora
uniform float uAurora;
uniform vec3 uAurLow;
uniform vec3 uAurHigh;
// corpos celestes (km, relativos à CÂMERA)
uniform int uBodyCount;
uniform vec4 uBodyPos[${MAX_BODIES}];   // xyz centro, w raio
uniform vec4 uBodyCol[${MAX_BODIES}];   // rgb albedo base, w tipo (0 rochoso, 1 com oceano, 2 gasoso, 3 gelo)
uniform vec4 uBodyCol2[${MAX_BODIES}];  // rgb cor secundária, w seed
uniform vec4 uBodyAtm[${MAX_BODIES}];   // rgb cor do limbo, w espessura relativa (0 = sem atmosfera)
uniform vec4 uBodyRing[${MAX_BODIES}];  // x interno/R, y externo/R, z opacidade, w (0 = sem anel)
uniform vec4 uBodyRingN[${MAX_BODIES}]; // xyz normal do anel
uniform vec4 uBodyRingC[${MAX_BODIES}]; // rgb cor do anel
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_fragment>

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// ── estrelas: grade numa face de cubo, uma candidata por célula ──
vec3 starColor(float h) {
  vec3 c = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.97, 0.93), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(1.0, 0.82, 0.58), smoothstep(0.55, 0.85, h));
  c = mix(c, vec3(1.0, 0.6, 0.42), smoothstep(0.9, 1.0, h));
  return c;
}
vec3 starLayer(vec3 p, float cells, float prob, float gain, float seed, float band) {
  vec3 a = abs(p);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) { uv = p.yz / a.x; face = p.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { uv = p.xz / a.y; face = p.y > 0.0 ? 2.0 : 3.0; }
  else { uv = p.xy / a.z; face = p.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = (uv * 0.5 + 0.5) * cells;
  vec2 base = floor(g - 0.5);
  float cellAng = 2.0 / cells / (1.0 + dot(uv, uv) * 0.5);
  float pr = prob * (0.35 + 1.4 * band);
  vec3 acc = vec3(0.0);
  // 2×2 células vizinhas: a estrela nunca é cortada na borda da célula
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = base + vec2(float(i), float(j));
      vec3 key = vec3(id, face * 37.0 + seed);
      float h = hash13(key);
      if (h > pr) continue;
      vec2 o = id + 0.15 + 0.7 * vec2(hash13(key + 11.1), hash13(key + 23.7));
      float d = length(g - o) * cellAng;
      float m = hash13(key + 5.3);
      float b = 0.018 + 0.22 * pow(m, 6.0) + 3.5 * pow(m, 60.0);
      float rad = uPixelAngle * (0.36 + 0.6 * pow(m, 24.0));
      float tw = 1.0 + 0.4 * sin(uTime * (2.0 + 5.0 * m) + h * 61.0) * uStarGain;
      acc += starColor(hash13(key + 41.9)) * b * tw * exp(-0.5 * d * d / (rad * rad));
    }
  }
  return acc * gain;
}

vec3 nebula(vec3 p, float band) {
  vec3 q = p * 1.6 + uNebSeed;
  float w = fbm3(q * 0.8, 3);
  float n = fbm3(q * 1.2 + w * 1.6, 5);
  float n2 = fbm3(q * 2.1 - w, 3);
  // nuvens grandes e macias, mais densas na faixa galáctica
  float cl = smoothstep(0.45, 0.8, n) * (0.25 + 0.75 * band);
  vec3 c = mix(uNebA, uNebB, smoothstep(0.35, 0.65, n2));
  c = mix(c, uNebC, smoothstep(0.6, 0.85, fbm3(q * 0.9 + 7.0, 3)) * 0.7);
  // faixa: brilho difuso de estrelas não resolvidas + poeira escura
  float dust = smoothstep(0.5, 0.72, fbm3(q * 2.6 + 3.0, 4)) * band;
  vec3 neb = c * cl * 0.9;
  neb += mix(vec3(0.75, 0.78, 1.0), c, 0.35) * band * (0.25 + 0.5 * n) * 0.6;
  neb *= 1.0 - 0.8 * dust;
  return neb * 0.09;
}

// ── aurora: cortinas projetadas em camadas horizontais ──
vec3 aurora(vec3 rdl) {
  if (rdl.y <= 0.01) return vec3(0.0);
  vec3 acc = vec3(0.0);
  // dither por pixel: quebra o bandeamento das camadas
  float jit = hash12(gl_FragCoord.xy);
  for (int i = 0; i < 24; i++) {
    float fi = (float(i) + jit) / 24.0;
    float h = 1.0 + fi * 2.2;
    vec2 q = rdl.xz / rdl.y * h;
    float x = q.x * 0.35;
    float c = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float line = (fk - 1.0) * 3.2 + sin(x * 0.8 + fk * 2.3 + uTime * 0.03) * 1.3 + (vnoise2(vec2(x * 0.7, fk * 7.0)) - 0.5) * 3.5;
      float d = q.y * 0.35 - line * 0.35 * 2.0;
      // raios verticais (estrias) e borda inferior nítida
      float rays = 0.25 + 0.75 * pow(vnoise2(vec2(x * 18.0 + fk * 5.0, fk * 3.0)), 2.0);
      float prof = exp(-d * d * 9.0);
      c += prof * rays;
    }
    // base da cortina brilhante, topo esmaecendo
    float vert = (1.0 - fi) * (1.0 - fi) * 1.4 + 0.1;
    vec3 col = mix(uAurLow, uAurHigh, smoothstep(0.15, 0.85, fi));
    acc += col * c * vert;
  }
  float fade = smoothstep(0.01, 0.2, rdl.y);
  return acc * fade * 0.08 * uAurora;
}

// ── corpos ──
vec3 bodySurface(int i, vec3 n, float type, vec3 c1, vec3 c2, float seed) {
  vec3 q = n * 2.2 + seed * 13.1;
  float f = fbm3(q, 5);
  float f2 = fbm3(q * 3.7 + 5.0, 4);
  vec3 alb;
  if (type > 1.5 && type < 2.5) {
    // gasoso: faixas de latitude turbulentas
    float lat = n.y * 7.0 + (f - 0.5) * 2.4;
    float bands = 0.5 + 0.5 * sin(lat * 3.0 + seed * 9.0);
    alb = mix(c1, c2, bands) * (0.85 + 0.3 * f2);
  } else if (type > 0.5 && type < 1.5) {
    // oceano + continentes + nuvens
    float land = smoothstep(0.5, 0.53, f);
    alb = mix(c2 * 0.35, c1 * (0.7 + 0.5 * f2), land);
    float cl = smoothstep(0.52, 0.72, fbm3(q * 1.6 + vec3(f2 * 2.0), 5));
    alb = mix(alb, vec3(0.85), cl * 0.85);
  } else {
    // rochoso / gelo: mares escuros, crateras sugeridas, poeira clara
    float maria = smoothstep(0.42, 0.6, fbm3(q * 0.6 + 2.0, 4));
    alb = mix(c1, c2, f2) * mix(1.1, 0.55, maria);
    float cr = vnoise3(q * 6.0);
    alb *= 0.8 + 0.4 * smoothstep(0.2, 0.9, cr);
    if (type > 2.5) alb = mix(alb, vec3(0.8, 0.86, 0.92), 0.5 * smoothstep(0.4, 0.7, f));
  }
  return alb;
}

vec3 starLight(vec3 n, vec3 alb) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float d = dot(n, uLightDir[l]);
    c += uStarE[l] * alb / PI * max(0.0, (d + 0.04) / 1.04) * 3.0;
  }
  return c;
}

void composeBodies(vec3 rd, inout vec3 col, inout vec3 glowAdd) {
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= uBodyCount) break;
    vec3 c = uBodyPos[i].xyz;
    float R = uBodyPos[i].w;
    float b = dot(rd, c);
    if (b <= 0.0) continue;
    float d2 = dot(c, c) - b * b;
    float dperp = sqrt(max(0.0, d2));
    float pix = b * uPixelAngle;
    vec4 atm = uBodyAtm[i];
    float glowR = R * (1.0 + max(atm.w, 0.0) * 1.6);
    // anel (atrás e na frente do corpo)
    vec4 rg = uBodyRing[i];
    float ringT = -1.0;
    vec4 ringC = vec4(0.0);
    if (rg.w > 0.5) {
      vec3 N = uBodyRingN[i].xyz;
      float dn = dot(rd, N);
      if (abs(dn) > 1e-5) {
        float t = dot(c, N) / dn;
        if (t > 0.0) {
          vec3 P = rd * t - c;
          float rr = length(P) / R;
          if (rr > rg.x && rr < rg.y) {
            float x = (rr - rg.x) / (rg.y - rg.x);
            float dens = 0.45 + 0.55 * vnoise3(vec3(rr * 40.0, 0.0, uBodyCol2[i].w));
            dens *= smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.85, x);
            dens *= 1.0 - 0.75 * smoothstep(0.42, 0.46, x) * smoothstep(0.52, 0.48, x);
            // sombra do corpo no anel
            vec2 sh = atmoSphere(P, uLightDir[0], R);
            float lit = (sh.x < sh.y && sh.y > 0.0) ? 0.08 : 1.0;
            float fwd = pow(max(0.0, dot(rd, uLightDir[0])), 6.0) * 1.5;
            vec3 rc = uBodyRingC[i].rgb * (uStarE[0] / PI) * (0.55 + fwd) * lit;
            ringT = t;
            ringC = vec4(rc, dens * rg.z);
          }
        }
      }
    }
    // disco
    float cover = clamp((R - dperp) / pix + 0.5, 0.0, 1.0);
    float tHit = 1e20;
    vec3 surf = vec3(0.0);
    if (cover > 0.0) {
      float th = sqrt(max(0.0, R * R - min(d2, R * R)));
      tHit = b - th;
      vec3 n = normalize(rd * tHit - c);
      vec4 k1 = uBodyCol[i];
      vec4 k2 = uBodyCol2[i];
      vec3 alb = bodySurface(i, n, k1.w, k1.rgb, k2.rgb, k2.w);
      surf = starLight(n, alb);
      // lado noturno: luz refletida do planeta (fraca)
      surf += alb * length(uStarE[0]) * 0.006;
      if (atm.w > 0.0) {
        float lit = smoothstep(-0.25, 0.45, dot(n, uLightDir[0]));
        float fr = pow(1.0 - max(0.0, dot(n, -rd)), 3.0);
        vec3 haze = atm.rgb * (uStarE[0] / PI) * lit;
        surf = mix(surf, haze * 0.6, 0.18 * lit);
        surf += haze * fr * 0.9;
      }
    }
    // anel atrás do disco
    if (ringC.a > 0.0 && ringT > tHit) col = mix(col, ringC.rgb, ringC.a * (1.0 - cover));
    if (cover > 0.0) col = mix(col, surf, cover);
    if (ringC.a > 0.0 && ringT <= tHit) col = mix(col, ringC.rgb, ringC.a);
    // halo atmosférico além do limbo
    if (atm.w > 0.0 && dperp > R * 0.98 && dperp < glowR) {
      vec3 nc = normalize(rd * b - c);
      float lit = smoothstep(-0.35, 0.35, dot(nc, uLightDir[0]));
      float x = (dperp - R) / (R * atm.w);
      float g = exp(-max(x, 0.0) * 3.2) * (1.0 - smoothstep(0.85, 1.0, (dperp - R) / (glowR - R)));
      float back = 1.0 + 2.5 * pow(max(0.0, dot(rd, uLightDir[0])), 4.0);
      glowAdd += atm.rgb * (uStarE[0] / PI) * lit * g * 0.55 * back;
    }
  }
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vDir);
  vec3 ro = uCamPos;
  float r = length(ro);
  vec3 up = ro / r;
  float tg = atmoGround(ro, rd);
  vec3 L;
  vec3 T;
  if (uInside > 0.5) {
    float mu = dot(up, rd);
    float zen = acos(clamp(mu, -1.0, 1.0));
    float az = atan(dot(rd, uEast), dot(rd, uNorth));
    if (az < 0.0) az += 2.0 * PI;
    L = texture2D(uSkyView, skyViewUV(r, zen, az)).rgb;
    if (tg > 0.0) {
      vec3 Pg = ro + rd * tg;
      float rg = length(Pg);
      T = atmoTransmittance(rg, dot(Pg / rg, -rd)) / max(vec3(1e-4), atmoTransmittance(r, -mu));
      T = clamp(T, 0.0, 1.0);
    } else {
      T = atmoTransmittance(r, mu);
    }
  } else {
    atmoIntegrate(ro, rd, 1e9, uSteps, L, T);
  }

  vec3 bg = vec3(0.0);
  vec3 add = vec3(0.0);
  if (tg > 0.0) {
    // chão além da malha do planeta: albedo iluminado pelos sóis
    vec3 Pg = ro + rd * tg;
    vec3 n = normalize(Pg);
    vec3 E = vec3(0.0);
    for (int l = 0; l < 3; l++) {
      float mu = dot(n, uLightDir[l]);
      E += uLightE[l] * atmoSunTrans(uRb + 0.001, mu) * max(0.0, mu);
    }
    bg = uGroundAlbedo / PI * E;
  } else {
    vec3 pi = normalize(uToInertial * rd);
    float band = exp(-pow(dot(pi, uGalN) / 0.22, 2.0));
    float skyL = lum(L);
    float dark = 1.0 - smoothstep(0.015, 0.14, skyL);
    // de dia (sol acima do horizonte com atmosfera) as estrelas somem
    float hasAtmo = step(1e-6, uRayScat.r + uRayScat.g + uRayScat.b);
    float dayF = max(smoothstep(-0.1, 0.06, dot(up, uLightDir[0])), smoothstep(-0.1, 0.06, dot(up, uLightDir[1])) * step(0.0, uStarAng[1] - 1e-9));
    dark *= 1.0 - dayF * hasAtmo * step(uInside, 1.5) * uInside;
    if (dark > 0.0) {
      vec3 st = starLayer(pi, 60.0, 0.35, 1.0, 1.0, band);
      st += starLayer(pi, 150.0, 0.25, 0.55, 7.0, band);
      st += starLayer(pi, 340.0, 0.2, 0.3, 13.0, band);
      bg += (st + nebula(pi, band)) * dark;
    }
    // sóis: disco com escurecimento de limbo
    for (int l = 0; l < 2; l++) {
      float ang = uStarAng[l];
      if (ang <= 0.0) continue;
      float th = acos(clamp(dot(rd, uLightDir[l]), -1.0, 1.0));
      float cover = clamp((ang - th) / uPixelAngle + 0.5, 0.0, 1.0);
      if (cover > 0.0) {
        float x = clamp(th / ang, 0.0, 1.0);
        float muD = sqrt(1.0 - x * x);
        float ld = 1.0 - 0.6 * (1.0 - muD) - 0.15 * (1.0 - muD) * (1.0 - muD);
        vec3 tint = mix(uStarTint[l], uStarTint[l] * vec3(1.0, 0.82, 0.6), 1.0 - muD);
        float rad = min(900.0, length(uStarE[l]) / (PI * ang * ang) * 0.02);
        bg = mix(bg, tint * rad * ld, cover);
      }
      // halo (coroa + espalhamento no olho/lente) — atenuado pela atmosfera
      float e = length(uStarE[l]);
      add += uStarTint[l] * e * T * (1.2 * exp(-th / (ang * 2.5)) + 0.22 * exp(-th / (ang * 9.0)) + 0.045 * exp(-th / 0.09) + 0.01 * exp(-th / 0.4));
    }
    vec3 glowAdd = vec3(0.0);
    composeBodies(rd, bg, glowAdd);
    bg += glowAdd;
    if (uAurora > 0.0) {
      vec3 rdl = vec3(dot(rd, uEast), dot(rd, up), dot(rd, uNorth));
      add += aurora(rdl) * clamp(1.0 - skyL * 3.0, 0.0, 1.0) * (1.0 - dayF * hasAtmo);
    }
  }
  vec3 col = L + T * bg + add;
  gl_FragColor = vec4(min(col, vec3(6.0e4)), 1.0);
}`;

export function createDome(sharedUniforms) {
  const u = {
    ...sharedUniforms,
    uSkyView: { value: null },
    uCamPos: { value: new THREE.Vector3(0, 121, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uEast: { value: new THREE.Vector3(1, 0, 0) },
    uNorth: { value: new THREE.Vector3(0, 0, -1) },
    uInside: { value: 1 },
    uSteps: { value: 16 },
    uPixelAngle: { value: 0.001 },
    uTime: { value: 0 },
    uToInertial: { value: new THREE.Matrix3() },
    uStarE: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uStarAng: { value: [0, 0] },
    uStarTint: { value: [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)] },
    uGalN: { value: new THREE.Vector3(0.3, 0.9, 0.2).normalize() },
    uNebA: { value: new THREE.Vector3(0.25, 0.35, 1.0) },
    uNebB: { value: new THREE.Vector3(0.9, 0.3, 0.6) },
    uNebC: { value: new THREE.Vector3(0.2, 0.9, 0.8) },
    uNebSeed: { value: 0 },
    uStarGain: { value: 1 },
    uAurora: { value: 0 },
    uAurLow: { value: new THREE.Vector3(0.1, 1, 0.4) },
    uAurHigh: { value: new THREE.Vector3(0.6, 0.1, 0.9) },
    uBodyCount: { value: 0 },
    uBodyPos: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyCol: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyCol2: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyAtm: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyRing: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyRingN: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
    uBodyRingC: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4()) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.name = 'atmosphere:sky';
  mesh.scale.setScalar(1e9);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return { mesh, uniforms: u };
}
