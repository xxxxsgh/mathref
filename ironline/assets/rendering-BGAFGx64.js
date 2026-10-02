import{D as e,E as t,Et as n,F as r,K as i,L as a,M as o,N as s,O as c,Ot as l,S as u,T as d,W as f,X as p,Y as m,Z as h,b as g,c as _,ct as v,dt as y,g as b,gt as x,h as S,ht as C,jt as w,kt as T,m as E,o as D,q as O,rt as k,s as A,tt as j,ut as M,x as N,xt as P}from"./three-x7LA3FKe.js";var F=`
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,I=new S;I.setAttribute(`position`,new o([-1,-1,0,3,-1,0,-1,3,0],3));var L=new k(-1,1,1,-1,0,1),R=class{constructor(e){this.mesh=new p(I,e),this.mesh.frustumCulled=!1}get material(){return this.mesh.material}set material(e){this.mesh.material=e}render(e,t,n=!1){e.setRenderTarget(t),n&&e.clear(),e.render(this.mesh,L)}dispose(){this.mesh.material.dispose()}};function z(e,t,n={},i={}){return new y({name:`ironline-${e}`,glslVersion:r,uniforms:n,defines:i,vertexShader:F,fragmentShader:`precision highp float;\nprecision highp sampler2D;\nprecision highp sampler2DShadow;\n${t}`,depthTest:!1,depthWrite:!1,blending:0})}function B(e,t,{type:n=a,filter:r=f,format:i=M}={}){let o=new w(Math.max(1,e),Math.max(1,t),{type:n,format:i,minFilter:r,magFilter:r,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1,wrapS:g,wrapT:g});return o.texture.colorSpace=``,o}var V=6360,H=6460,U=[.005802,.013558,.0331],W=.0044,G=[65e-5,.001881,85e-6],K=8,q=1.2,J=`
const float RG = 6360.0;
const float RT = 6460.0;
const vec3 BETA_R = vec3(5.802e-3, 13.558e-3, 33.1e-3);
const float BETA_M = 3.996e-3;
const float BETA_M_EXT = 4.4e-3;
const vec3 BETA_O = vec3(0.65e-3, 1.881e-3, 0.085e-3);
const float HR = 8.0;
const float HM = 1.2;
const float PI_A = 3.14159265;

float raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  d = sqrt(d);
  float t1 = -b - d;
  float t2 = -b + d;
  if (t1 > 0.0) return t1;
  if (t2 > 0.0) return t2;
  return -1.0;
}
// densidades (rayleigh, mie, ozônio) na altitude h (km)
vec3 atmoDensity(float h, float haze) {
  return vec3(exp(-h / HR), exp(-h / HM) * haze, max(0.0, 1.0 - abs(h - 25.0) / 15.0));
}
vec3 extinctionOf(vec3 d) {
  return BETA_R * d.x + BETA_M_EXT * d.y + BETA_O * d.z;
}
// Mapeamento do sky-view LUT: u = azimute relativo ao sol [0, π], v = elevação
// com mais resolução perto do horizonte.
vec2 skyLutUv(vec3 dir, vec3 sunDir) {
  float elev = asin(clamp(dir.y, -1.0, 1.0));
  float l = elev / (PI_A * 0.5);
  float v = 0.5 + 0.5 * sign(l) * sqrt(abs(l));
  vec2 a = dir.xz; vec2 s = sunDir.xz;
  float la = length(a), ls = length(s);
  float cphi = (la > 1e-4 && ls > 1e-4) ? dot(a / la, s / ls) : 1.0;
  float u = acos(clamp(cphi, -1.0, 1.0)) / PI_A;
  return vec2(u, v);
}
`,ee=`
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec3 uSunDir;
uniform float uHaze;
uniform float uAltitude;
uniform vec3 uGroundAlbedo;
${J}

vec3 transmittanceToTop(vec3 p, vec3 s, float haze) {
  if (raySphere(p, s, RG) > 0.0 && dot(p, s) < 0.0) {
    // o planeta bloqueia o sol (atrás do horizonte), com transição suave
    float hor = dot(normalize(p), s);
    if (hor < -0.03) return vec3(0.0);
  }
  float tMax = raySphere(p, s, RT);
  const int N = 10;
  float dt = tMax / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 q = p + s * (float(i) + 0.5) * dt;
    od += atmoDensity(length(q) - RG, haze) * dt;
  }
  return exp(-extinctionOf(od));
}

