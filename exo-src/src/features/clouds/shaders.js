/**
 * SHADERS DAS NUVENS VOLUMÉTRICAS.
 *
 * Unidades: METROS, origem no CENTRO do planeta (posição da câmera em float —
 * a 1,2e5 m o erro do float32 é ~1 cm, irrelevante para nuvens). As funções
 * da atmosfera (sky.glsl) trabalham em km: converter na chamada.
 *
 *   DENSITY_GLSL  campo de densidade: mapa de clima (cobertura/tipo/
 *                 tempestade) × gradiente de altura por tipo × forma
 *                 Perlin-Worley − erosão por Worley de detalhe
 *   MARCH_FRAG    raymarch na casca esférica em resolução reduzida (MRT):
 *                 Beer + pó, HG duplo, multiespalhamento por oitavas,
 *                 ambiente por altura, relâmpago, cirros, perspectiva aérea
 *   RESOLVE_FRAG  reprojeção temporal (posição média da nuvem → frame anterior)
 *   SHADOW_FRAG   sombra das nuvens no terreno + distância da cena (tela cheia)
 *   COMPOSITE_FRAG upscaling bilateral (profundidade) + neblina do clima
 */

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Reconstrução de raio/distância a partir do depth (reversed / log / padrão). */
export const RAY_GLSL = /* glsl */ `
uniform vec3 uC00;
uniform vec3 uC10;
uniform vec3 uC01;
uniform vec3 uC11;
uniform float uDepthMode;
uniform float uNear;
uniform float uFar;
vec3 cRay(vec2 uv) { return mix(mix(uC00, uC10, uv.x), mix(uC01, uC11, uv.x), uv.y); }
// profundidade de visão (m) ou -1 para o céu
float cViewZ(float d) {
  if (uDepthMode < 0.5) {
    if (d <= 0.0) return -1.0;
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    return dd / (d + c);
  } else if (uDepthMode < 1.5) {
    if (d >= 1.0) return -1.0;
    return exp2(d * log2(uFar + 1.0)) - 1.0;
  }
  if (d >= 1.0) return -1.0;
  float ndc = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / ((uFar + uNear) - ndc * (uFar - uNear));
}
`;

