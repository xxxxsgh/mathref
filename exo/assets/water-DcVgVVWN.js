import{$ as e,A as t,B as n,E as r,G as i,L as a,N as o,O as s,P as c,V as l,W as u,X as d,Y as f,Z as p,_ as m,j as h,k as g,l as _,n as v,p as y,u as b,v as x,x as S,z as C}from"./three-CjNQKr8_.js";var w=[{T:48,A:.12,v:[.55,.2]},{T:12,A:.075,v:[-.32,.42]},{T:3,A:.022,v:[.24,-.18]},{T:.75,A:.005,v:[-.09,-.12]}];function T(e){return()=>{e|=0,e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function E(e=7){let t=T(e),i=[];for(let e=0;e<56;e++){let e,n,r;do e=Math.round((t()*2-1)*22),n=Math.round((t()*2-1)*22),r=Math.hypot(e,n);while(r<1.5);let a=(.55+.45*Math.abs(e/r))*r**-1.35*(.6+.8*t());i.push({kx:e,ky:n,k:r,a,ph:t()*Math.PI*2})}let a=new Float32Array(256*256),o=new Float32Array(256*256),c=new Float32Array(256*256),u=new Float32Array(256*256),d=Math.PI*2;for(let e of i){let t=d*e.kx,n=d*e.ky;for(let r=0;r<256;r++){let i=r/256;for(let s=0;s<256;s++){let l=s/256*t+n*i+e.ph,d=Math.sin(l),f=Math.cos(l),p=r*256+s;a[p]+=e.a*d,o[p]+=e.a*t*f,c[p]+=e.a*n*f,u[p]-=e.a*(t*t+n*n)*d}}}let f=0,p=0,h=0;for(let e=0;e<256*256;e++)f=Math.max(f,Math.abs(a[e])),p=Math.max(p,Math.abs(o[e]),Math.abs(c[e])),h=Math.max(h,Math.abs(u[e]));let _=new Uint16Array(256*256*4),v=x.toHalfFloat;for(let e=0;e<256*256;e++)_[e*4]=v(o[e]/f),_[e*4+1]=v(c[e]/f),_[e*4+2]=v(a[e]/f),_[e*4+3]=v(u[e]/h);let y=new m(_,256,256,n,r);return y.wrapS=y.wrapT=l,y.minFilter=g,y.magFilter=s,y.generateMipmaps=!0,y.anisotropy=4,y.colorSpace=``,y.needsUpdate=!0,y.name=`water:detail`,y.userData.gradScale=p/f,y}var D=class{constructor(e=1){this.rnd=T(e),this.dirs=[],this.k=new Float32Array(6),this.amp=new Float32Array(6),this.omega=new Float32Array(6),this.Q=new Float32Array(6),this.lambda=new Float32Array(6),this.phase0=new Float32Array(6),this.windAngle=this.rnd()*Math.PI*2,this.spread=[];for(let e=0;e<6;e++)this.dirs.push(new d(1,0,0)),this.spread.push((this.rnd()*2-1)*(.25+e*.12));this.state=.5,this.setSeaState(.5)}setSeaState(e){this.state=e;let t=[26,16.5,10.5,6.8,4.3,2.9];for(let n=0;n<6;n++){let r=t[n]*(.75+.6*e);this.lambda[n]=r;let i=Math.PI*2/r;this.k[n]=i,this.amp[n]=r*(.004+.011*e)*(n===0?1.2:1),this.omega[n]=Math.sqrt(9.81*i),this.Q[n]=Math.min(1,(.55+.25*e)/(i*this.amp[n]*6))}}orient(e){for(let t=0;t<6;t++){let n=this.windAngle+this.spread[t];this.dirs[t].set(0,0,0).addScaledVector(e.east,Math.cos(n)).addScaledVector(e.north,Math.sin(n)).normalize()}}updatePhases(e,t,n){let r=Math.PI*2,i=e.x-t.x,a=e.y-t.y,o=e.z-t.z;for(let e=0;e<6;e++){let t=this.dirs[e],s=this.k[e]*(t.x*i+t.y*a+t.z*o)-this.omega[e]*n;s-=Math.floor(s/r)*r,this.phase0[e]=s}}heightAt(e,t,n,r){let i=0;for(let a=0;a<6;a++){let o=this.dirs[a],s=this.k[a]*(o.x*e+o.y*t+o.z*n)-this.omega[a]*r;i+=this.amp[a]*Math.sin(s)}return i}},O=`
uniform float uDepthMode;
uniform float uNear;
uniform float uFar;
float exoViewZ(float d) {
  if (uDepthMode < 0.5) {
    if (d <= 0.0) return 1e12;
    float c = uNear / (uFar - uNear);
    float dd = uFar * uNear / (uFar - uNear);
    return dd / (d + c);
  } else if (uDepthMode < 1.5) {
    if (d >= 1.0) return 1e12;
    return exp2(d * log2(uFar + 1.0)) - 1.0;
  }
  if (d >= 1.0) return 1e12;
  float ndc = d * 2.0 - 1.0;
  return 2.0 * uNear * uFar / ((uFar + uNear) - ndc * (uFar - uNear));
}
`,k=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,A=96,j=144,M=`
#include <common>
#include <logdepthbuf_pars_vertex>
#define NW 6
uniform vec3 uWaveDir[NW];
uniform vec4 uWave[NW];      // k, amp, omega(n/u), Q
uniform float uPhase0[NW];
uniform float uRingQ;        // razão entre anéis − 1 (tamanho relativo da célula)
uniform vec3 uCenterR;       // centro do planeta em espaço de render
varying vec3 vP;             // posição de render deslocada
varying vec3 vBase;          // posição de render sem deslocamento
varying vec3 vUp;
varying float vViewZ;
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 up = normalize(p - uCenterR);
  float dist = length(p);
  vec3 disp = vec3(0.0);
  for (int i = 0; i < NW; i++) {
    float k = uWave[i].x;
    float a = uWave[i].y;
    float lambda = 6.2831853 / k;
    // a malha só representa ondas maiores que ~4 células
    float cell = max(dist, 1.0) * uRingQ;
    a *= 1.0 - smoothstep(lambda * 0.18, lambda * 0.3, cell);
    if (a <= 0.0) continue;
    vec3 D = uWaveDir[i];
    vec3 Dt = normalize(D - dot(D, up) * up + 1e-6);
    float ph = k * dot(D, p) + uPhase0[i];
    disp += up * (a * sin(ph)) + Dt * (uWave[i].w * a * cos(ph));
  }
  vBase = p;
  p += disp;
  vP = p;
  vUp = up;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`,N=`
#include <common>
#include <logdepthbuf_pars_fragment>
#include <cube_uv_reflection_fragment>
${O}
#define NW 6
uniform vec3 uWaveDir[NW];
uniform vec4 uWave[NW];
uniform float uPhase0[NW];
uniform sampler2D tDetail;
uniform vec4 uLayer[4];       // 1/T, A, scrollU, scrollV
uniform vec3 uCamMod;         // posição da câmera mod 96 m (double na CPU)
uniform float uGradScale;
uniform sampler2D tSceneColor;
uniform sampler2D tSceneZ;    // distância no eixo (m), céu = 1e12
uniform float uHasScene;
uniform vec2 uRes;
uniform mat4 uProj;
uniform float uPixAngle;      // rad por pixel
uniform vec3 uSunDir;
uniform vec3 uSunE;           // irradiância do sol (cor × intensidade)
uniform vec3 uSkyFallback;    // radiância do céu sem IBL
uniform sampler2D envMap;
uniform float uHasEnv;
uniform float uEnvGain;
uniform vec3 uSigma;          // extinção (1/m)
uniform vec3 uScatter;        // albedo de volume (cor do bioma)
uniform vec3 uEmissive;       // brilho próprio (mares tóxicos/radioativos)
uniform float uTime;
uniform float uSSR;           // 0/1
uniform int uSSRSteps;
uniform float uUnder;         // câmera submersa
uniform float uFoamAmt;
uniform float uCaustics;
varying vec3 vP;
varying vec3 vBase;
varying vec3 vUp;
varying float vViewZ;

vec3 skyRad(vec3 dir, float rough) {
#ifdef ENVMAP_TYPE_CUBE_UV
  if (uHasEnv > 0.5) return textureCubeUV(envMap, dir, rough).rgb * uEnvGain;
#endif
  float h = clamp(dir.y, 0.0, 1.0);
  return uSkyFallback * (0.6 + 0.4 * h);
}

// gradiente de altura de uma camada de detalhe (triplanar periódico)
vec3 detailGrad(vec3 wP, vec3 up, vec3 bw, vec4 L, out float h, out float lap) {
  vec3 g = vec3(0.0);
  h = 0.0; lap = 0.0;
  vec2 sc = L.zw;
  if (bw.x > 0.02) {
    vec4 t = texture2D(tDetail, wP.zy * L.x + sc);
    g += vec3(0.0, t.y, t.x) * bw.x; h += t.z * bw.x; lap += t.w * bw.x;
  }
  if (bw.y > 0.02) {
    vec4 t = texture2D(tDetail, wP.xz * L.x + sc);
    g += vec3(t.x, 0.0, t.y) * bw.y; h += t.z * bw.y; lap += t.w * bw.y;
  }
  if (bw.z > 0.02) {
    vec4 t = texture2D(tDetail, wP.xy * L.x + sc);
    g += vec3(t.x, t.y, 0.0) * bw.z; h += t.z * bw.z; lap += t.w * bw.z;
  }
  return g * L.x * L.y;
}

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 up = normalize(vUp);
  float dist = length(vP);
  vec3 V = -vP / dist;
  float foot = dist * uPixAngle; // tamanho do pixel no chão (m)

  // ── Gerstner (normal analítica + jacobiano para a espuma de crista) ──
  vec3 gsum = vec3(0.0);
  float jac = 1.0;
  float lostVar = 0.0;
  for (int i = 0; i < NW; i++) {
    float k = uWave[i].x;
    float a = uWave[i].y;
    float lambda = 6.2831853 / k;
    float f = 1.0 - smoothstep(lambda * 0.08, lambda * 0.25, foot);
    lostVar += (1.0 - f) * (k * a) * (k * a) * 0.5;
    a *= f;
    vec3 D = uWaveDir[i];
    vec3 Dt = normalize(D - dot(D, up) * up + 1e-6);
    float ph = k * dot(D, vBase) + uPhase0[i];
    gsum += Dt * (k * a * cos(ph));
    jac -= uWave[i].w * k * a * sin(ph);
  }

  // ── detalhe (ondulações) ──
  vec3 wP = vBase + uCamMod;
  vec3 bw = pow(abs(up), vec3(6.0));
  bw /= (bw.x + bw.y + bw.z);
  vec3 dg = vec3(0.0);
  float hA = 0.0, lapA = 0.0, hB = 0.0, lapB = 0.0, hC = 0.0, hh, ll;
  for (int i = 0; i < 4; i++) {
    vec4 L = uLayer[i];
    float T = 1.0 / L.x;
    float f = 1.0 - smoothstep(T * 0.02, T * 0.12, foot);
    float slope = L.y * L.x * uGradScale;
    lostVar += (1.0 - f) * slope * slope * 0.25;
    if (f <= 0.0) continue;
    vec3 g = detailGrad(wP, up, bw, L, hh, ll);
    dg += g * f;
    if (i == 1) { hA = hh; lapA = ll; }
    if (i == 2) { hB = hh; lapB = ll; }
    if (i == 3) { hC = hh; }
  }
  vec3 grad = gsum + dg;
  grad -= up * dot(grad, up);
  vec3 N = normalize(up - grad);
  // mais calmo muito longe (variância perdida vira rugosidade)
  float rough = clamp(0.035 + sqrt(lostVar) * 0.9, 0.035, 0.42);

  bool below = uUnder > 0.5;
  vec3 Nf = below ? -N : N;
  float NoV = max(dot(Nf, V), 1e-3);
  vec2 suv = gl_FragCoord.xy / uRes;

  // ── céu / sol ──
  vec3 L = normalize(uSunDir);
  vec3 ambUp = skyRad(up, 1.0);          // radiância difusa do céu
  float sunUp = smoothstep(-0.05, 0.08, dot(L, up));

  if (below) {
    // por baixo: janela de Snell (céu transmitido) ou reflexão interna total
    vec3 T = refract(-V, Nf, 1.333);
    vec3 col;
    float fr = 1.0;
    if (dot(T, T) > 0.0) {
      float c = max(dot(V, Nf), 0.0);
      fr = 0.02 + 0.98 * pow(1.0 - c, 5.0);
      col = skyRad(T, 0.0) * (1.0 - fr);
    } else col = vec3(0.0);
    vec3 deepL = uScatter * (uSunE * sunUp * 0.25 / PI + ambUp) * 0.6;
    col += deepL * fr;
    // névoa da coluna d'água até a superfície
    vec3 tr = exp(-uSigma * dist);
    col = col * tr + deepL * (1.0 - tr);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  // ── profundidade do mundo atrás da água ──
  float sceneZ = texture2D(tSceneZ, suv).r;
  float waterZ = max(vViewZ, 1e-3);
  float rayK = dist / waterZ;
  float thick = max(sceneZ - waterZ, 0.0) * rayK;           // ao longo do raio
  float depthV = thick * max(dot(V, up), 0.05);             // vertical aprox.

  // ── refração ──
  vec3 Nv = (viewMatrix * vec4(N - up, 0.0)).xyz;
  vec2 ruv = suv + Nv.xy * clamp(thick * 0.6, 0.0, 1.0) * 0.06 / max(1.0, dist * 0.02);
  float rZ = texture2D(tSceneZ, ruv).r;
  if (rZ < waterZ) { ruv = suv; rZ = sceneZ; }
  float rThick = max(rZ - waterZ, 0.0) * rayK;
  vec3 bed = texture2D(tSceneColor, ruv).rgb;
  // cáusticas no leito (luz focada pelas ondulações), somem com a profundidade
  if (uCaustics > 0.0 && rZ < 1e11) {
    vec3 bp = (V * -1.0) * (rZ * rayK) + uCamMod;    // ponto do leito (mod)
    vec3 bpL = bp;
    float hc, lc1, lc2;
    vec3 g1 = detailGrad(bpL * 1.0 + vec3(uTime * 0.11, 0.0, uTime * 0.07), up, bw, uLayer[1], hc, lc1);
    vec3 g2 = detailGrad(bpL * 1.7 - vec3(uTime * 0.05, uTime * 0.04, 0.0), up, bw, uLayer[2], hc, lc2);
    float focus = max(0.0, -(lc1 * 0.8 + lc2 * 0.6));
    float cz = rThick * max(dot(V, up), 0.05);
    float caus = pow(focus, 2.0) * 4.5 * smoothstep(0.05, 0.6, cz) * exp(-cz * 0.18);
    caus *= 1.0 - smoothstep(60.0, 220.0, dist);
    bed += bed * caus * uCaustics * sunUp * max(dot(L, up), 0.0) * 1.4;
  }
  vec3 tr = exp(-uSigma * rThick);
  vec3 inscat = uScatter * (uSunE * sunUp * max(dot(L, up), 0.0) * 0.35 / PI + ambUp * 0.9);
  vec3 refr = uHasScene > 0.5 ? bed * tr + inscat * (1.0 - tr) : inscat;
  refr += uEmissive * (1.0 - tr.g * 0.5);

  // ── reflexo ──
  vec3 R = reflect(-V, N);
  // não refletir abaixo do horizonte local (sem auto-reflexo da água)
  float rup = dot(R, up);
  if (rup < 0.02) R = normalize(R + up * (0.02 - rup));
  vec3 refl = skyRad(R, rough * 0.8);
  if (uSSR > 0.5 && uHasScene > 0.5 && dist < 6000.0) {
    float t = 0.6 + dist * 0.015;
    vec3 hit = vec3(0.0);
    float hitW = 0.0;
    for (int i = 0; i < 24; i++) {
      if (i >= uSSRSteps) break;
      vec3 q = vP + R * t;
      vec4 c = uProj * (viewMatrix * vec4(q, 1.0));
      if (c.w <= 0.0) break;
      vec2 quv = c.xy / c.w * 0.5 + 0.5;
      if (quv.x < 0.0 || quv.y < 0.0 || quv.x > 1.0 || quv.y > 1.0) break;
      float qz = -(viewMatrix * vec4(q, 1.0)).z;
      float sz = texture2D(tSceneZ, quv).r;
      if (qz > sz && qz - sz < t * 0.35 + 0.5) {
        vec2 e = min(quv, 1.0 - quv);
        float edge = smoothstep(0.0, 0.08, min(e.x, e.y));
        hit = texture2D(tSceneColor, quv).rgb;
        hitW = edge * (1.0 - smoothstep(0.6, 1.0, float(i) / float(uSSRSteps)));
        break;
      }
      t *= 1.32;
    }
    refl = mix(refl, hit, hitW);
  }
  float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  F = mix(F, 0.06, smoothstep(0.1, 0.4, rough) * 0.5);

  // ── sol especular (GGX) ──
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.0);
  float NoH = max(dot(N, H), 0.0);
  float a = rough * rough;
  float k = a * 0.5;
  float G = NoL / (NoL * (1.0 - k) + k) * NoV / (NoV * (1.0 - k) + k);
  float Fs = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 spec = uSunE * sunUp * D_GGX(NoH, max(a, 0.002)) * G * Fs / max(4.0 * NoV, 1e-3);
  spec = min(spec, vec3(400.0));

  vec3 col = mix(refr, refl, F) + spec;

  // ── espuma ──
  float foamN = hA * 0.5 + hB * 0.5;
  // renda: células da soma das ondulações (fina perto, some longe)
  float lace = smoothstep(0.05, 0.45, hA * 0.45 + hB * 0.55 + hC * 0.35 + 0.18);
  // costa: linha viva na borda + faixas que correm para a praia, rasgadas
  float edge = 1.0 - smoothstep(0.02, 0.22 + foamN * 0.08, depthV);
  float shore = 1.0 - smoothstep(0.0, 1.5, depthV + foamN * 0.4);
  float bands = 0.5 + 0.5 * sin(depthV * 6.0 - uTime * 1.4 + foamN * 5.0);
  float fShore = max(edge * (0.7 + 0.3 * lace), shore * smoothstep(0.25, 0.9, bands) * lace);
  // cristas: onde a superfície se comprime (jacobiano baixo)
  float fCrest = smoothstep(0.62, 0.35, jac) * lace;
  float foam = clamp((fShore + fCrest * 0.7) * uFoamAmt, 0.0, 1.0);
  foam *= 1.0 - smoothstep(300.0, 2000.0, dist);
  vec3 foamCol = vec3(0.82) * (uSunE * sunUp * max(dot(up, L), 0.0) / PI + ambUp * 0.9);
  col = mix(col, foamCol, foam);

  gl_FragColor = vec4(col, 1.0);
}`,P=class{constructor(e,{detail:t,waves:n}){this.ctx=e,this.waves=n,this.pos=new Float32Array(13825*3);let r=[];for(let e=0;e<j;e++)r.push(0,1+e,1+(e+1)%j);for(let e=0;e<A-1;e++)for(let t=0;t<j;t++){let n=1+e*j+t,i=1+e*j+(t+1)%j;r.push(n,n+j,i,i,n+j,i+j)}let a=new b;a.setAttribute(`position`,new _(this.pos,3)),a.setIndex(r),this.geo=a,this.uniforms={uDepthMode:{value:e.depthMode===`reversed`?0:e.depthMode===`log`?1:2},uNear:{value:e.camera.near},uFar:{value:e.camera.far},uWaveDir:{value:Array.from({length:6},()=>new d(1,0,0))},uWave:{value:Array.from({length:6},()=>new p)},uPhase0:{value:new Float32Array(6)},uRingQ:{value:.1},uCenterR:{value:new d},tDetail:{value:t},uLayer:{value:w.map(()=>new p)},uCamMod:{value:new d},uGradScale:{value:t.userData.gradScale||1},tSceneColor:{value:null},tSceneZ:{value:null},uHasScene:{value:0},uRes:{value:new f(1,1)},uProj:{value:new o},uPixAngle:{value:.001},uSunDir:{value:new d(0,1,0)},uSunE:{value:new y(3,3,3)},uSkyFallback:{value:new y(.3,.5,.9)},envMap:{value:null},uHasEnv:{value:0},uEnvGain:{value:1},uSigma:{value:new d(.35,.06,.04)},uScatter:{value:new y(.01,.1,.12)},uEmissive:{value:new y(0,0,0)},uTime:{value:0},uSSR:{value:1},uSSRSteps:{value:20},uUnder:{value:0},uFoamAmt:{value:1},uCaustics:{value:1}},this.mat=new i({name:`water:ocean`,uniforms:this.uniforms,vertexShader:M,fragmentShader:N,side:2,depthWrite:!0,depthTest:!0}),this.envHeight=0,this.mesh=new c(a,this.mat),this.mesh.name=`water:ocean`,this.mesh.frustumCulled=!1,this.scene=new u,this.scene.add(this.mesh),this.anchor=new e.WorldPos,this.handle=e.space.registerFloating(this.mesh,this.anchor),this.anchorDir=new d(2,0,0),this.anchorAlt=-1,this.radius=0,this._u=new d}setEnv(e){var t;let n=this.uniforms;if(!e){n.uHasEnv.value=0;return}let r=((t=e.image)==null?void 0:t.height)||0;if(n.envMap.value=e,n.uHasEnv.value=+!!r,r&&r!==this.envHeight){this.envHeight=r;let e=Math.log2(r)-2,t=1/r,n=1/(3*Math.max(2**e,112));this.mat.defines={ENVMAP_TYPE_CUBE_UV:``,CUBEUV_TEXEL_WIDTH:n,CUBEUV_TEXEL_HEIGHT:t,CUBEUV_MAX_MIP:`${e}.0`},this.mat.needsUpdate=!0}}rebuild(e,t,n){let r=this.ctx,i=Math.max(1.5,t),a=Math.max(.35,i*.01)/n,o=(Math.min(Math.PI*.95,Math.acos(n/(n+i))+Math.max(.05,8e3/n))/a)**(1/(A-1)),s=r.Geo.tangentFrame(e),c=s.east,l=s.north,u=r.space.planetCenter;this.anchor.set(u.x+e.x*n,u.y+e.y*n,u.z+e.z*n);let d=this.pos;d[0]=d[1]=d[2]=0;let f=a;for(let t=0;t<A;t++){let r=Math.sin(f),i=Math.cos(f);for(let a=0;a<j;a++){let o=(a+(t&1)*.5)/j*Math.PI*2,s=Math.cos(o)*r,u=Math.sin(o)*r,f=(1+t*j+a)*3;d[f]=n*(i*e.x+s*c.x+u*l.x-e.x),d[f+1]=n*(i*e.y+s*c.y+u*l.y-e.y),d[f+2]=n*(i*e.z+s*c.z+u*l.z-e.z)}f*=o}this.geo.attributes.position.needsUpdate=!0,this.geo.computeBoundingSphere(),this.anchorDir.copy(e),this.anchorAlt=i,this.uniforms.uRingQ.value=o-1}update(e){let t=this.ctx,n=t.space.planetCenter,r=t.space.origin,i=this._u.set(r.x-n.x,r.y-n.y,r.z-n.z),a=i.length();i.multiplyScalar(1/a);let o=Math.max(1.5,Math.abs(a-e)),s=this.anchorDir.x>1?1/0:this.anchorDir.angleTo(i)*e;(e!==this.radius||s>Math.max(15,o*.3)||o>this.anchorAlt*1.3||o<this.anchorAlt/1.3)&&(this.radius=e,this.rebuild(i,o,e));let c=this.uniforms;c.uCenterR.value.set(n.x-r.x,n.y-r.y,n.z-r.z);let l=e=>e-Math.floor(e/96)*96;return c.uCamMod.value.set(l(r.x-n.x),l(r.y-n.y),l(r.z-n.z)),a-e}dispose(){this.handle.remove(),this.scene.remove(this.mesh),this.geo.dispose(),this.mat.dispose()}},F=`
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`,I=`
${O}
uniform sampler2D tDepth;
varying vec2 vUv;
void main() { gl_FragColor = vec4(exoViewZ(texture2D(tDepth, vUv).r), 0.0, 0.0, 1.0); }`,L=`
uniform sampler2D tZ;
uniform vec2 uTan;
uniform vec3 uSigma;
uniform vec3 uInscat;
uniform float uMode;
uniform vec3 uUpV;       // "para cima" local em espaço de visão
uniform float uCamDepth; // m abaixo da superfície
varying vec2 vUv;
void main() {
  float z = texture2D(tZ, vUv).r;
  vec3 rv = vec3((vUv * 2.0 - 1.0) * uTan, -1.0);
  float len = length(rv);
  float d = min(z * len, 1e5);
  vec3 T = exp(-uSigma * d);
  // a distância de visibilidade também espalha (partículas em suspensão)
  T *= exp(-0.012 * d);
  if (uMode < 0.5) {
    // a luz do sol/céu chega ao ponto atravessando a água acima dele
    vec3 Tl = vec3(1.0);
    if (z < 1e11) {
      float pd = max(uCamDepth + dot(-rv / len, uUpV) * d, 0.0);
      Tl = exp(-uSigma * pd * 0.8);
      Tl = mix(Tl, vec3(dot(Tl, vec3(0.33))), 0.35);
    }
    gl_FragColor = vec4(T * Tl, 1.0);
  } else gl_FragColor = vec4(uInscat * (1.0 - T), 1.0);
}`;function R(e,t,n={}){return new i({uniforms:t,vertexShader:k,fragmentShader:e,depthTest:!1,depthWrite:!1,...n})}function z(r,i,a,o=s,c=n){let l=new e(r,i,{type:a,format:c,depthBuffer:!1,stencilBuffer:!1,minFilter:o,magFilter:o,colorSpace:t});return l.texture.generateMipmaps=!1,l}var B={name:`water`,order:12,async init(e){var t,n,i,o,s;let{renderer:c}=e;this.ctx=e;let l=((t=e.seed)==null||(n=t.hash)==null?void 0:n.call(t,`water`))??7;this.detail=E(l%1e3+3),this.waves=new D(l),this.ocean=new P(e,{detail:this.detail,waves:this.waves});let u=!!((i=(o=c.extensions).has)!=null&&i.call(o,`EXT_color_buffer_float`));this.sceneColor=z(1,1,r),this.sceneZ=z(1,1,u?S:r,a),this.quad=new v(null),this.mColor=R(F,{tSrc:{value:null}}),this.uZ={uDepthMode:{value:e.depthMode===`reversed`?0:e.depthMode===`log`?1:2},uNear:{value:e.camera.near},uFar:{value:e.camera.far},tDepth:{value:null}},this.mZ=R(I,this.uZ),this.uFog={tZ:{value:this.sceneZ.texture},uTan:{value:new f(1,1)},uSigma:{value:new d},uInscat:{value:new y},uMode:{value:0},uUpV:{value:new d(0,1,0)},uCamDepth:{value:0}};let p={blending:5,blendEquation:100,blendSrc:200,blendDst:202,blendSrcAlpha:200,blendDstAlpha:201},m={blending:5,blendEquation:100,blendSrc:201,blendDst:201,blendSrcAlpha:200,blendDstAlpha:201};this.mFogMul=R(L,this.uFog,p),this.mFogAdd=R(L,{...this.uFog,uMode:{value:1}},m),this.active=!1,this.seaRadius=0,this.camAlt=1e9,this.under=!1,this.planetOcean=null,this.searchIn=0,this.paletteKey=``,this.sigma=new d(.35,.06,.04),this.scatter=new y(.01,.1,.12),this.oriented=!1,this.frameCount=0,this.sunE=new y,this.inscat=new y,this._c=new y,this._qi=new C;let h=((s=e.shot)==null||(s=s.preset)==null?void 0:s.params)||{};this.seaStateOverride=typeof h.seaState==`number`?h.seaState:null,this.seaStateOverride!=null&&this.waves.setSeaState(this.seaStateOverride),this.removePass=e.pipeline.addPass(`afterWorld`,(e,t)=>this.render(t),{order:5,owner:`water`}),this.applyQuality(),this.offs=[e.bus.on(`quality:change`,()=>this.applyQuality()),e.bus.on(`planet:enter`,()=>this.paletteKey=``),e.bus.on(`service:ready`,({name:e})=>{e===`planet`&&(this.paletteKey=``)})],this.publish()},applyQuality(){let e=this.ctx.quality.level||`high`,t=this.ocean.uniforms;t.uSSR.value=e===`low`?0:1,t.uSSRSteps.value=e===`high`||e===`ultra`?20:10,t.uCaustics.value=e===`low`?0:1},publish(){let e=this,t=this.ctx,n={get active(){return e.active},get seaLevel(){var e;return((e=t.services.planet)==null?void 0:e.seaLevel)??null},get seaRadius(){return e.seaRadius},get underwater(){return e.under},get depth(){return-e.camAlt},heightAt(n){let r=t.space.planetCenter;return e.waves.heightAt(n.x-r.x,n.y-r.y,n.z-r.z,t.time.world)},isUnderwater(r){if(!e.active)return!1;let i=t.space.planetCenter;return Math.hypot(r.x-i.x,r.y-i.y,r.z-i.z)<e.seaRadius+n.heightAt(r)},setSeaState(t){e.seaStateOverride=h.clamp(t,0,1),e.waves.setSeaState(e.seaStateOverride)},get palette(){return{sigma:e.sigma.clone(),scatter:e.scatter.clone()}},get mesh(){return e.ocean.mesh}};this.api=t.provide(`water`,n)},updatePalette(e){var t;let n=e.palette||((t=e.biomeAt)==null||(t=t.call(e,V(this.ctx)))==null?void 0:t.palette),r=(n==null?void 0:n.water)||[.01,.13,.17],i=r.join(`,`)+((n==null?void 0:n.emissiveWater)||``);if(i===this.paletteKey)return;this.paletteKey=i;let a=Math.max(r[0],r[1],r[2],.001),o=r.map(e=>-Math.log(h.clamp(e/a,.04,.97))*.14+.012);this.sigma.set(o[0],o[1],o[2]),this.scatter.setRGB(r[0]*.9,r[1]*.9,r[2]*.9);let s=this.ocean.uniforms;s.uSigma.value.copy(this.sigma),s.uScatter.value.copy(this.scatter);let c=n==null?void 0:n.emissiveWater;s.uEmissive.value.setRGB((c==null?void 0:c[0])||0,(c==null?void 0:c[1])||0,(c==null?void 0:c[2])||0),this.uFog.uSigma.value.copy(this.sigma)},hidePlanetOcean(e){if(this.planetOcean&&this.planetOcean.parent){this.planetOcean.visible=!1;return}this.searchIn-->0||(this.searchIn=60,this.planetOcean=e.scene.getObjectByName(`planet:ocean`)||null,this.planetOcean&&(this.planetOcean.visible=!1))},frame(e,t){var n,r;let i=t.services.planet,a=i==null?void 0:i.seaLevel;if(this.active=!!i&&a!=null&&Number.isFinite(a)&&!!i.radius,this.ocean.mesh.visible=this.active,!this.active){this.under=!1;return}this.hidePlanetOcean(t);let o=i.radius+a;this.seaRadius=o,this.updatePalette(i);let s=t.space.origin,c=t.space.planetCenter;if(!this.oriented){let e=new d(s.x-c.x,s.y-c.y,s.z-c.z).normalize();this.waves.orient(t.Geo.tangentFrame(e)),this.oriented=!0}if(this.seaStateOverride==null){var l,u;let e=t.services.weather,n=(e==null||(l=e.wind)==null||(u=l.length)==null?void 0:u.call(l))??4,r=(e==null?void 0:e.weather)===`storm`?.4:0,i=h.clamp(.25+n*.03+r,0,1);Math.abs(i-this.waves.state)>.02&&this.waves.setSeaState(i)}let f=t.time.world,p=this.ocean.update(o),m=this.waves.heightAt(s.x-c.x,s.y-c.y,s.z-c.z,f);this.camAlt=p-m,this.under=this.camAlt<0;let g=this.ocean.uniforms;this.waves.updatePhases(s,c,f);for(let e=0;e<6;e++)g.uWaveDir.value[e].copy(this.waves.dirs[e]),g.uWave.value[e].set(this.waves.k[e],this.waves.amp[e],this.waves.omega[e],this.waves.Q[e]),g.uPhase0.value[e]=this.waves.phase0[e];w.forEach((e,t)=>{let n=e.v[0]*f/e.T%1,r=e.v[1]*f/e.T%1;g.uLayer.value[t].set(1/e.T,e.A,n,r)}),g.uTime.value=f%3600,g.uUnder.value=+!!this.under;let _=t.services.sky,v=_==null?void 0:_.sun;_!=null&&_.sunDirection&&g.uSunDir.value.copy(_.sunDirection),v?this.sunE.copy(v.color).multiplyScalar(v.intensity):this.sunE.setRGB(3,3,3),g.uSunE.value.copy(this.sunE);let y=(_==null?void 0:_.envMap)||t.scene.environment;this.ocean.setEnv(y&&y.mapping===306?y:null),g.uEnvGain.value=t.scene.environmentIntensity??1;let b=_==null||(n=_.fogAt)==null||(n=n.call(_,s))==null?void 0:n.color;if(b?g.uSkyFallback.value.copy(b):(r=i.palette)!=null&&r.sky&&g.uSkyFallback.value.setRGB(...i.palette.sky),this.under){var x;let e=_==null?void 0:_.ambient,n=this._c.set(.3,.4,.5);e!=null&&e.color&&n.copy(e.color).multiplyScalar((e.intensity??1)*.35);let r=(x=t.player)==null?void 0:x.up,i=r&&_!=null&&_.sunDirection?Math.max(0,_.sunDirection.dot(r)):.5,a=Math.max(0,-this.camAlt);this.inscat.copy(this.sunE).multiplyScalar(i*.08).add(n),this.inscat.multiply(this.scatter).multiplyScalar(2.2),this.inscat.r*=Math.exp(-this.sigma.x*a),this.inscat.g*=Math.exp(-this.sigma.y*a),this.inscat.b*=Math.exp(-this.sigma.z*a),this.uFog.uInscat.value.copy(this.inscat)}},render(e){if(!this.active)return;let t=this.ctx,n=t.renderer,r=t.camera,i=e.width,a=e.height;(this.sceneColor.width!==i||this.sceneColor.height!==a)&&(this.sceneColor.setSize(i,a),this.sceneZ.setSize(i,a));let o=n.autoClear;n.autoClear=!1,this.mColor.uniforms.tSrc.value=e.texture,this.quad.material=this.mColor,n.setRenderTarget(this.sceneColor),this.quad.render(n),this.uZ.tDepth.value=e.depthTexture,this.quad.material=this.mZ,n.setRenderTarget(this.sceneZ),this.quad.render(n);let s=this.ocean.uniforms;s.tSceneColor.value=this.sceneColor.texture,s.tSceneZ.value=this.sceneZ.texture,s.uHasScene.value=1,s.uRes.value.set(i,a),s.uProj.value.copy(r.projectionMatrix);let c=Math.tan(h.degToRad(r.fov*.5));if(s.uPixAngle.value=2*c/a,this.under){var l;this.uFog.uTan.value.set(c*r.aspect,c);let i=(l=t.player)==null?void 0:l.up;i&&this.uFog.uUpV.value.copy(i).applyQuaternion(this._qi.copy(r.quaternion).invert()),this.uFog.uCamDepth.value=Math.max(0,-this.camAlt),n.setRenderTarget(e),this.quad.material=this.mFogMul,this.quad.render(n),this.quad.material=this.mFogAdd,this.quad.render(n)}n.setRenderTarget(e),n.render(this.ocean.scene,r),n.autoClear=o},dispose(e){var t,n,r,i,a,o;for(let e of this.offs||[])e();(t=this.removePass)==null||t.call(this),(n=this.ocean)==null||n.dispose(),(r=this.detail)==null||r.dispose(),(i=this.sceneColor)==null||i.dispose(),(a=this.sceneZ)==null||a.dispose(),(o=this.quad)==null||o.dispose();for(let e of[this.mColor,this.mZ,this.mFogMul,this.mFogAdd])e==null||e.dispose();this.planetOcean&&(this.planetOcean.visible=!0)}};function V(e){var t;return((t=e.player)==null?void 0:t.up)||new d(0,1,0)}export{B as default};
//# sourceMappingURL=water-DcVgVVWN.js.map