void main() {
  float u = vUv.x, v = vUv.y;
  float l = (v - 0.5) * 2.0;
  float elev = sign(l) * l * l * PI_A * 0.5;
  float phi = u * PI_A;
  vec3 s = normalize(uSunDir);
  float sAz = atan(s.z, s.x);
  float az = sAz + phi;
  vec3 rd = vec3(cos(elev) * cos(az), sin(elev), cos(elev) * sin(az));
  vec3 ro = vec3(0.0, RG + uAltitude, 0.0);

  float tGround = raySphere(ro, rd, RG);
  float tTop = raySphere(ro, rd, RT);
  bool hitGround = tGround > 0.0;
  float tMax = hitGround ? tGround : tTop;
  tMax = min(tMax, 400.0);

  float mu = dot(rd, s);
  float phaseR = 3.0 / (16.0 * PI_A) * (1.0 + mu * mu);
  float g = 0.8;
  float g2 = g * g;
  float phaseM = 3.0 / (8.0 * PI_A) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));

  const int N = 32;
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  float tPrev = 0.0;
  for (int i = 0; i < N; i++) {
    // distribuição quadrática: mais passos perto do observador
    float f = (float(i) + 0.5) / float(N);
    float t = tMax * f * f;
    float dt = t - tPrev;
    tPrev = t;
    vec3 p = ro + rd * t;
    float h = length(p) - RG;
    vec3 d = atmoDensity(h, uHaze);
    vec3 ext = extinctionOf(d);
    vec3 Ts = transmittanceToTop(p, s, uHaze);
    vec3 scatR = BETA_R * d.x;
    vec3 scatM = vec3(BETA_M * d.y);
    // espalhamento simples + termo isotrópico aproximando o múltiplo
    vec3 ms = (scatR + scatM) * (0.06 + 0.25 * max(s.y + 0.1, 0.0));
    vec3 S = Ts * (scatR * phaseR + scatM * phaseM) + ms * (0.4 + 0.6 * Ts);
    vec3 Tstep = exp(-ext * dt);
    // integração analítica por segmento (energia conservada)
    L += T * (S - S * Tstep) / max(ext, vec3(1e-7));
    T *= Tstep;
  }
  if (hitGround) {
    vec3 p = ro + rd * tGround;
    vec3 n = normalize(p);
    vec3 Ts = transmittanceToTop(p, s, uHaze);
    vec3 irr = Ts * max(dot(n, s), 0.0) + vec3(0.08, 0.1, 0.13) * max(s.y + 0.15, 0.0);
    L += T * uGroundAlbedo * irr / PI_A;
  }
  outColor = vec4(L, 1.0);
}
`;function te(e,t){return new x({name:t?`ironline-sky-env`:`ironline-sky`,uniforms:e,defines:t?{ENV_MODE:1}:{},side:1,depthWrite:!1,depthTest:!1,fog:!1,toneMapped:!0,vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w; // sempre no plano distante
      }`,fragmentShader:`
      varying vec3 vDir;
      uniform sampler2D uLut;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;     // transmitância até o sol × intensidade
      uniform float uSkyScale;
      uniform float uSunDisk;
      uniform float uSkySat;
      uniform float uTime;
      uniform float uCloudCover;
      uniform float uCloudDensity;
      uniform vec2 uCloudWind;
      ${J}

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p, int oct) {
        float s = 0.0, a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 6; i++) {
          if (i >= oct) break;
          s += a * vnoise(p);
          p = m * p;
          a *= 0.5;
        }
        return s;
      }
      // densidade de nuvem num ponto do plano das nuvens (km)
      float cloudDensity(vec2 p, int oct) {
        vec2 q = p * 0.42 + uCloudWind * uTime;
        vec2 w = vec2(fbm(q * 0.7 + 3.1, 3), fbm(q * 0.7 - 1.7, 3));
        float raw = fbm(q + w * 0.9, oct) * 0.75 + vnoise(q * 0.35 + 7.0) * 0.35;
        // normaliza (fbm tem pouca variância) para cobertura previsível
        float base = clamp((raw - 0.53) * 2.8 + 0.5, 0.0, 1.0);
        // erosão de detalhe nas bordas (aspecto de cúmulo)
        if (oct > 3) base -= (fbm(q * 3.3 + 11.0, 3) - 0.47) * 0.42 * (1.0 - base);
        float cov = 1.0 - uCloudCover;
        // borda larga e macia (sem contorno "recortado") + miolo mais denso
        return smoothstep(cov - 0.03, cov + 0.3, base) * (0.5 + 0.5 * smoothstep(cov + 0.05, cov + 0.5, base));
      }

      void main() {
        vec3 dir = normalize(vDir);
        vec3 s = normalize(uSunDir);
        vec3 sky = texture2D(uLut, skyLutUv(dir, s)).rgb * uSkyScale;
        #ifndef ENV_MODE
        // saturação artística do domo (o LUT puro fica para névoa/IBL)
        float sl = dot(sky, vec3(0.2126, 0.7152, 0.0722));
        sky = max(mix(vec3(sl), sky, uSkySat), 0.0);
        #endif
        vec3 col = sky;

        // ── nuvens: plano a ~1.6 km, iluminação com espalhamento direcional ──
        if (dir.y > 0.0 && uCloudCover > 0.001) {
          float t = 2.4 / max(dir.y, 0.03);
          vec2 p = dir.xz * t;
          #ifdef ENV_MODE
          float d = cloudDensity(p, 3);
          #else
          float d = cloudDensity(p, 5);
          #endif
          if (d > 0.001) {
            // auto-sombreamento: duas amostras rumo ao sol (Beer) + termo de
            // espalhamento múltiplo (Beer "achatado") — miolo escuro, bordas
            // e topo voltados ao sol com contorno prateado
            vec2 toSun = normalize(s.xz + 1e-4);
            float ds1 = cloudDensity(p + toSun * 0.18, 3);
            float ds2 = cloudDensity(p + toSun * 0.55, 3);
            float od = (ds1 * 0.65 + ds2 * 0.35 + d * 0.3) * 4.2 * uCloudDensity;
            float light = max(exp(-od), exp(-od * 0.22) * 0.45);
            float powder = 1.0 - exp(-d * uCloudDensity * 3.0);
            float mu = dot(dir, s);
            float hgF = (1.0 - 0.36) / pow(1.36 - 1.2 * mu, 1.5) / (4.0 * PI_A);
            float hgB = (1.0 - 0.04) / pow(1.04 + 0.4 * mu, 1.5) / (4.0 * PI_A);
            float phase = hgF * 0.75 + hgB * 0.25;
            vec3 zen = texture2D(uLut, skyLutUv(vec3(0.0, 1.0, 0.0), s)).rgb * uSkyScale;
            vec3 hor = texture2D(uLut, skyLutUv(normalize(vec3(dir.x, 0.05, dir.z)), s)).rgb * uSkyScale;
            vec3 amb = mix(hor, zen, 0.55) * (0.62 + 0.38 * (1.0 - d));
            vec3 lit = uSunColor * light * mix(1.0, powder, 0.55) * (0.16 + phase * 2.6) + amb * (0.55 + 0.45 * light);
            float alpha = 1.0 - exp(-d * uCloudDensity * 4.5);
            // perspectiva aérea: nuvens longe somem no céu do horizonte
            float fade = smoothstep(0.0, 0.2, dir.y);
            lit = mix(hor, lit, smoothstep(0.0, 0.35, dir.y) * 0.6 + 0.4);
            col = mix(col, lit, alpha * fade);
          }
        }

        #ifndef ENV_MODE
        // ── disco solar com escurecimento de borda ──
        float cosA = dot(dir, s);
        float sunR = 0.0055;
        float dd = acos(clamp(cosA, -1.0, 1.0));
        if (dd < sunR * 1.6) {
          float x = clamp(dd / sunR, 0.0, 1.0);
          float limb = pow(max(1.0 - x * x, 0.0), 0.25);
          float edge = 1.0 - smoothstep(0.85, 1.25, dd / sunR);
          col += uSunColor * uSunDisk * limb * edge;
        }
        #else
        // ambiente: chão abaixo do horizonte já vem do LUT; reduz brilho
        // extremo da auréola para não gerar "vaga-lumes" no PMREM
        col = min(col, vec3(8.0));
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`})}var ne=class{constructor(e,t={}){this.renderer=e,this.sunDir=new T(.5,.7,.3).normalize(),this.params={haze:.6,altitude:.15,groundAlbedo:new N(.28,.26,.23),skyScale:2.2,sunDisk:18,skySaturation:1.22,cloudCover:.5,cloudDensity:1.15,cloudWind:new l(.004,.0015),...t},this.lut=new w(192,108,{type:a,minFilter:f,magFilter:f,wrapS:g,wrapT:g,depthBuffer:!1}),this.lut.texture.colorSpace=``,this.lutQuad=new R(new y({name:`ironline-skylut`,glslVersion:r,uniforms:{uSunDir:{value:this.sunDir.clone()},uHaze:{value:this.params.haze},uAltitude:{value:this.params.altitude},uGroundAlbedo:{value:this.params.groundAlbedo}},vertexShader:F,fragmentShader:ee,depthTest:!1,depthWrite:!1})),this.uniforms={uLut:{value:this.lut.texture},uSunDir:{value:this.sunDir},uSunColor:{value:new N(1,1,1)},uSkyScale:{value:1},uSunDisk:{value:this.params.sunDisk},uSkySat:{value:this.params.skySaturation},uTime:{value:0},uCloudCover:{value:this.params.cloudCover},uCloudDensity:{value:this.params.cloudDensity},uCloudWind:{value:this.params.cloudWind}};let n=new P(1,48,24);this.dome=new p(n,te(this.uniforms,!1)),this.dome.name=`ironline-sky`,this.dome.frustumCulled=!1,this.dome.renderOrder=-1e6,this.dome.castShadow=this.dome.receiveShadow=!1,this.dome.matrixAutoUpdate=!1,this.envScene=new C,this.envDome=new p(n,te(this.uniforms,!0)),this.envDome.scale.setScalar(100),this.envDome.frustumCulled=!1,this.envScene.add(this.envDome),this.pmrem=new D(e),this.envRT=null,this.sunIntensity=3,this.sunTransmittance=new N(1,1,1),this._lastLutDir=new T(0,-2,0),this._lastEnvDir=new T(0,-2,0),this._lastEnvKey=``,this.dirty=!0}attach(e,t){e.add(this.dome),this.dome.onBeforeRender=(e,t,n)=>{let r=Math.min(n.far*.9,5e3);this.dome.matrixWorld.makeScale(r,r,r).setPosition(n.getWorldPosition(re))}}setSun(e,t){this.sunDir.copy(e).normalize(),this.sunIntensity=t,ie(this.sunDir,this.params,this.sunTransmittance),this.uniforms.uSunColor.value.copy(this.sunTransmittance).multiplyScalar(t),this.uniforms.uSkyScale.value=this.params.skyScale*t}updateLut(e=!1){if(!e&&!this.dirty&&this._lastLutDir.angleTo(this.sunDir)<.002)return!1;let t=this.lutQuad.material.uniforms;return t.uSunDir.value.copy(this.sunDir),t.uHaze.value=this.params.haze,t.uAltitude.value=this.params.altitude,this.lutQuad.render(this.renderer,this.lut),this._lastLutDir.copy(this.sunDir),this.dirty=!1,!0}updateEnvironment(e=!1){let t=`${this.params.cloudCover.toFixed(3)}|${this.params.haze.toFixed(3)}|${this.uniforms.uSkyScale.value.toFixed(3)}`;if(!e&&this.envRT&&this._lastEnvDir.angleTo(this.sunDir)<.03&&t===this._lastEnvKey)return null;let n=this.envRT;return this.envRT=this.pmrem.fromScene(this.envScene,0,.1,1e3),this.envRT.texture.name=`ironline-env`,n?.dispose(),this._lastEnvDir.copy(this.sunDir),this._lastEnvKey=t,this.envRT.texture}readAmbient(e){let t=this.lut.width,n=this.lut.height,r=new Uint16Array(t*n*4);try{e.readRenderTargetPixels(this.lut,0,0,t,n,r)}catch{return null}let i=d.fromHalfFloat,a=[0,0,0],o=[0,0,0];for(let e=0;e<n;e++){let s=((e+.5)/n-.5)*2,c=Math.sign(s)*s*s*Math.PI*.5,l=Math.cos(c)*(2*Math.PI*Math.abs(s))*(1/n)*(Math.PI/t)*2,u=Math.max(Math.sin(c),0),d=Math.cos(c)/Math.PI;for(let n=0;n<t;n++){let s=(e*t+n)*4;for(let e=0;e<3;e++){let t=i(r[s+e]);Number.isFinite(t)&&(a[e]+=t*u*l,o[e]+=t*d*l)}}}let s=this.uniforms.uSkyScale.value/Math.PI;return this.ambientUp=new N(a[0]*s,a[1]*s,a[2]*s),this.ambientSide=new N(o[0]*s,o[1]*s,o[2]*s),{up:this.ambientUp,side:this.ambientSide}}dispose(){this.lut.dispose(),this.envRT?.dispose(),this.pmrem.dispose(),this.dome.geometry.dispose(),this.dome.material.dispose(),this.envDome.material.dispose(),this.lutQuad.dispose()}},re=new T;function ie(e,t,n=new N){let r=[0,V+t.altitude,0],a=[e.x,e.y,e.z],o=r[0]*a[0]+r[1]*a[1]+r[2]*a[2],s=r[0]*r[0]+r[1]*r[1]+r[2]*r[2]-H*H,c=(-o+Math.sqrt(Math.max(o*o-s,0)))/64,l=0,u=0,d=0;for(let e=0;e<64;e++){let n=(e+.5)*c,i=r[0]+a[0]*n,o=r[1]+a[1]*n,s=r[2]+a[2]*n,f=Math.hypot(i,o,s)-V;l+=Math.exp(-f/K)*c,u+=Math.exp(-f/q)*t.haze*c,d+=Math.max(0,1-Math.abs(f-25)/15)*c}let f=[0,1,2].map(e=>Math.exp(-(U[e]*l+W*u+G[e]*d))),p=O.smoothstep(e.y,-.03,.02);return n.setRGB(f[0]*p,f[1]*p,f[2]*p,i)}var ae=new T,Y=new T,X=new T,oe=new m,se=new m,ce=new T(0,1,0),le=new T,ue=new T,de=class{constructor(){this.radius=50,this.mapSize=2048,this.distance=140,this.softness=2,this.lastDir=new T(0,1,0)}configure(e){let t=e.level;this.radius={low:30,medium:34,high:38,ultra:46}[t]??38;let n=e.shadowMapSize||2048;this.mapSize={low:n,medium:Math.max(n,2048),high:Math.max(n,4096),ultra:Math.max(n,4096)}[t]??n,this.softness={low:1.2,medium:1.3,high:1.1,ultra:1.2}[t]??1.2}readDirection(e,t){e.updateMatrixWorld(),e.target.updateMatrixWorld();let n=le.setFromMatrixPosition(e.matrixWorld),r=ue.setFromMatrixPosition(e.target.matrixWorld);return t.subVectors(n,r),t.lengthSq()<1e-8&&t.copy(this.lastDir),t.normalize()}update(e,t,n){if(!e.castShadow)return!1;let r=e.shadow;r.mapSize.x!==this.mapSize&&(r.mapSize.setScalar(this.mapSize),r.map?.dispose(),r.map=null),this.lastDir.copy(n);let i=this.radius;t.getWorldDirection(Y),Y.y*=.3,Y.normalize(),X.copy(t.getWorldPosition(le)).addScaledVector(Y,i*.5),oe.lookAt(ue.set(0,0,0),ae.copy(n).negate(),Math.abs(n.y)>.99?Y:ce),se.copy(oe).invert(),X.applyMatrix4(se);let a=2*i/this.mapSize;X.x=Math.round(X.x/a)*a,X.y=Math.round(X.y/a)*a,X.applyMatrix4(oe);let o=e.parent,s=e.target,c=le.copy(X).addScaledVector(n,this.distance);o?(o.updateMatrixWorld(),e.position.copy(o.worldToLocal(c))):e.position.copy(c);let l=ae.copy(X);s.parent?s.position.copy(s.parent.worldToLocal(l)):s.position.copy(l),e.updateMatrixWorld(),s.updateMatrixWorld();let u=r.camera;(u.right!==i||u.far!==this.distance+120)&&(u.left=-i,u.right=i,u.top=i,u.bottom=-i,u.near=1,u.far=this.distance+120,u.updateProjectionMatrix());let d=!this.lastCenter||this.lastCenter.distanceToSquared(X)>1e-8||this.lastDirKey.angleTo(n)>1e-5;return d&&((this.lastCenter||=new T).copy(X),(this.lastDirKey||=new T).copy(n)),r.radius=this.softness,r.bias=-15e-5,r.normalBias=a*1.4,r.blurSamples=8,d}},fe=class{constructor(r=2048){this.size=r;let i=new e(r,r,s);i.format=t,i.minFilter=i.magFilter=j,this.rt=new w(r,r,{type:n,depthBuffer:!0,depthTexture:i,generateMipmaps:!1}),this.override=new h({colorWrite:!1,side:2}),this.valid=!1,this.hidden=[]}render(e,t,n,r=[]){let i=n.shadow;i.updateMatrices(n);let a=t.overrideMaterial,o=t.background,s=e.shadowMap.autoUpdate,c=e.shadowMap.needsUpdate;t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1,e.shadowMap.needsUpdate=!1;let l=this.hidden;l.length=0;for(let e of r)e&&e.visible&&(e.visible=!1,l.push(e));t.traverseVisible(e=>{(e.isPoints||e.isSprite||e.isLine||e.userData?.noSunView||e.isMesh&&!e.castShadow||e.material&&e.material.transparent&&!e.material.alphaTest)&&(e.isMesh||e.isPoints||e.isSprite||e.isLine)&&(l.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.clear(!1,!0,!1),e.render(t,i.camera);for(let e of l)e.visible=!0;l.length=0,t.overrideMaterial=a,t.background=o,e.shadowMap.autoUpdate=s,e.shadowMap.needsUpdate=c,this.valid=!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override.dispose()}},pe=class{constructor(e=900,t=14){let n=new Float32Array(e*3),r=new Float32Array(e),i=12345,a=()=>(i=i*16807%2147483647)/2147483647;for(let i=0;i<e;i++)n[i*3]=a()*t,n[i*3+1]=a()*t*.5,n[i*3+2]=a()*t,r[i]=a();let o=new S;o.setAttribute(`position`,new E(n,3)),o.setAttribute(`aRnd`,new E(r,1)),this.uniforms={uCam:{value:new T},uBox:{value:new T(t,t*.5,t)},uTime:{value:0},uShadow:{value:null},uShadowMatrix:{value:new m},uSunColor:{value:new N(1,1,1)},uAmbient:{value:new N(.02,.022,.026)},uIntensity:{value:1},uPxScale:{value:600}};let s=new x({name:`ironline-dust`,uniforms:this.uniforms,transparent:!0,depthWrite:!1,blending:2,fog:!1,vertexShader:`
        precision highp sampler2DShadow;
        attribute float aRnd;
        uniform vec3 uCam; uniform vec3 uBox; uniform float uTime;
        uniform sampler2DShadow uShadow; uniform mat4 uShadowMatrix;
        uniform vec3 uSunColor; uniform vec3 uAmbient; uniform float uIntensity; uniform float uPxScale;
        varying vec3 vCol; varying float vA;
        void main() {
          vec3 drift = vec3(sin(uTime * 0.13 + aRnd * 40.0), sin(uTime * 0.07 + aRnd * 17.0) * 0.6 - 0.15, cos(uTime * 0.11 + aRnd * 23.0)) * (0.25 + aRnd * 0.3);
          vec3 base = position + drift * uTime * 0.15;
          vec3 origin = uCam - uBox * vec3(0.5, 0.35, 0.5);
          vec3 p = origin + mod(base - origin, uBox);
          vec4 sc = uShadowMatrix * vec4(p, 1.0);
          vec3 s = sc.xyz / sc.w;
          float vis = (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) ? texture(uShadow, vec3(s.xy, s.z - 0.001)) : 1.0;
          float d = distance(p, uCam);
          float fade = smoothstep(0.4, 1.4, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d));
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + aRnd * 3.0) + aRnd * 60.0);
          vCol = (uSunColor * vis * tw + uAmbient) * uIntensity;
          vA = fade;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((0.010 + aRnd * 0.012) * uPxScale / -mv.z, 1.0, 6.0);
        }`,fragmentShader:`
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float m = exp(-dot(c, c) * 14.0);
          gl_FragColor = vec4(vCol * m * vA, 1.0);
        }`});this.points=new v(o,s),this.points.name=`ironline-dust`,this.points.frustumCulled=!1,this.points.renderOrder=10,this.points.visible=!1,this.points.onBeforeRender=()=>{let e=this._sun?.shadow;e?.map?.depthTexture&&(this.uniforms.uShadow.value=e.map.depthTexture,this.uniforms.uShadowMatrix.value.copy(e.matrix))}}update(e,t,n,r,i){let a=this.uniforms;e.getWorldPosition(a.uCam.value),a.uTime.value=r,a.uPxScale.value=i,this._sun=t;let o=t?.castShadow&&t.shadow.map?.depthTexture;this.points.visible=!!o&&this.enabled!==!1,o&&(a.uShadow.value=o,a.uShadowMatrix.value.copy(t.shadow.matrix),a.uSunColor.value.copy(n))}dispose(){this.points.geometry.dispose(),this.points.material.dispose()}},me=class{constructor(r=512,i=110){this.size=r,this.extent=i,this.height=260;let a=new e(r,r,s);a.format=t,a.minFilter=a.magFilter=j,this.rt=new w(r,r,{depthBuffer:!0,depthTexture:a,type:n});let o=i/2;this.camera=new k(-o,o,o,-o,1,this.height+60),this.camera.up.set(0,0,-1),this.override=new h({colorWrite:!1,side:2}),this.center=new T(1e9,0,0),this.age=0,this.valid=!1,this.matrix=new m}update(e,t,n,r=!1){let i=n.getWorldPosition(he);this.age++;let a=Math.hypot(i.x-this.center.x,i.z-this.center.z);if(!r&&this.valid&&a<this.extent*.15&&this.age<30)return!1;let o=this.extent/this.size;this.center.set(Math.round(i.x/o)*o,0,Math.round(i.z/o)*o);let s=this.camera;s.position.set(this.center.x,i.y+this.height,this.center.z),s.lookAt(this.center.x,i.y-100,this.center.z),s.updateMatrixWorld(),s.updateProjectionMatrix();let c=t.overrideMaterial,l=t.background,u=e.shadowMap.autoUpdate;t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1;let d=[];t.traverse(e=>{e.visible&&(e.isPoints||e.isSprite||e.isLine||e.userData?.noSkyOcclusion||e.material&&e.material.transparent)&&(d.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.clear(),e.render(t,s);for(let e of d)e.visible=!0;return t.overrideMaterial=c,t.background=l,e.shadowMap.autoUpdate=u,ge.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),this.matrix.multiplyMatrices(ge,s.projectionMatrix).multiply(s.matrixWorldInverse),this.age=0,this.valid=!0,!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override.dispose()}},he=new T,ge=new m,Z=new T,Q=new T,_e=new m,ve=new m,ye=new T(0,1,0),be=new T,xe=new m().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),Se=class{constructor({size:r=256,radius:i=30,color:o=!1,forward:c=.3,depthRange:l=400}={}){this.size=r,this.radius=i,this.forward=c,this.depthRange=l,this.color=o;let u=new e(r,r,s);u.format=t,u.minFilter=u.magFilter=j,this.rt=new w(r,r,{type:o?a:n,depthBuffer:!0,depthTexture:u,minFilter:f,magFilter:f,generateMipmaps:!1}),this.rt.texture.colorSpace=``,this.camera=new k(-i,i,i,-i,1,l),this.override=o?null:new h({colorWrite:!1,side:2}),this.center=new T(1e9,0,0),this.lastDir=new T(0,-2,0),this.age=1e9,this.valid=!1,this.matrix=new m,this.inverse=new m}get texel(){return 2*this.radius/this.size}update(e,t,n,r,{moveFrac:i=.12,maxAge:a=30,force:o=!1,hide:s=[]}={}){this.age++,n.getWorldPosition(Z),n.getWorldDirection(Q),Q.y=0,Q.lengthSq()<1e-6&&Q.set(0,0,-1),Q.normalize();let c=be.copy(Z).addScaledVector(Q,this.radius*this.forward),l=Math.hypot(c.x-this.center.x,c.z-this.center.z),u=this.lastDir.angleTo(r)>.002;if(!o&&this.valid&&!u&&l<this.radius*i&&this.age<a)return!1;_e.lookAt(be.set(0,0,0),Q.copy(r).negate(),Math.abs(r.y)>.99?Z.set(0,0,1):ye),ve.copy(_e).invert();let d=c.clone().applyMatrix4(ve),f=this.texel;d.x=Math.round(d.x/f)*f,d.y=Math.round(d.y/f)*f,d.applyMatrix4(_e),this.center.copy(d);let p=this.camera,m=this.depthRange*.5;p.position.copy(d).addScaledVector(r,m),p.up.copy(Math.abs(r.y)>.99?Z.set(0,0,1):ye),p.lookAt(d),p.left=-this.radius,p.right=this.radius,p.top=this.radius,p.bottom=-this.radius,p.near=1,p.far=this.depthRange,p.updateProjectionMatrix(),p.updateMatrixWorld();let h=t.overrideMaterial,g=t.background,_=e.shadowMap.autoUpdate,v=e.getClearColor(we),y=e.getClearAlpha();t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1;let b=[];for(let e of s)e&&e.visible&&(e.visible=!1,b.push(e));t.traverse(e=>{e.visible&&(e.isPoints||e.isSprite||e.isLine||e.userData?.noSunView||e.material&&e.material.transparent&&!e.material.alphaTest)&&(b.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.setClearColor(0,0),e.clear(),e.render(t,p);for(let e of b)e.visible=!0;return e.setClearColor(v,y),t.overrideMaterial=h,t.background=g,e.shadowMap.autoUpdate=_,Ce.multiplyMatrices(p.projectionMatrix,p.matrixWorldInverse),this.matrix.multiplyMatrices(xe,Ce),this.inverse.copy(Ce).invert(),this.lastDir.copy(r),this.age=0,this.valid=!0,!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override?.dispose()}},Ce=new m,we=new N,Te=class{constructor(e,t=128){this.renderer=e,this.cubeRT=new _(t,{type:a,generateMipmaps:!1,minFilter:f,magFilter:f}),this.cubeRT.texture.colorSpace=``,this.cam=new u(.12,650,this.cubeRT),this.pmrem=new D(e),this.envRT=null,this.pos=new T(1e9,0,0),this.age=1e9,this.texture=null}update(e,t,{hide:n=[],moveDist:r=1.5,maxAge:i=180,force:a=!1}={}){this.age++;let o=t.getWorldPosition(Ee);if(!a&&this.texture&&o.distanceTo(this.pos)<r&&this.age<i)return!1;let s=this.renderer;this.pos.copy(o),this.cam.position.copy(o),this.cam.updateMatrixWorld();let c=s.shadowMap.autoUpdate,l=s.getRenderTarget();s.shadowMap.autoUpdate=!1;let u=[];for(let e of n)e&&e.visible&&(e.visible=!1,u.push(e));this.cam.update(s,e);for(let e of u)e.visible=!0;return s.shadowMap.autoUpdate=c,this.envRT=this.pmrem.fromCubemap(this.cubeRT.texture,this.envRT),this.envRT.texture.name=`ironline-local-probe`,s.setRenderTarget(l),this.texture=this.envRT.texture,this.age=0,!0}dispose(){this.cubeRT.dispose(),this.envRT?.dispose(),this.pmrem.dispose()}},Ee=new T;function De(e=7,t=640,n=360){let r=e>>>0,i=()=>{r=r+1831565813>>>0;let e=r;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296},a=document.createElement(`canvas`);a.width=t,a.height=n;let o=a.getContext(`2d`);o.fillStyle=`#000`,o.fillRect(0,0,t,n),o.globalCompositeOperation=`lighter`;for(let e=0;e<22;e++){let e=i()*t,r=i()*n,a=30+i()*110,s=o.createRadialGradient(e,r,0,e,r,a),c=.05+i()*.09;s.addColorStop(0,`rgba(255,245,230,${c})`),s.addColorStop(1,`rgba(255,245,230,0)`),o.fillStyle=s,o.beginPath(),o.ellipse(e,r,a,a*(.4+i()*.6),i()*Math.PI,0,Math.PI*2),o.fill()}for(let e=0;e<70;e++){let e=i()*t,r=i()*n,a=3+i()*16,s=o.createRadialGradient(e,r,a*.55,e,r,a),c=.05+i()*.09;s.addColorStop(0,`rgba(255,255,255,${c*.35})`),s.addColorStop(.8,`rgba(255,250,240,${c})`),s.addColorStop(1,`rgba(255,250,240,0)`),o.fillStyle=s,o.beginPath(),o.arc(e,r,a,0,Math.PI*2),o.fill()}for(let e=0;e<26;e++){let e=i()*t,r=i()*n,a=8+i()*26;o.fillStyle=`rgba(220,235,255,${.03+i()*.05})`,o.beginPath();for(let t=0;t<6;t++){let n=t/6*Math.PI*2+.3;o.lineTo(e+Math.cos(n)*a,r+Math.sin(n)*a)}o.fill()}for(let e=0;e<900;e++){let e=i()*t,r=i()*n;o.fillStyle=`rgba(255,255,255,${.03+i()*.1})`,o.fillRect(e,r,1+ +(i()<.2),1)}o.lineWidth=1;for(let e=0;e<14;e++){o.strokeStyle=`rgba(255,255,255,${.03+i()*.05})`,o.beginPath();let e=i()*t,r=i()*n;o.moveTo(e,r);for(let t=0;t<4;t++)e+=(i()-.5)*40,r+=(i()-.5)*40,o.quadraticCurveTo(e+(i()-.5)*20,r+(i()-.5)*20,e,r);o.stroke()}let s=new b(a);return s.colorSpace=``,s.minFilter=f,s.magFilter=f,s.generateMipmaps=!1,s.needsUpdate=!0,s}var $=`
in vec2 vUv;
out vec4 outColor;
const float PI = 3.14159265359;
uniform mat4 uProjInv;
uniform vec2 uNearFar;
vec3 viewPosAt(vec2 uv, float d) {
  vec4 c = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uProjInv * c;
  return v.xyz / v.w;
}
float linearZ(float d) {
  float n = uNearFar.x, f = uNearFar.y;
  return n * f / (f - d * (f - n));
}
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`,Oe=`
${$}
uniform sampler2D tDepth;
uniform vec2 uFullTexel;
uniform vec2 uAoRes;
uniform float uRadius;
uniform float uIntensity;
uniform float uBias;
uniform float uProjScale;
uniform float uFrame;

vec3 vpos(vec2 uv) { return viewPosAt(uv, texture(tDepth, uv).r); }

void main() {
  float d = texture(tDepth, vUv).r;
  if (d >= 0.99999) { outColor = vec4(1.0); return; }
  vec3 P = viewPosAt(vUv, d);
  // normal pelo menor delta em cada eixo (evita halos nas bordas)
  vec3 pr = vpos(vUv + vec2(uFullTexel.x, 0.0)) - P;
  vec3 pl = P - vpos(vUv - vec2(uFullTexel.x, 0.0));
  vec3 pu = vpos(vUv + vec2(0.0, uFullTexel.y)) - P;
  vec3 pd = P - vpos(vUv - vec2(0.0, uFullTexel.y));
  vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl;
  vec3 dy = abs(pu.z) < abs(pd.z) ? pu : pd;
  vec3 n = normalize(cross(dx, dy));
  if (dot(n, P) > 0.0) n = -n;

  // duas escalas: anel largo (oclusão de cantos/paredes) + anel curto
  // (contato: pé de barreira, rodapé, fresta) — amostras alternadas
  float rL = uRadius, rS = uRadius * 0.28;
  float rPxL = clamp(uProjScale * rL / -P.z, 2.0, 110.0);
  float rPxS = clamp(uProjScale * rS / -P.z, 1.5, 40.0);
  float phi = ign(gl_FragCoord.xy + uFrame * 7.0) * 2.0 * PI;
  float sumL = 0.0, sumS = 0.0;
  for (int i = 0; i < AO_SAMPLES; i++) {
    bool small = (i & 1) == 1;
    float r = small ? rS : rL;
    float r2 = r * r;
    float a = (float(i) + 0.5) / float(AO_SAMPLES);
    float h = (small ? rPxS : rPxL) * a;
    float ang = a * 7.0 * 2.0 * PI + phi;
    vec2 uv = vUv + vec2(cos(ang), sin(ang)) * h / uAoRes;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) continue;
    vec3 Q = vpos(uv);
    vec3 v = Q - P;
    float vv = dot(v, v);
    float vn = dot(v, n);
    float f = max(r2 - vv, 0.0) / r2;
    float o = f * f * max((vn - uBias * -P.z * 0.025) / (vv + 0.02 * r2), 0.0);
    if (small) sumS += o * 2.0 * rS; else sumL += o * 2.0 * rL;
  }
  float n2 = float(AO_SAMPLES) * 0.5;
  float aoL = max(0.0, 1.0 - sumL * uIntensity / n2);
  float aoS = max(0.0, 1.0 - sumS * uIntensity * 1.15 / n2);
  float ao = aoL * aoS;
  // fade com a distância (AO de tela some longe, onde vira ruído)
  ao = mix(ao, 1.0, smoothstep(60.0, 140.0, -P.z));
  outColor = vec4(ao, ao, ao, 1.0);
}`,ke=`
${$}
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform vec2 uDir;      // texel * direção
uniform float uDepthSharp;
void main() {
  float z0 = linearZ(texture(tDepth, vUv).r);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 uv = vUv + uDir * float(i) * 1.33;
    float z = linearZ(texture(tDepth, uv).r);
    float w = exp(-float(i * i) / 8.0);
    w *= exp(-abs(z - z0) / max(z0, 0.5) * uDepthSharp);
    acc += texture(tSrc, uv) * w;
    wsum += w;
  }
  outColor = acc / max(wsum, 1e-4);
}`,Ae=`
${$}
uniform sampler2D tDepth;
uniform sampler2DShadow tShadow;
uniform mat4 uViewInv;
uniform mat4 uShadowMatrix;
uniform vec3 uCamPos;
uniform float uMaxDist;
uniform float uDensity;
uniform float uHeightFalloff;
uniform float uBaseHeight;
uniform float uFrame;
uniform float uShadowBias;
uniform sampler2D tSkyOcc;
uniform mat4 uSkyOccMatrix;
uniform float uIndoorDust;
uniform sampler2D tRsmDepth;   // RSM: 1º obstáculo REAL visto do sol (inclui o que não projeta sombra)
uniform mat4 uRsmMatrix;
uniform float uRsmOn;

void main() {
  float d = texture(tDepth, vUv).r;
  bool sky = d >= 0.99999;
  vec3 vp = viewPosAt(vUv, sky ? 0.9995 : d);
  vec3 wp = (uViewInv * vec4(vp, 1.0)).xyz;
  vec3 rd = normalize(wp - uCamPos);
  float dist = sky ? uMaxDist : min(length(wp - uCamPos), uMaxDist);
  float jitter = ign(gl_FragCoord.xy + mod(uFrame, 16.0) * 5.588238);
  float dt = dist / float(VOL_STEPS);
  float acc = 0.0;
  float T = 1.0;
  for (int i = 0; i < VOL_STEPS; i++) {
    float t = (float(i) + jitter) * dt;
    vec3 p = uCamPos + rd * t;
    float dens = uDensity * exp(-max(p.y - uBaseHeight, 0.0) * uHeightFalloff);
    // ar empoeirado sob teto (interiores): feixes de sol bem visíveis
    if (uIndoorDust > 0.0) {
      vec4 oc = uSkyOccMatrix * vec4(p, 1.0);
      vec3 ou = oc.xyz / oc.w;
      if (ou.x > 0.0 && ou.x < 1.0 && ou.y > 0.0 && ou.y < 1.0 && texture(tSkyOcc, ou.xy).r < ou.z - 0.002)
        dens *= uIndoorDust;
    }
    vec4 sc = uShadowMatrix * vec4(p, 1.0);
    vec3 s = sc.xyz / sc.w;
    float vis = 1.0;
    if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0)
      vis = texture(tShadow, vec3(s.xy, s.z - uShadowBias));
    if (uRsmOn > 0.5 && vis > 0.0) {
      vec4 rc = uRsmMatrix * vec4(p, 1.0);
      vec3 r = rc.xyz / rc.w;
      if (r.x > 0.0 && r.x < 1.0 && r.y > 0.0 && r.y < 1.0 && r.z < 1.0)
        vis *= step(r.z - 0.0015, texture(tRsmDepth, r.xy).r);
    }
    acc += vis * dens * T * dt;
    T *= exp(-dens * dt);
  }
  outColor = vec4(acc, T, 0.0, 1.0);
}`,je=`
${$}
${J}
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tAo;
uniform sampler2D tVol;
uniform sampler2D tVm;
uniform sampler2D tLut;
uniform sampler2D tGi;
uniform mat4 uViewInv;
uniform mat4 uProj;
uniform mat4 uPrevViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunDirView;
uniform vec3 uSunRadiance;   // cor física do sol (céu/névoa)
uniform vec3 uSunIrr;        // cor × intensidade da DirectionalLight da cena
uniform vec3 uAmbient;       // radiância ambiente equivalente (IBL + hemisfério)
uniform float uCoveredAmb;   // ambiente que a cena já tem sob teto (world)
uniform float uSkyScale;
uniform float uAoStrength;
uniform float uGiStrength;
uniform float uContact;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uFogStart;
uniform float uFogMax;
uniform vec3 uFogTint;
uniform float uFogSun;
uniform float uVolStrength;
uniform float uPhaseG;
uniform float uMotion;
uniform float uVmBlur;
uniform float uVmOn;
uniform vec2 uRes;
uniform float uFrame;
uniform sampler2D tSkyOcc;
uniform mat4 uSkyOccMatrix;
uniform float uSkyOccOn;
uniform float uIndoor;
uniform vec3 uIndoorTint;
uniform float uDebug;
uniform sampler2D tFar;
uniform mat4 uFarMatrix;
uniform float uFarOn;
uniform vec2 uFarTexel;
uniform sampler2D tBleed;   // radiância borrada do quadro anterior (mip do bloom)
uniform sampler2D tBleed2;  // mip mais largo
uniform float uBleed;       // força do rebatimento em espaço de tela (interiores)
#ifdef HAS_SHADOW
uniform sampler2DShadow tShadow;
uniform mat4 uShadowMatrix;
uniform sampler2D tShadowRaw;  // mesma vista, depth cru (busca de bloqueadores do PCSS)
uniform float uPcssOn;
uniform vec2 uShadowTexel;     // texel do mapa do three (uv)
uniform float uShadowWorld;    // largura do mapa em metros
uniform float uShadowRange;    // far − near da câmera de sombra (m)
uniform float uLightSize;      // tan do semi-ângulo efetivo do sol (penumbra/m de distância)
#endif

float hg(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
}

// sombra da cascata larga (depth manual, PCF bilinear 2×2)
float farShadow(vec3 wp, vec3 n) {
  vec4 c = uFarMatrix * vec4(wp + n * 0.3, 1.0);
  vec3 u = c.xyz / c.w;
  if (u.x <= 0.0 || u.y <= 0.0 || u.x >= 1.0 || u.y >= 1.0 || u.z >= 1.0) return 1.0;
  vec2 st = u.xy / uFarTexel - 0.5;
  vec2 f = fract(st);
  vec2 b = (floor(st) + 0.5) * uFarTexel;
  float z = u.z - 0.0012;
  float s00 = step(z, texture(tFar, b).r);
  float s10 = step(z, texture(tFar, b + vec2(uFarTexel.x, 0.0)).r);
  float s01 = step(z, texture(tFar, b + vec2(0.0, uFarTexel.y)).r);
  float s11 = step(z, texture(tFar, b + uFarTexel).r);
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}

#ifdef HAS_SHADOW
vec2 vogel(int i, int n, float phi) {
  float r = sqrt((float(i) + 0.5) / float(n));
  float a = float(i) * 2.39996323 + phi;
  return vec2(cos(a), sin(a)) * r;
}
// PCSS: penumbra proporcional à distância receptor–bloqueador (endurece no
// contato, amolece longe). Busca no mapa cru, filtra no mapa do three.
float pcss(vec3 s3, float rawOk) {
  float z = s3.z;
  float phi = ign(gl_FragCoord.xy + uFrame * 3.7) * 6.2831853;
  float pen = 0.0;
  if (rawOk > 0.5) {
    float searchUv = 0.55 / uShadowWorld;
    float bsum = 0.0, bn = 0.0;
    float zb = z - 0.08 / uShadowRange;
    for (int i = 0; i < 12; i++) {
      float bd = texture(tShadowRaw, s3.xy + vogel(i, 12, phi) * searchUv).r;
      if (bd < zb) { bsum += bd; bn += 1.0; }
    }
    if (bn < 0.5) return 1.0;           // nenhum bloqueador: totalmente ao sol
    float dz = max(z - bsum / bn, 0.0) * uShadowRange;
    pen = dz * uLightSize;               // largura da penumbra (m)
  } else pen = 0.04;
  float rUv = clamp(pen, 0.012, 0.45) / uShadowWorld;
  rUv = max(rUv, uShadowTexel.x * 1.25);
  float vis = 0.0;
  float phi2 = phi + 1.3;
  for (int i = 0; i < 16; i++) vis += texture(tShadow, vec3(s3.xy + vogel(i, 16, phi2) * rUv, z - 0.0004));
  return vis / 16.0;
}
#endif

// sombra de contato em espaço de tela: marcha curta rumo ao sol no depth
float contactShadow(vec3 vp, vec3 nv) {
  float dist = -vp.z;
  if (dist > 45.0) return 0.0;
  float len = clamp(dist * 0.035, 0.18, 0.9);
  vec3 ro = vp + nv * (0.015 + dist * 0.0012);
  vec3 stp = uSunDirView * (len / 12.0);
  float j = ign(gl_FragCoord.xy + uFrame * 13.0);
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    vec3 p = ro + stp * (float(i) + j);
    vec4 c = uProj * vec4(p, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
    float sz = linearZ(texture(tDepth, uv).r);
    float dz = -p.z - sz;
    float thick = 0.25 + sz * 0.012;
    if (dz > 0.01 + sz * 0.0006 && dz < thick) {
      occ = 1.0 - float(i) / 14.0;   // mais perto do ponto = mais escuro
      break;
    }
  }
  return occ * (1.0 - smoothstep(30.0, 45.0, dist));
}

void main() {
  float d = texture(tDepth, vUv).r;
  bool sky = d >= 0.99999;
  vec3 vp = viewPosAt(vUv, sky ? 0.9995 : d);
  vec3 wp = (uViewInv * vec4(vp, 1.0)).xyz;
  vec3 rel = wp - uCamPos;
  float dist = length(rel);
  vec3 rd = rel / max(dist, 1e-4);

  vec3 col = texture(tScene, vUv).rgb;

  // ── motion blur de câmera (reprojeção pelo depth) ──
  if (uMotion > 0.0) {
    vec4 pc = uPrevViewProj * vec4(sky ? uCamPos + rd * 1000.0 : wp, 1.0);
    vec2 prevUv = pc.xy / pc.w * 0.5 + 0.5;
    vec2 vel = (vUv - prevUv) * uMotion;
    float vl = length(vel);
    if (vl > 0.0015) {
      vel *= min(vl, 0.04) / vl;
      vec3 acc = col;
      float j = ign(gl_FragCoord.xy + uFrame) - 0.5;
      for (int i = 1; i <= 6; i++) {
        float t = (float(i) + j) / 6.0 - 0.5;
        acc += texture(tScene, vUv + vel * t).rgb;
      }
      col = acc / 7.0;
    }
  }

  if (!sky) {
    // normal pelo depth (menor delta por eixo → sem halos nas bordas)
    vec2 tx = 1.0 / uRes;
    vec3 c0 = vp;
    vec3 pr = viewPosAt(vUv + vec2(tx.x, 0.0), texture(tDepth, vUv + vec2(tx.x, 0.0)).r) - c0;
    vec3 pl = c0 - viewPosAt(vUv - vec2(tx.x, 0.0), texture(tDepth, vUv - vec2(tx.x, 0.0)).r);
    vec3 pu = viewPosAt(vUv + vec2(0.0, tx.y), texture(tDepth, vUv + vec2(0.0, tx.y)).r) - c0;
    vec3 pd = c0 - viewPosAt(vUv - vec2(0.0, tx.y), texture(tDepth, vUv - vec2(0.0, tx.y)).r);
    vec3 nv = normalize(cross(abs(pr.z) < abs(pl.z) ? pr : pl, abs(pu.z) < abs(pd.z) ? pu : pd));
    if (dot(nv, c0) > 0.0) nv = -nv;
    vec3 n = normalize(mat3(uViewInv) * nv);
    float ndl = max(dot(n, uSunDir), 0.0);

    // ── visibilidade do sol: a que o three aplicou × a "verdadeira" ──
    float inNear = 0.0, shNear = 1.0, visSceneNear = 1.0;
    #ifdef HAS_SHADOW
    {
      vec4 sc = uShadowMatrix * vec4(wp + n * 0.06, 1.0);
      vec3 s3 = sc.xyz / sc.w;
      if (s3.x > 0.0 && s3.x < 1.0 && s3.y > 0.0 && s3.y < 1.0 && s3.z < 1.0) {
        vec2 e = min(s3.xy, 1.0 - s3.xy);
        inNear = smoothstep(0.0, 0.06, min(e.x, e.y));
        // o que o three aplicou (PCF curto) ≈ 5 taps em cruz
        vec2 t = uShadowTexel * 1.2;
        float zs = s3.z - 0.0006;
        visSceneNear = (texture(tShadow, vec3(s3.xy, zs)) * 2.0
          + texture(tShadow, vec3(s3.xy + vec2(t.x, 0.0), zs)) + texture(tShadow, vec3(s3.xy - vec2(t.x, 0.0), zs))
          + texture(tShadow, vec3(s3.xy + vec2(0.0, t.y), zs)) + texture(tShadow, vec3(s3.xy - vec2(0.0, t.y), zs))) / 6.0;
        shNear = (uPcssOn > 0.0 && ndl > 0.0) ? pcss(vec3(s3.xy, s3.z - 0.0002), uPcssOn) : visSceneNear;
      }
    }
    #endif
    float visScene = mix(1.0, visSceneNear, inNear);
    float shFar = (uFarOn > 0.5 && ndl > 0.0) ? farShadow(wp, n) : 1.0;
    float visTrue = mix(shFar, shNear, inNear);
    float contact = (uContact > 0.0 && ndl > 0.02 && visTrue > 0.02) ? contactShadow(vp, nv) * uContact : 0.0;
    visTrue *= 1.0 - contact;

    // ── oclusão de céu (interiores, marquises) ──
    float occ = 0.0;
    if (uSkyOccOn > 0.5) {
      vec3 q = wp + n * 0.2;
      vec2 nh = n.xz;
      float covered = 0.0;
      float nhl = length(nh);
      for (int i = 0; i < 12; i++) {
        float r = i == 0 ? 0.0 : 0.4 + 2.8 * sqrt(float(i) / 12.0);
        vec2 off = vec2(cos(float(i) * 2.39996), sin(float(i) * 2.39996)) * r;
        if (nhl > 0.3 && dot(off, nh) < 0.0) off = reflect(off, nh / nhl);
        vec4 c = uSkyOccMatrix * vec4(q + vec3(off.x, 0.0, off.y), 1.0);
        vec3 u = c.xyz / c.w;
        if (u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0)
          covered += smoothstep(-0.0008, 0.0008, (u.z - 0.0015) - texture(tSkyOcc, u.xy).r);
      }
      occ = covered / 12.0;
    }

    // ── albedo estimado: cena = albedo × (ambiente + sol·N·L·vis/π) ──
    vec3 ambScene = uAmbient * mix(1.0, uCoveredAmb, occ);
    vec3 sunE = uSunIrr * (ndl / PI);
    vec3 albedo = clamp(col / max(ambScene + sunE * visScene, vec3(1e-4)), 0.0, 0.95);

    // ── recomposição da luz (só nas diferenças; especular/emissivo intactos) ──
    float ao = texture(tAo, vUv).r;
    float aoAmb = mix(1.0, ao, uAoStrength);
    // sob teto, a luz indireta vem do chão/fachadas lá fora (mais quente que o céu)
    vec3 ambNew = ambScene * mix(vec3(1.0), uIndoor * uIndoorTint, occ) * aoAmb;
    vec3 gi = texture(tGi, vUv).rgb * (uGiStrength / PI) * mix(1.0, ao, 0.6 * uAoStrength);
    // o RSM vê só o chão ensolarado (sol quente × asfalto quente) → laranja
    // demais; a luz real que entra é misturada com céu/fachadas: dessatura
    gi = mix(vec3(luma(gi)), gi, 0.55);
    // rebatimento em espaço de tela: a radiância que a câmera vê em volta
    // (porta/janela estourada, chão ensolarado lá fora, parede acesa) vira luz
    // indireta nas superfícies cobertas próximas — o vão da porta "derrama"
    // luz no piso e nas paredes. Usa mips largos do quadro anterior (logo,
    // também multi-rebatimento), só sob teto, atenuado pela AO.
    vec3 bleed = vec3(0.0);
    if (uBleed > 0.0 && occ > 0.01) {
      vec3 b1 = texture(tBleed, vUv).rgb, b2 = texture(tBleed2, vUv).rgb;
      bleed = (b1 * 0.55 + b2 * 0.45) * uBleed * occ * mix(1.0, ao, 0.8 * uAoStrength);
    }
    vec3 delta = (ambNew - ambScene) + sunE * (visTrue - visScene) + gi + bleed;
    col = max(col + albedo * delta, col * 0.04);

    if (uDebug > 0.5) {
      if (uDebug < 1.5) outColor = vec4(occ, visTrue, ao, 1.0);
      else if (uDebug < 2.5) outColor = vec4(gi * 0.5, 1.0);
      else outColor = vec4(albedo, 1.0);
      return;
    }

    // ── névoa de altura exponencial (integral analítica) ──
    float L = max(dist - uFogStart, 0.0);
    float y0 = uCamPos.y + rd.y * min(dist, uFogStart);
    float base = uFogDensity * exp(-uFogFalloff * (y0 - uFogBase));
    float k = uFogFalloff * rd.y * L;
    float integ = base * L * (abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0 - 0.5 * k);
    float fogAmt = min(1.0 - exp(-integ), uFogMax);
    // cor da perspectiva aérea = céu nessa direção + espalhamento do sol (Mie)
    vec3 fdir = normalize(vec3(rd.x, max(rd.y, 0.035), rd.z));
    vec3 fogCol = texture(tLut, skyLutUv(fdir, uSunDir)).rgb * uSkyScale * uFogTint;
    float mu0 = dot(rd, uSunDir);
    // pico de Mie mais largo e baixo (g 0,6): contra o sol a névoa brilha sem
  // estourar um disco branco chapado em volta dele
  fogCol += uSunRadiance * uFogSun * (min(hg(mu0, 0.6), 0.6) * 0.8 + 0.08);
    col = mix(col, fogCol, fogAmt);
  }

  // ── raios de sol volumétricos ──
  vec2 vol = texture(tVol, vUv).rg;
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, uPhaseG), hg(mu, -0.2), 0.25);
  col += uSunRadiance * min(phase, 0.55) * vol.r * uVolStrength;

  // ── viewmodel (pré-multiplicada) com DOF de ADS na periferia ──
  if (uVmOn > 0.5) {
    vec4 vm = texture(tVm, vUv);
    if (uVmBlur > 0.01) {
      vec2 c = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float rPx = uVmBlur * smoothstep(0.1, 0.55, length(c)) * 14.0;
      if (rPx > 0.5) {
        vec4 acc = vm;
        float a0 = ign(gl_FragCoord.xy) * 6.2831;
        for (int i = 0; i < 12; i++) {
          float f = (float(i) + 0.5) / 12.0;
          float ang = float(i) * 2.39996 + a0;
          acc += texture(tVm, vUv + vec2(cos(ang), sin(ang)) * sqrt(f) * rPx / uRes);
        }
        vm = acc / 13.0;
      }
    }
    col = vm.rgb + col * (1.0 - clamp(vm.a, 0.0, 1.0));
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`,Me=`
${$}
uniform sampler2D tDepth;
uniform sampler2D tRsmColor;
uniform sampler2D tRsmDepth;
uniform mat4 uViewInv;
uniform mat4 uRsmMatrix;
uniform mat4 uRsmInv;
uniform vec3 uSunDir;
uniform float uRadiusUv;
uniform float uSampleArea;
uniform vec2 uRsmTexel;
uniform vec2 uFullTexel;
uniform float uFrame;
uniform sampler2D tSkyOcc;
uniform mat4 uSkyOccMatrix;
uniform float uSkyOccOn;

vec3 rsmPos(vec2 uv) {
  float d = texture(tRsmDepth, uv).r;
  vec4 w = uRsmInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return w.xyz / w.w;
}
float coveredAt(vec3 p) {
  if (uSkyOccOn < 0.5) return 0.0;
  vec4 c = uSkyOccMatrix * vec4(p, 1.0);
  vec3 u = c.xyz / c.w;
  if (u.x <= 0.0 || u.y <= 0.0 || u.x >= 1.0 || u.y >= 1.0) return 0.0;
  return step(texture(tSkyOcc, u.xy).r, u.z - 0.003);
}
vec3 vposS(vec2 uv) { return viewPosAt(uv, texture(tDepth, uv).r); }

void main() {
  float d = texture(tDepth, vUv).r;
  if (d >= 0.99999) { outColor = vec4(0.0); return; }
  vec3 P = viewPosAt(vUv, d);
  vec3 pr = vposS(vUv + vec2(uFullTexel.x, 0.0)) - P;
  vec3 pl = P - vposS(vUv - vec2(uFullTexel.x, 0.0));
  vec3 pu = vposS(vUv + vec2(0.0, uFullTexel.y)) - P;
  vec3 pd = P - vposS(vUv - vec2(0.0, uFullTexel.y));
  vec3 nv = normalize(cross(abs(pr.z) < abs(pl.z) ? pr : pl, abs(pu.z) < abs(pd.z) ? pu : pd));
  if (dot(nv, P) > 0.0) nv = -nv;
  vec3 n = normalize(mat3(uViewInv) * nv);
  vec3 wp = (uViewInv * vec4(P, 1.0)).xyz;
  vec4 pc = uRsmMatrix * vec4(wp, 1.0);
  vec2 puv = pc.xy / pc.w;
  float pCov = coveredAt(wp + n * 0.25 + vec3(0.0, 0.05, 0.0));
  float phi = ign(gl_FragCoord.xy + uFrame * 5.0) * 2.0 * PI;
  vec3 E = vec3(0.0);
  for (int i = 0; i < GI_SAMPLES; i++) {
    float f = (float(i) + 0.5) / float(GI_SAMPLES);
    float ang = float(i) * 2.39996 + phi;
    vec2 quv = puv + vec2(cos(ang), sin(ang)) * sqrt(f) * uRadiusUv;
    if (quv.x <= 0.0 || quv.y <= 0.0 || quv.x >= 1.0 || quv.y >= 1.0) continue;
    float dq = texture(tRsmDepth, quv).r;
    if (dq >= 0.9999) continue;
    vec3 Q = rsmPos(quv);
    vec3 a1 = rsmPos(quv + vec2(uRsmTexel.x, 0.0)) - Q;
    vec3 a2 = Q - rsmPos(quv - vec2(uRsmTexel.x, 0.0));
    vec3 b1 = rsmPos(quv + vec2(0.0, uRsmTexel.y)) - Q;
    vec3 b2 = Q - rsmPos(quv - vec2(0.0, uRsmTexel.y));
    vec3 nq = normalize(cross(dot(a1, a1) < dot(a2, a2) ? a1 : a2, dot(b1, b1) < dot(b2, b2) ? b1 : b2));
    if (dot(nq, uSunDir) < 0.0) nq = -nq;
    vec3 v = wp - Q;
    float d2 = dot(v, v);
    if (d2 < 0.01) continue;
    vec3 dir = v * inversesqrt(d2);
    float cq = max(dot(nq, dir), 0.0);
    float cp = max(dot(n, -dir), 0.0);
    if (cq * cp <= 0.0) continue;
    float w = cq * cp / max(d2, 0.4) / max(dot(nq, uSunDir), 0.3);
    if (pCov > 0.5) w *= coveredAt(Q + nq * 0.25 + vec3(0.0, 0.05, 0.0));
    vec3 L = min(textureLod(tRsmColor, quv, 0.0).rgb, vec3(24.0));
    E += L * w;
  }
  outColor = vec4(E * uSampleArea, 1.0);
}`,Ne=`
${$}
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform sampler2D tDepth;
uniform sampler2D tVm;
uniform mat4 uViewInv;
uniform mat4 uPrevViewProj;
uniform vec3 uCamPos;
uniform vec2 uTexel;
uniform float uAlpha;
uniform float uHistValid;
uniform float uGamma;

vec3 toY(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
vec3 tm(vec3 c) { return c / (1.0 + luma(c)); }
vec3 itm(vec3 c) { return c / max(1.0 - luma(c), 1e-3); }

vec3 histCR(vec2 uv) {
  vec2 res = 1.0 / uTexel;
  vec2 sp = uv * res;
  vec2 tp = floor(sp - 0.5) + 0.5;
  vec2 f = sp - tp;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 o12 = w2 / w12;
  vec2 t0 = (tp - 1.0) * uTexel, t3 = (tp + 2.0) * uTexel, t12 = (tp + o12) * uTexel;
  vec3 r = texture(tHist, vec2(t12.x, t0.y)).rgb * w12.x * w0.y
         + texture(tHist, vec2(t0.x, t12.y)).rgb * w0.x * w12.y
         + texture(tHist, t12).rgb * w12.x * w12.y
         + texture(tHist, vec2(t3.x, t12.y)).rgb * w3.x * w12.y
         + texture(tHist, vec2(t12.x, t3.y)).rgb * w12.x * w3.y;
  float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return r / ws;
}

vec3 clipAabb(vec3 mn, vec3 mx, vec3 c, vec3 h) {
  vec3 cen = 0.5 * (mx + mn);
  vec3 ext = 0.5 * (mx - mn) + 1e-5;
  vec3 v = h - cen;
  vec3 a = abs(v / ext);
  float m = max(a.x, max(a.y, a.z));
  return m > 1.0 ? cen + v / m : h;
}

void main() {
  vec3 cur = texture(tCur, vUv).rgb;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  float dMin = 1.0;
  vec2 dUv = vUv;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)) * uTexel;
      vec3 c = toY(tm(texture(tCur, vUv + o).rgb));
      m1 += c;
      m2 += c * c;
      float dd = texture(tDepth, vUv + o).r;
      if (dd < dMin) { dMin = dd; dUv = vUv + o; }
    }
  }
  m1 /= 9.0;
  m2 /= 9.0;
  vec3 sig = sqrt(max(m2 - m1 * m1, 0.0));
  float vmA = texture(tVm, vUv).a;
  vec2 prevUv = vUv;
  if (vmA < 0.05) {
    bool sky = dMin >= 0.99999;
    vec3 vp = viewPosAt(dUv, sky ? 0.9995 : dMin);
    vec3 wp = (uViewInv * vec4(vp, 1.0)).xyz;
    if (sky) wp = uCamPos + normalize(wp - uCamPos) * 1000.0;
    vec4 pc = uPrevViewProj * vec4(wp, 1.0);
    prevUv = vUv + (pc.xy / pc.w * 0.5 + 0.5 - dUv);
  }
  float a = uAlpha;
  if (uHistValid < 0.5 || prevUv.x < 0.0 || prevUv.y < 0.0 || prevUv.x > 1.0 || prevUv.y > 1.0) a = 1.0;
  vec3 c = toY(tm(cur));
  vec3 h = toY(tm(max(histCR(prevUv), 0.0)));
  h = clipAabb(m1 - sig * uGamma, m1 + sig * uGamma, c, h);
  // movimento rápido → confia mais no quadro atual
  float vel = length((prevUv - vUv) / uTexel);
  a = max(a, clamp(vel * 0.02, 0.0, 0.25));
  vec3 res = mix(h, c, a);
  outColor = vec4(max(itm(fromY(res)), 0.0), 1.0);
}`,Pe=`
${$}
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uKaris;
vec3 s(vec2 o) { return min(texture(tSrc, vUv + o * uTexel).rgb, vec3(64.0)); }
float kw(vec3 c) { return 1.0 / (1.0 + luma(c)); }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 res;
  if (uKaris > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25;
    vec3 g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25;
    vec3 g4 = (j + k + l + m) * 0.25;
    float w0 = kw(g0), w1 = kw(g1), w2 = kw(g2), w3 = kw(g3), w4 = kw(g4);
    res = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5)
        / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  } else {
    res = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  outColor = vec4(res, 1.0);
}`,Fe=`
${$}
uniform sampler2D tLow;
uniform sampler2D tCur;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uCurWeight;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 r = texture(tLow, vUv + vec2(-t.x, t.y)).rgb + texture(tLow, vUv + vec2(t.x, t.y)).rgb
         + texture(tLow, vUv + vec2(-t.x, -t.y)).rgb + texture(tLow, vUv + vec2(t.x, -t.y)).rgb;
  r += 2.0 * (texture(tLow, vUv + vec2(0.0, t.y)).rgb + texture(tLow, vUv + vec2(0.0, -t.y)).rgb
            + texture(tLow, vUv + vec2(t.x, 0.0)).rgb + texture(tLow, vUv + vec2(-t.x, 0.0)).rgb);
  r += 4.0 * texture(tLow, vUv).rgb;
  r /= 16.0;
  outColor = vec4(texture(tCur, vUv).rgb * uCurWeight + r, 1.0);
}`,Ie=`
${$}
uniform sampler2D tSmall;
uniform sampler2D tPrev;
uniform float uRate;
uniform float uKey;
uniform float uStrength;
uniform vec2 uRange;   // limites em EV
uniform float uBiasEV;
void main() {
  float sumL = 0.0, sumW = 0.0;
  for (int y = 0; y < 9; y++) {
    for (int x = 0; x < 16; x++) {
      vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(16.0, 9.0);
      vec2 c = (uv - 0.5) * 2.0;
      float w = 1.0 - 0.6 * smoothstep(0.2, 1.2, length(c));
      float L = luma(texture(tSmall, uv).rgb);
      sumL += log2(max(L, 1e-4)) * w;
      sumW += w;
    }
  }
  float avg = exp2(sumL / sumW);
  float ev = clamp(log2(uKey / avg) * uStrength + uBiasEV, uRange.x, uRange.y);
  float target = exp2(ev);
  float prev = texture(tPrev, vec2(0.5)).r;
  float e = prev <= 0.0 ? target : mix(prev, target, uRate);
  outColor = vec4(e, avg, 0.0, 1.0);
}`,Le=`
${$}
uniform sampler2D tHdr;
uniform sampler2D tBloom;
uniform sampler2D tExposure;
uniform sampler2D tDirt;
uniform float uBloom;
uniform float uDirt;
uniform float uExposure;
uniform float uCA;
uniform float uMenuBlur;
uniform vec3 uWhiteBalance;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform float uFlash;
uniform float uClarity;
uniform vec2 uRes;
uniform float uBloomNorm;   // 1/nº de níveis: a cadeia de upsample SOMA os níveis
uniform float uBlack;       // ponto de preto (compensação de flare, em exibição linear)
uniform float uFrame;

const mat3 ACESIn = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
const mat3 ACESOut = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  c = ACESIn * c;
  c = rrtOdt(c);
  c = ACESOut * c;
  return clamp(c, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  // aberração cromática radial (só nas bordas)
  vec2 off = c * r2 * uCA;
  vec3 col;
  if (uCA > 0.0) {
    col.r = texture(tHdr, vUv - off).r;
    col.g = texture(tHdr, vUv).g;
    col.b = texture(tHdr, vUv + off).b;
  } else col = texture(tHdr, vUv).rgb;

  // a cadeia de upsample soma todos os níveis → normaliza para "imagem
  // borrada" de mesma energia (sem isso o bloom vira um véu que levanta os pretos)
  vec3 bloom = texture(tBloom, vUv).rgb * uBloomNorm;
  // micro-contraste: luminância local vs. média larga (cadeia do bloom)
  if (uClarity > 0.0) {
    float Lc = luma(col), Lb = luma(bloom);
    col *= clamp(pow((Lc + 1e-3) / (Lb + 1e-3), uClarity), 0.6, 1.6);
  }
  col = mix(col, bloom, clamp(uBloom + uMenuBlur, 0.0, 1.0));
  // sujeira de lente acesa pelo bloom
  // (limiar: só fontes realmente fortes acendem a sujeira)
  vec3 dirt = texture(tDirt, vUv).rgb;
  float expo0 = texture(tExposure, vec2(0.5)).r * uExposure;
  vec3 hot = max(bloom * expo0 - 0.9, 0.0) / max(expo0, 1e-3);
  col += hot * dirt * uDirt;

  float exposure = texture(tExposure, vec2(0.5)).r * uExposure;
  col *= exposure;
  col += uFlash;

  // gradação em espaço de cena (log): balanço de branco, contraste, saturação
  col *= uWhiteBalance;
  float L = luma(col);
  col = mix(vec3(L), col, uSaturation);
  col = max(col, 0.0);
  // contraste em log em torno do cinza médio; nas altas o expoente cai para
  // ~1 (o ombro do ACES já comprime) — evita nuvens/fachadas "chapadas"
  vec3 kC = mix(vec3(uContrast), vec3(1.04), smoothstep(0.18, 2.0, col));
  col = 0.18 * pow(col / 0.18 + 1e-6, kC);

  // ACES (o three também divide por 0.6)
  col = aces(col / 0.6);

  // split-toning e lift/gain em espaço de exibição linear
  float Ld = luma(col);
  col *= mix(uShadowTint, uHighlightTint, smoothstep(0.02, 0.6, Ld));
  col = col * uGain + uLift * (1.0 - col);
  // ponto de preto: tira o "flare" residual (bloom/névoa) e reabre a faixa —
  // sombras profundas mas com detalhe (toe suave, não corte)
  col = max(col - uBlack, 0.0) * (1.0 / (1.0 - uBlack));
  col = col * col / (col + uBlack * 0.5 + 1e-6) * (1.0 + uBlack * 0.5);

  // vinheta (natural, cos^4-ish)
  float vig = 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 2.2);
  col *= vig;

  // dithering ANTES da quantização para 8 bits (o alvo LDR é RGBA8): ruído
  // triangular de ±1 LSB em sRGB — céu, névoa e fumaça sem degraus
  vec3 o = toSRGB(clamp(col, 0.0, 1.0));
  float n1 = ign(gl_FragCoord.xy + mod(uFrame, 64.0) * 7.31);
  float n2 = ign(gl_FragCoord.yx * 1.37 + 11.0 + mod(uFrame, 64.0) * 3.17);
  o += (n1 + n2 - 1.0) / 255.0;
  outColor = vec4(o, 1.0);
}`,Re=`
${$}
uniform sampler2D tLdr;
uniform vec2 uTexel;
uniform float uGrain;
uniform float uSharpen;
uniform float uFxaa;
uniform float uTime;

vec3 fxaa(vec2 uv) {
  vec3 rgbNW = texture(tLdr, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture(tLdr, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture(tLdr, uv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture(tLdr, uv + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 rgbM = texture(tLdr, uv).rgb;
  vec3 lw = vec3(0.299, 0.587, 0.114);
  float lNW = dot(rgbNW, lw), lNE = dot(rgbNE, lw), lSW = dot(rgbSW, lw), lSE = dot(rgbSE, lw), lM = dot(rgbM, lw);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 A = 0.5 * (texture(tLdr, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(tLdr, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 B = A * 0.5 + 0.25 * (texture(tLdr, uv + dir * -0.5).rgb + texture(tLdr, uv + dir * 0.5).rgb);
  float lB = dot(B, lw);
  return (lB < lMin || lB > lMax) ? A : B;
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 col;
  if (uFxaa > 0.5) col = fxaa(vUv);
  else col = texture(tLdr, vUv).rgb;
  if (uSharpen > 0.0) {
    // nitidez adaptativa ao contraste (estilo CAS)
    vec3 n = texture(tLdr, vUv + vec2(0.0, uTexel.y)).rgb;
    vec3 s = texture(tLdr, vUv - vec2(0.0, uTexel.y)).rgb;
    vec3 e = texture(tLdr, vUv + vec2(uTexel.x, 0.0)).rgb;
    vec3 w = texture(tLdr, vUv - vec2(uTexel.x, 0.0)).rgb;
    vec3 mn = min(col, min(min(n, s), min(e, w)));
    vec3 mx = max(col, max(max(n, s), max(e, w)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
    vec3 wgt = -amp * uSharpen * 0.2;
    col = clamp((col + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);
  }
  // grão de filme: mais forte nos meios-tons, animado
  float L = luma(col);
  float g = hash13(vec3(gl_FragCoord.xy, mod(uTime * 60.0, 997.0))) - 0.5;
  float g2 = hash13(vec3(gl_FragCoord.xy * 0.5 + 17.0, mod(uTime * 60.0, 991.0))) - 0.5;
  col += (g * 0.7 + g2 * 0.3) * uGrain * (0.35 + 0.65 * (1.0 - abs(L * 2.0 - 1.0)));
  // dithering contra banding (8 bits)
  col += (ign(gl_FragCoord.xy + 3.0) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`,ze={low:{msaa:0,ao:!1,aoSamples:6,vol:!1,volSteps:12,bloomLevels:5,motion:!1,dust:0,fxaa:!0,sharpen:0,dirt:!1,gi:0,taa:!1,contact:!1,far:1024,pcss:0},medium:{msaa:4,ao:!0,aoSamples:10,vol:!1,volSteps:14,bloomLevels:6,motion:!1,dust:0,fxaa:!1,sharpen:.3,dirt:!0,gi:12,taa:!1,contact:!0,far:1024,pcss:1024},high:{msaa:0,ao:!0,aoSamples:14,vol:!0,volSteps:20,bloomLevels:6,motion:!0,dust:700,fxaa:!1,sharpen:.75,dirt:!0,gi:20,taa:!0,contact:!0,far:2048,pcss:2048},ultra:{msaa:4,ao:!0,aoSamples:18,vol:!0,volSteps:28,bloomLevels:7,motion:!0,dust:1100,fxaa:!1,sharpen:.65,dirt:!0,gi:24,taa:!0,contact:!0,far:2048,pcss:4096}};function Be(){return{exposure:1,autoExposure:{enabled:!0,key:.16,strength:.6,minEV:-2,maxEV:2.2,biasEV:0,speedUp:2.5,speedDown:1.4},environmentIntensity:.55,indoorAmbient:.42,coveredAmbient:.4,bounce:.1,indoorTint:new N(1.03,1,.95),gi:{strength:3.6,radius:8},contact:1,bleed:.9,shadow:{lightSize:.02},ao:{radius:.75,intensity:3.2,bias:.6,strength:1},fog:{density:.0011,falloff:.045,base:0,start:22,max:.8,tint:new N(.93,.92,.88),sun:.06},taa:{alpha:.1,gamma:1},vol:{density:.0025,falloff:.09,base:0,maxDist:70,strength:.4,phaseG:.6,indoorDust:22},bloom:{strength:.09,radius:1,dirt:.8},grade:{whiteBalance:new N(1.02,1,.965),contrast:1.3,saturation:1.08,shadowTint:new N(.93,.99,1.06),highlightTint:new N(1.06,1,.92),lift:new N(.004,.006,.009),gain:new N(1,1,1),black:.0035},clarity:.08,lens:{ca:.006,vignette:.3,grain:.032,sharpen:null},menuBlur:0,motionBlur:.5,adsDof:1}}var Ve={name:`rendering`,order:20,async init(e){let{renderer:t,scene:n,camera:r,quality:i,bus:a}=e;this.ctx=e,this.params=Be(),this.flashAmt=0,this.debugView=null,this.frameIndex=0,this.stats={ms:0,passes:0},He(n),t.shadowMap.type=1,t.toneMapping=4,t.toneMappingExposure=1;let o=e.service(`world`);this.sun=o?.sun||null,this.atmo=new ne(t),this.sunDir=new T(.45,.62,.35).normalize(),this.shadowFit=new de,this.sun&&this.shadowFit.readDirection(this.sun,this.sunDir),this.atmo.setSun(this.sunDir,this.sun?.intensity??3);let s=n.background;if(this.ownsSky=(!s||s.isColor)&&e.params.get(`sky`)!==`world`,this.ownsSky&&(n.background=null,this.atmo.attach(n,r),this.worldSky=o?.sky||null,this.worldSky&&(this.worldSky.visible=!1),o?.environment&&n.environment===o.environment&&(n.environment=null)),n.fog){let e=n.fog;e.isFogExp2&&(this.params.fog.density=Math.min(.0013,e.density*.3)),n.fog=null}this.atmo.updateLut(!0),this.env=this.atmo.updateEnvironment(!0),this.applyEnvironment(),this.bounceLight=new c(16777215,0),this.bounceLight.name=`ironline-bounce`,this.bounceLight.castShadow=!1,n.add(this.bounceLight,this.bounceLight.target),this.dust=null,this.skyOcc=new me(512,110),this.atmo.dome.userData.noSkyOcclusion=!0,this.atmo.dome.userData.noSunView=!0,this.rsm=new Se({size:256,radius:24,color:!0,forward:.35,depthRange:400}),this.farView=null,this.ambient=new N(.1,.1,.1),this.ambientDirty=!0,this.jitter=new l,this.probe=e.quality.level===`low`?null:new Te(t,e.quality.level===`ultra`?192:128),this.taaFrames=0,this.dirtTex=De(11),this.buildMaterials(),this.configure(),this.offs=[a.on(`resize`,()=>this.resize()),a.on(`quality:change`,()=>this.configure())],this.prevViewProj=new m,this.hasPrev=!1,e.setRenderPipeline((e,t)=>this.render(e,t));let u=this,f=this.params;this.api=e.provide(`rendering`,{setExposure(e){f.exposure=e,t.toneMappingExposure=e},get exposure(){return f.exposure},get environment(){return u.env},get environmentIntensity(){return f.environmentIntensity},set environmentIntensity(e){f.environmentIntensity=e,u.applyEnvironment(),u.ambientDirty=!0},get sunDirection(){return u.sunDir},get sunColor(){return u.atmo.uniforms.uSunColor.value},get sunTransmittance(){return u.atmo.sunTransmittance},setFog(e){Object.assign(f.fog,e)},setVolumetrics(e){Object.assign(f.vol,e)},setAO(e){Object.assign(f.ao,e)},setBloom(e){Object.assign(f.bloom,e)},setGrade(e){Object.assign(f.grade,e)},setLens(e){Object.assign(f.lens,e)},setAutoExposure(e){Object.assign(f.autoExposure,e)},setGI(e){Object.assign(f.gi,e)},setContact(e){f.contact=e},setBleed(e){f.bleed=e},setShadow(e){Object.assign(f.shadow,e)},setTAA(e){Object.assign(f.taa,e)},get ambient(){return u.ambient},setSky(e){`takeover`in e&&(u.atmo.dome.visible=!!e.takeover,u.worldSky&&(u.worldSky.visible=!e.takeover)),Object.assign(u.atmo.params,e),u.atmo.uniforms.uCloudCover.value=u.atmo.params.cloudCover,u.atmo.uniforms.uCloudDensity.value=u.atmo.params.cloudDensity,u.atmo.uniforms.uSunDisk.value=u.atmo.params.sunDisk,u.atmo.uniforms.uSkySat.value=u.atmo.params.skySaturation,u.atmo.dirty=!0},setMenuBlur(e){f.menuBlur=e},flash(e=1){u.flashAmt=Math.max(u.flashAmt,e)},setDebug(e){u.debugView=e||null},get params(){return f},get stats(){return u.stats},readExposure(){let e=u.rt?.exp[u.expIndex];if(!e)return null;let n=new Uint16Array(4);return t.readRenderTargetPixels(e,0,0,1,1,n),{exposure:d.fromHalfFloat(n[0]),avgLum:d.fromHalfFloat(n[1])}},get hdr(){return!0}})},buildMaterials(){let e=e=>({value:e}),t=()=>({uProjInv:e(new m),uNearFar:e(new l(.05,700))});this.mats={ao:z(`ao`,Oe,{...t(),tDepth:e(null),uFullTexel:e(new l),uAoRes:e(new l),uRadius:e(1),uIntensity:e(1),uBias:e(.5),uProjScale:e(500),uFrame:e(0)},{AO_SAMPLES:12}),blur:z(`blur`,ke,{...t(),tSrc:e(null),tDepth:e(null),uDir:e(new l),uDepthSharp:e(8)}),vol:z(`vol`,Ae,{...t(),tDepth:e(null),tShadow:e(null),uViewInv:e(new m),uShadowMatrix:e(new m),uCamPos:e(new T),uMaxDist:e(60),uDensity:e(.01),uHeightFalloff:e(.1),uBaseHeight:e(0),uFrame:e(0),uShadowBias:e(.0015),tSkyOcc:e(null),uSkyOccMatrix:e(new m),uIndoorDust:e(0),tRsmDepth:e(null),uRsmMatrix:e(new m),uRsmOn:e(0)},{VOL_STEPS:20}),combine:z(`combine`,je,{...t(),tScene:e(null),tDepth:e(null),tAo:e(null),tVol:e(null),tVm:e(null),tLut:e(this.atmo.lut.texture),tGi:e(null),uViewInv:e(new m),uProj:e(new m),uPrevViewProj:e(new m),uCamPos:e(new T),uSunDir:e(this.sunDir),uSunDirView:e(new T),uSunRadiance:e(new N),uSunIrr:e(new N),uAmbient:e(new N),uCoveredAmb:e(.4),uSkyScale:e(1),uAoStrength:e(0),uGiStrength:e(0),uContact:e(0),uFogDensity:e(0),uFogFalloff:e(.05),uFogBase:e(0),uFogStart:e(10),uFogMax:e(.9),uFogTint:e(new N(1,1,1)),uFogSun:e(0),uVolStrength:e(0),uPhaseG:e(.6),uMotion:e(0),uVmBlur:e(0),uVmOn:e(1),uRes:e(new l),uFrame:e(0),tSkyOcc:e(null),uSkyOccMatrix:e(new m),uSkyOccOn:e(0),uIndoor:e(.4),uIndoorTint:e(new N(1,1,1)),uDebug:e(0),tShadow:e(null),uShadowMatrix:e(new m),tShadowRaw:e(null),uPcssOn:e(0),uShadowTexel:e(new l(1/4096,1/4096)),uShadowWorld:e(76),uShadowRange:e(259),uLightSize:e(.02),tFar:e(null),uFarMatrix:e(new m),uFarOn:e(0),uFarTexel:e(new l),tBleed:e(null),tBleed2:e(null),uBleed:e(0)}),gi:z(`gi`,Me,{...t(),tDepth:e(null),tRsmColor:e(null),tRsmDepth:e(null),uViewInv:e(new m),uRsmMatrix:e(new m),uRsmInv:e(new m),uSunDir:e(this.sunDir),uRadiusUv:e(.1),uSampleArea:e(1),uRsmTexel:e(new l),uFullTexel:e(new l),uFrame:e(0),tSkyOcc:e(null),uSkyOccMatrix:e(new m),uSkyOccOn:e(0)},{GI_SAMPLES:16}),taa:z(`taa`,Ne,{...t(),tCur:e(null),tHist:e(null),tDepth:e(null),tVm:e(null),uViewInv:e(new m),uPrevViewProj:e(new m),uCamPos:e(new T),uTexel:e(new l),uAlpha:e(.1),uHistValid:e(0),uGamma:e(1)}),down:z(`bloom-down`,Pe,{...t(),tSrc:e(null),uTexel:e(new l),uKaris:e(0)}),up:z(`bloom-up`,Fe,{...t(),tLow:e(null),tCur:e(null),uTexel:e(new l),uRadius:e(1),uCurWeight:e(1)}),exposure:z(`exposure`,Ie,{...t(),tSmall:e(null),tPrev:e(null),uRate:e(1),uKey:e(.16),uStrength:e(.6),uRange:e(new l(-2,2)),uBiasEV:e(0)}),tonemap:z(`tonemap`,Le,{...t(),tHdr:e(null),tBloom:e(null),tExposure:e(null),tDirt:e(this.dirtTex),uBloom:e(.05),uDirt:e(1),uExposure:e(1),uCA:e(0),uMenuBlur:e(0),uWhiteBalance:e(new N),uContrast:e(1),uSaturation:e(1),uShadowTint:e(new N),uHighlightTint:e(new N),uLift:e(new N),uGain:e(new N),uVignette:e(.3),uFlash:e(0),uClarity:e(0),uRes:e(new l),uBloomNorm:e(1),uBlack:e(0),uFrame:e(0)}),final:z(`final`,Re,{...t(),tLdr:e(null),uTexel:e(new l),uGrain:e(.03),uSharpen:e(0),uFxaa:e(0),uTime:e(0)}),debug:z(`debug`,`${$}
        uniform sampler2D tSrc; uniform float uMode;
        void main() {
          vec4 c = texture(tSrc, vUv);
          vec3 o = uMode < 0.5 ? c.rrr : uMode < 1.5 ? vec3(c.r * 4.0) : uMode < 2.5 ? vec3(fract(linearZ(c.r) / 20.0)) : uMode < 3.5 ? c.rgb / (1.0 + c.rgb) : c.rgb;
          outColor = vec4(pow(o, vec3(1.0 / 2.2)), 1.0);
        }`,{...t(),tSrc:e(null),uMode:e(0)})},this.quad=new R(this.mats.final)},configure(){let e=this.ctx.quality,t={...ze[e.level]||ze.high};e.msaa||(t.msaa=0),e.ssao||(t.ao=!1),e.volumetrics||(t.vol=!1),e.motionBlur||(t.motion=!1),e.taa===!1&&(t.taa=!1),e.msaa&&t.msaa===0&&!t.taa&&(t.msaa=4),e.shadows||(t.far=0),t.bloom=e.bloom!==!1,this.tier=t,this.shadowFit.configure(e);let n=(e,t,n)=>{e.defines[t]!==n&&(e.defines[t]=n,e.needsUpdate=!0)};n(this.mats.ao,`AO_SAMPLES`,t.aoSamples),n(this.mats.vol,`VOL_STEPS`,t.volSteps),t.gi&&n(this.mats.gi,`GI_SAMPLES`,t.gi),this.farView&&(!t.far||this.farView.size!==t.far)&&(this.farView.dispose(),this.farView=null),t.far&&!this.farView&&(this.farView=new Se({size:t.far,radius:190,color:!1,forward:.55,depthRange:700})),this.taaFrames=0;let r=e.shadows===!1?0:t.pcss;this.rawShadow&&this.rawShadow.size!==r&&(this.rawShadow.dispose(),this.rawShadow=null),r&&!this.rawShadow&&(this.rawShadow=new fe(r));let i=this.ctx.scene;this.dust&&(!t.dust||this.dust.count!==t.dust)&&(i.remove(this.dust.points),this.dust.dispose(),this.dust=null),t.dust&&!this.dust&&this.sun&&(this.dust=new pe(t.dust,16),this.dust.count=t.dust,i.add(this.dust.points)),this.disposeTargets(),this.resize()},disposeTargets(){if(this.rt){for(let e of Object.values(this.rt))Array.isArray(e)?e.forEach(e=>e.dispose()):e?.dispose?.();this.rt=null}},resize(){let{renderer:r}=this.ctx,i=r.getDrawingBufferSize(new l),o=Math.max(1,i.x),c=Math.max(1,i.y);if(this.rt&&this.size?.x===o&&this.size?.y===c)return;this.disposeTargets(),this.size=new l(o,c);let u=this.tier,d=Math.ceil(o/2),p=Math.ceil(c/2),m=new e(o,c,s);m.format=t,m.minFilter=m.magFilter=j;let h=new w(o,c,{type:a,samples:u.msaa,depthBuffer:!0,depthTexture:m,minFilter:f,magFilter:f});h.texture.colorSpace=``;let g=new w(o,c,{type:a,samples:u.msaa,depthBuffer:!0,minFilter:f,magFilter:f});g.texture.colorSpace=``;let _=[],v=[],y=d,b=p;for(let e=0;e<u.bloomLevels;e++)_.push(B(y,b)),v.push(B(y,b)),y=Math.max(1,Math.ceil(y/2)),b=Math.max(1,Math.ceil(b/2));let x=[0,1].map(()=>B(1,1,{type:a,filter:j}));this.rt={scene:h,vm:g,ao:B(d,p,{type:n}),ao2:B(d,p,{type:n}),vol:B(d,p),vol2:B(d,p),combine:B(o,c),gi:B(Math.ceil(o/4),Math.ceil(c/4)),gi2:B(Math.ceil(o/4),Math.ceil(c/4)),hist:u.taa?[B(o,c),B(o,c)]:[],ldr:B(o,c,{type:n}),bloom:_,bloomUp:v,exp:x,white:B(1,1,{type:n}),zero:B(1,1)},this.expIndex=0,this.histIndex=0,this.taaFrames=0,this.expPrimed=!1,this.needsClears=!0,this.bleedPrimed=!1},frame(e,t){let{camera:n}=t,r=this.sun||t.service(`world`)?.sun||null;r&&!this.sun&&(this.sun=r),r&&(this.shadowFit.readDirection(r,this.sunDir),this.shadowFit.update(r,n,this.sunDir)&&(this.shadowDirty=!0));let i=r?.intensity??3;if(this.atmo.setSun(this.sunDir,i),this.atmo.uniforms.uTime.value=t.time.now,this.atmo.updateLut()){this.ambientDirty=!0;let e=this.atmo.updateEnvironment();e&&(this.env=e,this.applyEnvironment())}let a=this.bounceLight,o=Math.max(this.sunDir.y,0);if(a.position.set(-this.sunDir.x*.5,-1,-this.sunDir.z*.5).add(n.position),a.target.position.copy(n.position),a.target.updateMatrixWorld(),a.color.copy(this.atmo.params.groundAlbedo).multiply(this.atmo.sunTransmittance),a.intensity=this.tier?.gi&&this.params.gi.strength>0?0:i*this.params.bounce*o*2.5,this.ambientDirty&&this.updateAmbient(t),this.dust){let e=(this.size?.y||1080)/(2*Math.tan(O.degToRad(n.fov)/2));this.dust.update(n,r,this.atmo.uniforms.uSunColor.value,t.time.now,e),this.dust.uniforms.uIntensity.value=.35}this.flashAmt*=Math.exp(-(e||1/60)*3.5)},updateAmbient(e){let t=this.atmo.readAmbient(e.renderer);if(!t)return;this.ambientDirty=!1;let n=this.ambient.setRGB(0,0,0);e.scene.environment&&(n.r=(t.up.r+t.side.r)*.5,n.g=(t.up.g+t.side.g)*.5,n.b=(t.up.b+t.side.b)*.5,n.multiplyScalar(e.scene.environmentIntensity??1));let r=e.service(`world`)?.hemi;if(r?.visible!==!1&&r?.isHemisphereLight){let e=r.intensity/Math.PI;n.r+=(r.color.r*.75+r.groundColor.r*.25)*e,n.g+=(r.color.g*.75+r.groundColor.g*.25)*e,n.b+=(r.color.b*.75+r.groundColor.b*.25)*e}},applyEnvironment(){let{scene:e,vm:t}=this.ctx;this.env&&((!e.environment||e.environment===this.prevEnv)&&(e.environment=this.env),e.environmentIntensity=this.params.environmentIntensity,t?.scene&&!this.probe?.texture&&(!t.scene.environment||t.scene.environment===this.prevEnv)&&(t.scene.environment=this.env,t.scene.environmentIntensity=this.params.environmentIntensity*.9),this.prevEnv=this.env)},render(e,t){let n=performance.now(),{renderer:r,scene:i,camera:a,vm:o}=e;this.rt||this.resize();let s=this.rt,c=this.mats,l=this.params,u=this.tier,d=this.quad,f=this.size.x,p=this.size.y,m=0,h=(e,t)=>{d.material=e,d.render(r,t),m++},g=r.getClearColor(new N),_=r.getClearAlpha();this.needsClears&&=(r.setClearColor(16777215,1),r.setRenderTarget(s.white),r.clear(),r.setClearColor(0,0),r.setRenderTarget(s.zero),r.clear(),!1);let v=this.sun,y=!!(v?.castShadow&&r.shadowMap.enabled),b=[this.atmo.dome,this.dust?.points,this.worldSky].filter(Boolean),x=!!(u.gi&&l.gi.strength>0&&v),S=!y||!!v.shadow.map;x&&S&&this.rsm.update(r,i,a,this.sunDir,{moveFrac:.06,maxAge:6,hide:b})&&m++;let C=!!(this.farView&&y);if(C&&S&&this.farView.update(r,i,a,this.sunDir,{moveFrac:.08,maxAge:240,hide:b})&&m++,this.probe&&o.visible&&S){let e=this.probe.texture;if(this.probe.update(i,a,{hide:[this.dust?.points]})){m+=6;let t=o.scene.environment;(!t||t===this.env||t===this.prevEnv||t===e)&&(o.scene.environment=this.probe.texture)}}let w=!!(u.taa&&s.hist.length),T=0,E=0;if(w){let e=Ke(this.frameIndex)%16+1;T=(Ge(e,2)-.5)*2/f,E=(Ge(e,3)-.5)*2/p,a.projectionMatrix.elements[8]+=T,a.projectionMatrix.elements[9]+=E,o.camera.projectionMatrix.elements[8]+=T,o.camera.projectionMatrix.elements[9]+=E}r.shadowMap.autoUpdate=!1;let D=e.shot?3:2;if(r.shadowMap.needsUpdate=!!this.shadowDirty||this.frameIndex%D===0||!v?.shadow?.map,this.shadowDirty=!1,this.rawShadow&&y&&(r.shadowMap.needsUpdate||!this.rawShadow.valid)){let e=r.shadowMap.needsUpdate;this.rawShadow.render(r,i,v,b),r.shadowMap.needsUpdate=e,m++}r.setClearColor(0,1),r.setRenderTarget(s.scene),r.clear(),r.render(i,a),m++;let k=o.visible;k&&(r.shadowMap.needsUpdate=!0,r.setClearColor(0,0),r.setRenderTarget(s.vm),r.clear(),r.render(o.scene,o.camera),m++),r.setClearColor(g,_),w&&(a.projectionMatrix.elements[8]-=T,a.projectionMatrix.elements[9]-=E,o.camera.projectionMatrix.elements[8]-=T,o.camera.projectionMatrix.elements[9]-=E);let A=Ue.multiplyMatrices(a.projectionMatrix,a.matrixWorldInverse);this.hasPrev||=(this.prevViewProj.copy(A),!0);let j=We.copy(this.prevViewProj);this.prevViewProj.copy(A);let M=w?this.frameIndex:e.shot?0:this.frameIndex%8,P=!!this.skyOcc&&(l.indoorAmbient<.999||x);P&&this.skyOcc.update(r,i,a);let F=s.scene.depthTexture,I=e=>{e.uniforms.uProjInv.value.copy(a.projectionMatrixInverse),e.uniforms.uNearFar.value.set(a.near,a.far)};for(let e of Object.values(c))I(e);let L=this.frameIndex++,R=s.white.texture;if(u.ao){let e=c.ao.uniforms;e.tDepth.value=F,e.uFullTexel.value.set(1/f,1/p),e.uAoRes.value.set(s.ao.width,s.ao.height),e.uRadius.value=l.ao.radius,e.uIntensity.value=l.ao.intensity,e.uBias.value=l.ao.bias,e.uProjScale.value=s.ao.height/(2*Math.tan(O.degToRad(a.fov)/2)),e.uFrame.value=M,h(c.ao,s.ao),this.blur(s.ao,s.ao2,F,10,h),R=s.ao.texture}let z=s.zero.texture;if(x&&this.rsm.valid){let e=c.gi.uniforms;e.tDepth.value=F,e.tRsmColor.value=this.rsm.rt.texture,e.tRsmDepth.value=this.rsm.rt.depthTexture,e.uViewInv.value.copy(a.matrixWorld),e.uRsmMatrix.value.copy(this.rsm.matrix),e.uRsmInv.value.copy(this.rsm.inverse);let t=l.gi.radius;e.uRadiusUv.value=t/(2*this.rsm.radius),e.uSampleArea.value=Math.PI*t*t/(c.gi.defines.GI_SAMPLES||16),e.uRsmTexel.value.set(1/this.rsm.size,1/this.rsm.size),e.uFullTexel.value.set(1/f,1/p),e.uFrame.value=M,e.uSkyOccOn.value=+!!P,P&&(e.tSkyOcc.value=this.skyOcc.rt.depthTexture,e.uSkyOccMatrix.value.copy(this.skyOcc.matrix)),h(c.gi,s.gi),this.blur(s.gi,s.gi2,F,6,h),z=s.gi.texture}let B=s.zero.texture,V=y?v.shadow.map?.depthTexture:null;if(u.vol&&V&&l.vol.strength>0){let t=c.vol.uniforms;t.tDepth.value=F,t.tShadow.value=V,t.uViewInv.value.copy(a.matrixWorld),t.uShadowMatrix.value.copy(v.shadow.matrix),a.getWorldPosition(t.uCamPos.value),t.uMaxDist.value=l.vol.maxDist,t.uDensity.value=l.vol.density,t.uHeightFalloff.value=l.vol.falloff,t.uBaseHeight.value=l.vol.base,t.uFrame.value=w?L:e.shot?0:L,P?(t.tSkyOcc.value=this.skyOcc.rt.depthTexture,t.uSkyOccMatrix.value.copy(this.skyOcc.matrix),t.uIndoorDust.value=l.vol.indoorDust):t.uIndoorDust.value=0,t.uRsmOn.value=x&&this.rsm.valid?1:0,t.uRsmOn.value&&(t.tRsmDepth.value=this.rsm.rt.depthTexture,t.uRsmMatrix.value.copy(this.rsm.matrix)),h(c.vol,s.vol),this.blur(s.vol,s.vol2,F,4,h),B=s.vol.texture}{let t=c.combine.uniforms;t.tScene.value=s.scene.texture,t.tDepth.value=F,t.tAo.value=R,t.tVol.value=B,t.tVm.value=k?s.vm.texture:s.zero.texture,t.uVmOn.value=+!!k,t.tGi.value=z,t.uGiStrength.value=z===s.zero.texture?0:l.gi.strength,t.uViewInv.value.copy(a.matrixWorld),t.uProj.value.copy(a.projectionMatrix),a.getWorldPosition(t.uCamPos.value),t.uPrevViewProj.value.copy(j),t.uFrame.value=M,t.uMotion.value=u.motion&&!e.shot?l.motionBlur:0,t.uSunRadiance.value.copy(this.atmo.uniforms.uSunColor.value),t.uSunDirView.value.copy(this.sunDir).transformDirection(a.matrixWorldInverse),v?t.uSunIrr.value.copy(v.color).multiplyScalar(v.intensity):t.uSunIrr.value.setRGB(0,0,0),t.uAmbient.value.copy(this.ambient),t.uCoveredAmb.value=l.coveredAmbient,t.uContact.value=u.contact?l.contact:0,t.uFogSun.value=l.fog.sun??0,t.uFarOn.value=C&&this.farView.valid?1:0,C&&(t.tFar.value=this.farView.rt.depthTexture,t.uFarMatrix.value.copy(this.farView.matrix),t.uFarTexel.value.set(1/this.farView.size,1/this.farView.size)),t.uSkyScale.value=this.atmo.uniforms.uSkyScale.value,t.uAoStrength.value=u.ao?l.ao.strength:0,t.uFogDensity.value=l.fog.density,t.uFogFalloff.value=l.fog.falloff,t.uFogBase.value=l.fog.base,t.uFogStart.value=l.fog.start,t.uFogMax.value=l.fog.max,t.uFogTint.value.copy(l.fog.tint),t.uVolStrength.value=B===s.zero.texture?0:l.vol.strength,t.uPhaseG.value=l.vol.phaseG;let n=e.service(`weapon`)?.ads||0;t.uVmBlur.value=n*l.adsDof,t.uRes.value.set(f,p),P&&(t.tSkyOcc.value=this.skyOcc.rt.depthTexture,t.uSkyOccMatrix.value.copy(this.skyOcc.matrix)),t.uSkyOccOn.value=+!!P;{let e=s.bloomUp.length,n=Math.min(2,e-2),r=Math.min(3,e-2),i=this.bleedPrimed&&P&&l.bleed>0&&n>=0;t.uBleed.value=i?l.bleed/Math.max(1,e-n):0,t.tBleed.value=i?s.bloomUp[n].texture:s.zero.texture,t.tBleed2.value=i?s.bloomUp[r].texture:s.zero.texture}t.uIndoor.value=l.indoorAmbient,t.uIndoorTint.value.copy(l.indoorTint),t.uDebug.value={occ:1,gi:2,albedo:3}[this.debugView]||0;let r=+!!V;if((c.combine.defines.HAS_SHADOW||0)!==r&&(r?c.combine.defines.HAS_SHADOW=1:delete c.combine.defines.HAS_SHADOW,c.combine.needsUpdate=!0),V){t.tShadow.value=V,t.uShadowMatrix.value.copy(v.shadow.matrix);let e=v.shadow.camera;t.uShadowTexel.value.set(1/v.shadow.mapSize.x,1/v.shadow.mapSize.y),t.uShadowWorld.value=e.right-e.left,t.uShadowRange.value=e.far-e.near,t.uLightSize.value=l.shadow.lightSize;let n=!!this.rawShadow?.valid;t.uPcssOn.value=+!!n,t.tShadowRaw.value=n?this.rawShadow.rt.depthTexture:null}h(c.combine,s.combine)}let H=s.combine;if(w){let t=c.taa.uniforms,n=s.hist[this.histIndex],r=s.hist[1-this.histIndex];t.tCur.value=s.combine.texture,t.tHist.value=n.texture,t.tDepth.value=F,t.tVm.value=k?s.vm.texture:s.zero.texture,t.uViewInv.value.copy(a.matrixWorld),t.uPrevViewProj.value.copy(j),a.getWorldPosition(t.uCamPos.value),t.uTexel.value.set(1/f,1/p),t.uHistValid.value=+(this.taaFrames>0),t.uAlpha.value=e.shot?Math.max(1/(this.taaFrames+1),.06):l.taa.alpha,t.uGamma.value=e.shot?Math.max(l.taa.gamma,1.75):l.taa.gamma,h(c.taa,r),this.histIndex=1-this.histIndex,this.taaFrames++,H=r}else this.taaFrames=0;let U=s.bloom.length,W=H;for(let e=0;e<U;e++){let t=c.down.uniforms;t.tSrc.value=W.texture,t.uTexel.value.set(1/W.width,1/W.height),t.uKaris.value=+(e===0),h(c.down,s.bloom[e]),W=s.bloom[e]}let G=s.bloom[U-1];for(let e=U-2;e>=0;e--){let t=c.up.uniforms;t.tLow.value=G.texture,t.tCur.value=s.bloom[e].texture,t.uTexel.value.set(1/G.width,1/G.height),t.uRadius.value=l.bloom.radius,t.uCurWeight.value=1,h(c.up,s.bloomUp[e]),G=s.bloomUp[e]}let K=s.bloomUp[0].texture;this.bleedPrimed=!0;let q=l.autoExposure,J;if(q.enabled){let n=c.exposure.uniforms,r=s.exp[this.expIndex],i=s.exp[1-this.expIndex];n.tSmall.value=s.bloom[Math.min(3,U-1)].texture,n.tPrev.value=this.expPrimed?r.texture:s.zero.texture,n.uKey.value=q.key,n.uStrength.value=q.strength,n.uRange.value.set(q.minEV,q.maxEV),n.uBiasEV.value=q.biasEV;let a=Math.max(t||1/60,1/240);n.uRate.value=e.shot?1:1-Math.exp(-a*q.speedUp),h(c.exposure,i),this.expIndex=1-this.expIndex,this.expPrimed=!0,J=i.texture}else J=s.white.texture;{let e=c.tonemap.uniforms,t=l.grade;e.tHdr.value=H.texture,e.tBloom.value=K,e.tExposure.value=J,e.uBloom.value=u.bloom?l.bloom.strength:0,e.uDirt.value=u.dirt&&u.bloom?l.bloom.dirt:0,e.uExposure.value=l.exposure,e.uCA.value=l.lens.ca,e.uMenuBlur.value=l.menuBlur,e.uWhiteBalance.value.copy(t.whiteBalance),e.uContrast.value=t.contrast,e.uSaturation.value=t.saturation,e.uShadowTint.value.copy(t.shadowTint),e.uHighlightTint.value.copy(t.highlightTint),e.uLift.value.copy(t.lift),e.uGain.value.copy(t.gain),e.uVignette.value=l.lens.vignette,e.uFlash.value=this.flashAmt,e.uClarity.value=u.bloom?l.clarity:0,e.uRes.value.set(f,p),e.uBloomNorm.value=1/Math.max(1,U),e.uBlack.value=t.black??0,e.uFrame.value=L,h(c.tonemap,s.ldr)}{let t=c.final.uniforms;t.tLdr.value=s.ldr.texture,t.uTexel.value.set(1/f,1/p),t.uGrain.value=l.lens.grain,t.uFxaa.value=+!!u.fxaa,t.uSharpen.value=l.lens.sharpen??u.sharpen,t.uTime.value=e.time.now,h(c.final,null)}this.debugView===`occ`||this.debugView===`gi`||this.debugView===`albedo`?(c.debug.uniforms.tSrc.value=s.combine.texture,c.debug.uniforms.uMode.value=4,h(c.debug,null)):this.debugView&&this.drawDebug(F,R,B,K,h),r.setRenderTarget(null),this.stats.ms=performance.now()-n,this.stats.passes=m},blur(e,t,n,r,i){let a=this.mats.blur.uniforms;a.tDepth.value=n,a.uDepthSharp.value=r,a.tSrc.value=e.texture,a.uDir.value.set(1/e.width,0),i(this.mats.blur,t),a.tSrc.value=t.texture,a.uDir.value.set(0,1/e.height),i(this.mats.blur,e)},drawDebug(e,t,n,r,i){let a=this.mats.debug,o={ao:[t,0],vol:[n,1],depth:[e,2],bloom:[r,3]}[this.debugView];o&&(a.uniforms.tSrc.value=o[0],a.uniforms.uMode.value=o[1],i(a,null))},dispose(e){this.offs?.forEach(e=>e()),e.renderer.shadowMap.autoUpdate=!0,e.setRenderPipeline(null),this.disposeTargets(),Object.values(this.mats||{}).forEach(e=>e.dispose()),this.atmo?.dome.removeFromParent(),this.atmo?.dispose(),this.dust?.points.removeFromParent(),this.dust?.dispose(),this.skyOcc?.dispose(),this.rsm?.dispose(),this.probe?.dispose(),this.farView?.dispose(),this.rawShadow?.dispose(),this.bounceLight?.removeFromParent(),this.dirtTex?.dispose()}};function He(e){let t=`material.roughness += geometryRoughness;`,n=A.lights_physical_fragment;!n.includes(`IRONLINE_SAA`)&&n.includes(t)&&(A.lights_physical_fragment=n.replace(t,`${t}
// IRONLINE_SAA: filtro de rugosidade pela variância da normal em tela
{
  vec3 ndx = dFdx( normal ), ndy = dFdy( normal );
  float kVar = 0.25 * ( dot( ndx, ndx ) + dot( ndy, ndy ) );
  float kern = min( 2.0 * kVar, 0.18 );
  float a = material.roughness * material.roughness;
  material.roughness = sqrt( sqrt( clamp( a * a + kern, 0.0, 1.0 ) ) );
}`),e?.traverse(e=>{let t=Array.isArray(e.material)?e.material:e.material?[e.material]:[];for(let e of t)e.isMeshStandardMaterial&&(e.needsUpdate=!0)}))}var Ue=new m,We=new m;function Ge(e,t){let n=1,r=0;for(;e>0;)n/=t,r+=e%t*n,e=Math.floor(e/t);return r}var Ke=e=>e;export{Ve as default};
//# sourceMappingURL=rendering-BGAFGx64.js.map