/**
 * GLSL compartilhado da atmosfera (modelo de Hillaire 2020, "A Scalable and
 * Production Ready Sky and Atmosphere Rendering Technique").
 *
 * Unidades em km, origem no CENTRO do planeta. Até 3 luzes (sol, 2º sol de
 * sistema binário, lua dominante como luz noturna); luz com E = 0 é pulada.
 *
 * Mapeamentos:
 *   - transmitância 256×64: parametrização de Bruneton (r, μ) → uv
 *   - multiespalhamento 32×32: (μ_sol, altura) → Ψ_ms por unidade de iluminância
 *   - sky-view 256×128: (azimute ABSOLUTO no triedo local, zênite não linear
 *     concentrado no horizonte) — absoluto para servir a vários sóis
 *   - perspectiva aérea: froxels 32×32×32 empacotados num atlas 1024×32
 */

export const ATMO_UNIFORMS_GLSL = /* glsl */ `
uniform float uRb;
uniform float uRt;
uniform vec3 uRayScat;
uniform float uRayH;
uniform vec3 uMieScat;
uniform vec3 uMieExt;
uniform float uMieH;
uniform float uMieG;
uniform vec3 uAbs;
uniform float uAbsC;
uniform float uAbsW;
uniform vec3 uGroundAlbedo;
uniform vec3 uLightDir[3];
uniform vec3 uLightE[3];
uniform float uSkyGain;
uniform vec3 uAirglow;
`;

export const ATMO_FUNCS_GLSL = /* glsl */ `
#ifndef PI
#define PI 3.141592653589793
#endif

// interseção raio × esfera centrada na origem: (t0, t1); t0 > t1 = sem interseção
vec2 atmoSphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// distância até o chão (esfera Rb) ou -1
float atmoGround(vec3 ro, vec3 rd) {
  vec2 g = atmoSphere(ro, rd, uRb);
  return (g.x <= g.y && g.x > 0.0) ? g.x : -1.0;
}

struct AtmoMedium { vec3 rs; vec3 ms; vec3 scat; vec3 ext; };

AtmoMedium atmoMedium(float h) {
  h = max(h, 0.0);
  float dr = exp(-h / uRayH);
  float dm = exp(-h / uMieH);
  float da = max(0.0, 1.0 - abs(h - uAbsC) / uAbsW);
  AtmoMedium m;
  m.rs = uRayScat * dr;
  m.ms = uMieScat * dm;
  m.scat = m.rs + m.ms;
  m.ext = m.rs + uMieExt * dm + uAbs * da;
  return m;
}

float atmoPhaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float atmoPhaseM(float g, float mu) {
  float g2 = g * g;
  float k = 3.0 / (8.0 * PI) * (1.0 - g2) / (2.0 + g2);
  return k * (1.0 + mu * mu) / pow(max(1e-4, 1.0 + g2 - 2.0 * g * mu), 1.5);
}

// sombra suave do planeta (o disco do sol "afunda" no horizonte em ~0,7°)
float atmoPlanetShadow(float r, float mu) {
  float s = min(1.0, uRb / r);
  float muH = -sqrt(max(0.0, 1.0 - s * s));
  return smoothstep(muH - 0.006, muH + 0.006, mu);
}

// ── LUT de transmitância (Bruneton) ──
vec2 atmoTransUV(float r, float mu) {
  float H = sqrt(max(0.0, uRt * uRt - uRb * uRb));
  float rho = sqrt(max(0.0, r * r - uRb * uRb));
  float disc = r * r * (mu * mu - 1.0) + uRt * uRt;
  float d = max(0.0, -r * mu + sqrt(max(0.0, disc)));
  float dMin = uRt - r;
  float dMax = rho + H;
  float xMu = (d - dMin) / max(1e-6, dMax - dMin);
  float xR = rho / max(1e-6, H);
  // meio texel de margem (256×64)
  return vec2(0.5 / 256.0 + xMu * (1.0 - 1.0 / 256.0), 0.5 / 64.0 + xR * (1.0 - 1.0 / 64.0));
}
`;