export const DENSITY_GLSL = /* glsl */ `
uniform highp sampler3D uShape;
uniform highp sampler3D uDetail;
uniform samplerCube uWeather;
uniform mat3 uWeatherRot;
uniform float uRin;
uniform float uRout;
uniform float uShapeScale;
uniform float uDetailScale;
uniform vec3 uShapeOff;
uniform vec3 uDetailOff;
uniform vec3 uShear;
uniform float uCoverage;
uniform float uTypeBias;
uniform float uStorm;
uniform float uDetailAmt;

float cRemap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

// gradiente vertical por tipo: 0 estrato (fino, baixo) · 0,5 cúmulo · 1 cumulonimbo
float cHeight(float h, float t) {
  float st = smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.1, 0.24, h));
  float cu = smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.3, 0.62, h));
  float cb = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.66, 1.0, h));
  return t < 0.5 ? mix(st, cu, t * 2.0) : mix(cu, cb, t * 2.0 - 1.0);
}

// clima no ponto: x = cobertura local, y = tipo, z = tempestade
vec3 cWeatherAt(vec3 dir) {
  vec4 w = texture(uWeather, uWeatherRot * dir);
  float cov = clamp(w.r * 0.62 + uCoverage * 1.12 - 0.38, 0.0, 1.0);
  float storm = w.b * uStorm;
  cov = max(cov, storm);
  float typ = clamp(w.g * 0.75 + uTypeBias + storm * 0.6, 0.0, 1.0);
  return vec3(cov, typ, storm);
}

vec3 gW = vec3(0.0);   // último clima amostrado (cobertura, tipo, tempestade)
float gWob = 0.0;      // ondulação da base no último ponto (+ = base mais baixa → coluna mais grossa)
float gDet = 0.5;      // fBm de detalhe no último ponto
// densidade normalizada (0..1). lod: 0 completo, 1 sem detalhe
float cDensity(vec3 p, float r, float lod) {
  float h = (r - uRin) / (uRout - uRin);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 w = cWeatherAt(p / r);
  gW = w;
  if (w.x * cHeight(clamp(h + 0.12, 0.0, 1.0), w.y) < 0.02 && w.x * cHeight(h, w.y) < 0.02) return 0.0;
  vec4 s = texture(uShape, p * uShapeScale + uShapeOff + uShear * h);
  // base ondulada (mais nas tempestades): a camada não é uma tampa lisa
  gWob = s.g - 0.5;
  float hb = h - gWob * (0.12 + 0.32 * w.z) * (1.0 - h);
  float hg = cHeight(clamp(hb, 0.0, 1.0), w.y);
  float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float base = clamp(cRemap(s.r, fbm - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  // limiar dependente da altura: perto do topo do perfil só os picos do
  // ruído sobrevivem → topos em domo (couve-flor), nunca um teto plano
  float thr = 1.0 - w.x * hg;
  float c = clamp(cRemap(base, thr, 1.0, 0.0, 1.0), 0.0, 1.0) * smoothstep(0.0, 0.25, hg) * w.x;
  if (c <= 0.0 || lod > 0.5) return c;
  vec3 d = texture(uDetail, p * uDetailScale + uDetailOff + uShear * h * 3.0).rgb;
  float df = d.r * 0.625 + d.g * 0.25 + d.b * 0.125;
  gDet = df;
  // perto da câmera (lod −1): uma oitava extra de erosão, 3,7× mais fina
  if (lod < -0.5) df = mix(df, texture(uDetail, p * uDetailScale * 3.7 + uDetailOff * 2.0).g, 0.3);
  // base: fiapos (Worley invertido) · topo: couve-flor
  float dm = mix(1.0 - df, df, clamp(h * 5.0, 0.0, 1.0));
  c = clamp(cRemap(c, dm * uDetailAmt, 1.0, 0.0, 1.0), 0.0, 1.0);
  // nuvens mais densas para o topo (base mais macia)
  return c * mix(0.55, 1.15, smoothstep(0.0, 0.5, h));
}
`;

export const MARCH_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 oL;
layout(location = 1) out highp vec4 oD;
#ifdef HAS_ATMO
ATMO_GLSL
#endif
RAY_GLSL_HERE
DENSITY_GLSL_HERE
uniform sampler2D uDepth;
uniform vec3 uCamPos;
uniform float uRground;
uniform vec3 uSunDir;
uniform vec3 uSunE;          // iluminância do sol no topo da atmosfera (sem atmosfera: já atenuada)
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uGroundBounce;
uniform float uSigma;        // extinção (1/m) por densidade 1
uniform float uMaxDist;
uniform int uSteps;
uniform int uLightSteps;
uniform float uLightStep;
uniform float uFrame;
uniform float uPowder;
uniform float uMsA;
uniform float uMsB;
uniform float uMsC;
uniform vec3 uFlashPos;
uniform vec3 uFlashE;
uniform float uCirrusR;
uniform float uCirrus;
uniform float uCirrusScale;
uniform vec3 uHazeColor;     // fallback sem atmosfera
uniform float uHazeDist;
uniform vec2 uLowSize;
uniform float uRainShaft;
uniform float uDbg;
uniform vec2 uJit;
varying vec2 vUv;

