import{A as e,G as t,M as n,Q as r,St as i,U as a,W as o,X as s,Y as c,_t as l,bt as u,ct as d,gt as f,i as p,it as m,nt as h,rt as g,s as _,st as v,vt as y,z as b}from"./three-EnWzsccR.js";var x=`
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
}`,ee=`
precision highp float;
${S}
uniform float uZ;
in vec2 vUv;
out vec4 oC;
void main() {
  vec3 uvw = vec3(vUv, uZ);
  oC = vec4(worleyFbm(uvw, 2.0), worleyFbm(uvw, 4.0), worleyFbm(uvw, 8.0), 1.0);
}`,w=`
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
}`;function T(e){let n=new r(2,2),i=new t(n,e);i.frustumCulled=!1;let a=new v;return a.add(i),{scene:a,mesh:i,geo:n}}function E(t,n,{shapeRes:r=64,detailRes:i=32}={}){let a=new s(-1,1,1,-1,0,1),o=e=>{let t=new u(e,e,e,{type:f,format:h,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1,minFilter:b,magFilter:b}),n=t.texture;return n.wrapS=n.wrapT=n.wrapR=m,n.minFilter=n.magFilter=b,t},c=t.getRenderTarget(),l={};for(let[s,c,u]of[[`shape`,r,C],[`detail`,i,ee]]){let r=o(c),i=new g({glslVersion:e,vertexShader:`precision highp float;
in vec3 position;
in vec2 uv;
`+x,fragmentShader:u,uniforms:{uSeed:{value:n>>>0},uZ:{value:0}},depthTest:!1,depthWrite:!1}),d=T(i);for(let e=0;e<c;e++)i.uniforms.uZ.value=(e+.5)/c,t.setRenderTarget(r,e),t.render(d.scene,a);i.dispose(),d.geo.dispose(),l[s]=r}return t.setRenderTarget(c),l}function D(t,n,r=256){let i=new s(-1,1,1,-1,0,1),a=new _(r,{type:f,format:h,generateMipmaps:!1,minFilter:b,magFilter:b,depthBuffer:!1}),o=new y(n%1e3/1e3*37.1,(n>>>10)%1e3/1e3*41.7,(n>>>20)%1e3/1e3*29.3),c=new g({glslVersion:e,vertexShader:`precision highp float;
in vec3 position;
in vec2 uv;
`+x,fragmentShader:w,uniforms:{uSeed:{value:n>>>0},uFace:{value:0},uOff:{value:o}},depthTest:!1,depthWrite:!1}),l=T(c),u=t.getRenderTarget();for(let e=0;e<6;e++)c.uniforms.uFace.value=e,t.setRenderTarget(a,e),t.render(l.scene,i);return t.setRenderTarget(u),c.dispose(),l.geo.dispose(),a}var O=`
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
// densidade normalizada (0..1). lod: 0 completo, 1 sem detalhe
float cDensity(vec3 p, float r, float lod) {
  float h = (r - uRin) / (uRout - uRin);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 w = cWeatherAt(p / r);
  gW = w;
  if (w.x * cHeight(clamp(h + 0.12, 0.0, 1.0), w.y) < 0.02 && w.x * cHeight(h, w.y) < 0.02) return 0.0;
  vec4 s = texture(uShape, p * uShapeScale + uShapeOff + uShear * h);
  // base ondulada (mais nas tempestades): a camada não é uma tampa lisa
  float hb = h - (s.b - 0.5) * (0.1 + 0.18 * w.z) * (1.0 - h);
  float hg = cHeight(clamp(hb, 0.0, 1.0), w.y);
  float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float base = cRemap(s.r, fbm - 1.0, 1.0, 0.0, 1.0);
  base = clamp(base * hg, 0.0, 1.0);
  float c = clamp(cRemap(base, 1.0 - w.x, 1.0, 0.0, 1.0), 0.0, 1.0) * w.x;
  if (c <= 0.0 || lod > 0.5) return c;
  vec3 d = texture(uDetail, p * uDetailScale + uDetailOff + uShear * h * 3.0).rgb;
  float df = d.r * 0.625 + d.g * 0.25 + d.b * 0.125;
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
  vec2 uv = vUv;
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
      float dens = uRainShaft * (w.z * 1.6 + 0.08 * w.x) * smoothstep(0.45, 0.8, n.g) * smoothstep(0.0, 0.15, hcol);
      float sg = dens * 0.0006;
      if (sg > 0.0) {
        float st = exp(-sg * dtr);
        vec3 Sr = uAmbBottom * 1.3 + uFlashE * 0.05;
        Lr += Tr * Sr * (1.0 - st);
        Tr *= st;
      }
    }
  }

  if (t1 > t0) {
    float seg = t1 - t0;
    int N = uSteps;
    float fN = float(N);
    float tPrev = t0;
    for (int i = 0; i < 160; i++) {
      if (i >= N) break;
      // dentro da camada: passos quadráticos (finos perto da câmera)
      float a = (float(i) + jit) / fN;
      float an = (float(i) + 1.0 + jit) / fN;
      float ta = inside > 0.5 ? t0 + seg * a * a : t0 + seg * a;
      float tb = inside > 0.5 ? t0 + seg * an * an : t0 + seg * an;
      float dt = min(tb, t1) - ta;
      if (dt <= 0.0) break;
      vec3 p = ro + rd * ta;
      float r = length(p);
      float den = cDensity(p, r, ta > 45000.0 ? 1.0 : 0.0);
      if (den > 0.002) {
        vec3 up = p / r;
        float h = (r - uRin) / (uRout - uRin);
        if (first) {
          first = false;
#ifdef HAS_ATMO
          sunCol = uSunE * atmoSunTrans(r * 0.001, dot(up, uSunDir));
#endif
        }
        vec3 wHere = gW;
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
        amb += uGroundBounce * (1.0 - clamp(h * 3.0, 0.0, 1.0));
        // núcleos de tempestade: bases mais escuras e pesadas
        float sk = gW.z;
        amb *= 1.0 - 0.7 * sk;
        lum *= 1.0 - 0.5 * sk;
        vec3 S = sunCol * lum + amb;
        float fd = length(p - uFlashPos);
        S += uFlashE * (0.35 + 0.65 * exp(-od * 0.3)) / (1.0 + fd * fd * 4e-6);
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
      vec4 n1 = texture(uShape, vec3(q.x * 0.35, q.y * 0.08, q.z * 0.35) + uShapeOff * 0.3);
      vec4 n2 = texture(uDetail, q * 1.7 + uDetailOff * 0.2);
      float cd = clamp((n1.g * 0.7 + n2.r * 0.45) - 0.62, 0.0, 1.0) * 2.2 * cw.a * uCirrus;
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
  if (wS > 1e-4) {
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
      Lap *= 0.04 + 0.96 * exp(-ods * uSigma * 0.3);
    }
    L = L * Tap + Lap * (1.0 - T);
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
uniform mat4 uPrevVP;
uniform vec3 uCamDelta;
uniform float uBlend;
uniform float uHistValid;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec4 cL = texture2D(uCurL, vUv);
  vec4 cD = texture2D(uCurD, vUv);
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
    float rel = abs(hD.y - cD.y) / max(1e-3, min(hD.y, cD.y));
    if (rel > 0.12) ok = 0.0;
    // vizinhança: limita a história ao intervalo local (frouxo, para não perder a acumulação)
    vec4 mn = cL, mx = cL;
    for (int k = 0; k < 4; k++) {
      vec2 o = vec2(k == 0 ? 1.0 : (k == 1 ? -1.0 : 0.0), k == 2 ? 1.0 : (k == 3 ? -1.0 : 0.0)) * uTexel;
      vec4 s = texture2D(uCurL, vUv + o);
      mn = min(mn, s);
      mx = max(mx, s);
    }
    vec4 ext = (mx - mn) * 0.75 + vec4(0.02);
    hL = clamp(hL, mn - ext, mx + ext);
  }
  float b = ok > 0.5 ? uBlend : 1.0;
  oL = mix(hL, cL, b);
  oD = vec4(mix(hD.x, cD.x, b), cD.y, cD.z, 1.0);
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
varying vec2 vUv;
void main() {
  float dist = texture2D(uF, vUv).g;       // km
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  vec4 best = vec4(0.0, 0.0, 0.0, 1.0);
  float bestErr = 1e9;
  if (uCloudsOn > 0.5) {
    vec2 st = vUv * uLowSize - 0.5;
    vec2 i0 = floor(st);
    vec2 f = st - i0;
    for (int k = 0; k < 4; k++) {
      vec2 o = vec2(float(k & 1), float(k >> 1));
      vec2 uv = (i0 + o + 0.5) / uLowSize;
      vec4 l = texture2D(uL, uv);
      float e = texture2D(uD, uv).y;
      float bw = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
      float rel = abs(e - dist) / max(1e-3, min(e, dist));
      float w = bw / (0.02 + rel * rel * 40.0);
      acc += l * w;
      wsum += w;
      if (rel < bestErr) { bestErr = rel; best = l; }
    }
  }
  vec4 c = wsum > 1e-4 ? acc / wsum : best;
  if (uCloudsOn < 0.5) c = vec4(0.0, 0.0, 0.0, 1.0);
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
  gl_FragColor = o;
}`;function I(e,t,r=b){return new i(Math.max(1,e),Math.max(1,t),{count:2,type:n,format:h,depthBuffer:!1,stencilBuffer:!1,minFilter:r,magFilter:r,generateMipmaps:!1})}function L(e,t){return new i(Math.max(1,e),Math.max(1,t),{type:n,format:h,depthBuffer:!1,stencilBuffer:!1,minFilter:c,magFilter:c,generateMipmaps:!1})}var R=class{constructor(t,{shape:n,detail:r,weather:i,atmoGlsl:s,atmoUniforms:u}){this.ctx=t;let f=t.depthMode===`reversed`?0:t.depthMode===`log`?1:2,m=this.U={uC00:{value:new y},uC10:{value:new y},uC01:{value:new y},uC11:{value:new y},uDepthMode:{value:f},uNear:{value:t.camera.near},uFar:{value:t.camera.far},uShape:{value:n},uDetail:{value:r},uWeather:{value:i},uWeatherRot:{value:new a},uRin:{value:1},uRout:{value:2},uShapeScale:{value:1/12e3},uDetailScale:{value:1/800},uShapeOff:{value:new y},uDetailOff:{value:new y},uShear:{value:new y},uCoverage:{value:.45},uTypeBias:{value:0},uStorm:{value:0},uDetailAmt:{value:.38},uDepth:{value:null},uCamPos:{value:new y},uSunDir:{value:new y(0,1,0)},uSigma:{value:.04}};this.hasAtmo=!!s;let h=this.marchU={...u||{},...m,uRground:{value:1},uSunE:{value:new y(3,3,3)},uAmbTop:{value:new y(.3,.4,.6)},uAmbBottom:{value:new y(.15,.18,.25)},uGroundBounce:{value:new y},uMaxDist:{value:16e4},uSteps:{value:48},uLightSteps:{value:6},uLightStep:{value:45},uFrame:{value:0},uPowder:{value:.6},uMsA:{value:.3},uMsB:{value:.55},uMsC:{value:.5},uFlashPos:{value:new y(0,0,0)},uFlashE:{value:new y},uCirrusR:{value:3},uCirrus:{value:.6},uCirrusScale:{value:1/9e3},uHazeColor:{value:new y(.5,.6,.8)},uHazeDist:{value:6e4},uLowSize:{value:new l(1,1)},uRainShaft:{value:0}},g=j.replace(`ATMO_GLSL`,s||``).replace(`RAY_GLSL_HERE`,k).replace(`DENSITY_GLSL_HERE`,A),_=(e,t,n={})=>new d({uniforms:t,vertexShader:O,fragmentShader:e,depthTest:!1,depthWrite:!1,...n});this.mMarch=_(g,h,{glslVersion:e,defines:this.hasAtmo?{HAS_ATMO:1}:{}}),this.resolveU={uC00:m.uC00,uC10:m.uC10,uC01:m.uC01,uC11:m.uC11,uDepthMode:m.uDepthMode,uNear:m.uNear,uFar:m.uFar,uCurL:{value:null},uCurD:{value:null},uHistL:{value:null},uHistD:{value:null},uPrevVP:{value:new o},uCamDelta:{value:new y},uBlend:{value:.12},uHistValid:{value:0},uTexel:{value:new l}},this.mResolve=_(M.replace(`RAY_GLSL_HERE`,k),this.resolveU,{glslVersion:e}),this.shadowU={...m,uShadowK:{value:.35},uShadowStrength:{value:.8}},this.mShadow=_(N.replace(`RAY_GLSL_HERE`,k).replace(`DENSITY_GLSL_HERE`,A),this.shadowU,{glslVersion:e}),this.mMul=_(P,{uF:{value:null}},{blending:5,blendEquation:100,blendSrc:200,blendDst:202,blendEquationAlpha:100,blendSrcAlpha:200,blendDstAlpha:201}),this.compU={uL:{value:null},uD:{value:null},uF:{value:null},uLowSize:h.uLowSize,uC00:m.uC00,uC10:m.uC10,uC01:m.uC01,uC11:m.uC11,uUp:{value:new y(0,1,0)},uFogSigma:{value:0},uFogH:{value:900},uFogColor:{value:new y},uFogMax:{value:6e4},uCloudsOn:{value:1}},this.mComp=_(F,this.compU,{blending:5,blendEquation:100,blendSrc:201,blendDst:204,blendEquationAlpha:100,blendSrcAlpha:200,blendDstAlpha:201}),this.quad=new p(this.mMarch),this.F=L(1,1),this.cur=I(1,1,c),this.hist=[I(1,1),I(1,1)],this.hi=0,this.histCount=0,this.scale=.5,this.frame=0,this.prevVP=new o,this.prevCam=null,this.enabled=!0,this.cloudsOn=!0,this.shadowsOn=!0,this.fogOn=!1}_size(e,t){(this.F.width!==e||this.F.height!==t)&&this.F.setSize(e,t);let n=Math.max(1,Math.round(e*this.scale)),r=Math.max(1,Math.round(t*this.scale));if(this.cur.width!==n||this.cur.height!==r){this.cur.setSize(n,r);for(let e of this.hist)e.setSize(n,r);this.histCount=0}this.marchU.uLowSize.value.set(n,r),this.resolveU.uTexel.value.set(1/n,1/r)}_draw(e,t){let n=this.ctx.renderer;n.setRenderTarget(t),this.quad.material=e,this.quad.render(n)}renderShadow(e){if(!this.enabled||!(e!=null&&e.depthTexture))return;let t=this.ctx.renderer;this._size(e.width,e.height);let n=t.getRenderTarget(),r=t.autoClear;t.autoClear=!1,this.U.uDepth.value=e.depthTexture,this.shadowU.uShadowStrength.value=this.shadowsOn&&this.cloudsOn?this._shadowStrength??.8:0,this._draw(this.mShadow,this.F),this.shadowsOn&&this.cloudsOn&&(this.mMul.uniforms.uF.value=this.F.texture,this._draw(this.mMul,e)),t.setRenderTarget(n),t.autoClear=r}renderClouds(e,{camera:t,camWorld:n,static:r}){if(!this.enabled||!(e!=null&&e.depthTexture)||!this.cloudsOn&&!this.fogOn)return;let i=this.ctx.renderer,a=i.getRenderTarget(),o=i.autoClear;i.autoClear=!1,this.frame++,this.marchU.uFrame.value=this.frame%64,this.U.uDepth.value=e.depthTexture;let s=null,c=null;if(this.cloudsOn){this._draw(this.mMarch,this.cur);let e=this.hist[this.hi],t=this.hist[1-this.hi],i=this.resolveU;i.uCurL.value=this.cur.textures[0],i.uCurD.value=this.cur.textures[1],i.uHistL.value=e.textures[0],i.uHistD.value=e.textures[1],i.uPrevVP.value.copy(this.prevVP),this.prevCam?i.uCamDelta.value.set(n.x-this.prevCam.x,n.y-this.prevCam.y,n.z-this.prevCam.z):i.uCamDelta.value.set(0,0,0),i.uHistValid.value=+(this.histCount>0),i.uBlend.value=r?Math.max(1/(this.histCount+1),.04):.12,this._draw(this.mResolve,t),this.hi=1-this.hi,this.histCount++,s=t.textures[0],c=t.textures[1]}else this.histCount=0,s=this.cur.textures[0],c=this.cur.textures[1];let l=this.compU;l.uL.value=s,l.uD.value=c,l.uF.value=this.F.texture,l.uCloudsOn.value=+!!this.cloudsOn,this._draw(this.mComp,e),this.prevVP.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this.prevCam=(this.prevCam||new y).set(n.x,n.y,n.z),i.setRenderTarget(a),i.autoClear=o}setCorners(e){let t=e.projectionMatrixInverse,n=e.matrixWorld,r=this._v||=new y,i=(e,i,a)=>{r.set(i,a,.5).applyMatrix4(t),r.multiplyScalar(-1/r.z);let o=r.length();e.copy(r).transformDirection(n).multiplyScalar(o)};i(this.U.uC00.value,-1,-1),i(this.U.uC10.value,1,-1),i(this.U.uC01.value,-1,1),i(this.U.uC11.value,1,1)}dispose(){for(let e of[this.mMarch,this.mResolve,this.mShadow,this.mMul,this.mComp])e.dispose();this.quad.dispose(),this.F.dispose(),this.cur.dispose();for(let e of this.hist)e.dispose()}},z=[{scale:.25,steps:28,light:3},{scale:.35,steps:40,light:4},{scale:.5,steps:56,light:5},{scale:.5,steps:80,light:6}],te={frozen:[1500,4800],toxic:[1800,5200],scorched:[2600,5600],default:[2100,5700]},B={name:`clouds`,order:22,async init(e){var t,n;let{renderer:r}=e,i=((t=e.shot)==null||(t=t.preset)==null?void 0:t.params)||{};this.P=i,this.tune={ambTop:.6,ambBottom:.3,sigma:.16,msA:.25,msB:.6,msC:.5,powder:1,detail:.6,sun:2.5};let a=()=>{var t;let n=(t=e.services.universe)==null?void 0:t.currentPlanet;return((n==null?void 0:n.seed)??e.seed.hash(`galaxy`,e.start.galaxy,`system`,e.start.systemIndex,`planet`,e.start.planetIndex))>>>0};this.seed=a();let o=performance.now(),s=E(r,e.seed.hash(`clouds`,`noise`));this.noise=s,this.weatherMap=D(r,this.seed^1540483477,256),await((n=e.bootProgress)==null?void 0:n.call(e,`nuvens`,.5));let c=e.services.sky,l=c&&!c.placeholder&&typeof c.glsl==`string`?c.glsl:null;this.passes=new R(e,{shape:s.shape.texture,detail:s.detail.texture,weather:this.weatherMap.texture,atmoGlsl:l,atmoUniforms:l?c.uniforms:null}),this.genMs=performance.now()-o,this.applyQuality(e),this.offs=[e.bus.on(`quality:change`,()=>this.applyQuality(e)),e.bus.on(`system:enter`,()=>this.regen(e)),e.bus.on(`planet:enter`,()=>this.regen(e))];let u=this.passes;this.removeShadow=e.pipeline.addPass(`afterWorld`,(e,t)=>u.renderShadow(t),{order:11,owner:`clouds`}),this.removeClouds=e.pipeline.addPass(`afterWorld`,(e,t)=>u.renderClouds(t,this._frameInfo),{order:12,owner:`clouds`}),this._frameInfo={camera:e.camera,camWorld:new y,static:!1},this.state={windOff:new y,detOff:new y,drift:0,lastT:null,coverage:.45},e.shot&&(this.shotFrames=Number(e.params.get(`cloudFrames`))||i.cloudFrames||5,this.readyDone=e.ready.busy(`nuvens: acumulação temporal`));let d=this;this.api=e.provide(`clouds`,{get layer(){var e,t;return{bottom:((e=d.layer)==null?void 0:e[0])??2100,top:((t=d.layer)==null?void 0:t[1])??5700}},get enabled(){return d.passes.cloudsOn},set enabled(e){d.passes.cloudsOn=!!e},get coverage(){return d.state.coverage},get _internal(){return d},shadowAt(t){let n=e.space.planetCenter;return new y(t.x-n.x,t.y-n.y,t.z-n.z).normalize(),1-.6*d.state.coverage}})},regen(e){var t;let n=(t=e.services.universe)==null?void 0:t.currentPlanet,r=((n==null?void 0:n.seed)??this.seed)>>>0;r!==this.seed&&(this.seed=r,this.weatherMap.dispose(),this.weatherMap=D(e.renderer,r^1540483477,256),this.passes.U.uWeather.value=this.weatherMap.texture,this.passes.histCount=0)},applyQuality(e){let t=e.quality,n=Math.max(0,Math.min(3,t.cloudQuality??2)),r=z[n],i=this.passes;i.scale=Number(e.params.get(`cloudScale`))||r.scale,i.marchU.uSteps.value=Number(e.params.get(`cloudSteps`))||r.steps,i.marchU.uLightSteps.value=r.light,i.marchU.uCirrus.value=n===0?0:.7,i.histCount=0},frame(e,t){var n,r,i,a;let s=this.passes,{space:c,camera:l,player:u}=t,d=this.P,f=this.state,p=t.services.planet,m=t.services.sky,h=t.services.weather,g=s.U,_=s.marchU,v=(p==null?void 0:p.radius)||12e4,b=Math.max(0,(p==null?void 0:p.seaLevel)??0),x=te[((n=t.services.universe)==null||(n=n.currentPlanet)==null?void 0:n.biome)||d.biome||d.atmoBiome||`default`]||te.default,S=d.cloudBase??(h==null||(r=h.cloud)==null?void 0:r.base)??x[0],C=d.cloudTop??(h==null||(i=h.cloud)==null?void 0:i.top)??x[1];this.layer=[S,C],g.uRin.value=v+b+S,g.uRout.value=v+b+C,_.uRground.value=v+Math.min(0,(p==null?void 0:p.seaLevel)??0)-400,_.uCirrusR.value=v+b+C+4200;let ee=!(m!=null&&m.params)||m.params.has!==!1,w=(h==null?void 0:h.cloud)||{},T=d.cloudCoverage??w.coverage??(h==null?void 0:h.cloudCoverage)??.45;f.coverage=ee?T:0,s.cloudsOn=d.clouds!==!1&&ee&&f.coverage>.01&&t.params.get(`clouds`)!==`0`;let E=c.origin,D=c.planetCenter,O=E.x-D.x,k=E.y-D.y,A=E.z-D.z;g.uCamPos.value.set(O,k,A);let j=Math.hypot(O,k,A);j>v*6&&(s.cloudsOn=!1),this._frameInfo.camWorld.set(E.x,E.y,E.z),this._frameInfo.static=!!t.time.frozen;let M=(f._up||=new y).set(O,k,A).divideScalar(Math.max(1,j));g.uCoverage.value=f.coverage,g.uTypeBias.value=d.cloudType??w.typeBias??0,g.uStorm.value=w.storm??0;let N=h==null?void 0:h.levels;_.uRainShaft.value=N?Math.min(1,(N.rain||0)+(N.acid||0)+.6*(N.snow||0)):0,g.uDetailAmt.value=w.detail??this.tune.detail;let P=w.darkness??0;g.uSigma.value=this.tune.sigma*(1+P*.8)*(w.density??1),s._shadowStrength=.82*(d.cloudShadow??1),_.uCirrus.value=(t.quality.cloudQuality??2)>0?(w.cirrus??.7)*(d.cirrus??1):0;let F=t.time.world||0,I=f.lastT==null?0:Math.max(0,Math.min(1,F-f.lastT));f.lastT=F;let L=h==null?void 0:h.wind,R=f._fr||={e:new y,n:new y};R.e.set(0,1,0).cross(M),R.e.lengthSq()<1e-6&&R.e.set(1,0,0),R.e.normalize(),R.n.copy(M).cross(R.e).normalize();let z=L?L.x:8,B=L?L.z??0:3,V=(f._wv||=new y).copy(R.e).multiplyScalar(z).addScaledVector(R.n,B);f.windOff.addScaledVector(V,I*g.uShapeScale.value),f.detOff.addScaledVector(V,I*g.uDetailScale.value*1.6).addScaledVector(M,-I*.6*g.uDetailScale.value);for(let e of[`x`,`y`,`z`])f.windOff[e]-=Math.floor(f.windOff[e]),f.detOff[e]-=Math.floor(f.detOff[e]);g.uShapeOff.value.copy(f.windOff),g.uDetailOff.value.copy(f.detOff),g.uShear.value.copy(V).multiplyScalar(.012/Math.max(1,V.length())),f.drift=F*Math.hypot(z,B)*.15/v,g.uWeatherRot.value.setFromMatrix4((f._rm||=new o).makeRotationY(f.drift));let H=m==null?void 0:m.uniforms,ne=(m==null?void 0:m.sunDirection)||M,U=null;if(s.hasAtmo&&H!=null&&H.uLightE){let e=H.uLightDir.value,t=H.uLightE.value;e[0].dot(M)<-.15&&t[2].x+t[2].y+t[2].z>0?(ne=e[2],U=t[2]):(ne=e[0],U=t[0]),_.uSunE.value.copy(U).multiplyScalar((d.cloudSun??1)*this.tune.sun)}else{let e=m==null?void 0:m.sunColor,t=(m==null?void 0:m.sunIntensity)??3;_.uSunE.value.set(((e==null?void 0:e.r)??1)*t,((e==null?void 0:e.g)??1)*t,((e==null?void 0:e.b)??1)*t)}g.uSunDir.value.copy(ne).normalize();let W=m==null?void 0:m.ambient,re=((W==null?void 0:W.intensity)??.5)/Math.PI,G=(W==null?void 0:W.color)||{r:.6,g:.75,b:1},ie=(1-.55*P)*(d.cloudAmbient??1),K=this.tune.ambTop*re*ie,q=this.tune.ambBottom*re*ie;_.uAmbTop.value.set(G.r*K,G.g*K,G.b*K),_.uAmbBottom.value.set(G.r*q,G.g*q,G.b*q),_.uMsA.value=this.tune.msA,_.uMsB.value=this.tune.msB,_.uMsC.value=this.tune.msC,_.uPowder.value=this.tune.powder;let J=(m==null||(a=m.params)==null?void 0:a.groundAlbedo)||[.15,.15,.13],ae=Math.max(0,g.uSunDir.value.dot(M)),Y=_.uSunE.value,X=ae*.35/Math.PI;if(_.uGroundBounce.value.set(Y.x*J[0]*X,Y.y*J[1]*X,Y.z*J[2]*X).multiplyScalar(1-P*.7),!s.hasAtmo){var oe;let e=m==null||(oe=m.fogAt)==null?void 0:oe.call(m,E),t=(e==null?void 0:e.color)||{r:.5,g:.6,b:.8};_.uHazeColor.value.set(t.r,t.g,t.b)}let Z=h==null?void 0:h.lightning;if(Z&&Z.flash>0&&Z.worldPos){_.uFlashPos.value.set(Z.worldPos.x-D.x,Z.worldPos.y-D.y,Z.worldPos.z-D.z);let e=Z.color||[.75,.82,1],t=Z.flash*6;_.uFlashE.value.set(e[0]*t,e[1]*t,e[2]*t)}else _.uFlashE.value.set(0,0,0);let Q=h==null?void 0:h.fog,$=s.compU;if($.uUp.value.copy(M),Q&&Q.density>0){let e=Math.max(0,u.altitude??0),t=Q.height||900;$.uFogSigma.value=Q.density*Math.exp(-e/t),$.uFogH.value=t;let n=Q.color||[.5,.5,.5];$.uFogColor.value.set(n[0],n[1],n[2]),$.uFogMax.value=Q.maxDist||6e4,s.fogOn=!0}else $.uFogSigma.value=0,s.fogOn=!1;l.updateMatrixWorld(),s.setCorners(l),g.uNear.value=l.near,g.uFar.value=l.far,_.uMaxDist.value=j>g.uRout.value?22e5:18e4,this.readyDone&&(s.histCount>=this.shotFrames||!s.cloudsOn)&&(this.readyDone(),this.readyDone=null)},dispose(e){var t,n,r,i,a,o,s;for(let e of this.offs||[])e();(t=this.removeShadow)==null||t.call(this),(n=this.removeClouds)==null||n.call(this),(r=this.passes)==null||r.dispose(),(i=this.noise)==null||i.shape.dispose(),(a=this.noise)==null||a.detail.dispose(),(o=this.weatherMap)==null||o.dispose(),(s=this.readyDone)==null||s.call(this)}};export{B as default};
//# sourceMappingURL=clouds-H2Z-_UQA.js.map