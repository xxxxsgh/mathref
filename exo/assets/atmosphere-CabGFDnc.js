import{$ as e,A as t,B as n,D as r,E as i,G as a,L as o,M as s,N as c,O as l,P as u,V as d,W as f,X as p,Y as m,Z as h,a as g,b as _,f as v,m as y,n as b,p as x,q as S,r as C,w}from"./three-CjNQKr8_.js";import{n as T,r as E,t as D}from"./index-Cc7Hbzdu.js";var O=.22,k=.02,A={lush:{shapes:[[.175,.41,1],[.16,.5,1],[.3,.45,1],[.12,.62,1]],absorb:[[.35,1,.05],.6],mie:[1,[1,1,1]],density:[.9,1.25],g:[.76,.84]},ocean:{shapes:[[.12,.38,1],[.1,.55,1],[.2,.36,1]],absorb:[[.35,1,.05],.5],mie:[.8,[.95,.98,1]],density:[1,1.3],g:[.76,.82]},frozen:{shapes:[[.2,.55,1],[.28,.6,1],[.16,.7,1]],absorb:[[.6,1,.1],.35],mie:[.45,[.92,.97,1]],density:[.7,1],g:[.8,.88]},toxic:{shapes:[[.62,1,.22],[.75,1,.18],[.5,1,.3]],absorb:[[1,.05,.9],1],mie:[1.2,[.86,1,.55]],density:[1,1.4],g:[.72,.8]},exotic:{shapes:[[.95,.36,1],[1,.42,.85],[.85,.3,1]],absorb:[[0,1,.35],2.6],mie:[1.6,[1,.8,.86]],density:[.85,1.1],g:[.74,.82]},scorched:{shapes:[[1,.6,.3],[1,.5,.22],[1,.7,.42]],absorb:[[.05,.35,1],1.3],mie:[1.7,[1,.74,.48]],density:[.9,1.3],g:[.7,.78]},radioactive:{shapes:[[.8,1,.3],[1,.9,.25],[.6,1,.4]],absorb:[[.1,.3,1],1.2],mie:[1.1,[1,.95,.6]],density:[.9,1.3],g:[.72,.8]},barren:{shapes:[[.175,.41,1],[.4,.42,.6]],absorb:[[.35,1,.05],.3],mie:[.6,[1,.95,.9]],density:[.15,.3],g:[.76,.8]},gas:{shapes:[[.5,.6,1],[1,.8,.5],[.4,.8,1]],absorb:[[.2,.5,1],.5],mie:[2,[1,.95,.85]],density:[1.2,1.6],g:[.72,.8]}},j=[[[.12,1,.42],[.55,.12,.85]],[[.1,.9,.75],[.25,.3,1]],[[.45,1,.25],[1,.18,.45]],[[.95,.25,.8],[.3,.2,1]]],M=(e,t,n)=>e+(t-e)*n,N=(e,t,n)=>[M(e[0],t[0],n),M(e[1],t[1],n),M(e[2],t[2],n)],P=e=>Math.max(e[0],e[1],e[2]);function F(e){let t=e>>>0||1,n=()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296};return{next:n,range:(e,t)=>e+(t-e)*n(),pick:e=>e[Math.floor(n()*e.length)]}}function I({radius:e=12e4,atmosphere:t=null,biome:n=`lush`,seed:r=1,temperature:i=null,overrides:a={}}={}){let o=F(r^85636071),s=a.biome||n,c=A[s]||A.lush,l=e/1e3,u=!!t||!!a.biome||a.force===!0,d=t||{radius:e*1.1,rayleighHeight:e*.025,mieHeight:e*.005},f=Math.max(l*1.02,d.radius/1e3),p=f-l,m=Math.max(.2,(d.rayleighHeight||e*.025)/1e3,p*.22),h=Math.max(.05,(d.mieHeight||e*.005)/1e3,p*.08),g=o.pick(c.shapes),_=o.pick(c.shapes),v=a.shape||N(g,_,o.next()),y=P(v);v=v.map(e=>e/y);let b=a.density??o.range(c.density[0],c.density[1]),x=O*b/m,S=v.map(e=>e*x),C=k*((a.mie??c.mie[0]*o.range(.6,1.6))*b)/h,w=c.mie[1].map(e=>C*e*.92),T=[C,C,C],E=o.range(c.g[0],c.g[1]),D=f-l,M=D*.45,I=D*.22,L=.06*c.absorb[1]*o.range(.6,1.4)*b,R=c.absorb[0].map(e=>e*L/I),z=0;s===`frozen`?z=o.range(.8,1.2):i!=null&&i<-10?z=o.range(.5,1):o.next()<.12&&(z=o.range(.25,.6)),a.aurora!=null&&(z=a.aurora);let B=o.pick(j),V=N(v,[.35,.45,1],.5).map(e=>e*.012),H=!u,U=[0,0,0],W={has:!H,biome:s,Rb:l,Rt:H?l*1.02:f,Hr:m,Hm:h,rayleigh:H?U:S,mieScat:H?U:w,mieExt:H?U:T,mieG:E,absorb:H?U:R,absC:M,absW:I,groundAlbedo:[.12,.13,.1],aurora:H?0:z,auroraLow:B[0],auroraHigh:B[1],airglow:H?U:V,skyGain:1.4,shape:v,density:b};return W.contract=H?null:{radius:W.Rt*1e3,rayleigh:S.map(e=>e/1e3),rayleighHeight:m*1e3,mie:C/1e3,mieHeight:h*1e3,mieG:E,sunIntensity:1,absorption:R.map(e=>e/1e3),absorptionCenter:M*1e3,absorptionWidth:I*1e3,biome:s},W}function L(e){if(!e.has)return[0,0,0];let t=e.rayleigh.map((t,n)=>t*e.Hr+e.mieScat[n]*e.Hm*.5),n=P(t)||1;return t.map(e=>e/n)}function R(e,t,n,r,i,a,o){let s=e*r+t*i+n*a,c=e*e+t*t+n*n-o*o,l=s*s-c;if(l<0)return null;let u=Math.sqrt(l);return[-s-u,-s+u]}function z(e,t,n){let r=Math.exp(-t/e.Hr),i=Math.exp(-t/e.Hm),a=Math.max(0,1-Math.abs(t-e.absC)/e.absW);for(let t=0;t<3;t++)n.rs[t]=e.rayleigh[t]*r,n.ms[t]=e.mieScat[t]*i,n.ext[t]=e.rayleigh[t]*r+e.mieExt[t]*i+e.absorb[t]*a;return n}function B(e,t,n){let r=Math.min(1,e.Rb/t),i=-Math.sqrt(Math.max(0,1-r*r)),a=.006,o=Math.max(0,Math.min(1,(n-(i-a))/(2*a)));return o*o*(3-2*o)}function V(e,t,n,r=32){let i=Math.hypot(t[0],t[1],t[2]),a=(t[0]*n[0]+t[1]*n[1]+t[2]*n[2])/i,o=B(e,i,a);if(o<=0)return[0,0,0];let s=R(t[0],t[1],t[2],n[0],n[1],n[2],e.Rt);if(!s||s[1]<=0)return[o,o,o];let c=s[1],l=Math.max(0,s[0]),u=(c-l)/r,d=[0,0,0],f=[0,0,0],p={rs:[0,0,0],ms:[0,0,0],ext:[0,0,0]};for(let i=0;i<r;i++){let r=l+(i+.5)*u,a=Math.max(0,Math.hypot(t[0]+n[0]*r,t[1]+n[1]*r,t[2]+n[2]*r)-e.Rb);z(e,a,p);let o=Math.exp(-a/e.Hm);for(let t=0;t<3;t++)d[t]+=(p.ext[t]-e.mieExt[t]*o)*u,f[t]+=e.mieExt[t]*o*u}let m=1+2*(1-Math.abs(a))**4;return d.map((e,t)=>o*Math.exp(-e*m-f[t]))}function H(e,t,n,r,{steps:i=12,lightSteps:a=6,tMax:o=1/0}={}){let s=[0,0,0],c=[1,1,1],l=R(t[0],t[1],t[2],n[0],n[1],n[2],e.Rt);if(!l||l[1]<=0)return{L:s,T:c};let u=Math.max(0,l[0]),d=Math.min(l[1],o),f=R(t[0],t[1],t[2],n[0],n[1],n[2],e.Rb);if(f&&f[0]>0&&(d=Math.min(d,f[0])),d<=u)return{L:s,T:c};let p=(d-u)/i,m={rs:[0,0,0],ms:[0,0,0],ext:[0,0,0]},h=e.mieG*e.mieG;for(let o=0;o<i;o++){let i=u+(o+.5)*p,l=[t[0]+n[0]*i,t[1]+n[1]*i,t[2]+n[2]*i];z(e,Math.max(0,Math.hypot(l[0],l[1],l[2])-e.Rb),m);let d=[0,0,0];for(let t of r){let r=n[0]*t.dir[0]+n[1]*t.dir[1]+n[2]*t.dir[2],i=3/(16*Math.PI)*(1+r*r),o=3/(8*Math.PI)*((1-h)*(1+r*r))/((2+h)*(1+h-2*e.mieG*r)**1.5),s=V(e,l,t.dir,a);for(let e=0;e<3;e++)d[e]+=t.E[e]*s[e]*(m.rs[e]*(i+.03)+m.ms[e]*(o+.03))}for(let e=0;e<3;e++){let t=Math.exp(-m.ext[e]*p),n=Math.max(m.ext[e],1e-9);s[e]+=c[e]*((d[e]-d[e]*t)/n),c[e]*=t}}return{L:s,T:c}}var U=`
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
`,W=`
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
`,G=`
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
`,K=`
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
`,q=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,ee=`
${U}
${W}
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(256.0, 64.0);
  float xMu = clamp((uv.x - 0.5 / 256.0) / (1.0 - 1.0 / 256.0), 0.0, 1.0);
  float xR = clamp((uv.y - 0.5 / 64.0) / (1.0 - 1.0 / 64.0), 0.0, 1.0);
  float H = sqrt(max(0.0, uRt * uRt - uRb * uRb));
  float rho = H * xR;
  float r = sqrt(rho * rho + uRb * uRb);
  float dMin = uRt - r;
  float dMax = rho + H;
  float d = dMin + xMu * (dMax - dMin);
  float mu = d <= 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float t1 = atmoSphere(ro, rd, uRt).y;
  const int N = 48;
  float dt = max(0.0, t1) / float(N);
  vec3 tau = vec3(0.0);
  vec3 tauM = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 P = ro + rd * ((float(i) + 0.5) * dt);
    float h = length(P) - uRb;
    AtmoMedium m = atmoMedium(h);
    vec3 em = uMieExt * exp(-max(h, 0.0) / uMieH);
    tau += (m.ext - em) * dt;
    tauM += em * dt;
  }
  // compensação de massa de ar: planetas de 60–200 km têm caminhos rasantes
  // ~5× mais curtos que a Terra (√(2RH)), e o pôr do sol quase não avermelha.
  // Engrossa só os caminhos rasantes (luz do sol baixo); a vista não muda.
  // (só gás: Rayleigh + absorção; a névoa Mie fica física)
  tau = tau * (1.0 + 2.0 * pow(1.0 - abs(mu), 4.0)) + tauM;
  gl_FragColor = vec4(exp(-tau), 1.0);
}`,te=`
${U}
${W}
uniform sampler2D uTransLUT;
vec3 atmoTransmittance(float r, float mu) {
  r = clamp(r, uRb, uRt);
  return texture2D(uTransLUT, atmoTransUV(r, mu)).rgb;
}
void main() {
  vec2 uv = (gl_FragCoord.xy / 32.0 - 0.5 / 32.0) / (31.0 / 32.0);
  uv = clamp(uv, 0.0, 1.0);
  float muS = uv.x * 2.0 - 1.0;
  float r = uRb + 0.002 + uv.y * (uRt - uRb - 0.004);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 sunDir = normalize(vec3(0.0, muS, sqrt(max(0.0, 1.0 - muS * muS))));
  const float ISO = 1.0 / (4.0 * PI);
  vec3 Lsum = vec3(0.0);
  vec3 Fsum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    for (int j = 0; j < 8; j++) {
      float th = 2.0 * PI * (float(i) + 0.5) / 8.0;
      float cp = 1.0 - 2.0 * (float(j) + 0.5) / 8.0;
      float sp = sqrt(max(0.0, 1.0 - cp * cp));
      vec3 rd = vec3(cos(th) * sp, cp, sin(th) * sp);
      vec2 ta = atmoSphere(ro, rd, uRt);
      float tg = atmoGround(ro, rd);
      float t1 = tg > 0.0 ? tg : max(0.0, ta.y);
      const int N = 20;
      float dt = t1 / float(N);
      vec3 T = vec3(1.0);
      vec3 L = vec3(0.0);
      vec3 F = vec3(0.0);
      for (int k = 0; k < N; k++) {
        vec3 P = ro + rd * ((float(k) + 0.5) * dt);
        float rr = length(P);
        AtmoMedium m = atmoMedium(rr - uRb);
        float mu = dot(P / rr, sunDir);
        vec3 Ts = atmoTransmittance(rr, mu) * atmoPlanetShadow(rr, mu);
        vec3 S = Ts * m.scat * ISO;
        vec3 st = exp(-m.ext * dt);
        vec3 ext = max(m.ext, vec3(1e-7));
        L += T * (S - S * st) / ext;
        F += T * (m.scat - m.scat * st) / ext;
        T *= st;
      }
      if (tg > 0.0) {
        vec3 Pg = ro + rd * tg;
        vec3 n = normalize(Pg);
        float mu = dot(n, sunDir);
        vec3 Ts = atmoTransmittance(uRb, mu) * atmoPlanetShadow(uRb + 0.001, mu);
        L += T * Ts * max(0.0, mu) * uGroundAlbedo / PI;
      }
      Lsum += L;
      Fsum += F;
    }
  }
  // integral sobre a esfera com fase isotrópica = média das 64 direções
  vec3 L2 = Lsum / 64.0;
  vec3 fms = Fsum / 64.0 * (4.0 * PI) * ISO;
  gl_FragColor = vec4(L2 / max(vec3(1e-4), 1.0 - fms), 1.0);
}`,ne=`
${U}
${W}
${G}
${K}
uniform vec3 uCamPos;
uniform vec3 uUp;
uniform vec3 uEast;
uniform vec3 uNorth;
uniform int uSteps;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(256.0, 128.0);
  float r = clamp(length(uCamPos), uRb + 0.001, uRt - 0.001);
  float v = clamp((uv.y - 0.5 / 128.0) / (127.0 / 128.0), 0.0, 1.0);
  float vH = sqrt(max(0.0, r * r - uRb * uRb));
  float beta = acos(clamp(vH / r, -1.0, 1.0));
  float ZH = PI - beta;
  float zen;
  if (v < 0.5) {
    float c = 1.0 - 2.0 * v;
    zen = ZH * (1.0 - c * c);
  } else {
    float c = 2.0 * v - 1.0;
    zen = ZH + beta * c * c;
  }
  float az = uv.x * 2.0 * PI;
  vec3 rd = uUp * cos(zen) + (uNorth * cos(az) + uEast * sin(az)) * sin(zen);
  vec3 L, T;
  atmoIntegrate(uUp * r, normalize(rd), 1e9, uSteps, L, T);
  gl_FragColor = vec4(L, 1.0);
}`,re=`
layout(location = 0) out highp vec4 oL;
layout(location = 1) out highp vec4 oT;
${U}
${W}
${G}
uniform vec3 uCamPos;
uniform vec3 uC00;
uniform vec3 uC10;
uniform vec3 uC01;
uniform vec3 uC11;
uniform float uAPMax;
void main() {
  float x = gl_FragCoord.x;
  float slice = floor(x / 32.0);
  vec2 uv = vec2(mod(x, 32.0), gl_FragCoord.y) / 32.0;
  vec3 ray = mix(mix(uC00, uC10, uv.x), mix(uC01, uC11, uv.x), uv.y);
  vec3 rd = normalize(ray);
  float s = (slice + 1.0) / 32.0;
  float dist = uAPMax * s * s;
  int N = 4 + int(slice);
  vec3 L, T;
  atmoIntegrate(uCamPos, rd, dist, N, L, T);
  oL = vec4(L, 1.0);
  oT = vec4(T, 1.0);
}`;function J(r,a,o={}){return new e(r,a,{type:i,format:n,colorSpace:t,depthBuffer:!1,stencilBuffer:!1,minFilter:l,magFilter:l,generateMipmaps:!1,wrapS:v,wrapT:v,...o})}function ie(){return{uRb:{value:120},uRt:{value:132},uRayScat:{value:new p},uRayH:{value:3},uMieScat:{value:new p},uMieExt:{value:new p},uMieH:{value:.6},uMieG:{value:.8},uAbs:{value:new p},uAbsC:{value:3},uAbsW:{value:2},uGroundAlbedo:{value:new p(.12,.13,.1)},uLightDir:{value:[new p(0,1,0),new p(0,1,0),new p(0,1,0)]},uLightE:{value:[new p,new p,new p]},uSkyGain:{value:1},uAirglow:{value:new p},uTransLUT:{value:null},uMSLUT:{value:null}}}function ae(e,t){e.uRb.value=t.Rb,e.uRt.value=t.Rt,e.uRayScat.value.fromArray(t.rayleigh),e.uRayH.value=t.Hr,e.uMieScat.value.fromArray(t.mieScat),e.uMieExt.value.fromArray(t.mieExt),e.uMieH.value=t.Hm,e.uMieG.value=t.mieG,e.uAbs.value.fromArray(t.absorb),e.uAbsC.value=t.absC,e.uAbsW.value=Math.max(.001,t.absW),e.uGroundAlbedo.value.fromArray(t.groundAlbedo),e.uSkyGain.value=t.skyGain,e.uAirglow.value.fromArray(t.airglow)}var oe=class{constructor(r,o){this.renderer=r,this.u=o,this.trans=J(256,64),this.ms=J(32,32),this.sky=J(256,128,{wrapS:d}),this.ap=new e(1024,32,{count:2,type:i,format:n,depthBuffer:!1,stencilBuffer:!1,minFilter:l,magFilter:l,generateMipmaps:!1});for(let e of this.ap.textures)e.colorSpace=t,e.wrapS=e.wrapT=v;o.uTransLUT.value=this.trans.texture,o.uMSLUT.value=this.ms.texture;let s=(e,t={},n=!1)=>new a({uniforms:{...o,...t},vertexShader:q,fragmentShader:e,depthTest:!1,depthWrite:!1,...n?{glslVersion:w}:{}});this.skyU={uCamPos:{value:new p(0,121,0)},uUp:{value:new p(0,1,0)},uEast:{value:new p(1,0,0)},uNorth:{value:new p(0,0,-1)},uSteps:{value:30}},this.apU={uCamPos:this.skyU.uCamPos,uC00:{value:new p},uC10:{value:new p},uC01:{value:new p},uC11:{value:new p},uAPMax:{value:100}},this.mTrans=s(ee),this.mMS=s(te),this.mSky=s(ne,this.skyU),this.mAP=s(re,this.apU,!0),this.quad=new b(this.mTrans)}_draw(e,t){let n=this.renderer,r=n.getRenderTarget(),i=n.autoClear;n.autoClear=!1,this.quad.material=e,n.setRenderTarget(t),this.quad.render(n),n.setRenderTarget(r),n.autoClear=i}renderStatic(){this._draw(this.mTrans,this.trans),this._draw(this.mMS,this.ms)}renderSkyView(){this._draw(this.mSky,this.sky)}renderAerial(){this._draw(this.mAP,this.ap)}dispose(){for(let e of[this.trans,this.ms,this.sky,this.ap])e.dispose();for(let e of[this.mTrans,this.mMS,this.mSky,this.mAP])e.dispose();this.quad.dispose()}},se=`
varying vec3 vDir;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`,ce=`
${U}
${W}
${G}
${K}

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
uniform float uNebGain;   // ganho da nebulosa (maior no espaço)
// aurora
uniform float uAurora;
uniform vec3 uAurLow;
uniform vec3 uAurHigh;
// corpos celestes (km, relativos à CÂMERA)
uniform int uBodyCount;
uniform vec4 uBodyPos[8];   // xyz centro, w raio
uniform vec4 uBodyCol[8];   // rgb albedo base, w tipo (0 rochoso, 1 com oceano, 2 gasoso, 3 gelo)
uniform vec4 uBodyCol2[8];  // rgb cor secundária, w seed
uniform vec4 uBodyAtm[8];   // rgb cor do limbo, w espessura relativa (0 = sem atmosfera)
uniform vec4 uBodyRing[8];  // x interno/R, y externo/R, z opacidade, w (0 = sem anel)
uniform vec4 uBodyRingN[8]; // xyz normal do anel
uniform vec4 uBodyRingC[8]; // rgb cor do anel
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
      // distribuição de magnitudes íngreme: a maioria quase no limite da
      // visão, poucas brilhantes (não viram "flocos" no bloom)
      float b = 0.004 + 0.04 * pow(m, 6.0) + 0.3 * pow(m, 40.0) + 3.0 * pow(m, 160.0);
      float rad = uPixelAngle * (0.32 + 0.45 * pow(m, 40.0));
      float tw = 1.0 + 0.45 * sin(uTime * (2.0 + 5.0 * m) + h * 61.0) * uStarGain;
      acc += starColor(hash13(key + 41.9)) * b * tw * exp(-0.5 * d * d / (rad * rad));
    }
  }
  return acc * gain;
}

vec3 nebula(vec3 p, float band) {
  vec3 q = p * 1.3 + uNebSeed;
  // domínio deformado: nuvens grandes com filamentos e bordas irregulares
  vec3 w = vec3(fbm3(q * 0.9, 3), fbm3(q * 0.9 + 5.2, 3), fbm3(q * 0.9 + 9.7, 3)) - 0.5;
  float n = fbm3(q * 1.5 + w * 2.6, 6);
  float big = smoothstep(0.36, 0.74, n);
  float fil = 1.0 - abs(2.0 * fbm3(q * 3.1 + w * 2.0, 4) - 1.0);
  fil = fil * fil * fil;
  float region = smoothstep(0.32, 0.72, fbm3(q * 0.45 + 3.3, 3));
  float hue = fbm3(q * 0.7 + 11.0, 3);
  vec3 c = mix(uNebA, uNebB, smoothstep(0.35, 0.65, hue));
  c = mix(c, uNebC, smoothstep(0.5, 0.8, w.x + 0.5) * 0.75);
  float dens = big * (0.3 + 0.7 * fil) * mix(0.18, 1.0, region) * (0.45 + 0.55 * band);
  // poeira escura recortando as nuvens e a faixa
  float dust = smoothstep(0.48, 0.74, fbm3(q * 2.3 + w * 1.5 + 3.0, 5));
  vec3 neb = c * dens * (1.0 - 0.85 * dust * (0.4 + 0.6 * big));
  // núcleos brilhantes (gás ionizado mais quente, puxado para o branco)
  float core = pow(big * fil, 3.0);
  neb += mix(c, vec3(1.0), 0.35) * core * 1.4;
  // faixa galáctica: brilho difuso de estrelas não resolvidas
  vec3 milky = mix(vec3(0.85, 0.82, 1.0), c, 0.35) * band * (0.25 + 0.75 * fbm3(q * 4.0, 4)) * (1.0 - 0.75 * dust);
  return (neb * 0.16 + milky * 0.035) * uNebGain;
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
  for (int i = 0; i < 8; i++) {
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
      float wide = mix(0.3, 1.0, uInside);
      add += uStarTint[l] * e * T * (1.2 * exp(-th / (ang * 2.5)) + 0.22 * mix(0.45, 1.0, uInside) * exp(-th / (ang * 9.0)) + wide * (0.045 * exp(-th / 0.09) + 0.01 * exp(-th / 0.4)));
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
}`;function le(e){let t={...e,uSkyView:{value:null},uCamPos:{value:new p(0,121,0)},uUp:{value:new p(0,1,0)},uEast:{value:new p(1,0,0)},uNorth:{value:new p(0,0,-1)},uInside:{value:1},uSteps:{value:16},uPixelAngle:{value:.001},uTime:{value:0},uToInertial:{value:new s},uStarE:{value:[new p,new p]},uStarAng:{value:[0,0]},uStarTint:{value:[new p(1,1,1),new p(1,1,1)]},uGalN:{value:new p(.3,.9,.2).normalize()},uNebA:{value:new p(.25,.35,1)},uNebB:{value:new p(.9,.3,.6)},uNebC:{value:new p(.2,.9,.8)},uNebSeed:{value:0},uStarGain:{value:1},uNebGain:{value:1},uAurora:{value:0},uAurLow:{value:new p(.1,1,.4)},uAurHigh:{value:new p(.6,.1,.9)},uBodyCount:{value:0},uBodyPos:{value:Array.from({length:8},()=>new h)},uBodyCol:{value:Array.from({length:8},()=>new h)},uBodyCol2:{value:Array.from({length:8},()=>new h)},uBodyAtm:{value:Array.from({length:8},()=>new h)},uBodyRing:{value:Array.from({length:8},()=>new h)},uBodyRingN:{value:Array.from({length:8},()=>new h)},uBodyRingC:{value:Array.from({length:8},()=>new h)}},n=new a({uniforms:t,vertexShader:se,fragmentShader:ce,side:1,depthWrite:!1,fog:!1}),r=new u(new S(1,64,32),n);return r.name=`atmosphere:sky`,r.scale.setScalar(1e9),r.renderOrder=-1e3,r.frustumCulled=!1,{mesh:r,uniforms:t}}var Y=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,ue=`
layout(location = 0) out highp vec4 oL;
layout(location = 1) out highp vec4 oT;
${U}
${W}
${G}
uniform sampler2D uDepth;
uniform sampler2D uAPL;
uniform sampler2D uAPT;
uniform float uDepthMode;   // 0 reversed, 1 log, 2 padrão
uniform float uNear;
uniform float uFar;
uniform vec3 uC00;
uniform vec3 uC10;
uniform vec3 uC01;
uniform vec3 uC11;
uniform vec3 uCamPos;
uniform float uAPMax;
uniform float uInside;
uniform int uSteps;
varying vec2 vUv;

vec2 apUV(vec2 uv, float slice) {
  uv = clamp(uv, 0.5 / 32.0, 1.0 - 0.5 / 32.0);
  return vec2((slice + uv.x) / 32.0, uv.y);
}

void main() {
  float d = texture2D(uDepth, vUv).r;
  float viewZ;
  if (uDepthMode < 0.5) {
    if (d <= 0.0) { oL = vec4(0.0); oT = vec4(1.0); return; }
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    viewZ = dd / (d + c);
  } else if (uDepthMode < 1.5) {
    if (d >= 1.0) { oL = vec4(0.0); oT = vec4(1.0); return; }
    viewZ = exp2(d * log2(uFar + 1.0)) - 1.0;
  } else {
    if (d >= 1.0) { oL = vec4(0.0); oT = vec4(1.0); return; }
    float ndc = d * 2.0 - 1.0;
    viewZ = 2.0 * uNear * uFar / ((uFar + uNear) - ndc * (uFar - uNear));
  }
  vec3 ray = mix(mix(uC00, uC10, vUv.x), mix(uC01, uC11, vUv.x), vUv.y);
  vec3 P = ray * (viewZ * 0.001);
  float dist = length(P);
  vec3 rd = P / max(dist, 1e-9);
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  float wF = 0.0;
  if (uInside > 0.5) {
    wF = 1.0 - smoothstep(0.82, 0.97, dist / uAPMax);
  }
  if (wF > 0.0) {
    float sF = sqrt(dist / uAPMax) * 32.0 - 1.0;
    vec3 L0 = vec3(0.0), T0 = vec3(1.0), L1, T1;
    float s0 = floor(sF);
    float f = sF - s0;
    if (s0 >= 0.0) {
      vec2 a = apUV(vUv, min(s0, 31.0));
      L0 = texture2D(uAPL, a).rgb;
      T0 = texture2D(uAPT, a).rgb;
    }
    vec2 b = apUV(vUv, clamp(s0 + 1.0, 0.0, 31.0));
    L1 = texture2D(uAPL, b).rgb;
    T1 = texture2D(uAPT, b).rgb;
    if (s0 < 0.0) f = clamp(sF + 1.0, 0.0, 1.0);
    L = mix(L0, L1, f);
    T = mix(T0, T1, f);
  }
  if (wF < 1.0) {
    vec3 Lr, Tr;
    atmoIntegrate(uCamPos, rd, dist, uSteps, Lr, Tr);
    L = mix(Lr, L, wF);
    T = mix(Tr, T, wF);
  }
  oL = vec4(L, 1.0);
  oT = vec4(T, 1.0);
}`,de=`
uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }`,fe=class{constructor(t,r,s){this.ctx=t,this.luts=s,this.target=new e(1,1,{count:2,type:i,format:n,depthBuffer:!1,stencilBuffer:!1,minFilter:o,magFilter:o,generateMipmaps:!1}),this.u={...r,uDepth:{value:null},uAPL:{value:s.ap.textures[0]},uAPT:{value:s.ap.textures[1]},uDepthMode:{value:t.depthMode===`reversed`?0:t.depthMode===`log`?1:2},uNear:{value:t.camera.near},uFar:{value:t.camera.far},uC00:s.apU.uC00,uC10:s.apU.uC10,uC01:s.apU.uC01,uC11:s.apU.uC11,uCamPos:s.apU.uCamPos,uAPMax:s.apU.uAPMax,uInside:{value:1},uSteps:{value:12}},this.mat=new a({uniforms:this.u,vertexShader:Y,fragmentShader:ue,glslVersion:w,depthTest:!1,depthWrite:!1});let c=(e,t)=>new a({uniforms:{uTex:{value:e}},vertexShader:Y,fragmentShader:de,depthTest:!1,depthWrite:!1,blending:5,blendEquation:100,blendSrc:t?200:201,blendDst:t?202:201,blendEquationAlpha:100,blendSrcAlpha:200,blendDstAlpha:201});this.mMul=c(this.target.textures[1],!0),this.mAdd=c(this.target.textures[0],!1),this.quad=new b(this.mat),this.enabled=!0}render(e){if(!this.enabled||!(e!=null&&e.depthTexture))return;let t=this.ctx.renderer,n=e.width,r=e.height;(this.target.width!==n||this.target.height!==r)&&this.target.setSize(n,r),this.u.uDepth.value=e.depthTexture;let i=t.getRenderTarget(),a=t.autoClear;t.autoClear=!1,this.u.uInside.value>.5&&this.luts.renderAerial(),this.quad.material=this.mat,t.setRenderTarget(this.target),this.quad.render(t),t.setRenderTarget(e),this.quad.material=this.mMul,this.quad.render(t),this.quad.material=this.mAdd,this.quad.render(t),t.setRenderTarget(i),t.autoClear=a}dispose(){this.target.dispose(),this.mat.dispose(),this.mMul.dispose(),this.mAdd.dispose(),this.quad.dispose()}},pe=`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,me=`
${U}
${W}
${G}
uniform vec3 uCamPos;
varying vec3 vDir;
void main() {
  vec3 rd = normalize(vDir);
  vec3 ro = uCamPos;
  vec3 L, T;
  atmoIntegrate(ro, rd, 1e9, 10, L, T);
  float tg = atmoGround(ro, rd);
  vec3 bg = vec3(0.0);
  if (tg > 0.0) {
    vec3 n = normalize(ro + rd * tg);
    vec3 E = vec3(0.0);
    for (int l = 0; l < 3; l++) {
      float mu = dot(n, uLightDir[l]);
      E += uLightE[l] * atmoSunTrans(uRb + 0.001, mu) * max(0.0, mu);
    }
    // luz do céu refletida pelo chão (aproximação: 25% da direta + piso)
    bg = uGroundAlbedo / PI * E * 1.25 + uGroundAlbedo * 0.02 * L;
  }
  // ganho de preenchimento: o céu ilumina as sombras com mais força (leitura
  // de jogo: sombras coloridas pelo céu em vez de quase pretas)
  gl_FragColor = vec4(min(L * 1.6 + T * bg, vec3(200.0)), 1.0);
}`,he=class{constructor(e,n,r=32){this.renderer=e,this.u={...n,uCamPos:{value:new p(0,121,0)}},this.scene=new f,this.mat=new a({uniforms:this.u,vertexShader:pe,fragmentShader:me,side:1,depthWrite:!1,depthTest:!1}),this.mesh=new u(new S(10,32,16),this.mat),this.mesh.frustumCulled=!1,this.scene.add(this.mesh),this.cubeRT=new g(r,{type:i,generateMipmaps:!1,depthBuffer:!1}),this.cubeRT.texture.colorSpace=t,this.cam=new y(.1,100,this.cubeRT),this.pmrem=new C(e),this.rt=null,this.texture=null,this.count=0}update(e){this.u.uCamPos.value.copy(e);let t=this.renderer,n=t.getRenderTarget(),r=t.autoClear;t.autoClear=!0,this.cam.update(t,this.scene);let i=this.pmrem.fromCubemap(this.cubeRT.texture,this.rt);return t.autoClear=r,t.setRenderTarget(n),this.rt=i,this.texture=i.texture,this.count++,this.texture}dispose(){var e;this.cubeRT.dispose(),(e=this.rt)==null||e.dispose(),this.pmrem.dispose(),this.mat.dispose(),this.mesh.geometry.dispose()}},ge=new p(0,1,0),X=3.4,Z=1440,Q={lush:[[.14,.3,.09],[.04,.13,.36],1],ocean:[[.32,.3,.18],[.03,.12,.4],1],barren:[[.36,.34,.31],[.18,.17,.16],0],frozen:[[.72,.8,.88],[.4,.5,.62],3],toxic:[[.48,.55,.16],[.22,.32,.1],0],scorched:[[.6,.3,.12],[.28,.13,.07],0],exotic:[[.58,.26,.62],[.18,.5,.55],0],radioactive:[[.58,.62,.2],[.42,.3,.1],0],gas:[[.82,.62,.42],[.55,.4,.33],2]},_e={name:`atmosphere`,order:15,async init(e){var t;let{scene:n,renderer:i,space:a,player:o}=e,s=((t=e.shot)==null||(t=t.preset)==null?void 0:t.params)||{},c=e.params.get(`atmoBiome`),l=this.state={p:null,rotation:0,stars:[],bodies:[],lightsDirty:!0,envDirty:!0,envFrame:-1e9,envSunDir:new p,envAlt:-1,frame:0,readyDone:null,bodyCache:new Map},u=ie(),d=new oe(i,u),f=le(u);f.uniforms.uSkyView.value=d.sky.texture,n.add(f.mesh);let m=new fe(e,u,d),h=new he(i,u,32);this.parts={uniforms:u,luts:d,dome:f,aerial:m,env:h};let g=new _(16777215,X);g.name=`atmosphere:sun`,g.castShadow=!!e.quality.shadows,g.shadow.mapSize.set(e.quality.shadowMapSize,e.quality.shadowMapSize);let v=g.shadow.camera;v.left=v.bottom=-90,v.right=v.top=90,v.near=1,v.far=2400,g.shadow.bias=-4e-4,g.shadow.normalBias=.05;let y=new _(16777215,0);y.name=`atmosphere:sun2`;let b=new _(12571391,0);b.name=`atmosphere:moon`;let S=new r(10404863,2105368,0);S.name=`atmosphere:ambient`,n.add(g,g.target,y,y.target,b,b.target,S),this.lights={sun:g,sun2:y,moonLight:b,hemi:S},n.fog&&=null;let C=new p(0,1,0),w=new x(1,1,1),O={color:new x(10404863),intensity:.5},k={color:new x(.5,.6,.8),density:1e-5},A=null,j=!1,M=()=>{let t=e.services.universe,n=t==null?void 0:t.currentSystem,r=(t==null?void 0:t.currentPlanet)||{},i=e.services.planet,m=(i==null?void 0:i.radius)||r.radius||12e4,h=s.atmoBiome||c||r.biome||`lush`,g=null;try{var _;let e=new p().copy(o.worldPos).sub(a.planetCenter).normalize();g=(i==null||(_=i.biomeAt)==null||(_=_.call(i,e))==null?void 0:_.temperature)??null}catch{}let v={};(s.atmoBiome||c)&&(v.biome=h),s.atmoDensity!=null&&(v.density=s.atmoDensity),s.atmoMie!=null&&(v.mie=s.atmoMie),s.atmoAurora!=null&&(v.aurora=s.atmoAurora),s.atmoShape&&(v.shape=s.atmoShape);let y=I({radius:m,atmosphere:r.atmosphere??(t?null:{radius:m*1.1}),biome:h,seed:r.seed??e.seed.hash(`galaxy`,e.start.galaxy,`system`,e.start.systemIndex,`planet`,e.start.planetIndex),temperature:g,overrides:v}),b=i==null?void 0:i.palette;b!=null&&b.grass&&b!=null&&b.rock&&(y.groundAlbedo=[0,1,2].map(e=>{var t;return .5*b.grass[e]+.3*b.rock[e]+.2*(((t=b.sand)==null?void 0:t[e])??b.rock[e])}).map(e=>Math.min(.6,Math.max(.02,e)))),l.p=y,ae(u,y),d.renderStatic(),l.stars=[];let S=a.planetCenter;for(let e of((n==null?void 0:n.stars)||[]).slice(0,2)){let t=e.position,n=new p(t.x-S.x,t.y-S.y,t.z-S.z),r=n.length()||3e9;n.divideScalar(r),l.stars.push({inertial:n,dir:n.clone(),color:e.color||[1,1,1],E:X*(e.intensity??1),ang:Math.atan((e.radius||15e6)/r),id:e.id})}l.stars.length||l.stars.push({inertial:new p(1,0,0),dir:new p(1,0,0),color:[1,.96,.9],E:X,ang:.005});let C=s.atmoCompanion;if(C&&l.stars.length<2){let e=l.stars[0],t=E(e.inertial),n=(C.az??20)*Math.PI/180,r=(C.el??4)*Math.PI/180,i=e.inertial.clone().multiplyScalar(Math.cos(n)*Math.cos(r)).addScaledVector(t.east,Math.sin(n)*Math.cos(r)).addScaledVector(t.north,Math.sin(r)).normalize();l.stars.push({inertial:i,dir:i.clone(),color:D(C.temperature??3600),E:X*(C.intensity??.45),ang:e.ang*(C.size??.7),id:`companion`})}let w=F(e.seed.hash(`galaxy`,e.start.galaxy,`skybox`)),T=F(e.seed.hash(`galaxy`,e.start.galaxy,`system`,(n==null?void 0:n.index)??e.start.systemIndex,`skybox`)),O=[[[.12,.32,1],[.9,.18,.72],[.15,.85,.95]],[[.5,.18,1],[1,.3,.28],[.18,.5,1]],[[.08,.7,.92],[.42,.22,1],[1,.55,.22]],[[1,.28,.5],[.25,.3,1],[1,.72,.32]],[[.2,.9,.6],[.3,.35,1],[.85,.25,.9]]],k=O[Math.floor(w.next()*O.length)%O.length],A=T.range(-.04,.04),j=e=>{let t=new x(e[0],e[1],e[2]),n={};return t.getHSL(n),t.setHSL(((n.h+A)%1+1)%1,n.s,n.l),new p(t.r,t.g,t.b)},M=f.uniforms;M.uNebA.value.copy(j(k[0])),M.uNebB.value.copy(j(k[1])),M.uNebC.value.copy(j(k[2]));let N=new p(T.range(-1,1),T.range(.4,1.4),T.range(-1,1)).normalize();M.uGalN.value.copy(N),M.uNebSeed.value=T.range(0,50),M.uAurora.value=y.aurora,M.uAurLow.value.fromArray(y.auroraLow),M.uAurHigh.value.fromArray(y.auroraHigh),l.bodyCache.clear(),l.lightsDirty=!0,l.envDirty=!0},N=()=>{let e=o.worldPos,t=a.planetCenter;return T({x:e.x-t.x,y:e.y-t.y,z:e.z-t.z}).lon*Math.PI/180},P=()=>{let e=l.stars[0].inertial;return Math.atan2(-e.z,e.x)},L=()=>{for(let e of l.stars)e.dir.copy(e.inertial).applyAxisAngle(ge,l.rotation).normalize();C.copy(l.stars[0].dir)};M(),L();let R=[e.bus.on(`system:enter`,()=>{M(),L()}),e.bus.on(`planet:enter`,()=>{M(),L()}),e.bus.on(`service:ready`,({name:e})=>{(e===`planet`||e===`universe`)&&(M(),L())}),e.bus.on(`quality:change`,()=>{l.lightsDirty=!0})];this.offs=R,m.removePass=e.pipeline.addPass(`afterWorld`,(e,t)=>m.render(t),{order:10,owner:`atmosphere`}),l.readyDone=e.ready.busy(`atmosfera: IBL`);let z=this,B={get sunDirection(){return C},get sunColor(){return w},get sunIntensity(){return g.intensity},get suns(){return l.stars.map((e,t)=>({direction:e.dir,color:t===0?w:y.color,intensity:t===0?g.intensity:y.intensity}))},ambient:O,get envMap(){return A},sun:g,sun2:y,moonLight:b,get rotation(){return l.rotation},set rotation(e){l.rotation=e,L(),l.lightsDirty=!0},dayLength:Z,get timeOfDay(){let e=.5-(P()+l.rotation-N())/(Math.PI*2);return e-=Math.floor(e),e},setTime(t){let n=N()+Math.PI*2*(.5-t);l.rotation=n-P(),L(),l.lightsDirty=!0,l.envDirty=!0,l.readyDone||=e.ready.busy(`atmosfera: IBL`),e.bus.emit(`sky:time`,{t})},fogAt(e){let t=l.p;if(!(t!=null&&t.has)||!e)return{color:k.color,density:0};let n=a.planetCenter,r=Math.max(0,Math.hypot(e.x-n.x,e.y-n.y,e.z-n.z)/1e3-t.Rb),i=Math.exp(-r/t.Hr),o=Math.exp(-r/t.Hm),s=[0,1,2].map(e=>t.rayleigh[e]*i+t.mieExt[e]*o);return{color:k.color,density:(.2126*s[0]+.7152*s[1]+.0722*s[2])/1e3}},get atmosphere(){var e;return((e=l.p)==null?void 0:e.contract)||null},get params(){return l.p},drawsBodies:!0,uniforms:u,glsl:U+W+G,luts:{transmittance:d.trans.texture,multiScattering:d.ms.texture,skyView:d.sky.texture},get luminance(){return z.state.sceneLum??.2}};this.api=e.provide(`sky`,B),this._env={get envMap(){return A},set envMap(e){A=e},get owns(){return j},set owns(e){j=e}},this._shared={sunDirection:C,sunColor:w,ambient:O,fogState:k,updateSunDirs:L}},frame(e,t){var n;let r=this.state,{uniforms:i,luts:a,dome:o,aerial:s,env:l}=this.parts,{sun:u,sun2:d,moonLight:f,hemi:m}=this.lights,{sunDirection:h,sunColor:g,ambient:_,fogState:v,updateSunDirs:y}=this._shared,{space:b,player:x,camera:S,scene:C}=t,w=r.p;r.frame++,!t.time.frozen&&e>0&&(r.rotation+=e*Math.PI*2/Z,r.lightsDirty=r.lightsDirty||r.frame%4==0),y();let T=b.planetCenter,D=b.origin,O=r._cam||=new p;O.set((D.x-T.x)/1e3,(D.y-T.y)/1e3,(D.z-T.z)/1e3);let k=O.length();k<w.Rb+5e-4&&(O.multiplyScalar((w.Rb+5e-4)/Math.max(k,1e-6)),k=w.Rb+5e-4);let A=(r._up||=new p).copy(O).divideScalar(k),j=E(A,r._fr||={east:new p,north:new p,up:new p}),M=k<w.Rt-.002,N=i.uLightDir.value,P=i.uLightE.value,F=o.uniforms;for(let e=0;e<2;e++){let t=r.stars[e];t?(N[e].copy(t.dir),P[e].set(t.color[0]*t.E,t.color[1]*t.E,t.color[2]*t.E),F.uStarE.value[e].copy(P[e]),F.uStarAng.value[e]=t.ang,F.uStarTint.value[e].set(t.color[0],t.color[1],t.color[2])):(P[e].set(0,0,0),F.uStarE.value[e].set(0,0,0),F.uStarAng.value[e]=0)}this.updateBodies(t,D);let I=null;for(let e of r.bodies)(!I||e.weight>I.weight)&&(I=e);if(I&&I.weight>.02&&w.has){let e=.2*((1-I.dir.dot(h))/2)*Math.min(1,I.weight);N[2].copy(I.dir),P[2].set(.8*e*r.stars[0].E,.88*e*r.stars[0].E,1*e*r.stars[0].E)}else P[2].set(0,0,0);F.uCamPos.value.copy(O),F.uUp.value.copy(A),F.uEast.value.copy(j.east),F.uNorth.value.copy(j.north),F.uInside.value=+!!M;let L=Math.min(1,Math.max(0,(k-w.Rb)/Math.max(.001,w.Rt-w.Rb)));F.uNebGain.value=.6+1.6*L*L;let R=Math.max(8,Math.min(32,t.quality.atmosphereSamples||16));F.uSteps.value=R+4;let z=t.pipeline.height||ve(t);F.uPixelAngle.value=S.fov*Math.PI/180/Math.max(1,z),F.uTime.value=t.time.world;let B=(r._rotM||=new c).makeRotationY(-r.rotation);F.uToInertial.value.setFromMatrix4(B),a.skyU.uCamPos.value.copy(O),a.skyU.uUp.value.copy(A),a.skyU.uEast.value.copy(j.east),a.skyU.uNorth.value.copy(j.north),a.skyU.uSteps.value=30,M&&a.renderSkyView();let V=Math.max(20,Math.min(160,Math.sqrt(Math.max(1,w.Rt*w.Rt-w.Rb*w.Rb))*1.6));a.apU.uAPMax.value=V,this.frustumCorners(S,a.apU),s.u.uInside.value=+!!M,s.u.uSteps.value=R,s.u.uNear.value=S.near,s.u.uFar.value=S.far,s.enabled=w.has&&t.params.get(`atmoAP`)!==`0`,r.lightsDirty&&(r.lightsDirty=!1,this.updateSceneLights(t,O,k,M));let H=t.services.planet,U=(H==null?void 0:H.radius)||w.Rb*1e3,W=k*1e3-U;if(u.castShadow=!!t.quality.shadows&&W<1500,u.target.position.copy(A).multiplyScalar(-Math.max(0,W)),u.position.copy(u.target.position).addScaledVector(h,1200),u.target.updateMatrixWorld(),r.stars[1]&&(d.target.position.set(0,0,0),d.position.copy(r.stars[1].dir).multiplyScalar(1e3),d.target.updateMatrixWorld()),I&&(f.target.position.set(0,0,0),f.position.copy(I.dir).multiplyScalar(1e3),f.target.updateMatrixWorld()),(n=t.services.universe)!=null&&n.placeholder){let e=r._phU||=C.getObjectByName(`placeholder:universe`);e&&(e.visible=!1)}let G=t.shot?1:30,K=r.envSunDir.dot(h)<Math.cos(.01),q=r.envAlt<0||Math.abs(k-r.envAlt)/Math.max(1,r.envAlt-w.Rb+1)>.08;if((r.envDirty||K||q)&&r.frame-r.envFrame>=G){r.envDirty=!1,r.envFrame=r.frame,r.envSunDir.copy(h),r.envAlt=k;try{let e=l.update(O);this._env.envMap=e,(!C.environment||this._env.owns)&&(C.environment=e,this._env.owns=!0)}catch(e){t.report(`atmosphere`,`env`,e)}r.readyDone&&=(r.readyDone(),null)}m.intensity=this._env.owns&&C.environment===this._env.envMap?0:_.intensity,(!this._env.owns||C.environment!==this._env.envMap)&&m.color.copy(_.color)},frustumCorners(e,t){let n=e.projectionMatrixInverse,r=e.matrixWorld,i=this._fv||=new p,a=(e,t,a)=>{i.set(t,a,.5).applyMatrix4(n),i.multiplyScalar(-1/i.z),e.copy(i).transformDirection(r).multiplyScalar(i.length())};a(t.uC00.value,-1,-1),a(t.uC10.value,1,-1),a(t.uC01.value,-1,1),a(t.uC11.value,1,1)},updateBodies(e,t){let n=this.state,r=this.parts.dome.uniforms,i=e.services.universe,a=[],o=i==null?void 0:i.currentPlanet,s=[];try{var c;s=(i==null||(c=i.bodies)==null?void 0:c.call(i))||[]}catch{s=[]}for(let e of s){if(!e||e.kind===`star`||e===o||e.id===(o==null?void 0:o.id)||!e.position)continue;let n=e.position.x-t.x,r=e.position.y-t.y,i=e.position.z-t.z,s=Math.hypot(n,r,i);if(s<=e.radius*1.01)continue;let c=Math.asin(Math.min(1,e.radius/s));c<15e-5||a.push({b:e,d:s,ang:c,dx:n,dy:r,dz:i})}a.sort((e,t)=>t.ang-e.ang);let l=a.slice(0,8);l.sort((e,t)=>t.d-e.d),n.bodies=[];for(let e=0;e<8;e++){let t=l[e];if(!t)continue;let{b:i}=t,a=n.bodyCache.get(i.id);if(!a){let e=Q[i.biome]||Q.barren,t=F((i.seed??7)^192969),r=e=>e.map(e=>Math.max(.01,e*t.range(.8,1.2))),o=e[2];(i.biome===`gas`||i.kind===`gas`)&&(o=2);let s=[0,0,0,0];if(i.atmosphere){let e=L(I({radius:i.radius,atmosphere:i.atmosphere,biome:i.biome,seed:i.seed??1}));s=[e[0],e[1],e[2],Math.max(.03,(i.atmosphere.radius-i.radius)/i.radius)]}let c=[0,0,0,0],l=[0,1,0,0],u=[0,0,0,0];if(i.rings){c=[i.rings.inner/i.radius,i.rings.outer/i.radius,.85,1];let e=i.rings.tilt||0;l=[0,Math.cos(e),Math.sin(e),0],u=[...i.rings.color||[.8,.72,.6],0]}let d=e=>e.map(e=>e*.7+.16);a={c1:d(r(e[0])),c2:d(r(e[1])),type:o,seed:t.range(0,40),atm:s,ring:c,ringN:l,ringC:u},n.bodyCache.set(i.id,a)}let o=n.bodies.length;r.uBodyPos.value[o].set(t.dx/1e3,t.dy/1e3,t.dz/1e3,i.radius/1e3),r.uBodyCol.value[o].set(a.c1[0],a.c1[1],a.c1[2],a.type),r.uBodyCol2.value[o].set(a.c2[0],a.c2[1],a.c2[2],a.seed),r.uBodyAtm.value[o].fromArray(a.atm),r.uBodyRing.value[o].fromArray(a.ring),r.uBodyRingN.value[o].fromArray(a.ringN),r.uBodyRingC.value[o].fromArray(a.ringC);let s=new p(t.dx,t.dy,t.dz).divideScalar(t.d);n.bodies.push({id:i.id,dir:s,ang:t.ang,weight:(t.ang/.05)**2})}r.uBodyCount.value=n.bodies.length},updateSceneLights(e,t,n,r){let i=this.state,a=i.p,{sun:o,sun2:s,moonLight:c,hemi:l}=this.lights,{sunColor:u,ambient:d,fogState:f}=this._shared,m=this.parts.uniforms.uLightE.value,h=this.parts.uniforms.uLightDir.value,g=[t.x,t.y,t.z],_=[];for(let e=0;e<3;e++)m[e].x+m[e].y+m[e].z>0&&_.push({dir:[h[e].x,h[e].y,h[e].z],E:[m[e].x,m[e].y,m[e].z]});let v=i.stars[0],y=a.has?V(a,g,[h[0].x,h[0].y,h[0].z]):$(a,g,h[0]);u.setRGB(v.color[0]*y[0],v.color[1]*y[1],v.color[2]*y[2]),o.color.copy(u),o.intensity=v.E;let b=i.stars[1];if(b){let e=a.has?V(a,g,[h[1].x,h[1].y,h[1].z]):$(a,g,h[1]);s.color.setRGB(b.color[0]*e[0],b.color[1]*e[1],b.color[2]*e[2]),s.intensity=b.E}else s.intensity=0;if(m[2].x>0){let e=a.has?V(a,g,[h[2].x,h[2].y,h[2].z]):[1,1,1],t=Math.max(m[2].x,m[2].y,m[2].z);c.color.setRGB(m[2].x/t*e[0],m[2].y/t*e[1],m[2].z/t*e[2]),c.intensity=t*1.6}else c.intensity=0;let x=[t.x/n,t.y/n,t.z/n],S=a.Rt-a.Rb,C=Math.min(n,a.Rb+S*.6),w=[x[0]*C,x[1]*C,x[2]*C],T=E(new p(...x)),D=[0,0,0],O=[0,0,0];if(a.has&&_.length){let e=H(a,w,x,_,{steps:10,lightSteps:5}).L;for(let t=0;t<3;t++)D[t]+=e[t]*.4;for(let[e,t]of[[1,0],[0,1],[-1,0],[0,-1]]){let n=new p().addScaledVector(T.east,e).addScaledVector(T.north,t).addScaledVector(T.up,.06).normalize(),r=H(a,w,[n.x,n.y,n.z],_,{steps:10,lightSteps:5}).L;for(let e=0;e<3;e++)D[e]+=r[e]*.15,O[e]+=r[e]*.25}}for(let e=0;e<3;e++)D[e]=D[e]*a.skyGain+a.airglow[e]*4,O[e]*=a.skyGain;let k=D.map(e=>e*Math.PI),A=Math.max(1e-5,.2126*k[0]+.7152*k[1]+.0722*k[2]);d.color.setRGB(k[0]/A,k[1]/A,k[2]/A),d.intensity=A,l.groundColor.setRGB(a.groundAlbedo[0]*u.r*.3+.01,a.groundAlbedo[1]*u.g*.3+.01,a.groundAlbedo[2]*u.b*.3+.01),f.color.setRGB(O[0],O[1],O[2]);let j=Math.max(0,h[0].x*x[0]+h[0].y*x[1]+h[0].z*x[2]);i.sceneLum=.15*(v.E*j*(.2126*y[0]+.7152*y[1]+.0722*y[2]))/Math.PI+A*.1},dispose(e){var t,n;for(let e of this.offs||[])e();let{luts:r,dome:i,aerial:a,env:o}=this.parts||{};if(a==null||(t=a.removePass)==null||t.call(a),a==null||a.dispose(),r==null||r.dispose(),o==null||o.dispose(),i&&(e.scene.remove(i.mesh),i.mesh.geometry.dispose(),i.mesh.material.dispose()),this.lights)for(let t of Object.values(this.lights))e.scene.remove(t,t.target);(n=this._env)!=null&&n.owns&&e.scene.environment===this._env.envMap&&(e.scene.environment=null)}};function ve(e){let t=new m;return e.renderer.getDrawingBufferSize(t),t.y}function $(e,t,n){let r=Math.hypot(t[0],t[1],t[2]),i=(t[0]*n.x+t[1]*n.y+t[2]*n.z)/r,a=Math.min(1,e.Rb/r),o=-Math.sqrt(Math.max(0,1-a*a)),s=i>o+.006?1:i<o-.006?0:(i-o+.006)/.012;return[s,s,s]}export{_e as default};
//# sourceMappingURL=atmosphere-CabGFDnc.js.map