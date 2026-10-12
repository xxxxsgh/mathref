import{B as e,D as t,G as n,H as r,M as i,St as a,U as o,V as s,W as c,Y as l,_t as u,b as d,ct as f,d as p,et as m,f as h,g,i as _,it as v,nt as y,st as b,vt as x,x as S,yt as C,z as w}from"./three-EnWzsccR.js";var T=[{T:48,A:.12,v:[.55,.2]},{T:12,A:.075,v:[-.32,.42]},{T:3,A:.022,v:[.24,-.18]},{T:.75,A:.005,v:[-.09,-.12]}];function E(e){return()=>{e|=0,e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function D(t=7){let n=E(t),r=[];for(let e=0;e<56;e++){let e,t,i;do e=Math.round((n()*2-1)*22),t=Math.round((n()*2-1)*22),i=Math.hypot(e,t);while(i<1.5);let a=(.55+.45*Math.abs(e/i))*i**-1.35*(.6+.8*n());r.push({kx:e,ky:t,k:i,a,ph:n()*Math.PI*2})}let a=new Float32Array(256*256),o=new Float32Array(256*256),s=new Float32Array(256*256),c=new Float32Array(256*256),l=Math.PI*2;for(let e of r){let t=l*e.kx,n=l*e.ky;for(let r=0;r<256;r++){let i=r/256;for(let l=0;l<256;l++){let u=l/256*t+n*i+e.ph,d=Math.sin(u),f=Math.cos(u),p=r*256+l;a[p]+=e.a*d,o[p]+=e.a*t*f,s[p]+=e.a*n*f,c[p]-=e.a*(t*t+n*n)*d}}}let u=0,f=0,p=0;for(let e=0;e<256*256;e++)u=Math.max(u,Math.abs(a[e])),f=Math.max(f,Math.abs(o[e]),Math.abs(s[e])),p=Math.max(p,Math.abs(c[e]));let m=new Uint16Array(256*256*4),h=S.toHalfFloat;for(let e=0;e<256*256;e++)m[e*4]=h(o[e]/u),m[e*4+1]=h(s[e]/u),m[e*4+2]=h(a[e]/u),m[e*4+3]=h(c[e]/p);let g=new d(m,256,256,y,i);return g.wrapS=g.wrapT=v,g.minFilter=e,g.magFilter=w,g.generateMipmaps=!0,g.anisotropy=4,g.colorSpace=``,g.needsUpdate=!0,g.name=`water:detail`,g.userData.gradScale=f/u,g}var O=class{constructor(e=1){this.rnd=E(e),this.dirs=[],this.k=new Float32Array(6),this.amp=new Float32Array(6),this.omega=new Float32Array(6),this.Q=new Float32Array(6),this.lambda=new Float32Array(6),this.phase0=new Float32Array(6),this.windAngle=this.rnd()*Math.PI*2,this.spread=[];for(let e=0;e<6;e++)this.dirs.push(new x(1,0,0)),this.spread.push((this.rnd()*2-1)*(.25+e*.12));this.state=.5,this.setSeaState(.5)}setSeaState(e){this.state=e;let t=[26,16.5,10.5,6.8,4.3,2.9];for(let n=0;n<6;n++){let r=t[n]*(.75+.6*e);this.lambda[n]=r;let i=Math.PI*2/r;this.k[n]=i,this.amp[n]=r*(.004+.011*e)*(n===0?1.2:1),this.omega[n]=Math.sqrt(9.81*i),this.Q[n]=Math.min(1,(.55+.25*e)/(i*this.amp[n]*6))}}orient(e){for(let t=0;t<6;t++){let n=this.windAngle+this.spread[t];this.dirs[t].set(0,0,0).addScaledVector(e.east,Math.cos(n)).addScaledVector(e.north,Math.sin(n)).normalize()}}updatePhases(e,t,n){let r=Math.PI*2,i=e.x-t.x,a=e.y-t.y,o=e.z-t.z;for(let e=0;e<6;e++){let t=this.dirs[e],s=this.k[e]*(t.x*i+t.y*a+t.z*o)-this.omega[e]*n;s-=Math.floor(s/r)*r,this.phase0[e]=s}}heightAt(e,t,n,r){let i=0;for(let a=0;a<6;a++){let o=this.dirs[a],s=this.k[a]*(o.x*e+o.y*t+o.z*n)-this.omega[a]*r;i+=this.amp[a]*Math.sin(s)}return i}},k=`
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
`,A=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,j=96,M=144,N=`
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
}`,P=`
#include <common>
#include <logdepthbuf_pars_fragment>
#include <cube_uv_reflection_fragment>
${k}
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
uniform vec3 uFogInscat;      // luz espalhada na água à profundidade da câmera
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
    // reflexão interna total: a própria água (mesma luz da névoa submersa)
    col += uFogInscat * fr;
    // névoa da coluna d'água até a superfície (igual à passada de névoa)
    vec3 tr = exp(-(uSigma + 0.012) * min(dist, 1e5));
    col = col * tr + uFogInscat * (1.0 - tr);
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
    float h1, h2, lc;
    detailGrad(bpL * 1.3 + vec3(uTime * 0.11, 0.0, uTime * 0.07), up, bw, uLayer[2], h1, lc);
    detailGrad(bpL * 1.9 - vec3(uTime * 0.05, uTime * 0.04, 0.0), up, bw, uLayer[2], h2, lc);
    float focus = pow(min(1.0 - abs(h1), 1.0 - abs(h2)), 9.0);
    float cz = rThick * max(dot(V, up), 0.05);
    float caus = focus * 3.0 * smoothstep(0.05, 0.6, cz) * exp(-cz * 0.18);
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
  // superfície rugosa (longe) ainda reflete muito em ângulo rasante: só
  // amacia um pouco o Fresnel médio (micro-facetas inclinadas para a câmera)
  F = mix(F, max(F * 0.8, 0.05), smoothstep(0.1, 0.4, rough));

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
  float edge = 1.0 - smoothstep(0.03, 0.38 + foamN * 0.12, depthV);
  float shore = 1.0 - smoothstep(0.0, 2.2, depthV + foamN * 0.4);
  float bands = 0.5 + 0.5 * sin(depthV * 6.0 - uTime * 1.4 + foamN * 5.0);
  float fShore = max(edge * (0.7 + 0.3 * lace), shore * smoothstep(0.25, 0.9, bands) * lace);
  // cristas: onde a superfície se comprime (jacobiano baixo)
  float fCrest = smoothstep(0.62, 0.35, jac) * lace;
  float foam = clamp((fShore + fCrest * 0.7) * uFoamAmt, 0.0, 1.0);
  foam *= 1.0 - smoothstep(300.0, 2000.0, dist);
  vec3 foamCol = vec3(0.82) * (uSunE * sunUp * max(dot(up, L), 0.0) / PI + ambUp * 0.9);
  col = mix(col, foamCol, foam);

  gl_FragColor = vec4(col, 1.0);
}`,F=class{constructor(e,{detail:t,waves:r}){this.ctx=e,this.waves=r,this.pos=new Float32Array(13825*3);let i=[];for(let e=0;e<M;e++)i.push(0,1+e,1+(e+1)%M);for(let e=0;e<j-1;e++)for(let t=0;t<M;t++){let n=1+e*M+t,r=1+e*M+(t+1)%M;i.push(n,n+M,r,r,n+M,r+M)}let a=new h;a.setAttribute(`position`,new p(this.pos,3)),a.setIndex(i),this.geo=a,this.uniforms={uDepthMode:{value:e.depthMode===`reversed`?0:e.depthMode===`log`?1:2},uNear:{value:e.camera.near},uFar:{value:e.camera.far},uWaveDir:{value:Array.from({length:6},()=>new x(1,0,0))},uWave:{value:Array.from({length:6},()=>new C)},uPhase0:{value:new Float32Array(6)},uRingQ:{value:.1},uCenterR:{value:new x},tDetail:{value:t},uLayer:{value:T.map(()=>new C)},uCamMod:{value:new x},uGradScale:{value:t.userData.gradScale||1},tSceneColor:{value:null},tSceneZ:{value:null},uHasScene:{value:0},uRes:{value:new u(1,1)},uProj:{value:new c},uPixAngle:{value:.001},uSunDir:{value:new x(0,1,0)},uSunE:{value:new g(3,3,3)},uSkyFallback:{value:new g(.3,.5,.9)},envMap:{value:null},uHasEnv:{value:0},uEnvGain:{value:1},uSigma:{value:new x(.35,.06,.04)},uScatter:{value:new g(.01,.1,.12)},uEmissive:{value:new g(0,0,0)},uTime:{value:0},uSSR:{value:1},uSSRSteps:{value:20},uUnder:{value:0},uFogInscat:{value:new g},uFoamAmt:{value:1},uCaustics:{value:1}},this.mat=new f({name:`water:ocean`,uniforms:this.uniforms,vertexShader:N,fragmentShader:P,side:2,depthWrite:!0,depthTest:!0}),this.envHeight=0,this.mesh=new n(a,this.mat),this.mesh.name=`water:ocean`,this.mesh.frustumCulled=!1,this.scene=new b,this.scene.add(this.mesh),this.anchor=new e.WorldPos,this.handle=e.space.registerFloating(this.mesh,this.anchor),this.anchorDir=new x(2,0,0),this.anchorAlt=-1,this.radius=0,this._u=new x}setEnv(e){var t;let n=this.uniforms;if(!e){n.uHasEnv.value=0;return}let r=((t=e.image)==null?void 0:t.height)||0;if(n.envMap.value=e,n.uHasEnv.value=+!!r,r&&r!==this.envHeight){this.envHeight=r;let e=Math.log2(r)-2,t=1/r,n=1/(3*Math.max(2**e,112));this.mat.defines={ENVMAP_TYPE_CUBE_UV:``,CUBEUV_TEXEL_WIDTH:n,CUBEUV_TEXEL_HEIGHT:t,CUBEUV_MAX_MIP:`${e}.0`},this.mat.needsUpdate=!0}}rebuild(e,t,n){let r=this.ctx,i=Math.max(1.5,t),a=Math.max(.35,i*.01)/n,o=(Math.min(Math.PI*.95,Math.acos(n/(n+i))+Math.max(.05,8e3/n))/a)**(1/(j-1)),s=r.Geo.tangentFrame(e),c=s.east,l=s.north,u=r.space.planetCenter;this.anchor.set(u.x+e.x*n,u.y+e.y*n,u.z+e.z*n);let d=this.pos;d[0]=d[1]=d[2]=0;let f=a;for(let t=0;t<j;t++){let r=Math.sin(f),i=Math.cos(f);for(let a=0;a<M;a++){let o=(a+(t&1)*.5)/M*Math.PI*2,s=Math.cos(o)*r,u=Math.sin(o)*r,f=(1+t*M+a)*3;d[f]=n*(i*e.x+s*c.x+u*l.x-e.x),d[f+1]=n*(i*e.y+s*c.y+u*l.y-e.y),d[f+2]=n*(i*e.z+s*c.z+u*l.z-e.z)}f*=o}this.geo.attributes.position.needsUpdate=!0,this.geo.computeBoundingSphere(),this.anchorDir.copy(e),this.anchorAlt=i,this.uniforms.uRingQ.value=o-1}update(e){let t=this.ctx,n=t.space.planetCenter,r=t.space.origin,i=this._u.set(r.x-n.x,r.y-n.y,r.z-n.z),a=i.length();i.multiplyScalar(1/a);let o=Math.max(1.5,Math.abs(a-e)),s=this.anchorDir.x>1?1/0:this.anchorDir.angleTo(i)*e;(e!==this.radius||s>Math.max(15,o*.3)||o>this.anchorAlt*1.3||o<this.anchorAlt/1.3)&&(this.radius=e,this.rebuild(i,o,e));let c=this.uniforms;c.uCenterR.value.set(n.x-r.x,n.y-r.y,n.z-r.z);let l=e=>e-Math.floor(e/96)*96;return c.uCamMod.value.set(l(r.x-n.x),l(r.y-n.y),l(r.z-n.z)),a-e}dispose(){this.handle.remove(),this.scene.remove(this.mesh),this.geo.dispose(),this.mat.dispose()}},I=`
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`,L=`
${k}
uniform sampler2D tDepth;
varying vec2 vUv;
void main() { gl_FragColor = vec4(exoViewZ(texture2D(tDepth, vUv).r), 0.0, 0.0, 1.0); }`,R=`
uniform sampler2D tZ;
uniform vec2 uTan;
uniform vec3 uSigma;
uniform vec3 uInscat;
uniform float uMode;
uniform vec3 uUpV;       // "para cima" local em espaço de visão
uniform float uCamDepth; // m abaixo da superfície
uniform sampler2D tDetail;
uniform vec4 uL1, uL2;   // camadas de ondulação (1/T, A, rolagem)
uniform vec3 uCamMod;    // câmera mod período (double na CPU)
uniform mat3 uCamRot;    // visão → mundo
uniform vec3 uUpW;
uniform float uTime;
uniform float uCaus;     // força das cáusticas (sol)
varying vec2 vUv;
float hTri(vec3 p, vec3 bw, vec4 L) {
  float l = 0.0;
  if (bw.x > 0.02) l += texture2D(tDetail, p.zy * L.x + L.zw).z * bw.x;
  if (bw.y > 0.02) l += texture2D(tDetail, p.xz * L.x + L.zw).z * bw.y;
  if (bw.z > 0.02) l += texture2D(tDetail, p.xy * L.x + L.zw).z * bw.z;
  return l;
}
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
      // cáusticas no leito: luz focada pelas ondulações da superfície
      if (uCaus > 0.0 && d < 90.0) {
        vec3 p = uCamRot * (rv / len) * d + uCamMod;
        vec3 bw = pow(abs(uUpW), vec3(6.0));
        bw /= (bw.x + bw.y + bw.z);
        // rede de cáusticas: cruzamentos de zero de duas alturas que rolam
        // em direções diferentes (linhas finas que se cruzam)
        float r1 = 1.0 - abs(hTri(p * 1.3 + vec3(uTime * 0.11, 0.0, uTime * 0.07), bw, uL2));
        float r2 = 1.0 - abs(hTri(p * 1.9 - vec3(uTime * 0.05, uTime * 0.04, 0.0), bw, uL2));
        float c = pow(min(r1, r2), 9.0) * 3.0 * exp(-pd * 0.08) * (1.0 - smoothstep(30.0, 90.0, d));
        Tl *= 1.0 + c * uCaus;
      }
    }
    gl_FragColor = vec4(T * Tl, 1.0);
  } else gl_FragColor = vec4(uInscat * (1.0 - T), 1.0);
}`;function z(e,t,n={}){return new f({uniforms:t,vertexShader:A,fragmentShader:e,depthTest:!1,depthWrite:!1,...n})}function B(e,t,n,r=w,i=y){let o=new a(e,t,{type:n,format:i,depthBuffer:!1,stencilBuffer:!1,minFilter:r,magFilter:r,colorSpace:s});return o.texture.generateMipmaps=!1,o}var V={name:`water`,order:12,async init(e){var n,r,a,s,d;let{renderer:f}=e;this.ctx=e;let p=((n=e.seed)==null||(r=n.hash)==null?void 0:r.call(n,`water`))??7;this.detail=D(p%1e3+3),this.waves=new O(p),this.ocean=new F(e,{detail:this.detail,waves:this.waves});let h=!!((a=(s=f.extensions).has)!=null&&a.call(s,`EXT_color_buffer_float`));this.sceneColor=B(1,1,i),this.sceneZ=B(1,1,h?t:i,l),this.quad=new _(null),this.mColor=z(I,{tSrc:{value:null}}),this.uZ={uDepthMode:{value:e.depthMode===`reversed`?0:e.depthMode===`log`?1:2},uNear:{value:e.camera.near},uFar:{value:e.camera.far},tDepth:{value:null}},this.mZ=z(L,this.uZ),this.uFog={tZ:{value:this.sceneZ.texture},uTan:{value:new u(1,1)},uSigma:{value:new x},uInscat:{value:new g},uMode:{value:0},uUpV:{value:new x(0,1,0)},uCamDepth:{value:0},tDetail:{value:this.detail},uL1:{value:new C},uL2:{value:new C},uCamMod:{value:new x},uCamRot:{value:new o},uUpW:{value:new x(0,1,0)},uTime:{value:0},uCaus:{value:0}};let v={blending:5,blendEquation:100,blendSrc:200,blendDst:202,blendSrcAlpha:200,blendDstAlpha:201},y={blending:5,blendEquation:100,blendSrc:201,blendDst:201,blendSrcAlpha:200,blendDstAlpha:201};this.mFogMul=z(R,this.uFog,v),this.mFogAdd=z(R,{...this.uFog,uMode:{value:1}},y),this.active=!1,this.seaRadius=0,this.camAlt=1e9,this.under=!1,this.planetOcean=null,this.searchIn=0,this.paletteKey=``,this.sigma=new x(.35,.06,.04),this.scatter=new g(.01,.1,.12),this.oriented=!1,this.frameCount=0,this.sunE=new g,this.inscat=new g,this._c=new g,this._qi=new m,this._m4=new c;let b=((d=e.shot)==null||(d=d.preset)==null?void 0:d.params)||{};this.seaStateOverride=typeof b.seaState==`number`?b.seaState:null,this.seaStateOverride!=null&&this.waves.setSeaState(this.seaStateOverride),this.removePass=e.pipeline.addPass(`afterWorld`,(e,t)=>this.render(t),{order:5,owner:`water`}),this.applyQuality(),this.offs=[e.bus.on(`quality:change`,()=>this.applyQuality()),e.bus.on(`planet:enter`,()=>this.paletteKey=``),e.bus.on(`service:ready`,({name:e})=>{e===`planet`&&(this.paletteKey=``)})],this.publish()},applyQuality(){let e=this.ctx.quality.level||`high`,t=this.ocean.uniforms;t.uSSR.value=e===`low`?0:1,t.uSSRSteps.value=e===`high`||e===`ultra`?20:10,t.uCaustics.value=e===`low`?0:1},publish(){let e=this,t=this.ctx,n={get active(){return e.active},get seaLevel(){var e;return((e=t.services.planet)==null?void 0:e.seaLevel)??null},get seaRadius(){return e.seaRadius},get underwater(){return e.under},get depth(){return-e.camAlt},heightAt(n){let r=t.space.planetCenter;return e.waves.heightAt(n.x-r.x,n.y-r.y,n.z-r.z,t.time.world)},isUnderwater(r){if(!e.active)return!1;let i=t.space.planetCenter;return Math.hypot(r.x-i.x,r.y-i.y,r.z-i.z)<e.seaRadius+n.heightAt(r)},setSeaState(t){e.seaStateOverride=r.clamp(t,0,1),e.waves.setSeaState(e.seaStateOverride)},get palette(){return{sigma:e.sigma.clone(),scatter:e.scatter.clone()}},get mesh(){return e.ocean.mesh}};this.api=t.provide(`water`,n)},updatePalette(e){var t;let n=e.palette||((t=e.biomeAt)==null||(t=t.call(e,H(this.ctx)))==null?void 0:t.palette),i=(n==null?void 0:n.water)||[.01,.13,.17],a=i.join(`,`)+((n==null?void 0:n.emissiveWater)||``);if(a===this.paletteKey)return;this.paletteKey=a;let o=Math.max(i[0],i[1],i[2],.001),s=i.map(e=>-Math.log(r.clamp(e/o,.04,.97))*.14+.012);this.sigma.set(s[0],s[1],s[2]),this.scatter.setRGB(i[0]*.9,i[1]*.9,i[2]*.9);let c=this.ocean.uniforms;c.uSigma.value.copy(this.sigma),c.uScatter.value.copy(this.scatter);let l=n==null?void 0:n.emissiveWater;c.uEmissive.value.setRGB((l==null?void 0:l[0])||0,(l==null?void 0:l[1])||0,(l==null?void 0:l[2])||0),this.uFog.uSigma.value.copy(this.sigma)},hidePlanetOcean(e){if(this.planetOcean&&this.planetOcean.parent){this.planetOcean.visible=!1;return}this.searchIn-->0||(this.searchIn=60,this.planetOcean=e.scene.getObjectByName(`planet:ocean`)||null,this.planetOcean&&(this.planetOcean.visible=!1))},frame(e,t){var n,i;let a=t.services.planet,o=a==null?void 0:a.seaLevel;if(this.active=!!a&&o!=null&&Number.isFinite(o)&&!!a.radius,this.ocean.mesh.visible=this.active,!this.active){this.under=!1;return}this.hidePlanetOcean(t);let s=a.radius+o;this.seaRadius=s,this.updatePalette(a);let c=t.space.origin,l=t.space.planetCenter;if(!this.oriented){let e=new x(c.x-l.x,c.y-l.y,c.z-l.z).normalize();this.waves.orient(t.Geo.tangentFrame(e)),this.oriented=!0}if(this.seaStateOverride==null){var u,d;let e=t.services.weather,n=(e==null||(u=e.wind)==null||(d=u.length)==null?void 0:d.call(u))??4,i=(e==null?void 0:e.weather)===`storm`?.4:0,a=r.clamp(.25+n*.03+i,0,1);Math.abs(a-this.waves.state)>.02&&this.waves.setSeaState(a)}let f=t.time.world,p=this.ocean.update(s),m=this.waves.heightAt(c.x-l.x,c.y-l.y,c.z-l.z,f);this.camAlt=p-m,this.under=this.camAlt<0;let h=this.ocean.uniforms;this.waves.updatePhases(c,l,f);for(let e=0;e<6;e++)h.uWaveDir.value[e].copy(this.waves.dirs[e]),h.uWave.value[e].set(this.waves.k[e],this.waves.amp[e],this.waves.omega[e],this.waves.Q[e]),h.uPhase0.value[e]=this.waves.phase0[e];T.forEach((e,t)=>{let n=e.v[0]*f/e.T%1,r=e.v[1]*f/e.T%1;h.uLayer.value[t].set(1/e.T,e.A,n,r)}),h.uTime.value=f%3600,h.uUnder.value=+!!this.under;let g=t.services.sky,_=g==null?void 0:g.sun;g!=null&&g.sunDirection&&h.uSunDir.value.copy(g.sunDirection),_?this.sunE.copy(_.color).multiplyScalar(_.intensity):this.sunE.setRGB(3,3,3),h.uSunE.value.copy(this.sunE);let v=(g==null?void 0:g.envMap)||t.scene.environment;this.ocean.setEnv(v&&v.mapping===306?v:null),h.uEnvGain.value=t.scene.environmentIntensity??1;let y=g==null||(n=g.fogAt)==null||(n=n.call(g,c))==null?void 0:n.color;if(y?h.uSkyFallback.value.copy(y):(i=a.palette)!=null&&i.sky&&h.uSkyFallback.value.setRGB(...a.palette.sky),this.under){var b;let e=g==null?void 0:g.ambient,n=this._c.set(.3,.4,.5);e!=null&&e.color&&n.copy(e.color).multiplyScalar((e.intensity??1)*.35);let r=(b=t.player)==null?void 0:b.up,i=r&&g!=null&&g.sunDirection?Math.max(0,g.sunDirection.dot(r)):.5,a=Math.max(0,-this.camAlt);this.inscat.copy(this.sunE).multiplyScalar(i*.08).add(n),this.inscat.multiply(this.scatter).multiplyScalar(2.2),this.inscat.r*=Math.exp(-this.sigma.x*a),this.inscat.g*=Math.exp(-this.sigma.y*a),this.inscat.b*=Math.exp(-this.sigma.z*a),this.uFog.uInscat.value.copy(this.inscat),h.uFogInscat.value.copy(this.inscat)}},render(e){if(!this.active)return;let t=this.ctx,n=t.renderer,i=t.camera,a=e.width,o=e.height;(this.sceneColor.width!==a||this.sceneColor.height!==o)&&(this.sceneColor.setSize(a,o),this.sceneZ.setSize(a,o));let s=n.autoClear;n.autoClear=!1,this.mColor.uniforms.tSrc.value=e.texture,this.quad.material=this.mColor,n.setRenderTarget(this.sceneColor),this.quad.render(n),this.uZ.tDepth.value=e.depthTexture,this.quad.material=this.mZ,n.setRenderTarget(this.sceneZ),this.quad.render(n);let c=this.ocean.uniforms;c.tSceneColor.value=this.sceneColor.texture,c.tSceneZ.value=this.sceneZ.texture,c.uHasScene.value=1,c.uRes.value.set(a,o),c.uProj.value.copy(i.projectionMatrix);let l=Math.tan(r.degToRad(i.fov*.5));if(c.uPixAngle.value=2*l/o,this.under){var u;this.uFog.uTan.value.set(l*i.aspect,l);let a=(u=t.player)==null?void 0:u.up;a&&this.uFog.uUpV.value.copy(a).applyQuaternion(this._qi.copy(i.quaternion).invert()),this.uFog.uCamDepth.value=Math.max(0,-this.camAlt);let o=this.ocean.uniforms;this.uFog.uL1.value.copy(o.uLayer.value[1]),this.uFog.uL2.value.copy(o.uLayer.value[2]),this.uFog.uCamMod.value.copy(o.uCamMod.value),this.uFog.uCamRot.value.setFromMatrix4(this._m4.makeRotationFromQuaternion(i.quaternion)),a&&this.uFog.uUpW.value.copy(a),this.uFog.uTime.value=o.uTime.value;let s=t.services.sky,c=a&&s!=null&&s.sunDirection?Math.max(0,s.sunDirection.dot(a)):.5;this.uFog.uCaus.value=this.ocean.uniforms.uCaustics.value*r.smoothstep(c,0,.3)*1.3,n.setRenderTarget(e),this.quad.material=this.mFogMul,this.quad.render(n),this.quad.material=this.mFogAdd,this.quad.render(n)}n.setRenderTarget(e),n.render(this.ocean.scene,i),n.autoClear=s},dispose(e){var t,n,r,i,a,o;for(let e of this.offs||[])e();(t=this.removePass)==null||t.call(this),(n=this.ocean)==null||n.dispose(),(r=this.detail)==null||r.dispose(),(i=this.sceneColor)==null||i.dispose(),(a=this.sceneZ)==null||a.dispose(),(o=this.quad)==null||o.dispose();for(let e of[this.mColor,this.mZ,this.mFogMul,this.mFogAdd])e==null||e.dispose();this.planetOcean&&(this.planetOcean.visible=!0)}};function H(e){var t;return((t=e.player)==null?void 0:t.up)||new x(0,1,0)}export{V as default};
//# sourceMappingURL=water-DLIT0jlg.js.map