vec2 cSphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e30, -1e30);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
float cHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1e-4, 1.0 + g2 - 2.0 * g * c), 1.5));
}
float cPhase(float c, float k) {
  return mix(cHG(c, 0.82 * k), cHG(c, -0.28 * k), 0.3) + 0.012;
}
// ruído de gradiente intercalado (Jimenez) + deslocamento por frame (dourado)
float cIGN(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float cLightOD(vec3 p, vec3 ld, float jit) {
  float od = 0.0;
  float s = uLightStep;
  float t = s * (0.3 + 0.5 * jit);
  for (int j = 0; j < 8; j++) {
    if (j >= uLightSteps) break;
    vec3 q = p + ld * t;
    float rq = length(q);
    if (rq > uRout) break;
    od += cDensity(q, rq, j < 2 ? 0.0 : 1.0) * s;
    s *= 1.9;
    t += s;
  }
  return od;
}

void main() {
  // amostra deslocada (jitter sub-texel por frame) → a reprojeção em
  // resolução cheia reconstrói os detalhes entre os texels baixos
  vec2 uv = vUv + uJit / uLowSize;
  vec3 ray = cRay(uv);
  float rl = length(ray);
  vec3 rd = ray / rl;
  float vz = cViewZ(texture2D(uDepth, uv).r);
  float sceneT = vz < 0.0 ? 1e12 : vz * rl;
  vec3 ro = uCamPos;
  float r0 = length(ro);

  vec2 so = cSphere(ro, rd, uRout);
  vec2 si = cSphere(ro, rd, uRin);
  vec2 sg = cSphere(ro, rd, uRground);
  float tg = (sg.x <= sg.y && sg.x > 0.0) ? sg.x : 1e30;
  sceneT = min(sceneT, tg);
  float t0 = 0.0, t1 = -1.0;
  bool hitIn = si.x <= si.y && si.x > 0.0;
  if (r0 > uRout) {
    if (so.x <= so.y && so.y > 0.0) {
      t0 = so.x;
      t1 = hitIn ? si.x : so.y;
    }
  } else if (r0 > uRin) {
    t0 = 0.0;
    t1 = hitIn ? si.x : so.y;
  } else {
    t0 = si.y;
    t1 = so.y;
  }
  t1 = min(min(t1, sceneT), t0 + uMaxDist);

  vec3 L = vec3(0.0);
  float T = 1.0;
  float tW = 0.0, wS = 0.0;
  float jit = fract(cIGN(gl_FragCoord.xy) + uFrame * 0.61803398);
  float cosT = dot(rd, uSunDir);
  float ph0 = cPhase(cosT, 1.0);
  float ph1 = cPhase(cosT, uMsC);
  float ph2 = cPhase(cosT, uMsC * uMsC);
  vec3 sunCol = uSunE;
  bool first = true;
  float inside = (r0 > uRin && r0 < uRout) ? 1.0 : 0.0;

  // ── cortinas de chuva sob as células de tempestade (câmera abaixo da base) ──
  vec3 Lr = vec3(0.0);
  float Tr = 1.0;
  if (uRainShaft > 0.0 && r0 < uRin) {
    float tEnd = min(min(sceneT, t1 > t0 ? t0 : 40000.0), 40000.0);
    const int NR = 10;
    float dtr = tEnd / float(NR);
    for (int i = 0; i < NR; i++) {
      float tr = (float(i) + jit) * dtr;
      vec3 p = ro + rd * tr;
      float r = length(p);
      vec3 dir = p / r;
      vec3 w = cWeatherAt(dir);
      // colunas: ruído amostrado na base da nuvem (constante na vertical)
      vec4 n = texture(uShape, dir * uRin * uShapeScale * 2.5 + uShapeOff);
      float hcol = clamp((uRin - r) / max(1.0, uRin - uRground), 0.0, 1.0);
      float dens = uRainShaft * (w.z * 1.6 + 0.08 * w.x) * smoothstep(0.55, 0.85, n.g) * smoothstep(0.0, 0.15, hcol);
      float sg = dens * 0.00035;
      if (sg > 0.0) {
        float st = exp(-sg * dtr);
        vec3 Sr = uAmbBottom * 1.3 + uFlashE * 0.01;
        Lr += Tr * Sr * (1.0 - st);
        Tr *= st;
      }
    }
  }

  if (t1 > t0) {
    // marcha adaptativa (grossa → fina): passos grossos com a densidade sem
    // detalhe até achar nuvem; aí recua e anda em passos finos (proporcionais
    // ao tamanho do pixel na distância) enquanto houver nuvem. Silhuetas
    // nítidas perto, alcance de ~180 km no horizonte com o mesmo orçamento.
    float t = t0 + max(150.0, t0 * 0.035) * jit;
    float tEmpty = t0;
    int fine = 0;
    for (int i = 0; i < 220; i++) {
      if (i >= uSteps || t >= t1) break;
      vec3 p = ro + rd * t;
      float r = length(p);
      if (fine == 0) {
        float dc = max(150.0, t * 0.035);
        if (cDensity(p, r, 1.0) > 0.0) {
          float tb = max(tEmpty, t - dc * 0.8);
          fine = 10;
          if (tb < t - 1.0) { t = tb; continue; }
        } else {
          tEmpty = t;
          t += dc;
          continue;
        }
      }
      float ds = max(40.0, t * 0.008);
      float dt = min(ds, t1 - t);
      float ta = t;
      t += ds;
      float den = cDensity(p, r, ta > 45000.0 ? 1.0 : (ta < 5000.0 ? -1.0 : 0.0));
      if (den <= 0.002) {
        fine--;
        tEmpty = ta;
        continue;
      }
      fine = 10;
      {
        vec3 up = p / r;
        float h = (r - uRin) / (uRout - uRin);
        if (first) {
          first = false;
#ifdef HAS_ATMO
          sunCol = uSunE * atmoSunTrans(r * 0.001, dot(up, uSunDir));
#endif
        }
        vec3 wHere = gW;
        float wob = gWob;
        float det = gDet;
        float sig = den * uSigma;
        float od = cLightOD(p, uSunDir, jit) * uSigma;
        gW = wHere;
        // multiespalhamento aproximado (oitavas: extinção a^k, energia b^k, fase c^k)
        float lum = exp(-od) * ph0 + uMsB * exp(-od * uMsA) * ph1 + uMsB * uMsB * exp(-od * uMsA * uMsA) * ph2;
        // transmissão difusa (dois fluxos): mesmo nuvens grossas deixam passar
        // luz ~1/(1+0,75·τ·(1−g)) → bases com textura (partes finas mais claras)
        lum += 0.05 / (1.0 + 0.09 * od);
        // efeito "pó" (bordas viradas para o sol mais escuras de perto)
        float pw = 1.0 - exp(-sig * 180.0);
        lum *= mix(1.0, pw, uPowder * (0.5 + 0.5 * clamp(-cosT, 0.0, 1.0)) + 0.25 * uPowder);
        vec3 amb = mix(uAmbBottom, uAmbTop, clamp(h * 1.25, 0.0, 1.0)) * (0.55 + 0.45 * exp(-den * 2.0));
        // oclusão do céu pela coluna de nuvem (proxy: profundidade óptica até o
        // sol): núcleos grossos escuros, partes finas claras → bases com relevo
        amb *= mix(0.45, 1.0, exp(-od * 0.012));
        // ...e oclusão VERTICAL (duas amostras grossas acima): de baixo, partes
        // grossas da base ficam escuras e as finas claras — relevo da base
        {
          vec3 q1 = p + up * 250.0;
          vec3 q2 = p + up * 800.0;
          float odUp = (cDensity(q1, length(q1), 1.0) * 250.0 + cDensity(q2, length(q2), 1.0) * 550.0) * uSigma;
          amb *= mix(0.12, 1.0, exp(-odUp * 0.015));
        }
        // de baixo: onde a base desce a coluna é mais grossa (mais escura), e
        // o detalhe dá o mosqueado — sem isso um teto fechado vira um cinza liso
        float under = (1.0 - smoothstep(0.0, 0.3, h)) * clamp(dot(rd, up) * 4.0, 0.0, 1.0);
        float relief = mix(1.0, clamp(1.0 - wob * (2.0 + 2.5 * wHere.z), 0.15, 1.8) * (0.55 + 0.9 * det), under);
        gW = wHere;
        // luz refletida pelo chão: só onde o sol chega ao chão (céu aberto)
        amb += uGroundBounce * (1.0 - clamp(h * 3.0, 0.0, 1.0)) * exp(-od * 0.02);
        // núcleos de tempestade: bases mais escuras e pesadas
        float sk = gW.z;
        amb *= 1.0 - 0.7 * sk;
        lum *= 1.0 - 0.5 * sk;
        vec3 S = (sunCol * lum + amb) * relief;
        float fd = length(p - uFlashPos);
        S += uFlashE * (0.25 + 0.75 * exp(-od * 0.3)) / (1.0 + fd * fd * 1.5e-5);
        float st = exp(-sig * dt);
        float absorb = T * (1.0 - st);
        L += S * absorb;
        tW += ta * absorb;
        wS += absorb;
        T *= st;
        if (T < 0.008) { T = 0.0; break; }
      }
    }
  }

  // ── cirros (casca fina alta, analítica) ──
  if (uCirrus > 0.0) {
    vec2 sc = cSphere(ro, rd, uCirrusR);
    float tc = r0 < uCirrusR ? sc.y : (sc.x <= sc.y && sc.x > 0.0 ? sc.x : -1.0);
    if (tc > 0.0 && tc < sceneT) {
      vec3 pc = ro + rd * tc;
      vec3 dc = normalize(pc);
      vec4 cw = texture(uWeather, uWeatherRot * dc);
      vec3 q = pc * uCirrusScale;
      // fiapos: faixas em torno de uma isolinha de um ruído esticado (rabos
      // de galo), quebradas por um segundo ruído e deformadas por um terceiro
      vec4 nw = texture(uDetail, q * 0.6 + uDetailOff * 0.1);
      vec3 qs = vec3(q.x * 0.22, q.y * 0.9, q.z * 0.22) + (nw.rgb - 0.5) * 0.18;
      vec4 n1 = texture(uShape, qs + uShapeOff * 0.3);
      float iso = n1.g * 0.65 + n1.b * 0.35;
      float fil = clamp(1.0 - abs(iso - 0.6) * 7.0, 0.0, 1.0);
      vec4 n2 = texture(uDetail, vec3(q.x * 1.4, q.y * 5.0, q.z * 1.4) + uDetailOff * 0.2);
      float cd = fil * fil * smoothstep(0.3, 0.75, n2.r * 0.7 + n1.a * 0.5) * 1.25 * cw.a * uCirrus;
      float grazing = clamp(abs(dot(rd, dc)) * 6.0, 0.15, 1.0);
      float a = clamp(cd / grazing * 0.5, 0.0, 0.6);
      if (a > 0.003) {
        vec3 sunC = uSunE;
#ifdef HAS_ATMO
        sunC = uSunE * atmoSunTrans(length(pc) * 0.001, dot(dc, uSunDir));
#endif
        vec3 Sc = sunC * (cHG(cosT, 0.6) * 0.7 + 0.06) + uAmbTop * 1.1;
        if (tc < (wS > 0.0 ? tW / wS : 1e30)) {
          // cirro na frente (câmera acima dele)
          L = Sc * a + L * (1.0 - a);
          tW += tc * a * 0.2; wS += a * 0.2;
        } else {
          L += T * Sc * a;
          tW += tc * T * a * 0.2; wS += T * a * 0.2;
        }
        T *= 1.0 - a;
      }
    }
  }

  // chuva na frente das nuvens
  L = Lr + Tr * L;
  T *= Tr;
  if (Tr < 0.999) { tW += (1.0 - Tr) * 3000.0; wS += 1.0 - Tr; }
  float tMean = wS > 1e-4 ? tW / wS : (t1 > t0 ? 0.5 * (t0 + t1) : min(sceneT, 2e5));
  if (wS > 1e-4 && uDbg < 1.5) {
#ifdef HAS_ATMO
    vec3 Lap, Tap;
    atmoIntegrate(ro * 0.001, rd, tMean * 0.001, 8, Lap, Tap);
    // o ar entre a câmera e a nuvem fica à sombra das próprias nuvens:
    // sem isso a base de uma tempestade some num véu claro
    {
      vec3 pm = ro + rd * (tMean * 0.5);
      float rm = length(pm);
      vec2 so2 = cSphere(pm, uSunDir, uRout);
      vec2 si2 = cSphere(pm, uSunDir, uRin);
      float ta = rm < uRin ? si2.y : 0.0;
      float tb = min(so2.y, ta + 6000.0);
      float ods = 0.0;
      if (rm < uRout && tb > ta) {
        float sg = (tb - ta) * 0.25;
        for (int k = 0; k < 4; k++) {
          vec3 q = pm + uSunDir * (ta + (float(k) + 0.5) * sg);
          ods += cDensity(q, length(q), 1.0) * sg;
        }
      }
      float shA = exp(-ods * uSigma * 0.3);
      // à sombra, o ar só recebe a luz difusa que atravessa a base: o véu
      // toma a cor da própria nuvem (atenua pouco) em vez do céu ensolarado
      vec3 tr = mix(Tap, vec3(1.0), (1.0 - shA) * 0.85);
      L = L * tr + Lap * (0.01 + 0.99 * shA) * (1.0 - T);
    }
#else
    float f = 1.0 - exp(-tMean / uHazeDist);
    L = mix(L, uHazeColor * (1.0 - T), f);
#endif
  }
  oL = vec4(L, T);
  oD = vec4(min(tMean * 0.001, 6e4), min(sceneT * 0.001, 6e4), wS, 1.0);
}`;

export const RESOLVE_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 oL;
layout(location = 1) out highp vec4 oD;
RAY_GLSL_HERE
uniform sampler2D uCurL;
uniform sampler2D uCurD;
uniform sampler2D uHistL;
uniform sampler2D uHistD;
uniform sampler2D uF;
uniform mat4 uPrevVP;
uniform vec3 uCamDelta;
uniform float uBlend;
uniform float uHistValid;
uniform vec2 uLowSize;
uniform vec2 uJit;
varying vec2 vUv;
// Reprojeção temporal em RESOLUÇÃO CHEIA (upsampling temporal):
// 1) upsampling bilateral (profundidade) do quadro baixo atual, cujas
//    amostras estão nos centros deslocados pelo jitter deste frame;
// 2) história do frame anterior reprojetada pela distância média da nuvem;
// 3) mistura com peso maior onde um centro de amostra cai sobre o pixel —
//    com a câmera parada, 4 frames cobrem os 2×2 pixels de cada texel baixo.
void main() {
  float dist = texture2D(uF, vUv).g;       // km (6e4 = céu)
  vec2 st = vUv * uLowSize - 0.5 - uJit;
  vec2 i0 = floor(st);
  vec2 f = st - i0;
  vec4 acc = vec4(0.0), accD = vec4(0.0);
  float ws = 0.0;
  vec4 bestL = vec4(0.0, 0.0, 0.0, 1.0), bestD = vec4(0.0);
  float bestErr = 1e9;
  float wNear = 0.0;
  vec4 mn = vec4(1e9), mx = vec4(-1e9);
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k & 1), float(k >> 1));
    vec2 uv = (i0 + o + 0.5) / uLowSize;
    vec4 l = texture2D(uCurL, uv);
    vec4 d = texture2D(uCurD, uv);
    float bw = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
    float rel = abs(d.y - dist) / max(1e-3, min(d.y, dist));
    float w = bw / (0.02 + rel * rel * 40.0);
    acc += l * w;
    accD += d * w;
    ws += w;
    if (rel < bestErr) { bestErr = rel; bestL = l; bestD = d; }
    if (rel < 0.15) {
      mn = min(mn, l);
      mx = max(mx, l);
      vec2 dd = f - o;
      wNear = max(wNear, exp(-dot(dd, dd) * 10.0));
    }
  }
  vec4 cL = ws > 1e-4 ? acc / ws : bestL;
  vec4 cD = ws > 1e-4 ? accD / ws : bestD;
  if (mn.x > 1e8) { mn = cL; mx = cL; }

  vec3 rd = normalize(cRay(vUv));
  vec3 P = rd * (cD.x * 1000.0) + uCamDelta;
  vec4 c = uPrevVP * vec4(P, 1.0);
  vec2 puv = c.xy / c.w * 0.5 + 0.5;
  float ok = uHistValid;
  if (c.w <= 0.0 || puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) ok = 0.0;
  vec4 hL = cL, hD = cD;
  if (ok > 0.5) {
    hL = texture2D(uHistL, puv);
    hD = texture2D(uHistD, puv);
    // rejeita onde a cena mudou de profundidade (silhuetas)
    float rel = abs(hD.y - dist) / max(1e-3, min(hD.y, dist));
    if (rel > 0.12) ok = 0.0;
    // vizinhança: limita a história ao intervalo local (frouxo, para não perder a acumulação)
    vec4 ext = (mx - mn) * 0.5 + vec4(0.02);
    hL = clamp(hL, mn - ext, mx + ext);
  }
  float b = ok > 0.5 ? clamp(uBlend * (0.2 + 1.6 * wNear), uBlend * 0.2, 1.0) : 1.0;
  oL = mix(hL, cL, b);
  oD = vec4(mix(hD.x, cD.x, b), dist, cD.z, 1.0);
}`;

export const SHADOW_FRAG = /* glsl */ `
layout(location = 0) out highp vec4 oF;
RAY_GLSL_HERE
DENSITY_GLSL_HERE
uniform sampler2D uDepth;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uSigma;
uniform float uShadowK;
uniform float uShadowStrength;
varying vec2 vUv;
vec2 sSphere(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e30, -1e30);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
void main() {
  vec3 ray = cRay(vUv);
  float rl = length(ray);
  float vz = cViewZ(texture2D(uDepth, vUv).r);
  if (vz < 0.0) { oF = vec4(1.0, 6e4, 0.0, 1.0); return; }
  float dist = vz * rl;
  vec3 P = uCamPos + ray * vz;
  float r = length(P);
  float sh = 1.0;
  float mu = dot(P / r, uSunDir);
  if (uShadowStrength > 0.0 && mu > -0.05 && r < uRout) {
    vec2 so = sSphere(P, uSunDir, uRout);
    vec2 si = sSphere(P, uSunDir, uRin);
    float ta = r < uRin ? si.y : 0.0;
    float tb = min(so.y, ta + 9000.0);
    if (tb > ta) {
      float seg = (tb - ta) / 5.0;
      float od = 0.0;
      for (int k = 0; k < 5; k++) {
        vec3 q = P + uSunDir * (ta + (float(k) + 0.5) * seg);
        od += cDensity(q, length(q), 1.0) * seg;
      }
      float T = exp(-od * uSigma * uShadowK);
      sh = mix(1.0, T, uShadowStrength * smoothstep(-0.05, 0.08, mu));
    }
  }
  oF = vec4(sh, min(dist * 0.001, 6e4), 0.0, 1.0);
}`;

export const MUL_FRAG = /* glsl */ `
uniform sampler2D uF;
varying vec2 vUv;
void main() { gl_FragColor = vec4(vec3(texture2D(uF, vUv).r), 1.0); }`;

export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uL;
uniform sampler2D uD;
uniform sampler2D uF;
uniform vec2 uLowSize;
uniform vec3 uC00;
uniform vec3 uC10;
uniform vec3 uC01;
uniform vec3 uC11;
uniform vec3 uUp;
uniform float uFogSigma;     // 1/m na altura da câmera
uniform float uFogH;         // escala de altura (m)
uniform vec3 uFogColor;
uniform float uFogMax;       // distância máxima considerada (m)
uniform float uCloudsOn;
uniform float uDbg;
varying vec2 vUv;
void main() {
  float dist = texture2D(uF, vUv).g;       // km
  vec4 c = uCloudsOn > 0.5 ? texture2D(uL, vUv) : vec4(0.0, 0.0, 0.0, 1.0);
  // neblina do clima (exponencial em altura) até a "superfície" efetiva
  vec3 rd = normalize(mix(mix(uC00, uC10, vUv.x), mix(uC01, uC11, vUv.x), vUv.y));
  vec4 o = c;
  if (uFogSigma > 0.0) {
    float cd = texture2D(uD, vUv).x;
    float d = min(mix(dist, cd, 1.0 - c.a) * 1000.0, uFogMax);
    float mu = dot(rd, uUp);
    float k = mu / uFogH;
    float od = uFogSigma * (abs(k * d) < 1e-3 ? d : (1.0 - exp(-k * d)) / k);
    float Tf = exp(-od);
    o = vec4(c.rgb * Tf + uFogColor * (1.0 - Tf), c.a * Tf);
  }
  if (uDbg > 0.5 && uDbg < 1.5) o = vec4(vec3(c.a), 0.0);
  if (uDbg > 2.5) o = vec4(c.rgb, 0.0);
  gl_FragColor = o;
}`;
