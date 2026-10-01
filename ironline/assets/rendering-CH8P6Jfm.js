import{D as e,Dt as t,E as n,Et as r,G as i,I as a,J as o,K as s,M as c,P as l,T as u,Tt as d,U as f,X as p,Y as m,b as h,bt as g,et as _,h as v,ht as y,j as b,kt as x,lt as S,m as C,mt as w,nt as T,o as E,p as D,s as ee,st as O,ut as k,w as A,x as j,y as M}from"./three-DWgVTnfd.js";var N=`
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,P=new C;P.setAttribute(`position`,new b([-1,-1,0,3,-1,0,-1,3,0],3));var F=new T(-1,1,1,-1,0,1),I=class{constructor(e){this.mesh=new m(P,e),this.mesh.frustumCulled=!1}get material(){return this.mesh.material}set material(e){this.mesh.material=e}render(e,t,n=!1){e.setRenderTarget(t),n&&e.clear(),e.render(this.mesh,F)}dispose(){this.mesh.material.dispose()}};function L(e,t,n={},r={}){return new k({name:`ironline-${e}`,glslVersion:l,uniforms:n,defines:r,vertexShader:N,fragmentShader:`precision highp float;\nprecision highp sampler2D;\nprecision highp sampler2DShadow;\n${t}`,depthTest:!1,depthWrite:!1,blending:0})}function R(e,t,{type:n=a,filter:r=f,format:i=S}={}){let o=new x(Math.max(1,e),Math.max(1,t),{type:n,format:i,minFilter:r,magFilter:r,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1,wrapS:M,wrapT:M});return o.texture.colorSpace=``,o}var z=6360,B=6460,V=[.005802,.013558,.0331],H=.0044,U=[65e-5,.001881,85e-6],W=8,G=1.2,K=`
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
`,te=`
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec3 uSunDir;
uniform float uHaze;
uniform float uAltitude;
uniform vec3 uGroundAlbedo;
${K}

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
`;function ne(e,t){return new y({name:t?`ironline-sky-env`:`ironline-sky`,uniforms:e,defines:t?{ENV_MODE:1}:{},side:1,depthWrite:!1,depthTest:!1,fog:!1,toneMapped:!0,vertexShader:`
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
      ${K}

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
      }`})}var re=class{constructor(e,n={}){this.renderer=e,this.sunDir=new t(.5,.7,.3).normalize(),this.params={haze:.6,altitude:.15,groundAlbedo:new h(.28,.26,.23),skyScale:2.2,sunDisk:18,skySaturation:1.22,cloudCover:.5,cloudDensity:1.15,cloudWind:new r(.004,.0015),...n},this.lut=new x(192,108,{type:a,minFilter:f,magFilter:f,wrapS:M,wrapT:M,depthBuffer:!1}),this.lut.texture.colorSpace=``,this.lutQuad=new I(new k({name:`ironline-skylut`,glslVersion:l,uniforms:{uSunDir:{value:this.sunDir.clone()},uHaze:{value:this.params.haze},uAltitude:{value:this.params.altitude},uGroundAlbedo:{value:this.params.groundAlbedo}},vertexShader:N,fragmentShader:te,depthTest:!1,depthWrite:!1})),this.uniforms={uLut:{value:this.lut.texture},uSunDir:{value:this.sunDir},uSunColor:{value:new h(1,1,1)},uSkyScale:{value:1},uSunDisk:{value:this.params.sunDisk},uSkySat:{value:this.params.skySaturation},uTime:{value:0},uCloudCover:{value:this.params.cloudCover},uCloudDensity:{value:this.params.cloudDensity},uCloudWind:{value:this.params.cloudWind}};let i=new g(1,48,24);this.dome=new m(i,ne(this.uniforms,!1)),this.dome.name=`ironline-sky`,this.dome.frustumCulled=!1,this.dome.renderOrder=-1e6,this.dome.castShadow=this.dome.receiveShadow=!1,this.dome.matrixAutoUpdate=!1,this.envScene=new w,this.envDome=new m(i,ne(this.uniforms,!0)),this.envDome.scale.setScalar(100),this.envDome.frustumCulled=!1,this.envScene.add(this.envDome),this.pmrem=new E(e),this.envRT=null,this.sunIntensity=3,this.sunTransmittance=new h(1,1,1),this._lastLutDir=new t(0,-2,0),this._lastEnvDir=new t(0,-2,0),this._lastEnvKey=``,this.dirty=!0}attach(e,t){e.add(this.dome),this.dome.onBeforeRender=(e,t,n)=>{let r=Math.min(n.far*.9,5e3);this.dome.matrixWorld.makeScale(r,r,r).setPosition(n.getWorldPosition(ie))}}setSun(e,t){this.sunDir.copy(e).normalize(),this.sunIntensity=t,ae(this.sunDir,this.params,this.sunTransmittance),this.uniforms.uSunColor.value.copy(this.sunTransmittance).multiplyScalar(t),this.uniforms.uSkyScale.value=this.params.skyScale*t}updateLut(e=!1){if(!e&&!this.dirty&&this._lastLutDir.angleTo(this.sunDir)<.002)return!1;let t=this.lutQuad.material.uniforms;return t.uSunDir.value.copy(this.sunDir),t.uHaze.value=this.params.haze,t.uAltitude.value=this.params.altitude,this.lutQuad.render(this.renderer,this.lut),this._lastLutDir.copy(this.sunDir),this.dirty=!1,!0}updateEnvironment(e=!1){let t=`${this.params.cloudCover.toFixed(3)}|${this.params.haze.toFixed(3)}|${this.uniforms.uSkyScale.value.toFixed(3)}`;if(!e&&this.envRT&&this._lastEnvDir.angleTo(this.sunDir)<.03&&t===this._lastEnvKey)return null;let n=this.envRT;return this.envRT=this.pmrem.fromScene(this.envScene,0,.1,1e3),this.envRT.texture.name=`ironline-env`,n?.dispose(),this._lastEnvDir.copy(this.sunDir),this._lastEnvKey=t,this.envRT.texture}readAmbient(e){let t=this.lut.width,n=this.lut.height,r=new Uint16Array(t*n*4);try{e.readRenderTargetPixels(this.lut,0,0,t,n,r)}catch{return null}let i=A.fromHalfFloat,a=[0,0,0],o=[0,0,0];for(let e=0;e<n;e++){let s=((e+.5)/n-.5)*2,c=Math.sign(s)*s*s*Math.PI*.5,l=Math.cos(c)*(2*Math.PI*Math.abs(s))*(1/n)*(Math.PI/t)*2,u=Math.max(Math.sin(c),0),d=Math.cos(c)/Math.PI;for(let n=0;n<t;n++){let s=(e*t+n)*4;for(let e=0;e<3;e++){let t=i(r[s+e]);Number.isFinite(t)&&(a[e]+=t*u*l,o[e]+=t*d*l)}}}let s=this.uniforms.uSkyScale.value/Math.PI;return this.ambientUp=new h(a[0]*s,a[1]*s,a[2]*s),this.ambientSide=new h(o[0]*s,o[1]*s,o[2]*s),{up:this.ambientUp,side:this.ambientSide}}dispose(){this.lut.dispose(),this.envRT?.dispose(),this.pmrem.dispose(),this.dome.geometry.dispose(),this.dome.material.dispose(),this.envDome.material.dispose(),this.lutQuad.dispose()}},ie=new t;function ae(e,t,n=new h){let r=[0,z+t.altitude,0],a=[e.x,e.y,e.z],o=r[0]*a[0]+r[1]*a[1]+r[2]*a[2],c=r[0]*r[0]+r[1]*r[1]+r[2]*r[2]-B*B,l=(-o+Math.sqrt(Math.max(o*o-c,0)))/64,u=0,d=0,f=0;for(let e=0;e<64;e++){let n=(e+.5)*l,i=r[0]+a[0]*n,o=r[1]+a[1]*n,s=r[2]+a[2]*n,c=Math.hypot(i,o,s)-z;u+=Math.exp(-c/W)*l,d+=Math.exp(-c/G)*t.haze*l,f+=Math.max(0,1-Math.abs(c-25)/15)*l}let p=[0,1,2].map(e=>Math.exp(-(V[e]*u+H*d+U[e]*f))),m=s.smoothstep(e.y,-.03,.02);return n.setRGB(p[0]*m,p[1]*m,p[2]*m,i)}var oe=new t,q=new t,J=new t,Y=new o,se=new o,ce=new t(0,1,0),X=new t,le=new t,ue=class{constructor(){this.radius=50,this.mapSize=2048,this.distance=140,this.softness=2,this.lastDir=new t(0,1,0)}configure(e){let t=e.level;this.radius={low:30,medium:34,high:38,ultra:46}[t]??38;let n=e.shadowMapSize||2048;this.mapSize={low:n,medium:Math.max(n,2048),high:Math.max(n,4096),ultra:Math.max(n,4096)}[t]??n,this.softness={low:1.2,medium:1.3,high:1.1,ultra:1.2}[t]??1.2}readDirection(e,t){e.updateMatrixWorld(),e.target.updateMatrixWorld();let n=X.setFromMatrixPosition(e.matrixWorld),r=le.setFromMatrixPosition(e.target.matrixWorld);return t.subVectors(n,r),t.lengthSq()<1e-8&&t.copy(this.lastDir),t.normalize()}update(e,n,r){if(!e.castShadow)return!1;let i=e.shadow;i.mapSize.x!==this.mapSize&&(i.mapSize.setScalar(this.mapSize),i.map?.dispose(),i.map=null),this.lastDir.copy(r);let a=this.radius;n.getWorldDirection(q),q.y*=.3,q.normalize(),J.copy(n.getWorldPosition(X)).addScaledVector(q,a*.5),Y.lookAt(le.set(0,0,0),oe.copy(r).negate(),Math.abs(r.y)>.99?q:ce),se.copy(Y).invert(),J.applyMatrix4(se);let o=2*a/this.mapSize;J.x=Math.round(J.x/o)*o,J.y=Math.round(J.y/o)*o,J.applyMatrix4(Y);let s=e.parent,c=e.target,l=X.copy(J).addScaledVector(r,this.distance);s?(s.updateMatrixWorld(),e.position.copy(s.worldToLocal(l))):e.position.copy(l);let u=oe.copy(J);c.parent?c.position.copy(c.parent.worldToLocal(u)):c.position.copy(u),e.updateMatrixWorld(),c.updateMatrixWorld();let d=i.camera;(d.right!==a||d.far!==this.distance+120)&&(d.left=-a,d.right=a,d.top=a,d.bottom=-a,d.near=1,d.far=this.distance+120,d.updateProjectionMatrix());let f=!this.lastCenter||this.lastCenter.distanceToSquared(J)>1e-8||this.lastDirKey.angleTo(r)>1e-5;return f&&((this.lastCenter||=new t).copy(J),(this.lastDirKey||=new t).copy(r)),i.radius=this.softness,i.bias=-15e-5,i.normalBias=o*1.4,i.blurSamples=8,f}},de=class{constructor(e=900,n=14){let r=new Float32Array(e*3),i=new Float32Array(e),a=12345,s=()=>(a=a*16807%2147483647)/2147483647;for(let t=0;t<e;t++)r[t*3]=s()*n,r[t*3+1]=s()*n*.5,r[t*3+2]=s()*n,i[t]=s();let c=new C;c.setAttribute(`position`,new D(r,3)),c.setAttribute(`aRnd`,new D(i,1)),this.uniforms={uCam:{value:new t},uBox:{value:new t(n,n*.5,n)},uTime:{value:0},uShadow:{value:null},uShadowMatrix:{value:new o},uSunColor:{value:new h(1,1,1)},uAmbient:{value:new h(.02,.022,.026)},uIntensity:{value:1},uPxScale:{value:600}};let l=new y({name:`ironline-dust`,uniforms:this.uniforms,transparent:!0,depthWrite:!1,blending:2,fog:!1,vertexShader:`
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
        }`});this.points=new O(c,l),this.points.name=`ironline-dust`,this.points.frustumCulled=!1,this.points.renderOrder=10,this.points.visible=!1,this.points.onBeforeRender=()=>{let e=this._sun?.shadow;e?.map?.depthTexture&&(this.uniforms.uShadow.value=e.map.depthTexture,this.uniforms.uShadowMatrix.value.copy(e.matrix))}}update(e,t,n,r,i){let a=this.uniforms;e.getWorldPosition(a.uCam.value),a.uTime.value=r,a.uPxScale.value=i,this._sun=t;let o=t?.castShadow&&t.shadow.map?.depthTexture;this.points.visible=!!o&&this.enabled!==!1,o&&(a.uShadow.value=o,a.uShadowMatrix.value.copy(t.shadow.matrix),a.uSunColor.value.copy(n))}dispose(){this.points.geometry.dispose(),this.points.material.dispose()}},fe=class{constructor(e=512,r=110){this.size=e,this.extent=r,this.height=260;let i=new n(e,e,c);i.format=u,i.minFilter=i.magFilter=_,this.rt=new x(e,e,{depthBuffer:!0,depthTexture:i,type:d});let a=r/2;this.camera=new T(-a,a,a,-a,1,this.height+60),this.camera.up.set(0,0,-1),this.override=new p({colorWrite:!1,side:2}),this.center=new t(1e9,0,0),this.age=0,this.valid=!1,this.matrix=new o}update(e,t,n,r=!1){let i=n.getWorldPosition(pe);this.age++;let a=Math.hypot(i.x-this.center.x,i.z-this.center.z);if(!r&&this.valid&&a<this.extent*.15&&this.age<30)return!1;let o=this.extent/this.size;this.center.set(Math.round(i.x/o)*o,0,Math.round(i.z/o)*o);let s=this.camera;s.position.set(this.center.x,i.y+this.height,this.center.z),s.lookAt(this.center.x,i.y-100,this.center.z),s.updateMatrixWorld(),s.updateProjectionMatrix();let c=t.overrideMaterial,l=t.background,u=e.shadowMap.autoUpdate;t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1;let d=[];t.traverse(e=>{e.visible&&(e.isPoints||e.isSprite||e.isLine||e.userData?.noSkyOcclusion||e.material&&e.material.transparent)&&(d.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.clear(),e.render(t,s);for(let e of d)e.visible=!0;return t.overrideMaterial=c,t.background=l,e.shadowMap.autoUpdate=u,me.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),this.matrix.multiplyMatrices(me,s.projectionMatrix).multiply(s.matrixWorldInverse),this.age=0,this.valid=!0,!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override.dispose()}},pe=new t,me=new o,Z=new t,Q=new t,he=new o,ge=new o,_e=new t(0,1,0),ve=new t,ye=new o().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),be=class{constructor({size:e=256,radius:r=30,color:i=!1,forward:s=.3,depthRange:l=400}={}){this.size=e,this.radius=r,this.forward=s,this.depthRange=l,this.color=i;let m=new n(e,e,c);m.format=u,m.minFilter=m.magFilter=_,this.rt=new x(e,e,{type:i?a:d,depthBuffer:!0,depthTexture:m,minFilter:f,magFilter:f,generateMipmaps:!1}),this.rt.texture.colorSpace=``,this.camera=new T(-r,r,r,-r,1,l),this.override=i?null:new p({colorWrite:!1,side:2}),this.center=new t(1e9,0,0),this.lastDir=new t(0,-2,0),this.age=1e9,this.valid=!1,this.matrix=new o,this.inverse=new o}get texel(){return 2*this.radius/this.size}update(e,t,n,r,{moveFrac:i=.12,maxAge:a=30,force:o=!1,hide:s=[]}={}){this.age++,n.getWorldPosition(Z),n.getWorldDirection(Q),Q.y=0,Q.lengthSq()<1e-6&&Q.set(0,0,-1),Q.normalize();let c=ve.copy(Z).addScaledVector(Q,this.radius*this.forward),l=Math.hypot(c.x-this.center.x,c.z-this.center.z),u=this.lastDir.angleTo(r)>.002;if(!o&&this.valid&&!u&&l<this.radius*i&&this.age<a)return!1;he.lookAt(ve.set(0,0,0),Q.copy(r).negate(),Math.abs(r.y)>.99?Z.set(0,0,1):_e),ge.copy(he).invert();let d=c.clone().applyMatrix4(ge),f=this.texel;d.x=Math.round(d.x/f)*f,d.y=Math.round(d.y/f)*f,d.applyMatrix4(he),this.center.copy(d);let p=this.camera,m=this.depthRange*.5;p.position.copy(d).addScaledVector(r,m),p.up.copy(Math.abs(r.y)>.99?Z.set(0,0,1):_e),p.lookAt(d),p.left=-this.radius,p.right=this.radius,p.top=this.radius,p.bottom=-this.radius,p.near=1,p.far=this.depthRange,p.updateProjectionMatrix(),p.updateMatrixWorld();let h=t.overrideMaterial,g=t.background,_=e.shadowMap.autoUpdate,v=e.getClearColor(Se),y=e.getClearAlpha();t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1;let b=[];for(let e of s)e&&e.visible&&(e.visible=!1,b.push(e));t.traverse(e=>{e.visible&&(e.isPoints||e.isSprite||e.isLine||e.userData?.noSunView||e.material&&e.material.transparent&&!e.material.alphaTest)&&(b.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.setClearColor(0,0),e.clear(),e.render(t,p);for(let e of b)e.visible=!0;return e.setClearColor(v,y),t.overrideMaterial=h,t.background=g,e.shadowMap.autoUpdate=_,xe.multiplyMatrices(p.projectionMatrix,p.matrixWorldInverse),this.matrix.multiplyMatrices(ye,xe),this.inverse.copy(xe).invert(),this.lastDir.copy(r),this.age=0,this.valid=!0,!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override?.dispose()}},xe=new o,Se=new h,Ce=class{constructor(e,n=128){this.renderer=e,this.cubeRT=new ee(n,{type:a,generateMipmaps:!1,minFilter:f,magFilter:f}),this.cubeRT.texture.colorSpace=``,this.cam=new j(.12,650,this.cubeRT),this.pmrem=new E(e),this.envRT=null,this.pos=new t(1e9,0,0),this.age=1e9,this.texture=null}update(e,t,{hide:n=[],moveDist:r=1.5,maxAge:i=180,force:a=!1}={}){this.age++;let o=t.getWorldPosition(we);if(!a&&this.texture&&o.distanceTo(this.pos)<r&&this.age<i)return!1;let s=this.renderer;this.pos.copy(o),this.cam.position.copy(o),this.cam.updateMatrixWorld();let c=s.shadowMap.autoUpdate,l=s.getRenderTarget();s.shadowMap.autoUpdate=!1;let u=[];for(let e of n)e&&e.visible&&(e.visible=!1,u.push(e));this.cam.update(s,e);for(let e of u)e.visible=!0;return s.shadowMap.autoUpdate=c,this.envRT=this.pmrem.fromCubemap(this.cubeRT.texture,this.envRT),this.envRT.texture.name=`ironline-local-probe`,s.setRenderTarget(l),this.texture=this.envRT.texture,this.age=0,!0}dispose(){this.cubeRT.dispose(),this.envRT?.dispose(),this.pmrem.dispose()}},we=new t;function Te(e=7,t=640,n=360){let r=e>>>0,i=()=>{r=r+1831565813>>>0;let e=r;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296},a=document.createElement(`canvas`);a.width=t,a.height=n;let o=a.getContext(`2d`);o.fillStyle=`#000`,o.fillRect(0,0,t,n),o.globalCompositeOperation=`lighter`;for(let e=0;e<22;e++){let e=i()*t,r=i()*n,a=30+i()*110,s=o.createRadialGradient(e,r,0,e,r,a),c=.05+i()*.09;s.addColorStop(0,`rgba(255,245,230,${c})`),s.addColorStop(1,`rgba(255,245,230,0)`),o.fillStyle=s,o.beginPath(),o.ellipse(e,r,a,a*(.4+i()*.6),i()*Math.PI,0,Math.PI*2),o.fill()}for(let e=0;e<70;e++){let e=i()*t,r=i()*n,a=3+i()*16,s=o.createRadialGradient(e,r,a*.55,e,r,a),c=.05+i()*.09;s.addColorStop(0,`rgba(255,255,255,${c*.35})`),s.addColorStop(.8,`rgba(255,250,240,${c})`),s.addColorStop(1,`rgba(255,250,240,0)`),o.fillStyle=s,o.beginPath(),o.arc(e,r,a,0,Math.PI*2),o.fill()}for(let e=0;e<26;e++){let e=i()*t,r=i()*n,a=8+i()*26;o.fillStyle=`rgba(220,235,255,${.03+i()*.05})`,o.beginPath();for(let t=0;t<6;t++){let n=t/6*Math.PI*2+.3;o.lineTo(e+Math.cos(n)*a,r+Math.sin(n)*a)}o.fill()}for(let e=0;e<900;e++){let e=i()*t,r=i()*n;o.fillStyle=`rgba(255,255,255,${.03+i()*.1})`,o.fillRect(e,r,1+ +(i()<.2),1)}o.lineWidth=1;for(let e=0;e<14;e++){o.strokeStyle=`rgba(255,255,255,${.03+i()*.05})`,o.beginPath();let e=i()*t,r=i()*n;o.moveTo(e,r);for(let t=0;t<4;t++)e+=(i()-.5)*40,r+=(i()-.5)*40,o.quadraticCurveTo(e+(i()-.5)*20,r+(i()-.5)*20,e,r);o.stroke()}let s=new v(a);return s.colorSpace=``,s.minFilter=f,s.magFilter=f,s.generateMipmaps=!1,s.needsUpdate=!0,s}var $=`
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
`,Ee=`
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
}`,De=`
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
}`,Oe=`
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
}`,ke=`
${$}
${K}
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
#ifdef HAS_SHADOW
uniform sampler2DShadow tShadow;
uniform mat4 uShadowMatrix;
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
    float inNear = 0.0, shNear = 1.0;
    #ifdef HAS_SHADOW
    {
      vec4 sc = uShadowMatrix * vec4(wp + n * 0.06, 1.0);
      vec3 s3 = sc.xyz / sc.w;
      if (s3.x > 0.0 && s3.x < 1.0 && s3.y > 0.0 && s3.y < 1.0 && s3.z < 1.0) {
        vec2 e = min(s3.xy, 1.0 - s3.xy);
        inNear = smoothstep(0.0, 0.06, min(e.x, e.y));
        shNear = texture(tShadow, vec3(s3.xy, s3.z - 0.0006));
      }
    }
    #endif
    float visScene = mix(1.0, shNear, inNear);
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
    vec3 delta = (ambNew - ambScene) + sunE * (visTrue - visScene) + gi;
    // um toque de AO também no sol (contato visual), bem leve
    delta -= sunE * visTrue * (1.0 - ao) * 0.25 * uAoStrength;
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
    fogCol += uSunRadiance * uFogSun * (hg(mu0, 0.72) * 0.8 + 0.08);
    col = mix(col, fogCol, fogAmt);
  }

  // ── raios de sol volumétricos ──
  vec2 vol = texture(tVol, vUv).rg;
  float mu = dot(rd, uSunDir);
  float phase = mix(hg(mu, uPhaseG), hg(mu, -0.2), 0.25);
  col += uSunRadiance * phase * vol.r * uVolStrength;

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
}`,Ae=`
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
}`,je=`
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
}`,Me=`
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
}`,Ne=`
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
}`,Pe=`
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
}`,Fe=`
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

  vec3 bloom = texture(tBloom, vUv).rgb;
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
  vec3 hot = max(bloom * expo0 - 4.0, 0.0) / max(expo0, 1e-3);
  col += hot * dirt * uDirt;

  float exposure = texture(tExposure, vec2(0.5)).r * uExposure;
  col *= exposure;
  col += uFlash;

  // gradação em espaço de cena (log): balanço de branco, contraste, saturação
  col *= uWhiteBalance;
  float L = luma(col);
  col = mix(vec3(L), col, uSaturation);
  col = max(col, 0.0);
  col = 0.18 * pow(col / 0.18 + 1e-6, vec3(uContrast));

  // ACES (o three também divide por 0.6)
  col = aces(col / 0.6);

  // split-toning e lift/gain em espaço de exibição linear
  float Ld = luma(col);
  col *= mix(uShadowTint, uHighlightTint, smoothstep(0.02, 0.6, Ld));
  col = col * uGain + uLift * (1.0 - col);

  // vinheta (natural, cos^4-ish)
  float vig = 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 2.2);
  col *= vig;

  outColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
}`,Ie=`
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
}`,Le={low:{msaa:0,ao:!1,aoSamples:6,vol:!1,volSteps:12,bloomLevels:5,motion:!1,dust:0,fxaa:!0,sharpen:0,dirt:!1,gi:0,taa:!1,contact:!1,far:1024},medium:{msaa:4,ao:!0,aoSamples:10,vol:!1,volSteps:14,bloomLevels:6,motion:!1,dust:0,fxaa:!1,sharpen:.3,dirt:!0,gi:12,taa:!1,contact:!0,far:1024},high:{msaa:0,ao:!0,aoSamples:14,vol:!0,volSteps:20,bloomLevels:6,motion:!0,dust:700,fxaa:!1,sharpen:.5,dirt:!0,gi:16,taa:!0,contact:!0,far:2048},ultra:{msaa:4,ao:!0,aoSamples:18,vol:!0,volSteps:28,bloomLevels:7,motion:!0,dust:1100,fxaa:!1,sharpen:.45,dirt:!0,gi:24,taa:!0,contact:!0,far:2048}};function Re(){return{exposure:1,autoExposure:{enabled:!0,key:.14,strength:.55,minEV:-2,maxEV:2.2,biasEV:0,speedUp:2.5,speedDown:1.4},environmentIntensity:.55,indoorAmbient:.62,coveredAmbient:.4,bounce:.1,indoorTint:new h(1.08,1,.88),gi:{strength:3.2,radius:8},contact:.85,ao:{radius:1.8,intensity:4.2,bias:.6,strength:1},fog:{density:.0014,falloff:.045,base:0,start:18,max:.92,tint:new h(1,1,1),sun:.12},taa:{alpha:.1,gamma:1},vol:{density:.0025,falloff:.09,base:0,maxDist:70,strength:.45,phaseG:.72,indoorDust:22},bloom:{strength:.05,radius:1,dirt:.5},grade:{whiteBalance:new h(1.02,1,.965),contrast:1.3,saturation:1.08,shadowTint:new h(.93,.99,1.06),highlightTint:new h(1.06,1,.92),lift:new h(.004,.006,.009),gain:new h(1,1,1)},clarity:.22,lens:{ca:.006,vignette:.3,grain:.032,sharpen:null},menuBlur:0,motionBlur:.5,adsDof:1}}var ze={name:`rendering`,order:20,async init(n){let{renderer:i,scene:a,camera:s,quality:c,bus:l}=n;this.ctx=n,this.params=Re(),this.flashAmt=0,this.debugView=null,this.frameIndex=0,this.stats={ms:0,passes:0},i.shadowMap.type=1,i.toneMapping=4,i.toneMappingExposure=1;let u=n.service(`world`);this.sun=u?.sun||null,this.atmo=new re(i),this.sunDir=new t(.45,.62,.35).normalize(),this.shadowFit=new ue,this.sun&&this.shadowFit.readDirection(this.sun,this.sunDir),this.atmo.setSun(this.sunDir,this.sun?.intensity??3);let d=a.background;if(this.ownsSky=(!d||d.isColor)&&n.params.get(`sky`)!==`world`,this.ownsSky&&(a.background=null,this.atmo.attach(a,s),this.worldSky=u?.sky||null,this.worldSky&&(this.worldSky.visible=!1),u?.environment&&a.environment===u.environment&&(a.environment=null)),a.fog){let e=a.fog;e.isFogExp2&&(this.params.fog.density=Math.min(.0013,e.density*.3)),a.fog=null}this.atmo.updateLut(!0),this.env=this.atmo.updateEnvironment(!0),this.applyEnvironment(),this.bounceLight=new e(16777215,0),this.bounceLight.name=`ironline-bounce`,this.bounceLight.castShadow=!1,a.add(this.bounceLight,this.bounceLight.target),this.dust=null,this.skyOcc=new fe(512,110),this.atmo.dome.userData.noSkyOcclusion=!0,this.atmo.dome.userData.noSunView=!0,this.rsm=new be({size:256,radius:24,color:!0,forward:.35,depthRange:400}),this.farView=null,this.ambient=new h(.1,.1,.1),this.ambientDirty=!0,this.jitter=new r,this.probe=n.quality.level===`low`?null:new Ce(i,n.quality.level===`ultra`?192:128),this.taaFrames=0,this.dirtTex=Te(11),this.buildMaterials(),this.configure(),this.offs=[l.on(`resize`,()=>this.resize()),l.on(`quality:change`,()=>this.configure())],this.prevViewProj=new o,this.hasPrev=!1,n.setRenderPipeline((e,t)=>this.render(e,t));let f=this,p=this.params;this.api=n.provide(`rendering`,{setExposure(e){p.exposure=e,i.toneMappingExposure=e},get exposure(){return p.exposure},get environment(){return f.env},get environmentIntensity(){return p.environmentIntensity},set environmentIntensity(e){p.environmentIntensity=e,f.applyEnvironment(),f.ambientDirty=!0},get sunDirection(){return f.sunDir},get sunColor(){return f.atmo.uniforms.uSunColor.value},get sunTransmittance(){return f.atmo.sunTransmittance},setFog(e){Object.assign(p.fog,e)},setVolumetrics(e){Object.assign(p.vol,e)},setAO(e){Object.assign(p.ao,e)},setBloom(e){Object.assign(p.bloom,e)},setGrade(e){Object.assign(p.grade,e)},setLens(e){Object.assign(p.lens,e)},setAutoExposure(e){Object.assign(p.autoExposure,e)},setGI(e){Object.assign(p.gi,e)},setContact(e){p.contact=e},setTAA(e){Object.assign(p.taa,e)},get ambient(){return f.ambient},setSky(e){`takeover`in e&&(f.atmo.dome.visible=!!e.takeover,f.worldSky&&(f.worldSky.visible=!e.takeover)),Object.assign(f.atmo.params,e),f.atmo.uniforms.uCloudCover.value=f.atmo.params.cloudCover,f.atmo.uniforms.uCloudDensity.value=f.atmo.params.cloudDensity,f.atmo.uniforms.uSunDisk.value=f.atmo.params.sunDisk,f.atmo.uniforms.uSkySat.value=f.atmo.params.skySaturation,f.atmo.dirty=!0},setMenuBlur(e){p.menuBlur=e},flash(e=1){f.flashAmt=Math.max(f.flashAmt,e)},setDebug(e){f.debugView=e||null},get params(){return p},get stats(){return f.stats},readExposure(){let e=f.rt?.exp[f.expIndex];if(!e)return null;let t=new Uint16Array(4);return i.readRenderTargetPixels(e,0,0,1,1,t),{exposure:A.fromHalfFloat(t[0]),avgLum:A.fromHalfFloat(t[1])}},get hdr(){return!0}})},buildMaterials(){let e=e=>({value:e}),n=()=>({uProjInv:e(new o),uNearFar:e(new r(.05,700))});this.mats={ao:L(`ao`,Ee,{...n(),tDepth:e(null),uFullTexel:e(new r),uAoRes:e(new r),uRadius:e(1),uIntensity:e(1),uBias:e(.5),uProjScale:e(500),uFrame:e(0)},{AO_SAMPLES:12}),blur:L(`blur`,De,{...n(),tSrc:e(null),tDepth:e(null),uDir:e(new r),uDepthSharp:e(8)}),vol:L(`vol`,Oe,{...n(),tDepth:e(null),tShadow:e(null),uViewInv:e(new o),uShadowMatrix:e(new o),uCamPos:e(new t),uMaxDist:e(60),uDensity:e(.01),uHeightFalloff:e(.1),uBaseHeight:e(0),uFrame:e(0),uShadowBias:e(.0015),tSkyOcc:e(null),uSkyOccMatrix:e(new o),uIndoorDust:e(0),tRsmDepth:e(null),uRsmMatrix:e(new o),uRsmOn:e(0)},{VOL_STEPS:20}),combine:L(`combine`,ke,{...n(),tScene:e(null),tDepth:e(null),tAo:e(null),tVol:e(null),tVm:e(null),tLut:e(this.atmo.lut.texture),tGi:e(null),uViewInv:e(new o),uProj:e(new o),uPrevViewProj:e(new o),uCamPos:e(new t),uSunDir:e(this.sunDir),uSunDirView:e(new t),uSunRadiance:e(new h),uSunIrr:e(new h),uAmbient:e(new h),uCoveredAmb:e(.4),uSkyScale:e(1),uAoStrength:e(0),uGiStrength:e(0),uContact:e(0),uFogDensity:e(0),uFogFalloff:e(.05),uFogBase:e(0),uFogStart:e(10),uFogMax:e(.9),uFogTint:e(new h(1,1,1)),uFogSun:e(0),uVolStrength:e(0),uPhaseG:e(.6),uMotion:e(0),uVmBlur:e(0),uVmOn:e(1),uRes:e(new r),uFrame:e(0),tSkyOcc:e(null),uSkyOccMatrix:e(new o),uSkyOccOn:e(0),uIndoor:e(.4),uIndoorTint:e(new h(1,1,1)),uDebug:e(0),tShadow:e(null),uShadowMatrix:e(new o),tFar:e(null),uFarMatrix:e(new o),uFarOn:e(0),uFarTexel:e(new r)}),gi:L(`gi`,Ae,{...n(),tDepth:e(null),tRsmColor:e(null),tRsmDepth:e(null),uViewInv:e(new o),uRsmMatrix:e(new o),uRsmInv:e(new o),uSunDir:e(this.sunDir),uRadiusUv:e(.1),uSampleArea:e(1),uRsmTexel:e(new r),uFullTexel:e(new r),uFrame:e(0),tSkyOcc:e(null),uSkyOccMatrix:e(new o),uSkyOccOn:e(0)},{GI_SAMPLES:16}),taa:L(`taa`,je,{...n(),tCur:e(null),tHist:e(null),tDepth:e(null),tVm:e(null),uViewInv:e(new o),uPrevViewProj:e(new o),uCamPos:e(new t),uTexel:e(new r),uAlpha:e(.1),uHistValid:e(0),uGamma:e(1)}),down:L(`bloom-down`,Me,{...n(),tSrc:e(null),uTexel:e(new r),uKaris:e(0)}),up:L(`bloom-up`,Ne,{...n(),tLow:e(null),tCur:e(null),uTexel:e(new r),uRadius:e(1),uCurWeight:e(1)}),exposure:L(`exposure`,Pe,{...n(),tSmall:e(null),tPrev:e(null),uRate:e(1),uKey:e(.16),uStrength:e(.6),uRange:e(new r(-2,2)),uBiasEV:e(0)}),tonemap:L(`tonemap`,Fe,{...n(),tHdr:e(null),tBloom:e(null),tExposure:e(null),tDirt:e(this.dirtTex),uBloom:e(.05),uDirt:e(1),uExposure:e(1),uCA:e(0),uMenuBlur:e(0),uWhiteBalance:e(new h),uContrast:e(1),uSaturation:e(1),uShadowTint:e(new h),uHighlightTint:e(new h),uLift:e(new h),uGain:e(new h),uVignette:e(.3),uFlash:e(0),uClarity:e(0),uRes:e(new r)}),final:L(`final`,Ie,{...n(),tLdr:e(null),uTexel:e(new r),uGrain:e(.03),uSharpen:e(0),uFxaa:e(0),uTime:e(0)}),debug:L(`debug`,`${$}
        uniform sampler2D tSrc; uniform float uMode;
        void main() {
          vec4 c = texture(tSrc, vUv);
          vec3 o = uMode < 0.5 ? c.rrr : uMode < 1.5 ? vec3(c.r * 4.0) : uMode < 2.5 ? vec3(fract(linearZ(c.r) / 20.0)) : uMode < 3.5 ? c.rgb / (1.0 + c.rgb) : c.rgb;
          outColor = vec4(pow(o, vec3(1.0 / 2.2)), 1.0);
        }`,{...n(),tSrc:e(null),uMode:e(0)})},this.quad=new I(this.mats.final)},configure(){let e=this.ctx.quality,t={...Le[e.level]||Le.high};e.msaa||(t.msaa=0),e.ssao||(t.ao=!1),e.volumetrics||(t.vol=!1),e.motionBlur||(t.motion=!1),e.taa===!1&&(t.taa=!1),e.msaa&&t.msaa===0&&!t.taa&&(t.msaa=4),e.shadows||(t.far=0),t.bloom=e.bloom!==!1,this.tier=t,this.shadowFit.configure(e);let n=(e,t,n)=>{e.defines[t]!==n&&(e.defines[t]=n,e.needsUpdate=!0)};n(this.mats.ao,`AO_SAMPLES`,t.aoSamples),n(this.mats.vol,`VOL_STEPS`,t.volSteps),t.gi&&n(this.mats.gi,`GI_SAMPLES`,t.gi),this.farView&&(!t.far||this.farView.size!==t.far)&&(this.farView.dispose(),this.farView=null),t.far&&!this.farView&&(this.farView=new be({size:t.far,radius:190,color:!1,forward:.55,depthRange:700})),this.taaFrames=0;let r=this.ctx.scene;this.dust&&(!t.dust||this.dust.count!==t.dust)&&(r.remove(this.dust.points),this.dust.dispose(),this.dust=null),t.dust&&!this.dust&&this.sun&&(this.dust=new de(t.dust,16),this.dust.count=t.dust,r.add(this.dust.points)),this.disposeTargets(),this.resize()},disposeTargets(){if(this.rt){for(let e of Object.values(this.rt))Array.isArray(e)?e.forEach(e=>e.dispose()):e?.dispose?.();this.rt=null}},resize(){let{renderer:e}=this.ctx,t=e.getDrawingBufferSize(new r),i=Math.max(1,t.x),o=Math.max(1,t.y);if(this.rt&&this.size?.x===i&&this.size?.y===o)return;this.disposeTargets(),this.size=new r(i,o);let s=this.tier,l=Math.ceil(i/2),p=Math.ceil(o/2),m=new n(i,o,c);m.format=u,m.minFilter=m.magFilter=_;let h=new x(i,o,{type:a,samples:s.msaa,depthBuffer:!0,depthTexture:m,minFilter:f,magFilter:f});h.texture.colorSpace=``;let g=new x(i,o,{type:a,samples:s.msaa,depthBuffer:!0,minFilter:f,magFilter:f});g.texture.colorSpace=``;let v=[],y=[],b=l,S=p;for(let e=0;e<s.bloomLevels;e++)v.push(R(b,S)),y.push(R(b,S)),b=Math.max(1,Math.ceil(b/2)),S=Math.max(1,Math.ceil(S/2));let C=[0,1].map(()=>R(1,1,{type:a,filter:_}));this.rt={scene:h,vm:g,ao:R(l,p,{type:d}),ao2:R(l,p,{type:d}),vol:R(l,p),vol2:R(l,p),combine:R(i,o),gi:R(Math.ceil(i/4),Math.ceil(o/4)),gi2:R(Math.ceil(i/4),Math.ceil(o/4)),hist:s.taa?[R(i,o),R(i,o)]:[],ldr:R(i,o,{type:d}),bloom:v,bloomUp:y,exp:C,white:R(1,1,{type:d}),zero:R(1,1)},this.expIndex=0,this.histIndex=0,this.taaFrames=0,this.expPrimed=!1,this.needsClears=!0},frame(e,t){let{camera:n}=t,r=this.sun||t.service(`world`)?.sun||null;r&&!this.sun&&(this.sun=r),r&&(this.shadowFit.readDirection(r,this.sunDir),this.shadowFit.update(r,n,this.sunDir)&&(this.shadowDirty=!0));let i=r?.intensity??3;if(this.atmo.setSun(this.sunDir,i),this.atmo.uniforms.uTime.value=t.time.now,this.atmo.updateLut()){this.ambientDirty=!0;let e=this.atmo.updateEnvironment();e&&(this.env=e,this.applyEnvironment())}let a=this.bounceLight,o=Math.max(this.sunDir.y,0);if(a.position.set(-this.sunDir.x*.5,-1,-this.sunDir.z*.5).add(n.position),a.target.position.copy(n.position),a.target.updateMatrixWorld(),a.color.copy(this.atmo.params.groundAlbedo).multiply(this.atmo.sunTransmittance),a.intensity=this.tier?.gi&&this.params.gi.strength>0?0:i*this.params.bounce*o*2.5,this.ambientDirty&&this.updateAmbient(t),this.dust){let e=(this.size?.y||1080)/(2*Math.tan(s.degToRad(n.fov)/2));this.dust.update(n,r,this.atmo.uniforms.uSunColor.value,t.time.now,e),this.dust.uniforms.uIntensity.value=.35}this.flashAmt*=Math.exp(-(e||1/60)*3.5)},updateAmbient(e){let t=this.atmo.readAmbient(e.renderer);if(!t)return;this.ambientDirty=!1;let n=this.ambient.setRGB(0,0,0);e.scene.environment&&(n.r=(t.up.r+t.side.r)*.5,n.g=(t.up.g+t.side.g)*.5,n.b=(t.up.b+t.side.b)*.5,n.multiplyScalar(e.scene.environmentIntensity??1));let r=e.service(`world`)?.hemi;if(r?.visible!==!1&&r?.isHemisphereLight){let e=r.intensity/Math.PI;n.r+=(r.color.r*.75+r.groundColor.r*.25)*e,n.g+=(r.color.g*.75+r.groundColor.g*.25)*e,n.b+=(r.color.b*.75+r.groundColor.b*.25)*e}},applyEnvironment(){let{scene:e,vm:t}=this.ctx;this.env&&((!e.environment||e.environment===this.prevEnv)&&(e.environment=this.env),e.environmentIntensity=this.params.environmentIntensity,t?.scene&&!this.probe?.texture&&(!t.scene.environment||t.scene.environment===this.prevEnv)&&(t.scene.environment=this.env,t.scene.environmentIntensity=this.params.environmentIntensity*.9),this.prevEnv=this.env)},render(e,t){let n=performance.now(),{renderer:r,scene:i,camera:a,vm:o}=e;this.rt||this.resize();let c=this.rt,l=this.mats,u=this.params,d=this.tier,f=this.quad,p=this.size.x,m=this.size.y,g=0,_=(e,t)=>{f.material=e,f.render(r,t),g++},v=r.getClearColor(new h),y=r.getClearAlpha();this.needsClears&&=(r.setClearColor(16777215,1),r.setRenderTarget(c.white),r.clear(),r.setClearColor(0,0),r.setRenderTarget(c.zero),r.clear(),!1);let b=this.sun,x=!!(b?.castShadow&&r.shadowMap.enabled),S=[this.atmo.dome,this.dust?.points,this.worldSky].filter(Boolean),C=!!(d.gi&&u.gi.strength>0&&b);C&&this.rsm.update(r,i,a,this.sunDir,{moveFrac:.06,maxAge:6,hide:S})&&g++;let w=!!(this.farView&&x);if(w&&this.farView.update(r,i,a,this.sunDir,{moveFrac:.08,maxAge:240,hide:S})&&g++,this.probe&&o.visible){let e=this.probe.texture;if(this.probe.update(i,a,{hide:[this.dust?.points]})){g+=6;let t=o.scene.environment;(!t||t===this.env||t===this.prevEnv||t===e)&&(o.scene.environment=this.probe.texture)}}let T=!!(d.taa&&c.hist.length),E=0,D=0;if(T){let e=Ue(this.frameIndex)%16+1;E=(He(e,2)-.5)*2/p,D=(He(e,3)-.5)*2/m,a.projectionMatrix.elements[8]+=E,a.projectionMatrix.elements[9]+=D,o.camera.projectionMatrix.elements[8]+=E,o.camera.projectionMatrix.elements[9]+=D}r.shadowMap.autoUpdate=!1;let ee=e.shot?3:2;r.shadowMap.needsUpdate=!!this.shadowDirty||this.frameIndex%ee===0||!b?.shadow?.map,this.shadowDirty=!1,r.setClearColor(0,1),r.setRenderTarget(c.scene),r.clear(),r.render(i,a),g++;let O=o.visible;O&&(r.shadowMap.needsUpdate=!0,r.setClearColor(0,0),r.setRenderTarget(c.vm),r.clear(),r.render(o.scene,o.camera),g++),r.setClearColor(v,y),T&&(a.projectionMatrix.elements[8]-=E,a.projectionMatrix.elements[9]-=D,o.camera.projectionMatrix.elements[8]-=E,o.camera.projectionMatrix.elements[9]-=D);let k=Be.multiplyMatrices(a.projectionMatrix,a.matrixWorldInverse);this.hasPrev||=(this.prevViewProj.copy(k),!0);let A=Ve.copy(this.prevViewProj);this.prevViewProj.copy(k);let j=T?this.frameIndex:e.shot?0:this.frameIndex%8,M=!!this.skyOcc&&(u.indoorAmbient<.999||C);M&&this.skyOcc.update(r,i,a);let N=c.scene.depthTexture,P=e=>{e.uniforms.uProjInv.value.copy(a.projectionMatrixInverse),e.uniforms.uNearFar.value.set(a.near,a.far)};for(let e of Object.values(l))P(e);let F=this.frameIndex++,I=c.white.texture;if(d.ao){let e=l.ao.uniforms;e.tDepth.value=N,e.uFullTexel.value.set(1/p,1/m),e.uAoRes.value.set(c.ao.width,c.ao.height),e.uRadius.value=u.ao.radius,e.uIntensity.value=u.ao.intensity,e.uBias.value=u.ao.bias,e.uProjScale.value=c.ao.height/(2*Math.tan(s.degToRad(a.fov)/2)),e.uFrame.value=j,_(l.ao,c.ao),this.blur(c.ao,c.ao2,N,10,_),I=c.ao.texture}let L=c.zero.texture;if(C&&this.rsm.valid){let e=l.gi.uniforms;e.tDepth.value=N,e.tRsmColor.value=this.rsm.rt.texture,e.tRsmDepth.value=this.rsm.rt.depthTexture,e.uViewInv.value.copy(a.matrixWorld),e.uRsmMatrix.value.copy(this.rsm.matrix),e.uRsmInv.value.copy(this.rsm.inverse);let t=u.gi.radius;e.uRadiusUv.value=t/(2*this.rsm.radius),e.uSampleArea.value=Math.PI*t*t/(l.gi.defines.GI_SAMPLES||16),e.uRsmTexel.value.set(1/this.rsm.size,1/this.rsm.size),e.uFullTexel.value.set(1/p,1/m),e.uFrame.value=j,e.uSkyOccOn.value=+!!M,M&&(e.tSkyOcc.value=this.skyOcc.rt.depthTexture,e.uSkyOccMatrix.value.copy(this.skyOcc.matrix)),_(l.gi,c.gi),this.blur(c.gi,c.gi2,N,6,_),L=c.gi.texture}let R=c.zero.texture,z=x?b.shadow.map?.depthTexture:null;if(d.vol&&z&&u.vol.strength>0){let t=l.vol.uniforms;t.tDepth.value=N,t.tShadow.value=z,t.uViewInv.value.copy(a.matrixWorld),t.uShadowMatrix.value.copy(b.shadow.matrix),a.getWorldPosition(t.uCamPos.value),t.uMaxDist.value=u.vol.maxDist,t.uDensity.value=u.vol.density,t.uHeightFalloff.value=u.vol.falloff,t.uBaseHeight.value=u.vol.base,t.uFrame.value=T?F:e.shot?0:F,M?(t.tSkyOcc.value=this.skyOcc.rt.depthTexture,t.uSkyOccMatrix.value.copy(this.skyOcc.matrix),t.uIndoorDust.value=u.vol.indoorDust):t.uIndoorDust.value=0,t.uRsmOn.value=C&&this.rsm.valid?1:0,t.uRsmOn.value&&(t.tRsmDepth.value=this.rsm.rt.depthTexture,t.uRsmMatrix.value.copy(this.rsm.matrix)),_(l.vol,c.vol),this.blur(c.vol,c.vol2,N,4,_),R=c.vol.texture}{let t=l.combine.uniforms;t.tScene.value=c.scene.texture,t.tDepth.value=N,t.tAo.value=I,t.tVol.value=R,t.tVm.value=O?c.vm.texture:c.zero.texture,t.uVmOn.value=+!!O,t.tGi.value=L,t.uGiStrength.value=L===c.zero.texture?0:u.gi.strength,t.uViewInv.value.copy(a.matrixWorld),t.uProj.value.copy(a.projectionMatrix),a.getWorldPosition(t.uCamPos.value),t.uPrevViewProj.value.copy(A),t.uFrame.value=j,t.uMotion.value=d.motion&&!e.shot?u.motionBlur:0,t.uSunRadiance.value.copy(this.atmo.uniforms.uSunColor.value),t.uSunDirView.value.copy(this.sunDir).transformDirection(a.matrixWorldInverse),b?t.uSunIrr.value.copy(b.color).multiplyScalar(b.intensity):t.uSunIrr.value.setRGB(0,0,0),t.uAmbient.value.copy(this.ambient),t.uCoveredAmb.value=u.coveredAmbient,t.uContact.value=d.contact?u.contact:0,t.uFogSun.value=u.fog.sun??0,t.uFarOn.value=w&&this.farView.valid?1:0,w&&(t.tFar.value=this.farView.rt.depthTexture,t.uFarMatrix.value.copy(this.farView.matrix),t.uFarTexel.value.set(1/this.farView.size,1/this.farView.size)),t.uSkyScale.value=this.atmo.uniforms.uSkyScale.value,t.uAoStrength.value=d.ao?u.ao.strength:0,t.uFogDensity.value=u.fog.density,t.uFogFalloff.value=u.fog.falloff,t.uFogBase.value=u.fog.base,t.uFogStart.value=u.fog.start,t.uFogMax.value=u.fog.max,t.uFogTint.value.copy(u.fog.tint),t.uVolStrength.value=R===c.zero.texture?0:u.vol.strength,t.uPhaseG.value=u.vol.phaseG;let n=e.service(`weapon`)?.ads||0;t.uVmBlur.value=n*u.adsDof,t.uRes.value.set(p,m),M&&(t.tSkyOcc.value=this.skyOcc.rt.depthTexture,t.uSkyOccMatrix.value.copy(this.skyOcc.matrix)),t.uSkyOccOn.value=+!!M,t.uIndoor.value=u.indoorAmbient,t.uIndoorTint.value.copy(u.indoorTint),t.uDebug.value={occ:1,gi:2,albedo:3}[this.debugView]||0;let r=+!!z;(l.combine.defines.HAS_SHADOW||0)!==r&&(r?l.combine.defines.HAS_SHADOW=1:delete l.combine.defines.HAS_SHADOW,l.combine.needsUpdate=!0),z&&(t.tShadow.value=z,t.uShadowMatrix.value.copy(b.shadow.matrix)),_(l.combine,c.combine)}let B=c.combine;if(T){let t=l.taa.uniforms,n=c.hist[this.histIndex],r=c.hist[1-this.histIndex];t.tCur.value=c.combine.texture,t.tHist.value=n.texture,t.tDepth.value=N,t.tVm.value=O?c.vm.texture:c.zero.texture,t.uViewInv.value.copy(a.matrixWorld),t.uPrevViewProj.value.copy(A),a.getWorldPosition(t.uCamPos.value),t.uTexel.value.set(1/p,1/m),t.uHistValid.value=+(this.taaFrames>0),t.uAlpha.value=e.shot?Math.max(1/(this.taaFrames+1),.06):u.taa.alpha,t.uGamma.value=e.shot?Math.max(u.taa.gamma,1.25):u.taa.gamma,_(l.taa,r),this.histIndex=1-this.histIndex,this.taaFrames++,B=r}else this.taaFrames=0;let V=c.bloom.length,H=B;for(let e=0;e<V;e++){let t=l.down.uniforms;t.tSrc.value=H.texture,t.uTexel.value.set(1/H.width,1/H.height),t.uKaris.value=+(e===0),_(l.down,c.bloom[e]),H=c.bloom[e]}let U=c.bloom[V-1];for(let e=V-2;e>=0;e--){let t=l.up.uniforms;t.tLow.value=U.texture,t.tCur.value=c.bloom[e].texture,t.uTexel.value.set(1/U.width,1/U.height),t.uRadius.value=u.bloom.radius,t.uCurWeight.value=1,_(l.up,c.bloomUp[e]),U=c.bloomUp[e]}let W=c.bloomUp[0].texture,G=u.autoExposure,K;if(G.enabled){let n=l.exposure.uniforms,r=c.exp[this.expIndex],i=c.exp[1-this.expIndex];n.tSmall.value=c.bloom[Math.min(3,V-1)].texture,n.tPrev.value=this.expPrimed?r.texture:c.zero.texture,n.uKey.value=G.key,n.uStrength.value=G.strength,n.uRange.value.set(G.minEV,G.maxEV),n.uBiasEV.value=G.biasEV;let a=Math.max(t||1/60,1/240);n.uRate.value=e.shot?1:1-Math.exp(-a*G.speedUp),_(l.exposure,i),this.expIndex=1-this.expIndex,this.expPrimed=!0,K=i.texture}else K=c.white.texture;{let e=l.tonemap.uniforms,t=u.grade;e.tHdr.value=B.texture,e.tBloom.value=W,e.tExposure.value=K,e.uBloom.value=d.bloom?u.bloom.strength:0,e.uDirt.value=d.dirt&&d.bloom?u.bloom.dirt:0,e.uExposure.value=u.exposure,e.uCA.value=u.lens.ca,e.uMenuBlur.value=u.menuBlur,e.uWhiteBalance.value.copy(t.whiteBalance),e.uContrast.value=t.contrast,e.uSaturation.value=t.saturation,e.uShadowTint.value.copy(t.shadowTint),e.uHighlightTint.value.copy(t.highlightTint),e.uLift.value.copy(t.lift),e.uGain.value.copy(t.gain),e.uVignette.value=u.lens.vignette,e.uFlash.value=this.flashAmt,e.uClarity.value=d.bloom?u.clarity:0,e.uRes.value.set(p,m),_(l.tonemap,c.ldr)}{let t=l.final.uniforms;t.tLdr.value=c.ldr.texture,t.uTexel.value.set(1/p,1/m),t.uGrain.value=u.lens.grain,t.uFxaa.value=+!!d.fxaa,t.uSharpen.value=u.lens.sharpen??d.sharpen,t.uTime.value=e.time.now,_(l.final,null)}this.debugView===`occ`||this.debugView===`gi`||this.debugView===`albedo`?(l.debug.uniforms.tSrc.value=c.combine.texture,l.debug.uniforms.uMode.value=4,_(l.debug,null)):this.debugView&&this.drawDebug(N,I,R,W,_),r.setRenderTarget(null),this.stats.ms=performance.now()-n,this.stats.passes=g},blur(e,t,n,r,i){let a=this.mats.blur.uniforms;a.tDepth.value=n,a.uDepthSharp.value=r,a.tSrc.value=e.texture,a.uDir.value.set(1/e.width,0),i(this.mats.blur,t),a.tSrc.value=t.texture,a.uDir.value.set(0,1/e.height),i(this.mats.blur,e)},drawDebug(e,t,n,r,i){let a=this.mats.debug,o={ao:[t,0],vol:[n,1],depth:[e,2],bloom:[r,3]}[this.debugView];o&&(a.uniforms.tSrc.value=o[0],a.uniforms.uMode.value=o[1],i(a,null))},dispose(e){this.offs?.forEach(e=>e()),e.renderer.shadowMap.autoUpdate=!0,e.setRenderPipeline(null),this.disposeTargets(),Object.values(this.mats||{}).forEach(e=>e.dispose()),this.atmo?.dome.removeFromParent(),this.atmo?.dispose(),this.dust?.points.removeFromParent(),this.dust?.dispose(),this.skyOcc?.dispose(),this.rsm?.dispose(),this.probe?.dispose(),this.farView?.dispose(),this.bounceLight?.removeFromParent(),this.dirtTex?.dispose()}},Be=new o,Ve=new o;function He(e,t){let n=1,r=0;for(;e>0;)n/=t,r+=e%t*n,e=Math.floor(e/t);return r}var Ue=e=>e;export{ze as default};
//# sourceMappingURL=rendering-CH8P6Jfm.js.map