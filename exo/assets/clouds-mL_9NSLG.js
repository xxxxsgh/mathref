import{Dt as e,Et as t,I as n,J as r,P as i,Tt as a,W as o,X as s,Y as c,dt as l,et as u,ht as d,i as f,jt as p,kt as m,lt as h,mt as g,rt as _,s as v,tt as y,ut as b}from"./three-Do4x7iGi.js";var x=`
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,S=`
uniform uint uSeed;
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(ivec3 c) {
  uvec3 h = pcg3(uvec3(c + 4096) ^ uvec3(uSeed, uSeed * 7u + 3u, uSeed * 13u + 11u));
  return vec3(h) * (1.0 / 4294967295.0);
}
// Worley periódico: 1 − distância à semente mais próxima (bolhas "cheias")
float worley(vec3 p, float period) {
  vec3 pc = floor(p);
  vec3 pf = p - pc;
  float d = 1e9;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z);
    vec3 c = mod(pc + o, period);
    vec3 fp = o + hash3(ivec3(c)) - pf;
    d = min(d, dot(fp, fp));
  }
  return 1.0 - clamp(sqrt(d), 0.0, 1.0);
}
float worleyFbm(vec3 uvw, float f) {
  return worley(uvw * f, f) * 0.625 + worley(uvw * f * 2.0, f * 2.0) * 0.25 + worley(uvw * f * 4.0, f * 4.0) * 0.125;
}
vec3 grad3(ivec3 c) { return normalize(hash3(c) * 2.0 - 1.0 + 1e-4); }
float perlin(vec3 p, float period) {
  vec3 pc = floor(p);
  vec3 pf = p - pc;
  vec3 w = pf * pf * pf * (pf * (pf * 6.0 - 15.0) + 10.0);
  float n[8];
  for (int i = 0; i < 8; i++) {
    vec3 o = vec3(i & 1, (i >> 1) & 1, (i >> 2) & 1);
    vec3 c = mod(pc + o, period);
    n[i] = dot(grad3(ivec3(c)), pf - o);
  }
  float x0 = mix(n[0], n[1], w.x), x1 = mix(n[2], n[3], w.x);
  float x2 = mix(n[4], n[5], w.x), x3 = mix(n[6], n[7], w.x);
  return mix(mix(x0, x1, w.y), mix(x2, x3, w.y), w.z);
}
float perlinFbm(vec3 uvw, float f, int oct) {
  float s = 0.0, a = 1.0, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += perlin(uvw * f, f) * a;
    n += a;
    a *= 0.5;
    f *= 2.0;
  }
  return s / n;
}
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
`,C=`
precision highp float;
${S}
uniform float uZ;
in vec2 vUv;
out vec4 oC;
void main() {
  vec3 uvw = vec3(vUv, uZ);
  float pf = perlinFbm(uvw, 4.0, 5) * 0.5 + 0.5;
  pf = clamp(pf * 1.25 - 0.12, 0.0, 1.0);
  float w1 = worleyFbm(uvw, 4.0);
  float pw = clamp(remap(pf, 0.0, 1.0, w1, 1.0), 0.0, 1.0);
  float w2 = worleyFbm(uvw, 8.0);
  float w3 = worleyFbm(uvw, 16.0);
  oC = vec4(pw, w1, w2, w3);
}`,w=`
precision highp float;
${S}
uniform float uZ;
in vec2 vUv;
out vec4 oC;
void main() {
  vec3 uvw = vec3(vUv, uZ);
  oC = vec4(worleyFbm(uvw, 2.0), worleyFbm(uvw, 4.0), worleyFbm(uvw, 8.0), 1.0);
}`,T=`
precision highp float;
uniform uint uSeed;
uniform int uFace;
uniform vec3 uOff;
in vec2 vUv;
out vec4 oC;
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float h1(vec3 c) {
  uvec3 h = pcg3(uvec3(ivec3(c) + 65536) ^ uvec3(uSeed, uSeed * 5u + 1u, uSeed * 17u + 9u));
  return float(h.x) * (1.0 / 4294967295.0);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h1(i), h1(i + vec3(1, 0, 0)), f.x), mix(h1(i + vec3(0, 1, 0)), h1(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h1(i + vec3(0, 0, 1)), h1(i + vec3(1, 0, 1)), f.x), mix(h1(i + vec3(0, 1, 1)), h1(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += vnoise(p) * a;
    n += a;
    a *= 0.5;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
  }
  return s / n;
}
vec3 faceDir(int f, vec2 uv) {
  float u = uv.x * 2.0 - 1.0, v = uv.y * 2.0 - 1.0;
  vec3 d;
  if (f == 0) d = vec3(1.0, -v, -u);
  else if (f == 1) d = vec3(-1.0, -v, u);
  else if (f == 2) d = vec3(u, 1.0, v);
  else if (f == 3) d = vec3(u, -1.0, -v);
  else if (f == 4) d = vec3(u, -v, 1.0);
  else d = vec3(-u, -v, -1.0);
  return normalize(d);
}
void main() {
  vec3 d = faceDir(uFace, vUv);
  vec3 p = d * 9.0 + uOff;
  // domínio deformado: frentes e redemoinhos em vez de manchas redondas
  vec3 q = vec3(fbm(p * 0.6, 4), fbm(p * 0.6 + 5.2, 4), fbm(p * 0.6 + 11.7, 4));
  vec3 pw = p + (q - 0.5) * 6.0;
  float cov = fbm(pw * 1.1, 6);
  cov = smoothstep(0.28, 0.72, cov);
  // faixas de latitude (zona de convergência no equador, ventos de oeste)
  float lat = abs(d.y);
  cov = clamp(cov + 0.12 * (1.0 - smoothstep(0.0, 0.25, lat)) - 0.08 * smoothstep(0.3, 0.5, lat) * (1.0 - smoothstep(0.6, 0.8, lat)), 0.0, 1.0);
  float typ = fbm(pw * 0.8 + 31.0, 4);
  typ = smoothstep(0.3, 0.75, typ);
  float storm = fbm(pw * 1.7 + 77.0, 5);
  storm = smoothstep(0.55, 0.78, storm) * smoothstep(0.35, 0.7, cov);
  float cir = fbm(vec3(d.x * 3.0, d.y * 14.0, d.z * 3.0) + uOff * 1.3 + 50.0, 5);
  cir = smoothstep(0.42, 0.75, cir);
  oC = vec4(cov, typ, storm, cir);
}`;function ee(e){let t=new _(2,2),n=new s(t,e);n.frustumCulled=!1;let r=new g;return r.add(n),{scene:r,mesh:n,geo:t}}function E(e,t,{shapeRes:n=64,detailRes:r=32}={}){let s=new y(-1,1,1,-1,0,1),c=e=>{let t=new m(e,e,e,{type:a,format:h,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1,minFilter:o,magFilter:o}),n=t.texture;return n.wrapS=n.wrapT=n.wrapR=l,n.minFilter=n.magFilter=o,t},u=e.getRenderTarget(),d={};for(let[a,o,l]of[[`shape`,n,C],[`detail`,r,w]]){let n=c(o),r=new b({glslVersion:i,vertexShader:`precision highp float;
in vec3 position;
in vec2 uv;
`+x,fragmentShader:l,uniforms:{uSeed:{value:t>>>0},uZ:{value:0}},depthTest:!1,depthWrite:!1}),u=ee(r);for(let t=0;t<o;t++)r.uniforms.uZ.value=(t+.5)/o,e.setRenderTarget(n,t),e.render(u.scene,s);r.dispose(),u.geo.dispose(),d[a]=n}return e.setRenderTarget(u),d}function D(t,n,r=256){let s=new y(-1,1,1,-1,0,1),c=new v(r,{type:a,format:h,generateMipmaps:!1,minFilter:o,magFilter:o,depthBuffer:!1}),l=new e(n%1e3/1e3*37.1,(n>>>10)%1e3/1e3*41.7,(n>>>20)%1e3/1e3*29.3),u=new b({glslVersion:i,vertexShader:`precision highp float;
in vec3 position;
in vec2 uv;
`+x,fragmentShader:T,uniforms:{uSeed:{value:n>>>0},uFace:{value:0},uOff:{value:l}},depthTest:!1,depthWrite:!1}),d=ee(u),f=t.getRenderTarget();for(let e=0;e<6;e++)u.uniforms.uFace.value=e,t.setRenderTarget(c,e),t.render(d.scene,s);return t.setRenderTarget(f),u.dispose(),d.geo.dispose(),c}var O=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,k=`
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
`,A=`
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
`,j=`
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
}`,M=`
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
}`,N=`
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
}`,P=`
uniform sampler2D uF;
varying vec2 vUv;
void main() { gl_FragColor = vec4(vec3(texture2D(uF, vUv).r), 1.0); }`,F=`
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
}`;function I(e,t,r=o){return new p(Math.max(1,e),Math.max(1,t),{count:2,type:n,format:h,depthBuffer:!1,stencilBuffer:!1,minFilter:r,magFilter:r,generateMipmaps:!1})}function L(e,t){return new p(Math.max(1,e),Math.max(1,t),{type:n,format:h,depthBuffer:!1,stencilBuffer:!1,minFilter:u,magFilter:u,generateMipmaps:!1})}var R=[[-.25,-.25],[.25,.25],[.25,-.25],[-.25,.25]],z=class{constructor(n,{shape:a,detail:o,weather:s,atmoGlsl:l,atmoUniforms:p}){this.ctx=n;let m=n.depthMode===`reversed`?0:n.depthMode===`log`?1:2,h=this.U={uC00:{value:new e},uC10:{value:new e},uC01:{value:new e},uC11:{value:new e},uDepthMode:{value:m},uNear:{value:n.camera.near},uFar:{value:n.camera.far},uShape:{value:a},uDetail:{value:o},uWeather:{value:s},uWeatherRot:{value:new r},uRin:{value:1},uRout:{value:2},uShapeScale:{value:1/9e3},uDetailScale:{value:1/800},uShapeOff:{value:new e},uDetailOff:{value:new e},uShear:{value:new e},uCoverage:{value:.45},uTypeBias:{value:0},uStorm:{value:0},uDetailAmt:{value:.38},uDepth:{value:null},uCamPos:{value:new e},uSunDir:{value:new e(0,1,0)},uSigma:{value:.04}};this.hasAtmo=!!l;let g=this.marchU={...p||{},...h,uRground:{value:1},uSunE:{value:new e(3,3,3)},uAmbTop:{value:new e(.3,.4,.6)},uAmbBottom:{value:new e(.15,.18,.25)},uGroundBounce:{value:new e},uMaxDist:{value:16e4},uSteps:{value:48},uLightSteps:{value:6},uLightStep:{value:45},uFrame:{value:0},uPowder:{value:.6},uMsA:{value:.3},uMsB:{value:.55},uMsC:{value:.5},uFlashPos:{value:new e(0,0,0)},uFlashE:{value:new e},uCirrusR:{value:3},uCirrus:{value:.6},uCirrusScale:{value:1/9e3},uHazeColor:{value:new e(.5,.6,.8)},uHazeDist:{value:6e4},uLowSize:{value:new t(1,1)},uRainShaft:{value:0},uDbg:{value:0},uJit:{value:new t}},_=j.replace(`ATMO_GLSL`,l||``).replace(`RAY_GLSL_HERE`,k).replace(`DENSITY_GLSL_HERE`,A),v=(e,t,n={})=>new d({uniforms:t,vertexShader:O,fragmentShader:e,depthTest:!1,depthWrite:!1,...n});this.mMarch=v(_,g,{glslVersion:i,defines:this.hasAtmo?{HAS_ATMO:1}:{}}),this.resolveU={uC00:h.uC00,uC10:h.uC10,uC01:h.uC01,uC11:h.uC11,uDepthMode:h.uDepthMode,uNear:h.uNear,uFar:h.uFar,uCurL:{value:null},uCurD:{value:null},uHistL:{value:null},uHistD:{value:null},uF:{value:null},uPrevVP:{value:new c},uCamDelta:{value:new e},uBlend:{value:.12},uHistValid:{value:0},uLowSize:g.uLowSize,uJit:g.uJit},this.mResolve=v(M.replace(`RAY_GLSL_HERE`,k),this.resolveU,{glslVersion:i}),this.shadowU={...h,uShadowK:{value:.35},uShadowStrength:{value:.8}},this.mShadow=v(N.replace(`RAY_GLSL_HERE`,k).replace(`DENSITY_GLSL_HERE`,A),this.shadowU,{glslVersion:i}),this.mMul=v(P,{uF:{value:null}},{blending:5,blendEquation:100,blendSrc:200,blendDst:202,blendEquationAlpha:100,blendSrcAlpha:200,blendDstAlpha:201}),this.compU={uL:{value:null},uD:{value:null},uF:{value:null},uLowSize:g.uLowSize,uC00:h.uC00,uC10:h.uC10,uC01:h.uC01,uC11:h.uC11,uUp:{value:new e(0,1,0)},uFogSigma:{value:0},uFogH:{value:900},uFogColor:{value:new e},uFogMax:{value:6e4},uCloudsOn:{value:1},uDbg:g.uDbg},this.mComp=v(F,this.compU,{blending:5,blendEquation:100,blendSrc:201,blendDst:204,blendEquationAlpha:100,blendSrcAlpha:200,blendDstAlpha:201}),this.quad=new f(this.mMarch),this.F=L(1,1),this.cur=I(1,1,u),this.hist=[I(1,1),I(1,1)],this.hi=0,this.histCount=0,this.scale=.5,this.frame=0,this.prevVP=new c,this.curVP=new c,this.prevCam=null,this.enabled=!0,this.cloudsOn=!0,this.shadowsOn=!0,this.fogOn=!1}_size(e,t){(this.F.width!==e||this.F.height!==t)&&this.F.setSize(e,t);let n=Math.max(1,Math.round(e*this.scale)),r=Math.max(1,Math.round(t*this.scale));if((this.cur.width!==n||this.cur.height!==r)&&(this.cur.setSize(n,r),this.histCount=0),this.hist[0].width!==e||this.hist[0].height!==t){for(let n of this.hist)n.setSize(e,t);this.histCount=0}this.marchU.uLowSize.value.set(n,r)}_draw(e,t){let n=this.ctx.renderer;n.setRenderTarget(t),this.quad.material=e,this.quad.render(n)}renderShadow(e){if(!this.enabled||!(e!=null&&e.depthTexture))return;let t=this.ctx.renderer;this._size(e.width,e.height);let n=t.getRenderTarget(),r=t.autoClear;t.autoClear=!1,this.U.uDepth.value=e.depthTexture,this.shadowU.uShadowStrength.value=this.shadowsOn&&this.cloudsOn?this._shadowStrength??.8:0,this._draw(this.mShadow,this.F),this.shadowsOn&&this.cloudsOn&&(this.mMul.uniforms.uF.value=this.F.texture,this._draw(this.mMul,e)),t.setRenderTarget(n),t.autoClear=r}renderClouds(t,{camera:n,camWorld:r,static:i}){if(!this.enabled||!(t!=null&&t.depthTexture)||!this.cloudsOn&&!this.fogOn)return;let a=this.ctx.renderer,o=a.getRenderTarget(),s=a.autoClear;a.autoClear=!1,this.frame++,this.marchU.uFrame.value=this.frame%64,this.U.uDepth.value=t.depthTexture;let c=null,l=null;if(this.cloudsOn){let e=R[this.frame&3];this.marchU.uJit.value.set(this.scale<.99?e[0]:0,this.scale<.99?e[1]:0),this._draw(this.mMarch,this.cur);let t=this.hist[this.hi],n=this.hist[1-this.hi],a=this.resolveU;a.uCurL.value=this.cur.textures[0],a.uCurD.value=this.cur.textures[1],a.uHistL.value=t.textures[0],a.uHistD.value=t.textures[1],a.uF.value=this.F.texture,a.uPrevVP.value.copy(this.prevVP),this.prevCam?a.uCamDelta.value.set(r.x-this.prevCam.x,r.y-this.prevCam.y,r.z-this.prevCam.z):a.uCamDelta.value.set(0,0,0),a.uHistValid.value=+(this.histCount>0),a.uBlend.value=i?Math.max(1/(this.histCount+1),.3):.16,this._draw(this.mResolve,n),this.hi=1-this.hi,this.histCount++,c=n.textures[0],l=n.textures[1]}else this.histCount=0,c=this.cur.textures[0],l=this.cur.textures[1];let u=this.compU;u.uL.value=c,u.uD.value=l,u.uF.value=this.F.texture,u.uCloudsOn.value=+!!this.cloudsOn,this._draw(this.mComp,t),this.prevVP.copy(this.curVP),this.prevCam=(this.prevCam||new e).set(r.x,r.y,r.z),a.setRenderTarget(o),a.autoClear=s}setCorners(t){let n=t.projectionMatrixInverse,r=t.matrixWorld,i=this._v||=new e,a=(e,t,a)=>{i.set(t,a,.5).applyMatrix4(n),i.multiplyScalar(-1/i.z);let o=i.length();e.copy(i).transformDirection(r).multiplyScalar(o)};a(this.U.uC00.value,-1,-1),a(this.U.uC10.value,1,-1),a(this.U.uC01.value,-1,1),a(this.U.uC11.value,1,1)}dispose(){for(let e of[this.mMarch,this.mResolve,this.mShadow,this.mMul,this.mComp])e.dispose();this.quad.dispose(),this.F.dispose(),this.cur.dispose();for(let e of this.hist)e.dispose()}},B=[{scale:.25,steps:48,light:3},{scale:.35,steps:80,light:4},{scale:.5,steps:120,light:5},{scale:.5,steps:160,light:6}],te={frozen:[1500,4800],toxic:[1800,5200],scorched:[2600,5600],default:[2100,5700]},V={name:`clouds`,order:22,async init(t){var n,r;let{renderer:i}=t,a=((n=t.shot)==null||(n=n.preset)==null?void 0:n.params)||{};this.P=a,this.tune={ambTop:.45,ambBottom:.24,sigma:.16,msA:.25,msB:.6,msC:.5,powder:1,detail:.6,sun:2.8};let o=()=>{var e;let n=(e=t.services.universe)==null?void 0:e.currentPlanet;return((n==null?void 0:n.seed)??t.seed.hash(`galaxy`,t.start.galaxy,`system`,t.start.systemIndex,`planet`,t.start.planetIndex))>>>0};this.seed=o();let s=performance.now(),c=E(i,t.seed.hash(`clouds`,`noise`));this.noise=c,this.weatherMap=D(i,this.seed^1540483477,256),await((r=t.bootProgress)==null?void 0:r.call(t,`nuvens`,.5));let l=t.services.sky,u=l&&!l.placeholder&&typeof l.glsl==`string`?l.glsl:null;this.passes=new z(t,{shape:c.shape.texture,detail:c.detail.texture,weather:this.weatherMap.texture,atmoGlsl:u,atmoUniforms:u?l.uniforms:null}),this.genMs=performance.now()-s,this.applyQuality(t),this.offs=[t.bus.on(`quality:change`,()=>this.applyQuality(t)),t.bus.on(`system:enter`,()=>this.regen(t)),t.bus.on(`planet:enter`,()=>this.regen(t))];let d=this.passes;this.removeShadow=t.pipeline.addPass(`afterWorld`,(e,t)=>d.renderShadow(t),{order:11,owner:`clouds`}),this.removeClouds=t.pipeline.addPass(`afterWorld`,(e,t)=>d.renderClouds(t,this._frameInfo),{order:12,owner:`clouds`}),this._frameInfo={camera:t.camera,camWorld:new e,static:!1},this.state={windOff:new e,detOff:new e,drift:0,lastT:null,coverage:.45},t.shot&&(this.shotFrames=Number(t.params.get(`cloudFrames`))||a.cloudFrames||8,this.readyDone=t.ready.busy(`nuvens: acumulação temporal`));let f=this;this.api=t.provide(`clouds`,{get layer(){var e,t;return{bottom:((e=f.layer)==null?void 0:e[0])??2100,top:((t=f.layer)==null?void 0:t[1])??5700}},get enabled(){return f.passes.cloudsOn},set enabled(e){f.passes.cloudsOn=!!e},get coverage(){return f.state.coverage},get _internal(){return f},shadowAt(n){let r=t.space.planetCenter;return new e(n.x-r.x,n.y-r.y,n.z-r.z).normalize(),1-.6*f.state.coverage}})},regen(e){var t;let n=(t=e.services.universe)==null?void 0:t.currentPlanet,r=((n==null?void 0:n.seed)??this.seed)>>>0;r!==this.seed&&(this.seed=r,this.weatherMap.dispose(),this.weatherMap=D(e.renderer,r^1540483477,256),this.passes.U.uWeather.value=this.weatherMap.texture,this.passes.histCount=0)},applyQuality(e){let t=e.quality,n=Math.max(0,Math.min(3,t.cloudQuality??2)),r=B[n],i=this.passes;i.scale=Number(e.params.get(`cloudScale`))||r.scale,i.marchU.uSteps.value=Number(e.params.get(`cloudSteps`))||r.steps,i.marchU.uLightSteps.value=r.light,i.marchU.uCirrus.value=n===0?0:.7,i.histCount=0},frame(t,n){var r,i,a,o;let s=this.passes,{space:l,camera:u,player:d}=n,f=this.P,p=this.state,m=n.services.planet,h=n.services.sky,g=n.services.weather,_=s.U,v=s.marchU,y=(m==null?void 0:m.radius)||12e4,b=Math.max(0,(m==null?void 0:m.seaLevel)??0),x=te[((r=n.services.universe)==null||(r=r.currentPlanet)==null?void 0:r.biome)||f.biome||f.atmoBiome||`default`]||te.default,S=f.cloudBase??(g==null||(i=g.cloud)==null?void 0:i.base)??x[0],C=f.cloudTop??(g==null||(a=g.cloud)==null?void 0:a.top)??x[1];this.layer=[S,C],_.uRin.value=y+b+S,_.uRout.value=y+b+C,v.uRground.value=y+Math.min(0,(m==null?void 0:m.seaLevel)??0)-400,v.uCirrusR.value=y+b+C+4200;let w=!(h!=null&&h.params)||h.params.has!==!1,T=(g==null?void 0:g.cloud)||{},ee=f.cloudCoverage??T.coverage??(g==null?void 0:g.cloudCoverage)??.45;p.coverage=w?ee:0,s.cloudsOn=f.clouds!==!1&&w&&p.coverage>.01&&n.params.get(`clouds`)!==`0`;let E=l.origin,D=l.planetCenter,O=E.x-D.x,k=E.y-D.y,A=E.z-D.z;_.uCamPos.value.set(O,k,A);let j=Math.hypot(O,k,A);j>y*6&&(s.cloudsOn=!1),this._frameInfo.camWorld.set(E.x,E.y,E.z),this._frameInfo.static=!!n.time.frozen;let M=(p._up||=new e).set(O,k,A).divideScalar(Math.max(1,j));_.uCoverage.value=p.coverage,_.uTypeBias.value=f.cloudType??T.typeBias??0,_.uStorm.value=T.storm??0;let N=g==null?void 0:g.levels;v.uRainShaft.value=N?Math.min(1,(N.rain||0)+(N.acid||0)+.6*(N.snow||0)):0,_.uDetailAmt.value=T.detail??this.tune.detail;let P=T.darkness??0;_.uSigma.value=this.tune.sigma*(1+P*.8)*(T.density??1),s._shadowStrength=Math.min(.97,(.82+.15*P)*(f.cloudShadow??1)),v.uCirrus.value=(n.quality.cloudQuality??2)>0?(T.cirrus??.7)*(f.cirrus??1):0;let F=n.time.world||0,I=p.lastT==null?0:Math.max(0,Math.min(1,F-p.lastT));p.lastT=F;let L=g==null?void 0:g.wind,R=p._fr||={e:new e,n:new e};R.e.set(0,1,0).cross(M),R.e.lengthSq()<1e-6&&R.e.set(1,0,0),R.e.normalize(),R.n.copy(M).cross(R.e).normalize();let z=L?L.x:8,B=L?L.z??0:3,V=(p._wv||=new e).copy(R.e).multiplyScalar(z).addScaledVector(R.n,B);p.windOff.addScaledVector(V,I*_.uShapeScale.value),p.detOff.addScaledVector(V,I*_.uDetailScale.value*1.6).addScaledVector(M,-I*.6*_.uDetailScale.value);for(let e of[`x`,`y`,`z`])p.windOff[e]-=Math.floor(p.windOff[e]),p.detOff[e]-=Math.floor(p.detOff[e]);_.uShapeOff.value.copy(p.windOff),_.uDetailOff.value.copy(p.detOff),_.uShear.value.copy(V).multiplyScalar(.012/Math.max(1,V.length())),p.drift=F*Math.hypot(z,B)*.15/y,_.uWeatherRot.value.setFromMatrix4((p._rm||=new c).makeRotationY(p.drift));let H=h==null?void 0:h.uniforms,U=(h==null?void 0:h.sunDirection)||M,W=null;if(s.hasAtmo&&H!=null&&H.uLightE){let e=H.uLightDir.value,t=H.uLightE.value;e[0].dot(M)<-.15&&t[2].x+t[2].y+t[2].z>0?(U=e[2],W=t[2]):(U=e[0],W=t[0]),v.uSunE.value.copy(W).multiplyScalar((f.cloudSun??1)*this.tune.sun)}else{let e=h==null?void 0:h.sunColor,t=(h==null?void 0:h.sunIntensity)??3;v.uSunE.value.set(((e==null?void 0:e.r)??1)*t,((e==null?void 0:e.g)??1)*t,((e==null?void 0:e.b)??1)*t)}_.uSunDir.value.copy(U).normalize();let G=h==null?void 0:h.ambient,ne=((G==null?void 0:G.intensity)??.5)/Math.PI,K=(G==null?void 0:G.color)||{r:.6,g:.75,b:1},re=(1-.55*P)*(f.cloudAmbient??1),q=this.tune.ambTop*ne*re,J=this.tune.ambBottom*ne*re;v.uAmbTop.value.set(K.r*q,K.g*q,K.b*q),v.uAmbBottom.value.set(K.r*J,K.g*J,K.b*J),v.uMsA.value=this.tune.msA,v.uMsB.value=this.tune.msB,v.uMsC.value=this.tune.msC,v.uPowder.value=this.tune.powder;let Y=(h==null||(o=h.params)==null?void 0:o.groundAlbedo)||[.15,.15,.13],ie=Math.max(0,_.uSunDir.value.dot(M)),ae=v.uSunE.value,oe=ie*.35/Math.PI;if(v.uGroundBounce.value.set(ae.x*Y[0]*oe,ae.y*Y[1]*oe,ae.z*Y[2]*oe).multiplyScalar(1-P*.7),!s.hasAtmo){var se;let e=h==null||(se=h.fogAt)==null?void 0:se.call(h,E),t=(e==null?void 0:e.color)||{r:.5,g:.6,b:.8};v.uHazeColor.value.set(t.r,t.g,t.b)}let X=g==null?void 0:g.lightning;if(X&&X.flash>0&&X.worldPos){v.uFlashPos.value.set(X.worldPos.x-D.x,X.worldPos.y-D.y,X.worldPos.z-D.z);let e=X.color||[.75,.82,1],t=X.flash*6;v.uFlashE.value.set(e[0]*t,e[1]*t,e[2]*t)}else v.uFlashE.value.set(0,0,0);let Z=g==null?void 0:g.fog,Q=s.compU;if(Q.uUp.value.copy(M),Z&&Z.density>0){let e=Math.max(0,d.altitude??0),t=Z.height||900;Q.uFogSigma.value=Z.density*Math.exp(-e/t),Q.uFogH.value=t;let n=Z.color||[.5,.5,.5];Q.uFogColor.value.set(n[0],n[1],n[2]),Q.uFogMax.value=Z.maxDist||6e4,s.fogOn=!0}else Q.uFogSigma.value=0,s.fogOn=!1;let $=this._dbg??=n.params.get(`cloudDebug`)||``;$&&(v.uDbg.value=$.includes(`T`)?1:$.includes(`noapL`)?3:$.includes(`noap`)?2:0,$.includes(`norain`)&&(v.uRainShaft.value=0),$.includes(`nofog`)&&(Q.uFogSigma.value=0,s.fogOn=!1)),u.updateMatrixWorld(),s.setCorners(u),s.curVP.multiplyMatrices(u.projectionMatrix,u.matrixWorldInverse),_.uNear.value=u.near,_.uFar.value=u.far,v.uMaxDist.value=j>_.uRout.value?22e5:18e4,this.readyDone&&(s.histCount>=this.shotFrames||!s.cloudsOn)&&(this.readyDone(),this.readyDone=null)},dispose(e){var t,n,r,i,a,o,s;for(let e of this.offs||[])e();(t=this.removeShadow)==null||t.call(this),(n=this.removeClouds)==null||n.call(this),(r=this.passes)==null||r.dispose(),(i=this.noise)==null||i.shape.dispose(),(a=this.noise)==null||a.detail.dispose(),(o=this.weatherMap)==null||o.dispose(),(s=this.readyDone)==null||s.call(this)}};export{V as default};
//# sourceMappingURL=clouds-mL_9NSLG.js.map