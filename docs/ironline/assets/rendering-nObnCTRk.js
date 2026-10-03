import{At as e,C as t,Ct as n,D as r,E as i,G as a,I as o,J as s,N as c,Nt as l,O as u,Ot as d,P as f,Q as p,R as m,X as h,Z as g,_t as _,b as v,c as y,dt as b,ft as x,g as S,gt as C,h as w,it as T,jt as E,k as D,lt as ee,m as O,nt as k,o as A,q as j,s as M,x as N}from"./three-DY5kt8Du.js";var P=`
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`,F=new w;F.setAttribute(`position`,new c([-1,-1,0,3,-1,0,-1,3,0],3));var I=new T(-1,1,1,-1,0,1),L=class{constructor(e){this.mesh=new g(F,e),this.mesh.frustumCulled=!1}get material(){return this.mesh.material}set material(e){this.mesh.material=e}render(e,t,n=!1){e.setRenderTarget(t),n&&e.clear(),e.render(this.mesh,I)}dispose(){this.mesh.material.dispose()}};function R(e,t,n={},r={}){return new x({name:`ironline-${e}`,glslVersion:o,uniforms:n,defines:r,vertexShader:P,fragmentShader:`precision highp float;\nprecision highp sampler2D;\nprecision highp sampler2DShadow;\n${t}`,depthTest:!1,depthWrite:!1,blending:0})}function z(e,t,{type:n=m,filter:r=a,format:i=b}={}){let o=new l(Math.max(1,e),Math.max(1,t),{type:n,format:i,minFilter:r,magFilter:r,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1,wrapS:v,wrapT:v});return o.texture.colorSpace=``,o}var B=6360,V=6460,H=[.005802,.013558,.0331],U=.0044,W=[65e-5,.001881,85e-6],G=8,K=1.2,q=`
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
${q}

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
`;function ne(e,t){return new _({name:t?`ironline-sky-env`:`ironline-sky`,uniforms:e,defines:t?{ENV_MODE:1}:{},side:1,depthWrite:!1,depthTest:!1,fog:!1,toneMapped:!0,vertexShader:`
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
      ${q}

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
      }`})}var re=class{constructor(t,r={}){this.renderer=t,this.sunDir=new E(.5,.7,.3).normalize(),this.params={haze:.6,altitude:.15,groundAlbedo:new N(.28,.26,.23),skyScale:2.2,sunDisk:18,skySaturation:1.22,cloudCover:.5,cloudDensity:1.15,cloudWind:new e(.004,.0015),...r},this.lut=new l(192,108,{type:m,minFilter:a,magFilter:a,wrapS:v,wrapT:v,depthBuffer:!1}),this.lut.texture.colorSpace=``,this.lutQuad=new L(new x({name:`ironline-skylut`,glslVersion:o,uniforms:{uSunDir:{value:this.sunDir.clone()},uHaze:{value:this.params.haze},uAltitude:{value:this.params.altitude},uGroundAlbedo:{value:this.params.groundAlbedo}},vertexShader:P,fragmentShader:te,depthTest:!1,depthWrite:!1})),this.uniforms={uLut:{value:this.lut.texture},uSunDir:{value:this.sunDir},uSunColor:{value:new N(1,1,1)},uSkyScale:{value:1},uSunDisk:{value:this.params.sunDisk},uSkySat:{value:this.params.skySaturation},uTime:{value:0},uCloudCover:{value:this.params.cloudCover},uCloudDensity:{value:this.params.cloudDensity},uCloudWind:{value:this.params.cloudWind}};let i=new n(1,48,24);this.dome=new g(i,ne(this.uniforms,!1)),this.dome.name=`ironline-sky`,this.dome.frustumCulled=!1,this.dome.renderOrder=-1e6,this.dome.castShadow=this.dome.receiveShadow=!1,this.dome.matrixAutoUpdate=!1,this.envScene=new C,this.envDome=new g(i,ne(this.uniforms,!0)),this.envDome.scale.setScalar(100),this.envDome.frustumCulled=!1,this.envScene.add(this.envDome),this.pmrem=new A(t),this.envRT=null,this.sunIntensity=3,this.sunTransmittance=new N(1,1,1),this._lastLutDir=new E(0,-2,0),this._lastEnvDir=new E(0,-2,0),this._lastEnvKey=``,this.dirty=!0}attach(e,t){e.add(this.dome),this.dome.onBeforeRender=(e,t,n)=>{let r=Math.min(n.far*.9,5e3);this.dome.matrixWorld.makeScale(r,r,r).setPosition(n.getWorldPosition(ie))}}setSun(e,t){this.sunDir.copy(e).normalize(),this.sunIntensity=t,ae(this.sunDir,this.params,this.sunTransmittance),this.uniforms.uSunColor.value.copy(this.sunTransmittance).multiplyScalar(t),this.uniforms.uSkyScale.value=this.params.skyScale*t}updateLut(e=!1){if(!e&&!this.dirty&&this._lastLutDir.angleTo(this.sunDir)<.002)return!1;let t=this.lutQuad.material.uniforms;return t.uSunDir.value.copy(this.sunDir),t.uHaze.value=this.params.haze,t.uAltitude.value=this.params.altitude,this.lutQuad.render(this.renderer,this.lut),this._lastLutDir.copy(this.sunDir),this.dirty=!1,!0}updateEnvironment(e=!1){let t=`${this.params.cloudCover.toFixed(3)}|${this.params.haze.toFixed(3)}|${this.uniforms.uSkyScale.value.toFixed(3)}`;if(!e&&this.envRT&&this._lastEnvDir.angleTo(this.sunDir)<.03&&t===this._lastEnvKey)return null;let n=this.envRT;return this.envRT=this.pmrem.fromScene(this.envScene,0,.1,1e3),this.envRT.texture.name=`ironline-env`,n?.dispose(),this._lastEnvDir.copy(this.sunDir),this._lastEnvKey=t,this.envRT.texture}readAmbient(e){let t=this.lut.width,n=this.lut.height,r=new Uint16Array(t*n*4);try{e.readRenderTargetPixels(this.lut,0,0,t,n,r)}catch{return null}let a=i.fromHalfFloat,o=[0,0,0],s=[0,0,0];for(let e=0;e<n;e++){let i=((e+.5)/n-.5)*2,c=Math.sign(i)*i*i*Math.PI*.5,l=Math.cos(c)*(2*Math.PI*Math.abs(i))*(1/n)*(Math.PI/t)*2,u=Math.max(Math.sin(c),0),d=Math.cos(c)/Math.PI;for(let n=0;n<t;n++){let i=(e*t+n)*4;for(let e=0;e<3;e++){let t=a(r[i+e]);Number.isFinite(t)&&(o[e]+=t*u*l,s[e]+=t*d*l)}}}let c=this.uniforms.uSkyScale.value/Math.PI;return this.ambientUp=new N(o[0]*c,o[1]*c,o[2]*c),this.ambientSide=new N(s[0]*c,s[1]*c,s[2]*c),{up:this.ambientUp,side:this.ambientSide}}dispose(){this.lut.dispose(),this.envRT?.dispose(),this.pmrem.dispose(),this.dome.geometry.dispose(),this.dome.material.dispose(),this.envDome.material.dispose(),this.lutQuad.dispose()}},ie=new E;function ae(e,t,n=new N){let r=[0,B+t.altitude,0],i=[e.x,e.y,e.z],a=r[0]*i[0]+r[1]*i[1]+r[2]*i[2],o=r[0]*r[0]+r[1]*r[1]+r[2]*r[2]-V*V,c=(-a+Math.sqrt(Math.max(a*a-o,0)))/64,l=0,u=0,d=0;for(let e=0;e<64;e++){let n=(e+.5)*c,a=r[0]+i[0]*n,o=r[1]+i[1]*n,s=r[2]+i[2]*n,f=Math.hypot(a,o,s)-B;l+=Math.exp(-f/G)*c,u+=Math.exp(-f/K)*t.haze*c,d+=Math.max(0,1-Math.abs(f-25)/15)*c}let f=[0,1,2].map(e=>Math.exp(-(H[e]*l+U*u+W[e]*d))),p=s.smoothstep(e.y,-.03,.02);return n.setRGB(f[0]*p,f[1]*p,f[2]*p,j)}var oe=new E,J=new E,Y=new E,X=new h,se=new h,ce=new E(0,1,0),le=new E,ue=new E,de=class{constructor(){this.radius=50,this.mapSize=2048,this.distance=140,this.softness=2,this.lastDir=new E(0,1,0)}configure(e){let t=e.level;this.radius={low:30,medium:34,high:38,ultra:46}[t]??38;let n=e.shadowMapSize||2048;this.mapSize={low:n,medium:Math.max(n,2048),high:Math.max(n,4096),ultra:Math.max(n,4096)}[t]??n,this.softness={low:1.2,medium:1.3,high:1.1,ultra:1.2}[t]??1.2}readDirection(e,t){e.updateMatrixWorld(),e.target.updateMatrixWorld();let n=le.setFromMatrixPosition(e.matrixWorld),r=ue.setFromMatrixPosition(e.target.matrixWorld);return t.subVectors(n,r),t.lengthSq()<1e-8&&t.copy(this.lastDir),t.normalize()}update(e,t,n){if(!e.castShadow)return!1;let r=e.shadow;r.mapSize.x!==this.mapSize&&(r.mapSize.setScalar(this.mapSize),r.map?.dispose(),r.map=null),this.lastDir.copy(n);let i=this.radius;t.getWorldDirection(J),J.y*=.3,J.normalize(),Y.copy(t.getWorldPosition(le)).addScaledVector(J,i*.5),X.lookAt(ue.set(0,0,0),oe.copy(n).negate(),Math.abs(n.y)>.99?J:ce),se.copy(X).invert(),Y.applyMatrix4(se);let a=2*i/this.mapSize;Y.x=Math.round(Y.x/a)*a,Y.y=Math.round(Y.y/a)*a,Y.applyMatrix4(X);let o=e.parent,s=e.target,c=le.copy(Y).addScaledVector(n,this.distance);o?(o.updateMatrixWorld(),e.position.copy(o.worldToLocal(c))):e.position.copy(c);let l=oe.copy(Y);s.parent?s.position.copy(s.parent.worldToLocal(l)):s.position.copy(l),e.updateMatrixWorld(),s.updateMatrixWorld();let u=r.camera;(u.right!==i||u.far!==this.distance+120)&&(u.left=-i,u.right=i,u.top=i,u.bottom=-i,u.near=1,u.far=this.distance+120,u.updateProjectionMatrix());let d=!this.lastCenter||this.lastCenter.distanceToSquared(Y)>1e-8||this.lastDirKey.angleTo(n)>1e-5;return d&&((this.lastCenter||=new E).copy(Y),(this.lastDirKey||=new E).copy(n)),r.radius=this.softness,r.bias=-15e-5,r.normalBias=a*1.4,r.blurSamples=8,d}},fe=class{constructor(e=2048){this.size=e;let t=new u(e,e,f);t.format=r,t.minFilter=t.magFilter=k,this.rt=new l(e,e,{type:d,depthBuffer:!0,depthTexture:t,generateMipmaps:!1}),this.override=new p({colorWrite:!1,side:2}),this.valid=!1,this.hidden=[]}render(e,t,n,r=[]){let i=n.shadow;i.updateMatrices(n);let a=t.overrideMaterial,o=t.background,s=e.shadowMap.autoUpdate,c=e.shadowMap.needsUpdate;t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1,e.shadowMap.needsUpdate=!1;let l=this.hidden;l.length=0;for(let e of r)e&&e.visible&&(e.visible=!1,l.push(e));t.traverseVisible(e=>{(e.isPoints||e.isSprite||e.isLine||e.userData?.noSunView||e.isMesh&&!e.castShadow||e.material&&e.material.transparent&&!e.material.alphaTest)&&(e.isMesh||e.isPoints||e.isSprite||e.isLine)&&(l.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.clear(!1,!0,!1),e.render(t,i.camera);for(let e of l)e.visible=!0;l.length=0,t.overrideMaterial=a,t.background=o,e.shadowMap.autoUpdate=s,e.shadowMap.needsUpdate=c,this.valid=!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override.dispose()}},pe=class{constructor(e=900,t=14){let n=new Float32Array(e*3),r=new Float32Array(e),i=12345,a=()=>(i=i*16807%2147483647)/2147483647;for(let i=0;i<e;i++)n[i*3]=a()*t,n[i*3+1]=a()*t*.5,n[i*3+2]=a()*t,r[i]=a();let o=new w;o.setAttribute(`position`,new O(n,3)),o.setAttribute(`aRnd`,new O(r,1)),this.uniforms={uCam:{value:new E},uBox:{value:new E(t,t*.5,t)},uTime:{value:0},uShadow:{value:null},uShadowMatrix:{value:new h},uSunColor:{value:new N(1,1,1)},uAmbient:{value:new N(.02,.022,.026)},uIntensity:{value:1},uPxScale:{value:600}};let s=new _({name:`ironline-dust`,uniforms:this.uniforms,transparent:!0,depthWrite:!1,blending:2,fog:!1,vertexShader:`
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
        }`});this.points=new ee(o,s),this.points.name=`ironline-dust`,this.points.frustumCulled=!1,this.points.renderOrder=10,this.points.visible=!1,this.points.onBeforeRender=()=>{let e=this._sun?.shadow;e?.map?.depthTexture&&(this.uniforms.uShadow.value=e.map.depthTexture,this.uniforms.uShadowMatrix.value.copy(e.matrix))}}update(e,t,n,r,i){let a=this.uniforms;e.getWorldPosition(a.uCam.value),a.uTime.value=r,a.uPxScale.value=i,this._sun=t;let o=t?.castShadow&&t.shadow.map?.depthTexture;this.points.visible=!!o&&this.enabled!==!1,o&&(a.uShadow.value=o,a.uShadowMatrix.value.copy(t.shadow.matrix),a.uSunColor.value.copy(n))}dispose(){this.points.geometry.dispose(),this.points.material.dispose()}},me=class{constructor(e=512,t=110){this.size=e,this.extent=t,this.height=260;let n=new u(e,e,f);n.format=r,n.minFilter=n.magFilter=k,this.rt=new l(e,e,{depthBuffer:!0,depthTexture:n,type:d});let i=t/2;this.camera=new T(-i,i,i,-i,1,this.height+60),this.camera.up.set(0,0,-1),this.override=new p({colorWrite:!1,side:2}),this.center=new E(1e9,0,0),this.age=0,this.valid=!1,this.matrix=new h}update(e,t,n,r=!1){let i=n.getWorldPosition(he);this.age++;let a=Math.hypot(i.x-this.center.x,i.z-this.center.z);if(!r&&this.valid&&a<this.extent*.15&&this.age<30)return!1;let o=this.extent/this.size;this.center.set(Math.round(i.x/o)*o,0,Math.round(i.z/o)*o);let s=this.camera;s.position.set(this.center.x,i.y+this.height,this.center.z),s.lookAt(this.center.x,i.y-100,this.center.z),s.updateMatrixWorld(),s.updateProjectionMatrix();let c=t.overrideMaterial,l=t.background,u=e.shadowMap.autoUpdate;t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1;let d=[];t.traverse(e=>{e.visible&&(e.isPoints||e.isSprite||e.isLine||e.userData?.noSkyOcclusion||e.material&&e.material.transparent)&&(d.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.clear(),e.render(t,s);for(let e of d)e.visible=!0;return t.overrideMaterial=c,t.background=l,e.shadowMap.autoUpdate=u,ge.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),this.matrix.multiplyMatrices(ge,s.projectionMatrix).multiply(s.matrixWorldInverse),this.age=0,this.valid=!0,!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override.dispose()}},he=new E,ge=new h,Z=new E,Q=new E,_e=new h,ve=new h,ye=new E(0,1,0),be=new E,xe=new h().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),Se=class{constructor({size:e=256,radius:t=30,color:n=!1,forward:i=.3,depthRange:o=400}={}){this.size=e,this.radius=t,this.forward=i,this.depthRange=o,this.color=n;let s=new u(e,e,f);s.format=r,s.minFilter=s.magFilter=k,this.rt=new l(e,e,{type:n?m:d,depthBuffer:!0,depthTexture:s,minFilter:a,magFilter:a,generateMipmaps:!1}),this.rt.texture.colorSpace=``,this.camera=new T(-t,t,t,-t,1,o),this.override=n?null:new p({colorWrite:!1,side:2}),this.center=new E(1e9,0,0),this.lastDir=new E(0,-2,0),this.age=1e9,this.valid=!1,this.matrix=new h,this.inverse=new h}get texel(){return 2*this.radius/this.size}update(e,t,n,r,{moveFrac:i=.12,maxAge:a=30,force:o=!1,hide:s=[]}={}){this.age++,n.getWorldPosition(Z),n.getWorldDirection(Q),Q.y=0,Q.lengthSq()<1e-6&&Q.set(0,0,-1),Q.normalize();let c=be.copy(Z).addScaledVector(Q,this.radius*this.forward),l=Math.hypot(c.x-this.center.x,c.z-this.center.z),u=this.lastDir.angleTo(r)>.002;if(!o&&this.valid&&!u&&l<this.radius*i&&this.age<a)return!1;_e.lookAt(be.set(0,0,0),Q.copy(r).negate(),Math.abs(r.y)>.99?Z.set(0,0,1):ye),ve.copy(_e).invert();let d=c.clone().applyMatrix4(ve),f=this.texel;d.x=Math.round(d.x/f)*f,d.y=Math.round(d.y/f)*f,d.applyMatrix4(_e),this.center.copy(d);let p=this.camera,m=this.depthRange*.5;p.position.copy(d).addScaledVector(r,m),p.up.copy(Math.abs(r.y)>.99?Z.set(0,0,1):ye),p.lookAt(d),p.left=-this.radius,p.right=this.radius,p.top=this.radius,p.bottom=-this.radius,p.near=1,p.far=this.depthRange,p.updateProjectionMatrix(),p.updateMatrixWorld();let h=t.overrideMaterial,g=t.background,_=e.shadowMap.autoUpdate,v=e.getClearColor(we),y=e.getClearAlpha();t.overrideMaterial=this.override,t.background=null,e.shadowMap.autoUpdate=!1;let b=[];for(let e of s)e&&e.visible&&(e.visible=!1,b.push(e));t.traverse(e=>{e.visible&&(e.isPoints||e.isSprite||e.isLine||e.userData?.noSunView||e.material&&e.material.transparent&&!e.material.alphaTest)&&(b.push(e),e.visible=!1)}),e.setRenderTarget(this.rt),e.setClearColor(0,0),e.clear(),e.render(t,p);for(let e of b)e.visible=!0;return e.setClearColor(v,y),t.overrideMaterial=h,t.background=g,e.shadowMap.autoUpdate=_,Ce.multiplyMatrices(p.projectionMatrix,p.matrixWorldInverse),this.matrix.multiplyMatrices(xe,Ce),this.inverse.copy(Ce).invert(),this.lastDir.copy(r),this.age=0,this.valid=!0,!0}dispose(){this.rt.depthTexture.dispose(),this.rt.dispose(),this.override?.dispose()}},Ce=new h,we=new N,Te=class{constructor(e,n=128){this.renderer=e,this.cubeRT=new y(n,{type:m,generateMipmaps:!1,minFilter:a,magFilter:a}),this.cubeRT.texture.colorSpace=``,this.cam=new t(.12,650,this.cubeRT),this.pmrem=new A(e),this.envRT=null,this.pos=new E(1e9,0,0),this.age=1e9,this.texture=null}update(e,t,{hide:n=[],moveDist:r=1.5,maxAge:i=180,force:a=!1}={}){this.age++;let o=t.getWorldPosition(Ee);if(!a&&this.texture&&o.distanceTo(this.pos)<r&&this.age<i)return!1;let s=this.renderer;this.pos.copy(o),this.cam.position.copy(o),this.cam.updateMatrixWorld();let c=s.shadowMap.autoUpdate,l=s.getRenderTarget();s.shadowMap.autoUpdate=!1;let u=[];for(let e of n)e&&e.visible&&(e.visible=!1,u.push(e));this.cam.update(s,e);for(let e of u)e.visible=!0;return s.shadowMap.autoUpdate=c,this.envRT=this.pmrem.fromCubemap(this.cubeRT.texture,this.envRT),this.envRT.texture.name=`ironline-local-probe`,s.setRenderTarget(l),this.texture=this.envRT.texture,this.age=0,!0}dispose(){this.cubeRT.dispose(),this.envRT?.dispose(),this.pmrem.dispose()}},Ee=new E;function De(e=7,t=640,n=360){let r=e>>>0,i=()=>{r=r+1831565813>>>0;let e=r;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296},o=document.createElement(`canvas`);o.width=t,o.height=n;let s=o.getContext(`2d`);s.fillStyle=`#000`,s.fillRect(0,0,t,n),s.globalCompositeOperation=`lighter`;for(let e=0;e<22;e++){let e=i()*t,r=i()*n,a=30+i()*110,o=s.createRadialGradient(e,r,0,e,r,a),c=.05+i()*.09;o.addColorStop(0,`rgba(255,245,230,${c})`),o.addColorStop(1,`rgba(255,245,230,0)`),s.fillStyle=o,s.beginPath(),s.ellipse(e,r,a,a*(.4+i()*.6),i()*Math.PI,0,Math.PI*2),s.fill()}for(let e=0;e<70;e++){let e=i()*t,r=i()*n,a=3+i()*16,o=s.createRadialGradient(e,r,a*.55,e,r,a),c=.05+i()*.09;o.addColorStop(0,`rgba(255,255,255,${c*.35})`),o.addColorStop(.8,`rgba(255,250,240,${c})`),o.addColorStop(1,`rgba(255,250,240,0)`),s.fillStyle=o,s.beginPath(),s.arc(e,r,a,0,Math.PI*2),s.fill()}for(let e=0;e<26;e++){let e=i()*t,r=i()*n,a=8+i()*26;s.fillStyle=`rgba(220,235,255,${.03+i()*.05})`,s.beginPath();for(let t=0;t<6;t++){let n=t/6*Math.PI*2+.3;s.lineTo(e+Math.cos(n)*a,r+Math.sin(n)*a)}s.fill()}for(let e=0;e<900;e++){let e=i()*t,r=i()*n;s.fillStyle=`rgba(255,255,255,${.03+i()*.1})`,s.fillRect(e,r,1+ +(i()<.2),1)}s.lineWidth=1;for(let e=0;e<14;e++){s.strokeStyle=`rgba(255,255,255,${.03+i()*.05})`,s.beginPath();let e=i()*t,r=i()*n;s.moveTo(e,r);for(let t=0;t<4;t++)e+=(i()-.5)*40,r+=(i()-.5)*40,s.quadraticCurveTo(e+(i()-.5)*20,r+(i()-.5)*20,e,r);s.stroke()}let c=new S(o);return c.colorSpace=``,c.minFilter=a,c.magFilter=a,c.generateMipmaps=!1,c.needsUpdate=!0,c}var $=`
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
${q}
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
    gi = mix(vec3(luma(gi)), gi, 0.4);
    // rebatimento em espaço de tela: a radiância que a câmera vê em volta
    // (porta/janela estourada, chão ensolarado lá fora, parede acesa) vira luz
    // indireta nas superfícies cobertas próximas — o vão da porta "derrama"
    // luz no piso e nas paredes. Usa mips largos do quadro anterior (logo,
    // também multi-rebatimento), só sob teto, atenuado pela AO.
    vec3 bleed = vec3(0.0);
    if (uBleed > 0.0 && occ > 0.01) {
      vec3 b1 = texture(tBleed, vUv).rgb, b2 = texture(tBleed2, vUv).rgb;
      bleed = (b1 * 0.55 + b2 * 0.45) * uBleed * occ * mix(1.0, ao, 0.8 * uAoStrength);
      // a vista pela janela é rua ensolarada (quente): sem dessaturar, o teto
      // inteiro fica laranja. Luz rebatida real é quase neutra (céu + fachadas)
      bleed = mix(vec3(luma(bleed)), bleed, 0.45);
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
  // dois lobos: halo largo (g 0,55) + aura estreita (g 0,85) em direção ao sol
  fogCol += uSunRadiance * uFogSun * (min(hg(mu0, 0.55), 0.5) * 0.7 + min(hg(mu0, 0.85), 2.5) * 0.12 + 0.06);
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
      // ótica a ~20 cm do olho focado no alvo: a carcaça inteira sai de foco
      // (como nas referências de ADS); só o miolo da janela (retículo) fica nítido
      float rPx = uVmBlur * smoothstep(0.05, 0.24, length(c)) * 18.0 * (uRes.y / 1080.0);
      if (rPx > 0.5) {
        vec4 acc = vm;
        float a0 = ign(gl_FragCoord.xy + uFrame * 5.3) * 6.2831;
        for (int i = 0; i < 16; i++) {
          float f = (float(i) + 0.5) / 16.0;
          float ang = float(i) * 2.39996 + a0;
          acc += texture(tVm, vUv + vec2(cos(ang), sin(ang)) * sqrt(f) * rPx / uRes);
        }
        vm = acc / 17.0;
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
uniform mat4 uProj;

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
    // visibilidade curta em espaço de tela: o VPL do outro lado de uma
    // parede/laje não ilumina (mata as faixas de vazamento nas emendas
    // teto–parede). 3 passos ao longo de P→Q no depth.
    if (w > 0.0) {
      vec3 vdir = transpose(mat3(uViewInv)) * -dir;
      float segL = sqrt(d2);
      for (int k = 0; k < 3; k++) {
        float t = min(0.12 * float(k * k + k + 1), segL * 0.85);
        vec3 sp = P + vdir * t;
        vec4 cc = uProj * vec4(sp, 1.0);
        vec2 suv = cc.xy / cc.w * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) break;
        float sz = linearZ(texture(tDepth, suv).r);
        float behind = -sp.z - sz;
        if (behind > 0.03 && behind < 0.9) { w = 0.0; break; }
      }
    }
    if (w <= 0.0) continue;
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
uniform float uTol;   // folga absoluta do recorte (modo shot, câmera parada): fios finos acumulam

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
  vec3 ext = sig * uGamma + vec3(uTol * (0.5 + m1.x), uTol * 0.5, uTol * 0.5);
  h = clipAabb(m1 - ext, m1 + ext, c, h);
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
// compressão suave só no 1º nível (entrada HDR): até ~uKnee passa intacto,
// acima tende a 2×uKnee — clarão de boca/sol não "inunda" a tela inteira
vec3 s(vec2 o) {
  vec3 c = min(texture(tSrc, vUv + o * uTexel).rgb, vec3(256.0));
  if (uKaris > 0.5) {
    float l = luma(c), k = 9.0;
    if (l > k) c *= (k + (l - k) / (1.0 + (l - k) / k)) / l;
  }
  return c;
}
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
uniform float uTonemapper;  // 0 = ACES (ajuste RRT/ODT), 1 = AgX (padrão: fotográfico, sem desvio de matiz)

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
// AgX (Sobotka; versão Blender/Filament): curva sigmoide em log2 aplicada num
// espaço "inset" (Rec.2020 comprimido). Altas luzes dessaturam rumo ao branco
// como em filme/sensor (fogo laranja não vira amarelo-limão, céu não vira
// ciano) — é o que separa a imagem "fotográfica" da "de jogo".
const mat3 SRGB2REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
const mat3 REC20202SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 AgXInset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
  vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
  vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
const mat3 AgXOutset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
  vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
  vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
vec3 agx(vec3 c) {
  c = AgXInset * (SRGB2REC2020 * c);
  c = clamp((log2(max(c, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
  vec3 x2 = c * c, x4 = x2 * x2;
  c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232;
  c = pow(max(AgXOutset * c, 0.0), vec3(2.2));
  return clamp(REC20202SRGB * c, 0.0, 1.0);
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

  // curva de filme: AgX (padrão) ou ACES (o three também divide por 0.6)
  col = uTonemapper > 0.5 ? agx(col) : aces(col / 0.6);

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
  // (hash inteiro PCG: o IGN tinha estrutura diagonal visível no céu liso)
  vec3 o = toSRGB(clamp(col, 0.0, 1.0));
  uvec3 dp = uvec3(uvec2(gl_FragCoord.xy), uint(mod(uFrame, 4093.0)));
  dp = dp * 1664525u + 1013904223u;
  dp.x += dp.y * dp.z; dp.y += dp.z * dp.x; dp.z += dp.x * dp.y;
  dp ^= dp >> 16u;
  dp.x += dp.y * dp.z; dp.y += dp.z * dp.x;
  float n1 = float(dp.x & 0xffffu) / 65535.0, n2 = float(dp.y & 0xffffu) / 65535.0;
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

// PCG 3D (Jarzynski & Olano 2020): ruído branco sem estrutura visível
float pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return float(v.x & 0xffffffu) / 16777215.0;
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
  // grão de filme: só luminância (sem confete colorido), hash inteiro por
  // pixel (PCG — sem a estrutura diagonal do hash fracionário), animado, mais
  // forte nos meios-tons e quase nulo nos pretos/brancos — fino, como o
  // grão de câmera de um jogo atual, não um padrão fixo de tela
  float L = luma(col);
  uvec3 gp = uvec3(uvec2(gl_FragCoord.xy), uint(mod(uTime * 60.0, 4093.0)));
  float g = pcg3(gp) - 0.5;
  float gw = smoothstep(0.0, 0.18, L) * (1.0 - smoothstep(0.55, 1.0, L));
  col += g * uGrain * (0.25 + 0.75 * gw);
  // dithering contra banding (8 bits), também animado (some no TAA/olho)
  col += (pcg3(gp + uvec3(17u, 31u, 7u)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`,ze={low:{msaa:0,ao:!1,aoSamples:6,vol:!1,volSteps:12,bloomLevels:5,motion:!1,dust:0,fxaa:!0,sharpen:0,dirt:!1,gi:0,taa:!1,contact:!1,far:1024,pcss:0},medium:{msaa:4,ao:!0,aoSamples:10,vol:!1,volSteps:14,bloomLevels:6,motion:!1,dust:0,fxaa:!1,sharpen:.3,dirt:!0,gi:12,taa:!1,contact:!0,far:1024,pcss:1024},high:{msaa:0,ao:!0,aoSamples:14,vol:!0,volSteps:20,bloomLevels:6,motion:!0,dust:700,fxaa:!1,sharpen:.42,dirt:!0,gi:20,taa:!0,contact:!0,far:2048,pcss:2048},ultra:{msaa:4,ao:!0,aoSamples:18,vol:!0,volSteps:28,bloomLevels:7,motion:!0,dust:1100,fxaa:!1,sharpen:.38,dirt:!0,gi:24,taa:!0,contact:!0,far:2048,pcss:4096}};function Be(){return{exposure:1,autoExposure:{enabled:!0,key:.14,strength:.6,minEV:-2,maxEV:2.2,biasEV:0,speedUp:2.5,speedDown:1.4},environmentIntensity:.55,indoorAmbient:.34,coveredAmbient:.4,bounce:.1,indoorTint:new N(.97,1,1.04),gi:{strength:2.9,radius:8},contact:1,bleed:.55,shadow:{lightSize:.02},ao:{radius:.9,intensity:3.6,bias:.6,strength:1},fog:{density:7e-4,falloff:.045,base:0,start:22,max:.8,tint:new N(.93,.92,.88),sun:.12},taa:{alpha:.1,gamma:1},vol:{density:.0025,falloff:.09,base:0,maxDist:70,strength:.32,phaseG:.6,indoorDust:22},bloom:{strength:.055,radius:1,dirt:.5},grade:{tonemapper:`agx`,whiteBalance:new N(1,1,.985),contrast:1.46,saturation:.85,shadowTint:new N(.985,1,1.02),highlightTint:new N(1.02,1,.975),lift:new N(.003,.004,.005),gain:new N(1.12,1.12,1.12),black:.013},clarity:.08,lens:{ca:.006,vignette:.3,grain:.02,sharpen:null},menuBlur:0,motionBlur:.5,adsDof:1}}var Ve={name:`rendering`,order:20,async init(t){let{renderer:n,scene:r,camera:a,quality:o,bus:s}=t;this.ctx=t,this.params=Be(),t.params.get(`tm`)&&(this.params.grade.tonemapper=t.params.get(`tm`)),this.flashAmt=0,this.debugView=null,this.frameIndex=0,this.stats={ms:0,passes:0},He(r),n.shadowMap.type=1,n.toneMapping=4,n.toneMappingExposure=1;let c=t.service(`world`);this.sun=c?.sun||null,this.atmo=new re(n),this.sunDir=new E(.45,.62,.35).normalize(),this.shadowFit=new de,this.sun&&this.shadowFit.readDirection(this.sun,this.sunDir),this.atmo.setSun(this.sunDir,this.sun?.intensity??3);let l=r.background;if(this.ownsSky=(!l||l.isColor)&&t.params.get(`sky`)!==`world`,this.ownsSky&&(r.background=null,this.atmo.attach(r,a),this.worldSky=c?.sky||null,this.worldSky&&(this.worldSky.visible=!1),c?.environment&&r.environment===c.environment&&(r.environment=null)),r.fog){let e=r.fog;e.isFogExp2&&(this.params.fog.density=Math.min(.0013,e.density*.3)),r.fog=null}this.atmo.updateLut(!0),this.env=this.atmo.updateEnvironment(!0),this.applyEnvironment(),this.bounceLight=new D(16777215,0),this.bounceLight.name=`ironline-bounce`,this.bounceLight.castShadow=!1,r.add(this.bounceLight,this.bounceLight.target),this.dust=null,this.skyOcc=new me(512,110),this.atmo.dome.userData.noSkyOcclusion=!0,this.atmo.dome.userData.noSunView=!0,this.rsm=new Se({size:256,radius:24,color:!0,forward:.35,depthRange:400}),this.farView=null,this.ambient=new N(.1,.1,.1),this.ambientDirty=!0,this.jitter=new e,this.probe=t.quality.level===`low`?null:new Te(n,t.quality.level===`ultra`?192:128),this.taaFrames=0,this.dirtTex=De(11),this.buildMaterials(),this.configure(),this.offs=[s.on(`resize`,()=>this.resize()),s.on(`quality:change`,()=>this.configure())],this.prevViewProj=new h,this.hasPrev=!1,t.setRenderPipeline((e,t)=>this.render(e,t));let u=this,d=this.params;this.api=t.provide(`rendering`,{setExposure(e){d.exposure=e,n.toneMappingExposure=e},get exposure(){return d.exposure},get environment(){return u.env},get environmentIntensity(){return d.environmentIntensity},set environmentIntensity(e){d.environmentIntensity=e,u.applyEnvironment(),u.ambientDirty=!0},get sunDirection(){return u.sunDir},get sunColor(){return u.atmo.uniforms.uSunColor.value},get sunTransmittance(){return u.atmo.sunTransmittance},setFog(e){Object.assign(d.fog,e)},setVolumetrics(e){Object.assign(d.vol,e)},setAO(e){Object.assign(d.ao,e)},setBloom(e){Object.assign(d.bloom,e)},setGrade(e){Object.assign(d.grade,e)},setLens(e){Object.assign(d.lens,e)},setAutoExposure(e){Object.assign(d.autoExposure,e)},setGI(e){Object.assign(d.gi,e)},setContact(e){d.contact=e},setBleed(e){d.bleed=e},setShadow(e){Object.assign(d.shadow,e)},setTAA(e){Object.assign(d.taa,e)},get ambient(){return u.ambient},setSky(e){`takeover`in e&&(u.atmo.dome.visible=!!e.takeover,u.worldSky&&(u.worldSky.visible=!e.takeover)),Object.assign(u.atmo.params,e),u.atmo.uniforms.uCloudCover.value=u.atmo.params.cloudCover,u.atmo.uniforms.uCloudDensity.value=u.atmo.params.cloudDensity,u.atmo.uniforms.uSunDisk.value=u.atmo.params.sunDisk,u.atmo.uniforms.uSkySat.value=u.atmo.params.skySaturation,u.atmo.dirty=!0},setMenuBlur(e){d.menuBlur=e},flash(e=1){u.flashAmt=Math.max(u.flashAmt,e)},setDebug(e){u.debugView=e||null},get params(){return d},get stats(){return u.stats},readExposure(){let e=u.rt?.exp[u.expIndex];if(!e)return null;let t=new Uint16Array(4);return n.readRenderTargetPixels(e,0,0,1,1,t),{exposure:i.fromHalfFloat(t[0]),avgLum:i.fromHalfFloat(t[1])}},get hdr(){return!0}})},buildMaterials(){let t=e=>({value:e}),n=()=>({uProjInv:t(new h),uNearFar:t(new e(.05,700))});this.mats={ao:R(`ao`,Oe,{...n(),tDepth:t(null),uFullTexel:t(new e),uAoRes:t(new e),uRadius:t(1),uIntensity:t(1),uBias:t(.5),uProjScale:t(500),uFrame:t(0)},{AO_SAMPLES:12}),blur:R(`blur`,ke,{...n(),tSrc:t(null),tDepth:t(null),uDir:t(new e),uDepthSharp:t(8)}),vol:R(`vol`,Ae,{...n(),tDepth:t(null),tShadow:t(null),uViewInv:t(new h),uShadowMatrix:t(new h),uCamPos:t(new E),uMaxDist:t(60),uDensity:t(.01),uHeightFalloff:t(.1),uBaseHeight:t(0),uFrame:t(0),uShadowBias:t(.0015),tSkyOcc:t(null),uSkyOccMatrix:t(new h),uIndoorDust:t(0),tRsmDepth:t(null),uRsmMatrix:t(new h),uRsmOn:t(0)},{VOL_STEPS:20}),combine:R(`combine`,je,{...n(),tScene:t(null),tDepth:t(null),tAo:t(null),tVol:t(null),tVm:t(null),tLut:t(this.atmo.lut.texture),tGi:t(null),uViewInv:t(new h),uProj:t(new h),uPrevViewProj:t(new h),uCamPos:t(new E),uSunDir:t(this.sunDir),uSunDirView:t(new E),uSunRadiance:t(new N),uSunIrr:t(new N),uAmbient:t(new N),uCoveredAmb:t(.4),uSkyScale:t(1),uAoStrength:t(0),uGiStrength:t(0),uContact:t(0),uFogDensity:t(0),uFogFalloff:t(.05),uFogBase:t(0),uFogStart:t(10),uFogMax:t(.9),uFogTint:t(new N(1,1,1)),uFogSun:t(0),uVolStrength:t(0),uPhaseG:t(.6),uMotion:t(0),uVmBlur:t(0),uVmOn:t(1),uRes:t(new e),uFrame:t(0),tSkyOcc:t(null),uSkyOccMatrix:t(new h),uSkyOccOn:t(0),uIndoor:t(.4),uIndoorTint:t(new N(1,1,1)),uDebug:t(0),tShadow:t(null),uShadowMatrix:t(new h),tShadowRaw:t(null),uPcssOn:t(0),uShadowTexel:t(new e(1/4096,1/4096)),uShadowWorld:t(76),uShadowRange:t(259),uLightSize:t(.02),tFar:t(null),uFarMatrix:t(new h),uFarOn:t(0),uFarTexel:t(new e),tBleed:t(null),tBleed2:t(null),uBleed:t(0)}),gi:R(`gi`,Me,{...n(),tDepth:t(null),tRsmColor:t(null),tRsmDepth:t(null),uViewInv:t(new h),uRsmMatrix:t(new h),uRsmInv:t(new h),uSunDir:t(this.sunDir),uRadiusUv:t(.1),uSampleArea:t(1),uRsmTexel:t(new e),uFullTexel:t(new e),uFrame:t(0),tSkyOcc:t(null),uSkyOccMatrix:t(new h),uSkyOccOn:t(0),uProj:t(new h)},{GI_SAMPLES:16}),taa:R(`taa`,Ne,{...n(),tCur:t(null),tHist:t(null),tDepth:t(null),tVm:t(null),uViewInv:t(new h),uPrevViewProj:t(new h),uCamPos:t(new E),uTexel:t(new e),uAlpha:t(.1),uHistValid:t(0),uGamma:t(1),uTol:t(0)}),down:R(`bloom-down`,Pe,{...n(),tSrc:t(null),uTexel:t(new e),uKaris:t(0)}),up:R(`bloom-up`,Fe,{...n(),tLow:t(null),tCur:t(null),uTexel:t(new e),uRadius:t(1),uCurWeight:t(1)}),exposure:R(`exposure`,Ie,{...n(),tSmall:t(null),tPrev:t(null),uRate:t(1),uKey:t(.16),uStrength:t(.6),uRange:t(new e(-2,2)),uBiasEV:t(0)}),tonemap:R(`tonemap`,Le,{...n(),tHdr:t(null),tBloom:t(null),tExposure:t(null),tDirt:t(this.dirtTex),uBloom:t(.05),uDirt:t(1),uExposure:t(1),uCA:t(0),uMenuBlur:t(0),uWhiteBalance:t(new N),uContrast:t(1),uSaturation:t(1),uShadowTint:t(new N),uHighlightTint:t(new N),uLift:t(new N),uGain:t(new N),uVignette:t(.3),uFlash:t(0),uClarity:t(0),uRes:t(new e),uBloomNorm:t(1),uBlack:t(0),uFrame:t(0),uTonemapper:t(1)}),final:R(`final`,Re,{...n(),tLdr:t(null),uTexel:t(new e),uGrain:t(.03),uSharpen:t(0),uFxaa:t(0),uTime:t(0)}),debug:R(`debug`,`${$}
        uniform sampler2D tSrc; uniform float uMode;
        void main() {
          vec4 c = texture(tSrc, vUv);
          vec3 o = uMode < 0.5 ? c.rrr : uMode < 1.5 ? vec3(c.r * 4.0) : uMode < 2.5 ? vec3(fract(linearZ(c.r) / 20.0)) : uMode < 3.5 ? c.rgb / (1.0 + c.rgb) : c.rgb;
          outColor = vec4(pow(o, vec3(1.0 / 2.2)), 1.0);
        }`,{...n(),tSrc:t(null),uMode:t(0)})},this.quad=new L(this.mats.final)},configure(){let e=this.ctx.quality,t={...ze[e.level]||ze.high};e.msaa||(t.msaa=0),e.ssao||(t.ao=!1),e.volumetrics||(t.vol=!1),e.motionBlur||(t.motion=!1),e.taa===!1&&(t.taa=!1),e.msaa&&t.msaa===0&&!t.taa&&(t.msaa=4),e.shadows||(t.far=0),t.bloom=e.bloom!==!1,this.tier=t,this.shadowFit.configure(e);let n=(e,t,n)=>{e.defines[t]!==n&&(e.defines[t]=n,e.needsUpdate=!0)};n(this.mats.ao,`AO_SAMPLES`,t.aoSamples),n(this.mats.vol,`VOL_STEPS`,t.volSteps),t.gi&&n(this.mats.gi,`GI_SAMPLES`,t.gi),this.farView&&(!t.far||this.farView.size!==t.far)&&(this.farView.dispose(),this.farView=null),t.far&&!this.farView&&(this.farView=new Se({size:t.far,radius:190,color:!1,forward:.55,depthRange:700})),this.taaFrames=0;let r=e.shadows===!1?0:t.pcss;this.rawShadow&&this.rawShadow.size!==r&&(this.rawShadow.dispose(),this.rawShadow=null),r&&!this.rawShadow&&(this.rawShadow=new fe(r));let i=this.ctx.scene;this.dust&&(!t.dust||this.dust.count!==t.dust)&&(i.remove(this.dust.points),this.dust.dispose(),this.dust=null),t.dust&&!this.dust&&this.sun&&(this.dust=new pe(t.dust,16),this.dust.count=t.dust,i.add(this.dust.points)),this.disposeTargets(),this.resize()},disposeTargets(){if(this.rt){for(let e of Object.values(this.rt))Array.isArray(e)?e.forEach(e=>e.dispose()):e?.dispose?.();this.rt=null}},resize(){let{renderer:t}=this.ctx,n=t.getDrawingBufferSize(new e),i=Math.max(1,n.x),o=Math.max(1,n.y);if(this.rt&&this.size?.x===i&&this.size?.y===o)return;this.disposeTargets(),this.size=new e(i,o);let s=this.tier,c=Math.ceil(i/2),p=Math.ceil(o/2),h=new u(i,o,f);h.format=r,h.minFilter=h.magFilter=k;let g=new l(i,o,{type:m,samples:s.msaa,depthBuffer:!0,depthTexture:h,minFilter:a,magFilter:a});g.texture.colorSpace=``;let _=new l(i,o,{type:m,samples:s.msaa,depthBuffer:!0,minFilter:a,magFilter:a});_.texture.colorSpace=``;let v=[],y=[],b=c,x=p;for(let e=0;e<s.bloomLevels;e++)v.push(z(b,x)),y.push(z(b,x)),b=Math.max(1,Math.ceil(b/2)),x=Math.max(1,Math.ceil(x/2));let S=[0,1].map(()=>z(1,1,{type:m,filter:k}));this.rt={scene:g,vm:_,ao:z(c,p,{type:d}),ao2:z(c,p,{type:d}),vol:z(c,p),vol2:z(c,p),combine:z(i,o),gi:z(Math.ceil(i/4),Math.ceil(o/4)),gi2:z(Math.ceil(i/4),Math.ceil(o/4)),hist:s.taa?[z(i,o),z(i,o)]:[],ldr:z(i,o,{type:d}),bloom:v,bloomUp:y,exp:S,white:z(1,1,{type:d}),zero:z(1,1)},this.expIndex=0,this.histIndex=0,this.taaFrames=0,this.expPrimed=!1,this.needsClears=!0,this.bleedPrimed=!1},frame(e,t){let{camera:n}=t,r=this.sun||t.service(`world`)?.sun||null;r&&!this.sun&&(this.sun=r),r&&(this.shadowFit.readDirection(r,this.sunDir),this.shadowFit.update(r,n,this.sunDir)&&(this.shadowDirty=!0));let i=r?.intensity??3;if(this.atmo.setSun(this.sunDir,i),this.atmo.uniforms.uTime.value=t.time.now,this.atmo.updateLut()){this.ambientDirty=!0;let e=this.atmo.updateEnvironment();e&&(this.env=e,this.applyEnvironment())}let a=this.bounceLight,o=Math.max(this.sunDir.y,0);if(a.position.set(-this.sunDir.x*.5,-1,-this.sunDir.z*.5).add(n.position),a.target.position.copy(n.position),a.target.updateMatrixWorld(),a.color.copy(this.atmo.params.groundAlbedo).multiply(this.atmo.sunTransmittance),a.intensity=this.tier?.gi&&this.params.gi.strength>0?0:i*this.params.bounce*o*2.5,this.ambientDirty&&this.updateAmbient(t),this.dust){let e=(this.size?.y||1080)/(2*Math.tan(s.degToRad(n.fov)/2));this.dust.update(n,r,this.atmo.uniforms.uSunColor.value,t.time.now,e),this.dust.uniforms.uIntensity.value=.35}this.flashAmt*=Math.exp(-(e||1/60)*3.5)},updateAmbient(e){let t=this.atmo.readAmbient(e.renderer);if(!t)return;this.ambientDirty=!1;let n=this.ambient.setRGB(0,0,0);e.scene.environment&&(n.r=(t.up.r+t.side.r)*.5,n.g=(t.up.g+t.side.g)*.5,n.b=(t.up.b+t.side.b)*.5,n.multiplyScalar(e.scene.environmentIntensity??1));let r=e.service(`world`)?.hemi;if(r?.visible!==!1&&r?.isHemisphereLight){let e=r.intensity/Math.PI;n.r+=(r.color.r*.75+r.groundColor.r*.25)*e,n.g+=(r.color.g*.75+r.groundColor.g*.25)*e,n.b+=(r.color.b*.75+r.groundColor.b*.25)*e}},applyEnvironment(){let{scene:e,vm:t}=this.ctx;this.env&&((!e.environment||e.environment===this.prevEnv)&&(e.environment=this.env),e.environmentIntensity=this.params.environmentIntensity,t?.scene&&!this.probe?.texture&&(!t.scene.environment||t.scene.environment===this.prevEnv)&&(t.scene.environment=this.env,t.scene.environmentIntensity=this.params.environmentIntensity*.9),this.prevEnv=this.env)},render(e,t){let n=performance.now(),{renderer:r,scene:i,camera:a,vm:o}=e;this.rt||this.resize();let c=this.rt,l=this.mats,u=this.params,d=this.tier,f=this.quad,p=this.size.x,m=this.size.y,h=0,g=(e,t)=>{f.material=e,f.render(r,t),h++},_=r.getClearColor(new N),v=r.getClearAlpha();this.needsClears&&=(r.setClearColor(16777215,1),r.setRenderTarget(c.white),r.clear(),r.setClearColor(0,0),r.setRenderTarget(c.zero),r.clear(),!1);let y=this.sun,b=!!(y?.castShadow&&r.shadowMap.enabled),x=[this.atmo.dome,this.dust?.points,this.worldSky].filter(Boolean),S=!!(d.gi&&u.gi.strength>0&&y),C=!b||!!y.shadow.map;S&&C&&this.rsm.update(r,i,a,this.sunDir,{moveFrac:.06,maxAge:6,hide:x})&&h++;let w=!!(this.farView&&b);if(w&&C&&this.farView.update(r,i,a,this.sunDir,{moveFrac:.08,maxAge:240,hide:x})&&h++,this.probe&&o.visible&&C){let e=this.probe.texture;if(this.probe.update(i,a,{hide:[this.dust?.points]})){h+=6;let t=o.scene.environment;(!t||t===this.env||t===this.prevEnv||t===e)&&(o.scene.environment=this.probe.texture)}}let T=!!(d.taa&&c.hist.length),E=0,D=0;if(T){let e=Ke(this.frameIndex)%16+1;E=(Ge(e,2)-.5)*2/p,D=(Ge(e,3)-.5)*2/m,a.projectionMatrix.elements[8]+=E,a.projectionMatrix.elements[9]+=D,o.camera.projectionMatrix.elements[8]+=E,o.camera.projectionMatrix.elements[9]+=D}r.shadowMap.autoUpdate=!1;let ee=e.shot?3:2;if(r.shadowMap.needsUpdate=!!this.shadowDirty||this.frameIndex%ee===0||!y?.shadow?.map,this.shadowDirty=!1,this.rawShadow&&b&&(r.shadowMap.needsUpdate||!this.rawShadow.valid)){let e=r.shadowMap.needsUpdate;this.rawShadow.render(r,i,y,x),r.shadowMap.needsUpdate=e,h++}r.setClearColor(0,1),r.setRenderTarget(c.scene),r.clear(),r.render(i,a),h++;let O=o.visible;O&&(r.shadowMap.needsUpdate=!0,r.setClearColor(0,0),r.setRenderTarget(c.vm),r.clear(),r.render(o.scene,o.camera),h++),r.setClearColor(_,v),T&&(a.projectionMatrix.elements[8]-=E,a.projectionMatrix.elements[9]-=D,o.camera.projectionMatrix.elements[8]-=E,o.camera.projectionMatrix.elements[9]-=D);let k=Ue.multiplyMatrices(a.projectionMatrix,a.matrixWorldInverse);this.hasPrev||=(this.prevViewProj.copy(k),!0);let A=We.copy(this.prevViewProj);{let e=0,t=k.elements,n=A.elements;for(let r=0;r<16;r++)e=Math.max(e,Math.abs(t[r]-n[r]));this.camMoved=e>2e-5,this.camMoved?this.stillFrames=0:this.stillFrames=(this.stillFrames||0)+1}this.prevViewProj.copy(k);let j=T?this.frameIndex:e.shot?0:this.frameIndex%8,M=!!this.skyOcc&&(u.indoorAmbient<.999||S);M&&this.skyOcc.update(r,i,a);let P=c.scene.depthTexture,F=e=>{e.uniforms.uProjInv.value.copy(a.projectionMatrixInverse),e.uniforms.uNearFar.value.set(a.near,a.far)};for(let e of Object.values(l))F(e);let I=this.frameIndex++,L=c.white.texture;if(d.ao){let e=l.ao.uniforms;e.tDepth.value=P,e.uFullTexel.value.set(1/p,1/m),e.uAoRes.value.set(c.ao.width,c.ao.height),e.uRadius.value=u.ao.radius,e.uIntensity.value=u.ao.intensity,e.uBias.value=u.ao.bias,e.uProjScale.value=c.ao.height/(2*Math.tan(s.degToRad(a.fov)/2)),e.uFrame.value=j,g(l.ao,c.ao),this.blur(c.ao,c.ao2,P,10,g),L=c.ao.texture}let R=c.zero.texture;if(S&&this.rsm.valid){let e=l.gi.uniforms;e.tDepth.value=P,e.tRsmColor.value=this.rsm.rt.texture,e.tRsmDepth.value=this.rsm.rt.depthTexture,e.uViewInv.value.copy(a.matrixWorld),e.uProj.value.copy(a.projectionMatrix),e.uRsmMatrix.value.copy(this.rsm.matrix),e.uRsmInv.value.copy(this.rsm.inverse);let t=u.gi.radius;e.uRadiusUv.value=t/(2*this.rsm.radius),e.uSampleArea.value=Math.PI*t*t/(l.gi.defines.GI_SAMPLES||16),e.uRsmTexel.value.set(1/this.rsm.size,1/this.rsm.size),e.uFullTexel.value.set(1/p,1/m),e.uFrame.value=j,e.uSkyOccOn.value=+!!M,M&&(e.tSkyOcc.value=this.skyOcc.rt.depthTexture,e.uSkyOccMatrix.value.copy(this.skyOcc.matrix)),g(l.gi,c.gi),this.blur(c.gi,c.gi2,P,6,g),R=c.gi.texture}let z=c.zero.texture,B=b?y.shadow.map?.depthTexture:null;if(d.vol&&B&&u.vol.strength>0){let t=l.vol.uniforms;t.tDepth.value=P,t.tShadow.value=B,t.uViewInv.value.copy(a.matrixWorld),t.uShadowMatrix.value.copy(y.shadow.matrix),a.getWorldPosition(t.uCamPos.value),t.uMaxDist.value=u.vol.maxDist,t.uDensity.value=u.vol.density,t.uHeightFalloff.value=u.vol.falloff,t.uBaseHeight.value=u.vol.base,t.uFrame.value=T?I:e.shot?0:I,M?(t.tSkyOcc.value=this.skyOcc.rt.depthTexture,t.uSkyOccMatrix.value.copy(this.skyOcc.matrix),t.uIndoorDust.value=u.vol.indoorDust):t.uIndoorDust.value=0,t.uRsmOn.value=S&&this.rsm.valid?1:0,t.uRsmOn.value&&(t.tRsmDepth.value=this.rsm.rt.depthTexture,t.uRsmMatrix.value.copy(this.rsm.matrix)),g(l.vol,c.vol),this.blur(c.vol,c.vol2,P,4,g),z=c.vol.texture}{let t=l.combine.uniforms;t.tScene.value=c.scene.texture,t.tDepth.value=P,t.tAo.value=L,t.tVol.value=z,t.tVm.value=O?c.vm.texture:c.zero.texture,t.uVmOn.value=+!!O,t.tGi.value=R,t.uGiStrength.value=R===c.zero.texture?0:u.gi.strength,t.uViewInv.value.copy(a.matrixWorld),t.uProj.value.copy(a.projectionMatrix),a.getWorldPosition(t.uCamPos.value),t.uPrevViewProj.value.copy(A),t.uFrame.value=j,t.uMotion.value=d.motion&&!e.shot?u.motionBlur:0,t.uSunRadiance.value.copy(this.atmo.uniforms.uSunColor.value),t.uSunDirView.value.copy(this.sunDir).transformDirection(a.matrixWorldInverse),y?t.uSunIrr.value.copy(y.color).multiplyScalar(y.intensity):t.uSunIrr.value.setRGB(0,0,0),t.uAmbient.value.copy(this.ambient),t.uCoveredAmb.value=u.coveredAmbient,t.uContact.value=d.contact?u.contact:0,t.uFogSun.value=u.fog.sun??0,t.uFarOn.value=w&&this.farView.valid?1:0,w&&(t.tFar.value=this.farView.rt.depthTexture,t.uFarMatrix.value.copy(this.farView.matrix),t.uFarTexel.value.set(1/this.farView.size,1/this.farView.size)),t.uSkyScale.value=this.atmo.uniforms.uSkyScale.value,t.uAoStrength.value=d.ao?u.ao.strength:0,t.uFogDensity.value=u.fog.density,t.uFogFalloff.value=u.fog.falloff,t.uFogBase.value=u.fog.base,t.uFogStart.value=u.fog.start,t.uFogMax.value=u.fog.max,t.uFogTint.value.copy(u.fog.tint),t.uVolStrength.value=z===c.zero.texture?0:u.vol.strength,t.uPhaseG.value=u.vol.phaseG;let n=e.service(`weapon`)?.ads||0;t.uVmBlur.value=n*u.adsDof,t.uRes.value.set(p,m),M&&(t.tSkyOcc.value=this.skyOcc.rt.depthTexture,t.uSkyOccMatrix.value.copy(this.skyOcc.matrix)),t.uSkyOccOn.value=+!!M;{let e=c.bloomUp.length,n=Math.min(3,e-2),r=Math.min(4,e-2),i=this.bleedPrimed&&M&&u.bleed>0&&n>=0;t.uBleed.value=i?u.bleed/Math.max(1,e-n):0,t.tBleed.value=i?c.bloomUp[n].texture:c.zero.texture,t.tBleed2.value=i?c.bloomUp[r].texture:c.zero.texture}t.uIndoor.value=u.indoorAmbient,t.uIndoorTint.value.copy(u.indoorTint),t.uDebug.value={occ:1,gi:2,albedo:3}[this.debugView]||0;let r=+!!B;if((l.combine.defines.HAS_SHADOW||0)!==r&&(r?l.combine.defines.HAS_SHADOW=1:delete l.combine.defines.HAS_SHADOW,l.combine.needsUpdate=!0),B){t.tShadow.value=B,t.uShadowMatrix.value.copy(y.shadow.matrix);let e=y.shadow.camera;t.uShadowTexel.value.set(1/y.shadow.mapSize.x,1/y.shadow.mapSize.y),t.uShadowWorld.value=e.right-e.left,t.uShadowRange.value=e.far-e.near,t.uLightSize.value=u.shadow.lightSize;let n=!!this.rawShadow?.valid;t.uPcssOn.value=+!!n,t.tShadowRaw.value=n?this.rawShadow.rt.depthTexture:null}g(l.combine,c.combine)}let V=c.combine;if(T){let t=l.taa.uniforms,n=c.hist[this.histIndex],r=c.hist[1-this.histIndex];t.tCur.value=c.combine.texture,t.tHist.value=n.texture,t.tDepth.value=P,t.tVm.value=O?c.vm.texture:c.zero.texture,t.uViewInv.value.copy(a.matrixWorld),t.uPrevViewProj.value.copy(A),a.getWorldPosition(t.uCamPos.value),t.uTexel.value.set(1/p,1/m),t.uHistValid.value=+(this.taaFrames>0);let i=e.shot&&!this.camMoved;t.uAlpha.value=i?Math.max(1/(Math.min(this.taaFrames,this.stillFrames)+1),.035):u.taa.alpha,t.uGamma.value=i?Math.max(u.taa.gamma,1.75):u.taa.gamma,t.uTol.value=i?.07:0,g(l.taa,r),this.histIndex=1-this.histIndex,this.taaFrames++,V=r}else this.taaFrames=0;let H=c.bloom.length,U=V;for(let e=0;e<H;e++){let t=l.down.uniforms;t.tSrc.value=U.texture,t.uTexel.value.set(1/U.width,1/U.height),t.uKaris.value=+(e===0),g(l.down,c.bloom[e]),U=c.bloom[e]}let W=c.bloom[H-1];for(let e=H-2;e>=0;e--){let t=l.up.uniforms;t.tLow.value=W.texture,t.tCur.value=c.bloom[e].texture,t.uTexel.value.set(1/W.width,1/W.height),t.uRadius.value=u.bloom.radius,t.uCurWeight.value=1,g(l.up,c.bloomUp[e]),W=c.bloomUp[e]}let G=c.bloomUp[0].texture;this.bleedPrimed=!0;let K=u.autoExposure,q;if(K.enabled){let n=l.exposure.uniforms,r=c.exp[this.expIndex],i=c.exp[1-this.expIndex];n.tSmall.value=c.bloom[Math.min(3,H-1)].texture,n.tPrev.value=this.expPrimed?r.texture:c.zero.texture,n.uKey.value=K.key,n.uStrength.value=K.strength,n.uRange.value.set(K.minEV,K.maxEV),n.uBiasEV.value=K.biasEV;let a=Math.max(t||1/60,1/240);n.uRate.value=e.shot?1:1-Math.exp(-a*K.speedUp),g(l.exposure,i),this.expIndex=1-this.expIndex,this.expPrimed=!0,q=i.texture}else q=c.white.texture;{let e=l.tonemap.uniforms,t=u.grade;e.tHdr.value=V.texture,e.tBloom.value=G,e.tExposure.value=q,e.uBloom.value=d.bloom?u.bloom.strength:0,e.uDirt.value=d.dirt&&d.bloom?u.bloom.dirt:0,e.uExposure.value=u.exposure,e.uCA.value=u.lens.ca,e.uMenuBlur.value=u.menuBlur,e.uWhiteBalance.value.copy(t.whiteBalance),e.uTonemapper.value=t.tonemapper===`aces`?0:1,e.uContrast.value=t.contrast,e.uSaturation.value=t.saturation,e.uShadowTint.value.copy(t.shadowTint),e.uHighlightTint.value.copy(t.highlightTint),e.uLift.value.copy(t.lift),e.uGain.value.copy(t.gain),e.uVignette.value=u.lens.vignette,e.uFlash.value=this.flashAmt,e.uClarity.value=d.bloom?u.clarity:0,e.uRes.value.set(p,m),e.uBloomNorm.value=1/Math.max(1,H),e.uBlack.value=t.black??0,e.uFrame.value=I,g(l.tonemap,c.ldr)}{let t=l.final.uniforms;t.tLdr.value=c.ldr.texture,t.uTexel.value.set(1/p,1/m),t.uGrain.value=u.lens.grain,t.uFxaa.value=+!!d.fxaa,t.uSharpen.value=u.lens.sharpen??d.sharpen,t.uTime.value=e.time.now,g(l.final,null)}this.debugView===`occ`||this.debugView===`gi`||this.debugView===`albedo`?(l.debug.uniforms.tSrc.value=c.combine.texture,l.debug.uniforms.uMode.value=4,g(l.debug,null)):this.debugView&&this.drawDebug(P,L,z,G,g),r.setRenderTarget(null),this.stats.ms=performance.now()-n,this.stats.passes=h},blur(e,t,n,r,i){let a=this.mats.blur.uniforms;a.tDepth.value=n,a.uDepthSharp.value=r,a.tSrc.value=e.texture,a.uDir.value.set(1/e.width,0),i(this.mats.blur,t),a.tSrc.value=t.texture,a.uDir.value.set(0,1/e.height),i(this.mats.blur,e)},drawDebug(e,t,n,r,i){let a=this.mats.debug,o={ao:[t,0],vol:[n,1],depth:[e,2],bloom:[r,3]}[this.debugView];o&&(a.uniforms.tSrc.value=o[0],a.uniforms.uMode.value=o[1],i(a,null))},dispose(e){this.offs?.forEach(e=>e()),e.renderer.shadowMap.autoUpdate=!0,e.setRenderPipeline(null),this.disposeTargets(),Object.values(this.mats||{}).forEach(e=>e.dispose()),this.atmo?.dome.removeFromParent(),this.atmo?.dispose(),this.dust?.points.removeFromParent(),this.dust?.dispose(),this.skyOcc?.dispose(),this.rsm?.dispose(),this.probe?.dispose(),this.farView?.dispose(),this.rawShadow?.dispose(),this.bounceLight?.removeFromParent(),this.dirtTex?.dispose()}};function He(e){let t=`material.roughness += geometryRoughness;`,n=M.lights_physical_fragment;!n.includes(`IRONLINE_SAA`)&&n.includes(t)&&(M.lights_physical_fragment=n.replace(t,`${t}
// IRONLINE_SAA: filtro de rugosidade pela variância da normal em tela
{
  vec3 ndx = dFdx( normal ), ndy = dFdy( normal );
  float kVar = 0.25 * ( dot( ndx, ndx ) + dot( ndy, ndy ) );
  float kern = min( 2.0 * kVar, 0.18 );
  float a = material.roughness * material.roughness;
  material.roughness = sqrt( sqrt( clamp( a * a + kern, 0.0, 1.0 ) ) );
}`),e?.traverse(e=>{let t=Array.isArray(e.material)?e.material:e.material?[e.material]:[];for(let e of t)e.isMeshStandardMaterial&&(e.needsUpdate=!0)}))}var Ue=new h,We=new h;function Ge(e,t){let n=1,r=0;for(;e>0;)n/=t,r+=e%t*n,e=Math.floor(e/t);return r}var Ke=e=>e;export{Ve as default};
//# sourceMappingURL=rendering-nObnCTRk.js.map