/** Funções que dependem das LUTs (precisa declarar os samplers antes). */
export const ATMO_LUT_FUNCS_GLSL = /* glsl */ `
uniform sampler2D uTransLUT;
uniform sampler2D uMSLUT;

vec3 atmoTransmittance(float r, float mu) {
  r = clamp(r, uRb, uRt);
  return texture2D(uTransLUT, atmoTransUV(r, mu)).rgb;
}

// transmitância até a luz, com a sombra do planeta
vec3 atmoSunTrans(float r, float mu) {
  return atmoTransmittance(r, mu) * atmoPlanetShadow(r, mu);
}

vec3 atmoMS(float r, float mu) {
  vec2 uv = vec2(mu * 0.5 + 0.5, clamp((r - uRb) / (uRt - uRb), 0.0, 1.0));
  uv = 0.5 / 32.0 + uv * (31.0 / 32.0);
  return texture2D(uMSLUT, uv).rgb;
}

// Integra espalhamento (simples + múltiplo pela LUT) e transmitância ao longo
// de ro + rd·t, t ∈ [0, tMax]. Recorta na atmosfera e no chão. N passos com
// distribuição quadrática (mais amostras perto da câmera).
void atmoIntegrate(vec3 ro, vec3 rd, float tMax, int N, out vec3 L, out vec3 T) {
  L = vec3(0.0);
  T = vec3(1.0);
  vec2 ta = atmoSphere(ro, rd, uRt);
  if (ta.x > ta.y || ta.y <= 0.0) return;
  float t0 = max(ta.x, 0.0);
  float t1 = min(ta.y, tMax);
  float tg = atmoGround(ro, rd);
  if (tg > 0.0) t1 = min(t1, tg);
  if (t1 <= t0) return;
  float phR[3];
  float phM[3];
  for (int l = 0; l < 3; l++) {
    float mu = dot(rd, uLightDir[l]);
    phR[l] = atmoPhaseR(mu);
    phM[l] = atmoPhaseM(uMieG, mu);
  }
  float fN = float(N);
  float span = t1 - t0;
  float tPrev = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= N) break;
    float a = (float(i) + 1.0) / fN;
    float tNew = a * a;
    float s = (tPrev + tNew) * 0.5;
    float dt = (tNew - tPrev) * span;
    tPrev = tNew;
    vec3 P = ro + rd * (t0 + s * span);
    float r = length(P);
    vec3 up = P / r;
    AtmoMedium m = atmoMedium(r - uRb);
    vec3 S = vec3(0.0);
    for (int l = 0; l < 3; l++) {
      if (uLightE[l].x + uLightE[l].y + uLightE[l].z <= 0.0) continue;
      float muS = dot(up, uLightDir[l]);
      vec3 Ts = atmoSunTrans(r, muS);
      S += uLightE[l] * (Ts * (m.rs * phR[l] + m.ms * phM[l]) + atmoMS(r, muS) * m.scat);
    }
    // brilho noturno do próprio gás (emissão proporcional à densidade)
    S += uAirglow * (m.rs / max(1e-6, max(uRayScat.r, max(uRayScat.g, uRayScat.b))));
    vec3 st = exp(-m.ext * dt);
    vec3 Sint = (S - S * st) / max(m.ext, vec3(1e-7));
    L += T * Sint;
    T *= st;
  }
  L *= uSkyGain;
}
`;

/** Mapeamento do sky-view LUT (zênite não linear; azimute absoluto). */
export const SKYVIEW_MAP_GLSL = /* glsl */ `
// zênite (rad) e azimute (rad) → uv do sky-view, para a câmera no raio r
vec2 skyViewUV(float r, float zen, float az) {
  float vH = sqrt(max(0.0, r * r - uRb * uRb));
  float beta = acos(clamp(vH / r, -1.0, 1.0));
  float ZH = PI - beta;
  float v;
  if (zen < ZH) {
    float c = clamp(zen / ZH, 0.0, 1.0);
    c = 1.0 - sqrt(1.0 - c);
    v = c * 0.5;
  } else {
    float c = clamp((zen - ZH) / max(1e-5, beta), 0.0, 1.0);
    v = sqrt(c) * 0.5 + 0.5;
  }
  float u = az / (2.0 * PI);
  return vec2(u, 0.5 / 128.0 + v * (127.0 / 128.0));
}
`;
